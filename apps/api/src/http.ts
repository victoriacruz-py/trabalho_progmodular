import "reflect-metadata";
import { randomUUID, timingSafeEqual } from "node:crypto";
import {
  ArgumentsHost,
  Body,
  Catch,
  Controller,
  Delete,
  ExceptionFilter,
  Get,
  HttpCode,
  HttpException,
  Inject,
  INestApplication,
  Module,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { Request, Response, NextFunction } from "express";
import { z, ZodError } from "zod";
import { DomainError, ErrorCode } from "../../../packages/kernel";
import { Services } from "./composition";

const SERVICES = Symbol("services"),
  OPTIONS = Symbol("options");
type HttpOptions = {
  origin?: string;
  production?: boolean;
  log?: (entry: Record<string, unknown>) => void;
};
const positive = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const short = z.string().trim().min(1).max(200);
const credentials = z
  .object({ email: z.string().max(254), senha: z.string().max(1024) })
  .strict();
const customer = credentials.extend({
  nome: z.string().trim().min(1).max(120),
});
const period = {
  percentual: positive.max(100),
  inicio: z.iso.datetime({ offset: true }),
  fim: z.iso.datetime({ offset: true }),
};
const product = z
  .object({
    sku: short,
    nome: short,
    marca: short,
    descricao: z.string().min(1).max(5000),
    categoria: short,
    imagemUrl: z.string().min(1).max(2000),
    atributos: z.record(short, z.string().max(1000)),
    pesoGramas: positive,
    dimensoesMm: z
      .object({ largura: positive, altura: positive, profundidade: positive })
      .strict(),
    ativo: z.boolean(),
    versaoEsperada: positive.optional(),
  })
  .strict();
const rule = z.discriminatedUnion("tipo", [
  z
    .object({
      tipo: z.literal("PRECO"),
      sku: short,
      precoCentavos: positive,
      promocao: z.object(period).strict().optional(),
      versaoEsperada: positive.optional(),
    })
    .strict(),
  z
    .object({
      tipo: z.literal("CUPOM"),
      codigo: short,
      ...period,
      skus: z.array(short).min(1).max(1000).optional(),
      versaoEsperada: positive.optional(),
    })
    .strict(),
]);
const quote = z
  .object({
    itens: z
      .array(z.object({ sku: short, quantidade: positive }).strict())
      .min(1)
      .max(100),
    cupom: short.optional(),
  })
  .strict();
const movement = z
  .object({
    sku: short,
    tipo: z.enum(["ENTRADA", "SAIDA"]),
    quantidade: positive,
    justificativa: z.string().trim().min(1).max(2000),
  })
  .strict();
const statusByCode: Record<ErrorCode, number> = {
  INVALIDO: 400,
  NAO_ENCONTRADO: 404,
  NAO_AUTORIZADO: 403,
  CONFLITO: 409,
  INDISPONIVEL: 503,
  PRECO_INDISPONIVEL: 422,
  CUPOM_INVALIDO: 422,
  ESTOQUE_INSUFICIENTE: 409,
  RESERVA_EXPIRADA: 409,
};
const messages: Record<ErrorCode, string> = {
  INVALIDO: "Confira os dados informados.",
  NAO_ENCONTRADO: "Registro não encontrado.",
  NAO_AUTORIZADO: "Acesso não autorizado.",
  CONFLITO: "Os dados foram alterados. Recarregue antes de tentar novamente.",
  INDISPONIVEL: "Serviço temporariamente indisponível.",
  PRECO_INDISPONIVEL: "Preço indisponível para um dos produtos.",
  CUPOM_INVALIDO: "Cupom inválido ou sem produtos elegíveis.",
  ESTOQUE_INSUFICIENTE: "Estoque disponível insuficiente.",
  RESERVA_EXPIRADA: "A reserva expirou.",
};
@Catch()
class ApiErrors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    let code: ErrorCode = "INDISPONIVEL",
      status = 500;
    if (error instanceof DomainError) {
      code = error.code;
      status = statusByCode[code];
    } else if (error instanceof ZodError) {
      code = "INVALIDO";
      status = 400;
    } else if (error instanceof HttpException) {
      status = error.getStatus();
      code =
        status === 401 || status === 403
          ? "NAO_AUTORIZADO"
          : status === 404
            ? "NAO_ENCONTRADO"
            : "INVALIDO";
    }
    response.status(status).json({
      codigo: code,
      mensagem:
        error instanceof DomainError &&
        error.code === "CUPOM_INVALIDO" &&
        [
          "Cupom inexistente.",
          "Cupom ainda não está ativo.",
          "Cupom expirou.",
          "Cupom não é elegível para os itens.",
        ].includes(error.message)
          ? error.message
          : messages[code],
      requestId: response.locals.requestId,
    });
  }
}
function sessionToken(req: Request): string {
  const raw = req.headers.cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("ecommerce_session="))
    ?.slice("ecommerce_session=".length);
  if (!raw || !/^[A-Za-z0-9_-]{43}$/.test(raw))
    throw new HttpException("Não autenticado", 401);
  return raw;
}
function sameToken(actual: unknown, expected: string): boolean {
  return (
    typeof actual === "string" &&
    Buffer.byteLength(actual) === Buffer.byteLength(expected) &&
    timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
  );
}
@Controller("api")
class ApiController {
  constructor(
    @Inject(SERVICES) private readonly services: Services,
    @Inject(OPTIONS) private readonly options: HttpOptions,
  ) {}
  private async session(req: Request) {
    try {
      return await this.services.clientes.sessions.details(sessionToken(req));
    } catch (error) {
      if (error instanceof DomainError && error.code === "NAO_AUTORIZADO")
        throw new HttpException("Não autenticado", 401);
      throw error;
    }
  }
  private async mutationContext(req: Request) {
    const session = await this.session(req);
    if (!sameToken(req.headers["x-csrf-token"], session.csrfToken))
      throw new HttpException("CSRF inválido", 403);
    return session.contexto;
  }
  @Get("health") async health() {
    await this.services.db.query("SELECT 1");
    return { status: "ok", incremento: 1 };
  }
  @Post("clientes") register(@Body() body: unknown) {
    return this.services.clientes.api.cadastrar(customer.parse(body));
  }
  @Post("sessoes") async login(
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    const input = credentials.parse(body);
    let session;
    try {
      session = await this.services.clientes.api.autenticar(
        input.email,
        input.senha,
      );
    } catch (error) {
      if (error instanceof DomainError && error.code === "NAO_AUTORIZADO")
        throw new HttpException("Credenciais inválidas", 401);
      throw error;
    }
    response.cookie("ecommerce_session", session.token, {
      httpOnly: true,
      secure: this.options.production ?? false,
      sameSite: "lax",
      path: "/api",
      expires: new Date(session.expiraEm),
    });
    return this.services.clientes.sessions.details(session.token);
  }
  @Get("sessoes/atual") current(@Req() req: Request) {
    return this.session(req);
  }
  @Delete("sessoes") @HttpCode(204) async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.mutationContext(req);
    await this.services.clientes.sessions.revoke(sessionToken(req));
    response.clearCookie("ecommerce_session", {
      httpOnly: true,
      secure: this.options.production ?? false,
      sameSite: "lax",
      path: "/api",
    });
  }
  @Get("catalogo") list(@Query() input: unknown) {
    const params = z
      .object({
        categoria: short.optional(),
        marca: short.optional(),
        pagina: z.coerce.number().int().min(1).max(1_000_000).default(1),
        tamanho: z.coerce.number().int().min(1).max(100).default(12),
      })
      .strict()
      .parse(input);
    return this.services.catalogo.api.listarProdutos(
      { categoria: params.categoria, marca: params.marca },
      { numero: params.pagina, tamanho: params.tamanho },
    );
  }
  @Get("catalogo/:sku") get(@Param("sku") sku: string) {
    return this.services.catalogo.api.obterProduto(short.parse(sku));
  }
  @Get("gestao/catalogo/:sku") async administrativeProduct(
    @Param("sku") sku: string,
    @Req() req: Request,
  ) {
    return this.services.catalogo.admin.obterProduto(
      (await this.session(req)).contexto,
      short.parse(sku),
    );
  }
  @Get("gestao/precos/:sku") async administrativePrice(
    @Param("sku") sku: string,
    @Req() req: Request,
  ) {
    return this.services.precos.admin.obterRegra(
      (await this.session(req)).contexto,
      { tipo: "PRECO", sku: short.parse(sku) },
    );
  }
  @Get("gestao/cupons/:codigo") async administrativeCoupon(
    @Param("codigo") codigo: string,
    @Req() req: Request,
  ) {
    return this.services.precos.admin.obterRegra(
      (await this.session(req)).contexto,
      { tipo: "CUPOM", codigo: short.parse(codigo) },
    );
  }
  @Put("catalogo/:sku") async save(
    @Param("sku") sku: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    const ctx = await this.mutationContext(req),
      input = product.parse(body);
    if (input.sku !== sku) throw new DomainError("INVALIDO");
    return this.services.catalogo.api.salvarProduto(ctx, input);
  }
  @Post("precos/regras") async configure(
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    return this.services.precos.api.configurarRegra(
      await this.mutationContext(req),
      rule.parse(body),
    );
  }
  @Post("precos/cotacoes") @HttpCode(200) calculate(@Body() body: unknown) {
    const input = quote.parse(body);
    return this.services.precos.api.calcular(input.itens, input.cupom);
  }
  @Get("estoque/:sku") stock(@Param("sku") sku: string) {
    return this.services.estoque.api.consultar(short.parse(sku));
  }
  @Post("estoque/movimentos") async move(
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    return this.services.estoque.api.movimentar(
      await this.mutationContext(req),
      movement.parse(body),
      short.parse(req.headers["idempotency-key"]),
    );
  }
}
@Module({})
class ApiModule {}
export async function buildApplication(
  services: Services,
  options: HttpOptions = {},
): Promise<INestApplication> {
  const app = await NestFactory.create<NestExpressApplication>(
    {
      module: ApiModule,
      controllers: [ApiController],
      providers: [
        { provide: SERVICES, useValue: services },
        { provide: OPTIONS, useValue: options },
      ],
    },
    { logger: false },
  );
  const origin = options.origin ?? "http://127.0.0.1:5173";
  app.getHttpAdapter().getInstance().disable("x-powered-by");
  app.use((req: Request, res: Response, next: NextFunction) => {
    const started = performance.now();
    res.locals.requestId = randomUUID();
    res.setHeader("X-Request-Id", res.locals.requestId);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
    res.once("finish", () =>
      options.log?.({
        requestId: res.locals.requestId,
        method: req.method,
        route: req.route?.path ?? "unmatched",
        status: res.statusCode,
        durationMs: Math.round(performance.now() - started),
      }),
    );
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers.origin &&
      req.headers.origin !== origin
    ) {
      res.status(403).json({
        codigo: "NAO_AUTORIZADO",
        mensagem: messages.NAO_AUTORIZADO,
        requestId: res.locals.requestId,
      });
      return;
    }
    next();
  });
  app.enableCors({ origin, credentials: true });
  app.useGlobalFilters(new ApiErrors());
  await app.init();
  return app;
}

export type ErrorCode =
  | "INVALIDO"
  | "NAO_ENCONTRADO"
  | "NAO_AUTORIZADO"
  | "CONFLITO"
  | "INDISPONIVEL"
  | "PRECO_INDISPONIVEL"
  | "CUPOM_INVALIDO"
  | "ESTOQUE_INSUFICIENTE"
  | "RESERVA_EXPIRADA";

export class DomainError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode, message: string = code) {
    super(message);
    this.code = code;
  }
}
export function check(
  condition: unknown,
  code: ErrorCode = "INVALIDO",
  message?: string,
): asserts condition {
  if (!condition) throw new DomainError(code, message);
}
export function integer(
  value: number,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
): number {
  check(Number.isSafeInteger(value) && value >= min && value <= max);
  return value;
}
export function exactNumber(value: bigint): number {
  check(value >= 0n && value <= BigInt(Number.MAX_SAFE_INTEGER));
  return Number(value);
}
export function discountLine(
  price: number,
  quantity: number,
  percent: number,
): { subtotal: number; discount: number; total: number } {
  integer(price, 1);
  integer(quantity, 1);
  integer(percent, 0, 100);
  const subtotal = BigInt(price) * BigInt(quantity);
  const discount = (subtotal * BigInt(percent) + 50n) / 100n;
  return {
    subtotal: exactNumber(subtotal),
    discount: exactNumber(discount),
    total: exactNumber(subtotal - discount),
  };
}
export function text(value: string, max = 200): string {
  check(
    typeof value === "string" && value.trim().length > 0 && value.length <= max,
  );
  return value.trim();
}
export interface Clock {
  now(): Date;
}
export const systemClock: Clock = { now: () => new Date() };
export type Role =
  "CLIENTE" | "GESTOR" | "LOGISTICA" | "ATENDENTE" | "MODERADOR";
export interface Context {
  readonly actorId: string;
  readonly roles: readonly Role[];
  readonly service?: "M03" | "M04" | "M11" | "M12";
}
const trusted = new WeakSet<object>();
/** Composition/authentication only; never construct contexts from HTTP body fields. */
export function trustedContext(
  actorId: string,
  roles: readonly Role[],
  service?: Context["service"],
): Context {
  const ctx: Context = Object.freeze({
    actorId,
    roles: Object.freeze([...roles]),
    ...(service ? { service } : {}),
  });
  trusted.add(ctx);
  return ctx;
}
export function authorize(
  ctx: Context,
  roles: readonly Role[] = [],
  services: readonly NonNullable<Context["service"]>[] = [],
): void {
  check(
    ctx &&
      trusted.has(ctx) &&
      (roles.some((r) => ctx.roles.includes(r)) ||
        (!!ctx.service && services.includes(ctx.service))),
    "NAO_AUTORIZADO",
  );
}
export function authenticated(ctx: Context): void {
  check(ctx && trusted.has(ctx), "NAO_AUTORIZADO");
}
export interface Page {
  numero: number;
  tamanho: number;
}
export interface PageResult<T> {
  itens: T[];
  total: number;
  pagina: Page;
}
export function page(input: Page): Page {
  integer(input.numero, 1);
  integer(input.tamanho, 1, 100);
  return input;
}
export interface Item {
  sku: string;
  quantidade: number;
}
export interface DomainEvent {
  id: string;
  tipo: string;
  versaoEsquema: 1;
  origem: string;
  agregado: string;
  versaoAgregado: number;
  instante: string;
  dados: Record<string, unknown>;
}

// ============================================================================
// CONTRATOS DO INCREMENTO 2: M02 (CARRINHO) E M03 (CHECKOUT)
// ============================================================================

export type ErrorCodeCheckout = ErrorCode | "RECONFIRMACAO_NECESSARIA" | "EXPIRADA" | "PAGAMENTO_RECUSADO";

export interface ItemCarrinhoCalculado {
  sku: string;
  nome: string;
  quantidade: number;
  precoUnitarioCentavos: number;
  descontoCentavos: number;
  subtotalCentavos: number;
  disponivel: boolean;
  motivoIndisponibilidade?: string;
}

export interface Carrinho {
  id: string;
  clienteId: string;
  revisao: number;
  itens: ItemCarrinhoCalculado[];
  subtotalCentavos: number;
  atualizadoEm: string;
}

export interface ICarrinho {
  definirItem(
    ctx: Context,
    carrinhoId: string | undefined,
    sku: string,
    quantidade: number,
  ): Promise<Carrinho>;

  obterCarrinho(
    ctx: Context,
    carrinhoId: string,
  ): Promise<Carrinho>;

  esvaziar(
    ctx: Context,
    carrinhoId: string,
    revisaoEsperada: number,
    chaveIdempotencia: string,
  ): Promise<Carrinho>;
}

export interface EnderecoEntrega {
  destinatario: string;
  logradouro: string;
  numero: string;
  complemento?: string;
  cidade: string;
  uf: string;
  cep: string;
}

export interface CotacaoFrete {
  id: string;
  servico: string;
  valorCentavos: number;
  prazoDiasUteis: number;
  validoAte: string;
}

export interface OpcaoFreteCheckout extends CotacaoFrete {
  totalComFreteCentavos: number;
}

export interface ResumoCheckout {
  id: string;
  carrinhoId: string;
  clienteId: string;
  revisaoCarrinho: number;
  itens: ItemCarrinhoCalculado[];
  subtotalItensCentavos: number;
  descontoTotalCentavos: number;
  cupomAplicado?: string;
  endereco: EnderecoEntrega;
  opcoesFrete: OpcaoFreteCheckout[];
  validoAte: string;
  versao: number;
}

export type MeioPagamento =
  | { tipo: "PIX" }
  | { tipo: "CARTAO_TOKENIZADO"; tokenCartao: string; parcelas?: number };

export interface ResultadoConfirmacaoCheckout {
  tentativaId: string;
  situacao: "PENDENTE" | "AGUARDANDO_PAGAMENTO" | "CONCLUIDO" | "FALHA";
  pedidoId: string;
  reservaId: string;
  pagamentoId: string;
  totalCentavos: number;
}

export interface ICheckout {
  simular(
    ctx: Context,
    carrinhoId: string,
    endereco: EnderecoEntrega,
    cupom?: string,
  ): Promise<ResumoCheckout>;

  confirmar(
    ctx: Context,
    simulacaoId: string,
    opcaoFreteId: string,
    meio: MeioPagamento,
    chaveIdempotencia: string,
  ): Promise<ResultadoConfirmacaoCheckout>;
}

// Interfaces requeridas pelo M03 (implementadas pelos módulos M10, M04 e M06)
export interface IEntregas {
  cotar(itens: Item[], cep: string): Promise<CotacaoFrete[]>;
}

export interface PedidoEntrada {
  clienteId: string;
  itens: ItemCarrinhoCalculado[];
  endereco: EnderecoEntrega;
  cotacaoFrete: CotacaoFrete;
  subtotalCentavos: number;
  descontoCentavos: number;
  totalCentavos: number;
  reservaId: string;
  tentativaCheckoutId: string;
}

export interface IPedidos {
  criar(
    ctx: Context,
    dados: PedidoEntrada,
    chaveIdempotencia: string,
  ): Promise<{ id: string; estado: string }>;
}

export interface CobrancaEntrada {
  pedidoId: string;
  clienteId: string;
  valorCentavos: number;
  meio: MeioPagamento;
}

export interface IPagamentos {
  cobrar(
    ctx: Context,
    dados: CobrancaEntrada,
    chaveIdempotencia: string,
  ): Promise<{ id: string; estado: "PENDENTE" | "APROVADO" | "RECUSADO" }>;
}
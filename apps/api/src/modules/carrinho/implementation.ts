import { randomUUID } from "node:crypto";
import {
  DomainError,
  authorize,
  systemClock,
  type Carrinho,
  type Clock,
  type Context,
  type ICarrinho,
  type ItemCarrinhoCalculado,
} from "../../../../../packages/kernel/index.js";
import type { Database } from "../../infrastructure/database.js";
import { migrate } from "../../infrastructure/migrations.js";
import type { ICatalogo } from "../catalogo/index.js";
import type { IPrecos } from "../precos/index.js";

const SQL_MIGRACAO_CARRINHO = `
CREATE TABLE IF NOT EXISTS carrinho.carrinhos (
  id TEXT PRIMARY KEY,
  cliente_id TEXT NOT NULL UNIQUE,
  revisao INTEGER NOT NULL DEFAULT 1,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS carrinho.carrinho_itens (
  carrinho_id TEXT NOT NULL REFERENCES carrinho.carrinhos(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  quantidade INTEGER NOT NULL CHECK (quantidade >= 1 AND quantidade <= 99),
  PRIMARY KEY (carrinho_id, sku)
);

CREATE TABLE IF NOT EXISTS carrinho.carrinho_idempotencia (
  chave TEXT NOT NULL,
  cliente_id TEXT NOT NULL,
  carrinho_id TEXT NOT NULL,
  revisao_esperada INTEGER NOT NULL,
  resposta_json JSONB NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chave, cliente_id)
);
`;

export interface DependenciasCarrinho {
  db: Database;
  catalogo: ICatalogo;
  precos: IPrecos;
  clock?: Clock;
}

export class CarrinhoService implements ICarrinho {
  private readonly db: Database;
  private readonly catalogo: ICatalogo;
  private readonly precos: IPrecos;
  private readonly clock: Clock;

  constructor(deps: DependenciasCarrinho) {
    this.db = deps.db;
    this.catalogo = deps.catalogo;
    this.precos = deps.precos;
    this.clock = deps.clock ?? systemClock;
  }

  async init(): Promise<void> {
    await migrate(this.db, "carrinho", "001_inicial", SQL_MIGRACAO_CARRINHO);
  }

  async definirItem(
    ctx: Context,
    carrinhoId: string | undefined,
    sku: string,
    quantidade: number,
  ): Promise<Carrinho> {
    authorize(ctx, ["CLIENTE"]);
    const clienteId = ctx.actorId;

    if (!sku || typeof sku !== "string" || sku.trim() === "") {
      throw new DomainError("INVALIDO", "SKU inválido.");
    }
    if (!Number.isInteger(quantidade) || quantidade < 0 || quantidade > 99) {
      throw new DomainError(
        "INVALIDO",
        "Quantidade deve ser um inteiro entre 0 e 99.",
      );
    }

    if (quantidade > 0) {
      await this.catalogo.obterProduto(sku);
    }

    const idAlvo = await this.db.transaction(async (tx) => {
      let id = carrinhoId;
      if (id) {
        const res = await tx.query<{ cliente_id: string }>(
          "SELECT cliente_id FROM carrinho.carrinhos WHERE id = $1 FOR UPDATE",
          [id],
        );
        if (res.rowCount === 0) {
          throw new DomainError("NAO_ENCONTRADO", "Carrinho não encontrado.");
        }
        if (res.rows[0].cliente_id !== clienteId) {
          throw new DomainError("NAO_AUTORIZADO", "Acesso negado ao carrinho.");
        }
      } else {
        const existente = await tx.query<{ id: string }>(
          "SELECT id FROM carrinho.carrinhos WHERE cliente_id = $1 FOR UPDATE",
          [clienteId],
        );
        if (existente.rowCount && existente.rowCount > 0) {
          id = existente.rows[0].id;
        } else {
          id = `car_${randomUUID()}`;
          await tx.query(
            "INSERT INTO carrinho.carrinhos (id, cliente_id, revisao, atualizado_em) VALUES ($1, $2, 1, $3)",
            [id, clienteId, this.clock.now().toISOString()],
          );
        }
      }

      if (quantidade === 0) {
        await tx.query(
          "DELETE FROM carrinho.carrinho_itens WHERE carrinho_id = $1 AND sku = $2",
          [id, sku],
        );
      } else {
        await tx.query(
          `INSERT INTO carrinho.carrinho_itens (carrinho_id, sku, quantidade)
           VALUES ($1, $2, $3)
           ON CONFLICT (carrinho_id, sku)
           DO UPDATE SET quantidade = EXCLUDED.quantidade`,
          [id, sku, quantidade],
        );
      }

      await tx.query(
        "UPDATE carrinho.carrinhos SET revisao = revisao + 1, atualizado_em = $2 WHERE id = $1",
        [id, this.clock.now().toISOString()],
      );

      return id!;
    });

    return this.obterCarrinho(ctx, idAlvo);
  }

  async obterCarrinho(ctx: Context, carrinhoId: string): Promise<Carrinho> {
    authorize(ctx, ["CLIENTE"], ["M03"]);

    const resCarrinho = await this.db.query<{
      id: string;
      cliente_id: string;
      revisao: number;
      atualizado_em: Date;
    }>(
      "SELECT id, cliente_id, revisao, atualizado_em FROM carrinho.carrinhos WHERE id = $1",
      [carrinhoId],
    );

    if (resCarrinho.rowCount === 0) {
      throw new DomainError("NAO_ENCONTRADO", "Carrinho não encontrado.");
    }

    const row = resCarrinho.rows[0];
    if (!ctx.service && row.cliente_id !== ctx.actorId) {
      throw new DomainError("NAO_AUTORIZADO", "Acesso negado ao carrinho.");
    }

    const resItens = await this.db.query<{ sku: string; quantidade: number }>(
      "SELECT sku, quantidade FROM carrinho.carrinho_itens WHERE carrinho_id = $1 ORDER BY sku ASC",
      [carrinhoId],
    );

    if (resItens.rowCount === 0) {
      return {
        id: row.id,
        clienteId: row.cliente_id,
        revisao: row.revisao,
        itens: [],
        subtotalCentavos: 0,
        atualizadoEm: new Date(row.atualizado_em).toISOString(),
      };
    }

    const itensCalculados: ItemCarrinhoCalculado[] = [];
    const itensParaCotar: Array<{ sku: string; quantidade: number }> = [];
    const produtosMap = new Map<string, { nome: string; ativo: boolean }>();

    for (const item of resItens.rows) {
      try {
        const prod = await this.catalogo.obterProduto(item.sku);
        produtosMap.set(item.sku, { nome: prod.nome, ativo: true });
        itensParaCotar.push({ sku: item.sku, quantidade: item.quantidade });
      } catch {
        produtosMap.set(item.sku, { nome: item.sku, ativo: false });
      }
    }

    const cotacaoMap = new Map<
      string,
      { precoUnitario: number; desconto: number; subtotal: number }
    >();

    if (itensParaCotar.length > 0) {
      const cotacao = await this.precos.calcular(
        itensParaCotar,
        undefined,
        this.clock.now().toISOString(),
      );
      for (const linha of cotacao.linhas) {
        cotacaoMap.set(linha.sku, {
          precoUnitario: linha.precoUnitarioCentavos,
          desconto: linha.descontoCentavos,
          subtotal: linha.subtotalCentavos,
        });
      }
    }

    let subtotalGeral = 0;

    for (const item of resItens.rows) {
      const prodInfo = produtosMap.get(item.sku)!;
      const precoInfo = cotacaoMap.get(item.sku);

      if (!prodInfo.ativo || !precoInfo) {
        itensCalculados.push({
          sku: item.sku,
          nome: prodInfo.nome,
          quantidade: item.quantidade,
          precoUnitarioCentavos: 0,
          descontoCentavos: 0,
          subtotalCentavos: 0,
          disponivel: false,
          motivoIndisponibilidade: !prodInfo.ativo
            ? "Produto inativo ou indisponível no catálogo"
            : "Preço indisponível",
        });
      } else {
        subtotalGeral += precoInfo.subtotal;
        itensCalculados.push({
          sku: item.sku,
          nome: prodInfo.nome,
          quantidade: item.quantidade,
          precoUnitarioCentavos: precoInfo.precoUnitario,
          descontoCentavos: precoInfo.desconto,
          subtotalCentavos: precoInfo.subtotal,
          disponivel: true,
        });
      }
    }

    return {
      id: row.id,
      clienteId: row.cliente_id,
      revisao: row.revisao,
      itens: itensCalculados,
      subtotalCentavos: subtotalGeral,
      atualizadoEm: new Date(row.atualizado_em).toISOString(),
    };
  }

  async esvaziar(
    ctx: Context,
    carrinhoId: string,
    revisaoEsperada: number,
    chaveIdempotencia: string,
  ): Promise<Carrinho> {
    authorize(ctx, ["CLIENTE"], ["M03"]);
    if (!chaveIdempotencia || chaveIdempotencia.trim() === "") {
      throw new DomainError("INVALIDO", "Chave de idempotência obrigatória.");
    }

    return this.db.transaction(async (tx) => {
      const resCarrinho = await tx.query<{
        id: string;
        cliente_id: string;
        revisao: number;
      }>(
        "SELECT id, cliente_id, revisao FROM carrinho.carrinhos WHERE id = $1 FOR UPDATE",
        [carrinhoId],
      );

      if (resCarrinho.rowCount === 0) {
        throw new DomainError("NAO_ENCONTRADO", "Carrinho não encontrado.");
      }

      const row = resCarrinho.rows[0];
      if (!ctx.service && row.cliente_id !== ctx.actorId) {
        throw new DomainError("NAO_AUTORIZADO", "Acesso negado ao carrinho.");
      }

      const idem = await tx.query<{
        carrinho_id: string;
        revisao_esperada: number;
        resposta_json: Carrinho;
      }>(
        "SELECT carrinho_id, revisao_esperada, resposta_json FROM carrinho.carrinho_idempotencia WHERE chave = $1 AND cliente_id = $2",
        [chaveIdempotencia, row.cliente_id],
      );

      if (idem.rowCount && idem.rowCount > 0) {
        const reg = idem.rows[0];
        if (
          reg.carrinho_id !== carrinhoId ||
          reg.revisao_esperada !== revisaoEsperada
        ) {
          throw new DomainError(
            "CONFLITO",
            "Chave de idempotência já utilizada com parâmetros distintos.",
          );
        }
        return reg.resposta_json;
      }

      if (row.revisao !== revisaoEsperada) {
        throw new DomainError(
          "CONFLITO",
          `Revisão divergente: esperada ${revisaoEsperada}, atual ${row.revisao}.`,
        );
      }

      await tx.query("DELETE FROM carrinho.carrinho_itens WHERE carrinho_id = $1", [
        carrinhoId,
      ]);
      const agoraIso = this.clock.now().toISOString();
      await tx.query(
        "UPDATE carrinho.carrinhos SET revisao = revisao + 1, atualizado_em = $2 WHERE id = $1",
        [carrinhoId, agoraIso],
      );

      const resposta: Carrinho = {
        id: row.id,
        clienteId: row.cliente_id,
        revisao: row.revisao + 1,
        itens: [],
        subtotalCentavos: 0,
        atualizadoEm: agoraIso,
      };

      await tx.query(
        `INSERT INTO carrinho.carrinho_idempotencia (chave, cliente_id, carrinho_id, revisao_esperada, resposta_json)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          chaveIdempotencia,
          row.cliente_id,
          carrinhoId,
          revisaoEsperada,
          JSON.stringify(resposta),
        ],
      );

      return resposta;
    });
  }
}
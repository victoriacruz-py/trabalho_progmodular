import { randomUUID } from "node:crypto";
import {
  Clock,
  Context,
  Item,
  authorize,
  check,
  integer,
  text,
} from "../../../../../packages/kernel";
import { Database, Tx, lock } from "../../infrastructure/database";
import { Journal, journalDDL, idempotent } from "../../infrastructure/events";
import { migrate } from "../../infrastructure/migrations";

export interface Saldo {
  sku: string;
  fisico: number;
  reservado: number;
  disponivel: number;
  versao: number;
}
export interface Movimento {
  sku: string;
  tipo: "ENTRADA" | "SAIDA";
  quantidade: number;
  justificativa: string;
}
export interface Reserva {
  id: string;
  itens: Item[];
  vencimento: string;
  estado: "ATIVA" | "CONFIRMADA" | "LIBERADA" | "EXPIRADA";
}
export interface IEstoque {
  consultar(sku: string): Promise<Saldo>;
  movimentar(ctx: Context, movimento: Movimento, chave: string): Promise<Saldo>;
  reservar(
    ctx: Context,
    itens: Item[],
    vencimento: Date | string,
    chave: string,
  ): Promise<Reserva>;
  encerrarReserva(
    ctx: Context,
    reservaId: string,
    acao: "CONFIRMAR" | "LIBERAR",
    chave: string,
  ): Promise<Reserva>;
}
/** Only the public catalog lookup is needed; existing inventory survives product deactivation. */
export interface CatalogoDeEstoque {
  obterProduto(sku: string): Promise<{ sku: string }>;
}
function compareSkus(a: Item, b: Item): number {
  return a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0;
}

export async function createEstoque(
  db: Database,
  clock: Clock,
  catalogo: CatalogoDeEstoque,
): Promise<{ api: IEstoque; journal: Journal }> {
  await migrate(
    db,
    "estoque",
    "001_initial",
    `CREATE SCHEMA IF NOT EXISTS estoque;
    CREATE TABLE IF NOT EXISTS estoque.saldos (
      sku text PRIMARY KEY,
      fisico bigint NOT NULL CHECK(fisico BETWEEN 0 AND 9007199254740991),
      reservado bigint NOT NULL DEFAULT 0 CHECK(reservado >= 0 AND reservado <= fisico),
      versao bigint NOT NULL CHECK(versao >= 1)
    );
    CREATE TABLE IF NOT EXISTS estoque.reservas (
      id uuid PRIMARY KEY, vencimento timestamptz NOT NULL,
      estado text NOT NULL CHECK(estado IN ('ATIVA','CONFIRMADA','LIBERADA','EXPIRADA'))
    );
    CREATE TABLE IF NOT EXISTS estoque.itens_reserva (
      reserva_id uuid NOT NULL REFERENCES estoque.reservas(id) ON DELETE RESTRICT,
      sku text NOT NULL REFERENCES estoque.saldos(sku) ON DELETE RESTRICT,
      quantidade bigint NOT NULL CHECK(quantidade BETWEEN 1 AND 9007199254740991),
      comprometido boolean NOT NULL DEFAULT true,
      PRIMARY KEY(reserva_id,sku)
    );
    CREATE INDEX IF NOT EXISTS itens_comprometidos_sku_idx ON estoque.itens_reserva(sku) WHERE comprometido;
    CREATE INDEX IF NOT EXISTS reservas_vencimento_idx ON estoque.reservas(vencimento) WHERE estado='ATIVA';
    CREATE TABLE IF NOT EXISTS estoque.movimentos (
      id uuid PRIMARY KEY, sku text NOT NULL REFERENCES estoque.saldos(sku) ON DELETE RESTRICT,
      tipo text NOT NULL CHECK(tipo IN ('ENTRADA','SAIDA','CONFIRMACAO')),
      quantidade bigint NOT NULL CHECK(quantidade BETWEEN 1 AND 9007199254740991),
      justificativa text NOT NULL CHECK(length(btrim(justificativa)) > 0),
      origem text NOT NULL, instante timestamptz NOT NULL,
      reserva_id uuid REFERENCES estoque.reservas(id) ON DELETE RESTRICT
    );
    CREATE INDEX IF NOT EXISTS movimentos_sku_instante_idx ON estoque.movimentos(sku,instante);
    ${journalDDL("estoque")}`,
  );
  const journal = new Journal(db, "estoque", "M09", clock);
  async function saldo(tx: Tx, sku: string): Promise<Saldo> {
    const row = (
      await tx.query<{
        sku: string;
        fisico: string;
        reservado: string;
        versao: string;
      }>(
        "SELECT sku,fisico,reservado,versao FROM estoque.saldos WHERE sku=$1",
        [sku],
      )
    ).rows[0];
    check(row, "NAO_ENCONTRADO");
    const fisico = Number(row.fisico),
      reservado = Number(row.reservado);
    return {
      sku,
      fisico,
      reservado,
      disponivel: fisico - reservado,
      versao: Number(row.versao),
    };
  }
  async function reserva(tx: Tx, id: string): Promise<Reserva> {
    const row = (
      await tx.query<{
        id: string;
        vencimento: Date;
        estado: Reserva["estado"];
      }>("SELECT id,vencimento,estado FROM estoque.reservas WHERE id=$1", [id])
    ).rows[0];
    check(row, "NAO_ENCONTRADO");
    const itens = (
      await tx.query<{ sku: string; quantidade: string }>(
        "SELECT sku,quantidade FROM estoque.itens_reserva WHERE reserva_id=$1 ORDER BY sku",
        [id],
      )
    ).rows
      .map((item) => ({ sku: item.sku, quantidade: Number(item.quantidade) }))
      .sort(compareSkus);
    return {
      id,
      itens,
      vencimento: row.vencimento.toISOString(),
      estado:
        row.estado === "ATIVA" && clock.now() >= row.vencimento
          ? "EXPIRADA"
          : row.estado,
    };
  }
  /** Caller holds the SKU lock. Expiry can release one allocation without locking another SKU. */
  async function expire(tx: Tx, sku: string, now: Date): Promise<void> {
    const released = await tx.query<{ quantidade: string }>(
      `UPDATE estoque.itens_reserva AS item
      SET comprometido=false FROM estoque.reservas AS reserva
      WHERE item.reserva_id=reserva.id AND item.sku=$1 AND item.comprometido
      AND reserva.estado='ATIVA' AND reserva.vencimento <= $2 RETURNING item.quantidade`,
      [sku, now],
    );
    if (!released.rowCount) return;
    const quantity = released.rows.reduce(
      (sum, item) => sum + BigInt(item.quantidade),
      0n,
    );
    await tx.query(
      "UPDATE estoque.saldos SET reservado=reservado-$2, versao=versao+1 WHERE sku=$1",
      [sku, quantity.toString()],
    );
    const result = await saldo(tx, sku);
    await journal.append(tx, "EstoqueAlterado", result.sku, result.versao, {
      ...result,
    });
  }
  const api: IEstoque = {
    async consultar(sku: string): Promise<Saldo> {
      sku = text(sku);
      return db.transaction(async (tx) => {
        await lock(tx, "estoque:sku:" + sku);
        await expire(tx, sku, clock.now());
        return saldo(tx, sku);
      });
    },
    async reservar(
      ctx: Context,
      itens: Item[],
      vencimento: Date | string,
      chave: string,
    ): Promise<Reserva> {
      authorize(ctx, [], ["M03"]);
      check(Array.isArray(itens) && itens.length > 0);
      const normalized = itens
        .map((item) => ({
          sku: text(item.sku),
          quantidade: integer(item.quantidade, 1),
        }))
        .sort(compareSkus);
      check(
        new Set(normalized.map((item) => item.sku)).size === normalized.length,
      );
      const expiry = new Date(vencimento);
      check(Number.isFinite(expiry.getTime()));
      return db.transaction(async (tx) => {
        const id = await idempotent(
          tx,
          "estoque",
          ctx,
          "reservar",
          chave,
          { itens: normalized, vencimento: expiry.toISOString() },
          async () => {
            for (const item of normalized)
              await lock(tx, "estoque:sku:" + item.sku);
            const now = clock.now();
            check(
              expiry > now && expiry.getTime() - now.getTime() <= 15 * 60_000,
            );
            for (const item of normalized) {
              await expire(tx, item.sku, now);
              check(
                (await saldo(tx, item.sku)).disponivel >= item.quantidade,
                "ESTOQUE_INSUFICIENTE",
              );
            }
            const id = randomUUID();
            await tx.query(
              "INSERT INTO estoque.reservas(id,vencimento,estado) VALUES($1,$2,'ATIVA')",
              [id, expiry],
            );
            for (const item of normalized) {
              await tx.query(
                "INSERT INTO estoque.itens_reserva(reserva_id,sku,quantidade) VALUES($1,$2,$3)",
                [id, item.sku, item.quantidade],
              );
              await tx.query(
                "UPDATE estoque.saldos SET reservado=reservado+$2, versao=versao+1 WHERE sku=$1",
                [item.sku, item.quantidade],
              );
              const result = await saldo(tx, item.sku);
              await journal.append(
                tx,
                "EstoqueAlterado",
                result.sku,
                result.versao,
                { ...result },
              );
            }
            return id;
          },
        );
        return reserva(tx, id);
      });
    },
    async encerrarReserva(
      ctx: Context,
      reservaId: string,
      acao: "CONFIRMAR" | "LIBERAR",
      chave: string,
    ): Promise<Reserva> {
      authorize(ctx, [], ["M03", "M04"]);
      check(
        typeof reservaId === "string" &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            reservaId,
          ),
      );
      check(acao === "CONFIRMAR" || acao === "LIBERAR");
      return db.transaction(async (tx) => {
        const id = await idempotent(
          tx,
          "estoque",
          ctx,
          "encerrarReserva",
          chave,
          { reservaId, acao },
          async () => {
            const original = await reserva(tx, reservaId);
            for (const item of original.itens)
              await lock(tx, "estoque:sku:" + item.sku);
            const now = clock.now();
            for (const item of original.itens) await expire(tx, item.sku, now);
            // Re-read time/state only after waiting for all SKU locks.
            const current = await reserva(tx, reservaId);
            const target = acao === "CONFIRMAR" ? "CONFIRMADA" : "LIBERADA";
            if (current.estado === target) return reservaId;
            check(
              current.estado === "ATIVA" || current.estado === "EXPIRADA",
              "CONFLITO",
            );
            check(
              acao !== "CONFIRMAR" || current.estado !== "EXPIRADA",
              "RESERVA_EXPIRADA",
            );
            for (const item of current.itens) {
              const changed = await tx.query(
                "UPDATE estoque.itens_reserva SET comprometido=false WHERE reserva_id=$1 AND sku=$2 AND comprometido RETURNING quantidade",
                [reservaId, item.sku],
              );
              if (!changed.rowCount) continue;
              await tx.query(
                "UPDATE estoque.saldos SET reservado=reservado-$2, fisico=fisico-$3, versao=versao+1 WHERE sku=$1",
                [
                  item.sku,
                  item.quantidade,
                  acao === "CONFIRMAR" ? item.quantidade : 0,
                ],
              );
              if (acao === "CONFIRMAR")
                await tx.query(
                  "INSERT INTO estoque.movimentos(id,sku,tipo,quantidade,justificativa,origem,instante,reserva_id) VALUES($1,$2,'CONFIRMACAO',$3,$4,$5,$6,$7)",
                  [
                    randomUUID(),
                    item.sku,
                    item.quantidade,
                    "Confirmação de reserva",
                    ctx.service,
                    clock.now(),
                    reservaId,
                  ],
                );
              const result = await saldo(tx, item.sku);
              await journal.append(
                tx,
                "EstoqueAlterado",
                result.sku,
                result.versao,
                { ...result },
              );
            }
            await tx.query(
              "UPDATE estoque.reservas SET estado=$2 WHERE id=$1",
              [reservaId, current.estado === "EXPIRADA" ? "EXPIRADA" : target],
            );
            return reservaId;
          },
        );
        return reserva(tx, id);
      });
    },
    async movimentar(
      ctx: Context,
      movimento: Movimento,
      chave: string,
    ): Promise<Saldo> {
      authorize(ctx, ["LOGISTICA"], ["M04", "M11"]);
      check(movimento && typeof movimento === "object");
      movimento = {
        sku: text(movimento.sku),
        tipo: movimento.tipo,
        quantidade: integer(movimento.quantidade, 1),
        justificativa: text(movimento.justificativa, 2000),
      };
      check(movimento.tipo === "ENTRADA" || movimento.tipo === "SAIDA");
      // Catalog owns a separate interface/transaction. Never hold a pool connection while calling it.
      const initialized =
        (
          await db.query("SELECT sku FROM estoque.saldos WHERE sku=$1", [
            movimento.sku,
          ])
        ).length > 0;
      if (!initialized) await catalogo.obterProduto(movimento.sku);
      return db.transaction((tx) =>
        idempotent(
          tx,
          "estoque",
          ctx,
          "movimentar",
          chave,
          movimento,
          async () => {
            await lock(tx, "estoque:sku:" + movimento.sku);
            const known = (
              await tx.query("SELECT sku FROM estoque.saldos WHERE sku=$1", [
                movimento.sku,
              ])
            ).rowCount;
            if (!known) {
              check(movimento.tipo === "ENTRADA", "ESTOQUE_INSUFICIENTE");
              await tx.query(
                "INSERT INTO estoque.saldos(sku,fisico,versao) VALUES($1,$2,1)",
                [movimento.sku, movimento.quantidade],
              );
            } else {
              await expire(tx, movimento.sku, clock.now());
              const before = await saldo(tx, movimento.sku);
              const delta =
                movimento.tipo === "ENTRADA"
                  ? movimento.quantidade
                  : -movimento.quantidade;
              check(
                delta >= 0 || before.disponivel >= movimento.quantidade,
                "ESTOQUE_INSUFICIENTE",
              );
              integer(before.fisico + delta);
              await tx.query(
                "UPDATE estoque.saldos SET fisico=fisico+$2, versao=versao+1 WHERE sku=$1",
                [movimento.sku, delta],
              );
            }
            await tx.query(
              "INSERT INTO estoque.movimentos(id,sku,tipo,quantidade,justificativa,origem,instante) VALUES($1,$2,$3,$4,$5,$6,$7)",
              [
                randomUUID(),
                movimento.sku,
                movimento.tipo,
                movimento.quantidade,
                movimento.justificativa,
                ctx.service ?? "LOGISTICA",
                clock.now(),
              ],
            );
            const result = await saldo(tx, movimento.sku);
            await journal.append(
              tx,
              "EstoqueAlterado",
              result.sku,
              result.versao,
              { ...result },
            );
            return result;
          },
        ),
      );
    },
  };
  return { api, journal };
}

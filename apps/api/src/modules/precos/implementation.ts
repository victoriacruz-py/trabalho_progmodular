import {
  Clock,
  check,
  authorize,
  discountLine,
  exactNumber,
  integer,
  text,
} from "../../../../../packages/kernel";
import { Database, lock } from "../../infrastructure/database";
import { Journal, journalDDL } from "../../infrastructure/events";
import { migrate } from "../../infrastructure/migrations";
import { ICatalogo } from "../catalogo";
import type {
  AdministracaoPrecos,
  IPrecos,
  LinhaPreco,
  RegraPreco,
} from "./index";

const schema = `
CREATE SCHEMA IF NOT EXISTS precos;
CREATE TABLE IF NOT EXISTS precos.precos (
  sku text PRIMARY KEY,
  preco_centavos bigint NOT NULL CHECK (preco_centavos > 0 AND preco_centavos <= 9007199254740991),
  promocao_percentual integer CHECK (promocao_percentual BETWEEN 1 AND 100),
  promocao_inicio timestamptz,
  promocao_fim timestamptz,
  versao integer NOT NULL CHECK (versao > 0),
  CHECK ((promocao_percentual IS NULL AND promocao_inicio IS NULL AND promocao_fim IS NULL)
    OR (promocao_percentual IS NOT NULL AND promocao_inicio IS NOT NULL AND promocao_fim IS NOT NULL AND promocao_inicio < promocao_fim))
);
CREATE TABLE IF NOT EXISTS precos.cupons (
  codigo text PRIMARY KEY,
  percentual integer NOT NULL CHECK (percentual BETWEEN 1 AND 100),
  inicio timestamptz NOT NULL,
  fim timestamptz NOT NULL,
  global boolean NOT NULL,
  versao integer NOT NULL CHECK (versao > 0),
  CHECK (inicio < fim)
);
CREATE TABLE IF NOT EXISTS precos.cupom_skus (
  codigo text NOT NULL REFERENCES precos.cupons(codigo) ON UPDATE NO ACTION ON DELETE CASCADE,
  sku text NOT NULL,
  PRIMARY KEY(codigo,sku)
);
`;
interface PriceRow {
  sku: string;
  preco_centavos: string;
  versao: number;
  promocao_percentual: number | null;
  promocao_inicio: Date | null;
  promocao_fim: Date | null;
}
interface CouponRow {
  codigo: string;
  percentual: number;
  inicio: Date;
  fim: Date;
  global: boolean;
  versao: number;
  skus: string[];
}

function instant(value: string): string {
  check(typeof value === "string");
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.exec(
      value,
    );
  check(match);
  const year = Number(match[1]),
    month = Number(match[2]),
    day = Number(match[3]);
  const leap = year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  check(month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]!);
  const date = new Date(value);
  check(Number.isFinite(date.getTime()));
  return date.toISOString();
}
function period(start: string, end: string): { inicio: string; fim: string } {
  const inicio = instant(start),
    fim = instant(end);
  check(new Date(inicio) < new Date(fim));
  return { inicio, fim };
}
function validate(input: RegraPreco): RegraPreco {
  check(input && typeof input === "object");
  if (input.versaoEsperada !== undefined)
    integer(input.versaoEsperada, 1, 2147483646);
  const version =
    input.versaoEsperada === undefined
      ? {}
      : { versaoEsperada: input.versaoEsperada };
  if (input.tipo === "PRECO") {
    check(
      input.promocao === undefined ||
        (input.promocao && typeof input.promocao === "object"),
    );
    return {
      tipo: "PRECO",
      sku: text(input.sku, 100),
      precoCentavos: integer(input.precoCentavos, 1),
      ...version,
      ...(input.promocao
        ? {
            promocao: {
              percentual: integer(input.promocao.percentual, 1, 100),
              ...period(input.promocao.inicio, input.promocao.fim),
            },
          }
        : {}),
    };
  }
  check(input.tipo === "CUPOM");
  let skus: string[] | undefined;
  if (input.skus !== undefined) {
    check(
      Array.isArray(input.skus) &&
        input.skus.length > 0 &&
        input.skus.length <= 10000,
    );
    skus = input.skus.map((sku) => text(sku, 100));
    check(new Set(skus).size === skus.length);
    skus.sort();
  }
  return {
    tipo: "CUPOM",
    codigo: text(input.codigo, 100).toUpperCase(),
    percentual: integer(input.percentual, 1, 100),
    ...period(input.inicio, input.fim),
    ...version,
    ...(skus ? { skus } : {}),
  };
}

export async function initializePrecos(
  db: Database,
  clock: Clock,
  catalogo: ICatalogo,
): Promise<{ api: IPrecos; admin: AdministracaoPrecos; journal: Journal }> {
  await migrate(db, "precos", "001_initial", schema + journalDDL("precos"));
  const journal = new Journal(db, "precos", "M08", clock);
  const api: IPrecos = {
    async configurarRegra(ctx, input) {
      authorize(ctx, ["GESTOR"]);
      const regra = validate(input);
      if (regra.tipo === "PRECO") await catalogo.obterProduto(regra.sku);
      else if (regra.skus)
        for (const sku of regra.skus) await catalogo.obterProduto(sku);
      return db.transaction(async (tx) => {
        const table = regra.tipo === "PRECO" ? "precos" : "cupons";
        const column = regra.tipo === "PRECO" ? "sku" : "codigo";
        const id = regra.tipo === "PRECO" ? regra.sku : regra.codigo;
        await lock(tx, `precos:${table}:${id}`);
        const previous = (
          await tx.query<{ versao: number }>(
            `SELECT versao FROM precos.${table} WHERE ${column}=$1 FOR UPDATE`,
            [id],
          )
        ).rows[0];
        check(
          previous
            ? previous.versao === regra.versaoEsperada
            : regra.versaoEsperada === undefined,
          "CONFLITO",
        );
        const version = (previous?.versao ?? 0) + 1;
        if (regra.tipo === "PRECO") {
          await tx.query(
            `INSERT INTO precos.precos(sku,preco_centavos,promocao_percentual,promocao_inicio,promocao_fim,versao) VALUES($1,$2,$3,$4,$5,$6)
            ON CONFLICT(sku) DO UPDATE SET preco_centavos=EXCLUDED.preco_centavos,promocao_percentual=EXCLUDED.promocao_percentual,
              promocao_inicio=EXCLUDED.promocao_inicio,promocao_fim=EXCLUDED.promocao_fim,versao=EXCLUDED.versao`,
            [
              regra.sku,
              regra.precoCentavos,
              regra.promocao?.percentual ?? null,
              regra.promocao?.inicio ?? null,
              regra.promocao?.fim ?? null,
              version,
            ],
          );
        } else {
          await tx.query(
            `INSERT INTO precos.cupons(codigo,percentual,inicio,fim,global,versao) VALUES($1,$2,$3,$4,$5,$6)
            ON CONFLICT(codigo) DO UPDATE SET percentual=EXCLUDED.percentual,inicio=EXCLUDED.inicio,fim=EXCLUDED.fim,global=EXCLUDED.global,versao=EXCLUDED.versao`,
            [
              regra.codigo,
              regra.percentual,
              regra.inicio,
              regra.fim,
              !regra.skus,
              version,
            ],
          );
          await tx.query("DELETE FROM precos.cupom_skus WHERE codigo=$1", [
            regra.codigo,
          ]);
          if (regra.skus)
            for (const sku of regra.skus)
              await tx.query(
                "INSERT INTO precos.cupom_skus(codigo,sku) VALUES($1,$2)",
                [regra.codigo, sku],
              );
        }
        const { versaoEsperada: _expected, ...fields } = regra;
        const saved = { ...fields, versao: version };
        await journal.append(
          tx,
          "PrecoAlterado",
          regra.tipo === "PRECO" ? `sku:${regra.sku}` : `cupom:${regra.codigo}`,
          version,
          saved,
        );
        return saved;
      });
    },
    async calcular(input, cupom, instante) {
      check(Array.isArray(input) && input.length > 0 && input.length <= 10000);
      const itens = input.map((item) => {
        check(item && typeof item === "object");
        return {
          sku: text(item.sku, 100),
          quantidade: integer(item.quantidade, 1),
        };
      });
      check(new Set(itens.map((item) => item.sku)).size === itens.length);
      const date = instante ?? clock.now();
      check(date instanceof Date && Number.isFinite(date.getTime()));
      const now = new Date(date.getTime());
      if (cupom !== undefined)
        check(
          typeof cupom === "string" &&
            cupom.trim().length > 0 &&
            cupom.length <= 100,
          "CUPOM_INVALIDO",
        );
      const couponCode = cupom?.trim().toUpperCase();
      return db.transaction(async (tx) => {
        await tx.query(
          "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
        );
        const prices = (
          await tx.query<PriceRow>(
            "SELECT * FROM precos.precos WHERE sku=ANY($1::text[])",
            [itens.map((i) => i.sku)],
          )
        ).rows;
        const bySku = new Map(prices.map((price) => [price.sku, price]));
        let coupon: CouponRow | undefined;
        if (couponCode !== undefined) {
          coupon = (
            await tx.query<CouponRow>(
              "SELECT c.*,ARRAY(SELECT sku FROM precos.cupom_skus WHERE codigo=c.codigo) AS skus FROM precos.cupons c WHERE codigo=$1",
              [couponCode],
            )
          ).rows[0];
          check(coupon, "CUPOM_INVALIDO", "Cupom inexistente.");
          check(
            coupon.inicio <= now,
            "CUPOM_INVALIDO",
            "Cupom ainda não está ativo.",
          );
          check(coupon.fim > now, "CUPOM_INVALIDO", "Cupom expirou.");
          check(
            coupon.global ||
              itens.some((item) => coupon!.skus.includes(item.sku)),
            "CUPOM_INVALIDO",
            "Cupom não é elegível para os itens.",
          );
        }
        const linhas: LinhaPreco[] = itens.map((item) => {
          const price = bySku.get(item.sku);
          check(price, "PRECO_INDISPONIVEL");
          const promotion =
            price.promocao_inicio &&
            price.promocao_fim &&
            price.promocao_inicio <= now &&
            price.promocao_fim > now
              ? price.promocao_percentual!
              : 0;
          const couponPercent =
            coupon && (coupon.global || coupon.skus.includes(item.sku))
              ? coupon.percentual
              : 0;
          const percent = Math.max(promotion, couponPercent);
          const result = discountLine(
            Number(price.preco_centavos),
            item.quantidade,
            percent,
          );
          const applied: LinhaPreco["regraAplicada"] =
            couponPercent > promotion
              ? {
                  tipo: "CUPOM",
                  codigo: coupon!.codigo,
                  versao: coupon!.versao,
                }
              : {
                  tipo: promotion > 0 ? "PROMOCAO" : "BASE",
                  versao: price.versao,
                };
          return {
            sku: item.sku,
            quantidade: item.quantidade,
            precoUnitario: Number(price.preco_centavos),
            subtotal: result.subtotal,
            desconto: result.discount,
            total: result.total,
            percentual: percent,
            regraVersao: price.versao,
            regraAplicada: applied,
          };
        });
        const boundaries = prices
          .flatMap((p) => [p.promocao_inicio, p.promocao_fim])
          .filter((date): date is Date => !!date && date > now);
        if (coupon) boundaries.push(coupon.fim);
        const expires = boundaries.reduce(
          (earliest, date) => Math.min(earliest, date.getTime()),
          now.getTime() + 300000,
        );
        return {
          linhas,
          totalCentavos: exactNumber(
            linhas.reduce((total, l) => total + BigInt(l.total), 0n),
          ),
          calculadaEm: now.toISOString(),
          validaAte: new Date(expires).toISOString(),
          ...(coupon
            ? { cupom: { codigo: coupon.codigo, versao: coupon.versao } }
            : {}),
        };
      });
    },
  };
  const admin: AdministracaoPrecos = {
    async obterRegra(ctx, selector) {
      authorize(ctx, ["GESTOR"]);
      check(selector && typeof selector === "object");
      if (selector.tipo === "PRECO") {
        const [price] = await db.query<PriceRow>(
          "SELECT * FROM precos.precos WHERE sku=$1",
          [text(selector.sku, 100)],
        );
        check(price, "NAO_ENCONTRADO");
        return {
          tipo: "PRECO",
          sku: price.sku,
          precoCentavos: Number(price.preco_centavos),
          versao: price.versao,
          ...(price.promocao_percentual === null
            ? {}
            : {
                promocao: {
                  percentual: price.promocao_percentual,
                  inicio: price.promocao_inicio!.toISOString(),
                  fim: price.promocao_fim!.toISOString(),
                },
              }),
        };
      }
      check(selector.tipo === "CUPOM");
      const [coupon] = await db.query<CouponRow>(
        'SELECT c.*,ARRAY(SELECT sku FROM precos.cupom_skus WHERE codigo=c.codigo ORDER BY sku COLLATE "C") AS skus FROM precos.cupons c WHERE codigo=$1',
        [text(selector.codigo, 100).toUpperCase()],
      );
      check(coupon, "NAO_ENCONTRADO");
      return {
        tipo: "CUPOM",
        codigo: coupon.codigo,
        percentual: coupon.percentual,
        inicio: coupon.inicio.toISOString(),
        fim: coupon.fim.toISOString(),
        versao: coupon.versao,
        ...(coupon.global ? {} : { skus: coupon.skus }),
      };
    },
  };
  return { api, admin, journal };
}

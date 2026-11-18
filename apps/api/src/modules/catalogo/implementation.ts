import {
  Clock,
  check,
  authorize,
  integer,
  text,
  page,
} from "../../../../../packages/kernel";
import { Database, lock } from "../../infrastructure/database";
import { Journal, journalDDL } from "../../infrastructure/events";
import { migrate } from "../../infrastructure/migrations";
import type {
  AdministracaoCatalogo,
  ICatalogo,
  Produto,
  ProdutoEntrada,
} from "./index";

const schema = `
CREATE SCHEMA IF NOT EXISTS catalogo;
CREATE TABLE IF NOT EXISTS catalogo.produtos (
  sku text PRIMARY KEY,
  nome text NOT NULL,
  marca text NOT NULL,
  descricao text NOT NULL,
  categoria text NOT NULL,
  imagem_url text NOT NULL,
  atributos jsonb NOT NULL CHECK (jsonb_typeof(atributos) = 'object'),
  peso_gramas integer NOT NULL CHECK (peso_gramas > 0),
  largura_mm integer NOT NULL CHECK (largura_mm > 0),
  altura_mm integer NOT NULL CHECK (altura_mm > 0),
  profundidade_mm integer NOT NULL CHECK (profundidade_mm > 0),
  ativo boolean NOT NULL,
  versao integer NOT NULL CHECK (versao > 0)
);
CREATE INDEX IF NOT EXISTS produtos_categoria_sku_idx ON catalogo.produtos(categoria,sku) WHERE ativo;
CREATE INDEX IF NOT EXISTS produtos_marca_sku_idx ON catalogo.produtos(marca,sku) WHERE ativo;
`;
const columns = `sku,nome,marca,descricao,categoria,imagem_url AS "imagemUrl",atributos,peso_gramas AS "pesoGramas",
  jsonb_build_object('largura',largura_mm,'altura',altura_mm,'profundidade',profundidade_mm) AS "dimensoesMm",ativo,versao`;

function imageUrl(value: string): string {
  const raw = text(value, 2048);
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    check(false);
  }
  check(!/[\u0000-\u0020\\]/.test(decoded));
  if (raw.startsWith("/")) {
    check(
      !decoded.startsWith("//") &&
        !decoded.includes("%") &&
        !decoded.split(/[/?#]/).includes(".."),
    );
    return raw;
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    check(false);
  }
  check(
    ["https:", "http:"].includes(parsed.protocol) &&
      !parsed.username &&
      !parsed.password,
  );
  return raw;
}

function validate(input: ProdutoEntrada): ProdutoEntrada {
  check(input && typeof input === "object" && typeof input.ativo === "boolean");
  check(input.dimensoesMm && typeof input.dimensoesMm === "object");
  check(
    input.atributos &&
      typeof input.atributos === "object" &&
      !Array.isArray(input.atributos),
  );
  check(Object.keys(input.atributos).length <= 100);
  if (input.versaoEsperada !== undefined)
    integer(input.versaoEsperada, 1, 2147483646);
  return {
    sku: text(input.sku, 100),
    nome: text(input.nome, 200),
    marca: text(input.marca, 100),
    descricao: text(input.descricao, 10000),
    categoria: text(input.categoria, 100),
    imagemUrl: imageUrl(input.imagemUrl),
    atributos: Object.fromEntries(
      Object.entries(input.atributos).map(([k, v]) => [
        text(k, 100),
        text(v, 2000),
      ]),
    ),
    pesoGramas: integer(input.pesoGramas, 1, 2147483647),
    dimensoesMm: {
      largura: integer(input.dimensoesMm.largura, 1, 2147483647),
      altura: integer(input.dimensoesMm.altura, 1, 2147483647),
      profundidade: integer(input.dimensoesMm.profundidade, 1, 2147483647),
    },
    ativo: input.ativo,
    ...(input.versaoEsperada === undefined
      ? {}
      : { versaoEsperada: input.versaoEsperada }),
  };
}

export async function initializeCatalogo(
  db: Database,
  clock: Clock,
): Promise<{ api: ICatalogo; admin: AdministracaoCatalogo; journal: Journal }> {
  await migrate(db, "catalogo", "001_initial", schema + journalDDL("catalogo"));
  const journal = new Journal(db, "catalogo", "M01", clock);
  const api: ICatalogo = {
    async salvarProduto(ctx, dados) {
      authorize(ctx, ["GESTOR"]);
      const d = validate(dados);
      return db.transaction(async (tx) => {
        await lock(tx, "catalogo:sku:" + d.sku);
        const existing = (
          await tx.query<{ versao: number }>(
            "SELECT versao FROM catalogo.produtos WHERE sku=$1 FOR UPDATE",
            [d.sku],
          )
        ).rows[0];
        check(
          existing
            ? existing.versao === d.versaoEsperada
            : d.versaoEsperada === undefined,
          "CONFLITO",
        );
        const version = (existing?.versao ?? 0) + 1;
        const result = await tx.query<Produto>(
          `INSERT INTO catalogo.produtos(sku,nome,marca,descricao,categoria,imagem_url,atributos,peso_gramas,largura_mm,altura_mm,profundidade_mm,ativo,versao)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
          ON CONFLICT(sku) DO UPDATE SET nome=EXCLUDED.nome,marca=EXCLUDED.marca,descricao=EXCLUDED.descricao,categoria=EXCLUDED.categoria,
            imagem_url=EXCLUDED.imagem_url,atributos=EXCLUDED.atributos,peso_gramas=EXCLUDED.peso_gramas,
            largura_mm=EXCLUDED.largura_mm,altura_mm=EXCLUDED.altura_mm,profundidade_mm=EXCLUDED.profundidade_mm,ativo=EXCLUDED.ativo,versao=EXCLUDED.versao
          RETURNING ${columns}`,
          [
            d.sku,
            d.nome,
            d.marca,
            d.descricao,
            d.categoria,
            d.imagemUrl,
            d.atributos,
            d.pesoGramas,
            d.dimensoesMm.largura,
            d.dimensoesMm.altura,
            d.dimensoesMm.profundidade,
            d.ativo,
            version,
          ],
        );
        const saved = result.rows[0]!;
        await journal.append(tx, "ProdutoAlterado", saved.sku, saved.versao, {
          ...saved,
        });
        return saved;
      });
    },
    async obterProduto(sku) {
      const result = await db.query<Produto>(
        `SELECT ${columns} FROM catalogo.produtos WHERE sku=$1 AND ativo`,
        [text(sku, 100)],
      );
      check(result[0], "NAO_ENCONTRADO");
      return result[0];
    },
    async listarProdutos(filtro, pagination) {
      check(filtro && typeof filtro === "object");
      check(pagination && typeof pagination === "object");
      const p = page(pagination);
      const offset = integer((p.numero - 1) * p.tamanho);
      const values: unknown[] = [];
      const conditions = ["ativo"];
      for (const key of ["categoria", "marca"] as const) {
        if (filtro[key] !== undefined) {
          check(typeof filtro[key] === "string" && filtro[key]!.length <= 100);
          values.push(filtro[key]);
          conditions.push(`${key}=$${values.length}`);
        }
      }
      const where = conditions.join(" AND ");
      return db.transaction(async (tx) => {
        await tx.query(
          "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
        );
        const count = await tx.query<{ total: string }>(
          `SELECT count(*) AS total FROM catalogo.produtos WHERE ${where}`,
          values,
        );
        const rows = await tx.query<Produto>(
          `SELECT ${columns} FROM catalogo.produtos WHERE ${where} ORDER BY sku COLLATE "C" LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
          [...values, p.tamanho, offset],
        );
        return {
          itens: rows.rows,
          total: Number(count.rows[0]!.total),
          pagina: { ...p },
        };
      });
    },
  };
  const admin: AdministracaoCatalogo = {
    async obterProduto(ctx, sku) {
      authorize(ctx, ["GESTOR"]);
      const [produto] = await db.query<Produto>(
        `SELECT ${columns} FROM catalogo.produtos WHERE sku=$1`,
        [text(sku, 100)],
      );
      check(produto, "NAO_ENCONTRADO");
      return produto;
    },
  };
  return { api, admin, journal };
}

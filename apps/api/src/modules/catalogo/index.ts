import {
  Clock,
  Context,
  Page,
  PageResult,
} from "../../../../../packages/kernel";
import { Database } from "../../infrastructure/database";
import { Journal } from "../../infrastructure/events";
import { initializeCatalogo } from "./implementation";

export interface ProdutoEntrada {
  sku: string;
  nome: string;
  marca: string;
  descricao: string;
  categoria: string;
  imagemUrl: string;
  atributos: Record<string, string>;
  pesoGramas: number;
  dimensoesMm: { largura: number; altura: number; profundidade: number };
  ativo: boolean;
  versaoEsperada?: number;
}
export interface Produto extends Omit<ProdutoEntrada, "versaoEsperada"> {
  versao: number;
}
export interface FiltroCatalogo {
  categoria?: string;
  marca?: string;
}
export interface ICatalogo {
  salvarProduto(ctx: Context, dados: ProdutoEntrada): Promise<Produto>;
  obterProduto(sku: string): Promise<Produto>;
  listarProdutos(
    filtro: FiltroCatalogo,
    pagina: Page,
  ): Promise<PageResult<Produto>>;
}
/** Technical administration seam; the public ICatalogo contract remains unchanged. */
export interface AdministracaoCatalogo {
  obterProduto(ctx: Context, sku: string): Promise<Produto>;
}
export async function createCatalogo(
  db: Database,
  clock: Clock,
): Promise<{ api: ICatalogo; admin: AdministracaoCatalogo; journal: Journal }> {
  return initializeCatalogo(db, clock);
}

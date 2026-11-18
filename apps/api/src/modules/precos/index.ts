import { Clock, Context, Item } from "../../../../../packages/kernel";
import { Database } from "../../infrastructure/database";
import { Journal } from "../../infrastructure/events";
import { ICatalogo } from "../catalogo";
import { initializePrecos } from "./implementation";

export interface Promocao {
  percentual: number;
  inicio: string;
  fim: string;
}
export type RegraPreco =
  | {
      tipo: "PRECO";
      sku: string;
      precoCentavos: number;
      promocao?: Promocao;
      versaoEsperada?: number;
    }
  | {
      tipo: "CUPOM";
      codigo: string;
      percentual: number;
      inicio: string;
      fim: string;
      skus?: string[];
      versaoEsperada?: number;
    };
export type RegraConfigurada = RegraPreco & { versao: number };
export interface LinhaPreco {
  sku: string;
  quantidade: number;
  precoUnitario: number;
  subtotal: number;
  desconto: number;
  total: number;
  percentual: number;
  regraVersao: number;
  regraAplicada: {
    tipo: "BASE" | "PROMOCAO" | "CUPOM";
    versao: number;
    codigo?: string;
  };
}
export interface CotacaoPreco {
  linhas: LinhaPreco[];
  totalCentavos: number;
  calculadaEm: string;
  validaAte: string;
  cupom?: { codigo: string; versao: number };
}
export interface IPrecos {
  configurarRegra(ctx: Context, regra: RegraPreco): Promise<RegraConfigurada>;
  /** instante is trusted server time, never a value accepted from the browser. */
  calcular(
    itens: Item[],
    cupom?: string,
    instante?: Date,
  ): Promise<CotacaoPreco>;
}
export type SeletorRegra =
  { tipo: "PRECO"; sku: string } | { tipo: "CUPOM"; codigo: string };
/** Technical administration seam; the public IPrecos contract remains unchanged. */
export interface AdministracaoPrecos {
  obterRegra(ctx: Context, selector: SeletorRegra): Promise<RegraConfigurada>;
}
export async function createPrecos(
  db: Database,
  clock: Clock,
  catalogo: ICatalogo,
): Promise<{ api: IPrecos; admin: AdministracaoPrecos; journal: Journal }> {
  return initializePrecos(db, clock, catalogo);
}

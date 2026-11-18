export type Produto = {
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
  versao: number;
};
export type ProdutoEntrada = Omit<Produto, "versao"> & {
  versaoEsperada?: number;
};
export type Sessao = {
  cliente: { id: string; nome: string; email: string };
  contexto: { actorId: string; roles: string[] };
  expiraEm: string;
  csrfToken: string;
};
export type Saldo = {
  sku: string;
  fisico: number;
  reservado: number;
  disponivel: number;
  versao: number;
};
export type Movimento = {
  sku: string;
  tipo: "ENTRADA" | "SAIDA";
  quantidade: number;
  justificativa: string;
};
export type LinhaPreco = {
  sku: string;
  quantidade: number;
  precoUnitario: number;
  subtotal: number;
  desconto: number;
  total: number;
  percentual: number;
  regraVersao: number;
};
export type Cotacao = {
  linhas: LinhaPreco[];
  totalCentavos: number;
  calculadaEm: string;
  validaAte: string;
};
export type Regra =
  | {
      tipo: "PRECO";
      sku: string;
      precoCentavos: number;
      promocao?: { percentual: number; inicio: string; fim: string };
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

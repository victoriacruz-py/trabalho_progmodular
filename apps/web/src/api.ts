import type {
  Cotacao,
  Movimento,
  Produto,
  ProdutoEntrada,
  Regra,
  Saldo,
  Sessao,
} from "./types";

export class ErroApi extends Error {
  constructor(
    message: string,
    public codigo: string,
    public status: number,
    public requestId?: string,
  ) {
    super(message);
  }
}

/** A interface concentra transporte, proteção de sessão e identidade das tentativas. */
export function criarCliente(transporte: typeof fetch = fetch) {
  let csrfToken: string | undefined;
  async function requisitar<T>(
    path: string,
    method = "GET",
    dados?: unknown,
    protegida = false,
    chave?: string,
  ): Promise<T> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (dados !== undefined) headers["Content-Type"] = "application/json";
    if (protegida && csrfToken) headers["X-CSRF-Token"] = csrfToken;
    if (chave) headers["Idempotency-Key"] = chave;
    let resposta: Response;
    try {
      resposta = await transporte(`/api${path}`, {
        method,
        headers,
        credentials: "include",
        ...(dados === undefined ? {} : { body: JSON.stringify(dados) }),
      });
    } catch {
      throw new ErroApi(
        "A conexão foi interrompida. Tente novamente para consultar o resultado.",
        "CONEXAO",
        0,
      );
    }
    if (!resposta.ok) {
      const erro = (await resposta.json().catch(() => ({}))) as {
        mensagem?: string;
        codigo?: string;
        requestId?: string;
      };
      throw new ErroApi(
        erro.mensagem ||
          "Não foi possível concluir a solicitação. Tente novamente.",
        erro.codigo || "HTTP",
        resposta.status,
        erro.requestId,
      );
    }
    if (resposta.status === 204) return undefined as T;
    return resposta.json() as Promise<T>;
  }
  return {
    definirToken(token?: string) {
      csrfToken = token;
    },
    sessao: async () => {
      const sessao = await requisitar<Sessao>("/sessoes/atual");
      csrfToken = sessao.csrfToken;
      return sessao;
    },
    entrar: async (email: string, senha: string) => {
      const sessao = await requisitar<Sessao>("/sessoes", "POST", {
        email,
        senha,
      });
      csrfToken = sessao.csrfToken;
      return sessao;
    },
    cadastrar: (dados: { nome: string; email: string; senha: string }) =>
      requisitar<Sessao["cliente"]>("/clientes", "POST", dados),
    sair: async () => {
      await requisitar<void>("/sessoes", "DELETE", undefined, true);
      csrfToken = undefined;
    },
    catalogo: (
      filtros: { categoria?: string; marca?: string; pagina?: number } = {},
    ) => {
      const busca = new URLSearchParams({
        pagina: String(filtros.pagina || 1),
        tamanho: "12",
      });
      if (filtros.categoria) busca.set("categoria", filtros.categoria);
      if (filtros.marca) busca.set("marca", filtros.marca);
      return requisitar<{
        itens: Produto[];
        total: number;
        pagina: { numero: number; tamanho: number };
      }>(`/catalogo?${busca}`);
    },
    produto: (sku: string) =>
      requisitar<Produto>(`/catalogo/${encodeURIComponent(sku)}`),
    produtoAdministrativo: (sku: string) =>
      requisitar<Produto>(`/gestao/catalogo/${encodeURIComponent(sku)}`),
    regraPreco: (sku: string) =>
      requisitar<Extract<Regra, { tipo: "PRECO" }> & { versao: number }>(
        `/gestao/precos/${encodeURIComponent(sku)}`,
      ),
    regraCupom: (codigo: string) =>
      requisitar<Extract<Regra, { tipo: "CUPOM" }> & { versao: number }>(
        `/gestao/cupons/${encodeURIComponent(codigo)}`,
      ),
    salvarProduto: (produto: ProdutoEntrada) =>
      requisitar<Produto>(
        `/catalogo/${encodeURIComponent(produto.sku)}`,
        "PUT",
        produto,
        true,
      ),
    cotar: (itens: { sku: string; quantidade: number }[], cupom?: string) =>
      requisitar<Cotacao>("/precos/cotacoes", "POST", {
        itens,
        ...(cupom ? { cupom } : {}),
      }),
    configurarRegra: (regra: Regra) =>
      requisitar<{ versao: number }>("/precos/regras", "POST", regra, true),
    saldo: (sku: string) =>
      requisitar<Saldo>(`/estoque/${encodeURIComponent(sku)}`),
    prepararMovimento: (movimento: Movimento) => {
      const chave = crypto.randomUUID();
      const dados = { ...movimento };
      return {
        executar: () =>
          requisitar<Saldo>("/estoque/movimentos", "POST", dados, true, chave),
      };
    },
  };
}

export const api = criarCliente();
export { moeda } from "./money";
export const mensagemErro = (erro: unknown) =>
  erro instanceof Error
    ? erro.message
    : "Não foi possível concluir a solicitação.";

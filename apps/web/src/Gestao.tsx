import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { api, mensagemErro, moeda } from "./api";
import { precoEmCentavos, precoParaInput } from "./money";
import type { Movimento, ProdutoEntrada, Saldo, Sessao } from "./types";
import { Aviso, Icone } from "./ui";

export function Gestao({
  sessao,
  mudou,
}: {
  sessao: Sessao;
  mudou: () => void;
}) {
  const gestor = sessao.contexto.roles.includes("GESTOR");
  const logistica = sessao.contexto.roles.includes("LOGISTICA");
  const [secao, setSecao] = useState(gestor ? "produtos" : "estoque");
  const secoes = [
    ...(gestor
      ? [
          { id: "produtos", nome: "Produtos" },
          { id: "precos", nome: "Preços e promoções" },
          { id: "cupons", nome: "Cupons" },
        ]
      : []),
    ...(logistica ? [{ id: "estoque", nome: "Estoque" }] : []),
  ];
  return (
    <section className="gestao container">
      <div className="titulo-secao">
        <div>
          <p className="texto-secundario">Seu espaço de trabalho</p>
          <h1>Gestão da loja</h1>
          <p>Uma oferta bem cuidada começa aqui.</p>
        </div>
        <span className="selo-gestao">
          <Icone nome="ajuste" /> Acesso da equipe
        </span>
      </div>
      <nav className="abas-gestao" aria-label="Áreas de gestão">
        {secoes.map((s) => (
          <button
            key={s.id}
            aria-pressed={secao === s.id}
            onClick={() => setSecao(s.id)}
          >
            {s.nome}
          </button>
        ))}
      </nav>
      <div className="painel-gestao">
        {secao === "produtos" && gestor && <EditorProduto mudou={mudou} />}
        {secao === "precos" && gestor && <EditorPreco mudou={mudou} />}
        {secao === "cupons" && gestor && <EditorCupom />}
        {secao === "estoque" && logistica && <EditorEstoque mudou={mudou} />}
      </div>
    </section>
  );
}

const produtoVazio: ProdutoEntrada = {
  sku: "",
  nome: "",
  marca: "",
  descricao: "",
  categoria: "Notebooks",
  imagemUrl: "/product-placeholder.svg",
  atributos: {},
  pesoGramas: 1000,
  dimensoesMm: { largura: 300, altura: 20, profundidade: 200 },
  ativo: true,
};

function localDateTime(iso: string): string {
  const date = new Date(iso),
    pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
function EditorProduto({ mudou }: { mudou: () => void }) {
  const [produto, setProduto] = useState<ProdutoEntrada>({ ...produtoVazio });
  const [atributos, setAtributos] = useState("");
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const definir = <K extends keyof ProdutoEntrada>(
    nome: K,
    valor: ProdutoEntrada[K],
  ) => setProduto((p) => ({ ...p, [nome]: valor }));
  async function carregar() {
    setErro("");
    setSucesso("");
    setOcupado(true);
    try {
      const p = await api.produtoAdministrativo(produto.sku.trim());
      const { versao, ...dados } = p;
      setProduto({ ...dados, versaoEsperada: versao });
      setAtributos(
        Object.entries(p.atributos)
          .map(([k, v]) => `${k}=${v}`)
          .join("\n"),
      );
      setSucesso(
        "Produto carregado. Revise os campos e salve suas alterações.",
      );
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setOcupado(false);
    }
  }
  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    setSucesso("");
    setOcupado(true);
    try {
      const campos: Record<string, string> = {};
      for (const linha of atributos.split("\n").filter((l) => l.trim())) {
        const separador = linha.indexOf("=");
        if (separador < 1 || !linha.slice(separador + 1).trim())
          throw new Error(
            "Escreva cada especificação no formato Nome=Valor, uma por linha.",
          );
        const nome = linha.slice(0, separador).trim();
        if (Object.hasOwn(campos, nome))
          throw new Error(`A especificação “${nome}” está repetida.`);
        Object.defineProperty(campos, nome, {
          value: linha.slice(separador + 1).trim(),
          enumerable: true,
        });
      }
      const p = await api.salvarProduto({
        ...produto,
        sku: produto.sku.trim(),
        atributos: campos,
      });
      const { versao, ...dados } = p;
      setProduto({ ...dados, versaoEsperada: versao });
      setSucesso("Produto salvo. A vitrine já pode consultar as alterações.");
      mudou();
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setOcupado(false);
    }
  }
  return (
    <>
      <div className="painel-intro">
        <h2>
          {produto.versaoEsperada ? "Editar produto" : "Cadastrar produto"}
        </h2>
        <p>
          Para editar um produto, informe sua referência e carregue os dados.
        </p>
      </div>
      <form className="formulario formulario-gestao" onSubmit={salvar}>
        <fieldset disabled={ocupado} className="campos-sem-borda">
          <div className="linha-busca">
            <label>
              Referência (SKU)
              <input
                value={produto.sku}
                maxLength={80}
                required
                onChange={(e) => {
                  setProduto({ ...produtoVazio, sku: e.target.value });
                  setAtributos("");
                  setSucesso("");
                }}
                autoComplete="off"
              />
            </label>
            <button
              className="botao botao-secundario"
              type="button"
              disabled={!produto.sku.trim()}
              onClick={carregar}
            >
              Carregar produto
            </button>
          </div>
          <div className="grade-formulario">
            <label>
              Nome do produto
              <input
                value={produto.nome}
                onChange={(e) => definir("nome", e.target.value)}
                required
                maxLength={200}
              />
            </label>
            <label>
              Marca
              <input
                value={produto.marca}
                onChange={(e) => definir("marca", e.target.value)}
                required
                maxLength={80}
              />
            </label>
            <label>
              Categoria
              <input
                value={produto.categoria}
                onChange={(e) => definir("categoria", e.target.value)}
                required
                maxLength={80}
                list="categorias-gestao"
              />
              <datalist id="categorias-gestao">
                <option>Notebooks</option>
                <option>Periféricos</option>
                <option>Áudio</option>
              </datalist>
            </label>
            <label>
              Imagem do produto
              <input
                required
                value={produto.imagemUrl}
                onChange={(e) => definir("imagemUrl", e.target.value)}
                placeholder="https:// ou caminho local"
                maxLength={2000}
              />
              <small>
                Endereço HTTPS ou caminho local da imagem. Uma ilustração padrão
                já está disponível.
              </small>
            </label>
          </div>
          <label>
            Descrição
            <textarea
              value={produto.descricao}
              onChange={(e) => definir("descricao", e.target.value)}
              rows={3}
              required
              maxLength={5000}
            />
          </label>
          <label>
            Especificações técnicas
            <textarea
              value={atributos}
              onChange={(e) => setAtributos(e.target.value)}
              rows={3}
              placeholder={"Memória=16 GB\nArmazenamento=512 GB SSD"}
            />
            <small>Uma por linha, no formato Nome=Valor.</small>
          </label>
          <div className="grade-formulario medidas">
            <label>
              Peso (g)
              <input
                type="number"
                min={1}
                step={1}
                required
                value={produto.pesoGramas}
                onChange={(e) => definir("pesoGramas", Number(e.target.value))}
              />
            </label>
            {(["largura", "altura", "profundidade"] as const).map((c) => (
              <label key={c}>
                {c === "largura"
                  ? "Largura"
                  : c === "altura"
                    ? "Altura"
                    : "Profundidade"}{" "}
                (mm)
                <input
                  type="number"
                  min={1}
                  step={1}
                  required
                  value={produto.dimensoesMm[c]}
                  onChange={(e) =>
                    definir("dimensoesMm", {
                      ...produto.dimensoesMm,
                      [c]: Number(e.target.value),
                    })
                  }
                />
              </label>
            ))}
          </div>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={produto.ativo}
              onChange={(e) => definir("ativo", e.target.checked)}
            />
            Exibir produto na vitrine
          </label>
        </fieldset>
        {erro && <Aviso erro>{erro}</Aviso>}
        {sucesso && <Aviso>{sucesso}</Aviso>}
        <div className="acoes-formulario">
          <button className="botao botao-primario" disabled={ocupado}>
            {ocupado ? "Aguarde…" : "Salvar produto"}
          </button>
          <button
            className="botao botao-secundario"
            type="button"
            disabled={ocupado}
            onClick={() => {
              setProduto({ ...produtoVazio });
              setAtributos("");
              setSucesso("");
              setErro("");
            }}
          >
            Novo produto
          </button>
        </div>
      </form>
    </>
  );
}

function EditorPreco({ mudou }: { mudou: () => void }) {
  const [sku, setSku] = useState("");
  const [valor, setValor] = useState("");
  const [versao, setVersao] = useState<number>();
  const [promocao, setPromocao] = useState(false);
  const [percentual, setPercentual] = useState("10");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [ocupado, setOcupado] = useState(false);
  async function carregar() {
    setErro("");
    setSucesso("");
    setOcupado(true);
    try {
      const regra = await api.regraPreco(sku.trim());
      setValor(precoParaInput(regra.precoCentavos));
      setVersao(regra.versao);
      setPromocao(!!regra.promocao);
      setPercentual(String(regra.promocao?.percentual ?? 10));
      setInicio(regra.promocao ? localDateTime(regra.promocao.inicio) : "");
      setFim(regra.promocao ? localDateTime(regra.promocao.fim) : "");
      setSucesso(
        "Preço e promoção carregados. Revise os dados antes de salvar.",
      );
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setOcupado(false);
    }
  }
  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    setSucesso("");
    setOcupado(true);
    try {
      if (promocao && new Date(fim) <= new Date(inicio))
        throw new Error("O fim da promoção precisa ser posterior ao início.");
      const centavos = precoEmCentavos(valor);
      const resultado = await api.configurarRegra({
        tipo: "PRECO",
        sku: sku.trim(),
        precoCentavos: centavos,
        ...(versao === undefined ? {} : { versaoEsperada: versao }),
        ...(promocao
          ? {
              promocao: {
                percentual: Number(percentual),
                inicio: new Date(inicio).toISOString(),
                fim: new Date(fim).toISOString(),
              },
            }
          : {}),
      });
      setVersao(resultado.versao);
      setSucesso(
        `Preço de ${moeda(centavos)} salvo${promocao ? " com a promoção informada" : " sem promoção"}.`,
      );
      mudou();
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setOcupado(false);
    }
  }
  return (
    <>
      <div className="painel-intro">
        <h2>Preços e promoções</h2>
        <p>
          Carregue o preço antes de alterar um produto existente. Promoções e
          cupons não se acumulam.
        </p>
      </div>
      <form onSubmit={salvar} className="formulario formulario-gestao">
        <fieldset className="campos-sem-borda" disabled={ocupado}>
          <div className="linha-busca">
            <label>
              Referência do produto (SKU)
              <input
                required
                value={sku}
                onChange={(e) => {
                  setSku(e.target.value);
                  setVersao(undefined);
                }}
                maxLength={80}
              />
            </label>
            <button
              className="botao botao-secundario"
              type="button"
              disabled={!sku.trim()}
              onClick={carregar}
            >
              Carregar preço
            </button>
          </div>
          <label>
            Preço-base (R$)
            <input
              type="text"
              inputMode="decimal"
              pattern="[0-9]+([.,][0-9]{1,2})?"
              maxLength={20}
              required
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="199,90"
            />
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={promocao}
              onChange={(e) => setPromocao(e.target.checked)}
            />
            Aplicar uma promoção
          </label>
          {promocao && (
            <div className="grade-formulario tres-colunas">
              <label>
                Desconto (%)
                <input
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  required
                  value={percentual}
                  onChange={(e) => setPercentual(e.target.value)}
                />
              </label>
              <label>
                Início da promoção
                <input
                  type="datetime-local"
                  step="1"
                  required
                  value={inicio}
                  onChange={(e) => setInicio(e.target.value)}
                />
              </label>
              <label>
                Fim da promoção
                <input
                  type="datetime-local"
                  step="1"
                  required
                  value={fim}
                  onChange={(e) => setFim(e.target.value)}
                />
              </label>
            </div>
          )}
          <p className="texto-secundario pequeno">
            Datas e horários no fuso do seu dispositivo:{" "}
            {Intl.DateTimeFormat().resolvedOptions().timeZone}.
          </p>
        </fieldset>
        {erro && <Aviso erro>{erro}</Aviso>}
        {sucesso && <Aviso>{sucesso}</Aviso>}
        <button className="botao botao-primario" disabled={ocupado}>
          {ocupado ? "Aguarde…" : "Salvar preço"}
        </button>
      </form>
    </>
  );
}

function EditorCupom() {
  const [codigo, setCodigo] = useState("");
  const [percentual, setPercentual] = useState("10");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [skus, setSkus] = useState("");
  const [versao, setVersao] = useState<number>();
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [ocupado, setOcupado] = useState(false);
  async function carregar() {
    setErro("");
    setSucesso("");
    setOcupado(true);
    try {
      const regra = await api.regraCupom(codigo.trim());
      setCodigo(regra.codigo);
      setPercentual(String(regra.percentual));
      setInicio(localDateTime(regra.inicio));
      setFim(localDateTime(regra.fim));
      setSkus(regra.skus?.join(", ") ?? "");
      setVersao(regra.versao);
      setSucesso("Cupom carregado. Revise os dados antes de salvar.");
    } catch (error) {
      setErro(mensagemErro(error));
    } finally {
      setOcupado(false);
    }
  }
  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    setSucesso("");
    setOcupado(true);
    try {
      if (new Date(fim) <= new Date(inicio))
        throw new Error("O fim do cupom precisa ser posterior ao início.");
      const lista = [
        ...new Set(
          skus
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        ),
      ];
      const resultado = await api.configurarRegra({
        tipo: "CUPOM",
        codigo: codigo.trim(),
        percentual: Number(percentual),
        inicio: new Date(inicio).toISOString(),
        fim: new Date(fim).toISOString(),
        ...(lista.length ? { skus: lista } : {}),
        ...(versao === undefined ? {} : { versaoEsperada: versao }),
      });
      setVersao(resultado.versao);
      setSucesso(
        "Cupom salvo. O maior desconto elegível será aplicado a cada item.",
      );
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setOcupado(false);
    }
  }
  return (
    <>
      <div className="painel-intro">
        <h2>Cupom promocional</h2>
        <p>
          Crie um cupom ou informe seu código e carregue a regra para editar.
        </p>
      </div>
      <form className="formulario formulario-gestao" onSubmit={salvar}>
        <fieldset className="campos-sem-borda" disabled={ocupado}>
          <button
            className="botao botao-secundario"
            type="button"
            disabled={!codigo.trim()}
            onClick={carregar}
          >
            Carregar cupom
          </button>
          <div className="grade-formulario">
            <label>
              Código do cupom
              <input
                required
                maxLength={80}
                value={codigo}
                onChange={(e) => {
                  setCodigo(e.target.value);
                  setVersao(undefined);
                }}
                autoComplete="off"
              />
            </label>
            <label>
              Desconto do cupom (%)
              <input
                type="number"
                min={1}
                max={100}
                step={1}
                value={percentual}
                onChange={(e) => setPercentual(e.target.value)}
                required
              />
            </label>
            <label>
              Início do cupom
              <input
                type="datetime-local"
                step="1"
                value={inicio}
                onChange={(e) => setInicio(e.target.value)}
                required
              />
            </label>
            <label>
              Fim do cupom
              <input
                type="datetime-local"
                step="1"
                value={fim}
                onChange={(e) => setFim(e.target.value)}
                required
              />
            </label>
          </div>
          <label>
            Produtos elegíveis (opcional)
            <input
              value={skus}
              onChange={(e) => setSkus(e.target.value)}
              placeholder="SKU-001, SKU-002"
            />
            <small>
              Referências separadas por vírgula. Deixe vazio para todos os
              produtos.
            </small>
          </label>
          <p className="texto-secundario pequeno">
            Horários no fuso do dispositivo:{" "}
            {Intl.DateTimeFormat().resolvedOptions().timeZone}. Após salvar,
            você pode ajustar esta mesma regra nesta tela.
          </p>
        </fieldset>
        {erro && <Aviso erro>{erro}</Aviso>}
        {sucesso && <Aviso>{sucesso}</Aviso>}
        <button className="botao botao-primario" disabled={ocupado}>
          {ocupado ? "Aguarde…" : "Salvar cupom"}
        </button>
      </form>
    </>
  );
}

function EditorEstoque({ mudou }: { mudou: () => void }) {
  const [sku, setSku] = useState("");
  const [tipo, setTipo] = useState<"ENTRADA" | "SAIDA">("ENTRADA");
  const [quantidade, setQuantidade] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [saldo, setSaldo] = useState<Saldo | null>(null);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const tentativa = useRef<{
    conteudo: string;
    operacao: ReturnType<typeof api.prepararMovimento>;
  } | null>(null);
  async function consultar() {
    setErro("");
    setSucesso("");
    setOcupado(true);
    try {
      setSaldo(await api.saldo(sku.trim()));
    } catch (e) {
      setSaldo(null);
      setErro(mensagemErro(e));
    } finally {
      setOcupado(false);
    }
  }
  async function movimentar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    setSucesso("");
    setOcupado(true);
    const dados: Movimento = {
      sku: sku.trim(),
      tipo,
      quantidade: Number(quantidade),
      justificativa: justificativa.trim(),
    };
    const conteudo = JSON.stringify(dados);
    if (!tentativa.current || tentativa.current.conteudo !== conteudo)
      tentativa.current = { conteudo, operacao: api.prepararMovimento(dados) };
    try {
      await tentativa.current.operacao.executar();
      tentativa.current = null;
      setQuantidade("");
      setJustificativa("");
      mudou();
      setSucesso("Movimentação registrada.");
      try {
        setSaldo(await api.saldo(dados.sku));
      } catch {
        setSaldo(null);
        setSucesso(
          "Movimentação registrada. Consulte o saldo novamente para atualizar os números.",
        );
      }
    } catch (e) {
      setErro(
        `${mensagemErro(e)} Se repetir os mesmos dados, a movimentação não será duplicada.`,
      );
    } finally {
      setOcupado(false);
    }
  }
  return (
    <>
      <div className="painel-intro">
        <h2>Estoque e inventário</h2>
        <p>
          Consulte a disponibilidade e registre entradas ou saídas com uma
          justificativa.
        </p>
      </div>
      <form onSubmit={movimentar} className="formulario formulario-gestao">
        <fieldset disabled={ocupado} className="campos-sem-borda">
          <div className="linha-busca">
            <label>
              Referência de estoque (SKU)
              <input
                required
                maxLength={80}
                value={sku}
                onChange={(e) => {
                  setSku(e.target.value);
                  setSaldo(null);
                }}
              />
            </label>
            <button
              className="botao botao-secundario"
              type="button"
              disabled={!sku.trim()}
              onClick={consultar}
            >
              Consultar estoque
            </button>
          </div>
          {saldo && (
            <dl className="saldo-painel">
              <div>
                <dt>Físico vendável</dt>
                <dd>{saldo.fisico}</dd>
              </div>
              <div>
                <dt>Reservado</dt>
                <dd>{saldo.reservado}</dd>
              </div>
              <div>
                <dt>Disponível</dt>
                <dd>{saldo.disponivel}</dd>
              </div>
            </dl>
          )}
          <div className="grade-formulario">
            <label>
              Tipo de movimentação
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as "ENTRADA" | "SAIDA")}
              >
                <option value="ENTRADA">Entrada de unidades</option>
                <option value="SAIDA">Saída de unidades</option>
              </select>
            </label>
            <label>
              Quantidade de unidades
              <input
                type="number"
                min={1}
                step={1}
                required
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
              />
            </label>
          </div>
          <label>
            Justificativa
            <textarea
              required
              minLength={3}
              maxLength={500}
              rows={3}
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              placeholder="Ex.: recebimento de mercadoria, conferência do lote…"
            />
          </label>
        </fieldset>
        {erro && <Aviso erro>{erro}</Aviso>}
        {sucesso && <Aviso>{sucesso}</Aviso>}
        <button className="botao botao-primario" disabled={ocupado}>
          {ocupado ? "Aguarde…" : "Registrar movimentação"}
        </button>
      </form>
    </>
  );
}

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, mensagemErro, moeda } from "./api";
import type { Produto } from "./types";
import { Aviso, Icone, Modal, ProdutoArte } from "./ui";
import { useOferta } from "./useOferta";

export function Vitrine({ revisao, onAdicionar }: { revisao: number; onAdicionar?: (sku: string) => void }) {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [total, setTotal] = useState(0);
  const [categoria, setCategoria] = useState("");
  const [marcaEntrada, setMarcaEntrada] = useState("");
  const [marca, setMarca] = useState("");
  const [pagina, setPagina] = useState(1);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    let ativa = true;
    setCarregando(true);
    setErro("");
    api
      .catalogo({ categoria, marca, pagina })
      .then((resultado) => {
        if (!ativa) return;
        setProdutos(resultado.itens);
        setTotal(resultado.total);
        setCarregando(false);
      })
      .catch((e) => {
        if (ativa) {
          setErro(mensagemErro(e));
          setCarregando(false);
        }
      });
    return () => {
      ativa = false;
    };
  }, [categoria, marca, pagina, revisao, tentativa]);
  function filtrar(e: FormEvent) {
    e.preventDefault();
    setMarca(marcaEntrada.trim());
    setPagina(1);
  }
  function limpar() {
    setCategoria("");
    setMarca("");
    setMarcaEntrada("");
    setPagina(1);
  }
  const categorias = Array.from(
    new Set(
      [
        "Notebooks",
        "Periféricos",
        "Áudio",
        ...produtos.map((p) => p.categoria),
        categoria,
      ].filter(Boolean),
    ),
  ).sort();
  return (
    <>
      <section className="hero container" aria-labelledby="titulo-vitrine">
        <div className="hero-texto">
          <span className="hero-identificador">
            <span className="ponto-azul" /> Sua próxima conexão
          </span>
          <h1 id="titulo-vitrine">
            Boas ideias.
            <br />
            Melhores ferramentas.
          </h1>
          <p>
            Encontre a tecnologia que acompanha seu ritmo. Para criar, trabalhar
            ou aproveitar uma boa pausa.
          </p>
          <a href="#catalogo" className="botao botao-primario">
            Explorar produtos <Icone nome="seta" />
          </a>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <span className="orbita orbita-1" />
          <span className="orbita orbita-2" />
          <div className="hero-arte">
            <ProdutoArte grande />
          </div>
          <div className="hero-nota">
            <span className="hero-nota-icone">✦</span>
            <div>
              <strong>Seu espaço, suas ideias.</strong>
              <span>Encontre novas possibilidades.</span>
            </div>
          </div>
        </div>
      </section>
      <section
        id="catalogo"
        className="catalogo container"
        aria-labelledby="titulo-catalogo"
      >
        <div className="titulo-secao">
          <div>
            <h2 id="titulo-catalogo">Explore a seleção</h2>
            <p>O que faz sentido para o seu dia?</p>
          </div>
          <span className="contador" role="status">
            {carregando
              ? "Carregando seleção…"
              : erro
                ? "Seleção indisponível"
                : `${total} ${total === 1 ? "produto" : "produtos"}`}
          </span>
        </div>
        <div className="catalogo-layout">
          <aside className="filtros" aria-label="Filtrar produtos">
            <div className="filtros-titulo">
              <h3>Refine sua escolha</h3>
              <Icone nome="ajuste" />
            </div>
            <fieldset>
              <legend>Categoria</legend>
              {["", ...categorias].map((c) => (
                <label className="filtro-opcao" key={c}>
                  <input
                    type="radio"
                    name="categoria"
                    checked={categoria === c}
                    onChange={() => {
                      setCategoria(c);
                      setPagina(1);
                    }}
                  />
                  <span>{c || "Todas as categorias"}</span>
                </label>
              ))}
            </fieldset>
            <form onSubmit={filtrar} className="formulario">
              <label>
                Marca
                <input
                  list="marcas-conhecidas"
                  value={marcaEntrada}
                  onChange={(e) => setMarcaEntrada(e.target.value)}
                  placeholder="Todas as marcas"
                  maxLength={80}
                />
                <datalist id="marcas-conhecidas">
                  <option>Aurora</option>
                  <option>Vector</option>
                  <option>Nexo</option>
                  {Array.from(new Set(produtos.map((p) => p.marca)))
                    .filter((m) => !["Aurora", "Vector", "Nexo"].includes(m))
                    .map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                </datalist>
              </label>
              <button className="botao botao-secundario" type="submit">
                Aplicar filtro
              </button>
            </form>
            {(categoria || marca) && (
              <button className="botao-texto limpar-filtros" onClick={limpar}>
                Limpar filtros
              </button>
            )}
            <p className="nota-filtros">
              Preços e disponibilidade consultados diretamente na loja.
            </p>
          </aside>
          <div className="produtos-area" aria-busy={carregando}>
            {erro ? (
              <div className="estado-vazio">
                <h3>Vamos tentar de novo?</h3>
                <Aviso erro>{erro}</Aviso>
                <button
                  className="botao botao-secundario"
                  onClick={() => setTentativa((v) => v + 1)}
                >
                  Recarregar produtos
                </button>
              </div>
            ) : carregando ? (
              <div className="produtos-grid" aria-label="Carregando produtos">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="esqueleto-produto" aria-hidden="true">
                    <div />
                    <span />
                    <span />
                  </div>
                ))}
              </div>
            ) : produtos.length === 0 ? (
              <div className="estado-vazio">
                <Icone nome="caixa" />
                <h3>
                  {categoria || marca
                    ? "Nenhum produto com esses filtros"
                    : "Nossa seleção está sendo preparada"}
                </h3>
                <p>
                  {categoria || marca
                    ? "Experimente outra categoria ou remova o filtro de marca."
                    : "Volte em breve para conhecer os produtos disponíveis."}
                </p>
                {(categoria || marca) && (
                  <button className="botao botao-secundario" onClick={limpar}>
                    Ver todos os produtos
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="produtos-grid">
                  {produtos.map((produto) => (
                    <CartaoProduto
                      key={produto.sku}
                      produto={produto}
                      revisao={revisao}
                      abrir={() => setSelecionado(produto.sku)}
                    />
                  ))}
                </div>
                <nav className="paginacao" aria-label="Páginas do catálogo">
                  <button
                    className="botao botao-secundario"
                    disabled={pagina <= 1}
                    onClick={() => setPagina((p) => p - 1)}
                  >
                    Anterior
                  </button>
                  <span>
                    Página {pagina} de {Math.max(1, Math.ceil(total / 12))}
                  </span>
                  <button
                    className="botao botao-secundario"
                    disabled={pagina * 12 >= total}
                    onClick={() => setPagina((p) => p + 1)}
                  >
                    Próxima
                  </button>
                </nav>
              </>
            )}
          </div>
        </div>
      </section>
      {selecionado && (
        <DetalheProduto sku={selecionado} fechar={() => setSelecionado(null)} />
      )}
    </>
  );
}

function ImagemProduto({ produto }: { produto: Produto }) {
  const [falhou, setFalhou] = useState(false);
  return produto.imagemUrl &&
    produto.imagemUrl !== "/product-placeholder.svg" &&
    !falhou ? (
    <img
      src={produto.imagemUrl}
      alt={produto.nome}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFalhou(true)}
    />
  ) : (
    <ProdutoArte categoria={produto.categoria} />
  );
}

function CartaoProduto({
  produto,
  revisao,
  abrir,
}: {
  produto: Produto;
  revisao: number;
  abrir: () => void;
}) {
  const oferta = useOferta(produto.sku, revisao);
  return (
    <article className="cartao-produto">
      <button
        className="produto-imagem"
        onClick={abrir}
        aria-label={`Ver ${produto.nome}`}
      >
        <ImagemProduto produto={produto} />
        {oferta?.preco && oferta.preco.desconto > 0 && (
          <span className="etiqueta-desconto">−{oferta.preco.percentual}%</span>
        )}
      </button>
      <div className="produto-info">
        <span className="produto-marca">
          {produto.marca} <span aria-hidden="true">/</span> {produto.categoria}
        </span>
        <h3>
          <button onClick={abrir}>{produto.nome}</button>
        </h3>
        <p className="produto-descricao">{produto.descricao}</p>
        <div className="produto-preco">
          {oferta.consultandoPreco ? (
            <span className="texto-secundario">Consultando preço…</span>
          ) : oferta.preco ? (
            <>
              {oferta.preco.desconto > 0 && (
                <s>{moeda(oferta.preco.subtotal)}</s>
              )}
              <strong>{moeda(oferta.preco.total)}</strong>
            </>
          ) : (
            <span className="preco-indisponivel">Preço indisponível</span>
          )}
        </div>
        <div className="produto-base">
          <span
            className={`disponibilidade ${oferta?.saldo && oferta.saldo.disponivel > 0 ? "em-estoque" : ""}`}
          >
            {oferta.consultandoEstoque
              ? "Consultando estoque…"
              : !oferta.saldo
                ? "Estoque indisponível"
                : oferta.saldo.disponivel > 0
                  ? "Em estoque"
                  : "Sem estoque"}
          </span>
          <button
            onClick={abrir}
            className="botao-detalhe"
            aria-label={`Detalhes de ${produto.nome}`}
          >
            <Icone nome="seta" />
          </button>
        </div>
      </div>
    </article>
  );
}

function DetalheProduto({ sku, fechar }: { sku: string; fechar: () => void }) {
  const [produto, setProduto] = useState<Produto | null>(null);
  const oferta = useOferta(sku);
  const [erro, setErro] = useState("");
  useEffect(() => {
    let ativa = true;
    api
      .produto(sku)
      .then((p) => {
        if (ativa) setProduto(p);
      })
      .catch((e) => {
        if (ativa) setErro(mensagemErro(e));
      });
    return () => {
      ativa = false;
    };
  }, [sku]);
  return (
    <Modal
      titulo={produto?.nome || "Detalhes do produto"}
      fechar={fechar}
      ampla
    >
      {erro ? (
        <Aviso erro>{erro}</Aviso>
      ) : !produto ? (
        <p className="carregando" role="status">
          Carregando produto…
        </p>
      ) : (
        <div className="detalhe-produto">
          <div className="detalhe-imagem">
            <ImagemProduto produto={produto} />
          </div>
          <div className="detalhe-resumo">
            <p className="produto-marca">
              {produto.marca} / {produto.categoria}
            </p>
            <p>{produto.descricao}</p>
            <div className="detalhe-preco">
              {oferta.consultandoPreco ? (
                "Consultando preço…"
              ) : oferta.preco ? (
                <>
                  {oferta.preco.desconto > 0 && (
                    <s>{moeda(oferta.preco.subtotal)}</s>
                  )}
                  <strong>{moeda(oferta.preco.total)}</strong>
                </>
              ) : (
                "Preço indisponível"
              )}
            </div>
            <p className="disponibilidade">
              {oferta.consultandoEstoque
                ? "Consultando estoque…"
                : !oferta.saldo
                  ? "Não foi possível consultar o estoque."
                  : oferta.saldo.disponivel > 0
                    ? `${oferta.saldo.disponivel} ${oferta.saldo.disponivel === 1 ? "unidade disponível" : "unidades disponíveis"}`
                    : "Produto sem estoque no momento."}
            </p>
            {onAdicionar && (
              <button
                type="button"
                className="botao botao-primario"
                style={{ marginTop: "0.75rem" }}
                disabled={!oferta.saldo || oferta.saldo.disponivel <= 0}
                onClick={() => {
                  onAdicionar(produto.sku);
                  setSelecionado(null);
                }}
              >
                Adicionar ao carrinho
              </button>
            )}
          </div>
          <div className="ficha-tecnica">
            <h3>Conheça os detalhes</h3>
            <dl>
              {Object.entries(produto.atributos).map(([nome, valor]) => (
                <div key={nome}>
                  <dt>{nome}</dt>
                  <dd>{valor}</dd>
                </div>
              ))}
              <div>
                <dt>Peso</dt>
                <dd>{produto.pesoGramas} g</dd>
              </div>
              <div>
                <dt>Dimensões (L × A × P)</dt>
                <dd>
                  {produto.dimensoesMm.largura} × {produto.dimensoesMm.altura} ×{" "}
                  {produto.dimensoesMm.profundidade} mm
                </dd>
              </div>
              <div>
                <dt>Referência</dt>
                <dd>{produto.sku}</dd>
              </div>
            </dl>
          </div>
        </div>
      )}
    </Modal>
  );
}

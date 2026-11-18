import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, ErroApi, mensagemErro } from "./api";
import type { Sessao } from "./types";
import { Aviso, Icone, Modal } from "./ui";
import { Vitrine } from "./Vitrine";
import { Gestao } from "./Gestao";

export function App() {
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [carregandoSessao, setCarregandoSessao] = useState(true);
  const [tela, setTela] = useState<"vitrine" | "gestao">("vitrine");
  const [contaAberta, setContaAberta] = useState(false);
  const [erro, setErro] = useState("");
  const [saindo, setSaindo] = useState(false);
  const [revisao, setRevisao] = useState(0);
  useEffect(() => {
    let ativa = true;
    api
      .sessao()
      .then((s) => {
        if (ativa) setSessao(s);
      })
      .catch((e) => {
        if (ativa && !(e instanceof ErroApi && e.status === 401))
          setErro(
            "Não foi possível consultar sua sessão. Atualize a página para tentar novamente.",
          );
      })
      .finally(() => {
        if (ativa) setCarregandoSessao(false);
      });
    return () => {
      ativa = false;
    };
  }, []);
  useEffect(() => {
    if (!sessao) return;
    const tempoRestante = new Date(sessao.expiraEm).getTime() - Date.now();
    const timer = window.setTimeout(
      () => {
        api.definirToken();
        setSessao(null);
        setTela("vitrine");
        setContaAberta(false);
        setErro("Sua sessão expirou. Entre novamente para continuar.");
      },
      Math.max(0, tempoRestante),
    );
    return () => window.clearTimeout(timer);
  }, [sessao]);
  function autenticar(s: Sessao) {
    setSessao(s);
    setContaAberta(false);
    setErro("");
  }
  async function sair() {
    setSaindo(true);
    setErro("");
    try {
      await api.sair();
      setSessao(null);
      setTela("vitrine");
      setContaAberta(false);
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setSaindo(false);
    }
  }
  const gestor = sessao?.contexto.roles.includes("GESTOR") || false;
  const logistica = sessao?.contexto.roles.includes("LOGISTICA") || false;
  return (
    <>
      <a className="pular-conteudo" href="#conteudo">
        Ir para o conteúdo
      </a>
      <div className="barra-topo">
        <span>Tecnologia para trabalhar, criar e viver.</span>
        <span>Conheça a nossa seleção</span>
      </div>
      <header className="cabecalho">
        <div className="cabecalho-interno">
          <a
            className="marca"
            href="#"
            aria-label="Nexo Tech, início"
            onClick={(e) => {
              e.preventDefault();
              setTela("vitrine");
            }}
          >
            <span className="simbolo-marca" aria-hidden="true">
              n
            </span>
            <span>
              nexo<span className="marca-tech">tech</span>
            </span>
          </a>
          <nav aria-label="Navegação principal">
            <button
              className={tela === "vitrine" ? "nav-ativo" : ""}
              onClick={() => setTela("vitrine")}
            >
              Catálogo
            </button>
            {(gestor || logistica) && (
              <button
                className={tela === "gestao" ? "nav-ativo" : ""}
                onClick={() => setTela("gestao")}
              >
                Gestão da loja
              </button>
            )}
          </nav>
          <button
            className="botao-conta"
            disabled={carregandoSessao}
            onClick={() => setContaAberta(true)}
          >
            <Icone nome="pessoa" />
            <span>
              {carregandoSessao
                ? "Carregando conta…"
                : sessao
                  ? sessao.cliente.nome.split(" ")[0]
                  : "Entrar ou cadastrar"}
            </span>
          </button>
        </div>
      </header>
      <main id="conteudo" tabIndex={-1}>
        {erro && (
          <div className="container aviso-global">
            <Aviso erro>{erro}</Aviso>
          </div>
        )}
        {tela === "gestao" && sessao && (gestor || logistica) ? (
          <Gestao sessao={sessao} mudou={() => setRevisao((v) => v + 1)} />
        ) : (
          <Vitrine revisao={revisao} />
        )}
      </main>
      <footer className="rodape container">
        <div className="rodape-marca">
          <strong>nexo tech</strong>
          <span>O próximo passo do seu dia.</span>
        </div>
        <p>Explore a seleção. As compras serão liberadas em breve.</p>
        <span>Feito para conectar.</span>
      </footer>
      {contaAberta && (
        <Modal
          titulo={sessao ? "Sua conta" : "Bom ter você aqui"}
          fechar={() => setContaAberta(false)}
        >
          {sessao ? (
            <div className="conta-resumo">
              <span className="avatar">{sessao.cliente.nome[0]}</span>
              <h3>{sessao.cliente.nome}</h3>
              <p>{sessao.cliente.email}</p>
              <p className="texto-secundario">
                Sua sessão expira às{" "}
                {new Date(sessao.expiraEm).toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                .
              </p>
              {erro && <Aviso erro>{erro}</Aviso>}
              <button
                className="botao botao-secundario"
                disabled={saindo}
                onClick={sair}
              >
                <Icone nome="sair" />
                {saindo ? "Saindo…" : "Sair da conta"}
              </button>
            </div>
          ) : (
            <Autenticacao autenticar={autenticar} />
          )}
        </Modal>
      )}
    </>
  );
}

function Autenticacao({
  autenticar,
}: {
  autenticar: (sessao: Sessao) => void;
}) {
  const [modo, setModo] = useState<"entrar" | "cadastrar">("entrar");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [ocupado, setOcupado] = useState(false);
  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro("");
    setSucesso("");
    setOcupado(true);
    try {
      if (modo === "cadastrar") {
        await api.cadastrar({ nome, email, senha });
        setModo("entrar");
        setSenha("");
        setSucesso("Conta criada. Entre com seu e-mail e senha.");
      } else autenticar(await api.entrar(email, senha));
    } catch (falha) {
      setErro(mensagemErro(falha));
    } finally {
      setOcupado(false);
    }
  }
  return (
    <div className="autenticacao">
      <div className="seletor-modo" aria-label="Acesso à conta">
        <button
          aria-pressed={modo === "entrar"}
          disabled={ocupado}
          onClick={() => {
            setModo("entrar");
            setErro("");
            setSucesso("");
          }}
        >
          Entrar
        </button>
        <button
          aria-pressed={modo === "cadastrar"}
          disabled={ocupado}
          onClick={() => {
            setModo("cadastrar");
            setErro("");
            setSucesso("");
          }}
        >
          Criar conta
        </button>
      </div>
      <p className="texto-secundario">
        {modo === "entrar"
          ? "Acesse sua conta para continuar."
          : "Preencha seus dados para fazer parte da Nexo."}
      </p>
      <form onSubmit={enviar} className="formulario">
        {modo === "cadastrar" && (
          <label>
            Nome completo
            <input
              name="nome"
              autoComplete="name"
              required
              maxLength={120}
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </label>
        )}
        <label>
          E-mail
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label htmlFor="senha-conta">
          Senha
          <input
            id="senha-conta"
            name="senha"
            type="password"
            aria-describedby={modo === "cadastrar" ? "senha-ajuda" : undefined}
            autoComplete={
              modo === "entrar" ? "current-password" : "new-password"
            }
            required
            minLength={modo === "cadastrar" ? 12 : undefined}
            maxLength={1024}
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
          />
        </label>
        {modo === "cadastrar" && (
          <small id="senha-ajuda">Use pelo menos 12 caracteres.</small>
        )}
        {erro && <Aviso erro>{erro}</Aviso>}
        {sucesso && <Aviso>{sucesso}</Aviso>}
        <button className="botao botao-primario botao-largo" disabled={ocupado}>
          {ocupado
            ? "Aguarde…"
            : modo === "entrar"
              ? "Entrar na conta"
              : "Criar minha conta"}
        </button>
      </form>
    </div>
  );
}

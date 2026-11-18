import React, { useState } from "react";
import { moeda as formatarCentavos } from "./money";

interface ItemCarrinho {
  sku: string;
  nome: string;
  quantidade: number;
  precoUnitarioCentavos: number;
  descontoCentavos: number;
  subtotalCentavos: number;
  disponivel: boolean;
  motivoIndisponibilidade?: string;
}

interface Carrinho {
  id: string;
  revisao: number;
  itens: ItemCarrinho[];
  subtotalCentavos: number;
}

interface OpcaoFrete {
  id: string;
  servico: string;
  valorCentavos: number;
  prazoDiasUteis: number;
  totalComFreteCentavos: number;
}

interface ResumoCheckout {
  id: string;
  subtotalItensCentavos: number;
  descontoTotalCentavos: number;
  opcoesFrete: OpcaoFrete[];
  validoAte: string;
}

export function CarrinhoCheckout({ token }: { token: string }) {
  const [carrinho, setCarrinho] = useState<Carrinho | null>(null);
  const [skuInput, setSkuInput] = useState("");
  const [qtdInput, setQtdInput] = useState(1);
  const [cupom, setCupom] = useState("");
  const [endereco, setEndereco] = useState({
    destinatario: "",
    logradouro: "",
    numero: "",
    cidade: "Rio de Janeiro",
    uf: "RJ",
    cep: "",
  });
  const [simulacao, setSimulacao] = useState<ResumoCheckout | null>(null);
  const [freteSelecionado, setFreteSelecionado] = useState("");
  const [meioPagamento, setMeioPagamento] = useState<"PIX" | "CARTAO_TOKENIZADO">("PIX");
  const [tokenCartao, setTokenCartao] = useState("tok_visa_teste");
  const [resultadoPedido, setResultadoPedido] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  async function alterarItem(sku: string, quantidade: number) {
    setErro(null);
    setCarregando(true);
    try {
      const resp = await fetch("/api/carrinho/itens", {
        method: "POST",
        headers,
        body: JSON.stringify({
          carrinhoId: carrinho?.id,
          sku,
          quantidade,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.mensagem || "Erro ao atualizar carrinho");
      setCarrinho(data);
      setSimulacao(null);
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }

  async function simularCheckout(e: React.FormEvent) {
    e.preventDefault();
    if (!carrinho) return;
    setErro(null);
    setCarregando(true);
    try {
      const resp = await fetch("/api/checkout/simular", {
        method: "POST",
        headers,
        body: JSON.stringify({
          carrinhoId: carrinho.id,
          endereco,
          cupom: cupom || undefined,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.mensagem || "Erro na simulação");
      setSimulacao(data);
      if (data.opcoesFrete?.length > 0) {
        setFreteSelecionado(data.opcoesFrete[0].id);
      }
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }

  async function confirmarCompra() {
    if (!simulacao || !freteSelecionado) return;
    setErro(null);
    setCarregando(true);
    try {
      const chaveIdempotencia = `web_${simulacao.id}_${freteSelecionado}`;
      const meio =
        meioPagamento === "PIX"
          ? { tipo: "PIX" }
          : { tipo: "CARTAO_TOKENIZADO", tokenCartao };

      const resp = await fetch("/api/checkout/confirmar", {
        method: "POST",
        headers: {
          ...headers,
          "Idempotency-Key": chaveIdempotencia,
        },
        body: JSON.stringify({
          simulacaoId: simulacao.id,
          opcaoFreteId: freteSelecionado,
          meio,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.mensagem || "Erro ao confirmar compra");
      setResultadoPedido(data);
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }

  return (
    <section className="card">
      <h2>Carrinho de Compras (M02) e Checkout (M03)</h2>

      {erro && (
        <div role="alert" style={{ color: "#b91c1c", marginBottom: "1rem" }}>
          {erro}
        </div>
      )}

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        <input
          placeholder="SKU (ex: NOTE-01)"
          value={skuInput}
          onChange={(e) => setSkuInput(e.target.value)}
        />
        <input
          type="number"
          min={0}
          max={99}
          value={qtdInput}
          onChange={(e) => setQtdInput(Number(e.target.value))}
        />
        <button
          type="button"
          disabled={carregando || !skuInput}
          onClick={() => alterarItem(skuInput.trim(), qtdInput)}
        >
          Definir Item
        </button>
      </div>

      {carrinho && (
        <div>
          <p>
            <strong>Revisão do Carrinho:</strong> {carrinho.revisao} |{" "}
            <strong>Subtotal:</strong> {formatarCentavos(carrinho.subtotalCentavos)}
          </p>
          <ul>
            {carrinho.itens.map((item) => (
              <li key={item.sku}>
                {item.nome} ({item.sku}) — Qtd: {item.quantidade} —{" "}
                {formatarCentavos(item.subtotalCentavos)}
                <button
                  type="button"
                  style={{ marginLeft: "0.5rem" }}
                  onClick={() => alterarItem(item.sku, 0)}
                >
                  Remover
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {carrinho && carrinho.itens.length > 0 && (
        <form onSubmit={simularCheckout} style={{ marginTop: "1.5rem" }}>
          <h3>1. Endereço e Cupom</h3>
          <div style={{ display: "grid", gap: "0.5rem", maxWidth: 420 }}>
            <input
              required
              placeholder="Destinatário"
              value={endereco.destinatario}
              onChange={(e) => setEndereco({ ...endereco, destinatario: e.target.value })}
            />
            <input
              required
              placeholder="CEP (8 dígitos)"
              maxLength={8}
              value={endereco.cep}
              onChange={(e) => setEndereco({ ...endereco, cep: e.target.value })}
            />
            <input
              required
              placeholder="Logradouro"
              value={endereco.logradouro}
              onChange={(e) => setEndereco({ ...endereco, logradouro: e.target.value })}
            />
            <input
              required
              placeholder="Número"
              value={endereco.numero}
              onChange={(e) => setEndereco({ ...endereco, numero: e.target.value })}
            />
            <input
              placeholder="Cupom promocional (opcional)"
              value={cupom}
              onChange={(e) => setCupom(e.target.value)}
            />
            <button type="submit" disabled={carregando}>
              Simular Frete e Total
            </button>
          </div>
        </form>
      )}

      {simulacao && (
        <div style={{ marginTop: "1.5rem" }}>
          <h3>2. Opções de Frete e Pagamento</h3>
          <p>
            Itens: {formatarCentavos(simulacao.subtotalItensCentavos)} | Descontos:{" "}
            {formatarCentavos(simulacao.descontoTotalCentavos)}
          </p>

          {simulacao.opcoesFrete.map((opt) => (
            <label key={opt.id} style={{ display: "block", marginBottom: "0.25rem" }}>
              <input
                type="radio"
                name="frete"
                value={opt.id}
                checked={freteSelecionado === opt.id}
                onChange={() => setFreteSelecionado(opt.id)}
              />{" "}
              {opt.servico} ({opt.prazoDiasUteis} dias úteis) — Frete:{" "}
              {formatarCentavos(opt.valorCentavos)} |{" "}
              <strong>Total: {formatarCentavos(opt.totalComFreteCentavos)}</strong>
            </label>
          ))}

          <div style={{ marginTop: "1rem" }}>
            <select
              value={meioPagamento}
              onChange={(e) => setMeioPagamento(e.target.value as any)}
            >
              <option value="PIX">Pix</option>
              <option value="CARTAO_TOKENIZADO">Cartão Tokenizado</option>
            </select>

            {meioPagamento === "CARTAO_TOKENIZADO" && (
              <input
                style={{ marginLeft: "0.5rem" }}
                value={tokenCartao}
                onChange={(e) => setTokenCartao(e.target.value)}
                placeholder="Token do cartão"
              />
            )}
          </div>

          <button
            type="button"
            style={{ marginTop: "1rem" }}
            disabled={carregando}
            onClick={confirmarCompra}
          >
            Concordar com Total e Finalizar Pedido
          </button>
        </div>
      )}

      {resultadoPedido && (
        <div style={{ marginTop: "1.5rem", padding: "1rem", border: "1px solid #16a34a" }}>
          <h3>Pedido Gerado com Sucesso!</h3>
          <p><strong>Pedido ID:</strong> {resultadoPedido.pedidoId}</p>
          <p><strong>Situação:</strong> {resultadoPedido.situacao}</p>
          <p><strong>Reserva Estoque:</strong> {resultadoPedido.reservaId}</p>
          <p><strong>Cobrança ID:</strong> {resultadoPedido.pagamentoId}</p>
          <p><strong>Total:</strong> {formatarCentavos(resultadoPedido.totalCentavos)}</p>
        </div>
      )}
    </section>
  );
}
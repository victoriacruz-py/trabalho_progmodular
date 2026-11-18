import { randomUUID } from "node:crypto";
import {
  DomainError,
  authorize,
  systemClock,
  trustedContext,
  type Clock,
  type Context,
  type EnderecoEntrega,
  type ICarrinho,
  type ICheckout,
  type IEntregas,
  type IPagamentos,
  type IPedidos,
  type ItemCarrinhoCalculado,
  type MeioPagamento,
  type OpcaoFreteCheckout,
  type ResultadoConfirmacaoCheckout,
  type ResumoCheckout,
} from "../../../../../packages/kernel/index.js";
import type { Database } from "../../infrastructure/database.js";
import { migrate } from "../../infrastructure/migrations.js";
import type { IEstoque } from "../estoque/index.js";
import type { IPrecos } from "../precos/index.js";

const SQL_MIGRACAO_CHECKOUT = `
CREATE TABLE IF NOT EXISTS checkout.checkout_simulacoes (
  id TEXT PRIMARY KEY,
  carrinho_id TEXT NOT NULL,
  cliente_id TEXT NOT NULL,
  revisao_carrinho INTEGER NOT NULL,
  cupom TEXT,
  endereco_json JSONB NOT NULL,
  itens_json JSONB NOT NULL,
  opcoes_frete_json JSONB NOT NULL,
  subtotal_itens_centavos INTEGER NOT NULL,
  desconto_total_centavos INTEGER NOT NULL,
  valido_ate TIMESTAMPTZ NOT NULL,
  versao INTEGER NOT NULL DEFAULT 1,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS checkout.checkout_tentativas (
  chave_idempotencia TEXT NOT NULL,
  cliente_id TEXT NOT NULL,
  tentativa_id TEXT NOT NULL UNIQUE,
  simulacao_id TEXT NOT NULL REFERENCES checkout.checkout_simulacoes(id),
  opcao_frete_id TEXT NOT NULL,
  meio_pagamento_tipo TEXT NOT NULL,
  reserva_id TEXT,
  pedido_id TEXT,
  pagamento_id TEXT,
  total_centavos INTEGER NOT NULL,
  situacao TEXT NOT NULL CHECK (situacao IN ('INICIADA', 'RESERVADA', 'PEDIDO_CRIADO', 'PENDENTE', 'AGUARDANDO_PAGAMENTO', 'CONCLUIDO', 'FALHA')),
  erro_codigo TEXT,
  erro_mensagem TEXT,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chave_idempotencia, cliente_id)
);
`;

export interface DependenciasCheckout {
  db: Database;
  carrinho: ICarrinho;
  precos: IPrecos;
  estoque: IEstoque;
  entregas: IEntregas;
  pedidos: IPedidos;
  pagamentos: IPagamentos;
  clock?: Clock;
}

const CINCO_MINUTOS_MS = 5 * 60 * 1000;
const QUINZE_MINUTOS_MS = 15 * 60 * 1000;

export class CheckoutService implements ICheckout {
  private readonly db: Database;
  private readonly carrinho: ICarrinho;
  private readonly precos: IPrecos;
  private readonly estoque: IEstoque;
  private readonly entregas: IEntregas;
  private readonly pedidos: IPedidos;
  private readonly pagamentos: IPagamentos;
  private readonly clock: Clock;

  constructor(deps: DependenciasCheckout) {
    this.db = deps.db;
    this.carrinho = deps.carrinho;
    this.precos = deps.precos;
    this.estoque = deps.estoque;
    this.entregas = deps.entregas;
    this.pedidos = deps.pedidos;
    this.pagamentos = deps.pagamentos;
    this.clock = deps.clock ?? systemClock;
  }

  async init(): Promise<void> {
    await migrate(this.db, "checkout", "001_inicial", SQL_MIGRACAO_CHECKOUT);
  }

  private validarEndereco(endereco: EnderecoEntrega): void {
    if (!endereco || typeof endereco !== "object") {
      throw new DomainError("INVALIDO", "Endereço de entrega obrigatório.");
    }
    const cepLimpo = (endereco.cep ?? "").replace(/\D/g, "");
    if (cepLimpo.length !== 8) {
      throw new DomainError("INVALIDO", "CEP inválido: deve conter 8 dígitos.");
    }
    if (
      !endereco.destinatario?.trim() ||
      !endereco.logradouro?.trim() ||
      !endereco.numero?.trim() ||
      !endereco.cidade?.trim() ||
      !endereco.uf?.trim()
    ) {
      throw new DomainError("INVALIDO", "Campos obrigatórios do endereço ausentes.");
    }
  }

  async simular(
    ctx: Context,
    carrinhoId: string,
    endereco: EnderecoEntrega,
    cupom?: string,
  ): Promise<ResumoCheckout> {
    authorize(ctx, ["CLIENTE"]);
    const clienteId = ctx.actorId;
    this.validarEndereco(endereco);

    const car = await this.carrinho.obterCarrinho(ctx, carrinhoId);
    if (car.clienteId !== clienteId) {
      throw new DomainError("NAO_AUTORIZADO", "Carrinho pertence a outro cliente.");
    }
    if (car.itens.length === 0) {
      throw new DomainError("INVALIDO", "Não é possível simular checkout com carrinho vazio.");
    }

    const itemIndisponivel = car.itens.find((i) => !i.disponivel);
    if (itemIndisponivel) {
      throw new DomainError(
        "INVALIDO",
        `Item ${itemIndisponivel.sku} indisponível: ${itemIndisponivel.motivoIndisponibilidade ?? "verifique o carrinho"}.`,
      );
    }

    const agoraDate = this.clock.now();
    const itensSimples = car.itens.map((i) => ({
      sku: i.sku,
      quantidade: i.quantidade,
    }));

    const cotacaoPreco = await this.precos.calcular(
      itensSimples,
      cupom?.trim() || undefined,
      agoraDate,
    );

    const itensValorizados: ItemCarrinhoCalculado[] = car.itens.map((item) => {
      const linha = cotacaoPreco.linhas.find((l) => l.sku === item.sku);
      if (!linha) {
        throw new DomainError("INVALIDO", `Preço não encontrado para SKU ${item.sku}.`);
      }
      return {
        ...item,
        precoUnitarioCentavos: linha.precoUnitario,
        descontoCentavos: linha.desconto,
        subtotalCentavos: linha.total,
      };
    });

    const subtotalLiquidoItens = itensValorizados.reduce(
      (acc, i) => acc + i.subtotalCentavos,
      0,
    );
    const descontoTotal = itensValorizados.reduce(
      (acc, i) => acc + i.descontoCentavos,
      0,
    );

    const cepNormalizado = endereco.cep.replace(/\D/g, "");
    const cotacoesFrete = await this.entregas.cotar(itensSimples, cepNormalizado);
    if (!cotacoesFrete || cotacoesFrete.length === 0) {
      throw new DomainError(
        "INVALIDO",
        "Nenhuma opção de entrega disponível para o CEP informado.",
      );
    }

    const opcoesFrete: OpcaoFreteCheckout[] = cotacoesFrete.map((frete) => ({
      ...frete,
      totalComFreteCentavos: subtotalLiquidoItens + frete.valorCentavos,
    }));

    const simulacaoId = `sim_${randomUUID()}`;
    const validoAte = new Date(agoraDate.getTime() + CINCO_MINUTOS_MS).toISOString();
    const enderecoNormalizado: EnderecoEntrega = {
      ...endereco,
      cep: cepNormalizado,
    };

    await this.db.query(
      `INSERT INTO checkout.checkout_simulacoes (
        id, carrinho_id, cliente_id, revisao_carrinho, cupom,
        endereco_json, itens_json, opcoes_frete_json,
        subtotal_itens_centavos, desconto_total_centavos, valido_ate, versao
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 1)`,
      [
        simulacaoId,
        car.id,
        clienteId,
        car.revisao,
        cupom?.trim() || null,
        JSON.stringify(enderecoNormalizado),
        JSON.stringify(itensValorizados),
        JSON.stringify(opcoesFrete),
        subtotalLiquidoItens,
        descontoTotal,
        validoAte,
      ],
    );

    return {
      id: simulacaoId,
      carrinhoId: car.id,
      clienteId,
      revisaoCarrinho: car.revisao,
      itens: itensValorizados,
      subtotalItensCentavos: subtotalLiquidoItens,
      descontoTotalCentavos: descontoTotal,
      cupomAplicado: cupom?.trim() || undefined,
      endereco: enderecoNormalizado,
      opcoesFrete,
      validoAte,
      versao: 1,
    };
  }

  async confirmar(
    ctx: Context,
    simulacaoId: string,
    opcaoFreteId: string,
    meio: MeioPagamento,
    chaveIdempotencia: string,
  ): Promise<ResultadoConfirmacaoCheckout> {
    authorize(ctx, ["CLIENTE"]);
    const clienteId = ctx.actorId;

    if (!chaveIdempotencia || chaveIdempotencia.trim() === "") {
      throw new DomainError("INVALIDO", "Chave de idempotência obrigatória.");
    }
    if (!meio || (meio.tipo !== "PIX" && meio.tipo !== "CARTAO_TOKENIZADO")) {
      throw new DomainError("INVALIDO", "Meio de pagamento inválido.");
    }
    if (
      meio.tipo === "CARTAO_TOKENIZADO" &&
      (!meio.tokenCartao || meio.tokenCartao.trim() === "")
    ) {
      throw new DomainError("INVALIDO", "Token de cartão obrigatório.");
    }

    const tentRows = await this.db.query<{
      tentativa_id: string;
      simulacao_id: string;
      opcao_frete_id: string;
      reserva_id: string | null;
      pedido_id: string | null;
      pagamento_id: string | null;
      total_centavos: number;
      situacao: string;
    }>(
      `SELECT tentativa_id, simulacao_id, opcao_frete_id, reserva_id, pedido_id, pagamento_id, total_centavos, situacao
       FROM checkout.checkout_tentativas
       WHERE chave_idempotencia = $1 AND cliente_id = $2`,
      [chaveIdempotencia, clienteId],
    );

    let tentativaId: string;
    let reservaId: string | null = null;
    let pedidoId: string | null = null;
    let pagamentoId: string | null = null;

    if (tentRows.length > 0) {
      const existente = tentRows[0]!;
      if (
        existente.simulacao_id !== simulacaoId ||
        existente.opcao_frete_id !== opcaoFreteId
      ) {
        throw new DomainError(
          "CONFLITO",
          "Chave de idempotência reutilizada com parâmetros divergentes.",
        );
      }

      if (
        existente.situacao === "AGUARDANDO_PAGAMENTO" ||
        existente.situacao === "CONCLUIDO"
      ) {
        return {
          tentativaId: existente.tentativa_id,
          situacao: existente.situacao,
          pedidoId: existente.pedido_id!,
          reservaId: existente.reserva_id!,
          pagamentoId: existente.pagamento_id!,
          totalCentavos: existente.total_centavos,
        };
      }

      tentativaId = existente.tentativa_id;
      reservaId = existente.reserva_id;
      pedidoId = existente.pedido_id;
      pagamentoId = existente.pagamento_id;
    } else {
      tentativaId = `chk_${randomUUID()}`;
    }

    const simRows = await this.db.query<{
      id: string;
      carrinho_id: string;
      cliente_id: string;
      revisao_carrinho: number;
      cupom: string | null;
      endereco_json: EnderecoEntrega;
      itens_json: ItemCarrinhoCalculado[];
      opcoes_frete_json: OpcaoFreteCheckout[];
      subtotal_itens_centavos: number;
      desconto_total_centavos: number;
      valido_ate: Date;
    }>("SELECT * FROM checkout.checkout_simulacoes WHERE id = $1", [simulacaoId]);

    if (simRows.length === 0) {
      throw new DomainError("NAO_ENCONTRADO", "Simulação de checkout não encontrada.");
    }

    const sim = simRows[0]!;
    if (sim.cliente_id !== clienteId) {
      throw new DomainError("NAO_AUTORIZADO", "Simulação pertence a outro cliente.");
    }

    const agoraDate = this.clock.now();
    if (agoraDate.getTime() >= new Date(sim.valido_ate).getTime()) {
      throw new DomainError("RESERVA_EXPIRADA", "Simulação expirada. Refaça a simulação.");
    }

    const opcaoFrete = sim.opcoes_frete_json.find((o) => o.id === opcaoFreteId);
    if (!opcaoFrete) {
      throw new DomainError("INVALIDO", "Opção de frete inválida.");
    }

    if (opcaoFrete.totalComFreteCentavos <= 0) {
      throw new DomainError(
        "INVALIDO",
        "Compra com total zero não é permitida nesta versão (RN01).",
      );
    }

    const ctxServico = trustedContext(clienteId, ["CLIENTE"], "M03");

    if (!reservaId) {
      const carAtual = await this.carrinho.obterCarrinho(ctx, sim.carrinho_id);
      if (carAtual.revisao !== sim.revisao_carrinho) {
        throw new DomainError(
          "CONFLITO",
          "O carrinho foi alterado após a simulação. Refaça a simulação.",
        );
      }

      const itensSimples = sim.itens_json.map((i) => ({
        sku: i.sku,
        quantidade: i.quantidade,
      }));

      const novaCotacaoPreco = await this.precos.calcular(
        itensSimples,
        sim.cupom || undefined,
        agoraDate,
      );
      const novoSubtotalItens = novaCotacaoPreco.linhas.reduce(
        (acc, l) => acc + l.total,
        0,
      );
      const novasCotacoesFrete = await this.entregas.cotar(
        itensSimples,
        sim.endereco_json.cep,
      );
      const novoFrete = novasCotacoesFrete.find((f) => f.id === opcaoFrete.id);

      const novoTotal = novoSubtotalItens + (novoFrete?.valorCentavos ?? -1);

      if (!novoFrete || novoTotal !== opcaoFrete.totalComFreteCentavos) {
        throw new DomainError(
          "CONFLITO",
          "Os valores de preço ou frete mudaram. Confirme o novo total.",
        );
      }

      await this.db.query(
        `INSERT INTO checkout.checkout_tentativas (
          chave_idempotencia, cliente_id, tentativa_id, simulacao_id,
          opcao_frete_id, meio_pagamento_tipo, total_centavos, situacao
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'INICIADA')
        ON CONFLICT (chave_idempotencia, cliente_id) DO NOTHING`,
        [
          chaveIdempotencia,
          clienteId,
          tentativaId,
          simulacaoId,
          opcaoFreteId,
          meio.tipo,
          opcaoFrete.totalComFreteCentavos,
        ],
      );

      const vencimentoReserva = new Date(
        agoraDate.getTime() + QUINZE_MINUTOS_MS,
      ).toISOString();

      const reserva = await this.estoque.reservar(
        ctxServico,
        itensSimples,
        vencimentoReserva,
        `${tentativaId}:reserva`,
      );
      reservaId = reserva.id;

      await this.db.query(
        `UPDATE checkout.checkout_tentativas
         SET reserva_id = $1, situacao = 'RESERVADA', atualizado_em = $2
         WHERE tentativa_id = $3`,
        [reservaId, this.clock.now().toISOString(), tentativaId],
      );
    }

    if (!pedidoId) {
      try {
        const pedido = await this.pedidos.criar(
          ctxServico,
          {
            clienteId,
            itens: sim.itens_json,
            endereco: sim.endereco_json,
            cotacaoFrete: opcaoFrete,
            subtotalCentavos: sim.subtotal_itens_centavos,
            descontoCentavos: sim.desconto_total_centavos,
            totalCentavos: opcaoFrete.totalComFreteCentavos,
            reservaId: reservaId!,
            tentativaCheckoutId: tentativaId,
          },
          `${tentativaId}:pedido`,
        );
        pedidoId = pedido.id;

        await this.db.query(
          `UPDATE checkout.checkout_tentativas
           SET pedido_id = $1, situacao = 'PEDIDO_CRIADO', atualizado_em = $2
           WHERE tentativa_id = $3`,
          [pedidoId, this.clock.now().toISOString(), tentativaId],
        );
      } catch (err) {
        await this.estoque.encerrarReserva(
          ctxServico,
          reservaId!,
          "LIBERAR",
          `${tentativaId}:liberar-reserva`,
        );
        await this.db.query(
          `UPDATE checkout.checkout_tentativas
           SET situacao = 'FALHA', erro_mensagem = $1, atualizado_em = $2
           WHERE tentativa_id = $3`,
          [
            err instanceof Error ? err.message : "Falha ao criar pedido",
            this.clock.now().toISOString(),
            tentativaId,
          ],
        );
        throw err;
      }
    }

    try {
      const cobranca = await this.pagamentos.cobrar(
        ctxServico,
        {
          pedidoId: pedidoId!,
          clienteId,
          valorCentavos: opcaoFrete.totalComFreteCentavos,
          meio,
        },
        `${tentativaId}:cobranca`,
      );
      pagamentoId = cobranca.id;

      if (cobranca.estado === "RECUSADO") {
        await this.estoque.encerrarReserva(
          ctxServico,
          reservaId!,
          "LIBERAR",
          `${tentativaId}:liberar-recusa`,
        );
        await this.db.query(
          `UPDATE checkout.checkout_tentativas
           SET pagamento_id = $1, situacao = 'FALHA', atualizado_em = $2
           WHERE tentativa_id = $3`,
          [pagamentoId, this.clock.now().toISOString(), tentativaId],
        );
        throw new DomainError("INVALIDO", "Pagamento recusado pelo provedor.");
      }

      const situacaoFinal =
        cobranca.estado === "APROVADO" ? "CONCLUIDO" : "AGUARDANDO_PAGAMENTO";

      await this.db.query(
        `UPDATE checkout.checkout_tentativas
         SET pagamento_id = $1, situacao = $2, atualizado_em = $3
         WHERE tentativa_id = $4`,
        [pagamentoId, situacaoFinal, this.clock.now().toISOString(), tentativaId],
      );

      try {
        await this.carrinho.esvaziar(
          ctxServico,
          sim.carrinho_id,
          sim.revisao_carrinho,
          `${tentativaId}:esvaziar`,
        );
      } catch {
        // Preserva alterações feitas pelo cliente após a simulação
      }

      return {
        tentativaId,
        situacao: situacaoFinal,
        pedidoId: pedidoId!,
        reservaId: reservaId!,
        pagamentoId: pagamentoId!,
        totalCentavos: opcaoFrete.totalComFreteCentavos,
      };
    } catch (err) {
      if (err instanceof DomainError && err.message.includes("recusado")) {
        throw err;
      }
      await this.db.query(
        `UPDATE checkout.checkout_tentativas
         SET situacao = 'PENDENTE', atualizado_em = $1
         WHERE tentativa_id = $2`,
        [this.clock.now().toISOString(), tentativaId],
      );
      return {
        tentativaId,
        situacao: "PENDENTE",
        pedidoId: pedidoId!,
        reservaId: reservaId!,
        pagamentoId: pagamentoId ?? `${tentativaId}:cobranca`,
        totalCentavos: opcaoFrete.totalComFreteCentavos,
      };
    }
  }
}
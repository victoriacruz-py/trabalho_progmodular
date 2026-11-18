import { randomUUID } from "node:crypto";
import {
  Clock,
  systemClock,
  type IEntregas,
  type IPagamentos,
  type IPedidos,
} from "../../../packages/kernel/index.js";
import { Database } from "./infrastructure/database.js";
import { createClientes } from "./modules/clientes/index.js";
import { createCatalogo } from "./modules/catalogo/index.js";
import { createPrecos } from "./modules/precos/index.js";
import { createEstoque } from "./modules/estoque/index.js";
import { createCarrinho } from "./modules/carrinho/index.js";
import { createCheckout } from "./modules/checkout/index.js";

export async function compose(databaseUrl: string, clock: Clock = systemClock) {
  const db = new Database(databaseUrl);
  try {
    const clientes = await createClientes(db, clock);
    const catalogo = await createCatalogo(db, clock);
    const precos = await createPrecos(db, clock, catalogo.api);
    const estoque = await createEstoque(db, clock, catalogo.api);
    const carrinho = await createCarrinho(db, clock, catalogo.api, precos.api);

    const entregas: IEntregas = {
      async cotar(_itens, cep) {
        const validoAte = new Date(
          clock.now().getTime() + 15 * 60 * 1000,
        ).toISOString();
        const ufLocal = cep.startsWith("2") ? 1490 : 2490;
        return [
          {
            id: "frete_economico",
            servico: "Entrega Econômica",
            valorCentavos: ufLocal,
            prazoDiasUteis: 5,
            validoAte,
          },
          {
            id: "frete_expresso",
            servico: "Entrega Expressa",
            valorCentavos: ufLocal + 1500,
            prazoDiasUteis: 2,
            validoAte,
          },
        ];
      },
    };

    const pedidos: IPedidos = {
      async criar() {
        return { id: `ped_${randomUUID()}`, estado: "AGUARDANDO_PAGAMENTO" };
      },
    };

    const pagamentos: IPagamentos = {
      async cobrar(_ctx, dados) {
        return {
          id: `pag_${randomUUID()}`,
          estado:
            dados.meio.tipo === "CARTAO_TOKENIZADO" ? "APROVADO" : "PENDENTE",
        };
      },
    };

    const checkout = await createCheckout(
      db,
      clock,
      carrinho.api,
      precos.api,
      estoque.api,
      entregas,
      pedidos,
      pagamentos,
    );

    return {
      db,
      clock,
      clientes,
      catalogo,
      precos,
      estoque,
      carrinho,
      checkout,
    };
  } catch (error) {
    await db.close();
    throw error;
  }
}
export type Services = Awaited<ReturnType<typeof compose>>;
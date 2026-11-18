import type {
  Clock,
  ICarrinho,
  IEntregas,
  IPagamentos,
  IPedidos,
} from "../../../../../packages/kernel/index.js";
import type { Database } from "../../infrastructure/database.js";
import type { IEstoque } from "../estoque/index.js";
import type { IPrecos } from "../precos/index.js";
import { CheckoutService } from "./implementation.js";

export { CheckoutService } from "./implementation.js";

export async function createCheckout(
  db: Database,
  clock: Clock,
  carrinho: ICarrinho,
  precos: IPrecos,
  estoque: IEstoque,
  entregas: IEntregas,
  pedidos: IPedidos,
  pagamentos: IPagamentos,
) {
  const api = new CheckoutService({
    db,
    clock,
    carrinho,
    precos,
    estoque,
    entregas,
    pedidos,
    pagamentos,
  });
  await api.init();
  return { api };
}
import type { Clock } from "../../../../../packages/kernel/index.js";
import type { Database } from "../../infrastructure/database.js";
import type { ICatalogo } from "../catalogo/index.js";
import type { IPrecos } from "../precos/index.js";
import { CarrinhoService } from "./implementation.js";

export { CarrinhoService } from "./implementation.js";

export async function createCarrinho(
  db: Database,
  clock: Clock,
  catalogo: ICatalogo,
  precos: IPrecos,
) {
  const api = new CarrinhoService({ db, clock, catalogo, precos });
  await api.init();
  return { api };
}
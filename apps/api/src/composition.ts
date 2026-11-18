import { Clock, systemClock } from "../../../packages/kernel";
import { Database } from "./infrastructure/database";
import { createClientes } from "./modules/clientes";
import { createCatalogo } from "./modules/catalogo";
import { createPrecos } from "./modules/precos";
import { createEstoque } from "./modules/estoque";

export async function compose(databaseUrl: string, clock: Clock = systemClock) {
  const db = new Database(databaseUrl);
  try {
    const clientes = await createClientes(db, clock);
    const catalogo = await createCatalogo(db, clock);
    const precos = await createPrecos(db, clock, catalogo.api);
    const estoque = await createEstoque(db, clock, catalogo.api);
    return { db, clock, clientes, catalogo, precos, estoque };
  } catch (error) {
    await db.close();
    throw error;
  }
}
export type Services = Awaited<ReturnType<typeof compose>>;

import { databaseUrl } from "./environment";
import { compose } from "./composition";
import { buildApplication } from "./http";

async function main() {
  const services = await compose(databaseUrl());
  try {
    const app = await buildApplication(services, {
      origin: process.env.WEB_ORIGIN ?? "http://127.0.0.1:5173",
      production: process.env.NODE_ENV === "production",
      log: (entry) => console.log(JSON.stringify(entry)),
    });
    const port = Number(process.env.PORT ?? 3000);
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new Error("PORT inválida.");
    await app.listen(port, "127.0.0.1");
    console.log(`API pronta em http://127.0.0.1:${port}/api`);
    let stopping = false;
    const stop = async () => {
      if (stopping) return;
      stopping = true;
      await app.close();
      await services.db.close();
    };
    process.once("SIGINT", () => void stop());
    process.once("SIGTERM", () => void stop());
  } catch (error) {
    await services.db.close();
    throw error;
  }
}
void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Falha ao iniciar.");
  process.exitCode = 1;
});

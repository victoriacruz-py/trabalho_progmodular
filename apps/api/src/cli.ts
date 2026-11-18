import { databaseUrl } from "./environment";
import { compose } from "./composition";
import { seedDevelopment } from "./seed";

async function main() {
  const command = process.argv[2];
  if (!["migrate", "seed"].includes(command ?? ""))
    throw new Error("Use migrate ou seed.");
  const services = await compose(databaseUrl());
  try {
    if (command === "seed") {
      const email = process.env.SEED_ADMIN_EMAIL,
        password = process.env.SEED_ADMIN_PASSWORD;
      if (!email || !password)
        throw new Error(
          "Defina SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD (mínimo 12 caracteres).",
        );
      const count = await seedDevelopment(services, email, password);
      console.log(
        `${count} produtos demonstrativos prontos. A repetição preserva o estoque.`,
      );
    } else console.log("Schemas e migração inicial verificados.");
  } finally {
    await services.db.close();
  }
}
void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Falha.");
  process.exitCode = 1;
});

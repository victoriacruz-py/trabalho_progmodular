import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { startPostgres } from "./postgres.mjs";
if (existsSync(".env")) process.loadEnvFile(".env");
if (process.env.NODE_ENV === "production")
  throw new Error("Use npm start para produção.");
const build = spawnSync(
  process.execPath,
  ["node_modules/typescript/bin/tsc", "-p", "tsconfig.api.json"],
  { stdio: "inherit", windowsHide: true },
);
if (build.status !== 0) process.exit(build.status ?? 1);
let database;
const children = [];
let closing = false;
async function stop(code = 0) {
  if (closing) return;
  closing = true;
  for (const child of children) child.kill();
  if (database) await database.pg.stop();
  process.exit(code);
}
process.once("SIGINT", () => void stop());
process.once("SIGTERM", () => void stop());
try {
  if (!process.env.DATABASE_URL) {
    database = await startPostgres({
      folder: "development",
      port: 15432,
      password: process.env.POSTGRES_PASSWORD ?? "ecommerce_local_only",
    });
    process.env.DATABASE_URL = database.url;
  }
  process.env.WEB_ORIGIN ??= "http://127.0.0.1:5173";
  process.env.PORT ??= "3000";
  mkdirSync(".local", { recursive: true });
  const credentialsPath = resolve(".local/dev-credentials.json");
  const credentials = existsSync(credentialsPath)
    ? JSON.parse(readFileSync(credentialsPath, "utf8"))
    : {
        email: "gestor@example.test",
        password: randomBytes(18).toString("base64url"),
      };
  if (!existsSync(credentialsPath))
    writeFileSync(credentialsPath, JSON.stringify(credentials, null, 2), {
      mode: 0o600,
    });
  const require = createRequire(import.meta.url);
  const { compose } = require("../dist/apps/api/src/composition.js");
  const { seedDevelopment } = require("../dist/apps/api/src/seed.js");
  const services = await compose(process.env.DATABASE_URL);
  try {
    await seedDevelopment(
      services,
      process.env.SEED_ADMIN_EMAIL ?? credentials.email,
      process.env.SEED_ADMIN_PASSWORD ?? credentials.password,
    );
  } finally {
    await services.db.close();
  }
  for (const args of [
    ["dist/apps/api/src/main.js"],
    ["node_modules/vite/bin/vite.js", "--config", "apps/web/vite.config.mts"],
  ]) {
    const child = spawn(process.execPath, args, {
      stdio: "inherit",
      env: process.env,
      windowsHide: true,
    });
    children.push(child);
    child.once("exit", (code) => {
      if (!closing) void stop(code ?? 1);
    });
    child.once("error", () => void stop(1));
  }
  console.log(
    `Loja: http://127.0.0.1:5173 — credenciais locais: ${credentialsPath}`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "Falha ao iniciar.");
  await stop(1);
}

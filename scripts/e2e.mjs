import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { startPostgres, availablePort } from "./postgres.mjs";
const args = process.argv.slice(2);
const build = args.includes("--no-build")
  ? { status: 0 }
  : spawnSync(
      process.execPath,
      ["node_modules/typescript/bin/tsc", "-p", "tsconfig.api.json"],
      { stdio: "inherit", windowsHide: true },
    );
if (build.status !== 0) process.exit(build.status ?? 1);
let database, services, app, web;
try {
  database = await startPostgres({
    folder: `tests/e2e-${Date.now()}-${process.pid}`,
    port: await availablePort(),
    password: randomBytes(24).toString("hex"),
    database: "ecommerce_e2e",
  });
  const require = createRequire(import.meta.url),
    { compose } = require("../dist/apps/api/src/composition.js"),
    { buildApplication } = require("../dist/apps/api/src/http.js"),
    { seedDevelopment } = require("../dist/apps/api/src/seed.js");
  services = await compose(database.url);
  process.env.E2E_EMAIL = "gestor-e2e@example.test";
  process.env.E2E_PASSWORD = randomBytes(18).toString("base64url");
  await seedDevelopment(
    services,
    process.env.E2E_EMAIL,
    process.env.E2E_PASSWORD,
  );
  const apiPort = await availablePort(),
    webPort = await availablePort();
  process.env.API_PROXY = `http://127.0.0.1:${apiPort}`;
  process.env.VITE_PORT = String(webPort);
  process.env.E2E_BASE_URL = `http://127.0.0.1:${webPort}`;
  app = await buildApplication(services, { origin: process.env.E2E_BASE_URL });
  await app.listen(apiPort, "127.0.0.1");
  const { createServer } = await import("vite");
  web = await createServer({ configFile: "apps/web/vite.config.mts" });
  await web.listen();
  process.exitCode = await new Promise((ok, fail) => {
    const child = spawn(
      process.execPath,
      [
        "node_modules/@playwright/test/cli.js",
        "test",
        ...args.filter((arg) => arg !== "--no-build"),
      ],
      { env: process.env, stdio: "inherit", windowsHide: true },
    );
    child.once("error", fail);
    child.once("exit", (code) => ok(code ?? 1));
  });
} finally {
  await web?.close();
  await app?.close();
  await services?.db.close();
  await database?.pg.stop();
}
process.exit(process.exitCode ?? 0);

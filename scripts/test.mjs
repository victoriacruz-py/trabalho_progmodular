import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { startPostgres, availablePort } from "./postgres.mjs";

const args = process.argv.slice(2);
if (!args.includes("--no-build")) {
  const build = spawnSync(
    process.execPath,
    ["node_modules/typescript/bin/tsc", "-p", "tsconfig.api.json"],
    { stdio: "inherit", windowsHide: true },
  );
  if (build.status !== 0) process.exit(build.status ?? 1);
}
let instance;
try {
  let url = process.env.TEST_DATABASE_URL;
  if (url && !/test/i.test(new URL(url).pathname))
    throw new Error("TEST_DATABASE_URL must name a dedicated test database.");
  if (!url) {
    instance = await startPostgres({
      folder: `tests/${Date.now()}-${process.pid}`,
      port: await availablePort(),
      password: randomBytes(24).toString("hex"),
      database: "ecommerce_test",
    });
    url = instance.url;
  }
  process.stdout.write(
    instance
      ? "Integration database: PostgreSQL, isolated local cluster\n"
      : "Integration database: configured dedicated PostgreSQL test database\n",
  );
  const run = spawnSync(
    process.execPath,
    [
      "--experimental-vm-modules",
      "node_modules/jest/bin/jest.js",
      "--config",
      "jest.config.cjs",
      "--runInBand",
      ...args.filter((a) => a !== "--no-build"),
    ],
    {
      env: { ...process.env, TEST_DATABASE_URL: url },
      stdio: "inherit",
      windowsHide: true,
    },
  );
  process.exitCode = run.status ?? 1;
} finally {
  if (instance) await instance.pg.stop();
}
// Keep failed test status even when a third-party PostgreSQL shutdown hook is present.
process.exit(process.exitCode ?? 0);

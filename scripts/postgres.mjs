import {
  existsSync,
  mkdirSync,
  cpSync,
  writeFileSync,
  unlinkSync,
  readFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { createServer } from "node:net";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { Client } from "pg";

const workspace = createHash("sha256")
  .update(resolve("."))
  .digest("hex")
  .slice(0, 12);
export const dataRoot = resolve(
  process.env.ECOMMERCE_DATA_DIR ||
    (process.platform === "win32"
      ? resolve(
          process.env.LOCALAPPDATA || tmpdir(),
          "ecommerce-modular",
          workspace,
        )
      : ".local"),
);
export function databaseDirectory(folder) {
  const dir = resolve(dataRoot, folder);
  if (!dir.startsWith(dataRoot + "/") && !dir.startsWith(dataRoot + "\\"))
    throw new Error(
      "Database path must stay inside the project runtime directory.",
    );
  return dir;
}
async function run(binary, args) {
  return new Promise((ok, fail) => {
    const child = spawn(binary, args, { windowsHide: true });
    let output = "";
    child.stdout.on("data", (data) => (output += data));
    child.stderr.on("data", (data) => (output += data));
    child.once("error", fail);
    child.once("exit", (code) => {
      child.stdout.destroy();
      child.stderr.destroy();
      child.stdin.destroy();
      code === 0
        ? ok(output)
        : fail(new Error(`PostgreSQL exited with ${code}: ${output}`));
    });
  });
}
function windowsRuntime() {
  if (!/^[\x00-\x7F]+$/.test(dataRoot))
    throw new Error(
      "Set ECOMMERCE_DATA_DIR to an ASCII-only path for PostgreSQL on Windows.",
    );
  const source = resolve("node_modules/@embedded-postgres/windows-x64");
  const version = JSON.parse(
    readFileSync(resolve(source, "package.json"), "utf8"),
  ).version;
  const runtime = databaseDirectory(`runtime-${version}`);
  if (!existsSync(resolve(runtime, ".complete"))) {
    mkdirSync(runtime, { recursive: true });
    cpSync(resolve(source, "native"), runtime, { recursive: true });
    writeFileSync(resolve(runtime, ".complete"), version);
  }
  return resolve(runtime, "bin");
}
export async function stopPostgres(folder) {
  if (process.platform !== "win32")
    throw new Error("Stop db:start with Ctrl+C on this platform.");
  await run(resolve(windowsRuntime(), "pg_ctl.exe"), [
    "-D",
    databaseDirectory(folder),
    "-m",
    "fast",
    "-w",
    "stop",
  ]);
}

export async function availablePort() {
  const server = createServer();
  await new Promise((ok, fail) => {
    server.once("error", fail);
    server.listen(0, "127.0.0.1", ok);
  });
  const port = server.address().port;
  await new Promise((ok) => server.close(ok));
  return port;
}
export async function startPostgres({
  folder,
  port,
  password,
  database = "ecommerce",
}) {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(database))
    throw new Error("Invalid database");
  const dir = databaseDirectory(folder);
  mkdirSync(dir, { recursive: true });
  let pg;
  if (process.platform === "win32") {
    const bin = windowsRuntime();
    if (!existsSync(resolve(dir, "PG_VERSION"))) {
      const passwordFile = databaseDirectory(`password-${randomUUID()}`);
      writeFileSync(passwordFile, password + "\n", { mode: 0o600 });
      try {
        await run(resolve(bin, "initdb.exe"), [
          "-D",
          dir,
          "--auth=scram-sha-256",
          "--username=ecommerce",
          `--pwfile=${passwordFile}`,
          "--encoding=UTF8",
          "--locale=C",
          ...(folder.startsWith("tests/") ? ["--no-sync"] : []),
        ]);
      } finally {
        unlinkSync(passwordFile);
      }
    }
    await run(resolve(bin, "pg_ctl.exe"), [
      "-D",
      dir,
      "-l",
      resolve(dir, "server.log"),
      "-o",
      `-h 127.0.0.1 -p ${port}`,
      "-w",
      "start",
    ]);
    let stopped = false;
    pg = {
      stop: async () => {
        if (!stopped) {
          stopped = true;
          await stopPostgres(folder);
        }
      },
      getPgClient: () =>
        new Client({
          host: "127.0.0.1",
          port,
          user: "ecommerce",
          password,
          database: "postgres",
        }),
    };
  } else {
    const { default: EmbeddedPostgres } = await import("embedded-postgres");
    pg = new EmbeddedPostgres({
      databaseDir: dir,
      port,
      user: "ecommerce",
      password,
      persistent: true,
      authMethod: "scram-sha-256",
      initdbFlags: ["--encoding=UTF8", "--locale=C"],
      postgresFlags: ["-h", "127.0.0.1"],
      onLog: () => {},
      onError: (message) => {
        if (String(message).includes("FATAL"))
          process.stderr.write(String(message) + "\n");
      },
    });
    if (!existsSync(resolve(dir, "PG_VERSION"))) await pg.initialise();
    await pg.start();
  }
  const client = pg.getPgClient("postgres", "127.0.0.1");
  try {
    await client.connect();
    if (
      !(
        await client.query("SELECT 1 FROM pg_database WHERE datname=$1", [
          database,
        ])
      ).rowCount
    ) {
      await client.query(`CREATE DATABASE ${database}`);
    }
  } catch (error) {
    await pg.stop();
    throw error;
  } finally {
    await client.end();
  }
  return {
    pg,
    url: `postgresql://ecommerce:${encodeURIComponent(password)}@127.0.0.1:${port}/${database}`,
  };
}

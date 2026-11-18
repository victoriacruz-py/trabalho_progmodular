import { startPostgres, stopPostgres } from "./postgres.mjs";

if (process.argv[2] === "stop") {
  await stopPostgres("development");
} else {
  const instance = await startPostgres({
    folder: "development",
    port: 15432,
    password: process.env.POSTGRES_PASSWORD || "ecommerce_local_only",
  });
  console.log(
    "PostgreSQL local pronto em 127.0.0.1:15432. Ctrl+C encerra o processo.",
  );
  const timer = setInterval(() => {}, 60000);
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    clearInterval(timer);
    await instance.pg.stop();
    process.exit(0);
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

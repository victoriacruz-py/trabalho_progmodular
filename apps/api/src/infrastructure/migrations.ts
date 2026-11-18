import { createHash } from "node:crypto";
import { Database, lock } from "./database";

/** Apply trusted migration SQL once, with schema-level serialization and immutable versions. */
export async function migrate(
  db: Database,
  schema: string,
  id: string,
  sql: string,
): Promise<void> {
  if (typeof schema !== "string" || !/^[a-z][a-z0-9_]{0,62}$/.test(schema))
    throw new Error("Schema de migração inválido.");
  if (typeof id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,119}$/.test(id))
    throw new Error("Identificador de migração inválido.");
  if (typeof sql !== "string" || !sql.trim())
    throw new Error("SQL de migração vazio ou inválido.");
  const checksum = createHash("sha256").update(sql, "utf8").digest("hex");
  const namespace = `"${schema}"`;
  await db.transaction(async (tx) => {
    await lock(tx, `migrations:${schema}`);
    await tx.query(`CREATE SCHEMA IF NOT EXISTS ${namespace}`);
    await tx.query(`CREATE TABLE IF NOT EXISTS ${namespace}._migrations (
      id text PRIMARY KEY,
      checksum char(64) NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const previous = (
      await tx.query<{ checksum: string }>(
        `SELECT checksum FROM ${namespace}._migrations WHERE id=$1`,
        [id],
      )
    ).rows[0];
    if (previous) {
      if (previous.checksum !== checksum)
        throw new Error(
          `Checksum divergente na migração ${schema}/${id}. Crie uma nova versão.`,
        );
      return;
    }
    await tx.query(sql);
    await tx.query(
      `INSERT INTO ${namespace}._migrations(id,checksum) VALUES($1,$2)`,
      [id, checksum],
    );
  });
}

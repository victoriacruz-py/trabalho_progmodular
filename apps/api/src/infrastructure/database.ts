import { Pool, PoolClient, QueryResultRow } from "pg";
import { createHash } from "node:crypto";

export type Tx = PoolClient;
export class Database {
  readonly pool: Pool;
  constructor(url: string) {
    this.pool = new Pool({
      connectionString: url,
      max: 12,
      connectionTimeoutMillis: 5000,
      statement_timeout: 10000,
    });
  }
  async query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    values: unknown[] = [],
  ): Promise<T[]> {
    return (await this.pool.query<T>(sql, values)).rows;
  }
  async transaction<T>(body: (tx: Tx) => Promise<T>): Promise<T> {
    const tx = await this.pool.connect();
    try {
      await tx.query("BEGIN");
      const result = await body(tx);
      await tx.query("COMMIT");
      return result;
    } catch (error) {
      await tx.query("ROLLBACK");
      throw error;
    } finally {
      tx.release();
    }
  }
  async close(): Promise<void> {
    await this.pool.end();
  }
}
export async function lock(tx: Tx, key: string): Promise<void> {
  const bytes = createHash("sha256").update(key).digest();
  await tx.query("SELECT pg_advisory_xact_lock($1::bigint)", [
    bytes.readBigInt64BE().toString(),
  ]);
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ":" + canonical(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
export function digest(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

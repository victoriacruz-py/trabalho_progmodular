import { randomUUID } from "node:crypto";
import {
  Clock,
  DomainEvent,
  check,
  Context,
  text,
} from "../../../../packages/kernel";
import { Database, Tx, lock, digest } from "./database";

function schemaName(schema: string): string {
  if (!/^[a-z][a-z0-9_]*$/.test(schema)) throw new Error("Invalid schema");
  return schema;
}
export function journalDDL(schema: string): string {
  const s = schemaName(schema);
  return `CREATE TABLE IF NOT EXISTS ${s}.outbox (id uuid PRIMARY KEY, event jsonb NOT NULL, published boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
    CREATE INDEX IF NOT EXISTS outbox_pending_idx ON ${s}.outbox(created_at) WHERE NOT published;
    CREATE TABLE IF NOT EXISTS ${s}.idempotency (scope text PRIMARY KEY, fingerprint text NOT NULL, result jsonb NOT NULL);
    CREATE TABLE IF NOT EXISTS ${s}.inbox (consumer text NOT NULL, event_id uuid NOT NULL, received_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(consumer,event_id));`;
}
export class Journal {
  private readonly schema: string;
  constructor(
    private readonly db: Database,
    schema: string,
    private readonly origin: string,
    private readonly clock: Clock,
  ) {
    this.schema = schemaName(schema);
  }
  async append(
    tx: Tx,
    tipo: string,
    agregado: string,
    versaoAgregado: number,
    dados: Record<string, unknown>,
  ): Promise<DomainEvent> {
    const event: DomainEvent = {
      id: randomUUID(),
      tipo,
      versaoEsquema: 1,
      origem: this.origin,
      agregado,
      versaoAgregado,
      instante: this.clock.now().toISOString(),
      dados,
    };
    await tx.query(
      `INSERT INTO ${this.schema}.outbox(id,event) VALUES($1,$2)`,
      [event.id, event],
    );
    return event;
  }
  async read(): Promise<DomainEvent[]> {
    return (
      await this.db.query<{ event: DomainEvent }>(
        `SELECT event FROM ${this.schema}.outbox ORDER BY created_at,id`,
      )
    ).map((r) => r.event);
  }
  async deliver(
    handler: (event: DomainEvent) => Promise<void>,
    limit = 100,
  ): Promise<number> {
    check(Number.isInteger(limit) && limit > 0 && limit <= 1000);
    let count = 0;
    while (count < limit) {
      const [row] = await this.db.query<{ id: string; event: DomainEvent }>(
        `SELECT id,event FROM ${this.schema}.outbox WHERE NOT published ORDER BY created_at,id LIMIT 1`,
      );
      if (!row) break;
      // Do not hold a connection while the receiver uses the shared pool.
      // Concurrent workers may deliver the same event; receivers deduplicate
      // atomically. A crash before this separate acknowledgment also replays it.
      await handler(row.event);
      await this.db.query(
        `UPDATE ${this.schema}.outbox SET published=true WHERE id=$1`,
        [row.id],
      );
      count++;
    }
    return count;
  }
}
export async function receiveOnce(
  db: Database,
  schema: string,
  consumer: string,
  event: DomainEvent,
  effect: (tx: Tx) => Promise<void>,
): Promise<boolean> {
  schemaName(schema);
  return db.transaction(async (tx) => {
    const claim = await tx.query(
      `INSERT INTO ${schema}.inbox(consumer,event_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING event_id`,
      [consumer, event.id],
    );
    if (!claim.rowCount) return false;
    await effect(tx);
    return true;
  });
}
export async function idempotent<T>(
  tx: Tx,
  schema: string,
  ctx: Context,
  operation: string,
  key: string,
  payload: unknown,
  effect: () => Promise<T>,
): Promise<T> {
  schemaName(schema);
  text(key, 200);
  const scope = JSON.stringify([
    ctx.service ?? "user",
    ctx.actorId,
    operation,
    key,
  ]);
  const fingerprint = digest(payload);
  await lock(tx, schema + ":idempotency:" + scope);
  const previous = (
    await tx.query<{ fingerprint: string; result: T }>(
      `SELECT fingerprint,result FROM ${schema}.idempotency WHERE scope=$1`,
      [scope],
    )
  ).rows[0];
  if (previous) {
    check(previous.fingerprint === fingerprint, "CONFLITO");
    return previous.result;
  }
  const result = await effect();
  await tx.query(
    `INSERT INTO ${schema}.idempotency(scope,fingerprint,result) VALUES($1,$2,$3)`,
    [scope, fingerprint, JSON.stringify(result)],
  );
  return result;
}

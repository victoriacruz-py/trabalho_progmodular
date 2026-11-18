import { Database } from "../../apps/api/src/infrastructure/database";
import {
  Journal,
  journalDDL,
  receiveOnce,
} from "../../apps/api/src/infrastructure/events";
import { DomainEvent, systemClock } from "../../packages/kernel";

/** Public test fixture: its SQL belongs only to foundation_test, never a domain schema. */
export class FoundationFixture {
  readonly journal: Journal;
  constructor(private readonly db: Database) {
    this.journal = new Journal(
      db,
      "foundation_test",
      "FoundationFixture",
      systemClock,
    );
  }
  async reset(): Promise<void> {
    await this.db.query(`DROP SCHEMA IF EXISTS foundation_test CASCADE;
      CREATE SCHEMA foundation_test;
      ${journalDDL("foundation_test")}
      CREATE TABLE foundation_test.counter(id text PRIMARY KEY, value integer NOT NULL);
      INSERT INTO foundation_test.counter VALUES ('produced', 0), ('received', 0);`);
  }
  async publish(
    amount: number,
    failBeforeCommit = false,
  ): Promise<DomainEvent> {
    return this.db.transaction(async (tx) => {
      await tx.query(
        "UPDATE foundation_test.counter SET value=value+$1 WHERE id='produced'",
        [amount],
      );
      const event = await this.journal.append(
        tx,
        "AmountProduced",
        "counter",
        1,
        { amount },
      );
      if (failBeforeCommit) throw new Error("falha do produtor");
      return event;
    });
  }
  async receive(
    event: DomainEvent,
    failBeforeCommit = false,
  ): Promise<boolean> {
    return receiveOnce(
      this.db,
      "foundation_test",
      "CounterReceiver",
      event,
      async (tx) => {
        await tx.query(
          "UPDATE foundation_test.counter SET value=value+$1 WHERE id='received'",
          [event.dados.amount],
        );
        if (failBeforeCommit) throw new Error("falha do receiver");
      },
    );
  }
  async snapshot(): Promise<{ produced: number; received: number }> {
    const rows = await this.db.query<{ id: string; value: number }>(
      "SELECT id,value FROM foundation_test.counter",
    );
    return {
      produced: rows.find((r) => r.id === "produced")!.value,
      received: rows.find((r) => r.id === "received")!.value,
    };
  }
}

async function report(value: unknown): Promise<void> {
  if (!process.send)
    throw new Error("A fixture de recuperação exige canal IPC.");
  await new Promise<void>((resolve, reject) => {
    process.send!(value, undefined, undefined, (error: Error | null) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function runChild(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url)
    throw new Error(
      "TEST_DATABASE_URL é obrigatório; não há fallback para banco da aplicação.",
    );
  const db = new Database(url);
  const fixture = new FoundationFixture(db);
  try {
    if (process.argv[2] === "produce-and-crash") {
      await fixture.publish(27);
      await fixture.journal.deliver(async (event) => {
        await fixture.receive(event);
        await report({
          pid: process.pid,
          stage: "receiver-committed-before-ack",
          snapshot: await fixture.snapshot(),
        });
        // Abrupt exit: deliberately skip pool.close(), the sender transaction and its ack.
        process.exit(73);
      });
      throw new Error("O processo deveria ter encerrado durante a entrega.");
    }
    if (process.argv[2] !== "recover")
      throw new Error("Modo de fixture desconhecido.");
    let applied = 0;
    const receiver = async (event: DomainEvent) => {
      if (await fixture.receive(event)) applied++;
    };
    const delivered = await fixture.journal.deliver(receiver);
    const nextDelivery = await fixture.journal.deliver(receiver);
    await report({
      pid: process.pid,
      stage: "recovered",
      delivered,
      applied,
      nextDelivery,
      snapshot: await fixture.snapshot(),
    });
  } finally {
    await db.close();
  }
}

if (require.main === module) {
  runChild().catch((error) => {
    process.stderr.write(
      String(error instanceof Error ? error.message : error),
    );
    process.exitCode = 1;
  });
}

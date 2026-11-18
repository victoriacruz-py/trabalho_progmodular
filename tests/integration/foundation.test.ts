import { afterAll, beforeEach, describe, expect, test } from "@jest/globals";
import { FoundationFixture } from "../fixtures/recovery-child";
import { testDatabase } from "../helpers";
import { spawn } from "node:child_process";
import { join } from "node:path";

type ChildReport = {
  pid: number;
  stage: string;
  snapshot: { produced: number; received: number };
  delivered?: number;
  applied?: number;
  nextDelivery?: number;
};
async function child(
  mode: string,
): Promise<{ code: number | null; reports: ChildReport[] }> {
  return new Promise((resolve, reject) => {
    const processChild = spawn(
      process.execPath,
      [join(__dirname, "../fixtures/recovery-child.js"), mode],
      {
        env: {
          ...process.env,
          TEST_DATABASE_URL: process.env.TEST_DATABASE_URL,
        },
        stdio: ["ignore", "pipe", "pipe", "ipc"],
        windowsHide: true,
      },
    );
    const reports: ChildReport[] = [];
    let stderr = "";
    processChild.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    processChild.on("message", (message) => {
      reports.push(message as ChildReport);
    });
    const timeout = setTimeout(() => {
      processChild.kill();
      reject(new Error(`Processo ${mode} excedeu 15s. ${stderr}`));
    }, 15000);
    processChild.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    processChild.once("exit", (code, signal) => {
      clearTimeout(timeout);
      if (signal)
        reject(new Error(`Processo ${mode} terminou com ${signal}. ${stderr}`));
      else resolve({ code, reports });
    });
  });
}

describe("Fundação durável — contratos da infraestrutura", () => {
  const db = testDatabase();
  const fixture = new FoundationFixture(db);
  beforeEach(async () => {
    await fixture.reset();
  });
  afterAll(async () => {
    await db.close();
  });

  test("rollback do produtor descarta alteração e evento no mesmo commit", async () => {
    await expect(fixture.publish(17, true)).rejects.toThrow(
      "falha do produtor",
    );
    expect(await fixture.snapshot()).toEqual({ produced: 0, received: 0 });
    expect(await fixture.journal.read()).toEqual([]);
    await fixture.publish(17);
    expect(await fixture.snapshot()).toEqual({ produced: 17, received: 0 });
    expect(await fixture.journal.read()).toHaveLength(1);
  });

  test("falha do receiver desfaz efeito e deduplicação; repetição pode concluir uma vez", async () => {
    const event = await fixture.publish(9);
    await expect(fixture.receive(event, true)).rejects.toThrow(
      "falha do receiver",
    );
    expect(await fixture.snapshot()).toEqual({ produced: 9, received: 0 });
    expect(await fixture.receive(event)).toBe(true);
    expect(await fixture.receive(event)).toBe(false);
    expect(await fixture.snapshot()).toEqual({ produced: 9, received: 9 });
  });

  test("doze entregadores concorrentes concluem sem reter conexões e cada evento produz um efeito", async () => {
    for (let i = 0; i < 12; i++) await fixture.publish(1);
    let started = 0;
    let applied = 0;
    let release!: () => void;
    const receiversReady = new Promise<void>((resolve) => {
      release = resolve;
    });
    // Hold each first receiver until all twelve workers have started delivery.
    // With the sender retaining a connection, this exhausts the shared pool.
    const deliveries = await Promise.allSettled(
      Array.from({ length: 12 }, () =>
        fixture.journal.deliver(async (event) => {
          if (++started === 12) release();
          await receiversReady;
          if (await fixture.receive(event)) applied++;
        }),
      ),
    );
    expect(
      deliveries.flatMap((delivery) =>
        delivery.status === "rejected" ? [String(delivery.reason)] : [],
      ),
    ).toEqual([]);
    expect(applied).toBe(12);
    expect(await fixture.snapshot()).toEqual({ produced: 12, received: 12 });
    expect(
      await fixture.journal.deliver(async (event) => {
        await fixture.receive(event);
      }),
    ).toBe(0);
  });

  test("dois processos reais: crash após commit do receiver e antes do ack admite replay sem efeito duplicado", async () => {
    const interrupted = await child("produce-and-crash");
    expect(interrupted.code).toBe(73);
    expect(interrupted.reports).toHaveLength(1);
    expect(interrupted.reports[0]).toMatchObject({
      stage: "receiver-committed-before-ack",
      snapshot: { produced: 27, received: 27 },
    });
    const recovered = await child("recover");
    expect(recovered.code).toBe(0);
    expect(recovered.reports).toHaveLength(1);
    expect(recovered.reports[0]).toMatchObject({
      stage: "recovered",
      delivered: 1,
      applied: 0,
      nextDelivery: 0,
      snapshot: { produced: 27, received: 27 },
    });
    expect(interrupted.reports[0]!.pid).not.toBe(process.pid);
    expect(recovered.reports[0]!.pid).not.toBe(process.pid);
    expect(interrupted.reports[0]!.pid).not.toBe(recovered.reports[0]!.pid);
  });
});

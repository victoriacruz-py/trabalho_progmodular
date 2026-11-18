import { Database } from "../apps/api/src/infrastructure/database";
import { Clock, trustedContext } from "../packages/kernel";

export function testDatabase(): Database {
  if (!process.env.TEST_DATABASE_URL)
    throw new Error(
      "Use npm test: TEST_DATABASE_URL is required for an isolated PostgreSQL.",
    );
  return new Database(process.env.TEST_DATABASE_URL);
}
export class TestClock implements Clock {
  constructor(public instant = "2026-10-23T10:00:00.000Z") {}
  now(): Date {
    return new Date(this.instant);
  }
  advance(ms: number): void {
    this.instant = new Date(this.now().getTime() + ms).toISOString();
  }
}
export const gestor = trustedContext("test-manager", ["GESTOR"]);
export const logistica = trustedContext("test-logistics", ["LOGISTICA"]);
export const cliente = trustedContext("test-customer", ["CLIENTE"]);
export const checkout = trustedContext("test-checkout", [], "M03");
export const pedidos = trustedContext("test-orders", [], "M04");

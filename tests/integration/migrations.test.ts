import { afterAll, beforeAll, describe, expect, test } from "@jest/globals";
import { migrate } from "../../apps/api/src/infrastructure/migrations";
import { testDatabase } from "../helpers";

describe("Migrações versionadas — infraestrutura em PostgreSQL", () => {
  const db = testDatabase();
  beforeAll(async () => {
    await db.query(
      "DROP SCHEMA IF EXISTS migr_test_preserve CASCADE; DROP SCHEMA IF EXISTS migr_test_concurrent CASCADE; DROP SCHEMA IF EXISTS migr_test_rollback CASCADE; DROP SCHEMA IF EXISTS migr_test_checksum CASCADE",
    );
  });
  afterAll(async () => {
    await db.close();
  });

  test("reexecutar a mesma versão preserva dados alterados após a migração", async () => {
    const sql =
      "CREATE TABLE migr_test_preserve.counter(value integer NOT NULL); INSERT INTO migr_test_preserve.counter VALUES (1)";
    await migrate(db, "migr_test_preserve", "001_initial", sql);
    await db.query("UPDATE migr_test_preserve.counter SET value=42");
    await migrate(db, "migr_test_preserve", "001_initial", sql);
    expect(
      await db.query("SELECT value FROM migr_test_preserve.counter"),
    ).toEqual([{ value: 42 }]);
    expect(
      await db.query("SELECT id FROM migr_test_preserve._migrations"),
    ).toEqual([{ id: "001_initial" }]);
  });

  test("schema e identificador rejeitam caracteres extras, quebra de linha e truncamento", async () => {
    for (const schema of [
      "../fora",
      "migr_test;DROP SCHEMA public",
      "a".repeat(64),
      "migr_test\n",
    ]) {
      await expect(migrate(db, schema, "001", "SELECT 1")).rejects.toThrow(
        "Schema de migração inválido",
      );
    }
    for (const id of ["", "001 migration", "a".repeat(121), "001\n"]) {
      await expect(
        migrate(db, "migr_test_validation", id, "SELECT 1"),
      ).rejects.toThrow("Identificador de migração inválido");
    }
  });

  test("duas chamadas concorrentes aplicam DDL e efeito uma única vez", async () => {
    const sql =
      "SELECT pg_sleep(0.15); CREATE TABLE migr_test_concurrent.counter(value integer NOT NULL); INSERT INTO migr_test_concurrent.counter VALUES (1)";
    await Promise.all([
      migrate(db, "migr_test_concurrent", "001_initial", sql),
      migrate(db, "migr_test_concurrent", "001_initial", sql),
    ]);
    expect(
      await db.query("SELECT value FROM migr_test_concurrent.counter"),
    ).toEqual([{ value: 1 }]);
    expect(
      await db.query("SELECT id FROM migr_test_concurrent._migrations"),
    ).toEqual([{ id: "001_initial" }]);
  });

  test("falha de DDL desfaz alterações e registro; a mesma tentativa pode concluir após reparar a dependência", async () => {
    await migrate(
      db,
      "migr_test_rollback",
      "001_initial",
      "CREATE TABLE migr_test_rollback.existing(value integer); INSERT INTO migr_test_rollback.existing VALUES (5)",
    );
    const sql = `UPDATE migr_test_rollback.existing SET value=9;
      CREATE TABLE migr_test_rollback.transient(value integer);
      CREATE TABLE migr_test_rollback.child(id integer REFERENCES migr_test_rollback.parent(id));
      INSERT INTO migr_test_rollback.child VALUES (17)`;
    await expect(
      migrate(db, "migr_test_rollback", "002_child", sql),
    ).rejects.toMatchObject({ code: "42P01" });
    expect(
      await db.query("SELECT value FROM migr_test_rollback.existing"),
    ).toEqual([{ value: 5 }]);
    expect(
      await db.query(
        "SELECT to_regclass('migr_test_rollback.transient') AS created",
      ),
    ).toEqual([{ created: null }]);
    expect(
      await db.query(
        "SELECT id FROM migr_test_rollback._migrations ORDER BY id",
      ),
    ).toEqual([{ id: "001_initial" }]);

    await db.query(
      "CREATE TABLE migr_test_rollback.parent(id integer PRIMARY KEY); INSERT INTO migr_test_rollback.parent VALUES (17)",
    );
    await migrate(db, "migr_test_rollback", "002_child", sql);
    expect(
      await db.query("SELECT value FROM migr_test_rollback.existing"),
    ).toEqual([{ value: 9 }]);
    expect(await db.query("SELECT id FROM migr_test_rollback.child")).toEqual([
      { id: 17 },
    ]);
    expect(
      await db.query(
        "SELECT id FROM migr_test_rollback._migrations ORDER BY id",
      ),
    ).toEqual([{ id: "001_initial" }, { id: "002_child" }]);
  });

  test("checksum divergente impede modificar uma migração já aplicada", async () => {
    await migrate(
      db,
      "migr_test_checksum",
      "001_initial",
      "CREATE TABLE migr_test_checksum.counter(value integer); INSERT INTO migr_test_checksum.counter VALUES (2)",
    );
    await expect(
      migrate(
        db,
        "migr_test_checksum",
        "001_initial",
        "UPDATE migr_test_checksum.counter SET value=999",
      ),
    ).rejects.toThrow("Checksum divergente");
    expect(
      await db.query("SELECT value FROM migr_test_checksum.counter"),
    ).toEqual([{ value: 2 }]);
    expect(
      await db.query("SELECT id FROM migr_test_checksum._migrations"),
    ).toEqual([{ id: "001_initial" }]);
  });
});

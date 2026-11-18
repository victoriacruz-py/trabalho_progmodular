---
name: sql-schema-designer
description: Designs normalized relational database schemas with primary/foreign keys, constraints, indexes, and deliberate denormalization, producing engine-aware DDL and an ER model. Use this skill when the user asks to design a database schema, model entities and relationships, normalize tables, fix update/insert/delete anomalies, choose data types and keys, add constraints or indexes, write CREATE TABLE DDL, or review/refactor an existing schema for PostgreSQL, MySQL, SQLite, or SQL Server.
license: MIT
---

# SQL Schema Designer

## Overview

Turn fuzzy requirements into a clean, normalized relational schema with correct keys, constraints, indexes, and justified denormalization. Output is runnable DDL plus a documented data model.

Keywords: database schema design, normalization, 1NF 2NF 3NF BCNF, primary key, foreign key, referential integrity, ON DELETE CASCADE, CHECK constraint, unique constraint, surrogate vs natural key, composite key, index, composite index, covering index, denormalization, ER diagram, entity relationship, data modeling, DDL, CREATE TABLE, PostgreSQL, MySQL, SQLite, SQL Server, junction table, many-to-many.

## Workflow

1. **Clarify scope and engine.** Identify the target database engine (PostgreSQL, MySQL, SQLite, SQL Server) because types and identity syntax differ — see `references/data-types-and-constraints.md`. Ask about expected scale, read/write ratio, and whether reporting queries matter.

2. **Extract entities and attributes.** From the domain, list nouns that have independent existence (`customer`, `product`, `order`). Each becomes a table. List the attributes (facts) each must store. Mark attributes that are required vs optional.

3. **Define relationships and cardinality.** For every pair of related entities decide one-to-one, one-to-many, or many-to-many.
   - One-to-many: foreign key on the "many" side.
   - Many-to-many: create a **junction table** with both FKs (its PK is usually the composite of both, or a surrogate plus a UNIQUE on the pair).
   - One-to-one: FK + UNIQUE on the dependent side, or share a PK.

4. **Choose keys.** Pick a primary key per table.
   - Prefer a **surrogate key** (auto-increment / identity / UUID) for stability when natural keys are large, mutable, or composite.
   - Declare a **UNIQUE** constraint on each confirmed business key, including its tenant or other scope. Do not infer uniqueness from a column name alone.
   - Use composite natural PKs for pure junction tables when no surrogate is needed.

5. **Normalize to 3NF.** Apply 1NF -> 2NF -> 3NF, removing partial and transitive dependencies. Escalate to BCNF only when a concrete anomaly remains. Use the decomposition checklist in `references/normalization.md`.

6. **Add constraints.** For each column decide `NOT NULL`, `DEFAULT`, `CHECK`. Document FK deletion/update behavior with explicit engine-supported actions where practical. For example, SQL Server uses `NO ACTION`, not `RESTRICT`; check the engine-specific notes in `references/data-types-and-constraints.md`.

7. **Pick data types** per `references/data-types-and-constraints.md`. Use exact amounts (decimal or integer minor units), and distinguish instants from local schedules and calendar dates. Choose engine-supported representations, explicit time-zone conventions, and meaningful text bounds.

8. **Plan indexes.** Check FK access paths and real `WHERE`/`JOIN`/`ORDER BY` patterns. Count leading columns of existing PK/UNIQUE indexes and engine-created indexes before adding another. Record justified exceptions and measure read benefit against write cost.

9. **Consider denormalization last.** Only after the normalized schema exists and a real query is too slow. Document the source of truth, the sync mechanism, and tolerated staleness.

10. **Emit DDL and the model.** Produce `CREATE TABLE` statements in dependency order (parents before children) and a relationship summary. Fill `templates/schema-design.md`. Optionally run `scripts/validate_schema.py` to lint the SQL for common omissions.

## Decision frameworks

### Surrogate vs natural primary key

| Situation | Choose |
|-----------|--------|
| Natural key is stable, short, single-column (country ISO code) | Natural key |
| Natural key is large, composite, or may change (email, full name) | Surrogate + UNIQUE on natural key |
| Pure junction table (M:N link, no own attributes) | Composite PK of the two FKs |
| Distributed inserts / need ID before insert / hide row counts | UUID surrogate |

### Relationship -> structure

- **1:N** — FK on the many side, indexed, NOT NULL if mandatory.
- **M:N** — junction table `a_b(a_id, b_id, ...)`, PK `(a_id, b_id)`, each FK indexed.
- **1:1** — FK + UNIQUE on the optional side, or shared PK for mandatory.
- **Self-reference (hierarchy)** — FK to same table (`manager_id -> employee.id`), `ON DELETE SET NULL` or `RESTRICT`.

### NULL decision

Use NULL for an explicitly optional, unknown, or inapplicable fact. "Almost always present" does not justify inventing a default. Use `NOT NULL` when the domain requires a value, and a default only when it expresses a valid business rule.

## Worked example (condensed)

Requirement: customers place orders; each order has many line items referencing products; products belong to categories.

```sql
CREATE TABLE category (
  category_id  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name         VARCHAR(100) NOT NULL,
  CONSTRAINT uq_category_name UNIQUE (name)
);

CREATE TABLE product (
  product_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sku          VARCHAR(40)  NOT NULL,
  name         VARCHAR(200) NOT NULL,
  unit_price   NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  category_id  BIGINT NOT NULL REFERENCES category(category_id)
                 ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT uq_product_sku UNIQUE (sku)
);
CREATE INDEX ix_product_category ON product(category_id);

CREATE TABLE customer (
  customer_id  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email        VARCHAR(254) NOT NULL,
  full_name    VARCHAR(200) NOT NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT uq_customer_email UNIQUE (email)
);

CREATE TABLE "order" (
  order_id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id  BIGINT NOT NULL REFERENCES customer(customer_id)
                 ON UPDATE CASCADE ON DELETE RESTRICT,
  status       VARCHAR(20) NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','paid','shipped','cancelled')),
  ordered_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_order_customer ON "order"(customer_id);

CREATE TABLE order_item (
  order_id     BIGINT NOT NULL REFERENCES "order"(order_id)
                 ON DELETE CASCADE ON UPDATE NO ACTION, -- items belong to the order
  product_id   BIGINT NOT NULL REFERENCES product(product_id)
                 ON DELETE RESTRICT ON UPDATE NO ACTION,
  quantity     INTEGER NOT NULL CHECK (quantity > 0),
  unit_price   NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),  -- snapshot at sale time
  PRIMARY KEY (order_id, product_id)
);
CREATE INDEX ix_order_item_product ON order_item(product_id);
```

Notes that make this correct: `order_item.unit_price` is a deliberate point-in-time snapshot (not a 3NF violation); `order_item` PK is the composite of its FKs; the order->item FK cascades (ownership) while item->product restricts (a referenced product cannot vanish); every FK is indexed.

See `references/normalization.md` for a worked decomposition and the case where a separate line number is needed because a product may occur more than once in an order.

## Optional static validation

Requires Python 3.10+ and only its standard library. Run from this skill's directory,
or replace the script path with its absolute location:

```bash
python scripts/validate_schema.py schema.sql --dialect postgresql
python scripts/validate_schema.py schema.sql --dialect sqlite --format json --strict
python -m unittest discover -s tests -p "test_*.py"
```

Use `-` instead of a file to read SQL from standard input. Dialects: `postgresql`
(default), `mysql`, `sqlite`, `sqlserver`. The script never executes SQL, opens a
database connection, changes the input, or installs dependencies.

It reads semicolon-separated `CREATE TABLE` and simple `CREATE [UNIQUE] INDEX`
statements, including inline/table-level keys, named constraints, composite keys,
schema-qualified names, standard doubled quotes, and line/block comments. Checks
include missing/duplicate keys, undeclared key columns, FK arity and parent candidate
keys, `SET NULL` conflicts, leading FK indexes, and likely floating-point money fields.
MySQL inline references and unverified storage engines are explicitly reported.

- Exit **0**: no lint errors (warnings may exist).
- Exit **1**: lint/parse errors, no supported tables, or any warning with `--strict`.
- Exit **2**: invalid command-line arguments or unreadable/non-UTF-8 input.
- JSON includes `tables_checked`, `findings` (code, severity, table, line, message),
  and `analysis_complete`. The last flag means no recognized scope gaps, not that SQL
  semantics or database execution were validated.

Unsupported statements such as `ALTER TABLE`, procedures, DML, and batch commands
are reported, not executed or applied to an imagined final schema. Complex index
expressions, partial indexes, external parent tables, and some advanced table options
also require review. Prefer a schema-only export with consistently qualified names;
the linter does not resolve search paths or existing objects. PostgreSQL quoted-name
case is preserved; other dialects use case-insensitive matching and do not model
server collations or MySQL `lower_case_table_names` settings.

This is a structural linter, not a complete SQL grammar/type checker. It does not
evaluate CHECK/default expressions, prove normalization, inspect business rules,
or simulate transactions, migrations, permissions, or locking. Advanced syntax may
need engine validation even if lint is clean. Backslash-escaped SQL strings are
rejected because their interpretation depends on server settings. Verify DDL and
integrity scenarios in a disposable database of the selected engine before claiming
runtime correctness; do not substitute SQLite for another database product.

## Best Practices

- Normalize to 3NF first; denormalize only with evidence and a sync plan.
- Prefer a primary key for transactional tables; document staging or other justified exceptions.
- Enforce confirmed business keys at their actual scope, even when using a surrogate PK.
- Derive nullability and defaults from domain rules.
- Use engine-appropriate exact money and time representations from the type reference.
- Document referential actions and test the intended lifecycle.
- Verify supporting FK/query indexes without duplicating existing access paths.
- Use CHECK constraints to encode domain rules (status whitelists, positive amounts, date ordering).
- Emit DDL in dependency order so it runs top-to-bottom without forward references.
- Use consistent snake_case naming and the constraint prefixes in `references/data-types-and-constraints.md`.

## Common Pitfalls

- **Storing independently related IDs as CSV/JSON lists** when each member needs referential integrity or independent updates — consider child rows. An opaque document is a different modeling choice.
- **No primary key**, or using a mutable natural key as PK that later changes everywhere.
- **Unindexed foreign keys** — silently slow joins and cascading deletes.
- **Float for money** — approximate arithmetic; use exact decimal or deliberate integer minor units.
- **Missing referential actions** — accidental orphan rows or blocked deletes you didn't intend.
- **Over-normalizing** to 5NF when 3NF suffices, or **over-indexing** every column and crushing write throughput.
- **Confusing a snapshot with redundancy** — copied `unit_price`/`document_name` at transaction time is intentional, not denormalization to "fix."
- **Premature denormalization** with no consistency mechanism, leaving cached aggregates permanently wrong.
- **Local-time timestamps** without zone info, making ordering and conversions ambiguous.

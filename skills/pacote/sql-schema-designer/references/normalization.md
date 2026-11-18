# Normalization and decomposition

Use this reference to justify a schema from business dependencies. Normal forms are
properties of dependencies, not of how many tables exist or whether surrogate IDs
were added. Capture unknown rules as questions instead of deriving them from a few
sample rows.

## Find the dependencies first

1. State what one row means, including its time and tenant scope.
2. List candidate keys: minimal attribute sets that identify a row.
3. Record functional dependencies `X -> Y`: equal X values must imply equal Y values
   in every legal database state. Mark which business rule supports each dependency.
4. Identify multi-valued facts, historical snapshots, and independently changing facts.
5. Check insert, update, and delete anomalies with concrete examples.

An order number unique only within a customer implies `(customer_id, order_number)`
is a candidate key; `order_number` alone is not. A surrogate `order_id` does not
remove that business dependency or its uniqueness requirement.

## What each normal form asks

| Form | Test | Typical repair |
|---|---|---|
| 1NF | No repeating groups; each attribute represents one value in its declared domain | Move independently identified list members to child rows |
| 2NF | In 1NF, every non-prime attribute depends on the whole of every candidate key, not a proper subset | Separate facts determined by part of a composite key |
| 3NF | For each non-trivial dependency `X -> A`, X is a superkey or A is prime (belongs to a candidate key) | Separate independent determinants and non-key facts |
| BCNF | For each non-trivial dependency `X -> Y`, X is a superkey | Decompose a remaining determinant that is not a key |

The common shorthand for 3NF is eliminating transitive dependencies of non-key facts
on a key. Use the formal criterion when candidate keys overlap. A single-column
primary key does not prove 2NF if another composite candidate key has partial
dependencies.

JSON is not automatically a modeling error. A document treated as one opaque value
may belong in one attribute. An array of foreign IDs that needs individual referential
integrity, joins, or independent updates usually belongs in a relation instead.

## Worked decomposition: order lines

Suppose a draft relation contains:

```text
order_line(order_id, line_no, customer_id, customer_name,
           product_id, current_product_name, quantity, unit_price_at_sale)
candidate key: (order_id, line_no)
```

Assume the verified rules are:

```text
order_id -> customer_id
customer_id -> customer_name                # current name, not a sale-time snapshot
product_id -> current_product_name
(order_id, line_no) -> product_id, quantity, unit_price_at_sale
```

Then decompose into:

```text
customer(customer_id PK, customer_name)
product(product_id PK, current_product_name)
sales_order(order_id PK, customer_id FK)
order_line(order_id FK, line_no, product_id FK, quantity, unit_price_at_sale,
           PK(order_id, line_no))
```

Moving order facts removes the partial dependency on `order_id`. Moving current
customer/product facts prevents changing one name in many unrelated order lines.
Keeping `unit_price_at_sale` is correct: it depends on that sale line, not on the
product's current price. Likewise, a required historical shipping address is not
the same fact as a customer's current address.

Do not silently use `(order_id, product_id)` as the line key if the same product may
appear on separate lines with different promotions, configurations, or prices.

## Verify that a decomposition preserves meaning

- **Attribute coverage:** every original fact has a named home.
- **Lossless join:** joining the new relations reconstructs the intended facts
  without inventing combinations. For a binary decomposition under functional
  dependencies, a useful test is whether the common attributes determine all
  attributes of at least one of the two relations under the dependency closure.
- **Dependency preservation:** can each original dependency be enforced locally
  through keys/constraints? If not, record the required cross-relation enforcement.
  BCNF can sacrifice dependency preservation; do not assert both properties without
  checking. A dependency-preserving, lossless 3NF design can be preferable.
- **Identity and cardinality:** keys, candidate-key uniqueness, mandatory/optional
  relationships, and deletion rules still reflect the domain.
- **Migration:** existing rows can be transformed, with duplicates and orphans
  identified before adding constraints. Never discard collisions silently.

## Deliberate denormalization

Require an observed access problem and compare indexes/query changes first. If a
redundant current value or aggregate is justified, record its authoritative source,
writer, atomicity or tolerated staleness, invalidation/rebuild method, and reconciliation
test. A stored order total can drift if item changes and total updates are separate.

A historical snapshot is a different time-scoped fact; it should not be refreshed
from the current master record. Document this distinction in the
[schema-design template](../templates/schema-design.md).

## Review result

Report each table's row meaning, candidate keys, relevant dependencies, justified
normal form, and remaining anomalies or enforcement obligations. Do not claim that
the linter proves normalization: it cannot infer business dependencies from SQL.

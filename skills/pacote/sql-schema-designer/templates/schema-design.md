# Schema design: {{system_or_feature}}

Replace the fields with project facts. Remove inapplicable sections and example rows.
Keep unknown requirements visibly unresolved; do not fill them with invented rules.

## Scope and environment

- Business capability and boundaries: {{scope}}
- Database product, version, storage engine: {{engine}}
- Character set/collation and identifier conventions: {{comparison_rules}}
- Expected row counts, growth, retention, read/write workload: {{workload}}
- Tenancy, permissions, sensitive data: {{access_model}}
- Time zones, currency units, rounding: {{domain_units}}
- Confirmed requirements versus assumptions/questions: {{evidence_and_gaps}}

## Entities and relationships

| Entity | One row represents | Primary key | Other candidate/business keys | Authoritative owner |
|---|---|---|---|---|
| {{entity}} | {{meaning_and_time_scope}} | {{key}} | {{key_and_uniqueness_scope}} | {{owner}} |

| Child -> parent | Cardinality/optionality | FK columns -> referenced columns | ON DELETE | ON UPDATE | Rationale |
|---|---|---|---|---|---|
| {{relationship}} | {{one_many_optional}} | {{columns}} | {{action}} | {{action}} | {{lifecycle_rule}} |

Include an ER diagram or an equivalent explicit relationship table. Distinguish
optional relationships from optional attributes and identify all junction tables.

## Column dictionary

| Table.column | Meaning/units | Engine type | Nullable and why | Default and why | Constraints |
|---|---|---|---|---|---|
| {{table.column}} | {{fact}} | {{type}} | {{null_policy}} | {{default_policy}} | {{checks_keys}} |

## Normalization and ownership

| Table | Candidate keys and dependencies | Normal form and justification | Snapshot/redundancy decision |
|---|---|---|---|
| {{table}} | {{dependencies}} | {{proof_or_exception}} | {{source_writer_refresh_policy}} |

For decompositions, explain lossless joins and dependency preservation. For caches
or derived totals, specify staleness limits, invalidation, rebuild, and reconciliation.

## Access paths and indexes

| Query or integrity operation | Filter/join/order pattern | Existing or proposed index | Benefit and write cost | Evidence |
|---|---|---|---|---|
| {{operation}} | {{predicate}} | {{ordered_keys_and_predicate}} | {{tradeoff}} | {{plan_or_measurement}} |

Count PK/UNIQUE indexes and engine-created FK indexes before proposing new ones.
Do not invent EXPLAIN results, timings, or workload measurements.

## DDL and changes to existing data

Link the complete SQL file, written for the stated engine. Create dependencies in
an executable order; handle cycles explicitly. Record prerequisites such as SQLite
foreign-key enforcement or required extensions.

- DDL file and application order: {{path_and_steps}}
- Existing rows, duplicates, invalid ranges, orphans: {{preflight_results}}
- Backfill, concurrency/locking, compatibility window: {{migration_plan}}
- Rollback and retained backup; irreversible transformations: {{recovery_plan}}

## Validation evidence

| Scenario | Expected result | Method/environment | Observed result |
|---|---|---|---|
| Duplicate business key | Rejected at intended scope | {{method}} | {{result_or_not_run}} |
| Missing parent | Rejected | {{method}} | {{result_or_not_run}} |
| Required NULL / invalid range | Rejected | {{method}} | {{result_or_not_run}} |
| Valid optional relationship | Accepted | {{method}} | {{result_or_not_run}} |
| Parent delete/update | Matches recorded lifecycle | {{method}} | {{result_or_not_run}} |
| Concurrent conflicting writes | Invariant preserved | {{method}} | {{result_or_not_run}} |

Record the local linter command, exit code, and reviewed warnings separately from
actual database checks. A clean lint report does not prove SQL executes, a migration
preserves data, or a query meets its latency target.

## Open decisions

| Question or risk | Affected requirement/table | Proposed resolution | Owner/status |
|---|---|---|---|
| {{question}} | {{impact}} | {{proposal}} | {{owner_and_state}} |

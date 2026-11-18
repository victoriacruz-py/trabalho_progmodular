# Non-functional requirement catalogue

Every entry below is a category, a set of questions, and a measurable formulation.
An NFR without a number and a measurement method is not an NFR.

Pattern: **metric + threshold + condition + measurement method**.

## Performance

- p50, p95 and p99 latency per critical endpoint, at a stated concurrency.
- Throughput: requests or jobs per second sustained.
- Batch and report completion time at stated data volume.
- Client-side budget for user-facing applications (time to interactive, payload size).

> NFR-P-001: POST /orders p95 under 300 ms at 100 concurrent users with 1M existing orders,
> measured by the load test in tests/load/orders against staging.

Always state the data volume. Latency at 1000 rows says nothing about 10M rows.

## Availability and reliability

- Uptime target over a stated window, and what counts as downtime.
- Recovery Time Objective: how long to restore service.
- Recovery Point Objective: how much data may be lost.
- Degradation policy: which features may fail while core service continues.

> NFR-A-002: RPO 15 minutes, RTO 4 hours, verified by a documented restore drill each quarter.

An availability target without a tested restore is an aspiration.

## Scalability

- Growth expected over 12 months in users, data and traffic.
- Which dimension scales first, and the known ceiling.
- Whether scaling is horizontal, vertical, or neither.

> NFR-S-001: Sustains 10x current write volume by adding application instances, with no
> schema change, verified by load test at 10x.

## Security

- Authentication mechanisms and session lifetime.
- Authorization model and where it is enforced (server-side, always).
- Transport and at-rest encryption requirements.
- Secret storage and rotation period.
- Audit events that must be recorded, and their retention.
- Rate limits per endpoint class and per actor.
- Dependency vulnerability policy: severity threshold and time to patch.

> NFR-SEC-004: All state-changing endpoints enforce authorization server-side and are covered
> by negative tests for unauthenticated, wrong-role and wrong-tenant actors.

## Privacy and data retention

- Data classification per entity.
- Retention period and deletion semantics (soft, hard, anonymize).
- Data residency constraints.
- Subject-access and erasure request handling, with a deadline.
- What must never appear in logs.

> NFR-PR-002: Personal data is erased or anonymized within 30 days of an erasure request,
> including backups older than the retention window, evidenced by an executed deletion report.

## Observability

- Structured logging with correlation identifiers.
- Metrics required for each critical flow.
- Alert thresholds and their recipients.
- Trace coverage across service boundaries.
- Retention of logs, metrics and traces.

> NFR-O-001: Every request carries a correlation id propagated to all downstream calls and
> present in every log line for that request.

An alert nobody receives is not observability.

## Accessibility

- Conformance target (for example WCAG 2.2 level AA) and its scope.
- Keyboard operability for all interactive flows.
- Screen-reader support for critical journeys.
- Contrast minimums.

> NFR-ACC-001: All critical journeys are completable by keyboard alone and pass automated
> accessibility checks with zero serious or critical violations.

Automated checks catch a minority of real issues. State whether manual verification is required.

## Compatibility

- Supported browsers, operating systems, devices, runtimes.
- API versioning and deprecation policy, with notice period.
- Backward-compatibility guarantees for existing clients and stored data.

> NFR-C-001: Existing API v1 clients continue to function unchanged for 12 months after v2 release.

## Operability

- Deployment frequency and maximum acceptable deploy duration.
- Rollback method and target time.
- Configuration mechanism, and which values differ per environment.
- Backup frequency, retention, and restore verification cadence.
- Maintenance window, if any.

> NFR-OP-003: A release can be rolled back within 15 minutes without data loss, verified in
> staging before each production release.

## Operational limits

Often omitted, frequently the cause of incidents. State explicitly:

- Maximum upload size, and per-account storage quota.
- Maximum page size and export row count.
- Maximum request body size and field lengths.
- Job timeout and maximum retry count.
- Concurrency limits per tenant.

> NFR-L-001: Uploads are limited to 25 MB per file and 500 MB per tenant per day; exceeding
> either returns HTTP 413 with a machine-readable error code and records an audit event.

Unbounded inputs are both a performance risk and a denial-of-service vector.

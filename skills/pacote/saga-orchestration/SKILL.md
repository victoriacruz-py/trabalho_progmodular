---
name: saga-orchestration
description: Design durable multi-step business workflows with idempotency, reconciliation and compensating actions. Use for order, inventory, payment or shipping flows that can partially succeed, in modular monoliths or distributed systems.
---

# Saga orchestration

Coordinate effects that cannot be committed in one local transaction. Preserve
the project's architecture: synchronous public module calls and asynchronous
external responses can coexist in a modular monolith. A new broker, microservice
deployment or workflow engine is not a prerequisite.

## Define the workflow

For each step, identify owner, precondition, stable operation key, persistent
state/result, deadline, success evidence and compensation/reconciliation action.
Separate local atomic transactions from eventual external effects. A saga is not
an atomic rollback of external operations.

Model successful, rejected and uncertain results separately. A timeout after a
provider received a command means its effect is unknown, not necessarily absent.
Reconcile using the existing operation identity before choosing the next action.

## Persistence and concurrency

- Atomically claim keys with the operation's local state. Scope idempotency by
  caller/context, operation and payload; reject changed payloads under the same
  key. Check-then-insert without concurrency control is insufficient.
- Persist the state transition and outgoing delivery intent atomically, using
  an outbox or equivalent mechanism appropriate to the storage. Retry delivery
  separately; consumers deduplicate and validate versions and origins.
- Admit each step-completion/compensation result only in its expected state.
  Duplicate or reordered results must not advance a workflow twice.
- Retain identities, deadlines and pending effects across restart. Use a trusted
  clock, explicit time zones and testable deadline semantics.

## Compensation and recovery

- Compensations can fail or remain pending. Retry transient failures with bounded
  backoff and retain a durable recovery path after the retry budget is exhausted.
  Do not publish completion without evidence of the required effect.
- Derive compensation order from business dependencies. Reverse order is common
  for sequential steps, but reversing command dispatch does not guarantee reverse
  completion; await confirmed effects where the dependency requires it.
- Reconcile partially executed or uncertain steps, including the failing step.
  Compensating only previously acknowledged steps can miss external effects.
- Missing records remain unknown unless authoritative evidence establishes the
  target state is already satisfied. Missing is not proof of successful reversal.
- Separate irreversible effects and post-commit auxiliary work. Notification
  failure must not undo a valid purchase when the business contract forbids it.
- Define handling for delayed success after cancellation, such as a refund
  without reopening the sale, according to the actual business policy.

## Verification

Exercise interruption before/after each persistence or external boundary,
duplicates, reordered replies, concurrency, deadlines, compensation failure and
restart. Assert final business state and external logical effects, not only
handler responses. Keep unknown outcomes explicit.

## References and limits

- [Pattern sketches](references/details.md): orchestration/choreography vocabulary
  and examples. Read the applicability warning before reuse.
- [Advanced sketches](references/advanced-patterns.md): timer, metrics and recovery
  concepts, not a tested production runtime.
- [Installation notes](INSTALLATION_NOTES.md): provenance and corrections.

The preserved sketches omit durability and concurrency mechanisms. Do not copy
them as an implementation of the guarantees above.

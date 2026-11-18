---
name: contract-testing
description: Design and verify consumer/provider contracts for module interfaces, APIs and events, including simulators, authorization, errors, schema evolution and backward compatibility. Use when integrating components or changing a public contract.
metadata:
  source: proffesor-for-testing/sentinel-api-testing
  upstream-path: .claude/skills/contract-testing
  adaptation: Codex standalone; internal modules and external APIs
---

# Contract testing

Establish what each consumer needs and verify that the actual provider satisfies
it. Read the project's contracts before choosing tools. A modular monolith can
test in-process interfaces directly; it does not need HTTP wrappers or a Pact
broker solely to use this skill.

## Workflow

1. Identify interface owner, consumers, version and requirement IDs. Record
   inputs, outputs, errors, permissions, side effects and invariants.
2. Write consumer expectations for accepted requests and meaningful failures.
   Include ownership, boundaries and retries when idempotency is promised.
   Use the domain representation, such as integer money.
3. Verify expectations against the real provider. For substitutable dependencies,
   run applicable contract cases against both simulator and provider: a mock
   agreeing with itself is not provider evidence.
4. For HTTP, use existing OpenAPI/JSON Schema or Pact tooling where appropriate.
   For events, check envelope, payload, version, origins, deduplication and order.
5. Compare affected consumers on changes. Document versions and migration steps.
   An optional field can break strict consumers or signatures; verify
   compatibility instead of assuming all additive changes are safe.
6. Run checks, identify what implementation/version was verified, and integrate
   them into the existing CI when requested.

## Evidence boundaries

- Schema validation proves shape, not business semantics or authorization.
- Stub-only consumer tests do not establish provider conformance.
- Contract tests do not prove whole-system correctness, restart durability,
  performance or race safety; use integration/system tests for those properties.
- For external providers that cannot run your tests, separate documentation,
  sandbox observations and unverified assumptions.
- Preserve prescribed manual evidence; automated checks do not make unexecuted
  manual cases pass.

Use the test runner and connectors actually available. This guide does not
install Pact, a broker, agents or CI services. Upstream Task, FleetManager and
qe-* integrations are not required or implicitly available.

## Output

Prefer a contract matrix with requirement/interface, consumer expectation,
provider or simulator tested, result/evidence, and remaining gap. If no code
exists, deliver criteria or a test design marked as not run.

## Optional reading

- [API testing patterns](https://github.com/proffesor-for-testing/sentinel-api-testing/tree/main/.claude/skills/api-testing-patterns)
- [Shift-left testing](https://github.com/proffesor-for-testing/sentinel-api-testing/tree/main/.claude/skills/shift-left-testing)
- [CI/CD orchestration](https://github.com/proffesor-for-testing/sentinel-api-testing/tree/main/.claude/skills/cicd-pipeline-qe-orchestrator)

These are external references, not local dependencies.
See [installation notes](INSTALLATION_NOTES.md) for provenance.

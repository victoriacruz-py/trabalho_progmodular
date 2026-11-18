---
name: performance-testing
description: Design and evaluate load, stress, spike and endurance tests using project-specific workload, latency, error and resource targets. Use when validating performance requirements or investigating bottlenecks under load.
metadata:
  source: proffesor-for-testing/sentinel-api-testing
  upstream-path: .claude/skills/performance-testing
  adaptation: Codex standalone; explicit measurement boundaries
---

# Performance testing

Translate the actual requirement into a reproducible experiment. Generic latency
and load values are examples, not acceptance thresholds.

## Define the experiment

- Record requirement ID, environment, revision, resources, dataset size, endpoint
  mix, authentication and dependency behavior.
- Distinguish concurrent users, concurrent requests and arrivals per second.
  Include realistic pacing and data; report the load actually achieved.
- Separate preparation, ramp-up, steady measurement and cooldown. A required
  15-minute steady load is not met by counting warm-up in those 15 minutes.
- Define metric boundaries. Client HTTP duration includes effects absent from
  server processing time. If acceptance is measured from server receipt through
  complete response, instrument that boundary and report client timing separately.
- Define percentiles, sample counts, error treatment and aggregation. Report
  important endpoint groups separately; do not hide a slow group in a fast one.
  Never discard failures/timeouts to improve latency results.
- Keep production load and external billable effects outside ordinary local or
  staging validation unless authorized by the user.

## Tools and execution

k6, JMeter, Artillery and Gatling are options, not bundled dependencies. Inspect
the runner/version already used by the project. Adapt examples to that version.
Start with the test required; add stress, spike or endurance work when justified.

For an e-commerce requirement of 10,000 SKUs, 100 simultaneous users for 15 minutes
and 95% of catalog/search responses within two seconds on the server: seed that
dataset, sustain the population for the measurement window, record achieved load
and evaluate the server metric. k6 http_req_duration alone does not establish
the server-only criterion.

1. Prepare isolated data and verify the exercised operations before applying load.
   Identify dependencies simulated instead of exercised.
2. Observe CPU, memory, connection pools, database latency, queues and errors where
   available. Use agreed resource/error limits and preserve partial results if a
   run is stopped.
3. Correlate slow requests with queries, contention, resources or external latency.
   Recommend changes supported by the evidence.
4. Re-run affected scenarios after relevant changes using comparable data and
   environment; document differences limiting comparability.

## Report

Include workload, duration, dataset, sample counts, latency percentiles, errors,
timeouts, resources, requirement verdict and raw artifacts. Mark a criterion
unverified if load or metric boundaries differ. A short load test cannot establish
monthly availability.

Installing this guide does not install a generator, monitoring or background
agents. Upstream Task, FleetManager and qe-* examples are not available tools.

## Optional reading

- [Quality engineering](https://github.com/proffesor-for-testing/sentinel-api-testing/tree/main/.claude/skills/agentic-quality-engineering)
- [API testing patterns](https://github.com/proffesor-for-testing/sentinel-api-testing/tree/main/.claude/skills/api-testing-patterns)
- [Resilience testing](https://github.com/proffesor-for-testing/sentinel-api-testing/tree/main/.claude/skills/chaos-engineering-resilience)

These are external references. See [installation notes](INSTALLATION_NOTES.md).

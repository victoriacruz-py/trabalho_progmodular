# Local installation adaptation - 2026-10-23

Source: wshobson/agents
Path: plugins/backend-development/skills/saga-orchestration
Revision: 0874a27b17a22e2b7c2e2bcd725768e0803cad06

Revised the entrypoint for modular monoliths as well as distributed workflows. Removed claims of infallible compensation and atomic external rollback. Added uncertain-outcome reconciliation, scoped idempotency, atomic state/delivery intent, result admission and restart verification. Preserved upstream sketches with concrete warnings about their missing durability/concurrency mechanisms; corrected a false-success missing-reservation example and an internal reference path. The sketches are not a production runtime.

The complete original skill folder is preserved at:
${CODEX_HOME}/skill-backups/ecommerce-skills-20261022-235706/upstream/saga-orchestration

Only documentation and skill metadata were adapted. This is not an upstream release, an installed application runtime, or verification of the eventual e-commerce implementation.

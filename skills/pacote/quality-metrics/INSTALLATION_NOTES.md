# Standalone repair — 2026-10-22

Source: `proffesor-for-testing/sentinel-api-testing`,
`.claude/skills/quality-metrics`. The upstream tree inspected was
`704f47fbc4d2d75ed9261f9a602d76aea930d01b`.

The package contains a standalone SKILL.md and requires no bundled scripts.
Four relative links expected sibling skills from the full upstream repository:
`agentic-quality-engineering`, `cicd-pipeline-qe-orchestrator`,
`risk-based-testing`, and `shift-right-testing`. All four exist in upstream.
The broken relative links were replaced with external upstream links and marked
as optional reading. No additional skills were installed.

The guide now explains that `Task`, `FleetManager`, `qe-*` agents and the
`aqe/quality-metrics/` namespace are external integration examples, not missing
local files or available tools. The agent can still use the guide to analyze
supplied measurements with the actual tools available in the current session.

Extra upstream frontmatter fields were preserved under `metadata` so that the
Codex skill validator accepts the document. This retains the original metadata
without claiming those integrations were installed or configured.

Original directory backup:
`${CODEX_HOME}/skill-backups/auxiliary-audit-20261022-233701/quality-metrics`.

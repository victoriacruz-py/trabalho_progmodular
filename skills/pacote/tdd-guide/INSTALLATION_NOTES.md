# Local completion — 2026-10-22

Source: `alirezarezvani/claude-code-skill-factory`, `dev`,
`generated-skills/tdd-guide`. The upstream tree inspected was
`ba18b31703542d9d7eda5f9ba94f0df65a59dddf`.

The skill advertised three scripts absent both locally and in the upstream tree:
`complexity_analyzer.py`, `test_quality_scorer.py`, and `missing_test_detector.py`.
They were authored locally as CLI adapters around the bundled calculators.
`utility_cli.py` provides shared UTF-8 input and JSON output; the behavioral tests
are in `tests/test_local_utilities.py`. None of these additions is claimed to be
an upstream release.

`LICENSE` was recovered unchanged from the upstream repository root at the
revision above. The README's nonexistent `requirements-dev.txt` instructions were
replaced with the real standard-library test command, its placeholder clone URL
was corrected, and its optional configuration examples were identified as not
automatically loaded.

Small fixes required by the new adapters were made to existing modules:

- `metrics_calculator.py`: count Python test definitions structurally, once,
  including async definitions; do not invent a test when none exists.
- `coverage_analyzer.py`: keep an executed Istanbul line executed when another
  statement on that line is uncovered; preserve the full Cobertura branch
  denominator instead of treating a partially covered line as one covered branch.

The coverage CLI rejects malformed/empty reports and duplicate source records
that the original parsers would silently overwrite. Merge duplicates with the
coverage producer first. LCOV, Istanbul/nyc JSON, and Cobertura XML are supported;
this does not imply support for every JSON/XML coverage schema. Null percentages
mean unavailable counters. Thresholds apply to measured categories per file.
Cobertura slots are aggregate counts, not real branch identities. Istanbul line
coverage uses statement start lines, and duplicate function names share an entry
in the existing parser. The older `identify_gaps` library API is not the new CLI's
threshold implementation and retains its upstream behavior.

Complexity and quality remain heuristic review aids from the existing engine.
They do not prove formal complexity, correctness, isolation, test effectiveness,
or runner discovery. Comments and strings can affect heuristic scores. No user
code is executed and no test runner is installed. A score is not a quality gate.

Verification: 18 behavioral tests passed using Python 3.12, including actual CLI
subprocesses, all three coverage schemas, gaps, thresholds, malformed input,
missing files, UTF-8 paths, and non-execution of source text. This is validation
of the completed utilities, not a comprehensive certification of the upstream
test-generation or framework adapters.

Original directory backup:
`${CODEX_HOME}/skill-backups/auxiliary-audit-20261022-233701/tdd-guide`.
Restoring that directory restores the pre-repair skill; preserve later edits
before doing so.

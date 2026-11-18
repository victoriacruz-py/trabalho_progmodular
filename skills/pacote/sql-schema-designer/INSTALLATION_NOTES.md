# Local completion of the installed skill

Source: https://github.com/jaskirat1616/grok-skills/tree/main/skills/sql-schema-designer

The installed upstream package contained only SKILL.md and referenced missing resources.
The following files were authored locally at the user's request on 2026-10-22;
they were not recovered from, or published to, the upstream repository:

- references/data-types-and-constraints.md
- references/normalization.md
- templates/schema-design.md
- scripts/validate_schema.py

SKILL.md now documents the command-line interface and analysis limits. Its dangling
example link was replaced with the normalization walkthrough. Engine-sensitive
wording for constraints, indexing, NULLs, money, and timestamps was aligned with the
new reference. Sources are linked in references/data-types-and-constraints.md.

Behavioral tests are in tests/test_validate_schema.py. Run:

```bash
python -m unittest discover -s tests -p "test_*.py"
```

The linter is read-only and uses the Python standard library. Passing its checks
does not validate DDL execution on PostgreSQL, MySQL, SQLite, or SQL Server.
Database integration tests must use the actual target product/version.

The original SKILL.md and installation note are preserved at:
`${CODEX_HOME}/skill-backups/sql-schema-designer-20261022-231016/`.

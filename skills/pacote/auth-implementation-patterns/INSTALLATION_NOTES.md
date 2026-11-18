# Local installation adaptation - 2026-10-23

Source: wshobson/agents
Path: plugins/developer-essentials/skills/auth-implementation-patterns
Revision: 0874a27b17a22e2b7c2e2bcd725768e0803cad06

Adjusted guidance to honor the project's session, role and ownership contracts. Clarified that reference snippets require integration and current-library review. Session examples now regenerate the session ID and return selected public user fields; the OAuth example no longer sends an access token in a redirect URL. The illustrative TypeScript is not a bundled or runtime-tested authentication application.

The complete original skill folder is preserved at:
${CODEX_HOME}/skill-backups/ecommerce-skills-20261022-235706/upstream/auth-implementation-patterns

Only documentation and skill metadata were adapted. This is not an upstream release, an installed application runtime, or verification of the eventual e-commerce implementation.

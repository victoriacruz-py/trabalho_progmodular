---
name: skill-router
description: Select and apply useful installed skills from explicit or implied user intent when global automatic skill routing is enabled. Reassess each request and task phase; offer a specific skill when its usefulness remains uncertain.
---

# Automatic skill routing

Use the current session's available-skills catalog to select useful instructions
for the user's actual task, in any chat or project. This router selects skills;
the selected skills provide the domain workflow.

## Select before substantive work

1. Identify the intended outcome, domain, artifact, tools, constraints, and current
   phase. Include implied intent: a supplied crash report can call for debugging
   even when the user never says "debug" or names a skill.
2. Compare that intent with the current skill names and descriptions. Include
   built-in, user, project, and enabled plugin skills. Use the live catalog, not a
   fixed list of names or remembered installation paths.
3. For a clear or reasonably inferred match, read its actual `SKILL.md` through
   the documented access mechanism and apply it without asking whether to use it.
   A name match alone does not establish relevance. Select complementary skills
   when each contributes needed guidance; prefer the best fit among duplicates.
4. If applicability is unclear, read the most plausible candidate's description
   and relevant instructions to resolve the uncertainty. If there is still a
   plausible benefit, offer that specific skill with a short reason in the user's
   language. Use the available question tool when appropriate, or include a brief
   offer in the response. Continue independent authorized work while awaiting an
   answer; silence is not approval. Do not repeatedly offer a declined skill.
5. Reassess when new evidence or a new phase changes the task, such as moving from
   diagnosis to implementation, validation, or export. Newly available skills
   participate automatically; no manual invocation or hardcoded catalog update
   should be needed.

## Apply economically

- Read only selected skill bodies and needed references. Reuse instructions
  already read in this conversation unless they changed or are no longer present.
- Briefly name a newly applied skill and its purpose, following the host's
  communication rules. Do not narrate every routing check or repeat announcements.
- For a simple self-contained answer with no useful matching skill, answer
  directly. Do not add an unrelated workflow merely because a keyword overlaps.
- Do not call this router recursively or chain other general-purpose routing
  skills solely because their descriptions say they apply to every conversation.
  Follow a framework when explicitly requested or when its concrete workflow fits.
- Keep existing global defaults, including token economy and authorized model
  routing. Skill selection does not itself require delegation or model changes;
  apply the separate model-routing policy when it is applicable.

## Scope and availability

- User instructions and higher-priority rules take precedence over skill guidance.
  Honor explicit skill requests, exclusions, and more specific project constraints.
- Use only enabled, available skills and respect explicit-only invocation policies.
  Do not treat files from a disabled plugin's cache as an enabled integration.
  If a useful skill is unavailable or explicit-only, explain and offer its use or
  installation as appropriate instead of claiming to have invoked it.
- Loading a skill does not authorize unrelated actions, external messages,
  spending, or permission changes. Keep the user's existing task authorization;
  do not add confirmation steps just to read or apply relevant guidance.
- If a selected skill blocks work or requires approval, identify the exact rule
  and source. Otherwise proceed with the authorized work and verify the result.

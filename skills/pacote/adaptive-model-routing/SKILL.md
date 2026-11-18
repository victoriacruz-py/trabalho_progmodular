---
name: adaptive-model-routing
description: Select native Codex subagent models and reasoning effort for substantive delegated tasks when automatic task routing is enabled by the user's global instructions.
---

# Adaptive model routing

Use native subagents to match substantial work to an appropriate model. This
does not change the model running the parent chat. A user-specified model,
effort, or request to avoid delegation takes precedence.

Answer quick questions and complete trivial edits directly. Do not delegate
merely to run a cheaper model when coordination would cost more than the work.
For substantive tasks, this skill requests delegation to one suitable native
subagent. Parallelize only independent work that benefits from it; avoid
duplicating the parent's investigation or creating an agent tree by default.

| Work | Model | Effort |
| --- | --- | --- |
| Bounded, mechanical extraction or repetitive edits with clear checks | `gpt-6-luna` | `low` |
| Ordinary implementation, debugging, or structured research | `gpt-6.1-sol` | `medium` |
| Ambiguous root causes, intricate architecture, difficult reasoning, or consequential changes | `gpt-6-astra` | `high` |

Use `xhigh` only when unresolved complexity or failed lower-effort work justifies
it. Escalate using a compact evidence handoff instead of blindly repeating the
whole task. Do not select `max`, `ultra`, or premium speed tiers automatically.

Check the available tool's model and effort combinations. With
`collaboration.spawn_agent`, set `fork_turns="none"`, the chosen `model`, and
`reasoning_effort` explicitly. Supply the actual request, relevant paths,
constraints, evidence, allowed edits, and success criteria in a concise handoff;
the child receives no parent history. The child should finish its bounded task
without recursively applying this router. Reuse an existing appropriate child
for follow-up work.

The parent reviews the result and relevant checks before reporting completion.
Do not redo the entire delegated task. If native model selection or delegation
is unavailable, continue directly and disclose that limit only when material.

Use the signed-in Codex environment. This skill does not authorize external API
spending, provider changes, creating user-visible chats, or changing permissions.
Never claim that a skill, prompt, or config-file edit switched the active parent
model. Do not claim savings without usage measurements.

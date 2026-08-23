# Subagent Timing

When to spawn installed agents, what every delegation must carry, what may run
in parallel, and how dispatch differs per runtime. Roles here are resolved
against the LIVE installed inventory (Step 2) — example agent names are
illustrations from common ariadnev installs, not a roster to assume.

## Why (and why not) delegate

A subagent adds value through exactly four mechanisms: a fresh context window
(no accumulated noise), an enforced tool boundary, parallel wall-clock, or a
specialist system prompt. If a spawn provides none of these, do the work
inline.

Do NOT spawn when:

- The work is a single small edit or lookup (delegation overhead > work).
- The task needs the full conversation history to be done right — subagents
  start blank; the contract below is ALL they know.
- The user is mid-dialogue on the same question (interactive loops stay in
  the controller).

## Trigger Table

| Stage | Condition | Role (examples) |
|---|---|---|
| understand | More than two areas/files to map | explorer, read-only, in parallel (`Explore`, `scout`) |
| understand | External tech or unknown API involved | researcher (`researcher`) |
| decide | size epic, multi-file build ahead | planner (`planner`) — prefer the planning skill instead when the user should review the plan |
| decide | Approach contested or high-stakes | second-opinion role (`brainstormer`) with an adversarial prompt |
| execute | Independent file sets across phases | implementer per phase (`fullstack-developer`), disjoint ownership, parallel only when files do not overlap |
| execute | Marketing: multiple channels from one brief | one content role per channel (`content-creator`, `copywriter`, `email-wizard`, `social-media-manager`) |
| verify | Implementation or fix just finished | tester (`tester`) before claiming done |
| verify | Ship/publish/public-contract ahead, or risk high | independent reviewer (`code-reviewer`, `content-reviewer`) |
| any | Same failure twice despite fixes | debugger with all evidence so far (`debugger`, `campaign-debugger`) |
| any | Hard problem on a model below `fable` (stuck after retries, high-stakes fork) | strategist (`kongming`) — autonomous counsel from the strongest model in one reply; no user round-trips |
| deliver | Behavior, setup, or commands changed | docs role (`docs-manager`) |
| deliver | Durable lesson, incident, or hard failure worth recording | journal role (`journal-writer`) |
| any | Data pull or analysis too large for the main context | analyst (`analytics-analyst`, `database-admin`) |

Timing beats selection: the most common failure is the right agent spawned
late (explorers after you are lost, reviewer after the PR is open). Spawn at
the trigger, not at the regret.

## Delegation Contract

Every spawn carries all seven. A subagent cannot see the conversation; this
contract is its entire world:

1. **Task** — one outcome, verifiable.
2. **Files to read** — exact paths, not "look around" (unless scouting IS the task).
3. **Files it may modify** — explicit ownership; empty for read-only roles.
4. **Acceptance criteria** — how the agent knows it is done.
5. **Constraints** — patterns to follow, things not to touch, no commit/push
   unless the controller owns git ops and says so.
6. **Report path** — where to write findings when the project keeps reports
   (`plans/reports/` convention when present); otherwise return in the result.
7. **Status line** — end with `Status: DONE | DONE_WITH_CONCERNS | BLOCKED |
   NEEDS_CONTEXT` plus a one-line summary.

Handle `BLOCKED` / `NEEDS_CONTEXT` by changing the context, scope, or approach
before re-delegating. Re-sending a failing prompt unchanged is a loop, not a
retry.

## Parallel Safety

- Parallel agents require disjoint file ownership, decided BEFORE spawning.
- Never parallel-edit the same file, generated artifact, migration sequence,
  or shared config.
- Read-only explorers parallelize freely.
- Merge decisions, conflict resolution, and user approvals stay in the
  controller session.
- Keep concurrent spawns to a handful (3-4); a wall of agents burns quota and
  produces reports faster than you can verify them.

## Runtime Dispatch Dialects

**Claude Code**

- Spawn: `Agent` tool with `subagent_type: "<agent-name>"`; available names
  are the installed subagent types listed in your context.
- Semantics: fresh context, frontmatter tool allowlist enforced, one text
  result returned. Parallel = multiple Agent calls in a single message.
- Skills invoke via the Skill tool (`/av:<slug>`).

**Codex**

- No in-session spawn tool exists. Installed agents are `.toml` files under
  `~/.codex/agents/` or the project's `.codex/agents/`; read the matching one
  and do the work inline under its instructions, or ask the user to run a
  separate `codex exec`.
- Discover installed agents by listing those two directories.

**Neither available** — do the work inline and name the gap in the final
report; never fake a delegation.

## Reporting Back

Agent results feed the controller's single outcome-first report (`## Output
format` in ../SKILL.md). Carry `DONE_WITH_CONCERNS` items through verbatim —
concerns from fresh-context agents are signal, not noise — and name where each
role's report file landed.

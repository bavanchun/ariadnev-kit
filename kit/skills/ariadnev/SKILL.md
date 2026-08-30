---
name: av:ariadnev
description: "Route a task to the right installed skills, chain them in the shortest order that fits, and time subagent spawns. Use when work spans domains, or when which skill applies is unclear."
user-invocable: true
when_to_use: "Invoke at the start of multi-step or multi-domain work, when the right skill is unclear, when skills need sequencing into a workflow, or when deciding whether and when to spawn subagents."
category: utilities
keywords: [routing, dispatch, skills, chaining, subagents, delegation, workflow, quality]
argument-hint: "[task to route]"
metadata:
  origin: ported
  author: upstream
  version: "1.1.0"
---

# ariadnev Router

Route any task to the right installed capability: the correct skill, the
shortest skill chain that fits, and the right subagents at the right moments.
This skill decides and dispatches — the routed skills and agents do the work.

Routing tables live with their owning skills. This skill adds the decision
protocol on top of them and duplicates none of their content. Output quality
comes from four levers this protocol controls: the right specialist per step,
fresh-context subagents for noisy or parallel work, verification steps matched
to risk, and refusing to orchestrate what a single skill does better.

## Boundaries

| Situation | Owner |
|---|---|
| Pick and sequence installed skills, time subagent spawns, in this session | this skill |
| Coordinate headless CLI jobs across runtimes, models, worktrees | `av:orchestrate`, when installed |
| Run multi-session agent teams | `av:team`, when installed |
| Discover or install skills you do not have yet | `av:find-skills`, when installed |
| Operate the `av` CLI itself (install, doctor, validate, migrate, update, ...), including any `av` invocation a chain link needs | `av:av` — it triages read-only vs mutating, scope, and the `--yes` gate |
| Explain what `av` can do or which skills are installed, without routing work | `av:help` |
| Add a bilingual Vietnamese/English switch to a plan's `plan.html` | `av:plan-i18n` |
| Execute the domain work itself | the routed skill or agent owns execution |

If the task is explicitly about running jobs headlessly, across CLIs, or in
parallel worktrees, hand off to `av:orchestrate` now (when installed) and stop.
`av:ariadnev` decides *which skill runs*; `av:av` runs *the binary*. When a
link's exit criterion is a CLI mutation (a plan phase checked, a post
published, a kit installed), that link is `av:av`'s, and the router never runs
the mutation itself.

## The Protocol

Six steps. Steps 0-2 are cheap and mandatory; steps 3-5 scale with the task.

### Step 0 — Proportionality gate (always run first)

Routing ceremony on a trivial task is itself a quality failure.

| Condition | Action |
|---|---|
| User names a skill to use | Invoke that skill. Stop routing. |
| Single domain, single step, one obviously matching installed skill | Invoke it directly. Stop routing. |
| Pure conversation, opinion, or fact question | Answer. No skills, no agents. |
| Multi-step, multi-domain, ambiguous match, high risk, or no obvious skill | Continue to Step 1. |

### Step 1 — Classify the task

Load [references/task-taxonomy.md](references/task-taxonomy.md). Output one
line before acting:

```
Route: <workflow class> | size: <trivial|standard|epic> | risk: <low|elevated|high> | domains: <n>
```

The class gives the default route shape; the modifiers bend it (bigger size
adds planning and delegation, higher risk adds verification, more domains add
domain-skill links).

### Step 2 — Inventory what is actually installed

Never route to a capability that is not installed. Discovery is
runtime-native:

- **Claude Code**: installed skills and their descriptions are listed in your
  context (Skill tool); installed agents are the available subagent types
  (Agent tool). Trust that list, not memory.
- **Codex**: skills auto-discovered from `~/.agents/skills/` and the repo's
  `.agents/skills/`; agents are the `.toml` files av installs under
  `~/.codex/agents/` — av writes home scope regardless of `--global`, so also
  check the project's `.codex/agents/` in case another tool wrote there.
  `codex debug prompt-input` lists both skills and agents. Nothing in this repo
  observes a Codex in-session spawn tool, and av registers none, so treat a
  "subagent" there as that agent's instructions read and executed inline unless
  the live session shows otherwise.

Capability missing? Use `av:find-skills` to discover and install it when
present; otherwise do the work inline and name the gap in your final report. Do
not silently pretend the capability exists.

### Step 3 — Select and chain skills

Selection precedence:

1. Skill the user named.
2. Domain-specific skill over workflow-generic skill (a React feature routes
   to the frontend skill first, then executes through the workflow skills).
3. One primary skill per distinct intent; secondary skills are follow-up
   helpers, not co-owners.

Consult the owning routing references instead of guessing — and instead of
re-deriving what they already encode:

| Decision | Load |
|---|---|
| Which domain skill fits this intent | `../av-find-skills/references/domain-routing.md` (if absent, match installed skill descriptions) |
| Which sequence fits multi-step dev work | `../av-cook/references/workflow-routing.md` |
| Which visual/preview mode fits | `../av-preview/references/visual-explanation-routing.md` |
| How to compose, pass context, and recover mid-chain | [references/chaining-patterns.md](references/chaining-patterns.md) |

Chain rules are in
[references/chaining-patterns.md](references/chaining-patterns.md): the
understand → decide → execute → verify → deliver skeleton, entry/exit criteria
per link, artifact passing through report files, and the collapse rule that
keeps chains short.

### Step 4 — Spawn subagents at trigger points

Subagents raise quality when they add a fresh context window, an enforced tool
boundary, parallel wall-clock, or a specialist system prompt — and lower it
when they fragment a task that needed full conversation context.

Load [references/subagent-timing.md](references/subagent-timing.md) for the
trigger table (stage × condition → role), the delegation contract every spawn
must carry, parallel-safety rules, and the per-runtime dispatch dialect
(Claude Code Agent tool vs Codex's inline-agent fallback).

Fast triggers you should never miss:

- Investigation spanning more than two areas → parallel read-only explorer
  agents at the start, not after you are lost.
- Implementation finished → tester role before you claim done.
- Ship, publish, or public-contract change ahead → reviewer role first.
- Same failure twice → debugger role with the evidence so far.

### Step 5 — Verification by risk

Verification is part of done, not optional polish. Apply the row of the Risk
modifier table in [references/task-taxonomy.md](references/task-taxonomy.md)
that matches the risk you declared at Step 1 — that table is the single
definition of what each risk class must clear before delivering, and Step 1
already loaded it.

## Worked Routes

Every route below first applies the bounded outcome gate in
`../../rules/primary-workflow.md`. The examples describe only the routing that
follows; they are not alternate workflow authorities.

**"Fix the failing CI on this branch"** — after framing the repaired behavior
and safety boundary, Step 0 finds a single domain and obvious owner. Route to
`/av:fix`. No chain, no agents unless `/av:fix`
itself escalates. Total router overhead: one classification line.

**"Add team billing with Stripe and a settings page"** — class:
build-feature, size: epic, risk: high (money), domains: 3 (backend, payments,
frontend). After the opening outcome gate, chain: scout → plan → implement (payment + frontend domain skills
under the workflow skill) → test → review. Agents: explorer roles scout
payment and settings code in parallel; implementer roles take disjoint file
sets per plan phase; tester after implementation; reviewer before ship (high
risk makes it mandatory).

**"Why did checkout latency double last week?"** — class: investigate-explain,
size: standard, risk: low (read-only), domains: 2. Chain: `/av:scout` to locate
the checkout path → `/av:debug` to prove the cause → findings report. No
mutation link: the route ends at a diagnosis, and `/av:fix` is a separate
decision the user makes on it. Agents: parallel `Explore` roles because the
investigation spans more than two files.

**"Write the launch announcement and post it to our channels"** — class:
create-content, size: standard, risk: high (mass-audience send), domains: 1.
No marketing routing reference ships, so the chain is built from the Step 2
inventory: `/av:copywriting` drafts → reviewer role with a content brief (high
risk makes it mandatory; no content-reviewer agent ships, so `code-reviewer`
carries the brief) → `/av:av` runs `av content publish`, which previews by
default and posts only under `--yes` after the user confirms the preview. The
router names the send as the irreversible step and hands the `--yes` decision
to the user; it never adds the flag itself.

## Anti-Patterns

| Do not | Because |
|---|---|
| Spawn a subagent for a two-minute single-file edit | Delegation overhead exceeds the work; quality drops with context loss |
| Build a five-link chain for a single-domain ask | Every link adds handoff loss; the collapse rule exists for this |
| Route to a skill or agent you have not confirmed installed | Broken dispatch mid-task; inventory is Step 2 for a reason |
| Re-route mid-chain without new evidence | Thrash; reroute once per link on evidence, else surface to the user |
| Copy routing tables from owning references into prompts or docs | They drift; load them at decision time instead |
| Use this skill for headless cross-CLI or multi-worktree runs | That is `av:orchestrate`'s layer |
| Run a mutating `av` command from inside the route, or pass `--yes` to one | That link belongs to `av:av`, which triages class, scope, and the preview gate; `--yes` is the user's call |
| Skip the reviewer role on high-risk work because the diff "looks clean" | The gate exists precisely for confident mistakes |

## Failure Handling

A link that fails does not advance the chain. Detour (fix or debug the
blocker, or rescope the link), then resume at the failed link. Two consecutive
failures on the same link: stop, report what was attempted, what failed, and
the smallest missing input — do not loop.

Subagent status handling: `BLOCKED` or `NEEDS_CONTEXT` means change the
context, scope, or approach before re-delegating. Never resend the same
failing prompt.

## Output format

Before dispatching, state the route in this shape. It is short on purpose —
routing that costs more than the work has already failed Step 0.

```markdown
**Route**
- <the Step 1 classification line, verbatim>
- Chain: av:<skill> → av:<skill> → av:<skill>   (or "direct: av:<skill>")
- Subagents: <agent> at <trigger point>, or "none"
- Verification: <the Step 5 verification this risk level requires>
- Not routed: <capability needed but not installed, or "none">
```

The first line is Step 1's, restated rather than re-derived, so the enums are
the taxonomy's — its Workflow Classes for the class, and `low | elevated |
high` for risk. Where the Ambiguity Rule decided between two classes that fit
equally, say which was dropped.

When Step 0 short-circuits on its first or second row, skip the block and emit
one line — ``Direct: `av:<skill>` — <the row that fired>`` ("user named it", or
"single domain, obvious owner"). Step 0's third row, pure conversation, emits no
route line at all: just answer. `direct:` inside the Chain field is a different
case — Step 1 ran and the fitting chain turned out to be one link.

After the chain runs, report outcome-first: what was delivered, which links
actually executed, where any link was re-routed, which agents ran and what each
returned (`DONE_WITH_CONCERNS` items verbatim), what was verified, and what gaps
remain.

## Quality gates

These check the routing decision. The gates that apply to the *work* being
routed are the Risk modifier table in `references/task-taxonomy.md` that Step 5
applies.

- [ ] Step 2 ran: every skill and agent named in the chain was confirmed
      installed, not assumed from this kit's documentation
- [ ] The chain is the shortest that fits — each link earns its handoff cost,
      and a single-skill task was not dressed as a chain
- [ ] Each subagent spawn names its trigger point and what fresh context buys
      that this session cannot supply
- [ ] The verification level matches the stated risk, and high-risk work keeps
      its reviewer even when the change looks clean
- [ ] No routing table was copied out of an owning reference into the route —
      they are loaded at decision time because they drift
- [ ] A missing capability is reported as a gap rather than silently replaced
      with the nearest installed skill

## Workflow position

**Typically follows:** nothing — this is an entry point for work whose shape is
not yet decided.
**Typically precedes:** whichever skills the route names; they own execution
from that point.
**Related:** `av:orchestrate` runs jobs headlessly across CLIs, models, and
parallel worktrees — hand off there and stop when the task is explicitly that;
`av:team` coordinates multiple sessions; `av:find-skills` finds and installs a
capability this kit lacks; `av:av` operates the CLI itself rather than routing
work through it, and owns any chain link whose exit criterion is an `av`
mutation; `av:help` explains the CLI and the installed catalog without routing.

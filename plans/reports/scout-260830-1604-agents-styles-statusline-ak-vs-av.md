# Scout: ak 2.14.0 vs av — agents, output-styles, statusline + commands

Content axis only. ak source = `/Users/vchun/Codes/My-projects/vcskill-kit/.claude/` (project-scope install of kit `engineer` 0.2.0 per `.agentkit/adapters/claude-code/engineer/.agentkit/install-manifest.json`). av source = `/Users/vchun/Codes/My-projects/vcskill-kit/ariadnev-kit/kit/`. Read-only; no suites run.

Lint bar applied (`packages/cli/src/kit/agent-lint.ts`): ≤120 lines, description 50–1200 chars with `<example>`+`<commentary>`, `Behavioral Checklist` heading, `name` == file stem. All 16 av agents sit at ≤120 lines; 9 ak agents exceed it (advisor 157, brainstormer 137, code-reviewer 184, debugger 175, journal-writer 150, planner 160, tester 167, ui-ux-designer 248, fullstack 123). Prose trimmed to meet the cap is **not** reported as a gap below; only lost capability is.

## 1. Agents

Tool strings are identical unless noted. `model`/`memory` identical for all 16.

| agent | ak tools | av tools | tool gap | body gap (ak has, av lacks) |
|---|---|---|---|---|
| advisor | Glob Grep Read Write Bash WebFetch WebSearch Task* SendMessage Task(Explore) | same | none | none — `Runtime note` + `Constraints` folded into intro/checklist; skill-path list points at `kit/skills/advise` |
| brainstormer | …no Write/Edit/Task(Explore) | **+Write, Edit, Task(Explore)** | none (av ⊃) | none — ak "Consult `planner`/`docs-manager` agent" is ungrantable (no `Task(planner)` in ak either); ak Finalize "ask user, run `/ak:plan`" replaced by hand-back to caller (correct for a subagent) |
| code-reviewer | …no Write/Edit/Task(Explore) | **+Write, Edit, Task(Explore)** | none (av ⊃) | none — 6 "Core Responsibilities" + review table + 4 priority sections compressed; Build/Type/Task-completeness checks retained in prose |
| code-simplifier | same | same | none | none (ak 55 L, av 85 L; av adds checklist + examples) |
| debugger | same | same | none | negligible — ak `Core Competencies`/`Tools and Techniques`/`Best Practices` lists folded; "document investigation process for knowledge sharing" dropped |
| docs-manager | same | same | none | none — `Accuracy Protocol` → checklist; `Structure and Size` → paragraph |
| explore | Glob Grep Read Bash | same | none | none (av ⊃) |
| fullstack-developer | same | same | none | none — ownership + parallel-safety merged; typecheck/test + phase-file update retained |
| git-manager | same | same | none | none (av ⊃) |
| journal-writer | same | same | none | P3 — `When to Write` (9 triggers, moved to description), `Tone and Voice`, 6 `Example Emotional Expressions`, `Severity` field in template (av CLI has no severity — CLI axis) |
| kongming | same | same | none | cross-axis — ak `Runtime note` names Codex `gpt-5.6-sol`/`high` override + Cursor `claude-fable-5-high`; av states its `agentToToml` emits no model. Adapter capability, not agent text |
| planner | same (Task(Explore) Task(researcher) Task(kongming)) | same | none | **P1** — STEP 4 "update session state via `set-active-plan.cjs`" gone and no av script exists (see §4). Also P3: `Handling Large Files (>25K tokens)` (4 techniques), `Core Mental Models` (9 models), naming-format table; `verification-roles.md` reference → `av-plan/references/` (exists) |
| project-manager | Glob Grep **LS** Read Edit MultiEdit Write NotebookEdit WebFetch Task* WebSearch BashOutput KillBash ListMcpResourcesTool ReadMcpResourceTool SendMessage | LS→**Bash** | none (ak has no Bash; av ⊃) | none |
| researcher | …no Write/Edit | **+Write, Edit** | none (av ⊃) | none |
| tester | same (Task(Explore) Task(kongming)) | same | none | P3 — ak "Core Responsibilities" blocks: `Performance Validation` (benchmarks, memory-leak check, slow tests) and 80%+ coverage target; `Quality Standards`/`Important Considerations` mostly in av checklist |
| ui-ux-designer | same (Task(Explore) Task(researcher)) | same | none | P3 — `Expert Capabilities` (~55 L): Envato/ThemeForest template research, photography/art-direction principles, UX/CX + CRO + A/B testing, branding/logo/print/email design, digital-art/3D, detailed Three.js/GLSL list; workflow bullets "background removal", "particle effects". `Quality Standards` fully retained as checklist |

Net: **zero tool grants ak has that av lacks**; av grants strictly more on 4 agents. One workflow step av's agent cannot perform (planner → session active-plan). Everything else is compression under the 120-line cap.

## 2. Output-styles

| | ak 2.14.0 | av |
|---|---|---|
| Content | 6 files `/…/vcskill-kit/.claude/output-styles/coding-level-{0-eli5,1-junior,2-mid,3-senior,4-lead,5-god}.md` (103/124/146/148/159/91 lines; frontmatter `name`, `description`, `keep-coding-instructions: true`; sections MANDATORY RULES / FORBIDDEN / Required Response Structure / Example Response Pattern). No `ak`/`agentkit` brand strings inside — copy-clean | **none**. `kit/` has no `output-styles/`; `load-kit.ts:195` would load it, `install-plan.ts:51-56` would write it |
| Activation A (hook injection) | `codingLevel` (config `coding_level`, -1 default) → `hooks/session-init.cjs:587` reads `output-styles/<style>.md`, strips frontmatter, prints body at SessionStart (`hooks/lib/project-detector.cjs:337-364`). Env `CK_CODING_LEVEL`, `CK_CODING_LEVEL_STYLE` also written | Same hook code ported verbatim (`kit/hooks/session-init/hook.cjs:446-447`, `_lib/project-detector.cjs:337-358`, probes `<.claude>/output-styles/` then `<.claude>/.ariadnev/output-styles/`) but **dead**: (a) no files, (b) `codingLevel` is not in `packages/cli/src/config/config-schema.ts`, and the hook prefs reader `_lib/av-config-client.cjs:127-141` only passes schema keys, so `codingLevel` is always -1 |
| Activation B (native) | Claude Code `/config` → Output style, or `outputStyle` in settings.json; ak docs say unverified. `settings.json` here has no `outputStyle` | `spec-verified.ts:90` claude-code `outputStyle: none(...)` → installer skips even if authored; `resolver.ts:67` already has `.claude/output-styles/<n>.md` path waiting |
| Skill | `ak-coding-level` (`/ak:coding-level [0-5]`): sets `codingLevel`, lists the 6 styles | `kit/skills/coding-level/SKILL.md`: session-only behaviour table (6 rows), explicitly states "this kit ships no `output-styles/`… nothing is injected at session start" |
| Verdict | — | **GAP (deliberately absent, documented)**. Three-part: content, config key, install path. Not "authored-but-unsupported" — nothing authored. |

## 3. Statusline + commands

### Statusline

| | ak | av |
|---|---|---|
| Entry | `/…/vcskill-kit/.claude/ak-engineer-statusline.cjs` (222 L), requires `./hooks/lib/*` | `kit/statusline/av-statusline.cjs` (240 L) → installs `.claude/hooks/av/av-statusline.cjs`, `AV_LIB` probe for `_lib/` |
| Wiring | `settings.json` `statusLine: {type: command, command: "/opt/homebrew/bin/node <abs>/.claude/ak-engineer-statusline.cjs"}` (no `padding`) | `install-plan.ts:136-158` → `hook-settings-merge.ts:110-122` writes `{type: command, command: node "<abs>", padding: 0}`; refuses to replace a foreign `statusLine` (so on this machine, av install would leave ak's bar in place and report "left as it is") |
| Segments | model 🤖, context % bar (autocompact buffer 40k), quota ⌛ 5h/wk + reset countdown, dir 📁, git 🌿 (branch/staged/unstaged/ahead/behind), plan 📋, cost 💰 (default off), changes 📝 +/-, agents 🔄, todos ✅ | identical (`_lib/statusline-section-registry.cjs` diff = 1 comment line; `statusline-render-modes.cjs` diff empty) |
| Modes | `full/compact/minimal/none` via `statuslineLayout.baseMode || statusline` | same via `statusline.mode` (`config-schema.ts:146-152`) |
| Quota toggle | `statuslineQuota` | `statusline.quota` |
| Colors toggle | `statuslineColors` → `setColorEnabled(false)` | **dropped** on purpose (comment L217-219); `NO_COLOR` env only |
| Custom layout | `statuslineLayout` {`lines[][]` or `sections[]`, `sectionConfig[id].{color,icon}`, `theme`, `responsiveBreakpoint`, `maxAgentRows`, `todoTruncation`} → `resolveLayout(config.statuslineLayout)` | **dropped**: `resolveLayout(undefined)` always (L223); registry code that would honour it is present. No way to enable `cost` or reorder |
| Tests | none shipped in `.claude/` | `kit/statusline/__tests__/statusline.test.cjs` |
| Verdict | — | **Equivalent renderer; 2 config affordances deliberately absent** (colors, layout). Note: ak's own schema `.agentkit/schemas/ck-config.schema.json` has no `statuslineLayout` property either — it came from the upstream dashboard UI (`statusline-types.ts`), which neither kit ships. |

### Commands

| | ak | av |
|---|---|---|
| Inventory | **none** — no `.claude/commands/`; manifest lists only `skills/**` + 7 `.agentkit/{scripts,schemas}` sidecar files; `rg term-config` over `.claude` + `.agentkit` = 0 hits | `kit/commands/term-config.md` (Vietnamese chezmoi terminal-config command; `allowed-tools` scoped to Read/Edit/`chezmoi *`/`git -C ~/.local/share/chezmoi *`) → `.claude/commands/term-config.md`, `.opencode/commands/` |
| Verdict | — | **no gap; av ⊃ ak**. ak's user-invocable utilities live on the skills axis (`ak-bro`, `ak-sowat`, `ak-sumup`, `ak-diagram` have no av counterpart; `ak-ask`/`ak-loop`/`ak-advise`/`ak-common`/`ak-coding-level` do) — out of scope, flagged only |

## 4. Ranked gap list

| P | gap | ak source → av target | port | effort |
|---|---|---|---|---|
| **P1** | Session active-plan directive is dead in av: `resolvePlanPath` order `['session','branch']` (`kit/hooks/_lib/av-config-utils.cjs:271-289`) — `session` needs `state.activePlan`, whose only writer is `set-active-plan.cjs`, which av does not ship (`kit/scripts/` = `shared-check.ts` only; doc comment L261 still names it). `av plan use` writes `.ariadnev/current-plan.json` (`cli/plan-command.ts:75`) but hooks never read it. Effect: statusline 📋 plan, `subagent-init` Plan Context, `cook-after-plan-reminder`, precompact recovery all lose the directive plan; planner cannot pin one | `/…/vcskill-kit/.agentkit/adapters/claude-code/engineer/.agentkit/scripts/set-active-plan.cjs` → `kit/scripts/set-active-plan.cjs` (installs to `.claude/scripts/`; rewrite `require('../hooks/lib/ck-config-utils.cjs')` to the `AV_LIB` probe for `.claude/hooks/av/_lib/av-config-utils.cjs`) + planner STEP 4 line in `kit/agents/planner.md` (budget: 1 line, file is at 120). Alternative: add a `pointer` source to `resolvePlanPath` reading `.ariadnev/current-plan.json` and have planner call `av plan use` | S–M |
| **P1** | Output-styles content: 6 coding-level styles | `/…/vcskill-kit/.claude/output-styles/coding-level-*.md` (6) → `kit/output-styles/coding-level-*.md` (verbatim; no brand strings; `load-kit.ts:195` already loads the dir) | S |
| **P1** | Output-styles plumbing so the ported files do anything: (a) `codingLevel` int -1..5, project layer, in `config-schema.ts` (hook reader then passes it; `av-config-utils.cjs:531` already consumes it); (b) install path — either flip `spec-verified.ts:90` claude-code `outputStyle` to `convention("consumed by av's own session-init hook, not by Claude Code")` so `install-plan.ts:51-56` writes `.claude/output-styles/`, or write them as a hook sidecar to `.claude/.ariadnev/output-styles/` (second probe path in `project-detector.cjs:342`); (c) rewrite `kit/skills/coding-level/SKILL.md` §"How It Works" + quality gate "does not claim… injected by a hook" (currently asserts the opposite of the ported behaviour) | `.claude/skills/ak-coding-level/SKILL.md` §How It Works → `kit/skills/coding-level/SKILL.md`; `config-schema.ts`; `spec-verified.ts` | M |
| **P2** | Statusline `statusline.layout` (lines/sections/sectionConfig/theme/breakpoint/maxAgentRows/todoTruncation) and `statusline.colors` | `.claude/ak-engineer-statusline.cjs:175-205` → `kit/statusline/av-statusline.cjs:187-223` (read nested keys, pass to `resolveLayout`); add `layout` (object) + `colors` (bool) under `statusline` in `config-schema.ts`. Registry already implements it | S |
| **P2** | kongming model carriage on Codex/Cursor (ak: `gpt-5.6-sol` high / `claude-fable-5-high`) — adapter, not text; av `agentToToml` emits no `model` | `.claude/agents/kongming.md:77-84` (statement only) → `packages/cli/src/adapt/` agent→toml emitter + `kit/agents/kongming.md` Runtime note | M (CLI axis; listed for completeness) |
| **P3** | planner `Handling Large Files (>25K tokens)` + `Core Mental Models` | `.claude/agents/planner.md:51-70` → `kit/skills/plan/references/` (agent is at cap; reference by pointer) | S |
| **P3** | ui-ux-designer `Expert Capabilities` (CRO/A-B, Envato research, photography, branding/print, 3D, GLSL detail) | `.claude/agents/ui-ux-designer.md:32-89` → `kit/skills/ui-ux-pro-max/references/expert-capabilities.md` + 1-line pointer in `kit/agents/ui-ux-designer.md` | S |
| **P3** | tester `Performance Validation` block + coverage target | `.claude/agents/tester.md:37-43` → one checklist bullet in `kit/agents/tester.md` (at cap; swap a line) | S |
| **P3** | journal-writer `Example Emotional Expressions` + `Tone and Voice` | `.claude/agents/journal-writer.md:113-128` → `kit/skills/journal/references/` | S |
| — | Commands: nothing to port (av ⊃ ak) | — | — |

## 5. Unresolved questions

1. ak's `install-manifest.json` tracks only `skills/**` and 7 sidecar files — not agents, output-styles, or the statusline. Is that intended (so `ak update` never reconciles them) or a manifest bug? Affects whether av should mirror that scope in its own manifest.
2. Which av policy for the output-style install cell: flip `spec-verified` to `convention` (consumer = av's hook, not the provider) or a new "hook-sidecar" artifact kind? The evidence ladder's definition ("provider was seen to load it") does not cover self-consumed artifacts.
3. Should `resolvePlanPath` gain a `pointer` source reading `.ariadnev/current-plan.json` (one mechanism, CLI-owned) instead of porting `set-active-plan.cjs` (two mechanisms, as ak keeps them — its comment cites a decision ledger entry not present in av)?
4. `statusline.layout`: ak has no schema or CLI for it either (dashboard-only upstream). Worth adding to av's schema without a UI, or keep dropped?
5. Was the skills-axis set `ak-bro`/`ak-sowat`/`ak-sumup`/`ak-diagram` already triaged elsewhere? Not in scope here but they are the only ak user-invocables with no av name.

```
Status: DONE_WITH_CONCERNS
Summary: Agents have no tool gaps (av grants more on 4) and one real workflow gap — the session active-plan directive has no writer in av; output-styles are wholly absent (content + config key + install path) and the av skill documents that; statusline is the same renderer minus deliberately dropped layout/colors config; commands: av ⊃ ak.
Concerns/Blockers: P1 active-plan finding is cross-axis (script + agent step + hook resolution) and needs a mechanism decision (Q3) before porting; output-style install needs an evidence-ladder ruling (Q2).
```

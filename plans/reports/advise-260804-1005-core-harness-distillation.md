# Advise — What to distill to upgrade the vc kit (core harness first)

Date: 2026-08-04 · Mode: `/ak:advise`, no flags · Confirmed reframing v3, mirror-97 retained
Evidence base: 2 scout reports (260804-0853 vcskill state, 260804-0909 AgentKit 2.8) + 4 research reports (260804-0944/0959)

## Confirmed reframing (v3)

**Problem.** vcskill's core harness diverges from 2026 reality in two directions at once: some cells are wrong or dead (codex commands → wrong dir *and* a deprecated surface; codex agents written but never registered, so nothing loads them), and several cells are wrongly closed although the runtime now supports them (hooks on Codex/Cursor, agents on Antigravity/Cursor). Separately the premise "author once in canonical Claude format" no longer has one referent — three divergent specs exist. Standardizing the harness = pick a baseline spec, rebuild the matrix from primary sources, open the evidenced cells. The graph then falls out of that foundation; it does not need a mechanism of its own.

**Requirements.** ① baseline = `agentskills.io`, Claude-Code-only fields become an adapter-injected superset · ② rebuild `spec-verified.ts` from each runtime's own docs, every cell carrying URL + retrieval date; no source ⇒ cannot be `true` · ③ fix the two codex defects · ④ open cells with evidence · ⑤ emit skills to two targets: `.agents/skills/` (6 runtimes) + `.claude/skills/` (Claude Code does not read `.agents/`) · ⑥ deterministic dangling-`vc:*` lint · ⑦ golden-task harness on the Anthropic skill-creator pattern; parity = checklist-coverage **plus** outcome regression on those same tasks.

**Goals.** 100% of `true` cells carry source+date · 0 dangling `vc:*` · 0 artifacts written that the runtime never loads · every distilled skill has `upstream_sha` and passes the parity gate.

**Non-goals.** Desktop/auth/registry/SQLite/analytics/daemon · server-built signed trees · Tier-2/3 mechanisms (4-state ownership, pruning, signing/notarization) — deferred, not abandoned · retrieval pre-filtering · single-pass LLM-judge merge gates.

**Constraints.** Local-first single binary, no account · upstream ships ~3 minors/10 days · solo dev · mirror 1:1 of 97 skills retained (decision 0003).

---

## 1. Verdict

The harness is not under-built. It is **mis-calibrated**, and most of the remaining work is deletion and re-verification rather than construction.

Three things a reasonable person would have assumed needed building turn out not to: a skill-graph mechanism (no 2026 framework declares skill edges in frontmatter — prose plus a lint *is* the state of the art), an expanded adapt engine (skill content is converging on SKILL.md, so per-provider body rewriting is depreciating work), and sophisticated eval (Anthropic already ships a reusable harness for this exact format).

What is genuinely load-bearing is smaller and duller: **`spec-verified.ts` records its provenance as prose instead of as a checkable citation.** Every concrete defect found today descends from that one type choice — the dead codex cells and the wrongly-closed cells alike. The matrix was verified once, against a third-party tool's generator scripts, and nothing in the system can tell you when that stopped being true. Fix the type, and the rest is data entry from reports you now hold.

The honest caveat: keeping mirror-97 is now the largest quantified risk in the plan (§7). It stays your call, but it changes what "done" means per skill — description discipline becomes a merge gate, not a nicety.

## 2. What you should do

Ordered. Each block gates the next.

**A. Sourcing discipline (the root fix)**
1. Change `ProviderVerification.source` from `string` to a structured per-cell `{url, retrieved, quote?}`. Make `validate --check` fail any cell set `true` without one.
2. Re-derive all cells from the four research reports — they already carry URL + retrieval date per runtime.

**B. Fix the two dead codex cells**
3. **codex commands** — truth is `~/.codex/prompts/*.md`, flat, `.md` only. But Codex has deprecated it in favour of Skills. **Demote the cell to `skip`** rather than implement it; do not ship into a deprecated surface.
4. **codex agents** — either add `config.toml` registration (`[agents.<name>] config_file = …`) inside a marker-delimited managed block, or demote the cell. Writing files nothing loads is worse than skipping: it reads as installed.

**C. Open the evidenced cells**
5. Hooks for Codex (`~/.codex/hooks.json` or `[hooks]` in config.toml) and Cursor (`.cursor/hooks.json`, `~/.cursor/hooks.json`). Codex's event vocabulary is close to Claude Code's — `session-init` and `session-state` were already assessed as structurally portable.
6. Real subagents for Antigravity (`.agents/agents/`, `~/.gemini/config/agents/`) and Cursor (`.cursor/agents/`, `~/.cursor/agents/`) — retiring the Cursor shim that currently installs an agent into the skills directory.

**D. Simplify skill emission**
7. Two targets instead of six paths: `.agents/skills/` (Codex, Cursor compat, Antigravity, OpenCode, Amp, Zed) and `.claude/skills/`. This **removes** per-provider path logic.
8. Adopt the `agentskills.io` baseline in the linter: `name` required, 1–64 chars, lowercase-alphanumeric-hyphen, no leading/trailing or doubled hyphen, **must equal the directory name**; `description` ≤ 1024. Claude-Code-only fields become adapter-injected on the claude-code target.

**E. Graph and cheap gates**
9. Fix a parseable shape for `## Workflow position` (`**Typically follows:**` / `**Typically precedes:**` / `**Related:**`), then lint dangling `vc:*` in `validate`. Zero LLM cost; closes the known `vc:debug` defect immediately.
10. `vcskill graph` derives edges from that section — derivation only, no new frontmatter field.

**F. Eval (the Phase-B enabler)**
11. Golden-task suite per skill, following Anthropic's skill-creator harness (golden prompts, 60/40 train/test split for description tuning, pass-rate/time/token measurement).
12. Parity gate = checklist-coverage **plus** outcome regression against the `ak-*` source on those same tasks. Never a single LLM-judge pass.

**G. Description discipline (required by the mirror-97 decision)**
13. Promote the existing `description-collision.ts` from advisory to a hard merge gate. At 97 skills this stops being hygiene and becomes the primary defence against the measured failure mode.

## 3. What you shouldn't do

- **Don't build a skill-graph mechanism** — no frontmatter edge fields, no graph store. Verified: Claude Skills, OpenAI Agents SDK, LangGraph, Semantic Kernel, AutoGen, Google ADK and CrewAI all route by code-defined graphs or flat-metadata semantic matching; none declares skill-to-skill edges in metadata, and `agentskills.io` has no relationship field. Deriving from prose is the current ceiling, not a shortfall.
- **Don't implement `~/.codex/prompts/`** merely because you now know the correct path. It is deprecated upstream.
- **Don't expand tool-name rewrite tables** for cursor/antigravity/opencode. Skill content is converging on a shared format; that table is depreciating.
- **Don't gate merges on one LLM-judge pass** — ~80–85% human agreement but only 65–77.5% position-bias consistency and up to +25% self-preference.
- **Don't add retrieval pre-filtering.** 26 skills. Revisit if measurement shows selection accuracy dropping.
- **Don't chase ak's structural-conversion/pruning engine** in this phase — you scoped to Tier-1, and the matrix fixes return more per hour.
- **Don't big-bang the cutover.** Already decided: incremental, per skill.
- **Don't treat all three SKILL.md specs as satisfiable at once.** Pick `agentskills.io`, adapt outward.

## 4. What could be better / more efficient

Ranked by effort-to-impact:

1. **Source-typed `spec-verified` + validate gate** — roughly half a day, prevents the entire class of drift from recurring. Highest leverage item in this document.
2. **Demote rather than implement the two codex cells** — deletion is cheaper than implementation and strictly more honest about what works.
3. **Reuse Anthropic's skill-creator eval harness** instead of authoring one; it already targets SKILL.md.
4. **Derive the graph from existing prose** rather than adding a frontmatter field and backfilling 26 (then 97) files.
5. **Two-target skill emission removes code** rather than adding it — the only capability increase in this plan that shrinks the codebase.
6. **Reuse the golden tasks for both eval and parity** (item F12) rather than maintaining two corpora.

## 5. My take and how to get there

The through-line: **this is an epistemic problem wearing an architectural costume.** vcskill's engine is fine — pure, tested, readable. What failed is that "verified" was recorded as a sentence rather than as a citation, so the matrix could rot silently while every test stayed green. That is exactly what happened: 364 tests pass, `validate --check` is clean, and the codex agents it installs are inert.

Route, four weeks, solo:

- **Week 1 — A + B.** Source-typed cells, validate gate, demote the two dead codex cells. Outcome: a matrix that is smaller but true. Nothing else should start before this.
- **Week 2 — C + D.** Open the evidenced cells; collapse skill emission to two targets. Outcome: capability rises while code shrinks.
- **Week 3 — E + G.** Workflow-position lint, `vcskill graph`, collision gate promoted to blocking. Outcome: the gates that make a 97-skill catalog survivable.
- **Week 4+ — F.** Golden tasks, then the parity gate. Only after this does Phase-B content distillation begin.

Install and use the kit from Week 1, one skill at a time as each passes — the incremental cutover you chose. The single most informative signal available to you is not any gate in this list; it is using the thing daily and noticing what annoys you.

## 6. Benefits

- Every `true` cell becomes a checkable claim with a date — drift becomes detectable rather than discovered by accident.
- Two defects that silently ship broken output are removed.
- Four capabilities the runtimes already support stop being skipped; Cursor gains real subagents instead of a shim.
- Per-provider path logic shrinks — the only capability increase here that reduces code.
- The `vc:debug` dangling reference class is closed deterministically, at zero token cost.
- Distillation fidelity gets a gate grounded in the one validated technique (outcome regression), not in a metric aimed at the wrong failure mode.
- Daily use starts in Week 1 instead of after 97 skills, so problems surface while they are still cheap.

## 7. Trade-offs

- **Mirror-97 (your decision, recorded disagreement).** Databricks (arXiv:2605.24050) measures a 21% pass-rate drop at 202 skills, up to 68% of it attributable to skill-shadowing rather than context bloat. vcskill is at 26; `~/.claude` currently holds 128. Reaching 97 moves you into the measured-cost region. You chose to keep it; the mitigation is item G, and the cost is that description discipline becomes mandatory per skill rather than optional. I would have scoped to observed usage, and I am recording that as a noted trade-off, not re-opening it.
- **Client-side transformation retained.** Keeps inspectability and offline determinism; forgoes ak's signed pre-built provenance. Correct trade for a local-first single binary, but it means you own correctness yourself — which is precisely why item A matters.
- **Tier-2/3 deferred.** No 4-state ownership classification, pruning, or notarization this phase. The Gatekeeper wart stays.
- **agentskills.io baseline costs strictness.** `name` becomes required and must equal the directory name — a stricter rule than Claude Code enforces, so some skills may need renaming.
- **Golden tasks are real recurring work.** Roughly one suite per skill, maintained as skills change. This is the expensive item; everything above it is cheap by comparison.
- **Opening hook cells increases surface.** Codex and Cursor hooks are newly supported and will move; each opened cell is a new drift vector — mitigated, not eliminated, by item A.

## 8. Work checklist

- [ ] Change `ProviderVerification.source` to a per-cell `{url, retrieved, quote?}` structure
- [ ] Make `validate --check` fail any `true` cell missing a source citation
- [ ] Re-derive every matrix cell from the four research reports (URL + retrieval date each)
- [ ] Demote codex `command` to `skip` with the deprecation cited as its reason
- [ ] Decide codex `agent`: implement `config.toml` managed-block registration, or demote
- [ ] Open codex `hook` — `~/.codex/hooks.json` / `[hooks]` in config.toml
- [ ] Open cursor `hook` — `.cursor/hooks.json`, `~/.cursor/hooks.json`
- [ ] Open antigravity `agent` — `.agents/agents/`, `~/.gemini/config/agents/`
- [ ] Replace the cursor agent shim with `.cursor/agents/` / `~/.cursor/agents/`
- [ ] Collapse skill emission to `.agents/skills/` + `.claude/skills/`; delete superseded path rules
- [ ] Enforce agentskills.io naming in `skill-lint.ts` (name required, ≤64, name == directory)
- [ ] Fix a parseable `## Workflow position` format and document it in the authoring spec
- [ ] Add dangling-`vc:*` reference lint to `validate`
- [ ] Add `vcskill graph` deriving edges from `## Workflow position`
- [ ] Promote `description-collision.ts` from advisory to blocking merge gate
- [ ] Add `metadata.upstream` + `upstream_sha` to distilled skills; enforce in lint
- [ ] Build the golden-task harness on the Anthropic skill-creator pattern
- [ ] Add the parity gate: checklist-coverage + outcome regression vs the `ak-*` source
- [ ] Install vcskill and disable the first `ak-*` counterpart (starts the incremental cutover)
- [ ] Update decision 0001 and `REFERENCE_MAX_LINES` for the router-thin / references-deep shape
- [ ] Update the README provider matrix and regenerate; confirm `matrix-drift` passes

## 9. Success metrics

| Metric | Target | How verified |
|---|---|---|
| `true` cells carrying source + retrieval date | 100% | `validate --check` fails otherwise |
| Artifacts written that the runtime never loads | 0 | manual confirmation per opened cell against runtime docs |
| Dangling `vc:*` references | 0 | `validate` lint exit code |
| Skills where `name` ≠ directory name | 0 | `skill-lint` |
| Distilled skills carrying `upstream_sha` | 100% of distilled | `validate` |
| Description-collision violations at merge | 0 | blocking gate exit code |
| Skills with a golden-task suite | 100% of tier-1 before Phase B starts | file presence + harness run |
| Parity gate: outcome regression vs source | pass-rate ≥ source on the golden suite | harness report |
| Install receipts present | ≥ 1 | `find … receipt.json` |
| `~/.vcskill/history.jsonl` weekly activity | non-empty every week | log inspection |
| `ak-*` skills still enabled | decreasing weekly, → 0 | `ls ~/.claude/skills` |
| `pnpm test` | green throughout | CI |

## Unresolved questions

1. Codex subagent `[agents.*]` TOML schema is sourced from GitHub issues and community posts, not an official OpenAI docs page — verify before implementing item B4.
2. Cursor's global commands path and hooks JSON schema are inferred from secondary sources — verify before opening those cells.
3. OpenCode plugin/hook docs came from an unofficial mirror, not `opencode.ai` directly.
4. Should the parity gate block merges or only warn during the first wave?
5. Does any golden-task corpus already exist in-repo to build on, or is item F11 greenfield?
6. Does the router-thin/references-deep shape conflict with `REFERENCE_MAX_LINES = 300` and decision 0001's lean-kit identity — raise the cap, or keep it and add more reference files?
7. `vc` alias remains taken by Vercel CLI on this machine — pick a different short alias, or accept `vcskill` only?

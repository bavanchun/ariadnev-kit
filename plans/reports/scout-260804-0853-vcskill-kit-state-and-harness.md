# Scout Report — vcskill kit state, pre-distill/upgrade

Date: 2026-08-04 · Scope: `vcskill/` (+ `vcskill-web/`) · Mode: read-only, 4 parallel Explore lanes + live CLI probes
Purpose: establish current state before a distill + harness upgrade pass.

## TL;DR

Engineering substrate is **healthy**; the **capability story is unverified**.

- Green: 364 vitest + 53 node:test pass, 99% stmt coverage on the gated subset, 3/3 plans shipped through 0.9.0, main in sync, no pending changesets.
- The install/adapt harness works but its correctness rests on **secondary sources** (claudekit Python generators), never on live provider CLIs.
- There is **no capability harness**: `vc eval` tier-1 is literally `validate`; tier-3 grades prose on 3 000 truncated chars. Nothing measures whether a distilled skill still *works*.
- Distillation is at **25/97** `ak-*` sources, and the distilled 24 average **~30% of source content mass** (some at 3–13%). "Parity-or-better" is asserted in README, not measured anywhere.
- The kit is **not currently installed** on this machine; the author's daily driver is AgentKit (97 `ak-*` skills in `~/.claude/skills`).

---

## 1. Live state probes (this machine, today)

| Probe | Result |
|---|---|
| `pnpm test` | 45 files / 364 tests pass; hooks suite 46 pass; smoke suite 7 pass |
| `validate --check` | `26 skills, 13 agents, 6 hooks — all checks passed` |
| `eval` | tier-1 output == validate output; `tier-3 skipped — set VCSKILL_EVAL_CMD` |
| install receipts | **none anywhere** (`find … receipt.json` empty) |
| `~/.vcskill/history.jsonl` | last install `2026-07-20` v0.6.0 (project scope); last eval `2026-07-24` v0.7.0 |
| `~/.claude/skills` | 128 dirs — 97 `ak-*`, 0 `vc:` kit skills |
| `command -v vc` | resolves to **Vercel CLI** (`nvm/.../bin/vc`), not vcskill |
| `dist/index.js` | 0.9.0, built Jul 25; embedded kit generated Jul 24 |

Two facts worth sitting with: the kit isn't dogfooded, and the `vc` alias it wants is already taken by Vercel on this box (installer's never-overwrite policy handles it safely, but the short alias is effectively unavailable here).

## 2. Harness — install/adapt layer (the product)

### 2.1 Matrix as implemented

Gate: `packages/cli/src/providers/spec-verified.ts:26-62`; paths: `resolver.ts:55-126`.

| provider | skill | agent | command | rules | scripts | env | hook |
|---|---|---|---|---|---|---|---|
| claude-code | ✓ | ✓ | ✓ | ✓ dir | ✓ | ✓ | ✓ |
| codex | ✓ | ✓ toml | ✓ | ✓ AGENTS.md | ✓ | ✓ | skip |
| cursor | ✓ | ~ **shim** | ✓ | ✓ mdc | ✓ | ✓ | skip |
| antigravity | ✓ | skip | skip | ✓ AGENTS.md | ✓ | ✓ | skip |
| opencode | ✓ | ✓ | ✓ | ✓ AGENTS.md | ✓ | ✓ | skip |
| generic | ✓ | skip | skip | ✓ AGENTS.md | ✓ | ✓ | skip |

Cursor "agent" is installed into `.agents/skills/<name>` (`resolver.ts:80`) — same physical dir as skills. Not a Cursor agent concept; name collision risk between a skill and an agent sharing a slug.

### 2.2 Verification provenance — the top harness risk

- `spec-verified.ts:1-4` states claims were verified against **shipped claudekit-engineer Python generators**, not current provider docs or binaries.
- `adapt/paths.ts:16` carries an explicit admission: `CODEX_COMMANDS_DIR = "commands"; // …flip to "prompts" if live Codex differs`.
- No test anywhere runs a real `codex` / `cursor` / `opencode` binary. `resolver.test.ts`, `provider-matrix.test.ts`, `matrix-drift.test.ts` are **internal-consistency** tests; `matrix-drift` only proves README matches the code, not that the code matches reality.
- `portable-manifest.json` records exactly one path migration (antigravity `.agent/skills` → `.agents/skills`) — evidence provider conventions do move, with no detection mechanism when they move again.

### 2.3 Rewrite engine fragility

- `adapt/path-rewrites.ts` rewrites via naive `content.split(from).join(to)` — not path-boundary or fence aware. Prose or code fences quoting `.claude/skills/` get rewritten too. Codex table has 15 overlapping prefix rules relying on longest-first sort (`:66`); a new rule added without checking overlap reorders silently.
- **Two independent tool-name maps** that must agree by hand: `adapt/tool-rewrites.ts` (body phrases) and `adapt/frontmatter.ts` `NAME_MAP` (frontmatter lists, with a STRIP sentinel). No shared source → drift risk.
- `toolNames` verified only for claude-code (identity) and codex. cursor/antigravity/opencode/generic tables are empty/minimal (`tool-rewrites.ts:30-38`) — those providers get skill bodies still naming Claude tools.
- Data-driven only for *paths and tool names*. Per-provider format quirks are hardcoded branches spread across `command-map.ts` (OpenCode frontmatter rebuild), `agent-to-toml.ts` (Codex TOML + heuristic `sandbox_mode`), `frontmatter.ts` (Cursor STRIP). `docs/provider-onboarding-guide.md` documents only the path-table extension path — a 7th harness with a new frontmatter shape needs new code, not new rows.

### 2.4 Capability gaps

- **Hooks**: 6 exist, claude-code only, hard skip for everyone else (`install-plan.ts:83-84`). By design per `kit/hooks/README.md:3-5`, but nothing has revisited it.
- **Rules degradation**: claude-code gets addressable `.claude/rules/*.md`; codex/antigravity/opencode/generic get one flat concatenated AGENTS.md block (`agents-md.ts:38-40`) — per-rule addressability lost.
- **Settings merge**: `hook-settings-merge.ts` is Claude-only. No equivalent for any other provider's native config.
- **MCP**: no surface at all. A dead rewrite rule for `.claude/.mcp.json` exists at `path-rewrites.ts:29` with nothing generating it.
- **Command args**: only OpenCode gets arg-hint handling; others pass frontmatter through raw.

### 2.5 Hook portability (if the harness layer is widened)

| hook | event | portability |
|---|---|---|
| session-init | SessionStart | **portable** — project detection is pure fs |
| session-state | Stop/SubagentStop | **portable** — git + markdown snapshot, only paths coupled |
| rules-inject | UserPromptSubmit | coupled to `.claude/rules/` existing (only claude-code is `rulesMode: dir`) |
| privacy-block | PreToolUse | **not portable** — needs Claude tool_input schema + exit-2-blocks convention + AskUserQuestion retry UX |
| scout-block | PreToolUse | **not portable** — same, plus hardcoded Claude tool names |
| subagent-init | SubagentStart | needs the harness to have a subagent-spawn event at all |

All six fail open (`_lib/fail-open.cjs`), which is the right default.

## 3. Harness — the missing capability/eval layer

`packages/cli/src/cli/eval-command.ts` read in full:

- Tier-1 (`:67`) is `runValidate(...)` — the same lint as `vc validate`. **No independent score.**
- Tier-3 (`:37-47`) truncates SKILL.md at 3 000 chars (`MAX_CONTENT`) and asks a judge for `clarity / specificity / completeness` only.
- Tier-2 is named in docs and comments but **does not exist in code**.

Consequence: there is no golden-task suite, no behavioral regression suite, no source-vs-distilled A/B. The README's claim that each skill earns its place by "a parity-or-better proof vs its source" has no executable backing.

## 4. Distillation reality check

Roadmap (`docs/distillation-roadmap.md`): 97 `ak-*` sources → **25 distilled, 8 rejected, 64 planned**.

Content mass — AgentKit `~/.claude/skills/ak-*` = **154 493** md LOC; `kit/skills/**` = **4 331** md LOC. Per shared skill:

| skill | ak LOC | vc LOC | ratio | | skill | ak | vc | ratio |
|---|---|---|---|---|---|---|---|---|
| skill-creator | 2107 | 54 | **3%** | | scenario | 229 | 95 | 41% |
| plan | 2115 | 166 | **8%** | | security-scan | 327 | 146 | 45% |
| fix | 1315 | 116 | **9%** | | worktree | 141 | 63 | 45% |
| sequential-thinking | 806 | 92 | **11%** | | research | 177 | 98 | 55% |
| code-review | 1330 | 162 | **12%** | | predict | 150 | 85 | 57% |
| docs-seeker | 574 | 70 | **12%** | | brainstorm | 124 | 99 | 80% |
| bootstrap | 417 | 56 | **13%** | | git | 760 | 962 | 127% |
| problem-solving | 676 | 88 | **13%** | | ask | 54 | 75 | 139% |
| ship | 565 | 117 | 21% | | handoff | 59 | 142 | 241% |
| review-pr | 681 | 157 | 23% | | journal | 28 | 93 | 332% |
| cook | 850 | 221 | 26% | | docs | 362 | 114 | 31% |
| scout | 353 | 108 | 31% | | test | 350 | 111 | 32% |

Median ≈ 30%. Aggressive compression is the stated intent — but with §3's gap, **nothing distinguishes "distilled well" from "lost the substance"**. The 3–13% band is where that question is sharpest.

## 5. Kit content vs its own stated bar

`vcskill validate` passes, but validate enforces only: `name == vc:<slug>`, description 50–200 chars, SKILL.md ≤300 (ceiling 400) lines, reference ≤300 lines, reference integrity (`kit/skill-lint.ts:8-11, 87-109`). **It does not enforce the 4-section cook-grade bar the README claims every skill meets.**

Literal heading counts across the 26 skills:

| required section | present |
|---|---|
| `## Quality gates` | 21/26 |
| `## Workflow position` | 18/26 |
| `## Output format` (exact) | 10/26 — plus 7 `## Output`, 2 `## Report format`, 1 `## Output Format` |

- **8/26 fully spec-literal compliant** (ask, code-review, handoff, problem-solving, review-pr, sequential-thinking, ship, test).
- `cook` — the spec's own reference implementation — has **no `## Workflow position`**.
- `skill-creator` — the skill that authors and audits skills — has **none of the three**.
- `plan` has no output section at all.
- Dangling forward-reference: `sequential-thinking/SKILL.md` cites `vc:debug`, which is `planned`, not built.
- `vc:git` is the heaviest node: 246-line body + 7 references = 962 LOC, and is the only skill carrying non-technical content (GitHub achievement gamification).
- `## Proof/risk` wiring (spec point 5) appears explicitly in only 9/26; 12/26 never declare it or an explicit N/A.

**Agents and rules are clean.** 13/13 agents pass every mechanical check (name==stem, `<example>`/`<commentary>`, ≤120 lines, `Behavioral Checklist`); the 3 rules files are mutually consistent and no skill contradicts them.

## 6. Delivery, CI, hygiene

- Version 0.9.0. All 3 tracked plans complete. No pending changesets. `main` in sync with origin.
- CI: typecheck → build → `validate --check` (kit + matrix drift) → coverage gate → node:test suites. Release: changesets Version-PR → cross-compile via Bun → smoke-test host binary → `gh release` upload with `checksums.txt`. No npm publish by design. No SLSA/attestation step.
- Coverage reported 99.03% stmt / 94.27% branch overall — but the **gate covers <40% of `src/`**: only `adapt/`, `ui/`, `cli/emit.ts`, `doctor/audit-score.ts`, `security/`, `eval/`, `history/`, `telemetry/`. `install/`, `kit/`, `providers/` and most of `cli/` have tests but **no enforced threshold**.
- Over the repo's own 200-LOC rule: `cli/index.ts` 330, `cli/update-command.ts` 226, `providers/resolver.ts` 224.
- Telemetry is wired but inert — `index.ts:271` hardcodes `url: undefined` (intentional, documented).
- Embedded-kit regeneration is a manual pnpm step with **no prebuild hook** — a stale `kit-embedded.generated.ts` can ship.
- 4 stale branches: `fix/release-provenance-pin-sha` (empty diff, merged), `feat/distill-agentkit-wave0-wave1` (shipped as `fa04d27`), `changeset-release/main` (stale bot branch), `feature/release-ci-providers` (−18 338 lines, pre-binary era, abandoned).
- `vcskill-web` routes (`/install`, `/install.ps1`, `/version`, `/download/<asset>`) match `install.sh` expectations — no drift.

## 7. The untracked `vchun/` workspace

`vcskill/vchun/` is untracked (`git status ??`) and is **not kit content**. It's a personal "chief-of-staff" governance workspace: `identity.md`, `AGENTS.md`, `docs/provider-routing.md`, `docs/herdr/*`, its own `plans/` with 6 researcher reports (dated 2026-07-25) and a `vchun-chief-of-staff.zip`.

It matters here because it contains a **second, richer notion of "harness"** than the CLI's: a live cross-CLI routing policy (Codex `gpt-5.6-sol`, Claude Code Opus 5, GLM-5.2 via Z.AI, Antigravity Gemini 3.6) with model/effort routing tables, handoff contracts, and a Herdr-only delegation gate. Its own journal (`plans/journals/260725-1545-agentkit-harness-research.md`) closes with the open item: *"Decide separately whether the currently untracked `vchun/` governance files should become version-controlled."*

If "upgrade the harness" means the runtime/routing policy rather than the installer, **this directory is the real subject**, and it currently lives outside version control inside another project's tree.

## Unresolved questions

1. **Which harness?** The install/adapt layer (§2), the missing eval layer (§3), or the personal cross-CLI routing policy in `vchun/` (§7)? The three imply very different upgrades.
2. Should distillation continue toward the 97-skill 1:1 mirror (64 planned remain), or should the existing 25 be re-deepened first? At current mass ratios, breadth and fidelity are competing.
3. Is the 3–13% compression band (skill-creator, plan, fix, sequential-thinking, code-review, docs-seeker, bootstrap, problem-solving) intentional distillation or unmeasured loss? Cannot be answered without an eval harness.
4. Is non-dogfooding deliberate? Nothing is installed; `~/.claude` runs AgentKit. Should the kit be installed and driven for a wave before more skills are added?
5. `vc` alias is taken by Vercel CLI on this machine — accept, or pick a different short alias?
6. Does the harness upgrade include extending hooks/settings-merge beyond claude-code, or only re-verifying existing provider claims against live CLIs?
7. `vchun/` — track it here, relocate it to its own repo, or gitignore it?
8. Is `vc:git`'s 246-line body with GitHub-achievement gamification intentional personal scope, or a trim target?
9. Should `vc:obsidian-second-brain-note` (self-declared outside the dev-loop graph, no `ak-*` source) stay in the shared kit?
10. Delete the 4 stale branches?

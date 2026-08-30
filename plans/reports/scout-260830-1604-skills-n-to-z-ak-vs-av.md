# Scout: AgentKit 2.14.0 vs ariadnev skills, n–z (content axis)

Date: 2026-08-30. Read-only. No tests, installs, or builds run.

Sources
- ak: `/Users/vchun/Codes/My-projects/vcskill-kit/.claude/skills/ak-<name>/` (45 skills in range: 43 shared + `sowat`, `sumup`)
- av: `/Users/vchun/Codes/My-projects/vcskill-kit/ariadnev-kit/kit/skills/<name>/` (46 in range: 43 shared + `obsidian-second-brain-note`, `plan-i18n`, `pm`)
- Authoring bar read once: `packages/cli/src/kit/skill-lint.ts` — SKILL.md ≤300 lines (ceiling 400 via `metadata.maxLines`), references ≤800, description 20–200 chars w/ trigger verb, required `## Output format` / `## Quality gates` / `## Workflow position`. So every av SKILL.md shrink + `## Output format/Quality gates/Workflow position` add is house style, NOT a gap. Reference splits (payment-integration, preview) verified heading-by-heading: no ak H2 missing from av dir.

Method: normalized inventory (`ak-`/`av-` → `X:`) of frontmatter, H2/H3, file lists+sizes; `diff` on sorted listings; `rg` for each ak-only feature keyword over the whole av skill dir before calling anything missing. Full reads only where a listing showed a real delta.

Note: a repo hook blocks Bash access to any path containing `vendor`, so `ak-preview/references/vendor/diagram-design-scripts/*` was inventoried by name only (5 files: `PROVENANCE.md`, `UPSTREAM-LICENSE`, `run-validators.sh`, `self_check.py`, `verify-geometry.py`, `verify-motion.py`).

## 1. Summary table

Columns: ak refs/scripts → av refs/scripts (file counts; SKILL.md lines in parens).

| skill | ak | av | gap class | note |
|---|---|---|---|---|
| orchestrate | 5/0 (366) | 5/0 (166) | sections (P3) | av v1.4 vs ak v1.5; ak adds `ak orchestrate` CLI delegation (ak-CLI-only). Arbiter Checklist / Failure Modes lists only partly in av (`Quality gates`, `references/internal-routing.md`) |
| payment-integration | 20/6 (81) | 23/6 (107) | none | av split 3 oversized refs into 6; every ak H2 present |
| plan | 14/0 (676) | 18/0 (297) | **flags** | ak adds `--debate`, `--ultra`, `--no-antv\|--no-diagram-design\|--no-editorial-visuals`; sections Mode Exclusivity, Generated-File Read Pass absent. av already extracted advisory/html/github/wiki into refs (not gaps) |
| plans-kanban | 0/5 (110) | 0/5 (53) | none (ak-CLI) | ak body = `ak config start` dashboard, migration, troubleshooting; av launcher shells to `av plan list` |
| predict | 0/0 (150) | 0/0 (171) | none | |
| preview | 16/0 (173) | 12/0 (211) | **references+flags** | ak "Editorial visual layer" (AntV Infographic + diagram-design) + 2 refs + vendored validators; av split html-css/slide patterns (verified, not gap) |
| problem-solving | 7/0 (126) | 7/0 (123) | flags | `--ultra` only (ak v2.1 vs av v2.0) |
| project-management | 5/0 (137) | 5/0 (157) | none | |
| project-organization | 3/0 (232) | 3/0 (255) | none | |
| react-best-practices | 0/0 (129) | 0/0 (150) | none | 51 rule files identical |
| remotion | 0/0 (58) | 0/0 (79) | none | |
| repomix | 2/5 (257) | 2/5 (278) | none | |
| research | 0/0 (201) | 0/0 (197) | flags | `--ultra` only (ak v1.1 vs av v1.0) |
| research-prompt | 0/0 (57) | 0/0 (78) | none | |
| retro | 2/0 (150) | 2/0 (165) | flags (dependent) | `--no-antv…` kill switches + editorial timeline/progress/radar hints; only meaningful if preview layer is ported |
| review-pr | 5/0 (567) | 6/0 (293) | **flags+scripts+sections** | ak v2.5 vs av v2.3: multi-PR mode, `--ultra`, GraphQL-blocked REST fallback + `gh-api-helpers.sh`, `Bash(source *)` allow; av moved reply/merge into `reply-and-merge.md` (not gap) |
| scenario | 0/0 (229) | 0/0 (249) | none | |
| scout | 2/0 (147) | 2/0 (141) | flags | `--ultra` only |
| security | 2/0 (196) | 2/0 (219) | none | |
| security-scan | 2/0 (145) | 2/0 (164) | none | |
| sequential-thinking | 6/2 (101) | 8/2 (122) | none | av superset (+2 refs) |
| shader | 12/0 (119) | 12/0 (138) | none | |
| ship | 6/2 (244) | 3/2 (183) | **flags+references** | ak v2.3 vs av v2.1: `--both`, `--merge`, `--advice`, aliases `stable\|main\|dev\|next`; 3 refs absent; ak ship-workflow Step 13 review+merge absent |
| shopify | 3/3 (327) | 3/3 (133) | none | restructure; Liquid/checkout/troubleshooting content lives in av refs |
| show-off | 0/4 (244) | 0/4 (252) | sections (dependent) | ak "Handoff Gate" section → `../ak-design/references/handoff-gate.md` (d range; av design has no such file); `--no-antv…` flags |
| skill-creator | 24/4 (156) | 22/5 (161) | flags+references | ak v4.2 vs av v4.0: `--advice`; `cross-marketplace-distribution.md`, `script-dependency-strategy.md` + "Dependency Strategy" H2 in script-quality-criteria.md |
| stitch | 4/4 (193) | 4/4 (212) | none | |
| tanstack | 3/0 (148) | 3/0 (166) | none | |
| team | 4/0 (226) | 4/0 (246) | none | |
| tech-graph | 10/5 (445) | 11/6 (223) | references (P3) | ak `svg-layout-best-practices.md` (universal spacing/routing/z-index/anti-patterns/validation checklist) only partially covered by av SKILL "Layout Rules" + `svg-authoring.md`; `Vendoring Notes` = maintainer-only |
| test | 6/0 (200) | 3/0 (138) | **flags+references** | ak v1.1 vs av v1.0: `create\|optimize\|audit [scope]`, `--advice`, `--ultra`, `--interview`; 3 workflow refs absent; `metadata.workflow.precedes` |
| threejs | 20/4 (148) | 20/5 (169) | none | |
| ui-styling | 7/7 (328) | 7/7 (130) | none | restructure; all scripts/refs identical |
| ui-ux-pro-max | 0/3 (666) | 3/4 (212) | none | av superset (3 refs + requirements.txt); persist/master/checklists present |
| use-mcp | 3/7 (82) | 3/7 (95) | none | |
| vibe | 0/0 (287) | 1/0 (292) | none | identical argument-hint incl. `--both`/`--advice`; av extracted github-artifacts.md |
| watzup | 0/5 (80) | 0/5 (130) | none | av superset |
| web-design-guidelines | 0/0 (43) | 0/0 (62) | none | |
| web-frameworks | 8/8 (332) | 8/8 (149) | sections (P3) | "Implementation Checklist" (15 items) absent; RemixIcon/CI content in refs |
| web-testing | 24/2 (103) | 24/2 (125) | none | |
| worktree | 0/5 (174) | 0/2 (154) | **scripts+sections** | `resolve-worktree-root.cjs`, `mini-yaml-parser.cjs`, `.test.cjs` + "Configuring a default worktree root"; av `worktree.cjs` resolves flag→env only |
| xia | 1/0 (197) | 1/0 (234) | none | `--compare` present |
| sowat | 0/0 (41) | — | ak-only | product-owner "so what / next steps" recap; no av equivalent |
| sumup | 0/0 (48) | — | ak-only | post-implementation technical recap; no av equivalent |

## 2. Ranked gap list

### P1 — user-noticeable capability (mode, flag, script, workflow step)

| # | skill | ak source → av target | port | effort |
|---|---|---|---|---|
| 1 | ship | `ak-ship/SKILL.md` (Dual-target ship, Advisory supervision, mode table rows `--both`/`--merge`/aliases, Step 13) + `ak-ship/references/{dual-stage-workflow.md (86), review-and-merge-workflow.md (31), release-and-social-workflow.md (117)}` + `ak-ship/references/ship-workflow.md` "Mandatory advice checkpoint after Steps 4-5", "Step 13: Review, fix, reply, and merge" → `kit/skills/ship/SKILL.md`, `kit/skills/ship/references/` | argument-hint `[official\|stable\|main\|beta\|dev\|next] [--both] [--advice] [--merge]`; alias normalization; `--merge` → `av:review-pr <PR> --fix --reply --merge [--advice]`; `--both` beta-then-stable gate; kongming checkpoints. Note av `vibe` already advertises `--both`/`--advice` and expects ship to honor them — today it cannot | M |
| 2 | review-pr | `ak-review-pr/SKILL.md` "Multi-PR mode", "GitHub API compatibility" (+ "Merge write op", "Self-PR approve"), "Final output → Per-PR table / Aggregate", `allowed-tools: Bash(source *), Bash(. *)`; `ak-review-pr/references/gh-api-helpers.sh` (185 lines, 9 funcs: `_ak_probe_gh_api`, `_ak_split_pr`, `_ak_pr_{meta,diff,files,checks,body,review,comment}`) → `kit/skills/review-pr/SKILL.md`, `kit/skills/review-pr/references/gh-api-helpers.sh` | Multiple PR refs per call (sequential, no fail-fast); GraphQL-403 probe → REST `gh api repos/…` fallback; loader ladder must be rewritten for av install paths (`.claude/skills/av-review-pr/…`, `~/.claude/skills/av-review-pr/…`) and `_ak_`→`_av_` prefix; keywords `multi-pr, graphql, rest, cloud-environment` | M |
| 3 | test | `ak-test/SKILL.md` §4–6 + "Flags (create / optimize / audit)" + "Advisory supervision" + `metadata.workflow.precedes`; `ak-test/references/{create-suite-workflow.md (60), optimize-suite-workflow.md (61), audit-suite-workflow.md (70)}` → `kit/skills/test/SKILL.md`, `kit/skills/test/references/` | `create` (scout→coverage matrix→suite), `optimize` (parallel lanes, change-based selection, docs-only skips), `audit` (detect deceptive/skipped/unfinished tests); `--advice`, `--interview` (list changes, one decision per group). `--ultra` optional (see cross-cutting) | M |
| 4 | worktree | `ak-worktree/SKILL.md` "Configuring a default worktree root"; `ak-worktree/scripts/{resolve-worktree-root.cjs (266), mini-yaml-parser.cjs (232), resolve-worktree-root.test.cjs (257)}`; `ak-worktree/scripts/worktree.cjs` lines ~32, 371–412 (`getWorktreeRoot` precedence flag > project config > user config > env) + `worktree.test.cjs` delta (1127 vs 950) → `kit/skills/worktree/scripts/`, `kit/skills/worktree/SKILL.md` | Persisted `worktree.root` at project (relative-only, security note) and user scope. **Caveat:** ak reads `.agentkit/config.yaml` / `~/.agentkit/config.yaml` written by `ak config prefs set`; av CLI has only `config prefs resolve` and no `worktree` key in `packages/cli/src/config/config-schema.ts`. Content-only port = scripts read `.ariadnev/config.yaml`; the `set/unset` verbs are CLI scope (out of this report) | M |
| 5 | plan | `ak-plan/SKILL.md` "Mode Exclusivity", "Debate Mode (`--debate`)", "Ultra Mode (`--ultra`)", "Mandatory Generated-File Read Pass"; `ak-plan/references/workflow-modes.md` §"Debate Mode", §"Ultra Mode" (424 vs av 216 lines) → `kit/skills/plan/SKILL.md`, `kit/skills/plan/references/workflow-modes.md` | argument-hint `--debate`/`--ultra`; mode-flag mutual exclusion hard stop; read-every-generated-stub rule before writing phases (av has no equivalent wording: `enerated-file` 0 hits). Skip `## Prerequisites` (ak-CLI). `--no-antv…` flags belong with gap 6 | S–M |
| 6 | preview (+plan/retro/show-off consumers) | `ak-preview/SKILL.md` "Editorial visual layer (on by default, additive)" + argument-hint kill switches; `ak-preview/references/html-antv-infographic.md` (140), `html-diagram-design.md` (156), `references/vendor/diagram-design-scripts/{run-validators.sh, self_check.py, verify-geometry.py, verify-motion.py, PROVENANCE.md, UPSTREAM-LICENSE}`; consumer lines `ak-plan/SKILL.md:324-339`, `ak-retro/SKILL.md:138-143`, `ak-show-off` argument-hint → `kit/skills/preview/references/`, `kit/skills/{plan,retro,show-off}/SKILL.md` | AntV Infographic (`@antv/infographic@0.2.19`, SRI-pinned) for KPI/compare panels; diagram-design (22 layout types) HTML+SVG with geometry/motion validators; per-intent engine table; 3-tier opt-out. **Caveat:** ak resolves toggles via `ak config prefs resolve --json .prefs.visual`; av has `config prefs resolve` but no `visual` schema key — port as flag-only (`--no-antv` etc.) or add schema key (CLI scope). Vendor dir unreadable here (hook) — port requires maintainer to copy + re-verify PROVENANCE pin | L |
| 7 | sowat (ak-only) | `ak-sowat/SKILL.md` (41 lines, no refs/scripts) → new `kit/skills/sowat/` | Product-owner lens on just-shipped work: "So what / Priority correction / ≤3 next steps / Defer". Nearest av: `watzup` (git/plan status, not product judgment), `pm` (plan truth), `retro` (git metrics). None does priority correction. Needs av required sections + `origin: ported` | S |
| 8 | sumup (ak-only) | `ak-sumup/SKILL.md` (48 lines) → new `kit/skills/sumup/` | Post-implementation recap: Outcome / Highlights / Failures+recovery / Decisions / How it works (w/ table or Mermaid) / How to use / Follow-ups. Nearest av: `handoff` (successor-agent contract, redacted), `journal` (chronological). Neither is a human-facing "what changed & how to use" recap | S |

### P2 — reference material av lacks

| # | skill | ak source → av target | port | effort |
|---|---|---|---|---|
| 9 | skill-creator | `ak-skill-creator/SKILL.md` "Advisory supervision (`--advice`)" + argument-hint; `references/cross-marketplace-distribution.md` (262 — Claude/Codex/skills.sh manifests around one SKILL.md, dated 2026-08-20), `references/script-dependency-strategy.md` (141 — no per-skill dep footprint; PEP 723 / pinned runner), `references/script-quality-criteria.md` §"Dependency Strategy" + "conditional" requirements.txt/package.json wording → `kit/skills/skill-creator/` | Note av already ships `scripts/requirements.txt` in 5 skills (skill-creator, tech-graph, threejs, ui-ux-pro-max, …) which the ak strategy doc argues against — decide policy before porting | S |
| 10 | research / scout / problem-solving (+ plan, review-pr, test) | `ak-research/SKILL.md` "Ultra Verifier Mode", `ak-scout/SKILL.md` same, `ak-problem-solving/SKILL.md` same (each ~20 lines, skill-specific packet/rubric); shared protocol `ak-brainstorm/references/ultra-verifier-mode.md` (167 lines, **b range — out of scope here; av `brainstorm/` has no references dir**) → `kit/skills/{research,scout,problem-solving,plan,review-pr,test}/SKILL.md` + `kit/skills/brainstorm/references/ultra-verifier-mode.md` | `--ultra` = best-of-5 parallel candidates + single strongest-model verifier, explicit opt-in. 13 ak skills reference the shared protocol; av has 0 hits kit-wide. Port the shared ref first (cross-range decision), then the 6 per-skill stanzas (S each) | M total |
| 11 | tech-graph | `ak-tech-graph/references/svg-layout-best-practices.md` (100) → `kit/skills/tech-graph/references/` | Universal rules (component spacing, arrow routing/connection points, arrow label placement, overlap detection, z-index order), style-1/6 enhancements, validation checklist, anti-patterns. av SKILL "Layout Rules" has 8px grid + arrow labels; `svg-authoring.md` has overlap/repair; z-index, connection points, anti-pattern list absent | S |

### P3 — cosmetic / wording

| # | skill | ak source → av target | port | effort |
|---|---|---|---|---|
| 12 | orchestrate | `ak-orchestrate/SKILL.md` "Arbiter Checklist" (9 questions), "Failure Modes" (6 bullets), "Routing Invocation", "Metrics and Self-Improvement" → `kit/skills/orchestrate/SKILL.md` or `references/internal-routing.md` | av `Quality gates` covers 1 of 9 arbiter questions; failure modes partly in `internal-routing.md` (timeout, interrupted). Skip the `ak orchestrate resume` reconnect bullets (ak-CLI) | S |
| 13 | web-frameworks | `ak-web-frameworks/SKILL.md` "Implementation Checklist" (15 items) → `kit/skills/web-frameworks/SKILL.md` or `references/turborepo-setup.md` §Initialization Checklist | Stack-level checklist; av only has Turborepo-init checklist | S |
| 14 | show-off | `ak-show-off/SKILL.md` "Handoff Gate (mandatory before delivering)" → `kit/skills/show-off/SKILL.md` | 5-dimension gate; depends on `ak-design/references/handoff-gate.md` (d range; absent in av design). Port only together with that file | S (+d-range dep) |
| 15 | review-pr | `ak-review-pr/SKILL.md` "Final output → Per-PR table / Aggregate" → `kit/skills/review-pr/SKILL.md` §Output format | Only meaningful after gap 2 (multi-PR) | S |
| 16 | test | `ak-test/SKILL.md` frontmatter `metadata.workflow.precedes: [ak-code-review]` → av `metadata` | av states it in prose ("Typically precedes"); machine-readable key is optional; `metadata` is an allowed field in skill-lint | S |
| 17 | ship | `ak-ship/SKILL.md` keywords `advice, kongming, review-pr` | with gap 1 | S |

### No gap (one line each)

payment-integration (av superset, splits verified) · plans-kanban (ak body is `ak` CLI dashboard ops) · predict · project-management · project-organization · react-best-practices · remotion · repomix · research-prompt · scenario · security · security-scan · sequential-thinking (av +2 refs) · shader · shopify (restructure; content in same 3 refs) · stitch · tanstack · team · threejs · ui-styling (restructure; 97 files identical) · ui-ux-pro-max (av +3 refs) · use-mcp · vibe (argument-hint identical; av extracted github-artifacts.md) · watzup (av superset) · web-design-guidelines · web-testing · xia (`--compare` present).

## 3. Deliberately absent (non-goals / ak-CLI-only)

- `plans-kanban`: ak `## Quick Start`, `## Dashboard Workflow`, `## Compatibility And CLI Authority`, `## Migration Notes`, `## Troubleshooting`, `scripts/open-dashboard.cjs` (220 lines) — all wrap `ak config start --port 8766` dashboard GUI. av launcher (18 lines) shells to `av plan list`. GUI = commercial-product surface, non-goal.
- `plan` `## Prerequisites` ("AgentKit CLI required") — ak-CLI-only.
- `orchestrate` `## Job Spec` → `references/job-spec.md` §"Delegating CLI Job Execution To `ak orchestrate`" and the `ak orchestrate resume <run-id>` reconnect bullets in Failure Modes — Darwin-only ak binary feature; one line, not expanded.
- `worktree` / `preview` / `retro` / `show-off` config resolution via `ak config prefs set|resolve` and `.agentkit/config.yaml` — CLI-side surface; the content around it is listed above with caveats.
- `tech-graph` `## Vendoring Notes` — links to ak monorepo maintainer docs (`docs/operations/maintainer-sync-workflow.md`); av has its own vendoring attribution in SKILL.md.
- `review-pr` "Merge write op" paragraph references `kits/core/skills/ak-git/references/workflow-merge-pr.md` (g range) — only the note that GitHub auto-merge is GraphQL-only matters; belongs with gap 2.
- Frontmatter `metadata.author: agentkit` vs av `origin: ported / author: upstream` — brand rename, not a gap.
- Nothing in the n–z range touches auth/licensing, telemetry, analytics GUI, dashboard/API, projects registry, sessions/activity, or content-search beyond `plans-kanban` above.

## 4. Unresolved questions

1. `--ultra` (gap 10): the shared protocol lives in `ak-brainstorm/references/` (b range). Is av dropping ultra kit-wide on purpose (0 hits in skills, docs, plans, parity-audit.ts) or has it just not been ported? Decides whether 6 in-range skills get the stanza.
2. Editorial visual layer (gap 6): depends on `config prefs` `visual.*` keys av's schema lacks, and on a `vendor/` dir this scout could not read. Port flag-only, or extend `config-schema.ts` first?
3. `worktree.root` (gap 4): same dependency — av CLI has `config prefs resolve` only. Is adding `prefs set/unset` + a `worktree` schema key in scope for the parity plan?
4. `script-dependency-strategy.md` (gap 9) contradicts av's current practice of shipping `scripts/requirements.txt` in 5 skills. Which policy wins?
5. `show-off` Handoff Gate needs `design/references/handoff-gate.md` (d range) — confirm with the a–m scout whether that file is being ported.
6. ak `review-pr` allowed-tools adds `Bash(source *)` / `Bash(. *)`; does av's `av-invocation-lint.ts` permit sourcing a shell library from a skill reference?

```
Status: DONE_WITH_CONCERNS
Summary: 43 shared n–z skills compared plus sowat/sumup; 8 P1 gaps (ship --both/--merge/--advice/aliases, review-pr multi-PR + REST fallback lib, test create|optimize|audit, worktree persisted root, plan --debate/--ultra/mode-exclusivity, preview editorial visual layer, sowat, sumup), 3 P2, 6 P3; 27 skills at parity or av-superset.
Concerns/Blockers: `references/vendor/` under ak-preview blocked by a repo hook (inventoried by name only); three P1 gaps (worktree root, editorial layer, plan/preview kill-switches) lean on `config prefs set` + schema keys av's CLI lacks, so they are only partly content-axis; `--ultra` shared protocol sits in b range.
```

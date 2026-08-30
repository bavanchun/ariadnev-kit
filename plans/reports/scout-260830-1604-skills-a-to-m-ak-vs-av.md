# Scout: AgentKit 2.14.0 vs ariadnev skills, a–m (content axis only)

Sources: ak `/Users/vchun/Codes/My-projects/vcskill-kit/.claude/skills/ak-<name>/`, av `/Users/vchun/Codes/My-projects/vcskill-kit/ariadnev-kit/kit/skills/<name>/`.
Method: sorted file-tree diffs, frontmatter diffs (name/description excluded), H2/H3 diffs, flag extraction (`--x` tokens in ak md absent from whole av skill dir), keyword greps in av before calling anything missing.
Bar applied (`packages/cli/src/kit/skill-lint.ts`): SKILL.md ≤300, refs ≤800, description ≤200, required `## Output format` / `## Quality gates` / `## Workflow position`. Section moved to `references/` = not a gap. The three required sections appear as "av-only" headings in every skill; ignored below.

Range: 60 ak, 59 av, 56 shared. ak-only: `agentkit ak bro diagram`. av-only: `ariadnev av`.

## 1. Summary table

Files = non-SKILL.md files (refs+scripts+assets). Gap class: none / flags / refs / scripts / sections / ak-only.

| skill | ak files | av files | gap | note |
|---|---|---|---|---|
| advise | 0 | 0 | flags | `--ultra`, `--no-antv…` absent; "Communication Style" 2-liner absent |
| agent-browser | 3 | 3 | none | identical tree |
| agentize | 8 | 6 | flags+refs | `--ultra`, `--advice`; refs `code-mode.md`, `oauth-streamable-http.md` absent |
| ai-artist | 15 | 9 | none | 8 ak refs are orphan prompt-engineering leftovers (not linked from ak SKILL.md) |
| ai-multimodal | 9 | 9 | none | `skill.yaml` 130→207 B only |
| ask | 0 | 0 | none | "Important" note folded |
| autoresearch | 0 | 0 | none | |
| backend-development | 11 | 12 | none | av +`backend-production-debugging.md` |
| better-auth | 7 | 7 | none | |
| bootstrap | 5 | 5 | flags | `--ultra` |
| brainstorm | 2 | 0 | flags+refs | `--ultra`, `--report`, `--no-antv…`; refs `ultra-verifier-mode.md`, `advisory-supervision.md` (av inlines advice, links none) |
| chrome-profile | 11 | 12 | none | av +requirements.txt |
| code-review | 13 | 13 | flags | `--ultra`, `--advice` |
| codex-goal | 0 | 0 | none | |
| coding-level | 0 | 0 | none | `--force/--fresh` are ak-CLI |
| common | 1 | 0 | none | ak README documents `api_key_helper.py` that neither kit ships |
| context-engineering | 13 | 14 | none | |
| cook | 7 | 9 | none | av richer (advisory+anti-rationalization refs); `--comment-id/--github` are ak-CLI |
| copywriting | 10 | 11 | none | |
| cti-expert | 112 | 122 | flags | ak SKILL 927 lines → av 249 + 7 refs (covered); `--format html` HTML mirror + `--no-antv…` absent |
| databases | 18 | 18 | none | |
| debug | 12 | 12 | flags | `--ultra` |
| deep-swe | 1 | 1 | none | |
| deploy | 16 | 16 | none | |
| design | 163 | 164 | refs | `references/handoff-gate.md` absent; built-ins moved to refs (covered) |
| devops | 18 | 18 | none | |
| docs | 9 | 7 | sections+refs | `agents` mode + `--source`; refs `agents-workflow.md`, `practical-principles-…tests.md` absent; ak 1.9.0 vs av 1.4.0 |
| docs-seeker | 16 | 16 | none | |
| document-skills | 126 | 128 | none | av +lock +requirements |
| excalidraw | 11 | 13 | none | "Quality Checklist" → av Quality gates |
| fable-thinking | 3 | 4 | none | ak 399 lines → av 297 + `reasoning-techniques.md` (Anti-Patterns/When Stuck/Self-Review present) |
| find-skills | 1 | 1 | none | |
| fix | 13 | 15 | flags | `--ultra` |
| folder-context | 1 | 1 | none | |
| frontend-design | 24 | 23 | refs+sections | `references/design-quality-preflight.md` + `## Handoff` absent; Self-Review countable checks present inline |
| frontend-development | 10 | 11 | none | ak 407 → av 244 + `quick-reference.md` |
| git | 10 | 10 | none | `--linked-pr` is ak-CLI |
| github | 9 | 9 | none | |
| gkg | 4 | 4 | none | |
| goal-warmup | 12 | 12 | none | |
| google-adk-python | 7 | 7 | none | |
| graphify | 0 | 0 | none | Workflow Integration content present |
| handoff | 3 | 3 | none | Security/redaction covered by `redaction-patterns.md` |
| handover | 2 | 3 | none | 7 scenarios → av `references/scenarios.md` |
| help | 0 | 0 | none | |
| html-video | 0 | 0 | none | |
| hyperframes | 6 | 6 | none | |
| interview-docs | 1 | 1 | none | |
| issue-to-plan | 0 | 0 | none | |
| journal | 21 | 21 | none | `post-social.test.cjs` 19034→16609 B (test only); `--date/--stdin…` are ak-CLI |
| llms | 2 | 3 | none | |
| loop | 5 | 4 | none | ak `results-logging.md` orphan; av has `## Results Logging` inline |
| markdown-novel-viewer | 17 | 19 | none | ak 319 → av 145 + reader-guide + mermaid-diagrams (Remote/Customize/Troubleshoot/Routes covered) |
| mcp-builder | 9 | 11 | none | av +`agent-centric-design.md`; av requirements.txt pinned |
| media-processing | 21 | 21 | none | |
| mermaidjs-v11 | 5 | 5 | none | |
| mintlify | 6 | 7 | none | |
| mobile-development | 6 | 7 | none | |
| **agentkit** | 3 | — | ak-only | = `av-ariadnev` (same 3 refs: chaining-patterns, subagent-timing, task-taxonomy). No gap |
| **ak** | 1 | — | ak-only | = `av-av`; ak ships `references/command-reference.md`, av-av has no refs. CLI-only, skip |
| **bro** | 0 | — | ak-only | 32-line "restate last message plainly" command. No av equivalent (grep restate/plainly/jargon in av SKILL.md: only incidental hits) |
| **diagram** | 108 | — | ak-only | editorial diagrams: 24 template types × dark/full/light HTML, vendored mermaid 11.4.1, animated SVG connectors, PNG/SVG/HTML/MP4/GIF via `scripts/render.py record.py doctor.py snapshot_test.py vendor_from_upstream.py`. Partial av cover: `tech-graph` (SVG+PNG, 7 styles), `mermaidjs-v11`, `excalidraw`, `preview`. No av animated/video or per-type schema templates |

## 2. Ranked gap list

### P1 — user-noticeable mode / flag / step

| # | gap | ak source | av target | port | effort |
|---|---|---|---|---|---|
| 1 | `--ultra` Ultra Verifier Mode (7 skills in range; ak ref also names plan, review-pr, scout, research, problem-solving, test outside range) | `ak-brainstorm/references/ultra-verifier-mode.md` (167 l; H2: What/When/Roles/Fail-closed rule/Protocol/Asymmetric finalizer/Code-review stage mapping/Cost) + `## Ultra Verifier Mode` sections in `ak-advise`(37 l) `ak-agentize`(22) `ak-bootstrap`(15) `ak-brainstorm`(23) `ak-code-review`(27) `ak-debug`(23) `ak-fix`(22) | `brainstorm/references/ultra-verifier-mode.md` + section + `argument-hint` `[--ultra]` in `advise agentize bootstrap brainstorm code-review debug fix` | shared ref once; per-skill ~20-line section; bump versions (agentize 1.1.0, bootstrap 1.1.0, brainstorm 2.7.0, debug 4.1.0, fix 2.3.0). Watch SKILL ≤300: brainstorm 257, fix 299, cook 299 → fix must move something to refs | M |
| 2 | `/docs agents` mode + `--source` (mine git/CI history → DO/DON'T rules in root CLAUDE.md/AGENTS.md) | `ak-docs/SKILL.md` (mode row L56, `--source` L80, when_to_use, keywords) + `ak-docs/references/agents-workflow.md` (268 l) + `ak-docs/references/practical-principles-for-setting-up-and-running-tests.md` (85 l; linked from ak agents/update/init/agent-context-rules refs) | `docs/SKILL.md` (argument-hint `init\|update\|summarize\|agent-context\|agents\|llms`, when_to_use) + `docs/references/agents-workflow.md` + `docs/references/practical-principles-…md` | version 1.4.0 → 1.9.0; av docs SKILL 169 lines has room | M |
| 3 | `--advice` kongming supervision on `code-review`, `agentize` | `ak-code-review/SKILL.md` `## Advisory supervision` (19 l); `ak-agentize/SKILL.md` same (22 l) | `code-review/SKILL.md`, `agentize/SKILL.md` + argument-hint | av already ships shared protocol at `cook/references/advisory-supervision.md` — link, do not copy | S |
| 4 | `brainstorm --report` (persist accepted brainstorm to `plans/…/reports/brainstorm-{stamp}-{slug}.md`) | `ak-brainstorm/SKILL.md` `## Report Output Mode` | `brainstorm/SKILL.md` + argument-hint | ~15 lines; composes with `--html` | S |
| 5 | `bro` skill (restate last assistant message plainly) | `ak-bro/SKILL.md` (32 l; H2 Workflow, Safety) | new `kit/skills/bro/` | add required 3 sections; Workflow position may declare `none` | S |
| 6 | `cti-expert --format html` HTML mirror of DOCX report | `ak-cti-expert/SKILL.md` `### HTML mirror (--format html, opt-in)` (~L500-520) | `cti-expert/SKILL.md` or `cti-expert/references/report-formats.md` + argument-hint `[--format html\|md]` | port with Mermaid/Chart.js fallback only; drop AntV/diagram-design rows (non-goal, see §3) | M |

### P2 — reference material av lacks

| # | gap | ak source | av target | port | effort |
|---|---|---|---|---|---|
| 7 | Remote-MCP OAuth 2.1 + Code Mode guidance for agentize (linked 2× each from ak SKILL) | `ak-agentize/references/oauth-streamable-http.md` (110 l), `ak-agentize/references/code-mode.md` (106 l) | `agentize/references/` + link from `agentize/SKILL.md` (av has `mcp-transports.md`, OAuth only in `challenge-framework.md`) | copy, rebrand | S |
| 8 | Shared medium-agnostic design gate + handoff template | `ak-frontend-design/references/design-quality-preflight.md` (36 l), `ak-design/references/handoff-gate.md` (56 l), `ak-frontend-design/SKILL.md` `## Handoff` (6 l) | `frontend-design/references/design-quality-preflight.md`, `design/references/handoff-gate.md`, `## Handoff` in frontend-design SKILL (294 l → tight) | av frontend-design keeps HTML numerics inline; gate is shared by design/show-off/slides too | S |
| 9 | `ak-diagram` editorial/animated diagram surface | `ak-diagram/` (108 files: `assets/templates/<24 types>/{dark,full,light}.html`, `assets/{connector-effects.css,effects-demo.html,mermaid.min.js,tokens.css}`, `references/{animation-effects,mermaid-input}.md`, `references/per-type-schemas/*.json`, 5 scripts) | new `kit/skills/diagram/` or fold MP4/GIF + templates into `tech-graph` | large vendored asset (mermaid.min.js) + snapshot-hash determinism; only if editorial HTML/video output is in scope. Static need already met by `tech-graph` | L |

### P3 — cosmetic / metadata

| # | item | ak | av | note |
|---|---|---|---|---|
| 10 | `metadata.workflow: precedes/follows` | `ak-brainstorm ak-code-review ak-cook ak-fix (+ak-test)` | none | av `## Workflow position` section carries same info; allowed under `metadata` if wanted |
| 11 | `advise` `## Communication Style` (honour injected coding-level) | 2 lines | absent | trivial |
| 12 | `## Anti-Rationalization` in cook/fix SKILL | inline | av moved to `references/anti-rationalization.md` | not a gap; listed for completeness |
| 13 | ai-artist orphan refs (`advanced-techniques, llm-prompting, reasoning-techniques, domain-{code,data,marketing,patterns,writing}`) | 8 files, unlinked from ak ai-artist SKILL (only `ak-sequential-thinking` links one) | av fable-thinking has `reasoning-techniques.md` | leftover from a prompt-engineering skill; skip |
| 14 | `loop/references/results-logging.md` (74 l) | orphan in ak | av `## Results Logging` inline (TSV) | verify av inline covers TSV header/columns; else lift |
| 15 | `common/README.md` API Key Helper | documents `api_key_helper.py` not shipped in either kit | av common SKILL says "ships no scripts" | skip |
| 16 | `journal/scripts/post-social.test.cjs` | 19034 B | 16609 B | test-only drift; diff if journal scripts are touched |
| 17 | `--no-antv\|--no-diagram-design\|--no-editorial-visuals` in advise/brainstorm/cti-expert argument-hint | present | absent | depends on #9; non-goal today |

### No gap (one line each)
agent-browser, ai-multimodal, ask, autoresearch, backend-development, better-auth, chrome-profile, codex-goal, coding-level, context-engineering, cook, copywriting, databases, deep-swe, deploy, devops, docs-seeker, document-skills, excalidraw, fable-thinking, find-skills, folder-context, frontend-development, git, github, gkg, goal-warmup, google-adk-python, graphify, handoff, handover, help, html-video, hyperframes, interview-docs, issue-to-plan, journal, llms, loop, markdown-novel-viewer, mcp-builder, media-processing, mermaidjs-v11, mintlify, mobile-development — tree identical or av superset; heading diffs are extraction into refs or the 3 required sections.

av-superset content worth knowing (not gaps): `cook/fix/references/{advisory-supervision,anti-rationalization}.md`, `cti-expert/references/*` (7), `backend-production-debugging.md`, `mobile-debugging-workflows.md`, `frontend-development/references/quick-reference.md`, `handover/references/scenarios.md`, `mcp-builder/references/agent-centric-design.md`, `markdown-novel-viewer/references/{reader-guide,mermaid-diagrams}.md`, `mintlify/references/api-response-components-reference.md`, pinned `requirements.txt` + `ariadnev-lock.json` in script-bearing skills.

## 3. Deliberately absent

- AntV / diagram-design editorial visuals: `--no-antv|--no-diagram-design|--no-editorial-visuals` (advise, brainstorm, cti-expert), cti-expert AntV chart rows, `ak-diagram` dependency chain — AgentKit product surface; av has no AntV anywhere (`rg antv` = 0).
- ak-CLI-only flags surfaced by the grep, not ported by design: `coding-level --force/--fresh` (`ak kit init`), `cook --comment-id/--github` (`ak plan phase update`), `git --linked-pr` (`ak plan`), `journal --date/--project/--stdin/--summary` (`ak journal create`), `brainstorm --json` (`ak config prefs resolve`), `ak-ak/references/command-reference.md`.
- `ak-agentkit` router → `av-ariadnev`; `ak-ak` → `av-av`. Rebrands, not gaps.
- Auth/licensing, telemetry, analytics/dashboard/projects/sessions/content-search: nothing in a–m skills references them beyond the `ak login` mention in `ak-ak`.

## 4. Unresolved questions

1. Is `--ultra` (multi-verifier, cost-heavy) in scope for av, or a deliberate omission? It is the single largest cross-cutting delta (7 skills here, ~13 kit-wide). If in scope, `fix` (299 l) and `cook` (299 l) need a ref split first.
2. Is `ak-diagram` (108 files, vendored mermaid.min.js) wanted, or is `tech-graph` the accepted static answer? Decides #9 and #17.
3. `docs agents` ports the `ak:scout` source-mining hook via `--source`; confirm `av-scout` exposes the same probe before porting `agents-workflow.md` verbatim.
4. cti-expert `--format html` depends on av-preview's publish helper for `--wiki` inlining; confirm av-preview has an equivalent before promising the wiki path.
5. Out of range but seen: ak `ultra-verifier-mode.md` also names `plan review-pr scout research problem-solving test`; the n–z scout should count them so one shared ref lands once.

```
Status: DONE
Summary: 56 shared skills compared; 6 P1 gaps (--ultra across 7 skills, docs agents mode, --advice on code-review/agentize, brainstorm --report, bro, cti --format html), 3 P2 reference gaps, rest cosmetic or deliberately absent. No files modified besides this report; no test/install commands run.
Concerns/Blockers: --ultra and ak-diagram scope decisions gate ~70% of the porting effort.
```

# Port report — `diagram` skill (upstream 2.14.0 `diagram`)

Branch: `worktree-agent-aadbc51abb09993f7` (base `941d570`).
Target: `kit/skills/diagram/`. Source read-only; nothing pushed; no tests, builds, installs, or downloads run.

## Tree

| Measure | Source | Ported |
|---|---|---|
| Files | 109 | 110 (+ `scripts/requirements.txt`) |
| Size (`du -sh`) | 3.6M | 3.6M |
| Byte-identical to source | — | 2 (`assets/mermaid.min.js`, `references/snapshot-requirements.txt`) |
| Text-rewritten (identifiers only) | — | 107 (72 templates: header comment line 2 only; 35 css/html/md/json/yaml/py) |
| Authored here | — | `SKILL.md` (rewritten frontmatter + 3 house sections), `scripts/requirements.txt` |
| `SKILL.md` lines | 186 | 237 (limit 300) |
| Reference `.md` lines | 142 / 62 | 143 / 63 (limit 800) |

Nothing was moved into `references/`: the source `SKILL.md` was already under the cap, so all upstream body content stays in place and the three required sections (`## Output format`, `## Quality gates`, `## Workflow position`) were appended. Content conserved, none deleted; the only prose edits are path fixes (`kits/engineer/skills/…/scripts/` → `scripts/`), the dead `kits/core/skills/third-party-notices.md` pointer (no such ledger here) redirected to `references/vendoring-metadata.yaml`, and a routing row for `av:tech-graph`.

## Identifier rewrite

| Upstream token | Ported token | Where |
|---|---|---|
| `ak:diagram` | `av:diagram` | 72 template headers, css, html, md, json schema titles, py docstrings/argparse |
| `ak:excalidraw` / `ak:graphify` / `ak:preview` | `av:excalidraw` / `av:graphify` / `av:preview` | SKILL.md |
| `ak:mermaid` (upstream: "if present") | `av:mermaidjs-v11` (exists) | SKILL.md |
| `--ak-diag-*`, `.ak-diag`, `ak-diag__*`, temp-dir prefixes | `--av-diag-*`, `.av-diag`, … | tokens.css, effects-demo.html, render.py, record.py, snapshot_test.py, md |
| `--ak-fx-*`, `.ak-fx-frozen`, `@keyframes ak-fx-*` | `--av-fx-*`, `.av-fx-frozen`, `av-fx-*` | connector-effects.css, effects-demo.html, render.py, animation-effects.md |
| `window.__ak_diag_mermaid_*` | `window.__av_diag_mermaid_*` | render.py |
| `AGENTKIT_HOME` env fallback | `ARIADNEV_HOME` | doctor.py, snapshot_test.py |
| `author: agentkit` | `author: upstream` | SKILL.md (ADR 0008 register) |
| "AK Diagram (…)" | "Editorial Diagram (static + animated)" | agents/openai.yaml |

CSS/JS identifiers were renamed consistently across every file that references them (css, templates' shared frame, render.py's freeze class, docs), so behaviour is unchanged. Golden PNG hashes (`references/snapshot-hashes.yaml`) are of rendered pixels and are unaffected by the header-comment and identifier changes.

**Template provenance digests recomputed.** `vendoring-metadata.yaml` stores `sha256_12` of each template file's full text, and the rebranded header comment is part of that text. The digest algorithm was verified against the source (`architecture/light` → `cc0f1d8723bc`, `architecture/dark` → `ff11cd2cb102`, both match) and all 72 entries were regenerated with the same algorithm; `scripts/vendor_from_upstream.py` now emits the `av:diagram` header so re-vendoring stays idempotent. `mermaid.min.js` digest `a43bc1afd446` unchanged and re-verified.

## Brand grep

`rg -n 'ak-|ak:|AgentKit|agentkit' kit/skills/diagram`:

| Hit | Disposition |
|---|---|
| `assets/mermaid.min.js` ×3 | substring false positives (`mathfrak:`, `break-spaces`, `break:`) inside vendored code — not edited |
| `scripts/render.py:43` `SNAPSHOT_FONT_PROBE = "AgentKit snapshot Wm0@/ 12345 — glyph probe"` | **kept deliberately** with an explanatory comment and a `brand-drift-allow:` marker. It is the calibration text the `SNAPSHOT_FONT_WIDTHS` table was measured with; changing one glyph changes every recorded width and turns `--snapshot-profile` into a permanent refusal. Re-seeding needs the pinned Chromium 151.0.7922.34 profile, which is not available here. |

`node packages/cli/scripts/check-brand-drift.mjs` (the CI gate, scans tracked text files incl. `.js`): **clean** after one allowlist entry — `mermaid.min.js` line 450 contains a bare `ak` minifier identifier that the `upstream-bare-alias` pattern matches. Editing vendored code was out of the question, so the file is allowlisted with a reason (hash-pinned bundle). The allowlist preamble was amended to admit that category. **Coordinator may veto this — see unresolved questions.**

## Attribution and licence

| Item | Result |
|---|---|
| `metadata.upstream_templates: cathrynlavery/diagram-design (MIT)` | kept verbatim (unquoted, as upstream) |
| `metadata.vendored_mermaid_version: "11.4.1"` | kept verbatim |
| Additional register (from `tech-graph`) | `attribution`, `license: MIT`, `upstream`, `upstream_sha: 09df49d8…`, `imported_at: 2026-08-30`, `origin: ported`, `author: upstream` |
| LICENSE / LICENCE / NOTICE files in source | **none exist** — nothing to copy; upstream relied on a `third-party-notices.md` ledger that this repo does not have |
| `mermaid.min.js` licence header | no top-of-file banner in the 11.4.1 bundle; it embeds `/*! @license … */` banners for DOMPurify, js-yaml and others — preserved byte-identical |
| Per-template provenance header (upstream repo, path, sha, MIT) | preserved in all 72 files |
| `## Attribution` section | preserved; ledger pointer redirected to `references/vendoring-metadata.yaml` |

## Lint (local mirror of `skill-lint.ts`, `skill-crossrefs.ts`, `description-collision.ts`)

| Rule | Result |
|---|---|
| Unknown frontmatter fields | none |
| `name` = `av:diagram` | ok |
| Description length / trigger verb | 197 chars, "Use" present |
| SKILL.md ≤ 300 lines | 237 |
| Required sections | all three present; Workflow position names 9 real skills |
| `av:<slug>` references across the tree | all resolve (`brainstorm, docs, excalidraw, graphify, media-processing, mermaidjs-v11, plan, preview, tech-graph`) |
| `(../)+av-<slug>/` links | none used |
| References ≤ 800 lines, duplicate headings | 143 / 63 lines, no duplicates |
| Description collision (Jaccard) | top: html-video 0.11, tech-graph 0.10, show-off 0.09 — far below warn 0.4; no allowlist change |
| Python syntax (`ast.parse`, no bytecode written) | 5/5 ok |
| JSON / YAML parse | all ok |

`bun … validate --check --strict` was **not** run: this worktree has no installed dependencies and `pnpm install` is forbidden. The coordinator's integration run covers it.

## Changes outside `kit/skills/diagram/`

| File | Why |
|---|---|
| `evals/scenarios/skills/diagram.json` | `scenario-coverage.test.ts` derives the skill list from disk and fails for any skill without a scenario; positive/nearest-negative pair vs `av:excalidraw`, evidence id `media.rendered` (exists in vocabulary) |
| `packages/cli/src/install/install.test.ts` | hard-coded `ROSTER` and "105-skill" title → added `diagram`, 106 |
| `packages/cli/scripts/check-brand-drift.mjs` | allowlist entry for the vendored bundle (see Brand grep) |
| `plans/reports/port-260830-1604-diagram.md` | this report |

Not touched: `kit/collision-allowlist.json`, `kit-embedded.generated.ts`, routing tables in `find-skills`/`preview`/`ariadnev` (see unresolved).

## Loader / installer notes

| Concern | Finding |
|---|---|
| Nested `agents/openai.yaml` | `load-kit.ts` reads agents only from `kit/agents/*.md`; a skill-nested `agents/` dir is neither loaded nor rejected. Precedent: `kit/skills/tech-graph/agents/openai.yaml`. Kept as-is (Codex interface card). |
| `references/*.md` lint | loader reads only top-level `references/*.md` (non-recursive): `animation-effects.md`, `mermaid-input.md`. `per-type-schemas/README.md`, yaml and txt files are copied but unlinted. |
| Python file names | `snapshot_test.py` and `vendor_from_upstream.py` keep snake_case: `snapshot_test.py` is named in SKILL.md/docs and invokes `render.py` by path; renaming would be churn for no import benefit. Other kit skills ship snake_case Python (`db_migrate.py`, `shadcn_add.py`), so this is within house precedent. |
| `scripts/requirements.txt` | added per the authoring spec (`playwright`, `pyyaml`, unpinned). **No `ariadnev-lock.json`** — generating it needs `bun packages/cli/scripts/generate-skill-lock.ts diagram` with network access (out of scope). Until then `ariadnev skill verify` reports `unlocked`. `excalidraw` is the precedent register (playwright, lock beside the declaration). |
| `references/snapshot-requirements.txt` | not named `requirements.txt`, so `read-requirements` ignores it; it remains the exact-pin set for the golden profile (`playwright==1.62.0`, `pyyaml==6.0.3`). |
| File modes | source files were 0600; normalised to 0644 (dirs 0755). No script carries +x upstream; none added. |

## Runtime probe (report only — nothing installed, renderer and snapshot test not run)

| Question | Command | Result |
|---|---|---|
| Python the scripts need | `head -1 scripts/*.py`, `from __future__ import annotations`, `X \| None` unions | any Python ≥ 3.10; scripts prefer `<root>/.claude/skills/.venv/bin/python3` found by walking up from the skill dir, else `$ARIADNEV_HOME/.claude/skills/.venv/...`, else `sys.executable` |
| System python | `which python3; python3 --version` | `/opt/homebrew/bin/python3`, Python 3.14.7 |
| Skill venv python | `ls -la ~/.claude/skills/.venv/bin/python3; --version` | symlink → python3.14, Python 3.14.7 |
| `playwright` in venv | `~/.claude/skills/.venv/bin/python3 -c "import playwright"` | `ModuleNotFoundError: No module named 'playwright'` (exit 1); `pip show playwright` → not found |
| `playwright` in system python | `python3 -c "import playwright"` | `ModuleNotFoundError` (exit 1) |
| `pyyaml` (snapshot_test.py) | venv / system `import yaml` | venv: pyyaml 6.0.3 present; system: missing |
| Chromium (Playwright cache) | `ls ~/Library/Caches/ms-playwright` | directory does not exist |
| Chromium (doctor.py default) | `ls /opt/pw-browsers` | directory does not exist |
| ffmpeg (record.py MP4/GIF) | `which ffmpeg; ffmpeg -version` | `/opt/homebrew/bin/ffmpeg`, ffmpeg 8.1.2 — record.py needs it on PATH (or under `/opt/pw-browsers/ffmpeg*`) and uses `libx264`/`yuv420p` for MP4, `palettegen`/`paletteuse` for GIF |
| mmdc (optional fast path, unused by render.py) | `which mmdc` | not found (fine; doctor reports it as optional) |
| uv (snapshot venv recipe in SKILL.md) | `which uv` | `/opt/homebrew/bin/uv` |

`snapshot_test.py` compares the sha256 of the PNG that `render.py --snapshot-profile` produces for each of the 72 templates against `references/snapshot-hashes.yaml`. To run it needs: Python with `playwright==1.62.0` and `pyyaml==6.0.3`, a Playwright Chromium reporting exactly `151.0.7922.34`, and canvas `measureText` widths for ten font stacks (generic families plus Geist / Geist Mono / Instrument Serif) equal to the recorded table — on any other renderer profile `render.py` raises before comparing. On this Mac neither Playwright nor Chromium is installed, and the generic-family widths (Helvetica etc.) would differ from the Linux profile the goldens were seeded on, so the suite is effectively CI-profile-only.

`doctor.py` (not run) would today report `playwright` missing and `chromium` missing here; it looks for Chromium only under `$PLAYWRIGHT_BROWSERS_PATH` (default `/opt/pw-browsers`) with build-specific subdir names (`chromium_headless_shell-1194`, `chromium-1194`), so on a workstation using Playwright's own cache it can report missing even after `playwright install chromium`. Behaviour left as upstream shipped it; documented in SKILL.md Setup.

## Unresolved questions

1. **Brand-drift allowlist entry for `mermaid.min.js`** — accept, or prefer excluding `.min.js` from `TEXT_EXT` in the gate instead? Either is a one-line change; the entry is the narrower one.
2. **`SNAPSHOT_FONT_PROBE` keeps the old product name** as measured data (with `brand-drift-allow:`). Alternative is to re-seed widths + goldens in the pinned profile after changing the string — CI-only work.
3. **No upstream LICENSE text in the tree** (none in source either). MIT asks for the copyright notice to travel with the code; `tech-graph` ships a `LICENSE` file for its vendored upstream. Adding one needs the upstream repo's LICENSE (a fetch, out of scope here). Recommend a follow-up.
4. **`ariadnev-lock.json` missing** for `scripts/requirements.txt` — needs the maintainer lock generator with network.
5. **Routing tables not updated**: `find-skills/references/domain-routing.md`, `preview/references/visual-explanation-routing.md`, `ariadnev` skill do not mention `av:diagram`; excalidraw/mermaidjs-v11/tech-graph SKILL.md routing prose also predates it. Out of the stated scope; worth a follow-up so the router can reach the skill.
6. **Tier 2 is still aspirational upstream** (templates carry no `{{key}}` slots) — ported as-is and documented, not fixed.
7. **doctor.py Chromium probe** assumes the `/opt/pw-browsers` CI layout; a `chromium*` glob would make it truthful on workstations. Left unchanged to keep the port faithful.

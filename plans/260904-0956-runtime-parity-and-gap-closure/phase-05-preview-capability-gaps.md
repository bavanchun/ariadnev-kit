---
phase: 5
title: "Preview generation-time validators and infographic engine"
status: pending
priority: P3
effort: 6h
dependencies: []
---

## Overview

The parity study measured `preview` at 79% of upstream and named three drops:

- `references/vendor/diagram-design-scripts/` — `verify-geometry.py`,
  `verify-motion.py`, `self_check.py`, a `run-validators.sh` wrapper, plus a
  licence and provenance file. Only the three Python files are upstream
  `diagram-design` content; the wrapper was written by the kit this project
  forked from (step 0).
- `references/html-antv-infographic.md`
- `references/html-diagram-design.md`

Nothing in the kit references any of them (`grep` for `verify-geometry`,
`self_check`, `run-validators` across `kit/` returns nothing; `antv` and
`infographic` appear only in `design/`, `ai-artist/` and unrelated CSV data), so
the drop looks deliberate — but no decision record says so, which is the parity
study's own unresolved question. This phase answers it by porting what still has
no equivalent and writing down what does.

The three drops have three different fates, and the reason is `av:diagram`, which
was ported on 2026-08-30 and vendors **the same upstream** —
`kit/skills/diagram/references/vendoring-metadata.yaml:3-5` records
`upstream_repo: cathrynlavery/diagram-design`, `upstream_license: MIT`,
`upstream_sha: 09df49d8d1a1c7fb2efdfcdc7a2a0713534350a6`, 72 templates.

| Drop | Fate | Why |
|---|---|---|
| The four validator scripts | Port into `av:diagram` — three vendored, `run-validators.sh` re-authored (it does not exist upstream) | They validate diagram geometry and motion. `av:diagram` is what produces geometry and motion, and it already ships a Python pipeline (`render.py`, `record.py`, `doctor.py`, `snapshot_test.py`, `requirements.txt`) and a vendoring mechanism pointed at the same repo. Putting them under `preview/references/vendor/` would leave executable Python in a skill that runs none |
| `html-antv-infographic.md` | Port, into `preview` | An infographic generation mode with no equivalent anywhere in the kit. `html-libraries.md` is already the CDN-library reference and this is another entry in the same shape |
| `html-diagram-design.md` | Replace with a routing handoff | Its content is the editorial diagram system `av:diagram` now implements as 72 vendored templates plus token CSS. Re-porting the prose would restate what the templates already carry |

**Stated option for the user.** The third row is the only judgement call in the
phase. `av:diagram` supersedes `html-diagram-design.md` in substance, so step 8
is a one-line handoff rather than a file port — and the user may reasonably cut
it entirely and let the ADR record the drop. It is planned as in-scope by
default because `kit/skills/preview/references/visual-explanation-routing.md:21-29`'s
"Specialist Handoffs" list currently names `mermaidjs-v11`, `tech-graph`,
`ai-multimodal`, `ui-ux-pro-max` and `docs` but **not** `av:diagram` — so today a
caller routed to preview for a publish-grade diagram is never told the better
surface exists. That is a live routing gap independent of the parity number.

The phase also closes an open item from the earlier diagram port. `av:diagram`
vendors MIT-licensed templates and carries no `LICENSE` file;
`plans/reports/port-260830-1604-diagram.md` flags this as unresolved question 3
and points at `kit/skills/tech-graph/LICENSE` as the precedent. Vendoring more
files from the same upstream makes the omission worse, so the licence lands in
the same phase as the files that need it.

**Why this phase costs more than a file copy.** A red-team pass on the first
draft found that the vendoring mechanism cannot safely do what the phase asks of
it: `vendor_from_upstream.py` neither fetches nor pins, its metadata writer
destroys a hand-maintained provenance block, and a re-run rewrites all 72
templates. Fixing the script is therefore part of this phase, not a
precondition, and the estimate moved from 3h to 6h to cover it plus the missing
dependency lock.

## Requirements

1. **Vendor only what upstream actually has.** Three of the four files are
   upstream `diagram-design` content at sha
   `09df49d8d1a1c7fb2efdfcdc7a2a0713534350a6`, in two different directories; the
   `run-validators.sh` wrapper is not upstream at all and is written here. Step 0
   records the resolution.
2. **Make the vendoring script pin what it claims to pin.** Add `--sha`, check
   the source checkout out to it, and abort when `rev-parse HEAD` disagrees.
3. **Make re-vendoring non-destructive and byte-idempotent.** Preserve the
   `extra_vendors:` block, and derive timestamps from the pinned commit so a
   re-run at the same sha produces an empty diff.
4. Vendor the three upstream validators through that script, with a `sha256_12`
   and a per-file upstream path recorded in `vendoring-metadata.yaml`, and write
   our own wrapper beside them.
5. Add `kit/skills/diagram/LICENSE` carrying the upstream MIT text and copyright,
   covering the three vendored files and not the wrapper.
6. Confirm against `packages/cli/scripts/scan-python-imports.mjs` that the
   validators add no non-stdlib import, then regenerate the skill's pinned lock
   so `av:diagram` does not ship as an unlocked Python skill.
7. Document how to run them from `av:diagram`, and state plainly what does and
   does not gate their execution.
8. Port `html-antv-infographic.md` into `kit/skills/preview/references/` and wire
   it into the mode routing.
9. Add the missing `av:diagram` handoff to preview's routing table.
10. Regenerate the embedded kit and record the whole disposition in an ADR.

## Architecture

**The vendoring script does not fetch, and does not pin. Both must be fixed
before it is run.** `kit/skills/diagram/scripts/vendor_from_upstream.py` reads a
checkout the *operator* produced (`--source`, `vendor_from_upstream.py:177`) and
derives provenance after the fact by shelling `git -C <source> rev-parse HEAD`
(`_read_upstream_sha`, `vendor_from_upstream.py:64-71`). Its own usage block
(`vendor_from_upstream.py:11-20`) documents `git clone --depth 1 …` — HEAD of the
default branch — and the CLI (`vendor_from_upstream.py:176-185`) has no `--sha`
flag at all. Running it as written would silently vendor from whatever revision
the operator happened to clone, and the `sha256_12` values would faithfully
record content nobody chose. A recorded hash is a record of what was written,
not a check that it came from the pinned revision.

So this phase changes the script:

- add `--sha`, required;
- run `git -C <source> checkout --detach <sha>` (or `fetch` + checkout when the
  shallow clone lacks it) before reading any file;
- after checkout, compare `_read_upstream_sha(source)` against `--sha` and
  `raise SystemExit` on mismatch. `"unknown"` is a mismatch, not a pass.

**Re-vendoring must not destroy provenance or restamp 72 files.** Two separate
problems, both in the current script:

- `_write_metadata` (`vendor_from_upstream.py:152-172`) rebuilds the whole YAML
  from a fixed header plus `templates:`. It emits no `extra_vendors:`. That block
  exists today at `kit/skills/diagram/references/vendoring-metadata.yaml:10-17`
  and is the only provenance for the vendored `assets/mermaid.min.js` (upstream,
  version 11.4.1, `sha256_12: a43bc1afd446`). Running the script as-is erases it,
  leaving a third-party bundle with zero provenance — precisely the failure this
  phase exists to prevent for the validators. Fix: read the existing metadata
  file, carry any non-`templates:` block through verbatim, and write the merged
  result.
- `_wrap_with_metadata` (`vendor_from_upstream.py:81-92`) stamps
  `imported_at: {datetime.now(timezone.utc)}` into every per-file header, and
  `_digest` (`vendor_from_upstream.py:95-96`) hashes the wrapped text *including*
  that header. A re-run therefore rewrites all 72 template files and all 72
  hashes, burying a 4-file change in a 72-file diff and destroying the ability to
  see what actually changed. Same defect on the top-level `vendored_at`
  (`vendor_from_upstream.py:160`). Fix: derive both from the pinned commit —
  `git -C <source> show -s --format=%cI <sha>` — so the output is a pure function
  of (sha, target set) and a same-sha re-run is an empty diff.

**The upstream paths were verified, and the answer changed this phase.** The
four scripts were observed in an upstream *agentkit* copy at
`preview/references/vendor/diagram-design-scripts/` — a downstream copy of
`cathrynlavery/diagram-design`, not the repo itself. A read-only `git ls-tree`
against the pinned sha on 2026-09-04 resolved them:

| File | At `09df49d8d1a1c7fb2efdfcdc7a2a0713534350a6` |
|---|---|
| `verify-geometry.py` | `scripts/verify-geometry.py` |
| `verify-motion.py` | `scripts/verify-motion.py` |
| `self_check.py` | `skills/diagram-design/scripts/self_check.py` |
| `run-validators.sh` | **absent — the commit contains no `.sh` file at all** |

Three consequences, all folded into the steps below. The three Python files are
byte-identical to the downstream copies, so vendoring them is a straight copy —
but they sit in two different upstream directories, so the manifest must carry a
path per file, not one shared prefix. `run-validators.sh` was written by the kit
this project forked from — its own `PROVENANCE.md` marks it AgentKit-authored —
so it cannot be vendored: copying it would attach a third party's licence to text
that third party never wrote, and the brand-drift gate would be right to reject
it. We write our own wrapper to the same contract instead. And all three
validators import stdlib only (`__future__`, `collections`, `html.parser`,
`pathlib`, `urllib.parse`, `argparse`, `re`, `sys`), so `requirements.txt` gains
nothing — the phase asserts it is unchanged rather than editing it.

**Where the scripts land.**
`kit/skills/diagram/scripts/validators/` — beside the pipeline that produces
what they check, not under `preview/references/vendor/`. Our own
`run-validators.sh` becomes the entry point and is the one file in that directory
with no upstream provenance; `self_check.py` stays the self-check the other two
are called from.

**Execution safety — what actually gates this, honestly.** The earlier draft
claimed `scripts.executionPolicy` covers it and "nothing new is needed". That is
false in two ways. The field's own description scopes it to `ariadnev skill run`
(`packages/cli/src/config/config-schema.ts:88-92`), and the only enforcement is
inside the `run` action (`packages/cli/src/cli/skill-env-command.ts:236-239`,
reached only via `runSkillEnv`'s `action === "run"` branch at
`skill-env-command.ts:267`). An agent that invokes `run-validators.sh` through
plain Bash never touches that code path, so the setting is inert against it.
Worse, the comment justifying the `allow` default —
`config-schema.ts:83-87`, "these are the kit's own scripts, hash-tracked by the
install receipt" — is a rationale this phase falsifies by making them *not* the
kit's own.

The position this phase takes, stated without inflation:

- The documented invocation is `av skill run diagram scripts/validators/run-validators.sh`,
  which is the only path `scripts.executionPolicy: never` can refuse.
- Nothing in the kit sandboxes or gates an agent that runs the scripts directly
  through Bash. `kit/skills/diagram/SKILL.md` must say exactly that: these are
  third-party scripts, they are unsandboxed when invoked outside
  `av skill run`, and the `never` policy does not protect that path.
- The ADR records that `config-schema.ts`'s "kit's own scripts" rationale no
  longer describes `av:diagram`. Changing that comment is out of this phase's
  scope; flagging it is not.

Nothing in `av:diagram`'s default path invokes them automatically — they are an
opt-in check, documented like `snapshot_test.py`
(`kit/skills/diagram/SKILL.md:133`), because they need Python and existing render
output.

**Dependency declaration, and the lock that has to follow it.**
`kit/skills/diagram/scripts/requirements.txt:16-17` declares `playwright` and
`pyyaml`. Its own comment (`requirements.txt:12-15`) says the hash-verified lock
for `ariadnev skill install` is `ariadnev-lock.json` beside it "once a maintainer
has generated it" — and no such file exists (`find kit -name ariadnev-lock.json`
returns locks for `document-skills`, `excalidraw`, `design`, `cti-expert` and
`mcp-builder`; none under `diagram`). `av skill verify diagram` therefore reports
`unknown` with the "declares Python dependencies but has no pinned lock"
sentence (`packages/cli/src/skill-env/verify-env.ts:241-250`). Adding imports
without regenerating the lock would widen that gap inside a gap-closing phase, so
`pnpm --filter ariadnev generate:skill-lock diagram`
(`packages/cli/package.json:40`) runs as its own step and its output is committed.

Draft the imports with `node packages/cli/scripts/scan-python-imports.mjs
kit/skills`; the script's own header says its output is a draft for a human, and
a module name is not a distribution name, so anything it reports as unknown gets
resolved by reading the import.

**The AntV reference is a reference, not code.**
`kit/skills/preview/references/html-libraries.md` is the established shape:
per-library "use it for / do not use it for", a CDN import block, and theming
rules. `html-antv-infographic.md` follows it. Preview generates self-contained
HTML that loads libraries from a CDN, so no asset is vendored here — that is
`av:diagram`'s model, not preview's, and the two stay distinct.

**Routing.** `visual-explanation-routing.md` gains one Specialist Handoffs line
for `/av:diagram` and one Mode Selection row for the infographic mode. Both
files are small and owned only by this phase.

**The embedded kit is a single-writer artifact.** Everything under `kit/`
compiles into one tracked file, `packages/cli/src/kit/kit-embedded.generated.ts`
(~10 MB), via `pnpm --filter ariadnev generate:embedded`
(`packages/cli/package.json:37`). Two phases regenerating it concurrently
produce an unmergeable conflict in a generated blob, so **this phase must not run
in parallel with any other phase that mutates `kit/`**. Regeneration is the last
step, after every `kit/` edit has landed.

**ADR number.** This phase takes `0020`. Phase 4 takes `0019`. The numbers are
pre-assigned so the two phases can land in either order without colliding.

## Related Code Files

**Create**
- `kit/skills/diagram/LICENSE` — upstream MIT text and copyright.
- `kit/skills/diagram/scripts/validators/verify-geometry.py`
- `kit/skills/diagram/scripts/validators/verify-motion.py`
- `kit/skills/diagram/scripts/validators/self_check.py`
- `kit/skills/diagram/scripts/validators/run-validators.sh` — **written here, not vendored**: upstream has no such file.
- `kit/skills/diagram/scripts/ariadnev-lock.json` — generated, committed.
- `kit/skills/preview/references/html-antv-infographic.md`
- `docs/decisions/0020-vendored-diagram-validators-and-the-preview-drops.md`

**Modify**
- `kit/skills/diagram/scripts/vendor_from_upstream.py` — the `--sha` flag and its
  checkout + verification; `_write_metadata` merging instead of overwriting;
  commit-derived timestamps in `_wrap_with_metadata` and the metadata header; the
  validator target set. This is the largest single edit in the phase.
- `kit/skills/diagram/references/vendoring-metadata.yaml` — regenerated with the
  validator entries, `extra_vendors:` intact, all 72 template hashes unchanged.
- `kit/skills/diagram/scripts/requirements.txt` — **only if** the import scan finds a non-stdlib import; the three validators were checked and have none.
- `kit/skills/diagram/SKILL.md` — how and when to run the validators; what gates
  them and what does not; the licence pointer.
- `kit/skills/preview/references/html-libraries.md` — cross-link to the new file.
- `kit/skills/preview/references/visual-explanation-routing.md` — the `av:diagram`
  handoff and the infographic mode row.
- `kit/skills/preview/SKILL.md` — only if the operation table gains a row.
- `packages/cli/scripts/check-brand-drift.mjs` — an ALLOWLIST entry for
  `kit/skills/diagram/scripts/validators/` if the vendored text trips the gate.
- `packages/cli/src/kit/kit-embedded.generated.ts` — regenerated, not hand-edited.

**Delete** — none.

## Implementation Steps

0. **The upstream resolution is already done — do not re-litigate it, verify it.**
   A read-only `git ls-tree` against
   `09df49d8d1a1c7fb2efdfcdc7a2a0713534350a6` was run on 2026-09-04 and settled
   what this step used to gate on. The result changes the phase, so it is
   recorded here rather than left to execution time:

   | File | Status at the pinned sha |
   |---|---|
   | `verify-geometry.py` | Exists at **`scripts/verify-geometry.py`** |
   | `verify-motion.py` | Exists at **`scripts/verify-motion.py`** |
   | `self_check.py` | Exists at **`skills/diagram-design/scripts/self_check.py`** |
   | `run-validators.sh` | **Does not exist upstream.** The commit contains no `.sh` file at all |

   Three consequences, all folded into the steps below:

   - The three Python validators live in **two different upstream directories**,
     so the vendoring manifest needs a per-file upstream path, not one source
     directory. All three were confirmed byte-identical (sha256) to the copies
     observed downstream, so the pin is sound and no divergence needs recording.
   - `run-validators.sh` is **authored by the upstream kit this project was
     forked from**, not by `diagram-design` — that kit's own provenance file says
     so. It therefore cannot be vendored under the MIT attribution, and copying
     its text would also trip the brand-drift gate. This phase **writes its own
     wrapper** instead: same advisory contract, our code, no third-party
     attribution.
   - The three validators import **only the standard library** (`argparse`, `re`,
     `sys`, `pathlib`, `collections`, `html.parser`, `urllib.parse`,
     `__future__`). `requirements.txt` gains nothing; step 4 asserts that rather
     than adding entries.

   Re-run the `ls-tree` before vendoring as a cheap regression check that the sha
   still resolves, but the phase's shape no longer depends on its outcome.

1. Extend `kit/skills/diagram/scripts/vendor_from_upstream.py`:
   - add a required `--sha` argument to the parser at
     `vendor_from_upstream.py:176-185`;
   - check the source checkout out to that sha, then fail loudly if
     `_read_upstream_sha` (`vendor_from_upstream.py:64-71`) returns anything else,
     `"unknown"` included;
   - derive `imported_at` in `_wrap_with_metadata` (`vendor_from_upstream.py:81-92`)
     and `vendored_at` in `_write_metadata` (`vendor_from_upstream.py:160`) from
     the pinned commit's committer date rather than `datetime.now(...)`;
   - make `_write_metadata` (`vendor_from_upstream.py:152-172`) read the existing
     `vendoring-metadata.yaml` and carry every non-`templates:` block through
     unchanged, so `extra_vendors:`
     (`kit/skills/diagram/references/vendoring-metadata.yaml:10-17`) survives;
   - add the validator target set writing to `scripts/validators/`, hashed the
     same way and recorded in its own metadata block, with a **per-file upstream
     path** (the three validators sit in two different upstream directories).
   - Update the usage docstring (`vendor_from_upstream.py:11-20`) so it no longer
     tells the operator to clone the default branch.

2. Run the script once with `--sha 09df49d8d1a1c7fb2efdfcdc7a2a0713534350a6`, then
   run it a second time with the same arguments and confirm `git status` is clean.
   The first run must touch only the three vendored validators and the metadata;
   the 72 template files and their `sha256_12` values must be untouched. The
   wrapper is ours and is written by hand, not by this script.

3. Add `kit/skills/diagram/LICENSE` with the upstream MIT text and copyright,
   following `kit/skills/tech-graph/LICENSE`, and reference it from
   `kit/skills/diagram/SKILL.md`'s `attribution` field
   (`kit/skills/diagram/SKILL.md:13`).

4. Write `kit/skills/diagram/scripts/validators/run-validators.sh` ourselves —
   upstream has none. Contract, unchanged from what the drop provided: take one
   artefact path, exit 2 on a missing argument, print a skip line and exit 0 when
   `python3` is absent, run each validator that is present, report a non-zero
   validator as advisory on stderr, and **exit 0 unconditionally** so a validator
   never blocks artefact delivery. Our own code and comments — no upstream text,
   and no third-party attribution on a file no third party wrote.

5. Run `node packages/cli/scripts/scan-python-imports.mjs kit/skills`. The three
   validators import only the standard library (`argparse`, `re`, `sys`,
   `pathlib`, `collections`, `html.parser`, `urllib.parse`, `__future__`), so the
   expected outcome is **no change to `requirements.txt`**. If the scan disagrees,
   resolve each `unknown` by reading the import rather than guessing the package.

6. Run `pnpm --filter ariadnev generate:skill-lock diagram` and commit
   `kit/skills/diagram/scripts/ariadnev-lock.json`. Confirm with
   `av skill verify diagram` that the skill no longer reports the
   "declares Python dependencies but has no pinned lock" verdict.

7. Document the validators in `kit/skills/diagram/SKILL.md`: what each checks,
   that they are opt-in, that they need rendered output to exist, that the
   supported invocation is
   `av skill run diagram scripts/validators/run-validators.sh`, and — stated
   plainly — that `scripts.executionPolicy: never` refuses only that path, so an
   agent invoking the scripts directly through Bash runs unsandboxed third-party
   code with no gate in front of it.

8. Add the `/av:diagram` line to Specialist Handoffs in
   `kit/skills/preview/references/visual-explanation-routing.md:21-29`.

9. Write `kit/skills/preview/references/html-antv-infographic.md` in the shape
   `html-libraries.md` uses, and cross-link the two.

10. Add the infographic row to Mode Selection in
   `visual-explanation-routing.md`, and to `kit/skills/preview/SKILL.md`'s
   operation table if the mode is user-invocable.

11. Write `docs/decisions/0020-vendored-diagram-validators-and-the-preview-drops.md`
    covering all three dispositions, the step 0 path-resolution result, the
    execution-safety position above, and naming
    `docs/decisions/0008-porting-upstream-content.md` as the governing decision.

12. `git add` everything, then run `node packages/cli/scripts/check-brand-drift.mjs`
    — the gate reads tracked files only, so an unstaged vendored file is invisible
    to it.

13. Run `pnpm --filter ariadnev generate:embedded` **last**, after every `kit/`
    edit has landed, and commit
    `packages/cli/src/kit/kit-embedded.generated.ts`. Then run the kit validation
    the repo uses for skill structure (`av validate` / `av audit kit`) and
    `pnpm lint`.

## Success Criteria

- [ ] The three upstream validators still resolve at sha `09df49d8d1a1c7fb2efdfcdc7a2a0713534350a6`, and `vendoring-metadata.yaml` plus the ADR record each one's own upstream path (`scripts/` for two, `skills/diagram-design/scripts/` for `self_check.py`).
- [ ] `vendor_from_upstream.py` takes a required `--sha`, checks the source out to it, and exits non-zero when `rev-parse HEAD` disagrees (including when it cannot be read).
- [ ] Re-running the vendor script with the same sha produces an empty diff — `git status` is clean after the second run.
- [ ] `vendoring-metadata.yaml` still contains the `extra_vendors:` block with `assets/mermaid.min.js` and its `sha256_12: a43bc1afd446`, and all 72 template `sha256_12` values are byte-identical to before the phase.
- [ ] The three vendored validators exist under `kit/skills/diagram/scripts/validators/`, each with a `sha256_12` entry tied to the pinned sha, and `run-validators.sh` exists beside them carrying no upstream text and no third-party attribution.
- [ ] `kit/skills/diagram/LICENSE` exists with the upstream MIT text and copyright, and `SKILL.md`'s `attribution` points at it.
- [ ] `requirements.txt` declares every non-stdlib import the new scripts make and no package name was guessed — expected to be no change at all, since the three validators are stdlib-only.
- [ ] `kit/skills/diagram/scripts/ariadnev-lock.json` exists and is committed, and `av skill verify diagram` no longer reports the skill as `unknown` for want of a lock.
- [ ] `SKILL.md` says the validators are opt-in, states their preconditions, names `av skill run` as the gated invocation, and states that direct Bash invocation is ungated.
- [ ] No sentence in the phase, the ADR, or `SKILL.md` claims `scripts.executionPolicy` protects anything beyond `ariadnev skill run`.
- [ ] `html-antv-infographic.md` exists and is reachable from both `html-libraries.md` and the routing table.
- [ ] `visual-explanation-routing.md` names `/av:diagram` in Specialist Handoffs.
- [ ] ADR 0020 records all three dispositions, the execution-safety position, and closes the parity study's open question.
- [ ] `check-brand-drift.mjs` is clean **after staging**.
- [ ] `packages/cli/src/kit/kit-embedded.generated.ts` was regenerated after the last `kit/` edit, and no other phase mutated `kit/` while this one ran.
- [ ] No file was hand-copied from upstream without a hash entry, and no file authored here carries an upstream attribution.

## Risk Assessment

| Risk | Observable signal | Pre-decided response |
|---|---|---|
| The script vendors from an unreviewed revision | `vendor_from_upstream.py` still has no `--sha`; provenance comes from whatever the operator cloned | Step 1 is a gate: no vendoring run happens until `--sha` exists and mismatch is fatal. A recorded `sha256_12` is evidence of what was written, never of where it came from |
| A validator path stops resolving at the pinned sha | Step 0's re-run of the `ls-tree` returns fewer than the three recorded paths | Stop at step 0, before any write. Do not float the pin to `HEAD` — that would silently re-vendor 72 templates. Re-pinning is a decision for the user and a different phase |
| The upstream file differs from the downstream agentkit copy that was measured | Step 0's diff against `preview/references/vendor/diagram-design-scripts/` is non-empty — it was empty for all three on 2026-09-04 | Vendor the upstream content — it is what the sha and the licence cover — and record the divergence in the ADR so the parity measurement is not read as a content guarantee |
| Re-vendoring erases the mermaid provenance | `extra_vendors:` absent from `vendoring-metadata.yaml` after a run | `_write_metadata` merges; the success criterion checks the block and its hash explicitly. A vendored bundle with no provenance is the exact failure this phase exists to fix |
| A re-run restamps 72 templates and hides the real change | `git diff --stat` shows 72 template files touched by a vendoring run | Timestamps derive from the pinned commit, not wall clock. The empty-diff criterion catches any regression |
| Vendored MIT code ships without its licence, or our own file claims one | `kit/skills/diagram/` still has no `LICENSE` after the phase, or `run-validators.sh` carries an upstream attribution | Step 3 is a gate, not a nicety; it is why the licence and the files land together. Attribution follows authorship in both directions — the wrapper we write gets none |
| The skill ships unlocked | `av skill verify diagram` reports `unknown` for want of a lock after the phase | Step 6 regenerates and commits the lock. Adding imports without it would open a new gap inside a gap-closing phase |
| Execution safety is overstated | Any text claims `scripts.executionPolicy` gates the validators generally | It gates only `ariadnev skill run` (`skill-env-command.ts:236-239`). SKILL.md and the ADR say so, and say Bash invocation is ungated. Do not describe a protection that does not exist |
| Brand-drift trips on third-party wording | The gate reports hits inside `scripts/validators/` | Add a directory ALLOWLIST entry alongside the existing `kit/skills/diagram/assets/mermaid.min.js` entry, or an inline `brand-drift-allow:` where the upstream name is load-bearing. Never rewrite vendored source to pass a branding gate |
| The validators are wired into the default render path and start failing builds | `av:diagram` render begins requiring Python packages it did not need | They stay opt-in; step 7 states the precondition explicitly |
| A guessed PyPI package name lands in `requirements.txt` | The file changes at all — the three validators import stdlib only, so the expected diff is empty | Assert no change rather than editing on faith. If a future validator does import a third party, `scan-python-imports.mjs` reports unknowns rather than guessing; resolve each by reading the import |
| Concurrent phases collide in the embedded kit | A conflict inside `packages/cli/src/kit/kit-embedded.generated.ts` | Single-writer artifact: this phase does not run in parallel with any phase that mutates `kit/`, and regenerates only as its last step |
| The AntV reference restates `html-libraries.md` | Two files describe the same CDN import differently | Cross-link instead of duplicating; the new file covers only what is infographic-specific |
| Cutting the handoff leaves the routing gap open | The user drops the `html-diagram-design` row and the `av:diagram` handoff goes with it | The handoff line and the `html-diagram-design` disposition are separable — keep step 8's routing line even if the ADR records the file as declined |

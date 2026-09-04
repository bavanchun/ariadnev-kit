# 0020. The dropped diagram validators are vendored into `av:diagram`, not restored to `av:preview`

Date: 2026-09-04
Status: Accepted.

Governed by [0008 — Ported content is marked, and judged by different rules](./0008-porting-upstream-content.md).

## Context

A parity study measured `av:preview` at 79% of the kit this project forked from
and named three files that never arrived:

- `references/vendor/diagram-design-scripts/` — `verify-geometry.py`,
  `verify-motion.py`, `self_check.py`, a `run-validators.sh` wrapper, a licence
  and a provenance note;
- `references/html-antv-infographic.md`;
- `references/html-diagram-design.md`.

Nothing in this kit referenced any of them, so the drop looked deliberate. No
decision record said so, which is what this ADR fixes.

The three do not share a fate, because in between the fork and now `av:diagram`
was ported, and it vendors the **same upstream** the validators come from:
`cathrynlavery/diagram-design`, MIT, pinned at
`09df49d8d1a1c7fb2efdfcdc7a2a0713534350a6`, 72 editorial templates.

## Decision

### The validators go to `av:diagram`

They check diagram geometry and motion. `av:diagram` is the skill that produces
geometry and motion; it already ships a Python pipeline (`render.py`,
`record.py`, `doctor.py`, `snapshot_test.py`) and a vendoring mechanism aimed at
the same repository. `av:preview` runs no Python at all, so restoring them under
`preview/references/vendor/` would have left executable third-party code in a
skill with no interpreter and no caller.

They live at `kit/skills/diagram/scripts/validators/`, beside the pipeline whose
output they read.

### `html-antv-infographic.md` is ported, as a reference

An infographic mode has no equivalent anywhere in the kit, and
`kit/skills/preview/references/html-libraries.md` is already the CDN-library
reference in exactly the shape it needs. It was written into that shape rather
than copied, and covers AntV G2 only — G6, X6 and L7 are explicitly out, because
relationship graphs route to Mermaid or `av:diagram` and maps are outside
preview's scope.

**No new flag.** The mode is `/av:preview --html --explain <topic>` with the file
loaded alongside the other HTML references. Preview's argument resolution, its
error table, and its operation table are unchanged; the routing table's Mode
Selection gained one row that says so. Inventing `--infographic` would have added
a user-facing command surface for what is a choice of reference file.

### `html-diagram-design.md` is not restored

Its content is the editorial diagram system `av:diagram` now implements as 72
vendored templates plus token CSS. Re-porting the prose would restate what the
templates carry, in a skill that cannot act on it.

What was genuinely missing was the pointer:
`kit/skills/preview/references/visual-explanation-routing.md` listed
`mermaidjs-v11`, `tech-graph`, `ai-multimodal`, `ui-ux-pro-max` and `docs` under
Specialist Handoffs, and not `av:diagram` — so a caller routed to preview for a
publish-grade diagram was never told the better surface existed. That line now
exists. The routing gap, not the prose, was the defect.

## Where the files actually came from

The four scripts were observed in a *downstream* copy at
`preview/references/vendor/diagram-design-scripts/`, which is not their origin. A
read-only `git ls-tree` against the pinned sha resolved them:

| File | At `09df49d8…` |
|---|---|
| `verify-geometry.py` | `scripts/verify-geometry.py` |
| `verify-motion.py` | `scripts/verify-motion.py` |
| `self_check.py` | `skills/diagram-design/scripts/self_check.py` |
| `run-validators.sh` | **absent — the commit contains no `.sh` file at all** |

Two consequences. The three Python files sit in **two different upstream
directories**, so `vendoring-metadata.yaml` records an `upstream_path` per file
rather than one shared prefix. And `run-validators.sh` was authored by the kit
this project forked from — its own provenance file says so — so it could not be
vendored under the upstream MIT attribution. It was **written here**, to the same
advisory contract, and carries no third-party attribution. Attribution follows
authorship in both directions: the vendored files got a `LICENSE`, and the file
nobody upstream wrote got none.

The three vendored files were byte-identical to the downstream copies that were
measured, so the parity number and the pin agree and no divergence needs
recording.

Upstream also ships `scripts/test-verify-geometry.py` and
`scripts/test-verify-motion.py` at that sha. They were **not** ported: the drop
being closed names three validators, and adding their test suites is a separate
decision about running third-party tests in this repository's CI.

## The vendoring script had to be fixed first

A recorded `sha256_12` is evidence of what was written, never of where it came
from. Three defects made the mechanism unable to support the claim this ADR
makes, and all three were fixed before anything was vendored:

- **It did not pin.** `vendor_from_upstream.py` read whatever checkout the
  operator produced and derived provenance afterwards with `rev-parse HEAD`; its
  own usage block told the operator to `git clone --depth 1` the default branch.
  It now takes a required `--sha`, checks the source out to it, and exits
  non-zero when `rev-parse HEAD` disagrees — `"unknown"` counts as disagreement.
- **It destroyed provenance.** `_write_metadata` rebuilt the whole YAML from a
  fixed header plus `templates:`, which would have erased the `extra_vendors:`
  block that is the only record for the vendored `assets/mermaid.min.js`
  (11.4.1, `sha256_12: a43bc1afd446`). It now carries every non-generated block
  through verbatim.
- **It was not idempotent.** Stamps came from `datetime.now(...)` and were hashed
  into each file, so any re-run rewrote all 72 templates and all 72 hashes,
  burying a 4-file change in a 72-file diff. Stamps now derive from the pinned
  commit's committer date (`git show -s --format=%cI`), making the output a pure
  function of (sha, target set).

### One accepted deviation

Making the stamps commit-derived necessarily rewrote the wall-clock `imported_at`
line in all 72 existing template headers, once. There is no ordering that avoids
it — dropping the field or hashing unwrapped content churns the same 72 files.
The one-time normalization was accepted and verified: `git diff -U0` shows
`imported_at` as the only changed line in every one of the 72, `extra_vendors:`
is intact, and a second run at the same sha reports `created=0 updated=0
skipped=75` with a clean tree. From here on, a same-sha re-run is an empty diff.

## Execution safety, stated without inflation

`scripts.executionPolicy` is scoped by its own schema description to
`ariadnev skill run`, and the only enforcement lives inside that action's branch
in `skill-env-command.ts`. So:

- The documented invocation is
  `av skill run diagram scripts/validators/run-validators.sh`, and that is the
  only path `scripts.executionPolicy: never` can refuse.
- An agent that invokes the scripts directly through Bash never reaches that
  code path. It runs unsandboxed third-party Python with no gate in front of it.
  `SKILL.md` says exactly this.

The comment defending the `allow` default in `config-schema.ts` — "these are the
kit's own scripts, hash-tracked by the install receipt" — no longer describes
`av:diagram`, because three of its scripts are now somebody else's. Changing that
comment was out of scope for the work that found it; this record is the flag.

The validators stay **opt-in**. Nothing in `av:diagram`'s default render path
invokes them, they need existing render output, and `run-validators.sh` exits 0
unconditionally so a validator can never block artefact delivery. Two known
false-positive sources are documented in `SKILL.md` rather than patched, because
patching vendored source to make it fit this layout would forfeit the byte-level
provenance that justifies vendoring it at all.

## Consequences

- `av:diagram` now carries a `LICENSE` — the upstream MIT text and copyright,
  covering the three vendored validators and the 72 templates that had shipped
  without it since the port. This closes unresolved question 3 of that port's
  report.
- Vendoring executable code rather than templates raised the bar on the
  dependency story, so `kit/skills/diagram/scripts/ariadnev-lock.json` was
  generated and committed. The three validators are stdlib-only, so
  `requirements.txt` is unchanged; the lock exists because `av skill verify`
  reported the skill as `unknown` for want of one, and adding scripts without it
  would have widened that gap.
- The vendored files are byte-verbatim, with no comment header, unlike the 72
  wrapped templates. A Python file cannot carry an HTML comment, and the effect
  is a stronger claim: the recorded hash is the upstream file's own, checkable
  against `git show <sha>:<path> | shasum -a 256`.
- `av:preview` gains one reference file and two routing lines. It gains no
  command, no flag, and no executable code.
- The parity study's open question is answered: two of the three drops were
  deliberate in substance and undocumented in fact, and the third — the missing
  `av:diagram` handoff — was a real gap that the parity percentage did not
  measure.

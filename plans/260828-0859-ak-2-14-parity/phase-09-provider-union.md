---
phase: 9
title: "Provider union"
status: pending
priority: P1
effort: "4-6d"
dependencies: [1]
---

# Phase 9: Provider union

## Overview

Take the provider matrix from 6 to 9 by adding `dsh`, `grok`, and `omp` — with
real evidence per cell, at the standard `spec-verified.ts` already enforces.

This phase depends only on phase 1 and can be scheduled into any gap after it.
Doing it **early** is preferred: it is the phase most likely to produce a scope
conversation rather than a commit, because `dsh` cannot be observed on this
machine at all.

## Requirements

**Functional**
- `ProviderId` gains `dsh`, `grok`, `omp`; `MATRIX_PROVIDERS` lists 9.
- `resolver.ts` `targetTemplate()` returns a path for every verified cell.
- `av contract --json` reports 9 × 9 with evidence level, provider version, date.
- The README table regenerates from the matrix — it already does; keep one source.

**Non-functional**
- **No cell verified without evidence.** `observed` = the provider was run and
  seen to load the artifact. `convention` = the neutral `.agents/` layout,
  observed working elsewhere. Everything else is `none`, and the installer skips
  it and logs.
- `src/adapt/` stays pure; adapt path constants go in `src/adapt/paths.ts` only.

## Architecture

`spec-verified.ts` is a per-provider verification table with a deliberately
narrow evidence ladder, and its header names the failure mode it exists to
prevent: self-certification — *"installed it, seems fine" is not an observation*.
This phase does not touch the ladder. It adds three providers and fills cells
only to the level the evidence supports.

**Probed on this machine, 2026-08-28:**

| Provider | Binary | Home | What is observable |
|---|---|---|---|
| `grok` | not on PATH | `~/.grok/` populated | `{agents,hooks,rules,skills}` — Claude-shaped, holding real `ak-*` skills and all 16 agent files |
| `omp` | `omp/18.0.4` | `~/.omp/` populated | `~/.omp/agent/{agents,skills,rules,extensions}`, plus SQLite session state |
| `dsh` | **not found** | **no `~/.dsh`** | **nothing — absent even from `~/.agentkit/adapters/`** |

`omp` has a binary, so a load check can upgrade its cells to `observed`. `grok`
has files in a known-good layout but no binary here, so its cells top out at
`convention` — defensible, and correctly labelled as the weaker evidence it is.

`dsh` has neither. Its cells are `none`, the installer skips it, and the README
says skipped. That is a partial miss against "y chang", and it is escalated
rather than absorbed. **`spec-verified.ts` treats skip-and-log as correct
behavior, not as failure** — shipping a guessed path would be the failure.

**One trap worth naming:** `omp`'s artifacts live under `~/.omp/**agent/**`, not
`~/.omp/`. A constant written one level too high installs into a directory the
tool ignores, and a directory listing would never reveal it. Only the load check
does.

## Related Code Files

- Modify: `packages/cli/src/providers/spec-verified.ts` — `ProviderId` + three records
- Modify: `packages/cli/src/providers/provider-matrix.ts` — `MATRIX_PROVIDERS`
- Modify: `packages/cli/src/providers/resolver.ts` — `targetTemplate` cases
- Modify: `packages/cli/src/adapt/paths.ts` — new adapt path constants
- Modify: `packages/cli/src/providers/matrix-drift.ts` + `.test.ts`
- Modify: `packages/cli/src/providers/spec-evidence.test.ts`
- Modify: `kit.config.json` — `providers`
- Modify: `portable-manifest.json` — migrations if a new root collides
- Modify: `README.md` — regenerated matrix + an explicit skipped-provider note
- Create: `plans/reports/observation-260828-grok-omp.md` — the evidence

## Implementation Steps

1. **Observation run, recorded before any code.** For `grok` and `omp`: install a
   known artifact by hand, run the provider, and capture whether it lists the
   skill by name or the content appears in the prompt it builds. Write the
   transcript to the observation report. That report is what `spec-verified.ts`
   cites — without it, no cell can be `observed`.
2. **Attempt `dsh`.** Locate the tool, its install method, its config home.
   Time-box to half a day. If it cannot be installed, stop and raise open
   question 1 with the maintainer. Do not invent a path.
3. Failing tests first: extend `spec-evidence.test.ts` so every `verified: true`
   cell must carry a non-empty note, an `observedVersion`, and an `observedOn`.
   This should fail for any new cell added without its evidence.
4. Add adapt path constants to `src/adapt/paths.ts`. The engine stays pure —
   observation happens in the report, never at runtime.
5. Add the three `ProviderVerification` records at exactly the level step 1
   supports. Expect a mix: `omp` mostly `observed`, `grok` mostly `convention`,
   `dsh` entirely `none`.
6. Extend `resolver.ts`; run `matrix-drift.test.ts`, which exists to catch the
   matrix and the resolver disagreeing.
7. Regenerate the README table, and add a paragraph naming any provider whose
   cells are `none` and why — so a reader is not left inferring it from dashes.
8. Update `kit.config.json`; add a `providerPathMigrations` entry if a new
   provider's root overlaps an existing one.

## Success Criteria

- [ ] `av contract --json` reports 9 providers × 9 artifacts
- [ ] Every `verified: true` cell carries a note, a version, and a date — asserted
- [ ] The observation report is committed and cited from `spec-verified.ts`
- [ ] `dsh`'s real status is stated in both the README and `av contract`
- [ ] `omp` cells resolve to `~/.omp/agent/…`, confirmed by a load check
- [ ] `matrix-drift.test.ts` green
- [ ] `src/adapt/` still pure and ≥90% covered
- [ ] `pnpm test` green

## Risk Assessment

**`dsh` cannot be verified, so "9 providers" is really "8 + 1 skipped".** The
headline risk, and the reason to run this phase early.
*Signal:* step 2 ends without a binary. *Response:* ship 8 verified and 1
skipped, state it in the README and `av contract`, and put it to the maintainer.
Do **not** guess a path — that ships an installer writing to a location nobody
has confirmed exists, which is worse than a documented gap.

**A cell is marked `observed` from a directory listing.** Seeing
`~/.grok/skills/ak-advise` proves AgentKit wrote there; it does not prove grok
reads it. The ladder exists for this exact confusion.
*Signal:* an `observed` note describing a file existing rather than a provider
loading it. *Response:* step 3 requires the note; review rejects notes that
describe listings. In doubt, the cell is `convention`.

**`omp`'s nesting.** A path constant one level too high writes into an ignored
directory, and everything looks fine.
*Signal:* the load check fails while files are written successfully.
*Response:* the load check is the gate. A cell that fails it is `none`, however
plausible the path looked.

**Three providers × 9 artifacts widens the install test surface sharply.**
*Signal:* CI delta against phase 1's `ciBaselineSeconds` exceeds ~20%.
*Response:* table-drive the provider tests rather than writing 27 new cases.

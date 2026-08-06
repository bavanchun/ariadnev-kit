---
phase: 3
title: "Provenance fields and distill-decisions registry"
status: completed
priority: P1
effort: "2-3d"
dependencies: [2]
---

# Phase 3: Provenance fields and distill-decisions registry

## Overview

Give every skill a verifiable link back to the upstream it was distilled from, and create the single registry that records what was deliberately dropped. Without this, Phase 4's coverage gate has nothing to compare against and Phase 5's restoration would pull content from an unidentified source version.

## Requirements

- Functional: each skill declares `upstream`, `upstream_version`, `upstream_digest`, and `upstream_relation`; a no-upstream skill uses the explicit string sentinel `"none"` for all source-valued fields. `kit/distill-decisions.json` records extracted and rejected claims per distilled skill; a script computes a canonical digest from the complete authored upstream tree.
- Non-functional: all provenance values are **strings** — `agentskills.io` defines `metadata` as a string→string map, and the kit must stay spec-valid. The digest must be reproducible from the same source tree.

## Architecture

**Why version alone is insufficient.** AgentKit exposes no git sha locally — only 1 of 97 skills carries `upstream_sha`, and that is for a third-party vendored source. What is available is per-skill `metadata.version` (for example, `ak-plan` is 1.4.0 and `ak-skill-creator` is 4.0.0 as rechecked on 2026-08-06). But ak can edit content without bumping that version, so version alone cannot detect drift. Hence version **and** a canonical source-tree digest. Version examples and Phase 5 ratios are snapshots only; `pin-upstream.ts` re-reads every value at execution time.

Frontmatter shape:

```yaml
metadata:
  upstream: "ak:plan"                    # source skill id, or "none"
  upstream_version: "1.4.0"              # source metadata.version at pin time
  upstream_digest: "sha256:<hex>"        # canonical digest of authored source tree
  upstream_relation: "distill"           # distill | fork | none
```

`upstream_relation` resolves two of the plan's open questions: `obsidian-second-brain-note` (no ak source) and a newly scaffolded original skill use `upstream`, `upstream_version`, and `upstream_digest` all set to `"none"`, with `upstream_relation: "none"`; `git` is a fork of `ak-git` rather than a distillation, so `upstream_relation: "fork"` — and Phase 4 exempts forks from coverage, since a fork intentionally diverges.

**Canonical digest input.** Hash every authored regular file under the upstream skill root, including `SKILL.md`, references, scripts, workflows, tests, assets, package/config files, and license files. Exclude only volatile or generated paths: `.git/`, `node_modules/`, `__pycache__/`, `dist/`, `build/`, `coverage/`, `*.pyc`, and `.DS_Store`. Reject symlinks rather than following an ambiguous or out-of-root target.

Normalize each relative path to `/`, sort paths bytewise, and hash a length-framed stream for every entry: path-byte-length, path bytes, content-byte-length, raw content bytes. Including the path and both lengths means a rename changes the digest and prevents concatenation-boundary collisions such as `ab` + `c` versus `a` + `bc`. The pure function accepts `{ path, content: Uint8Array }[]`; filesystem traversal stays in the authoring script.

`kit/distill-decisions.json`:

```json
{
  "schema_version": 1,
  "skills": {
    "plan": {
      "upstream": "ak:plan",
      "upstream_version": "1.4.0",
      "upstream_digest": "sha256:…",
      "upstream_relation": "distill",
      "pinned_at": "2026-08-06",
      "claims": [
        { "id": "c001", "text": "…", "status": "covered" },
        { "id": "c002", "text": "AgentKit CLI required for plan operations",
          "status": "rejected", "why": "vcskill is a standalone binary; no ak dependency" }
      ]
    }
  }
}
```

One registry for the whole kit (user decision) — it doubles as the auditable answer to "what did we deliberately drop from AgentKit?".

## Related Code Files

- Create: `kit/distill-decisions.json`
- Create: `packages/cli/src/kit/upstream-digest.ts` — pure canonical length-framed digest over supplied path + raw-byte entries
- Create: `packages/cli/src/kit/claim-extract.ts` + test — pure deterministic source-text claim extraction needed by the pin helper; Phase 4 consumes and coverage-gates it
- Create: `packages/cli/scripts/pin-upstream.ts` — Bun authoring helper that imports the shared TypeScript digest, walks an ak source dir, filters volatile/generated entries, and emits version + digest + extracted claims
- Modify: `packages/cli/src/kit/skill-lint.ts` — require the provenance fields, validate their shapes
- Modify: `packages/cli/src/kit/skill-lint.test.ts`
- Create: `packages/cli/src/kit/upstream-digest.test.ts`
- Modify: `packages/cli/src/kit/skill-template.ts` — add the explicit four-field no-upstream provenance sentinel for newly-authored skills
- Modify: `packages/cli/src/cli/add-skill.test.ts` — generated skill remains valid after provenance enforcement
- Modify: all 26 `kit/skills/*/SKILL.md` — add the metadata block
- Modify: `docs/vc-skill-authoring-spec.md` — document the provenance contract

## Implementation Steps

1. Failing tests for `upstream-digest.ts`: same tree → same digest despite input order; changed raw byte → different digest; renamed file with identical bytes → different digest; ambiguous content boundaries → different digests; script/workflow change → different digest.
2. Implement `upstream-digest.ts` as the pure length-framed hash over `{ path, content: Uint8Array }[]`; normalize relative separators, sort paths, and reject duplicate/absolute/parent-traversal paths.
3. Add failing tests and implement pure deterministic claim extraction, then write `pin-upstream.ts`: given an installed ak skill dir, walk regular authored files, apply the explicit exclusion list, reject symlinks, import the shared digest and claim extractor, and print `upstream_version`, `upstream_digest`, and the extracted claim list as JSON. Add traversal tests proving an excluded cache file does not change the digest while a script/workflow file does.
4. Failing lint tests: missing `upstream`; malformed digest; inconsistent `"none"` sentinels; `upstream: "none"` with a non-`none` relation; unknown `upstream_relation` value.
5. Implement the lint rules.
6. Update `skill-template.ts` so newly-authored skills emit the four explicit `"none"` provenance values; prove `vcskill add-skill` still creates a loadable skill after provenance enforcement.
7. Re-read current upstream versions, then pin all 26 skills — populate frontmatter (`upstream`, `upstream_version`, `upstream_digest`, `upstream_relation`) and seed `kit/distill-decisions.json`. **Extract claims only for the 8 skills Phase 5 reshapes** (Validation Session 1, decision 4): the other 18 get version + digest only, and their `claims` array stays absent until a later wave needs it. Classification of the extracted claims happens in Phase 4/5, not here.
8. Record the no-upstream / fork cases explicitly (`obsidian-second-brain-note`, `git`, plus any other found while pinning).
9. Update the authoring spec.

## Success Criteria

- [x] `upstream-digest` is deterministic, input-order-independent, path-sensitive, boundary-safe, and byte-sensitive (tests prove each property)
- [x] Digest covers scripts, workflows, tests, assets, config, and licenses as well as Markdown; only the documented volatile/generated paths are excluded
- [x] All 26 skills carry the four provenance fields; lint fails if any is absent or malformed
- [x] `kit/distill-decisions.json` validates against its own `schema_version: 1` shape
- [x] `pin-upstream.ts <ak-skill-dir>` emits current version + canonical digest + claims without network access and rejects symlinks
- [x] `upstream_relation: "none"` requires all three source-valued fields to equal `"none"`; fork cases are represented and pass lint
- [x] `vcskill add-skill` emits the valid no-upstream sentinel and remains loadable after the new lint
- [x] All values are strings — the kit remains valid against the `agentskills.io` metadata contract
- [x] Registry carries `claims` for exactly the 8 Phase-5 skills; the other 18 have provenance but no claims array
- [x] `pnpm test` green

<!-- Updated: Validation Session 1 - claim extraction narrowed to the 8 reshaped skills -->

## Risk Assessment

- **Pinning requires ak installed locally.** Accepted: pinning is an authoring-time act, not a check-time one. Phase 4's checker must run offline from the registry — that boundary is the whole point of storing claims rather than re-reading the source.
- **Digest churns on any authored-tree edit, including whitespace, tests, or license changes.** Accepted for now: provenance should detect source-tree drift, not guess semantic importance. Revisit with a separately reported semantic diff only if churn proves unworkable; do not weaken the canonical identity hash.
- **Generated/cache noise makes digests machine-dependent.** Mitigation: one explicit exclusion list with traversal tests; normalize paths and hash raw bytes. A newly encountered generated directory is a deliberate list change, not an ad-hoc local ignore.
- **Registry grows large at 97 skills.** Mitigation: store normalized claim strings only, never source prose. Measure after the first two skills; if an entry exceeds ~200 lines, reconsider per-skill files (rejected in brainstorm, but the trigger is recorded here).
- **`upstream_relation: "fork"` could become a loophole** to avoid coverage. Mitigation: only `git` is a fork today; any new fork needs an explicit note in the registry.

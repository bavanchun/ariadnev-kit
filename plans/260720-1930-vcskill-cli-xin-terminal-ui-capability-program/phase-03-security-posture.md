---
phase: 3
title: Security Posture
status: completed
effort: S
---

# Phase 3: Security Posture

## Overview

Close the "never echo a secret" hole and add a private vuln-reporting doc — expected of a tool that distributes binaries and proxies a GitHub token at the edge.

## Requirements

- Functional: any error text/stack printed by the CLI has `GH_TOKEN`/`GITHUB_TOKEN` values and `https://user:pass@host` / `https://x-access-token:…@host` creds redacted first. `SECURITY.md` documents private reporting + scope + user best-practices.
- Non-functional: sanitizer is pure, ≥90% covered, allocation-cheap (runs on every error path).

## Architecture

`src/security/credential-sanitizer.ts` (pure): `sanitize(text:string) → string`. Redacts:
- URL userinfo: `https?://[^/@\s]+@` → `https://••••@` (the real vector — self-update/fetch URLs).
- common token patterns (`ghp_…`, `github_pat_…`, `gho_…`, `sk-…`) by regex.
- env-sourced secret values (`GH_TOKEN`, `GITHUB_TOKEN`, `VCSKILL_*_TOKEN`, and any `*_TOKEN`/`*_KEY` env) **only when the value is ≥8 chars AND matches a token shape** — never empty/short values (red-team: `GH_TOKEN=""`/`"1"` would otherwise shred all output).

**WIRING (red-team Critical/High)**: hook `sanitize()` into the single `emit()` output helper from Phase 1 — **the output boundary**, not just the top-level catch. This covers command *summary* strings (e.g. `update-command.ts:222` → printed at `index.ts:172`) that never propagate to the catch. Also sanitize the top-level `.catch` and direct `console.error` sites (`index.ts:130,146`, `add-skill-command.ts:56`). Real untrusted-string vectors to cover: spawned `VC_EVAL_CMD` stderr (Phase 4) and `history.jsonl` payloads (Phase 6) — route both through `sanitize`.

`SECURITY.md` at repo root: report via GitHub private advisory + email; supported versions; scope (binary; note the token proxy lives in the **separate** edge repo); "rotate your PAT if leaked" guidance by reference (do not duplicate secrets).

## Related Code Files

- Create: `packages/cli/src/security/credential-sanitizer.ts` + `credential-sanitizer.test.ts`
- Create: `SECURITY.md` (repo root)
- Modify: `packages/cli/src/index.ts` (sanitize top-level catch), any error-printing summary path

## Implementation Steps (TDD — tests first)

1. **Write failing tests**: `sanitize` redacts `https://user:tok@github.com`, `ghp_`/`github_pat_`/`sk-` patterns, a ≥8-char token-shaped `process.env.GH_TOKEN`; **leaves output unchanged for `GH_TOKEN=""` and `GH_TOKEN="1"`**; leaves clean text (incl a normal `@` path) unchanged; handles multiline stacks.
2. Implement `credential-sanitizer.ts` until green; extend `coverage.include` += `src/security/**`.
3. **Write failing test (the key one)**: drive `runUpdate` with an injected `replaceBinary` that throws a token-shaped message → the **printed summary** (via `emit`) is redacted (this is the path the old top-level-catch-only design missed).
4. Wire `sanitize()` into `emit()` (Phase 1 helper) + the top-level `.catch` + direct `console.error` sites.
5. Author `SECURITY.md`; link from README.

## Success Criteria

- [ ] No code path prints a raw PAT/`user:pass@`/`sk-` credential — proven by a test on the **summary-print** path, not only the top-level catch.
- [ ] Empty/short env values never trigger redaction (no output shredding); proven by test.
- [ ] `sanitize` pure, ≥90% covered (in `coverage.include`), clean text unchanged.
- [ ] `SECURITY.md` present, linked from README; `pnpm test` green.

## Risk Assessment

- **Sanitizer bypass via summary prints** [red-team High]: wire at the `emit` boundary, prove with the `runUpdate` summary test.
- **Output shredding from empty/short token** [red-team High]: ≥8-char + token-shape guard; explicit `GH_TOKEN=""`/`"1"` tests.
- **Redacting vectors the CLI can't produce** [red-team Medium]: prioritize url-userinfo + spawned-subprocess output + `history.jsonl` payloads (real) over env tokens the CLI never reads.

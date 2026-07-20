---
phase: 1
title: Identity + Terminal UI
status: completed
effort: M
---

# Phase 1: Identity + Terminal UI

## Overview

Foundation phase. Add a `vc` short alias and a lean, branded terminal UI cohesive with the `vcskill.vchun.dev` landing page. Introduce a single output-boundary `emit` helper (Phase 3 hooks the credential-sanitizer into it). Re-skin existing pure formatters. MVP-trimmed per red-team: one `ui/style.ts`, not a 15-file framework.

## Requirements

- Functional: `vc` invokes the same binary as `vcskill` (via install symlink, **not** npm bin). Output is colored/branded on a TTY and plain on pipe/CI/`NO_COLOR`. Install/doctor/list/validate/contract render through `ui/`; a custom branded banner replaces commander's default help on no-args/`--help`.
- Non-functional: zero new runtime dep (hand-rolled); `ui/` pure (color flag param, no global); ≥90% coverage on `ui/` **with `vitest.config.ts` `coverage.include` extended to `src/ui/**` in this same commit**; cross-platform incl Windows; existing formatter tests stay green (forced `color:false`).

## Architecture

Brand tokens from the landing page: coral `#ff6b45` (accent), teal `#4fb8a4` (ok), amber (warn), faint gray (muted/skip). Glyphs `✓ ✗ ⚠ ◆ ·` match the landing matrix.

**One module `src/ui/style.ts`** (~80–120 LOC, pure): `shouldColor(env, stream)`, named color fns (coral/teal/amber/faint/dim), `symbols`, `bar(pct)`, `wordmark()` (one-line template). Add `table()`/`box()` **only if** the contract grid needs them — start by inlining column `padEnd` at the 1–2 call sites (YAGNI). `spinner` deferred unless a long op (install/download) clearly needs it; if added, isolate in `ui/spinner.ts`, no-op when `!color`/non-TTY, keep out of pure formatters.

**Color gate precedence** (`shouldColor`): **piped / non-TTY / `CI` → plain, regardless of `FORCE_COLOR`** (protects the release smoke-test's ANSI-free regex on `validate`/`--version`, `smoke-binary.mjs:23,27`); `NO_COLOR` → plain; else `stream.isTTY`. `FORCE_COLOR` only forces color when stdout **is** a TTY. Windows: rely on TTY (modern Terminal ok; legacy cmd → plain).

**Output boundary**: introduce a single `emit(line)` / print helper in `src/cli/emit.ts` that all command actions use instead of raw `console.log`. Phase 3 wires `sanitize()` into it — do NOT scatter prints. Formatters remain pure string builders; the command layer calls `emit(formatter(results, {color: shouldColor(process.env, process.stdout)}))`.

**Banner**: override commander's help via `program.configureHelp()` / a custom `helpInformation` (index.ts has none today) so no-args/`--help` shows the coral `>_ vcskill` wordmark. `@clack/prompts` interactive install output is left as-is this round (documented; not threaded through `ui/`).

**`vc` alias** (install-time symlink is the ONLY shipped mechanism — the package is `private:true`, never npm-published):
- `install.sh`: after `mv → vcskill`, if `${INSTALL_DIR}/vc` does not exist **or** already points at vcskill → `ln -s vcskill "${INSTALL_DIR}/vc"` (no `-f`). If `vc` exists and is a different binary → skip + warn. Honor `VCSKILL_ALIAS=off`.
- `install.ps1`: mirror with a `vc.exe` copy + the same existence guard.
- `package.json` `bin`: add `vc` **only** labeled as a local `pnpm link` dev convenience — not the user mechanism.
- README + landing show `vc`.

## Related Code Files

- Create: `packages/cli/src/ui/style.ts` + `style.test.ts`; `packages/cli/src/cli/emit.ts` + `emit.test.ts`
- Modify: `packages/cli/src/cli/render-summary.ts`, `doctor-command.ts`, `list-command.ts`, `validate-command.ts`, `contract-command.ts` (thread `color`), `index.ts` (custom help/banner + use `emit`)
- Modify: `packages/cli/package.json` (bin — dev-labeled), `install.sh`, `install.ps1`, `vitest.config.ts` (coverage.include += `src/ui/**`, `src/cli/emit.ts`), `README.md`, `../vcskill-web/landing.html`

## Implementation Steps (TDD — tests first)

1. **Failing tests** for `shouldColor`: non-TTY→plain even with `FORCE_COLOR=1`; `CI`→plain; `NO_COLOR`→plain; TTY+FORCE_COLOR→color; TTY default→color.
2. **Failing tests** for color fns/`symbols`/`bar`/`wordmark` (wrap only when `color:true`; identity/plain when `color:false`).
3. Implement `ui/style.ts` until green; extend `coverage.include`.
4. **Failing test**: `render-summary(color:false)` byte-identical to current output (lock regression); `color:true` contains ANSI + coral.
5. Add `emit.ts` (plain passthrough now; Phase 3 adds sanitize). Route command actions through `emit`. Thread `color`. Re-run existing formatter tests (stay green).
6. Custom commander help/banner; verify no-args shows branded banner, `--help | cat` is plain.
7. `vc` symlink in install.sh/ps1 with existence guard + `VCSKILL_ALIAS=off`; dev-labeled `bin`; README + landing updated.
8. Manual: `vc --version` (plain-safe), `NO_COLOR=1 vc doctor`, `FORCE_COLOR=1 vc validate | cat` (must stay ANSI-free), TTY run (branded).

## Success Criteria

- [ ] `vc` created by the install **symlink** (not bin), with a guard that never clobbers a pre-existing different `vc`; `VCSKILL_ALIAS=off` skips it.
- [ ] `ui/style.ts` + `emit.ts` pure, ≥90% covered **and included in `coverage.include`**.
- [ ] Piped/`CI`/`NO_COLOR`/`FORCE_COLOR`-on-pipe output is plain and byte-stable vs pre-phase; TTY output branded.
- [ ] No-args/`--help` shows the branded banner (custom commander help).
- [ ] `contract` renders a terminal grid matching landing glyphs; README + landing show `vc`; `pnpm test` green.

## Risk Assessment

- **Release smoke-test breakage (FORCE_COLOR ANSI leak)** [red-team]: non-TTY plain regardless of FORCE_COLOR; add the explicit test. Mitigates `smoke-binary.mjs` regex failure.
- **`vc` clobber** [red-team]: existence guard in install.sh (no `-f`), warn+skip on conflict — in the step AND a success criterion, not just prose.
- **bin-field is a no-op for users** [red-team]: symlink is the mechanism; bin dev-labeled only.
- **Banner/prompts aren't pure formatters** [red-team]: explicit sub-task for custom commander help; `@clack` left as-is (documented).
- **Formatter regressions**: byte-equality lock on `color:false` before threading.

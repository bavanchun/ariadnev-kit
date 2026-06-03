---
phase: 4
title: "CLI surface"
status: completed
priority: P1
effort: "6h"
dependencies: [3]
---

# Phase 4: CLI surface

## Overview
Build the `vcskill` CLI (`commander` + `@clack/prompts`) over `installKit` and `loadKit`: interactive provider multiselect + scope picker, plus non-interactive flags for CI/scripting. Entry compiled to `dist/index.js`, exposed as `npx vcskill`.

## Requirements
- Functional: `vcskill install` (interactive: multiselect providers, scope project/global, confirm), `vcskill install --provider codex,cursor --global --dry-run` (non-interactive), `vcskill list` (kit contents + per-provider install state). `--dry-run`, `--yes` (skip prompts), `--home`/`--cwd` (test/override).
- Non-functional: TTY-detect → fall back to flags when non-interactive; clear summary table after install (written/backed-up/skipped counts); non-zero exit on error.

## Architecture
`packages/cli/src/`:
- `index.ts` — commander program: subcommands `install`, `list`, (`add-skill`/`migrate` registered Phase 5/6). Parses global opts (`--home`, `--cwd`, `--dry-run`, `--yes`).
- `cli/prompt-providers.ts` — `@clack/prompts` multiselect over `kit.config.json.providers`; scope select; cancel handling. Skipped when `--provider`/`--yes` given.
- `cli/install-command.ts` — resolves providers (flags ∪ prompt) → `loadKit` → `installKit` → render summary via `cli/render-summary.ts`.
- `cli/list-command.ts` — prints kit artifacts (via `resolveKitRoot()`, Phase 1) and, per provider/scope, whether target exists; flags `verified:false` cells as "(unsupported/unverified)".
- `cli/render-summary.ts` — pure formatter `(InstallResult[]) → string`; unit-tested.

Build: `tsup` (or `tsc`) → `dist/index.js` with shebang `#!/usr/bin/env node`; `bin.vcskill` in `packages/cli/package.json`.

## Related Code Files
- Create: `src/index.ts`, `src/cli/{prompt-providers,install-command,list-command,render-summary}.ts`
- Create (TDD first): `src/cli/{install-command,render-summary,list-command}.test.ts` (invoke command handlers programmatically with injected ctx + `dryRun:true`; assert plan + summary string, not real I/O)
- Modify: `packages/cli/package.json` (bin, build script, deps: commander, @clack/prompts, tsup)

## Implementation Steps
1. **TDD render-summary:** golden string for a known `InstallResult[]` (written/backup/skip counts per provider). Implement → green.
2. **TDD install-command (non-interactive):** call handler with `{provider:'codex,cursor', scope:'project', dryRun:true, home, cwd}`; assert returned plan covers both providers, zero writes. Implement handler (flag parsing, provider resolution, calls installKit) → green.
3. **TDD list-command:** seed tmp targets, assert install-state detection. Implement → green.
4. Implement `prompt-providers.ts` interactive path (manual smoke only — clack prompts hard to unit-test; guard behind TTY/`--yes`). Keep logic-free: just gathers selections then delegates to the tested handler.
5. Wire `index.ts` commander program; add shebang + `tsup` build; verify `node dist/index.js list` runs.
6. Manual e2e: `node dist/index.js install --provider claude-code --cwd /tmp/vcskill-e2e --dry-run` then without dry-run; inspect tmp output.

## Todo List
- [ ] render-summary (test→impl)
- [ ] install-command non-interactive (test→impl)
- [ ] list-command (test→impl)
- [ ] interactive prompt-providers (smoke)
- [ ] commander wiring + tsup build + shebang
- [ ] manual e2e dry-run + real into tmp

## Success Criteria
- [ ] `node dist/index.js install --provider codex,cursor --dry-run --cwd <tmp>` prints plan, writes nothing
- [ ] Same without `--dry-run` writes adapted files to `<tmp>`
- [ ] `vcskill list` shows kit artifacts + install state
- [ ] CLI exits non-zero on bad provider name (validation test)
- [ ] Interactive run works in a real terminal (manual)

## Risk Assessment
- Interactive prompts untestable in CI → keep all logic in tested handlers; prompts only collect input. Accepts manual smoke for the thin prompt layer.
- ESM + shebang + bin interplay → verify `tsup` emits executable with correct shebang; test `node dist/index.js`.
- Provider name typos → validate against `kit.config.json.providers`, friendly error.

## Next Steps
Phases 5 (migrate) and 6 (add-skill + docs) register additional subcommands on the same program; both depend on this CLI scaffold and are parallelizable.

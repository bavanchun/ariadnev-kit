---
phase: 3
title: "Provider resolvers and installer"
status: completed
priority: P1
effort: "1d"
dependencies: [2]
---

# Phase 3: Provider resolvers and installer

## Overview
Wrap the pure adapt engine with filesystem I/O: per-provider target-path resolvers (data-driven configs), timestamped backup, and an idempotent install that copies + adapts each kit artifact to the chosen provider/scope. Integration-tested against temp dirs (no real `~/.claude` writes).

## Requirements
- Functional: `install(kit, provider, scope, opts)` writes every skill/agent/command/rule/env to correct target paths, adapted; backs up existing targets first; `--dry-run` prints planned ops without writing; re-running is idempotent (backup rotates, no corruption/dupes).
- Non-functional: all writes confined to a resolvable root (project `./` or user `~/`), overridable via `opts.home`/`opts.cwd` for tests; no destructive op outside backup.

## Architecture
`packages/cli/src/providers/` — one module per provider exporting a `ProviderResolver`:
```ts
interface ProviderResolver {
  id: 'claude-code'|'codex'|'cursor'|'antigravity'|'opencode'|'generic';
  targetFor(artifact: Artifact, scope: 'project'|'global', home: string, cwd: string): string; // abs path
  supports: { skills:true; agents:boolean; commands:boolean; rules:boolean };
}
```
Target matrix (corrected vs claudekit generators; ALL paths via `adapt/paths.ts` constants; `verified:false` cells SKIP-with-log, never guess):
| Artifact | claude-code | codex | cursor | antigravity | opencode | generic |
|---|---|---|---|---|---|---|
| skill | `.claude/skills/<n>/` | `~/.agents/skills/<n>/` | `.agents/skills/<n>/` | `.agents/skills/<n>/` | `.opencode/skills/<n>/` | `.agents/skills/<n>/` |
| agent | `.claude/agents/<n>.md` | `~/.codex/agents/<n>.toml` | `.agents/skills/<n>/`(shim) | **SKIP (unverified)** | `.opencode/agents/<n>.md` (**plural**) | skip |
| command | `.claude/commands/<n>.md` | `~/.codex/<CODEX_COMMANDS_DIR>/<n>.md` | `.cursor/commands/<n>.md` | **SKIP (unverified)** | `.opencode/commands/<n>.md` (**plural**) | skip |
| rules | `.claude/rules/` | AGENTS.md block | `.cursor/rules/<n>.mdc` | AGENTS.md block | AGENTS.md block | AGENTS.md block |
| scripts | `.claude/scripts/` | `~/.agents/vcskill/scripts/` | `.agents/scripts/` | `.agents/scripts/` | `.opencode/scripts/` | `.agents/scripts/` |
| env | `.claude/.env.example` | `~/.agents/vcskill/.env.example` | `.agents/.env.example` | `.agents/.env.example` | `.opencode/.env.example` | `.agents/.env.example` |

Notes: hooks NOT in matrix (not shipped v1). `<CODEX_COMMANDS_DIR>` = single `paths.ts` constant (default `commands`, H3). NEVER copy a real `.env` — replicate claudekit `IGNORE_FILES`/`IGNORE_DIRS` guard (skip `.env`, `.DS_Store`, `.git`, `node_modules`, `__pycache__`). All `~/` and global paths via `os.homedir()` (cross-platform). Use Phase 0 `spec-verified` to gate each (provider, artifact) cell.

`src/install/`:
- `backup.ts` — `backupPath(target, backupRoot)`: copy existing target into `<backupRoot>/<label>/<name>` before overwrite. `backupRoot` = `<resolverRoot>/.vcskill/backups/<timestamp>` (timestamp injected, not `Date.now()`). **Rotation: keep last 3 backup dirs, prune older** (not deferred — 10 lines, prevents disk bloat).
- `install.ts` — `planInstall(kit, resolver, scope, ctx)` → `InstallOp[]` (pure: {action:'write'|'skip', reason?, src, dest, adaptedContent}); `executeInstall(ops, {dryRun})` → fs writes. **Atomic write: stage to `<dest>.vcskill-tmp` (or temp dir) then `fs.rename` over dest** — no rmtree-in-place (crash-safe, fixes H5). `verified:false` cells emit `{action:'skip', reason:'unverified'}` surfaced in summary, never silently dropped.
- `agents-md.ts` — merge rules into a managed block in root `AGENTS.md` (delimited `<!-- vcskill:start -->…<!-- vcskill:end -->`) for providers that consume AGENTS.md; idempotent replace of the block.

## Related Code Files
- Create: `src/providers/{claude-code,codex,cursor,antigravity,opencode,generic}.ts`, `src/providers/index.ts` (registry)
- Create: `src/install/{backup,install,agents-md}.ts`
- Create (TDD first): `src/providers/*.test.ts`, `src/install/{install,backup,agents-md}.test.ts` using `os.tmpdir()` sandboxes
- Read for parity: `~/Documents/claudekit-engineer/scripts/codex_generator.py` (install_dir, convert_agent), `generate-opencode.py` main()

## Implementation Steps
1. **TDD resolvers:** table-driven test — for each (provider, artifact, scope) assert `targetFor` returns expected abs path under injected `home`/`cwd`. Implement resolvers + registry → green.
2. **TDD planInstall:** assert it produces one op per artifact with adapted content (mock `adaptArtifact` or use real) and correct dest; skipped artifacts (e.g. generic agents) absent. Implement → green.
3. **TDD backup:** seed temp target, run backup, assert original preserved under backupRoot, idempotent on re-run. Implement → green.
4. **TDD executeInstall:** run into tmp sandbox, assert files written + adapted; `--dry-run` writes nothing but returns full plan; second run backs up + overwrites cleanly (idempotency assertion: content identical, backup count +1). Implement → green.
5. **TDD agents-md merge:** assert managed block inserted/replaced, user content outside block preserved. Implement → green.
6. Wire `installKit(kit, providers[], scope, ctx)` convenience that loops providers.

## Todo List
- [ ] Resolver configs + registry (test→impl)
- [ ] planInstall pure plan (test→impl)
- [ ] backup with rotation (test→impl)
- [ ] executeInstall + dry-run (test→impl)
- [ ] AGENTS.md managed-block merge (test→impl)
- [ ] installKit multi-provider loop

## Success Criteria
- [ ] Install into tmp sandbox produces correct adapted files for all 6 providers (OpenCode paths plural)
- [ ] `--dry-run` writes zero files, returns complete op plan incl. skip reasons
- [ ] Re-install is idempotent: content stable, prior version backed up, **backups capped at 3**
- [ ] **Atomic**: simulated mid-write crash leaves dest either old-intact or new-complete, never half (temp+rename test)
- [ ] `verified:false` cells produce `skip` ops shown in summary (Antigravity agent/command), never silent
- [ ] No write escapes the resolver root (path-traversal guard); no real `.env` copied (IGNORE guard)

## Risk Assessment
- **UNVERIFIED Codex TOML schema / Antigravity paths** → gated by Phase 0 `spec-verified`; unverified = skip-with-log (no guess), surfaced in summary.
- Accidental write to real `~/.claude` during tests → ALWAYS inject `home`/`cwd`; guard test fails if any path resolves outside sandbox.
- Cross-platform: all path building via `path.join`/`os.homedir()`; test on POSIX, document Windows-path test if available.

## Next Steps
Phase 4 puts an interactive CLI over `installKit` (provider multiselect, scope, dry-run).

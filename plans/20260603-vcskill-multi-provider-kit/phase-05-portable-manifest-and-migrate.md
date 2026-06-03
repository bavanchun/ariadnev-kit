---
phase: 5
title: "Portable manifest and migrate"
status: completed
priority: P2
effort: "5h"
dependencies: [4]
---

# Phase 5: Portable manifest and migrate

## Overview
Add cross-version durability: `portable-manifest.json` records per-provider path migrations + renames keyed by kit version, and `vcskill migrate` relocates already-installed files when a user upgrades the kit and a provider's path convention changed. Ported from claudekit's `portable-manifest.json` pattern.

## Requirements
- Functional: `migrate` reads manifest, detects installed files at old paths for each provider/scope, moves them to new paths (with backup), records applied migrations to avoid re-running. `--dry-run` previews moves.
- Non-functional: idempotent (re-run = no-op once applied); never moves user files outside known managed paths; safe when target already migrated.

## Architecture
- `portable-manifest.json` (repo root) shape (claudekit parity):
  ```json
  {
    "version": "1.0",
    "kitVersion": "0.1.0",
    "renames": [],
    "providerPathMigrations": [
      { "provider": "antigravity", "type": "skill", "from": ".agent/skills", "to": ".agents/skills", "since": "0.2.0" }
    ],
    "sectionRenames": []
  }
  ```
- `src/migrate/manifest.ts` — `loadManifest()`, validate schema (zod), type the migration entries.
- `src/migrate/applied-state.ts` — read/write `<root>/.vcskill/applied-migrations.json` (list of applied `{provider,from,to,since}` keys).
- `src/migrate/plan-migrations.ts` — pure: `(manifest, appliedState, installedScan, ctx) → MigrateOp[]`. Only emits ops for migrations whose `from` path exists AND not already applied.
- `src/migrate/execute-migrations.ts` — move with backup; mark applied. Reuses `backup.ts`.
- `src/cli/migrate-command.ts` — registers `vcskill migrate [--provider …] [--scope] [--dry-run]` on the Phase 4 commander program.

## Related Code Files
- Create: `portable-manifest.json`, `src/migrate/{manifest,applied-state,plan-migrations,execute-migrations}.ts`, `src/cli/migrate-command.ts`
- Create (TDD first): `src/migrate/{manifest,plan-migrations,execute-migrations}.test.ts`
- Read for parity: `~/Documents/claudekit-engineer/portable-manifest.json`
- Modify: `src/index.ts` (register migrate subcommand)

## Implementation Steps
1. Write `portable-manifest.json` with the Antigravity `.agent`→`.agents` example (real, matches claudekit's 3.37.0 migration) so there's a non-trivial fixture.
2. **TDD manifest:** zod-validate valid + reject malformed. Implement loader → green.
3. **TDD plan-migrations:** fixtures — (a) `from` exists + unapplied → op emitted; (b) already applied → skipped; (c) `from` missing → skipped. Implement pure planner → green.
4. **TDD execute-migrations:** tmp sandbox, seed old-path file, run → asserts moved to new path, backup made, applied-state updated; re-run = no-op. Implement → green.
5. Register `migrate-command.ts`; manual e2e: seed `<tmp>/.agent/skills/x`, run `vcskill migrate --provider antigravity --cwd <tmp> --dry-run` then real.

## Todo List
- [ ] portable-manifest.json fixture
- [ ] manifest loader + zod (test→impl)
- [ ] plan-migrations (test→impl)
- [ ] execute-migrations + applied-state (test→impl)
- [ ] migrate subcommand + manual e2e

## Success Criteria
- [ ] `migrate` moves seeded old-path file to new path with backup
- [ ] Re-run is a no-op (applied-state respected)
- [ ] `--dry-run` previews moves, writes nothing
- [ ] Malformed manifest rejected with clear error

## Risk Assessment
- Moving user-modified files → always backup before move; only touch paths in manifest `from`.
- Manifest drift vs resolver paths → single source: resolvers + manifest both reference shared path constants where possible; add a test asserting manifest `to` paths match current resolver targets.

## Next Steps
Independent of Phase 6; both finalize the shippable CLI.

# AGENTS.md

Repo-level guidance for AI agents working on **vcskill**.

## Build & test

```bash
pnpm install
pnpm test          # vitest run (TDD — write failing test first)
pnpm coverage      # adapt/ must stay ≥90%
pnpm --filter vcskill build
```

## Architecture

- `kit/` — canonical source artifacts (Claude format). Skill rule: `name: vc:<dir>`.
- `packages/cli/src/adapt/` — **pure** adapt engine (paths, tool names, frontmatter,
  agent→TOML, command map). No fs/network. Path constants single-sourced in `paths.ts`.
- `packages/cli/src/providers/` — per-provider target resolvers + `spec-verified.ts`
  gate. Unverified `(provider, artifact)` cells → skip-with-log, never guess.
- `packages/cli/src/install/` — fs I/O: plan (pure) → execute (atomic temp+rename,
  backup with rotation, AGENTS.md managed-block merge).
- `packages/cli/src/migrate/` — `portable-manifest.json`-driven path migrations.
- `packages/cli/src/cli/` — commander program + handlers (logic is testable;
  prompts only gather input).

## Conventions

- ESM, strict TS, Node ≥18. Cross-platform: `os.homedir()` / `path.join`, never
  hardcode `$HOME` or `/`.
- Files <200 LOC; kebab-case names.
- Code comments explain the *why*; never reference plan phase/finding labels.
- Backups: atomic writes, keep last 3.

# CLAUDE.md

Claude Code guidance for **vcskill**. Mirrors `AGENTS.md`; read that for full detail.

## What this is

A Node/TypeScript monorepo that authors agent skills/subagents/commands/rules once
in canonical Claude format (`kit/`), then installs them to any AI provider via
`npx vcskill install`. A data-driven adapt engine rewrites paths/tool-names/formats.

## Working here

- **TDD**: write the failing test first, then implement. `pnpm test` must stay green.
- Adapt engine (`packages/cli/src/adapt/`) is **pure** — no fs/network — and ≥90% covered.
- Path constants live ONLY in `src/adapt/paths.ts`. Resolvers and rewrites both import
  them — change a path in one place.
- Provider support is gated by `src/providers/spec-verified.ts`. If a `(provider,
  artifact)` cell is unverified, the installer **skips and logs** — never guess a path.
- All writes are atomic (temp + rename) and back up the prior target (keep last 3).
- Cross-platform: `os.homedir()` / `path.join`. Never hardcode `$HOME` or `/`.
- Keep files <200 LOC, kebab-case. Comments explain *why*, not plan labels.

## Commands

`vcskill install | list | add-skill <name> | migrate`. See `README.md` for flags and
the provider matrix.

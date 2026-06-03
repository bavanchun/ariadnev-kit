---
title: "vcskill: multi-provider skill kit + installer CLI"
description: ""
status: completed
priority: P2
branch: ""
tags: []
blockedBy: []
blocks: []
created: "2026-06-03T03:59:45.267Z"
createdBy: "ck:plan"
source: skill
---

# vcskill: multi-provider skill kit + installer CLI

## Overview

Build `vcskill`: a Node/TypeScript monorepo that authors agent skills/subagents/commands/rules ONCE in canonical Claude format (`kit/`) — hooks deferred to post-v1, then installs them to a user-chosen AI provider (Claude Code, Codex, Antigravity, Cursor, OpenCode, +generic) via `npx vcskill install`. A data-driven adapt engine rewrites paths + tool-names + formats per provider; `portable-manifest.json` handles cross-version path migrations. Local-first; skillsmp.com publish deferred.

Source: [brainstorm-summary.md](./brainstorm-summary.md). Reference impl studied: `~/Documents/claudekit-engineer` (`scripts/codex_generator_common.py::adapt_content`, `scripts/generate-opencode.py`, `portable-manifest.json`).

**Stack:** TypeScript (ESM), pnpm workspaces, `commander` + `@clack/prompts` (CLI), `vitest` (TDD), `gray-matter` (frontmatter), `smol-toml` (Codex TOML — maintained, TOML 1.0), `zod` (manifest schema). Node ≥18. Cross-platform via `os.homedir()`/`path.join` — never hardcode `$HOME` or `/`.

**TDD mandate:** every phase writes failing tests first, then implements to green. Adapt engine = pure functions (unit-tested); installer = temp-dir integration tests; CLI = `--dry-run` e2e.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Scaffold monorepo and canonical kit](./phase-01-scaffold-monorepo-and-canonical-kit.md) | Completed |
| 2 | [Adapt engine (TDD core)](./phase-02-adapt-engine-tdd-core.md) | Completed |
| 3 | [Provider resolvers and installer](./phase-03-provider-resolvers-and-installer.md) | Completed |
| 4 | [CLI surface](./phase-04-cli-surface.md) | Completed |
| 5 | [Portable manifest and migrate](./phase-05-portable-manifest-and-migrate.md) | Completed |
| 6 | [Add-skill scaffolder and docs](./phase-06-add-skill-scaffolder-and-docs.md) | Completed |

**Build result (2026-06-03):** 82 vitest tests green; adapt/ coverage 99.27% (≥90 gate); `tsc --noEmit` clean; tsup build + npm-pack flat-layout smoke pass. Code-review fixes applied: cross-platform path-traversal guard (`path.relative`), crash-safe atomic write (no pre-delete on file overwrite), full claudekit Codex path-prefix parity.

## Dependencies

No cross-plan dependencies (greenfield, new repo). Internal phase chain: **0 → 1 → 2 → 3 → 4 → {5, 6}**. Phase 0 = provider-spec verification gate. Phase 2 (adapt engine) is the critical path; 3 depends on 2; 4 depends on 3; 5 and 6 depend on 4 and are parallelizable.

## Key Decisions (locked: brainstorm + red-team)

| Topic | Decision |
|---|---|
| Source of truth | Canonical Claude format in `kit/` (Agent Skills Spec `SKILL.md`) |
| Skill naming | **`vc:` prefix** — `name: vc:<slug>` in dir `<slug>`. Validator: `name === "vc:" + dirName`; colon allowed |
| Adapt model | Data-driven path-rewrite + tool-rewrite tables + per-provider resolver config. **Adapts BOTH body and frontmatter tool names** (`allowed-tools`) |
| Transform tiers | Native copy (Claude/Cursor/Antigravity/OpenCode skills) vs deep generators (Codex agent→TOML, command mapping) |
| Provider neutral dir | `.agents/skills/` (Codex/Cursor/Antigravity/OpenCode read natively); Claude locked to `.claude/skills/` |
| Hooks | **NOT shipped in v1.** Kit content = skills + agents + commands + rules + env only |
| Shared scripts | `kit/scripts/` installs to provider script tree; skills referencing `.claude/scripts/` get rewritten + tree populated |
| Idempotency | **Atomic** write (temp dir + `fs.rename`) + backup before overwrite + rotation (keep last 3) |
| Unverified policy | **tool-names**: identity-map + per-provider footer (ship). **paths**: `verified:false` → SKIP-with-log, NEVER guess |
| Platform | Cross-platform (Node path APIs) |
| Path constants | path-rewrite targets and resolver targets share ONE source of constants (no drift) |

## Phase 0 — Provider Spec Verification (pre-flight gate, do FIRST)

Blocks Phase 2/3 from shipping guesses. For each provider, mark each path+tool-name `verified:true|false` in a `src/providers/spec-verified.ts` table:
- Codex: `.codex/agents/*.toml` accepted keys; commands dir = `prompts/` vs `commands/`; tool-name table (VERIFIED from claudekit `adapt_content`).
- OpenCode: agent/command/skill dirs = **plural** (`.opencode/agents`, `.opencode/commands`, `.opencode/skills` — verified vs `generate-opencode.py`); tool-name table (UNVERIFIED → identity).
- Antigravity: skills `.agents/skills/` (safe); agents/commands paths UNVERIFIED → `verified:false` skip.
- Cursor: `.agents/skills/`, `.cursor/commands/`, `.cursor/rules/*.mdc`; `AskUserQuestion` no-equiv → keep + footer.
Verify via live CLIs where installed (`command -v codex/opencode/cursor`), else official docs, else mark unverified. Output: the `spec-verified` table consumed by resolvers. Anything `false` → installer skips + logs "SKIPPED (unverified <provider> <artifact>)".

## Open / UNVERIFIED (tracked in `spec-verified.ts`)

- Codex `.codex/agents/*.toml` exact schema — claudekit emits `name/description/sandbox_mode/developer_instructions`; confirm vs live Codex (Phase 0).
- Codex commands dir contradiction RESOLVED to a single constant in Phase 0; default `commands/` (matches claudekit `adapt_content`), flip if live Codex says `prompts/`.
- Antigravity agent/command paths → `verified:false` skip until confirmed.
- OpenCode/Antigravity/Cursor subagent tool-names → identity-map + footer until verified.

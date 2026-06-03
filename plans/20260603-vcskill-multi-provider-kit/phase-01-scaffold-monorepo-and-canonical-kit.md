---
phase: 1
title: "Scaffold monorepo and canonical kit"
status: completed
priority: P1
effort: "4h"
dependencies: []
---

# Phase 1: Scaffold monorepo and canonical kit

## Overview
Stand up the `vcskill` monorepo: pnpm workspace, TS+vitest tooling, the canonical `kit/` source tree (Claude format) seeded with real sample artifacts, and `kit.config.json`. This is the foundation every later phase consumes; no adapt logic yet.

## Requirements
- Functional: `pnpm install` + `pnpm test` run clean; `kit/` holds ≥2 sample skills (one with `allowed-tools` + `argument-hint` frontmatter naming Claude tools, for Phase 2 adapt tests), 1 subagent, 1 command, 1 rule, `kit/scripts/` (shared script), `.env.example`; a fixture-validator confirms every `kit/skills/*/SKILL.md` has valid `name`+`description` and **`name === "vc:" + dirName`** (colon-prefixed; dir is the bare slug).
- Non-functional: ESM, strict TS, Node ≥18; files <200 LOC; kebab-case filenames; cross-platform (no hardcoded `/` or `$HOME`).
- Also produce `src/providers/spec-verified.ts` (Phase 0 gate table — see plan.md "Phase 0"): per-provider `{path, toolNames}` verified flags consumed by Phase 3 resolvers.
- **Decide repo layout for runtime kit-resolution (M6):** published npm pkg is flat (`vcskill/dist`, `vcskill/kit`) while dev is nested (`packages/cli/`, `kit/`). `kitRoot` must resolve via `fileURLToPath(import.meta.url)` relative to package root in BOTH layouts — design the layout + a `resolveKitRoot()` helper here, smoke-tested in Phase 6 `npm pack`.

## Architecture
```
vcskill/
├── package.json                 # workspace root, scripts: build/test/lint
├── pnpm-workspace.yaml          # packages: ["packages/*"]
├── tsconfig.base.json
├── vitest.config.ts
├── kit.config.json              # { name, version, providers[], defaults }
├── kit/                         # CANONICAL SOURCE (Claude format)
│   ├── skills/
│   │   ├── hello-world/SKILL.md
│   │   └── echo-tool/SKILL.md + scripts/echo.ts
│   ├── agents/sample-reviewer.md
│   ├── commands/sample-cmd.md
│   ├── rules/sample-rule.md
│   └── .env.example
└── packages/cli/                # created here (empty src + package.json), filled Phase 4
    ├── package.json             # bin: { vcskill: dist/index.js }
    └── src/index.ts             # placeholder
```
`kit.config.json` shape: `{ "name": "vcskill", "version": "0.1.0", "providers": ["claude-code","codex","cursor","antigravity","opencode","generic"], "defaultProvider": "claude-code", "defaultScope": "project" }`.

## Related Code Files
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `vitest.config.ts`, `kit.config.json`, `.gitignore`
- Create: `kit/skills/hello-world/SKILL.md`, `kit/skills/echo-tool/SKILL.md`, `kit/skills/echo-tool/scripts/echo.ts`, `kit/agents/sample-reviewer.md`, `kit/commands/sample-cmd.md`, `kit/rules/sample-rule.md`, `kit/.env.example`
- Create: `packages/cli/package.json`, `packages/cli/src/index.ts`
- Create (TDD): `packages/cli/src/kit/kit-fixtures.test.ts`, `packages/cli/src/kit/load-kit.ts`

## Implementation Steps
1. `git init`; write root `package.json` (private, workspaces), `pnpm-workspace.yaml`, `tsconfig.base.json` (strict, ESM, `moduleResolution: bundler`), `vitest.config.ts`, `.gitignore` (node_modules, dist, *.tsbuildinfo).
2. Author `kit/` sample artifacts using exact Agent Skills Spec frontmatter (`name`, `description`; optional `metadata.author/version`). `sample-reviewer.md` agent must include Claude tool names (`AskUserQuestion`, `Task(...)`) in body so later tool-rewrite tests have real input.
3. Write `kit.config.json`.
4. **TDD:** write `kit-fixtures.test.ts` FIRST — asserts `loadKit()` discovers all skills/agents/commands, every SKILL.md frontmatter parses, **`name === "vc:" + dirName`** (negative: dir `foo` with `name: vc:bar` fails; `name: foo` without prefix fails), no duplicate names. Run → fails (no `load-kit.ts`).
5. Implement `load-kit.ts` (`loadKit(kitRoot)` → `{ skills, agents, commands, rules }` typed manifest) until tests green.
6. `packages/cli` placeholder `package.json` (bin `vcskill`) + `src/index.ts` stub (`console.log` version) — real CLI in Phase 4.

## Todo List
- [ ] Root workspace + tooling configs
- [ ] `kit/` sample skills/agent/command/rule/.env.example
- [ ] `kit.config.json`
- [ ] Failing `kit-fixtures.test.ts`
- [ ] `load-kit.ts` → tests green
- [ ] CLI package placeholder

## Success Criteria
- [ ] `pnpm install && pnpm test` exits 0 with fixture tests passing
- [ ] `loadKit()` returns ≥2 skills, 1 agent, 1 command, 1 rule, shared `scripts/`
- [ ] `name === "vc:" + dirName` enforced; missing-prefix and mismatched-name fixtures fail (negative cases proven)
- [ ] `resolveKitRoot()` returns correct `kit/` path in dev layout (published-layout proven in Phase 6)
- [ ] `spec-verified.ts` table exists with per-provider verified flags

## Risk Assessment
- pnpm vs npm workspaces: pick pnpm (claudekit-cli precedent); if user lacks pnpm, document `corepack enable`. Low risk.
- Over-scaffolding: keep CLI package a stub here — resist implementing install logic early (YAGNI).

## Next Steps
Phase 2 consumes `loadKit()` output and the `sample-reviewer.md` Claude-tool body as adapt-engine test input.

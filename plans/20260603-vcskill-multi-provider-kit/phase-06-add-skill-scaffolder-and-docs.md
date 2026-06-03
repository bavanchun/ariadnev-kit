---
phase: 6
title: "Add-skill scaffolder and docs"
status: completed
priority: P2
effort: "5h"
dependencies: [4]
---

# Phase 6: Add-skill scaffolder and docs

## Overview
Close the authoring loop: `vcskill add-skill <name>` scaffolds a valid canonical SKILL.md (so users add new skills without hand-writing frontmatter), plus project docs and npm publish config so the kit is installable via `npx vcskill`. skillsmp.com publishing remains deferred.

## Requirements
- Functional: `add-skill <name>` creates `kit/skills/<name>/SKILL.md` from a template with prompted/`--description` filled, validated against the same rules as Phase 1's fixture test; refuses duplicates/invalid names. Repo has README, AGENTS.md, CLAUDE.md; `packages/cli/package.json` publishable (`files`, `bin`, `version`, `prepublishOnly: build`).
- Non-functional: generated skill passes `loadKit()` validation immediately; docs ≤ concise.

## Architecture
- `src/cli/add-skill-command.ts` — validate slug (lowercase/hyphen, unique), prompt description if absent (`@clack`), render template via `src/kit/skill-template.ts` (emits `name: vc:<slug>`), write to `kit/skills/<slug>/SKILL.md`, then re-run `loadKit()` to confirm validity (incl. `name === "vc:" + dir`).
- `src/kit/skill-template.ts` — pure `renderSkillTemplate({slug, description})` → SKILL.md string with frontmatter `name: vc:<slug>` + stub body. Unit-tested.
- Docs:
  - `README.md` — what/why, install (`npx vcskill install`), provider matrix table, `add-skill`, `migrate`, contributing.
  - `AGENTS.md` — repo-level agent instructions (build/test/conventions) — also serves as the cross-tool standard file.
  - `CLAUDE.md` — Claude Code-specific guidance (mirrors AGENTS.md essentials).
- `packages/cli/package.json` — `name: vcskill`, `bin`, `files: ["dist"]`, `prepublishOnly`, `engines.node>=18`, `type: module`.

## Related Code Files
- Create: `src/cli/add-skill-command.ts`, `src/kit/skill-template.ts`, `README.md`, `AGENTS.md`, `CLAUDE.md`
- Create (TDD first): `src/kit/skill-template.test.ts`, `src/cli/add-skill-command.test.ts`
- Modify: `src/index.ts` (register add-skill), `packages/cli/package.json` (publish config)

## Implementation Steps
1. **TDD skill-template:** assert rendered output parses via `parseFrontmatter`, `name` matches input, required sections present. Implement → green.
2. **TDD add-skill (non-interactive):** call handler with `{name:'foo', description:'…', kitRoot:<tmp>}`; assert file created, `loadKit(<tmp>)` now includes `foo`; duplicate name → error; invalid name → error. Implement → green.
3. Register `add-skill` subcommand (interactive description prompt when omitted; logic stays in tested handler).
4. Write README (provider matrix + commands), AGENTS.md, CLAUDE.md.
5. Finalize `packages/cli/package.json` publish config (`files: ["dist","kit"]`); `npm pack` → install tarball into tmp → run `vcskill list` there → assert `resolveKitRoot()` locates bundled `kit/` in flat layout (M6 smoke).
6. Full regression: `pnpm test` all phases green; manual `vcskill add-skill demo` (→ `name: vc:demo`) then `vcskill install --provider cursor --cwd <tmp> --dry-run` shows `demo`.

## Todo List
- [ ] skill-template (test→impl)
- [ ] add-skill command (test→impl)
- [ ] README + AGENTS.md + CLAUDE.md
- [ ] publish config + `npm pack --dry-run`
- [ ] full regression + manual add→install smoke

## Success Criteria
- [ ] `vcskill add-skill foo --description "…"` creates `kit/skills/foo/SKILL.md` with `name: vc:foo`, accepted by `loadKit()`
- [ ] New skill installs to a provider in the same flow
- [ ] `npm pack --dry-run` includes BOTH `dist` AND `kit/` (installer needs kit content)
- [ ] **Pack-install smoke (M6):** `npm pack` → install tarball into a tmp dir → run `vcskill list` from there → `resolveKitRoot()` finds bundled `kit/` in the FLAT published layout (not just dev-nested). This is the runtime gotcha — must pass.
- [ ] `pnpm test` fully green across all phases
- [ ] README documents install + provider matrix + add-skill + migrate

## Risk Assessment
- **Packaging (M6):** published layout is flat (`vcskill/dist`, `vcskill/kit`) vs dev nested (`packages/cli/`, `kit/`). `resolveKitRoot()` (Phase 1) MUST work in both; a dev-passing test can fail when installed → the pack-install smoke is mandatory, not optional. `files` must list `dist` + `kit`.
- ESM bin: verify shebang preserved by `tsup` and `node_modules/.bin/vcskill` executes.
- Template drift vs spec → template test asserts parse validity + `vc:` prefix.

## Next Steps
Kit shippable locally. Deferred: skillsmp.com submission format (separate brainstorm/plan when prioritized).

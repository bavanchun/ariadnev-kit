---
phase: 2
title: "Adapt engine (TDD core)"
status: completed
priority: P1
effort: "1d"
dependencies: [1]
---

# Phase 2: Adapt engine (TDD core)

## Overview
The heart of vcskill: pure, side-effect-free functions that transform a canonical artifact body/frontmatter into provider-specific output. Ported from claudekit's `adapt_content()`. All TDD — these functions decide correctness of every install, so coverage must be high and exhaustive.

## Requirements
- Functional: given (canonical content, target provider), produce adapted content with correct path rewrites, tool-name rewrites (non-Claude only), frontmatter round-trip, agent→TOML, command frontmatter mapping.
- Non-functional: pure functions (no fs/network), 100% deterministic, each module <200 LOC, ≥90% line coverage on adapt modules.

## Architecture
`packages/cli/src/adapt/`:
- `path-rewrites.ts` — `rewritePaths(content, provider)`. Ordered replacement table per provider (longest-prefix first to avoid partial clobber, mirroring claudekit's dict order):
  - Codex: `.claude/skills/`→`$HOME/.agents/skills/`, `.claude/scripts/`→`$HOME/.agents/vcskill/scripts/`, `.claude/agents/`→`$HOME/.codex/agents/`, `.claude/commands/`→`$HOME/.codex/<CODEX_COMMANDS_DIR>/` (constant from `paths.ts`, default `commands` — H3, NOT a literal), `.claude/`→`$HOME/.agents/vcskill/`, `~/.claude/skills/`→`$HOME/.agents/skills/`, `~/.claude/`→`$HOME/.agents/vcskill/`
  - OpenCode: `.claude/`→`.opencode/`, `~/.claude/`→`~/.config/opencode/`
  - Cursor/Antigravity: `.claude/skills/`→`.agents/skills/`, `.claude/`→`.agents/`
  - Claude Code: identity
  - Generic: `.claude/skills/`→`.agents/skills/`, `.claude/`→`.agents/`
- `tool-rewrites.ts` — `rewriteTools(content, provider)`. Non-Claude only. Codex table (VERIFIED from claudekit): `AskUserQuestion`→`request_user_input`, `TodoWrite`→`update_plan`, `TaskCreate/TaskUpdate/TaskGet/TaskList`→plan-tracking phrases, `Task tool`→`spawn_agent tool`, `Task(Explore)`→`spawn_agent(explorer)`, `Task(researcher)`→`spawn_agent(researcher)`, `SendMessage`→`send_input or final report`. OpenCode/Antigravity: identity-map placeholder (UNVERIFIED — table empty, gated by Phase 0 `spec-verified`). Cursor: `Task`→`spawn_agent`, `SendMessage`→`send_message`, `AskUserQuestion`→identity (no equiv → keep + footer). Append **per-provider** compatibility footer when source contains skill markers and footer absent.
- **`frontmatter.ts`** — `parseFrontmatter(raw)` → `{ data, body }`, `serializeFrontmatter(data, body)` (wrap `gray-matter`; round-trip block scalars + quotes, claudekit parity). **PLUS `adaptFrontmatterTools(data, provider)`** — rewrites tool names inside `allowed-tools`/`disallowed-tools`/`argument-hint` frontmatter values (body rewrite alone is insufficient — providers parse frontmatter). For providers lacking a tool, strip it from `allowed-tools` and note in footer.
- `agent-to-toml.ts` — `agentToToml(name, frontmatter, body, opts)` → TOML via **`smol-toml`** (maintained). Fields: `name`, `description` (inline-adapted, footer-stripped), `sandbox_mode` (**frontmatter-driven**: `frontmatter.metadata?.sandbox` else infer from `tools` — read-only if no write tools — else default `workspace-write`; do NOT copy claudekit's hardcoded agent-name set), `developer_instructions` (Codex preamble + adapted body). Parse-back assertion proves valid TOML.
- `command-map.ts` — `mapCommand(name, frontmatter, body, provider)` → `{ relPath, content }`, **relPath from shared path-constants (`paths.ts`), not literals**. OpenCode→`commands/<name>.md` (**plural**, strip Claude frontmatter), Codex→`<CODEX_COMMANDS_DIR>/<name>.md` (single constant — see H3), Cursor→`commands/<name>.md`, Claude→`commands/<name>.md` unchanged.
- `paths.ts` — **single source of path constants** (`CODEX_SKILLS_DIR`, `CODEX_AGENTS_DIR`, `CODEX_COMMANDS_DIR`, `OPENCODE_*`, …) imported by BOTH `path-rewrites.ts` and Phase 3 resolvers → eliminates the prompts/commands drift (H3). Default `CODEX_COMMANDS_DIR='commands'` (claudekit parity); flip in one place if Phase 0 says `prompts`.
- `compatibility-footer.ts` — `appendFooter(content, provider)` — **per-provider text** (Codex footer ≠ Cursor footer; never put "Codex Compatibility" on a Cursor skill).
- `adapt.ts` — `adaptArtifact(artifact, provider)` orchestrator: parse → adaptFrontmatterTools → rewritePaths(body) → rewriteTools(body) → footer → serialize. Single entry consumed by Phase 3 installer.

Marker constants (`AskUserQuestion`,`TodoWrite`,`TaskCreate`,`TaskUpdate`,`TaskList`) gate footer injection, per claudekit.

## Related Code Files
- Create: `src/adapt/{paths,path-rewrites,tool-rewrites,frontmatter,agent-to-toml,command-map,compatibility-footer,adapt}.ts`
- Create (TDD, write first): matching `*.test.ts` for each + `src/adapt/__fixtures__/` (canonical inputs + golden per-provider outputs)
- Read for parity: `~/Documents/claudekit-engineer/scripts/codex_generator_common.py`, `scripts/generate-opencode.py:142-198` (agent/command convert)

## Implementation Steps
1. **TDD path-rewrites:** write `path-rewrites.test.ts` with a fixture body containing every `.claude/...` variant; assert exact output per provider (golden strings). Implement `rewritePaths` (ordered Map, longest-first) → green.
2. **TDD tool-rewrites:** test Codex full table + Claude identity + Cursor partial + OpenCode/Antigravity identity. Assert footer appended iff markers present and absent. Implement → green.
3. **TDD frontmatter:** round-trip tests incl. block scalar `description: >-` and quotes; assert no data loss. **PLUS `adaptFrontmatterTools`**: fixture skill with `allowed-tools: [Task, AskUserQuestion]` → assert Codex output rewrites/strips them, Cursor strips `AskUserQuestion`, Claude identity. Implement → green.
4. **TDD agent-to-toml:** golden TOML for `sample-reviewer`; assert read-only vs workspace-write selection, footer stripped from `description`, body adapted. Implement → green.
5. **TDD command-map:** per-provider relPath + content assertions. Implement → green.
6. **TDD adapt orchestrator:** end-to-end on `sample-reviewer` and `hello-world` → assert full pipeline composition order. Implement → green.
7. Run coverage; fill gaps to ≥90% on `adapt/`.

## Todo List
- [ ] Golden fixtures (canonical + per-provider expected)
- [ ] path-rewrites (test→impl)
- [ ] tool-rewrites + footer (test→impl)
- [ ] frontmatter round-trip (test→impl)
- [ ] agent-to-toml (test→impl)
- [ ] command-map (test→impl)
- [ ] adapt orchestrator (test→impl)
- [ ] coverage ≥90% on adapt/

## Success Criteria
- [ ] All adapt unit tests green; coverage ≥90% on `src/adapt/`
- [ ] Codex tool-rewrite output byte-matches claudekit's `adapt_content` for the same input (parity test)
- [ ] Frontmatter round-trips block scalars without loss; `allowed-tools` adapted/stripped per provider
- [ ] `agentToToml` emits valid TOML (parse-back via smol-toml); `sandbox_mode` frontmatter/tools-driven
- [ ] `paths.ts` constant shared: path-rewrite Codex-command target === resolver target (no drift)
- [ ] Per-provider footer: Cursor skill gets no Codex footer (asserted)

## Risk Assessment
- **UNVERIFIED OpenCode/Antigravity tool-names** → identity-map + per-provider footer (safe for tool-names; tests marked "unverified-shape" so green ≠ confirmed). Gated by Phase 0 `spec-verified`.
- Path-rewrite ordering bug (short prefix clobbers long) → enforced longest-prefix-first + explicit test for `.claude/skills/` vs `.claude/`.
- gray-matter block-scalar fidelity → parity test vs claudekit's hand parser; if mismatch, add custom serializer.
- **H3 drift** → `paths.ts` single-constant shared with Phase 3; test asserts path-rewrite Codex-command target === resolver Codex-command target.
- **L2 footer mis-attribution** → per-provider footer text; test asserts Cursor skill never gets Codex footer.

## Next Steps
Phase 3 wraps `adaptArtifact` with fs I/O, provider target paths, backup, and idempotent copy.

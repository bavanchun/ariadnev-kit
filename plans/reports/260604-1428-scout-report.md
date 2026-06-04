---
title: Scout Report - vcskill Codebase
date: 2026-06-04
type: scout-report
---

# Scout Report

## Summary
The `vcskill` project is a CLI utility written in TypeScript (using ESM, pnpm workspaces, and Node >= 18) designed to compile, adapt, and deploy canonical AI agent skills, rules, agents, and commands across different agent coding providers (e.g., `claude-code`, `cursor`, `codex`, `opencode`, `antigravity`, etc.).
The codebase uses a pure-impure functional architecture where core logical units (adaptation engine, installation planners, and migration planners) are written as pure functions to facilitate unit testing, while CLI commands and execute-layer adapters perform the impure file-system and terminal boundary integrations. All modules adhere strictly to the rule of keeping files small (<200 LOC per file).

---

## Findings

### 1. Adapt Engine (`packages/cli/src/adapt/`)
The adapt engine acts as a pure translation pipeline. It has zero filesystem or network dependencies.
* **`adapt.ts`**: Coordinates the adaptation pipeline, ordering operations as follows: Frontmatter Tool Mapping $\to$ Path Translation $\to$ Body Tool Translation $\to$ Footer Insertion $\to$ Re-serialization.
* **`paths.ts`**: Single source of truth defining directory structures and folder names (e.g. `.claude`, `.opencode`, etc.).
* **`frontmatter.ts`**: Parses/serializes frontmatter via `gray-matter`. Rewrites dynamic attributes like `allowed-tools`/`disallowed-tools` or `argument-hint` values to suit provider limitations.
* **`tool-rewrites.ts`**: Substitutes Claude-specific tool calls in markdown bodies (e.g. `TaskCreate`, `AskUserQuestion`, `SendMessage`) with equivalents matching target environments, or injects warning placeholders.
* **`path-rewrites.ts`**: Maps `.claude/` paths to target structures, processing longest paths first to avoid clobbering sub-directories.
* **`agent-to-toml.ts`**: Uses `smol-toml` to transform Markdown agent files into Codex `.toml` specs, automatically determining sandbox configurations based on the agent's tool access.
* **`command-map.ts`**: Resolves command destination configurations and serializes custom frontmatter formats for targets like OpenCode.
* **`compatibility-footer.ts`**: Appends target-specific instructions to helper prompts when targeting platforms that don't natively understand Claude-specific tools.

### 2. Install Engine (`packages/cli/src/install/`)
Manages filesystem transactions using a declarative, plan-then-execute model.
* **`install-plan.ts`**: Evaluates source files and existing state to build an array of installation operations (`WriteOp`, `AgentsMdOp`, `SkipOp`) without touching the filesystem.
* **`install-execute.ts`**: Processes planned operations sequentially. Uses strict path verification to ensure destinations fall within project roots or home directories (`assertWithinRoots`). Performs writes atomically using temporary files (`.vcskill-tmp` renamed via `renameSync()`).
* **`artifact-content.ts`**: Bridges the adapt engine with filesystem plans, mapping source agents and rules into files formatted for target providers.
* **`agents-md.ts`**: Safe merger that updates project `AGENTS.md` files purely within the `<!-- vcskill:start -->` and `<!-- vcskill:end -->` blocks, leaving other user text intact.
* **`backup.ts`**: Backs up target directories and files inside `.vcskill/backups/<timestamp>` prior to modification. Standardizes directory lists lexicographically to retain only the 3 most recent backups.

### 3. Providers & Kit Module (`packages/cli/src/providers/` and `packages/cli/src/kit/`)
Resolves location rules, verifies capability gates, and manages source template files.
* **`resolver.ts`**: Maps provider scope contexts (global vs project-local) to absolute targets, determining if rules should be placed in folders like `.claude/rules`, `.cursor/rules/*.mdc`, or merged into `AGENTS.md`.
* **`spec-verified.ts`**: Gatekeeping matrix defining verified `(provider, artifact)` combinations. If a provider's path or tool behavior is unverified, it is safely skipped with a log entry rather than guessed.
* **`load-kit.ts`**: Searches folder ancestors for the canonical `skills/` directory, extracts frontmatter, and validates that skill names start with the required `vc:` prefix.
* **`skill-template.ts`**: Handles validation and structure code for scaffolding new skills.

### 4. Migrate & CLI Surface (`packages/cli/src/migrate/`, `packages/cli/src/cli/`, and `packages/cli/src/index.ts`)
Orchestrates migrations and manages commander configurations.
* **`manifest.ts` & `applied-state.ts`**: Validates the migration ledger (`.vcskill/applied-migrations.json`) and portable manifest schema using Zod.
* **`plan-migrations.ts` & `execute-migrations.ts`**: Computes pending relocations when provider specifications shift, migrating files safely and idempotently.
* **`index.ts`**: Entry point registering Commander CLI actions.
* **`prompt-providers.ts`**: Dynamically loads interactive `@clack/prompts` when flags are omitted and terminal is a TTY.
* **`render-summary.ts`**: Renders alignment-formatted tables showing action metrics (installed, skipped, backed up files).

---

## Recommendations
1. **Maintain Pure/Impure Boundaries**: When introducing new providers or command capabilities, keep side-effects separate (under `install/` or `cli/`) and keep core adapter routines under `adapt/` as pure synchronous functions. This ensures Vitest TDD remains fully testable.
2. **Follow Spec Verification Gates**: Always declare new target paths in `packages/cli/src/providers/spec-verified.ts` rather than hardcoding paths. Unverified combinations should fail-safe.
3. **File Length Management**: Continue adhering strictly to the <200 LOC per file pattern. If any module grows, extract core helpers into modular sub-modules immediately.

---

## Unresolved Questions
* **Are there any other custom providers planned?** The current matrix verifies `claude-code`, `codex`, `cursor`, `antigravity`, and `opencode`. If others are needed, they will require new definitions in `spec-verified.ts` and `resolver.ts`.

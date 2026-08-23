---
name: av:bootstrap
description: "Bootstrap a new project from requirements through research, tech stack, design, planning, and implementation. Use to start a project from scratch; modes --full, --auto, --fast, --parallel."
user-invocable: true
when_to_use: "Invoke to start a new project or full-stack setup from scratch."
category: utilities
keywords: [scaffold, project, setup, boilerplate]
license: MIT
argument-hint: "[requirements] [--full|--auto|--fast|--parallel] [--yagni] [--skip-journal]"
metadata:
  origin: ported
  author: upstream
  version: "1.0.0"
---

# Bootstrap - New Project Scaffolding

End-to-end project bootstrapping from idea to running code.

**Principles:** KISS, DRY | Full requested scope, nothing extra (`--yagni` to opt into scope-cutting) | Token efficiency | Concise reports

## Usage

```
/av:bootstrap <user-requirements>
```

**Flags** (optional, default `--full`):

| Flag | Mode | Thinking | User Gates | Planning Skill | Cook Skill |
|------|------|----------|------------|----------------|------------|
| `--full` | Full interactive | Ultrathink | Every phase | `--hard` | (interactive) |
| `--auto` | Automatic explicit opt-in | Ultrathink | Design only | `--auto` | `--auto` |
| `--fast` | Quick | Think hard | Cook review gates | `--fast` | (interactive) |
| `--parallel` | Multi-agent | Ultrathink | Design only | `--parallel` | `--parallel` |

**Composable flags** (combine with any mode):

| Flag | Effect |
|------|--------|
| `--yagni` | Opt into YAGNI: challenge and cut scope not needed for the stated outcome (default: scaffold the full requested scope). Passed through to `av:plan` and `av:cook` |

**Example:**
```
/av:bootstrap "Build a SaaS dashboard with auth" --fast
/av:bootstrap "E-commerce platform with Stripe" --parallel
```

## Opening brainstorm gate (all modes)

Before Git initialization, research, design, planning, or scaffolding, capture:

- the intended product outcome;
- technology, safety, compatibility, and delivery constraints;
- explicit non-goals for this bootstrap;
- observable acceptance criteria for the running project.

Reuse an accepted brief or plan when it already contains these fields. Ask only
about a missing decision that would materially change the product or safety.
`--fast`, `--parallel`, and explicit `--auto` do not skip this gate; they only
change execution and approval behavior after the contract is concrete.

## Workflow Overview

```
[Brainstorm Contract] → [Git Init] → [Research?] → [Tech Stack?] → [Design?] → [Planning] → [Implementation] → [Test] → [Review] → [Docs] → [Onboard] → [Final]
```

Each mode loads a specific workflow reference + shared phases.

## Mode Detection

If no flag provided, default to `--full`.

Load the appropriate workflow reference:
- `--full`: Load `references/workflow-full.md`
- `--auto`: Load `references/workflow-auto.md` only when explicitly requested
- `--fast`: Load `references/workflow-fast.md`
- `--parallel`: Load `references/workflow-parallel.md`

All mode references inherit the opening brainstorm contract. Load
`references/shared-phases.md` for implementation through final report.

## Step 0: Git Init (ALL modes)

Check if Git initialized. If not:
- `--full`: Ask user if they want to init → `git-manager` subagent (`main` branch)
- Others: Auto-init via `git-manager` subagent (`main` branch)

## Skill Triggers (MANDATORY)

After early phases (research, tech stack, design), trigger downstream skills:

### Planning Phase
Activate **av:plan** skill with mode-appropriate flag:
- `--full` → `/av:plan --hard <requirements>` (thorough research + validation)
- `--auto` → `/av:plan --auto <requirements>` (auto-detect complexity)
- `--fast` → `/av:plan --fast <requirements>` (skip research)
- `--parallel` → `/av:plan --parallel <requirements>` (file ownership + dependency graph)

Pass the brainstorm contract with the requirements so planning preserves the
accepted outcome, constraints, non-goals, and acceptance criteria.

Planning skill outputs a plan path. Pass this to cook.

### Implementation Phase
Activate **av:cook** skill with the plan path and mode-appropriate flag:
- `--full` → `/av:cook <plan-path>` (interactive review gates)
- `--auto` → `/av:cook --auto <plan-path>` (explicit autonomous implementation)
- `--fast` → `/av:cook <plan-path>` (skip extra research, keep cook review gates)
- `--parallel` → `/av:cook --parallel <plan-path>` (multi-agent execution)

## Role

Elite software engineering expert specializing in system architecture and technical decisions. Brutally honest about feasibility and trade-offs.

## Critical Rules

- Activate relevant skills from catalog during the process
- Keep all research reports ≤150 lines
- All docs written to `./docs` directory
- Plans written to `./plans` directory using naming from `## Naming` section
- DO NOT implement code directly — delegate through planning + cook skills
- Sacrifice grammar for concision in reports
- List unresolved questions at end of reports
- Run `/av:journal` to write a concise technical journal entry upon completion — unless the shared "Journal step — opt-out" below applies.

### Journal step — opt-out

Skip the automatic `/av:journal` step when either applies:
- The invocation includes the `--skip-journal` flag, OR
- `av config prefs resolve --json | jq -r 'if .prefs.journal.auto == false then "false" else "true" end'` returns `false`. If the command errors or prints anything other than the exact string `false`, treat as `true` (default) — corrupt or missing config never suppresses the automatic journal. Today the envelope's top-level key is `config` and `journal.auto` is not a config-schema field, so this branch always resolves `true`; only the flag skips.

Precedence: flag > project config > user config > default (`true`).
When skipped, print one line:
- `journal skipped by --skip-journal` (flag), or
- `journal skipped by preference` (config).

Explicit `/av:journal` and `av journal create` are unaffected.

## References

- `references/workflow-full.md` - Full interactive workflow
- `references/workflow-auto.md` - Explicit auto workflow
- `references/workflow-fast.md` - Fast workflow
- `references/workflow-parallel.md` - Parallel workflow
- `references/shared-phases.md` - Common phases (implementation → final report)

## Output format

The final report from `references/shared-phases.md` takes this shape:

```markdown
## Bootstrap: <project name> (--full | --auto | --fast | --parallel)

### Contract
Outcome / Constraints / Non-goals / Acceptance criteria — as accepted at the opening gate

### Phases
| Phase | Result | Artifact |
|-------|--------|----------|
| Git init | initialized on `main` / already present | — |
| Research | <n> reports, ≤150 lines each / skipped (--fast) | ./docs/... |
| Tech stack | <stack> (approved) | ./docs/<tech-stack doc> |
| Design | wireframes + guidelines / skipped | ./docs/wireframe/ (HTML), ./docs/wireframes/ (screenshots) |
| Plan | `/av:plan <flag>` | <plan dir>/plan.md |
| Implement | `/av:cook <flag> <plan-path>` → phases done | <plan dir>/phase-XX-*.md |
| Test / Review | tester + code-reviewer results | — |

### Get started
<install, run, first command>

### Next steps
1. ...

### Commit?
Offered: yes/no — `git-manager` subagent used / declined
journal: written | skipped by --skip-journal | skipped by preference

### Unresolved questions
- ... or "none"
```

## Quality gates

- [ ] The four contract fields were captured before `git init`, research, or
      any scaffold — `--fast`, `--parallel`, and `--auto` change approvals, not
      this gate.
- [ ] The flags match the Skill Triggers table: plan gets `--hard` (for
      `--full`), `--auto`, `--fast`, or `--parallel`; cook gets `--auto` or
      `--parallel` only — `--full` and `--fast` run cook interactive. `--yagni`
      was forwarded only if the user passed it.
- [ ] No code was written by this skill directly: every implementation step
      went through the plan path `/av:plan` returned and `/av:cook`.
- [ ] Every research report is ≤150 lines and lives under `./docs`; plan files
      use the `## Naming` pattern from the hook context.
- [ ] The commit/push offer was a question, not an action — in every mode
      including `--fast` and `--auto`.
- [ ] The journal line matches what happened: written, or one of the two exact
      skip messages.

Proof/risk: set by `av:cook` per phase; this skill only verifies that the
cook/test/review results it reports actually ran.

## Workflow position

**Typically follows:** `av:brainstorm` when the product outcome is not yet an
accepted contract, or a user brief that already carries the four fields.
**Typically precedes:** `av:plan` (mode-matched flag, receives the contract),
then `av:cook` (receives the plan path), then `av:journal` unless skipped.
**Related:** `av:cook` alone implements an already accepted plan inside an
existing repository; `av:xia` ports a feature in from another repo rather than
starting one.

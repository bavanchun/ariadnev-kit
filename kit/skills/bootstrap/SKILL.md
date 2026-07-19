---
name: vc:bootstrap
description: Bootstrap a new project end to end — stack choice, planning, and implementation. Use when starting a project from scratch or a full-stack feature with no existing scaffold.
user-invocable: true
argument-hint: "<requirements> [--fast|--parallel]"
metadata:
  author: vchun
  version: "1.0.0"
---

# Bootstrap

Idea to running code: git init → stack decision → plan → implement → test →
review → docs. Delegates the heavy lifting to `vc:plan` and `vc:cook`; this
skill owns only the setup steps those two don't cover.

Handles: brand-new projects, full-stack features with no existing scaffold.
Does not handle: adding a feature to an established codebase — use
`vc:cook` directly, this skill's git-init and stack-lock steps don't apply.

## Modes

| Flag | Use when |
|---|---|
| (default, interactive) | Normal case — user reviews stack and plan before code |
| `--fast` | Requirements are already clear, skip research |
| `--parallel` | Multiple independent modules can scaffold concurrently |

## Workflow

1. **Git init** — if no `.git`, ask before initializing (default branch `main`)
   via `vc-git-manager`; non-interactive modes init automatically.
2. **Stack decision (hard gate)** — never scaffold on an assumed stack.
   Use `AskUserQuestion` to lock language/framework/DB/deploy target
   explicitly, grounded in the user's stated requirements — a silently
   guessed stack is the most expensive mistake to unwind later.
3. **Plan** — hand the locked stack + requirements to `vc:plan`
   (`--fast` mode skips extra research there too).
4. **Implement** — hand the plan path to `vc:cook`.
5. **Wrap up** — `vc:docs` init mode for the new `docs/` structure,
   `vc:journal` for a short session note.

## Output

```
Stack: <locked choices>
Plan: <path>
Implementation: <cook summary>
Docs initialized: <yes/no>
```

## Quality gates

- [ ] Stack confirmed via `AskUserQuestion` before any scaffold file exists
- [ ] Plan exists before implementation starts (same hard gate as `vc:cook`)
- [ ] `docs/` initialized only with files the project actually needs

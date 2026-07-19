---
name: vc:docs
description: Initialize and maintain project documentation in the docs/ folder. Use for doc setup, updating docs after behavior changes, or auditing docs against the code.
user-invocable: true
argument-hint: "init | update | audit [scope]"
metadata:
  author: vchun
  version: "1.0.0"
---

# Docs

Keep `./docs` accurate and small. Documentation is a liability that must earn
its maintenance cost — this skill updates docs when reality changed, and
refuses churn when it didn't.

## The update rule

Update docs only when the change affects: user-visible behavior, setup or
commands, architecture, public contracts, security posture, or a decision a
future maintainer needs. Internal refactors with stable behavior get no doc
edits — say so instead of inventing changelog noise.

## Standard structure

```
docs/
├── project-overview-pdr.md    # what + why + requirements
├── codebase-summary.md        # map of the code, for onboarding
├── code-standards.md          # conventions actually enforced here
├── system-architecture.md     # components, data flow, decisions
├── deployment-guide.md        # how it ships
└── project-roadmap.md         # where it's going
```

Create only the files the project actually needs; an empty template is worse
than an absent file.

## Modes

**init** — scout the codebase (structure, stack, entry points, commands),
then write the needed subset of the structure above. Every claim must be
derived from the repo, not from what projects "usually" do.

**update** — given a change (diff, feature, session): identify which docs
the update rule actually triggers; edit those sections in place; leave the
rest untouched. Verify commands and paths you touch by running/checking
them.

**audit** — walk each doc claim against the code: commands still run, paths
still exist, architecture still true, versions current. Output a findings
list (doc, claim, reality) and fix the confirmed drift.

## Rules

- Read the existing doc fully before editing; match its structure and tone.
- Never document aspirations as facts — roadmap items go in the roadmap.
- Examples must be real: taken from the repo or executed once.
- Each doc stays under ~800 lines; split by concern when it grows past that.
- After editing, verify links and file references resolve.

## Output

Report which docs changed and why, which were deliberately left alone
(update rule not triggered), and any drift found but not fixed (with a
reason).

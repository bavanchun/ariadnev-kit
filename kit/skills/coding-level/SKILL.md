---
name: av:coding-level
description: "Set coding experience level for tailored output. Use for adjusting explanation depth, code complexity, and response format to user expertise."
user-invocable: true
disable-model-invocation: true
when_to_use: "Invoke when response depth should match user expertise."
category: utilities
keywords: [experience, level, explanation, format]
argument-hint: "[0-5]"
metadata:
  origin: ported
  author: upstream
  version: "1.1.0"
---

# Coding Level

Set the user's coding experience level so every later response in this
session matches it in explanation depth, code complexity, and format.

## Usage

`/av:coding-level [0-5]`

With no argument, print the current level (or "unset — default 5") and the
table below, and ask which level to set.

## Levels

| Level | Name | Behavior from this point in the session |
|-------|------|------------------------------------------|
| 0 | ELI5 | Zero coding experience — analogies, no jargon, one step at a time, confirm before moving on |
| 1 | Junior | 0-2 years — explain the concept and the WHY before the HOW, point out the common mistake, end implementations with "Key takeaways" |
| 2 | Mid-Level | 3-5 years — name the design pattern in play, show how the change fits the system |
| 3 | Senior | 5-8 years — lead with trade-offs, business context, and architectural consequences |
| 4 | Tech Lead | 8-10 years — risk assessment, blast radius, strategy; skip basics entirely |
| 5 | God Mode | Expert — default behavior, maximum density, no teaching scaffolding (default) |

## How It Works

1. Parse the argument; reject anything outside `0`–`5`.
2. State the level and its one-line behavior back to the user.
3. Apply that row to every subsequent response in the session: depth of
   explanation, amount of inline commentary in code, and whether a
   "Key takeaways" block closes an implementation.

The level lives in the conversation. `codingLevel` is not a field in
`.ariadnev/config.json` (the hook config reader drops unknown keys), and this
kit ships no `output-styles/`, so nothing persists across sessions and nothing
is injected at session start. To keep a level across sessions, record it in
the project's `CLAUDE.md`/`AGENTS.md` as an instruction — `av:docs` owns the
root file, `av:folder-context` a subfolder one.

## Output format

One confirmation line, then the behavior change shows in later responses:

```text
Coding level set to <n> (<name>): <behavior cell> — for the rest of this session.
Persist across sessions: add it to CLAUDE.md/AGENTS.md (not stored by this skill).
```

With no argument:

```text
Coding level: <n> (<name>) | unset (default 5, God Mode)
<levels table>
Which level?
```

## Quality gates

- [ ] The argument was an integer 0–5; anything else (including `junior`)
      was mapped to its row or refused, never silently defaulted to 5.
- [ ] The confirmation names the level, its name, and the concrete behavior
      change — not just the number.
- [ ] The response does not claim the level was saved to a config file,
      injected by a hook, or wired to an output style.
- [ ] The next implementation response in the session actually follows the
      row: a level-0/1 answer carries the WHY and the "Key takeaways" block; a
      level-4/5 answer carries neither.
- [ ] A one-off "explain this simply" request did not change the level —
      that is an `av:ask` answer, not a preference.

Proof/risk: N/A — changes response style only.

## Workflow position

**Typically follows:** the start of a session or a user comment that answers
were too shallow or too dense.
**Typically precedes:** any delivery skill — `av:cook`, `av:fix`, `av:debug` —
whose explanations then follow the set level.
**Related:** `av:ask` answers a single question at a chosen depth without
changing the level; `av:docs` (root) and `av:folder-context` (subfolder) own
the CLAUDE.md edit that makes a level durable.

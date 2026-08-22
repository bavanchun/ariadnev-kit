# 0008 — Ported content is marked, and judged by different rules

- Status: accepted; the severity split is **superseded by
  [0013](./0013-lint-exemption-is-a-shrinking-list.md)** (2026-08-22)
- Date: 2026-08-15

> The marking decision stands: `metadata.origin: ported` is still how provenance
> is recorded. What changed is that the flag no longer decides lint severity — a
> property that exempts a class it cannot count was measured at 101 of 105 skills
> and 246 warnings nobody read. Exemption is now a named, shrinking list.

## Context

Most of this kit is a copy: 101 skills, 16 agents, 8 rules, 14 hooks and a
statusline, taken from the kit this project was built from, rebranded, and
otherwise left as they were. Only a handful of artifacts are this project's own
writing.

The repository already had authoring rules, written for a corpus of 26
hand-written skills, and every one of them met the bar. The ported corpus does
not, and not marginally. Measured across all 103 upstream skills before porting
any:

| Rule | Skills violating it |
|---|---|
| `## Output format` required | 103 / 103 |
| `## Quality gates` required | 103 / 103 |
| `## Workflow position` required | 101 / 103 |
| description ≤ 200 chars | 44 / 103 (longest 604) |
| SKILL.md ≤ 300 lines | 17 / 103 (longest 902) |
| reference file ≤ 300 lines | 136 / 740 files (longest 2249) |
| unknown frontmatter field | 0 / 103 |

Agents were the same shape: 7 of 16 have no `<example>` pair, 8 no
`Behavioral Checklist`, 9 exceed the line budget.

## Decision

**Mark ported content, and scope the authoring rules to what this project
writes.**

A ported skill carries `metadata.origin: ported`. A ported agent is identified by
the absence of the `av-` prefix — that prefix already meant "ours", so it needed
no new field.

House rules — the three required sections, the description length, the trigger
verb, the line budgets, the example pair, the checklist heading — apply to
authored artifacts only.

Validity rules apply to everything: frontmatter shape, unknown fields, a name
matching the file, a description that exists and is long enough to route on. A
ported artifact that fails one of those is broken, not merely unfashionable.

Size is reported as a **warning** rather than dropped. The context cost of a
902-line skill is real whether or not it is ours to fix, and a number in view is
worth more than a rule nobody can satisfy.

The two alternatives were both worse. Rewriting the content to fit the rules is
not a port — the whole value of copying is that the content is what it was.
Exempting everything retires the bar for the whole repository while pretending it
still stands.

## Consequences

`ariadnev validate` reports zero errors and about ninety warnings, nearly all of
them "this ported file is longer than our budget" or "this ported skill ships a
reference nothing links to". That ratio is the intended state: errors mean
something is broken, warnings mean something costs more than we would choose.

The upstream kit's own `author` value becomes `upstream`, not this project's
name. Putting our name on someone else's writing would be a small, unnecessary
falsehood.

Three things in the source tree were **not** ported, each identified by upstream's
own hash manifest plus file mtimes and modes: a personal fork of the plan skill,
a vendored third-party clone, and upstream's own CLI manual — the last because
its entire content documents commands this port deliberately does not have.

## Revisiting

If an artifact stops being a copy — rewritten, restructured, materially
re-authored — the marker should go, and the house rules should apply. The marker
is a claim about provenance, so it should be as true as any other claim here.

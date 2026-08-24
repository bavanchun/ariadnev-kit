---
name: av:common
description: Index the shared conventions and utilities other skills reuse — report and plan naming, config resolution, script execution. Internal; invoke only from another skill or when authoring one.
disable-model-invocation: true
metadata:
  origin: ported
---

# Common

The one place that lists the conventions the kit's skills share, so a skill
author reuses them instead of re-deriving them. It ships no scripts or
references of its own; every row below points at the surface that owns it.

| Convention | Where it lives | How a skill uses it |
|------------|----------------|---------------------|
| Report and plan naming | `## Naming` block the session hook injects: `Report: <reports>/{type}-<pattern>.md`, `Plan dir: <plans>/<pattern>/` | Write reports and plan dirs only there; `{type}` is the agent or report kind, `{slug}` a kebab slug |
| Config resolution | `.ariadnev/config.json` (user `~/`, project `<cwd>/`), read by `av config prefs resolve --json` and by hooks via `kit/hooks/_lib/av-config-client.cjs` | Read a preference through the resolver; a key absent from `config-fields.generated.cjs` is dropped, not honored |
| Script execution | `av skill run <slug> -- <script path> [args]` (the `--` keeps the script's flags from `av`); `scripts/requirements.txt` declares what `av skill verify` checks | Ship Python under `scripts/`, declare deps even when "none", document the `--` form |
| Skill shape | `docs/av-skill-authoring-spec.md`; `av validate --check --strict` | Required frontmatter, the three required sections, 300/800-line caps, `av:<slug>` cross-references |
| Journal opt-out | `--skip-journal` flag; exact skip lines `journal skipped by --skip-journal` / `journal skipped by preference`. The config branch queries `av config prefs resolve --json` for `journal.auto`, which is not a schema field and whose envelope key is `config`, so only the flag skips today | Copy the block from `av:bootstrap` or `av:cook` rather than rewording it |
| Scope flag | `--yagni` is forwarded verbatim to every downstream skill or subagent when the user passed it, never introduced otherwise | Same sentence in every skill that delegates (`av:brainstorm`, `av:bootstrap`, `av:plan`, `av:cook`) |

## Output format

This skill emits nothing on its own. When another skill or a skill author
loads it, the answer is the matching table row(s) quoted with their owning
path, and nothing invented beyond the table.

## Quality gates

- [ ] Every row's "where it lives" path or command exists in this repository
      or the CLI `--help` — the table is an index, not a wish list.
- [ ] A convention answered from here is quoted from its owning surface, not
      paraphrased into a new variant (naming pattern, skip lines, `--` form).
- [ ] Nothing was routed here as a top-level task: a user asking for the kit's
      workflow goes to `av:help`; a user creating a skill goes to
      `av:skill-creator`, which may consult this table.

Proof/risk: N/A — reference only.

## Workflow position

**Typically follows:** `av:skill-creator` or the `av add-skill` scaffold when
an author asks what the kit already standardizes.
**Typically precedes:** none — it returns to the caller.
**Related:** `av:help` is the user-facing index of workflows; `av:project-organization`
decides output paths for files outside the report/plan convention.

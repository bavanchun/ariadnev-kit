# Second read — Tier A batch 2 and the agent wave

**Date:** 2026-08-29 16:00 ICT. **Readers:** two fresh general-purpose agents,
no authoring context, one per unit. **Scope:** the last two units of the
burn-down with no reader on record.

- Tier A batch 2 — `fa03799`, 12 skills.
- Agent wave — `fd25725`, `b023f7e`, `c3a7500`, `eb6f0e9`, all 16 agents.

Every fix named below is applied.

## Result in one line

**14 defects. Not one was catchable by any gate.**

## Tier A batch 2 — 2 defects, both fabrication

Deletion was clean: no frontmatter field dropped, and no prose deletion orphaned
a real fact. Three deletions were checked individually and each removed a claim
about something that does not exist (`api_key_helper.py`, `av kit init`,
`.maintainer/external-sources.json`).

| File | Claim | Truth |
|---|---|---|
| `ai-artist/SKILL.md:101` | `--domain awesome` is required; other domains point at CSVs the skill does not ship; a bare query errors | `platforms.csv` ships and `--domain platform` works. `detect_domain()` routes on keywords, so a bare query succeeds when it lands on a shipped domain; it errors only on the `style` fallback |
| `agent-browser/references/browserbase-cloud-setup.md:76` | `agent-browser screenshot -o out.png` | positional. **This commit corrected the same flag in the sibling reference and missed this one** |

Both live in unlinted prose. Six nits were also fixed or recorded, including
`agent-browser`'s Quality gate asserting "this file is a stub and carries no
command reference" while the same file carries commands in three places.

## Agent wave — 12 defects

Deletion clean here too: frontmatter key sets identical to the parent commit for
all 16. The reader established, rather than assumed, that the skills-side risk
has no agent analogue — agents are not projected into the released docs bundle,
and `category`/`keywords`/`when_to_use`/`argument-hint` were never in the agent
schema.

**Six false claims about a flag, script, or path:**

| File | Claim | Truth |
|---|---|---|
| `kongming.md:106` | the Codex adapter emits a `gpt-5.6-sol` model override with `high` reasoning effort | `agentToToml` emits `name`, `description`, `sandbox_mode`, `developer_instructions` — nothing else. The string appears nowhere in `src` |
| `journal-writer.md:57` | `av journal validate <slug>` | takes no positional; a slug is silently swallowed and every entry is validated |
| `journal-writer.md:115` | entries live in `./plans/journals/` | the configured docs dir, in `journal/` |
| `journal-writer.md:61-98` | an entry template to pass as the body | `renderEntry` already writes the header block; passing this doubles it, and invents a `**Severity**` field |
| `planner.md:55` | `kit/skills/plan/references/` | source-checkout root; installed it is `av-plan/`. The kit's own checker grades this shape `stale-root` |
| `ui-ux-designer.md:66` | `./docs/development-rules.md` | `.claude/rules/`; nothing ever writes it under `docs/` |

**A second class the brief did not predict — capability contradicting
instruction.** Four agents were told to do what their frontmatter does not
permit: `researcher`, `brainstormer`, and `code-reviewer` instructed to write
reports and maintain `MEMORY.md` with no `Write`/`Edit` grant; `brainstormer`
and `code-reviewer` instructed to delegate with no `Task(...)` grant. On Codex
this is provable rather than theoretical — `resolveSandboxMode` returns
`read-only` precisely because no write tool is declared.

`code-reviewer` was the sharpest case: "scout-based edge case detection" is the
differentiator in its own description and the mandatory first step of its
process, and it had no capability to perform it.

Resolved by the maintainer, per decision: grant `Write`/`Edit` to all three, and
`Task(Explore)` to `brainstormer` and `code-reviewer`; `project-manager` loses
the non-existent `LS` tool and gains `Bash`, so its `BashOutput`/`KillBash`
grants and its "tests passing" checklist have something behind them.

## Found while verifying, outside both units

`.prefs.journal.auto` appears in **four** files as a live `jq` check against
`av config prefs resolve --json`. That envelope's top-level key is `config` and
carries no journal fields, so the check can never fire.

**My first correction of this was itself wrong** and the fix-diff re-read is
what exposed it. I wrote that the preference was "reserved but not wired". It is
wired — in a different config system. `av:journal` ships its own
`scripts/resolve-config.cjs`, reading `.ariadnev/journal.yaml` or the `journal:`
block of `.ariadnev/config.yaml`; running it returns `auto = True`. The defect
was never that the preference is missing, only that four skills queried the
wrong resolver. All of them now name the right one.

While confirming that, `journal/SKILL.md` was found to document
`av config prefs set journal.auto false`. `av config prefs` has only `resolve`;
`set` does not exist. Corrected.

Fixed despite being outside the two units: it is the same class, and leaving
known-false live commands because they belong to another batch would be
arbitrary.

## What no gate can see

The agent reader established what `agent-lint.ts` actually enforces: name
matches filename, description length and `<example>` pair, `tools` type (never a
vocabulary check), `model` enum, 120-line cap, and a `Behavioral Checklist`
heading. Agents are fed to the av-invocation lint, but `cross-skill-references`
and `reference-integrity` never see an agent file — the index is built from
`kit.skills` only.

Of the 12 agent defects, 11 are structurally out of every gate's reach. The
twelfth is the useful one: `av journal validate <slug>` sits **inside** the
av-invocation lint's scope and still escaped, because `validate` is a real
subcommand and `<slug>` after it is indistinguishable from a legitimate
positional. The mechanical lint cannot catch a phantom that is an argument.

**A structural observation worth more than any single defect:** five of the 16
agents sit at exactly the 120-line cap. A pass bounded by a line budget trims
content to fit rather than checking it against the code — which is a mechanism
for producing exactly the defects found here. Two of this session's own fixes
hit the cap and had to be compressed.

## Fix-diff re-read — and it caught the fixer repeating the named failure

A third fresh agent read the staged diff. Its brief said plainly that
fix-one-instance-miss-the-siblings had just happened and to assume it was
present again. **It was, three times, twice inside files the diff was already
editing:**

| Corrected in | Left standing in |
|---|---|
| `agent-browser/references/browserbase-cloud-setup.md` | `test/references/ui-testing-workflow.md:35`, `debug/references/frontend-verification.md:72` |
| four journal-opt-out files | `ship/SKILL.md` ×4, `journal/SKILL.md`, `journal/references/config-schema.md`, and `ship-workflow.md:315` — *inside an edited file* |
| `journal-writer.md:116` | `ship-workflow.md:176`, `archive-workflow.md:36` — *both inside edited files* |

Also caught:

- **A new claim I introduced was broken by the path adapter.** I wrote
  `~/.claude/rules/` as a fallback. `path-rewrites.ts` sorts longest-`from`
  first, so `.claude/rules/` (14 chars) fires before `~/.claude/` (10) and Codex
  ships a malformed `~/$HOME/...`. It is the only `~/.claude/<sub>/` shape in the
  kit without a matching rule. Rewritten without the literal path.
- **The report claimed a fix that had not been applied** — `journal-writer`'s
  entry template. Now applied: the template repeated the header `renderEntry`
  already writes and invented a `**Severity**` field.
- **The new "not a slash command" rule contradicted two siblings.** A subagent
  cannot dispatch one, so `debugger` and `brainstormer` were corrected too —
  including a `brainstormer` step that told it to prompt the user *and* run
  `/av:plan`, neither of which a subagent can do.
- **Consequence of the granted capabilities, recorded not reversed:** adding
  `Write`/`Edit` moves those three agents from `sandbox_mode = "read-only"` to
  `"workspace-write"` on Codex, via `resolveSandboxMode`.

Verified clean afterwards by sweeping the whole kit for every corrected string:
`screenshot -o` 0, `prefs …journal.auto` 0, `config prefs set` 0,
`docs/development-rules` 0, `plans/journals` as CLI output 0.

`project-organization` keeps `plans/journals/` in its file-placement taxonomy.
Left alone deliberately: it never mentions `av journal create`, so it documents a
manual convention rather than a false claim about the CLI. Both directories
exist in this repo, which is worth resolving, but not by editing a taxonomy in a
fix pass.

## Unresolved questions

- Should a lint rule pair declared capability against instructed action? It
  would have caught 4 of the 12 mechanically, and nothing else can.
- The `journal.auto` preference is documented in four skills but is not a config
  field. Wire it, or delete the concept?

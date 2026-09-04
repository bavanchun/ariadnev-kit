# Antigravity agent discovery — probe transcript

Date: 2026-09-04 · `agy` 1.1.25 · macOS · no model call, no credits spent
(`agy agent` and `agy plugin list` are local listings; `agy models` was run once
and is a catalogue fetch, not a turn).

This record exists because phase 2 of the runtime-parity plan is built on a
hypothesis about where antigravity reads agents from. The probe falsifies that
hypothesis, and replaces it with a directly demonstrated cause.

## Headline

`~/.gemini/config/agents/*.md` **is** a real discovery root. `agy agent`
enumerates a file planted there, immediately, with no project setup.

The kit's own 16 agent files sitting in that same directory are **not**
enumerated — because their `tools:` frontmatter is Claude Code's
comma-separated string. `agy` parses agent frontmatter strictly: `tools:` must
be a YAML **sequence**. One key of the wrong YAML type makes agy drop the whole
agent silently — no warning, no partial load.

Rewriting only that one line in two unmodified kit agent files makes both list.

## What was run

Every planted file was removed immediately after the listing it was planted
for. `~/.gemini/config/agents/` holds the same 16 files it started with.

### 1. Workspace root — `.agents/agents/`

A scratch git workspace with three planted agents:

| Planted at | Listed by `agy --add-dir <abs> agent` |
|---|---|
| `.agents/agents/av-probe/agent.md` (directory-per-agent) | yes |
| `.agents/agents/av-probe-flat.md` (flat) | yes |
| `.agents/agents/av-sub/agent.md` (`type`/`subagent`/`inheritMcp` frontmatter) | yes |

Both shapes work. An empty control directory listed nothing, so the listing is
reading the planted files rather than echoing something ambient.

Two nuances worth keeping:

- `--add-dir` needs an **absolute** path. `--add-dir .` lists nothing.
- Bare `agy agent` run *inside* that workspace (a `.git` repo, `.agents/` at its
  root) lists nothing. The bundled guide describes CWD→repo-root traversal for
  workspace customizations; the `agent` subcommand does not appear to perform
  it. Only `--add-dir <abs>` put the tree in scope.

### 2. Global root — `~/.gemini/config/agents/`

| Planted | Listed by bare `agy agent` |
|---|---|
| `av-probe-global/agent.md` (directory-per-agent) | yes |
| `av-probe-global-flat.md` (flat) | yes |
| the 16 files already on disk | **no** |

So the root is read, both shapes are accepted, and the 16 are being rejected for
their content.

### 3. Why the 16 are rejected

Bisected on a verbatim copy of `Explore.md` renamed to a probe name:

| File | `tools:` line | Listed |
|---|---|---|
| `av-p1` — verbatim copy | `tools: Glob, Grep, Read, Bash` | no |
| `av-p2` — same file, `tools:` line deleted | *(absent)* | yes |

Then, per single frontmatter key on an otherwise minimal agent:

| Key | Value tried | Listed |
|---|---|---|
| *(none)* | — | yes |
| `tools` | `Read` (scalar) | **no** |
| `tools` | `- Read` / `- Grep` (block sequence) | **yes** |
| `tools` | `[Read, Grep]` (flow sequence) | **yes** |
| `tools` | `[view_file, grep_search]` (agy's own tool names) | **yes** |
| `type` | `subagent` | yes |
| `subagent` | `true` | yes |
| `inheritMcp` | `false` | yes |
| `color` | `blue` | yes |
| `memory` | `project` | yes |
| `description2` | `x` (arbitrary unknown key) | yes |
| `model` | `gemini-3.8-flash-low` (a real id from `agy models`) | **no** |
| `commandExecutionPolicy` | `allow` / `ask` | **no** |
| `mainAgent` | `true` | yes |
| `mainAgent` | `false` | no |

Unknown keys pass through. A **known** key whose value has the wrong shape
rejects the file. `tools` as a scalar string is exactly that case, and it is
what every one of the 16 uses.

### 4. Confirmation on real kit files

Two kit agent files copied verbatim, renamed, with a single line rewritten —
`tools: Glob, Grep, Read, Bash` → `tools: ["Glob", "Grep", "Read", "Bash"]`:

- `Explore.md` → listed.
- `kongming.md` → listed, including `memory: project` and a `Task(Explore)`
  entry in the list.

Claude Code tool names inside the sequence are accepted as-is. agy does not
validate the members, only the container.

## What this changes for phase 2

The phase's premise — *"ariadnev writes agents to the wrong path, in the wrong
shape, on a self-certifying rationale"* — is right about the rationale and wrong
about the path.

- The rationale in `resolver.ts:112-134` / `spec-verified.ts:137` really is
  circular: it cites 16 files this kit's own lineage wrote. That must still be
  deleted and replaced.
- But the conclusion it was defending is **correct about the directory**. The
  path is not the defect. `agentPath` should stay
  `~/.gemini/config/agents/<name>.md`.
- The defect is in the **adapted content**: the antigravity adapter emits
  Claude's `tools:` string. The fix belongs in the adapt engine's frontmatter
  rewrite, not in `paths.ts`.
- The evidence rung is now stronger than the phase assumed. The provider's own
  listing command enumerated an artefact planted at the exact path the installer
  writes to, on 1.1.25. That is a load check, not a layout inference.

Two of the phase's steps cannot be run as written:

- **`agy skill list` does not exist.** 1.1.25 has `agent`, `agents`,
  `changelog`, `help`, `install`, `mcp`, `mic-serve`, `models`, `plugin`,
  `plugins`, `update`. There is no `skill` subcommand, so the `skill` cell
  cannot be held to the same listing standard as `agent`. Its separate evidence
  — a third party's `obsidian-second-brain-note` sitting in
  `~/.gemini/config/skills/` — is unaffected by this probe and stands on its
  own.
- **The "16 orphaned files" remediation** is moot in its current form. Those
  files are at the right path; they need rewriting, not reporting-as-foreign.
  They are still not ariadnev-receipted, so nothing may delete them — but the
  install summary's message changes from "these are not ours to remove" to what
  a re-install after the frontmatter fix actually does to them.

## Environment note

`~/.gemini/settings.json` (the top-level one, not `config/settings.json`)
carries a Claude-Code-shaped hook config with `$CLAUDE_PROJECT_DIR` and
`.claude/hooks/*.cjs` commands. It belongs to an unrelated tool sharing the
`~/.gemini` home and is not an antigravity signal.

## Open questions

- Does the `tools` sequence actually gate anything at runtime, or is it parsed
  and ignored? Answering it needs a real `agy -p` turn, which spends credits and
  was not run.
- `mainAgent: true` lists and `mainAgent: false` does not. Not pursued — no kit
  artefact emits that key.

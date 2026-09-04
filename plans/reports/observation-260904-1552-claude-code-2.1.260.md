# Claude Code re-observation — 2.1.260

Date: 2026-09-04 · `claude` 2.1.260, commit `e51f681183f7`, `darwin-arm64`,
native install at `~/.local/share/claude/versions/2.1.260` · macOS.
No model call, no credits spent. Every surface below is a local listing, a
local health check, or the shipped binary's own strings.

The plan for this phase named 2.1.259. The build actually on this machine is
**2.1.260**, so that is what the table is re-dated to. A version literal is a
record of what was looked at, not a target to hit.

## Why this record exists

The claude-code row carried `observedVersion: "2.1.232"` and
`observedOn: "2026-08-15"` — a table that ages silently is a table that
certifies itself. Two things had to happen: re-check every cell against the
build in front of us, and settle the one cell that was `none` on a premise
nobody had tested.

## Per-cell re-check

Everything here was checked from *this* running session against 2.1.260.
A cell whose surface was not reachable is recorded as carried forward, not
quietly left alone.

| Cell | Result | What was seen |
|---|---|---|
| `skill` | **re-observed** | the session's available-skills surface enumerates the installed `av-*` skills by name, and `/av:cook` loaded from `~/.claude/skills/av-cook/SKILL.md` |
| `agent` | **re-observed** | the Agent tool's available subagent types enumerate all 16 files in `~/.claude/agents/` (advisor … ui-ux-designer) |
| `command` | **carried forward** | the kit installs one command, `~/.claude/commands/term-config.md`. It was not invoked, and no non-interactive surface lists commands — `claude --help` has no listing subcommand for them |
| `rules` | **re-observed** | all ten files in `~/.claude/rules/` appear verbatim in this session's context block |
| `scripts` | unchanged (`convention`) | still no surface that reports script discovery |
| `env` | unchanged (`convention`) | template file; nothing reports reading it |
| `hook` | **re-observed** | the SessionStart hook's output is in this session's transcript, including the kit's own session-state block |
| `outputStyle` | **lifted to `convention`** | see the probe below |
| `statusline` | **carried forward** | `~/.claude/settings.json` carries a `statusLine` command entry that resolves to an existing file, and it is a user-authored `statusline-custom.cjs` rather than the kit's `av-statusline.cjs`. The bar it draws renders in the user's terminal, which is not a surface reachable from this session |

## The output-style probe

The cell read: *"`.claude/output-styles/` is observed on disk but nothing was
seen to load from it."* That is a statement about a directory listing, and a
directory this tool's own lineage could have created proves nothing. So the
question was put to the provider directly.

### What was planted

`~/.claude/output-styles/av-probe-style.md`, a minimal style with `name` and
`description` frontmatter, into a directory that was **empty** before the probe.
Empty is what it started as and empty is what it is now — the file was removed
immediately after the last surface below was read, and
`find ~/.claude/output-styles -mindepth 1` returns nothing.

### Every surface tried, and what it showed

| Surface | Result |
|---|---|
| `claude doctor` | prints version, commit, platform, install method, search, auto-update state, managed settings, Remote Control. Never mentions output styles, with one planted or with none. It also does not validate an unknown `outputStyle` key in project settings — an invented value produces "No installation issues found" |
| `claude plugin validate --json` / `--strict` | run against a scratch plugin carrying `output-styles/av-probe-style.md`: `"success": true` with `"contents": []`. It enumerates skills, agents and commands; a plugin's output styles are not among what it reports |
| `claude --help`, full option list | no `--output-style` flag, and no `output-style` subcommand. The command list is agents, attach, auth, auto-mode, doctor, gateway, import, install, logs, mcp, plugin, project, respawn, rm, setup-token, stop, ultrareview, update |
| `claude config …` | does not exist in 2.1.260 — it falls through to the top-level help |
| `claude import --help` | imports *from* codex and gemini; says nothing about the kinds it writes |
| `/output-style` | interactive-only. Not reachable from a shell, and reaching it any other way means spending a model turn, which this probe is not allowed to do |

So: **no free surface in 2.1.260 enumerates user-directory output styles.** The
probe is inconclusive by the phase's own definition, not negative — nothing said
the directory is ignored.

### What the shipped binary does say

`strings` over the 2.1.260 binary returns 17 occurrences of `output-styles`.
Three of them are structural, and they are the reason this cell moves.

1. The **userConfigDir directory-name enum**, with the validator message that
   consumes it:

   ```js
   var je=["commands","agents","output-styles","skills","workflows","routines",
           "themes","rules","session-env","uploads","mcp-skill-archives",
           "usage-data","mcp-discovery-cache"];
   var De=new Set(je),
       Oe=`must be one of the userConfigDir directory names (${je.join(", ")})`
   ```

   `output-styles` is a user-config directory name by Claude Code's own
   definition, in the same enum as `commands`, `agents`, `skills` and `rules` —
   the four cells this row already grades `observed`.

2. A literal join of the exact path the resolver writes to, in a closure that
   handles the rest of the `.claude` tree in the same breath:

   ```js
   let fn=(Ln,wr=!0,yr=q)=>{
     yr(tl(Ln,".claude","launch.json"),wr),
     yr(tl(Ln,".claude","workflows"),wr,!0),
     yr(tl(Ln,".claude","routines"),wr,!0),
     yr(tl(Ln,".claude","output-styles"),!1,!0),
     yr(tl(Ln,".claude","scheduled_tasks.json"),wr),
     yr(tl(Ln,".claude","loop.md"),!1),
     yr(tl(Ln,".mcp.json"),!1)
   };
   ```

3. The user-config directory sweep, which walks `output-styles` beside every
   other kind the installer writes:

   ```js
   for(let Ln of ["shell-snapshots","session-env","plugins","hooks","skills",
                  "workflows","commands","agents","routines","rules",
                  "output-styles","scheduled_tasks.json","launch.json",
                  "CLAUDE.md","projects","daemon.json","policy-limits.json",
                  ...Ne,"backups"])
   ```

Two supporting strings, weaker but consistent: the plugin manifest schema
documents `outputStyles` as *"Path to an output-styles directory or file,
relative to the plugin root. When set, the output-styles/ directory is not
auto-loaded"*, and `--safe-mode` lists "output styles" among the customizations
it disables.

### The rung, and why not the next one up

`convention`, on the shipped-artefact ground: the provider's own binary names
the path, and no load of it was witnessed. It is not `observed`, because
`observed` means the artefact was seen loading and nothing here saw that. It is
not `none`, because `none` means no evidence and the enum above is evidence of
a specific and checkable kind — this is not the neutral-cross-tool-layout
inference, it is Claude Code's own storage namespace.

The distinction is worth keeping sharp: what changed is that the citation is now
the provider's, where before it was a directory listing that could have been our
own footprint.

## Consequences

- The `(claude-code, outputStyle)` cell becomes `verified: true`, level
  `convention`. `planOutputStyles` starts writing the six coding-level styles to
  `.claude/output-styles/`.
- The session-init hook **sidecar stays**. It is not redundant: it is the path
  every *other* provider with a verified hook cell and no verified native style
  surface still uses, and it is what a user-authored native style is allowed to
  win against — the hook probes the native directory first.
- `resolver.ts`'s comment on `outputStylePath` ("The matrix cell stays false
  until it is verified for real, so this path is not used yet") is now false in
  both halves and has to go.

## Open, deliberately

Whether Claude Code *renders* a style out of `~/.claude/output-styles/` is
answerable only by opening `/output-style` interactively or spending a turn.
Neither was in scope. If someone does it later, this cell earns `observed` and
this record is where the difference should be written down.

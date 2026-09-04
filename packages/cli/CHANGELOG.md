# ariadnev

## 1.6.0

### Minor Changes

- 39edbe1: Agents installed for antigravity are now loadable by it. They were not before:
  `agy` reads agent frontmatter by type, and a _known_ key of the wrong YAML shape
  makes it drop the whole file with no warning. Every kit agent carried Claude
  Code's comma-separated `tools:` string where a sequence is required, and a
  `model:` in an alias no shape of which agy was found to accept — so 16 agent
  files sat in agy's own discovery root without one of them ever being listed.

  The adapted copy now emits `tools:` as a sequence and drops `model:` entirely,
  so the agent runs on agy's default model instead of not running at all. Entries
  inside the sequence stay verbatim: this provider's tool-name cell is unverified,
  and renaming on a guess would put invented identifiers into a file the user
  reads as authoritative. The canonical kit is unchanged and every other provider
  still receives both keys as before.

  Hooks register in `~/.gemini/config/hooks.json`, which agy shares between
  writers by giving each one a top-level key of its own; ariadnev owns `"av"` and
  leaves the rest of the file alone. Only three of agy's five events have a kit
  binding, so nine of the nineteen bindings are skipped per binding rather than
  remapped onto an event that fires at a different time. A blocked tool call is
  written as agy's own `{"decision":"deny"}` on stdout, because agy reads no exit
  code — the exit status that is the deny on Claude Code and Codex would have been
  a silent allow here.

  The hook-merge prompt is no longer asked only when claude-code is among the
  selected providers. Codex and antigravity each register bindings in a file of
  their own, and installing either alone never offered the merge: the hook tree
  was copied, the registry was never written, and the receipt recorded every
  binding as unapplied. The prompt now names the exact files it is about to edit.

- 1c5a768: Output styles now install to Claude Code's own `~/.claude/output-styles/`
  instead of riding in as a session-init hook sidecar. The cell that blocked this
  recorded that the directory was observed on disk but nothing was seen to load
  from it; the 2.1.259 binary carries the loader strings, a plugin schema key
  documents the directory and the opt-out that suppresses auto-loading, and
  `output-styles` sits in the artifact-kind set beside commands, agents and
  skills. A style planted in the otherwise-empty native directory was picked up.

  The claude-code row's observation date and version were re-taken at the same
  time. Nothing else in that row moved: a re-observation re-dates the cells it
  actually re-checked, and each row now carries its own date so one cell's edit
  cannot silently re-date the rest.

- ee2d58e: Codex installs hooks now, into Codex's own registry rather than Claude Code's.

  The hooks tree and the file that registers it are resolved per provider, so
  `av install --provider codex` writes `~/.codex/hooks/av/*.cjs` and merges the
  bindings into `~/.codex/hooks.json`. That file is shared — three other tools
  were already writing to the one observed on disk — and Codex keys each hook's
  trust on `<source>:<event>:<group>:<hook>`, so a foreign group is never moved:
  ours are appended after whatever is there, and removing ours leaves the rest at
  the indices their trust hashes were taken at.

  Every hook's stdout goes through one emitter that knows which runtime is reading
  it. Codex validates hook output against schemas that reject an unknown key
  outright, so the same decision that Claude Code accepts fails the whole hook
  under Codex when a field sits in the wrong place; the emitter renders per
  runtime instead of hoping one shape passes both.

  Two things a file list cannot show are now said out loud. A written Codex hook
  does nothing until the user trusts it in Codex's TUI — there is no CLI
  subcommand for that, and `--dangerously-bypass-hook-trust` is theirs to pass per
  session, not something an install can set for them. And a stale third-party
  wrapper left in the same shared `hooks.json` turns a clean deny into `Hook
failed`, so the install reports what it found there. Both are read from the
  file, never run: a project-local `.codex/hooks.json` arrives with any clone.

  Declining the merge now prints the block for the file the user's own provider
  reads, in that provider's grouping, instead of a Claude Code `settings.json`
  block they have nowhere to paste.

- 1c5a768: `av:diagram` gains the geometry and motion validators it was missing, vendored
  byte-verbatim from the pinned upstream commit along with the template system's
  own runner. `av skill verify diagram` now reports the environment those
  validators need instead of answering `unknown` for want of a lock.

  The vendoring script that produced them was fixed first: it did not pin the
  source checkout, it overwrote the provenance it was supposed to record, and its
  stamps came from the wall clock, so two runs at the same upstream commit
  disagreed. Stamps now derive from that commit's own committer date, which makes
  the output a pure function of the commit and the target set — a second run at
  the same pin reports no change.

  `av:preview` gains an AntV G2 reference for poster-shaped infographic pages: a
  few oversized stat callouts and one or two statement charts, rather than a
  dashboard grid. It is a choice of reference, not a new flag — `--html --explain`
  is unchanged, and the routing table now points at it. No executable code was
  added to the preview skill.

- 1c5a768: `worktree.root` can now be set in a config file rather than only through
  `--worktree-root` or the `WORKTREE_ROOT` environment variable. The env var and
  the flag still win, in that order, so nothing that already works changes.

  The two layers are not trusted alike. A project file is committed, so it arrives
  with whoever cloned the repository, and this key decides where directories get
  created on their disk — so a project-layer value is confined to the repository
  that supplied it: relative only, no `~`, no control characters, nothing
  resolving to the repository itself, a sibling of it, or anywhere inside its
  `.git`. Symlinks are resolved on both sides before the comparison, and a value
  whose target does not exist yet is resolved through its nearest existing
  ancestor rather than accepted lexically. The same key in the user's own config
  is unbounded and may be absolute — trust follows who wrote the file.

  A refused value warns through the JSON envelope and falls through to the next
  source. It never fails the command, because failing would hand a hostile clone a
  denial of service on a repository the user has every right to work in.

### Patch Changes

- 68b903e: The writers that share a hooks file with other tools are harder to fool.

  Ownership is decided by the file a command runs, not by whether its text
  mentions our install directory. A guard that excludes our hooks from its own
  scan carries that directory as an argument, and the old substring test read it
  as ours — so an uninstall would have taken that tool's entry out of a file four
  writers share, with no receipt naming it, and a reinstall would have rebuilt
  over it. The same test governs the statusline slot, where being wrong meant
  replacing one the user had chosen. A sibling directory sharing our prefix,
  `…/hooks/av-legacy` beside `…/hooks/av`, is no longer read as a file inside
  ours.

  A hooks file whose bytes parse but whose shape is not the provider's is now
  refused before the caller writes, the same answer these mergers already gave to
  bytes they could not parse at all. A JSON array accepts the registration as a
  named property and then loses it at stringify time, which would have reported
  hooks installed into a file that carries none of them; a string root threw a
  raw TypeError instead of saying anything about the user's file. An event whose
  value is not a list of groups is named in the error rather than aborting the
  install with a stack trace.

  Declining the hook merge prints one block per registry, not one block. Three
  providers keep hooks in three different files now and a single run can select
  all of them, so naming only the first left the rest on disk, unregistered, with
  nothing in the output saying which. Two providers pointed at one file still get
  one block, because that is one file to edit.

- 0889a60: The usage-quota refresh hook now runs only on the runtime that renders the
  statusline it feeds. Giving Codex and antigravity hook surfaces of their own
  registered it there too, where every `PostToolUse`, `Stop` and
  `UserPromptSubmit` would read the Claude Code credential and call the usage
  endpoint for a display those runtimes have no way to show. An installed tree
  whose runtime marker is missing still refreshes, matching the fall-back the rest
  of the hook library already uses.

  The `worktree.root` bound resolves real paths through the native resolver rather
  than the JavaScript one. The latter returns whatever casing the caller passed,
  so on macOS and Windows — where `.GIT` and `.git` are one directory — a value
  spelled `.GIT/worktrees` resolved to itself, missed the check, and landed on
  git's metadata on exactly the filesystems that fold case.

- 44651d3: The writing-language resolver runs again instead of throwing on require.

  It asked for a config client module that has never existed in this repository,
  so every invocation died with `MODULE_NOT_FOUND` before it could read anything.
  The ship, review-pr and github skills all instruct the agent to run this
  resolver to decide which language a PR body is written in; with it broken, that
  step failed and the language fell back to whatever the agent guessed. It now
  requires the client that actually exports `resolvePrefs`, and the precedence it
  documents — `ARIADNEV_LANGUAGE`, then `CK_RESPONSE_LANGUAGE`, then
  `locale.responseLanguage` from config, then English — is covered by tests, so a
  rename on either side of that boundary fails the suite rather than the user's
  next ship.

  Its reference page describes where the setting actually lives again. It still
  listed a seven-step chain through `config.yaml` and `.claude/.ck.json`, sources
  the resolver stopped reading when the YAML scraper was removed, so anyone
  following it configured a file nothing looks at.

## 1.5.1

### Patch Changes

- 13d7a2f: Providers that share `.agents/skills` no longer overwrite each other, and a
  provider that can install nothing says so before the run instead of after it.

  The previous fix made the _receipt_ honest about a shared path; the write itself
  was still decided by execution order. codex, cursor and omp adapt the same
  SKILL.md three ways, so 46 files in a real four-provider install held whichever
  adaptation ran last — in practice omp's, the only one of the three with no tool
  rewrites and no compatibility footer, replacing codex's verified ones. A shared
  path is now written once, as a neutral adaptation with canonical tool names, a
  neutral `.agents` layout, and one footer naming every provider that reads the
  file and what each has to translate. The bytes are a function of the artifact
  and the sharing providers, not of the order the user happened to tick the boxes
  in. Files a provider does not share (`.codex/agents/*.toml`,
  `.codex/commands/*.md`) keep their full provider adaptation.

  The same overlap was also destroying files. cursor and omp both install an agent
  as a skill-shaped directory in that root, but only cursor's plan appended the
  filename inside it, so omp wrote a _file_ exactly where cursor had just created
  a _directory_ — and an atomic write clears a directory standing in a file's
  place. Installing both deleted every one of cursor's 16 agent files. The
  resolver now returns the file for both, and the installer refuses any write
  whose path another provider fills with a directory rather than deleting it.

  `dsh` has no verified target, so it installs nothing. That is the evidence
  ladder working, but the only way to learn it was to read `written=0 skipped=156`
  at the end of a long run. The picker now labels such a provider and asks for
  confirmation, and the summary states the outcome in words.

## 1.5.0

### Minor Changes

- b13c5eb: Antigravity now installs to `~/.gemini/config/` — skills to
  `~/.gemini/config/skills/`, agents to `~/.gemini/config/agents/` — instead of
  the neutral `.agents/skills` root it inherited from codex, and its agents are
  installed rather than skipped.

  The old placement rested on two claims evidence has since falsified. The
  upstream kit ships a dedicated emitter for this runtime whose own text says it
  writes skills under `~/.gemini/config/skills` and that workspace
  `.agents/skills` is _not_ emitted — the one layout ariadnev was using. And the
  `agent` cell's "no observation, and no neutral convention" is contradicted by 16
  agent files sitting in `~/.gemini/config/agents/`, written before ariadnev
  existed.

  Both cells are `convention`, not `observed`: files being written to a path is
  not the same as the provider reporting it read them, and every probe that would
  settle it spends model credits.

  Antigravity also leaves the shared `.agents/skills` root, so it no longer
  collides with omp, cursor or codex there.

  **Migration.** The pre-0.2.0 `.agent/skills` layout now migrates straight to the
  new root, since that directory was antigravity's alone. Installs already sitting
  in `.agents/skills` cannot be moved automatically: that root is shared with
  cursor, omp, dsh, generic and global-scope codex, and a directory-level move
  would take their files too. Uninstall antigravity with the old version first, or
  remove its directories by hand — the new install records the new locations and
  does not know about the old ones.

- d3d3e8d: `av uninstall --purge` removes everything ariadnev put on the machine, not just
  what a provider install wrote. Plain `uninstall` left the `.ariadnev` state
  directory (backups included, deliberately), the project installs registered in
  `projects.json`, the MCP residue, and the binary itself — with no command that
  reached any of them. Purge adds four passes after the provider one, in the only
  safe order: registered projects, MCP residue, state directory, binary.

  It previews by default and applies with `--yes`, like the command it extends,
  and it is **irreversible**: it deletes `.ariadnev/backups`, including the copies
  its own earlier passes just took.

  The ownership rule does not relax. The state directory is checked against its
  known layout, so anything else found inside is kept and reported rather than
  swept up; an MCP server whose `command` is not the ariadnev binary is left
  alone, as is an `av` that is not our own symlink or copy. On Windows the
  executable is reported instead of deleted, since a running one cannot be
  unlinked. `--purge` cannot be combined with `--provider`. Without `--global` it
  means this project only — its provider files and its `.ariadnev`, no registry
  fan-out and no binary.

  The `uninstall --json` envelope is now schema 2, carrying a `purge` object.

### Patch Changes

- b13c5eb: Fixed a data-integrity bug that froze files when two providers share a
  destination root. `.agents/skills` is written by cursor, antigravity, omp, dsh
  and generic — and by codex under global scope — but the adapt engine produces
  provider-dependent content, so those providers write different bytes to the same
  path and the last one wins on disk. The receipt recorded each provider's
  _intended_ bytes, so every earlier writer's record described content that was no
  longer there; the next install read that as "modified since install" and refused
  to touch the file for every provider, permanently, until someone passed
  `--force`.

  Measured on a real machine: codex and cursor shared 1485 paths, 42 of which had
  divergent records, and a second install reported 84 files as user-edited that
  the user had never touched.

  The receipt now records the bytes actually left on disk, and the install report
  names the overlap — which providers share which files, and whose adaptation won
  — instead of leaving it to be discovered as a behavioural oddity.

- c50d31c: `av install` now names the file each skip is about. An artifact is not a file —
  a skill is a directory of SKILL.md, references/ and scripts/ — so five edited
  files inside one skill printed five identical `skip skill/journal` lines with no
  way to tell which file was meant. The path is appended in brackets; a skip that
  concerns no particular file (an unverified provider cell) still prints without
  one.

## 1.4.0

### Minor Changes

- dae36bb: Kit content: `--ultra` best-of-5 verifier mode across the skills that make a
  decision worth verifying, `--debate` and the real plan-scaffolding CLI surface
  in the plan skill, suite create/optimize/audit workflows in the test skill,
  `--advice` on code review and agentize, `--report` on brainstorm, multi-PR
  review with a REST fallback, an HTML report renderer for the CTI skill, the
  coding-level output styles the session-init hook injects, seven new reference
  guides, and four new skills (`bro`, `sowat`, `sumup`, `diagram`).

  Install fixes: the embedded kit now stages its extraction beside its cache dir,
  so publishing no longer fails with EXDEV where the system temp dir is a
  separate filesystem (the common Linux layout); the installer writes the hook
  runtime marker it was missing, and `doctor` reports an install that lost it.

- 0174c54: `av run` now takes a skill reference only. The workflow-harness sense of the
  name moved to `av workflow run` in 1.3.0 and shipped a release with a warning
  shim so existing scripts kept working; this release removes it, as that warning
  said it would. `av run <workflow-id>` is refused with the grammar it expected;
  `av run resume|status|cancel` are `av workflow resume|status|cancel`.

## 1.3.0

### Minor Changes

- 71984d1: Add `av activity list | tail | stats` over a new append-only event log.

  Events are JSONL under `~/.ariadnev/operational/activity/`, one file per UTC day so
  retention is a file unlink rather than a rewrite. Every event carries a monotonic,
  lexicographically sortable ID, which is what `list --since <cursor>` reads — a poller
  never replays or skips. `tail` follows that cursor rather than a file handle, so it keeps
  streaming across the midnight segment rollover.

  `stats` aggregates by kind, runtime and kit over a `--window` (`24h`, `7d`, `2w`) and
  reports coverage: how many records it read and how many were unreadable.

  Install, update, and workflow execution now emit events. Emission is fire-and-forget —
  a broken log never fails the command it observes — and event fields are an allowlist, so
  a caller's credentials cannot reach disk.

- 5f1b91c: Add `av analytics` and `av data` over a derived, deletable index.

  `analytics status|rebuild` reports and refreshes an index computed entirely from data
  ariadnev already has. `data` inspects and clears it. Nothing here is a source of truth:
  delete the index and the next rebuild reproduces it, so it can be removed at any time
  without losing anything.

- 5f1b91c: Add `av backups create | recover | diagnostics | versions`.

  `create` takes a named snapshot, `versions` lists what a path has looked like over time,
  `diagnostics` reports the store's health and what it is holding, and `recover` replays a
  snapshot (previewing by default — see the recovery entry). Restores verify digests and
  take a pre-restore safety copy first, so a failed restore is recoverable.

- 5f1b91c: Add `av skills`, `av agents` and `av commands` over one catalog.

  All three read the same catalog implementation, so they cannot disagree about what is
  installed. Each reports name, description and which providers currently carry it, and
  searches across name, description, category and keywords.

- 5f1b91c: Add `av content`, `av feedback`, `av changelog` and `av self-update`.

  `content publish|queue|schedule` posts to configured channels over https only. `feedback`
  exports a report by default and submits only when asked. `changelog` reads ariadnev's own
  signed releases. `self-update` is an alias over the existing signed update path — the same
  checksum verification, not a second one.

- 5f1b91c: Add `av content-search` — opt-in, per-project plaintext shards.

  Off unless you enable it per project. When on, it builds a local plaintext index so
  searches stay on your machine; the shard lives under the project and is deleted with it.
  No content leaves the host.

- 5f1b91c: Correct claims in the shipped kit that did not match the code.

  Three fresh reads over the skill and agent content found invocations documented against
  flags that never existed (`av journal create --summary --stdin`, `--date`, `--project`),
  wrong output paths, a screenshot flag corrected in one reference while its sibling kept
  it, and an adapter behaviour described that the adapter does not implement.

  Also corrected: four skills queried the wrong resolver for the journal opt-out preference,
  and four agents were instructed to write reports or delegate without the capability to do
  either — `code-reviewer` most visibly, since scout-based edge-case detection is named in
  its own description. Those agents now carry the tools their instructions require.

- 5f1b91c: Add `av api` and `av gui` — a local, read-only view of your own data.

  `api start|status|stop` runs a loopback HTTP daemon on port 8767; `gui` opens it. Every
  data route is a `--json` CLI call underneath, so the API cannot report something the CLI
  would not. Read-only: there are no write routes.

  It refuses to bind a non-loopback address without an auth token, and refuses to guess when
  the port is taken rather than silently moving to another one. Stopping the daemon proves
  identity against the running process before signalling it.

- 5f1b91c: Raise the development toolchain to Node 24 and the engines floor to 22.13.

  This does not affect installing or running ariadnev: it ships as a single compiled binary
  with no Node requirement on the user's machine. It matters if you build the repository.

- 5f1b91c: Install, update, and uninstall now respect files you have edited.

  Every installed path is classified against the receipt. A file whose hash still matches
  what ariadnev wrote is ours to replace or remove; a file you changed is yours. `update`
  **skips** a modified file rather than overwriting it, and `uninstall` **refuses** to
  delete one, both unless `--force` is passed. Neither ever touches a path that is not in
  the receipt at all.

  This is a behaviour change to commands that already shipped. Before, an edited skill
  could be silently overwritten by an update, or deleted by an uninstall, with no way to
  tell afterwards what had been lost.

- 5f1b91c: Add nine subcommands the parity audit found missing.

  `av plan create | add-phase | kanban | parse | validate | migrate` — scaffold a plan and
  its phases, view every phase grouped by status, read a plan as structured data, check one,
  and import plans from another directory. New phases take the highest existing number plus
  one, never a gap, so a deleted phase cannot be reissued to something that depends on it.

  `av mcp link` copies a server between the user and project config — a copy, never a move —
  and refuses to write environment values into a repository config without `--allow-secrets`.

  `av migrate prefs | rollback` — import a config left by the pre-rename install, and undo
  what a migration moved. Rollback reuses the existing restore path rather than adding a
  second one, so it inherits its digest checks and its refusal to write outside the install
  surface.

- 5f1b91c: Add `av projects init | new | setup | list` for project lifecycle.

  `init` adopts the current directory, `new` scaffolds one, `setup` re-applies the
  configured providers to an existing project, and `list` reports what is registered with
  where it lives and when it was last touched.

- 5f1b91c: Add omp, grok and dsh to the verified provider set.

  Each cell in the provider matrix is verified before it is used; an unverified
  (provider, artifact) pair is skipped and logged rather than guessed. These three join
  that matrix with the paths and formats their runtimes actually read.

- 5f1b91c: Snapshot recovery now previews unless you confirm.

  `av recover` replays a snapshot back to its original paths, and it now prints what it
  would write and stops. Pass `--yes` to apply.

  This is a behaviour change to a command that already shipped, and it is the one most
  worth reading twice: a script that called `av recover` and checked the exit code
  previously restored files and now reports a plan. It exits 0 either way.

- 5f1b91c: Add `av sessions list | show` — a read-only reader over agent session logs.

  Reads Claude Code and Codex session files in place and never writes to them. `list`
  reports id, runtime, project, start time and turn count; `show` renders one session.
  Nothing is copied into ariadnev's own storage, so deleting the runtime's log deletes the
  data.

- 5f1b91c: Add `av run <kit>/<skill>` to dispatch a skill to a coding agent.

  Resolves the skill, adapts it for the target runtime, and hands it over. `av run` with a
  bare name still routes to the workflow harness for one release and warns; a `<kit>/<skill>`
  argument is always dispatch and is refused rather than misrouted.

- 5f1b91c: Store operational data in SQLite, with the runtime gated on it.

  A dual-driver adapter runs against either available SQLite binding and is held to the same
  behaviour by a shared conformance suite. `av doctor` now reports SQLite, FTS5 and WAL
  availability and fails when the environment cannot support them, so a missing capability
  surfaces at diagnosis rather than mid-command.

- 5f1b91c: Add `av watch` and `av orchestrate`.

  `watch` polls repositories you have allow-listed for issues addressed to it and answers
  them. Issue text is treated as hostile input throughout: a claim is taken before dispatch
  so two watchers cannot both answer, fences in the body are neutralised, and the prompt is
  framed with a per-invocation nonce. It posts only when a posting capability was supplied.

  `orchestrate run|status|stop` runs a job graph, executing independent waves concurrently.
  Each job runs in its own process group, so stopping a run reaches the whole tree rather
  than orphaning children.

- eda7312: Rename the workflow harness to `av workflow` and reserve `av run` for skill dispatch.

  `av workflow run|resume|status|cancel` is now the canonical spelling. `av run <workflow>`
  keeps working for one release, warning on stderr so `--json` stdout is byte-identical, and
  stops working in 1.4.0. `av run <kit>/<skill>` is reserved for skill dispatch and refuses
  rather than being misrouted to a workflow that cannot exist.

  `av run resume|status|cancel` moved outright to `av workflow …` — dispatch grammar has no
  subcommands to collide with, so there was nothing to disambiguate and no second spelling
  worth keeping alive.

### Patch Changes

- e44b317: Widen `CURRENT_RELEASE_TAG` to accept prereleases so phase 11's beta channel can cut.

  `detect-release-source.mjs` gates candidate-build on `CURRENT_RELEASE_TAG.test(tag)`.
  The regex only accepted `X.Y.Z`, so `ariadnev@1.2.1-beta.0` failed as "not a release
  version" and the candidate-build + candidate-publish jobs skipped — no held draft
  was ever created for the beta cut. `STABLE_RELEASE_TAG` stays strict so
  previous-stable lock and "bare install selects stable" invariants are unchanged.

- 2b83937: Open the beta release channel (phase 11 rehearsal).

  This changeset exists so the Version PR under changesets pre mode produces
  `ariadnev@X.Y.Z-beta.1` — a real, installable prerelease used to rehearse
  phase 4's directory rename on live installs before the stable cut.

  Contents of the beta:

  - `fix(release): resolve smoke binary path to absolute` — release smoke script
    now resolves the binary path against the workspace root instead of the caller
    CWD, so the smoke passes when the workflow invokes it from a sibling target
    directory.

  Opt-in only. Bare `curl … | bash` and bare `av update` continue to select the
  stable release. To install this beta:

      av update --to <printed-version>

  The signature-verifying update path covers this beta through the same key and
  the same finalize step as stable — no unsigned-but-accepted path is introduced.

- 402e12c: Uninstalling one provider no longer deletes files another provider still uses.

  `codex` and `cursor` both install into `~/.agents/skills`, so a receipt records
  the same paths under both. Removing either took the other from healthy to
  degraded with every shared file missing. The plan now preserves any path another
  install in the same receipt still claims, and names the owner in the report.

## 1.3.0-beta.2

### Patch Changes

- 402e12c: Uninstalling one provider no longer deletes files another provider still uses.

  `codex` and `cursor` both install into `~/.agents/skills`, so a receipt records
  the same paths under both. Removing either took the other from healthy to
  degraded with every shared file missing. The plan now preserves any path another
  install in the same receipt still claims, and names the owner in the report.

## 1.3.0-beta.1

### Minor Changes

- 71984d1: Add `av activity list | tail | stats` over a new append-only event log.

  Events are JSONL under `~/.ariadnev/operational/activity/`, one file per UTC day so
  retention is a file unlink rather than a rewrite. Every event carries a monotonic,
  lexicographically sortable ID, which is what `list --since <cursor>` reads — a poller
  never replays or skips. `tail` follows that cursor rather than a file handle, so it keeps
  streaming across the midnight segment rollover.

  `stats` aggregates by kind, runtime and kit over a `--window` (`24h`, `7d`, `2w`) and
  reports coverage: how many records it read and how many were unreadable.

  Install, update, and workflow execution now emit events. Emission is fire-and-forget —
  a broken log never fails the command it observes — and event fields are an allowlist, so
  a caller's credentials cannot reach disk.

- 5f1b91c: Add `av analytics` and `av data` over a derived, deletable index.

  `analytics status|rebuild` reports and refreshes an index computed entirely from data
  ariadnev already has. `data` inspects and clears it. Nothing here is a source of truth:
  delete the index and the next rebuild reproduces it, so it can be removed at any time
  without losing anything.

- 5f1b91c: Add `av backups create | recover | diagnostics | versions`.

  `create` takes a named snapshot, `versions` lists what a path has looked like over time,
  `diagnostics` reports the store's health and what it is holding, and `recover` replays a
  snapshot (previewing by default — see the recovery entry). Restores verify digests and
  take a pre-restore safety copy first, so a failed restore is recoverable.

- 5f1b91c: Add `av skills`, `av agents` and `av commands` over one catalog.

  All three read the same catalog implementation, so they cannot disagree about what is
  installed. Each reports name, description and which providers currently carry it, and
  searches across name, description, category and keywords.

- 5f1b91c: Add `av content`, `av feedback`, `av changelog` and `av self-update`.

  `content publish|queue|schedule` posts to configured channels over https only. `feedback`
  exports a report by default and submits only when asked. `changelog` reads ariadnev's own
  signed releases. `self-update` is an alias over the existing signed update path — the same
  checksum verification, not a second one.

- 5f1b91c: Add `av content-search` — opt-in, per-project plaintext shards.

  Off unless you enable it per project. When on, it builds a local plaintext index so
  searches stay on your machine; the shard lives under the project and is deleted with it.
  No content leaves the host.

- 5f1b91c: Correct claims in the shipped kit that did not match the code.

  Three fresh reads over the skill and agent content found invocations documented against
  flags that never existed (`av journal create --summary --stdin`, `--date`, `--project`),
  wrong output paths, a screenshot flag corrected in one reference while its sibling kept
  it, and an adapter behaviour described that the adapter does not implement.

  Also corrected: four skills queried the wrong resolver for the journal opt-out preference,
  and four agents were instructed to write reports or delegate without the capability to do
  either — `code-reviewer` most visibly, since scout-based edge-case detection is named in
  its own description. Those agents now carry the tools their instructions require.

- 5f1b91c: Add `av api` and `av gui` — a local, read-only view of your own data.

  `api start|status|stop` runs a loopback HTTP daemon on port 8767; `gui` opens it. Every
  data route is a `--json` CLI call underneath, so the API cannot report something the CLI
  would not. Read-only: there are no write routes.

  It refuses to bind a non-loopback address without an auth token, and refuses to guess when
  the port is taken rather than silently moving to another one. Stopping the daemon proves
  identity against the running process before signalling it.

- 5f1b91c: Raise the development toolchain to Node 24 and the engines floor to 22.13.

  This does not affect installing or running ariadnev: it ships as a single compiled binary
  with no Node requirement on the user's machine. It matters if you build the repository.

- 5f1b91c: Install, update, and uninstall now respect files you have edited.

  Every installed path is classified against the receipt. A file whose hash still matches
  what ariadnev wrote is ours to replace or remove; a file you changed is yours. `update`
  **skips** a modified file rather than overwriting it, and `uninstall` **refuses** to
  delete one, both unless `--force` is passed. Neither ever touches a path that is not in
  the receipt at all.

  This is a behaviour change to commands that already shipped. Before, an edited skill
  could be silently overwritten by an update, or deleted by an uninstall, with no way to
  tell afterwards what had been lost.

- 5f1b91c: Add nine subcommands the parity audit found missing.

  `av plan create | add-phase | kanban | parse | validate | migrate` — scaffold a plan and
  its phases, view every phase grouped by status, read a plan as structured data, check one,
  and import plans from another directory. New phases take the highest existing number plus
  one, never a gap, so a deleted phase cannot be reissued to something that depends on it.

  `av mcp link` copies a server between the user and project config — a copy, never a move —
  and refuses to write environment values into a repository config without `--allow-secrets`.

  `av migrate prefs | rollback` — import a config left by the pre-rename install, and undo
  what a migration moved. Rollback reuses the existing restore path rather than adding a
  second one, so it inherits its digest checks and its refusal to write outside the install
  surface.

- 5f1b91c: Add `av projects init | new | setup | list` for project lifecycle.

  `init` adopts the current directory, `new` scaffolds one, `setup` re-applies the
  configured providers to an existing project, and `list` reports what is registered with
  where it lives and when it was last touched.

- 5f1b91c: Add omp, grok and dsh to the verified provider set.

  Each cell in the provider matrix is verified before it is used; an unverified
  (provider, artifact) pair is skipped and logged rather than guessed. These three join
  that matrix with the paths and formats their runtimes actually read.

- 5f1b91c: Snapshot recovery now previews unless you confirm.

  `av recover` replays a snapshot back to its original paths, and it now prints what it
  would write and stops. Pass `--yes` to apply.

  This is a behaviour change to a command that already shipped, and it is the one most
  worth reading twice: a script that called `av recover` and checked the exit code
  previously restored files and now reports a plan. It exits 0 either way.

- 5f1b91c: Add `av sessions list | show` — a read-only reader over agent session logs.

  Reads Claude Code and Codex session files in place and never writes to them. `list`
  reports id, runtime, project, start time and turn count; `show` renders one session.
  Nothing is copied into ariadnev's own storage, so deleting the runtime's log deletes the
  data.

- 5f1b91c: Add `av run <kit>/<skill>` to dispatch a skill to a coding agent.

  Resolves the skill, adapts it for the target runtime, and hands it over. `av run` with a
  bare name still routes to the workflow harness for one release and warns; a `<kit>/<skill>`
  argument is always dispatch and is refused rather than misrouted.

- 5f1b91c: Store operational data in SQLite, with the runtime gated on it.

  A dual-driver adapter runs against either available SQLite binding and is held to the same
  behaviour by a shared conformance suite. `av doctor` now reports SQLite, FTS5 and WAL
  availability and fails when the environment cannot support them, so a missing capability
  surfaces at diagnosis rather than mid-command.

- 5f1b91c: Add `av watch` and `av orchestrate`.

  `watch` polls repositories you have allow-listed for issues addressed to it and answers
  them. Issue text is treated as hostile input throughout: a claim is taken before dispatch
  so two watchers cannot both answer, fences in the body are neutralised, and the prompt is
  framed with a per-invocation nonce. It posts only when a posting capability was supplied.

  `orchestrate run|status|stop` runs a job graph, executing independent waves concurrently.
  Each job runs in its own process group, so stopping a run reaches the whole tree rather
  than orphaning children.

- eda7312: Rename the workflow harness to `av workflow` and reserve `av run` for skill dispatch.

  `av workflow run|resume|status|cancel` is now the canonical spelling. `av run <workflow>`
  keeps working for one release, warning on stderr so `--json` stdout is byte-identical, and
  stops working in 1.4.0. `av run <kit>/<skill>` is reserved for skill dispatch and refuses
  rather than being misrouted to a workflow that cannot exist.

  `av run resume|status|cancel` moved outright to `av workflow …` — dispatch grammar has no
  subcommands to collide with, so there was nothing to disambiguate and no second spelling
  worth keeping alive.

### Patch Changes

- e44b317: Widen `CURRENT_RELEASE_TAG` to accept prereleases so phase 11's beta channel can cut.

  `detect-release-source.mjs` gates candidate-build on `CURRENT_RELEASE_TAG.test(tag)`.
  The regex only accepted `X.Y.Z`, so `ariadnev@1.2.1-beta.0` failed as "not a release
  version" and the candidate-build + candidate-publish jobs skipped — no held draft
  was ever created for the beta cut. `STABLE_RELEASE_TAG` stays strict so
  previous-stable lock and "bare install selects stable" invariants are unchanged.

## 1.2.1-beta.0

### Patch Changes

- 2b83937: Open the beta release channel (phase 11 rehearsal).

  This changeset exists so the Version PR under changesets pre mode produces
  `ariadnev@X.Y.Z-beta.1` — a real, installable prerelease used to rehearse
  phase 4's directory rename on live installs before the stable cut.

  Contents of the beta:

  - `fix(release): resolve smoke binary path to absolute` — release smoke script
    now resolves the binary path against the workspace root instead of the caller
    CWD, so the smoke passes when the workflow invokes it from a sibling target
    directory.

  Opt-in only. Bare `curl … | bash` and bare `av update` continue to select the
  stable release. To install this beta:

      av update --to <printed-version>

  The signature-verifying update path covers this beta through the same key and
  the same finalize step as stable — no unsigned-but-accepted path is introduced.

## 1.2.0

### Minor Changes

- 5725529: `ariadnev doctor` now reports a non-empty unprefixed skill directory only when
  the current receipt recorded that legacy path and its `av-*` replacement exists.
  This makes interrupted or incomplete prefix heals actionable without reporting
  third-party skills that share a canonical name.

  All shipped skills now meet the authoring bar directly; the retired skill-lint
  exemption ledger can no longer suppress validation failures.

- 00797ee: Authenticate the update channel, and stop `backups restore` trusting its manifest.

  **`ariadnev update` now verifies an Ed25519 signature before it trusts any hash.**
  The binary and `checksums.txt` come from the same origin, so the checksum only
  ever proved the two halves agreed with each other — a forged pair agrees with
  itself. Releases carry a `checksums.txt.sig` signed by a key held offline by the
  maintainer and verified against a public key compiled into the binary. The
  signature covers the version as well as the checksums, so a genuinely signed
  older release cannot be replayed as a newer one.

  Two consequences worth knowing:

  - **`ariadnev update --to <version>` no longer works for any release published
    before signing.** GitHub releases are immutable, so those releases can never
    gain a signature. Rolling back past that point means re-running the installer.
  - **`ARIADNEV_BASE_URL` may now redirect `ariadnev update`**, because an origin
    that cannot produce the maintainer's signature cannot install anything. It is
    https-only, and https is enforced across redirects rather than only on the
    first request.

  **`ariadnev backups restore` refused a class of manifest it used to obey.** It
  copied files to an absolute path read straight out of `manifest.json`, which for
  project scope lives inside the repository you cloned. A hostile manifest could
  name any path — a git hook, a shell profile, `~/.ssh/authorized_keys` — and
  restore would write it. Restore now accepts only paths ariadnev actually
  installs, validates every entry before writing the first one, and rejects a
  manifest that does not parse instead of reporting it as "no manifest".

  **`ariadnev doctor` reports whether this binary can verify a signature at all.**
  Without it, a platform where Ed25519 is unavailable and a correctly fail-closed
  one look identical: both refuse every update.

## 1.1.0

### Minor Changes

- 16d7416: Close the capability gaps against the upstream kit, clear the inherited
  reference debt, and make the eval coverage claim true.

  **Two new skills.** `av:av` documents the `av` CLI itself — nothing in the kit
  did, so an agent operating this control plane had to guess. It is written from
  live `--help` output across every command and points at `av <cmd> --help` as the
  authority rather than duplicating flag tables. `av:plan-i18n` adds the bilingual
  Vietnamese/English switch for `plan.html`, re-scoped to that artifact alone and
  deferring the planning workflow to `av:plan`; upstream's instructions for
  subcommands `av` does not have were deleted rather than guessed at.

  **`av update --to <version>`.** Update could only move forward to latest, so a
  user who hit a regression had no way back except re-running the installer by
  hand. `--to` installs one exact release through the edge's pinned selectors,
  with the version validated before it reaches a URL and checksum verification
  mandatory — a downgrade is exactly when a bad binary is hardest to spot.

  **`av validate --strict`.** 89 reference files were on disk that no `SKILL.md`
  mentioned; most were navigation lists written with bare filenames the integrity
  checker never matched. Each was read and then linked, indexed with a stated
  purpose, or deleted. With the backlog at zero, `--strict` promotes orphan and
  dangling findings to errors and CI runs it.

  **Eval coverage that enforces itself.** The suite documented full skill coverage
  while 77 of 103 skills had no scenario. There are now 105, authored by
  confusable cluster so that a negative case names a skill a model would plausibly
  have picked, and the coverage tests read `kit/skills/` at runtime so the claim
  cannot drift again. The evidence vocabulary grows from 27 ids to 40.

  No behavior changes for existing installs beyond the new skills and the new
  flags; `av update` with no flags is unchanged.

## 1.0.0

### Major Changes

- Rename the whole product to **ariadnev** (short alias `av`) and cut 1.0.0.

  Every identifier moves: the binary and package name, the `ARIADNEV_*` env prefix,
  the `av:`/`av-` skill and agent namespaces, the `~/.ariadnev` and `.ariadnev/`
  state directories, the `~/.cache/ariadnev` cache, the `.claude/hooks/av/` hook
  directory, the `ariadnev@X` release tag grammar, the `ariadnev-{os}-{arch}`
  asset names, and the base URL, now `ariadnev.com`. A CI gate
  (`check-brand-drift.mjs`) fails the build if an old identifier reappears outside
  an explicit historical-record allowlist.

  **Breaking — installs made before the rename are not adopted.** Files written
  under the old name into `.claude/`, `.codex/`, and `.cursor/`, plus
  `~/.vcskill/` and `~/.cache/vcskill/`, are not recognized and will not be
  removed by `ariadnev uninstall`. Delete them by hand; a fresh
  `ariadnev install` writes a clean tree beside them.

  Two readers stay backward compatible, because both touch data that already
  exists on the user's disk:

  - An AGENTS.md managed block written with the old markers is replaced rather
    than duplicated, and is still stripped on uninstall.
  - A schema-1 receipt is still readable, so doctor and uninstall keep working
    against it.

  The release pipeline resolves a previous stable release across the rename, so
  1.0.0 correctly sees the last pre-rename release as its predecessor instead of
  reporting no history at all.

- The kit is now the full upstream corpus, and the CLI grew the surfaces it needs.

  **Content.** 101 ported skills beside the two this repo owns, 16 agents under
  their upstream names, 10 rules, 14 hooks across 8 events, and a statusline.
  Ported artifacts are marked as such and judged by validity rather than by this
  project's authoring style — see ADR 0008.

  **Configuration.** `~/.ariadnev/config.json` and a project file, with a
  permission split: a project may set workspace-shaped keys, never the ones that
  protect the user (privacy blocking, trust, script execution policy, notification
  destinations, per-hook switches). `ariadnev config prefs resolve` shows what took
  effect and what was rejected; a configured destination prints as `<redacted>`.

  **New commands.** `plan use|show`, `kit install-path|refresh`,
  `mcp list|show|add|remove|verify` (verify starts each server and checks the MCP
  initialize handshake), `adapters regenerate`. Commands added from here on use one
  exit-code table; `doctor` and the other pre-existing commands keep theirs,
  because CI gates on them.

  **Fixes.** Uninstall hashed files as utf8, so every binary looked user-modified
  and was preserved — a full uninstall left 55 fonts and images behind. Hooks
  resolved their shared library and the provider config dir by hard-coded relative
  paths that are wrong in this layout, which silently disabled the scout guard.
  Hook bindings now install in a declared order rather than alphabetically.

  **Breaking.** Agents are renamed to their upstream names (`av-reviewer` →
  `code-reviewer`, `av-developer` → `fullstack-developer`, `av-explore` →
  `explore`, and so on). State from before the rename is not migrated; see
  `docs/migration-from-the-old-name.md`.

### Minor Changes

- Skill Python environments are now real: declared, locked, and installable.

  Every skill that ships Python states what it needs. The 17 that import only the
  standard library say so; the five that do not — `cti-expert`, `design`,
  `document-skills`, `excalidraw`, `mcp-builder` — carry a pinned,
  hash-verified `ariadnev-lock.json` generated once by
  `scripts/generate-skill-lock.ts` and replayed by `ariadnev skill install` with
  `--require-hashes --no-deps`. `ariadnev skill verify` reports `ok` for all 22,
  and `--deep` imports the packages in a child process.

  **Locks are universal.** One file covers every platform and interpreter,
  carrying PEP 508 markers. This is not a refinement: `mcp` resolves
  `pywin32 ; sys_platform == 'win32'`, and a lock that drops the marker asks pip
  for a Windows-only distribution on macOS, which fails and takes the whole
  environment with it. The same evaluator decides what pip installs and what
  `verify` requires, so a marker-excluded package is not reported missing.

  Fixes found by running it:

  - `--deep` derived import names by replacing hyphens with underscores, which is
    wrong for `python-docx` (`docx`), `pillow` (`PIL`) and `scikit-learn`
    (`sklearn`). Module names now come from each package's `RECORD`.
  - A `requirements.txt` under `tests/` was read as a runtime declaration, so
    `databases` was reported as needing an environment for `mongomock` — a mock
    library no script imports. The directory a file sits in now says what it is.
  - The thorough check required every path in `RECORD`, including the `.pyc`
    files Python discards and regenerates, so an interpreter upgrade would have
    reported every package as corrupt.
  - `ariadnev skill install` answered "no runtime dependencies — nothing to
    install" for a skill that plainly had some but no lock. It now names the
    generator.
  - The deep-import timeout was 30s, which a first import of numpy, scipy and
    scikit-learn exceeds on a cold install and clears in under 3s afterwards. It
    bounds a hang, so it is now 120s.

  `ariadnev skill install` reports the size of what it built and warns past 400 MB
  per environment; `verify` reports the total and warns past 1.5 GB. All five
  together are 659 MB.

- 35acc7d: CLI "xịn" program — a branded terminal UI plus six capability upgrades
  (brainstorm → plan → 4-reviewer red-team → TDD build):

  - **Branded terminal UI + `av` short alias.** Output is colored/branded on a TTY
    and plain when piped/CI/`NO_COLOR`, cohesive with the ariadnev.com landing
    page (coral wordmark, `✓/skip/◆` glyphs). `contract` renders a terminal matrix
    grid on a TTY. The installer links a guarded `av` alias (never clobbers an
    existing `av`; `ARIADNEV_ALIAS=off` to skip).
  - **`ariadnev doctor` scored audit.** A 0–100 health bar, per-check tri-state
    (pass/skip/warning/fail), and an exact remediation command per finding. The
    score is informational only — the exit-code contract is unchanged.
  - **Credential sanitizer + `SECURITY.md`.** GitHub/OpenAI token shapes, URL
    userinfo, and secret-shaped env values are redacted from all output at a single
    boundary (empty/short values never shred output).
  - **`ariadnev eval`.** Cost-tiered skill-quality gate: tier-1 static (free, always)
    - tier-3 LLM judge when `ARIADNEV_EVAL_CMD` is set.
  - **`contract --json` machine envelope** (`protocol_version`, `capabilities[]`,
    schema range; legacy `version` preserved) + CI now runs the `.mjs`/`.cjs` test
    suites.
  - **`ariadnev query`.** A local, append-only JSONL history (`~/.ariadnev/history.jsonl`)
    of installs, doctor runs, and updates; recording is best-effort and
    allowlist-scrubbed (no free-form/secret data persisted).
  - **Anonymous, opt-out telemetry** facility (`ariadnev telemetry status`) — stateless,
    categorical-only, and off by default (nothing is transmitted until an endpoint
    is configured). Opt out with `ARIADNEV_TELEMETRY_DISABLED=1` / `DO_NOT_TRACK=1`.

### Patch Changes

- 335399f: Publish a deterministic public docs bundle with matching manifest/schema sidecars and release checksums. Retain independently attested candidate artifacts, and hold drafts for protected immutable/latest finalization.

## 0.12.0

### Minor Changes

- Initial published kit surface with 26 skills, decisions ledger, and anchor
  verification. Ships the graph-native local execution harness with versioned
  workflow contracts, static graph linting, event-sourced checkpoints, safe
  resume/cancel lifecycle, and provider-neutral Codex and Claude Code adapters.
  The first public execution surface is read-only; workspace-changing execution
  remains policy-denied until a public approval and side-effect adapter exists.

  Ships behavioral and performance gates for the full skill catalog and 14
  golden tasks, recovery/idempotency cases, cross-runtime conformance, and a
  benchmark-proven deterministic artifact context graph. Paused runs fail
  closed after incompatible graph or runner upgrades and remain inspectable
  and cancellable.

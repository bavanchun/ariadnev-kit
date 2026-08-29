# Provider observation: `omp`, `grok`, `dsh`

Recorded 2026-08-28 on darwin 25.6.0 (arm64), before any code was written.
This report is what `spec-verified.ts` cites. A cell that is not justified here
cannot be `verified: true`.

## The ladder this report is measured against

`spec-verified.ts` exists to prevent self-certification — *"installed it, seems
fine" is not an observation*. Two levels are available to this phase:

- **`observed`** — the provider was run and **seen to load the artifact**.
- **`convention`** — a documented or neutral layout, working elsewhere, but not
  watched loading here.

The distinction is the whole point, so it is applied strictly below, including
where that produces a weaker answer than the plan expected.

## Summary

| Provider | Binary | Home | Evidence reached |
|---|---|---|---|
| `omp` | `omp/18.0.4` at `/opt/homebrew/bin/omp` | `~/.omp/` populated | **`convention`** — not `observed` |
| `grok` | not on PATH | `~/.grok/` populated | **`convention`** |
| `dsh` | not found | no `~/.dsh` | **`none`** |

## `omp` — a binary, and still only `convention`

The plan expected `omp` cells to reach `observed`, on the reasoning that a
binary is present so a load check is possible. A load check was attempted and
**did not succeed**, so the cells stay at `convention`.

### What was tried

`omp` exposes an internal URI resolver, `omp read skill://<name>`, which looked
like a local load check — it asks omp's own code to resolve a skill by name,
with no model call. A probe skill was written in the documented layout:

```
~/.omp/agent/skills/ariadnev-load-probe/SKILL.md   → Unknown skill. Available: none
~/.agents/skills/ariadnev-load-probe/SKILL.md      → Unknown skill. Available: none
```

Both were rejected with `Available: none`, while `omp config list --json`
confirms discovery is switched on:

```
skills.enabled          = True
skills.enableClaudeUser = True
skills.enablePiUser     = True
skills.enableAgentsUser = True
```

Discovery being enabled while `skill://` reports *none* means **`omp read
skill://` does not run the discovery pipeline** — it resolves against a
per-session registry that is empty outside a session. So it is not a load check,
and a cell justified by it would be justified by nothing.

### Why the attempt stopped there

The remaining way to observe a load is `omp --print`, which sends a prompt to a
model provider. That is a billable third-party call on the user's account, made
to satisfy a verification step. It was not run. **A cell that would require
spending someone's API credits to verify is a cell that stays at `convention`**
until a maintainer with that context decides otherwise.

### What *is* established, and it is more than a directory listing

`omp read omp://skills.md` returns the provider's own runtime documentation —
omp describing its own loader, from the installed binary. That is vendor
specification rather than a guess:

- Skills are discovered **one level under `skills/`**: `<root>/skills/<name>/SKILL.md`.
  Nested paths are explicitly *not* discovered by provider loaders.
- `description` is **required** for native discovery (`requireDescription: true`).
- Provider precedence is priority-first: `native` (100), `omp-plugins` (90),
  `claude` (80), then `claude-plugins`/`agents`/`codex` (70), `opencode` (55),
  `github` (30), `omp-managed` (5). Dedup key is the skill name, first wins.
- **"The `agents` provider (`.agent[s]/skills`) is the canonical OMP-native
  location"**, with its own `enableAgentsUser`/`enableAgentsProject` toggles.

That is enough to place a path with confidence. It is not enough to call it
`observed`.

## The plan's `omp` path is wrong, and this is the trap it warned about

The phase document says:

> `omp`'s artifacts live under `~/.omp/**agent/**`, not `~/.omp/`. A constant
> written one level too high installs into a directory the tool ignores.

The instinct was right and the conclusion was inverted. Per omp's own docs:

- `~/.omp/agent` is `PI_CODING_AGENT_DIR`, the **session storage** directory —
  it appears in the environment-variable list as such.
- The only `~/.omp/agent/*` path named as a skills source is
  `~/.omp/agent/managed-skills`, belonging to the `omp-managed` provider at
  priority **5** — the auto-learn bucket that always defers to an authored skill.
- The canonical native location is `.agent[s]/skills`.

`~/.omp/agent/skills` is populated on this machine (105 `ak-*` skills) because
the upstream CLI wrote them there. **That is a directory listing, and it proves
only that something wrote there — which is exactly the confusion the ladder
exists to catch.** It is not named as a provider path in omp's documentation.

So the target for `omp` is `~/.agents/skills/<name>/SKILL.md`, not
`~/.omp/agent/skills/`. Both directories exist here and both are populated, so a
listing could have "confirmed" either one.

## `grok` — files, no binary

`~/.grok/` holds `{agents,hooks,rules,skills}` in a Claude-shaped layout, with
real `ak-*` skills present. No `grok` binary is on PATH, so nothing can be run
and nothing can be watched loading. `convention` is the correct level and the
honest one.

## `dsh` — nothing

No binary on PATH, no `~/.dsh`, and absent from the upstream CLI's own adapters
directory. Nothing to observe, nothing to place. Its cells are `none`, the
installer skips it and logs, and the README says so.

`spec-verified.ts` treats skip-and-log as correct behaviour. Shipping a guessed
path would be the failure — it would put an installer to work writing into a
location nobody has confirmed exists.

## Cleanup

Both probe skills were removed from the user's provider homes after the check:

```
removed: ~/.omp/agent/skills/ariadnev-load-probe
removed: ~/.agents/skills/ariadnev-load-probe
```

## Open question for the maintainer

**Should `omp` cells be promoted to `observed` by running `omp --print` once?**
That is the only remaining route, and it costs a real model call on the
maintainer's account. Until then the cells are `convention`, which under this
project's own rules means the installer still writes them — the level affects
what is *claimed*, not what is *installed*.

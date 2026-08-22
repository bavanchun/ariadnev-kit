---
phase: 0
title: "Installer checksum pin"
status: completed
priority: P1
effort: "2-3h"
dependencies: []
---

# Phase 0: Installer checksum pin

## Overview

Close a live remote-code-execution path in the shipped installers. Phase 0
because it depends on nothing, blocks nothing, needs no release, and every day it
waits is a day of exposure.

Split out of phase 5 so it is not coupled to key generation and signing.

## The vulnerability

```sh
# install.sh:10
BASE="${ARIADNEV_BASE_URL:-https://ariadnev.com}"
# install.sh:36-37
curl -fsSL "${BASE}/download/${asset}"       -o "${tmp}/${asset}"
curl -fsSL "${BASE}/download/checksums.txt"  -o "${tmp}/checksums.txt"
# install.sh:39
# --- verify sha256 (fail closed) ---
```

Both the binary and the file it is checked against come from `$BASE`, and `$BASE`
is attacker-controllable through one environment variable. The check compares an
attacker's binary against the attacker's own checksums, then installs the result
to `~/.local/bin`. `install.ps1:8,16` is the same shape.

Delivery does not require write access to the user's home directory: a `Makefile`,
`devcontainer.json`, a CI env block, `direnv`'s `.envrc`, or a prompt-injected
agent running `export ARIADNEV_BASE_URL=… ; curl … | bash`. This kit exists to be
driven by agents that run shell commands.

Four red-team reviewers were pointed at `update-command.ts` and none looked one
directory up. An earlier draft of phase 5 cited `install.sh:10` as a *naming
precedent* to copy.

## Architecture

### Pin the checksums, not the binary

`ARIADNEV_BASE_URL` has exactly two consumers — `install.sh:10` and
`install.ps1:8` — and one documented legitimate use: pointing at a local or
staging host to test (`plans/260814-1829-agentkit-full-port/plan.md:280`). A hard
pin would break that, so the design keeps it working behind an explicit opt-in.

**Default behavior after this phase:**

| Fetch | Origin |
|---|---|
| binary | `$BASE` — an override still works, so mirrors and local hosts serve binaries |
| `checksums.txt` | **the hardcoded domain, always** |

A drive-by override can therefore serve any binary it likes; the hash will be
compared against the canonical checksums and the install aborts. The env var
loses its power to self-authenticate, which is the whole vulnerability.

**Deliberate full override**, for staging or offline testing, requires a second
variable that nobody sets by accident:

```sh
ARIADNEV_BASE_URL=https://staging.ariadnev.com \
ARIADNEV_ALLOW_UNVERIFIED_BASE=1 \
  bash install.sh
```

When set, checksums come from `$BASE` too, and the installer prints a loud
warning naming the host and stating that the checksum cannot authenticate the
binary. Unset (the normal case), the pin holds.

Two variables rather than one because they express different intents: "fetch from
elsewhere" is routine, "and trust that elsewhere" is not.

### Why this deploys without a release

`ariadnev.com/install` is served by the edge Worker, which reads `install.sh`
from the GitHub repo through an authenticated GitHub App
(`workers/edge/src/index.js` → GitHub contents API). Merging to `main` changes
what the endpoint serves. No binary, no tag, no `finalize-release.yml`.

`av update` is **not** in scope here — it has the same flaw and is fixed properly
in phase 5, behind a signature. This phase does not touch it.

## Related Code Files

- Modify: `install.sh` (checksum fetch origin + opt-in + warning)
- Modify: `install.ps1` (same)
- Modify: `README.md` (document `ARIADNEV_ALLOW_UNVERIFIED_BASE`)
- Create: a shell-level test or CI step exercising the three cases below

## Implementation Steps

1. `install.sh`: introduce `DEFAULT_BASE` as the literal domain; keep
   `BASE="${ARIADNEV_BASE_URL:-$DEFAULT_BASE}"` for the asset; fetch
   `checksums.txt` from `$DEFAULT_BASE` unless `ARIADNEV_ALLOW_UNVERIFIED_BASE=1`.
2. When `$BASE != $DEFAULT_BASE` and the opt-in is absent, print one line naming
   the host and the fact that checksums come from the canonical domain. Not an
   error — the install proceeds and will simply fail the hash if the binary is
   not genuine.
3. When the opt-in **is** set, print a warning that the checksum cannot
   authenticate the binary.
4. Mirror all of it in `install.ps1`.
5. Document both variables in `README.md` next to the existing
   `ARIADNEV_INSTALL_DIR` / `ARIADNEV_ALIAS` notes.
6. Add the three test cases below.
7. Merge. Verify `curl -fsSL https://ariadnev.com/install | head -20` serves the
   new script.

## Success Criteria

- [x] `ARIADNEV_BASE_URL=http://evil` + a matching malicious `checksums.txt` on
      that host → **install aborts on checksum mismatch**, because checksums came
      from the canonical domain. The core proof.
- [x] `ARIADNEV_BASE_URL` unset → behavior byte-identical to today.
- [x] `ARIADNEV_BASE_URL=<staging> ARIADNEV_ALLOW_UNVERIFIED_BASE=1` → installs
      from staging and prints the warning. Local testing still works.
- [x] Same three cases pass for `install.ps1` — as far as they can be run off
      Windows. The abort paths are automated; a *completed* Windows install is
      still a manual check. See "What the ps1 suite does not cover".
- [x] `pnpm test` green: 1110 vitest + 95 node:test, 0 failures.

## Post-merge verification (open)

Deliberately not a success criterion: it cannot be met before the merge, and the
implementation is not waiting on it. **The live exposure stands until this passes.**

```
curl -fsSL https://ariadnev.com/install | head -20   # must show DEFAULT_BASE
```

If the edge still serves the old script, the "deploys on merge" assumption in
"Why this deploys without a release" is wrong and the fix needs a release path.

Test: `packages/cli/scripts/installer-checksum-pin.test.mjs`. It stands up local
HTTP origins and drives the real scripts, rewriting only the hardcoded canonical
domain — an assertion fails if that literal moves, which also pins the shipped
default to exactly `https://ariadnev.com`.

Both new guards were mutation-tested: reverting `|| true` kills only the missing
-checksum case, and loosening the opt-in predicate to `-n` kills only the `0`
case. Neither passes for free.

## What the ps1 suite does not cover

The ps1 cases run under `pwsh` when it is present (CI's `ubuntu-latest`) and skip
otherwise — `pwsh` is not installed on the maintainer's macOS box, so **the ps1
suite gets its first real execution in CI**, not locally. Only abort paths are
exercised: they terminate before `%LOCALAPPDATA%` and the user-`PATH` write, which
have no meaning off Windows. The happy path remains unverified by automation on
either machine.

## Defects found in review, beyond the planned change

Four, all fixed here. The first is the one that mattered.

1. **`install.sh` exited silently when the asset was missing from
   `checksums.txt`.** `expected="$(grep … | awk …)"` under `set -euo pipefail`
   dies on grep's exit 1 *at the assignment*, so the `[ -n "$expected" ] || err …`
   line below it was unreachable: exit 1, zero bytes of output. Pre-existing, but
   this phase is what made it reachable — before, the binary and `checksums.txt`
   always came from one origin and could not disagree about which assets exist.
   Now a mirror, a platform published ahead of the manifest, or the canonical
   domain returning HTTP 200 with a non-checksum body (`curl -f` does not catch
   that) all land here. Fixed with `|| true`; the message now also names the
   checksum origin.
2. **`install.ps1`'s warning was suppressible by the caller.** `irm … | iex` runs
   in the caller's session and inherits its preference variables; the script
   pinned `$ErrorActionPreference` but not `$WarningPreference`, so a profile with
   `SilentlyContinue` swallowed the only signal on the opt-out path. `install.sh`
   was never exposed — stderr needs an explicit redirect on the typed command.
   Pinned `$WarningPreference = "Continue"`.
3. **`install.ps1` failed open on a duplicated checksum line**, silently taking
   the first of several, and matched the asset name case-insensitively where the
   `grep` does not. Now requires exactly one `-cmatch` hit.
4. **The test inherited ambient `ARIADNEV_*`**, so a maintainer with one exported
   for staging work got a confusing red suite. Stripped. The mirror case also
   relied on `localhost` falling past `::1` to a `127.0.0.1` listener; it now uses
   a second real origin.

## Residual risk accepted

The opt-out is itself an environment variable, so anything that can set two vars
defeats it — the test asserts exactly that. This is not closable at this layer:
`export -f curl` and `PATH` both hijack the piped-to-bash installer outright,
independent of this script. What the pin buys is that
`ARIADNEV_BASE_URL=https://mirror.example` reads as routine in a reviewed
`.envrc` while `ARIADNEV_ALLOW_UNVERIFIED_BASE=1` reads as self-evidently wrong.
Moving the opt-out to an argv flag would additionally defeat `containerEnv`,
`.envrc`, and CI `env:` blocks, which cannot set argv of a typed command —
recorded here for phase 5, which revisits this surface with a signature.

## Risk Assessment

**Breaking the real install path.** This edits the script every new user runs, and
a syntax error there is a total outage of onboarding. *Signal:* `bash -n install.sh`
fails, or the success-criteria case 2 diverges from today's behavior. *Pre-decided
response:* `bash -n` / `pwsh -NoProfile -Command "..."` syntax checks run before
merge, and case 2 asserts byte-identical default behavior. The rollback is a
one-commit revert that redeploys on merge.

**Breaking local/staging testing silently.** *Signal:* a maintainer's staging
install starts failing on checksum mismatch with no explanation. *Response:* step
2's message names the canonical domain explicitly, so the cause is legible from
the output rather than requiring a read of the script.

**Assumption:** the edge serves `install.sh` from the repo's `main`, so merging
deploys. Verified against `workers/edge/src/index.js`'s GitHub-contents route in
the earlier audit. *If wrong:* the change still ships with the next release, and
step 7 catches the discrepancy before it is assumed done.

# Pinning the installer checksums

2026-08-22 · phase 0 of `260822-1407-ariadnev-kit-correctness-and-operational-hardening`

## What was wrong

`install.sh` and `install.ps1` fetched the binary **and** `checksums.txt` from
`${ARIADNEV_BASE_URL:-https://ariadnev.com}`. One environment variable moved both
sides of the comparison to the same host, so the line commented "verify sha256
(fail closed)" checked an attacker's binary against the attacker's own hash and
then installed it. Live, shipped, on a tool whose whole premise is that agents run
shell commands on your behalf.

The route to it is embarrassing. Four red-team reviewers were pointed at
`update-command.ts` and found this exact shape in the *planned* update channel.
None of them looked one directory up at the installer that was already deployed.
An earlier draft of phase 5 cited `install.sh:10` as a naming precedent to copy —
we read the vulnerable line, admired it, and moved on. kongming found it later
only because it was given the whole repo instead of a file list.

## The fix

Pin the checksums, not the binary. `DEFAULT_BASE` is a literal no env var can
reach; `BASE` still honors the override so mirrors and local hosts keep working;
`CHECKSUM_BASE` derives from `DEFAULT_BASE` unless
`ARIADNEV_ALLOW_UNVERIFIED_BASE=1`. Two variables because they mean different
things: "fetch from elsewhere" is routine, "and trust that elsewhere" is not.

A hard pin was the obvious move and would have broken the documented local-testing
path, so the override survives — stripped of its power to self-authenticate.

## Two things that cost time

**The test deadlocked.** The HTTP origins live in the test process, so
`execFileSync` blocked the event loop and curl waited forever for a server that
could not answer. Obvious in hindsight; twelve minutes of a hung 120s timeout
before it was.

**A subagent's report needed adjudicating, not accepting.** The reviewer's High
finding was real and I could not have found it by reading: under `set -euo
pipefail`, `expected="$(grep … | awk …)"` dies *at the assignment* on grep's exit
1, so the `[ -n "$expected" ] || err …` beneath it never ran — exit 1, zero bytes
of output. Pre-existing, but this change is what made it reachable, because two
origins can now disagree about which assets exist. Reproduced it in nine lines
before touching anything.

The same report also flagged that `install.ps1`'s warning was suppressible by the
caller's `$WarningPreference` (`irm | iex` inherits the session), and that its
checksum lookup failed *open* on duplicate lines where the `grep` fails closed.
Both real. That is three defects found by reading a file I had already reviewed
myself — worth remembering the next time a review feels like a formality.

## What is not covered

`pwsh` is not installed on this machine, so `install.ps1` could not be executed
locally at all. Rather than claim verification, the ps1 cases are written to skip
when `pwsh` is absent and will get their first real run in CI on `ubuntu-latest`.
Only the abort paths are automated — they terminate before `%LOCALAPPDATA%` and
the user-`PATH` write, which mean nothing off Windows. A completed Windows install
remains a manual check.

The opt-out is itself an environment variable, and the test asserts exactly that:
two vars still install a trojan. Not closable here — `export -f curl` and `PATH`
hijack a piped-to-bash installer outright regardless. What the pin buys is that
`ARIADNEV_BASE_URL=https://mirror.example` reads as routine in a reviewed `.envrc`
while `ARIADNEV_ALLOW_UNVERIFIED_BASE=1` reads as self-evidently wrong. An argv
flag would be strictly better; noted for phase 5.

## Not done

Nothing is merged, so the exposure is still live. The edge Worker serves
`install.sh` by reading it from the repo, so the merge itself is the deploy —
`curl -fsSL https://ariadnev.com/install | head -20` afterward is the only
remaining check.

`av update` has the identical flaw and was deliberately left alone; phase 5 fixes
it behind a signature rather than a pin.

One unrelated thing was fixed in passing, on the user's call: `install.ps1` had
been installing the short alias as `vc.exe` since the rename off vcskill, so
Windows users got an alias no documentation mentions while `install.sh` created
`av`. Its comment also claimed a never-clobber guard the `-Force` copy did not
implement — but the guard belongs in `install.sh`, not here: `~/.local/bin` is
shared with every other tool, `%LOCALAPPDATA%\Programs\ariadnev` is ours and was
created three lines earlier. The comment was wrong, not the code.

---
phase: 4
title: "install.sh + install.ps1 + brew formula + update GH-Releases + README"
status: pending
priority: P1
effort: "4h"
dependencies: [3]
---

# Phase 4: Install scripts, brew, update re-point, README

## Overview

The user-facing install surface: a `curl | bash` script, a PowerShell script, a
Homebrew formula, `vcskill update` re-pointed to GitHub Releases, and a README
that headlines the new install methods.

## Requirements

- `install.sh` (POSIX): detect OS (`uname -s`) + arch (`uname -m`, map
  `arm64/aarch64`, `x86_64`) → pick `vcskill-<os>-<arch>` → download from the
  **latest** GitHub Release → download `checksums.txt` → **verify sha256** →
  `chmod +x` → install to `~/.local/bin/vcskill` (create + PATH hint if missing)
  → print version. Fail closed on checksum mismatch or unknown platform.
- `install.ps1`: same flow for Windows → `%LOCALAPPDATA%\Programs\vcskill\vcskill.exe`,
  add to user PATH.
- `Formula/vcskill.rb` (Homebrew): for a `bavanchun/homebrew-vcskill` tap —
  downloads the darwin binary + sha256, installs to `bin`. Support both arm64/x64.
- `vcskill update`: replace the npm-registry check with the GitHub Releases API
  (`/repos/bavanchun/vcskill/releases/latest`, compare tag → current version).
  Keep offline-safe (injected fetch, timeout, null → "could not check").
- README: replace the npm/npx section with **curl / PowerShell / brew** as the
  headline install; keep a "build from source" note; add a macOS unsigned-binary
  Gatekeeper note; document `install.sh` env overrides (version pin, install dir).

## Related Code Files

- Create: `install.sh`, `install.ps1`, `Formula/vcskill.rb` (repo root or `packaging/`)
- Modify: `packages/cli/src/cli/update-command.ts` (+ test) → GH Releases source
- Modify: `README.md`, `docs/release-and-publish-guide.md` (rewrite for binary flow)
- Create: changeset (minor) — the distribution change

## Implementation Steps

1. **TDD** `update-command`: stub the GH Releases fetch → newer/equal/offline
   cases (red → green); keep the offline-safe contract.
2. Write `install.sh` (shellcheck-clean) + `install.ps1`; test `install.sh`
   locally against a real Release asset (or the checksums flow with a fixture).
3. Generate `Formula/vcskill.rb` (templated with version + sha256 placeholders
   the release fills, or a small updater).
4. Rewrite README install section + docs; add Gatekeeper + env-override notes.
5. `pnpm test` green; run `bash -n install.sh` / PSScriptAnalyzer if available;
   changeset.

## Success Criteria

- [ ] `install.sh` detects platform, downloads, **verifies sha256**, installs to PATH; fails closed on mismatch/unknown platform (`bash -n` clean; live test against a Release asset)
- [ ] `install.ps1` mirrors it for Windows
- [ ] `Formula/vcskill.rb` present; `brew install bavanchun/vcskill/vcskill` documented (tap repo = user's manual step)
- [ ] `vcskill update` checks GitHub Releases, offline-safe, tested
- [ ] README headlines curl/brew/ps1; no stale `npx` as the primary path; Gatekeeper note present
- [ ] `pnpm test` green; changeset added

## Risk Assessment

- `curl | bash` security — mitigated by mandatory sha256 verification from the
  release `checksums.txt`; document minisign/cosign as a future hardening.
- macOS Gatekeeper blocks unsigned binaries → README note + `xattr -d
  com.apple.quarantine` hint; notarization deferred (out of scope).
- Windows PATH mutation via ps1 needs care — scope to user PATH, print a re-open-
  shell hint; verify in CI where possible.

## Stop Conditions

- Never ship `install.sh` without sha256 verification — if the release lacks
  `checksums.txt` (phase 3 gap), STOP and fix phase 3 first.

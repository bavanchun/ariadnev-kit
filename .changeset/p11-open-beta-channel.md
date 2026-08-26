---
"ariadnev": patch
---

Open the beta release channel (phase 11 rehearsal).

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

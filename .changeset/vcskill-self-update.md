---
"vcskill": minor
---

`vcskill update` now **self-updates** the binary in place — download the latest
release for your platform, verify its sha256, and atomically replace the running
binary. No need to re-run the curl installer.

- `vcskill update` — upgrade to the latest release (fail-closed on checksum
  mismatch; never replaces on a bad download).
- `vcskill update --check` — only report whether a newer version exists (the old
  behavior).
- When run via `node` (not the compiled binary) it guides you to the curl
  installer instead of replacing `node`.

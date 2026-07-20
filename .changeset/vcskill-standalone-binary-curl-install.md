---
"vcskill": minor
---

vcskill now ships as a **standalone binary** installed via `curl | bash` — no
Node runtime required. npm publishing is dropped.

- **Install** with one line: `curl -fsSL …/install.sh | bash` (macOS/Linux),
  `irm …/install.ps1 | iex` (Windows), or `brew install bavanchun/vcskill/vcskill`.
  Each installer verifies the binary's sha256 before installing.
- The kit is **embedded** in the binary and self-extracts to a version-stamped
  cache on first run, so the single file is fully self-contained.
- Releases now publish 5 cross-compiled binaries (darwin arm64/x64, linux
  x64/arm64, windows x64) + `checksums.txt` to a GitHub Release; the package is
  private and no longer published to npm.
- `vcskill update` checks GitHub Releases (was npm) and points at the curl
  installer for upgrades.

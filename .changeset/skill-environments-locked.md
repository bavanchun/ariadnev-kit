---
"@ariadnev/cli": minor
---

Skill Python environments are now real: declared, locked, and installable.

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

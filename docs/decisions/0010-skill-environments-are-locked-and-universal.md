# 0010 — Skill environments are locked once, universally

- Status: accepted
- Date: 2026-08-15

## Context

Five of the 22 skills that ship Python import packages from PyPI: `cti-expert`,
`design`, `document-skills`, `excalidraw`, `mcp-builder`. The other 17 import
only the standard library and need no environment at all.

The source declares those five as ranges — `scrapling>=0.2`,
`whoisdomain>=1.20260326`. A range cannot be hash-verified: two installs a week
apart resolve to different package sets while the declaration never changes.
Phase 7 therefore built the lock format, the environment manager and the
verifier, but could not produce a real lock, because the content those skills
consist of had not been ported yet. Five criteria stayed open behind that.

## Decision

Resolve once, universally, and commit the result.

- A maintainer runs `generate-skill-lock.ts <skill>`, which resolves with
  `uv pip compile --generate-hashes --universal --python-version 3.10` and
  writes `ariadnev-lock.json` beside the declaration it resolved.
- `ariadnev skill install` replays that lock with `--require-hashes --no-deps`
  and nothing else. It refuses a skill that declares packages but has no lock,
  naming the generator rather than pretending there is nothing to do.
- The lock is one file for every platform and interpreter. PEP 508 markers are
  part of a locked package, and the same evaluator decides both what pip
  installs and what `verify` requires to be present.

3.10 is the floor the source skills state ("Python 3.10+ required"); resolving
at the floor keeps the lock installable on the oldest interpreter they claim to
support, and `--universal` keeps it installable on newer ones.

## Why universal, and why markers are not optional

Resolving for this machine would have been simpler. It also produces a lock
that installs on this machine and nowhere else, committed into a kit whose whole
purpose is to be installed somewhere else.

Markers are not decoration either. `mcp` resolves `pywin32 ; sys_platform ==
'win32'`. Drop the marker and pip is asked to install a Windows-only
distribution on macOS; there is no such artifact, so the command fails and the
environment never builds. The first lock written without markers was
uninstallable on the machine that wrote it.

The same reasoning runs the other way at verification time: a package a marker
excludes is *supposed* to be absent, and requiring it would report every
healthy non-Windows environment as corrupt. So `verify` evaluates markers
against the environment's own interpreter, read from its `pyvenv.cfg` — no
Python is executed to answer a status question.

A universal resolution also locks one name more than once: `numpy` resolves to
2.2.6, 2.4.6 and 2.5.2 across interpreter ranges. The lock accepts that when
the markers are disjoint and refuses it when they are not.

## Consequences

- `ariadnev skill verify` reports `ok` for all 22 Python skills; the five with
  environments verify `--deep` too, importing the packages in a child process.
- Import names are read from each package's `RECORD`, not derived from its
  distribution name: `python-docx` imports as `docx`, `pillow` as `PIL`,
  `scikit-learn` as `sklearn`. The obvious hyphens-to-underscores shortcut gets
  all three wrong and would have failed every healthy environment.
- Environments cost 659 MB for all five, the largest being `design` at 246 MB.
  Budgets are set above that (400 MB per environment, 1.5 GB total) and warn
  rather than block — the point is to catch a resolution that went somewhere
  unexpected, not to complain that a scientific stack is large.
- Refreshing a lock is a deliberate act with a diff to review. Nothing resolves
  on a user's machine, so no install can quietly acquire a package nobody vetted.
- `generate-skill-lock.ts --all --check` re-resolves and fails when a committed
  lock no longer matches. It needs the network, so it is a maintainer's check,
  not a CI gate.

---
"ariadnev": patch
---

Fixed a data-integrity bug that froze files when two providers share a
destination root. `.agents/skills` is written by cursor, antigravity, omp, dsh
and generic — and by codex under global scope — but the adapt engine produces
provider-dependent content, so those providers write different bytes to the same
path and the last one wins on disk. The receipt recorded each provider's
*intended* bytes, so every earlier writer's record described content that was no
longer there; the next install read that as "modified since install" and refused
to touch the file for every provider, permanently, until someone passed
`--force`.

Measured on a real machine: codex and cursor shared 1485 paths, 42 of which had
divergent records, and a second install reported 84 files as user-edited that
the user had never touched.

The receipt now records the bytes actually left on disk, and the install report
names the overlap — which providers share which files, and whose adaptation won
— instead of leaving it to be discovered as a behavioural oddity.

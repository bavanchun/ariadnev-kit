---
"ariadnev": minor
---

Close the capability gaps against the upstream kit, clear the inherited
reference debt, and make the eval coverage claim true.

**Two new skills.** `av:av` documents the `av` CLI itself — nothing in the kit
did, so an agent operating this control plane had to guess. It is written from
live `--help` output across every command and points at `av <cmd> --help` as the
authority rather than duplicating flag tables. `av:plan-i18n` adds the bilingual
Vietnamese/English switch for `plan.html`, re-scoped to that artifact alone and
deferring the planning workflow to `av:plan`; upstream's instructions for
subcommands `av` does not have were deleted rather than guessed at.

**`av update --to <version>`.** Update could only move forward to latest, so a
user who hit a regression had no way back except re-running the installer by
hand. `--to` installs one exact release through the edge's pinned selectors,
with the version validated before it reaches a URL and checksum verification
mandatory — a downgrade is exactly when a bad binary is hardest to spot.

**`av validate --strict`.** 89 reference files were on disk that no `SKILL.md`
mentioned; most were navigation lists written with bare filenames the integrity
checker never matched. Each was read and then linked, indexed with a stated
purpose, or deleted. With the backlog at zero, `--strict` promotes orphan and
dangling findings to errors and CI runs it.

**Eval coverage that enforces itself.** The suite documented full skill coverage
while 77 of 103 skills had no scenario. There are now 105, authored by
confusable cluster so that a negative case names a skill a model would plausibly
have picked, and the coverage tests read `kit/skills/` at runtime so the claim
cannot drift again. The evidence vocabulary grows from 27 ids to 40.

No behavior changes for existing installs beyond the new skills and the new
flags; `av update` with no flags is unchanged.

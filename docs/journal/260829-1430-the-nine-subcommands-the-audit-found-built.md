# The nine subcommands the audit found, built

**Date**: 2026-08-29 14:30
**Component**: parity
**Status**: Resolved

## What happened

PR #101. The audit's `unbuilt` tally goes 9 to 0: plan create, add-phase,
kanban, parse, validate, migrate; mcp link; migrate prefs, rollback.

TWO OF THEM NEEDED A SUBJECT FOUND RATHER THAN INVENTED, and the rows I wrote
for them a day earlier were the obstacle. Both said, in effect, "upstream
migrates something ariadnev never wrote" — true of the literal subject and lazy
about the function. `plan migrate` imports into a plan store upstream has and
this does not, because here the files are the record; what is left to import is
LOCATION, a plan directory outside the configured root that list, use and
resolve will never find. `migrate prefs` imports a predecessor tool's config;
the ariadnev equivalent is the config a 0.x install left under the pre-rename
directory, still on disk and read by nothing. A divergence row that explains why
a command is absent is exactly the kind of writing that stops the next person
looking, including when the next person is me.

REUSING RESTORE PAID FOR ITSELF IMMEDIATELY. `migrate rollback` goes through
runBackupsRestore rather than writing a second restore path, so it inherits the
pre-restore safety copy, the digest verification, and the guard refusing to
write outside ariadnev's install surface. That guard fired against my first test
fixture — I had seeded a backup at `a/skill.md`, which nothing installs — and
three tests failed. The fixture was wrong, not the guard, and the failure is now
an assertion of its own: rollback cannot be a write-anywhere primitive. Writing
a second restore would have bought the same feature with none of that.

The ordering inside rollback is the same shape as watch's: clear the applied-key
ledger AFTER a successful restore, never before. Clearing first leaves the files
moved and the ledger saying they are not, so the next migrate moves them again
from a location that no longer holds them.

FOUR LINT FIXTURES HAD TO MOVE, and the reason is worth keeping. command-surface
and validate-command used `plan create` and `plan add-phase` as their example of
a phantom — a command kit prose references that this CLI lacks. Building them
made those tests fail, correctly. They now point at `plan publish`, which is
still absent, and the phantom list carries a comment: a name leaving it because
the command now exists is the list working; what it must never do is leave
because someone wanted the lint quiet. That is the same judgement call phase 12
faced with `config start`, decided the other way, and the difference is whether
the prose becomes true or merely stops being checked.

THE AUDIT'S OWN ASSERTION WAS INVERTED. It read toBeGreaterThan(0) so that no
summary could claim parity while nine gaps stood; it now reads toBe(0). Editing
that number is not what makes it honest — the pair of bidirectional checks
around it is. A new gap with no divergence row fails one, a row for a gap that
no longer exists fails the other, and neither can be satisfied by touching the
tally. The `unbuilt` kind stays in the union with zero rows so the next real gap
has a name to be filed under instead of being folded into `declined`.

Verified on the binary rather than only in tests: create then add-phase twice
then validate on the result, rows landing inside the table; exit 1 for an
invalid plan, 2 for the secrets refusal and a duplicate create, 3 for a missing
rollback backup; plan migrate dry-run then real, source emptied, collision
skipped without overwriting. One probe of mine was wrong before the code was —
a duplicate `plan create` a minute later is a different stamp and so a different
plan, which is the convention, not a defect.

Names and subcommands are both clean now: missing 0, and 13 differences that are
all difference-with-a-reason. Skill import and the 1.3.0 release remain blocked
on plan 260822-1407 phases 4 and 5.

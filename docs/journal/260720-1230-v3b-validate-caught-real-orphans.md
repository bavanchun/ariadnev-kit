# v3b: the validate command earned its keep on run one

**Date**: 2026-07-20 12:30
**Component**: packages/cli (validate), kit/skills (obsidian, predict), pm
**Status**: Resolved

## What happened

Built `vcskill validate` (loadKit lint + a new reference-integrity check). The
first live run against the real kit failed — three orphan references I hadn't
noticed: obsidian had two valuable-but-unlinked reference files, and predict
wrote a bare `references/risk-lanes.md` that actually meant cook's file. Also
surfaced a stale build artifact (`packages/cli/kit/`, a gitignored `prepack`
snapshot) that `resolveKitRoot` picked up before the repo kit.

## Root cause

Reference orphans are invisible to a human reading one SKILL.md at a time — you
see what's linked, not what exists unlinked. That's exactly why v3a's git orphan
survived manual review. The predict false-positive was mine: my first regex
matched any `references/x.md` in prose, including cross-skill mentions.

## What we tried / decided

Fixed the checker to ignore cross-skill `../other/references/x.md` (negative
lookbehind on the path separator), linked obsidian's real references, and
standardized predict's mention to the `../cook/references/` form. Deleted the
stale bundle so dev resolves the repo kit; `prepack` regenerates it for publish.
Then wired validate as a CI gate so this class of drift can't re-enter silently.

## Lesson

A lint you write to catch a bug you already fixed by hand should be run against
your own codebase immediately — if it's any good, it finds more of the same.
Validate found three orphans on its first run; that's the ROI. And a
reference-integrity check must distinguish "my reference" from "a mention of
someone else's" or it cries wolf.

## Next steps

Optional v-next: extend validate to resolve cross-skill links (does
`../cook/references/x.md` actually exist in cook?). Not needed for the orphan
class. The 3 older June plans in `plans/` are the next disposition-cleanup
candidates when convenient.

# Validation and Iteration

Use this reference after the first complete skill draft and for every later
behavioral refinement.

## Validation matrix

Test four distinct contracts:

| Area | Evidence |
|---|---|
| Static | frontmatter, naming, sections, size, direct links, provenance, no duplication |
| Trigger | realistic should-trigger and should-not-trigger prompts |
| Functional | outputs cover every accepted concept, branch, error path, and edge case |
| Safety | authority, privacy, leakage, destructive action, and out-of-scope behavior |

Include at least two or three realistic cases for a new skill. For production or
high-risk skills, grow to five to ten diverse cases rather than variations of one
prompt. Create test cases for objective outputs by default.

## Trigger evaluation

Build a two-column set:

| Should trigger | Should not trigger |
|---|---|
| task phrase inside the exact scope | close neighbor owned elsewhere |
| relevant file/domain action | generic mention without requested action |

If the skill never loads automatically or undertriggers, add concrete trigger
phrases and keywords supported by real use. If it overtriggers, add negative
triggers, be more specific, and clarify scope. Re-run both columns after every
description change.

Do not optimize against a hidden scorer's exact substrings. Expected concepts
must come from the accepted output contract and real user tasks.

## Functional and comparative evaluation

1. Run the skill on representative tasks from a clean context.
2. Verify exact output fields, workflow ordering, tool effects, errors, and edge cases.
3. When value is uncertain, compare the same task without the skill; measure
   corrections, tool failures, messages, tokens, duration, and outcome quality.
4. Record failures and the owning instruction/resource rather than patching only
   the test prompt.
5. Re-run the same cases after edits, then add a new case that resists overfitting.

A skill must produce responses covering all expected concepts from its accepted
contract, but concise correct outputs beat keyword stuffing.

## Repository gates

From the final tree:

1. regenerate the embedded kit;
2. run strict claim coverage for claim-tracked distillations;
3. run `vcskill validate` and inspect warnings as well as exit status;
4. run focused script tests, then the full repository suite—tests must pass and
   failed tests must never be skipped;
5. run per-skill eval and record the actual proof tier;
6. run install dry-run and verify the destination and adapted content;
7. inspect the diff for placeholders, secrets, stale generated files, and scope creep.

Static and prose evals are not behavioral parity. State when a behavioral or
platform test was not available.

## Feedback loop

Use the skill on real tasks and notice struggles, inefficiencies, corrections,
token cost, and trigger misses. Generalize from feedback; do not overfit examples.
Remove ineffective instructions, update the smallest owning resource, rerun the
same scenarios plus a new one, and stop when acceptance criteria pass without
unnecessary prompt mass.

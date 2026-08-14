# Review Gate

Self-review checklist for the full diff before finalize. For cross-module or
public-contract changes, delegate this checklist to the `av-reviewer` agent
with the acceptance criteria attached; otherwise walk it yourself, file by file.

## Correctness

- [ ] Every acceptance criterion demonstrably met (map each to code + test)
- [ ] Edge cases handled: empty input, missing file, malformed data, first
      run vs re-run (idempotency)
- [ ] Error paths do something sane — no swallowed exceptions without a
      logged reason

## Blast radius

- [ ] Walk every caller of each changed function — behavior preserved or the
      change was intentional and stated
- [ ] Public contracts unchanged (signatures, exported types, API responses,
      schemas, env vars, config keys) unless the task said otherwise
- [ ] No accidental commits: debug prints, TODO scaffolds, unused imports,
      leftover fixtures

## Fit

- [ ] New code reads like the surrounding code (naming, idioms, comment
      density)
- [ ] Reused existing helpers instead of duplicating (search first)
- [ ] Files stay within repo size conventions; split only at real boundaries

## Security

- [ ] No secrets, tokens, or credentials in code, tests, or fixtures
- [ ] User-supplied input validated at trust boundaries
- [ ] File writes stay inside intended roots; paths joined, never
      concatenated

## Verdict

Record one line: `review: pass` or `review: N findings, M fixed, rest listed`.
Unfixed findings go into the final report as follow-ups — never silently
dropped.

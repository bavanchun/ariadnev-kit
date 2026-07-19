# Development Rules

Baseline engineering discipline for every change in this repo.

## Principles

Prefer YAGNI, KISS, and DRY in that order. Implement real behavior — no fake
data, mocks, or shortcuts just to satisfy a check. Keep changes scoped to the
request and the contracts it touches. Split a module only when it reduces
real complexity, not on line-count alone.

## Test-first

Write the failing test before the implementation. Watch it fail for the
right reason, then make it pass. Never weaken an assertion to make a test
green — if the expected behavior genuinely changed, say so in the commit.

## Quality gates

- Run the narrowest test scope first; widen to the full suite when a shared
  contract, exported symbol, or config file changed.
- Do not hide failing tests, lint errors, type errors, or build errors.
- Preserve public contracts (signatures, exported types, schemas, CLI flags,
  env vars) unless the change intentionally updates them.
- Keep commits focused; use conventional commit format.

## Security

Never commit secrets, tokens, private keys, or credentials. Validate
user-supplied input at trust boundaries, not only in the UI layer. File
writes stay inside intended roots — join paths, never concatenate them.

## Commits

Conventional commit format (`feat:`, `fix:`, `refactor:`, `test:`, ...). One
concern per commit. No AI-authorship notes in commit messages or code
comments — the diff and message should read like any other engineer's work.

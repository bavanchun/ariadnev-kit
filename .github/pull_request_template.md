## What this changes

<!-- The behaviour, not the diff. What is true after this that was not before? -->

## Why

<!-- The reason the change is worth making. Link an issue or an ADR if one exists. -->

## Verification

<!-- What you ran, and what it proved. "tests pass" is not evidence; name the test
     that would fail without this change. -->

---

Checked before opening. Each line maps to a gate in `.github/workflows/ci.yml` —
**CI is advisory on this repo, not blocking**, so these are yours to enforce.

- [ ] `pnpm run lint` clean (typecheck)
- [ ] `pnpm run build` clean
- [ ] `pnpm run coverage` green
- [ ] `node --test packages/cli/scripts/*.test.mjs` green
- [ ] `pnpm run test:hooks` green
- [ ] `node packages/cli/dist/index.js validate --check --strict` clean
- [ ] `node packages/cli/scripts/check-brand-drift.mjs` clean
- [ ] Touched the installers or release path? `pnpm run test:build-binaries` too

And the two things CI cannot check:

- [ ] A test fails if the implementation is removed — not just passes with it
- [ ] Unrelated changes are in their own commit

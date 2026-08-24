---
"ariadnev": minor
---

`ariadnev doctor` now reports a non-empty unprefixed skill directory only when
the current receipt recorded that legacy path and its `av-*` replacement exists.
This makes interrupted or incomplete prefix heals actionable without reporting
third-party skills that share a canonical name.

All shipped skills now meet the authoring bar directly; the retired skill-lint
exemption ledger can no longer suppress validation failures.

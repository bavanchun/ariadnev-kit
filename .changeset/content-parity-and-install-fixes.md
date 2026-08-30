---
"ariadnev": minor
---

Kit content: `--ultra` best-of-5 verifier mode across the skills that make a
decision worth verifying, `--debate` and the real plan-scaffolding CLI surface
in the plan skill, suite create/optimize/audit workflows in the test skill,
`--advice` on code review and agentize, `--report` on brainstorm, multi-PR
review with a REST fallback, an HTML report renderer for the CTI skill, the
coding-level output styles the session-init hook injects, seven new reference
guides, and four new skills (`bro`, `sowat`, `sumup`, `diagram`).

Install fixes: the embedded kit now stages its extraction beside its cache dir,
so publishing no longer fails with EXDEV where the system temp dir is a
separate filesystem (the common Linux layout); the installer writes the hook
runtime marker it was missing, and `doctor` reports an install that lost it.

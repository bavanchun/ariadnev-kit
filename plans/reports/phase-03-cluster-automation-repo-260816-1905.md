# Phase 3 — Cluster: Browser automation, repository operations and visual output

Plan: `plans/260816-1845-ariadnev-evidence-backed-parity-with-agentkit/phase-03-eval-coverage-that-matches-the-claim.md`
Cluster: `agent-browser`, `chrome-profile`, `agentize`, `github`, `xia`, `cti-expert`, `deep-swe`, `preview`, `show-off`, `tech-graph`

## Pairings

| skill | positive intent | negative (forbidden) skill | why genuinely confusable |
|---|---|---|---|
| `agent-browser` | Fresh/tool-managed headless browser QA, scraping, form fills, no login state needed | `chrome-profile` | Both drive a browser via CDP/DevTools. `agent-browser`'s own SKILL.md draws the line explicitly: use it when a fresh browser is fine; use `chrome-profile` when the task needs the user's real signed-in Chrome state (cookies, account, tenant). |
| `chrome-profile` | Bind to the user's real, already-signed-in Chrome profile (cookies, account, tenant) via DevTools MCP | `agent-browser` | Reverse of the above pairing — same CDP surface, opposite requirement (real profile state vs profile-independent). `chrome-profile`'s SKILL.md explicitly says "this is not the default for ordinary browser testing." |
| `agentize` | Wrap **existing local code** as a publishable CLI/MCP agent surface | `xia` | Both are "make code available to agents/other codebases" verbs. `agentize` starts from code already in this repo and exposes it outward (CLI/MCP); `xia` starts from **another** repo and pulls a feature inward. Same action family (wrap/port), opposite direction of movement. |
| `xia` | Port/adapt a feature **from another repo** (GitHub URL or local path) into this codebase | `agentize` | Reverse of the above. `xia`'s own SKILL.md scope note ("Not for: full project cloning, simple file copy, or package installation") shows the authors already worried about boundary confusion with adjacent skills; `agentize` is the nearest one still confused (both touch "bring capability X into/out of this repo"). |
| `github` | GitHub-side administration through `gh` CLI: issue dedup/create/label, PR merge readiness on an *existing* PR, independent of running the verification pipeline | `ship` | Read `git.json` and `ship.json` first — they already cover "local commit" vs "full verified delivery pipeline." `github`'s distinct boundary (not reused from those two) is: it operates the **GitHub-side surface itself** (issues, labels, Projects, Actions, org/repo admin) as a standalone action, whereas `ship` is the **orchestrated pipeline** (tests → review → commit → push → PR) that treats PR creation as its terminal step. A user asking to "check for a duplicate issue and label it" vs. "take this branch through the full delivery pipeline" is a real routing fork gh CLI-literate models make. |
| `cti-expert` | OSINT/threat-intel exposure review on an **external, synthetic** person/domain (breach signals, subdomain recon), sourced report | `security-scan` | Both produce "security findings" language, but target opposite surfaces: `cti-expert` investigates public exposure of **people/domains outside this repo**; `security-scan` audits **this repository's own code and dependencies**. `security-scan.json` (existing) already owns the "code review vs security scan" boundary, so this file tests the OSINT-vs-code-audit boundary instead, per instruction — not restated from the existing scenario. |
| `deep-swe` | Costed, external coding-agent benchmark run (Pier + OpenRouter, DeepSWE task corpus, real API spend) | `test` (existing skill, no scenario file in this cluster) | `deep-swe`'s own SKILL.md draws the line itself: "It does not evaluate a repository metric." A user saying "run the tests and tell me pass/fail" could mean the repo's own suite (`av:test`) or an external agent benchmark (`av:deep-swe`) — the two are easy to conflate because both report pass/fail-shaped results, but one spends real money against an external model and the other doesn't touch the network. |
| `preview` | Quick, ephemeral, ASCII/Mermaid explanatory diagram or file view for a code walkthrough — no publish-grade export | `tech-graph` | `tech-graph`'s own SKILL.md states it "pairs with `/av:preview --diagram` for visual self-review... this skill is the publish-grade output mode" — the authors already flagged this exact boundary. Quick self-review sketch vs. production SVG/PNG for a docs site is a real fork. |
| `show-off` | Self-contained HTML showcase/demo page for social/team sharing | `preview` | Both render local content as an artifact for a human. `show-off` is a *promotional* HTML page (screenshots baked in, meant to be posted/shared); `preview` (view mode) is a *plain viewer* for a file the user already wrote and just wants to read, no showcase intent. |
| `tech-graph` | Publish-grade SVG/PNG technical diagram via `rsvg-convert`, one of 7 styles | `show-off` | Third leg of the preview/show-off/tech-graph triangle: a "make this look nice and shareable" request could mean a technical diagram (`tech-graph`) or a narrative showcase page (`show-off`) — different artifact shape (structured diagram vs. free-form demo page) for a similar "make it presentable" prompt. |

Triangle coverage: `preview` vs `tech-graph`, `show-off` vs `preview`, `tech-graph` vs `show-off` — each edge of the three-way confusion is exercised in both directions across the three files, without repeating an identical prompt pair.

## Proposed evidence ids

Vocabulary (`evals/vocabulary/evidence-v1.json`) has no id that honestly describes "a browser automation session happened" or "a rendered visual/showcase/diagram artifact was produced." Reusing `tests.results`, `review.findings`, or `docs.updated` for these would misrepresent what the evaluator actually checks (their criteria are worded around this repo's own test commands / code review / committed documentation, not browser sessions or rendered visuals). Two ids proposed, each shared across multiple skills in this cluster to keep the vocabulary from growing one id per skill:

```json
{
  "id": "browser.session",
  "producer": "evaluator",
  "proof": "artifact",
  "criterion": "The report demonstrates a browser automation session — a page snapshot, screenshot, or DOM read — that proves the requested page action or state was reached through the declared browser path (a tool-managed browser or a bound real Chrome profile).",
  "capabilities": { "external.browser": "required" }
}
```
Used by: `agent-browser.json`, `chrome-profile.json` (both cases in each file).

```json
{
  "id": "visual.output",
  "producer": "evaluator",
  "proof": "artifact",
  "criterion": "The response produces a rendered visual artifact — a diagram, slide deck, ASCII/Mermaid explanation, or self-contained HTML page — whose format, topic, and output mode match what was requested.",
  "capabilities": {}
}
```
Used by: `preview.json`, `show-off.json`, `tech-graph.json` (both cases in each file).

### Flagged, not proposed — exceeds this cluster's 2-id cap

Two more cases have the same problem but I stayed inside the "at most 2" cap for this cluster and used the closest defensible existing id instead. Recording both for the orchestrator, since forcing a bad alias would be worse than flagging a gap:

- **`github.json`** (`github.state`, needed): `github`'s positive case is an issue-dedup-and-label action plus a merge-readiness check on an *existing* PR — no existing id proves "a GitHub-side object's state changed and the harness verified it remotely" independent of a *new* PR being created (that's `ship.pr-url`'s job) or a *review report* being produced (that's `pr.findings`'s job, owned by `review-pr.json`). I used `github.state` in the scenario file; it is **not yet in the vocabulary** and needs the orchestrator to add it or reassign the case. Suggested definition:
  ```json
  {
    "id": "github.state",
    "producer": "harness",
    "proof": "external-state",
    "criterion": "The requested GitHub-side object (issue, label, or existing pull request) reaches the stated state and the harness verifies that state against live GitHub, independent of running a full verification pipeline or authoring a new pull request.",
    "capabilities": { "external.github": "required" }
  }
  ```
- **`deep-swe.json`**: reused `tests.results` (already in the vocabulary) for both cases as a documented compromise. `deep-swe`'s benchmark run produces per-task solved/unsolved counts from a "single task, then a fixed sample" run shape that structurally mirrors `tests.results`'s "focused and required broad ... commands complete with their exact pass, fail, and skip counts" — but the id's surrounding vocabulary context (paired everywhere else with this repo's own `npm test`/CI gates) is about *this repository's* suite, not an external, costed, Docker/OpenRouter-backed benchmark against a *different* model. This is a flagged, imperfect reuse, not a confident match. If the orchestrator has budget room from other clusters, a dedicated `benchmark.result` id (producer: harness, proof: execution — "records the exact external benchmark command, model slug, task count, and score/cost for a costed evaluation run outside this repository") would be more honest.

## Safety note compliance (`cti-expert.json`)

No real names, emails, phone numbers, domains, or handles anywhere in the file. Subject is explicitly labeled `'Jordan Ashworth' (a synthetic, non-real placeholder identity)`; domain is `example-corp-test.invalid` (reserved-invalid TLD, cannot resolve). Added two extra `safety.forbiddenActions` tokens beyond the suite default (`workspace.unscoped-write`, `external.mutation`): `osint.real-subject-targeting`, `identity.pii-disclosure`. `forbiddenActions` is a free-form token array per schema (not vocabulary-constrained), so these are valid without touching shared files.

## Negatives taken from outside the cluster

- `github.json` negative → `av:ship` (file: `ship.json`, not modified). Reason: real, distinct boundary from `git.json`'s existing git-vs-ship pairing — see table above.
- `deep-swe.json` negative → `av:test` (file: `test.json`, not modified). Reason: `deep-swe`'s own SKILL.md explicitly disclaims being a repository-local test metric; `av:test` is the nearest skill a model would reach for instead.
- `cti-expert.json` negative → `av:security-scan` (file: `security-scan.json`, not modified, read first as instructed). Reason: explicitly authorized by the phase brief; tests the OSINT-vs-code-audit boundary rather than restating `security-scan.json`'s existing code-review boundary.

## Validation performed

- `node -e "JSON.parse(...)"` on all 10 files: pass.
- Cross-file id-uniqueness check across all 93 scenario files currently in `evals/scenarios/skills/`: pass, no duplicates.
- `npx vitest run packages/cli/src/eval/scenario-coverage.test.ts`:
  - "has a scenario file named for every shipped skill" — still fails, but the uncovered list no longer contains any of this cluster's 10 skills (remaining uncovered: `advise`, `av`, `coding-level`, `common`, `context-engineering`, `debug`, `fable-thinking`, `find-skills`, `help`, `loop`, `plan-i18n`, `retro` — all owned by other clusters).
  - "resolves every requiredEvidence id against the vocabulary" — still fails (expected, vocabulary not yet centrally updated). This cluster's contribution to the unknown-id list is exactly: `agent-browser.json`/`chrome-profile.json` → `browser.session`, `preview.json`/`show-off.json`/`tech-graph.json` → `visual.output`, `github.json` → `github.state`. `deep-swe.json` and `cti-expert.json` do not appear in the unknown list (they reuse existing vocabulary ids only).

## Files created

- `evals/scenarios/skills/agent-browser.json`
- `evals/scenarios/skills/chrome-profile.json`
- `evals/scenarios/skills/agentize.json`
- `evals/scenarios/skills/github.json`
- `evals/scenarios/skills/xia.json`
- `evals/scenarios/skills/cti-expert.json`
- `evals/scenarios/skills/deep-swe.json`
- `evals/scenarios/skills/preview.json`
- `evals/scenarios/skills/show-off.json`
- `evals/scenarios/skills/tech-graph.json`

No file outside this list was touched.

Status: DONE_WITH_CONCERNS
Summary: All 10 cluster scenario files written, parse, and pass id-uniqueness; coverage test confirms the 10 skills are no longer uncovered. Proposed 2 new evidence ids (`browser.session`, `visual.output`) at the cluster's cap; flagged a genuine 3rd need (`github.state`) used in `github.json` but not centrally added yet, plus a documented imperfect reuse of `tests.results` for `deep-swe.json`.
Concerns/Blockers: `evals/vocabulary/evidence-v1.json` still needs `browser.session` and `visual.output` added (and a decision on `github.state` / whether to keep the `tests.results` compromise for `deep-swe`) before the vocabulary-resolution test in `scenario-coverage.test.ts` will pass for this cluster's files.

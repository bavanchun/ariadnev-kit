# Cook gate findings — `260828-0859-ak-2-14-parity`

Date: 2026-08-28. Invocation: `/ak:cook plans/260828-0859-ak-2-14-parity/plan.md --auto --advice`.
Nothing was mutated. This records what the pre-implementation gate found.

## Verdict

`--auto` cannot run this plan as written. Two findings below are plan defects,
not scheduling caution, and one of them makes phase 2 break the release gate.

## Blocker state (verified)

`260822-1407` is `in-progress`. Phases 4, 5, 8, 11 open. Remaining items are
**publish-and-rehearse**, not engineering:

| Phase | Done/open | What is actually left |
|---|---|---|
| 05 security + signed channel | 8/1 | "the release carrying all of the above is published" |
| 11 beta channel | 3/2 | publish a `-beta`, rehearse phase 4 on it |
| 04 prefix release + rollout | 2/5 | publish, heal live roots, rehearse rollback |
| 08 skill burn-down | 6/2 | second-reader review pass |

Live evidence the release is mid-flight: PR **#80 `Version Packages (beta)`**
open on `changeset-release/main`; draft releases `ariadnev@1.2.1-beta.0` and
`ariadnev@1.2.0` (2026-08-27); a CI run in `action_required` awaiting the
maintainer. CI wall-clock baseline ≈ **6-7 min** (phase 1 step 11 wanted this
number).

## Finding 1 — phase 1's Gate A rests on a false premise

The plan states the cross-target harness "**does not exist today**: release smoke
currently runs host-only", sizes Gate A as "comparable to the rest of the phase
combined", and blocks phases 2-13 on it.

It exists. `.github/workflows/release-candidate-build.yml:160` defines job
`smoke-cross-platform`, added by commit `05dce94 test(release): prove Ed25519 on
every platform CI can actually run`. It downloads the compiled candidate and
**executes** it via `packages/cli/scripts/smoke-binary.mjs`.

Actual execution coverage of the five targets in `scripts/binary-targets.mjs`:

| Target | Executed in CI? | Where |
|---|---|---|
| `linux-x64` | yes | build job, on its own runner |
| `darwin-arm64` | yes | `smoke-cross-platform`, `macos-latest` |
| `windows-x64` | yes | `smoke-cross-platform`, `windows-latest` |
| `darwin-x64` | no | header/arch bytes only |
| `linux-arm64` | no | deliberate, documented: paid arm runner; pure-JS fallback pre-approved |

So Gate A is not "build a harness". It is "add a SQLite/FTS5/WAL probe to an
existing harness that already covers Linux, macOS and Windows". `checkSmokeOutput`
is a pure, separately unit-tested function (`smoke-binary.test.mjs`) and `run(bin,
args)` spawns arbitrary subcommands — both clean extension points.

The one real gap: this lives in the **release-candidate** path, not per-PR
`ci.yml`, which is `ubuntu-latest`-only across all three jobs and never executes
a compiled binary. Putting a compiled smoke on every PR costs billed minutes
against an explicit maintainer constraint, so that is a decision, not a given.

**Consequence:** phase 1's 4-7d sizing and its Gate A/Gate B split were built to
absorb work that is already done.

## Finding 2 — phase 2 breaks the release gate

Phase 2 moves `resume`/`status`/`cancel` off `run` **immediately** (its own words:
"move immediately rather than being shimmed"), leaving only bare `av run <id>`
behind a deprecation shim.

`smoke-binary.mjs:51-53` asserts:

```js
for (const token of ["resume", "status", "cancel", "--runtime <provider>", "--validate", "--json"]) {
  if (!runHelpOut.includes(token)) failures.push(`run --help is missing ${token}`);
}
```

After phase 2, `run --help` is dispatch help and contains none of the first
three. The smoke step fails, and it gates **every release candidate**.

Second hit at `smoke-binary.mjs:161`: `run("run", "read-only-delivery",
"--validate", "--json")`. No slash, so it survives on phase 2's shim — then
breaks outright when phase 10 retires the shim.

Blast radius is contained and known: `scripts/smoke-binary.mjs` and
`scripts/smoke-binary.test.mjs`. Neither is in phase 2's or phase 10's file list.

Three prose surfaces carry the same grammar and are also absent from phase 2's
list: `README.md:112,113,148,150`, `docs/graph-execution-architecture.md:27-47`,
and **`kit/skills/av/SKILL.md:117`**. The last one matters beyond documentation
drift — it is inside the skill root that blocker phase 4 is currently renaming on
live installs. Content edits are far weaker coupling than directory renames, but
it means phase 2 is not the purely CLI-local change the plan describes.

**Consequence:** phase 2 must add five files to its scope, and it edits the
release smoke while PR #80 is open.

## Finding 3 — `engines.node` contradicts the dual driver

`package.json:6` and `packages/cli/package.json:33` both declare `"node": ">=18"`.
The phase-1 dev driver needs `node:sqlite` (Node 22.5+; the plan verified 24).
Once the adapter lands, `>=18` is false. Neither file is in phase 1's list.

## Confirmed-correct plan claims

Checked rather than assumed: exactly **five** `node-version: "20"` pins, no sixth
(`ci.yml:174,262`, `release.yml:40`, `release-candidate-build.yml:55,178` — jobs
`unit`, `ci`, `version-pr`, `build`, `smoke-cross-platform`); `docs/decisions/`
ends at `0013`, so ADRs `0014-0017` are right; `kit/skills-lint-exempt.json`
absent and no non-test `isPorted` — the lint coupling really is spent; the live
binary registers **24** top-level commands.

## The collision the Node bump would cause

Phase 1 step 1 bumps all five pins "as its own PR, first". Two of those pins are
`release.yml:40` (job `version-pr`, which *produces* PR #80) and
`release-candidate-build.yml:55,178` (which builds and smokes the beta candidate).
Bumping them now edits the machinery of an open release PR belonging to the
blocker plan, mid-cut.

The two `ci.yml` pins carry no such coupling.

## Unresolved

- Whether the compiled-binary SQLite smoke should also run per-PR in `ci.yml`,
  given billed-minutes constraints, or stay on the release-candidate path only.
- Whether `darwin-x64` should join the executed set now that the probe is cheap.

# Installer `av-` prefix: blast radius, migration, test surface

Read-only research. Decision (not re-litigated): resolver writes skill dirs as
`<scope>/<skillDir>/av-<name>` instead of `<skillDir>/<name>`.

## 1. Blast radius

**The single fix point:**
`packages/cli/src/providers/resolver.ts:239`
```
if (artifact.type === "skill") return join(base, cfg.skillDir, artifact.name);
```
`artifact.name` is the canonical bare name (`cook`, `handoff`, …), sourced from
the kit/skills/ directory basename at `packages/cli/src/kit/load-kit.ts:72`
(`readArtifact("skill", entry, skillMd)`, `entry` = dirent name) and asserted
equal to frontmatter `name: av:${artifact.name}` at `load-kit.ts:93-98`. This
is the ONLY place that turns a canonical name into an on-disk skill dir name;
every other consumer either calls `targetFor`/`targetPathFor` (inherits the fix
for free) or works from the receipt's recorded path (also inherits it for
free, see §4).

**Correctness trap at the same fix point** — `resolver.ts:172-180`
(`targetPathFor`) queries the skill *root* via `mk("skill", "")`
(empty name), used by `targetTemplate` (README matrix, `av contract --json`,
`av kit install-path`) and by `e2e-install.test.ts:74-89` ("every file sits
under a path the matrix declares"). A naive `"av-" + artifact.name` turns the
empty-name case into `.../skills/av-` instead of `.../skills/`, breaking the
provider matrix, `contract --json`, and the e2e "declared root" check
simultaneously. Fix: `artifact.name ? \`av-${artifact.name}\` : ""` (or
equivalent guard) inside the skill branch.

**Also touches `resolver.ts:87`** — cursor's agent-artifact shim writes
`.agents/skills/${n}` (an agent installed as a skill-like dir, in the SAME
shared root). This is a separate branch (`artifact.type === "agent"` →
`cfg.agentPath`), not covered by the skill-branch fix, so agent-shim dirs stay
unprefixed unless deliberately extended. Flagged as open question in §2/§8 —
the task's "installer writes skills… with NO prefix" framing does not
explicitly cover this shim.

**Confirmed NO blast radius** (read, verified path-agnostic or unrelated):

| File | Why unaffected |
|---|---|
| `install/install-plan.ts:19-32` (`planSkills`) | Calls `r.targetFor(skill, ctx)` — inherits fix |
| `install/artifact-content.ts` (`skillFiles`) | Returns `rel` paths under the skill dir; join happens in `install-plan.ts:28` against the (now-prefixed) `dir` |
| `install/install-receipt.ts` | Records whatever `op.dest` the plan produced (`buildInstall`, `install-receipt.ts:129-140`); never re-derives a path from a name |
| `uninstall/uninstall-plan.ts`, `uninstall-execute.ts` | Operate entirely on `receipt.installs[p].files[].path` (`uninstall-plan.ts:131-140`) |
| `doctor/audit.ts`, `doctor/diagnose.ts` | Same — iterate `install.files`, never rebuild a path from a skill name |
| `adapters/adapter-artifacts.ts`, `write-adapter-artifacts.ts` | Pure projection of `receipt.installs[p].files` (`adapter-artifacts.ts:63-76`) |
| `skill-env/env-root.ts` | Keyed by dependency-set digest (`envPath(digest)`, line 24), not skill name/path |
| `kit/hooks/_lib/provider-paths.cjs` | Walks up to a dir literally named `.claude` (`claudeConfigDir`, line 25-34); indifferent to what's inside `skills/` |
| `kit/hooks/session-init/hook.cjs:63-112`, `subagent-init/hook.cjs:198`, `context-builder.cjs:101-104,556` | Reference `.claude/skills/.venv/` and `.claude/skills/.shadowed/` — **root-level** siblings of the skills dir, not per-skill paths. `.shadowed` cleanup is explicitly for a "disabled skill-dedup hook" (session-init/hook.cjs:63) — dead code path today |
| `kit/skill-filter.ts`, `kit/reference-integrity.ts`, `kit/skill-lint.ts`, `kit/skill-crossrefs.ts` | Operate on canonical bare names / SKILL.md body content from the authoring tree, never the installed path |
| `cli/add-skill-command.ts:27` | Scaffolds into `kitRoot/skills/<slug>` (authoring tree) — untouched by install-side prefixing |
| `cli/list-command.ts:35` | `r.targetFor(first, ctx)` — inherits fix |
| `install/fs-atomic.ts`, `install/path-guard.ts`, `install/agents-md.ts`, `install/hook-settings-merge.ts` | No skill-name-shaped logic (grep confirmed zero hits beyond an unrelated brand-drift regex) |
| `portable-manifest.json` (schema) | Mechanically reusable; **needs new data**, not new code — see §3 |

## 2. Per-provider correctness

Resolver skill roots (`resolver.ts:59-137`):

| provider | `skillDir` | scope rule |
|---|---|---|
| claude-code | `.claude/skills` | scope-dependent (own root) |
| codex | `.agents/skills` | **always home**, regardless of `--global` (`resolver.ts:53-56` `codexBase`) |
| cursor | `.agents/skills` | scope-dependent |
| antigravity | `.agents/skills` | scope-dependent |
| opencode | `.opencode/skills` | scope-dependent (own root) |
| generic | `.agents/skills` | scope-dependent |

So under `scope=global`, codex/cursor/antigravity/generic all write into the
**identical physical directory** (`~/.agents/skills`). This is not
hypothetical — it is what is on disk right now.

**Direct observed evidence this shared root is multi-tenant, unprefixed by
default, and that the precedent product (AgentKit) already prefixes its own
entries there:**
```
~/.agents/skills/ak-cook, ak-handoff, ak-orchestrate, ... (105 AgentKit dirs)
~/.agents/skills/remotion-maps, tanstack-table, gsap-plugins, shadcn,
  excalidraw, graphify, obsidian-second-brain-note, vchun-git,
  vchun-chief-of-staff, statusline-usage, claude-van-patch, agentwiki
  (≥12 non-AgentKit entries, same root, no prefix, from other tools/authoring)
~/.codex/.agents/skills/ak-*   — same ak- set, mirrored for codex
~/.cursor/skills/ak-*          — cursor's OWN root (not .agents/skills);
                                  AgentKit prefixes there too
~/.claude/skills/ak-*, agentwiki, .venv — AgentKit prefixes even under the
                                  "native" claude-code root, which also has a
                                  non-AgentKit tenant (agentwiki)
```
(`ls ~/.agents/skills`, `~/.claude/skills`, `cat
~/.agentkit/adapters/cursor/engineer/cursor-ownership.json`, `~/.codex/.agents/skills`,
all read directly, 2026-08-22.)

**Conclusion**: prefixing is not a claude-code-only concern grafted onto
shared roots — it is the *already-observed norm* for every root a second tool
touches, including the "native" `.claude/skills`. Applying `av-` uniformly to
all six providers (claude-code, codex, cursor, antigravity, opencode, generic)
is the choice consistent with precedent, and it is simpler (KISS/DRY: one rule
in `resolver.ts:239`, no per-provider special-case) than exempting providers
with less collision exposure (opencode: own root, no observed second tenant on
this machine, but no evidence it's exempt either — no reason to special-case
it).

**Discrepancies noted, not fixed (out of scope, flagged as open questions)**:
- ariadnev's cursor resolver uses the shared `.agents/skills` (`resolver.ts:86`);
  AgentKit's cursor instead uses a cursor-only `.cursor/skills/` root. Not
  something this task's decision touches — cursor's *root* was already chosen
  before this study; only the *prefix inside that root* is in scope.
- The cursor agent-as-skill-dir shim (`resolver.ts:87`) is not a "skill"
  artifact type and is not automatically covered by the `resolver.ts:239` fix.

## 3. Migration

**Current receipt mechanics guarantee an orphan on the very next install**:
`install-receipt.ts` replaces each provider's record *wholesale*
(`buildReceipt`, comment at line 154-157, and loop at line 174-176: `receipt.installs[entry.providerId] = buildInstall(...)`).
A fresh `av install` under the new resolver produces a receipt whose
`files[]` list contains only `av-cook/…`-shaped paths. The old `cook/…` files
are dropped from the record with nothing to reference them:
- **uninstall** (`uninstall-plan.ts:131` `for (const file of install.files)`)
  will never see the old dir — nothing to remove, ever.
- **audit** (`audit.ts:74-80`) only scans `ownedDirs` = `dirname()` of
  *currently tracked* files, i.e. `av-cook/`'s parent. It never visits the old
  `cook/` dir because nothing currently tracked lives there — so `untracked`
  classification cannot find it either. The orphan is invisible to `av audit`.
- **doctor** (`diagnose.ts:72-81`) only checks that recorded files exist —
  same blind spot.

So "leave orphaned unprefixed dirs" (question 3a) is not just possible, it is
the default outcome of `av update && av install` with no other action taken.

**Does `portable-manifest.json` + `av migrate` already implement this class of
move?** Mechanically yes, semantically no — it generalizes the *primitive*
but not the *shape* needed here.

Read: `portable-manifest.json`, `migrate/manifest.ts`, `migrate/plan-migrations.ts`,
`migrate/execute-migrations.ts`, `migrate/applied-state.ts`.

- The existing entry is a single, literal directory rename:
  `{ "provider": "antigravity", "type": "skill", "from": ".agent/skills", "to": ".agents/skills", "since": "0.2.0" }`
  (`portable-manifest.json:6-12`). `planMigrations` (`plan-migrations.ts:24-41`)
  resolves `from`/`to` under ONE root (`ctx.root`, chosen by `--global`),
  checks existence, and emits one move op. `executeMigrations`
  (`execute-migrations.ts:21-34`) backs up, `mkdir -p` the parent, removes any
  pre-existing dest, `renameSync`s, records an applied key
  (`migrationKey`, `manifest.ts:39-41`) in `.ariadnev/applied-migrations.json`
  so re-runs no-op.
- **What generalizes**: the move+backup+idempotency primitive is exactly
  right for "rename one directory to another name" — which is precisely what
  `cook` → `av-cook` is, per skill, per shared-root.
- **What does not generalize**: the schema (`manifest.ts:4-10`, `MigrationEntry`)
  has no wildcard/pattern support — `from`/`to` are literal strings. Renaming
  ~105 skill subdirectories requires either:
  (a) ~105 literal entries per distinct physical skillDir root that needs it
      (not 105 × 6 providers — codex/cursor/antigravity/generic share one
      physical `.agents/skills` per scope, so the real multiplier is
      "skills × distinct physical roots actually installed", commonly 2:
      claude-code's `.claude/skills` and the shared `.agents/skills`, times 2
      scopes if both are used — plus opencode's own `.opencode/skills` if that
      provider is in use), or
  (b) a new migration **kind** (e.g. `"type": "skill-prefix-all"`) that at
      execution time enumerates existing subdirectories of a root and renames
      each by prepending a prefix, skipping any that already start with it
      (idempotency) and any that are not skill dirs (e.g. `.venv`,
      `.shadowed`, `.skill-lock.json` — all observed siblings in `~/.agents/skills`,
      per §2 evidence).
  (b) is the DRY choice and avoids hand-maintaining a 105-line literal list
  that goes stale the moment a skill is added/renamed; it is new code in
  `plan-migrations.ts`/`execute-migrations.ts`, not just new manifest data.

- **Scope gap already baked into the existing single-entry mechanism, inherited
  here**: `av migrate` (no `--global`) only touches `ctx.cwd`; `av migrate
  --global` only touches `ctx.home`. Because codex is *always* home-rooted for
  skills regardless of the scope flag used at *install* time
  (`resolver.ts:53-56`), a user must run migrate in **both** modes to fully
  cover codex + any global installs of cursor/antigravity/generic + the
  project-scope copies of the same three. This is a pre-existing property of
  the migrate command, not introduced by this change, but it means "migrate
  once" will not fully resolve a mixed project+global install history.

- **Not wired to `av update`/`av install`**: `grep -n "migrate" install-command.ts
  update-command.ts` → zero hits. Neither command invokes `runMigrate`. The
  task's exact sequence ("`av update` + `av install` over an old install")
  will NOT trigger any migration unless the user separately runs `av migrate`
  — and today nothing prompts them to. This is the crux of §7.

**What a new manifest entry needs to look like** (proposed shape, for the plan
to adjudicate): either a `type: "skill"` per-root wildcard extension (add
`"pattern": true` or a distinct `type: "skill-prefix"` value plus a `"prefix":
"av-"` field) so `planMigrations` can enumerate `readdirSync(fromRoot)` and
emit one `MigrateOp` per existing, not-yet-prefixed subdirectory — reusing
`executeMigrations`'s per-op backup/rename/applied-key logic unchanged. The
`migrationKey` (`manifest.ts:39-41`, `${provider}:${type}:${from}->${to}:${since}`)
scheme would need one applied-key per moved skill dir (e.g. include the skill
name), not one per manifest entry, since a partial-completion crash mid-batch
must resume correctly.

## 4. Receipt + adapter projection

**Receipt** (`install-receipt.ts`): `ReceiptInstall.files[]` stores
`toPortablePath(op.dest, home, cwd)` (line 131) — the *already-resolved*
destination string. Once §1's fix lands, every fresh install's `op.dest`
naturally contains `av-<name>`, so the receipt schema needs **no version
bump, no field change** — it just starts recording different string values.
`ReceiptSkillSelection.skills` (`install-execute.ts:119-124`,
`skillSelection.skills = kit.skills.map(s => s.name)`) stores **canonical bare
names** (`cook`, not `av-cook`) — this is orthogonal to install paths and is
untouched by the change.

**Adapter projection** (`~/.ariadnev/adapters/<provider>/*`,
`adapters/adapter-artifacts.ts`, `write-adapter-artifacts.ts`): all five
generated files (`install-manifest.json`, `native-skill-paths.json`,
`native-skill-hashes.json`, `native-hook-expectations.json`,
`<provider>-ownership.json`) are pure functions of `receipt.installs[p].files`
(`buildSkillPaths`, `adapter-artifacts.ts:63-66`; `buildSkillHashes:69-76`,
etc.) with `resolvePath` = `fromPortablePath` (`write-adapter-artifacts.ts:51`).
**No code change needed here** — confirmed by design comment at
`adapter-artifacts.ts:1-11`: "the receipt is the only ownership record, these
are a projection of it." This matches the shape of AgentKit's own
`~/.agentkit/adapters/<provider>/engineer/*` files (same five-file set,
`native-skill-paths.json` observed directly, `~/.agentkit/adapters/claude-code/engineer/.agentkit/native-skill-paths.json:1-15`)
— confirms ariadnev's adapter format is deliberately upstream-compatible and
that upstream also just lists absolute paths (would include `ak-`-prefixed
segments there too).

## 5. Test surface

Grepped `\.claude/skills/|\.agents/skills/|\.opencode/skills/|\.test-provider/skills/`
across `packages/cli/src/**/*.test.ts`: 18 files, 80 raw matches. Triage —
most of these are **not** at risk because they feed literal fixture strings
directly into path-agnostic functions (receipt/uninstall/audit/diagnose
builders) and never call the resolver:

**No change needed** (self-contained fixtures, ~9 files, ~60 of the 80 matches):
`install-receipt.test.ts`, `uninstall-plan.test.ts`, `uninstall-execute.test.ts`,
`doctor/audit.test.ts`, `doctor/diagnose.test.ts`, `adapters/adapter-artifacts.test.ts`,
`cli/adapters-command.test.ts`, `cli/doctor-command.test.ts` — all construct a
literal `dest`/`path` fixture and a matching receipt fixture together; neither
touches `resolver.targetFor`, so they stay green regardless of the prefix.

**Must change — root-template queries, only if the §1 empty-name guard is
missing** (else they'd break; with the guard, unchanged):
`providers/provider-matrix.test.ts:28,31,48`, `cli/contract-command.test.ts:10`,
`cli/validate-command-policies.test.ts:106` — all assert `.claude/skills/` /
`~/.agents/skills/` with **no name suffix** (the skill-root template).

**Must change — real resolver output, non-empty name** (~11 assertions):
- `providers/resolver.test.ts:14,23,37,53,62,78` — direct proof cited in the
  task (`/proj/.claude/skills/x` etc.); 6 assertions, one per provider path
  case including `test-provider` (open question: prefix the mock too? See §8).
- `install/install.test.ts:179,181,190,302,447` — real `installKit()` +
  `existsSync`/`readFileSync` against the actual written tree (5 assertions;
  line 302's pre-existing-file fixture must be created at the NEW path or the
  "atomic replace" test stops testing what it claims).
- `cli/cli-commands.test.ts:90,154,176,194,231` — CLI-level install/uninstall
  round trip against `.claude/skills/brainstorm/SKILL.md` (5 assertions).

**Self-adapting, no assertion change needed but exercises the fix**:
`install/e2e-install.test.ts` (the CI gate, `.github/workflows/ci.yml:55`) —
zero hardcoded skill names; it derives expected roots from
`targetPathFor` itself (line 81) and diffs against `receipt.files`. This is
the test that will loudly fail if the empty-name guard (§1) is skipped, and
loudly pass once both the fix and the guard are in.

**Estimate**: ~11 hard-coded path assertions to edit (resolver.test.ts × 6,
install.test.ts × 5) + ~5 more in cli-commands.test.ts = **~16 assertions
across 3 files**, plus verifying (not necessarily editing) 3 root-template
test files stay green.

## 6. The 19 links

Verified against `kit/skills/` source tree (authoring names, unprefixed) — a
link resolves post-fix iff the target FILE exists under the skill's own
source directory, since the install-time rename only changes the *directory
name at the destination*, not which files a skill ships.

| # | file:line | target | verdict |
|---|---|---|---|
| 1 | `handoff/SKILL.md:26` | `../av-handover/SKILL.md` | RESOLVES |
| 2 | `handoff/SKILL.md:256` | `../av-handover/SKILL.md` | RESOLVES |
| 3 | `plan/SKILL.md:37` | `../av-cook/references/plan-state-files-first.md` | RESOLVES |
| 4 | `handover/references/job-spec-template.md:9` | `../../av-orchestrate/references/job-spec.md` | RESOLVES |
| 5 | `handover/references/job-spec-template.md:10` | `../../av-orchestrate/references/runtime-matrix.md` | RESOLVES |
| 6 | `handover/references/job-spec-template.md:11` | `../../av-orchestrate/references/model-routing.md` | RESOLVES |
| 7 | `handover/SKILL.md:27` | `../av-handoff/SKILL.md` | RESOLVES |
| 8 | `handover/SKILL.md:34` | `../av-orchestrate/SKILL.md` | RESOLVES |
| 9 | `handover/SKILL.md:60` | `../av-handoff/references/artifact-schema.md` | RESOLVES |
| 10 | `handover/SKILL.md:99` | `../av-handoff/references/artifact-schema.md` | RESOLVES |
| 11 | `handover/SKILL.md:104` | `../av-handoff/references/redaction-patterns.md` | RESOLVES |
| 12 | `handover/references/runtime-catalog.md:12` | `../../av-orchestrate/references/runtime-matrix.md` | RESOLVES |
| 13 | `issue-to-plan/SKILL.md:33` | `../av-cook/references/plan-state-files-first.md` | RESOLVES |
| 14 | `ariadnev/SKILL.md:103` | `../av-find-skills/references/domain-routing.md` | RESOLVES |
| 15 | `ariadnev/SKILL.md:104` | `../av-cook/references/workflow-routing.md` | RESOLVES |
| 16 | `ariadnev/SKILL.md:105` | `../av-preview/references/visual-explanation-routing.md` | RESOLVES |
| 17 | `ariadnev/references/chaining-patterns.md:6` | `../../av-cook/references/workflow-routing.md` | RESOLVES |
| 18 | `ariadnev/references/chaining-patterns.md:74` | `../../av-cook/references/workflow-routing.md` | RESOLVES |
| 19 | `pm/references/sync-back.md:21` | `references/risk-lanes.md` (prose, "same vocabulary as `av:cook`'s") | **STILL BROKEN** — `kit/skills/cook/references/risk-lanes.md` does not exist on disk (verified: `[ -e ... ]` → MISSING). No directory-prefix issue here; the file itself was never authored. The prefix change does not and cannot fix this one, per the task's own note. |

18/19 resolve after the prefix lands; #19 needs a separate content fix
(author `risk-lanes.md` or drop the reference) — **out of scope for the
installer change**, flagged for whoever owns `kit/skills/pm` and
`kit/skills/cook`.

Six skills touched: `ariadnev`, `handoff`, `handover`, `issue-to-plan`, `plan`,
`pm` (the 6th, via the one non-standard reference).

## 7. Risk

**Single most likely silent half-land**: someone ships the `resolver.ts:239`
prefix without (a) the empty-name guard from §1, or (b) any migration story
from §3, and merges it as "the fix" because `pnpm test` still shows green on
everything except the handful of assertions listed in §5 — which are easy to
"fix" by just updating the expected strings without noticing WHY they moved.
Two independent failure shapes hide behind that:

1. **Docs/contract corruption** (if the empty-name guard is skipped): README's
   provider matrix and `av contract --json` silently render `.claude/skills/av-`
   instead of `.claude/skills/`. This is the LOUD version — CI's
   `validate-command-policies.test.ts:106` and `provider-matrix.test.ts:28,31`
   and `e2e-install.test.ts:74-89` all fail immediately. Low risk of shipping
   unnoticed; high risk of wasting a debugging cycle if someone "fixes" it by
   special-casing the test instead of the resolver.
2. **Orphaned dirs at every existing install** (if §3 is skipped): this is the
   QUIET version. `pnpm test` stays green (nothing in the suite creates a
   pre-existing unprefixed install and then re-installs over it — the closest
   test, `install.test.ts:188-196` "idempotent re-install", starts from a
   fresh sandbox every time, never from a receipt written by an older
   resolver version). `av doctor`, `av audit`, and `av uninstall` all
   independently fail to notice, per §3's proof. The observable signal a user
   would eventually hit: disk usage silently growing every kit-version bump
   (two full skill trees on disk, e.g. `.claude/skills/cook/` AND
   `.claude/skills/av-cook/`), and a skill that behaves as if it "won't
   update" because an agent's markdown-link path resolution or some future
   `av list --verbose` might read the wrong (stale) copy if it ever globs by
   suffix instead of going through the receipt. **The concrete test that would
   catch this if added**: install with the CURRENT resolver into a sandbox,
   hand-edit the receipt to simulate "old version", swap in the NEW resolver,
   re-install, then assert the old skill dir either no longer exists or is
   flagged by `av audit`. No such test exists today.

## Recommended implementation sequence

1. Add the "av-" prefix at `resolver.ts:239`, guarded for the empty-name root
   query (`resolver.ts:172-180`) — the ONE required source change for the
   skill-path contract itself. Decide and record the cursor agent-shim
   question (§2) as an explicit non-change if left alone.
2. Update `resolver.test.ts` (6 assertions), `install.test.ts` (5), and
   `cli-commands.test.ts` (5) to expect `av-<name>`. Run
   `provider-matrix.test.ts`, `contract-command.test.ts`,
   `validate-command-policies.test.ts`, and `e2e-install.test.ts` unchanged —
   they must still pass; if they don't, the guard in step 1 is wrong.
3. Design and implement the manifest migration primitive from §3: extend
   `manifest.ts`'s schema with a per-root wildcard/prefix migration kind, and
   `plan-migrations.ts`/`execute-migrations.ts` to enumerate + rename +
   idempotency-key each subdirectory (skipping non-skill siblings like
   `.venv`, `.shadowed`, `.skill-lock.json`, already-prefixed dirs). Add
   `portable-manifest.json` entries for each physical skillDir root actually
   in play (claude-code's own root, the shared `.agents/skills`, opencode's
   own root) × both scopes.
4. Decide and implement whether `av install`/`av update` auto-detects and
   offers/runs the migration, or whether this stays a manually-invoked
   `av migrate` step documented in release notes — §7's "quiet" failure mode
   means leaving it manual without prompting is the higher-risk option.
5. Add the missing regression test named in §7 (old-resolver install →
   receipt → new-resolver re-install → assert no invisible orphan / audit
   catches it).
6. Ship; do NOT touch the 19 links (§6) — they already resolve correctly
   post-fix, except #19 which is an unrelated missing-file defect for a
   separate owner.

## Open questions

1. Does the cursor agent-as-skill-dir shim (`resolver.ts:87`,
   `.agents/skills/${n}` for agent artifacts) also get the `av-` prefix, for
   namespace consistency in the same shared root? Not covered by the task's
   framing of "the installer writes SKILLS… unprefixed."
2. Does `test-provider` (the internal mock, `resolver.ts:127-137`) get
   prefixed too? Consistency argues yes (one rule, no special case); nothing
   requires it since it's excluded from `EVIDENCE_REQUIRED_PROVIDERS` and
   `USER_FACING_PROVIDER_IDS` already.
3. Is the manifest schema extension (per-root wildcard/prefix migration, §3)
   in scope for this task, or is a flat list of ~literal entries acceptable
   as a first cut, with the wildcard mechanism deferred? This materially
   changes the size of the migration-side implementation.
4. Should `av install`/`av update` auto-run the equivalent of `av migrate`
   (or at minimum warn "N unprefixed skill dirs found, run `av migrate`")
   before writing a receipt that would orphan them? Current code does neither
   (`grep migrate install-command.ts update-command.ts` → 0 hits).
5. `kit/skills/pm/references/sync-back.md:21`'s dangling `risk-lanes.md`
   reference (§6, #19) — who owns authoring the missing file vs. removing the
   reference? Independent of this task but discovered during it.

Status: DONE
Summary: Core fix is one line (`resolver.ts:239`) plus one guard (empty-name root query at `resolver.ts:172-180`); receipt/uninstall/audit/doctor/adapters all inherit it for free since they're path-agnostic, but the wholesale-replace receipt semantics mean an unguided `av update && av install` orphans every old unprefixed skill dir invisibly to every diagnostic (`av audit`/`av doctor`/`av uninstall`) — `portable-manifest.json`'s move primitive is reusable but its schema needs a new per-root wildcard/prefix migration kind, not just data, to cover ~105 skills without hand-listing them. 18/19 cross-skill links resolve post-fix; #19 is an unrelated missing-file defect.
Concerns/Blockers: Open questions 1-4 above materially affect implementation size/shape (agent-shim scope, test-provider scope, migration schema depth, auto-vs-manual migration) and should be resolved before an implementation plan is written.

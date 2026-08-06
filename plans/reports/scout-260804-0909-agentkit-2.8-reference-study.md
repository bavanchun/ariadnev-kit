# Scout Report — AgentKit 2.8.0-beta.3 as a reference for vcskill

Date: 2026-08-04 · Subject: `ak` installed on this machine · Mode: read-only, 4 parallel Explore lanes + live CLI probes
Purpose: learn how AgentKit builds its harness, kit, and distribution, to inform vcskill's distill + harness upgrade.
Companion: `scout-260804-0853-vcskill-kit-state-and-harness.md` (vcskill's own state).

## 0. What ak is now

`ak 2.8.0-beta.3`, 29 MB Mach-O arm64 at `~/.local/bin/ak`, built 2026-08-03 (commit `e9809a6`), home `~/.agentkit/`.
Previous snapshot in this repo's journals was `2.5.0-beta.11` (2026-07-25) — **three minors in ~10 days.**

Critical context: the 2.8.0 changelog's only breaking change is *"Rebrand kit namespace from ck to ak (both surfaces)"* (PR #492). **AgentKit is ClaudeKit's successor.** vcskill's `providers/spec-verified.ts` claims are sourced from "shipped claudekit-engineer generators" — that upstream is now this product, actively shipping adapters. The reference vcskill was ported from has moved.

Scope of the product today (from changelog + `--help` tree): Go CLI + Wails desktop app, SQLite plan store + operational store + analytics + FTS content shards, auth/licensing with paid remote-only kit registry, R2-backed signed release channel, macOS notarization, MCP stdio runtime bridge for Codex, adapters for claude-code / codex / cursor / antigravity / portable-export, issue-triage daemon, team collaboration core.

**This is not a scope vcskill should chase.** The value below is in specific mechanisms, not the surface area.

---

## 1. Live verification of vcskill's provider matrix — the highest-value finding

ak 2.8 installs to real paths on this machine right now. That is independent evidence for cells vcskill only ever verified against claudekit's Python generators.

| vcskill claim (`adapt/paths.ts`) | ak 2.8 live evidence | verdict |
|---|---|---|
| codex skills → `~/.agents/skills/` | `~/.agents/skills/` exists, **213 skill dirs**; `native-skill-paths.json` lists `/Users/vchun/.agents/skills/ak-*/SKILL.md` | **corroborated** |
| codex agents → `~/.codex/agents/*.toml` | `~/.codex/agents/` holds 16 `.toml` files (advisor, explore, kongming, planner…) | **corroborated** |
| codex commands → `~/.codex/commands/*.md` | **`~/.codex/commands` does not exist.** ak emits no codex commands at all | **unsupported** |

`paths.ts:16` already carries the hedge: `CODEX_COMMANDS_DIR = "commands"; // …flip to "prompts" if live Codex differs`. Live evidence says the upstream product doesn't ship codex commands by any name — so vcskill is emitting into a directory nothing reads. Cheapest fix in the whole harness backlog: either verify against Codex's own docs, or demote the cell to `skip`.

Also note `~/.agents/` is a **shared cross-tool root** (`skills/`, `backups/`, `claudekit/`), not codex-private. vcskill already targets it for codex/cursor/antigravity/generic — that convention is confirmed correct.

---

## 2. Harness architecture — the fundamental divergence

**vcskill: transform client-side at install.** Kit embedded in binary → adapt engine rewrites paths/tool-names/frontmatter → write to provider dirs.

**ak: fetch pre-built per-runtime trees.** A provider-agnostic `kit.yaml` manifest is rendered **server-side / in-binary** into a complete per-`(kit × runtime × version)` tree, published signed to a registry, then downloaded and copied.

```
~/.agentkit/cache/kits/engineer/{claude-code,codex}/2.4.0/engineer/
├── kit.yaml                     # provider-agnostic export manifest (identical both sides)
├── agents/planner.md            # canonical source kept alongside
├── .codex/agents/planner.toml   # rendered target format
├── .codex/hooks.json            # reshaped hook schema
├── .codex/config.toml           # marker-delimited managed block
└── .agentkit-cache/manifest.json  # sourceCommit, sha256, ed25519 signature, keyId,
                                   # requiredCliVersion, adapterSchemaVersion
```

Consequences worth weighing:

- ak's transformation logic is **closed** — inside the 29 MB binary / registry build. No user-editable provider mapping exists anywhere under `~/.agentkit`. Adding a provider is a code change for them too.
- ak gains supply-chain provenance vcskill has no analogue for: per-artifact `sourceCommit` + `sha256` + **ed25519 signature** + `keyId` + `requiredCliVersion` + `adapterSchemaVersion: "agentkit-adapter.v1"`.
- vcskill gains inspectability and offline determinism ak lost. **This is vcskill's actual differentiator** — the adapt engine is pure, readable, ≥95% covered. Don't trade it away.

### 2.1 Transformation mechanics — what they do that string substitution can't

Confirmed by diffing ak's source vs rendered trees:

1. **Structural format conversion.** `agents/planner.md` → `.codex/agents/planner.toml` embeds the entire original markdown (frontmatter included) verbatim as a TOML triple-quoted string under `developer_instructions`, plus a new wrapper key `model = "gpt-5.5"`. vcskill's `agent-to-toml.ts` does something comparable — closest point of parity.
2. **Capability-aware pruning.** Hooks whose matcher names Claude-only tools (`session-state.cjs` on `Agent|Task|TodoWrite|TodoRead`) are **dropped** from the codex output, not rewritten. The whole `notifications/` subtree (10 files) is omitted for codex — 46 files → 36. vcskill's model is all-or-nothing per `(provider, artifact)` cell; **per-artifact pruning is a capability it lacks**.
3. **Platform-variant fields.** Hook conversion emits both `command` and a new `commandWindows` field. vcskill has no cross-platform variant mechanism in emitted artifacts.
4. **Marker-delimited managed blocks in a provider's native config**: `# --- ak-managed-agents-engineer-start … end ---` inside `.codex/config.toml`, making re-install idempotent without clobbering user-added entries in the same file. vcskill does this for `AGENTS.md` (`agents-md.ts`) but **not** for provider-native config files.
5. **Model-alias remapping** at the wrapper level (`opus` → `gpt-5.5`). vcskill has no model-mapping table.

### 2.2 Where vcskill is ahead

ak **does not rewrite in-body tool names or paths** when porting agent prose across runtimes. The embedded codex agent still says `Glob, Grep, Read, Edit, Task(Explore)` and the stale `model: opus` line survives inside the embedded frontmatter. vcskill's `tool-rewrites.ts` + `path-rewrites.ts` genuinely do more here.

Net: the two engines are complementary, not one-sided. vcskill's realistic upgrade is **structural conversion + pruning + managed-block merge on top of its existing rewrite tables**, not a rewrite of its architecture.

---

## 3. CLI/UX contract — cheap, high-leverage patterns to copy

### 3.1 The help template (best single idea in the product)

Every command, top-level and nested, uses a fixed section order:

```
What it does:         1-3 sentences, names exact files/dirs touched
Who it's for:         power-dev vs non-technical, maps to flag combos
When to use it:       situational trigger
Examples:             5-10 annotated invocations
What changes on disk: explicit read-only vs write claim + exact paths
Output modes:         pretty / plain / json
Exit codes:           base 4 + command-specific
Usage: / Flags:
```

`What changes on disk` is the standout: it makes every command's mutation risk **machine-greppable without reading source**. This session's own scouts used it to decide what was safe to run. For a CLI meant to be driven by agents, that field is close to free and disproportionately useful.

### 3.2 Versioned envelope on success *and* error

```json
{"schema_version":1,"kind":"projects.list","data":{"projects":[],"total":0}}
{"schema_version":1,"error":"…","error_code":"not_found","exit_code":1}
```

Payloads carry their own nested `schema_version` — envelope and payload version independently. vcskill has a machine-discovery envelope; the **error** envelope and the double-versioning are the deltas.

### 3.3 Exit codes reused across unrelated commands

`0` success · `1` runtime error · `2` invalid flags · `3` user-cancel, then consistently `4` unmet dependency · `5` not found · `6` existing state blocks op without `--force` · `7` security violation. Same meaning everywhere → scriptable. Also `--json` implies `--no-interactive` (one flag, no footgun).

### 3.4 doctor design

30 checks, each `{name, status: ok|warn|skip|fail, evidence, advisory?, details?, fix_cmd?}`, plus `summary{total,ok,warn,fail,skip}` and a `healthy` boolean. Live run: 19 ok / 6 warn / 5 skip / 0 fail, `healthy: true`.

Three things vcskill's doctor should take: the **`advisory: true`** flag (keeps `healthy` meaningful when warns are informational), the inline **`fix_cmd`** per finding, and **exit 0 by default with `--exit-on-fail`** opt-in for CI. Check names worth stealing outright: `install_provenance` (marker vs manifest), `residual_ck_content` (migration leftovers), `mixed_install_mode` (native vs plugin conflict).

---

## 4. Ownership, update, uninstall

| Layer | ak | vcskill today |
|---|---|---|
| Directory marker | `~/.claude/.agentkit-managed` → `{version, installed_at, kit_hash, install_id}` | `.vcskill/receipt.json` |
| Per-file manifest | `install-manifest.json` → `[{rel_path, sha256}]` per `(runtime, kit)` | receipt-based |
| Emitted-path index | `native-skill-paths.json` (absolute targets) + `native-skill-hashes.json` | — |
| Drift command | `ak audit` — compares install vs sha256 manifest, exit 1 on drift | `vcskill doctor` |
| File classification | **clean** (hash match) → overwrite/delete · **modified** → skip unless `--force` · **orphan** (untracked) → report, never delete · **missing** → skip | preserves edited files |
| Snapshot | **unconditional before any mutation**, even under `--force`; `ak backups {list,show,create,verify,restore,prune}` + `ak recover` as universal undo | keeps last 3 backups |
| Backup format | `~/.agentkit/backups/<UTC>-<8hex>/{manifest.json, data/root/…}` with per-file `{rel_path, src_abs, sha256, mode, size}` and a `label` (e.g. `"pre-kit-init takeover"`) | timestamped dirs |

The four-way **clean / modified / orphan / missing** vocabulary is the concrete upgrade for vcskill's uninstall and doctor — especially *orphan → report, never delete*, and *snapshot even under `--force`*.

Also worth noting: ak treats `CLAUDE.md` as **one-shot, then user-owned** (listed under `userConfigFiles`, no managed markers, never re-overwritten), while `settings.json` and `metadata.json` stay tracked. A clean ownership split vcskill can mirror.

Caveat found: at **global** scope ak's `metadata.json` tracks only 3 files (`hooks/.logs/hook-log.jsonl`, `metadata.json`, `settings.json`) — the bulk of agents/rules/hooks it dropped is untracked. The rich per-file classification is a **project-scope** feature. Their global story is weaker than their docs imply.

---

## 5. Distribution and trust

| Aspect | ak | vcskill |
|---|---|---|
| Verification | ed25519 signature + keyId + requiredCliVersion + sourceCommit per artifact; **embedded-key bootstrap verifier**; authenticated bootstrap release chain | sha256 only |
| macOS | **fail-closed notarization** activated | not notarized — README documents the Gatekeeper `xattr -d` workaround |
| Self-update | verify-all-bytes-then-replace into `~/.agentkit/cache/binaries`; desktop staged atomically; channels dev/beta/stable; **package-manager-owned installs report the native upgrade command instead of self-replacing** | `update` with sha256 verify |
| Channels | `--channel stable\|beta`, `--beta` shorthand, opt-in auto-update via `updates.enabled` | single channel |

Two items are near-free for vcskill and materially raise trust: **notarization** (removes the documented Gatekeeper wart) and **don't self-replace a package-manager-owned binary** (print `brew upgrade …` instead).

---

## 6. Skill authoring — where the real distillation lesson is

### 6.1 Population (97 `ak-*`, 154 493 md LOC)

```
ak-<name>/
├── SKILL.md          97/97, median ~148 lines
├── references/*.md   63/97   heaviest: ak-web-testing 24, ak-frontend-design 23, ak-skill-creator 22
├── scripts/*         32/97   (75 .py, 20 .js, 20 .cjs, 10 .sh, 5 .ts)
├── assets/            2/97
└── agents/            1/97
```

**The key insight for vcskill's compression question:** ak's heavy skills are not monolithic — they are *thin routers over deep references*. `ak-web-testing` is a 103-line SKILL.md pointing at 24 reference files. vcskill's `kit/skills` has **13 of 26 skills with zero references**, and the aggressive 3–13% compression band was achieved by **deleting** content rather than **deferring** it.

That reframes the earlier finding. The question is not "is 12% of `ak-code-review` enough" — it's "did the other 88% belong in `references/` instead of being dropped". Progressive disclosure is the mechanism vcskill under-uses.

The stated rule, from `ak-skill-creator`: *"Progressive disclosure: Metadata → SKILL.md → Bundled resources"* and *"No duplication: Info lives in SKILL.md OR references, never both."*

### 6.2 Frontmatter — provenance is the missing field

Keys across 97: `name`(97) `description`(97) `when_to_use`(94) `user-invocable`(94) `keywords`(94) `category`(94) `metadata`(93) `argument-hint`(88) `license`(42) `disable-model-invocation`(5) `allowed-tools`(5).

`metadata.` sub-keys include `author`, `version`, and — critically for a distillation project — **`upstream`, `upstream_sha`, `attribution`, `source`**. Example: `attribution: "… adapted from autoresearch by Udit Goenka (MIT)"`.

**vcskill has no provenance link from a `vc:` skill back to its `ak-*` source.** Adding `metadata.upstream` + `upstream_sha` would make "has the source changed since we distilled?" a mechanical check instead of a memory exercise — directly relevant given ak shipped three minors in ten days.

Other cheap adopts: `when_to_use` as a field separate from `description`; `keywords` for discovery; `disable-model-invocation` for human-only skills; `allowed-tools` for tool allowlisting.

### 6.3 Gate conventions worth stealing

- `<HARD-GATE …>` XML tags embedding mandatory preconditions directly in SKILL.md prose (`ak-advise`, `ak-cook`, `ak-fix`) — brainstorm-first, scout-first, exact-root-cause, no-side-effects.
- **"Iron Law: NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE"** with the sequence `IDENTIFY command → RUN full → READ output → VERIFY confirms → THEN claim` (`ak-code-review`, `ak-debug`).
- `ak-skill-creator` ships its own eval rubric: `compositeScore = accuracy × 0.80 + securityScore × 0.20`, plus a mandatory security-policy section covering prompt-injection, jailbreak, instruction-override, data-exfiltration, pii-leak, scope-violation.

### 6.4 Router mechanics (`ak-agentkit`)

Six-step protocol worth studying as a model for a vcskill entry point:

- **Step 0 proportionality gate** — user named a skill → invoke, stop routing. Single domain + single step + one obvious skill → invoke directly, stop routing. Stated principle: *"Routing ceremony on a trivial task is itself a quality failure."*
- **Step 1 classify** → emits one line: `Route: <class> | size: <trivial|standard|epic> | risk: <low|elevated|high> | domains: <n>` over 12 workflow classes.
- **Step 3 chain** — skeleton `understand → decide → execute → verify → deliver`, with a **Collapse Rule** (drop a link if <5 min, produces no rereadable artifact, and skipping loses no risk-mandated verification) and an **Insertion Rule** (epic → insert decide; risk elevated → insert verify; risk high → verify + independent review + user confirmation; domains ≥2 → one execute sub-link per domain).
- Anti-drift rule: *"Copy routing tables from owning references into prompts or docs → they drift; load them at decision time instead."*

### 6.5 The skill graph — a cheap win vcskill should take

`ak skills graph` builds a **read-only workflow graph** with edges derived from `metadata.workflow` frontmatter, `## Workflow Position` sections, and optional `/ak:` co-mention heuristics. Filterable by `--kit`, `--skill`, `--edge-kind typically_precedes`, `--json`.

The graph is **derived at tool time from prose**, not stored as data — only 3/97 skills actually carry `workflow:` frontmatter. vcskill already writes `## Workflow position` in 18/26 skills. A `vcskill graph` command plus **dangling-edge validation** is low effort and would have caught the `vc:debug` reference that points at a skill that doesn't exist.

### 6.6 Don't cargo-cult: ak is less disciplined than vcskill here

Balance matters before copying:

- **No `##` heading is universal across the 97.** Only 13/97 carry `## Workflow Position`. vcskill's 18/26 is a *higher* rate.
- `ak-skill-creator` states a `<300 line` cap that `ak-plan` (536) and `ak-ui-ux-pro-max` (666) violate — unenforced.
- `ak skills graph` reads `metadata.workflow` that essentially no skill populates.
- The `agents/` anatomy slot for eval templates is used by exactly 1/97 skills.

vcskill's `validate` **mechanically enforces** its LOC caps and name rules; ak's equivalents are documentation. The gap identified in the previous report — that vcskill's validate doesn't enforce its own 4-section bar — remains the right fix, and ak offers no better model for it.

---

## 7. What ak has that vcskill deliberately should not build

Desktop app (Wails), auth/login/licensing, paid remote-only kit registry, SQLite operational store + analytics + FTS content shards, session ingest/retention, issue-triage daemon, team collaboration core, local API proxy server, Discord content publishing. This is a funded product surface. vcskill's stated identity is local-first, no account, single self-contained binary — chasing any of this trades away the thing that makes it coherent.

---

## 8. Ranked adoption shortlist

**Tier 1 — cheap, high leverage**

1. Fix or demote the codex `commands` cell; re-verify every `spec-verified.ts` cell against live provider evidence (§1).
2. Adopt the help template, above all **"What changes on disk"** (§3.1).
3. Add `metadata.upstream` + `upstream_sha` + `attribution` to distilled skills — makes source drift mechanical (§6.2).
4. `vcskill graph` + dangling-edge validation in `validate` (§6.5).
5. doctor: `advisory` flag, `fix_cmd`, `--exit-on-fail` (§3.4).
6. Error envelope with `error_code`, and the reusable exit-code scheme (§3.2, §3.3).

**Tier 2 — real work, real payoff**

7. Four-way file classification (clean/modified/orphan/missing) + unconditional pre-mutation snapshot + `restore` as universal undo (§4).
8. Per-artifact **pruning** and **structural conversion** in the adapt engine, beyond string substitution (§2.1).
9. Marker-delimited managed blocks in provider-native config files, not just AGENTS.md (§2.1).
10. Re-deepen the 3–13% band via `references/` rather than by re-inflating SKILL.md (§6.1).

**Tier 3 — trust**

11. macOS notarization (removes the documented Gatekeeper wart).
12. Signed release artifacts (ed25519 + keyId + requiredCliVersion), package-manager-aware self-update (§5).

---

## Unresolved questions

1. Is the codex `commands` path wrong, or does Codex read a directory that ak simply doesn't populate? Needs a check against Codex's own docs, not against ak.
2. Should vcskill keep client-side transformation as its differentiator, or is signed pre-built distribution worth the loss of inspectability? (Recommendation: keep client-side — it's the coherent identity.)
3. Cursor and antigravity adapters exist in ak 2.8 but are not installed here (`config.yaml` enables `codex` only), so their live paths could not be verified. Enabling one would give the same corroboration §1 gave for codex — worth doing before trusting those matrix cells.
4. Does re-deepening via `references/` conflict with vcskill's `REFERENCE_MAX_LINES = 300` and the lean-kit identity in decision 0001? Needs a decision before the distill pass.
5. ak's `~/.claude/rules/*.md` has no codex counterpart — is rules content folded into `.codex/AGENTS.md` (15 KB, not fully read)? Relevant to whether vcskill's flat AGENTS.md degradation matches upstream practice.
6. `ak` ships 97 skills into `~/.agents/skills` (213 dirs there total) while `ak versions` reports `kits: []` — the kit inventory and the installed content disagree. Unclear whether that's beta bookkeeping drift or plugin-vs-native mode. Worth watching if vcskill copies the manifest design.

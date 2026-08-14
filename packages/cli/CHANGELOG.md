# ariadnev

## 1.0.0

### Major Changes

- Rename the whole product to **ariadnev** (short alias `av`) and cut 1.0.0.

  Every identifier moves: the binary and package name, the `ARIADNEV_*` env prefix,
  the `av:`/`av-` skill and agent namespaces, the `~/.ariadnev` and `.ariadnev/`
  state directories, the `~/.cache/ariadnev` cache, the `.claude/hooks/av/` hook
  directory, the `ariadnev@X` release tag grammar, the `ariadnev-{os}-{arch}`
  asset names, and the base URL, now `ariadnev.com`. A CI gate
  (`check-brand-drift.mjs`) fails the build if an old identifier reappears outside
  an explicit historical-record allowlist.

  **Breaking — installs made before the rename are not adopted.** Files written
  under the old name into `.claude/`, `.codex/`, and `.cursor/`, plus
  `~/.vcskill/` and `~/.cache/vcskill/`, are not recognized and will not be
  removed by `ariadnev uninstall`. Delete them by hand; a fresh
  `ariadnev install` writes a clean tree beside them.

  Two readers stay backward compatible, because both touch data that already
  exists on the user's disk:

  - An AGENTS.md managed block written with the old markers is replaced rather
    than duplicated, and is still stripped on uninstall.
  - A schema-1 receipt is still readable, so doctor and uninstall keep working
    against it.

  The release pipeline resolves a previous stable release across the rename, so
  1.0.0 correctly sees the last pre-rename release as its predecessor instead of
  reporting no history at all.

### Minor Changes

- 35acc7d: CLI "xịn" program — a branded terminal UI plus six capability upgrades
  (brainstorm → plan → 4-reviewer red-team → TDD build):

  - **Branded terminal UI + `av` short alias.** Output is colored/branded on a TTY
    and plain when piped/CI/`NO_COLOR`, cohesive with the ariadnev.com landing
    page (coral wordmark, `✓/skip/◆` glyphs). `contract` renders a terminal matrix
    grid on a TTY. The installer links a guarded `av` alias (never clobbers an
    existing `av`; `ARIADNEV_ALIAS=off` to skip).
  - **`ariadnev doctor` scored audit.** A 0–100 health bar, per-check tri-state
    (pass/skip/warning/fail), and an exact remediation command per finding. The
    score is informational only — the exit-code contract is unchanged.
  - **Credential sanitizer + `SECURITY.md`.** GitHub/OpenAI token shapes, URL
    userinfo, and secret-shaped env values are redacted from all output at a single
    boundary (empty/short values never shred output).
  - **`ariadnev eval`.** Cost-tiered skill-quality gate: tier-1 static (free, always)
    - tier-3 LLM judge when `ARIADNEV_EVAL_CMD` is set.
  - **`contract --json` machine envelope** (`protocol_version`, `capabilities[]`,
    schema range; legacy `version` preserved) + CI now runs the `.mjs`/`.cjs` test
    suites.
  - **`ariadnev query`.** A local, append-only JSONL history (`~/.ariadnev/history.jsonl`)
    of installs, doctor runs, and updates; recording is best-effort and
    allowlist-scrubbed (no free-form/secret data persisted).
  - **Anonymous, opt-out telemetry** facility (`ariadnev telemetry status`) — stateless,
    categorical-only, and off by default (nothing is transmitted until an endpoint
    is configured). Opt out with `ARIADNEV_TELEMETRY_DISABLED=1` / `DO_NOT_TRACK=1`.

### Patch Changes

- 335399f: Publish a deterministic public docs bundle with matching manifest/schema sidecars and release checksums. Bind release candidates to the exact web-consumer contract, retain independently attested candidate artifacts, and hold drafts for protected immutable/latest finalization.

## 0.12.0

### Minor Changes

- Initial published kit surface with 26 skills, decisions ledger, and anchor
  verification. Ships the graph-native local execution harness with versioned
  workflow contracts, static graph linting, event-sourced checkpoints, safe
  resume/cancel lifecycle, and provider-neutral Codex and Claude Code adapters.
  The first public execution surface is read-only; workspace-changing execution
  remains policy-denied until a public approval and side-effect adapter exists.

  Ships behavioral and performance gates for the full skill catalog and 14
  golden tasks, recovery/idempotency cases, cross-runtime conformance, and a
  benchmark-proven deterministic artifact context graph. Paused runs fail
  closed after incompatible graph or runner upgrades and remain inspectable
  and cancellable.

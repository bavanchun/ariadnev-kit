---
"vcskill": minor
---

CLI "xịn" program — a branded terminal UI plus six capability upgrades
(brainstorm → plan → 4-reviewer red-team → TDD build):

- **Branded terminal UI + `vc` short alias.** Output is colored/branded on a TTY
  and plain when piped/CI/`NO_COLOR`, cohesive with the vcskill.vchun.dev landing
  page (coral wordmark, `✓/skip/◆` glyphs). `contract` renders a terminal matrix
  grid on a TTY. The installer links a guarded `vc` alias (never clobbers an
  existing `vc`; `VCSKILL_ALIAS=off` to skip).
- **`vcskill doctor` scored audit.** A 0–100 health bar, per-check tri-state
  (pass/skip/warning/fail), and an exact remediation command per finding. The
  score is informational only — the exit-code contract is unchanged.
- **Credential sanitizer + `SECURITY.md`.** GitHub/OpenAI token shapes, URL
  userinfo, and secret-shaped env values are redacted from all output at a single
  boundary (empty/short values never shred output).
- **`vcskill eval`.** Cost-tiered skill-quality gate: tier-1 static (free, always)
  + tier-3 LLM judge when `VCSKILL_EVAL_CMD` is set.
- **`contract --json` machine envelope** (`protocol_version`, `capabilities[]`,
  schema range; legacy `version` preserved) + CI now runs the `.mjs`/`.cjs` test
  suites.
- **`vcskill query`.** A local, append-only JSONL history (`~/.vcskill/history.jsonl`)
  of installs, doctor runs, and updates; recording is best-effort and
  allowlist-scrubbed (no free-form/secret data persisted).
- **Anonymous, opt-out telemetry** facility (`vcskill telemetry status`) — stateless,
  categorical-only, and off by default (nothing is transmitted until an endpoint
  is configured). Opt out with `VCSKILL_TELEMETRY_DISABLED=1` / `DO_NOT_TRACK=1`.

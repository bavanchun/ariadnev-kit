---
"vcskill": minor
---

Installer self-verification + kit-quality gates (distilled from comparing
claudekit-engineer, repository-harness, and Archon):

- `vcskill contract [--json]` — provider×artifact capability contract, generated
  from the same resolver/spec-verified source the installer uses.
- `vcskill validate --check` — fail if the README provider matrix drifts from
  the generated source of truth (wired into CI).
- `vcskill doctor --fix` — re-merge hook bindings that drifted out of
  settings.json (backs up first, atomic, idempotent; honors `--dry-run`).
- `validate` now flags confusable skill descriptions (Jaccard scorer:
  near-duplicate → error, similar → warning).
- Passive "newer version available" nudge after a command (stderr, cached,
  CI-silent, never blocks).
- Release CI now smoke-tests the freshly-compiled binary (version, embedded kit
  loads, no leaked build paths).
- Security: ignore `VCSKILL_*` injected via a project's auto-loaded dotenv files
  (`.env`, `.env.local`, `.env.{NODE_ENV}`) — a hostile repo could otherwise
  redirect the cache/config. vcskill config is owned by the shell.

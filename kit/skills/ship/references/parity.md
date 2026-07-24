# Parity: vc:ship vs ak-ship

Source baseline: `ak-ship` v2.0.0 (decision 0003, AgentKit baseline).

## Kept

| From ak-ship | Why |
|---|---|
| Single command → PR URL | The core value of a ship pipeline |
| official / beta mode + branch-name inference | Real dual-track release need |
| Blocking stop conditions (conflicts, test fail, critical review) | Safety — the gates that must not be skipped |
| Never force-push; auto-detect everything else | Sensible, safe defaults |
| Subagent/skill delegation for test + review | Maps cleanly to `vc:test` / `vc:code-review` |
| `--skip-*` / `--dry-run` flags | Escape hatches for already-verified work |

## Dropped (with reason)

| Dropped | Reason |
|---|---|
| Steps 6–9: version bump, changelog, journal, docs auto-update | Scope creep for a ship *pipeline*; version/changelog/docs are their own decisions, journal is `vc:journal`, docs is `vc:docs`. Loose coupling keeps ship to the test→review→git spine |
| 3 reference files (ship-workflow, auto-detect, pr-template) | The pipeline table + delegation fits in SKILL.md; each delegated skill owns its own detail |
| `when_to_use` / `category` / `keywords` frontmatter | Not in the vc allowlist; taxonomy → `metadata.category` |
| gstack attribution line | Not needed in the distilled skill |

## Improvement (parity-or-better)

- **Explicit loose coupling.** ak-ship inlines test/review/journal/docs logic into
  one mega-pipeline; vc:ship references `vc:test` / `vc:code-review` / `vc:git` *by
  name* and delegates, so each gate has one owner and ship cannot drift from them.
  This is the validated design decision (documented sequence, not hard-invoke).
- **Sharper identity vs `vc:git`.** The body and description frame ship as the
  orchestrator and git as the mechanics, removing the ak-ship/ak-git overlap that
  makes routing ambiguous.

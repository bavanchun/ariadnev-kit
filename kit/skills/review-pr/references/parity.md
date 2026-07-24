# Parity: vc:review-pr vs ak-review-pr

Source baseline: `ak-review-pr` v2.1.0 (decision 0003, AgentKit baseline).

## Kept

| From ak-review-pr | Why |
|---|---|
| Fetch via `gh` (view/diff/checks); read full modified files | Core PR-review mechanics |
| `--fix` / `--reply` / `--merge` composable modes | The differentiator vs a local review |
| Merge-readiness gate (Approve + mergeable + CI green/pending) | Safety — never force an unready PR |
| gh-absent graceful fallback to local output | Robustness; never hard-fail the skill |
| Anti-AI-slop taxonomy + structural-vs-micro severity mapping | High-signal, keeps `--fix` from cosmetic churn |
| Scope-vs-diff-size signal | Cheap, effective slop/scope check |

## Dropped (with reason)

| Dropped | Reason |
|---|---|
| Inline `$ARGUMENTS` sed pipelines + `!`-command frontmatter blocks | AgentKit/Claude-command-specific; vc skills stay provider-agnostic markdown, so the gh calls are described, not embedded as harness directives |
| Long `allowed-tools` enumeration | vc leaves tool-gating to the harness; the body names the exact `gh` commands instead |
| `project-rules-example.md` worked example | Project-specific; belongs to the target repo, not the skill |
| `when_to_use` / `category` / `keywords` frontmatter | Not in the vc allowlist; taxonomy → `metadata.category` |

## Improvement (parity-or-better)

- **Shared severity rubric with `vc:code-review`** (`../code-review/references/severity-rubric.md`)
  instead of a PR-local copy — the two reviewers cannot drift on what a tier means.
  ak-review-pr and ak-code-review each carry their own scale.
- **Delegates fix/commit/merge to named vc skills** (`vc:fix`, `vc:git`) rather than
  ak-specific `ak:fix`/`ak:git merge-pr` invocations, so the PR reviewer rides the
  same fix/commit engines as the rest of the kit.

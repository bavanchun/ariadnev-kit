# Fix-diff re-read — Tier B batch 1

Scope: `git diff HEAD` after resolving the findings in
`audit-260823-2017-tier-b-batch-1-second-read.md`. The generated embed was
checked by source digest and the frozen benchmark by corpus digest, gate result,
and changed retrieval paths; generated timing samples are expected to vary.

## cook

- FIX cook-1: feature routing now ends at `av:cook` and states that cook owns
  implementation, testing, and review. The standalone stages are no longer
  duplicated. ✓
- FIX cook-2: the scout row now distinguishes the `scout` subagent from the
  `av:scout` skill. ✓
- FIX cook-3: `tester` remains mandatory while `debugger` is explicitly
  conditional on a failure. ✓
- FIX cook-4: `git-manager` now runs only after commit authorization in the
  parent skill, workflow steps, subagent table, output provenance, and quality
  gate. The existing `user declined` output is now reachable. ✓
- FIX cook-5: the no-CLI fallback no longer gives contradictory direct-edit
  instructions; it reports unresolved sync-back for the installed project
  management workflow. ✓
- FIX cook-6: the fixed "3 subagents" count was replaced with evidence fields
  for sync-back, docs, and commit status. ✓

No content regression found. `cook/SKILL.md` is within the 300-line validator cap.

## design

- FIX design-1: `--lock-axis` is documented as parsed but currently unused;
  the guide tells callers not to rely on it. Grep confirms no read of
  `args.lock_axis`. ✓
- FIX design-2: series instructions now repeat explicit `--style`,
  `--palette`, and `--texture`; `--layout` and `--seed` vary. This matches the
  four `pick_row` calls in `scripts/poster/generate.py`. ✓
- FIX design-3: "auto mode" became explicit caller authorization for
  autonomous execution. ✓
- FIX design-4: asset provenance permits `n/a (manual composition)` when no
  generator command or model exists. ✓
- FIX design-5: the quality gate separates poster axes from logo direction and
  no longer assigns a texture axis to logos. ✓
- FIX design-6: prompt anatomy now says seven blocks, matching the seven
  numbered blocks and `render_prompt`. ✓
- FIX design-7: deterministic uniqueness and fixed entropy claims were removed;
  the guide now matches the script's 2-4 shape sample and focal-anchor fallback.
  ✓

REGRESSION design-r1: the first fix retained the pre-existing "5 blocks" and
"guarantee" claims in the now load-bearing prompt reference. They were added to
the second-read audit and corrected before this report. No open regression
remains. `design/SKILL.md` is 264 lines.

## fix

- FIX fix-1: scout and hypothesis delegation are conditional on explicit
  request and runtime permission; direct skill/local evidence remains valid. ✓
- FIX fix-2: Step 5 requires an independent review, delegating to
  `code-reviewer` when permitted and otherwise performing the same review
  locally, matching standard/deep workflow fallback semantics. ✓
- FIX fix-3: the Subagent table now names `code-reviewer`, not the
  `av:code-review` skill. ✓
- FIX fix-4: quick verification now runs real project commands directly and
  only distributes them when authorized; the invalid run-shell agent example
  is gone. ✓
- FIX fix-5: quick finalize asks for commit authorization and records either a
  SHA or a decline. ✓
- FIX fix-6: deep diagnosis starts after scout evidence; external research may
  still overlap scouting. ✓

No content regression found. `fix/SKILL.md` is within the 300-line validator cap.

## markdown-novel-viewer

- FIX markdown-novel-viewer-1: the HTML quality gate uses the complete,
  registered `/av:preview --html --explain` producer mode. ✓
- FIX markdown-novel-viewer-2: the unsupported `av:plans-kanban` dashboard
  relation was removed without changing the dashboard skill itself. ✓
- FIX markdown-novel-viewer-3: exhausted ports now mean unavailable candidate
  ports, not necessarily 45 viewers. ✓
- FIX markdown-novel-viewer-4: PID removal now requires proof that the process
  is no longer live. ✓
- FIX markdown-novel-viewer-5: the current guide now says "upstream source"
  rather than retaining the old AgentKit product name. ✓

REGRESSION markdown-novel-viewer-r1: the first fix-diff pass missed this
brand-drift hit. The brand check exposed it before push; source and embed were
corrected, and the full local gate was restarted. No open regression remains.
`markdown-novel-viewer/SKILL.md` is 145 lines.

## mcp-builder

- FIX mcp-builder-1: `llms-full.txt` is identified as the current docs corpus;
  protocol-sensitive work locates the dated specification within it. ✓
- FIX mcp-builder-2: API research is bounded to authoritative documentation
  relevant to selected workflows. ✓
- FIX mcp-builder-3: Python uses typed parameters with Pydantic for structured
  inputs; TypeScript accepts current Standard Schema validators with Zod v4 as
  an example. `.strict()` is conditional on choosing Zod. ✓
- FIX mcp-builder-4: the agent-centric reference and both language checklists
  use the same contract, and the parent says fetched current SDK guidance wins
  over stale bundled examples. ✓

No regression found. `mcp-builder/SKILL.md` is 209 lines.

## Generated artifacts and ratchet

- `pnpm --filter ariadnev generate:embedded` embedded 1,585 assets with digest
  `c39eb91c74a110ca`. ✓
- `bun packages/cli/scripts/benchmark-context.mjs --write` produced corpus
  digest `1f3f27015811870bc5773a18f23cf06078220a2efeadb6fa5adaa6c95ee7623e`;
  every benchmark gate passed. ✓
- The five skills remain removed from `kit/skills-lint-exempt.json`; no
  exemption or description-collision allowlist entry was added. ✓

Result: all 28 substantive second-read findings are resolved. Two fix-diff
regressions were corrected locally, and no unresolved regression remains.

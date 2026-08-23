# Quick Workflow

Fast scout-diagnose-fix-verify cycle for simple issues.

The parent skill's opening intent frame is already satisfied before this route
loads. Quick mode does not skip or repeat it.

## Steps

### Step 1: Scout (Minimal)
Locate affected file(s) and their direct dependencies only.
- Read error message → identify file path
- Check direct imports/dependencies of affected file
- Skip full codebase mapping

**Output:** `✓ Step 1: Scouted - [file], [N] direct deps`

### Step 2: Diagnose (Abbreviated)
Activate `av:debug` skill. Activate `av:sequential-thinking` for structured analysis.

- Read error message/logs
- **Capture pre-fix state:** Record exact error output (this is your verification baseline)
- Identify root cause (usually obvious for simple issues)
- Skip parallel hypothesis testing for trivial cases
- Confirm there is one direct, cause-aligned repair. If meaningful alternatives
  remain, escalate to Standard or Deep before implementation.

**Output:** `✓ Step 2: Diagnosed - Root cause: [brief description]`

### Step 3: Fix & Verify
Implement the fix directly.
- Make minimal changes
- Follow existing patterns
- Preserve the opening constraints and non-goals

**Verification:** Run the project's narrow typecheck, lint, build, and test
commands directly. Split independent commands across verification workers only
when delegation was explicitly requested and the runtime permits it.

**Before/After comparison:** Re-run the EXACT command from pre-fix state capture. Compare output.

See `references/parallel-exploration.md` for patterns.

**Output:** `✓ Step 3: Fixed - [N] files, verified (types/lint passed)`

### Step 4: Review + Prevent
Use `code-reviewer` for a quick review when delegation is permitted; otherwise
perform the same explicit side-effect sweep locally.

Prompt: "Quick review of fix for [issue]. Check: (a) acceptance criteria met, (b) no regression to business logic in blast-radius from Step 1 scout, (c) no breaking changes to public contracts (signatures, schemas, APIs, env vars), (d) follows existing patterns, (e) no new lint/type/build errors. Score X/10. Explicitly flag any side effects."

See HARD-GATE-NO-SIDE-EFFECTS in SKILL.md — on reviewer-flagged regression → `ask_user capability` with 2-4 options (revert / narrow / update dependents / accept).

**Prevention (abbreviated for Quick):**
- Type errors/lint: type system IS the test → regression test optional
- Bug fixes: add at least 1 test covering the fixed scenario
- Still require before/after comparison of verification output

**Review handling:** See `references/review-cycle.md`

**Output:** `✓ Step 4: Review [score]/10 - [prevention measures]`

### Step 5: Report
Report summary to user (root cause, files changed, prevention).

**Output:** `✓ Step 5: Reported`

### Step 6: Finalize (MANDATORY — every fix)
1. **Activate `av:pm` (MANDATORY)** → sync plan status if the fix is part of a plan, update progress, and refresh runtime tracking when available.
2. Evaluate docs impact; use `docs-manager` only when a routed authority surface changed.
3. Reflect completion in the live task-management surface when available.
4. Ask whether the user wants a commit; on approval, use the git workflow or
   spawn `git-manager` when delegation is permitted.
5. Run `/av:journal` to log decisions — unless the invocation carries `--skip-journal` (see "Journal step — opt-out" in SKILL.md).

**Output:** `✓ Step 6: Finalized - sync-back <status>, commit <sha | declined>, journal <status>`

## Skills/Subagents Activated

| Step | Skills/Subagents |
|------|------------------|
| 1 | `av:scout` (minimal) or direct file read |
| 2 | `av:debug`, `av:sequential-thinking` |
| 3 | Direct verification commands; optional workers when permitted |
| 4 | Independent review; delegated `code-reviewer` when permitted |
| 5 | Report |
| 6 | `av:pm` (MANDATORY), conditional `docs-manager`, authorized commit workflow or `git-manager`, `/av:journal` (unless the shared "Journal step — opt-out" applies — see SKILL.md) |

**Extra:** `av:context-engineering` if dealing with AI/LLM code

## Notes

- Skip if review fails → escalate to Standard workflow
- Total steps: 6
- No planning phase needed
- Opening brainstorm contract is inherited from the parent skill
- Pre-fix state capture is STILL mandatory (even for quick fixes)
- Step 6 finalize is MANDATORY for every fix — `av:pm` is NOT optional

# Complexity Assessment

Classify issue complexity before routing to workflow. Assessment happens AFTER Step 1 (Scout) and Step 2 (Diagnose).

## Classification Criteria

### Simple (→ workflow-quick.md) — No Tasks

**Indicators:**
- Single file affected
- Clear error message (type error, syntax, lint)
- Keywords: `type`, `typescript`, `tsc`, `lint`, `eslint`, `syntax`
- Obvious fix location
- Root cause confirmed by diagnosis (not assumed)

**Task usage:** Skip. < 3 steps, overhead exceeds benefit.

**Examples:**
- "Fix type error in auth.ts"
- "ESLint errors after upgrade"
- "Syntax error in config file"

### Moderate (→ workflow-standard.md) — Use Tasks (6 phases)

**Indicators:**
- 2-5 files affected
- Root cause identified but fix spans multiple files
- Needs investigation to confirm diagnosis
- Keywords: `bug`, `broken`, `not working`, `fails sometimes`
- Test failures with root cause traced

**Progress tracking:** Record the six phase dependencies in the active plan and mirror them into the live task-management surface when available.

**Examples:**
- "Login sometimes fails"
- "API returns wrong data"
- "Component not rendering correctly"

### Complex (→ workflow-deep.md) — Use Tasks with Dependency Chains (9 phases)

**Indicators:**
- System-wide impact (5+ files)
- Architecture decision needed
- Research required for solution
- Keywords: `architecture`, `refactor`, `system-wide`, `design issue`
- Performance/security vulnerabilities
- Multiple interacting components
- Root cause spans multiple layers/modules

**Progress tracking:** Record all nine phases and their dependencies. Steps 1+2+3 may run in parallel; mirror the plan into the live task-management surface when available.

**Examples:**
- "Memory leak in production"
- "Database deadlocks under load"
- "Security vulnerability in auth flow"

### Parallel (→ multiple fullstack-developer agents) — Use Task Trees

**Triggers:**
- `--parallel` flag explicitly passed (activate parallel routing regardless of auto-classification)

**Indicators:**
- 2+ independent issues mentioned
- Issues in different areas (frontend + backend, auth + payments)
- No dependencies between issues
- Keywords: list of issues, "and", "also", multiple error types

**Progress tracking:** Keep a separate dependency tree per independent issue (scout+diagnose+fix+verify) and assign one non-overlapping scope per agent.

**Examples:**
- "Fix type errors AND update UI styling"
- "Auth bug + payment integration issue"
- "3 different test failures in unrelated modules"

## Ultra Verifier Mode (`--ultra`)

When `--ultra` is present, run Steps 0-2 once — the confirmed diagnosis joins
one immutable evidence packet — then fan ONLY the Step 3 solution selection and
fix-plan generation to exactly five independent read-only candidates in one
parallel wave; a single strongest-model verifier scores them.

- **Candidate task:** each candidate produces a complete fix plan — chosen
  repair, files to touch, ordered changes, risk notes, and verification steps —
  grounded in the confirmed diagnosis. Candidates never re-derive the confirmed
  root cause and never edit files.
- **Rubric:** cause-alignment (fixes the root cause, not the symptom), blast-
  radius safety, minimality, and verifiability of the plan's acceptance steps.
- **Finalizer:** the verifier selects the single winning fix plan unchanged (or
  rejects all); Steps 4-6 execute once from the winner. On reject-all,
  hard-stop and report why.

`--ultra` hard-conflicts with `--quick` and `--parallel` (quick skips the
deliberation ultra exists for; parallel owns the multi-agent strategy) — on
either combination, hard-stop and ask. Full mechanics are in
`../../av-brainstorm/references/ultra-verifier-mode.md`. It is a best-of-5
verifier mode inspired by LLM-as-a-Verifier, not the full framework.

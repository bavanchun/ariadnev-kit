---
name: av:debug
description: "Debug systematically, proving root cause before any fix. Use for bugs, test failures, CI/CD and server incidents, performance degradation, and log analysis. Diagnoses; does not apply the fix."
user-invocable: true
when_to_use: "Invoke when root cause must be proven before a fix."
category: utilities
keywords: [debug, root-cause, bugs, test-failures]
languages: all
argument-hint: "[error or issue description]"
metadata:
  origin: ported
  author: upstream
  version: "4.0.0"
---

# Debugging & System Investigation

Comprehensive framework combining systematic debugging, root cause tracing, defense-in-depth validation, verification protocols, and system-level investigation (logs, CI/CD, databases, performance).

## Core Principle

**NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST**

Random fixes waste time and create new bugs. Find root cause, fix at source, validate at every layer, verify before claiming success.

## When to Use

**Code-level:** Test failures, bugs, unexpected behavior, build failures, integration problems
**System-level:** Server errors, CI/CD pipeline failures, performance degradation, database issues, log analysis
**Always:** Before claiming work complete

## Techniques

### 1. Systematic Debugging (`references/systematic-debugging.md`)

Four-phase framework: Root Cause Investigation → Pattern Analysis → Hypothesis Testing → Implementation. Complete each phase before proceeding. Run phases 1-2 here and form the phase-3 hypothesis; the phase-3 minimal test and phase 4 Implementation both change code, so both belong to `av:fix`, and this skill hands it the diagnosis.

**Load when:** Any bug/issue requiring investigation and fix

### 2. Root Cause Tracing (`references/root-cause-tracing.md`)

Trace bugs backward through call stack to find original trigger. Fix at source, not symptom. Includes `scripts/find-polluter.sh` for bisecting test pollution.

**Load when:** Error deep in call stack, unclear where invalid data originated

### 3. Defense-in-Depth (`references/defense-in-depth.md`)

Specify the validation layers the fix should add: Entry validation → Business logic → Environment guards → Debug instrumentation. This skill names the layers; `av:fix` writes them.

**Load when:** After finding root cause, need comprehensive validation

### 4. Verification (`references/verification.md`)

**Iron law:** NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE. Run command. Read output. Then claim result.

**Load when:** About to claim work complete, fixed, or passing

### 5. Investigation Methodology (`references/investigation-methodology.md`)

Five-step structured investigation for system-level issues: Initial Assessment → Data Collection → Analysis → Root Cause ID → Solution Development

**Load when:** Server incidents, system behavior analysis, multi-component failures

### 6. Log & CI/CD Analysis (`references/log-and-ci-analysis.md`)

Collect and analyze logs from servers, CI/CD pipelines (GitHub Actions), application layers. Tools: `gh` CLI, structured log queries, correlation across sources.

**Load when:** CI/CD pipeline failures, server errors, deployment issues

### 7. Performance Diagnostics (`references/performance-diagnostics.md`)

Identify bottlenecks, analyze query performance, develop optimization strategies. Covers database queries, API response times, resource utilization.

**Load when:** Performance degradation, slow queries, high latency, resource exhaustion

### 8. Reporting Standards (`references/reporting-standards.md`)

Structured diagnostic reports: a full template, the P0/P1/P2 recommendation
bands, and a report file-naming example.

**Load when:** Need to produce investigation report or diagnostic summary

### 9. Investigation Tracking (`references/task-management-debugging.md`)

For multi-step investigations, discover the live task-management surface and
use it to track dependencies, ownership, and parallel evidence collection when
available. Otherwise, update the active plan. Plan files are the durable source of truth,
so debugging never depends on a particular client's task API.

**Load when:** Multi-component investigation (3+ steps), parallel log collection, coordinating debugger subagents

### 10. Frontend Verification (`references/frontend-verification.md`)

Visual verification of frontend implementations via `av:agent-browser`, `av:chrome-profile`, Chrome MCP / `chrome-devtools-mcp`, or project-native browser tests. Use `av:chrome-profile` and its exact tab binding when real Chrome profile state matters; raw Chrome MCP navigation is only for generic/profile-independent inspection. Detect if frontend-related -> check browser tool availability -> screenshot + console error check -> report. Skip if not frontend.

**Load when:** Implementation touches frontend files (tsx/jsx/vue/svelte/html/css), UI bugs, visual regressions

## Quick Reference

```
Code bug       → systematic-debugging.md (Phases 1-2 + the hypothesis; testing it and phase 4 are av:fix)
  Deep in stack  → root-cause-tracing.md (trace backward)
  Found cause    → defense-in-depth.md (specify layers)
  Claiming done  → verification.md (verify first)

System issue   → investigation-methodology.md (5 steps)
  CI/CD failure  → log-and-ci-analysis.md
  Slow system    → performance-diagnostics.md
  Need report    → reporting-standards.md

Frontend fix   → frontend-verification.md (agent-browser/chrome-profile/Chrome MCP)
```

## Tools Integration

- **Database:** `psql` for PostgreSQL queries and diagnostics
- **CI/CD:** `gh` CLI for GitHub Actions logs and pipeline debugging
- **Codebase:** `av:docs-seeker` skill for package/plugin docs; `av:repomix` skill for codebase summary
- **Scouting:** `/av:scout` or `/av:scout ext` for finding relevant files
- **Frontend:** `av:agent-browser`, `av:chrome-profile`, Chrome MCP / `chrome-devtools-mcp`, or project-native browser tests for visual verification. For real profile state, let `chrome-profile open --json` create the tab and bind to its returned selector before using MCP inspection tools.
- **Skills:** Activate `av:problem-solving` skill when stuck on complex issues

## Red Flags

Stop and follow process if thinking:
- "Quick fix for now, investigate later"
- "Just try changing X and see if it works"
- "It's probably X, let me fix that"
- "Should work now" / "Seems fixed"
- "Tests pass, we're done"

**All mean:** Return to systematic process.

## Output format

Every investigation returns this, whatever its size:

- **Symptom** — what was observed, and the exact command or request that shows it.
- **Root cause** — one sentence, naming the `file:line` where the defect lives,
  or the narrowest boundary reached when Status is `Under investigation`.
- **Evidence** — the log excerpt, failing assertion, query plan, or trace that
  proves it. Label each item `confirmed` or `hypothesis`; an investigation that
  ends with only hypotheses says so in the Status.
- **Status** — one of `Resolved` / `Mitigated` / `Under investigation`.
- **Recommended fix** — what to change and where, banded `P0` / `P1` / `P2`.
  This skill names the fix; it does not apply it.
- **Unresolved questions** — or "none".

For a system-level incident, expand this into the report template in
`references/reporting-standards.md`, which owns the priority bands and the
report file-naming example. Follow its `## Template` block, which is the
concrete artifact; where its prose section list differs, the template wins.

## Quality gates

- [ ] Root cause is proven, not guessed — the evidence would convince someone
      who disagreed, and correlation is distinguished from causation
- [ ] No production code was changed; the fix is described, not applied
- [ ] Every item in Evidence is labelled `confirmed` or `hypothesis`, and the
      Status matches — an investigation carrying only hypotheses is not
      `Resolved`
- [ ] The symptom was reproduced and the reproducing command is in the report —
      or the report states it is not reproducible and says what evidence was
      gathered instead
- [ ] Anything still unexplained is listed rather than absorbed into a
      confident-sounding summary
- [ ] For a frontend defect, the browser check ran and its console output was
      read — or the "visual verification skipped" line from
      `references/frontend-verification.md` is in the report; the UI was never
      judged from source alone

## Workflow position

**Typically follows:** `av:scout` once the relevant files are located, or a
failing `av:test` run that produced the symptom.
**Typically precedes:** `av:fix` to apply the diagnosed fix — this skill hands
over a cause and a location, never an edit — or `av:brainstorm` when several
viable fixes remain and the choice is a design decision.
**Related:** `av:problem-solving` reframes an investigation that has stalled;
`av:docs-seeker` and `av:repomix` supply external docs and codebase context
during collection; `av:agent-browser` and `av:chrome-profile` provide the visual
verification path for frontend defects.

---
"vcskill": minor
---

vc kit v2: full 13-agent roster + repository-harness distill + 9 new skills.

- **New agents** (`kit/agents/vc-*.md`, 13 total): `vc-explore`, `vc-planner`,
  `vc-reviewer`, `vc-tester`, `vc-debugger`, `vc-developer`, `vc-git-manager`,
  `vc-simplifier`, `vc-brainstormer`, `vc-researcher`, `vc-docs-manager`,
  `vc-project-manager`, `vc-journal-writer`. Persona + behavioral checklist +
  status protocol, no external CLI coupling; install alongside existing
  ClaudeKit agents without name conflicts.
- **New agent lint gate**: `packages/cli/src/kit/agent-lint.ts`, enforced in
  `loadKit` same as the skill gate — frontmatter contract, description
  `<example>`/`<commentary>` requirement, ≤120 lines, required
  `Behavioral Checklist` heading.
- **New hook**: `subagent-init` (SubagentStart) injects ~200 tokens of
  context into spawned subagents. `session-state` enriched with a git-status
  trace (files-changed + outcome).
- **New rules**: `kit/rules/development-rules.md`, `delegation-protocol.md`,
  `intake-and-context.md` (authority gate, risk lanes, context budget, and
  harness-delta distilled from the `repository-harness` project) replace the
  sample placeholder.
- **9 new skills**: `vc:skill-creator`, `vc:journal`, `vc:sequential-thinking`,
  `vc:docs-seeker`, `vc:bootstrap`, `vc:security-scan`, `vc:predict`,
  `vc:scenario`, `vc:worktree`. Roster: 12 → 21 skills.
- **BREAKING (kit content)**: removed `kit/agents/sample-reviewer.md`,
  `kit/commands/sample-cmd.md`, `kit/rules/sample-rule.md` placeholders.
- `vc:cook` gained risk-lane routing (`references/risk-lanes.md`) with a
  mandatory confirm gate for high-risk changes; `vc:pm` and `vc:cook`'s
  test-gate share a unit/integration/e2e/platform proof vocabulary; `vc:docs`
  gained a `decision` mode for durable architecture records.

Full parity analysis against ClaudeKit for every new agent/skill — capability
coverage plus concrete improvements — recorded in
`plans/reports/parity-260720-*.md`.

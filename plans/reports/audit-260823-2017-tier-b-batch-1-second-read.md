# Audit — Tier B batch 1 second read

Reader scope: author commit `c7117ef`, covering `cook`, `design`, `fix`,
`markdown-novel-viewer`, and `mcp-builder`. Commands, flags, scripts, linked
references, workflow neighbours, and evaluation trigger terms were checked
against the repository. Current MCP SDK claims were also checked against the
official MCP documentation and SDK READMEs named by the skill.

## cook

- [contract-mismatch] `references/workflow-routing.md:10` routes feature work
  from `av:cook` into standalone `av:test` and `av:code-review`, although
  `SKILL.md:185-193` makes testing and review stages inside `av:cook` mandatory.
  The sequence would perform both stages twice.
- [contract-mismatch] `references/subagent-patterns.md:10` lists `av:scout` in
  the Subagent column, while the concrete launch example on line 31 names the
  `scout` subagent. `av:scout` is a skill activation, not a subagent type.
- [contract-mismatch] `references/subagent-patterns.md:13` says both `tester`
  and `debugger` must spawn, while its debugging section and `SKILL.md:214`
  require `debugger` only when tests fail.
- [contract-mismatch] `SKILL.md:198` asks whether the user wants a commit, but
  `SKILL.md:215,257` and `references/workflow-steps.md:226` make `git-manager`
  unconditional. The output contract already permits `not committed (user
  declined)`.
- [contract-mismatch] `references/workflow-steps.md:218-223` first restricts
  the no-CLI fallback to one Status table cell, then requires phase checkbox
  and frontmatter changes. It also conflicts with the shared files-first rule
  that plan state is not hand-edited when the CLI workflow is unavailable.
- [overclaim] `references/workflow-steps.md:234` always reports "3 subagents
  invoked" although `docs-manager` is conditional, `av:pm` is a skill, and a
  declined commit means no `git-manager` run.

Count: fabricated 0; overclaim 1; stale 0; contract-mismatch 5; redundant 0.

## design

- [fabricated] `references/poster-prompt-engineering.md:21-26` says
  `--lock-axis` preserves selected axes across calls. The parser accepts the
  flag at `scripts/poster/generate.py:131-132`, but the value is never read.
- [overclaim] `SKILL.md:142-144` and `references/poster-design.md:39,69` say
  repeated calls with only the same `--style` lock palette and texture and
  guarantee a cohesive series. The script independently selects palette and
  texture at lines 160-164 unless `--palette` and `--texture` are also passed.
- [contract-mismatch] `SKILL.md:160` refers to "auto mode", but this skill
  defines no such invocation mode. The relevant condition is explicit caller
  authorization for autonomous choices.
- [overclaim] `SKILL.md:182-184` requires a command and model for every asset,
  although HTML/CSS or manually composed deliverables can have neither an
  image-generation model nor a generator command.
- [contract-mismatch] `SKILL.md:204-205` applies a texture-lock requirement to
  logo series, although the logo generator has no texture axis.
- [contract-mismatch] `references/poster-prompt-engineering.md:7` says every
  prompt has five blocks, but the numbered contract immediately lists seven.
- [overclaim] `references/poster-prompt-engineering.md:17,30-32` guarantees
  per-call variety and computes fixed entropy from a nine-cell position pool
  and four-shape samples. The script samples 2-4 shapes, uses the selected
  layout's focal anchor when present, and does not guarantee unique random
  output across seeds.

Count: fabricated 1; overclaim 3; stale 0; contract-mismatch 3; redundant 0.

## fix

- [contract-mismatch] `SKILL.md:134-146` unconditionally launches parallel
  `Explore` subagents during scouting and diagnosis, while
  `references/skill-activation-matrix.md:23,47-48` permits delegation only when
  explicitly requested and available.
- [contract-mismatch] `SKILL.md:187,215-216` makes delegated `code-reviewer`
  mandatory, while `references/workflow-standard.md:95-96` and the other
  workflow references provide a local review fallback.
- [contract-mismatch] `references/skill-activation-matrix.md:52` places
  `av:code-review` in the Subagent table. It is a skill; the actual subagent
  named elsewhere is `code-reviewer`.
- [fabricated] `references/workflow-quick.md:36-41` shows
  `delegate_agent capability("run_shell", ...)`, which is not the delegation
  shape used by this kit and treats a shell capability as an agent type.
- [contract-mismatch] `references/workflow-quick.md:74` always spawns
  `git-manager`, while the parent skill and standard workflow ask for commit
  authorization first.
- [contract-mismatch] `references/workflow-deep.md:29,44` starts diagnosis in
  parallel with scouting, although the hard scout-first gate requires affected
  paths and pre-fix evidence before hypotheses are diagnosed.

Count: fabricated 1; overclaim 0; stale 0; contract-mismatch 5; redundant 0.

## markdown-novel-viewer

- [contract-mismatch] `SKILL.md:124` names bare `/av:preview --html` as a
  complete deliverable invocation, but preview's HTML route also requires a
  producer mode such as `--explain`, `--diagram`, `--slides`, or `--diff`.
- [fabricated] `SKILL.md:137` presents `av:plans-kanban` as a working plan
  dashboard. The phase handoff records that the dashboard premise has no real
  CLI/config implementation and is awaiting a coordinator decision.
- [overclaim] `references/reader-guide.md:118` concludes that all 45 unavailable
  ports mean 45 viewers are running; unrelated processes can own those ports.
- [overclaim] `references/reader-guide.md:120` advises deleting PID files when a
  server will not stop without first proving the PID file is stale. Removing a
  live viewer's record makes the stop command less able to manage it.
- [stale] `references/reader-guide.md:17` names the upstream AgentKit brand in
  current operational guidance, which violates the repository brand-drift
  contract and is duplicated into the generated embed.

Count: fabricated 1; overclaim 2; stale 1; contract-mismatch 1; redundant 0.

## mcp-builder

- [overclaim] `SKILL.md:39-40` calls `llms-full.txt` the complete protocol
  specification. It is the full MCP documentation corpus, including guides and
  tutorials; the dated specification is one part of it.
- [overclaim] `SKILL.md:48-51` requires reading "ALL available" service API
  documentation, an unbounded condition unrelated to the selected workflows.
- [stale] `SKILL.md:59-62,74-78` requires Pydantic models for every Python tool
  and Zod `.strict()` for every TypeScript tool. The current Python SDK accepts
  typed function parameters and reserves Pydantic models for structured or
  complex inputs; the current TypeScript SDK accepts Standard Schema, with Zod
  v4 as one supported choice.
- [contract-mismatch] `references/agent-centric-design.md:55` and the language
  guide checklists restate the stale Pydantic/Zod-only rule, so following the
  referenced checklist would override the current SDK guidance fetched in
  Phase 1.

Count: fabricated 0; overclaim 2; stale 1; contract-mismatch 1; redundant 0.

## Summary

| Skill | Fabricated | Overclaim | Stale | Contract mismatch | Substantive total |
|---|---:|---:|---:|---:|---:|
| cook | 0 | 1 | 0 | 5 | 6 |
| design | 1 | 3 | 0 | 3 | 7 |
| fix | 1 | 0 | 0 | 5 | 6 |
| markdown-novel-viewer | 1 | 2 | 1 | 1 | 5 |
| mcp-builder | 0 | 2 | 1 | 1 | 4 |
| **Total** | **3** | **8** | **2** | **15** | **28** |

No description-routing regression was found: each rewritten description remains
under 200 characters, starts with a trigger verb, and retains overlap with its
evaluation scenarios. All linked plural-reference files exist. The five skills
are absent from `kit/skills-lint-exempt.json`, and the frozen-corpus benchmark
was regenerated in the author commit for `cook` and `fix`.

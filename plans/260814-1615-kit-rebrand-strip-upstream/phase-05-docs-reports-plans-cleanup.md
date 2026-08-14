---
phase: 5
title: "Docs + reports + plans cleanup"
status: pending
priority: P1
effort: "2h"
dependencies: [4]
---

# Phase 05: Docs + Reports + Plans Cleanup

## Overview
Purge obsolete upstream-centric documentation, historical distillation plan trees, legacy reports, and agent memory artifacts, while rewriting remaining documentation to present a clean, native vcskill identity.

## Requirements
- Functional:
  - Delete legacy plan directories:
    - `plans/260812-1214-distill-ak-2120-full/`
    - `plans/260724-1628-distill-agentkit-wave0-wave1/`
  - Delete legacy reports:
    - `plans/reports/handoff-260814-1548-wave-0-close.md`
    - `plans/reports/analysis-260814-1608-tier2-baseline-observation-gap.md`
    - `plans/reports/advise-260804-1005-core-harness-distillation.md`
    - `plans/reports/brainstorm-260724-1615-distill-agentkit-into-vcskill.md`
    - `plans/reports/handoff-260724-1641-vcskill-distill-and-landing.md`
  - Delete legacy architectural decisions and roadmaps:
    - `docs/decisions/0003-comprehensive-distillation-identity.md`
    - `docs/distillation-roadmap.md`
    - `.claude/agent-memory/kongming/project_distill-ak-2120.md`
  - Sanitize remaining files:
    - `plans/260804-1039-vc-skill-set-update-compliance-sweep-and-tier-1-reshape/`
    - `AGENTS.md`
    - `docs/vc-skill-authoring-spec.md`
- Non-functional:
  - Repository-wide grep across docs, plans, and configuration returns zero upstream or distillation vocabulary.

## Architecture
```
Target Cleanup Zones:
├── plans/
│   ├── 260812-1214-distill-ak-2120-full/      [DELETED]
│   ├── 260724-1628-distill-agentkit-wave0-wave1/ [DELETED]
│   └── reports/*.md (distill-focused)         [DELETED]
├── docs/
│   ├── decisions/0003-*.md                    [DELETED]
│   ├── distillation-roadmap.md                [DELETED]
│   └── vc-skill-authoring-spec.md             [SANITIZED]
└── AGENTS.md                                  [SANITIZED]
```

## Related Code Files
- Delete:
  - `plans/260812-1214-distill-ak-2120-full/` (all files)
  - `plans/260724-1628-distill-agentkit-wave0-wave1/` (all files)
  - `plans/reports/handoff-260814-1548-wave-0-close.md`
  - `plans/reports/analysis-260814-1608-tier2-baseline-observation-gap.md`
  - `plans/reports/advise-260804-1005-core-harness-distillation.md`
  - `plans/reports/brainstorm-260724-1615-distill-agentkit-into-vcskill.md`
  - `plans/reports/handoff-260724-1641-vcskill-distill-and-landing.md`
  - `docs/decisions/0003-comprehensive-distillation-identity.md`
  - `docs/distillation-roadmap.md`
  - `.claude/agent-memory/kongming/project_distill-ak-2120.md`
- Modify:
  - `AGENTS.md`
  - `docs/vc-skill-authoring-spec.md`
  - `plans/260804-1039-vc-skill-set-update-compliance-sweep-and-tier-1-reshape/*`

## Implementation Steps
1. Execute deletion of specified plan directories and report files.
2. Remove deprecated decision records and roadmap documents from `docs/`.
3. Check `.claude/agent-memory/` and remove stale distill context files.
4. Open and edit `AGENTS.md` to ensure instructions reference native `vcskill` terminology.
5. Review `docs/vc-skill-authoring-spec.md` to align all conventions with native kit authoring standards.
6. Execute dry-run grep across all text and markdown files in the repository:
   ```bash
   grep -rIE "distill|distillation|upstream|AK 2\.|agentkit|AgentKit|ak:" \
     --include="*.md" --include="*.ts" --include="*.json" --include="*.yml" . \
     | grep -v node_modules | grep -v ".git/" | grep -v "worktrees/vcskill-baseline/" | grep -v "260814-1615-kit-rebrand-strip-upstream"
   ```

## Success Criteria
- [ ] All specified legacy files and directories removed.
- [ ] `AGENTS.md` and `docs/vc-skill-authoring-spec.md` rewritten with clean kit vocabulary.
- [ ] Grep query returns 0 hits across all active documents.

## Risk Assessment
- **Risk:** Important historical decisions or architectural context accidentally lost during deletions.
  - **Observable Signal:** Team unable to trace reasons for specific skill optimizations.
  - **Response:** All relevant design rationales are preserved in `kit/decisions.json` claims with clean native phrasing; Git tag `pre-rebrand-backup` preserves full history if emergency lookup is required.

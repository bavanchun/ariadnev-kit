---
phase: 4
title: "SKILL.md frontmatter strip (25 files)"
status: pending
priority: P1
effort: "1.5h"
dependencies: [3]
---

# Phase 04: SKILL.md Frontmatter Strip (25 Files)

## Overview
Sanitize all 25 skill definition files in `kit/skills/*/SKILL.md` by purging all upstream metadata properties from YAML frontmatter blocks and scrubbing any upstream references from markdown body text.

## Requirements
- Functional:
  - Remove all occurrences of:
    - `metadata.upstream`
    - `metadata.upstream_version`
    - `metadata.upstream_digest`
    - `metadata.upstream_relation`
  - Inspect the markdown content of all 25 `SKILL.md` files; sanitize any phrases referring to upstream kits (e.g. `"Adapted from ak:*"`, `"Based on AgentKit 2.x"`, `"Upstream behavior:"`).
  - Ensure all YAML frontmatter blocks remain strictly valid YAML and retain standard fields (`name`, `description`, `version`, `tags`, etc.).
- Non-functional:
  - Functional behavior of skills must remain 100% intact (zero changes to execution instructions or prompts).

## Architecture
```
Before in kit/skills/<skill>/SKILL.md:
---
name: "my-skill"
description: "..."
metadata:
  upstream: "ak:my-skill"       <-- REMOVED
  upstream_version: "2.12.0"    <-- REMOVED
  upstream_digest: "sha256..."  <-- REMOVED
  upstream_relation: "distill"  <-- REMOVED
---

After:
---
name: "my-skill"
description: "..."
---
```

## Related Code Files
- Modify:
  - All 25 files matching `kit/skills/*/SKILL.md`

## Implementation Steps
1. Enumerate all 25 target files under `kit/skills/*/SKILL.md`.
2. Process each file programmatically or via editor pass:
   - Strip YAML keys: `upstream`, `upstream_version`, `upstream_digest`, `upstream_relation` under `metadata`.
   - If `metadata` becomes empty, cleanly remove the empty `metadata:` block or preserve other valid fields.
3. Review body text in all 25 `SKILL.md` files:
   - Search for `ak:`, `AgentKit`, `upstream`, `distill`.
   - Paraphrase cleanly to reflect native `vcskill` terminology without breaking operational prompts.
4. Validate YAML syntax for all 25 files using a YAML parser / test script.
5. Run grep gate:
   ```bash
   grep -rE "metadata.upstream|upstream_version|upstream_digest|upstream_relation" kit/skills/
   grep -rE "ak:|AgentKit" kit/skills/
   ```

## Success Criteria
- [ ] All 25 `SKILL.md` files updated with valid YAML frontmatter.
- [ ] Zero instances of `upstream_` fields in `kit/skills/`.
- [ ] Zero instances of `ak:` or `AgentKit` in `kit/skills/`.
- [ ] Skill prompt behavior preserved without regression.

## Risk Assessment
- **Risk:** Malformed YAML frontmatter breaks skill parser loading in CLI.
  - **Observable Signal:** `vitest` fails on skill loader tests with YAML syntax error.
  - **Response:** Run automated YAML validation script on all 25 files before completing the phase.

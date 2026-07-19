---
"vcskill": minor
---

vc kit core loop A + hooks harness.

- **BREAKING (kit content)**: `vc:vchun-git` renamed to `vc:git` — the skill
  now installs to `skills/git/`; update any `/vc:vchun-git` habits to
  `/vc:git`. The old `vchun-git` install dir is not auto-removed.
- New skills: `vc:brainstorm`, `vc:cook` (embedded test + review gates),
  `vc:plan` (CLI-free plan scaffolding).
- New `hook` artifact kind: `kit/hooks/` ships 5 Claude Code hooks
  (session-init, rules-inject, privacy-block, scout-block, session-state)
  with fail-open behavior and node:test coverage. Installing to claude-code
  copies hook files and offers a confirmed, idempotent `settings.json` merge;
  other providers skip-and-log.
- Skill lint gate: frontmatter contract, description trigger lint, 300-line
  limits enforced at load time (`docs/vc-skill-authoring-spec.md`).

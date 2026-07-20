---
"vcskill": minor
---

vc kit v3b: anti-bloat + infra.

- **New**: `vcskill validate` — lint the kit source without installing it.
  Runs the same `loadKit` checks the installer does (frontmatter, sizes,
  duplicate names, hook manifests) plus reference integrity: it flags a
  `references/x.md` that is linked-but-missing (dangling) or exists-but-unlinked
  (orphan). Exit 0 clean / 1 on findings; wired as a CI gate. On its first run
  it caught three real orphans manual review had missed.
- `vc:pm` sync-back gains a **disposition-on-close** step (distill durable
  decisions to `docs/`, then delete the finished plan + its reports — git is the
  archive) and a friction-routing step (repeat friction → `vc:journal`).
- `kit/hooks/README.md` documents all 6 hooks (event, purpose, fail-open
  contract).

vcskill now ships 9 CLI commands.

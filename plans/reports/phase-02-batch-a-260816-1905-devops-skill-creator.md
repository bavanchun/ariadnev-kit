# Phase 2 Batch A — devops + skill-creator reference debt

## Files decided

### `kit/skills/devops/` (11 files) — all LINKED via indexed `## References` section

The former "Reference Navigation" section already listed every file by bare filename
(`cloudflare-platform.md`) instead of the required `references/cloudflare-platform.md`
form, so the checker never matched it — that was the entire cause of the 11 orphans.
All 11 files are real, substantive deep-dive docs (setup, API usage, patterns,
troubleshooting, resources) with no single natural insertion point in the terse
SKILL.md body, so the fix was to keep the existing structure but rename the section
to `## References`, fix each path to the `references/<name>.md` form, and replace the
short labels with one-line purpose descriptions.

| File | Decision | Purpose line |
|---|---|---|
| references/cloudflare-platform.md | Index | Edge computing model, architecture patterns, wrangler CLI essentials |
| references/cloudflare-workers-basics.md | Index | Handler types (fetch/scheduled/queue/email), routing, bindings, deployment |
| references/cloudflare-workers-advanced.md | Index | Session reuse, multi-tier caching, WebSockets, code splitting, performance tuning |
| references/cloudflare-workers-apis.md | Index | Runtime APIs (fetch, HTMLRewriter, WebSockets, Web Crypto, bindings reference) |
| references/cloudflare-r2-storage.md | Index | Object storage: S3 API integration, multipart uploads, lifecycle rules, migration |
| references/cloudflare-d1-kv.md | Index | D1 SQLite and KV store setup, usage patterns, and decision matrix |
| references/browser-rendering.md | Index | Puppeteer/Playwright automation: screenshots, PDFs, session reuse, crawling |
| references/docker-basics.md | Index | Dockerfile patterns, image building, container/volume/network management |
| references/docker-compose.md | Index | Multi-container orchestration, environment-specific configs, health checks |
| references/gcloud-platform.md | Index | gcloud CLI install, authentication, configuration management, CI/CD integration |
| references/gcloud-services.md | Index | Compute Engine, GKE, Cloud Run, App Engine, Cloud SQL, BigQuery commands |

No deletions in devops — every file is live, accurate reference content for a
platform the skill explicitly supports (Cloudflare, Docker, GCP).

### `kit/skills/skill-creator/` (10 files) — 4 linked inline, 6 indexed

| File | Decision | Purpose / insertion point |
|---|---|---|
| references/yaml-frontmatter-reference.md | Link | Creation Workflow step 5 "Write" — inline: `write SKILL.md frontmatter (references/yaml-frontmatter-reference.md)` |
| references/testing-and-iteration.md | Link | Creation Workflow step 6 "Test & Evaluate" — inline: `(references/testing-and-iteration.md)` |
| references/troubleshooting-guide.md | Link | Creation Workflow step 9 "Iterate" — inline: `diagnose stuck skills with references/troubleshooting-guide.md` |
| references/writing-effective-instructions.md | Link | End of "SKILL.md Writing Rules" section — new line: `Full guide, including structure template and error-handling patterns: references/writing-effective-instructions.md` |
| references/distribution-guide.md | Index | Distributing skills to individuals, orgs, and via the API; packaging and positioning |
| references/mcp-skills-integration.md | Index | How MCP connectivity and skills combine, and how to write MCP-enhanced skill instructions |
| references/plugin-marketplace-schema.md | Index | Full JSON schema for `.claude-plugin/marketplace.json` |
| references/plugin-marketplace-sources.md | Index | Plugin source types (relative path, GitHub, git) for marketplace entries |
| references/plugin-marketplace-hosting.md | Index | Hosting a marketplace on GitHub/GitLab, private-repo auth, team install config |
| references/plugin-marketplace-troubleshooting.md | Index | Fixes for marketplace load, validation, and plugin install failures |

Rationale for link vs. index split: the 4 linked files each map to one specific step
in the numbered Creation Workflow (or to the existing "SKILL.md Writing Rules"
section) — the body genuinely needed a deeper reference at that exact point. The 6
indexed files (distribution mechanics, MCP integration story, and the four
plugin-marketplace sub-topics already summarized by `plugin-marketplace-overview.md`)
are real but optional deep dives with no single natural insertion point, so they were
added to a new `## References` list placed right after the existing
"Validation & Distribution" bullets and before "External References". No deletions —
all 10 files are current, non-duplicated content.

## Resulting SKILL.md line counts

- `kit/skills/devops/SKILL.md`: 99 lines (was 100; net -1 after Kubernetes bullet
  simplification) — well under the 300-line budget.
- `kit/skills/skill-creator/SKILL.md`: 143 lines (was 133) — well under the 300-line
  budget. No budget pressure encountered; index form kept both additions small.

## Validate output

```
$ npx tsx packages/cli/src/index.ts validate 2>&1 | grep -E 'devops:|skill-creator:'
(no output)

$ npx tsx packages/cli/src/index.ts validate 2>&1 | tail -1
0 error(s), 30 warning(s)
```

The remaining 30 `warn:orphan` entries belong to other in-flight batches
(threejs, web-testing, and others outside this assignment's scope) — none reference
devops or skill-creator.

## Files modified

- `kit/skills/devops/SKILL.md` (99 lines)
- `kit/skills/skill-creator/SKILL.md` (143 lines)

No reference files were deleted or otherwise touched; only the two SKILL.md files
changed.

Status: DONE
Summary: All 21 orphan files in devops and skill-creator resolved (11 indexed in devops, 4 linked + 6 indexed in skill-creator); devops/skill-creator grep on `av validate` returns nothing, 0 errors overall.
Concerns/Blockers: none — no size-budget pressure, no deletions needed, all purpose lines present.

# AgentWiki Publish Mode (`--wiki`)

How the final reviewed plan is published to AgentWiki. Read when the
invocation carries `--wiki`.

When `--wiki` is present, publish the final reviewed plan artifact to AgentWiki
after validation/red-team gates and after `plan.html` generation when `--html`
is also present.

Deliberate AK divergence from the upstream publish-first default:
`--wiki` is private/workspace-first. Use `agentwiki doc share` by default.
Run `agentwiki doc publish` or `agentwiki sites upload` only when the user
explicitly requests public publishing or a public hosted site.

**Availability check:**
1. Prefer AgentWiki CLI when `command -v agentwiki` succeeds and
   `agentwiki whoami` confirms auth.
2. If CLI is unavailable, use AgentWiki MCP tools when exposed in the session
   for document create/update, file upload, share links, or static site upload.
3. If neither is available or auth fails, do not block plan creation. Report
   "AgentWiki publish skipped" with the exact missing capability.

**Markdown/document publish:**
- Publish a reviewed Markdown artifact. If the plan spans `phase-*.md` files,
  create `{plan-dir}/wiki-publish.md` as a concise combined document or index
  before uploading.
- CLI path:
  ```bash
  agentwiki doc upload "{publish-md}" \
    --title "{plan title}" \
    --description "{short summary}" \
    --category "plans" \
    --tags "av-plan,{repo-slug},{branch}" \
    --json
  agentwiki doc share "{document-id}" --json
  ```
- Capture the returned share URL and include it in the final response. Use
  `agentwiki doc publish "{document-id}" --description "{short summary}" --json`
  only on explicit user request for a public document.

**HTML/static-site publish:**
- For `--html`, keep the self-contained `plan.html` local by default and report
  its path. Upload it as a public hosted site only when the user explicitly asks:
  ```bash
  agentwiki sites upload "{plan-dir}/plan.html" \
    --description "{plan title} - av:plan HTML artifact" \
    --auto-summary
  ```
- Capture the returned site URL and include it in the final response. If
  `--github` is also present, comment on or update the issue with the wiki URL.

**MCP fallback:**
- Use AgentWiki MCP document tools for Markdown content when available
  (`document_create`/`document_update`, upload, share-link equivalents).
- Use MCP static-site upload only if the active toolset exposes that exact
  capability and the user explicitly requested public site upload. Do not fake
  a hosted URL from a raw file upload.

**Security rules:**
- Redact secrets, env values, tokens, customer data, private logs, and
  local-machine-only paths before publishing.
- Prefer repo-relative paths and public-safe summaries.
- Publish only final reviewed artifacts; do not publish intermediate research
  notes unless the user explicitly asks.

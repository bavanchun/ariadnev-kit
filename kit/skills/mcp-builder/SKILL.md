---
name: av:mcp-builder
description: "Build an MCP server that wraps an external service or API. Use for FastMCP (Python) or MCP SDK (Node/TypeScript) servers, tool design with clear schemas and error messages, and tool evaluations."
user-invocable: true
when_to_use: "Invoke when building an MCP server or tool surface."
category: dev-tools
keywords: [MCP, server, tools, integration]
license: Complete terms in LICENSE.txt
argument-hint: "[service or API to integrate]"
metadata:
  origin: ported
  author: upstream
  version: "1.0.0"
---

# MCP Server Development Guide

Build a high-quality MCP (Model Context Protocol) server that lets an LLM
accomplish real tasks against an external service: research the service and
the protocol, plan the tool surface, implement it in Python (FastMCP) or
TypeScript (MCP SDK), review it against the language checklist, then prove
it with an evaluation set the bundled harness can score. Quality is measured
by how well an agent completes realistic tasks with the tools, not by how
many endpoints are wrapped. Does not handle using a server that already
exists (`av:use-mcp`) or wrapping local code that is already written
(`av:agentize`).

## Workflow

```text
[1. Research and plan] → [2. Implement] → [3. Review and build] → [4. Evaluate]
```

### Phase 1: Research and plan

1. **Design principles.** Read `references/agent-centric-design.md` before
   naming a single tool: workflows over endpoints, context budget, actionable
   errors, natural task subdivisions, evaluation-driven development.
2. **MCP protocol.** Fetch `https://modelcontextprotocol.io/llms-full.txt`
   with `web_fetch capability` — the complete specification.
3. **Framework guidance.** Read `reference/mcp-best-practices.md` (naming,
   response formats, pagination, character limits, transports, security).
   Then, for Python, fetch
   `https://raw.githubusercontent.com/modelcontextprotocol/python-sdk/main/README.md`
   and read `reference/python-mcp-server.md`; for Node/TypeScript, fetch
   `https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/README.md`
   and read `reference/node-mcp-server.md`.
4. **The service's API.** Read ALL available documentation: the reference,
   authentication and authorization, rate limiting and pagination, error
   responses and status codes, endpoints and parameters, data models. Use `web_search capability`
   and `web_fetch capability` as needed.
5. **Implementation plan.** Write it in the shape under **Output format**,
   following the checklist in `references/agent-centric-design.md`: tool
   selection, shared utilities, input/output design, error strategy,
   annotations.

### Phase 2: Implement

1. **Project structure.** Python: a single `.py` file, or modules when
   complex, with Pydantic models for input validation. Node/TypeScript: the
   layout in `reference/node-mcp-server.md`, `package.json` + `tsconfig.json`,
   Zod schemas for input validation.
2. **Core infrastructure first.** Shared API request helpers, error handling
   utilities, response formatters (JSON and Markdown), pagination helpers,
   authentication/token management — before any tool.
3. **Tools, one at a time.** For each tool in the plan: an input schema with
   constraints (min/max, regex, ranges), descriptive fields, and examples; a
   docstring/description with a one-line summary, purpose, parameter types
   with examples, the return schema, when to use and when not to, and how to
   proceed on each error; logic that uses the shared utilities, `async`/`await`
   for all I/O, both response formats, pagination, and the character limit;
   and the four annotations (`readOnlyHint`, `destructiveHint`,
   `idempotentHint`, `openWorldHint`).
4. **Language checks.** Python: MCP SDK registration via `@mcp.tool`,
   Pydantic v2 with `model_config`, type hints throughout, async I/O,
   module-level `CHARACTER_LIMIT` and `API_BASE_URL`. Node/TypeScript:
   `server.registerTool`, Zod schemas with `.strict()`, strict mode, no
   `any`, explicit `Promise<T>` return types, `npm run build` configured.

### Phase 3: Review and build

1. **Code quality.** DRY across tools; shared logic extracted; similar
   operations return similar shapes; every external call handled; full type
   coverage; every tool documented.
2. **Build without hanging.** An MCP server is a long-running process that
   waits on stdio or HTTP — running `python server.py` or `node dist/index.js`
   directly blocks the session. Python: `python -m py_compile server.py`,
   then review imports by reading. Node: `npm run build` must succeed and
   produce `dist/index.js`. To exercise the server, use the Phase 4 harness
   (it launches and manages a stdio server itself), run it in tmux, or wrap
   it in `timeout 5s …`.
3. **Checklist.** Walk the "Quality Checklist" at the end of
   `reference/python-mcp-server.md` or `reference/node-mcp-server.md`.

### Phase 4: Evaluate

Read `reference/evaluation.md` for the full guide. Then:

1. **Inspect** the tools and, with READ-ONLY calls, the data they expose.
2. **Write 10 questions**, each independent, read-only, complex (several
   tool calls, real exploration), realistic, verifiable by string
   comparison, and stable over time.
3. **Solve each one yourself** and record the answer.
4. **Run the harness.** `scripts/evaluation.py` needs `pip install -r
   scripts/requirements.txt` (`mcp`, `anthropic`) and `ANTHROPIC_API_KEY`.
   For stdio it launches the server; for `sse`/`http` the server must already
   be running at `-u <url>`:

   ```bash
   python scripts/evaluation.py -t stdio -c python -a my_server.py [-e KEY=VALUE …] [-o report.md] evaluation.xml
   python scripts/evaluation.py -t http -u https://host/mcp [-H "Authorization: Bearer …"] evaluation.xml
   ```

   `-m` picks the Claude model. A task scores 1 only when the text inside the
   agent's `<response>` tags equals the `<answer>` exactly after trimming, so
   answers must be single exact values: a number, an ID, or the precise text.

## Output format

**1. Implementation plan** — Phase 1, before any code, as a markdown file in
the target repo:

```markdown
# MCP server plan: <service>

Language: python (FastMCP) | typescript (MCP SDK) · Transport: stdio | http | sse
Auth: <scheme and where the credential comes from>

| Tool | Workflow it completes | Inputs | Output format(s) | Annotations | Why not a raw endpoint |
| --- | --- | --- | --- | --- | --- |

Shared utilities: <request helper, pagination, formatting, errors, auth>
Limits: CHARACTER_LIMIT=<n> · pagination <strategy> · rate-limit handling <strategy>
Error strategy: <how each error class is worded for the agent>
```

**2. The server** — source tree, build passing, every tool carrying its
schema, description, and annotations.

**3. `evaluation.xml`** — exactly the harness's shape, 10 `qa_pair`s:

```xml
<evaluation>
  <qa_pair>
    <question>…</question>
    <answer>…</answer>
  </qa_pair>
</evaluation>
```

**4. Evaluation report** — what `scripts/evaluation.py` prints (or writes
with `-o`): `# Evaluation Report` with `Accuracy: <correct>/<total> (<pct>%)`,
average task duration, average and total tool calls, then per task the
question, ground truth, actual answer, ✅/❌, duration, tool calls, the
agent's summary, and its feedback on the tools. Report the accuracy line and
every ❌ task with the feedback it produced.

## Quality gates

- [ ] Every tool in the plan completes a workflow an agent would actually
      run; a "first X then Y" sequence in the service's own docs became one
      tool, and no tool exists only because an endpoint does
- [ ] Every tool has an input schema with constraints, a description that
      says when not to use it and what to do on each error, both response
      formats where output can be large, and all four annotations set
- [ ] Responses are bounded by `CHARACTER_LIMIT` with a truncation message
      that tells the agent how to narrow the query; large lists paginate
- [ ] The server was never started directly in the session — compile/build
      checks ran, and execution went through the harness, tmux, or `timeout`
- [ ] The 10 evaluation questions were solved by hand first; every `<answer>`
      is a single exact value the harness's string comparison can match, and
      every question needs only read-only tools
- [ ] The harness ran and its accuracy line is in the report; each ❌ task's
      feedback was turned into a tool change or an explicit decision not to

## Workflow position

**Typically follows:** `av:brainstorm`, when whether to build a server at all
(versus calling the API directly) is still open; `av:research` or
`av:docs-seeker`, when the service's API documentation had to be gathered
first.

**Typically precedes:** `av:use-mcp`, which discovers and calls the finished
server's tools from a runtime; `av:test` for unit and integration tests
beyond the evaluation harness; `av:deploy` or `av:devops` when the server
ships over HTTP rather than stdio.

**Related:** `av:agentize` wraps code that already exists into a CLI and MCP
surface — reach for it when there is a local `core/` to extract rather than a
remote service to integrate. `av:use-mcp` is the consumer side; a request to
discover, validate, or invoke an existing server's tools goes there.

## References

| Read when | File |
| --- | --- |
| Before naming a tool or writing the plan (Phase 1) | `references/agent-centric-design.md` |
| Any server, first (Phase 1) — naming, formats, pagination, limits, transports, security | `reference/mcp-best-practices.md` |
| Python implementation and its quality checklist (Phases 2-3) | `reference/python-mcp-server.md` |
| TypeScript implementation and its quality checklist (Phases 2-3) | `reference/node-mcp-server.md` |
| Writing questions and running the harness (Phase 4) | `reference/evaluation.md`, `scripts/evaluation.py`, `scripts/example_evaluation.xml` |

The four files under `reference/` (singular) predate this kit's `references/`
convention; whether they migrate is a separate decision and not taken here.

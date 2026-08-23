---
name: av:gkg
description: "Use when analyzing code semantically with GitLab Knowledge Graph for definitions, usages, impact analysis, architecture, and supported-language navigation."
user-invocable: true
when_to_use: "Invoke for semantic code navigation and impact analysis."
category: dev-tools
keywords: [code-analysis, knowledge-graph, gitlab]
argument-hint: "[symbol or query]"
metadata:
  origin: ported
  author: upstream
  version: "1.0.0"
---

# GitLab Knowledge Graph (GKG)

Semantic code analysis engine using AST parsing and KuzuDB graph database. Enables IDE-like code navigation for AI assistants.

**Status**: Public beta | **Requires**: Git repository | **Storage**: `~/.gkg/`

## When to Use

- Find all usages of a function/class across codebase
- Go-to-definition for symbols
- Impact analysis before refactoring
- Generate architecture diagrams
- RAG-enhanced code understanding

**Use repomix instead** for: quick context dumps, any-language support, remote repos, token counting.

## Quick Start

```bash
# Check installation
gkg --version

# Index current repo
gkg index

# Start server (for API/MCP)
gkg server start

# Stop before re-indexing
gkg server stop
```

## Installation

```bash
# macOS/Linux
curl -fsSL https://gitlab.com/gitlab-org/rust/knowledge-graph/-/raw/main/install.sh | bash

# Windows (PowerShell)
irm https://gitlab.com/gitlab-org/rust/knowledge-graph/-/raw/main/install.ps1 | iex
```

## Core Workflows

### Index and Query
```bash
gkg index /path/to/project --stats
gkg server start
# Query via HTTP API at http://localhost:27495
```

### Find Symbol Usages
1. Index project: `gkg index`
2. Start server: `gkg server start`
3. Use MCP tool `get_references` or HTTP API `/api/graph/search`

### Impact Analysis
1. Index affected repos
2. Query `get_references` for changed symbols
3. Review all call sites before refactoring

## Language Support

| Language | Cross-file Refs |
|----------|-----------------|
| Ruby | ✅ Full |
| Java | ✅ Full |
| Kotlin | ✅ Full |
| Python | 🚧 In progress |
| TypeScript | 🚧 In progress |
| JavaScript | 🚧 In progress |

## References

- [CLI Commands](./references/cli-commands.md) - `gkg index`, `gkg server`, `gkg remove`, `gkg clean`
- [MCP Tools](./references/mcp-tools.md) - 7 tools for AI integration
- [HTTP API](./references/http-api.md) - REST endpoints for querying
- [Language Details](./references/language-support.md) - Supported features per language

## Key Constraints

- Must stop server before re-indexing
- Requires initialized Git repository
- Languages not connected across repos (yet)
- TS/JS/Python cross-file refs incomplete

## Output format

Return repository/index identity, GKG version, query or symbol, definitions and
references with paths, confidence/unsupported-language limits, impact summary,
and the commands or source checks used to verify important edges.

## Quality gates

- [ ] Installed GKG help and language support were checked before claiming coverage.
- [ ] Index corresponds to the current repository revision and server state.
- [ ] Symbol results are verified against source before changing callers.
- [ ] Incomplete cross-file or cross-repo coverage is stated explicitly.
- [ ] Server processes started for the task are tracked and stopped when done.
- [ ] No remote install script is executed without inspecting source and approval.

## Workflow position

**Typically follows:** repository identification or `av:scout` when text search
cannot establish semantic impact.

**Typically precedes:** `av:plan`, refactoring implementation, or `av:fix`.

**Related:** `av:repomix` for portable context and `av:graphify` for a broader
queryable knowledge graph rather than code-symbol navigation.

---
name: av:graphify
description: "Build queryable knowledge graphs from code, docs, papers, and images. Use for codebase understanding, architecture analysis, cross-file relationship discovery, token-efficient navigation."
user-invocable: true
when_to_use: "Invoke to turn code or docs into a queryable graph."
category: dev-tools
keywords: [knowledge-graph, code-analysis, tree-sitter, codebase-understanding, ast]
argument-hint: "[path] [--mcp|--report|--watch]"
related: [av:repomix, av:scout, av:gkg]
maturity: beta
metadata:
  origin: ported
  author: safishamsi
  attribution: "https://github.com/safishamsi/graphify"
---

# Graphify — Knowledge Graph Builder

Turn any folder of code, docs, papers, or images into a queryable knowledge graph. Uses tree-sitter AST for code (20 languages), Whisper for audio/video, and LLM subagents for documents.

## When to Use

- Understanding unfamiliar codebase architecture before planning
- Discovering cross-file relationships and dependency chains
- Finding "god nodes" (most-connected concepts) in large projects
- Navigating by structure instead of grepping every file
- Preparing a context-efficient codebase representation — upstream reports 71.5x
  fewer tokens than raw files; treat that as their benchmark, not a measurement
  of your repository

## Installation

**Note:** The PyPI package is `graphifyy` (double-y). Other `graphify*` packages on PyPI are unaffiliated.

ariadnev already bundles this skill in the installed plugin. Do not run
`graphify install` for ariadnev setup: upstream uses that command to install a
standalone Claude skill.

```bash
# Core install
pip install graphifyy

# With MCP server support
pip install 'graphifyy[mcp]'

# Full install (MCP + PDF + video + office + Leiden community detection)
pip install 'graphifyy[all]'
```

**Requirements:** Python 3.10+

## Quick Start

```bash
# Build knowledge graph from current directory
graphify .

# Build from specific path
graphify /path/to/project

# Watch mode (auto-rebuild on file changes)
graphify . --watch
```

## Output format

The build writes four artifacts:

| File | Purpose |
|------|---------|
| `graphify-out/graph.html` | Interactive visualization with search + community filtering |
| `graphify-out/GRAPH_REPORT.md` | God nodes, surprising connections, suggested questions |
| `graphify-out/graph.json` | Persistent graph for queries across sessions |
| `graphify-out/cache/` | SHA256-based incremental updates (only reprocesses changed files) |

Report back, rather than leaving the user to open the files:

1. **Where the artifacts are** — the four paths above, and whether this was a
   full or incremental build.
2. **What the graph says** — the god nodes from `GRAPH_REPORT.md` and the
   relationships that answer the question the build was run for.
3. **Provenance of each claim** — carry the `EXTRACTED` / `INFERRED` /
   `AMBIGUOUS` tag through into your summary. An `INFERRED` edge presented as
   fact is the main way this skill misleads.
4. **What was not covered** — file types skipped, extras not installed, or
   passes that did not run.

## MCP Server Mode

Expose the graph as an MCP server for Claude to query directly:

```bash
python -m graphify.serve graphify-out/graph.json
```

### MCP Tools Available

| Tool | Purpose |
|------|---------|
| `query_graph` | Search for concepts and relationships |
| `get_node` | Get details of a specific node |
| `get_neighbors` | Find related concepts |
| `shortest_path` | Find connection path between two concepts |

### Claude Code MCP Setup

Add to `.claude/.mcp.json`:
```json
{
  "mcpServers": {
    "graphify": {
      "command": "python",
      "args": ["-m", "graphify.serve", "graphify-out/graph.json"]
    }
  }
}
```

## Three-Pass Architecture

1. **AST extraction (local, no API)** — tree-sitter parses code in 20 languages deterministically
2. **Audio/video transcription (local)** — Whisper runs on-device for media files
3. **Semantic extraction (API)** — LLM subagents process docs, papers, images in parallel

### Supported Languages (tree-sitter)

Python, JavaScript, TypeScript, Go, Rust, Java, C, C++, Ruby, C#, Kotlin, Scala, PHP, Swift, Lua, Zig, PowerShell, Elixir, Objective-C, Julia

## Confidence Tagging

Relationships in the graph are tagged by provenance:

| Tag | Meaning |
|-----|---------|
| `EXTRACTED` | Directly from AST (imports, function calls, class inheritance) |
| `INFERRED` | LLM-derived with confidence score |
| `AMBIGUOUS` | Uncertain — needs human verification |

## Workflow Integration

### Before Planning

```bash
# Build graph first, then plan with context
graphify .
# Claude reads GRAPH_REPORT.md → understands architecture → better plans
```

### With Scout

```bash
# Graph for high-level structure, scout for specific files
graphify .                        # build graph
/av:scout "auth module"           # find specific files
```

### Incremental Updates

Graph rebuilds are incremental — only changed files get reprocessed. Cache at `graphify-out/cache/` tracks file hashes.

## Privacy

- **Code:** Processed locally via tree-sitter AST. No file contents leave your machine.
- **Audio/Video:** Transcribed locally via Whisper.
- **Docs/Images:** Sent to your configured model provider (Claude/OpenAI) for semantic extraction.

## Limitations

- First build on large codebases can be slow (AST parsing + LLM calls)
- Semantic extraction quality depends on the underlying model
- Neo4j integration requires separate setup (`pip install 'graphifyy[neo4j]'`)
- Leiden community detection requires `pip install 'graphifyy[leiden]'`

## Quality gates

- [ ] `pip install graphifyy` (double-y) was used — a `graphify` package on
      PyPI is someone else's
- [ ] Every relationship reported carries its `EXTRACTED` / `INFERRED` /
      `AMBIGUOUS` tag; inferred edges are never stated as established fact
- [ ] Before running on a private repository, the user knows that docs and
      images — unlike code and audio — are sent to the configured model provider
- [ ] Conclusions cite the node or edge in `graph.json` that supports them,
      not a general impression of the visualization
- [ ] A feature that needs an extra (`[mcp]`, `[neo4j]`, `[leiden]`) is not
      described as available until that extra is installed

## Workflow position

**Typically follows:** nothing — this is usually the first pass over an
unfamiliar repository, before any file is chosen to read.
**Typically precedes:** `av:plan` (understand the architecture before planning)
and `av:scout`, which the graph tells you where to point.
**Related:** `av:scout` searches for specific files where this builds the whole
structure; `av:repomix` packs the raw corpus into one file for an LLM instead of
extracting a graph from it; `av:gkg` navigates symbols semantically over a
narrower language set.

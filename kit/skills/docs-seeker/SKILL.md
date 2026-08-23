---
name: av:docs-seeker
description: "Use when searching current library or framework docs via llms.txt or Context7, analyzing a GitHub repository, or checking latest APIs and features."
user-invocable: true
when_to_use: "Invoke when current library or framework docs are needed."
category: dev-tools
keywords: [docs, llms-txt, api, library, context7]
argument-hint: "[library-name] [topic]"
metadata:
  origin: ported
  author: upstream
  version: "3.1.0"
---

# Documentation Discovery via Scripts

## Overview

**Script-first** documentation discovery using llms.txt standard.

Execute scripts to handle entire workflow - no manual URL construction needed.

## Primary Workflow

**ALWAYS execute scripts in this order:**

```bash
# 1. DETECT query type (topic-specific vs general)
node scripts/detect-topic.js "<user query>"

# 2. FETCH documentation as a JSON envelope
node scripts/fetch-docs.js "<user query>" > /tmp/av-docs-result.json

# 3. ANALYZE the fetched llms.txt content when needed
jq -r '.content // empty' /tmp/av-docs-result.json | node scripts/analyze-llms-txt.js -
```

Scripts handle URL construction, fallback chains, and error handling automatically.

## Scripts

**`detect-topic.js`** - Classify query type
- Identifies topic-specific vs general queries
- Extracts library name + topic keyword
- Returns JSON: `{topic, library, isTopicSpecific}`

**`fetch-docs.js`** - Retrieve documentation
- Constructs context7.com URLs automatically
- Handles fallback: topic → general → error
- Outputs a JSON envelope whose `content` field contains llms.txt text on success

**`analyze-llms-txt.js`** - Process llms.txt
- Categorizes URLs (critical/important/supplementary)
- Recommends agent distribution (1 agent, 3 agents, 7 agents, phased)
- Returns JSON with strategy

## Workflow References

**[Topic-Specific Search](./workflows/topic-search.md)** - Fastest path (10-15s)

**[General Library Search](./workflows/library-search.md)** - Comprehensive coverage (30-60s)

**[Repository Analysis](./workflows/repo-analysis.md)** - Fallback strategy

## References

**[context7-patterns.md](./references/context7-patterns.md)** - URL patterns, known repositories

**[errors.md](./references/errors.md)** - Error handling, fallback strategies

**[advanced.md](./references/advanced.md)** - Edge cases, versioning, multi-language

## Execution Principles

1. **Scripts first** - Execute scripts instead of manual URL construction
2. **Zero-token overhead** - Scripts run without context loading
3. **Automatic fallback** - Scripts handle topic → general → error chains
4. **Progressive disclosure** - Load workflows/references only when needed
5. **Agent distribution** - Scripts recommend parallel agent strategy

## Quick Start

**Topic query:** "How do I use date picker in shadcn?"
```bash
node scripts/detect-topic.js "<query>"  # → {topic, library, isTopicSpecific}
node scripts/fetch-docs.js "<query>"    # → JSON with source URL and content
# Open cited URLs with available web tooling
```

**General query:** "Documentation for Next.js"
```bash
node scripts/detect-topic.js "<query>"         # → {isTopicSpecific: false}
node scripts/fetch-docs.js "<query>" > /tmp/av-docs-result.json
jq -r '.content // empty' /tmp/av-docs-result.json | node scripts/analyze-llms-txt.js -
# Treat distribution as advice; delegate only when runtime and task permit it
```

## Output format

Return the library and version targeted, query, source URLs, retrieval date,
relevant API facts with nearby links, unresolved version ambiguity, and a short
answer tied to those sources. Distinguish repository code from external docs.

## Quality gates

- [ ] Version and framework variant match the installed dependency.
- [ ] Every material API claim is supported by current primary documentation.
- [ ] Fetch JSON was checked for `success` before analyzing `content`.
- [ ] Fallback search is explicit when Context7 has no matching document.
- [ ] No credentials or local configuration values appear in output.
- [ ] Links point to supporting pages, not search-result pages.

## Workflow position

**Typically follows:** `av:scout`, after versions and the API question are known.

**Typically precedes:** `av:plan`, implementation, or `av:fix` when current docs
are needed to choose behavior.

**Related:** `av:research` for comparative research and `av:llms` for generating
an llms.txt file rather than consuming one.

## Environment

Scripts load `.env`: `process.env` > this skill's `.env` > plugin-level `.env` > project `.env`

See `.env.example` for configuration options.

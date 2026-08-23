---
name: av:scout
description: "Fast codebase scouting using native search, optional Explore agents, and user-permitted OpenCode probes. Use for file discovery, task context gathering, and scoped searches across directories."
user-invocable: true
when_to_use: "Invoke for fast file discovery and codebase orientation."
category: dev-tools
keywords: [codebase, scouting, file-discovery, search]
argument-hint: "[search-target] [ext]"
metadata:
  origin: ported
  author: upstream
  version: "1.0.0"
---

# Scout

Fast, token-efficient codebase scouting using parallel agents to find files needed for tasks.

## Arguments
- Default: Scout using built-in Explore subagents in parallel when delegation is permitted (`./references/internal-scouting.md`)
- `ext`: Scout using user-permitted OpenCode probes when native/local search is insufficient (`./references/external-scouting.md`)

## When to Use

- Beginning work on feature spanning multiple directories
- User mentions needing to "find", "locate", or "search for" files
- Starting debugging session requiring file relationships understanding
- User asks about project structure or where functionality lives
- Before changes that might affect multiple codebase parts

## Quick Start

1. Analyze user prompt to identify search targets
2. Use a wide range of `search_files` patterns to find relevant files and estimate scale of the codebase
3. Spawn parallel agents with divided directories only when the active runtime permits delegate_agent usage
4. Collect results into concise report

## Runtime Tooling

Use portable capabilities first:
- `search_files` for local discovery.
- `read_file` for scoped file reads.
- `run_shell` for local commands such as `rg`, `wc`, or `sed`.
- The live task-management surface for progress tracking when useful.
- `delegate_agent` for Explore subagents only when user request and runtime policy allow delegation.

Do not spawn subagents only because this skill mentions Explore. Some runtimes,
including Codex Desktop, require the actual user request to explicitly ask for
subagents, delegation, or parallel agent work. If that explicit request is
absent, scout in the main agent with `search_files` and `read_file`.

Runtime mapping for `delegate_agent`:
- Claude Code: use the native delegate call with `subagent_type: "Explore"`.
- Codex Desktop: Explore is a deferred multi-agent role. If `multi_agent_v1`
  is not visible, call `tool_search` for multi-agent spawn tools first, then use
  `multi_agent_v1.spawn_agent` with `agent_type: "Explore"`. Do not set a model
  override; the Explore role owns its runtime model configuration.

## Workflow

### 1. Analyze Task
- Parse user prompt for search targets
- Identify key directories, patterns, file types, lines of code
- Determine optimal SCALE value of subagents to spawn

### 2. Divide and Conquer
- Split codebase into logical segments per agent
- Assign each agent specific directories or patterns
- Ensure no overlap, maximize coverage

### 3. Register Scout Work
- **Skip if:** Agent count ≤ 2 (overhead exceeds benefit)
- Discover the live task-management surface and check for existing scout work
- If available, register one scoped item per agent; otherwise update the active plan
- Keep tracking concise: scope, assigned directories, current status, and timeout
- Treat the active plan as the durable source of truth

### 4. Spawn Parallel Agents
Load appropriate reference based on decision tree:
- **Internal (Default):** `references/internal-scouting.md` (Explore subagents)
- **External:** `references/external-scouting.md` (OpenCode)

**Notes:**
- Record each scope as in progress before spawning its agent
- Prompt detailed instructions for each subagent with exact directories or files it should read
- Remember that each subagent has less than 200K tokens of context window
- Amount of subagents to-be-spawned depends on the current system resources available and amount of files to be scanned
- Each subagent must return a detailed summary report to a main agent
- In Codex Desktop, first expose deferred multi-agent tools through `tool_search` if they are not already visible.
- If runtime policy blocks subagents because the user did not explicitly request delegation, continue with main-agent scouting instead of forcing a spawn.

### 5. Collect Results
**IMPORTANT:** Invoke "the engineer project-organization skill" skill to organize the outputs.

- Timeout: 3 minutes per agent (skip non-responders)
- Record completed scopes and log timed-out agents in the report
- Aggregate findings into single report
- List unresolved questions at end

## Report Format

```markdown
# Scout Report

## Relevant Files
- `path/to/file.ts` - Brief description
- ...

## Unresolved Questions
- Any gaps in findings
```

## References

- `references/internal-scouting.md` - Using Explore subagents
- `references/external-scouting.md` - Using user-permitted OpenCode probes

## Workflow Position

**Typically precedes:** `the engineer debug skill` (debug after scouting), `/av:fix` (fix after locating code), `the installed code-review skill` (scout edge cases before review)
**Related:** `the engineer debug skill` (investigate after scouting), `/av:brainstorm` (explore after scouting)

## Output format

Return relevant files with one-line ownership notes, matching patterns, nearby
tests/docs/plans, public contracts, unresolved questions, and delegated scopes
or timeouts when delegation was used.

## Quality gates

- Search the smallest relevant scope first and cite exact repository paths.
- Distinguish direct evidence from inferred ownership or blast radius.
- Avoid duplicate agent scopes and continue locally when delegation is blocked.
- Do not mutate implementation while performing a read-only scout.

## Workflow position

**Typically follows:** task framing or a request to locate/understand code.
**Typically precedes:** `av:debug`, `av:fix`, `av:brainstorm`, planning, or review.
**Related:** `av:research` gathers external evidence; this skill maps the local
repository.

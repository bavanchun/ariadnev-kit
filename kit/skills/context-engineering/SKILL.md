---
name: av:context-engineering
description: "Use when checking context usage, token limits, memory systems, context failures, optimization, or multi-agent architecture."
user-invocable: true
when_to_use: "Invoke for context budget, memory, or agent architecture issues."
category: utilities
keywords: [context, tokens, limits, memory, optimization]
argument-hint: "[topic or question]"
metadata:
  origin: ported
  author: upstream
  version: "1.0.0"
---

# Context Engineering

Context engineering curates the smallest high-signal token set for LLM tasks. The goal: maximize reasoning quality while minimizing token usage.

## When to Activate

- Designing/debugging agent systems
- Context limits constrain performance
- Optimizing cost/latency
- Building multi-agent coordination
- Implementing memory systems
- Evaluating agent performance
- Developing LLM-powered pipelines

## Core Principles

1. **Context quality > quantity** - High-signal tokens beat exhaustive content
2. **Attention is finite** - U-shaped curve favors beginning/end positions
3. **Progressive disclosure** - Load information just-in-time
4. **Isolation prevents degradation** - Partition work across sub-agents
5. **Measure before optimizing** - Know your baseline

**IMPORTANT:**
- Sacrifice grammar for the sake of concision.
- Ensure token efficiency while maintaining high quality.
- Pass these rules to subagents.

## Quick Reference

| Topic | When to Use | Reference |
|-------|-------------|-----------|
| **Fundamentals** | Understanding context anatomy, attention mechanics | [context-fundamentals.md](./references/context-fundamentals.md) |
| **Degradation** | Debugging failures, lost-in-middle, poisoning | [context-degradation.md](./references/context-degradation.md) |
| **Optimization** | Compaction, masking, caching, partitioning | [context-optimization.md](./references/context-optimization.md) |
| **Compression** | Long sessions, summarization strategies | [context-compression.md](./references/context-compression.md) |
| **Memory** | Cross-session persistence, knowledge graphs | [memory-systems.md](./references/memory-systems.md) |
| **Multi-Agent** | Coordination patterns, context isolation | [multi-agent-patterns.md](./references/multi-agent-patterns.md) |
| **Evaluation** | Testing agents, LLM-as-Judge, metrics | [evaluation.md](./references/evaluation.md) |
| **Tool Design** | Tool consolidation, description engineering | [tool-design.md](./references/tool-design.md) |
| **Pipelines** | Project development, batch processing | [project-development.md](./references/project-development.md) |
| **Runtime Awareness** | Usage limits, context window monitoring | [runtime-awareness.md](./references/runtime-awareness.md) |

## Key Metrics

- **Token utilization**: Warning at 70%, trigger optimization at 80%
- **Token variance**: Explains 80% of agent performance variance
- **Multi-agent cost**: ~15x single agent baseline
- **Compaction target**: 50-70% reduction, <5% quality loss
- **Cache hit target**: 70%+ for stable workloads

## Four-Bucket Strategy

1. **Write**: Save context externally (scratchpads, files)
2. **Select**: Pull only relevant context (retrieval, filtering)
3. **Compress**: Reduce tokens while preserving info (summarization)
4. **Isolate**: Split across sub-agents (partitioning)

## Anti-Patterns

- Exhaustive context over curated context
- Critical info in middle positions
- No compaction triggers before limits
- Single agent for parallelizable tasks
- Tools without clear descriptions

## Guidelines

1. Place critical info at beginning/end of context
2. Implement compaction at 70-80% utilization
3. Use sub-agents for context isolation, not role-play
4. Design tools with 4-question framework (what, when, inputs, returns)
5. Optimize for tokens-per-task, not tokens-per-request
6. Validate with probe-based evaluation
7. Monitor KV-cache hit rates in production
8. Start minimal, add complexity only when proven necessary

## Runtime Awareness

ariadnev's statusline can display context-window utilization from the host's
statusline input. Its `usage-quota-cache-refresh` hook warms a cosmetic 5-hour
and weekly quota cache when supported credentials are available. These values
are not guaranteed to be injected into the conversation, so inspect the live
runtime surface rather than assuming an XML block exists.

Treat 70% and 90% as planning heuristics, not universal model limits. Capture
durable state before compaction and follow the current runtime's own warnings.

## Scripts

- [context_analyzer.py](./scripts/context_analyzer.py) - Context health analysis, degradation detection
- [compression_evaluator.py](./scripts/compression_evaluator.py) - Compression quality evaluation

## Output format

Return the measured context symptom, evidence source, likely degradation mode,
the smallest corrective action, expected token/cost effect, and how the change
will be evaluated. Separate runtime facts from estimates and heuristics.

## Quality gates

- [ ] Usage and context figures name their source and freshness.
- [ ] No token, cost, quality, or cache statistic is presented as universal.
- [ ] Compaction preserves decisions, state, blockers, and next actions.
- [ ] Added memory or multi-agent machinery solves a measured problem.
- [ ] Evaluation compares the same task and acceptance criteria before/after.

## Workflow position

**Typically follows:** `av:scout` or a failing agent run that provides evidence.

**Typically precedes:** `av:orchestrate` when isolation is selected, or the
implementation workflow whose context is being reduced.

**Related:** `av:codex-goal` for long-running goal budgets and `av:handoff` for
durable session transfer.

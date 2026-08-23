# Agent-Centric Design and the Implementation Plan

Read before naming a tool or writing the implementation plan (Phase 1). The
principles decide which tools exist; the plan checklist decides what the
server is built from.

## Design principles

**Build for workflows, not just API endpoints**
- Do not simply wrap existing API endpoints — build thoughtful, high-impact workflow tools
- Consolidate related operations (e.g. `schedule_event` that both checks availability and creates the event)
- Focus on tools that enable complete tasks, not just individual API calls
- Consider what workflows agents actually need to accomplish

**Optimize for limited context**
- Agents have constrained context windows — make every token count
- Return high-signal information, not exhaustive data dumps
- Provide "concise" vs "detailed" response format options
- Default to human-readable identifiers over technical codes (names over IDs)
- Treat the agent's context budget as a scarce resource

**Design actionable error messages**
- Error messages should guide agents toward correct usage patterns
- Suggest specific next steps: "Try using filter='active_only' to reduce results"
- Make errors educational, not just diagnostic
- Help agents learn proper tool usage through clear feedback

**Follow natural task subdivisions**
- Tool names should reflect how humans think about tasks
- Group related tools with consistent prefixes for discoverability
- Design tools around natural workflows, not just API structure

**Use evaluation-driven development**
- Create realistic evaluation scenarios early
- Let agent feedback drive tool improvements
- Prototype quickly and iterate based on actual agent performance

## The implementation plan

Based on the research (the MCP spec, the SDK README, `reference/mcp-best-practices.md`,
and all of the service's API documentation), write a plan covering:

**Tool selection**
- List the most valuable endpoints/operations to implement
- Prioritize tools that enable the most common and important use cases
- Consider which tools work together to enable complex workflows

**Shared utilities and helpers**
- Identify common API request patterns
- Plan pagination helpers
- Design filtering and formatting utilities
- Plan error handling strategies

**Input/output design**
- Define input validation models (Pydantic for Python, Zod for TypeScript)
- Design consistent response formats (JSON or Markdown) and configurable levels of detail (detailed or concise)
- Plan for large-scale usage (thousands of users/resources)
- Implement character limits and truncation strategies (e.g. a 25,000-character `CHARACTER_LIMIT`)

**Error handling strategy**
- Plan graceful failure modes
- Design clear, actionable, LLM-friendly, natural-language error messages that prompt further action
- Consider rate limiting and timeout scenarios
- Handle authentication and authorization errors

**Tool annotations** (set on every tool in Phase 2)
- `readOnlyHint: true` for read-only operations
- `destructiveHint: false` for non-destructive operations
- `idempotentHint: true` if repeated calls have the same effect
- `openWorldHint: true` if interacting with external systems

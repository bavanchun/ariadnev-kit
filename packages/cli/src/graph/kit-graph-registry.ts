import type { Kit } from "../kit/kit-types.js";
import type { GraphHandlerRegistry } from "./compile-graph.js";

const BUILTIN_HANDLERS = {
  tool: ["workspace.apply"],
  function: ["normalize-request"],
  gate: ["evidence-complete"],
  human: ["change-approval"],
  terminal: ["cancelled", "declined", "failure", "success"],
} as const;

export function graphRegistryForKit(kit: Kit): GraphHandlerRegistry {
  return {
    skill: kit.skills.map((skill) => skill.name).sort(),
    agent: kit.agents.map((agent) => agent.name).sort(),
    tool: BUILTIN_HANDLERS.tool,
    function: BUILTIN_HANDLERS.function,
    gate: BUILTIN_HANDLERS.gate,
    human: BUILTIN_HANDLERS.human,
    terminal: BUILTIN_HANDLERS.terminal,
  };
}

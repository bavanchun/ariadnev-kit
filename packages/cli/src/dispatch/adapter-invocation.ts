// How to ask each coding agent to run a skill. One table, evidence-graded.
//
// WHY A TABLE AND NOT A GUESS. This project already refuses to invent install
// paths for a provider it has not verified: an unverified `(provider, artifact)`
// cell is skipped and logged, never guessed. Dispatch is the same problem with
// worse consequences — a wrong install path writes a file in the wrong place,
// a wrong argv hands a prompt to a binary that interprets it differently. So
// the rule carries over: a provider with no verified invocation is refused.
//
// WHAT "VERIFIED" MEANS HERE. Every entry below was read off that binary's own
// `--help` on a machine where it is installed, and each names a positional
// prompt in non-interactive mode:
//
//   claude       `claude [options] [prompt]`, -p/--print for non-interactive
//   codex        `codex exec [OPTIONS] [PROMPT]`
//   cursor-agent `agent [options] [prompt...]`, -p/--print
//   omp          `omp [MESSAGES]`, -p/--print
//
// `grok` and `dsh` are absent from that machine, so neither could be read the
// same way and neither gets an entry. That is the honest answer and it matches
// phase 9, where `dsh` has no verified cell at all.
//
// WHY THE PROMPT IS SHORT. It names the skill's file rather than containing it.
// Inlining a SKILL.md would put a document of unbounded size on a command line
// with a size limit, and it would be the wrong instruction besides: every one
// of these agents reads skills by path, on demand. Dispatching a skill means
// telling the agent to use it, not pasting it.

import { UnavailableError } from "../cli/exit-codes.js";
import type { ProviderId } from "../providers/spec-verified.js";
import type { ResolvedSkill } from "./resolve-skill-ref.js";

export interface AdapterSpec {
  /** Binary name, resolved through PATH by the spawn layer. */
  readonly binary: string;
  /** Flags placed before the prompt to select non-interactive mode. */
  readonly nonInteractive: readonly string[];
}

/**
 * The providers `av run --target` accepts.
 *
 * Deliberately a partial record: a provider absent from this table is refused,
 * so adding one to `ProviderId` cannot silently make it dispatchable.
 */
export const ADAPTER_SPECS: Partial<Record<ProviderId, AdapterSpec>> = {
  "claude-code": { binary: "claude", nonInteractive: ["-p"] },
  codex: { binary: "codex", nonInteractive: ["exec"] },
  cursor: { binary: "cursor-agent", nonInteractive: ["-p"] },
  omp: { binary: "omp", nonInteractive: ["-p"] },
};

export const DISPATCH_TARGETS: ProviderId[] = Object.keys(ADAPTER_SPECS) as ProviderId[];

export const DEFAULT_TARGET: ProviderId = "claude-code";

export interface AdapterInvocation {
  readonly target: ProviderId;
  readonly binary: string;
  readonly args: readonly string[];
}

/**
 * The instruction handed to the agent.
 *
 * The absolute path is what makes this work from any working directory, and
 * naming the reference as `<kit>/<skill>` as well gives the agent the same
 * identifier the user typed — which is what shows up in its own transcript.
 */
export function dispatchPrompt(skill: ResolvedSkill, args: readonly string[]): string {
  const ref = `${skill.ref.kit}/${skill.ref.skill}`;
  const trailing = args.length > 0 ? `\n\nArguments: ${args.join(" ")}` : "";
  return `Read and follow the skill at ${skill.skillFile} (${ref}).${trailing}`;
}

/**
 * Build the argv for one dispatch, or refuse the target.
 *
 * Refusal is `UnavailableError` (exit 3, "the environment is not ready") rather
 * than a usage error, because `--target grok` is a correct invocation of a
 * capability this build does not have. Telling a user they typed it wrong would
 * send them to fix the one thing that is not the problem.
 */
export function invocationFor(
  target: ProviderId,
  skill: ResolvedSkill,
  args: readonly string[],
): AdapterInvocation {
  const spec = ADAPTER_SPECS[target];
  if (!spec) {
    throw new UnavailableError(
      `skip ${skill.ref.kit}/${skill.ref.skill}: no verified dispatch invocation for ${target} — ` +
        `available targets: ${DISPATCH_TARGETS.join(", ")}`,
    );
  }
  return {
    target,
    binary: spec.binary,
    args: [...spec.nonInteractive, dispatchPrompt(skill, args)],
  };
}

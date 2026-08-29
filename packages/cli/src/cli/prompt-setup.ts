// The interactive half of `av setup`. Thin input gathering, like
// `prompt-providers.ts`: every decision about what a value may be, which layer
// it lands in, and whether it is allowed at all lives in `runSetup`, which is
// tested without a TTY.
//
// It cannot prompt for a credential. The fields come from `SETUP_STEPS`, and
// `runSetup` refuses anything the schema marks sensitive regardless of what
// this collects.

import { confirm, isCancel, cancel, select, text } from "@clack/prompts";
import { specFor, type LeafValue } from "../config/config-schema.js";
import { SETUP_STEPS, SETUP_STEP_NAMES, type SetupStep } from "./setup-command.js";

function stop(): never {
  cancel("Cancelled. Nothing was written.");
  process.exit(0);
}

async function askFor(path: string): Promise<LeafValue> {
  const spec = specFor(path)!;
  if (spec.type === "boolean") {
    const answer = await confirm({ message: `${path} — ${spec.describe}`, initialValue: spec.default as boolean });
    if (isCancel(answer)) stop();
    return answer;
  }
  if (spec.enum) {
    const answer = await select({
      message: `${path} — ${spec.describe}`,
      options: spec.enum.map((value) => ({ value, label: value })),
      initialValue: spec.default as string,
    });
    if (isCancel(answer)) stop();
    return answer as string;
  }
  const answer = await text({
    message: `${path} — ${spec.describe}`,
    initialValue: spec.default === null ? "" : String(spec.default),
    // An empty answer means "leave it unset" for a nullable field, and the
    // default for one that cannot be null — never an empty string written as
    // if the user had chosen it.
    defaultValue: spec.default === null ? "" : String(spec.default),
  });
  if (isCancel(answer)) stop();
  const raw = String(answer);
  if (raw === "" && spec.nullable) return null;
  return spec.type === "integer" ? Number(raw) : raw;
}

/** Ask for every field the selected steps own, in order. */
export async function promptSetup(steps?: readonly string[]): Promise<Record<string, LeafValue>> {
  const selected = (steps?.length ? steps : SETUP_STEP_NAMES) as SetupStep[];
  const values: Record<string, LeafValue> = {};
  for (const step of selected) {
    for (const path of SETUP_STEPS[step] as readonly string[]) {
      values[path] = await askFor(path);
    }
  }
  return values;
}

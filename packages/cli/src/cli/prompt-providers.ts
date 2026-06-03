import { multiselect, select, isCancel, cancel } from "@clack/prompts";
import { PROVIDER_IDS, type ProviderId } from "../providers/index.js";
import type { Scope } from "../providers/resolver.js";

export interface PromptResult {
  providers: ProviderId[];
  scope: Scope;
}

/**
 * Interactive provider multiselect + scope picker. Thin input-gathering layer —
 * all real logic lives in the tested install handler. Only reached when neither
 * `--provider` nor `--yes` is supplied and stdout is a TTY.
 */
export async function promptProviders(): Promise<PromptResult> {
  const providers = await multiselect({
    message: "Select target providers",
    options: PROVIDER_IDS.map((id) => ({ value: id, label: id })),
    required: true,
  });
  if (isCancel(providers)) {
    cancel("Cancelled.");
    process.exit(0);
  }
  const scope = await select({
    message: "Install scope",
    options: [
      { value: "project", label: "project (./)" },
      { value: "global", label: "global (~/)" },
    ],
    initialValue: "project",
  });
  if (isCancel(scope)) {
    cancel("Cancelled.");
    process.exit(0);
  }
  return { providers: providers as ProviderId[], scope: scope as Scope };
}

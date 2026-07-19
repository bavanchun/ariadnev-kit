import { multiselect, select, confirm, isCancel, cancel } from "@clack/prompts";
import { USER_FACING_PROVIDER_IDS, type ProviderId } from "../providers/index.js";
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
    options: USER_FACING_PROVIDER_IDS.map((id) => ({ value: id, label: id })),
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

/**
 * y/n gate before touching the user's settings.json for hook bindings.
 * Cancel or "no" → install still copies hook files; the CLI prints a
 * copy-pasteable snippet instead of merging.
 */
export async function confirmHookSettingsMerge(): Promise<boolean> {
  const answer = await confirm({
    message: "Merge vc hook bindings into .claude/settings.json? (a backup is kept)",
    initialValue: true,
  });
  if (isCancel(answer)) return false;
  return answer === true;
}

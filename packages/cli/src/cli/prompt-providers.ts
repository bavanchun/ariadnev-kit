import { multiselect, select, confirm, isCancel, cancel } from "@clack/prompts";
import { USER_FACING_PROVIDER_IDS, hasVerifiedTargets, type ProviderId } from "../providers/index.js";
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
    // A provider with nothing verified is still listed — it is a real target
    // waiting on evidence, not a mistake — but it is labelled, because picking
    // it from a bare list and finding 156 skips at the end reads as a bug.
    options: USER_FACING_PROVIDER_IDS.map((id) => ({
      value: id,
      label: id,
      ...(hasVerifiedTargets(id) ? {} : { hint: "no verified target — installs nothing" }),
    })),
    required: true,
  });
  if (isCancel(providers)) {
    cancel("Cancelled.");
    process.exit(0);
  }
  const empty = (providers as ProviderId[]).filter((id) => !hasVerifiedTargets(id));
  if (empty.length > 0) {
    const go = await confirm({
      message: `${empty.join(", ")} has no verified install target, so nothing will be written for it. Continue?`,
      initialValue: true,
    });
    if (isCancel(go) || !go) {
      cancel("Cancelled.");
      process.exit(0);
    }
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
 * y/n gate before touching the user's own hook config for bindings.
 * Cancel or "no" → install still copies hook files; the CLI prints a
 * copy-pasteable snippet instead of merging.
 *
 * The files are named rather than described. Each provider registers hooks in a
 * file of its own, several of which are shared with other tools, and "settings"
 * is not a good enough answer to "what are you about to edit".
 */
export async function confirmHookSettingsMerge(targets: string[]): Promise<boolean> {
  const answer = await confirm({
    message: `Merge av hook bindings into ${targets.join(", ")}? (a backup is kept)`,
    initialValue: true,
  });
  if (isCancel(answer)) return false;
  return answer === true;
}

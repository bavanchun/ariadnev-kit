// The five adapter artifacts, generated from the install receipt.
//
// The upstream kit wrote these to track what it owned in a provider tree. This
// port keeps the format so external tooling can read it — and keeps it strictly
// downstream: the receipt is the only ownership record, these are a projection
// of it. Nothing writes them independently and nothing reads them to decide
// anything, which is what makes "the two disagree" impossible rather than
// merely unlikely. A CI grep enforces the reading half.
//
// Pure: receipt in, `{filename: content}` out. No filesystem here, so the whole
// mapping is testable and the one-way direction is visible in the signature.

import type { Receipt, ReceiptInstall } from "../install/install-receipt.js";
import type { ProviderId } from "../providers/spec-verified.js";

/** Schema version upstream stamps on each artifact. */
export const ARTIFACT_VERSION = 1;

export interface AdapterArtifactInput {
  receipt: Receipt;
  provider: ProviderId;
  /** Kit name as upstream records it (`kit` field). */
  kit: string;
  /** Kit version — the CLI version that produced the receipt. */
  kitVersion: string;
  /** Resolves a receipt's portable path to the absolute one on this machine. */
  resolvePath(portable: string): string;
}

export interface HookExpectationEntry {
  matcher?: string;
  hooks: { type: "command"; command: string; args: string[] }[];
}

function installFor(receipt: Receipt, provider: ProviderId): ReceiptInstall | null {
  return receipt.installs[provider] ?? null;
}

/**
 * `install-manifest.json` — what the install put down, plus which skills it was
 * asked for. Hashes come straight from the receipt; recomputing them here would
 * be a second opinion about the same files, and a second opinion is how two
 * records start to differ.
 */
export function buildInstallManifest(input: AdapterArtifactInput): unknown {
  const install = installFor(input.receipt, input.provider);
  const selection = install?.skillSelection;
  return {
    version: ARTIFACT_VERSION,
    kit: input.kit,
    kit_version: input.kitVersion,
    files: (install?.files ?? []).map((file) => ({ rel_path: file.path, sha256: file.sha256 })),
    skill_selection: {
      mode: selection?.mode ?? "all",
      skills: [...(selection?.skills ?? [])],
      selected_count: selection?.selectedCount ?? 0,
      total_count: selection?.totalCount ?? 0,
    },
  };
}

/** `native-skill-paths.json` — a flat list of absolute installed paths. */
export function buildSkillPaths(input: AdapterArtifactInput): string[] {
  const install = installFor(input.receipt, input.provider);
  return (install?.files ?? []).map((file) => input.resolvePath(file.path)).sort();
}

/** `native-skill-hashes.json` — absolute path to sha256, as upstream writes it. */
export function buildSkillHashes(input: AdapterArtifactInput): Record<string, string> {
  const install = installFor(input.receipt, input.provider);
  const out: Record<string, string> = {};
  for (const file of (install?.files ?? []).slice().sort((a, b) => (a.path < b.path ? -1 : 1))) {
    out[input.resolvePath(file.path)] = file.sha256;
  }
  return out;
}

/**
 * `native-hook-expectations.json` — the event graph, in the manifest shape
 * upstream uses. One matcher group per binding, in the order the receipt records
 * them, because that order is the contract the installer wrote.
 */
export function buildHookExpectations(input: AdapterArtifactInput): unknown {
  const install = installFor(input.receipt, input.provider);
  const hooks: Record<string, HookExpectationEntry[]> = {};
  for (const binding of install?.hookBindings ?? []) {
    // `node "/abs/path.cjs" --flag` → command `node`, args the rest. Splitting on
    // the quoted path keeps a path with a space in it intact.
    const match = /^(\S+)\s+"([^"]+)"(.*)$/.exec(binding.command);
    const entry: HookExpectationEntry = {
      ...(binding.matcher ? { matcher: binding.matcher } : {}),
      hooks: [
        {
          type: "command",
          command: match ? match[1] : binding.command,
          args: match ? [match[2], ...match[3].trim().split(/\s+/).filter(Boolean)] : [],
        },
      ],
    };
    (hooks[binding.event] ??= []).push(entry);
  }
  const ordered: Record<string, HookExpectationEntry[]> = {};
  for (const event of Object.keys(hooks).sort()) ordered[event] = hooks[event];
  return { version: ARTIFACT_VERSION, kit: input.kit, manifest: { hooks: ordered } };
}

/** `<provider>-ownership.json` — the tree this install owns. */
export function buildOwnership(input: AdapterArtifactInput): unknown {
  const install = installFor(input.receipt, input.provider);
  const paths = buildSkillPaths(input);
  return {
    paths,
    path_hashes: buildSkillHashes(input),
    hook_ids: (install?.hookBindings ?? [])
      .filter((binding) => binding.applied)
      .map((binding) => `${binding.event}:${binding.command}`)
      .sort(),
  };
}

/**
 * All five, keyed by file name. Deterministic: the same receipt produces the
 * same bytes, which is what makes `adapters regenerate` a safe repair rather
 * than a rewrite that could differ from what install wrote.
 */
export function buildAdapterArtifacts(input: AdapterArtifactInput): Record<string, string> {
  const stringify = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;
  return {
    "install-manifest.json": stringify(buildInstallManifest(input)),
    "native-skill-paths.json": stringify(buildSkillPaths(input)),
    "native-skill-hashes.json": stringify(buildSkillHashes(input)),
    "native-hook-expectations.json": stringify(buildHookExpectations(input)),
    [`${input.provider}-ownership.json`]: stringify(buildOwnership(input)),
  };
}

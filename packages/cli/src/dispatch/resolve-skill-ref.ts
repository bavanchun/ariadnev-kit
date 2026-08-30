// `<kit>/<skill>` → a directory on disk. Pure apart from the stats it is handed.
//
// WHY A SEPARATE MODULE. Dispatch spawns a coding agent against whatever this
// returns, so a ref that escapes its kit directory is a command-line argument
// choosing which directory gets handed to a subprocess. Keeping resolution
// pure, total, and separately tested is what makes that reviewable: every
// rejection below is a test, and none of them depend on a spawn.
//
// EXIT CODES. Upstream gives dispatch its own two codes — 4 for an unmet
// dependency and 5 for "kit or skill not found". This project has a four-value
// table (`exit-codes.ts`) that predates dispatch and is pinned by a regression
// test, and phase 10's own requirement is that `run` inherits no exemption from
// it. So the two upstream codes map onto the existing table rather than
// extending it:
//
//   kit or skill not found  → 2 (usage)       — the command could not run as invoked
//   adapter binary missing  → 3 (unavailable) — the environment is not ready
//
// The second is an exact semantic match. The first is the compromise: a script
// cannot distinguish "you typed the ref wrong" from "the kit is gone" on the
// code alone, only on the message. That is the cost of one exit table instead
// of two, and it is the cheaper of the two costs.

import { UsageError } from "../cli/exit-codes.js";

export interface SkillRef {
  readonly kit: string;
  readonly skill: string;
}

/**
 * One path segment of a ref.
 *
 * Deliberately narrower than what a filesystem accepts. `..` is the reason the
 * check exists, but an allowlist rather than a `..` denylist is what makes it
 * hold: `.` , a leading dash that a spawned binary would read as a flag, an
 * absolute path, a backslash on Windows, and a NUL are all rejected by the same
 * rule instead of by five separate ones somebody has to remember to write.
 */
const SEGMENT = /^[a-z0-9][a-z0-9._-]*$/;

/** Segments that pass SEGMENT but still name something other than a child. */
const RESERVED = new Set([".", "..", "__proto__"]);

function checkSegment(kind: "kit" | "skill", value: string): string {
  if (value.length === 0) throw new UsageError(`${kind} name is empty in the skill reference`);
  if (RESERVED.has(value) || !SEGMENT.test(value)) {
    throw new UsageError(
      `invalid ${kind} name ${JSON.stringify(value)}: use lowercase letters, digits, dot, dash or underscore, ` +
        "starting with a letter or digit",
    );
  }
  return value;
}

/**
 * Split `<kit>/<skill>`.
 *
 * A ref with no slash is refused here rather than being guessed at. `run` used
 * to name the workflow harness, so a bare token is far more likely to be a
 * workflow ID typed at the old spelling than a dispatch to repair — and
 * guessing which would resurrect exactly the ambiguity the rename removed.
 */
export function parseSkillRef(raw: string): SkillRef {
  const parts = raw.split("/");
  if (parts.length !== 2) {
    throw new UsageError(
      `${JSON.stringify(raw)} is not a skill reference: dispatch takes exactly <kit>/<skill>`,
    );
  }
  return { kit: checkSegment("kit", parts[0]), skill: checkSegment("skill", parts[1]) };
}

export type SkillSource = "kits-dir" | "embedded";

export interface ResolvedSkill {
  readonly ref: SkillRef;
  /** Absolute path to the skill's own directory. */
  readonly dir: string;
  /** Absolute path to its SKILL.md. */
  readonly skillFile: string;
  readonly source: SkillSource;
}

export interface ResolveDeps {
  /** Explicit `--kits-dir`, else `$ARIADNEV_KITS_DIR`, else `./kits`. */
  readonly kitsDir: string;
  /** The kit compiled into this binary, and its name. */
  readonly embedded: { readonly name: string; readonly root: string };
  readonly dirExists: (path: string) => boolean;
  readonly fileExists: (path: string) => boolean;
  /** Kit names under `kitsDir`, for the did-you-mean line. Never throws. */
  readonly listKits: () => string[];
  readonly listSkills: (kitRoot: string) => string[];
}

/** `path.join` is not imported here so the module stays trivially portable. */
function join(...parts: string[]): string {
  return parts.join("/").replace(/\/+/g, "/");
}

/** Up to three names from `available` closest to `wanted`, as a hint suffix. */
function didYouMean(wanted: string, available: string[]): string {
  const near = available.filter((name) => name.startsWith(wanted.slice(0, 3)) || name.includes(wanted));
  const shown = (near.length > 0 ? near : available).slice(0, 3);
  return shown.length > 0 ? ` — did you mean: ${shown.join(", ")}?` : "";
}

/**
 * Locate the directory a ref names.
 *
 * The kits directory is searched first and the embedded kit second, so a user
 * who checks a kit of their own into `./kits` under the embedded kit's name
 * gets their copy. Shadowing the binary's own kit is the behaviour a developer
 * editing that kit expects, and it is the only way `--kits-dir` means anything
 * for the kit ariadnev ships.
 */
export function resolveSkill(ref: SkillRef, deps: ResolveDeps): ResolvedSkill {
  const fromKitsDir = join(deps.kitsDir, ref.kit);
  const candidates: ReadonlyArray<{ root: string; source: SkillSource }> = [
    { root: fromKitsDir, source: "kits-dir" },
    ...(ref.kit === deps.embedded.name ? [{ root: deps.embedded.root, source: "embedded" as const }] : []),
  ];

  const kit = candidates.find((candidate) => deps.dirExists(candidate.root));
  if (!kit) {
    throw new UsageError(
      `unknown kit ${JSON.stringify(ref.kit)} (looked in ${deps.kitsDir})${didYouMean(ref.kit, deps.listKits())}`,
    );
  }

  const dir = join(kit.root, "skills", ref.skill);
  const skillFile = join(dir, "SKILL.md");
  // Both conditions are checked because they are different failures: a
  // directory with no SKILL.md is a broken skill, not a missing one, and
  // telling a user "no such skill" about a directory they can see is the kind
  // of answer that costs an hour.
  if (!deps.dirExists(dir)) {
    throw new UsageError(
      `kit ${ref.kit} has no skill ${JSON.stringify(ref.skill)}${didYouMean(ref.skill, deps.listSkills(kit.root))}`,
    );
  }
  if (!deps.fileExists(skillFile)) {
    throw new UsageError(`${ref.kit}/${ref.skill} has no SKILL.md at ${skillFile}`);
  }

  return { ref, dir, skillFile, source: kit.source };
}

// Read a resolver's pinned, hashed output into locked packages.
//
// The input is what `uv pip compile --generate-hashes --universal` prints:
//
//     pywin32==312 ; sys_platform == 'win32' \
//         --hash=sha256:… \
//         --hash=sha256:…
//
// Kept separate from the script that produces it so the parsing is testable
// without a network or a resolver installed.
import type { LockedPackage } from "./lockfile.js";
import { normalizeName } from "./read-requirements.js";

export class ResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResolutionError";
  }
}

export function parseCompiled(output: string): LockedPackage[] {
  const packages: LockedPackage[] = [];
  let current: LockedPackage | null = null;

  for (const rawLine of output.split("\n")) {
    const line = rawLine.replace(/\s*\\$/, "").trim();
    if (line === "" || line.startsWith("#")) continue;

    const hash = /^--hash=(sha256:[a-f0-9]{64})$/.exec(line);
    if (hash) {
      if (!current) throw new ResolutionError(`a hash with no package to attach it to: ${line}`);
      current.hashes.push(hash[1]);
      continue;
    }
    // Everything else starts a package. An index URL or an editable install is
    // not a pinned requirement, and swallowing one as a package name would put
    // a nonsense entry in the lock.
    if (line.startsWith("-")) throw new ResolutionError(`unexpected pip option in the resolution: ${line}`);

    const pin = /^([A-Za-z0-9][A-Za-z0-9._-]*)\s*==\s*([^\s;]+)\s*(?:;\s*(.+))?$/.exec(line);
    if (!pin) throw new ResolutionError(`cannot read the resolved line: ${line}`);
    current = {
      name: normalizeName(pin[1]),
      version: pin[2],
      hashes: [],
      ...(pin[3] ? { marker: pin[3].trim() } : {}),
    };
    packages.push(current);
  }

  const bare = packages.filter((p) => p.hashes.length === 0).map((p) => p.name);
  if (bare.length > 0) throw new ResolutionError(`resolved without hashes: ${bare.join(", ")}`);
  return packages;
}

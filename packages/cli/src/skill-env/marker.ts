// PEP 508 environment markers.
//
// A universal resolution cannot be written without them. `mcp` pulls in
// `pywin32 ; sys_platform == 'win32'`; drop the marker and pip is asked to
// install a Windows-only distribution on macOS, which it cannot, so the whole
// environment fails to build. Keep the marker and the same lock installs
// everywhere.
//
// The other half is verification: a package the marker excludes is *supposed*
// to be absent, and reporting it as missing would call every healthy
// environment corrupt. So the same evaluator decides both what to install and
// what to require.
//
// Pure and self-contained — nothing here reads the filesystem or runs Python.

/** The subset of PEP 508 variables a lock's markers actually use. */
export interface MarkerEnvironment {
  os_name: string;
  sys_platform: string;
  platform_machine: string;
  platform_system: string;
  platform_python_implementation: string;
  implementation_name: string;
  python_version: string;
  python_full_version: string;
}

export class MarkerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarkerError";
  }
}

type Token = { kind: "op" | "name" | "string" | "(" | ")" | "and" | "or"; value: string };

const OPERATORS = ["===", "==", "!=", "<=", ">=", "~=", "<", ">"];

function tokenize(marker: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < marker.length) {
    const ch = marker[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === "(" || ch === ")") {
      tokens.push({ kind: ch, value: ch });
      i += 1;
      continue;
    }
    if (ch === "'" || ch === '"') {
      const end = marker.indexOf(ch, i + 1);
      if (end === -1) throw new MarkerError(`unterminated string in marker: ${marker}`);
      tokens.push({ kind: "string", value: marker.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    const op = OPERATORS.find((candidate) => marker.startsWith(candidate, i));
    if (op) {
      tokens.push({ kind: "op", value: op });
      i += op.length;
      continue;
    }
    const word = /^[A-Za-z_][A-Za-z0-9_]*/.exec(marker.slice(i));
    if (!word) throw new MarkerError(`cannot read marker at "${marker.slice(i, i + 12)}"`);
    const value = word[0];
    i += value.length;
    if (value === "and" || value === "or") {
      tokens.push({ kind: value, value });
    } else if (value === "not" || value === "in") {
      // `in` and `not in` are operators, not variables.
      if (value === "not") {
        const rest = marker.slice(i).trimStart();
        if (!rest.startsWith("in")) throw new MarkerError(`"not" must be followed by "in": ${marker}`);
        i = marker.indexOf("in", i) + 2;
        tokens.push({ kind: "op", value: "not in" });
      } else {
        tokens.push({ kind: "op", value: "in" });
      }
    } else {
      tokens.push({ kind: "name", value });
    }
  }
  return tokens;
}

/**
 * Compare as PEP 440 release segments when both sides look like versions, and
 * as plain strings otherwise. `python_version >= '3.10'` must not be answered
 * by comparing "3.9" and "3.10" lexically, which says 3.9 is the larger.
 */
function compareVersions(left: string, right: string): number {
  const parse = (v: string): number[] => v.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const a = parse(left);
  const b = parse(right);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

const VERSIONISH = /^[0-9]+(\.[0-9]+)*$/;

function compare(left: string, op: string, right: string): boolean {
  if (op === "in") return right.includes(left);
  if (op === "not in") return !right.includes(left);
  if (op === "==" || op === "===") return left === right;
  if (op === "!=") return left !== right;

  if (!VERSIONISH.test(left) || !VERSIONISH.test(right)) {
    // An ordering comparison on something that is not a version — a platform
    // name, say — has no defined meaning. Refusing beats guessing, because the
    // guess decides whether a package gets installed.
    throw new MarkerError(`cannot order "${left}" ${op} "${right}"`);
  }
  const order = compareVersions(left, right);
  if (op === "<") return order < 0;
  if (op === "<=") return order <= 0;
  if (op === ">") return order > 0;
  if (op === ">=") return order >= 0;
  if (op === "~=") {
    // Compatible release: >= right, and no change to the segment above the last.
    const upper = right.split(".").slice(0, -1).join(".");
    return order >= 0 && compareVersions(left.split(".").slice(0, upper.split(".").length).join("."), upper) === 0;
  }
  throw new MarkerError(`unsupported marker operator "${op}"`);
}

/** Recursive-descent over `or` → `and` → comparison → parenthesised group. */
function parse(tokens: Token[], env: MarkerEnvironment): boolean {
  let pos = 0;

  const valueOf = (token: Token): string => {
    if (token.kind === "string") return token.value;
    const known = (env as unknown as Record<string, string | undefined>)[token.value];
    if (known === undefined) throw new MarkerError(`unknown marker variable "${token.value}"`);
    return known;
  };

  const primary = (): boolean => {
    const token = tokens[pos];
    if (!token) throw new MarkerError("marker ended early");
    if (token.kind === "(") {
      pos += 1;
      const inner = orExpr();
      if (tokens[pos]?.kind !== ")") throw new MarkerError("unbalanced parentheses in marker");
      pos += 1;
      return inner;
    }
    const left = token;
    const op = tokens[pos + 1];
    const right = tokens[pos + 2];
    if (!op || op.kind !== "op" || !right) throw new MarkerError("marker is not a comparison");
    pos += 3;
    return compare(valueOf(left), op.value, valueOf(right));
  };

  const andExpr = (): boolean => {
    let result = primary();
    while (tokens[pos]?.kind === "and") {
      pos += 1;
      // Both sides are evaluated: a malformed right-hand side is a broken
      // marker whether or not the left already decided the answer.
      const right = primary();
      result = result && right;
    }
    return result;
  };

  const orExpr = (): boolean => {
    let result = andExpr();
    while (tokens[pos]?.kind === "or") {
      pos += 1;
      const right = andExpr();
      result = result || right;
    }
    return result;
  };

  const value = orExpr();
  if (pos !== tokens.length) throw new MarkerError("trailing text in marker");
  return value;
}

/** True when the marker applies — and true for a package with no marker. */
export function evaluateMarker(marker: string | undefined, env: MarkerEnvironment): boolean {
  if (!marker || marker.trim() === "") return true;
  return parse(tokenize(marker), env);
}

/**
 * The environment a venv presents, derived from files rather than by running
 * its interpreter — `verify` must stay executable-free.
 *
 * `pyvenv.cfg` records the exact interpreter version, so the answer is precise
 * where it matters most. Implementation defaults to CPython: `ariadnev` builds
 * environments with `python -m venv`, and a PyPy build would have to say so.
 */
export function markerEnvironment(
  fullVersion: string,
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
  implementation = "CPython",
): MarkerEnvironment {
  const machine =
    platform === "win32"
      ? arch === "arm64"
        ? "ARM64"
        : "AMD64"
      : arch === "arm64"
        ? platform === "darwin"
          ? "arm64"
          : "aarch64"
        : "x86_64";
  return {
    os_name: platform === "win32" ? "nt" : "posix",
    sys_platform: platform === "win32" ? "win32" : platform === "darwin" ? "darwin" : "linux",
    platform_machine: machine,
    platform_system: platform === "win32" ? "Windows" : platform === "darwin" ? "Darwin" : "Linux",
    platform_python_implementation: implementation,
    implementation_name: implementation.toLowerCase() === "cpython" ? "cpython" : implementation.toLowerCase(),
    python_version: fullVersion.split(".").slice(0, 2).join("."),
    python_full_version: fullVersion,
  };
}

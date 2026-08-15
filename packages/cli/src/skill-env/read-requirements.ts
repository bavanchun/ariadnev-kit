// Parse the dependency format the source skills actually use:
// `scripts/requirements.txt`. Nothing declares dependencies in frontmatter.
//
// The important distinction this makes is runtime vs dev. Eight of the ten
// requirements files in the source declare *only* pytest and its plugins —
// that is what their test suite needs, not what their scripts need. Reading
// those as runtime dependencies would build an environment holding a test
// runner and nothing the skill actually imports.

export interface Requirement {
  /** Distribution name, normalized to lowercase with `-` separators (PEP 503). */
  name: string;
  /** The specifier as written, e.g. ">=8.0.0" or "==1.2.3"; "" when unpinned. */
  specifier: string;
  /** Extras requested, e.g. ["security"] for `requests[security]`. */
  extras: string[];
  /** Environment marker after `;`, kept verbatim; "" when none. */
  marker: string;
  /** The original line, for error messages a human has to act on. */
  raw: string;
}

export interface RequirementsFile {
  runtime: Requirement[];
  dev: Requirement[];
  /** `-r other.txt` includes, unresolved — the caller decides how to follow them. */
  includes: string[];
  /** Lines that look like requirements but could not be parsed. */
  unparsed: string[];
}

/**
 * Test-only tooling. A skill's scripts never import these at runtime; they
 * appear because the source ships a test suite alongside.
 */
const DEV_PACKAGES = new Set([
  "pytest",
  "pytest-cov",
  "pytest-mock",
  "pytest-asyncio",
  "pytest-xdist",
  "coverage",
  "mock",
  "tox",
  "nox",
  "black",
  "ruff",
  "flake8",
  "mypy",
  "isort",
  "pylint",
]);

/** PEP 503 normalization: case-insensitive, runs of -_. collapse to a hyphen. */
export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/[-_.]+/g, "-");
}

const LINE = /^([A-Za-z0-9][A-Za-z0-9._-]*)\s*(\[[^\]]*\])?\s*([^;]*)(?:;\s*(.*))?$/;
// One or more comma-separated comparisons, e.g. ">=1.0" or ">=1.0,<2.0".
const ONE_SPEC = String.raw`(?:==|>=|<=|~=|!=|<|>)\s*[A-Za-z0-9][A-Za-z0-9.!+*-]*`;
const SPECIFIER = new RegExp(`^${ONE_SPEC}(?:\\s*,\\s*${ONE_SPEC})*$`);

/** Parse one non-comment, non-empty requirement line; null when unparseable. */
export function parseRequirementLine(line: string): Requirement | null {
  const match = LINE.exec(line.trim());
  if (!match) return null;
  const [, name, extrasRaw, specRaw, marker] = match;
  const specifier = (specRaw ?? "").trim();
  // A bare name or a well-formed specifier only. Anything else — a URL, a
  // local path, an egg fragment, a stray `#` that was not a comment — is
  // reported rather than half-read into something that looks pinnable.
  if (specifier !== "" && !SPECIFIER.test(specifier)) return null;
  return {
    name: normalizeName(name),
    specifier,
    extras: extrasRaw ? extrasRaw.slice(1, -1).split(",").map((e) => e.trim()).filter(Boolean) : [],
    marker: (marker ?? "").trim(),
    raw: line.trim(),
  };
}

export function parseRequirements(content: string): RequirementsFile {
  const runtime: Requirement[] = [];
  const dev: Requirement[] = [];
  const includes: string[] = [];
  const unparsed: string[] = [];

  for (const rawLine of content.split("\n")) {
    // A `#` only starts a comment at the start or after whitespace, so a name
    // like `pkg#1` is left intact.
    const line = rawLine.split(/(?:^|\s)#/)[0].trim();
    if (line === "") continue;

    const include = /^-r\s+(\S+)$/.exec(line);
    if (include) {
      includes.push(include[1]);
      continue;
    }
    // Other pip flags (`--index-url`, `-e .`) are not dependency declarations.
    if (line.startsWith("-")) continue;

    const req = parseRequirementLine(line);
    if (!req) {
      unparsed.push(line);
      continue;
    }
    (DEV_PACKAGES.has(req.name) ? dev : runtime).push(req);
  }

  return { runtime, dev, includes, unparsed };
}

/**
 * A requirements file inside a `tests/` directory declares what the test suite
 * needs, not what the skill's scripts need. The name-based list above cannot
 * see this: `databases` declares `mongomock` — a mock library no script
 * imports — and no list of known dev packages would have caught it. Where the
 * file sits is the reliable signal.
 */
export function isDevRequirementsPath(path: string): boolean {
  return /(?:^|[/\\])tests?[/\\][^/\\]*$/.test(path);
}

/**
 * True when a skill needs no Python environment: it declares no runtime
 * dependency. Most skills that ship Python are in this state, and treating
 * them as needing an environment is what turns a 5-skill problem into a
 * 22-skill one.
 */
export function needsEnvironment(file: RequirementsFile): boolean {
  return file.runtime.length > 0;
}

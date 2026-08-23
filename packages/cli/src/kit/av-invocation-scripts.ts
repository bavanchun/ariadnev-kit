// The same question as `av-invocation-lint.ts`, asked of a skill's `scripts/`
// directory. A phantom in prose misleads a reader; a phantom in a script is a
// runtime failure — `plans-kanban/scripts/open-dashboard.cjs` spawns
// `av config start`, the upstream kit's dashboard, which has no counterpart here.
//
// This reads source text, not an AST, so it sees exactly three shapes: an argv
// array handed to a process spawner, an argv array handed to a helper named for
// the binary, and a command string that begins with the binary. Anything
// assembled at runtime — `spawnSync(bin, args)` where `args` arrived as a
// parameter — is invisible, and saying so is more useful than pretending
// otherwise.

import {
  checkInvocation,
  invocationMessage,
  shellArgv,
  type AvInvocationFinding,
  type CommandSurface,
} from "./av-invocation-lint.js";
import { lineNumbers } from "./av-invocation-context.js";

const SPAWNERS = new Set(["spawn", "spawnSync", "execFile", "execFileSync", "fork"]);
/**
 * `spawn(<binary>, [ … ])`.
 *
 * The binary position is a string literal or a dotted name, optionally called
 * with no arguments — `'av'`, `akBin()`, an env lookup ending in `ARIADNEV_CLI`.
 * A looser "anything up to the comma" ran across newlines and matched
 * `function startDashboard() {\n  const child = spawn(akBin(), [`, reading the
 * function's own declaration as the call and missing the real one inside it.
 * A binary built by a call that takes arguments (`join(dir, 'av')`) is out of
 * reach here and is one of this module's stated limits.
 */
const BINARY_POSITION = /'[^'\n]*'|"[^"\n]*"|`[^`\n]*`|[\w$.]+(?:\(\s*\))?/.source;
const SPAWN_CALL = new RegExp(`\\b([A-Za-z_$][\\w$]*)\\s*\\(\\s*(${BINARY_POSITION})\\s*,\\s*\\[([\\s\\S]*?)\\]`, "g");
/** `runAK([ … ])` — a wrapper that supplies the binary itself. */
const WRAPPER_CALL = /\b([A-Za-z_$][\w$]*)\s*\(\s*\[([\s\S]*?)\]/g;
const STRING_LITERAL = /'([^'\\\n]*(?:\\.[^'\\\n]*)*)'|"([^"\\\n]*(?:\\.[^"\\\n]*)*)"|`([^`\\]*(?:\\.[^`\\]*)*)`/g;
const QUOTED = /^(['"`])([\s\S]*)\1$/;

const BINARY_NAMES = new Set(["av", "ak", "ariadnev"]); // brand-drift-allow: ported scripts still spawn the upstream name
const BINARY_ROLES = new Set(["bin", "binary", "cli", "exe", "cmd", "command", "path"]);
/** Shell wrappers that only prefix the real command. */
const WRAPPER_PREFIX = /^(?:\$\s+|sudo\s+|npx\s+|bunx\s+|pnpm\s+(?:exec|dlx)\s+|yarn\s+dlx\s+)+/;
const COMMAND_STRING = /^(av|ariadnev)[ \t]+(.+)$/;
const SHELL_FILE = /\.(?:sh|bash|zsh)$/;

/** Identifier words, camelCase and snake_case alike. `akBin` splits into the
 *  tool and its role; a dotted env lookup ending `ARIADNEV_CLI` splits into four,
 *  the last two of which are the tool and the role. */
function segments(identifier: string): string[] {
  return identifier
    .split(/[^A-Za-z0-9]+/)
    .flatMap((part) => part.match(/[A-Z]+(?![a-z])|[A-Z]?[a-z0-9]+|[0-9]+/g) ?? [])
    .map((word) => word.toLowerCase());
}

/** Does this expression name the av binary? A literal `"av"`, or an identifier
 *  that says both which tool and that it is the executable — `akBin`,
 *  `ARIADNEV_CLI`. `ffmpegBin` says the second and not the first. */
function isBinaryExpression(source: string): boolean {
  const quoted = QUOTED.exec(source.trim());
  if (quoted) {
    const base = quoted[2].split("/").pop() ?? "";
    return base === "av" || base === "ariadnev";
  }
  const words = segments(source.replace(/\(\s*\)$/, ""));
  return words.some((word) => BINARY_NAMES.has(word)) && words.some((word) => BINARY_ROLES.has(word));
}

/** A helper that wraps the binary — `runAK`, `avExec`. Naming the tool is the
 *  whole signal, so the bar is one segment; anything looser starts reading
 *  `saveAll([...])` as an invocation. */
function isBinaryWrapper(callee: string): boolean {
  return !SPAWNERS.has(callee) && segments(callee).some((word) => BINARY_NAMES.has(word));
}

/**
 * The leading string literals of an array body.
 *
 * Stops at the first element that is not a literal: `['config','start','--port',
 * String(PORT)]` yields three tokens, and a hole in the middle would shift every
 * later token into the wrong position.
 */
function literalArgv(body: string): string[] {
  const argv: string[] = [];
  for (const element of body.split(",")) {
    const quoted = QUOTED.exec(element.trim());
    if (quoted === null) break;
    argv.push(quoted[2]);
  }
  return argv;
}

export function lintScriptAvInvocations(
  text: string,
  surface: CommandSurface,
  fileName: string,
): AvInvocationFinding[] {
  const lineOf = lineNumbers(text);
  const findings: AvInvocationFinding[] = [];
  const seen = new Set<string>();

  const report = (offset: number, argv: string[]): void => {
    if (argv.length === 0) return;
    const mismatch = checkInvocation(argv, surface);
    if (mismatch === null) return;
    const line = lineOf(offset);
    const key = `${line}:${mismatch.command}:${mismatch.token}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push({ line, message: invocationMessage(mismatch), ...mismatch });
  };

  SPAWN_CALL.lastIndex = 0;
  for (let m = SPAWN_CALL.exec(text); m !== null; m = SPAWN_CALL.exec(text)) {
    if (SPAWNERS.has(m[1]) && isBinaryExpression(m[2])) report(m.index, literalArgv(m[3]));
  }

  WRAPPER_CALL.lastIndex = 0;
  for (let m = WRAPPER_CALL.exec(text); m !== null; m = WRAPPER_CALL.exec(text)) {
    if (isBinaryWrapper(m[1])) report(m.index, literalArgv(m[2]));
  }

  STRING_LITERAL.lastIndex = 0;
  for (let m = STRING_LITERAL.exec(text); m !== null; m = STRING_LITERAL.exec(text)) {
    const content = (m[1] ?? m[2] ?? m[3] ?? "").trim().replace(WRAPPER_PREFIX, "");
    const command = COMMAND_STRING.exec(content);
    // Only a string that *starts* with the binary is a command. A message that
    // merely mentions it ("av not found; install the ariadnev CLI") is prose,
    // and so is an argument list that happens to contain the project's name.
    if (command) report(m.index, shellArgv(command[2]));
  }

  if (SHELL_FILE.test(fileName)) {
    let offset = 0;
    for (const line of text.split("\n")) {
      for (const segment of line.split("#")[0].split(/[|;&]/)) {
        const command = COMMAND_STRING.exec(segment.trim().replace(WRAPPER_PREFIX, ""));
        if (command) report(offset, shellArgv(command[2]));
      }
      offset += line.length + 1;
    }
  }

  return findings;
}

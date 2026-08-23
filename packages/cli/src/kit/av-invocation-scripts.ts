// The same question as `av-invocation-lint.ts`, asked of a skill's `scripts/`
// directory. A phantom in prose misleads a reader; a phantom in a script is a
// runtime failure — `plans-kanban/scripts/open-dashboard.cjs` spawns
// `av config start`, the upstream kit's dashboard, which has no counterpart here.
//
// This reads source text, not an AST, so it sees exactly four shapes: an argv
// array following the binary (`spawn(bin, [...])`), an argv array whose first
// element *is* the binary (Python's `subprocess.run([...])`), an argv array
// handed to a helper named for the binary, and a command line handed to a shell
// runner. Comments and docstrings are blanked first, so an example written for a
// reader is never read as a call. Anything assembled at runtime —
// `spawnSync(bin, args)` where `args` arrived as a parameter — is invisible, and
// saying so is more useful than pretending otherwise.

import {
  checkInvocation,
  invocationMessage,
  shellArgv,
  type AvInvocationFinding,
  type CommandSurface,
} from "./av-invocation-lint.js";
import { lineNumbers } from "./av-invocation-context.js";
import { maskComments } from "./script-comment-mask.js";

/** Callees whose argv array follows the binary: `spawn(bin, [ … ])`. */
const SPAWNERS = new Set([
  "spawn",
  "spawnSync",
  "execFile",
  "execFileSync",
  "fork",
  // execa takes the same (file, args) shape and is what newer scripts reach for.
  "execa",
  "execaSync",
  "execaNode",
]);

/**
 * Callees whose argv array *starts* with the binary — Python's `subprocess`
 * family. `.py` was advertised as a supported extension while none of these were
 * read, so a Python script could spawn anything and the gate stayed quiet.
 *
 * The first element must be a binary literal, which is also what keeps
 * `run(['create', 'ariadnev', 'test-multi'])` — a real line in the worktree
 * skill's tests — from being read as an invocation.
 */
const ARGV_FIRST_SPAWNERS = new Set(["run", "Popen", "call", "check_call", "check_output"]);

/**
 * Callees that take a whole command line as one string.
 *
 * Restricted to these rather than reading any string that starts with the
 * binary: `throw new Error('av config start failed')` is a message about a
 * command, not a command, and the unrestricted rule reported it as a runtime
 * failure.
 */
const SHELL_RUNNERS = new Set(["exec", "execSync", "execaCommand", "execaCommandSync"]);
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
/** An argv array as the first argument: `runAK([ … ])`, a wrapper that supplies
 *  the binary, and `subprocess.run([ … ])`, whose array leads with it. One
 *  pattern, two readings, told apart by the callee. */
const ARGV_FIRST_CALL = /\b(?:[\w$]+\s*\.\s*)?([A-Za-z_$][\w$]*)\s*\(\s*\[([\s\S]*?)\]/g;
/** `execSync("av config start --no-open")`. */
const SHELL_RUNNER_CALL = /\b([A-Za-z_$][\w$]*)\s*\(\s*(['"`])([^'"`\n]*)\2/g;
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
  // Offsets survive masking (comments become spaces, newlines are kept), so a
  // line number resolved against the masked text still points into the original.
  const source = maskComments(text, fileName);
  const lineOf = lineNumbers(source);
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
  for (let m = SPAWN_CALL.exec(source); m !== null; m = SPAWN_CALL.exec(source)) {
    if (SPAWNERS.has(m[1]) && isBinaryExpression(m[2])) report(m.index, literalArgv(m[3]));
  }

  ARGV_FIRST_CALL.lastIndex = 0;
  for (let m = ARGV_FIRST_CALL.exec(source); m !== null; m = ARGV_FIRST_CALL.exec(source)) {
    const argv = literalArgv(m[2]);
    // A wrapper names the binary in its own name and its array is pure argv.
    if (isBinaryWrapper(m[1])) {
      report(m.index, argv);
      continue;
    }
    // `subprocess.run([...])` puts the executable in the array instead, so the
    // first element has to be the binary before the rest means anything.
    if (ARGV_FIRST_SPAWNERS.has(m[1]) && argv.length > 0 && isBinaryExpression(JSON.stringify(argv[0]))) {
      report(m.index, argv.slice(1));
    }
  }

  SHELL_RUNNER_CALL.lastIndex = 0;
  for (let m = SHELL_RUNNER_CALL.exec(source); m !== null; m = SHELL_RUNNER_CALL.exec(source)) {
    if (!SHELL_RUNNERS.has(m[1])) continue;
    const command = COMMAND_STRING.exec(m[3].trim().replace(WRAPPER_PREFIX, ""));
    if (command) report(m.index, shellArgv(command[2]));
  }

  if (SHELL_FILE.test(fileName)) {
    let offset = 0;
    for (const line of source.split("\n")) {
      for (const segment of line.split(/[|;&]/)) {
        // `'av config start'` is still a command line: shell scripts quote one
        // to protect it from the outer shell, and the quotes are not part of it.
        const bare = segment.trim().replace(/^['"]/, "").replace(/['"]$/, "");
        const command = COMMAND_STRING.exec(bare.replace(WRAPPER_PREFIX, ""));
        if (command) report(offset, shellArgv(command[2]));
      }
      offset += line.length + 1;
    }
  }

  return findings;
}

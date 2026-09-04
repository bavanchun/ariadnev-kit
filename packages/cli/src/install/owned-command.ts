// Whether a hook or statusline command is one this installer wrote.
//
// A command is not a path. install-plan.ts builds it as `node
// ${JSON.stringify(dest)}`, and that encoding doubles every backslash — so on
// Windows the directory `C:\Users\u\.codex\hooks\av` never appears literally in
// a command pointing straight at it. Comparing the directory as spelled
// classifies our own hooks as a stranger's, and every caller is wrong in a
// different direction when it does: uninstall leaves them behind, the merge
// appends a duplicate group beside them, and the shared Codex file reports them
// to the user as somebody else's.
//
// Both spellings are accepted, not the encoded one alone, because a command the
// user pasted from the install summary carries the path as they typed it.
//
// What is compared is the file the command runs, not whether the text mentions
// our directory anywhere. Those answers differ for a real command: a guard that
// excludes our hooks from its own scan carries the directory as an argument,
// and reading that as ownership makes an uninstall delete another tool's entry
// out of a file four writers share, with no receipt naming it.

/** Separators are compared for both platforms: these strings cross machines. */
const SEPARATORS = ["/", "\\"];

/**
 * The path argument of a `<interpreter> <script> [args…]` command.
 *
 * Strictly the token after the interpreter, with no scan past a flag: the only
 * commands that can be ours are the ones install-plan.ts writes and the ones a
 * user pasted from the summary, and both put the script there. Skipping flags
 * to look further along would find the directory again in `guard --ignore
 * <ourDir>`, which is the case this exists to reject.
 */
function scriptArgument(command: string): string | null {
  const tokens: string[] = [];
  let current = "";
  let started = false;
  let quoted = false;
  for (let i = 0; i < command.length && tokens.length < 2; i += 1) {
    const char = command[i]!;
    if (quoted) {
      // The encoding is JSON's, so a backslash escapes the next character —
      // which is what turns one Windows separator into two.
      if (char === "\\" && i + 1 < command.length) {
        i += 1;
        current += command[i];
      } else if (char === '"') quoted = false;
      else current += char;
      continue;
    }
    if (char === '"') {
      quoted = true;
      started = true;
      continue;
    }
    if (/\s/.test(char)) {
      if (started) tokens.push(current);
      current = "";
      started = false;
      continue;
    }
    current += char;
    started = true;
  }
  if (started && tokens.length < 2) tokens.push(current);
  return tokens.length === 2 ? tokens[1]! : null;
}

export function commandOwnedBy(command: string, ownedDir: string): boolean {
  // Every path is under "", so the permissive answer would let an uninstall
  // delete the three other tools that share Codex's hooks.json.
  if (ownedDir === "") return false;
  const script = scriptArgument(command);
  if (script === null) return false;
  // A separator has to follow, or `…/hooks/av-legacy` reads as a file inside
  // `…/hooks/av`.
  return SEPARATORS.some((sep) => script.startsWith(ownedDir + sep));
}

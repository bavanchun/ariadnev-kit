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

export function commandOwnedBy(command: string, ownedDir: string): boolean {
  // Every string contains "", so the permissive answer would let an uninstall
  // delete the three other tools that share Codex's hooks.json.
  if (ownedDir === "") return false;
  const encoded = JSON.stringify(ownedDir).slice(1, -1);
  return command.includes(ownedDir) || command.includes(encoded);
}

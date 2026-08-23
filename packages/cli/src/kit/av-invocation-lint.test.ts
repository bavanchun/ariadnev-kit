import { describe, it, expect } from "vitest";
import { lintAvInvocations, type CommandNode, type CommandSurface } from "./av-invocation-lint.js";

interface NodeSpec {
  flags?: string[];
  valueFlags?: string[];
  subs?: Record<string, NodeSpec>;
  positional?: boolean;
}

/** A hand-built surface, so these tests never depend on the real command tree.
 *  `command-surface.test.ts` is where the real registrations are asserted. */
function node(spec: NodeSpec): CommandNode {
  return {
    flags: new Set([...(spec.flags ?? []), ...(spec.valueFlags ?? []), "--help", "-h"]),
    valueFlags: new Set(spec.valueFlags ?? []),
    subcommands: new Map(Object.entries(spec.subs ?? {}).map(([name, sub]) => [name, node(sub)])),
    acceptsPositional: spec.positional ?? false,
  };
}

const surface: CommandSurface = node({
  flags: ["--dry-run"],
  valueFlags: ["--cwd"],
  subs: {
    validate: { flags: ["--strict", "--check", "--json"] },
    config: { subs: { prefs: { flags: ["--json"] } } },
    run: { positional: true, flags: ["--validate"], subs: { resume: {}, status: {}, cancel: {} } },
    plan: {
      subs: {
        use: { flags: ["--json"] },
        show: { flags: ["--json"] },
        phase: { flags: ["--json"], valueFlags: ["--plan"] },
        update: { flags: ["--json"], valueFlags: ["--plan"] },
      },
    },
  },
});

const tokens = (text: string) => lintAvInvocations(text, surface).map((f) => `${f.severity}:${f.token}`);

describe("lintAvInvocations — unregistered subcommands", () => {
  it("flags a phantom subcommand inside an inline code span", () => {
    const found = lintAvInvocations("Run `av plan create` to scaffold it.", surface);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ severity: "error", token: "create", command: "av plan", line: 1 });
    expect(found[0].message).toContain("av plan create");
  });

  it("flags a phantom top-level subcommand", () => {
    expect(tokens("`av frobnicate --json`")).toEqual(["error:frobnicate"]);
  });

  it("flags a phantom subcommand in a shell fence", () => {
    expect(tokens("```bash\nav config start --port 3456 --no-open\n```\n")).toEqual(["error:start"]);
  });

  it("flags a phantom subcommand on a shell-prompt line", () => {
    expect(tokens("$ av config stop")).toEqual(["error:stop"]);
  });

  it("reads a positional as an argument when the command declares one", () => {
    // `av run` has resume/status/cancel beneath it and also takes [workflow].
    // Reporting `code-review` as a phantom subcommand was a false error on
    // correct content.
    expect(tokens("`av run code-review`")).toEqual([]);
    expect(tokens("`av run code-review --validate`")).toEqual([]);
    expect(tokens("`av run resume abc123`")).toEqual([]);
  });

  it("still checks a group command that takes no positional of its own", () => {
    expect(tokens("`av plan code-review`")).toEqual(["error:code-review"]);
  });

  it("accepts every registered path", () => {
    expect(tokens("`av validate --strict`, `av plan use <name>`, `av config prefs resolve`")).toEqual([]);
  });

  it("reads the ariadnev spelling as the same binary", () => {
    expect(tokens("`ariadnev plan create`")).toEqual(["error:create"]);
    expect(tokens("`npx ariadnev validate --check`")).toEqual([]);
  });

  it("never reads a skill reference or an installed directory name as an invocation", () => {
    expect(tokens("`av:plan` and `/av:plan-i18n` live in `../av-plan/SKILL.md`")).toEqual([]);
  });
});

describe("lintAvInvocations — flags", () => {
  it("warns, not errors, on an unregistered flag", () => {
    const found = lintAvInvocations("`av plan update --linked-pr 42`", surface);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ severity: "warning", token: "--linked-pr", command: "av plan update" });
  });

  it("accepts a flag declared on an ancestor", () => {
    expect(tokens("`av --dry-run plan use x`")).toEqual([]);
  });

  it("accepts --help anywhere", () => {
    expect(tokens("`av plan --help` and `av plan phase --help`")).toEqual([]);
  });

  it("does not read a value-taking flag's value as a subcommand", () => {
    expect(tokens("`av plan phase --plan create 3`")).toEqual([]);
  });

  it("does not let an inline flag value swallow the token after it", () => {
    // `--cwd=/tmp` carries its own value, so `frobnicate` is still the
    // subcommand and still has to exist.
    expect(tokens("`av --cwd=/tmp frobnicate`")).toEqual(["error:frobnicate"]);
    expect(tokens("`av --cwd=/tmp plan use x`")).toEqual([]);
  });

  it("stops at a shell pipe so another program's flags are not attributed to av", () => {
    expect(tokens("`av config prefs resolve --json | jq -r '.prefs'`")).toEqual([]);
  });

  it("stops at a redirection", () => {
    expect(tokens("`av plan show --json > out.json`")).toEqual([]);
  });

  it("keeps reading past a placeholder's closing angle bracket", () => {
    // `>` ends a redirection, but it also ends `"<title>"`. Cutting there hid a
    // real unregistered flag behind an argument that was merely illustrative.
    expect(tokens(`\`av plan update "<title>" --linked-pr 42\``)).toEqual(["warning:--linked-pr"]);
  });

  it("ignores positional arguments of a leaf command", () => {
    expect(tokens("`av plan update 3 completed --plan other`")).toEqual([]);
  });

  it("ignores angle-bracket and square-bracket placeholders", () => {
    expect(tokens("`av plan use <plan-dir-name>` / `av plan show [name]`")).toEqual([]);
  });
});

describe("lintAvInvocations — explicit negation", () => {
  const clean = (text: string) => expect(lintAvInvocations(text, surface)).toEqual([]);

  it("accepts 'there is no'", () => clean("There is no `av plan create` command."));
  it("accepts 'do not invent'", () => clean("Do not invent `av plan add-phase`; write the files."));
  it("accepts 'does not exist'", () => clean("`av config start` does not exist."));
  it("accepts \"doesn't exist\"", () => clean("`av config start` doesn't exist."));
  it("accepts 'never'", () => clean("Never call `av plan publish` — it was never registered."));
  it("accepts 'neither'", () => clean("Neither `av plan create` nor `av plan translate` exists."));
  it("accepts a flag denial", () => clean("`av plan` stores no `--linked-pr` flag."));
  it("accepts 'none exists'", () => clean("Skills may want `av plan publish`; none exists."));

  it("carries the negation across a wrapped line", () => {
    clean("Do not invent an `av plan create` or\n`av plan translate` command; neither exists.");
  });

  it("still reports the next sentence", () => {
    expect(tokens("There is no `av plan create`. Run `av plan scaffold` instead.")).toEqual(["error:scaffold"]);
  });

  it("does not let a bold lead-in negate the sentence under it", () => {
    expect(tokens("**Dashboard did not open**\nStart it with `av config start --port 8766`.")).toEqual([
      "error:start",
    ]);
  });

  it("does not let a --no- flag read as the word 'no'", () => {
    expect(tokens("Start it with `av config start --no-open`.")).toEqual(["error:start"]);
  });

  it("never excuses a fenced block on nearby prose", () => {
    expect(tokens("There is no dashboard command.\n\n```bash\nav config start\n```\n")).toEqual(["error:start"]);
  });
});

describe("lintAvInvocations — what it deliberately does not read", () => {
  it("leaves an invocation written in bare prose alone", () => {
    // "av" and "ariadnev" are also ordinary nouns in this corpus ("the ariadnev
    // runtime", "an av subcommand"). Outside code the tokenizer cannot tell a
    // command from a sentence, and guessing produced ~30 false hits on the kit.
    expect(tokens("Then run av plan create to scaffold the directory.")).toEqual([]);
  });

  it("leaves a non-shell fence alone", () => {
    expect(tokens("```ts\nconst x = `av plan create`;\n```\n")).toEqual([]);
  });

  it("does not check a flag that is not attached to an invocation", () => {
    // Deliberately free of any denial word: the point is that an unattached
    // flag is never read at all, not that the sentence excused it.
    expect(tokens("Pass `--root-comment-id` when a tracking comment exists.")).toEqual([]);
  });
});

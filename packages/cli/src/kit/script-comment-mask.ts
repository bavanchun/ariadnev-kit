// Blanking the parts of a script that are prose, so the av-invocation call-site
// rules only ever look at code.
//
// A comment is where an author explains a command rather than running one, and
// every shape this lint hunts turns up there harmlessly: `/** composer for
// \`av ship --social\` */`, `# run 'av config start' first`,
// `// spawn(akBin(), ['config', 'start'])`. Reporting those as runtime failures
// makes the gate wrong about the one thing it exists to be right about.
//
// Comments are replaced space-for-space rather than deleted, so every offset the
// caller resolves to a line number still points where it did.

/** Which comment syntax a file uses. */
type Dialect = "js" | "hash" | "python";

function dialectFor(fileName: string): Dialect {
  if (/\.py$/.test(fileName)) return "python";
  if (/\.(?:sh|bash|zsh)$/.test(fileName)) return "hash";
  return "js";
}

/** Newlines survive; every other character in a comment becomes a space. */
function blank(source: string): string {
  return source.replace(/[^\n]/g, " ");
}

/**
 * `source` with every comment blanked out.
 *
 * A hand-rolled scanner rather than a regex sweep, because the only thing
 * separating a comment from the same characters inside a string is what came
 * before them: `'http://example.com'` is not a line comment, and a `#` inside a
 * shell string is not one either. Quote state is tracked for exactly that
 * reason. String bodies are copied through untouched — the command-string rule
 * still has to read them.
 */
export function maskComments(source: string, fileName: string): string {
  const dialect = dialectFor(fileName);
  const out: string[] = [];
  let i = 0;

  /** End of a comment that runs to `terminator`, or to end of file. */
  const endOf = (start: number, terminator: string, inclusive: boolean): number => {
    const found = source.indexOf(terminator, start);
    if (found === -1) return source.length;
    return inclusive ? found + terminator.length : found;
  };
  const skip = (end: number): void => {
    out.push(blank(source.slice(i, end)));
    i = end;
  };

  while (i < source.length) {
    const pair = source.slice(i, i + 2);

    // A shebang is not code in any of these dialects.
    if (i === 0 && pair === "#!") {
      skip(endOf(i, "\n", false));
      continue;
    }
    if (dialect === "js" && pair === "//") {
      skip(endOf(i, "\n", false));
      continue;
    }
    if (dialect === "js" && pair === "/*") {
      skip(endOf(i + 2, "*/", true));
      continue;
    }
    if (dialect !== "js" && source[i] === "#") {
      skip(endOf(i, "\n", false));
      continue;
    }
    // A Python triple-quoted block is a docstring wherever this lint cares.
    // Telling a docstring from a triple-quoted value needs a parser, and a
    // string literal holding a real `subprocess.run([...])` is not a thing.
    if (dialect === "python" && (source.startsWith('"""', i) || source.startsWith("'''", i))) {
      skip(endOf(i + 3, source.slice(i, i + 3), true));
      continue;
    }

    const quote = source[i];
    if (quote === "'" || quote === '"' || quote === "`") {
      let j = i + 1;
      while (j < source.length) {
        if (source[j] === "\\") {
          j += 2;
          continue;
        }
        if (source[j] === quote) {
          j++;
          break;
        }
        // Only a template literal legitimately spans lines. An unterminated
        // single or double quote is a typo, and running to end of file on one
        // would blank the rest of the script.
        if (source[j] === "\n" && quote !== "`") break;
        j++;
      }
      out.push(source.slice(i, j));
      i = j;
      continue;
    }

    out.push(source[i]);
    i++;
  }

  return out.join("");
}

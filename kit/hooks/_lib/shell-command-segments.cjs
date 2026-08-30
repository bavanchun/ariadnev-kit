'use strict';
/**
 * shell-command-segments.cjs - Shell-aware segmentation for the privacy guard
 *
 * The privacy checker used to scan a Bash command as one flat string and take
 * every ".env…" run up to the next whitespace as a file path. That fabricated
 * paths out of source text (`process.env.API_KEY` became `.env.API_KEY)"`) and
 * lost real ones hidden behind quotes, `env -S`, or nested `$(…)`. This module
 * turns a command into the executable segments a shell would actually run and
 * lexes each into words, so the checker can judge one token at a time.
 *
 * Pure logic module - no stdin/stdout, no exit codes.
 *
 * @module shell-command-segments
 */

const path = require('path');
const { splitCompoundCommand } = require('./scout-checker.cjs');

// `deno eval` options that consume the next word; the source is the first
// non-option word after them.
const DENO_EVAL_OPTIONS_WITH_VALUES = new Set([
  '-c', '-L', '--cert', '--config', '--env-file', '--ext', '--import-map',
  '--location', '--log-level', '--seed', '--v8-flags',
]);

const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

function executableName(word) {
  return path.basename((word || '').replace(/\\/g, '/')).replace(/\.exe$/i, '');
}

/**
 * Lex one shell command segment into quote-aware words with source spans.
 * Operators that attach file operands are delimiters, never part of a path.
 * @param {string} command - One executable command segment
 * @returns {Array<{value: string, start: number, end: number}>}
 */
function lexShellWords(command) {
  const words = [];
  let value = '';
  let start = -1;
  let quote = null;

  const flush = end => {
    if (start >= 0) words.push({ value, start, end });
    value = '';
    start = -1;
  };

  for (let index = 0; index < command.length; index++) {
    const char = command[index];
    if (quote) {
      if (char === '\\' && quote === '"' && index + 1 < command.length) {
        value += command[++index];
      } else if (char === quote) {
        quote = null;
      } else {
        value += char;
      }
      continue;
    }
    if (/\s/.test(char) || '<>()'.includes(char)) {
      flush(index);
      continue;
    }
    if (char === '"' || char === "'") {
      if (start < 0) start = index;
      quote = char;
      continue;
    }
    if (char === '\\' && index + 1 < command.length) {
      if (start < 0) start = index;
      value += command[++index];
      continue;
    }
    if (start < 0) start = index;
    value += char;
  }
  flush(command.length);
  return words;
}

/**
 * Skip leading VAR=value words and, when the executable is `env`, its own
 * options, returning the index of the word that names the real executable.
 */
function skipToExecutable(words) {
  let index = 0;
  while (words[index] && ASSIGNMENT.test(words[index].value)) index++;
  if (executableName(words[index]?.value) !== 'env') return index;
  index++;
  while (words[index]) {
    const option = words[index].value;
    if (ASSIGNMENT.test(option) || /^--(?:unset|chdir)=/.test(option)) {
      index++;
      continue;
    }
    if (/^(?:-u|-C|--unset|--chdir)$/.test(option)) {
      index += 2;
      continue;
    }
    if (option.startsWith('-')) {
      index++;
      continue;
    }
    break;
  }
  return index;
}

/**
 * `env -S "…"` re-splits its argument into a whole new command line, so the
 * string it carries is executable text, not an operand.
 * @returns {{index: number, value: string}|null}
 */
function findEnvSplitString(words) {
  let executableIndex = 0;
  while (words[executableIndex] && ASSIGNMENT.test(words[executableIndex].value)) executableIndex++;
  if (executableName(words[executableIndex]?.value) !== 'env') return null;

  for (let index = executableIndex + 1; index < words.length; index++) {
    const option = words[index].value;
    const inline = option.match(/^(?:-S|--split-string=)(.+)$/);
    if (inline) return { index, value: inline[1] };
    if (/^(?:-S|--split-string)$/.test(option)) {
      return words[index + 1] ? { index: index + 1, value: words[index + 1].value } : null;
    }
    if (/^(?:-u|-C|--unset|--chdir)$/.test(option)) {
      index++;
      continue;
    }
    if (option.startsWith('-') || ASSIGNMENT.test(option)) continue;
    break;
  }
  return null;
}

/**
 * Resolve only the exact source argument owned by a node/bun/deno evaluator.
 * @param {Array<{value: string}>} words - Lexed command words
 * @returns {{index: number, value: string}|null}
 */
function findEvaluatorSource(words) {
  const splitString = findEnvSplitString(words);
  // The split string is handled as its own segment; mark the word opaque so
  // the caller does not also read it as a literal operand.
  if (splitString) return { index: splitString.index, value: '`' };

  const executableIndex = skipToExecutable(words);
  const executable = executableName(words[executableIndex]?.value);
  if (executable !== 'node' && executable !== 'bun' && executable !== 'deno') return null;

  if (executable === 'deno' && words[executableIndex + 1]?.value === 'eval') {
    let sourceIndex = executableIndex + 2;
    while (words[sourceIndex]?.value.startsWith('-')) {
      const option = words[sourceIndex].value;
      if (option === '--') {
        sourceIndex++;
        break;
      }
      sourceIndex += DENO_EVAL_OPTIONS_WITH_VALUES.has(option) ? 2 : 1;
    }
    return words[sourceIndex] ? { index: sourceIndex, value: words[sourceIndex].value } : null;
  }

  for (let index = executableIndex + 1; index < words.length; index++) {
    const flag = words[index].value;
    const inline = flag.match(/^--(?:eval|print)=(.*)$/);
    if (inline) return { index, value: inline[1] };
    if (/^(?:-[ep]|--(?:eval|print))$/.test(flag) && words[index + 1]) {
      return { index: index + 1, value: words[index + 1].value };
    }
  }
  return null;
}

/** `process.env.X`, `Deno.env`, `Bun.env`, `import.meta.env` — code, not a file. */
function isRuntimeEnvironmentReference(value) {
  return /^\$?(?:(?:(?:globalThis|global)\.)?process(?:\.|\?\.)env|(?:Deno|Bun)(?:\.|\?\.)env|import\.meta(?:\.|\?\.)env)(?:(?:\.|\?\.)[A-Za-z_$][\w$]*)*$/.test(value);
}

/**
 * Common evaluator quoting is inspected, but legacy backticks are deliberately
 * opaque: partially parsing them alternates between false blocks and missed
 * nested shell reads.
 */
function extractEvaluatorTokens(source) {
  if (source.includes('`')) return [];
  return (source.match(/[^\s"'`|;&<>(){}\[\],]+/g) || [])
    .filter(value => !isRuntimeEnvironmentReference(value));
}

/**
 * Extract balanced command-substitution bodies while respecting shell quotes.
 * @param {string} command - Whole command string
 * @returns {string[]}
 */
function extractCommandSubstitutions(command) {
  const substitutions = [];
  let quote = null;

  for (let index = 0; index < command.length - 1; index++) {
    const char = command[index];
    if (char === '\\' && quote !== "'" && index + 1 < command.length) {
      index++;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = quote === char ? null : (quote || char);
      continue;
    }
    if (char !== '$' || command[index + 1] !== '(' || quote === "'") continue;

    const start = index + 2;
    let depth = 1;
    let innerQuote = null;
    for (let cursor = start; cursor < command.length; cursor++) {
      const inner = command[cursor];
      if (inner === '\\' && innerQuote !== "'" && cursor + 1 < command.length) {
        cursor++;
        continue;
      }
      if (inner === '"' || inner === "'") {
        innerQuote = innerQuote === inner ? null : (innerQuote || inner);
        continue;
      }
      if (innerQuote) continue;
      if (inner === '(') depth++;
      if (inner === ')' && --depth === 0) {
        substitutions.push(command.slice(start, cursor));
        index = cursor;
        break;
      }
    }
  }
  return substitutions;
}

/**
 * Split a command into every executable segment. The tool input preserves
 * newlines, while a shell treats an unquoted newline as a command boundary.
 * Balanced command substitutions and `env -S` strings are additional
 * executable contexts and are recursed into.
 * @param {string} command - Whole command string
 * @returns {string[]}
 */
function splitCommandSegments(command) {
  let normalized = '';
  let quote = null;

  for (let index = 0; index < command.length; index++) {
    const char = command[index];
    if (char === '\\' && quote !== "'" && index + 1 < command.length) {
      normalized += char + command[++index];
      continue;
    }
    if (char === '"' || char === "'") {
      quote = quote === char ? null : (quote || char);
      normalized += char;
      continue;
    }
    normalized += char === '\n' && !quote ? ';' : char;
  }

  const segments = splitCompoundCommand(normalized);
  const nested = [];
  for (const segment of segments) {
    for (const substitution of extractCommandSubstitutions(segment)) {
      nested.push(...splitCommandSegments(substitution));
    }
    const splitString = findEnvSplitString(lexShellWords(segment));
    if (splitString) nested.push(...splitCommandSegments(splitString.value));
  }
  return [...segments, ...nested];
}

module.exports = {
  extractCommandSubstitutions,
  extractEvaluatorTokens,
  findEnvSplitString,
  findEvaluatorSource,
  isRuntimeEnvironmentReference,
  lexShellWords,
  splitCommandSegments,
};

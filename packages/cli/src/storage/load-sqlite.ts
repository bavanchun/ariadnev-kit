// How both drivers reach their SQLite module. One function, because getting
// this wrong is not a style question — it is the difference between a working
// binary and one that dies at startup on every command.
//
// Measured on Bun 1.3.14 / Node 24.15.0 / vite 5.4.21, 2026-08-28:
//
//   `import { DatabaseSync } from "node:sqlite"`
//       compiles cleanly under `bun build --compile`, then kills the binary at
//       module load with `No such built-in module: node:sqlite`. A build error
//       would have been the kinder outcome; this one ships.
//
//   `await import(someVariable)`
//       survives the compile, but vitest transforms it: vite 5.4 predates
//       `node:sqlite`, so its SSR resolver strips the `node:` prefix and then
//       fails to find a package called "sqlite". `/* @vite-ignore */` does not
//       help — the rewrite happens before the annotation is consulted.
//
//   `createRequire(import.meta.url)(someVariable)`
//       works in all four combinations: Node, Bun, the compiled binary, and
//       under vitest's transform. Nothing resolves it at build time, and no
//       test-runner configuration has to know these modules exist.
//
// Both specifiers stay opaque to the bundler for the same reason, so both go
// through here. `no-static-sqlite-import.test.ts` holds the property.

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/**
 * Load a SQLite implementation by module specifier.
 *
 * The specifier is a parameter rather than a literal at the call site so that
 * no bundler, transformer, or type resolver ever sees a name it wants to
 * resolve. Callers pass one of the two constants their driver owns.
 */
export function loadSqlite<T>(specifier: string): T {
  return require(specifier) as T;
}

---
name: av:markdown-novel-viewer
description: "Serve markdown in a calm, book-like reader over local HTTP. Use for long-form review — RFCs, runbooks, design docs, reports, specs, novels — when a distraction-free browser reading view is wanted."
user-invocable: true
when_to_use: "Invoke to read long markdown comfortably in the browser."
category: utilities
keywords: [markdown, viewer, reading, preview]
argument-hint: "[file-or-directory]"
metadata:
  origin: ported
  author: upstream
  version: "1.0.0"
---

# markdown-novel-viewer

A small Node HTTP server (`scripts/server.cjs`) that renders one markdown file
in a book-like reader, or lists a directory so the user can pick one. Plan
directories (`plan.md` beside `phase-*.md`) get a phase sidebar and
previous/next navigation. Does not produce files: `/av:preview --html …`
writes self-contained HTML that opens without this server, and `av:mintlify`
owns documentation sites.

## Installation required

The renderer needs `marked`, `highlight.js`, and `gray-matter`
(`package.json`). Without them every `/view` answers
`Error 500: Error rendering markdown`.

```bash
cd <this skill directory> && npm install
```

## Quick start

```bash
node scripts/server.cjs --file ./plans/my-plan/plan.md        # view a file (opens the browser)
node scripts/server.cjs --dir ./plans --host 0.0.0.0            # browse a directory, reachable on the LAN
node scripts/server.cjs --file ./README.md --background         # detach; prints the JSON envelope and exits
node scripts/server.cjs --file ./README.md --foreground --no-open  # for a harness background task: JSON, no browser
node scripts/server.cjs --stop                                  # stop every running viewer
```

A bare positional path works like `--file` (a directory path is detected and
browsed). Through `av:preview`: `/av:preview <file.md>`, `/av:preview <dir>/`,
`/av:preview --stop`.

## CLI options (`scripts/server.cjs`)

| Option | Description | Default |
|--------|-------------|---------|
| `--file <path>` | Markdown file to view | — |
| `--dir <path>` | Directory to browse | — |
| `--port <number>` | First port to try; the next free one up to 3500 is taken if busy | 3456 |
| `--host <addr>` | Bind address (`0.0.0.0` for other devices) | `localhost` |
| `--open` / `--no-open` | Open the browser after starting — **on by default**; pass `--no-open` in a headless or CI context | open |
| `--background` | Spawn a detached child, print its JSON envelope, exit | off |
| `--foreground` | Stay attached and print the JSON envelope instead of the text banner (also triggered by `CLAUDE_COMMAND` in the environment or by the `--child` the background spawn adds) | off |
| `--stop` | Stop every server recorded in `/tmp/md-novel-viewer-<port>.pid` | — |

Each server writes `/tmp/md-novel-viewer-<port>.pid` on listen and removes it
on shutdown; `--stop` reads those files.

## What the reader does

Warm light/dark theme, serif headings, 720px measure, auto-hiding header with
a reading progress bar, client-side Mermaid 11 diagrams, plan-aware sidebar
with status badges, keyboard shortcuts (`?` `T` `S` `←` `→` `Esc`), and a
mobile bottom sheet. `references/reader-guide.md` carries the full feature
list, the HTTP routes, the architecture, customization, remote access, and
troubleshooting — read it before debugging a rendering or access problem.
`references/mermaid-diagrams.md` carries diagram syntax, the supported
types, and the error-fixing table.

**Known gap:** `assets/novel-theme.css` only `@import`s nine sheets from
`assets/styles/`, and that directory is not shipped in this kit, so the
theme rules currently do not apply; pages render with browser defaults plus
the Google Fonts link. Say so when the user asks why the page looks plain.

## Output format

What the server prints is the contract; relay it, do not paraphrase it.

With `--background`, `--foreground`, `--child`, or `CLAUDE_COMMAND` set, one
JSON line on stdout:

```json
{"success":true,"url":"http://localhost:3456/view?file=%2Fabs%2Fpath.md","path":"/abs/path.md","port":3456,"host":"0.0.0.0","mode":"file","networkUrl":"http://192.168.2.75:3456/view?file=%2Fabs%2Fpath.md"}
```

`mode` is `file` or `directory`; `url` always says `localhost` (even under
`--host 0.0.0.0`), and `networkUrl` is present only under `--host 0.0.0.0`
when a LAN address was found. Otherwise a text banner: `URL:`, optional `Network:`,
`Path:`, `Port:`, `Host:`, `Mode: File Viewer | Directory Browser`, and
`Press Ctrl+C to stop`. A busy port adds `Port 3456 in use, using <n>` on
stderr before either form. `--stop` prints `Stopped <n> server(s)` or
`No server running to stop`.

Then report to the user, in this shape:

```
Viewer running: <url>            (LAN: <networkUrl>, when present)
  Serving: <abs path> (<file | directory>)   Port: <port>   PID file: /tmp/md-novel-viewer-<port>.pid
  Stop with: node scripts/server.cjs --stop
```

## Quality gates

- [ ] `node_modules/marked` exists in the skill directory before starting;
      if not, `npm install` ran — a `500 Error rendering markdown` is never
      reported as a content problem
- [ ] The reported `url` was fetched once (`curl -s -o /dev/null -w '%{http_code}' <url>`)
      and answered `200` before it was handed to the user; a `403 Access denied`
      means the path is outside the allowed directories, not a missing file
- [ ] The port in the report is the one the server printed, not the one that
      was requested — `findAvailablePort` may have moved it
- [ ] As a harness background task the command carried `--foreground` (the
      form `av:preview` uses), so the JSON envelope — not the banner — was
      parsed; where no browser may open (CI, headless), `--no-open` was passed,
      because opening is the default
- [ ] Every viewer this session started was stopped with `--stop` before the
      task ended, or the user was told it is still running and how to stop it
- [ ] The server was not used to render HTML deliverables — that is
      `/av:preview --html`, which needs no server

## Workflow position

**Typically follows:** `av:plan`, whose plan directories this reader
navigates phase by phase; `av:docs`, `av:research`, or any skill that leaves
a long markdown artifact the user wants to read end-to-end.

**Typically precedes:** nothing — reading is terminal; the user returns to the
authoring skill with feedback.

**Related:** `av:preview` is the normal entry point (it wraps `--file`,
`--dir`, and `--stop`) and owns HTML, slide, and diagram generation;
`av:plans-kanban` shows plan status as a board rather than as reading.
`av:mintlify` builds a documentation site; this skill only reads files.

## References

| Read when | File |
| --- | --- |
| Debugging rendering, access, ports, styling, or remote access; looking up routes, shortcuts, or the architecture | `references/reader-guide.md` |
| A document contains `mermaid` blocks or a diagram fails to render | `references/mermaid-diagrams.md` |

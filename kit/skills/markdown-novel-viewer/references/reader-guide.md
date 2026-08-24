# Reader Guide: Features, Routes, Customization, Troubleshooting

Read when you need more than the quick start: what the reader does once a
page is open, the HTTP surface, how to restyle it, remote access, and what to
do when it misbehaves.

## Features

### Novel theme
- Warm cream background (light mode); dark mode with warm gold accents
- Libre Baskerville serif headings, Inter body text, JetBrains Mono code —
  loaded from Google Fonts by `assets/template.html`
- Maximum 720px content width

**Known gap in this kit:** `assets/novel-theme.css` is sixteen lines of
`@import url('./styles/novel-theme-*.css')`, and `assets/styles/` is not
shipped (the upstream source this was ported from lacks it too). Until those nine module
sheets are restored, the theme rules above do not apply and pages render
with browser defaults plus the Google Fonts link. `assets/directory-browser.css`
is complete and does apply to `/browse`.

### Mermaid diagrams
- Auto-renders `mermaid` code blocks client-side (see `references/mermaid-diagrams.md`)
- Theme-aware (light/dark, re-rendered on theme change); an expand button (⤢) on each diagram toggles full width
- Error display with source preview for debugging

### Directory browser (`/browse`)
- File listing with emoji icons; markdown files link to the viewer, folders to sub-directories
- Parent directory navigation (`..`); light/dark mode

### Focused reader mode
- Header hides on scroll down and shows on scroll up
- Always-visible horizontal progress bar tracks reading position
- Minimal UI, gentle show/hide transitions

### Plan navigation
`scripts/lib/plan-navigator.cjs` detects a plan directory (a `plan.md` beside
`phase-*.md` files) and adds an accordion sidebar with status badges
(✓ when every phase in a group is `completed`, a count otherwise),
previous/next buttons, and on mobile a floating action button opening a
bottom-sheet sidebar.

### Keyboard shortcuts (`assets/reader.js`)
A "Press ? for keyboard shortcuts" toast shows on the first visit and
dismisses itself after 5 seconds (remembered in `localStorage`).

- `?` — shortcuts cheatsheet (full-screen overlay; close with `Esc`, `×`, or the backdrop)
- `T` — toggle theme (light/dark)
- `S` — toggle sidebar
- `←` / `→` — previous / next phase
- `Esc` — close the cheatsheet, the mobile bottom sheet, or (≤ 900px) the sidebar

### Mobile
Floating action button bottom-right, slide-up bottom sheet with touch
gestures, larger tap targets. The sidebar collapses at 900px viewport width;
the bottom sheet closes itself above 768px.

## HTTP routes (`scripts/lib/http-server.cjs`)

| Route | Description |
|-------|-------------|
| `/` | Landing page listing the routes |
| `/view?file=<path>` | Markdown file viewer |
| `/browse?dir=<path>` | Directory browser |
| `/assets/*` | Static assets |
| `/file/*` | Local file serving (images referenced by the markdown) |

Every file path is checked against the allowed directories — the assets dir,
the working directory, and the directory of the served file — and answers
`403 Access denied` outside them, `404` when missing, `500 Error rendering
markdown` when rendering throws (the usual cause is a missing `npm install`).

## Architecture

```
scripts/
├── server.cjs               # Entry point: args, --stop, background spawn, listen
└── lib/
    ├── port-finder.cjs      # First free port in 3456-3500
    ├── process-mgr.cjs      # /tmp/md-novel-viewer-<port>.pid files
    ├── http-server.cjs      # Routing (/view, /browse, /assets, /file) and path checks
    ├── markdown-renderer.cjs # marked + highlight.js + gray-matter; mermaid blocks → divs
    └── plan-navigator.cjs   # Plan detection and navigation

assets/
├── template.html            # Viewer template (fonts, Mermaid 11 module, reader.js)
├── reader.js                # Client-side interactivity
├── novel-theme.css          # @import-only entry for the unshipped styles/ sheets
├── directory-browser.css    # Directory browser styles
└── favicon.png
```

## Customization

The theme variables below are what `novel-theme.css` was written to import;
set them in a sheet you add under `assets/styles/` (see the known gap above).

Light mode: `--bg-primary: #faf8f3` (warm cream), `--accent: #8b4513` (saddle
brown). Dark mode: `--bg-primary: #1a1a1a`, `--accent: #d4a574` (warm gold).
Content width: `--content-width: 720px`.

## Remote access

```bash
node scripts/server.cjs --file ./README.md --host 0.0.0.0 --port 3456
```

With `--host 0.0.0.0` the server detects the machine's LAN address and adds a
`networkUrl` to its output, e.g. `http://192.168.2.75:3456/view?file=...`.
Use it from another device on the same network.

## Troubleshooting

| Symptom | Cause and action |
|---------|------------------|
| `Error 500: Error rendering markdown` | `marked`, `highlight.js`, or `gray-matter` not installed — run `npm install` in the skill directory |
| Port in use | The server takes the next free port up to 3500 and prints `Port 3456 in use, using <n>` on stderr; read the real port from the output |
| `No available port in range 3456-3500` | Every candidate port is unavailable; stop recorded viewers, then inspect and free any other process that owns a port before retrying |
| Images not loading | Paths must be relative to the markdown file; they are served through `/file/*` and must sit inside an allowed directory |
| Server will not stop | Inspect the recorded PID and process owner. Remove a PID file only after confirming its process is no longer live; do not erase the record for a live viewer |
| Remote access denied | Bind with `--host 0.0.0.0` |
| Page is unstyled | The `assets/styles/` sheets are not shipped — see the known gap above |
| Diagram does not render | See `references/mermaid-diagrams.md`; the browser needs access to `cdn.jsdelivr.net` |

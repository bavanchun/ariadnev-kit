---
name: av:preview
description: "View files or generate visual explanations, slides, and diagrams. Use for code walkthroughs, architecture visualization, HTML/Markdown presentations."
user-invocable: true
when_to_use: "Invoke for visual explanations, file previews, or diagrams."
category: utilities
keywords: [preview, visual, slides, diagrams, HTML]
argument-hint: "[path] OR [--html] --explain|--slides|--diagram|--ascii [topic] OR --html --diff|--plan-review|--recap"
metadata:
  origin: ported
  author: upstream
  version: "1.2.0"
  attribution: "Visual self-review pattern for diagram output adapted from fireworks-tech-graph by yizhiyanhua-ai (MIT)"
  license: MIT
---

# Preview

Universal viewer + visual generator. View existing content OR generate new visual explanations.

## Default (No Arguments)

If invoked without arguments, use `ask_user capability` to present available preview operations:

| Operation | Description |
|-----------|-------------|
| `(view)` | View a file or directory |
| `--explain` | Generate visual explanation |
| `--slides` | Generate presentation slides |
| `--diagram` | Generate architecture diagram |
| `--ascii` | Terminal-friendly diagram |
| `--stop` | Stop preview server |
| `--html --explain` | Self-contained HTML explanation (opens in browser) |
| `--html --diagram` | Self-contained HTML diagram with zoom controls |
| `--html --slides` | Magazine-quality HTML slide deck |
| `--html --diff` | Visual diff review (HTML) |
| `--html --plan-review` | Plan vs codebase comparison (HTML) |
| `--html --recap` | Project context snapshot (HTML) |

Present as options via `ask_user capability` with header "Preview Operation", question "What would you like to do?".

## Usage

### View Mode
- `/av:preview <file.md>` - View markdown file in novel-reader UI
- `/av:preview <directory/>` - Browse directory contents
- `/av:preview --stop` - Stop running server

### Generation Mode (Markdown)
- `/av:preview --explain <topic>` - Generate visual explanation (ASCII + Mermaid + prose)
- `/av:preview --slides <topic>` - Generate presentation slides (one concept per slide)
- `/av:preview --diagram <topic>` - Generate focused diagram (ASCII + Mermaid)
- `/av:preview --ascii <topic>` - Generate ASCII-only diagram (terminal-friendly)

### Generation Mode (HTML)
- `/av:preview --html --explain <topic>` - Self-contained HTML explanation
- `/av:preview --html --slides <topic>` - Magazine-quality HTML slide deck
- `/av:preview --html --diagram <topic>` - HTML diagram with zoom controls
- `/av:preview --html --diff [ref]` - Visual diff review
- `/av:preview --html --plan-review [plan-file]` - Plan vs codebase comparison
- `/av:preview --html --recap [timeframe]` - Project context snapshot

## Argument Resolution

When processing arguments, follow this priority order:

1. **`--stop`** → Stop server (exit)
2. **`--html` flag present** → Set HTML output mode flag (continues to next step)
3. **Generation flags** (`--explain`, `--slides`, `--diagram`, `--ascii`) → Generation mode. Load `references/generation-modes.md`
4. **HTML-only flags** (`--diff`, `--plan-review`, `--recap`) → Auto-set HTML mode, then generation mode. Load `references/generation-modes.md`
5. **Visual workflow without explicit mode** → Load `references/visual-explanation-routing.md` to choose mode
6. **Resolve path from argument:**
   - If argument is an explicit path → use directly
   - If argument is a contextual reference → resolve from recent conversation context
7. **Resolved path exists on filesystem** → View mode. Load `references/view-mode.md`
8. **Path doesn't exist or can't resolve** → Ask user to clarify

**Topic-to-slug conversion:**
- Lowercase the topic
- Replace spaces/special chars with hyphens
- Remove non-alphanumeric except hyphens
- Collapse multiple hyphens → single hyphen
- Trim leading/trailing hyphens
- **Max 80 chars** - truncate at word boundary if longer

**Multiple flags:** If multiple generation flags provided, use first one; remaining treated as topic.

**Placeholder `{topic}`:** Replaced with original user input in title case (not the slug).

## Error Handling

| Error | Action |
|-------|--------|
| Invalid topic (empty) | Ask user to provide a topic |
| Flag without topic | Ask user: "Please provide a topic: `/av:preview --explain <topic>`" |
| Topic becomes empty after sanitization | Ask for topic with alphanumeric characters |
| File write failure | Report error, suggest checking disk space and permissions |
| Server startup failure | Check if port in use, try `/av:preview --stop` first |
| No generation flag + unresolvable reference | Ask user to clarify which file they meant |
| Existing file at output path | Overwrite with new content (no prompt) |
| Server already running | Reuse existing server instance, just open new URL |
| Parent `plans/` dir missing | Create directories recursively before write |
| `--diff` without git context | Explain: "No git repo detected. Run inside a git repository." |
| `--plan-review` without plan file or active plan | Explain: "Provide a plan file path or run from a session with an active plan." |
| `--recap` without git history | Explain: "No git history found. Run inside a git repository with commits." |
| `--html --ascii` combination | Not supported — `--ascii` is terminal-only by design. Suggest `--html --diagram` instead |
| `--diff` with PR number but `gh` unavailable | Explain: "GitHub CLI (gh) is required for PR diffs. Install from https://cli.github.com/" |

## HTML Output Mode (`--html`)

Adding `--html` to any generation flag switches output from Markdown to a self-contained HTML file.

**Output:** Single `.html` file with all authored CSS/JS inline. Opens directly in browser — no server needed.
**Location:** `{plan_dir}/visuals/{topic-slug}.html` (same plan-aware logic as markdown mode)
**Browser open:** `open` (macOS) / `xdg-open` (Linux) / `start` (Windows)
**MANDATORY — Theme Toggle:** Every HTML page MUST include a light/dark theme toggle button. See `references/html-css-patterns.md` → "Theme Toggle Button" for the exact CSS, HTML, and JS to include. Pages without the toggle are considered incomplete.

### Reference Loading (HTML mode)

Before generating, agent MUST read these references:

| Mode | Always read | Mode-specific |
|------|-------------|---------------|
| All HTML modes | `references/html-design-guidelines.md`, `references/html-css-patterns.md`, `references/html-css-layout-patterns.md`, `references/html-css-content-patterns.md` | — |
| `--explain` | `references/html-libraries.md` | Template: `architecture.html` |
| `--diagram` | `references/html-libraries.md` | Template: `mermaid-flowchart.html` or `architecture.html` |
| `--slides` | `references/html-slide-patterns.md`, `references/html-slide-layout-patterns.md`, `references/html-slide-visual-patterns.md`, `references/html-libraries.md` | Template: `slide-deck.html` |
| `--diff` | `references/html-libraries.md` | Templates: `data-table.html`, `architecture.html` |
| `--plan-review` | `references/html-libraries.md` | Templates: `architecture.html`, `data-table.html` |
| `--recap` | `references/html-libraries.md` | Templates: `architecture.html`, `data-table.html` |

Multi-section pages (`--explain`, `--diff`, `--plan-review`, `--recap`): also read `references/html-responsive-nav.md`.

Infographic pages — a poster-shaped `--explain` built around a few oversized stat callouts and one or two statement charts: also read `references/html-antv-infographic.md`. It is a choice of reference, not a separate flag.

Use `/av:mermaidjs-v11` skill for Mermaid syntax validation.

### HTML-Only Modes

#### `--diff [ref]` (implies --html)
Visual diff review. Scope detection: branch name, commit hash, HEAD, PR number, commit range, default=main.
Data: git diff --stat, --name-status, changed files, new API surface, CHANGELOG.
Output: executive summary, KPI dashboard, module architecture (Mermaid), feature comparisons (side-by-side), flow diagrams, file map, test coverage, code review cards (Good/Bad/Ugly/Questions), decision log, re-entry context.

#### `--plan-review [plan-file]` (implies --html)
Plan vs codebase comparison. Input: plan file path or detect from active plan context.
Data: read plan, read all referenced files, map blast radius, cross-reference assumptions.
Output: plan summary, impact dashboard, current vs planned architecture (paired Mermaid), change breakdown (side-by-side), dependency analysis, risk assessment, review cards, understanding gaps.
Visual language: blue=current, green=planned, amber=concern, red=gap.

#### `--recap [timeframe]` (implies --html)
Project context snapshot. Time window: shorthand (2w, 30d, 3m) or default 2w.
Data: project identity, git log, git status, decision context, architecture scan.
Output: project identity, architecture snapshot (Mermaid), recent activity, decision log, state KPI cards, mental model essentials, cognitive debt hotspots, next steps.

### Style Strategy
- Default: static anti-slop rules from `references/html-design-guidelines.md` (6 curated presets)
- For `--slides`: consider invoking `/av:ui-ux-pro-max` for richer style selection
- Agent must vary aesthetics between consecutive HTML outputs (different font pair, palette)

## Output format

**View mode** returns the local URL, the network URL for remote devices, what
is being served — a file or a directory listing — and the fact that the server
is running as a background task. It does not summarize the file's contents
unless asked.

**Generation mode** writes one file and reports:

1. **Path** — `{plan_dir}/visuals/{topic-slug}.md` when a plan is active,
   otherwise `plans/visuals/{topic-slug}.md`; the same two locations with
   `.html` under `--html`. Give the actual path, not the pattern.
2. **Mode** — which generation flag produced it, and whether `--html` was set
   explicitly or implied by `--diff` / `--plan-review` / `--recap`.
3. **What it shows** — two or three lines on the content, so the user can decide
   whether to open it.
4. **Preview URL** — for markdown output, the local and network URLs of the
   viewer server that was started.
5. **Browser** — for HTML, whether the file was opened and with which command.

An existing file at the output path is overwritten without prompting; say so
when it happened.

## Quality gates

- [ ] The page is one file with every authored style and script inline; the
      only external requests are the CDN libraries named in
      `references/html-libraries.md` (Google Fonts, Mermaid, Chart.js, anime.js)
- [ ] The light/dark theme toggle from `references/html-css-patterns.md` is the
      first child of `<body>` — a page without it is incomplete, not merely
      unstyled
- [ ] Claims in a `--diff`, `--plan-review`, or `--recap` page come from the
      git or plan data actually read, not from recollection of the session
- [ ] Only the references this mode requires were loaded — its row in the
      Reference Loading table, plus `references/html-responsive-nav.md` for a
      multi-section page
- [ ] The generated file was opened before reporting success; for `--diagram`
      the rendered output was loaded back as an image and inspected per
      `references/generation-modes.md` → "Visual Self-Review", never merely
      re-read as markup — a page that fails to render still writes cleanly

## Workflow position

**Typically follows:** `av:cook` or `av:fix` when finished work needs a
walkthrough, and `av:plan` when a plan should be reviewed against the codebase
via `--plan-review`.
**Typically precedes:** nothing — this skill terminates in an artifact for a
human to read.
**Related:** `av:tech-graph` produces publish-grade SVG and PNG diagrams where
this skill produces quick ASCII, Mermaid, and self-contained HTML;
`av:mermaidjs-v11` validates the Mermaid syntax embedded here;
`av:markdown-novel-viewer` is the reader UI view mode serves markdown into;
`av:ui-ux-pro-max` supplies richer style selection for `--slides`.

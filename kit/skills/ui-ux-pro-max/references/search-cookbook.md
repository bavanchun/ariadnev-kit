# Search cookbook

Read when Python is missing, a query returns nothing useful, a design system
needs to survive across sessions, or a worked example would help.

## Prerequisite: Python 3

Check if Python is installed:

```bash
python3 --version || python --version
```

If Python is not installed, install it based on user's OS:

**macOS:**
```bash
brew install python3
```

**Ubuntu/Debian:**
```bash
sudo apt update && sudo apt install python3
```

**Windows:**
```powershell
winget install Python.Python.3.12
```

## Persist the design system across sessions

Add `--persist` to `--design-system` to write the recommendation to disk:

```bash
python3 .claude/skills/av-ui-ux-pro-max/scripts/search.py "<query>" --design-system --persist -p "Project Name"
```

This writes `design-system/<project-slug>/MASTER.md` — the global source of
truth: colour tokens with CSS variable names, spacing and shadow scales,
component CSS (buttons, cards, inputs, modals), style, page pattern,
anti-patterns and the delivery checklist. Its Color Palette table and the
component CSS carry the same five constant hex values as the `--design-system`
block — substitute the `--domain color` palette before using either. `<project-slug>` is the `-p` value
lower-cased with spaces as hyphens; without `-p` it is the query, slugged the
same way (the confirmation the script prints afterwards says
`design-system/default/` in that case — the files are under the query slug).
`-o <dir>` changes the base directory.

Add `--page "dashboard"` to also write
`design-system/<project-slug>/pages/dashboard.md`: layout, spacing, colour and
component overrides derived from a second search on the page name plus the
query, with page-specific components and recommendations.

Retrieval is hierarchical. When building a page, read
`design-system/<project-slug>/MASTER.md`, then check whether
`design-system/<project-slug>/pages/<page>.md` exists; if it does, its rules
override the master. Prompt shape:

```
I am building the [Page Name] page. Read design-system/<project-slug>/MASTER.md.
Also check whether design-system/<project-slug>/pages/[page-name].md exists.
If it exists, prioritise its rules. If not, use the master rules exclusively.
Now generate the code.
```

## Worked example

**User request:** "Make an AI search homepage."

### Step 1: Analyze Requirements
- Product type: Tool (AI search engine)
- Target audience: C-end users looking for fast, intelligent search
- Style keywords: modern, minimal, content-first, dark mode
- Stack: React Native

### Step 2: Generate Design System (REQUIRED)

```bash
python3 .claude/skills/av-ui-ux-pro-max/scripts/search.py "AI search tool modern minimal" --design-system -p "AI Search"
```

**Output:** Complete design system with pattern, style, colors, typography, effects, and anti-patterns.

### Step 3: Supplement with Detailed Searches (as needed)

```bash
# Get style options for a modern tool product
python3 .claude/skills/av-ui-ux-pro-max/scripts/search.py "minimalism dark mode" --domain style

# Get UX best practices for search interaction and loading
python3 .claude/skills/av-ui-ux-pro-max/scripts/search.py "search loading animation" --domain ux
```

### Step 4: Stack Guidelines

```bash
python3 .claude/skills/av-ui-ux-pro-max/scripts/search.py "list performance navigation" --stack react-native
```

**Then:** Synthesize design system + detailed searches and implement the design.

## Query strategy

- Use **multi-dimensional keywords** — combine product + industry + tone + density: `"entertainment social vibrant content-dense"` not just `"app"`
- Try different keywords for the same need: `"playful neon"` → `"vibrant dark"` → `"content-first minimal"`
- Use `--design-system` first for full recommendations, then `--domain` to deep-dive any dimension you're unsure about
- Add `--stack react-native` when the target is a React Native app; it is the only stack file shipped

## Common sticking points

| Problem | What to Do |
|---------|------------|
| Can't decide on style/color | Re-run `--design-system` with different keywords |
| Dark mode contrast issues | [UX quick reference](ux-quick-reference.md) §6: `color-dark-mode` + `color-accessible-pairs` |
| Animations feel unnatural | [UX quick reference](ux-quick-reference.md) §7: `spring-physics` + `easing` + `exit-faster-than-enter` |
| Form UX is poor | [UX quick reference](ux-quick-reference.md) §8: `inline-validation` + `error-clarity` + `focus-management` |
| Navigation feels confusing | [UX quick reference](ux-quick-reference.md) §9: `nav-hierarchy` + `bottom-nav-limit` + `back-behavior` |
| Layout breaks on small screens | [UX quick reference](ux-quick-reference.md) §5: `mobile-first` + `breakpoint-consistency` |
| Performance / jank | [UX quick reference](ux-quick-reference.md) §3: `virtualize-lists` + `main-thread-budget` + `debounce-throttle` |

# Quality Checklist

Before final response, verify:

- No durable note created in vault root.
- **Template-artifact-free:** no `# 📅 Daily —` / journal header on knowledge notes.
- **Orphan gate:** every new/edited note has ≥1 inbound (from a MOC) AND ≥1 outbound link.
- **Frontmatter reconciled:** matches the vault's detected schema (or a flagged migration), not two competing schemas.
- **No cross-section redundancy; professional tone; emoji sparse.**
- Note path matches taxonomy.
- YAML frontmatter exists and parses visually.
- `title`, `created`, `updated`, `status`, `type`, `domain`, `tags` exist.
- Note is not a tiring wall of text.
- Broad content is split into linked hub/concept/deep-dive notes.
- Tags are nested and meaningful.
- Related links use explicit paths with aliases.
- Body has visible related links.
- Missing concept notes are created only when useful.
- Main note and concept notes link back to each other where practical.
- Note is understandable without chat history.
- No secrets or sensitive data copied.
- Git diff checked.

Professional note should include:

- Definition or purpose.
- Why it matters.
- Mental model.
- Components or workflow.
- Failure modes or caveats.
- Best practices.
- Related notes.

## Connectivity Scan (run when touching multiple notes / vault audit)

From the vault root. Reports orphans, leftover Daily headers, and notes missing frontmatter.

```bash
python3 - <<'EOF'
import os, re, glob
EXCLUDE=('./.git','./.obsidian','./.claude','./.smart-env','./plans','./Templates','./Excalidraw')
files=[p for p in glob.glob("**/*.md",recursive=True) if not any(("./"+p).startswith(e) for e in EXCLUDE)]
names={}
for f in files: names.setdefault(os.path.basename(f)[:-3], f)   # strip ".md" only (handles dotted titles)
LINK=re.compile(r'\[\[([^\]|#]+)')
out={}; inb={f:0 for f in files}; daily=0; nofm=0
for f in files:
    t=open(f,encoding='utf-8',errors='ignore').read()
    if '# 📅 Daily —' in t: daily+=1
    if not t.startswith('---'): nofm+=1
    L={os.path.basename(m.group(1).strip()).removesuffix('.md') for m in LINK.finditer(t)}
    out[f]=L
    for x in L:
        if x in names: inb[names[x]]+=1
orph=[f for f in files if not out[f] and inb[f]==0]
print(f"notes={len(files)} orphans={len(orph)} fake_daily_headers={daily} no_frontmatter={nofm}")
for o in sorted(orph): print("  ORPHAN:",o)
EOF
```

Note: strip only the trailing `.md` (not `os.path.splitext`) so titles containing periods like `UNIX vs. Linux` parse correctly. Path-qualified links to duplicate basenames (e.g. three `Quick Start Guide`) resolve in Obsidian even if a basename-only scan flags them — verify in-app, don't chase false positives.

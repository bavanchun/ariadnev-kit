# SVG Authoring: Generation Method, Error Prevention, and Visual Repair

How to write the SVG so it validates first time, what to do when it does not,
and how to repair a diagram that is syntactically valid but visually wrong. Read
this before writing SVG by hand, and again when validation or the visual
self-review fails.

## SVG Generation & Error Prevention

**MANDATORY: Python List Method** (ALWAYS use this):
```python
python3 << 'EOF'
lines = []
lines.append('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 700">')
lines.append('  <defs>')
# ... each line separately
lines.append('</svg>')

with open('/path/to/output.svg', 'w') as f:
    f.write('\n'.join(lines))
print("SVG generated successfully")
EOF
```

**Why mandatory**: Prevents character truncation, typos, and syntax errors. Each line is independent and easy to verify.

**Pre-Tool-Call Checklist** (CRITICAL - use EVERY time):
1. ✅ Can I write out the COMPLETE command/content right now?
2. ✅ Do I have ALL required parameters ready?
3. ✅ Have I checked for syntax errors in my prepared content?

**If ANY answer is NO**: STOP. Do NOT call the tool. Prepare the content first.

**Error Recovery Protocol**:
- **First error**: Analyze root cause, apply targeted fix
- **Second error**: Switch method entirely (Python list → chunked generation)
- **Third error**: STOP and report to user - do NOT loop endlessly
- **Never**: Retry the same failing command or call tools with empty parameters

**Validation** (run after generation):
```bash
rsvg-convert file.svg -o /tmp/test.png 2>&1 && echo "✓ Valid" && rm /tmp/test.png
```

**If using `generate-from-template.py`**:
- Prefer `source` / `target` node ids in arrow JSON so the generator can snap to node edges
- Keep `x1,y1,x2,y2` as hints or fallback coordinates, not the main routing primitive
- Let the generator choose orthogonal routes; avoid hardcoding center-to-center straight lines unless the path is guaranteed clear
- The JSON keys it understands (`style`, `containers`, `nodes[].kind`,
  `arrows[].flow`, `source_port` / `target_port`, `route_points`,
  `style_overrides`, …) are listed in `scripts/README.md`; `fixtures/*.json`
  are working examples, one per style

**Common Syntax Errors to Avoid**:
- ❌ `yt-anchor` → ✅ `y="60" text-anchor="middle"`
- ❌ `x="390` (missing y) → ✅ `x="390" y="250"`
- ❌ `fill=#fff` → ✅ `fill="#ffffff"`
- ❌ `marker-end=` → ✅ `marker-end="url(#arrow)"`
- ❌ `L 29450` → ✅ `L 290,220`
- ❌ Missing `</svg>` at end

## Line Overlap Prevention

(CRITICAL - most common bug on Codex.) When two arrows must cross each other, ALWAYS use jump-over arcs to prevent visual overlap:
- Crossing horizontal arrows: add a small semicircle arc (radius 5px, stroke same color as arrow, fill none) that "jumps over" the other line
- SVG pattern for jump-over: use a white/matching-background arc on the lower layer, then draw the upper arc on top
- Multiple crossings: stagger arc radii (5px, 7px, 9px) so arcs don't overlap each other
- Never let two arrows' straight-line segments cross without a jump-over arc

## Visual Self-Review Repairs

Syntactic validity does not guarantee visual correctness: arrows may cross
through component interiors, labels may collide with lifelines or other labels,
boxes may overlap, alt-frame text may sit on top of a message, or a legend may
cover content. If the exported PNG shows any of these, revise the SVG and
re-export; repeat until the rendered image is clean. Common fixes:

- Route arrows through gaps between boxes, not through box interiors
- Add background rects behind arrow labels (opacity 0.95, matching canvas color)
- Widen inter-row/inter-column gutters so same-layer arrows have clear corridors
- Collapse repeated cross-layer arrows into a single "delegates down" rail outside the content area
- Move legend/notes out of any region where arrows or labels land
- Increase viewBox height/width rather than packing elements tighter

# SVG Layout Best Practices

The detailed spacing, routing, layering, and validation rules behind the
Layout Rules summary in SKILL.md. Read it when planning the layout (workflow
step 3) and again before the visual self-review (step 11). Where a number here
differs from SKILL.md, SKILL.md's value is the floor and the value here is the
comfortable target.

## Universal Rules (Apply to All Styles)

### 1. Component Spacing

- **Minimum clearance between components**: 80px (edge to edge)
- **Minimum clearance for arrow paths**: 60px from component edges
- **Layer vertical spacing**: 120px between horizontal layers
- **Same-layer horizontal spacing**: 80px minimum, 100-120px preferred

### 2. Arrow Routing & Connection Points

#### Connection Point Rules

- **Never connect arrows to component corners** — use midpoints of edges
- **Entry/exit points**:
  - Top edge: `cx ± offset` where offset = 0 for a single arrow, ±30px for multiple
  - Bottom edge: same rule
  - Left/right edges: `cy ± offset`
- **Clearance from corners**: minimum 20px

#### Arrow Path Routing

- **Avoid diagonal lines crossing components** — use orthogonal routing (L-shaped paths)
- **For curved arrows**:
  - The control point must be at least 40px away from any component edge
  - Use intermediate waypoints for complex routing: `M x1,y1 L x2,y2 Q cx,cy x3,y3`
- **Multiple arrows between the same layers**: stagger Y-coordinates by 15-20px to avoid overlap

#### Arrow Overlap Prevention

```svg
<!-- Bad: diagonal arrow crosses component -->
<path d="M 200,100 L 600,400"/>

<!-- Good: orthogonal routing around component -->
<path d="M 200,100 L 200,250 L 600,250 L 600,400"/>

<!-- Good: curved with safe control point -->
<path d="M 200,100 Q 400,200 600,400"/>
<!-- Control point (400,200) is 50px+ away from any component -->
```

### 3. Arrow Label Placement

- **Position**: midpoint of the arrow path, offset by 5-10px perpendicular to the arrow direction
- **Background rect**: ALWAYS include, with:
  - Padding: 4px horizontal, 2px vertical
  - Fill: match the canvas background color
  - Opacity: 0.9-0.95
- **Safety distance**: 10px minimum from any component edge, 15px preferred
- **Multiple converging arrows**: stagger label positions vertically by 20px

### 4. Component Overlap Detection

Before finalizing the SVG, check:

- No component bounding boxes overlap (allow a 20px safety margin)
- No arrow paths pass through component interiors (except intentional tunneling with a dashed style)
- No text labels overlap components or other labels

### 5. Z-Index Layering (SVG render order)

SVG paints in document order, so later elements sit on top. Emit in this order
(back to front):

1. Background rect
2. Grouping containers (dashed rects)
3. Arrow paths
4. Arrow label background rects
5. Components (boxes, cylinders, etc.)
6. Component text
7. Arrow label text
8. Legend

## Style-Specific Enhancements

Exact tokens come from the loaded `style-N-*.md`; these are the layout habits
that differ between the two most-used styles.

### Style 1: Flat Icon

- **Perfect alignment**: snap all coordinates to the 8px grid
- **Consistent corners**: `rx="8" ry="8"` on rounded rects
- **Arrows**: thin (1.5-2px), filled polygon markers
- **No shadows**: flat design principle

### Style 6: Claude Official

- **Soft shadows**: `<feDropShadow dx="0" dy="2" stdDeviation="6" flood-color="#00000008"/>`
- **Rounder corners**: `rx="12" ry="12"` (more rounded than style 1)
- **Arrows**: medium weight (2px), subtle markers

## Validation Checklist

Before exporting the PNG, verify:

- [ ] No arrow-component overlaps (visual inspection)
- [ ] All arrow labels have background rects
- [ ] Minimum 60px clearance for all arrow paths
- [ ] Component spacing ≥ 80px
- [ ] Arrow connection points avoid corners (≥ 20px from a corner)
- [ ] Multiple arrows between layers are staggered
- [ ] Legend is readable and does not overlap content
- [ ] `bash scripts/validate-svg.sh` exits 0 and `rsvg-convert` renders it

## Common Anti-Patterns

| Anti-pattern | Fix |
|--------------|-----|
| Arrow crosses a component | Use orthogonal routing, or move the curve's control point further from the component |
| Label overlaps a component | Add a background rect and increase the perpendicular offset |
| Components too close | Increase spacing to the 80px minimum |
| Arrow connects to a corner | Move the connection point to an edge midpoint (± offset) |
| No z-index planning | Follow the render order: containers → arrows → label rects → components → text → legend |

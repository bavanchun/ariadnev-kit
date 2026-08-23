---
name: av:document-skills
description: "Use when reading, creating, or editing DOCX, PDF, PPTX, or XLSX files, including tables, forms, slides, and spreadsheets."
metadata:
  origin: ported
---

# Document Skills

Route document work to the bundled format-specific playbook:

- `docx/SKILL.md` for Word documents and OOXML;
- `pdf/SKILL.md` for PDF extraction, forms, editing, and rendering;
- `pptx/SKILL.md` for presentations and slide generation;
- `xlsx/SKILL.md` for spreadsheets, formulas, formatting, and recalculation.

Read the selected playbook completely before editing. Preserve the source unless
in-place replacement is explicit, and reopen or render the result before delivery.

See the `references/`, `scripts/`, or `resources/` directory in this skill for the underlying material.

## Output format

Return a link/path to each document, source and output formats, edits made,
validation/rendering performed, and fidelity or application limitations.

## Quality gates

- [ ] The correct format-specific playbook was read and followed.
- [ ] Existing content, formulas, layout, metadata, and accessibility were
      preserved unless intentionally changed.
- [ ] Output was reopened or rendered and visually/structurally inspected.
- [ ] Formulas recalculate and slide/document elements are not clipped.
- [ ] No macros, external links, hidden data, or personal metadata were added.

## Workflow position

**Typically follows:** `av:copywriting` or data analysis, once structure is known.

**Typically precedes:** user review or an authorized publishing flow.

**Related:** `av:media-processing` for embedded image, audio, or video
transformations outside the Office-document playbooks.

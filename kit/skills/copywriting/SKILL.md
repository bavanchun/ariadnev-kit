---
name: av:copywriting
description: "Use when writing conversion copy, headlines, email campaigns, landing pages, CTAs, A/B variants, or applying a custom writing style."
user-invocable: true
when_to_use: "Invoke for conversion copy, headlines, emails, or style transfer."
category: utilities
keywords: [copy, headlines, email, landing-page]
license: MIT
argument-hint: "[copy-type] [context]"
metadata:
  origin: ported
  author: upstream
  version: "1.0.0"
---

# Copywriting

Formulas, templates, patterns, and writing styles for high-converting copy.

## When to Use

- Writing headlines/subject lines, landing page copy, email campaigns
- Social posts, product descriptions, CTA optimization, A/B variations
- Applying custom writing styles from user documents

## Writing Styles

Load: `references/writing-styles.md` for the bundled style catalog.

**Extract styles from multi-format files:**
```bash
python scripts/extract-writing-styles.py --list        # List files
python scripts/extract-writing-styles.py --style <name> # Extract style
```

**Formats:** `.md` `.txt` `.pdf` `.docx` `.xlsx` `.pptx` `.jpg` `.png` `.mp4` (docs/media need `GEMINI_API_KEY`)

## Copy Formulas

Load: `references/copy-formulas.md`

| Formula | Structure | Best For |
|---------|-----------|----------|
| AIDA | Attention → Interest → Desire → Action | Landing pages, ads |
| PAS | Problem → Agitate → Solution | Email, sales pages |
| BAB | Before → After → Bridge | Testimonials, case studies |
| 4Ps | Promise → Picture → Proof → Push | Long-form sales |
| 4Us | Urgent + Unique + Useful + Ultra-specific | Headlines |
| FAB | Feature → Advantage → Benefit | Product descriptions |

## Headlines

Load: `references/headline-templates.md`

Patterns: "How to [X] without [Y]" • "[Number] ways to [benefit]" • "The secret to [outcome]" • "Why [belief] is wrong"

## Email Copy

Load: `references/email-copy.md`

Subject lines: Curiosity gap • Benefit-driven • Question • Urgency

## Landing Pages & CTAs

Load: `references/landing-page-copy.md` | `references/cta-patterns.md`

Hero: Headline (promise) → Subheadline (how) → CTA (action) → Social proof
CTAs: "Start [verb]ing" • "Get [benefit]" • "Yes, I want [benefit]"

## References

| File | Purpose |
|------|---------|
| `references/writing-styles.md` | 30 writing styles quick reference |
| `references/copy-formulas.md` | AIDA, PAS, BAB, 4Ps, FAB formulas |
| `references/headline-templates.md` | Headline patterns & templates |
| `references/email-copy.md` | Email copy patterns |
| `references/landing-page-copy.md` | Landing page structure |
| `references/cta-patterns.md` | CTA optimization |
| `references/power-words.md` | Power words by emotion |
| `references/social-media-copy.md` | Platform-specific copy |
| `scripts/extract-writing-styles.py` | Extract styles from multi-format files |
| `templates/copy-brief.md` | Creative brief template |

## Agent Integration

**Primary:** fullstack-developer | **Related:** brand-guidelines, content-marketing, email-marketing

## Best Practices

1. Lead with benefit, not feature | 2. One CTA per piece
3. Specificity > vague claims | 4. Read aloud—if awkward, rewrite
5. Test headlines first | 6. Match copy to awareness level

## Output format

Return the audience, awareness stage, offer, proof, objections, selected formula,
and final copy in the requested channel format. Label variants and the hypothesis
each tests. When a source style is used, name the source without copying long
passages from it.

## Quality gates

- [ ] Claims are supported by supplied evidence; placeholders are explicit.
- [ ] Voice, reading level, channel length, and required legal terms are followed.
- [ ] One primary action is clear and CTA language matches the destination.
- [ ] Variants change one meaningful hypothesis rather than random wording.
- [ ] No fabricated testimonials, metrics, urgency, scarcity, or guarantees.
- [ ] Final copy is proofread and preserves requested product terminology.

## Workflow position

**Typically follows:** `av:brainstorm` for positioning or an accepted creative brief.

**Typically precedes:** `av:document-skills` when copy must be laid out in an
Office file, or the user's publishing workflow.

**Related:** `av:design` for visual identity and `av:interview-docs` for
extracting source material and stakeholder decisions.

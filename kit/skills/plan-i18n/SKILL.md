---
name: av:plan-i18n
description: Add a bilingual Vietnamese/English language-switch to a plan.html artifact. Use after /av:plan --html when the user wants bilingual or dual-language plan output.
user-invocable: true
when_to_use: "Invoke after /av:plan --html once plan.html exists and the user asks for bilingual, Vietnamese, VN/EN, or dual-language plan delivery. Also invoke up front when the planning request itself names bilingual output."
category: utilities
keywords: [planning, bilingual, i18n, vietnamese, english, html, toggle, localization]
argument-hint: "[plan-dir]"
metadata:
  author: vchun
  version: "1.0.0"
---

# Bilingual Plan HTML (av:plan-i18n)

Add an interactive Vietnamese/English (VN/EN) language-switch to a plan's
`plan.html` artifact. This skill owns only the bilingual toggle layer.

## Scope

**Owns:** the VN/EN switch control, dual-language content authoring,
language-preference persistence, and the parity checklist below.

**Defers to `av:plan`:** creating the plan, choosing a planning mode,
generating `plan.html`'s structure/diagrams/mockups/design direction, the
`--github` issue projection, and `--wiki` publishing. Read `av:plan`'s
`## HTML Output Mode (--html)` section for those — this skill does not
restate them, and if the two ever disagree, `av:plan` is authoritative for
everything except the bilingual switch itself.

**CLI:** neither this skill nor `av:plan` mutates plan files through a CLI
plan-authoring subcommand — `av plan` only inspects/tracks status
(`use|show|list|resolve|update|check|uncheck|status|close|phase|search|
reindex|archive|cleanup`; run `av plan --help` for the live list). Plan
content — including `plan.html` — is written directly as files by the agent,
never through a CLI scaffolding call. Do not invent an `av plan create` or
`av plan translate` command; neither exists.

## When to invoke

- The user explicitly asks for "bilingual", "VN/EN", "Vietnamese and
  English", or "dual-language" plan output.
- The user runs `/av:plan-i18n [plan-dir]` directly.
- `/av:plan --html` already produced `plan.html` and the user now wants a
  language switch added to it.

If no `plan.html` exists yet in the target plan directory, hand off to
`/av:plan --html` first (or ask the user to run it), then resume here.

## Workflow

1. **Locate the artifact.** Resolve the plan directory from the argument or
   the active plan (`av plan resolve`). Read the existing `plan.html` in
   full — do not regenerate structure that `av:plan` already built.
2. **Load the pattern.** Read
   [references/bilingual-html-guide.md](references/bilingual-html-guide.md)
   for the switch markup, translation-dictionary shape, and the
   `localStorage` persistence key (`vc_plan_lang`).
3. **Translate every visible string.** For each UI label, phase title,
   objective, bullet, and phase-detail markdown block rendered in
   `plan.html`, author both a Vietnamese and an English version. Do not
   machine-translate silently past domain terms (API names, file paths,
   command names stay unchanged in both languages).
4. **Wire the toggle.** Insert the language-switch control in the header,
   the `translations` dictionary (or `data-i18n-key` attributes) for static
   UI text, and bilingual fields (`title_en`/`title_vi`, etc.) on the
   dynamic phase-data array, per the reference guide's example.
5. **Verify instant re-render.** Clicking the toggle must update header
   labels, phase cards, and any open detail modal without a page reload, and
   persist the choice across a reload via `localStorage`.
6. **Write in place.** Overwrite the existing `plan.html`; do not create a
   second file. Keep it self-contained (inline CSS/JS, no build step, no
   network-required assets) — the same portability rule `av:plan --html`
   already applies.

## Language and content rules

- Default language on first load: Vietnamese (`vi`), matching
  `localStorage.getItem('vc_plan_lang') || 'vi'` from the reference guide.
- Every string that has an English version must have a Vietnamese
  counterpart and vice versa — no partial translation.
- Preserve `av:plan`'s design direction (editorial style, diagrams, mockups)
  untouched; only the copy and the switch control change.
- Code blocks, commands, file paths, and identifiers are language-neutral —
  do not translate them.

## Output format

Report:
- The `plan.html` path (unchanged from `av:plan`'s output location).
- Confirmation the VN/EN switch is present, tested for instant re-render on
  static text, phase cards, and any open modal, and that the language choice
  persists via `localStorage`.
- Any UI string found without a translation counterpart, listed explicitly
  rather than silently left English-only or Vietnamese-only.

## Quality gates

- [ ] `plan.html` still opens standalone (no build step, no network fetch)
- [ ] Every static UI label and every phase field has both `_en` and `_vi`
      content
- [ ] Toggling language updates header, phase cards, and an open modal
      instantly, with no page reload
- [ ] Language preference persists via `localStorage` across a reload
- [ ] No planning-workflow content (modes, GitHub, wiki, task hydration) was
      duplicated from `av:plan` into this skill's output or reasoning

## Workflow position

**Typically follows:** `/av:plan --html` (the base `plan.html` must exist
first).
**Typically precedes:** the same post-plan handoff `av:plan` already offers
(`/av:plan validate`, `/av:plan red-team`, `/av:cook`) — this skill does not
add its own handoff step.
**Related:** `av:plan` owns planning, modes, and the base HTML artifact;
`av:plan-i18n` only adds the bilingual layer on top of it.

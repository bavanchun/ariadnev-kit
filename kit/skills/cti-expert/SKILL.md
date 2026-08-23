---
name: av:cti-expert
description: "Use for OSINT/CTI casework: exposure review, domain and cloud-tenant recon, breach, username, email, phone checks, image forensics, blockchain and darknet tracing, CVE lookup, threat models, reports."
user-invocable: true
when_to_use: "Invoke for OSINT, exposure review, or threat intelligence reports."
category: security
keywords: [osint, cti, threat-intelligence, recon, investigation, darknet, breach, forensics]
argument-hint: "[target] [--yolo] [--case|--sweep|--query|--flow]"
metadata:
  origin: ported
  version: "2.0"
  author: "Hieu Ngo - chongluadao.vn"
  source: "https://github.com/7onez/cti-expert"
  license: "MIT"
---

# CTI Expert

Cyber threat intelligence and open-source intelligence skill. Turns Claude into a trained CTI/OSINT analyst. Generates precision search queries, interprets public data, builds case timelines, and delivers structured intelligence products — no API keys, no paid subscriptions.

Collection method: `agent-browser` when available (JavaScript-heavy sites, infinite-scroll, screenshot evidence), with automatic fallback to web search / web fetch / direct URL fetch. Tool limitations are logged as collection gaps — never as case blockers.


## 1. Quick Start

```bash
# Full autonomous case — runs every applicable technique
/case target.com

# Guided flow for first-time investigators
/flow person

# Summary of what's been found so far
/brief
```

Append `--yolo` to any command to skip all interactive prompts and confirmations. The analyst makes every decision autonomously.

---

## 2. AEAD Case Lifecycle

Every investigation follows four phases:

| Phase | What Happens |
|-------|-------------|
| **Acquire** | Collect raw data — `/sweep`, `/query`, `/username`, `/phone`, `/email-deep`, `/subdomain` |
| **Enrich** | Expand leads — `/branch`, `/crossref`, `/link-subjects`, `/signatures` |
| **Assess** | Score and verify — `/exposure`, `/threat-model`, `/validate`, `/coverage`, `/verify-finding` |
| **Deliver** | Package output — `/report`, `/brief`, `/render`, `/workspace save` — **auto-saves .md + .docx** |

Run `/progress` at any point to see which phase you're in and what's pending.

---

## 3. Reference Map

Everything below the lifecycle lives in `references/`. Open the one the current
phase needs rather than reading them in order.

| Reference | Open it when |
|---|---|
| [Command reference](references/command-reference.md) | You know the phase and need the exact command and its arguments |
| [Subject and finding model](references/subject-and-finding-model.md) | Recording a finding, grading a source, or drawing the relationship map |
| [Technique catalog](references/technique-catalog.md) | Choosing a collection technique, a per-role workflow, or the output detail level |
| [Technique activation matrix](references/technique-activation.md) | Predicting what an autonomous `/case` will run against this target type |
| [Report formats](references/report-formats.md) | Delivering — especially before building the DOCX JSON, whose contract is strict |
| [Tool auto-install policy](references/tool-auto-install.md) | A CLI tool is missing and the run must not stall |
| [Architecture](references/architecture.md) | Extending the skill and needing to know which directory owns what |

Deep material also lives outside `references/`, each directory with its own
trigger: `techniques/` when one collection method needs its full procedure,
`workflows/` when the user names their role (journalist, HR, PI, analyst),
`handbook/` when a search engine needs an exact operator query,
`guides/walkthroughs/` when a worked example of a whole case would help, and
`output/reports/` at delivery — `format-catalog.md` there owns the per-format
layouts and the auto-save policy.

## 4. Finding Framework

Reference: `engine/finding-framework.md`, `engine/conflict-resolver.md`

Every finding logged via `/record-finding` captures:

```
Source URL / method
Collection method (browser | search | fetch | manual)
Trust score (1–5)
Confidence level (VERIFIED → CHALLENGED)
Timestamp
Linked subjects
```

**Conflict detection** (`engine/conflict-resolver.md`): When two findings about the same subject contradict each other, the system flags a CONTESTED state. Both findings are preserved. Resolution options: accept one, mark both TENTATIVE, or log the conflict as its own finding.

**Deviation detection** (`analysis/deviation-detector.md`): Automatically flags behavioral anomalies — account creation gaps, platform presence inconsistencies, metadata mismatches.

**Weight engine** (`analysis/weight-engine.md`): Aggregates trust scores across findings to compute subject-level confidence.

## 5. Exposure Score Bands

| Range | Label | Action |
|-------|-------|--------|
| 0–25 | Minimal | Passive monitoring sufficient |
| 26–50 | Moderate | Periodic review advised |
| 51–75 | Elevated | Address within 30 days |
| 76–100 | Critical | Immediate escalation required |

---

## 6. Tool Priority & Fallback

1. Check `agent-browser` availability first
2. Use `agent-browser` for: screenshot evidence, interactive UI, complex multi-step browser flows
3. Use Scrapling DynamicFetcher for: JS-heavy sites, SPA content, auto-escalation from static
4. Use Scrapling StealthyFetcher for: anti-bot bypass, Cloudflare-protected targets
5. Use Scrapling Fetcher for: fast static page collection, HTML parsing (~2ms)
6. Fall back to web search → web fetch → direct curl — no investigation blockers
7. Tag each finding with collection method: `[browser]` · `[scrapling-dynamic]` · `[scrapling-stealth]` · `[scrapling-static]` · `[search]` · `[fetch]` · `[manual]` · `[whois-lib]` · `[whois-cli]` · `[whois-api]`

## 7. Ethics & Boundaries

This skill operates strictly within publicly available information.

### Permitted

- Journalists verifying facts about public figures or institutions
- Security professionals auditing their own organization's exposure
- Individuals reviewing their own digital footprint
- Corporate due diligence on business partners
- Academic research and educational demonstrations

### Prohibited

- Stalking, harassment, or doxing of any individual
- Accessing accounts or systems without authorization
- Social engineering or deception campaigns
- Any activity violating applicable law

Ethical reminders are issued automatically when the investigation approaches sensitive territory. Public data is not a license to cause harm.

---

## 8. Autonomous Mode (--yolo)

Append `--yolo` to any command or activate at session start.

**What changes:**
- No clarifying questions — analyst infers context and proceeds
- No confirmation prompts — scope expands automatically on new discoveries
- Guided flows skip Q&A — reasonable defaults applied
- Both `/report` and `/brief` generated without asking

**What stays the same:**
- Ethics and legal boundaries — always enforced
- Trust scores on every finding
- Source citations on every claim
- `/validate` and `/coverage` run before final delivery

Activate per-command: `/case target.com --yolo`
Activate for session: `/cti-expert --yolo`

---

## Output format

Every case delivers the same three artefacts, whatever the target type. The
markdown report is the primary content; the JSON exists so the DOCX can render
charts from structured data. See
[report formats](references/report-formats.md) for the exact JSON contract.

```
OSINT-REPORT-<CASE-ID>-<YYYY-MM-DD>.md      full narrative — the source of truth
OSINT-REPORT-<CASE-ID>-<YYYY-MM-DD>.json    structured data for charts and diagrams
OSINT-REPORT-<CASE-ID>-<YYYY-MM-DD>.docx    rendered from both, zero content loss
```

The markdown report follows the INTSUM template in
`handbook/report-template.md`, in this order. The heading names are
load-bearing: the DOCX generator places each chart by matching keywords in the
heading text (`scripts/cti_docx_postprocess.py`), so a section renamed to
"Connections" loses its relationship diagram without any error.

```markdown
# <Case label> — <target>
Classification · analyst · date · exposure score (0–100)

## Executive summary
One paragraph. The most-read section; never a placeholder. (risk gauge)

## Subject profile
| Subject | Type | Trust | Confidence | First seen |

## Key findings
| ID | Subject | Type | Weight | Finding | Source | Collected |  (charts)

## Entity relationship map
ASCII map, plus the connection table behind it. (diagram)

## Timeline
Dated events, earliest first. (chart)

## Source list
Every URL cited above, with collection date and method tag.

## Intelligence gaps
What was not collectable, and why. Never omitted — a gap left unstated
reads as an absence of risk.

## Recommended next steps
Ordered actions, each tied to a finding ID.

## Analyst caveats and methodology notes
The limits of what was collected and how; the JSON `caveats` field carries
the same text.
```

Visual output is ASCII box-drawing by default so it survives both the `.md` and
the `.docx`. Mermaid only on an explicit `--mermaid` flag.

## Quality gates

- [ ] Every finding carries a source URL, a collection-method tag, a trust score (1–5) and a confidence level — a claim without all four is not a finding
- [ ] Contradictory findings are both preserved and marked CONTESTED, never silently resolved in favour of the newer one
- [ ] Intelligence gaps are stated explicitly, including tool failures and blocked collection — silence here reads as "nothing there"
- [ ] The exposure score is derived from recorded findings, not asserted; the band and its action are both stated
- [ ] `/validate` and `/coverage` have run and their gaps are either closed or listed as gaps
- [ ] The DOCX JSON meets the contract in [report formats](references/report-formats.md) — integer confidences, flat `findings`, a `label` on every subject — and the report headings carry the keywords the generator places charts by; both fail silently otherwise
- [ ] The subject is within the ethical boundary in section 7 — public data on a public matter, not a private individual being tracked

## Workflow position

**Typically follows:** nothing — a case usually starts here from a target
supplied by the user. When the target came from other work, `av:scout` (an
identifier surfaced while reading a codebase) or `av:advise` (the user was
deciding whether an investigation is the right response at all).

**Typically precedes:** `av:journal` when the case is worth a durable record,
and `av:preview` when the ASCII maps need rendering for someone who will not
read a terminal.

**Related:** `av:agent-browser` is the preferred collection tool, and this skill
falls back to search and fetch when it is unavailable. `av:security` and
`av:security-scan` examine the same organisation from the inside, with the code
in hand; this one is restricted to what is publicly observable, which is why
its findings carry a source URL and theirs carry a file path.

# Architecture Reference

The on-disk layout of this skill: which directory owns which concern, and which
file to open when extending it.

```
cti-expert/
├── SKILL.md                    This file
├── README.md                   User-facing overview
│
├── engine/                     Case data model and state management
│   ├── case-schema.json        Subject and finding data structures
│   ├── subject-registry.md     How subjects are tracked and versioned
│   ├── finding-framework.md    Finding lifecycle, trust scores, evidence chains
│   ├── workspace-format.md     Workspace serialization spec
│   ├── workspace-manager.md    Save/open/list workspace logic
│   └── conflict-resolver.md    CONTESTED finding resolution
│
├── analysis/                   Pattern detection and intelligence engines
│   ├── deviation-detector.md   Behavioral anomaly detection
│   ├── auto-branch-rules.md    Automatic pivot trigger rules
│   ├── drift-monitor.md        Subject state change tracking
│   ├── cross-reference-engine.md Shared identifier detection across subjects
│   ├── archive-explorer.md     Wayback Machine integration and diff
│   ├── signature-catalog.md    Behavioral pattern library
│   ├── exposure-model.md       Exposure score calculation framework
│   ├── risk-trend-tracker.md   Temporal risk score tracking (/drift)
│   ├── pattern-library.md      Username, email, bot detection patterns
│   └── weight-engine.md        Finding aggregation and confidence weighting
│
├── techniques/                 Collection techniques and module specs
│   ├── fx-metadata-parsing.md  EXIF, headers, document metadata
│   ├── fx-image-verification.md Image authenticity and provenance
│   ├── fx-breach-discovery.md  Breach database and paste site methods
│   ├── fx-geolocation.md       GPS, W3W, Plus Codes, Street View
│   ├── fx-social-topology.md   Social graph construction and topology
│   ├── fx-email-header-analysis.md Header analysis, SPF/DKIM
│   ├── fx-document-forensics.md Document forensics and extraction
│   ├── fx-http-fingerprint.md  HTTP fingerprinting and signatures
│   ├── fx-leak-monitoring.md   Leak and breach monitoring
│   ├── username-osint.md       Platform enumeration (3000+)
│   ├── phone-osint.md          Phone carrier/VoIP/spam lookup
│   ├── email-osint.md          Deep email investigation
│   ├── threat-intel.md         Threat intelligence free lookups
│   ├── web-traffic-analysis.md Traffic estimation methods
│   ├── secret-scanning.md      Credential/secret detection
│   ├── domain-advanced.md      Subdomain enumeration methods
│   ├── social-media-platforms.md Platform-specific techniques
│   ├── advanced-geolocation-techniques.md Overpass Turbo, road signs, reflected text
│   ├── wifi-ssid-osint.md      WiFi SSID/BSSID geolocation via Wigle.net
│   ├── web-dns-forensics.md    DNS, GitHub, Telegram, WHOIS
│   ├── fx-visitor-intelligence.md Visitor stats, tech stack, geo analysis
│   ├── scam-check.md           Phishing/scam domain verification
│   ├── cloud-audit.md          Cloud infrastructure security audit
│   ├── microsoft-tenant-recon.md M365/Azure tenant enumeration
│   ├── dependency-audit.md     Supply chain security audit
│   ├── disk-forensics.md       Digital evidence analysis
│   ├── incident-triage.md      Security incident response
│   ├── owasp-audit.md          OWASP Top 10 source code audit
│   ├── prompt-injection-audit.md AI/LLM security audit
│   └── ioc-export.md           IOC export (STIX 2.1, flat list)
│
├── experience/                 UX, tiers, and guided flows
│   ├── skill-tiers.md          Novice/Practitioner/Specialist spec
│   ├── layered-detail.md       Progressive disclosure rules
│   ├── guidance-system.md      How guided flows work
│   ├── case-progress.md        Progress tracking logic
│   ├── guided-flows/           Interactive step-by-step flows
│   │   ├── flow-person-lookup.md Person investigation guided flow
│   │   ├── flow-domain-sweep.md Domain reconnaissance guided flow
│   │   └── flow-image-check.md Image verification guided flow
│   ├── case-templates/         Pre-built case configurations
│   │   ├── tpl-index.md        Template index and descriptions
│   │   ├── tpl-due-diligence.md Due diligence case template
│   │   ├── tpl-security-review.md Security audit case template
│   │   └── tpl-background-check.md Background check case template
│   ├── tutorial.md             First-time onboarding guide (/onboard)
│   ├── feedback-system.md      Investigation quality feedback loops
│   └── accessibility/          Glossary and accessibility settings
│       ├── glossary.md         OSINT term glossary
│       └── accessible-mode.md  Low-jargon mode settings
│
├── output/                     Report and visualization specs
│   ├── reports/                Report format templates
│   │   ├── format-catalog.md   Report format specifications
│   │   ├── leadership-brief-template.md Executive brief template
│   │   ├── export-specs.md     Export format specifications
│   │   └── citation-guide.md   Source citation standards
│   └── visuals/                Chart and visualization specs
│       ├── chart-templates.md  Chart rendering templates
│       ├── ui-components.md    UI component library
│       ├── render-engine.md    ASCII render engine spec
│       ├── case-dashboard.md   Dashboard layout spec
│       ├── attack-path-diagram.md  Attack path flow visualization (/render threat-path)
│       └── attack-surface-map.md   Attack surface exposure map (/render attack-surface)
│
├── scripts/                    DOCX and HTML report generation
│   ├── generate-cti-docx-hybrid.py  PRIMARY: Hybrid MD+JSON generator (pandoc + post-process)
│   ├── generate-cti-docx.py         Fallback: JSON-only generator
│   ├── generate-cti-html.py         Opt-in (--format html): HTML mirror from the same MD + JSON
│   ├── cti_report_headings.py       Heading keywords that place charts — shared by DOCX and HTML
│   ├── cti_docx_postprocess.py      Post-processing: styling, chart injection, cover page
│   ├── cti_docx_charts.py           Chart rendering (pie, bar, gauge, timeline, traffic, geo)
│   ├── cti_docx_diagrams.py         Entity relationship + network topology diagrams
│   ├── cti_docx_sections.py         Report section formatting (used by JSON-only generator)
│   ├── cti_docx_styles.py           Document styling, colors, cover page, header/footer
│   ├── cti_html_visuals.py          Inline SVG charts + Mermaid graphs for the HTML mirror (stdlib only)
│   ├── requirements.txt             Python dependencies (DOCX path; the HTML path needs none)
│   └── sample-cti-report-data.json  Example JSON report data
│
├── workflows/                  Professional workflow guides
│   ├── wf-journalist.md
│   ├── wf-hr-screening.md
│   ├── wf-threat-analyst.md
│   └── wf-private-investigator.md
│
├── handbook/                   Reference material
│   ├── operator-queries.md     Search operator catalog
│   ├── quick-report.md         Rapid reporting reference
│   ├── discovery-paths.md      Per-target-type search paths
│   ├── report-template.md      INTSUM format specification
│   └── tool-cascade-reference.md Tool priority and fallback chains
│
├── guides/                     Worked case walkthroughs
│   └── walkthroughs/           Step-by-step investigation examples
│       ├── walkthrough-person-lookup.md
│       ├── walkthrough-domain-sweep.md
│       └── walkthrough-username-trace.md
│
├── validation/                 Quality assurance
│   ├── coverage-matrix.md      Investigation area coverage tracking
│   ├── quality-scoring.md      Scoring methodology
│   └── verification-checklist.md Finding verification steps
│
└── connectors/                 External tool integrations
    ├── maltego-export.md
    ├── obsidian-setup.md
    └── notion-schema.md
```

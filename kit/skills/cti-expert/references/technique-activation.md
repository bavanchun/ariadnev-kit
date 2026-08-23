# Technique Activation Matrix

Which techniques fire for which target type during a `/case` run, and how each
phase feeds newly discovered identifiers into the next. Read this to predict
what an autonomous run will do before starting one.

Which techniques activate per target type in a `/case` run:

| Technique | Person | Domain | Org | Username | Email | IP |
|-----------|--------|--------|-----|----------|-------|----|
| `/sweep` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/query` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/username` | ✅ | — | ✅* | ✅ | — | — |
| `/email-deep` | ✅ | — | ✅* | — | ✅ | — |
| `/phone` | ✅ | — | ✅* | — | — | — |
| `/breach-deep` (LeakCheck + HudsonRock) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/subdomain` | — | ✅ | ✅ | — | — | — |
| `/traffic` | — | ✅ | ✅ | — | — | — |
| `/threat-check` | — | ✅ | ✅ | — | — | ✅ |
| `/secrets` | — | ✅ | ✅ | ✅ | — | — |
| `/scam-check` | — | ✅ | ✅ | — | — | — |
| `/branch` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/gdoc` | — | ✅ | ✅ | — | — | — |
| `/sharelink` | ✅ | — | ✅ | ✅ | ✅ | — |
<!-- dork-integration:phase-05 start -->
| `/dork-sweep` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅* |
| `/docleak` | ✅ | ✅ | ✅ | ✅* | — | — |
<!-- dork-integration:phase-05 end -->
| Social media platforms | ✅ | — | ✅ | ✅ | — | — |
| Metadata forensics | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Photo verification | ✅ | — | ✅* | ✅ | — | — |
| Network analysis | — | ✅ | ✅ | — | — | ✅ |
| Advanced geolocation | ✅ | — | — | ✅ | — | — |
| Web & DNS forensics | — | ✅ | ✅ | — | ✅ | ✅ |
| `/timeline` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/exposure` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/threat-model` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/wifi` (SSID/BSSID) | ✅ | ✅ | ✅ | — | — | ✅ |
| Visitor intelligence | — | ✅ | ✅ | — | — | ✅ |
| Cloud audit | — | ✅ | ✅ | — | — | ✅ |
| MSFTRecon (M365/Azure tenant) | — | ✅ | ✅ | — | — | — |
| Dependency audit | — | ✅ | ✅ | — | — | — |
| Disk forensics | — | — | — | — | — | — |
| Incident triage | — | ✅ | ✅ | — | — | ✅ |
| OWASP audit | — | ✅ | ✅ | — | — | — |
| Prompt injection audit | — | ✅ | ✅ | — | — | — |
| `/snapshots` | — | ✅ | ✅ | — | — | ✅ |
| `/diff` | — | ✅ | ✅ | — | — | ✅ |
| `/drift` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/render threat-path` | — | ✅ | ✅ | — | — | ✅ |
| `/render attack-surface` | — | ✅ | ✅ | — | — | ✅ |
| `/blind-spots` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/source-check` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/report ioc` | — | ✅ | ✅ | — | — | ✅ |
| `/report` + `/brief` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Shodan InternetDB (ports/tags/vulns) | — | ✅ | ✅ | — | — | ✅ |
| GreyNoise Community (noise/threat class) | — | ✅ | ✅ | — | — | ✅ |
| URLScan.io passive (scan history) | — | ✅ | ✅ | — | — | — |
| Disposable email check (kickbox) | ✅ | — | ✅* | — | ✅ | — |
| URLhaus (malware URL hosting) | — | ✅ | ✅ | — | — | ✅ |
| ThreatFox (IOC/C2 lookup) | — | ✅ | ✅ | — | — | ✅ |
| MalwareBazaar (hash → malware family) | — | — | — | — | — | — |
| ipwho.is (geo + ASN + ISP) | — | ✅ | ✅ | — | — | ✅ |
| DMARC/SPF/DKIM check (DNS) | — | ✅ | ✅ | — | ✅ | — |

`✅*` — runs for discovered key personnel within the organization
`MalwareBazaar` — activates only via `/hash [value]` when a file hash is discovered during investigation

**Adaptive chaining:** Each phase feeds newly discovered identifiers into subsequent phases automatically. If `/sweep` on a domain finds an email, `/email-deep` and `/breach-deep` trigger on it automatically.

<!-- dork-integration:phase-05 start -->
**`✅*` dork coverage notes:** `/dork-sweep` on IP runs against reverse-DNS hostname once resolved (graceful skip if no rDNS); `/docleak` on Username targets document-author/uploader fields on scribd, slideshare, academia.edu, researchgate.

**Dork auto-fire matrix — every `/case` target type gains coverage:**
- Person → `/dork-sweep --telegram --docs` + `/docleak` on full name
- Domain → `/dork-sweep --filetype --docs` + `/docleak` on domain + org name
- Org → `/dork-sweep --filetype --docs --telegram` + `/docleak` on org + primary domain
- Username → `/dork-sweep --telegram --docs` + `/docleak` (author-angle)
- Email → `/dork-sweep --telegram --docs` on email + `@domain`
- IP → `/dork-sweep` on rDNS-resolved hostname (skipped if no rDNS)

Adaptive fan-out: discovered emails → Telegram dork; discovered personnel → `/docleak`; discovered subdomains → filetype dork; discovered usernames → Telegram + doc sweep; discovered IPs → rDNS → dork-sweep.
<!-- dork-integration:phase-05 end -->

When `/case` or `/sweep` runs on a Domain or Org target, it inspects the MX record and SPF TXT record. If MX ends in `protection.outlook.com` OR SPF contains `spf.protection.outlook.com`, `/msftrecon` auto-fires as part of the Acquire phase. Results feed back into the subject registry as `infrastructure` findings (tenant ID, federation type, MDI presence) and into `/exposure` scoring.

**`/case` pipeline walkthrough (M365-hosted Domain/Org):** (a) standard DNS/WHOIS/subdomain/traffic/scam-check/breach-deep checks run first, (b) if M365 indicators present → `/msftrecon` fires automatically with no extra flag, (c) tenant ID discovered becomes a pivot for `/branch` in Enrich phase (search other domains under the same tenant). No user intervention required.

**Parallel enrichment (3+ subjects):** When Acquire discovers 3+ subjects, enrichment commands fan out in parallel via AgentFlow DAG orchestration. Each subject's enrichment runs independently, results merge with dedup before Assess phase. Disable with `--sequential` flag. See `techniques/agentflow-enrichment.md`.

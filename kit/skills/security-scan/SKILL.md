---
name: vc:security-scan
description: Scan a codebase for hardcoded secrets, vulnerable dependencies, and common OWASP-style code patterns. Use for "security scan", "check for secrets", or before a release.
user-invocable: true
argument-hint: "[path] [--secrets-only|--deps-only]"
metadata:
  author: vchun
  version: "1.0.0"
  upstream: "ak:security-scan"
  upstream_version: "1.0.0"
  upstream_digest: "sha256:a8202cc3fa8e5e678ecdb6c8d54b0e7e7320aa1c630e8425ac5ed0e11aaba376"
  upstream_relation: "distill"
---

# Security Scan

Lightweight scanner using grep patterns + reasoning — no external service, no
API key, no paid dependency.

Handles: secret detection, dependency audit, common code-level vulnerability
patterns.
Does not handle: penetration testing, runtime analysis, infrastructure
security, compliance audits.

## Workflow

1. **Detect stack** (package.json / requirements.txt / go.mod / Cargo.toml)
   to pick the right dependency-audit command.
2. **Secrets first** — grep the patterns in `references/secret-patterns.md`,
   excluding `.env.example`/`.sample`/`.template`, test fixtures, and
   generated dirs. For each hit, confirm it isn't an obvious placeholder
   (`YOUR_API_KEY`, `xxx`) before reporting it as real.
3. **Dependency audit** — run the stack's native audit command
   (`npm audit --json`, `pip audit --format json`, etc.); parse and
   categorize by severity. Missing tool → note it, don't fail the scan.
4. **Code patterns** — grep the patterns in
   `references/vulnerability-patterns.md`; read 5-10 lines of context around
   each hit and reason about whether it's a real vulnerability or a false
   positive before reporting it.
5. **`.env` exposure** — check `git ls-files` for tracked `.env*` files and
   that `.gitignore` actually excludes them.

## Severity

| Level | Meaning |
|---|---|
| Critical | Exploitable now: exposed prod credential, confirmed injection path |
| High | Real credential or vulnerability pattern, exploitation plausible |
| Medium | Possible credential/pattern, needs a human look |
| Low | Style/hardening suggestion, not exploitable as-is |

## Output format

```markdown
# Security Scan Report
Scanned: <path> | Files checked: <n>

## Summary
| Category | Critical | High | Medium | Low |
|---|---|---|---|---|

## Findings
### CRITICAL
1. [SECRET] <redacted-pattern> in `path:line` — fix: <concrete action>

## Recommendations
1. <prioritized>
```

Confirmed Critical/High findings route to `vc:fix` for remediation — this
skill reports, it does not patch code automatically. Each fix recommendation
names the proof that would confirm it (`integration` test that the injection
path is closed, `unit` test that the validator rejects the payload) so `vc:fix`
inherits a testable done-condition, not just "sanitize the input".

## Security policy

- Never print an actual secret value — redact to first 4 + last 2 chars
- Never execute a credential found during scanning
- Never modify code automatically, only report + recommend
- A confirmed real credential → recommend immediate rotation, not just a code fix

## Quality gates

Before delivering the report:

1. Every finding cites `path:line` — no "there may be secrets somewhere".
2. Every reported hit passed the false-positive check (placeholder excluded,
   5-10 lines of context read) — a wall of grep noise is not a scan.
3. Secret values are redacted; no raw credential appears in the report.
4. Each Critical/High finding has a concrete fix + its confirming proof layer.
5. Severity is justified by exploitability, not by pattern-match count.

## Workflow position

**Typically follows:** a pre-release checkpoint, `vc:cook` finalize on
security-sensitive work, or a direct "scan for secrets" request.
**Typically precedes:** `vc:fix` (remediate confirmed Critical/High findings).
**Related:** `vc:fix` handles the actual patching; this skill only finds and
reports. For dependency-only or secret-only runs, use the `--deps-only` /
`--secrets-only` flags.

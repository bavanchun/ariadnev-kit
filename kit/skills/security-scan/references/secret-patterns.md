# Secret Patterns

Grep targets for the secrets pass. Match, then verify it isn't a placeholder
before reporting.

| Kind | Pattern (regex) | Notes |
|---|---|---|
| AWS access key | `AKIA[0-9A-Z]{16}` | High-confidence, almost never a false positive |
| AWS secret key | `(?i)aws_secret[_-]?access[_-]?key['\"]?\s*[:=]\s*['\"][A-Za-z0-9/+=]{40}['\"]` | Check the value length is exactly 40 |
| GitHub token | `gh[pousr]_[A-Za-z0-9]{36,}` | Covers ghp_/gho_/ghu_/ghs_/ghr_ prefixes |
| Generic API key assignment | `(?i)(api|secret|access)[_-]?key['\"]?\s*[:=]\s*['\"][A-Za-z0-9_\-]{16,}['\"]` | Highest false-positive rate — verify context |
| Stripe key | `sk_live_[0-9a-zA-Z]{24,}` | `sk_test_` prefix is not a real-world secret |
| Private key header | `-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----` | Always real unless clearly a fixture labeled as such |
| DB connection string with credentials | `(postgres|mysql|mongodb)(\+srv)?://[^:]+:[^@]+@` | Check host isn't `localhost`/`127.0.0.1` in a fixture |
| Hardcoded password assignment | `(?i)password['\"]?\s*[:=]\s*['\"][^'\"]{6,}['\"]` | Exclude obvious placeholders (`changeme`, `password123` in test fixtures) |
| Slack webhook | `hooks\.slack\.com/services/T[0-9A-Z]+/B[0-9A-Z]+/[0-9A-Za-z]+` | |
| JWT-looking literal | `eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+` | Often a test fixture — check surrounding context |

## Exclusions (always skip)

`.env.example`, `.env.sample`, `.env.template`, files under a `fixtures/`,
`__mocks__/`, or `test/` dir, `node_modules/`, `dist/`, `build/`, `.git/`.

## Placeholder tells (do not report these as real)

`YOUR_API_KEY`, `xxx`, `<redacted>`, `INSERT_KEY_HERE`, `changeme`,
`example`, all-same-character strings, obviously truncated/masked values.

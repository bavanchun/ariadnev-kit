# Handoff Template & Redaction Checklist

Read when drafting the handoff block. Fill every section; drop a section only
when it is genuinely empty and say so.

## Section template

    # HANDOFF: <short title>
    Generated: <YYYY-MM-DD HH:mm TZ> · Session focus: <one line>

    ## Goal
    What outcome this session was driving toward.

    ## Why It Matters
    The stakes / the reason this is worth continuing.

    ## Current State
    What exists now — branches, files, what runs, what is deployed.

    ## Key Decisions and Why
    Each decision + the rationale, so the next agent does not re-litigate it.

    ## Rejected Approaches and Traps
    What was tried and abandoned, and the trap to avoid repeating.

    ## Verification Status
    What is proven (tests/commands run) vs assumed. Name the evidence.

    ## Relevant Files and Pointers
    Plans, commits, PRs, diffs, tests — links, not copies.

    ## Open Work and Dependencies
    Remaining work as state + dependencies, not bare imperatives.

    ---
    Fresh-agent prompt: <one paragraph telling the next agent to read the listed
    files and verify this handoff against the repo before acting>.

## Redaction checklist

Strip before emitting or saving:

- Secrets, API tokens, passwords, private keys, connection strings
- Private/internal URLs and hostnames; customer or personal data (PII)
- Absolute machine-specific paths that leak a username or environment

Replace a needed credential with only the safe *location* of it
(e.g. "token in `.env` / 1Password item X"), never the value.

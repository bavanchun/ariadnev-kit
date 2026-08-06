# Source Selection

Read this reference when version, language, plugin scope, incomplete
documentation, or conflicting sources can change the answer.

## Source priority

Use context, not recency alone:

1. official docs for the exact installed/requested version;
2. official docs for the latest version;
3. the official GitHub README, tagged repository docs, changelog, tests, and
   examples;
4. maintainer issues or discussions;
5. community tutorials;
6. Stack Overflow and other informal answers.

For a latest-version question, swap the first two entries. A lower-ranked
source can clarify an ambiguity, but it cannot silently replace the official
contract.

## Version-specific lookup

1. Read the requested version from the question, lockfile, manifest, or runtime.
2. Search the official version selector and versioned paths such as `/v2/`,
   `/docs/v2/`, or `/{version}/`.
3. For repository evidence, inspect the matching tag or release branch rather
   than `main`.
4. Cite the selected version next to every behavior that differs from latest.

When latest and versioned documentation conflict, identify the primary official
source, note the version differences, present both approaches with context,
recommend the one matching the target version, and explain why the conflict
exists. Do not blend examples from different releases.

## Language-specific documentation

Identify the target language from the user or project. Search first for the
official localized site or a language-specific `llms.txt`, such as
`llms-ja.txt` or `llms-es.txt`.

If no maintained translation exists, fall back to English and note the language
limitation in the report. Preserve identifiers and API names exactly; translate
the explanation, not the code contract.

## Frameworks with plugins

For an ecosystem with many plugins:

1. focus on the core framework first;
2. ask or infer which plugin is actually in scope;
3. launch a targeted search for that specific plugin;
4. note relevant available plugins without documenting all of them;
5. keep core and plugin version compatibility visible.

Do not document every integration up front. A plugin page is authoritative for
plugin behavior only when it matches the core framework version.

## Documentation under construction

Signals include a new release with missing pages, “coming soon” sections,
unresolved documentation issues, and examples newer than the prose.

When documentation is incomplete:

1. note the status upfront;
2. combine available official docs with repository analysis;
3. check `tests/` and `examples/` directories for executable usage;
4. clearly mark conclusions as “inferred from code”;
5. link relevant GitHub issues for updates;
6. name the inspected tag or commit so the inference is reproducible.

Tests and examples demonstrate observed usage, not necessarily a stable public
contract. Distinguish “works in this revision” from “documented and supported.”

## Conflict record

When sources disagree, capture:

| Field | Record |
|---|---|
| Source A / B | Exact URLs or repository paths |
| Version/date | Which release each describes |
| Difference | The incompatible instructions or behavior |
| Decision | Which source governs this answer and why |
| Residual risk | What must be tested in the target project |

This record can stay compact in the final caveat, but the reasoning must not be
discarded.

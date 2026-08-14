# Scripts and Portability

Use this reference when a skill needs executable helpers, MCP/connectors, or
claims support across more than one runtime.

## Script decision

Add a script only when deterministic code prevents repeated reinvention,
reduces run variance, or performs a complex transformation more safely than
prose. Prefer an existing project CLI/helper when it already owns the behavior.

All scripts must:

- have focused tests, and all tests must pass—never skip failed tests;
- follow repository code-size and language conventions;
- use clear success/failure exit codes and actionable errors;
- avoid silent fallback and partial output presented as success;
- be safe for repeated execution or document non-idempotent effects;
- declare dependencies and platform/network requirements;
- work cross-platform for every runtime the project claims to support.

Use explicit environment variables already owned by the project. Do not scan
dotenv files or invent a global/user/project precedence hierarchy. Never log
secret values; include sanitized examples only when setup documentation needs them.

## Runtime portability

Keep the name, description, relative paths, and basic Markdown workflow
portable. Portability is a design goal, not a claim that every runtime supports
the same frontmatter, tools, sandbox, shell, model, install root, or auth method.

1. Isolate runtime-specific commands and capabilities behind an explicit
   availability check.
2. Test discovery and execution in every runtime the project claims to support.
3. Document a safe fallback, or fail clearly when a required capability is unavailable.
4. Avoid absolute machine paths and assumptions about writable directories.
5. Keep error paths useful without exposing internal configuration.

## MCP and connector skills

Tool access defines what the runtime can do; a skill defines how to produce the
user outcome. For connector workflows:

- verify exact, case-sensitive tool names from the live capability surface;
- state required permissions and validate connection/auth without printing credentials;
- coordinate calls in explicit sequence and name data passed between steps;
- handle connection refusal, expired authorization, rate limits, and partial failure;
- provide a safe fallback when the connector is unavailable, or fail clearly;
- verify the final remote action instead of trusting a successful tool invocation.

Do not hard-code a provider settings screen or tool syntax that the shipped
runtime cannot guarantee.

## Script review checklist

Before executing or shipping a helper, inspect:

1. filesystem reads/writes and path containment;
2. network destinations and timeout/retry behavior;
3. subprocess commands and argument escaping;
4. credential loading, redaction, and log output;
5. destructive operations, rollback, and ownership;
6. deterministic fixtures covering success, failure, and boundary cases.

---
name: av:better-auth
description: Add authentication with Better Auth (TypeScript). Use for email/password, OAuth providers (Google, GitHub), 2FA/MFA, passkeys/WebAuthn, sessions, plugins, RBAC, rate limiting.
user-invocable: true
when_to_use: "Invoke for Better Auth setup, sessions, OAuth, MFA, or RBAC."
category: backend
keywords: [auth, oauth, 2fa, passkeys, sessions]
license: MIT
argument-hint: "[auth-method or feature]"
metadata:
  origin: ported
  author: upstream
  version: "2.0.0"
---

# Better Auth Skill

Better Auth is comprehensive, framework-agnostic authentication/authorization framework for TypeScript with built-in email/password, social OAuth, and powerful plugin ecosystem for advanced features.

## When to Use

- Implementing auth in TypeScript/JavaScript applications
- Adding email/password or social OAuth authentication
- Setting up 2FA, passkeys, magic links, advanced auth features
- Building multi-tenant apps with organization support
- Managing sessions and user lifecycle
- Working with any framework (Next.js, Nuxt, SvelteKit, Remix, Astro, Hono, Express, etc.)

## Quick Start

### Installation

```bash
npm install better-auth
# or pnpm/yarn/bun add better-auth
```

### Environment Setup

Create `.env`:
```env
BETTER_AUTH_SECRET=<generated-secret-32-chars-min>
BETTER_AUTH_URL=http://localhost:3000
```

### Basic Server Setup

Create `auth.ts` (root, lib/, utils/, or under src/app/server/):

```ts
import { betterAuth } from "better-auth";

export const auth = betterAuth({
  database: {
    // See references/database-integration.md
  },
  emailAndPassword: {
    enabled: true,
    autoSignIn: true
  },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    }
  }
});
```

### Database Schema

```bash
npx @better-auth/cli generate  # Generate schema/migrations
npx @better-auth/cli migrate   # Apply migrations (Kysely only)
```

### Mount API Handler

**Next.js App Router:**
```ts
// app/api/auth/[...all]/route.ts
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { POST, GET } = toNextJsHandler(auth);
```

**Other frameworks:** See references/email-password-auth.md#framework-setup

### Client Setup

Create `auth-client.ts`:

```ts
import { createAuthClient } from "better-auth/client";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL || "http://localhost:3000"
});
```

### Basic Usage

```ts
// Sign up
await authClient.signUp.email({
  email: "user@example.com",
  password: "secure123",
  name: "John Doe"
});

// Sign in
await authClient.signIn.email({
  email: "user@example.com",
  password: "secure123"
});

// OAuth
await authClient.signIn.social({ provider: "github" });

// Session
const { data: session } = authClient.useSession(); // React/Vue/Svelte
const { data: session } = await authClient.getSession(); // Vanilla JS
```

## Feature Selection Matrix

| Feature | Plugin Required | Use Case | Reference |
|---------|----------------|----------|-----------|
| Email/Password | No (built-in) | Basic auth | [email-password-auth.md](./references/email-password-auth.md) |
| OAuth (GitHub, Google, etc.) | No (built-in) | Social login | [oauth-providers.md](./references/oauth-providers.md) |
| Email Verification | No (built-in) | Verify email addresses | [email-password-auth.md](./references/email-password-auth.md#email-verification) |
| Password Reset | No (built-in) | Forgot password flow | [email-password-auth.md](./references/email-password-auth.md#password-reset) |
| Two-Factor Auth (2FA/TOTP) | Yes (`twoFactor`) | Enhanced security | [advanced-features.md](./references/advanced-features.md#two-factor-authentication) |
| Passkeys/WebAuthn | Yes (`passkey`) | Passwordless auth | [advanced-features.md](./references/advanced-features.md#passkeys-webauthn) |
| Magic Link | Yes (`magicLink`) | Email-based login | [advanced-features.md](./references/advanced-features.md#magic-link) |
| Username Auth | Yes (`username`) | Username login | [email-password-auth.md](./references/email-password-auth.md#username-authentication) |
| Organizations/Multi-tenant | Yes (`organization`) | Team/org features | [advanced-features.md](./references/advanced-features.md#organizations) |
| Rate Limiting | No (built-in) | Prevent abuse | [advanced-features.md](./references/advanced-features.md#rate-limiting) |
| Session Management | No (built-in) | User sessions | [advanced-features.md](./references/advanced-features.md#session-management) |

## Auth Method Selection Guide

**Choose Email/Password when:**
- Building standard web app with traditional auth
- Need full control over user credentials
- Targeting users who prefer email-based accounts

**Choose OAuth when:**
- Want quick signup with minimal friction
- Users already have social accounts
- Need access to social profile data

**Choose Passkeys when:**
- Want passwordless experience
- Targeting modern browsers/devices
- Security is top priority

**Choose Magic Link when:**
- Want passwordless without WebAuthn complexity
- Targeting email-first users
- Need temporary access links

**Combine Multiple Methods when:**
- Want flexibility for different user preferences
- Building enterprise apps with various auth requirements
- Need progressive enhancement (start simple, add more options)

## Core Architecture

Better Auth uses client-server architecture:
1. **Server** (`better-auth`): Handles auth logic, database ops, API routes
2. **Client** (`better-auth/client`): Provides hooks/methods for frontend
3. **Plugins**: Extend both server/client functionality

## Implementation Checklist

- [ ] Install `better-auth` package
- [ ] Set environment variables (SECRET, URL)
- [ ] Create auth server instance with database config
- [ ] Run schema migration (`npx @better-auth/cli generate`)
- [ ] Mount API handler in framework
- [ ] Create client instance
- [ ] Implement sign-up/sign-in UI
- [ ] Add session management to components
- [ ] Set up protected routes/middleware
- [ ] Add plugins as needed (regenerate schema after)
- [ ] Test complete auth flow
- [ ] Configure email sending (verification/reset)
- [ ] Enable rate limiting for production
- [ ] Set up error handling

## Current Security Notes

Recent Better Auth releases tightened several security-sensitive plugin paths. When enabling these features, verify the installed version includes the current fixes and keep the default safer settings unless the app has an explicit threat-model exception:

- `oidc-provider` and `mcp` plugins: confidential clients must require `client_secret` on refresh-token grants; use constant-time secret comparison and reject incomplete PKCE parameters.
- `magicLink`: verification tokens are single-use; avoid custom flows that mint multiple sessions from concurrent requests.
- Organizations/invitations: keep `requireEmailVerificationOnInvitation` enabled so unverified email ownership cannot accept or enumerate invitations.
- Device authorization: bind pending device codes to the verifying session so one authenticated user cannot approve another user's device flow.

## Reference Documentation

### Core Authentication
- [Email/Password Authentication](./references/email-password-auth.md) - Email/password setup, verification, password reset, username auth
- [OAuth Providers](./references/oauth-providers.md) - Social login setup, provider configuration, token management
- [Database Integration](./references/database-integration.md) - Database adapters, schema setup, migrations

### Advanced Features
- [Advanced Features](./references/advanced-features.md) - 2FA/MFA, passkeys, magic links, organizations, rate limiting, session management

## Scripts

- `scripts/better_auth_init.py` — interactive generator (stdin prompts, no
  flags). Run with `av skill run better-auth -- scripts/better_auth_init.py`
  or `python3` from the skill directory. It prints a proposed `auth.ts` and
  `.env`, then asks before saving. On save it writes `auth.ts` to a chosen
  location and **replaces** `.env` with only the Better Auth keys, moving the
  previous file to `.env.backup` (overwriting any earlier backup). Its
  `passkey` import is `better-auth/plugins`; check the installed version's
  plugin packaging before trusting the scaffold.

## Output format

```markdown
## Better Auth integration
- Framework / adapter: <Next.js App Router | Hono | ...> / <drizzle | prisma | kysely | mongodb | direct>
- Methods enabled: email-password · <providers> · <plugins: twoFactor, passkey, magicLink, organization, ...>

| File | Change |
|------|--------|
| lib/auth.ts | server instance: database, emailAndPassword, socialProviders, plugins |
| app/api/auth/[...all]/route.ts | handler mounted |
| lib/auth-client.ts | client with plugins mirrored |
| .env(.example) | BETTER_AUTH_SECRET, BETTER_AUTH_URL, <PROVIDER>_CLIENT_ID/SECRET placeholders |

- Schema: `npx @better-auth/cli generate` run after the final plugin list → <migration path>
- Verified: <sign-up, sign-in, session read, OAuth redirect — command or test name>
- Security notes applied: <items from "Current Security Notes" relevant to the enabled plugins>
- Unresolved: <email sender, production URL, provider callback URLs ...> — or "none"
```

## Quality gates

- [ ] `npx @better-auth/cli generate` was run **after** the last plugin was
      added — plugins extend the schema, and a missing table surfaces only at
      runtime, not at build.
- [ ] Every client-side plugin (`twoFactorClient`, `passkeyClient`, ...) is
      mirrored on `createAuthClient`; a server-only plugin leaves the client
      methods undefined.
- [ ] No real `BETTER_AUTH_SECRET`, client secret, or database URL was written
      to a tracked file; `.env` holds placeholders or is gitignored.
- [ ] If `better_auth_init.py` saved `.env`, the values from `.env.backup`
      that Better Auth does not own were merged back.
- [ ] Each enabled plugin named in "Current Security Notes" keeps its safer
      default (single-use magic links, `requireEmailVerificationOnInvitation`,
      PKCE-complete OIDC) or the exception is recorded with its threat-model
      reason.

Proof/risk: `integration` — auth touches a trust boundary, so a sign-up →
sign-in → session-read round trip against the real handler is the floor;
`e2e` when OAuth redirects or passkeys are enabled.

## Workflow position

**Typically follows:** `av:backend-development` when the API skeleton exists
and needs an auth layer, or `av:plan` when an accepted phase names Better Auth.
**Typically precedes:** `av:databases` when the generated schema needs review or
a migration strategy, and `av:test` for the integration round trip above.
**Related:** `av:backend-development` owns generic JWT/OAuth/middleware work
that does not adopt Better Auth; `av:security` audits the finished auth surface
when the app's threat model warrants it.

## Resources

- Docs: https://www.better-auth.com/docs
- GitHub: https://github.com/better-auth/better-auth
- Plugins: https://www.better-auth.com/docs/plugins
- Examples: https://www.better-auth.com/docs/examples

---
name: av:payment-integration
description: Use to integrate SePay (VietQR), Polar, or Stripe payments for checkout, webhooks, subscriptions, QR codes, and multi-provider orders.
user-invocable: true
when_to_use: "Invoke for checkout, subscriptions, webhooks, or QR payments."
category: backend
keywords: [payments, stripe, polar, webhooks, qr]
license: MIT
argument-hint: "[provider] [task]"
metadata:
  origin: ported
  author: upstream
  version: "2.2.0"
---

# Payment Integration

Production-proven payment processing with SePay (Vietnamese banks), Polar (global SaaS), and Stripe (global infrastructure).

## When to Use

- Payment gateway integration (checkout, processing)
- Subscription management (trials, upgrades, billing)
- Webhook handling (notifications, idempotency)
- QR code payments (VietQR, NAPAS)
- Multi-provider order management

## Platform Selection

| Platform | Best For |
|----------|----------|
| **SePay** | Vietnamese market, VND, bank transfers, VietQR |
| **Polar** | Global SaaS, subscriptions, automated benefits (GitHub/Discord) |
| **Stripe** | Enterprise payments, Connect platforms, custom checkout |

## Quick Reference

### SePay
- `references/sepay/overview.md` - Auth, supported banks
- `references/sepay/api.md` - Endpoints, transactions
- `references/sepay/webhooks.md` - Setup, verification
- `references/sepay/sdk.md` - Node.js, PHP, Laravel
- `references/sepay/qr-codes.md` - VietQR generation
- `references/sepay/best-practices.md` - Production patterns
- `references/sepay/payment-operations.md` - Currency, invoicing, errors, testing, and production operations

### Polar
- `references/polar/overview.md` - Auth, MoR concept
- `references/polar/products.md` - Pricing models
- `references/polar/checkouts.md` - Checkout flows
- `references/polar/subscriptions.md` - Lifecycle management
- `references/polar/webhooks.md` - Event handling
- `references/polar/benefits.md` - Automated delivery
- `references/polar/sdk.md` - Multi-language SDKs
- `references/polar/best-practices.md` - Production patterns
- `references/polar/revenue-operations.md` - Fees, discounts, revenue, schemas, testing, and production operations

### Stripe
- `references/stripe/stripe-best-practices.md` - Integration design
- `references/stripe/stripe-sdks.md` - Server SDKs
- `references/stripe/stripe-js.md` - Payment Element
- `references/stripe/stripe-cli.md` - Local testing
- `references/stripe/stripe-upgrade.md` - Version upgrades
- External: https://docs.stripe.com/llms.txt

### Multi-Provider
- `references/multi-provider-order-management-patterns.md` - Unified orders, currency conversion
- `references/multi-provider-order-lifecycle-patterns.md` - Refunds, webhook idempotency, discount sync, and admin operations

### Scripts
- `scripts/sepay-webhook-verify.js` - SePay webhook verification
- `scripts/polar-webhook-verify.js` - Polar webhook verification
- `scripts/checkout-helper.js` - Checkout session generator

## Key Capabilities

| Platform | Highlights |
|----------|------------|
| **SePay** | QR/bank/cards, 44+ VN banks, webhooks, 2 req/s |
| **Polar** | MoR, subscriptions, usage billing, benefits, 300 req/min |
| **Stripe** | CheckoutSessions, Billing, Connect, Payment Element |

## Implementation

**General flow:** auth → products → checkout → webhooks → events

## Output format

Report the provider and environment, changed integration surfaces, webhook and
idempotency behavior, focused test results, and required dashboard/manual steps.

## Quality gates

- Verify API versions, SDK calls, event names, and signature rules against
  current first-party provider documentation.
- Keep credentials server-side and never print secret or webhook-signing values.
- Test success, cancellation, retry, duplicate-event, and invalid-signature paths.
- Do not claim production readiness from sandbox or test-mode evidence alone.

## Workflow position

**Typically follows:** an accepted provider, pricing, order, and entitlement
contract plus backend/data ownership decisions.
**Typically precedes:** security review, end-to-end payment testing, and staged
production rollout.
**Related:** `av:backend-development` owns the surrounding API and persistence;
this skill owns payment-provider contracts.

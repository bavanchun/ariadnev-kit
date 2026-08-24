
## Currency Conversion

### VND to USD with Multi-Layer Fallback
```typescript
// lib/currency.ts
const EXCHANGE_RATE_CACHE_TTL = 60 * 60 * 1000; // 1 hour
const FALLBACK_VND_TO_USD = 24500; // Conservative fallback

let exchangeRateCache: {
  rate: number;
  timestamp: number;
  source: 'api' | 'cached' | 'expired' | 'fallback';
} | null = null;

export async function convertVndToUsd(vndAmount: number): Promise<{
  usdCents: number;
  rate: number;
  source: string;
}> {
  const now = Date.now();

  // Layer 1: Fresh cache
  if (exchangeRateCache && now - exchangeRateCache.timestamp < EXCHANGE_RATE_CACHE_TTL) {
    const usdCents = Math.round((vndAmount / exchangeRateCache.rate) * 100);
    return { usdCents, rate: exchangeRateCache.rate, source: 'cached' };
  }

  // Layer 2: Try live API
  try {
    const response = await fetch(
      'https://api.exchangerate-api.com/v4/latest/USD',
      { signal: AbortSignal.timeout(5000) }
    );
    const data = await response.json();
    const rate = data.rates.VND;

    exchangeRateCache = { rate, timestamp: now, source: 'api' };
    const usdCents = Math.round((vndAmount / rate) * 100);
    return { usdCents, rate, source: 'api' };

  } catch (error) {
    console.warn('Exchange rate API failed:', error);

    // Layer 3: Expired cache (better than nothing)
    if (exchangeRateCache) {
      const usdCents = Math.round((vndAmount / exchangeRateCache.rate) * 100);
      return { usdCents, rate: exchangeRateCache.rate, source: 'expired_cache' };
    }

    // Layer 4: Hardcoded fallback
    const usdCents = Math.round((vndAmount / FALLBACK_VND_TO_USD) * 100);
    return { usdCents, rate: FALLBACK_VND_TO_USD, source: 'fallback' };
  }
}
```

### USD Discount to VND
```typescript
// When Polar discount is in USD, convert to VND for SePay checkout
export function convertUsdDiscountToVnd(
  discount: { type: 'fixed' | 'percentage'; amount?: number; basisPoints?: number },
  amountVND: number
): number {
  if (discount.type === 'percentage') {
    // Basis points: 1000 = 10%, 10000 = 100%
    const percentage = (discount.basisPoints || 0) / 10000;
    return Math.round(amountVND * percentage);
  } else {
    // Fixed amount in USD cents → VND
    const usdDollars = (discount.amount || 0) / 100;
    return Math.round(usdDollars * 24500); // Use conservative rate
  }
}
```

## Invoice Email Template

### HTML Invoice Generation
```typescript
// lib/emails/sepay-invoice.ts
export function generateSepayInvoice(order: Order, transaction: TransactionInfo): string {
  const metadata = JSON.parse(order.metadata || '{}');
  const invoiceNumber = `INV-${format(new Date(), 'yyyyMMdd')}-${order.id.slice(-8).toUpperCase()}`;

  // Format VND with Vietnamese locale
  const formatVND = (amount: number) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);

  // Escape HTML to prevent XSS
  const escapeHtml = (text: string) =>
    text.replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[char] || char);

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        .invoice { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; }
        .header { background: linear-gradient(135deg, #ff6b6b, #feca57); padding: 20px; }
        .status { background: #10b981; color: white; padding: 4px 12px; border-radius: 4px; }
        .amount { font-size: 24px; font-weight: bold; }
        .savings { color: #10b981; }
      </style>
    </head>
    <body>
      <div class="invoice">
        <div class="header">
          <h1>Invoice</h1>
          <span class="status">PAID</span>
        </div>

        <table>
          <tr><td>Invoice #:</td><td>${invoiceNumber}</td></tr>
          <tr><td>Customer:</td><td>${escapeHtml(metadata.name || order.email)}</td></tr>
          <tr><td>Email:</td><td>${escapeHtml(order.email)}</td></tr>
          <tr><td>Payment Date:</td><td>${format(new Date(transaction.transactionDate), 'dd/MM/yyyy HH:mm')}</td></tr>
          <tr><td>Transaction Ref:</td><td>${transaction.transactionId || 'N/A'}</td></tr>
        </table>

        <h3>Order Details</h3>
        <table>
          <tr><td>Product:</td><td>${getProductName(order.productType)}</td></tr>
          <tr><td>Original Price:</td><td>${formatVND(metadata.originalAmount || order.amount)}</td></tr>
          ${metadata.couponDiscountAmount ? `
            <tr><td>Coupon (${metadata.couponCode}):</td><td>-${formatVND(metadata.couponDiscountAmount)}</td></tr>
          ` : ''}
          ${metadata.referralDiscountAmount ? `
            <tr><td>Referral Discount (20%):</td><td>-${formatVND(metadata.referralDiscountAmount)}</td></tr>
          ` : ''}
          ${order.discountAmount > 0 ? `
            <tr class="savings"><td>Total Savings:</td><td>-${formatVND(order.discountAmount)}</td></tr>
          ` : ''}
          <tr class="amount"><td>Total Paid:</td><td>${formatVND(order.amount)}</td></tr>
        </table>

        <p>Thank you for your purchase!</p>
        <p>Support: support@ariadnev.com</p>
      </div>
    </body>
    </html>
  `;
}
```

## Error Handling Patterns

### Always Return 200 to SePay
```typescript
// Webhook must always return 200 to prevent retry loop
export async function POST(request: Request) {
  try {
    // ... processing
  } catch (error) {
    // Log error but don't fail
    console.error('Webhook processing error:', error);
    await logWebhookError(error);
  }

  // ALWAYS return 200
  return NextResponse.json({ success: true });
}
```

### Non-Blocking Post-Payment Operations
```typescript
// Wrap each operation in try-catch
const operations = [
  { name: 'License', fn: () => createLicense(order) },
  { name: 'Email', fn: () => sendOrderConfirmation(order) },
  { name: 'Commission', fn: () => createCommission(order) },
  { name: 'GitHub', fn: () => inviteToGitHub(username, productType) },
  { name: 'Discord', fn: () => sendSalesNotification(order) },
];

for (const op of operations) {
  try {
    await op.fn();
    console.log(`✅ ${op.name} completed`);
  } catch (error) {
    console.error(`❌ ${op.name} failed:`, error);
    // Continue - don't block other operations
  }
}
```

### Amount Validation
```typescript
// Reject underpayment, accept overpayment
if (transferAmount < order.amount) {
  console.error(`Underpayment: expected ${order.amount}, received ${transferAmount}`);
  await flagOrderForReview(order.id, 'underpayment');
  return; // Don't process
}

if (transferAmount > order.amount) {
  console.log(`Overpayment: expected ${order.amount}, received ${transferAmount}`);
  // Continue processing - customer paid more than required
}
```

## Testing Patterns

### Unit Tests for UUID Parsing
```typescript
// __tests__/lib/sepay.test.ts
describe('parseOrderIdFromContent', () => {
  it('parses standard format', () => {
    expect(parseOrderIdFromContent('ARIADNEV 4e4635f4-0478-4080-a5c5-48da91f97f1e'))
      .toBe('4e4635f4-0478-4080-a5c5-48da91f97f1e');
  });

  it('handles bank dash-stripping', () => {
    expect(parseOrderIdFromContent('ARIADNEV 4e4635f404784080a5c548da91f97f1e'))
      .toBe('4e4635f4-0478-4080-a5c5-48da91f97f1e');
  });

  it('handles real-world Vietnamese bank memo', () => {
    expect(parseOrderIdFromContent('BankAPINotify 4e4635f404784080a5c548da91f97f1e-CHUYEN TIEN'))
      .toBe('4e4635f4-0478-4080-a5c5-48da91f97f1e');
  });

  it('returns null for invalid content', () => {
    expect(parseOrderIdFromContent('ARIADNEV')).toBeNull();
    expect(parseOrderIdFromContent('4e4635f4-0478')).toBeNull();
    expect(parseOrderIdFromContent('104588021672-ARIADNEV')).toBeNull();
  });
});
```

### Webhook Integration Test Script
```bash
#!/bin/bash
# scripts/test-sepay-webhook.sh

BASE_URL="http://localhost:3000/api/webhooks/sepay"
API_KEY="your-test-key"

# Test 1: Valid Bearer token
echo "Test 1: Bearer token auth"
curl -X POST "$BASE_URL" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"id":12345,"content":"ARIADNEV test-uuid","transferAmount":2450000,"transferType":"in"}'

# Test 2: Valid Apikey format
echo "Test 2: Apikey auth"
curl -X POST "$BASE_URL" \
  -H "Authorization: Apikey $API_KEY" \
  -d '{"id":12346,"content":"ARIADNEV test-uuid","transferAmount":2450000,"transferType":"in"}'

# Test 3: Missing auth (should return 401)
echo "Test 3: No auth (expect 401)"
curl -X POST "$BASE_URL" \
  -d '{"id":12347,"content":"test","transferAmount":100000,"transferType":"in"}'

# Test 4: Invalid key (should return 401)
echo "Test 4: Invalid key (expect 401)"
curl -X POST "$BASE_URL" \
  -H "Authorization: Bearer wrong-key" \
  -d '{"id":12348,"content":"test","transferAmount":100000,"transferType":"in"}'
```

## Database Schema

### Orders Table Extensions for SePay
```typescript
// Fields used specifically for SePay
{
  paymentId: text('payment_id'),      // Transaction content or TEAM{8} code
  paymentProvider: literal('sepay'),  // Distinguishes from Polar
  currency: literal('VND'),           // Always VND for SePay
  amount: integer('amount'),          // In VND (no decimals)
}

// Metadata JSON includes:
{
  gateway: string,           // Bank name from webhook
  transactionDate: string,   // Webhook timestamp
  transactionId: number,     // SePay transaction ID
  transferAmount: number,    // Actual received amount
  matchMethod: string,       // How order was matched
  content: string,           // Original transaction memo
  encryptedTaxId?: string,   // For VAT invoices
}
```

### Recommended Indexes
```sql
CREATE INDEX idx_orders_sepay_pending ON orders (status, payment_provider, amount)
  WHERE status = 'pending' AND payment_provider = 'sepay';

CREATE INDEX idx_orders_sepay_timestamp ON orders (created_at)
  WHERE payment_provider = 'sepay';

CREATE INDEX idx_orders_payment_id ON orders (payment_id)
  WHERE payment_provider = 'sepay';
```

## Production Checklist

- [ ] Environment variables configured
- [ ] Bank account verified and active
- [ ] Webhook endpoint publicly accessible (HTTPS)
- [ ] Webhook API key set and verified
- [ ] Timing-safe auth comparison implemented
- [ ] Idempotency handling tested with duplicate webhooks
- [ ] UUID parsing tested with real Vietnamese bank memos
- [ ] Amount validation (underpayment rejection) tested
- [ ] Overpayment handling verified
- [ ] Currency conversion fallback chain tested
- [ ] Invoice email template tested
- [ ] Error monitoring enabled
- [ ] Structured logging in place
- [ ] Database indexes created
- [ ] Polar discount sync tested (for shared coupons)
- [ ] Team payment ID format tested
- [ ] Non-blocking operations wrapped in try-catch
- [ ] Always-200 webhook response verified

## Common Pitfalls

1. **Not handling bank dash-stripping** - Banks may remove dashes from UUIDs
2. **Rejecting overpayments** - Should accept; customer paid more
3. **Blocking webhook on non-critical failures** - Wrap in try-catch, continue
4. **Not using timing-safe comparison** - Vulnerable to timing attacks
5. **Returning non-200 on error** - Causes SePay retry loops
6. **Using raw exchange rates without fallback** - API can fail
7. **Applying discounts in wrong order** - Always coupon first, then referral
8. **Not logging matchMethod** - Hard to debug failed matches
9. **Not preserving checkout metadata** - Lose discount audit trail
10. **Synchronous Polar discount sync** - Can fail; use retry with backoff
11. **Case-sensitive content matching** - Banks may uppercase/lowercase
12. **Missing amount-only match safety** - Reject ambiguous matches

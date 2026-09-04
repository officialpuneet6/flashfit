# FlashFit Stage A — implementation checklist

## Scope guardrails

- [x] No Stage B RLS-policy removals or PostgreSQL grant revocations.
- [x] No legacy password-column removal or login disablement.
- [x] No production deployment or migration application.
- [ ] Staging feature flags remain disabled until the secure path is tested.

## Files to add

- `supabase/migrations/20260830_stage_a_security_foundation.sql`
- `supabase/functions/payu-create-request/index.ts`
- `supabase/functions/payu-webhook/index.ts`

## Files to update

- `supabase/functions/send-web-push/index.ts` — authenticated notification-ID dispatch only.
- `flashfitshop/supabase-client.js` — feature flag and secure checkout client adapters.
- `flashfitshop/cart.html` — gated secure checkout/PayU request path; legacy fallback retained.
- `flashfitshop/payment-success.html` and `flashfitshop/payment-failed.html` — verified-state display path when enabled; legacy path retained.

## Compatibility dependencies

- Existing `seller_orders`, `user_orders`, `shopkeeper_products`, `shops`, and `delivery_partners` columns are retained.
- Secure checkout uses existing product/order tables and adds separate idempotency, reservation, and payment-intent tables.
- Secure payment functions require staging secrets named `PAYU_MERCHANT_KEY` and `PAYU_SALT`; they fail closed if missing.
- The deployed PayU callback URL must be configured to the new webhook only in staging.
- Existing broad policies remain active, so direct legacy client mutations remain a known Stage-B blocker.

## Verification gates

- [ ] SQL reviewed/applied in staging only.
- [ ] Edge Functions deployed to staging with JWT configuration verified.
- [ ] Secure feature flags enabled in staging only.
- [ ] Secure checkout, PayU callback, COD, notifications, and GPS tests pass.
- [ ] Stage B policy diff reviewed separately.

See `STAGE_A_STAGING_TEST_MATRIX.md` for the exact staging-only regression matrix.

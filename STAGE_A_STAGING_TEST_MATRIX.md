# Stage A staging test matrix

Run only after applying the Stage A migration and deploying the listed Edge Functions to a staging Supabase project. Keep every `security_feature_flags.enabled` value `false` until the corresponding test group is ready.

| Test | Flag | Expected result |
|---|---|---|
| Existing customer/shopkeeper/rider/admin login | none | Legacy flows continue unchanged. |
| Existing cart and COD checkout | none | Legacy checkout remains available. |
| Secure checkout duplicate request | `secure_checkout_v1` | Same authenticated user and idempotency key return the same order/intention response. |
| Price/shop/total tampering | `secure_checkout_v1` | Server prices from `shopkeeper_products`; client values do not alter totals or shop. |
| Stock tampering / concurrent checkout | `secure_checkout_v1` | Invalid/insufficient quantity is rejected; reservations are recorded. |
| Reservation release | `secure_checkout_v1` | Failed/cancelled payment releases reserved quantity; paid payment consumes it. |
| Idempotency mismatch | `secure_checkout_v1` | Reusing a key with changed cart/delivery data is rejected. |
| Secure PayU request | `secure_payu_v1` | Only a customer’s pending PayU intent receives a signed form; salt is never returned. |
| Fake success/failure URL | `secure_payu_v1` | Display pages do not update order payment state. |
| PayU amount / transaction tampering | `secure_payu_v1` | Webhook rejects mismatched merchant, reverse hash, transaction, or amount. |
| Callback replay | `secure_payu_v1` | Duplicate provider callback has no duplicate payment/order effect. |
| Callback with `additionalCharges` | `secure_payu_v1` | Reverse hash validates using the documented additional-charges form. |
| Order ownership / transition | secure order caller | Customer cannot transition arbitrary orders; shop/rider scope is enforced. |
| Shopkeeper isolation | secure inventory caller | Linked shopkeeper cannot change a different shop’s product stock. |
| COD settlement tampering | secure finance caller | Amount derives from canonical order values; unassigned rider is rejected. |
| Notification authorization | secure notification caller | Caller without `notifications.send` cannot create cross-user events. |
| Push authorization | `secure_push_v1` | Edge Function accepts only an authenticated recipient’s notification ID, never arbitrary payload. |
| GPS authorization | `secure_gps_v1` | Reject unauthenticated, unlinked, wrong-order, inactive, invalid, and high-frequency duplicate samples. |
| Realtime regression | matching feature | Existing legacy subscriptions remain operational while flags are off. |

## Required negative SQL/API tests

- Attempt `insert` into `admin_team` as an ordinary authenticated account; this still demonstrates the known Stage-B blocker and must not be used to validate admin authorization.
- Attempt direct mutations of legacy sensitive tables; broad policies currently permit them and this is expected until Stage B.
- Verify new secure RPCs reject missing/invalid JWTs, invalid IDs, malformed JSON, and unauthorized roles.

## Pass criteria

Do not enable a Stage-A flag in staging until all matching positive and negative tests pass. Do not start Stage B until the legacy-path dependency inventory is complete and a fresh live policy/grant backup is exported.

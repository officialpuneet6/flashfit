# FlashFit architecture audit — 2026-08-29

## Current system

FlashFit is a multi-site, static JavaScript application backed by Supabase. `flashfitshop/` is the customer experience, `admin-panel/` manages operations, `shopfit/` is the seller panel, and `delevery_patner/` is the rider panel. Each currently loads Supabase from the CDN and shares browser-side notification/business extensions.

The customer flow stores cart/address/profile data in Supabase and creates rows in `seller_orders` plus `user_orders`. The current checkout has COD and PayU UI logic. Products come from `shopkeeper_products`; shops and serviceability are read from `shops` and `serviceable_pincodes`. Realtime subscriptions presently cover orders, products, reviews, delivery partners, and notifications.

## Findings and upgrade plan

Existing SQL extensions are additive but several use `for all using (true)`, so they must not be considered production-safe. Rider sign-in currently compares a database password from the browser, and its GPS watcher starts while merely on duty. A VAPID private key was present in setup material and must be rotated in Supabase before production use. The foundation migration adds new location, zone, location-inventory, dynamic-category, setting, logistics-weight, and protected GPS-sample tables without modifying existing orders/payments.

1. Apply the foundation migration in a staging Supabase project and seed an administrator role.
2. Move rider authentication and any order/payment mutation to verified server functions; remove permissive legacy policies only after matching replacements are tested.
3. Wire the checkout to `get_delivery_quote` before presenting Flash delivery; retain the current standard path as fallback.
4. Build admin CRUD for locations, zones, attributes, settings, and inventory against the new tables.
5. Add transactional stock reservation and verified PayU webhook functions before enabling flash checkout in production.

## Rollback

The migration only creates new objects. Disable feature flags / stop calling the new RPCs to roll back behaviour; do not drop tables during an incident. Existing customer, order, payment, and inventory tables remain untouched.

## Deployment and verification

Apply `supabase/migrations/20260829_platform_foundation.sql` in staging first, create the initial `platform_user_roles` administrator through a trusted service-role operation, and configure the variables in `.env.example` in Netlify/Supabase rather than committing them. The existing `DEPLOY.TXT` remains the deployment guide for the four separate Netlify sites.

- Verify standard checkout still works before any zone is configured.
- Create a zone, pincode, delivery-capable location, and positive location inventory; then confirm the cart displays Flash Delivery only for that exact product set and pincode.
- Confirm a rider on duty with no active order does not trigger a geolocation permission request.
- Confirm an assigned active order requests permission and creates a sample only through `record_partner_location`.
- Before production, replace the legacy permissive RLS policies, move rider login/order mutations/PayU verification into server functions, and rotate the exposed VAPID private key.

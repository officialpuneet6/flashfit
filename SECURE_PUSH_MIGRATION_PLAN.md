# Secure push migration plan — Stage A adapter

`send-web-push` must not be deployed in its strict Stage-A form until recipient links are populated and a trusted dispatcher is available. Existing notification UI uses legacy recipient IDs, which are not uniformly Supabase Auth IDs.

## Canonical mapping

`notification_recipient_links` maps `(notification_role, legacy_recipient_id)` to one canonical `auth_user_id`.

| Role | Legacy recipient ID | Canonical link source |
|---|---|---|
| admin | `admin` | Approved admin/team auth account |
| shopkeeper | `shops.id` | `shops.auth_user_id` |
| delivery_partner | `delivery_partners.id` | `delivery_partners.auth_user_id` |
| user | authenticated user ID | Same authenticated user ID |
| guest/device | device ID | No secure push until guest account/auth linking exists; retain legacy in-app notice only. |

## Safe rollout

1. Populate and validate links for staging admin, shopkeeper, rider and customer accounts.
2. Add a trusted server dispatcher that receives a notification ID and resolves its recipient through the mapping table.
3. Update the client notification adapter only when `secure_push_v1` is enabled.
4. Test a notification per role and duplicate-event suppression.
5. Only then deploy the strict push Edge Function to staging and enable `secure_push_v1` for linked test accounts.

The existing notification service and Edge Function deployment remain untouched during this preparation step.

# FlashFit four-app migration map

## Active source roots

`customer/`, `shop/`, `delivery/`, and `admin/` are the active frontend source
roots. The matching legacy folders are retained unchanged solely for rollback and
verification; builds no longer consume them.

| Existing source | Target | Classification | Phase-1 action |
| --- | --- | --- | --- |
| `flashfitshop/` | `customer/` | customer app | Migrated into the active customer source root; preserve legacy unchanged. |
| `shopfit/` | `shop/` | shop operations app | Migrated into the active shop source root; preserve legacy unchanged. |
| `delevery_patner/` | `delivery/` | rider operations app | Migrated into the active delivery source root; preserve legacy unchanged. |
| `admin-panel/` | `admin/` | platform control app | Migrated into the active admin source root; preserve legacy unchanged. |
| `notification-service.js` and three app copies | `shared/` candidate | duplicate, browser-safe display/realtime portions only | Inventory first; do not consolidate behavior yet. |
| `flashfit-business-extension.js` and three app copies | app-specific/legacy | duplicate with privileged mutations | Do not share or change in Phase 1. |
| `admin-visibility-extension.js` and copies | admin-specific/legacy | duplicated admin/catalog behavior | Do not share or change in Phase 1. |
| `*supabase-client copy.js` | legacy duplicate | duplicate | Excluded from new compatibility builds; retained in legacy folders. |
| `admin-panel/app.js`, `admin-panel/admin.js` | admin legacy | overlapping admin implementations | Keep both until route/function parity is reviewed. |

The build script packages each active app root into its ignored `dist/` directory.
Unreferenced `supabase-client copy.js` backups remain only in the shop and delivery
legacy roots; each is byte-identical to its canonical `supabase-client.js`.

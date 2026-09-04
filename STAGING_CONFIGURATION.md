# FlashFit staging configuration boundary

## Environments

| Environment | Supabase project | Permitted use |
| --- | --- | --- |
| Production | Existing FlashFit project | Production only; never use for Stage A staging work. |
| Staging | A separate, newly created FlashFit project | Stage A migration, test data, Edge Function deployments, and sandbox PayU only. |

## Local setup

1. Copy `staging/.env.staging.example` to `staging/.env.staging`.
2. Fill it with only the separate staging project's values; do not copy production service-role or PayU credentials.
3. Run the offline guard before every Supabase CLI command or Edge Function deploy:

```powershell
.\scripts\assert-supabase-environment.ps1 -Environment staging `
  -SupabaseUrl $env:SUPABASE_URL -ProjectRef $env:SUPABASE_PROJECT_REF `
  -ProductionProjectRef $env:FLASHFIT_PRODUCTION_PROJECT_REF `
  -StagingProjectRef $env:FLASHFIT_STAGING_PROJECT_REF
```

The guard compares only project references and URL hostnames. It does not print or store credentials.

## Configuration points to switch for staging

- Customer: `flashfitshop/supabase-client.js`, `flashfitshop/notification-config.js`, `flashfitshop/admin-visibility-extension.js`, and `flashfitshop/track.html` storage URL.
- Admin: `admin-panel/admin.js`, `admin-panel/app.js`, `admin-panel/notification-config.js`, and `admin-panel/admin-visibility-extension.js`.
- Shopkeeper: `shopfit/supabase-client.js`, `shopfit/notification-config.js`, and `shopfit/admin-visibility-extension.js`.
- Rider: `delevery_patner/supabase-client.js`, `delevery_patner/notification-config.js`, and `delevery_patner/admin-visibility-extension.js`.
- Shared/browser copies: root `notification-config.js` and `admin-visibility-extension.js` when those are included by a deployment.
- Edge Functions: `supabase/functions/payu-create-request/index.ts` and `supabase/functions/payu-webhook/index.ts` take all target credentials from staging Edge Function secrets. `send-web-push` remains excluded from Stage A deployment.

The current source files use production hard-coded browser settings. Do not deploy those bundles to staging until a staging-specific configuration injection/substitution method is selected and verified with the target guard.

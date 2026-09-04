# FlashFit Phase 1: four-app architecture

## Source ownership

`customer/`, `shop/`, `delivery/`, and `admin/` are the only active frontend
application roots. Each contains its migrated HTML, JavaScript, CSS, assets,
environment templates, and Netlify configuration. Legacy app folders are retained
unchanged for staged verification and rollback only, and are not build inputs.

## App/domain mapping

| App | Domain | Active source root | Build command | Publish directory |
| --- | --- | --- | --- | --- |
| `customer` | `flashfit.online` | `customer/` | `npm run build:customer` | `customer/dist` |
| `shop` | `shop.flashfit.online` | `shop/` | `npm run build:shop` | `shop/dist` |
| `delivery` | `delivery.flashfit.online` | `delivery/` | `npm run build:delivery` | `delivery/dist` |
| `admin` | `admin.flashfit.online` | `admin/` | `npm run build:admin` | `admin/dist` |

The build is automated. It packages the active source into the target app's ignored
`dist/` directory, injects `flashfit-public-config.js` before existing scripts, and
substitutes only the legacy public Supabase URL/publishable key with generated public
configuration.

## Netlify setup

Create four Netlify sites from the same repository. For each site, set the repository base directory to the repository root and choose the app's `netlify.toml` as the configuration file:

| Site | Config |
| --- | --- |
| Customer | `customer/netlify.toml` |
| Shop | `shop/netlify.toml` |
| Delivery | `delivery/netlify.toml` |
| Admin | `admin/netlify.toml` |

Set the public build variables in each site's environment settings. Use no `.env` file in source control.

## Required public build variables

- `FLASHFIT_ENV`: `development`, `staging`, or `production`
- `SUPABASE_PROJECT_REF`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `FLASHFIT_PRODUCTION_PROJECT_REF`
- `FLASHFIT_STAGING_PROJECT_REF`
- `PUBLIC_ANALYTICS_ID` (optional)

The build rejects an invalid URL/ref relationship, a staging build against a non-staging ref, and a production build against a non-production ref. It permits only public browser values and does not load service-role, PayU, VAPID-private, or finance secrets.

## Staging

Staging must set `FLASHFIT_ENV=staging`, `SUPABASE_PROJECT_REF=wxvnbktmugjkpgcsuldj`, and `SUPABASE_URL=https://wxvnbktmugjkpgcsuldj.supabase.co`. The existing PowerShell guard remains the pre-deployment identity check.

## Phase boundary

Phase 1 does not alter the four legacy source folders, database schema, RLS, Supabase functions, feature flags, or remote deployments. The following phase may selectively migrate safe modules after route and behavior parity testing.

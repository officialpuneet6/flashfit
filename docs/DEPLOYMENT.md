# FlashFit deployment

Four apps, four Netlify sites, one shared Supabase project. No manual file
copying: every deploy runs `scripts/build-app.mjs`, which assembles the app from
its own folder plus the shared runtime.

## Netlify site setup

Create one site per app. For each site set **Base directory** to the app folder;
the `netlify.toml` inside that folder supplies the build command and publish
directory.

| App | Base directory | Publish | Domain |
|---|---|---|---|
| Customer | `customer` | `customer/dist` | flashfit.online |
| Shop | `shop` | `shop/dist` | shop.flashfit.online |
| Delivery | `delivery` | `delivery/dist` | delivery.flashfit.online |
| Admin | `admin` | `admin/dist` | admin.flashfit.online |

The root `netlify.toml` is only a fallback for a site created at the repository
root with no base directory; it builds the customer app.

## Required build environment variables

Set these per site in Netlify. They are public values only — never add a
service-role key, PayU salt, VAPID private key, or any other secret to a site's
build environment, because everything the build emits reaches the browser.

```
FLASHFIT_ENV                       development | staging | production
SUPABASE_URL                       https://<project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY           sb_publishable_...
SUPABASE_PROJECT_REF               <project-ref>
FLASHFIT_PRODUCTION_PROJECT_REF    <production ref>
FLASHFIT_STAGING_PROJECT_REF       wxvnbktmugjkpgcsuldj
PUBLIC_ANALYTICS_ID                optional
```

The build fails rather than emitting a mismatched bundle when `FLASHFIT_ENV` is
`staging` but `SUPABASE_PROJECT_REF` is not the staging ref, when `FLASHFIT_ENV`
is `production` but the ref is not the production ref, when `SUPABASE_URL` does
not match `SUPABASE_PROJECT_REF` over HTTPS, or when any required variable is
missing or still contains `REPLACE_WITH`. That guard is the protection against
shipping a staging build against production, so do not bypass it.

## Local build

```bash
FLASHFIT_ENV=development \
SUPABASE_PROJECT_REF=<ref> \
SUPABASE_URL=https://<ref>.supabase.co \
SUPABASE_PUBLISHABLE_KEY=sb_publishable_... \
FLASHFIT_PRODUCTION_PROJECT_REF=<prod-ref> \
FLASHFIT_STAGING_PROJECT_REF=wxvnbktmugjkpgcsuldj \
npm run build:all
```

Per app: `npm run build:customer` / `build:shop` / `build:delivery` /
`build:admin`. Each app root also carries `.env.example`, and the build reads an
uncommitted `<app>/.env` when present, so the variables do not have to be
exported by hand.

## What the build injects

Into `<app>/dist`:

- `flashfit-public-config.js` — frozen `window.__FLASHFIT_PUBLIC_CONFIG__`
  carrying environment, app name, domain, Supabase URL and publishable key.
- `flashfit-app-identity.js` — `window.flashfitApp`, from
  `shared/runtime/`. See below.
- `flashfit-theme.css`, `flashfit-dynamic-theme.js` — compiled brand theme and
  the allowlisted theme-settings consumer.

It also adds `ff-app ff-<app>` to `<body>`, and rewrites the legacy hard-coded
Supabase URL and publishable key to read from the injected config so no app
holds a compiled-in project reference.

## App identity

Each app previously identified itself by looking for a legacy folder name
(`flashfitshop`, `shopfit`, `admin-panel`, `delevery_patner`) in
`location.pathname`. Those names do not exist once each app is served from its
own domain, so every app resolved to the customer role: push notifications
registered under the wrong role, the shop and delivery business panels never
initialised, the admin visibility module never mounted, and notification icons
and click-through URLs pointed at paths that 404 on all four domains.

`shared/runtime/flashfit-app-identity.js` resolves identity in this order:

1. `window.__FLASHFIT_PUBLIC_CONFIG__.app` — injected at build time.
2. Hostname prefix — `shop.`, `delivery.`, `admin.`.
3. Legacy folder name in the path — keeps the rollback copies working.
4. `customer`.

It is presentation and routing only and grants no privilege; Supabase Auth and
RLS remain authoritative. Cross-app links resolve to the target app's own
domain, because each app is deployed alone and a relative link would 404 — so a
cross-app link from localhost or a Netlify preview deliberately points at the
real production domain. Within the legacy single-host layout it resolves to
`/<legacy-folder>/<page>` instead.

`notification-sw.js` cannot use this module: a service worker has no `window`.
It is registered per app at that app's root and resolves landing pages against
its own registration scope, which is the app root on every domain.

## Legacy folders

`flashfitshop/`, `shopfit/`, `delevery_patner/`, and `admin-panel/` are rollback
copies. Keep them until all four new apps pass build, smoke, route, runtime, and
staging tests. They still work because the identity module retains the legacy
path fallback.

## Environment separation

Staging is `wxvnbktmugjkpgcsuldj`. Verify the target before applying migrations
or deploying with `scripts/assert-supabase-environment.ps1`. A successful build
does not authorize a production deploy; promote deliberately.

# FlashFit staging metadata baseline

- Target project: `wxvnbktmugjkpgcsuldj`
- Target URL: `https://wxvnbktmugjkpgcsuldj.supabase.co`
- Collection method: user-run, read-only SQL Editor metadata queries
- Collection date: 2026-09-01

## Result summary

The target is an unprovisioned application database: `public` has no tables,
columns, policies, routines, views, materialized views, indexes, or constraints.
`storage` contains only Supabase-managed system tables, has zero buckets and zero
RLS policies. No secrets, credentials, tokens, or private keys are included.

`grants.csv` is a normalized representation of the supplied grant result: each
`ALL_TABLE_PRIVILEGES` value represents DELETE, INSERT, REFERENCES, SELECT,
TRIGGER, TRUNCATE, and UPDATE. RLS remains enabled on the storage tables and
there are no policies, so those grants do not by themselves permit API access.
No `service_role` grant for `storage.vector_indexes` appeared in the supplied
result.

## Compatibility conclusion

Neither `20260829_platform_foundation.sql` nor
`20260830_stage_a_security_foundation.sql` can be approved for staging yet.
Both depend on pre-existing FlashFit business tables (`shops`, `seller_orders`,
`user_orders`, `shopkeeper_products`, `delivery_partners`, and others) that do
not exist in this staging project. A production-schema-equivalent staging baseline
or a reviewed foundational schema migration is required first.

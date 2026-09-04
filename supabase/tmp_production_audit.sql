SELECT column_name, data_type FROM information_schema.columns WHERE table_name='catalog_categories' ORDER BY ordinal_position;
SELECT polname, pg_get_expr(polqual, polrelid) AS using_clause FROM pg_policy WHERE polrelid = (SELECT oid FROM pg_class WHERE relname='catalog_categories');

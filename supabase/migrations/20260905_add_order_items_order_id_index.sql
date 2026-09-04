-- Migration to create missing index on order_items(order_id)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'order_items') THEN
        CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
        RAISE NOTICE 'Index idx_order_items_order_id created or already exists.';
    ELSE
        RAISE NOTICE 'order_items table not found - index creation skipped.';
    END IF;
END $$;

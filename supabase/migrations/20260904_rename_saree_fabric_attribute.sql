-- 20260904_rename_saree_fabric_attribute.sql
-- Migration to ensure the 'saree_fabric' attribute exists for the 'sarees' category.
-- Idempotent: renames existing 'fabric' to 'saree_fabric' if needed, otherwise inserts.
DO $$
DECLARE
    cat_id uuid;
BEGIN
    SELECT id INTO cat_id FROM public.catalog_categories WHERE slug = 'sarees';
    IF cat_id IS NULL THEN
        RAISE NOTICE 'Sarees category not found - migration skipped.';
        RETURN;
    END IF;

    IF EXISTS (SELECT 1 FROM public.category_attributes WHERE category_id = cat_id AND attribute_key = 'saree_fabric') THEN
        RAISE NOTICE 'saree_fabric already present - nothing to do.';
        RETURN;
    END IF;

    IF EXISTS (SELECT 1 FROM public.category_attributes WHERE category_id = cat_id AND attribute_key = 'fabric') THEN
        UPDATE public.category_attributes
        SET attribute_key = 'saree_fabric', name = 'Saree Fabric'
        WHERE category_id = cat_id AND attribute_key = 'fabric';
        RAISE NOTICE 'Renamed fabric to saree_fabric.';
    ELSE
        INSERT INTO public.category_attributes (category_id, attribute_key, name, value_type, is_required)
        VALUES (cat_id, 'saree_fabric', 'Saree Fabric', 'text', false);
        RAISE NOTICE 'Inserted new saree_fabric attribute.';
    END IF;
END $$;

-- Migration: Rename 'fabric' attribute to 'saree_fabric' for Sarees category
-- Idempotent: only applies if 'saree_fabric' does not already exist

begin;

-- Find the Sarees category id
do $$
  declare cat_id bigint;
begin
  select id into cat_id from public.catalog_categories where slug = 'sarees';
  if cat_id is null then
    raise notice 'Sarees category not found, skipping migration.';
    return;
  end if;

  -- Check if attribute_key 'saree_fabric' already exists for this category
  if exists (select 1 from public.category_attributes where category_id = cat_id and attribute_key = 'saree_fabric') then
    raise notice 'saree_fabric attribute already exists, skipping rename.';
    return;
  end if;

  -- Update the attribute_key from 'fabric' to 'saree_fabric' for this category
  update public.category_attributes
    set attribute_key = 'saree_fabric', name = 'Saree Fabric'
    where category_id = cat_id and attribute_key = 'fabric';

  raise notice 'Renamed fabric attribute to saree_fabric for Sarees category.';
end $$;

commit;

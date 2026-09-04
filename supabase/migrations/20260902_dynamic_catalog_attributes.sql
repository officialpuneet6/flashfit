-- FlashFit — dynamic catalog attributes (additive, no data loss)
-- Runs AFTER 20260829_platform_foundation.sql (depends on catalog_categories /
-- category_attributes defined there). Purely additive: adds two columns to the
-- existing shopkeeper_products table and seeds a starter taxonomy + attribute sets.
-- Safe to re-run (idempotent): add-column-if-not-exists + on-conflict-do-nothing.
--
-- The product's free-text `category` column is intentionally left in place; the app
-- keeps writing it (= selected category name) so existing customer-side filtering
-- (customer/script.js matchesFilter) continues to work unchanged.

begin;

-- 1. Link products to the master taxonomy + hold per-category attribute values.
alter table public.shopkeeper_products
  add column if not exists category_id bigint references public.catalog_categories(id) on delete set null;
alter table public.shopkeeper_products
  add column if not exists attributes jsonb not null default '{}'::jsonb;

create index if not exists idx_shopkeeper_products_category on public.shopkeeper_products(category_id);
create index if not exists idx_shopkeeper_products_attributes on public.shopkeeper_products using gin (attributes);

-- 2. Seed top-level categories (§8). Admins extend/override these from the Admin UI.
insert into public.catalog_categories (name, slug, parent_id, sort_order) values
  ('Fashion','fashion', null, 10),
  ('Beauty','beauty', null, 20),
  ('Electronics','electronics', null, 30),
  ('Home','home', null, 40),
  ('Daily Needs','daily-needs', null, 50),
  ('Fitness','fitness', null, 60),
  ('Kids','kids', null, 70),
  ('Gifting','gifting', null, 80)
on conflict (slug) do nothing;

-- 3. Seed child categories, resolving parent_id by parent slug.
insert into public.catalog_categories (name, slug, parent_id, sort_order)
select v.name, v.slug, p.id, v.sort_order
from (values
  -- Fashion
  ('Men','men','fashion',10),
  ('Women','women','fashion',20),
  ('Kids Wear','kids-wear','fashion',30),
  ('Shirts','shirts','fashion',40),
  ('T-Shirts','t-shirts','fashion',50),
  ('Tops','tops','fashion',60),
  ('Kurtis','kurtis','fashion',70),
  ('Jeans','jeans','fashion',80),
  ('Dresses','dresses','fashion',90),
  ('Sarees','sarees','fashion',100),
  ('Ethnic Sets','ethnic-sets','fashion',110),
  ('Shoes','shoes','fashion',120),
  ('Bags','bags','fashion',130),
  ('Watches','watches','fashion',140),
  ('Jewellery','jewellery','fashion',150),
  ('Sunglasses','sunglasses','fashion',160),
  ('Accessories','accessories','fashion',170),
  -- Beauty
  ('Skincare','skincare','beauty',10),
  ('Haircare','haircare','beauty',20),
  ('Makeup','makeup','beauty',30),
  ('Grooming','grooming','beauty',40),
  ('Fragrance','fragrance','beauty',50),
  ('Personal Care','personal-care','beauty',60),
  -- Electronics
  ('Mobile Accessories','mobile-accessories','electronics',10),
  ('Chargers','chargers','electronics',20),
  ('Cables','cables','electronics',30),
  ('Earphones','earphones','electronics',40),
  ('Audio','audio','electronics',50),
  ('Small Electronics','small-electronics','electronics',60),
  -- Home
  ('Kitchen','kitchen','home',10),
  ('Cleaning','cleaning','home',20),
  ('Storage','storage','home',30),
  ('Home Decor','home-decor','home',40),
  ('Household','household','home',50)
) as v(name, slug, parent_slug, sort_order)
join public.catalog_categories p on p.slug = v.parent_slug
on conflict (slug) do nothing;

-- 4. Seed the §10 example attribute sets (category-driven product form).
insert into public.category_attributes
  (category_id, name, attribute_key, input_type, options, is_required, is_filterable, sort_order)
select c.id, v.name, v.attribute_key, v.input_type, v.options::jsonb, v.is_required, v.is_filterable, v.sort_order
from (values
  -- WATCH
  ('watches','Brand','brand','text','[]',true,true,10),
  ('watches','Watch Type','watch_type','dropdown','["Analog","Digital","Chronograph","Smartwatch","Automatic"]',false,true,20),
  ('watches','Dial Color','dial_color','color','[]',false,true,30),
  ('watches','Strap Material','strap_material','dropdown','["Leather","Metal","Stainless Steel","Silicone","Fabric","Rubber"]',false,true,40),
  ('watches','Strap Color','strap_color','color','[]',false,false,50),
  ('watches','Display Type','display_type','dropdown','["Analog","Digital","Analog-Digital"]',false,false,60),
  ('watches','Movement','movement','dropdown','["Quartz","Automatic","Mechanical","Solar"]',false,false,70),
  ('watches','Gender','gender','dropdown','["Men","Women","Unisex","Kids"]',false,true,80),
  ('watches','Water Resistance','water_resistance','text','[]',false,false,90),
  ('watches','Warranty','warranty','text','[]',false,false,100),
  -- SHIRT
  ('shirts','Brand','brand','text','[]',true,true,10),
  ('shirts','Size','size','size','["S","M","L","XL","XXL"]',true,true,20),
  ('shirts','Color','color','color','[]',true,true,30),
  ('shirts','Fabric','fabric','dropdown','["Cotton","Linen","Polyester","Blend","Silk","Rayon"]',false,true,40),
  ('shirts','Fit','fit','dropdown','["Slim","Regular","Relaxed","Tailored"]',false,true,50),
  ('shirts','Sleeve','sleeve','dropdown','["Full Sleeve","Half Sleeve","Roll-up"]',false,false,60),
  ('shirts','Collar','collar','dropdown','["Spread","Button-down","Mandarin","Club"]',false,false,70),
  ('shirts','Pattern','pattern','dropdown','["Solid","Striped","Checked","Printed","Floral"]',false,true,80),
  ('shirts','Occasion','occasion','dropdown','["Casual","Formal","Party","Festive"]',false,true,90),
  -- JEANS
  ('jeans','Brand','brand','text','[]',true,true,10),
  ('jeans','Size','size','size','["28","30","32","34","36","38"]',true,true,20),
  ('jeans','Color','color','color','[]',true,true,30),
  ('jeans','Fabric','fabric','dropdown','["Denim","Cotton Denim","Stretch Denim"]',false,false,40),
  ('jeans','Fit','fit','dropdown','["Skinny","Slim","Regular","Relaxed","Bootcut","Straight"]',false,true,50),
  ('jeans','Rise','rise','dropdown','["Low","Mid","High"]',false,false,60),
  ('jeans','Length','length','dropdown','["Full Length","Ankle","Cropped"]',false,false,70),
  ('jeans','Closure','closure','dropdown','["Button","Zip","Button & Zip"]',false,false,80),
  ('jeans','Stretchability','stretchability','dropdown','["Non-stretch","Slight","Stretchable","High Stretch"]',false,false,90),
  ('jeans','Wash','wash','dropdown','["Light","Medium","Dark","Acid","Raw"]',false,false,100),
  ('jeans','Distress','distress','dropdown','["None","Light","Heavy"]',false,false,110),
  -- SAREE
  ('sarees','Color','color','color','[]',true,true,10),
  ('sarees','Fabric','fabric','dropdown','["Silk","Cotton","Georgette","Chiffon","Banarasi","Linen"]',false,true,20),
  ('sarees','Blouse Fabric','blouse_fabric','dropdown','["Silk","Cotton","Georgette","Same as Saree"]',false,false,30),
  ('sarees','Blouse Color','blouse_color','color','[]',false,false,40),
  ('sarees','Border','border','dropdown','["Zari","Lace","Temple","Plain","Embroidered"]',false,false,50),
  ('sarees','Ornamentation','ornamentation','dropdown','["Embroidery","Stone Work","Sequins","Print","None"]',false,false,60),
  ('sarees','Pattern','pattern','dropdown','["Solid","Printed","Woven","Embroidered"]',false,true,70),
  ('sarees','Pallu','pallu','dropdown','["Zari","Printed","Embroidered","Plain"]',false,false,80),
  ('sarees','Occasion','occasion','dropdown','["Wedding","Festive","Party","Casual","Daily"]',false,true,90),
  ('sarees','Transparency','transparency','dropdown','["Opaque","Semi-sheer","Sheer"]',false,false,100),
  -- SHOES
  ('shoes','Brand','brand','text','[]',true,true,10),
  ('shoes','Size','size','size','["6","7","8","9","10","11"]',true,true,20),
  ('shoes','Color','color','color','[]',true,true,30),
  ('shoes','Upper Material','upper_material','dropdown','["Leather","Synthetic","Mesh","Canvas","Suede"]',false,true,40),
  ('shoes','Sole Material','sole_material','dropdown','["Rubber","EVA","PVC","TPR"]',false,false,50),
  ('shoes','Closure','closure','dropdown','["Lace-up","Slip-on","Velcro","Buckle"]',false,false,60),
  ('shoes','Gender','gender','dropdown','["Men","Women","Unisex","Kids"]',false,true,70),
  ('shoes','Occasion','occasion','dropdown','["Casual","Formal","Sports","Party","Ethnic"]',false,true,80),
  -- ELECTRONICS
  ('electronics','Brand','brand','text','[]',true,true,10),
  ('electronics','Model','model','text','[]',false,false,20),
  ('electronics','RAM','ram','dropdown','["2GB","4GB","6GB","8GB","12GB","16GB"]',false,true,30),
  ('electronics','Storage','storage','dropdown','["32GB","64GB","128GB","256GB","512GB","1TB"]',false,true,40),
  ('electronics','Processor','processor','text','[]',false,false,50),
  ('electronics','Battery','battery','text','[]',false,false,60),
  ('electronics','Display','display','text','[]',false,false,70),
  ('electronics','Warranty','warranty','text','[]',false,false,80),
  ('electronics','Color','color','color','[]',false,true,90)
) as v(cat_slug, name, attribute_key, input_type, options, is_required, is_filterable, sort_order)
join public.catalog_categories c on c.slug = v.cat_slug
on conflict (category_id, attribute_key) do nothing;

commit;

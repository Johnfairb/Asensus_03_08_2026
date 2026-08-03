-- Run once in the Supabase SQL editor before syncing FOODS_SEED_VERSION template_v4.
-- Required so food_inventory upserts that include water_per_100g succeed.

ALTER TABLE food_inventory
  ADD COLUMN IF NOT EXISTS water_per_100g numeric DEFAULT 0;

COMMENT ON COLUMN food_inventory.water_per_100g IS
  'Estimated water content in grams per 100 g edible (ml per 100 ml for liquids).';

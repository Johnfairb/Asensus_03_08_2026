import { store } from '../state/store.js';
import { FOODS_SEED_VERSION, STORAGE_KEYS } from '../config/constants.js';

const CATALOG_URL = 'data/template-foods-catalog.json';
const SEED_URL = 'data/seed-database.json';

let foodCatalogByName = new Map();
export const openFoodHeadings = new Set();

export const FOOD_HEADING_ORDER = [
  'Meat', 'Fruit', 'Vegetables', 'Carbs', 'Animal products',
  'Fish', 'Nuts', 'Drinks', 'Oils and condiments'
];

export const HEADING_TO_CAT = {
  'Meat': 'PRO',
  'Fruit': 'CARB',
  'Vegetables': 'VEG_G',
  'Carbs': 'CARB',
  'Animal products': 'PRO',
  'Fish': 'PRO',
  'Nuts': 'FAT',
  'Drinks': 'LIQUID',
  'Oils and condiments': 'FAT'
};

export function headingToCategory(heading) {
  return HEADING_TO_CAT[heading] || 'MISC';
}

export function categoryToHeading(cat) {
  const found = Object.entries(HEADING_TO_CAT).find(([, c]) => c === cat);
  return found ? found[0] : 'Carbs';
}

export async function ensureFoodCatalog() {
  if (foodCatalogByName.size > 0) return foodCatalogByName;
  try {
    const response = await fetch(CATALOG_URL);
    if (!response.ok) throw new Error('catalog fetch failed');
    const data = await response.json();
    foodCatalogByName = new Map((data.foods || []).map(f => [f.name, f]));
  } catch (err) {
    console.warn('Food catalog unavailable:', err);
  }
  return foodCatalogByName;
}

export function getFoodCatalogByName() {
  return foodCatalogByName;
}

export function shopStylePackPrice(foodOrCat, style) {
  if (!foodOrCat) return undefined;
  const s = style || store.userConfig.shopStyle || 'Cheap';
  if (s === 'Middle') return foodOrCat.price_middle;
  if (s === 'Quality') return foodOrCat.price_quality;
  return foodOrCat.price_cheap;
}

export function isPerItemMacroFood(cleanName) {
  const n = String(cleanName || '').toLowerCase();
  if (n.includes('chicken thigh')) return true;
  if (n.includes('banana')) return true;
  if (n.includes('nectarine')) return true;
  if (n.includes('lemon')) return true;
  if (n.includes('baby gem lettuce')) return true;
  if (n.includes('garlic')) return true;
  if (n.includes('sweetcorn')) return true;
  if (/\begg\b/.test(n)) return true;
  if (n.includes('apple') && !n.includes('juice')) return true;
  return false;
}

export function stripPackSizeFromName(name) {
  return String(name || '')
    .replace(/\s*\([^)]*?\b\d+(?:\.\d+)?\s*(?:g|kg|ml|litres?|pints?)\b[^)]*\)\s*/gi, ' ')
    .replace(/\s*\(\s*bought in\s+\d+(?:\s*pack)?\s*\)\s*/gi, ' ')
    .replace(/\s*\(\s*\d+\s*pack\s*\)\s*/gi, ' ')
    .replace(/\s*bought in\s+\d+(?:\s*pack)?\b/gi, ' ')
    .replace(/\s+\d+(?:\.\d+)?\s*(?:g|kg|ml)\b\s*$/i, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function foodLabelSource(food) {
  if (!food) return '';
  return food._rawLabel || food.name || food._cleanName || '';
}

export function extractPackGFromText(text) {
  const s = String(text || '');
  let m = s.match(/(\d+(?:\.\d+)?)\s*kg/i);
  if (m) return parseFloat(m[1]) * 1000;
  m = s.match(/(\d+(?:\.\d+)?)\s*litres?/i);
  if (m) return parseFloat(m[1]) * 1000;
  m = s.match(/(\d+(?:\.\d+)?)\s*ml/i);
  if (m) return parseFloat(m[1]);
  m = s.match(/(\d+(?:\.\d+)?)\s*g\b/i);
  if (m) return parseFloat(m[1]);
  return null;
}

export function extractPackUnitFromText(text) {
  const s = String(text || '');
  if (/\d+(?:\.\d+)?\s*kg/i.test(s)) return 'g';
  if (/\d+(?:\.\d+)?\s*litres?/i.test(s)) return 'l';
  if (/\d+(?:\.\d+)?\s*ml/i.test(s)) return 'ml';
  if (/\d+(?:\.\d+)?\s*g\b/i.test(s)) return 'g';
  return null;
}

export function isVolumePackUnit(unit) {
  return unit === 'ml' || unit === 'l';
}

export function extractUnitCountFromText(text) {
  const s = String(text || '');
  let m = s.match(/bought in\s+(\d+)(?!\s*(?:kg|g|ml)\b)(?:\s*pack)?/i);
  if (m) return parseInt(m[1], 10);
  m = s.match(/\((\d+)\s*pack\)/i);
  if (m) return parseInt(m[1], 10);
  return null;
}

export function isUnitCountPackFood(foodOrName) {
  if (foodOrName && typeof foodOrName === 'object') {
    if (foodOrName._unit_count > 0 && !(foodOrName._pack_g > 0)) return true;
    const n = foodLabelSource(foodOrName);
    return extractUnitCountFromText(n) > 0 && !(extractPackGFromText(n) > 0);
  }
  const n = String(foodOrName || '');
  return extractUnitCountFromText(n) > 0 && !(extractPackGFromText(n) > 0);
}

export function formatPackSizeLabel(food) {
  if (food._packSizeKind === 'items' && food._unit_count > 0) {
    return `${food._unit_count} in pack`;
  }
  if (!(food._pack_g > 0)) return '';
  const unit = food._packUnit || 'g';
  const amount = food._pack_g;
  if (unit === 'ml') return `${amount}ml pack`;
  if (unit === 'l') {
    const litres = amount >= 1000 ? amount / 1000 : amount;
    const label = litres === 1 ? '1 litre' : `${litres} litres`;
    return `${label} pack`;
  }
  if (amount >= 1000 && amount % 1000 === 0) return `${amount / 1000}kg pack`;
  return `${amount}g pack`;
}

export function foodAllowedByDiet(food, diet = store.userConfig.diet) {
  if (!food) return false;
  if (!diet || diet === 'Standard' || diet === 'Gluten-Free') return true;

  const heading = String(food._heading || '').toLowerCase();
  const n = `${food._cleanName || ''} ${foodLabelSource(food)}`.toLowerCase();

  const isPork = /\bpork\b/.test(n) || /\bbacon\b/.test(n) || /\bham\b/.test(n);
  const isHoney = /\bhoney\b/.test(n);
  const isEgg = /\begg\b/.test(n);
  const isNutButter = /\b(peanut|almond|cashew|hazelnut|nut)\s+butter\b/.test(n);
  const isDairy = /\b(milk|cheese|yoghurt|yogurt|whey|kefir|cream|cheddar|parmesan|mozzarella|motzarella|cottage|halloumi|feta)\b/.test(n)
    || (/\bbutter\b/.test(n) && !isNutButter);
  const isNut = heading === 'nuts' || isNutButter
    || /\b(almond|peanut|cashew|walnut|brazil|pecan|pistachio|pine nut|hazelnut|\bnuts?\b)/.test(n);

  if (diet === 'Halal') return !isPork;
  if (diet === 'Vegetarian') return heading !== 'meat';

  if (diet === 'Vegan') {
    if (heading === 'meat' || heading === 'fish' || heading === 'animal products') return false;
    if (isPork || isDairy || isEgg || isHoney) return false;
    if (/\b(chicken|beef|lamb|turkey|fish|salmon|tuna|cod|prawn|anchov|sardine|steak|mince|liver|sausage|burger|meatball)\b/.test(n)) return false;
    return true;
  }

  if (diet === 'Dairy-Free') {
    if (heading === 'meat' || heading === 'fish') return false;
    if (heading === 'animal products') return isHoney || isEgg;
    if (isDairy) return false;
    if (/\b(chicken|beef|lamb|pork|turkey|fish|salmon|tuna|cod|prawn|anchov|sardine|steak|mince|bacon|sausage)\b/.test(n)) return false;
    return true;
  }

  if (diet === 'Nut-Free') return !isNut;
  return true;
}

export function applyDietFilter(foods) {
  if (!Array.isArray(foods)) return [];
  return foods.filter(f => foodAllowedByDiet(f));
}

function getNextPriceUpdateDate(fromDate = new Date()) {
  const d = new Date(fromDate.getFullYear(), fromDate.getMonth(), 15);
  if (fromDate.getDate() > 15) d.setMonth(d.getMonth() + 1);
  return d;
}

function formatOrdinalDate(date) {
  const day = date.getDate();
  const j = day % 10, k = day % 100;
  const ord = (j === 1 && k !== 11) ? 'st' : (j === 2 && k !== 12) ? 'nd' : (j === 3 && k !== 13) ? 'rd' : 'th';
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${day}${ord} of ${months[date.getMonth()]}`;
}

export function updateFoodsPriceUpdateLabel() {
  const el = document.getElementById('foods-price-update-date');
  if (!el) return;
  el.textContent = formatOrdinalDate(getNextPriceUpdateDate());
}

export function toggleFoodHeading(headingKey) {
  const panel = document.getElementById(`food-heading-${headingKey}`);
  const chevron = document.getElementById(`food-heading-chevron-${headingKey}`);
  if (!panel) return;
  const opening = panel.classList.contains('hidden');
  panel.classList.toggle('hidden', !opening);
  if (chevron) chevron.textContent = opening ? '−' : '+';
  if (opening) openFoodHeadings.add(headingKey);
  else openFoodHeadings.delete(headingKey);
}

export function showShopStyleInfo(where) {
  const tipId = where === 'settings' ? 'set-shop-style-tip' : 'ob-shop-style-tip';
  const tip = document.getElementById(tipId);
  if (!tip) return;
  if (!tip.classList.contains('hidden')) {
    tip.classList.add('hidden');
    return;
  }
  tip.innerHTML = [
    `<strong style="color:var(--gold-accent);">Cheap</strong> — Tesco's standard, Lidl, Aldi`,
    `<strong style="color:var(--gold-accent);">Middle</strong> — Waitrose standard, Sainsbury's Taste the Difference, Tesco's Finest`,
    `<strong style="color:var(--gold-accent);">Quality</strong> — Organic`
  ].join('<br>');
  tip.classList.remove('hidden');
}

/** Build Supabase row from seed/catalog/user food. */
export function toSupabaseFoodPayload(food, { isCustom = false } = {}) {
  const style = store.userConfig.shopStyle || 'Cheap';
  const packPrice = shopStylePackPrice(food, style);
  const packG = food.pack_g > 0 ? food.pack_g : null;
  const unitCount = food.unit_count > 0 && !(packG > 0) ? food.unit_count : (food.unit_count || null);
  const refG = packG > 0 ? packG : 100;
  let price100 = food.price_per_100g;
  if (packPrice != null && !isCustom) {
    price100 = Math.round((packPrice / refG) * 100 * 10000) / 10000;
  }

  return {
    name: food.name,
    price_per_100g: price100 ?? 0,
    protein_per_100g: food.protein_per_100g ?? 0,
    carbs_per_100g: food.carbs_per_100g ?? 0,
    fat_per_100g: food.fat_per_100g ?? 0,
    water_per_100g: food.water_per_100g ?? 0,
    stock_g: food.stock_g ?? 0,
    preference_score: food.preference_score ?? 0,
    heading: food.heading || null,
    pack_g: packG,
    pack_unit: unitCount ? null : (food.pack_unit || null),
    unit_count: unitCount,
    pack_price: packPrice != null ? packPrice : (food.pack_price ?? null),
    price_cheap: food.price_cheap ?? null,
    price_middle: food.price_middle ?? null,
    price_quality: food.price_quality ?? null,
    is_custom: !!isCustom,
    source: isCustom ? 'user' : 'seed'
  };
}

/**
 * Enrich a DB row for UI/planning.
 * Uses Supabase columns first, then catalog fallback for official foods.
 * Returns null when current shop style has no price for a catalog item.
 */
export function enrichFoodRow(food) {
  const style = store.userConfig.shopStyle || 'Cheap';
  const cat = foodCatalogByName.get(food.name);
  const isCustom = food.is_custom === true || food.source === 'user';

  let cat_ = 'MISC';
  let rawLabel = food.name || 'Unnamed';
  if (food.name) {
    const match = food.name.match(/^\[(.*?)\]\s*(.*)$/);
    if (match) { cat_ = match[1]; rawLabel = match[2]; }
  }

  const heading = food.heading || cat?.heading || categoryToHeading(cat_);
  const labelSrc = rawLabel || cat?.name || '';

  // Shop-tier price: DB columns, then catalog
  const tierSource = {
    price_cheap: food.price_cheap ?? cat?.price_cheap,
    price_middle: food.price_middle ?? cat?.price_middle,
    price_quality: food.price_quality ?? cat?.price_quality
  };
  const packPrice = shopStylePackPrice(tierSource, style);

  // Catalog official foods with blank tier are unavailable for this shop style
  if (!isCustom && cat && packPrice == null && (tierSource.price_cheap != null || tierSource.price_middle != null || tierSource.price_quality != null)) {
    return null;
  }

  const unitCount = (food.unit_count > 0 && !(food.pack_g > 0))
    ? food.unit_count
    : (cat?.unit_count > 0 && !(cat?.pack_g > 0)
      ? cat.unit_count
      : extractUnitCountFromText(labelSrc));
  const packG = food.pack_g > 0
    ? food.pack_g
    : (cat?.pack_g > 0 ? cat.pack_g : (unitCount ? null : extractPackGFromText(labelSrc)));
  const isUnits = unitCount > 0 && !(packG > 0);
  const packUnit = isUnits ? null : (food.pack_unit || cat?.pack_unit || extractPackUnitFromText(labelSrc) || 'g');
  const macroUnit = (isUnits || isPerItemMacroFood(labelSrc))
    ? 'item'
    : (isVolumePackUnit(packUnit) ? '100ml' : 'pack');
  const refG = packG > 0 ? packG : 100;

  let price100 = food.price_per_100g;
  if (packPrice != null) {
    price100 = Math.round((packPrice / refG) * 100 * 10000) / 10000;
  }

  const protein100 = food.protein_per_100g ?? cat?.protein_per_100g ?? 0;
  const carbs100 = food.carbs_per_100g ?? cat?.carbs_per_100g ?? 0;
  const fat100 = food.fat_per_100g ?? cat?.fat_per_100g ?? 0;
  // Prefer positive DB value; else catalog (so post-ALTER default 0 still gets seed moisture).
  const dbWater = food.water_per_100g != null ? Number(food.water_per_100g) : NaN;
  const water100 = (Number.isFinite(dbWater) && dbWater > 0)
    ? dbWater
    : (cat?.water_per_100g ?? (Number.isFinite(dbWater) ? dbWater : 0));

  return {
    ...food,
    _category: cat_,
    _rawLabel: rawLabel,
    _cleanName: stripPackSizeFromName(rawLabel) || rawLabel,
    _fromCatalog: !!cat && !isCustom,
    _heading: heading,
    _macroUnit: macroUnit,
    _pack_g: packG || null,
    _unit_count: isUnits ? unitCount : (food.unit_count || cat?.unit_count || null),
    _packSizeKind: isUnits ? 'items' : 'g',
    _packUnit: packUnit,
    _packPrice: packPrice != null
      ? packPrice
      : (food.pack_price != null
        ? food.pack_price
        : (isUnits && price100 != null
          ? price100
          : (packG > 0 && price100 != null
            ? Math.round((price100 * packG / 100) * 100) / 100
            : null))),
    price_cheap: tierSource.price_cheap,
    price_middle: tierSource.price_middle,
    price_quality: tierSource.price_quality,
    protein_per_100g: protein100,
    carbs_per_100g: carbs100,
    fat_per_100g: fat100,
    water_per_100g: water100,
    price_per_100g: price100,
    protein_pack: isUnits
      ? protein100
      : (packG > 0 ? Math.round(protein100 * packG / 100 * 100) / 100 : (cat?.protein_pack ?? null)),
    carbs_pack: isUnits
      ? carbs100
      : (packG > 0 ? Math.round(carbs100 * packG / 100 * 100) / 100 : (cat?.carbs_pack ?? null)),
    fat_pack: isUnits
      ? fat100
      : (packG > 0 ? Math.round(fat100 * packG / 100 * 100) / 100 : (cat?.fat_pack ?? null)),
  };
}

function mergeSeedWithCatalog(seedFood, catalogFood) {
  if (!catalogFood) return { ...seedFood };
  return {
    ...seedFood,
    heading: catalogFood.heading,
    pack_g: catalogFood.pack_g,
    pack_unit: catalogFood.pack_unit,
    unit_count: catalogFood.unit_count,
    price_cheap: catalogFood.price_cheap,
    price_middle: catalogFood.price_middle,
    price_quality: catalogFood.price_quality,
    carbs_pack: catalogFood.carbs_pack,
    fat_pack: catalogFood.fat_pack,
    protein_pack: catalogFood.protein_pack,
    price_per_100g: catalogFood.price_per_100g ?? seedFood.price_per_100g,
    protein_per_100g: catalogFood.protein_per_100g ?? seedFood.protein_per_100g,
    carbs_per_100g: catalogFood.carbs_per_100g ?? seedFood.carbs_per_100g,
    fat_per_100g: catalogFood.fat_per_100g ?? seedFood.fat_per_100g,
    water_per_100g: catalogFood.water_per_100g ?? seedFood.water_per_100g ?? 0,
  };
}

/**
 * Safe sync: upsert John's official foods; delete obsolete official only; never touch custom.
 */
export async function syncOfficialFoods(client = store.supabaseClient) {
  if (!client) return { synced: false, reason: 'no-client' };

  await ensureFoodCatalog();
  const seedRes = await fetch(SEED_URL);
  if (!seedRes.ok) throw new Error('Could not load seed JSON file.');
  const seedData = await seedRes.json();
  const seedFoods = seedData.foods || [];
  const seedNames = new Set(seedFoods.map(f => f.name));

  const { data: existing, error: fetchErr } = await client.from('food_inventory').select('*');
  if (fetchErr) {
    console.error('❌ Error loading food_inventory:', fetchErr);
    return { synced: false, reason: 'fetch-error', error: fetchErr };
  }

  const rows = existing || [];
  const byName = new Map(rows.map(r => [r.name, r]));

  let inserted = 0;
  let updated = 0;
  let deleted = 0;

  for (const seedFood of seedFoods) {
    const merged = mergeSeedWithCatalog(seedFood, foodCatalogByName.get(seedFood.name));
    const payload = toSupabaseFoodPayload(merged, { isCustom: false });
    const row = byName.get(seedFood.name);

    if (row) {
      if (row.is_custom === true || row.source === 'user') continue;
      const { error } = await client.from('food_inventory').update(payload).eq('id', row.id);
      if (error) console.error('Food update failed:', seedFood.name, error);
      else updated += 1;
    } else {
      const { error } = await client.from('food_inventory').insert([payload]);
      if (error) console.error('Food insert failed:', seedFood.name, error);
      else inserted += 1;
    }
  }

  const obsoleteIds = rows
    .filter(r => r.is_custom !== true && r.source !== 'user' && r.name && !seedNames.has(r.name))
    .map(r => r.id)
    .filter(id => id != null);

  if (obsoleteIds.length) {
    const { error } = await client.from('food_inventory').delete().in('id', obsoleteIds);
    if (error) console.error('Obsolete food delete failed:', error);
    else deleted = obsoleteIds.length;
  }

  // Seed exercises only when empty
  const { data: exCheck, error: exCheckErr } = await client.from('exercise_inventory').select('id').limit(1);
  if (!exCheckErr && (!exCheck || exCheck.length === 0) && seedData.exercises?.length) {
    const { error: exErr } = await client.from('exercise_inventory').insert(seedData.exercises);
    if (exErr) console.error('❌ Error inserting exercises:', exErr);
    else console.log('✅ Exercises seeded!');
  }

  localStorage.setItem(STORAGE_KEYS.foodsSeed, FOODS_SEED_VERSION);
  console.log(`✅ Official foods synced (insert ${inserted}, update ${updated}, delete obsolete ${deleted})`);
  return { synced: true, inserted, updated, deleted };
}

export function needsFoodSeedSync() {
  return localStorage.getItem(STORAGE_KEYS.foodsSeed) !== FOODS_SEED_VERSION;
}

import { store } from '../state/store.js';
import { DAILY_HYDRATION_TARGET_L } from '../config/constants.js';
import { estimateFoodWaterMl, parseFoodLogDetails } from '../lib/food-parse.js';
import { computeMacroBarLayout, formatMacroAimLabel } from '../lib/macro-range.js';
import { excludeBannedFoods } from './bans.js';
import { applyDietFilter } from './food-catalog.js';
import { isGuidanceOff } from './fitness-hud.js';
import { smartRoundMass } from './thermodynamics.js';
import { FLEXIBLE_RECIPES, getFlexibleRecipeById, getFlexibleRecipesForMeal } from './flexible-recipes.js';

function availableFoods(list) {
    return excludeBannedFoods(applyDietFilter(list || []));
}

/** Meat / fish / animal products — used for the ≥90% animal protein rule (skipped for vegan/veg). */
export function isAnimalProteinFood(food) {
    if (!food) return false;
    const h = String(food._heading || food.heading || '').toLowerCase();
    return h === 'meat' || h === 'fish' || h === 'animal products';
}

function shouldEnforceAnimalProtein() {
    const diet = store.userConfig?.diet;
    return diet !== 'Vegan' && diet !== 'Vegetarian';
}

function animalProteinFoods(list) {
    return (list || []).filter(isAnimalProteinFood);
}

function dayOfYear(dateObj) {
    const d = dateObj instanceof Date ? dateObj : new Date();
    return Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 1000 / 60 / 60 / 24);
}

function isZeroPrepOn() {
    return document.getElementById('toggle-zero-prep') ? document.getElementById('toggle-zero-prep').checked : false;
}

function isBudgetSaverOn() {
    return document.getElementById('toggle-budget-saver') ? document.getElementById('toggle-budget-saver').checked : false;
}

function recipeFitsDiet(recipe) {
    const diet = store.userConfig.diet;
    if (diet === 'Vegan') return !!recipe.veganOk;
    if (diet === 'Halal') {
        const banned = ['pork', 'bacon'];
        return !(recipe.slots || []).some(s => banned.some(b => (s.prefer || '').toLowerCase().includes(b)));
    }
    return true;
}

function pickRecipeForMeal(meal, planDate, zeroPrep) {
    let pool = getFlexibleRecipesForMeal(meal).filter(recipeFitsDiet);
    if (zeroPrep) {
        const zp = pool.filter(r => r.zeroPrep);
        if (zp.length) pool = zp;
    }
    if (!pool.length) {
        pool = getFlexibleRecipesForMeal(meal);
        if (zeroPrep) {
            const zp = pool.filter(r => r.zeroPrep);
            if (zp.length) pool = zp;
        }
    }
    if (!pool.length) pool = FLEXIBLE_RECIPES.filter(r => (r.meals || []).includes(meal));
    if (!pool.length) return null;

    // Friday fish bias for lunch/dinner when Standard diet
    const isFriday = planDate.getDay() === 5;
    if (isFriday && meal !== 'breakfast' && store.userConfig.diet === 'Standard') {
        const fishy = pool.filter(r =>
            (r.slots || []).some(s => /fish|salmon|tuna|mackerel|prawn|cod/i.test(s.prefer || ''))
        );
        if (fishy.length) pool = fishy;
    }

    const doy = dayOfYear(planDate);
    const mealOffset = meal === 'breakfast' ? 0 : meal === 'lunch' ? 17 : 31;
    return pool[(doy + mealOffset) % pool.length];
}

function slotCategory(role) {
    if (role === 'PRO' || role === 'CARB' || role === 'FAT' || role === 'VEG_G' || role === 'VEG_C' || role === 'LIQUID') return role;
    return 'MISC';
}

function resolveFood(slotKey, cat, defaultKeyword, customList, planDate, budgetSaver, opts = {}) {
    let foods = customList || availableFoods(store.globalFoodDB.filter(f => f._category === cat));
    if (opts.animalOnly && cat === 'PRO') {
        const animal = animalProteinFoods(foods);
        if (animal.length) foods = animal;
    }
    if (foods.length === 0) foods = store.globalFoodDB.filter(f => f._category === cat);
    if (opts.animalOnly && cat === 'PRO') {
        const animal = animalProteinFoods(foods);
        if (animal.length) foods = animal;
    }
    if (foods.length === 0) {
        return {
            id: null,
            _cleanName: `No ${cat}`,
            protein_per_100g: 1,
            carbs_per_100g: 1,
            fat_per_100g: 1,
            price_per_100g: 1,
            _category: cat
        };
    }

    if (store.ghostOverrides[slotKey]) {
        const found = foods.find(f => f.id == store.ghostOverrides[slotKey]);
        if (found) return found;
    }
    if (budgetSaver && cat === 'PRO') {
        return [...foods].sort((a, b) => a.price_per_100g - b.price_per_100g)[0];
    }

    const sorted = [...foods].sort((a, b) => (b.preference_score || 0) - (a.preference_score || 0));
    const preferred = sorted.filter(f => (f.preference_score || 0) > 0);

    const keyword = (defaultKeyword || '').toLowerCase();
    let keywordMatches = keyword
        ? sorted.filter(f => (f._cleanName || '').toLowerCase().includes(keyword))
        : [];
    // Cross-category fallback (e.g. chickpeas/lentils listed as CARB but used as PRO prefer)
    if (!keywordMatches.length && keyword) {
        let cross = availableFoods(store.globalFoodDB).filter(f =>
            (f._cleanName || '').toLowerCase().includes(keyword)
        );
        if (opts.animalOnly) {
            const animalCross = animalProteinFoods(cross);
            if (animalCross.length) cross = animalCross;
        }
        keywordMatches = cross;
    }
    if (keywordMatches.length) {
        const prefHit = keywordMatches.find(f => (f.preference_score || 0) > 0);
        if (prefHit) return prefHit;
        return keywordMatches[0];
    }
    if (preferred.length > 0) return preferred[0];

    const doy = dayOfYear(planDate);
    return sorted[doy % sorted.length];
}

function scaleSlotMass(slot, food, activePro, activeCarb, activeFat, meal) {
    const cat = slotCategory(slot.role);
    if (slot.fixedMass != null) {
        return smartRoundMass(slot.fixedMass, food._cleanName, cat);
    }
    if (cat === 'PRO') {
        return smartRoundMass((activePro / Math.max(0.1, food.protein_per_100g || 1)) * 100, food._cleanName, 'PRO');
    }
    if (cat === 'CARB') {
        if (activeCarb <= 0) return 0;
        return smartRoundMass((activeCarb / Math.max(0.1, food.carbs_per_100g || 1)) * 100, food._cleanName, 'CARB');
    }
    if (cat === 'FAT') {
        if (activeFat <= 0) return 0;
        return smartRoundMass((activeFat / Math.max(0.1, food.fat_per_100g || 1)) * 100, food._cleanName, 'FAT');
    }
    if (cat === 'VEG_G' || cat === 'VEG_C') {
        return meal === 'lunch' ? 150 : 100;
    }
    if (cat === 'LIQUID') {
        return 150;
    }
    return 100;
}

/**
 * Resolve breakfast/lunch/dinner from the flexible recipe catalog.
 * Returns [{ meal, recipeId, recipeName, items, instructions }].
 */
export function resolveDayMealItems({ tPro, tCarb, tFat, forDate = new Date() } = {}) {
    if (!store.userConfig.targets || !store.globalFoodDB.length) return [];

    const Goal = store.userConfig.goal;
    const mealsTotal = store.userConfig.mealsPerDay || 3;
    const basePro = tPro != null ? tPro : store.userConfig.targets.pro;
    const baseCarb = tCarb != null ? tCarb : store.userConfig.targets.carb;
    const baseFat = tFat != null ? tFat : store.userConfig.targets.fat;
    const activePro = basePro / mealsTotal;
    const activeCarb = baseCarb / mealsTotal;
    const activeFat = (baseFat || 0) / mealsTotal;
    const enforceAnimal = shouldEnforceAnimalProtein();
    // ≥90% of protein from meat/fish/animal products (skipped for vegan/vegetarian)
    const animalProShare = enforceAnimal ? 0.9 : 1;
    const otherProShare = 1 - animalProShare;

    const zeroPrep = isZeroPrepOn();
    const budgetSaver = isBudgetSaverOn();
    const planDate = forDate instanceof Date ? forDate : new Date(forDate);

    const meals = ['breakfast', 'lunch', 'dinner'];
    return meals.map(meal => {
        const recipe = pickRecipeForMeal(meal, planDate, zeroPrep);
        if (!recipe) return { meal, recipeId: null, recipeName: meal, items: [], instructions: '' };

        const items = [];
        let usedScaledPro = false;
        let usedScaledCarb = false;
        let usedScaledFat = false;
        const slots = recipe.slots || [];

        slots.forEach((slot, idx) => {
            const cat = slotCategory(slot.role);
            let list = availableFoods(store.globalFoodDB.filter(f => f._category === cat));

            // Fat-loss: prefer potato carbs when this is the scaled CARB slot
            if (cat === 'CARB' && Goal === 'Fat_Loss' && slot.fixedMass == null && !usedScaledCarb) {
                const potatoes = list.filter(c => (c._cleanName || '').toLowerCase().includes('potato'));
                if (potatoes.length) list = potatoes;
            }

            // Zero-prep: nudge primary PRO toward whey/vegan protein
            let prefer = slot.prefer || '';
            if (zeroPrep && cat === 'PRO' && !usedScaledPro && !slot.fixedMass) {
                prefer = store.userConfig.diet === 'Vegan' ? 'Vegan Protein' : 'Whey';
            }

            const isPrimaryPro = cat === 'PRO' && slot.fixedMass == null && !usedScaledPro;
            const isPrimaryCarb = cat === 'CARB' && slot.fixedMass == null && !usedScaledCarb;
            const isPrimaryFat = cat === 'FAT' && slot.fixedMass == null && !usedScaledFat;

            // Primary PRO for omnivore diets: prefer animal sources (≥90% rule)
            const animalOnly = isPrimaryPro && enforceAnimal && !zeroPrep;

            const slotKey = `${meal}_${cat}_${idx}`;
            const food = resolveFood(slotKey, cat, prefer, list, planDate, budgetSaver, { animalOnly });

            let mass;
            if (isPrimaryPro) {
                const proTarget = activePro * animalProShare;
                mass = scaleSlotMass({ ...slot, role: 'PRO' }, food, proTarget, activeCarb, activeFat, meal);
                usedScaledPro = true;
            } else if (isPrimaryCarb) {
                mass = scaleSlotMass({ ...slot, role: 'CARB' }, food, activePro, activeCarb, activeFat, meal);
                usedScaledCarb = true;
            } else if (isPrimaryFat) {
                mass = scaleSlotMass({ ...slot, role: 'FAT' }, food, activePro, activeCarb, activeFat, meal);
                usedScaledFat = true;
            } else if (slot.fixedMass != null) {
                mass = scaleSlotMass(slot, food, activePro, activeCarb, activeFat, meal);
            } else if (slot.optional) {
                // Optional non-primary extras: small fixed garnish
                mass = cat === 'FAT' ? 10 : cat === 'LIQUID' ? 150 : (cat === 'VEG_G' || cat === 'VEG_C' ? 80 : 50);
                mass = smartRoundMass(mass, food._cleanName, cat);
            } else {
                mass = scaleSlotMass(slot, food, activePro, activeCarb, activeFat, meal);
            }

            if (mass <= 0 && (cat === 'CARB' || cat === 'FAT')) return;
            if (slot.optional && !food.id) return;

            items.push({ food, mass, role: cat });
        });

        // Top up remaining ~10% protein from any PRO source when enforcing animal split
        if (enforceAnimal && otherProShare > 0 && usedScaledPro) {
            const otherTarget = activePro * otherProShare;
            if (otherTarget > 0.5) {
                const proList = availableFoods(store.globalFoodDB.filter(f => f._category === 'PRO'));
                const fOther = resolveFood(`${meal}_pro_other`, 'PRO', zeroPrep ? 'Whey' : '', proList, planDate, budgetSaver, { animalOnly: false });
                if (fOther?.id || fOther?._cleanName) {
                    const mass = smartRoundMass(
                        (otherTarget / Math.max(0.1, fOther.protein_per_100g || 1)) * 100,
                        fOther._cleanName,
                        'PRO'
                    );
                    if (mass > 0) items.push({ food: fOther, mass, role: 'PRO' });
                }
            }
        }

        // Guarantee at least PRO (+ CARB/FAT if needed) if slots failed
        if (!items.length) {
            const fPro = resolveFood(
                `${meal}_pro`,
                'PRO',
                meal === 'breakfast' ? 'Egg' : 'Chicken',
                null,
                planDate,
                budgetSaver,
                { animalOnly: enforceAnimal }
            );
            items.push({
                food: fPro,
                mass: smartRoundMass((activePro * animalProShare / Math.max(0.1, fPro.protein_per_100g)) * 100, fPro._cleanName, 'PRO'),
                role: 'PRO'
            });
            if (activeCarb > 0) {
                const fCarb = resolveFood(`${meal}_carb`, 'CARB', 'Rice', null, planDate, budgetSaver);
                items.push({
                    food: fCarb,
                    mass: smartRoundMass((activeCarb / Math.max(0.1, fCarb.carbs_per_100g)) * 100, fCarb._cleanName, 'CARB'),
                    role: 'CARB'
                });
            }
            if (activeFat > 0) {
                const fFat = resolveFood(`${meal}_fat`, 'FAT', 'Olive', null, planDate, budgetSaver);
                items.push({
                    food: fFat,
                    mass: smartRoundMass((activeFat / Math.max(0.1, fFat.fat_per_100g)) * 100, fFat._cleanName, 'FAT'),
                    role: 'FAT'
                });
            }
        } else if (activeFat > 0 && !usedScaledFat) {
            // Recipes without a scaled FAT slot still need leftover fat filled
            const fFat = resolveFood(`${meal}_fat`, 'FAT', 'Olive', null, planDate, budgetSaver);
            const mass = smartRoundMass((activeFat / Math.max(0.1, fFat.fat_per_100g || 1)) * 100, fFat._cleanName, 'FAT');
            if (mass > 0) items.push({ food: fFat, mass, role: 'FAT' });
        }

        return {
            meal,
            recipeId: recipe.id,
            recipeName: recipe.name,
            instructions: recipe.instructions || '',
            items
        };
    });
}

/** Display-only: sum planned B/L/D cost for the day (no budget enforcement). */
export function getPlannedDayCost({ tPro, tCarb, tFat, forDate = new Date() } = {}) {
    const meals = resolveDayMealItems({ tPro, tCarb, tFat, forDate });
    let cost = 0;
    meals.forEach(entry => {
        (entry.items || []).forEach(item => {
            if (!item?.food) return;
            cost += ((item.mass || 0) / 100) * (item.food.price_per_100g || 0);
        });
    });
    return cost;
}

/** Recipe names for the day (week-card food lines). */
export function getDayRecipeNames({ tPro, tCarb, tFat, forDate = new Date() } = {}) {
    return resolveDayMealItems({ tPro, tCarb, tFat, forDate })
        .map(m => m.recipeName)
        .filter(Boolean);
}

/** Unique food names for the day (week-card ingredient line). */
export function getDayIngredientNames({ tPro, tCarb, tFat, forDate = new Date() } = {}) {
    const meals = resolveDayMealItems({ tPro, tCarb, tFat, forDate });
    const seen = new Set();
    const names = [];
    meals.forEach(({ items }) => {
        items.forEach(({ food }) => {
            const n = food._cleanName;
            if (!n || seen.has(n)) return;
            seen.add(n);
            names.push(n);
        });
    });
    return names;
}

/**
 * Breakfast/Lunch/Dinner cards matching Today's plan.
 * @param {{ tPro?: number, tCarb?: number, tFat?: number, includeLog?: boolean, forDate?: Date, headerHtml?: string, plain?: boolean }} opts
 */
export function buildMealPlanCardsHtml(opts = {}) {
    const {
        tPro = store.userConfig.targets?.pro,
        tCarb = store.userConfig.targets?.carb,
        tFat = store.userConfig.targets?.fat,
        includeLog = true,
        forDate = new Date(),
        headerHtml = '',
        plain = false
    } = opts;

    if (isGuidanceOff('food')) {
        const wrap = plain
            ? 'style="padding:8px 0 16px; text-align:center;"'
            : 'class="card" style="padding:16px; text-align:center;"';
        return `<div ${wrap}>
            <div style="font-size:11px; color:var(--text-muted); font-family:'Roboto Mono'; letter-spacing:1px; margin-bottom:8px;">Food guidance off</div>
            <p style="font-size:12px; color:var(--text-silver); line-height:1.5; margin:0;">Recommendations are switched off in Tracker.</p>
        </div>`;
    }

    if (!store.userConfig.targets || store.globalFoodDB.length === 0) {
        return `<div style="font-size:12px; color:var(--text-muted);">No meal plan available.</div>`;
    }

    const planDate = forDate instanceof Date ? forDate : new Date(forDate);
    const iso = `${planDate.getFullYear()}-${String(planDate.getMonth() + 1).padStart(2, '0')}-${String(planDate.getDate()).padStart(2, '0')}`;
    const meals = resolveDayMealItems({ tPro, tCarb, tFat, forDate: planDate });
    let html = headerHtml || '';

    meals.forEach(({ meal, recipeId, recipeName }) => {
        let isLogged = includeLog && window.completedStatusGlobal && window.completedStatusGlobal[meal === 'breakfast' ? 'BRK' : (meal === 'lunch' ? 'LUN' : 'DIN')];
        let checkIcon = isLogged ? `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--gold-accent)" stroke-width="2" style="margin-right:6px;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>` : '';
        const mealTitle = meal.charAt(0).toUpperCase() + meal.slice(1);
        const safeRecipeId = String(recipeId || '').replace(/'/g, "\\'");
        const safeMeal = String(meal || '').replace(/'/g, "\\'");
        const recipeLabel = recipeName
            ? `<button type="button" onclick="event.stopPropagation(); openFlexibleRecipe('${safeRecipeId}', '${iso}', ${Number(tPro) || 0}, ${Number(tCarb) || 0})" style="background:none; border:none; padding:0; margin:0; text-align:left; cursor:pointer; color:var(--text-main); font-size:12px; font-weight:600; line-height:1.35; min-width:0; overflow:hidden; text-overflow:ellipsis;">${recipeName}</button>`
            : '';
        let logAction = '';
        if (includeLog) {
            logAction = isLogged
                ? `<div class="meal-log-status">Logged</div>`
                : `<button type="button" class="btn-primary is-secondary meal-log-btn" onclick="event.stopPropagation(); startExecution('${meal}', this)">Log</button>`;
        }

        // Same recipe modal + format whether the meal card or recipe name is tapped
        const cardClick = recipeId
            ? `onclick="openFlexibleRecipe('${safeRecipeId}', '${iso}', ${Number(tPro) || 0}, ${Number(tCarb) || 0})" role="button" tabindex="0"`
            : `onclick="openMealDetail('${safeMeal}', '${iso}', ${Number(tPro) || 0}, ${Number(tCarb) || 0})" role="button" tabindex="0"`;
        const sectionOpen = plain
            ? `<div ${cardClick} style="padding:4px 0 16px; margin-bottom:8px; border-bottom:1px solid var(--border-subtle); opacity: ${isLogged ? '0.5' : '1'}; width:100%; min-width:0; cursor:pointer;">`
            : `<div class="card" ${cardClick} style="padding:16px; margin-bottom:12px; opacity: ${isLogged ? '0.5' : '1'}; cursor:pointer;">`;

        html += `${sectionOpen}
            <div class="${plain ? 'day-plan-section-head' : ''}" style="display:flex; justify-content:space-between; align-items:stretch; gap:12px; min-width:0;">
                <div style="min-width:0; flex:1;">
                    <strong style="font-size:11px; color:var(--text-muted); font-family:'Roboto Mono'; letter-spacing:0.4px; display:flex; align-items:center; min-width:0;">${checkIcon} ${mealTitle}</strong>
                    ${recipeLabel ? `<div style="margin-top:4px; min-width:0;">${recipeLabel}</div>` : ''}
                </div>
                ${logAction}
            </div>
        </div>`;
    });

    return html;
}

/** Goals-style metric row: meal amount vs daily target with aim band. */
function detailMetricRow(metric, label, current, target) {
    const layout = computeMacroBarLayout(metric, current, target);
    const valueText = formatMacroAimLabel(metric, current, target);
    const tickHtml = target > 0
        ? `<div class="macro-aim-tick" style="left:${layout.aimPct}%;"></div>`
        : '';
    return `<div class="detail-metric-row">
        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
            <span class="hud-label" style="margin:0;">${label}</span>
            <span style="font-family:'Roboto Mono'; font-size:11px; color:var(--text-silver);">${valueText}</span>
        </div>
        <div class="progress-bar-bg macro-bar-track">
            <div class="macro-range-band" style="left:${layout.bandLeft}%; width:${layout.bandWidth}%; background:${layout.bandGradient};"></div>
            ${tickHtml}
            <div class="progress-bar-fill ${layout.state}" style="width:${layout.fillPct}%; --in-range-t:${layout.inRangeT};"></div>
        </div>
    </div>`;
}

/** Open meal summary sheet (Goals-scale bars for this meal only). */
export function openMealDetail(mealKey, iso, tPro, tCarb, recipeId = '') {
    const sheet = document.getElementById('meal-detail-sheet');
    const titleEl = document.getElementById('meal-detail-title');
    const subEl = document.getElementById('meal-detail-subtitle');
    const macrosEl = document.getElementById('meal-detail-macros');
    const foodsEl = document.getElementById('meal-detail-foods');
    if (!sheet || !macrosEl || !foodsEl) return;

    // Match openFlexibleRecipe date parsing so the same recipe/foods resolve
    let forDate = new Date();
    if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
        forDate = new Date(`${iso}T12:00:00`);
    }

    const dayPro = (tPro != null && tPro > 0) ? tPro : store.userConfig.targets?.pro;
    const dayCarb = (tCarb != null && tCarb > 0) ? tCarb : store.userConfig.targets?.carb;
    const dayFat = store.userConfig.targets?.fat;
    const meals = resolveDayMealItems({
        tPro: dayPro,
        tCarb: dayCarb,
        tFat: dayFat,
        forDate
    });

    // Prefer recipeId (same pairing as recipe-name click), then meal slot
    let entry = null;
    if (recipeId) entry = meals.find(m => String(m.recipeId) === String(recipeId)) || null;
    if (!entry && mealKey) entry = meals.find(m => m.meal === mealKey) || null;
    if (!entry) entry = meals[0];
    if (!entry) return;

    // If a catalog recipe id was passed but isn't today's slot, still show that recipe's name with its resolved items when possible
    const catalogRecipe = recipeId ? getFlexibleRecipeById(recipeId) : null;
    const displayName = entry.recipeName
        || catalogRecipe?.name
        || (entry.meal ? entry.meal.charAt(0).toUpperCase() + entry.meal.slice(1) : 'Meal');
    const mealTitle = entry.meal
        ? entry.meal.charAt(0).toUpperCase() + entry.meal.slice(1)
        : (mealKey ? mealKey.charAt(0).toUpperCase() + mealKey.slice(1) : '');

    let mPro = 0, mCarb = 0, mFat = 0, mCost = 0, mWaterMl = 0;
    let foodHtml = '';
    (entry.items || []).forEach(item => {
        if (!item?.food) return;
        const m = item.mass / 100;
        mPro += (item.food.protein_per_100g || 0) * m;
        mCarb += (item.food.carbs_per_100g || 0) * m;
        mFat += (item.food.fat_per_100g || 0) * m;
        mCost += (item.food.price_per_100g || 0) * m;
        mWaterMl += estimateFoodWaterMl(item.food, item.mass);
        const displayMass = store.userConfig.dependentAthlete
            ? getVisualPortion(item.mass, item.food._category)
            : Math.round(item.mass) + (item.food._category === 'LIQUID' ? 'ml' : 'g');
        foodHtml += `<div style="font-size:12px; color:var(--text-silver); margin-bottom:6px; line-height:1.35;">
            <span style="color:var(--text-main); font-family:'Roboto Mono'; font-weight:600; font-size:11px;">${displayMass}</span>
            <span style="color:var(--text-muted);"> </span>
            <span style="color:var(--text-main); font-weight:600;">${item.food._cleanName}</span>
        </div>`;
    });

    const mCals = Math.round((mPro * 4) + (mCarb * 4) + (mFat * 9));
    const waterL = mWaterMl / 1000;
    const targets = store.userConfig.targets || {};
    let costAim = 0;
    try {
        costAim = getPlannedDayCost({ tPro: dayPro, tCarb: dayCarb, forDate });
    } catch (e) { /* pantry may not be ready yet */ }
    if (!costAim || costAim <= 0) costAim = store.userConfig.budget || 0;

    // Recipe name is the hero label (matches recipe-click modal); meal slot is secondary
    if (titleEl) titleEl.textContent = displayName;
    if (subEl) subEl.textContent = mealTitle || '';

    macrosEl.innerHTML = [
        detailMetricRow('cals', 'Calories', mCals, targets.cals),
        detailMetricRow('pro', 'Protein', mPro, targets.pro),
        detailMetricRow('carb', 'Carbs', mCarb, targets.carb),
        detailMetricRow('fat', 'Fat', mFat, targets.fat),
        detailMetricRow('water', 'Hydration', waterL, DAILY_HYDRATION_TARGET_L),
        detailMetricRow('cost', 'Cost', mCost, costAim)
    ].join('');

    foodsEl.innerHTML = foodHtml || `<div style="font-size:12px; color:var(--text-muted);">No foods</div>`;
    const actionsEl = document.getElementById('meal-detail-actions');
    if (actionsEl) {
        actionsEl.classList.add('hidden');
        actionsEl.innerHTML = '';
    }
    window._loggedMealDetailId = null;
    window._loggedMealAllowEdit = false;
    sheet.classList.remove('hidden');
}

export function closeMealDetail() {
    document.getElementById('meal-detail-sheet')?.classList.add('hidden');
    const actions = document.getElementById('meal-detail-actions');
    if (actions) {
        actions.classList.add('hidden');
        actions.innerHTML = '';
    }
    window._loggedMealDetailId = null;
    window._loggedMealAllowEdit = false;
}

/**
 * Show a logged meal's quantities + Goals-style macro bars.
 * @param {string|number} logId
 * @param {{ allowEdit?: boolean }} [opts]
 */
export function openLoggedMealDetail(logId, opts = {}) {
    const allowEdit = !!opts.allowEdit;
    window._loggedMealDetailId = logId;
    window._loggedMealAllowEdit = allowEdit;

    let log = null;
    Object.values(store.globalGroupedHistory || {}).some(day => {
        const hit = (day.items || []).find(i => i.type === 'food' && String(i.id) === String(logId));
        if (hit) { log = hit; return true; }
        return false;
    });
    if (!log) return;

    const sheet = document.getElementById('meal-detail-sheet');
    const titleEl = document.getElementById('meal-detail-title');
    const subEl = document.getElementById('meal-detail-subtitle');
    const macrosEl = document.getElementById('meal-detail-macros');
    const foodsEl = document.getElementById('meal-detail-foods');
    const actionsEl = document.getElementById('meal-detail-actions');
    if (!sheet || !macrosEl || !foodsEl) return;

    const parsed = parseFoodLogDetails(log.food_details);
    const items = parsed.items || [];
    let mPro = 0, mCarb = 0, mFat = 0, mCost = 0, mWaterMl = Number(parsed.hydration_ml) || 0;
    let foodHtml = '';
    items.forEach((item, idx) => {
        if (!item?.food) return;
        const m = (Number(item.mass) || 0) / 100;
        mPro += (item.food.protein_per_100g || 0) * m;
        mCarb += (item.food.carbs_per_100g || 0) * m;
        mFat += (item.food.fat_per_100g || 0) * m;
        mCost += (item.food.price_per_100g || 0) * m;
        mWaterMl += estimateFoodWaterMl(item.food, item.mass);
        const name = item.food._cleanName || item.food.name || 'Food';
        const massVal = Math.round(Number(item.mass) || 0);
        if (allowEdit) {
            foodHtml += `<div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:8px;">
                <span style="font-size:12px; color:var(--text-main); font-weight:600; min-width:0;">${name}</span>
                <div style="display:flex; align-items:center; gap:4px; flex-shrink:0;">
                    <input type="number" class="input-field" style="width:64px; margin:0; padding:8px; text-align:right; font-family:'Roboto Mono'; color:var(--gold-accent);" value="${massVal}" onchange="editHistoryFoodMass(${log.id}, ${idx}, this.value)">
                    <span style="font-size:10px; color:var(--text-stealth);">g</span>
                </div>
            </div>`;
        } else {
            foodHtml += `<div style="font-size:12px; color:var(--text-silver); margin-bottom:6px; line-height:1.35;">
                <span style="color:var(--text-main); font-family:'Roboto Mono'; font-weight:600; font-size:11px;">${massVal}g</span>
                <span style="color:var(--text-muted);"> </span>
                <span style="color:var(--text-main); font-weight:600;">${name}</span>
            </div>`;
        }
    });

    const mCals = Math.round((mPro * 4) + (mCarb * 4) + (mFat * 9));
    const waterL = mWaterMl / 1000;
    const targets = store.userConfig.targets || {};
    const mealLabel = (log.meal_name || 'Meal');
    const prettyMeal = mealLabel.charAt(0).toUpperCase() + String(mealLabel).slice(1).toLowerCase();

    if (titleEl) titleEl.textContent = prettyMeal;
    if (subEl) subEl.textContent = allowEdit ? 'Tap quantities to edit' : 'Logged meal';

    macrosEl.innerHTML = [
        detailMetricRow('cals', 'Calories', mCals, targets.cals),
        detailMetricRow('pro', 'Protein', mPro, targets.pro),
        detailMetricRow('carb', 'Carbs', mCarb, targets.carb),
        detailMetricRow('fat', 'Fat', mFat, targets.fat),
        detailMetricRow('water', 'Hydration', waterL, DAILY_HYDRATION_TARGET_L),
        detailMetricRow('cost', 'Cost', mCost, store.userConfig.budget || 0)
    ].join('');

    foodsEl.innerHTML = foodHtml || `<div style="font-size:12px; color:var(--text-muted);">No foods</div>`;
    if (actionsEl) {
        actionsEl.classList.add('hidden');
        actionsEl.innerHTML = '';
    }
    sheet.classList.remove('hidden');
}

/** Today's food log under Fuel → Log (Weight / Sleep / Snack / Something else). */
export function generateDailyFoodLog() {
    const container = document.getElementById('daily-food-log');
    if (!container) return;

    const todayStr = new Date().toLocaleDateString();
    const day = store.globalGroupedHistory && store.globalGroupedHistory[todayStr];
    const foods = day ? day.items.filter(i => i.type === 'food') : [];

    if (!foods.length) {
        container.innerHTML = `<div style="font-size:12px; color:var(--text-muted); font-family:'Roboto Mono'; margin-bottom:24px; line-height:1.45;">Nothing logged yet</div>`;
        return;
    }

    const grouped = foods.reduce((acc, log) => {
        const key = (log.meal_name || 'OTHER').toUpperCase();
        if (!acc[key]) acc[key] = [];
        acc[key].push(log);
        return acc;
    }, {});

    const order = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'];
    const keys = [
        ...order.filter(k => grouped[k]),
        ...Object.keys(grouped).filter(k => !order.includes(k))
    ];

    let html = '';
    keys.forEach(mealKey => {
        const label = mealKey.charAt(0) + mealKey.slice(1).toLowerCase();
        html += `<div class="card" style="padding:16px; margin-bottom:12px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:1px solid var(--border-subtle); padding-bottom:6px;">
                <strong style="font-size:11px; color:var(--text-muted); font-family:'Roboto Mono'; letter-spacing:0.4px; text-transform:uppercase;">${label}</strong>
            </div>`;
        grouped[mealKey].forEach(log => {
            let itemNames = [];
            try {
                const items = parseFoodLogDetails(log.food_details).items || [];
                itemNames = items.map(it => it.food?._cleanName || it.food?.name).filter(Boolean);
            } catch (_) { /* ignore */ }

            const cals = Math.round(log.calories || 0);
            const detail = itemNames.length
                ? itemNames.slice(0, 4).join(', ') + (itemNames.length > 4 ? '…' : '')
                : `${cals} kcal`;
            html += `<button type="button" onclick="openLoggedMealDetail(${log.id})" style="display:flex; justify-content:space-between; align-items:flex-start; width:100%; font-size:13px; color:var(--text-silver); margin-bottom:8px; gap:10px; background:none; border:none; padding:0; text-align:left; cursor:pointer;">
                <span style="font-weight:600; color:var(--text-main); min-width:0; line-height:1.35;">${detail}</span>
                <span style="font-family:'Roboto Mono'; font-size:11px; color:var(--text-stealth); white-space:nowrap; flex-shrink:0;">${cals} kcal</span>
            </button>`;
        });
        html += `</div>`;
    });

    container.innerHTML = html;
}

// --- DAILY MINIMAL DASHBOARD GENERATOR ---
export function generateDailyMealPlan() {
    const container = document.getElementById('daily-meal-plan-dashboard');
    if (!container || !store.userConfig.targets || store.globalFoodDB.length === 0) return;

    if (isGuidanceOff('food')) {
        container.innerHTML = `<div class="card" style="padding:16px; text-align:center;">
            <div style="font-size:11px; color:var(--text-muted); font-family:'Roboto Mono'; text-transform:uppercase; letter-spacing:1px; margin-bottom:8px;">Food guidance off</div>
            <p style="font-size:12px; color:var(--text-silver); line-height:1.5; margin:0;">Recommendations are switched off in Tracker. Log meals manually when you want.</p>
        </div>`;
        return;
    }

    container.innerHTML = buildMealPlanCardsHtml({
        includeLog: true,
        headerHtml: ''
    });
}

export function getVisualPortion(mass, cat) {
    if (!store.userConfig.dependentAthlete) return Math.round(mass) + (cat === 'LIQUID' ? 'ml' : 'g');
    if (cat === 'PRO') return (mass / 100).toFixed(1) + ' Palms';
    if (cat === 'CARB') return (mass / 100).toFixed(1) + ' Fists';
    if (cat === 'FAT') return (mass / 30).toFixed(1) + ' Thumbs';
    if (cat === 'VEG_G' || cat === 'VEG_C') return '2 Handfuls';
    return (mass / 100).toFixed(1) + ' Portions';
}

export { getFlexibleRecipeById };

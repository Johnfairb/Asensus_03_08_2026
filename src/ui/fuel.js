import { store } from '../state/store.js';
import { generateDailyMealPlan } from '../domain/meal-planner.js';
import { STRENGTH_EXERCISE_META } from '../domain/strength-engine.js';
import {
    formatMuscleList,
    getExerciseMeta,
    getExerciseSessionLabel,
    resolveCatalogName
} from '../domain/exercise-catalog.js';
import { getLibraryMuscleGroup, LIBRARY_MUSCLE_ORDER } from '../domain/bodyweight-lifts.js';
import { generateGroceryList } from '../domain/grocery.js';
import {
  isExerciseBanned,
  isFoodBanned,
  toggleExerciseBan,
  toggleFoodBan,
} from '../domain/bans.js';
import { replaceBannedExerciseInLockedPlans } from '../domain/exercise-slots.js';
import {
  applyDietFilter,
  categoryToHeading,
  enrichFoodRow,
  ensureFoodCatalog,
  extractPackGFromText,
  extractPackUnitFromText,
  extractUnitCountFromText,
  FOOD_HEADING_ORDER,
  formatPackSizeLabel,
  headingToCategory,
  isUnitCountPackFood,
  isVolumePackUnit,
  openFoodHeadings,
  stripPackSizeFromName,
  updateFoodsPriceUpdateLabel,
} from '../domain/food-catalog.js';
import { defaultWaterPer100gForCategory } from '../lib/food-parse.js';
import { updateExerciseDropdowns, updateFoodDropdowns } from './templates.js';

function foodHasPrice(food) {
    return (Number(food?.price_per_100g) > 0) || (Number(food?._packPrice) > 0);
}

/** Keep custom foods, or official foods that have Cheap/Middle/Quality tier prices. */
function foodRespondsToShopStyle(food) {
    if (!food) return false;
    if (food.is_custom === true || food.source === 'user') return true;
    return food.price_cheap != null || food.price_middle != null || food.price_quality != null;
}

function buildHeadingGroupHtml(heading, foods, key) {
    const isOpen = openFoodHeadings.has(key);
    const safeHeading = String(heading).replace(/</g, '&lt;');
    return `
        <div class="food-heading-group" data-heading-key="${key}">
            <button type="button" class="food-heading-toggle accordion" onclick="toggleFoodHeading('${key}')" aria-expanded="${isOpen ? 'true' : 'false'}">
                <span class="food-heading-label">${safeHeading}</span>
                <span id="food-heading-chevron-${key}" class="food-heading-chevron">${isOpen ? '−' : '+'}</span>
            </button>
            <div id="food-heading-${key}" class="food-heading-panel${isOpen ? '' : ' hidden'}">
                ${foods.map(buildInventoryFoodRow).join('')}
            </div>
        </div>`;
}

let editingFoodPackUnit = null;

export function togglePantryForm() {
    const sheet = document.getElementById('pantry-form-container');
    if (!sheet) return;
    if (sheet.classList.contains('show')) cancelFoodEdit();
    else {
        const idEl = document.getElementById('edit-food-id');
        if (idEl) idEl.value = '';
        document.querySelectorAll('#pantry-form-container input').forEach(i => {
            if (i.id !== 'edit-food-id') i.value = '';
        });
        editingFoodPackUnit = null;
        setPackSizeFieldMode(false);
        const btn = document.getElementById('btn-save-food');
        if (btn) btn.innerText = 'Save';
        const title = document.getElementById('pantry-form-title');
        if (title) title.textContent = 'Add food';
        openPantrySheet();
    }
}

/** Mount overlays inside the phone glass so fixed positioning stays on-screen. */
function mountInPhoneGlass(el) {
    if (!el) return;
    const glass = document.querySelector('.iphone-screen') || document.body;
    if (el.parentElement !== glass) glass.appendChild(el);
}

export function openPantrySheet() {
    const sheet = document.getElementById('pantry-form-container');
    if (!sheet) {
        console.error('pantry-form-container missing');
        return;
    }
    mountInPhoneGlass(sheet);

    if (window._pantryHideTimer) {
        clearTimeout(window._pantryHideTimer);
        window._pantryHideTimer = null;
    }

    let backdrop = document.getElementById('pantry-form-backdrop');
    if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.id = 'pantry-form-backdrop';
        backdrop.setAttribute('aria-hidden', 'true');
        backdrop.addEventListener('click', () => cancelFoodEdit());
        mountInPhoneGlass(backdrop);
    } else {
        mountInPhoneGlass(backdrop);
    }
    backdrop.style.cssText = 'position:fixed;inset:0;background:transparent;z-index:19999;display:block;';

    sheet.classList.remove('hidden');
    sheet.classList.add('show');
    // Clear conflicting inline sizing — CSS owns phone-fit layout
    ['left', 'right', 'width', 'max-width', 'transform', 'bottom', 'margin'].forEach(p => sheet.style.removeProperty(p));
    sheet.style.setProperty('position', 'fixed', 'important');
    sheet.style.setProperty('z-index', '20000', 'important');
    sheet.style.setProperty('display', 'flex', 'important');
    sheet.style.setProperty('visibility', 'visible', 'important');
    sheet.style.setProperty('opacity', '1', 'important');
    sheet.style.setProperty('pointer-events', 'auto', 'important');
}

function setMacroFieldLabels(isVolume) {
    const suffix = isVolume ? '100ml' : '100g';
    const pro = document.getElementById('food-pro-label');
    const carb = document.getElementById('food-carb-label');
    const fat = document.getElementById('food-fat-label');
    const water = document.getElementById('food-water-label');
    if (pro) pro.textContent = `Pro/${suffix}`;
    if (carb) carb.textContent = `Carb/${suffix}`;
    if (fat) fat.textContent = `Fat/${suffix}`;
    if (water) water.textContent = `Water/${suffix}`;
}

function setPackSizeFieldMode(isUnits, packUnit) {
    const label = document.getElementById('food-pack-size-label');
    const input = document.getElementById('food-total-weight');
    if (isUnits) {
        if (label) label.textContent = 'Pack size (items)';
        if (input) input.placeholder = 'e.g. 6';
        setMacroFieldLabels(false);
        return;
    }
    const unit = packUnit || 'g';
    if (unit === 'ml') {
        if (label) label.textContent = 'Pack Size (ml)';
        if (input) input.placeholder = 'e.g. 500';
    } else if (unit === 'l') {
        if (label) label.textContent = 'Pack Size (litres)';
        if (input) input.placeholder = 'e.g. 1';
    } else {
        if (label) label.textContent = 'Pack Size (g)';
        if (input) input.placeholder = 'e.g. 500';
    }
    setMacroFieldLabels(isVolumePackUnit(unit));
}

export function syncPackSizeFieldMode() {
    const nameEl = document.getElementById('food-name');
    const name = nameEl ? nameEl.value : '';
    if (isUnitCountPackFood(name)) {
        setPackSizeFieldMode(true);
        return;
    }
    setPackSizeFieldMode(false, extractPackUnitFromText(name) || 'g');
}

export function editFood(id) {
    const food = store.globalFoodDB.find(f => String(f.id) === String(id));
    if (!food) {
        console.warn('editFood: item not found', id, 'db size', store.globalFoodDB.length);
        alert('Could not find that food item. Try refreshing My Foods.');
        return;
    }
    const idEl = document.getElementById('edit-food-id');
    const nameEl = document.getElementById('food-name');
    if (!idEl || !nameEl) {
        alert('Food editor fields missing — hard-refresh the app.');
        return;
    }
    idEl.value = food.id;
    // Popup may show full pack detail in name field if present in raw label
    nameEl.value = food._rawLabel || food._cleanName || '';
    const catDropdown = document.getElementById('food-category');
    const heading = food._heading || categoryToHeading(food._category);
    if (catDropdown && [...catDropdown.options].some(o => o.value === heading)) {
        catDropdown.value = heading;
    }
    const weightEl = document.getElementById('food-total-weight');
    const priceEl = document.getElementById('food-total-price');
    const proEl = document.getElementById('food-pro');
    const carbEl = document.getElementById('food-carb');
    const fatEl = document.getElementById('food-fat');
    const waterEl = document.getElementById('food-water');
    const isUnits = isUnitCountPackFood(food);
    const packUnit = food._packUnit || extractPackUnitFromText(food._rawLabel || '') || 'g';
    editingFoodPackUnit = isUnits ? null : packUnit;
    setPackSizeFieldMode(isUnits, packUnit);
    if (weightEl) {
        if (isUnits) {
            weightEl.value = food._unit_count || extractUnitCountFromText(food._rawLabel || '') || '';
        } else if (food._pack_g > 0) {
            weightEl.value = packUnit === 'l' ? (food._pack_g / 1000) : food._pack_g;
        } else {
            weightEl.value = 100;
        }
    }
    if (priceEl) {
        if (food._packPrice != null) {
            priceEl.value = food._packPrice;
        } else if (isUnits && Number.isFinite(Number(food.price_per_100g))) {
            priceEl.value = food.price_per_100g;
        } else if (Number.isFinite(Number(food.price_per_100g)) && food._pack_g > 0) {
            priceEl.value = Math.round((food.price_per_100g * food._pack_g / 100) * 100) / 100;
        } else {
            priceEl.value = '';
        }
    }
    if (proEl) proEl.value = food.protein_per_100g ?? '';
    if (carbEl) carbEl.value = food.carbs_per_100g ?? '';
    if (fatEl) fatEl.value = food.fat_per_100g ?? '';
    if (waterEl) waterEl.value = food.water_per_100g ?? '';
    const btn = document.getElementById('btn-save-food');
    if (btn) btn.innerText = 'Update Item';
    const title = document.getElementById('pantry-form-title');
    if (title) title.textContent = 'Edit food';
    openPantrySheet();
    setTimeout(() => {
        try { nameEl.focus({ preventScroll: true }); } catch (_) { nameEl.focus(); }
    }, 80);
}

export function cancelFoodEdit() {
    const idEl = document.getElementById('edit-food-id');
    if (idEl) idEl.value = '';
    editingFoodPackUnit = null;
    document.querySelectorAll('#pantry-form-container input').forEach(i => {
        if (i.id !== 'edit-food-id') i.value = '';
    });
    setPackSizeFieldMode(false);
    const btn = document.getElementById('btn-save-food');
    if (btn) btn.innerText = 'Save';
    const title = document.getElementById('pantry-form-title');
    if (title) title.textContent = 'Add food';
    const sheet = document.getElementById('pantry-form-container');
    if (sheet) {
        sheet.classList.remove('show');
        sheet.style.removeProperty('display');
        sheet.style.removeProperty('transform');
        sheet.style.removeProperty('visibility');
        sheet.style.removeProperty('opacity');
        sheet.style.removeProperty('pointer-events');
        sheet.style.removeProperty('z-index');
        sheet.style.removeProperty('position');
        sheet.style.removeProperty('bottom');
        sheet.style.removeProperty('left');
        sheet.style.removeProperty('right');
        sheet.style.removeProperty('margin');
        sheet.style.removeProperty('width');
        sheet.style.removeProperty('max-width');
        if (window._pantryHideTimer) clearTimeout(window._pantryHideTimer);
        window._pantryHideTimer = setTimeout(() => sheet.classList.add('hidden'), 280);
    }
    const backdrop = document.getElementById('pantry-form-backdrop');
    if (backdrop) backdrop.style.display = 'none';
}

export function toggleExForm() {
    const sheet = document.getElementById('ex-form-container');
    if (!sheet) return;
    if (sheet.classList.contains('show')) cancelExEdit();
    else {
        mountInPhoneGlass(sheet);
        document.getElementById('edit-ex-id').value = '';
        document.getElementById('ex-name').value = '';
        const title = document.getElementById('ex-form-title');
        if (title) title.textContent = 'Add exercise';
        const btn = document.getElementById('btn-save-ex');
        if (btn) btn.innerText = 'Save Exercise';
        ['left', 'right', 'width', 'max-width', 'transform', 'bottom', 'margin'].forEach(p => sheet.style.removeProperty(p));
        sheet.style.setProperty('position', 'fixed', 'important');
        sheet.style.setProperty('z-index', '20000', 'important');
        sheet.style.setProperty('display', 'flex', 'important');
        sheet.classList.remove('hidden');
        void sheet.offsetHeight;
        sheet.classList.add('show');
    }
}

export function filterBoot(type) {
    const term = document.getElementById(`search-${type}`).value.toLowerCase().trim();
    const listId = type === 'food' ? 'inventory-list' : 'exercise-list';
    const list = document.getElementById(listId);
    if (!list) return;

    if (type !== 'food') {
        list.querySelectorAll(':scope > div').forEach(row => {
            row.style.display = row.innerText.toLowerCase().includes(term) ? '' : 'none';
        });
        return;
    }

    list.querySelectorAll('.food-heading-group').forEach(group => {
        const rows = group.querySelectorAll('.inventory-row');
        let anyMatch = false;
        rows.forEach(row => {
            const match = !term || row.innerText.toLowerCase().includes(term);
            row.style.display = match ? '' : 'none';
            if (match) anyMatch = true;
        });
        group.style.display = anyMatch ? '' : 'none';
        const panel = group.querySelector('.food-heading-panel');
        const chevron = group.querySelector('.food-heading-chevron');
        const key = group.getAttribute('data-heading-key');
        if (!panel) return;
        if (term) {
            panel.classList.remove('hidden');
            if (chevron) chevron.textContent = '−';
        } else if (key) {
            const open = openFoodHeadings.has(key);
            panel.classList.toggle('hidden', !open);
            if (chevron) chevron.textContent = open ? '−' : '+';
        }
    });
}

export async function saveFoodToCloud() {
    const editId = document.getElementById('edit-food-id').value;
    const rawName = document.getElementById('food-name').value;
    const heading = document.getElementById('food-category').value || 'Carbs';
    const cat = headingToCategory(heading);
    let tPrice = parseFloat(document.getElementById('food-total-price').value);
    let tSize = parseFloat(document.getElementById('food-total-weight').value);
    const pro = parseFloat(document.getElementById('food-pro').value) || 0;
    const carb = parseFloat(document.getElementById('food-carb').value) || 0;
    const fat = parseFloat(document.getElementById('food-fat').value) || 0;
    const waterRaw = document.getElementById('food-water')?.value;
    const waterParsed = parseFloat(waterRaw);
    const water = (waterRaw !== '' && Number.isFinite(waterParsed))
        ? Math.max(0, Math.min(100, waterParsed))
        : defaultWaterPer100gForCategory(cat);

    if (!rawName) return alert('Please enter an item name.');

    let cleanName = stripPackSizeFromName(rawName);
    if (!cleanName) cleanName = rawName.trim();

    const namedUnits = extractUnitCountFromText(rawName);
    const namedGrams = extractPackGFromText(rawName);
    const namedPackUnit = extractPackUnitFromText(rawName);
    const isUnits = (namedUnits > 0 && !(namedGrams > 0)) || isUnitCountPackFood(rawName);
    let packUnit = namedPackUnit || editingFoodPackUnit || 'g';

    let unitCount = null;
    let packG = null;
    if (isUnits) {
        unitCount = (tSize > 0 ? Math.round(tSize) : null) || namedUnits || 1;
        packUnit = null;
    } else {
        let size = (tSize > 0 ? tSize : null) || namedGrams || 100;
        if (packUnit === 'l' && size > 0 && size < 100) size = size * 1000;
        if (packUnit === 'l' && namedPackUnit === 'l' && namedGrams && !(tSize > 0)) size = namedGrams;
        packG = size;
    }

    let price100g = 0;
    if (isUnits) {
        if (isNaN(tPrice) || tPrice <= 0) {
            const est = { 'PRO': 0.85, 'CARB': 0.15, 'FAT': 0.65, 'VEG_G': 0.30, 'VEG_C': 0.30, 'LIQUID': 0.12 };
            price100g = est[cat] || 0.50;
            tPrice = price100g;
        } else {
            price100g = tPrice;
        }
    } else if (isNaN(tPrice) || tPrice <= 0) {
        const est = { 'PRO': 0.85, 'CARB': 0.15, 'FAT': 0.65, 'VEG_G': 0.30, 'VEG_C': 0.30, 'LIQUID': 0.12 };
        price100g = est[cat] || 0.50;
        tPrice = Math.round((price100g * packG / 100) * 100) / 100;
    } else {
        price100g = Math.round(((tPrice / packG) * 100) * 100) / 100;
    }

    const fullName = `[${cat}] ${cleanName}`;
    const existing = editId
        ? store.globalFoodDB.find(f => String(f.id) === String(editId))
        : null;
    const keepOfficial = existing && existing.is_custom !== true && existing.source !== 'user';

    const payload = {
        name: fullName,
        price_per_100g: price100g,
        protein_per_100g: pro,
        carbs_per_100g: carb,
        fat_per_100g: fat,
        water_per_100g: water,
        heading,
        pack_g: isUnits ? null : packG,
        pack_unit: isUnits ? null : packUnit,
        unit_count: isUnits ? unitCount : null,
        pack_price: tPrice,
        is_custom: keepOfficial ? false : true,
        source: keepOfficial ? 'seed' : 'user'
    };
    if (!editId) payload.stock_g = 0;

    let error;
    if (editId) {
        error = (await store.supabaseClient.from('food_inventory').update(payload).eq('id', editId)).error;
    } else {
        const res = await store.supabaseClient.from('food_inventory').insert([payload]).select('id').single();
        error = res.error;
    }

    if (error) alert('Error saving item to pantry.');
    else { cancelFoodEdit(); loadInventory(); }
}

function buildInventoryFoodRow(food) {
    const idAttr = String(food.id)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;');
    const packPrice = Number(food._packPrice);
    const price100 = Number(food.price_per_100g);
    const priceLabel = Number.isFinite(packPrice)
        ? `£${packPrice.toFixed(2)}`
        : (Number.isFinite(price100) ? `£${price100.toFixed(2)}` : '£—');
    let macroLabel;
    if (food._macroUnit === '100ml' || isVolumePackUnit(food._packUnit)) {
        macroLabel = `P:${food.protein_per_100g} C:${food.carbs_per_100g} F:${food.fat_per_100g} / 100ml`;
    } else if (food.protein_pack != null && food.carbs_pack != null && food.fat_pack != null) {
        const unitLabel = food._macroUnit === 'item' ? 'item' : 'pack';
        macroLabel = `P:${food.protein_pack} C:${food.carbs_pack} F:${food.fat_pack} / ${unitLabel}`;
    } else {
        macroLabel = `P:${food.protein_per_100g} C:${food.carbs_per_100g} F:${food.fat_per_100g} / 100g`;
    }
    const packSizeLine = formatPackSizeLabel(food);
    const safeName = String(food._cleanName || '').replace(/</g, '&lt;');
    const banned = isFoodBanned(food.id);
    return `
        <div class="inventory-row${banned ? ' is-banned' : ''}" data-food-id="${idAttr}" style="cursor:pointer;">
            <div class="inventory-main">
                <div style="font-size:12px; color:var(--text-main); font-weight:600; margin-bottom:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${safeName}</div>
                <div style="color:var(--text-muted); text-transform:uppercase; font-size:9px; font-family:'Roboto Mono'; letter-spacing:0.5px;">${macroLabel}</div>
                ${packSizeLine ? `<div style="color:var(--text-stealth); text-transform:uppercase; font-size:9px; font-family:'Roboto Mono'; letter-spacing:0.5px; margin-top:2px;">${packSizeLine}</div>` : ''}
            </div>
            <div class="inventory-actions">
                <span style="color:var(--text-silver); font-weight:600; font-family:'Roboto Mono'; font-size:12px; margin-right:2px; pointer-events:none;">${priceLabel}</span>
                <button type="button" class="btn-ban-item${banned ? ' is-banned' : ''}" data-food-id="${idAttr}" title="${banned ? 'Unban food' : 'Ban food'}" aria-label="${banned ? 'Unban food' : 'Ban food'}">${banned ? 'Unban' : 'Ban'}</button>
                <button type="button" class="btn-edit-food" data-food-id="${idAttr}" title="Edit food" aria-label="Edit food" style="background:rgba(255,255,255,0.04); color:var(--text-main); border:1px solid var(--border-highlight); border-radius:8px; font-size:14px; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; width:32px; height:32px; flex-shrink:0; -webkit-tap-highlight-color:transparent;">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
            </div>
        </div>`;
}

let _libraryDetailKind = null;
let _libraryDetailId = null;

function libraryDetailRow(label, value) {
    return `<div class="detail-metric-row">
        <div style="display:flex; justify-content:space-between; gap:12px;">
            <span class="hud-label" style="margin:0;">${label}</span>
            <span style="font-family:'Roboto Mono'; font-size:11px; color:var(--text-silver); text-align:right;">${value}</span>
        </div>
    </div>`;
}

export function closeLibraryDetail() {
    document.getElementById('library-detail-sheet')?.classList.add('hidden');
    _libraryDetailKind = null;
    _libraryDetailId = null;
}

function syncLibraryBanButton() {
    const btn = document.getElementById('library-detail-ban-btn');
    if (!btn || !_libraryDetailId) return;
    const banned = _libraryDetailKind === 'exercise'
        ? isExerciseBanned(_libraryDetailId)
        : isFoodBanned(_libraryDetailId);
    btn.textContent = banned ? 'Unban' : 'Ban';
    btn.style.borderColor = banned ? 'var(--gold-accent)' : 'rgba(255,59,48,0.45)';
    btn.style.color = banned ? 'var(--gold-accent)' : '#FF3B30';
}

export function openFoodDetail(id) {
    const food = store.globalFoodDB.find(f => String(f.id) === String(id));
    if (!food) return;
    _libraryDetailKind = 'food';
    _libraryDetailId = String(id);
    const pro = Number(food.protein_per_100g) || 0;
    const carb = Number(food.carbs_per_100g) || 0;
    const fat = Number(food.fat_per_100g) || 0;
    const water = food.water_per_100g != null && food.water_per_100g !== ''
        ? Number(food.water_per_100g)
        : defaultWaterPer100gForCategory(food._category || 'MISC');
    const cals = Math.round((pro * 4) + (carb * 4) + (fat * 9));
    const packPrice = food._packPrice != null ? `£${Number(food._packPrice).toFixed(2)}` : null;
    const price = food.price_per_100g != null ? `£${Number(food.price_per_100g).toFixed(2)}` : '—';
    const unit = food._macroUnit === '100ml' ? '100ml' : '100g';
    document.getElementById('library-detail-title').textContent = food._cleanName || 'Food';
    document.getElementById('library-detail-subtitle').textContent = food._heading
        ? `${food._heading}${food._rawLabel ? ` · ${food._rawLabel}` : ''}`
        : (food._category ? `Per 100g · ${food._category}` : 'Per 100g');
    document.getElementById('library-detail-body').innerHTML = [
        libraryDetailRow('Calories', `${cals} kcal`),
        libraryDetailRow('Protein', `${pro} g`),
        libraryDetailRow('Carbs', `${carb} g`),
        libraryDetailRow('Fat', `${fat} g`),
        libraryDetailRow('Water', `${Number.isFinite(water) ? water : 0} g / ${unit}`),
        libraryDetailRow('Price', packPrice ? `${packPrice} / pack` : `${price} / 100g`),
        formatPackSizeLabel(food) ? libraryDetailRow('Pack', formatPackSizeLabel(food)) : '',
        libraryDetailRow('Status', isFoodBanned(id) ? 'Banned' : 'Allowed'),
    ].filter(Boolean).join('');
    syncLibraryBanButton();
    const editBtn = document.getElementById('library-detail-edit-btn');
    if (editBtn) editBtn.classList.remove('hidden');
    document.getElementById('library-detail-sheet')?.classList.remove('hidden');
}

export function openExerciseDetail(id) {
    const ex = store.globalExerciseDB.find(e => String(e.id) === String(id));
    if (!ex) return;
    _libraryDetailKind = 'exercise';
    _libraryDetailId = String(id);

    const catalog = getExerciseMeta(ex.name);
    const displayName = catalog?.name || resolveCatalogName(ex.name) || ex.name;
    const sessionLabel = getExerciseSessionLabel(displayName);
    const primary = formatMuscleList(catalog?.primary);
    const secondary = formatMuscleList(catalog?.secondary);

    document.getElementById('library-detail-title').textContent = displayName || 'Exercise';
    document.getElementById('library-detail-subtitle').textContent = sessionLabel
        ? sessionLabel
        : (ex.domain === 'cardio' ? 'Cardio' : ex.domain === 'power' ? 'Power' : 'Library exercise');

    const videoPlaceholder = (label) => `
        <div style="margin-top:8px; border:1px dashed var(--border-highlight); border-radius:10px; background:var(--bg-surface-elevated); min-height:120px; display:flex; align-items:center; justify-content:center; color:var(--text-stealth); font-family:'Roboto Mono'; font-size:10px; letter-spacing:0.4px; text-transform:uppercase;">
            ${label}
        </div>`;

    const teachingPoints = [1, 2, 3].map((n) => `
        <button type="button" class="detail-metric-row" style="width:100%; text-align:left; cursor:pointer; background:transparent; border:1px solid var(--border-subtle); border-radius:10px; padding:12px; color:inherit;" onclick="this.nextElementSibling?.classList.toggle('hidden')">
            <div style="display:flex; justify-content:space-between; gap:12px; align-items:center;">
                <span class="hud-label" style="margin:0;">Teaching point ${n}</span>
                <span style="font-family:'Roboto Mono'; font-size:10px; color:var(--text-stealth);">Video</span>
            </div>
        </button>
        <div class="hidden" style="margin:-2px 0 8px 0;">${videoPlaceholder('Teaching point video placeholder')}</div>
    `).join('');

    const bodyParts = [];
    if (catalog) {
        bodyParts.push(`
            <div class="detail-metric-row">
                <div class="hud-label" style="margin:0 0 6px 0;">Primary muscle groups</div>
                <div style="font-family:'Roboto Mono'; font-size:12px; color:var(--text-main); line-height:1.45;">${primary}</div>
            </div>`);
        bodyParts.push(`
            <div class="detail-metric-row">
                <div class="hud-label" style="margin:0 0 6px 0;">Secondary muscle groups</div>
                <div style="font-family:'Roboto Mono'; font-size:12px; color:var(--text-silver); line-height:1.45;">${secondary}</div>
            </div>`);
        bodyParts.push(`
            <div class="detail-metric-row">
                <div class="hud-label" style="margin:0 0 6px 0;">Form video</div>
                ${videoPlaceholder('Form video placeholder')}
            </div>`);
        bodyParts.push(`
            <div class="detail-metric-row">
                <div class="hud-label" style="margin:0 0 8px 0;">Teaching points</div>
                <div style="display:flex; flex-direction:column; gap:8px;">${teachingPoints}</div>
            </div>`);
        bodyParts.push(libraryDetailRow('Status', isExerciseBanned(id) ? 'Banned' : 'Allowed'));
    } else {
        bodyParts.push(libraryDetailRow('Status', isExerciseBanned(id) ? 'Banned' : 'Allowed'));
    }

    document.getElementById('library-detail-body').innerHTML = bodyParts.join('');
    syncLibraryBanButton();
    const editBtn = document.getElementById('library-detail-edit-btn');
    if (editBtn) editBtn.classList.add('hidden');
    document.getElementById('library-detail-sheet')?.classList.remove('hidden');
}

export function editFromLibraryDetail() {
    const kind = _libraryDetailKind;
    const id = _libraryDetailId;
    closeLibraryDetail();
    if (!id) return;
    if (kind === 'food') editFood(id);
    // Exercises are not editable from the library
}

export function toggleBanFromLibraryDetail() {
    const kind = _libraryDetailKind;
    const id = _libraryDetailId;
    if (!id) return;
    if (kind === 'food') {
        toggleFoodBan(id);
        loadInventory();
        openFoodDetail(id);
    } else if (kind === 'exercise') {
        const wasBanned = isExerciseBanned(id);
        const nextBanned = toggleExerciseBan(id);
        if (!wasBanned && nextBanned) {
            const ex = (store.globalExerciseDB || []).find(e => String(e.id) === String(id));
            replaceBannedExerciseInLockedPlans(id, ex?.name);
        }
        loadExercises();
        openExerciseDetail(id);
    }
}

export async function loadInventory() {
    await ensureFoodCatalog();
    const { data, error } = await store.supabaseClient.from('food_inventory').select('*');
    if (error || !data) return;

    store.globalFoodDB = data
        .map(enrichFoodRow)
        .filter(Boolean)
        .filter(f => applyDietFilter([f]).length > 0)
        .filter(foodHasPrice)
        .filter(foodRespondsToShopStyle);

    if (typeof updateFoodDropdowns === 'function') updateFoodDropdowns();
    updateFoodsPriceUpdateLabel();

    const activeFoods = [];
    const bannedFoods = [];
    store.globalFoodDB.forEach(food => {
        if (isFoodBanned(food.id)) bannedFoods.push(food);
        else activeFoods.push(food);
    });

    const grouped = new Map();
    activeFoods.forEach(food => {
        const heading = food._heading || 'Other';
        if (!grouped.has(heading)) grouped.set(heading, []);
        grouped.get(heading).push(food);
    });

    const orderedHeadings = [
        ...FOOD_HEADING_ORDER.filter(h => grouped.has(h) && (grouped.get(h) || []).length > 0),
        ...[...grouped.keys()].filter(h => !FOOD_HEADING_ORDER.includes(h) && (grouped.get(h) || []).length > 0)
    ];

    let html = '';
    orderedHeadings.forEach((heading, idx) => {
        html += buildHeadingGroupHtml(heading, grouped.get(heading) || [], String(idx));
    });
    if (bannedFoods.length) {
        bannedFoods.sort((a, b) => String(a._cleanName || '').localeCompare(String(b._cleanName || '')));
        html += buildHeadingGroupHtml('Banned', bannedFoods, 'banned');
    }

    const list = document.getElementById('inventory-list');
    if (list) {
        list.innerHTML = html;
        if (!list._foodActionsBound) {
            list._foodActionsBound = true;
            list.addEventListener('click', (e) => {
                const editBtn = e.target.closest('.btn-edit-food');
                const banBtn = e.target.closest('.btn-ban-item');
                const row = e.target.closest('.inventory-row[data-food-id]');
                if (editBtn || banBtn) {
                    e.preventDefault();
                    e.stopPropagation();
                    const id = (editBtn || banBtn).getAttribute('data-food-id');
                    if (id == null || id === '') return;
                    if (banBtn) {
                        toggleFoodBan(id);
                        loadInventory();
                        return;
                    }
                    editFood(id);
                    return;
                }
                if (row) {
                    const id = row.getAttribute('data-food-id');
                    if (id != null && id !== '') openFoodDetail(id);
                }
            });
        }
        const searchEl = document.getElementById('search-food');
        if (searchEl && searchEl.value.trim()) filterBoot('food');
    }
    generateDailyMealPlan();
    if (typeof generateGroceryList === 'function') generateGroceryList();
}

export async function saveExerciseToCloud() {
    const editId = document.getElementById('edit-ex-id').value;
    const name = document.getElementById('ex-name').value;
    const domain = document.getElementById('ex-domain').value;
    const muscle = document.getElementById('ex-muscle').value;

    if(!name) return alert("Enter exercise name");

    const payload = { name, domain, muscle_group: muscle };
    let error;
    if (editId) error = (await store.supabaseClient.from('exercise_inventory').update(payload).eq('id', editId)).error;
    else error = (await store.supabaseClient.from('exercise_inventory').insert([payload])).error;
    
    if (error) alert("Error saving exercise.");
    else { cancelExEdit(); loadExercises(); }
}

export function editExercise(id) {
    const ex = store.globalExerciseDB.find(e => String(e.id) === String(id));
    if (!ex) return;
    const sheet = document.getElementById('ex-form-container');
    if (!sheet) return;
    mountInPhoneGlass(sheet);
    ['left', 'right', 'width', 'max-width', 'transform', 'bottom', 'margin'].forEach(p => sheet.style.removeProperty(p));
    sheet.style.setProperty('position', 'fixed', 'important');
    sheet.style.setProperty('z-index', '20000', 'important');
    sheet.style.setProperty('display', 'flex', 'important');
    sheet.classList.remove('hidden');
    void sheet.offsetHeight;
    sheet.classList.add('show');
    
    document.getElementById('edit-ex-id').value = ex.id;
    document.getElementById('ex-name').value = ex.name;
    const domainDrop = document.getElementById('ex-domain');
    if ([...domainDrop.options].some(o => o.value === ex.domain)) domainDrop.value = ex.domain;
    const muscleDrop = document.getElementById('ex-muscle');
    if ([...muscleDrop.options].some(o => o.value === ex.muscle_group)) muscleDrop.value = ex.muscle_group;

    document.getElementById('btn-save-ex').innerText = "Update Exercise";
    const title = document.getElementById('ex-form-title');
    if (title) title.textContent = 'Edit exercise';
}

export function cancelExEdit() {
    document.getElementById('edit-ex-id').value = '';
    document.getElementById('ex-name').value = '';
    document.getElementById('btn-save-ex').innerText = "Save Exercise";
    const title = document.getElementById('ex-form-title');
    if (title) title.textContent = 'Add exercise';
    const sheet = document.getElementById('ex-form-container');
    if (!sheet) return;
    sheet.classList.remove('show');
    sheet.style.removeProperty('display');
    setTimeout(() => sheet.classList.add('hidden'), 300);
}

export async function loadExercises() {
    const { data, error } = await store.supabaseClient.from('exercise_inventory').select('*');
    if (error || !data) return;

    const norm = (n) => String(n || '').trim().toLowerCase().replace(/\s+/g, ' ');
    /** Collapse aliases (e.g. Dips → Dip) so My Exercises / dropdowns show one row. */
    const canonicalName = (name) => {
        const meta = getExerciseMeta(name);
        if (meta?.name) return meta.name;
        return resolveCatalogName(name) || name;
    };
    const preferScore = (ex) => {
        let s = 0;
        const canon = canonicalName(ex.name);
        if (ex.name === canon) s += 5;
        if (STRENGTH_EXERCISE_META[ex.name]) s += 2;
        if (getExerciseMeta(ex.name)) s += 2;
        if (ex.domain === 'strength') s += 1;
        return s;
    };
    const byCanon = {};
    data.forEach(ex => {
        const key = norm(canonicalName(ex.name));
        if (!byCanon[key] || preferScore(ex) > preferScore(byCanon[key]) ||
            (preferScore(ex) === preferScore(byCanon[key]) && ex.id < byCanon[key].id)) {
            byCanon[key] = ex;
        }
    });
    const unique = Object.values(byCanon);
    store.globalExerciseDB = unique;
    if (typeof updateExerciseDropdowns === "function") updateExerciseDropdowns();

    /** My Exercises: PDF catalog (+ core) and non-lifting (power / cardio) only. */
    const isMyExercisesVisible = (ex) => {
        if (getExerciseMeta(ex.name) || resolveCatalogName(ex.name)) return true;
        const domain = String(ex.domain || '').toLowerCase();
        return domain === 'power' || domain === 'cardio';
    };

    const strengthOrder = Object.keys(STRENGTH_EXERCISE_META);
    const usedIds = new Set();
    const usedCanon = new Set();
    const strengthRows = [];
    strengthOrder.forEach(name => {
        const row = unique.find(ex => norm(canonicalName(ex.name)) === norm(name));
        if (!row || usedIds.has(row.id)) return;
        const canon = norm(canonicalName(row.name));
        if (usedCanon.has(canon) || !isMyExercisesVisible(row)) return;
        strengthRows.push(row);
        usedIds.add(row.id);
        usedCanon.add(canon);
    });
    const otherRows = unique
        .filter(ex => {
            if (usedIds.has(ex.id) || !isMyExercisesVisible(ex)) return false;
            const canon = norm(canonicalName(ex.name));
            if (usedCanon.has(canon)) return false;
            usedCanon.add(canon);
            return true;
        })
        .sort((a, b) => String(canonicalName(a.name)).localeCompare(String(canonicalName(b.name))));

    const buildExerciseRow = (ex) => {
        const catalog = getExerciseMeta(ex.name);
        const displayName = catalog?.name || resolveCatalogName(ex.name) || ex.name;
        const idAttr = String(ex.id)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;');
        const safeName = String(displayName || '').replace(/</g, '&lt;');
        const banned = isExerciseBanned(ex.id);
        return `
        <div class="inventory-row${banned ? ' is-banned' : ''}" data-exercise-id="${idAttr}" style="cursor:pointer;">
            <div class="inventory-main">
                <div style="font-size:12px; color:var(--text-main); font-weight:600; margin-bottom:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${safeName}</div>
            </div>
            <div class="inventory-actions">
                <button type="button" class="btn-ban-item${banned ? ' is-banned' : ''}" data-exercise-id="${idAttr}" title="${banned ? 'Unban exercise' : 'Ban exercise'}" aria-label="${banned ? 'Unban exercise' : 'Ban exercise'}">${banned ? 'Unban' : 'Ban'}</button>
            </div>
        </div>`;
    };

    const headingForExercise = (ex) => {
        const displayName = getExerciseMeta(ex.name)?.name || resolveCatalogName(ex.name) || ex.name;
        const muscle = getLibraryMuscleGroup(displayName);
        if (muscle) return muscle;
        const domain = String(ex.domain || '').toLowerCase();
        if (domain === 'power') return 'Power';
        if (domain === 'cardio') return 'Cardio';
        return 'Other';
    };

    const activeExercises = [...strengthRows, ...otherRows].filter(ex => !isExerciseBanned(ex.id));
    const bannedExercises = [...strengthRows, ...otherRows]
        .filter(ex => isExerciseBanned(ex.id))
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

    const grouped = new Map();
    activeExercises.forEach(ex => {
        const heading = headingForExercise(ex);
        if (!grouped.has(heading)) grouped.set(heading, []);
        grouped.get(heading).push(ex);
    });
    grouped.forEach(list => list.sort((a, b) => {
        const an = getExerciseMeta(a.name)?.name || a.name || '';
        const bn = getExerciseMeta(b.name)?.name || b.name || '';
        return String(an).localeCompare(String(bn));
    }));

    const EXERCISE_HEADING_ORDER = [...LIBRARY_MUSCLE_ORDER, 'Power', 'Cardio', 'Other'];
    const orderedHeadings = [
        ...EXERCISE_HEADING_ORDER.filter(h => (grouped.get(h) || []).length > 0),
        ...[...grouped.keys()].filter(h => !EXERCISE_HEADING_ORDER.includes(h))
    ];

    const buildExerciseHeadingHtml = (heading, rows, key) => {
        const isOpen = openFoodHeadings.has(key);
        const safeHeading = String(heading).replace(/</g, '&lt;');
        return `
        <div class="food-heading-group" data-heading-key="${key}">
            <button type="button" class="food-heading-toggle accordion" onclick="toggleFoodHeading('${key}')" aria-expanded="${isOpen ? 'true' : 'false'}">
                <span class="food-heading-label">${safeHeading}</span>
                <span id="food-heading-chevron-${key}" class="food-heading-chevron">${isOpen ? '−' : '+'}</span>
            </button>
            <div id="food-heading-${key}" class="food-heading-panel${isOpen ? '' : ' hidden'}">
                ${rows.map(buildExerciseRow).join('')}
            </div>
        </div>`;
    };

    let html = orderedHeadings.map((heading, idx) =>
        buildExerciseHeadingHtml(heading, grouped.get(heading) || [], `ex-${idx}`)
    ).join('');
    if (bannedExercises.length) {
        html += buildExerciseHeadingHtml('Banned', bannedExercises, 'ex-banned');
    }

    const list = document.getElementById('exercise-list');
    if (list) {
        list.innerHTML = html;
        if (!list._exerciseActionsBound) {
            list._exerciseActionsBound = true;
            list.addEventListener('click', (e) => {
                const banBtn = e.target.closest('.btn-ban-item');
                const row = e.target.closest('.inventory-row[data-exercise-id]');
                if (banBtn) {
                    e.preventDefault();
                    e.stopPropagation();
                    const id = banBtn.getAttribute('data-exercise-id');
                    if (id == null || id === '') return;
                    toggleExerciseBan(id);
                    loadExercises();
                    return;
                }
                if (row) {
                    const id = row.getAttribute('data-exercise-id');
                    if (id != null && id !== '') openExerciseDetail(id);
                }
            });
        }
        const searchEl = document.getElementById('search-ex');
        if (searchEl && searchEl.value.trim()) filterBoot('ex');
    }
}

export async function deleteItem(table, id, callback) {
    if(!confirm("Remove this item from the database?")) return;
    await store.supabaseClient.from(table).delete().eq('id', id);
    callback();
}

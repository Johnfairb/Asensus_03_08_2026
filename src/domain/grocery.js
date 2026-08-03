import { store } from '../state/store.js';
import { excludeBannedFoods } from './bans.js';
import { categoryToHeading, FOOD_HEADING_ORDER } from './food-catalog.js';

// ==========================================
// 6. AUTO-GROCERY FORECASTER (INVENTORY ENGINE)
// ==========================================
/** Round masses to shopper-friendly units (1kg not 1,099g). */
export function formatFoodMass(grams, unitHint) {
    const g = Math.max(0, Number(grams) || 0);
    const liquid = unitHint === 'ml' || unitHint === 'L';
    if (liquid) {
        if (g >= 950) {
            const litres = Math.round(g / 1000);
            return (litres <= 1 ? '1L' : litres + 'L');
        }
        const ml = Math.round(g / 50) * 50;
        return (ml || 50) + 'ml';
    }
    if (g >= 900) {
        const kg = Math.round(g / 1000);
        if (kg <= 1) return '1kg';
        return kg + 'kg';
    }
    if (g >= 450) return '500g';
    if (g >= 200) return Math.round(g / 50) * 50 + 'g';
    if (g >= 75) return Math.round(g / 25) * 25 + 'g';
    return Math.max(25, Math.round(g / 5) * 5) + 'g';
}

/** Same headings / order as My Foods. */
const AISLE_ORDER = [...FOOD_HEADING_ORDER, 'Other'];

function escapeAttr(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;');
}

function emptyAisleBuckets() {
    return Object.fromEntries(AISLE_ORDER.map(a => [a, { rows: [], cost: 0 }]));
}

function getAisle(food) {
    const heading = food?._heading || categoryToHeading(food?._category);
    if (heading && AISLE_ORDER.includes(heading)) return heading;
    return 'Other';
}

function getPackageSize(foodName, cat) {
    const n = (foodName || '').toLowerCase();
    if (n.includes('egg')) return 300;
    if (n.includes('milk')) return 2000;
    if (n.includes('whey') || n.includes('protein')) return 1000;
    if (cat === 'CARB') return 1000;
    if (cat === 'PRO') return 500;
    if (cat === 'FAT') return 500;
    return 500;
}

function foodUnit(f) {
    return f._category === 'LIQUID' || (f._cleanName || '').toLowerCase().includes('oil') ? 'ml' : 'g';
}

function detailAttrs({ id, name, stockLabel, needLabel, buyLabel, packs, packLabel, cost, coverage, buyMass }) {
    return [
        `data-id="${escapeAttr(id)}"`,
        `data-name="${escapeAttr(name)}"`,
        `data-stock="${escapeAttr(stockLabel)}"`,
        `data-need="${escapeAttr(needLabel)}"`,
        `data-buy="${escapeAttr(buyLabel)}"`,
        `data-packs="${escapeAttr(packs)}"`,
        `data-pack-label="${escapeAttr(packLabel)}"`,
        `data-cost="${escapeAttr(cost)}"`,
        `data-coverage="${escapeAttr(coverage)}"`,
        buyMass != null ? `data-mass="${escapeAttr(buyMass)}"` : ''
    ].filter(Boolean).join(' ');
}

function shopRowHtml(f, { totalBuyMass, cost, packsNeeded, packLabel, buyLabel, stockLabel, needLabel, coverage }) {
    const attrs = detailAttrs({
        id: f.id,
        name: f._cleanName,
        stockLabel,
        needLabel,
        buyLabel,
        packs: packsNeeded,
        packLabel,
        cost: cost.toFixed(2),
        coverage,
        buyMass: totalBuyMass
    });
    return `
    <div class="grocery-row" ${attrs}>
        <input type="checkbox" class="cart-checkbox" data-id="${escapeAttr(f.id)}" data-mass="${escapeAttr(totalBuyMass)}"
            onclick="event.stopPropagation()"
            style="width: 18px; height: 18px; accent-color: var(--gold-accent); flex-shrink:0;">
        <button type="button" class="grocery-row-main" onclick="openGroceryDetail(this.closest('.grocery-row'))">
            <span class="grocery-qty">${buyLabel}</span>
            <span class="grocery-name">${f._cleanName}</span>
        </button>
    </div>`;
}

function pantryRowHtml(f, meta) {
    const stockLabel = formatFoodMass(f.stock_g || 0, foodUnit(f));
    const attrs = detailAttrs({
        id: f.id,
        name: f._cleanName,
        stockLabel,
        needLabel: meta?.needLabel || '—',
        buyLabel: meta?.buyLabel || '—',
        packs: meta?.packsNeeded ?? '—',
        packLabel: meta?.packLabel || 'pack',
        cost: meta ? meta.cost.toFixed(2) : '—',
        coverage: meta?.coverage || (meta ? 'Covers this week' : 'In stock'),
        buyMass: meta?.totalBuyMass
    });
    return `
    <div class="grocery-row grocery-row--pantry" ${attrs}>
        <button type="button" class="grocery-row-main" onclick="openGroceryDetail(this.closest('.grocery-row'))">
            <span class="grocery-qty">${stockLabel}</span>
            <span class="grocery-name">${f._cleanName}</span>
        </button>
    </div>`;
}

const openGroceryAisles = new Set();

export function toggleGroceryAisle(key) {
    const panel = document.getElementById(`grocery-aisle-${key}`);
    const chevron = document.getElementById(`grocery-aisle-chevron-${key}`);
    const btn = document.querySelector(`[data-aisle-toggle="${key}"]`);
    if (!panel) return;
    const opening = panel.classList.contains('hidden');
    panel.classList.toggle('hidden', !opening);
    if (chevron) chevron.textContent = opening ? '−' : '+';
    if (btn) btn.setAttribute('aria-expanded', opening ? 'true' : 'false');
    if (opening) openGroceryAisles.add(key);
    else openGroceryAisles.delete(key);
}

function renderAisleCards(buckets, mode) {
    let html = '';
    const headings = [
        ...AISLE_ORDER.filter(h => buckets[h]?.rows?.length),
        ...Object.keys(buckets).filter(h => !AISLE_ORDER.includes(h) && buckets[h]?.rows?.length)
    ];
    headings.forEach((aisle, idx) => {
        const bucket = buckets[aisle];
        if (!bucket?.rows?.length) return;
        const n = bucket.rows.length;
        const isShop = mode === 'shop';
        const key = `${mode}-${idx}`;
        const isOpen = openGroceryAisles.has(key);
        const right = isShop
            ? `<span class="grocery-aisle-left" data-aisle-left>${n} left</span>`
            : `<span>${n} item${n === 1 ? '' : 's'}</span>`;
        html += `
        <div class="card grocery-aisle-card" style="margin-bottom:12px;"${isShop ? ' data-aisle-card' : ''}>
            <button type="button" class="grocery-aisle-header" data-aisle-toggle="${key}" aria-expanded="${isOpen ? 'true' : 'false'}" onclick="toggleGroceryAisle('${key}')">
                <strong>${aisle}</strong>
                <span style="display:inline-flex; align-items:center; gap:6px;">${right}<span id="grocery-aisle-chevron-${key}" class="grocery-aisle-chevron">${isOpen ? '−' : '+'}</span></span>
            </button>
            <div id="grocery-aisle-${key}" class="grocery-aisle-panel${isOpen ? '' : ' hidden'}">
                ${bucket.rows.join('')}
            </div>
        </div>`;
    });
    return html;
}

export function generateGroceryList() {
    if (!store.userConfig.baselineTargets || store.globalFoodDB.length === 0) return;

    const timeDropdown = document.getElementById('shopping-timeframe');
    const days = timeDropdown ? parseInt(timeDropdown.value) : 7;

    const wPro = store.userConfig.baselineTargets.pro * days;
    const wCarb = store.userConfig.baselineTargets.carb * days;
    const wFat = store.userConfig.baselineTargets.fat * days;

    const getFoods = (cat) => excludeBannedFoods(store.globalFoodDB.filter(f => f._category === cat));
    const shopAisles = emptyAisleBuckets();
    /** @type {Map<string|number, object>} */
    const shopMetaById = new Map();

    const processFoodList = (foods, targetMacro, macroField) => {
        if (foods.length === 0) return;
        const macroPerFood = targetMacro / foods.length;

        foods.forEach(f => {
            if (!(f[macroField] > 0)) return;

            const rawMassNeeded = Math.round((macroPerFood / f[macroField]) * 100);
            const currentStock = f.stock_g || 0;
            const unit = foodUnit(f);
            const deficit = rawMassNeeded - currentStock;
            const needLabel = formatFoodMass(rawMassNeeded, unit);
            const stockLabel = formatFoodMass(currentStock, unit);

            if (deficit > 0) {
                const packSize = getPackageSize(f._cleanName, f._category);
                const packsNeeded = Math.ceil(deficit / packSize);
                const totalBuyMass = packsNeeded * packSize;
                const cost = (totalBuyMass / 100) * (f.price_per_100g || 0);

                let packLabel = (f._cleanName || '').toLowerCase().includes('egg') ? 'box' : 'pack';
                if (packsNeeded > 1) packLabel += (packLabel === 'box' ? 'es' : 's');

                const buyLabel = formatFoodMass(totalBuyMass, unit);
                const coverage = `Still need ${formatFoodMass(deficit, unit)}`;
                const aisle = getAisle(f);
                const meta = { totalBuyMass, cost, packsNeeded, packLabel, buyLabel, stockLabel, needLabel, coverage, unit };

                shopMetaById.set(f.id, meta);
                if (!shopAisles[aisle]) shopAisles[aisle] = { rows: [], cost: 0 };
                shopAisles[aisle].rows.push(shopRowHtml(f, meta));
                shopAisles[aisle].cost += cost;
            } else if (rawMassNeeded > 0) {
                shopMetaById.set(f.id, {
                    totalBuyMass: 0,
                    cost: 0,
                    packsNeeded: 0,
                    packLabel: 'pack',
                    buyLabel: '—',
                    stockLabel,
                    needLabel,
                    coverage: 'Covers this week',
                    unit
                });
            }
        });
    };

    processFoodList(getFoods('PRO'), wPro, 'protein_per_100g');
    processFoodList(getFoods('CARB'), wCarb, 'carbs_per_100g');
    processFoodList(getFoods('FAT'), wFat, 'fat_per_100g');

    const shopHtml = renderAisleCards(shopAisles, 'shop');
    const inlineContainer = document.getElementById('inline-grocery-list');
    if (inlineContainer) {
        inlineContainer.innerHTML = shopHtml
            || `<div style="text-align:center; padding: 20px; font-size:12px; color:var(--text-muted);">Nothing to buy for this timeframe.</div>`;
    }

    if (typeof window.wireShoppingSelectionUpdates === 'function') window.wireShoppingSelectionUpdates();
    if (typeof window.updateShoppingSelection === 'function') window.updateShoppingSelection();

    const pantryAisles = emptyAisleBuckets();
    store.globalFoodDB.forEach(f => {
        if (!(f.stock_g > 0)) return;
        const aisle = getAisle(f);
        const meta = shopMetaById.get(f.id);
        if (!pantryAisles[aisle]) pantryAisles[aisle] = { rows: [], cost: 0 };
        pantryAisles[aisle].rows.push(pantryRowHtml(f, meta));
    });

    const pantryHtml = renderAisleCards(pantryAisles, 'pantry');
    const pantryContainer = document.getElementById('inline-pantry-list');
    if (pantryContainer) {
        pantryContainer.innerHTML = pantryHtml
            || `<div style="text-align:center; padding: 20px; font-size:12px; color:var(--text-muted);">No pantry stock yet.</div>`;
    }
}

import { store } from '../state/store.js';
import { dateToISO } from '../domain/route-planner.js';

/** Category moisture defaults (g water / 100 g) when water_per_100g is missing. */
const CATEGORY_WATER_PER_100G = {
    LIQUID: 95,
    VEG_G: 90,
    VEG_C: 90,
    PRO: 65,
    CARB: 40,
    FAT: 5,
    MISC: 50,
};

/**
 * Estimated water from a logged food mass (ml ≈ g water).
 * Uses food.water_per_100g when set; otherwise category fallback.
 */
export function estimateFoodWaterMl(food, mass) {
    const grams = Number(mass) || 0;
    if (grams <= 0 || !food) return 0;
    const raw = food.water_per_100g;
    const per100 = Number(raw);
    // Respect explicit values including 0 (oils); fall back only when unset.
    if (raw != null && raw !== '' && Number.isFinite(per100)) {
        return (grams * Math.max(0, per100)) / 100;
    }
    const cat = food._category || (String(food.name || '').match(/^\[([A-Z_]+)\]/) || [])[1] || 'MISC';
    const fallback = CATEGORY_WATER_PER_100G[cat] ?? 0;
    return (grams * fallback) / 100;
}

/** Default water_per_100g for pantry create when the user leaves the field blank. */
export function defaultWaterPer100gForCategory(cat) {
    return CATEGORY_WATER_PER_100G[cat] ?? 50;
}

export function parseFoodLogDetails(raw) {
    try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw || '[]') : raw;
        if (Array.isArray(parsed)) return { items: parsed, hydration_ml: 0 };
        if (parsed && Array.isArray(parsed.items)) {
            return { items: parsed.items, hydration_ml: Number(parsed.hydration_ml) || 0 };
        }
    } catch (e) {}
    return { items: [], hydration_ml: 0 };
}

export function specificEventName(sp) {
    if (!sp) return null;
    if (typeof sp === 'string') return sp;
    return sp.event || null;
}

export function getHydrationLitersForDate(isoDate) {
    const dateStr = isoDate || dateToISO(new Date());
    let ml = 0;
    try {
        const raw = localStorage.getItem('ascensus_hydration_' + dateStr);
        if (raw) {
            const data = JSON.parse(raw);
            if (Array.isArray(data?.entries)) {
                data.entries.forEach(e => { ml += Number(e.ml) || 0; });
            }
        }
    } catch (e) {}
    return ml / 1000;
}

export function recordHydrationMl(ml, source, isoDate) {
    const amount = Math.max(0, Number(ml) || 0);
    if (!amount) return;
    const dateStr = isoDate || dateToISO(new Date());
    const key = 'ascensus_hydration_' + dateStr;
    let data = { entries: [] };
    try { data = JSON.parse(localStorage.getItem(key) || '{"entries":[]}'); } catch (e) {}
    if (!Array.isArray(data.entries)) data.entries = [];
    data.entries.push({ ml: amount, source: source || 'meal', at: Date.now() });
    localStorage.setItem(key, JSON.stringify(data));
}

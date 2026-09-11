/**
 * Strength core circuit: 1 exercise from each category, still mixed by level.
 * Beginner → 5×B · Intermediate → 3×B + 2×I · Advanced → A, I∪A, I, I∪B, B.
 */
import { store } from '../state/store.js';
import { getCoreProgrammingEntries, formatCoreRepLabel, getExerciseMeta, resolveCatalogName } from './exercise-catalog.js';

const CORE_SAVES_KEY = 'ascensus_core_circuits_v1';

/** Station groups used to cluster an already-picked circuit (does not change picks). */
const CORE_EQUIPMENT_GROUP = {
    'Crunch': 'floor',
    'Knees Bent Crunch': 'floor',
    'Feet Up Crunch': 'floor',
    'Reverse Crunch': 'floor',
    'Plank': 'floor',
    'Side Plank': 'floor',
    'Dead Bug': 'floor',
    'Toe Touch': 'floor',
    'Cable Crunch': 'cable',
    'Pallof Push': 'cable',
    'Wood-chop': 'cable',
    'Standing Cable Rotation': 'cable',
    'Seated Cable Rotation': 'cable',
    'Side-sit on Hyperextension Bench': 'hyperextension',
    'Hyperextension': 'hyperextension',
    'Hanging Knee Raise': 'hanging',
    'Hanging Leg Raise': 'hanging',
    'Suitcase Carry': 'dumbbell',
    'Turkish Get-up': 'dumbbell',
    'Russian Twist': 'dumbbell',
    'Standing Side Bend': 'dumbbell',
    'Halo': 'dumbbell',
    'Bulgarian Bag Circles': 'bulgarian-bag'
};

export const CORE_STRENGTH_LEVELS = ['Beginner', 'Intermediate', 'Advanced'];

/** Circuit always takes one exercise from each of these. */
export const CORE_CATEGORIES = ['upper-abs', 'lower-abs', 'rotation', 'anti-rotation', 'ql'];

export function normalizeCoreStrength(level) {
    const s = String(level || '').trim();
    if (/^adv/i.test(s)) return 'Advanced';
    if (/^int/i.test(s)) return 'Intermediate';
    if (/^beg/i.test(s)) return 'Beginner';
    return null;
}

export function hasCoreStrengthRating() {
    return !!normalizeCoreStrength(store.userConfig?.coreStrength);
}

export function getCoreStrengthLevel() {
    return normalizeCoreStrength(store.userConfig?.coreStrength) || 'Beginner';
}

function shuffleInPlace(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

export function coreCategoryOf(name) {
    const resolved = resolveCoreExerciseName(name) || String(name || '').trim();
    if (!resolved) return null;
    const meta = getExerciseMeta(resolved);
    if (meta?.coreCategory && CORE_CATEGORIES.includes(meta.coreCategory)) return meta.coreCategory;
    const entry = getCoreProgrammingEntries().find((e) => e.name === resolved);
    return (entry?.category && CORE_CATEGORIES.includes(entry.category)) ? entry.category : null;
}

function levelSlotsForTier(tier) {
    if (tier === 'Beginner') return [['B'], ['B'], ['B'], ['B'], ['B']];
    if (tier === 'Intermediate') return shuffleInPlace([['B'], ['B'], ['B'], ['I'], ['I']]);
    // Tightest pools first so Advanced can still land 1 A / 1 I / 1 B plus the unions.
    return [['A'], ['I'], ['B'], ['I', 'A'], ['I', 'B']];
}

function entriesForCategory(category, levels, usedNames) {
    const want = new Set(levels);
    return getCoreProgrammingEntries().filter((e) => (
        e.category === category
        && want.has(e.level)
        && !usedNames.has(e.name)
    ));
}

function pickOneFrom(entries) {
    if (!entries.length) return null;
    return entries[Math.floor(Math.random() * entries.length)];
}

/**
 * Pick 5 core exercises: one per category, mixed by the user's core strength rating.
 * Returns canonical catalog names (unique when pools allow).
 */
export function pickCoreExercisesForLevel(level = getCoreStrengthLevel()) {
    const tier = normalizeCoreStrength(level) || 'Beginner';
    const slots = levelSlotsForTier(tier);
    const cats = shuffleInPlace(CORE_CATEGORIES.slice());

    const search = (slotIdx, usedCats, usedNames, out) => {
        if (slotIdx >= slots.length) return true;
        const remaining = cats.filter((c) => !usedCats.has(c));
        const tryPools = (levels) => remaining
            .map((c) => ({ c, pool: entriesForCategory(c, levels, usedNames) }))
            .filter((row) => row.pool.length)
            .sort((a, b) => cats.indexOf(a.c) - cats.indexOf(b.c));

        const attempts = [
            ...tryPools(slots[slotIdx]),
            ...tryPools(['B', 'I', 'A'])
        ];
        const seen = new Set();
        for (const { c, pool } of attempts) {
            const key = `${c}:${pool.map((e) => e.name).join(',')}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const pick = pickOneFrom(pool);
            if (!pick) continue;
            usedCats.add(c);
            usedNames.add(pick.name);
            out.push(pick.name);
            if (search(slotIdx + 1, usedCats, usedNames, out)) return true;
            out.pop();
            usedCats.delete(c);
            usedNames.delete(pick.name);
        }
        return false;
    };

    const out = [];
    if (!search(0, new Set(), new Set(), out)) {
        const used = new Set(out);
        for (const c of CORE_CATEGORIES) {
            if (out.length >= 5) break;
            const fallback = pickOneFrom(entriesForCategory(c, ['B', 'I', 'A'], used));
            if (!fallback) continue;
            used.add(fallback.name);
            out.push(fallback.name);
        }
    }

    return orderCoreExercisesByEquipment(shuffleInPlace(out.slice(0, 5)));
}

export function resolveCoreExerciseName(name) {
    const raw = String(name || '').trim();
    if (!raw) return '';
    const lower = raw.toLowerCase();
    if (lower === 'knee raise machine' || lower === 'roman chair' || lower === 'roman chair knee raise') {
        return 'Hanging Knee Raise';
    }
    if (lower === 'knee raise machine leg raise' || lower === 'roman chair leg raise') {
        return 'Hanging Leg Raise';
    }
    if (lower === 'knees bench crunch' || lower === 'knees on bench crunch') {
        return 'Knees Bent Crunch';
    }
    const resolved = resolveCatalogName(raw) || raw;
    if (getExerciseMeta(resolved)?.coreLevel) return resolved;
    return '';
}

export function coreEquipmentGroup(name) {
    const resolved = resolveCoreExerciseName(name) || String(name || '').trim();
    return CORE_EQUIPMENT_GROUP[resolved] || 'floor';
}

/** Reorder existing picks by first-seen equipment; order within a group stays as picked. */
export function orderCoreExercisesByEquipment(names) {
    const list = [];
    const seenNames = new Set();
    (Array.isArray(names) ? names : []).forEach((n) => {
        const resolved = resolveCoreExerciseName(n) || String(n || '').trim();
        if (!resolved || seenNames.has(resolved)) return;
        seenNames.add(resolved);
        list.push(resolved);
    });
    if (list.length < 2) return list;
    const groupOrder = [];
    const seen = new Set();
    list.forEach((n) => {
        const g = coreEquipmentGroup(n);
        if (!seen.has(g)) {
            seen.add(g);
            groupOrder.push(g);
        }
    });
    const out = [];
    groupOrder.forEach((g) => {
        list.forEach((n) => {
            if (coreEquipmentGroup(n) === g) out.push(n);
        });
    });
    return out;
}

export function coreSwapCandidates(currentName, circuitNames) {
    const current = resolveCoreExerciseName(currentName);
    if (!current) return [];
    const used = new Set(
        (Array.isArray(circuitNames) ? circuitNames : [])
            .map((n) => resolveCoreExerciseName(n) || String(n || '').trim())
            .filter((n) => n && n !== current)
    );
    const currentCat = coreCategoryOf(current);
    return getCoreProgrammingEntries()
        .filter((e) => e.name !== current && !used.has(e.name))
        .sort((a, b) => {
            const aSame = coreCategoryOf(a.name) === currentCat ? 0 : 1;
            const bSame = coreCategoryOf(b.name) === currentCat ? 0 : 1;
            if (aSame !== bSame) return aSame - bSame;
            return a.name.localeCompare(b.name);
        })
        .map((e) => e.name);
}

export function loadSavedCoreCircuits() {
    try {
        const raw = JSON.parse(localStorage.getItem(CORE_SAVES_KEY) || '[]');
        return Array.isArray(raw) ? raw.filter((r) => r && r.id && r.name && Array.isArray(r.exercises)) : [];
    } catch (e) {
        return [];
    }
}

export function saveNamedCoreCircuit({ name, exercises, loads }) {
    const title = String(name || '').trim();
    const list = orderCoreExercisesByEquipment(
        (Array.isArray(exercises) ? exercises : [])
            .map((n) => resolveCoreExerciseName(n) || String(n || '').trim())
            .filter(Boolean)
    );
    if (!title || !list.length) return null;
    const loadMap = {};
    if (loads && typeof loads === 'object') {
        Object.entries(loads).forEach(([k, v]) => {
            const n = resolveCoreExerciseName(k) || String(k || '').trim();
            const w = Number(v);
            if (n && Number.isFinite(w) && w > 0) loadMap[n] = w;
        });
    }
    const rows = loadSavedCoreCircuits();
    const existing = rows.find((r) => String(r.name).toLowerCase() === title.toLowerCase());
    const row = {
        id: existing?.id || `core_${Date.now()}`,
        name: title,
        exercises: list,
        loads: loadMap,
        savedAt: Date.now()
    };
    const next = existing
        ? rows.map((r) => (r.id === existing.id ? row : r))
        : [...rows, row];
    try { localStorage.setItem(CORE_SAVES_KEY, JSON.stringify(next)); } catch (e) { /* ignore */ }
    return row;
}

export function deleteNamedCoreCircuit(id) {
    const next = loadSavedCoreCircuits().filter((r) => String(r.id) !== String(id));
    try { localStorage.setItem(CORE_SAVES_KEY, JSON.stringify(next)); } catch (e) { /* ignore */ }
    return next;
}

export { formatCoreRepLabel };

/**
 * Persist core strength rating on userConfig (caller should saveSettings / localStorage).
 */
export function setCoreStrengthLevel(level) {
    const normalized = normalizeCoreStrength(level);
    if (!normalized) return false;
    store.userConfig.coreStrength = normalized;
    return true;
}

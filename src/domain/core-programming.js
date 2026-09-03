/**
 * Strength core circuit: level pools, monthly picks, advised targets.
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

function namesAtLevels(levels, exclude = []) {
    const want = new Set(levels);
    const ex = new Set(exclude);
    return getCoreProgrammingEntries()
        .filter((e) => want.has(e.level) && !ex.has(e.name))
        .map((e) => e.name);
}

function pickOne(pool, used) {
    const available = (pool || []).filter((n) => !used.includes(n));
    if (!available.length) return null;
    const pick = available[Math.floor(Math.random() * available.length)];
    used.push(pick);
    return pick;
}

/**
 * Pick 5 core exercises for the user's rated core strength.
 * Returns canonical catalog names (unique when pools allow).
 */
export function pickCoreExercisesForLevel(level = getCoreStrengthLevel()) {
    const tier = normalizeCoreStrength(level) || 'Beginner';
    const used = [];
    const out = [];

    const take = (pool) => {
        const pick = pickOne(pool, used);
        if (pick) out.push(pick);
    };

    if (tier === 'Beginner') {
        const b = shuffleInPlace(namesAtLevels(['B']));
        for (let i = 0; i < 5; i++) take(b);
    } else if (tier === 'Intermediate') {
        const b = shuffleInPlace(namesAtLevels(['B']));
        const iPool = shuffleInPlace(namesAtLevels(['I']));
        for (let i = 0; i < 3; i++) take(b);
        for (let i = 0; i < 2; i++) take(iPool);
    } else {
        // Advanced: 1 A · 1 I∪A · 1 I · 1 I∪B · 1 B
        take(shuffleInPlace(namesAtLevels(['A'])));
        take(shuffleInPlace(namesAtLevels(['I', 'A'], used)));
        take(shuffleInPlace(namesAtLevels(['I'], used)));
        take(shuffleInPlace(namesAtLevels(['I', 'B'], used)));
        take(shuffleInPlace(namesAtLevels(['B'], used)));
    }

    // Fallback fill if a pool was empty
    if (out.length < 5) {
        const all = shuffleInPlace(namesAtLevels(['B', 'I', 'A'], used));
        while (out.length < 5 && all.length) {
            const n = all.shift();
            if (!used.includes(n)) {
                used.push(n);
                out.push(n);
            }
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
    const level = getExerciseMeta(current)?.coreLevel;
    if (!current || !level) return [];
    const used = new Set(
        (Array.isArray(circuitNames) ? circuitNames : [])
            .map((n) => resolveCoreExerciseName(n) || String(n || '').trim())
            .filter((n) => n && n !== current)
    );
    return getCoreProgrammingEntries()
        .filter((e) => e.level === level && e.name !== current && !used.has(e.name))
        .map((e) => e.name)
        .sort((a, b) => a.localeCompare(b));
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

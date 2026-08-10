/**
 * Strength core circuit: level pools, monthly picks, advised targets.
 * Beginner → 5×B · Intermediate → 3×B + 2×I · Advanced → A, I∪A, I, I∪B, B.
 */
import { store } from '../state/store.js';
import { getCoreProgrammingEntries, formatCoreRepLabel } from './exercise-catalog.js';

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

    return shuffleInPlace(out.slice(0, 5));
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

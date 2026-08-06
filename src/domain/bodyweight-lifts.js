/**
 * Bodyweight competency gates, monthly swaps, and press-up graduation bans.
 */
import { getExerciseMeta, normalizeExerciseName, resolveCatalogName } from './exercise-catalog.js';
import { setExerciseBanned } from './bans.js';
import { store } from '../state/store.js';

const TRICEP_ISO_SWAP_POOL = [
    'Rope Push Down', 'Bar Push Down', 'Single Push Down', 'Cable French Press',
    'Kick Back', 'Skull Crusher', 'Single Overhead Seated French Press'
];

const STORAGE_KEY = 'ascensus_bw_gate_v1';

export const PRESS_UP_VARIANTS = [
    'Press-up',
    'Close Grip Press-up',
    'Incline Press-up'
];

/** Canonical names that use the bodyweight competency gate. */
export const BW_GATE_EXERCISES = new Set([
    'Dip',
    'Reverse Dips',
    'Pull Up',
    'Chin Up',
    'Neutral Pull Up',
    'Press-up',
    'Close Grip Press-up',
    'Incline Press-up',
    'Pistol Squat'
]);

const FIXED_SWAPS = {
    'Dip': 'Decline Bench Press',
    'Pull Up': 'Lat Machine Pull',
    'Chin Up': 'Lat Machine Chin-up',
    'Neutral Pull Up': 'Lat Machine Close Grip',
    'Press-up': 'Bench Press',
    'Close Grip Press-up': 'Close Grip Bench Press',
    'Incline Press-up': 'Incline Bench Press',
    'Pistol Squat': 'Split Squat'
};

function monthKey(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function loadState() {
    try {
        const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
        if (!raw || typeof raw !== 'object') {
            return { month: monthKey(), cant: {}, can: {}, pressUpsRetired: false };
        }
        if (raw.month !== monthKey()) {
            return {
                month: monthKey(),
                cant: {},
                can: {},
                pressUpsRetired: !!raw.pressUpsRetired
            };
        }
        return {
            month: raw.month,
            cant: raw.cant && typeof raw.cant === 'object' ? raw.cant : {},
            can: raw.can && typeof raw.can === 'object' ? raw.can : {},
            pressUpsRetired: !!raw.pressUpsRetired
        };
    } catch (e) {
        return { month: monthKey(), cant: {}, can: {}, pressUpsRetired: false };
    }
}

function saveState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function canonicalBwName(name) {
    const meta = getExerciseMeta(name);
    if (meta?.name) return meta.name;
    return resolveCatalogName(name) || String(name || '').trim();
}

export function isBwGateExercise(name) {
    return BW_GATE_EXERCISES.has(canonicalBwName(name));
}

export function isPressUpVariant(name) {
    return PRESS_UP_VARIANTS.includes(canonicalBwName(name));
}

export function arePressUpsRetired() {
    return !!loadState().pressUpsRetired;
}

export function bwRepThreshold() {
    const p = store.userConfig?.seasonPhase || '';
    const sel = typeof document !== 'undefined' ? document.getElementById('set-season-phase') : null;
    const live = sel?.value || p;
    // Hypertrophy competency: 8 reps. Strength / other phases: 5 reps.
    return live === 'OffSeason_Hypertrophy' ? 8 : 5;
}

function pickTricepIsolation() {
    return TRICEP_ISO_SWAP_POOL[Math.floor(Math.random() * TRICEP_ISO_SWAP_POOL.length)] || 'Rope Push Down';
}

export function swapTargetFor(name) {
    const canon = canonicalBwName(name);
    if (canon === 'Reverse Dips') return pickTricepIsolation();
    return FIXED_SWAPS[canon] || null;
}

/** Resolve what to program for a planned BW exercise this month. */
export function resolveProgrammedBwName(name) {
    const canon = canonicalBwName(name);
    if (!BW_GATE_EXERCISES.has(canon)) return canon;

    const state = loadState();
    if (isPressUpVariant(canon) && state.pressUpsRetired) {
        return FIXED_SWAPS[canon] || canon;
    }
    if (state.cant[canon]) return state.cant[canon];
    return canon;
}

export function needsBwCompetencyAsk(name) {
    const canon = canonicalBwName(name);
    if (!BW_GATE_EXERCISES.has(canon)) return false;
    const state = loadState();
    if (isPressUpVariant(canon) && state.pressUpsRetired) return false;
    if (state.cant[canon]) return false;
    if (state.can[canon]) return false;
    return true;
}

export function recordBwCanDo(name) {
    const canon = canonicalBwName(name);
    const state = loadState();
    state.can[canon] = true;
    delete state.cant[canon];
    saveState(state);
}

export function recordBwCannotDo(name, swapName) {
    const canon = canonicalBwName(name);
    const state = loadState();
    state.cant[canon] = swapName || swapTargetFor(canon);
    delete state.can[canon];
    saveState(state);
    return state.cant[canon];
}

/** Permanently retire all press-up variants (ban + always swap). */
export function retireAllPressUps() {
    const state = loadState();
    state.pressUpsRetired = true;
    PRESS_UP_VARIANTS.forEach(n => {
        state.cant[n] = FIXED_SWAPS[n];
        delete state.can[n];
    });
    saveState(state);

    const db = store.globalExerciseDB || [];
    PRESS_UP_VARIANTS.forEach(variant => {
        db.forEach(ex => {
            if (normalizeExerciseName(canonicalBwName(ex.name)) === normalizeExerciseName(variant)) {
                setExerciseBanned(ex.id, true);
            }
        });
    });
}

/**
 * After a working set is logged: if any press-up set has reps > 12, retire all variants.
 * Returns true if retirement was triggered.
 */
export function maybeRetirePressUpsFromSet(exName, reps) {
    if (!isPressUpVariant(exName)) return false;
    if (arePressUpsRetired()) return false;
    const r = Number(reps) || 0;
    if (r <= 12) return false;
    retireAllPressUps();
    return true;
}

/** Muscle library accordion groups (PDF regions). */
export function getLibraryMuscleGroup(name) {
    const meta = getExerciseMeta(name);
    if (!meta) return null;
    if (meta.ppl === 'Core' || meta.movement === 'core') return 'Core';
    if (meta.ppl === 'Legs') return 'Legs';
    if (meta.movement === 'bicep isolation') return 'Biceps';
    if (meta.movement === 'tricep isolation') return 'Triceps';
    if (meta.movement === 'horizontal push' || meta.movement === 'pec isolation') return 'Pecs';
    if (meta.movement === 'vertical pull' || meta.movement === 'horizontal pull' || meta.movement === 'mid trap isolation') {
        return 'Lats';
    }
    if (
        meta.movement === 'vertical push'
        || meta.movement === 'side delt isolation'
        || meta.movement === 'front delt isolation'
        || meta.movement === 'rear delt isolation'
        || meta.movement === 'rotator cuff isolation'
    ) {
        return 'Shoulders';
    }
    if (meta.ppl === 'Push') return 'Pecs';
    if (meta.ppl === 'Pull') return 'Lats';
    return meta.ppl || null;
}

export const LIBRARY_MUSCLE_ORDER = [
    'Legs', 'Pecs', 'Lats', 'Shoulders', 'Biceps', 'Triceps', 'Core'
];

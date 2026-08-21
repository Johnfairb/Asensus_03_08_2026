/**
 * Power / plyometric sessions: intensity from work-weight ratios, 5-slot routine,
 * 8-week gym-log gate, and per-exercise warmups (PDF 25/07/2026).
 *
 * Weighted squat jumps / pogos use 0.2 × squat work weight (20%), not 0.2%.
 */
import { store } from '../state/store.js';
import { getExerciseMeta, resolveCatalogName } from './exercise-catalog.js';
import { getCoreStrengthLevel, hasCoreStrengthRating } from './core-programming.js';
import { roundUpLoad } from './load-increments.js';
import { getSportWeeklyQuotas } from './sports-matrix.js';

export const POWER_EVENT = 'Full Body / Power';
export const POWER_REST_SEC = 180;
/** Rest after the related-movement warmup (before technique warmup). */
export const POWER_WARMUP1_REST_SEC = 30;
/** Rest after the technique warmup (before the first work set). */
export const POWER_WARMUP2_REST_SEC = 120;
export const POWER_SETS = 3;
export const POWER_WEEKLY_QUOTA = 1;
/** Load for weighted squat jumps / pogos = this fraction of squat work weight. */
export const POWER_SQUAT_JUMP_FRACTION = 0.2;

export const POWER_SLOT_BILATERAL = 'Power · Bilateral Legs';
export const POWER_SLOT_UNILATERAL = 'Power · Unilateral Legs';
export const POWER_SLOT_CORE = 'Power · Core';
export const POWER_SLOT_PUSH = 'Power · Push';
export const POWER_SLOT_PULL = 'Power · Pull';

export const POWER_SLOT_LABELS = [
    POWER_SLOT_BILATERAL,
    POWER_SLOT_UNILATERAL,
    POWER_SLOT_CORE,
    POWER_SLOT_PUSH,
    POWER_SLOT_PULL
];

const WARMUP_RELATED = {
    [POWER_SLOT_BILATERAL]: 'Squats',
    [POWER_SLOT_UNILATERAL]: 'Split squats',
    [POWER_SLOT_CORE]: 'Crunches',
    [POWER_SLOT_PUSH]: 'Push-ups',
    [POWER_SLOT_PULL]: 'Light dumbbell rows'
};

const MAXIMAL_NOTE = 'Maximal effort — every work-set rep should be as explosive as possible.';
const LOWER_INTENSITY_NOTE = 'Lower intensity — less height / less snap. Save maximal effort for work sets.';

/** @typedef {'L'|'M'|'H'} PowerBand */

/** @type {{ name: string, slot: string, band: PowerBand, reps: number, needsSquat?: boolean }[]} */
export const POWER_MOVEMENTS = [
    // Bilateral legs
    { name: 'Box Jumps', slot: POWER_SLOT_BILATERAL, band: 'L', reps: 5 },
    { name: 'Depth Jumps', slot: POWER_SLOT_BILATERAL, band: 'M', reps: 5 },
    { name: 'Depth Jump to Box Jump', slot: POWER_SLOT_BILATERAL, band: 'H', reps: 5 },
    { name: 'Low Hurdle Hops', slot: POWER_SLOT_BILATERAL, band: 'M', reps: 8 },
    { name: 'High Hurdle Hops', slot: POWER_SLOT_BILATERAL, band: 'H', reps: 5 },
    { name: 'Knee Jumps', slot: POWER_SLOT_BILATERAL, band: 'M', reps: 5 },
    { name: 'Knee Jumps to Box Jump', slot: POWER_SLOT_BILATERAL, band: 'H', reps: 5 },
    { name: 'Lateral Hurdle Jumps', slot: POWER_SLOT_BILATERAL, band: 'M', reps: 5 },
    { name: 'Squat Jumps', slot: POWER_SLOT_BILATERAL, band: 'L', reps: 5 },
    { name: 'Weighted Squat Jumps', slot: POWER_SLOT_BILATERAL, band: 'M', reps: 5, needsSquat: true },
    { name: 'Weighted Pogos', slot: POWER_SLOT_BILATERAL, band: 'H', reps: 10, needsSquat: true },
    { name: 'Bilateral Bound', slot: POWER_SLOT_BILATERAL, band: 'M', reps: 4 },
    { name: 'Repeated Bilateral Bounds', slot: POWER_SLOT_BILATERAL, band: 'H', reps: 4 },
    { name: 'Knee Tuck', slot: POWER_SLOT_BILATERAL, band: 'L', reps: 5 },
    { name: 'Repeated Knee Tuck', slot: POWER_SLOT_BILATERAL, band: 'M', reps: 5 },
    { name: 'Pogos', slot: POWER_SLOT_BILATERAL, band: 'M', reps: 10 },
    // Unilateral legs (reps are total, not per leg)
    { name: 'Single Leg Box Jumps', slot: POWER_SLOT_UNILATERAL, band: 'L', reps: 5 },
    { name: 'Bounds', slot: POWER_SLOT_UNILATERAL, band: 'M', reps: 8 },
    { name: 'Single Leg Bounds', slot: POWER_SLOT_UNILATERAL, band: 'H', reps: 3 },
    { name: 'Lunge Jumps', slot: POWER_SLOT_UNILATERAL, band: 'L', reps: 8 },
    { name: 'Rapid Lunge Jumps', slot: POWER_SLOT_UNILATERAL, band: 'M', reps: 8 },
    { name: 'Skater Bounds', slot: POWER_SLOT_UNILATERAL, band: 'M', reps: 8 },
    { name: 'Rapid Skater Bounds', slot: POWER_SLOT_UNILATERAL, band: 'H', reps: 8 },
    { name: 'Single Leg Pogos', slot: POWER_SLOT_UNILATERAL, band: 'M', reps: 10 },
    { name: 'Skips for Height', slot: POWER_SLOT_UNILATERAL, band: 'M', reps: 8 },
    { name: 'Skips for Distance', slot: POWER_SLOT_UNILATERAL, band: 'M', reps: 8 },
    { name: 'Explosive Bulgarian Split Squat', slot: POWER_SLOT_UNILATERAL, band: 'M', reps: 5 },
    { name: 'Single Leg Depth Jump', slot: POWER_SLOT_UNILATERAL, band: 'H', reps: 4 },
    // Core — PDF lists L only; Advanced/Intermediate still use this pool as fallback
    { name: 'Med Ball Crunch', slot: POWER_SLOT_CORE, band: 'L', reps: 6 },
    { name: 'Sideways Med Ball Toss', slot: POWER_SLOT_CORE, band: 'L', reps: 6 },
    { name: 'Kneeling Overhead Throw', slot: POWER_SLOT_CORE, band: 'L', reps: 6 },
    { name: 'Standing Overhead Throw', slot: POWER_SLOT_CORE, band: 'L', reps: 6 },
    // Push
    { name: 'Explosive Push-up', slot: POWER_SLOT_PUSH, band: 'L', reps: 5 },
    { name: 'Clap Push-up', slot: POWER_SLOT_PUSH, band: 'M', reps: 5 },
    { name: 'Superman Push-up', slot: POWER_SLOT_PUSH, band: 'H', reps: 5 },
    { name: 'Med Ball Chest Pass', slot: POWER_SLOT_PUSH, band: 'L', reps: 5 },
    // Pull
    { name: 'Standing Overhead Slam', slot: POWER_SLOT_PULL, band: 'L', reps: 5 },
    { name: 'Explosive Pull-up', slot: POWER_SLOT_PULL, band: 'M', reps: 5 },
    { name: 'Rope Slams', slot: POWER_SLOT_PULL, band: 'M', reps: 5 },
    { name: 'Clap Pull-up', slot: POWER_SLOT_PULL, band: 'H', reps: 5 },
    { name: 'Explosive Sled Pull', slot: POWER_SLOT_PULL, band: 'L', reps: 5 }
];

const BY_NAME = {};
POWER_MOVEMENTS.forEach((m) => { BY_NAME[m.name.toLowerCase()] = m; });

export function isPowerEvent(e) {
    if (!e || typeof e !== 'string') return false;
    if (e === POWER_EVENT || e === 'Power') return true;
    return /power/i.test(e) && !/preseason|pre-season/i.test(e) && !/hypertrophy|strength/i.test(e);
}

export function isPowerSlotLabel(slotLabel) {
    return POWER_SLOT_LABELS.includes(slotLabel);
}

export function powerMovementForName(name) {
    const resolved = resolveCatalogName(name) || name;
    return BY_NAME[String(resolved || '').trim().toLowerCase()] || null;
}

function canon(name) {
    return String(resolveCatalogName(name) || name || '').trim().toLowerCase();
}

function dateKey(raw) {
    if (!raw) return '';
    const s = String(raw);
    return s.includes('T') ? s.split('T')[0] : s.slice(0, 10);
}

function mondayISOFromDateStr(dateStr) {
    if (!dateStr) return '';
    const x = new Date(`${dateStr}T12:00:00`);
    if (Number.isNaN(x.getTime())) return '';
    const day = x.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    x.setDate(x.getDate() + diff);
    const y = x.getFullYear();
    const m = String(x.getMonth() + 1).padStart(2, '0');
    const d = String(x.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function allWorkoutLogs() {
    const out = [];
    Object.values(store.globalGroupedHistory || {}).forEach((day) => {
        (day?.items || []).forEach((row) => {
            if (row && row.type === 'workout' && row.exercise) out.push(row);
        });
    });
    return out;
}

function isGymLiftLog(row) {
    const n = String(row?.exercise || '');
    if (!n) return false;
    if (/^(practice|match|game)$/i.test(n)) return false;
    if (row.isLactateHit || row.is_lactate) return false;
    if (/steady\s*state|lactate|hit class/i.test(n)) return false;
    const meta = getExerciseMeta(n);
    if (meta && String(meta.domain || '').toLowerCase() === 'cardio') return false;
    return true;
}

/** Distinct Mon–Sun weeks that contain at least one logged gym lift. */
export function countWeeksWithGymSessions() {
    const weeks = new Set();
    allWorkoutLogs().forEach((row) => {
        if (!isGymLiftLog(row)) return;
        const day = dateKey(row.created_at);
        const week = mondayISOFromDateStr(day);
        if (week) weeks.add(week);
    });
    return weeks.size;
}

export function hasEightWeeksGymHistory() {
    return countWeeksWithGymSessions() >= 8;
}

function lastWorkWeight(exName) {
    const want = canon(exName);
    if (!want) return null;
    const rows = allWorkoutLogs().filter((l) => {
        if (canon(l.exercise) !== want) return false;
        if (l.is_warmup || l.isWarmup) return false;
        const w = Number(l.weight_kg);
        const reps = Number(l.reps);
        return (Number.isFinite(reps) && reps > 0) || (Number.isFinite(w) && w >= 0);
    });
    if (rows.length) {
        const days = [...new Set(rows.map((r) => dateKey(r.created_at)).filter(Boolean))].sort().reverse();
        const latestDay = days[0];
        const dayRows = latestDay ? rows.filter((l) => dateKey(l.created_at) === latestDay) : rows;
        dayRows.sort((a, b) => (Number(a.sets) || 0) - (Number(b.sets) || 0));
        const last = dayRows[dayRows.length - 1];
        const w = Number(last?.weight_kg);
        if (Number.isFinite(w)) return w;
    }
    const seedMap = store.userConfig?.exerciseWorkingWeights || {};
    for (const [k, v] of Object.entries(seedMap)) {
        if (canon(k) === want && Number.isFinite(Number(v))) return Number(v);
    }
    return null;
}

function bodyweightKg() {
    const w = Number(store.userConfig?.weight);
    return Number.isFinite(w) && w > 0 ? w : 0;
}

export function squatWorkWeightKg() {
    const squat = lastWorkWeight('Squat');
    if (squat != null) return squat;
    return lastWorkWeight('Sumo Squat');
}

function bestBand(bands) {
    if (bands.includes('H')) return 'H';
    if (bands.includes('M')) return 'M';
    if (bands.includes('L')) return 'L';
    return null;
}

function bandFromBarRatio(weight, bw, medRatio, highRatio) {
    if (weight == null || !(bw > 0)) return null;
    const r = Number(weight) / bw;
    if (r >= highRatio) return 'H';
    if (r >= medRatio) return 'M';
    return 'L';
}

function bandFromAddedLoad(addedKg, bw, highRatio) {
    if (addedKg == null || !(bw > 0)) return null;
    if (Number(addedKg) >= highRatio * bw) return 'H';
    return 'M';
}

const LOWER_LIFTS = [
    { names: ['Squat', 'Sumo Squat'], med: 1.0, high: 1.3 },
    { names: ['Deadlift', 'Sumo Deadlift'], med: 1.2, high: 1.5 },
    { names: ['Front Squat'], med: 0.7, high: 1.0 },
    { names: ['Split Squat', 'Bulgarian Squat'], med: 0.6, high: 0.9 }
];

const BENCH_NAMES = [
    'Bench Press', 'Close Grip Bench Press', 'Decline Bench Press', 'Incline Bench Press', 'Machine Bench Press'
];
const LAT_NAMES = [
    'Lat Machine Pull', 'Lat Machine Chin-up', 'Lat Machine Close Grip', 'Lat Machine Single Pull',
    'Low Pulley Wide Grip', 'Low Pulley Close Grip'
];
const ROW_NAMES = ['Underhand Barbell Row', 'Overhand Barbell Row'];
const PULLUP_NAMES = ['Pull Up', 'Chin Up', 'Neutral Pull Up'];

export function classifyLegIntensity() {
    const bw = bodyweightKg();
    const bands = [];
    LOWER_LIFTS.forEach((row) => {
        row.names.forEach((n) => {
            const band = bandFromBarRatio(lastWorkWeight(n), bw, row.med, row.high);
            if (band) bands.push(band);
        });
    });
    return bestBand(bands);
}

export function classifyUpperIntensity() {
    const bw = bodyweightKg();
    const bands = [];
    BENCH_NAMES.forEach((n) => {
        const band = bandFromBarRatio(lastWorkWeight(n), bw, 0.7, 0.9);
        if (band) bands.push(band);
    });
    ROW_NAMES.forEach((n) => {
        const band = bandFromBarRatio(lastWorkWeight(n), bw, 0.6, 0.8);
        if (band) bands.push(band);
    });
    LAT_NAMES.forEach((n) => {
        const band = bandFromBarRatio(lastWorkWeight(n), bw, 0.8, 1.0);
        if (band) bands.push(band);
    });
    const mil = bandFromBarRatio(lastWorkWeight('Barbell Military Press'), bw, 0.5, 0.7);
    if (mil) bands.push(mil);
    PULLUP_NAMES.forEach((n) => {
        const band = bandFromAddedLoad(lastWorkWeight(n), bw, 0.2);
        if (band) bands.push(band);
    });
    const dip = bandFromAddedLoad(lastWorkWeight('Dip'), bw, 0.2);
    if (dip) bands.push(dip);
    return bestBand(bands);
}

export function classifyCoreIntensity() {
    if (!hasCoreStrengthRating()) return null;
    const level = getCoreStrengthLevel();
    if (level === 'Advanced') return 'H';
    if (level === 'Intermediate') return 'M';
    return 'L';
}

export function classifyPowerIntensities() {
    return {
        legs: classifyLegIntensity(),
        core: classifyCoreIntensity(),
        upper: classifyUpperIntensity()
    };
}

export function canClassifyPowerIntensities() {
    const { legs, core, upper } = classifyPowerIntensities();
    return !!(legs && core && upper);
}

/** GPS programmes power only after 8 gym-log weeks and classifiable ratios. */
export function canProgramPower() {
    return hasEightWeeksGymHistory() && canClassifyPowerIntensities();
}

export function weeklyPowerGymSlots() {
    const quotas = getSportWeeklyQuotas();
    if (!quotas.power) return 0;
    return canProgramPower() ? POWER_WEEKLY_QUOTA : 0;
}

export function dropPowerBand(band, steps = 1) {
    const order = ['L', 'M', 'H'];
    const i = order.indexOf(band);
    if (i < 0) return 'L';
    return order[Math.max(0, i - steps)];
}

export function applyFatigueToIntensities(intensities, fatigue) {
    const score = Number(fatigue);
    const drop = Number.isFinite(score) && score > 4 ? 1 : 0;
    return {
        legs: dropPowerBand(intensities.legs || 'L', drop),
        core: dropPowerBand(intensities.core || 'L', drop),
        upper: dropPowerBand(intensities.upper || 'L', drop)
    };
}

function hashSeed(str) {
    let h = 2166136261;
    const s = String(str || '');
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function pickSeeded(arr, seed) {
    if (!arr.length) return null;
    return arr[hashSeed(seed) % arr.length];
}

export function isPowerExerciseEligible(name, { requireSquat = true } = {}) {
    const mov = powerMovementForName(name);
    if (!mov) return false;
    if (requireSquat && mov.needsSquat && squatWorkWeightKg() == null) return false;
    return true;
}

export function powerNamesForSlot(slotLabel, band) {
    if (!band) {
        return POWER_MOVEMENTS.filter((m) => m.slot === slotLabel && isPowerExerciseEligible(m.name)).map((m) => m.name);
    }
    const want = band;
    const atBand = POWER_MOVEMENTS.filter((m) => m.slot === slotLabel && m.band === want && isPowerExerciseEligible(m.name));
    if (atBand.length) return atBand.map((m) => m.name);
    // Empty High/Medium pool (core is L-only): step down so the slot still fills
    const order = ['H', 'M', 'L'];
    const start = Math.max(0, order.indexOf(want));
    for (let i = start + 1; i < order.length; i++) {
        const fallback = POWER_MOVEMENTS.filter((m) => m.slot === slotLabel && m.band === order[i] && isPowerExerciseEligible(m.name));
        if (fallback.length) return fallback.map((m) => m.name);
    }
    return POWER_MOVEMENTS.filter((m) => m.slot === slotLabel && isPowerExerciseEligible(m.name)).map((m) => m.name);
}

export function equivalentPowerNames(name) {
    const mov = powerMovementForName(name);
    if (!mov) return [];
    return powerNamesForSlot(mov.slot, mov.band).filter((n) => canon(n) !== canon(name));
}

function weightedJumpLoad() {
    const squat = squatWorkWeightKg();
    if (squat == null) return 0;
    try {
        return roundUpLoad(squat * POWER_SQUAT_JUMP_FRACTION, 'dumbbell');
    } catch (e) {
        return Math.round(squat * POWER_SQUAT_JUMP_FRACTION * 2) / 2;
    }
}

export function powerWorkWeightFor(name) {
    const mov = powerMovementForName(name);
    if (mov?.needsSquat) return weightedJumpLoad();
    return 0;
}

export function buildPowerWarmupAndWorkSets(name, opts = {}) {
    const mov = powerMovementForName(name) || { slot: opts.slotLabel, reps: opts.reps || 5 };
    const slot = opts.slotLabel || mov.slot;
    const workReps = Number(opts.reps != null ? opts.reps : mov.reps) || 5;
    const related = WARMUP_RELATED[slot] || 'Bodyweight reps';
    const halfReps = Math.max(1, Math.ceil(workReps / 2));
    const workWeight = opts.workWeight != null ? Number(opts.workWeight) : powerWorkWeightFor(name);
    const rest = opts.restSec != null ? Number(opts.restSec) : POWER_REST_SEC;
    const wu1Rest = opts.warmup1RestSec != null ? Number(opts.warmup1RestSec) : POWER_WARMUP1_REST_SEC;
    const wu2Rest = opts.warmup2RestSec != null ? Number(opts.warmup2RestSec) : POWER_WARMUP2_REST_SEC;
    const sets = [];
    sets.push({
        weight: 0,
        reps: 5,
        rpe: '',
        completed: false,
        isWarmup: true,
        hideRir: true,
        restTime: wu1Rest,
        partName: `Warmup · ${related}`,
        notes: `5 reps · ${related}`
    });
    sets.push({
        weight: workWeight,
        reps: halfReps,
        rpe: '',
        completed: false,
        isWarmup: true,
        hideRir: true,
        restTime: wu2Rest,
        partName: 'Warmup · Technique',
        notes: LOWER_INTENSITY_NOTE
    });
    for (let i = 0; i < POWER_SETS; i++) {
        const isLastWork = i === POWER_SETS - 1;
        sets.push({
            weight: workWeight,
            reps: workReps,
            rpe: '',
            completed: false,
            isWarmup: false,
            hideRir: true,
            restTime: isLastWork ? 0 : rest,
            prevWeight: workWeight
        });
    }
    return sets;
}

function todayIso() {
    const x = new Date();
    const y = x.getFullYear();
    const m = String(x.getMonth() + 1).padStart(2, '0');
    const d = String(x.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/**
 * @param {{ fatigue?: number, dateIso?: string, allowUnclassified?: boolean }} [opts]
 */
export function buildPowerSessionRoutine(opts = {}) {
    const allowUnclassified = opts.allowUnclassified !== false;
    const classified = classifyPowerIntensities();
    const base = {
        legs: classified.legs || (allowUnclassified ? 'L' : null),
        core: classified.core || (allowUnclassified ? 'L' : null),
        upper: classified.upper || (allowUnclassified ? 'L' : null)
    };
    if (!base.legs || !base.core || !base.upper) {
        return { ok: false, reason: 'classify', items: [], intensities: classified };
    }
    const intensities = applyFatigueToIntensities(base, opts.fatigue);
    const dateIso = opts.dateIso || todayIso();
    const items = [];
    const slots = [
        { slot: POWER_SLOT_BILATERAL, region: 'legs' },
        { slot: POWER_SLOT_UNILATERAL, region: 'legs' },
        { slot: POWER_SLOT_CORE, region: 'core' },
        { slot: POWER_SLOT_PUSH, region: 'upper' },
        { slot: POWER_SLOT_PULL, region: 'upper' }
    ];
    slots.forEach(({ slot, region }) => {
        const band = intensities[region] || 'L';
        const names = powerNamesForSlot(slot, band);
        const pick = pickSeeded(names, `${dateIso}|${slot}|${band}|${opts.fatigue || 0}`);
        if (!pick) return;
        const mov = powerMovementForName(pick);
        const workWeight = powerWorkWeightFor(pick);
        items.push({
            name: pick,
            slotLabel: slot,
            powerSlot: slot,
            powerIntensity: mov?.band || band,
            reps: mov?.reps || 5,
            sets: POWER_SETS,
            restSec: POWER_REST_SEC,
            workWeight,
            isPower: true,
            hideRir: true,
            skipHypertrophyWarmup: true,
            notes: MAXIMAL_NOTE
        });
    });
    return {
        ok: items.length === 5,
        items,
        intensities,
        classified,
        note: MAXIMAL_NOTE
    };
}

export function applyPowerExerciseToItem(item, newName) {
    const mov = powerMovementForName(newName);
    if (!item || !mov) return item;
    const workWeight = powerWorkWeightFor(newName);
    item.slotLabel = mov.slot;
    item.powerSlot = mov.slot;
    item.powerIntensity = mov.band;
    item.isPower = true;
    item.hideRir = true;
    item.skipHypertrophyWarmup = true;
    item.note = MAXIMAL_NOTE;
    item.notes = MAXIMAL_NOTE;
    item.plannedSets = POWER_SETS;
    item.sets = buildPowerWarmupAndWorkSets(newName, {
        slotLabel: mov.slot,
        reps: mov.reps,
        workWeight
    });
    return item;
}

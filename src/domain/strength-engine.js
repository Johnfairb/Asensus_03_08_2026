import { store } from '../state/store.js';
import { buildWeeklyTrainingPlan, getMondayISO, isStrengthEvent } from './route-planner.js';
import { AUXILIARY_DICTIONARY, BAND_AUXILIARY_DICTIONARY, SPORT_MATRIX } from './sports-matrix.js';
import { isHypertrophyPhase } from './hypertrophy-engine.js';
import { loadExercises } from '../ui/fuel.js';

// --- STRENGTH ENGINE: movement pools, weights, Session A/B, monthly rotation ---
// Document ratios: flexion bi 4:1:1:1 | uni 1:3 | hinge 8:1:1:1 | lower push 2:1:1:4:1
// upper push 1:4:1 | lower pull 4:1:1:1 | upper pull 2:2:2:1 | core 4:1
export const STRENGTH_MOVEMENT_POOLS = {
    flexion_bilateral: [
        { n: 'Back Squat', w: 4 }, { n: 'Front Squat', w: 1 },
        { n: 'Wide Squat', w: 1 }, { n: 'Safety Bar Squat', w: 1 }
    ],
    flexion_unilateral: [
        { n: 'Bulgarian Split Squat', w: 1 }, { n: 'Split Squat', w: 3 }
    ],
    hinge: [
        { n: 'Deadlift', w: 8 }, { n: 'Single Leg Deadlift', w: 1 },
        { n: 'Trap Bar Deadlift', w: 1 }, { n: 'Romanian Deadlift', w: 1 }
    ],
    lower_push: [
        { n: 'Bench Press', w: 2 }, { n: 'DB Bench Press', w: 1 },
        { n: 'Neutral DB Bench Press', w: 1 }, { n: 'Dips', w: 4 },
        { n: 'Decline Bench Press', w: 1 }
    ],
    upper_push: [
        { n: 'Seated DB Press', w: 1 }, { n: 'Military Press', w: 4 },
        { n: 'Seated Military Press', w: 1 }
    ],
    lower_pull: [
        { n: 'Barbell Row', w: 4 }, { n: 'Single Arm DB Row', w: 1 },
        { n: 'Chest-Supported Row', w: 1 },
        { n: 'Cable Row (Underhand)', w: 1 },
        { n: 'Cable Row (Overhand)', w: 1 },
        { n: 'Cable Row (Neutral)', w: 1 }
    ],
    upper_pull: [
        { n: 'Pull Ups', w: 2 }, { n: 'Chin Ups', w: 2 },
        { n: 'Neutral Chin Ups', w: 2 }, { n: 'Lat Pulldown', w: 1 }
    ],
    core: [
        { n: 'Sidesit', w: 4 }, { n: 'Back Extension', w: 1 }
    ]
};

// Display metadata for My Exercises (domain / movement / laterality)
export const STRENGTH_EXERCISE_META = {
    'Back Squat': { domain: 'strength', movement: 'flexion', laterality: 'Bilateral', muscle_group: 'quad' },
    'Front Squat': { domain: 'strength', movement: 'flexion', laterality: 'Bilateral', muscle_group: 'quad' },
    'Wide Squat': { domain: 'strength', movement: 'flexion', laterality: 'Bilateral', muscle_group: 'quad' },
    'Safety Bar Squat': { domain: 'strength', movement: 'flexion', laterality: 'Bilateral', muscle_group: 'quad' },
    'Bulgarian Split Squat': { domain: 'strength', movement: 'flexion', laterality: 'Unilateral', muscle_group: 'quad' },
    'Split Squat': { domain: 'strength', movement: 'flexion', laterality: 'Unilateral', muscle_group: 'quad' },
    'Deadlift': { domain: 'strength', movement: 'hinge', laterality: 'Bilateral', muscle_group: 'hamstrings' },
    'Single Leg Deadlift': { domain: 'strength', movement: 'hinge', laterality: 'Unilateral', muscle_group: 'hamstrings' },
    'Trap Bar Deadlift': { domain: 'strength', movement: 'hinge', laterality: 'Bilateral', muscle_group: 'hamstrings' },
    'Romanian Deadlift': { domain: 'strength', movement: 'hinge', laterality: 'Bilateral', muscle_group: 'hamstrings' },
    // Push: laterality replaced by dumbbell yes/no | Pull: laterality replaced by grip
    'Bench Press': { domain: 'strength', movement: 'horizontal push', laterality: '', dumbbell: false, grip: '', muscle_group: 'lower_chest' },
    'DB Bench Press': { domain: 'strength', movement: 'horizontal push', laterality: '', dumbbell: true, grip: '', muscle_group: 'lower_chest' },
    'Neutral DB Bench Press': { domain: 'strength', movement: 'horizontal push', laterality: '', dumbbell: true, grip: 'neutral', muscle_group: 'lower_chest' },
    'Dips': { domain: 'strength', movement: 'horizontal push', laterality: '', dumbbell: false, grip: '', muscle_group: 'lower_chest' },
    'Decline Bench Press': { domain: 'strength', movement: 'horizontal push', laterality: '', dumbbell: false, grip: '', muscle_group: 'lower_chest' },
    'Seated DB Press': { domain: 'strength', movement: 'vertical push', laterality: '', dumbbell: true, grip: '', muscle_group: 'shoulders' },
    'Military Press': { domain: 'strength', movement: 'vertical push', laterality: '', dumbbell: false, grip: '', muscle_group: 'shoulders' },
    'Seated Military Press': { domain: 'strength', movement: 'vertical push', laterality: '', dumbbell: false, grip: '', muscle_group: 'shoulders' },
    'Barbell Row': { domain: 'strength', movement: 'horizontal pull', laterality: '', dumbbell: false, grip: 'overhand', muscle_group: 'lats' },
    'Single Arm DB Row': { domain: 'strength', movement: 'horizontal pull', laterality: '', dumbbell: true, grip: 'neutral', muscle_group: 'lats' },
    'Chest-Supported Row': { domain: 'strength', movement: 'horizontal pull', laterality: '', dumbbell: false, grip: 'neutral', muscle_group: 'lats' },
    'Cable Row (Underhand)': { domain: 'strength', movement: 'horizontal pull', laterality: '', dumbbell: false, grip: 'underhand', muscle_group: 'lats' },
    'Cable Row (Overhand)': { domain: 'strength', movement: 'horizontal pull', laterality: '', dumbbell: false, grip: 'overhand', muscle_group: 'lats' },
    'Cable Row (Neutral)': { domain: 'strength', movement: 'horizontal pull', laterality: '', dumbbell: false, grip: 'neutral', muscle_group: 'lats' },
    'Pull Ups': { domain: 'strength', movement: 'vertical pull', laterality: '', dumbbell: false, grip: 'overhand', muscle_group: 'lats' },
    'Chin Ups': { domain: 'strength', movement: 'vertical pull', laterality: '', dumbbell: false, grip: 'underhand', muscle_group: 'lats' },
    'Neutral Chin Ups': { domain: 'strength', movement: 'vertical pull', laterality: '', dumbbell: false, grip: 'neutral', muscle_group: 'lats' },
    'Lat Pulldown': { domain: 'strength', movement: 'vertical pull', laterality: '', dumbbell: false, grip: 'overhand', muscle_group: 'lats' },
    'Sidesit': { domain: 'strength', movement: 'core', laterality: '', muscle_group: 'ql' },
    'Back Extension': { domain: 'strength', movement: 'core', laterality: '', muscle_group: 'core' },
    // Hypertrophy isolations
    'Bicep Curls': { domain: 'lifting', movement: 'bicep isolation', laterality: '', muscle_group: 'biceps' },
    'French Press': { domain: 'lifting', movement: 'tricep isolation', laterality: '', muscle_group: 'triceps' },
    'Calf Raises': { domain: 'lifting', movement: 'calf isolation', laterality: 'Bilateral', muscle_group: 'calves' },
    'Adductor Machine': { domain: 'lifting', movement: 'groin isolation', laterality: '', muscle_group: 'groin' },
    'Abductor Machine': { domain: 'lifting', movement: 'abductor isolation', laterality: '', muscle_group: 'glute' },
    'Quad Extension': { domain: 'lifting', movement: 'quad isolation', laterality: '', muscle_group: 'quad' },
    'Hamstring Curl': { domain: 'lifting', movement: 'hamstring isolation', laterality: '', muscle_group: 'hamstrings' },
    'Reverse Flyes': { domain: 'lifting', movement: 'rear delt isolation', laterality: '', muscle_group: 'shoulders' },
    'Front Raises': { domain: 'lifting', movement: 'front delt isolation', laterality: '', muscle_group: 'shoulders' },
    'Lateral Raises': { domain: 'lifting', movement: 'side delt isolation', laterality: '', muscle_group: 'shoulders' },
    'Flexion': { domain: 'lifting', movement: 'grip isolation', laterality: '', muscle_group: 'forearm' },
    'Shrugs': { domain: 'lifting', movement: 'upper trap isolation', laterality: 'Bilateral', muscle_group: 'traps' },
    'Pec Flyes': { domain: 'lifting', movement: 'pec isolation', laterality: '', muscle_group: 'lower_chest' }
};

// Session A: hinge + upper push + lower pull + unilateral flexion
// Session B: bilateral flexion + upper pull + lower push + core
export const STRENGTH_SESSION_SLOTS = {
    A: [
        { pool: 'hinge', label: 'Hinge' },
        { pool: 'upper_push', label: 'Upper Push' },
        { pool: 'lower_pull', label: 'Lower Pull' },
        { pool: 'flexion_unilateral', label: 'Unilateral Flexion' }
    ],
    B: [
        { pool: 'flexion_bilateral', label: 'Bilateral Flexion' },
        { pool: 'upper_pull', label: 'Upper Pull' },
        { pool: 'lower_push', label: 'Lower Push' },
        { pool: 'core', label: 'Core' }
    ]
};

export function getStrengthWeightedPick(options) {
    let total = options.reduce((sum, opt) => sum + opt.w, 0);
    let r = Math.random() * total;
    let current = 0;
    for (let opt of options) {
        current += opt.w;
        if (r <= current) return opt.n;
    }
    return options[options.length - 1].n;
}

export function getStrengthMonthKey() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

export function pickStrengthPoolExercise(poolId, overrides = {}) {
    const options = (STRENGTH_MOVEMENT_POOLS[poolId] || []).map(o => ({ ...o }));
    if (!options.length) return 'Unknown';

    if (poolId === 'upper_push' && overrides.shoulderRisk) return 'Seated DB Press';
    if (poolId === 'lower_pull' && overrides.armImbalance) return 'Single Arm DB Row';
    if (poolId === 'upper_pull' && overrides.noPullups) return 'Lat Pulldown';

    const month = getStrengthMonthKey();
    let store = {};
    try { store = JSON.parse(localStorage.getItem('ascensus_strength_month_picks') || '{}'); } catch (e) { store = {}; }

    if (store.month !== month) {
        store = { month };
    }

    if (store[poolId] && options.some(o => o.n === store[poolId])) {
        return store[poolId];
    }

    const pick = getStrengthWeightedPick(options);
    store[poolId] = pick;
    localStorage.setItem('ascensus_strength_month_picks', JSON.stringify(store));
    return pick;
}

export function resolveStrengthSession(focus) {
    if (!focus || typeof focus !== 'string') return null;
    if (/Strength\s*A/i.test(focus) || focus.endsWith(' A')) return 'A';
    if (/Strength\s*B/i.test(focus) || focus.endsWith(' B')) return 'B';
    if (focus.includes('Strength')) {
        return (localStorage.getItem('ascensus_strength_ab') === 'B') ? 'B' : 'A';
    }
    return null;
}

export function isStrengthFocus(focus) {
    return typeof focus === 'string' && (focus.includes('Strength') || focus.includes('Hypertrophy'));
}

export function buildStrengthSessionRoutine(focus, sportData, setBudget) {
    const session = resolveStrengthSession(focus) || 'A';
    const slots = STRENGTH_SESSION_SLOTS[session];
    const overrides = {
        shoulderRisk: !!(sportData && sportData.shoulder),
        armImbalance: !!(sportData && sportData.arm_imbalance),
        noPullups: store.userConfig.canDoPullups === 'No'
    };
    const prefs = typeof getGymPlanPrefs === 'function' ? getGymPlanPrefs() : null;
    const budget = setBudget || (prefs && prefs.setBudget) || 12;
    const split = getStrengthSetSplit(session, budget);
    return {
        session,
        setBudget: budget,
        items: slots.map((slot, i) => ({
            name: pickStrengthPoolExercise(slot.pool, overrides),
            slotLabel: slot.label,
            notes: `Session ${session} · ${slot.label} · ${split[i]} sets`,
            sets: split[i],
            setsOverride: split[i]
        }))
    };
}

export function getStrengthSetSplit(session, totalSets) {
    // Session A: Hinge + Upper Push get more at 10/14
    // Session B: Flexion + Upper Pull get more at 10/14
    const n = Number(totalSets) || 12;
    if (n <= 10) return [3, 3, 2, 2];
    if (n <= 12) return [3, 3, 3, 3];
    return [4, 4, 3, 3];
}

export function getGymPlanPrefs() {
    // Prefer live Algorithms UI when present, then saved config, then lifestyle Days/Wk
    const domWill = document.getElementById('set-gym-willingness');
    const domTime = document.getElementById('set-max-gym-time');
    const domBand = document.getElementById('toggle-band-auxiliary');

    let willingnessRaw = store.userConfig.gymWillingness;
    if (domWill && domWill.value !== '') willingnessRaw = domWill.value;
    else if (willingnessRaw == null || willingnessRaw === '') willingnessRaw = store.userConfig.trainingFreq;

    const willingness = Math.min(6, Math.max(1, parseInt(willingnessRaw, 10) || 4));
    // Prefer saved config if DOM checkbox exists but may be stale mid-boot; DOM wins after user toggles
    const band = domBand ? !!domBand.checked : !!store.userConfig.bandAuxiliary;
    // Keep store.userConfig in sync whenever we read live DOM
    if (domBand) store.userConfig.bandAuxiliary = band;

    const maxTimeRaw = (domTime && domTime.value !== '') ? domTime.value : store.userConfig.maxGymTime;
    const maxTime = parseInt(maxTimeRaw, 10) || 90;

    const MAX_AUX_PER_WEEK = 2;
    let strengthCount;
    let auxCount;
    if (band) {
        // Band aux does not consume a gym day → strength = days willing (max 4), always 2 aux (capped)
        auxCount = MAX_AUX_PER_WEEK;
        strengthCount = Math.min(4, willingness);
    } else {
        const table = {
            1: { s: 1, a: 0 },
            2: { s: 2, a: 0 },
            3: { s: 2, a: 1 },
            4: { s: 3, a: 1 },
            5: { s: 3, a: 2 },
            6: { s: 4, a: 2 }
        };
        const row = table[willingness] || table[4];
        strengthCount = row.s;
        auxCount = row.a;
    }
    // Hard cap — band and gym aux alike
    auxCount = Math.min(MAX_AUX_PER_WEEK, Math.max(0, auxCount));

    // Hypertrophy has no auxiliary track — hide from prefs + planners
    if (isHypertrophyPhase()) {
        auxCount = 0;
    }

    let setBudget = 10;
    if (maxTime >= 90) setBudget = 14;
    else if (maxTime >= 75) setBudget = 12;

    // Gym aux: attach when < 6 gym days OR long sessions.
    // Band aux: can be done anywhere — only attach when long gym time explicitly allows it.
    const preferAttach = band
        ? (maxTime >= 105)
        : (willingness < 6 || maxTime >= 105);
    let attachMode = 'none';
    if (preferAttach && auxCount > 0) {
        if (maxTime >= 120) attachMode = 'full';
        else if (maxTime >= 105) attachMode = 'half';
        else attachMode = 'full';
    }
    const separateAuxDays = attachMode === 'none' ? auxCount : 0;

    return {
        willingness, band, maxTime, strengthCount, auxCount,
        setBudget, attachMode, separateAuxDays, preferAttach,
        maxAuxPerWeek: MAX_AUX_PER_WEEK
    };
}

export function buildAuxiliaryExerciseList(sportData) {
    if (isHypertrophyPhase()) return [];
    const prefs = (typeof getGymPlanPrefs === 'function') ? getGymPlanPrefs() : { band: !!store.userConfig.bandAuxiliary };
    const band = !!prefs.band;
    const dict = band ? BAND_AUXILIARY_DICTIONARY : AUXILIARY_DICTIONARY;
    const items = [];

    if (store.userConfig.injury === 'Shoulder') {
        items.push({
            name: band ? 'Band Face Pulls' : 'Face Pulls',
            notes: 'Injury Protocol: Focus on external rotation.',
            isAux: true
        });
    }
    if (store.userConfig.injury === 'Knee') {
        items.push({
            name: band ? 'Band Terminal Knee Extensions' : 'Terminal Knee Extensions',
            notes: 'Injury Protocol: VMO activation.',
            isAux: true
        });
    }
    if (store.userConfig.injury === 'LowerBack') {
        items.push({
            name: band ? 'Band Bird Dogs' : 'Bird Dogs',
            notes: 'Injury Protocol: Spinal stability.',
            isAux: true
        });
    }
    if (sportData && (sportData.lanky || sportData.knee)) items.push({ name: dict.glute_medius[0], isAux: true });
    if (sportData && sportData.neck) items.push({ name: dict.neck[0], isAux: true });
    if (sportData && sportData.groin) items.push({ name: dict.groin[0], isAux: true });
    if (sportData && sportData.elbow) items.push({ name: dict.elbow[0], isAux: true });
    if (sportData && sportData.lower_back) {
        items.push({ name: band ? 'Band Side Plank Row' : 'Sidesit', isAux: true });
    }
    items.push(
        { name: dict.rotator_cuff[0], isAux: true },
        { name: dict.core[0], isAux: true }
    );
    items.forEach(it => {
        if (band) {
            it.notes = (it.notes ? it.notes + ' · ' : '') + 'Band auxiliary';
            it.isBandAux = true;
        }
        if (typeof it.sets !== 'number') {
            it.sets = 3;
            it.setsOverride = 3;
        }
    });
    return items;
}

export function getAttachedAuxForStrengthDay(dateStr, sportData) {
    if (isHypertrophyPhase()) return [];
    const prefs = getGymPlanPrefs();
    const auxCap = Math.min(2, prefs.auxCount || 0);
    // Band mode keeps Aux as separate timetable days — only fold exercises into
    // strength when session time is long enough (attachMode half/full).
    if (prefs.attachMode === 'none' || auxCap <= 0) return [];
    // When band + attachMode: still allow exercise finisher without requiring
    // an Auxiliary GPS tag on the strength day (timetable stays at 2 Aux max).
    if (prefs.band && prefs.attachMode === 'none') return [];

    const auxItems = buildAuxiliaryExerciseList(sportData || SPORT_MATRIX['None']);
    const weekStart = getMondayISO(new Date(dateStr + 'T12:00:00'));
    const plan = buildWeeklyTrainingPlan(weekStart);
    const strengthDays = plan.filter(d => (d.events || []).some(isStrengthEvent));
    const thisIdx = strengthDays.findIndex(d => d.dateStr === dateStr);
    if (thisIdx < 0) return [];

    // Never attach finisher exercises to more than auxCap strength days
    if (prefs.attachMode === 'half') {
        if (thisIdx >= 2) return [];
        const mid = Math.ceil(auxItems.length / 2);
        return (thisIdx === 0) ? auxItems.slice(0, mid) : auxItems.slice(mid);
    }
    if (thisIdx < auxCap) {
        return auxItems.map(it => ({
            ...it,
            notes: (it.notes ? it.notes + ' · ' : '') + 'Attached after strength'
        }));
    }
    return [];
}

export async function migrateStrengthExerciseLabels() {
    // v5: push/pull criteria + hypertrophy isolations + cable row grip split
    if (localStorage.getItem('ascensus_strength_label_v5') === 'done') return;
    try {
        if (!store.supabaseClient) return;
        const { data: existing, error } = await store.supabaseClient.from('exercise_inventory').select('id, name, domain, muscle_group');
        if (error) throw error;

        const norm = (n) => String(n || '').trim().toLowerCase().replace(/\s+/g, ' ');
        const aliases = { 'side sit': 'Sidesit' };

        // Rename legacy aliases first
        for (const ex of (existing || [])) {
            const aliasTarget = aliases[norm(ex.name)];
            if (aliasTarget && ex.name !== aliasTarget) {
                const targetExists = (existing || []).some(e => e.id !== ex.id && norm(e.name) === norm(aliasTarget));
                if (targetExists) {
                    await store.supabaseClient.from('exercise_inventory').delete().eq('id', ex.id);
                } else {
                    await store.supabaseClient.from('exercise_inventory')
                        .update({ name: aliasTarget, domain: 'strength', muscle_group: 'ql' })
                        .eq('id', ex.id);
                    ex.name = aliasTarget;
                }
            }
        }

        // Split legacy "Cable Row" into three grip variants
        const cableLegacy = (existing || []).find(e => norm(e.name) === 'cable row');
        if (cableLegacy) {
            await store.supabaseClient.from('exercise_inventory')
                .update({ name: 'Cable Row (Overhand)', domain: 'strength', muscle_group: 'lats' })
                .eq('id', cableLegacy.id);
            cableLegacy.name = 'Cable Row (Overhand)';
        }

        const { data: afterAlias } = await store.supabaseClient.from('exercise_inventory').select('id, name, domain, muscle_group');
        const byName = {};
        (afterAlias || []).forEach(ex => { byName[ex.name] = ex; });

        for (const [name, meta] of Object.entries(STRENGTH_EXERCISE_META)) {
            const row = byName[name];
            if (row) {
                if (row.domain !== meta.domain || row.muscle_group !== meta.muscle_group) {
                    await store.supabaseClient.from('exercise_inventory')
                        .update({ domain: meta.domain, muscle_group: meta.muscle_group })
                        .eq('id', row.id);
                }
            } else {
                const existingNorm = (afterAlias || []).find(e => norm(e.name) === norm(name));
                if (existingNorm) {
                    await store.supabaseClient.from('exercise_inventory')
                        .update({ name, domain: meta.domain, muscle_group: meta.muscle_group })
                        .eq('id', existingNorm.id);
                } else {
                    await store.supabaseClient.from('exercise_inventory').insert({
                        name,
                        domain: meta.domain,
                        muscle_group: meta.muscle_group
                    });
                }
            }
        }

        await dedupeExerciseInventory();

        localStorage.setItem('ascensus_strength_label_v5', 'done');
        localStorage.setItem('ascensus_strength_label_v4', 'done');
        localStorage.setItem('ascensus_strength_label_v3', 'done');
        if (typeof loadExercises === 'function') await loadExercises();
    } catch (e) {
        console.warn('Strength label migration skipped:', e);
    }
}

export async function dedupeExerciseInventory() {
    if (!store.supabaseClient) return;
    const { data, error } = await store.supabaseClient.from('exercise_inventory').select('id, name, domain, muscle_group');
    if (error || !data) return;

    const norm = (n) => String(n || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const groups = {};
    data.forEach(ex => {
        const key = norm(ex.name);
        if (!groups[key]) groups[key] = [];
        groups[key].push(ex);
    });

    const preferScore = (ex) => {
        let s = 0;
        if (ex.domain === 'strength') s += 3;
        if (STRENGTH_EXERCISE_META[ex.name]) s += 2;
        return s;
    };

    for (const key of Object.keys(groups)) {
        const rows = groups[key];
        if (rows.length < 2) continue;
        rows.sort((a, b) => preferScore(b) - preferScore(a) || a.id - b.id);
        const keep = rows[0];
        // Prefer canonical document spelling when available
        const canonical = Object.keys(STRENGTH_EXERCISE_META).find(n => norm(n) === key);
        if (canonical && keep.name !== canonical) {
            const meta = STRENGTH_EXERCISE_META[canonical];
            await store.supabaseClient.from('exercise_inventory')
                .update({ name: canonical, domain: meta.domain, muscle_group: meta.muscle_group })
                .eq('id', keep.id);
        }
        for (let i = 1; i < rows.length; i++) {
            await store.supabaseClient.from('exercise_inventory').delete().eq('id', rows[i].id);
        }
    }
}
setTimeout(migrateStrengthExerciseLabels, 2500);


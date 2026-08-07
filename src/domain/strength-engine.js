import { store } from '../state/store.js';
import { buildWeeklyTrainingPlan, getMondayISO, isStrengthEvent } from './route-planner.js';
import { AUXILIARY_DICTIONARY, BAND_AUXILIARY_DICTIONARY, SPORT_MATRIX } from './sports-matrix.js';
import { HYPERTROPHY_POOLS, isHypertrophyPhase } from './hypertrophy-engine.js';
import { resolveProgrammedBwName } from './bodyweight-lifts.js';
import { buildStrengthMetaMap, EXERCISE_CATALOG } from './exercise-catalog.js';
import { skipsWeightProgression } from './load-increments.js';
import { loadExercises } from '../ui/fuel.js';
import { getBillingMonthKey } from './billing-month.js';

// --- STRENGTH ENGINE: compounds A/B, isolations, core circuits, monthly rotation ---
// Compound exercise lists come from HYPERTROPHY_POOLS (uniform pick; no weightings).
// Push slots merge DB + BB lists — no dumbbell/barbell split when programming strength.

/** Slot layout only — exercise lists resolved from HYPERTROPHY_POOLS via `pools`. */
export const STRENGTH_COMPOUND_SLOTS = {
    bilateral_posterior: {
        label: 'Bilateral Posterior',
        pools: ['posterior_bilateral']
    },
    bilateral_anterior: {
        label: 'Bilateral Anterior',
        pools: ['anterior_bilateral']
    },
    unilateral_legs: {
        label: 'Unilateral Legs',
        pools: ['anterior_unilateral', 'posterior_unilateral']
    },
    horizontal_pull: {
        label: 'Horizontal Pull',
        pools: ['horizontal_pull']
    },
    horizontal_push: {
        label: 'Horizontal Push',
        // Merged DB + BB (hypertrophy keeps the split for its own preferDb logic)
        pools: ['horizontal_push_db', 'horizontal_push_bb']
    },
    vertical_pull: {
        label: 'Vertical Pull',
        pools: ['vertical_pull']
    },
    vertical_push: {
        label: 'Vertical Push',
        pools: ['vertical_push_db', 'vertical_push_bb']
    }
};

/** Resolve flat exercise name list for a strength compound slot. */
export function compoundPoolForSlot(slotId) {
    const slot = STRENGTH_COMPOUND_SLOTS[slotId];
    if (!slot) return [];
    const names = [];
    for (const key of slot.pools || []) {
        for (const n of (HYPERTROPHY_POOLS[key] || [])) {
            if (n && !names.includes(n)) names.push(n);
        }
    }
    return names;
}

/** @deprecated kept for migrations / legacy callers — unweighted name lists from hypertrophy pools */
export const STRENGTH_MOVEMENT_POOLS = {
    get flexion_bilateral() { return compoundPoolForSlot('bilateral_anterior').map(n => ({ n, w: 1 })); },
    get flexion_unilateral() { return (HYPERTROPHY_POOLS.anterior_unilateral || []).map(n => ({ n, w: 1 })); },
    get hinge() {
        return [
            ...(HYPERTROPHY_POOLS.posterior_bilateral || []),
            ...(HYPERTROPHY_POOLS.posterior_unilateral || [])
        ].map(n => ({ n, w: 1 }));
    },
    get lower_push() { return compoundPoolForSlot('horizontal_push').map(n => ({ n, w: 1 })); },
    get upper_push() { return compoundPoolForSlot('vertical_push').map(n => ({ n, w: 1 })); },
    get lower_pull() { return compoundPoolForSlot('horizontal_pull').map(n => ({ n, w: 1 })); },
    get upper_pull() { return compoundPoolForSlot('vertical_pull').map(n => ({ n, w: 1 })); },
    core: [
        { n: 'Side-sit on Hyperextension Bench', w: 1 }, { n: 'Hyperextension', w: 1 }
    ]
};

export const STRENGTH_EXERCISE_META = buildStrengthMetaMap();

/** Legacy fixed slots — superseded by monthly random A/B assignment. */
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

const MONTH_PLAN_KEY = 'ascensus_strength_month_plan_v8';
const ALL_COMPOUND_IDS = Object.keys(STRENGTH_COMPOUND_SLOTS);

const FALLBACK_ISO_MUSCLES = ['bicep', 'tricep', 'calf', 'side_delt'];

const ISO_POOL_BY_MUSCLE = {
    bicep: 'bicep_isolation',
    tricep: 'tricep_isolation',
    calf: 'calf_isolation',
    side_delt: 'side_delt_isolation',
    quad: 'quad_isolation',
    hamstring: 'hamstring_isolation',
    groin: 'groin_isolation',
    front_delt: 'front_delt_isolation',
    rear_delt: 'rear_delt_isolation',
    pec: 'pec_isolation',
    mid_trap: 'mid_trap_isolation'
};

/** Map sport flags → isolation muscle keys (distinct). */
export function sportPrimaryIsolationMuscles(sportData) {
    const s = sportData || {};
    const out = [];
    const add = (k) => { if (k && !out.includes(k)) out.push(k); };
    if (s.quad || s.knee) add('quad');
    if (s.ham) add('hamstring');
    if (s.groin) add('groin');
    if (s.calf || s.ankle) add('calf');
    if (s.shoulder) add('side_delt');
    if (s.elbow || s.arm_imbalance) add('bicep');
    if (s.lower_back) add('mid_trap');
    return out;
}

export function getStrengthWeightedPick(options) {
    // Legacy helper — treats all options equally when weights are absent/equal.
    if (!options || !options.length) return null;
    const withW = options.map(o => (typeof o === 'string' ? { n: o, w: 1 } : { n: o.n, w: o.w || 1 }));
    let total = withW.reduce((sum, opt) => sum + opt.w, 0);
    let r = Math.random() * total;
    let current = 0;
    for (let opt of withW) {
        current += opt.w;
        if (r <= current) return opt.n;
    }
    return withW[withW.length - 1].n;
}

export function getStrengthMonthKey() {
    // Prefer active monthly workout cycle; else billing anniversary period.
    try {
        const raw = JSON.parse(localStorage.getItem('ascensus_workout_cycle_v1') || 'null');
        if (raw?.startDate) return raw.startDate;
    } catch (e) { /* ignore */ }
    try {
        return getBillingMonthKey();
    } catch (e) {
        const d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    }
}

function shuffleInPlace(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function pickRandomFromList(list, exclude = []) {
    const pool = (list || []).filter(n => !exclude.includes(n));
    if (!pool.length) return (list && list[0]) || 'Unknown';
    return pool[Math.floor(Math.random() * pool.length)];
}

export function getCoreCatalogNames() {
    return Object.entries(EXERCISE_CATALOG || {})
        .filter(([, meta]) => meta && meta.movement === 'core')
        .map(([name]) => name);
}

export function getStrengthTimeTier(maxTime) {
    const t = parseInt(maxTime, 10) || 90;
    if (t <= 60) return 60;
    if (t <= 75) return 75;
    if (t <= 90) return 90;
    return 105;
}

export function strengthSetsForTier(tier, kind) {
    // kind: 'compound' | 'isolation' | 'core'
    // Shortest (60) = abbreviated; each step up matches the old ladder shifted +15
    if (tier <= 75) {
        if (kind === 'core') return tier <= 60 ? 0 : 2;
        return 2;
    }
    if (tier <= 90) return 3;
    // 105
    if (kind === 'compound') return 4;
    if (kind === 'isolation') return 3;
    return 3; // core — never 4
}

export function isStrengthPhase(phase) {
    const p = phase || store.userConfig?.seasonPhase || '';
    const sel = typeof document !== 'undefined' ? document.getElementById('set-season-phase') : null;
    const live = sel?.value || p;
    return live === 'OffSeason_Strength' || live === 'OffSeason_Hybrid';
}

export function isHybridPhase(phase) {
    const p = phase || store.userConfig?.seasonPhase || '';
    const sel = typeof document !== 'undefined' ? document.getElementById('set-season-phase') : null;
    const live = sel?.value || p;
    return live === 'OffSeason_Hybrid';
}

function readHybridSplit(willingness) {
    const total = Math.min(6, Math.max(1, parseInt(willingness, 10) || 4));
    const domS = document.getElementById('set-hybrid-strength-days');
    const domH = document.getElementById('set-hybrid-hypertrophy-days');
    let s = store.userConfig.hybridStrengthDays;
    let h = store.userConfig.hybridHypertrophyDays;
    if (domS && domS.value !== '') s = parseInt(domS.value, 10);
    if (domH && domH.value !== '') h = parseInt(domH.value, 10);
    s = Math.min(4, Math.max(0, parseInt(s, 10) || 0));
    h = Math.max(0, parseInt(h, 10) || 0);
    if (s + h !== total) {
        // Prefer keeping strength days; fill remainder with hypertrophy
        if (s > total) s = Math.min(4, total);
        h = Math.max(0, total - s);
    }
    if (s + h === 0) {
        s = Math.min(4, Math.max(1, total - 1));
        h = Math.max(0, total - s);
    }
    return { strengthDays: s, hypertrophyDays: h, total };
}

function buildFreshMonthPlan(sportData) {
    const slotIds = shuffleInPlace([...ALL_COMPOUND_IDS]);
    // 4 in one session, 3 in the other
    const fourFirst = Math.random() < 0.5;
    const A = fourFirst ? slotIds.slice(0, 4) : slotIds.slice(0, 3);
    const B = fourFirst ? slotIds.slice(4) : slotIds.slice(3);
    shuffleInPlace(A);
    shuffleInPlace(B);
    const coreSession = A.length === 3 ? 'A' : 'B';

    const overrides = {
        shoulderRisk: !!(sportData && sportData.shoulder),
        armImbalance: !!(sportData && sportData.arm_imbalance),
        noPullups: store.userConfig.canDoPullups === 'No'
    };

    const compoundPicks = {};
    for (const id of ALL_COMPOUND_IDS) {
        compoundPicks[id] = pickCompoundForSlot(id, overrides);
    }

    const primaries = sportPrimaryIsolationMuscles(sportData);
    const muscleKeys = [];
    for (const m of primaries) {
        if (muscleKeys.length >= 4) break;
        if (!muscleKeys.includes(m) && ISO_POOL_BY_MUSCLE[m]) muscleKeys.push(m);
    }
    for (const m of FALLBACK_ISO_MUSCLES) {
        if (muscleKeys.length >= 4) break;
        if (!muscleKeys.includes(m)) muscleKeys.push(m);
    }
    while (muscleKeys.length < 4) {
        const m = FALLBACK_ISO_MUSCLES[muscleKeys.length % FALLBACK_ISO_MUSCLES.length];
        if (!muscleKeys.includes(m)) muscleKeys.push(m);
        else break;
    }

    const isoExercisesUsed = [];
    const isolations = muscleKeys.slice(0, 4).map((muscleKey) => {
        const poolName = ISO_POOL_BY_MUSCLE[muscleKey];
        const pool = HYPERTROPHY_POOLS[poolName] || [];
        const name = pickRandomFromList(pool, isoExercisesUsed);
        isoExercisesUsed.push(name);
        return { muscleKey, name, session: null };
    });
    // 2 per session, random assignment, fixed for month
    const isoOrder = shuffleInPlace([0, 1, 2, 3]);
    isolations[isoOrder[0]].session = 'A';
    isolations[isoOrder[1]].session = 'A';
    isolations[isoOrder[2]].session = 'B';
    isolations[isoOrder[3]].session = 'B';

    const corePool = getCoreCatalogNames();
    const coreExercises = [];
    const coreUsed = [];
    for (let i = 0; i < 5; i++) {
        const pick = pickRandomFromList(corePool.length ? corePool : ['Crunch', 'Plank', 'Dead Bug', 'Pallof Press', 'Russian Twist'], coreUsed);
        // Allow catalog repeats across months; within month prefer unique when pool allows
        if (corePool.length >= 5) coreUsed.push(pick);
        coreExercises.push(pick);
    }

    return {
        month: getStrengthMonthKey(),
        sessionA: A,
        sessionB: B,
        coreSession,
        compoundPicks,
        isolations,
        coreExercises
    };
}

function pickCompoundForSlot(slotId, overrides = {}) {
    if (!STRENGTH_COMPOUND_SLOTS[slotId]) return 'Unknown';
    if (slotId === 'vertical_push' && overrides.shoulderRisk) {
        return resolveProgrammedBwName('Seated Dumbbell Shoulder Press');
    }
    if (slotId === 'horizontal_pull' && overrides.armImbalance) {
        return resolveProgrammedBwName('Dumbbell Row');
    }
    if (slotId === 'vertical_pull' && overrides.noPullups) {
        return resolveProgrammedBwName('Lat Machine Pull');
    }
    const pick = pickRandomFromList(compoundPoolForSlot(slotId));
    return resolveProgrammedBwName(pick);
}

export function saveStrengthMonthPlan(plan) {
    try { localStorage.setItem(MONTH_PLAN_KEY, JSON.stringify(plan)); } catch (e) { /* ignore */ }
    return plan;
}

export function loadStrengthMonthPlan(sportData) {
    const month = getStrengthMonthKey();
    let plan = null;
    try { plan = JSON.parse(localStorage.getItem(MONTH_PLAN_KEY) || 'null'); } catch (e) { plan = null; }
    if (!plan || plan.month !== month || !Array.isArray(plan.sessionA) || !Array.isArray(plan.sessionB)) {
        plan = buildFreshMonthPlan(sportData || SPORT_MATRIX[store.userConfig.sport] || SPORT_MATRIX.None);
        plan.month = month;
        saveStrengthMonthPlan(plan);
        return plan;
    }
    return plan;
}

/**
 * Re-roll compounds + isolations for one strength session (A or B) while keeping the other.
 */
export function rebuildStrengthSessionInPlan(plan, session, sportData) {
    const sport = sportData || SPORT_MATRIX[store.userConfig.sport] || SPORT_MATRIX.None;
    const overrides = {
        shoulderRisk: !!(sport && sport.shoulder),
        armImbalance: !!(sport && sport.arm_imbalance),
        noPullups: store.userConfig.canDoPullups === 'No'
    };
    const next = JSON.parse(JSON.stringify(plan || loadStrengthMonthPlan(sport)));
    const slotIds = session === 'B' ? [...(next.sessionB || [])] : [...(next.sessionA || [])];
    slotIds.forEach((slotId) => {
        next.compoundPicks = next.compoundPicks || {};
        next.compoundPicks[slotId] = pickCompoundForSlot(slotId, overrides);
    });

    const otherSession = session === 'B' ? 'A' : 'B';
    const keepIsos = (next.isolations || []).filter((iso) => iso.session === otherSession);
    const primaries = sportPrimaryIsolationMuscles(sport);
    const muscleKeys = [];
    for (const m of primaries) {
        if (muscleKeys.length >= 2) break;
        if (!muscleKeys.includes(m) && ISO_POOL_BY_MUSCLE[m]) muscleKeys.push(m);
    }
    for (const m of FALLBACK_ISO_MUSCLES) {
        if (muscleKeys.length >= 2) break;
        if (!muscleKeys.includes(m)) muscleKeys.push(m);
    }
    const usedNames = keepIsos.map((i) => i.name);
    const newIsos = muscleKeys.slice(0, 2).map((muscleKey) => {
        const poolName = ISO_POOL_BY_MUSCLE[muscleKey];
        const pool = HYPERTROPHY_POOLS[poolName] || [];
        const name = pickRandomFromList(pool, usedNames);
        usedNames.push(name);
        return { muscleKey, name, session };
    });
    next.isolations = [...keepIsos, ...newIsos];

    if (next.coreSession === session) {
        const corePool = getCoreCatalogNames();
        const coreExercises = [];
        const coreUsed = [];
        for (let i = 0; i < 5; i++) {
            const pick = pickRandomFromList(corePool.length ? corePool : ['Crunch', 'Plank', 'Dead Bug', 'Pallof Press', 'Russian Twist'], coreUsed);
            if (corePool.length >= 5) coreUsed.push(pick);
            coreExercises.push(pick);
        }
        next.coreExercises = coreExercises;
    }

    next.month = getStrengthMonthKey();
    return next;
}

export function pickStrengthPoolExercise(poolId, overrides = {}) {
    // Legacy API — map old pool ids onto new slots when possible
    const map = {
        hinge: 'bilateral_posterior',
        flexion_bilateral: 'bilateral_anterior',
        flexion_unilateral: 'unilateral_legs',
        lower_push: 'horizontal_push',
        upper_push: 'vertical_push',
        lower_pull: 'horizontal_pull',
        upper_pull: 'vertical_pull'
    };
    const slotId = map[poolId] || poolId;
    if (STRENGTH_COMPOUND_SLOTS[slotId]) {
        const plan = loadStrengthMonthPlan();
        if (plan.compoundPicks && plan.compoundPicks[slotId]) {
            return resolveProgrammedBwName(plan.compoundPicks[slotId]);
        }
        return pickCompoundForSlot(slotId, overrides);
    }
    const options = (STRENGTH_MOVEMENT_POOLS[poolId] || []).map(o => ({ ...o }));
    if (!options.length) return 'Unknown';
    return resolveProgrammedBwName(getStrengthWeightedPick(options));
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

/**
 * Build Session A or B: compounds → isolations → core (when applicable).
 */
export function buildStrengthSessionRoutine(focus, sportData, setBudget) {
    const session = resolveStrengthSession(focus) || 'A';
    const prefs = typeof getGymPlanPrefs === 'function' ? getGymPlanPrefs() : null;
    const maxTime = (prefs && prefs.maxTime) || store.userConfig.maxGymTime || 90;
    const tier = getStrengthTimeTierFromPrefs(prefs, maxTime, setBudget);

    // Custom / confirmed cycle override for this strength session
    try {
        const plans = JSON.parse(localStorage.getItem('ascensus_cycle_session_plans_v1') || '{}');
        const locked = plans && plans[`strength_${session}`];
        if (locked?.source === 'custom' && Array.isArray(locked.items) && locked.items.length) {
            const compoundSets = strengthSetsForTier(tier, 'compound');
            const items = locked.items.map((it) => {
                const name = it.exercise?.name || it.name;
                if (!name) return null;
                const workSets = (it.sets || []).filter((s) => s && !s.isWarmup && !s.isText);
                return {
                    name,
                    slotLabel: it.slotLabel || 'Custom',
                    notes: 'Custom cycle workout',
                    sets: workSets.length || it.plannedSets || compoundSets,
                    setsOverride: workSets.length || it.plannedSets || compoundSets,
                    isIsolation: !!it.isIsolation,
                    isExtra: !!it.isExtra,
                    isStrengthCompound: !it.isIsolation,
                    role: it.isIsolation ? 'isolation' : 'compound',
                    targetReps: it.isIsolation ? 8 : 5,
                    restSec: it.isIsolation ? 120 : 240
                };
            }).filter(Boolean);
            return { session, setBudget: setBudget || compoundSets * Math.max(1, items.length), timeTier: tier, items, source: 'custom' };
        }
        if (locked?.exercisesConfirmed && Array.isArray(locked.lockedItems) && locked.lockedItems.length) {
            const compoundSets = strengthSetsForTier(tier, 'compound');
            const items = locked.lockedItems
                .filter((it) => it && (it.exercise?.name || it.name) && !it.isWarmupGroup && !it.isStretchGroup && !it.isCoreBlock)
                .map((it) => {
                    const name = it.exercise?.name || it.name;
                    const workSets = (it.sets || []).filter((s) => s && !s.isWarmup && !s.isText);
                    return {
                        name,
                        slotLabel: it.slotLabel || null,
                        notes: it.note || it.notes || 'Confirmed for this month',
                        sets: workSets.length || it.plannedSets || compoundSets,
                        setsOverride: workSets.length || it.plannedSets || compoundSets,
                        isIsolation: !!it.isIsolation,
                        isExtra: !!it.isExtra,
                        isStrengthCompound: !!it.isStrengthCompound || !it.isIsolation,
                        isStrengthIsolation: !!it.isStrengthIsolation,
                        role: it.role || (it.isIsolation ? 'isolation' : 'compound'),
                        targetReps: it.isIsolation ? 8 : 5,
                        restSec: it.isIsolation ? 120 : 240
                    };
                });
            // Re-attach core block if present in locked items
            locked.lockedItems.filter((it) => it?.isCoreBlock).forEach((it) => {
                items.push({
                    name: 'Core Circuit',
                    slotLabel: 'Core',
                    notes: it.note || it.notes || '',
                    sets: it.plannedSets || (it.sets || []).length || 1,
                    setsOverride: it.plannedSets || (it.sets || []).length || 1,
                    isCoreBlock: true,
                    coreExercises: it.coreExercises || [],
                    role: 'core',
                    restSec: 60
                });
            });
            return { session, setBudget: setBudget || compoundSets * Math.max(1, items.length), timeTier: tier, items, source: 'confirmed' };
        }
    } catch (e) { /* generated path */ }

    const plan = loadStrengthMonthPlan(sportData);
    const includeUnilateral = tier > 60;
    const includeCore = tier > 60;

    let slotIds = resolveSessionCompoundSlots(plan, session, includeUnilateral);

    const compoundSets = strengthSetsForTier(tier, 'compound');
    const isoSets = strengthSetsForTier(tier, 'isolation');
    const coreSets = includeCore ? strengthSetsForTier(tier, 'core') : 0;

    const items = [];
    slotIds.forEach((slotId) => {
        const meta = STRENGTH_COMPOUND_SLOTS[slotId];
        if (!meta) return;
        const name = resolveProgrammedBwName(
            (plan.compoundPicks && plan.compoundPicks[slotId]) || pickCompoundForSlot(slotId)
        );
        items.push({
            name,
            slotLabel: meta.label,
            notes: `Session ${session} · ${meta.label} · ${compoundSets} sets`,
            sets: compoundSets,
            setsOverride: compoundSets,
            isIsolation: false,
            isStrengthCompound: true,
            role: 'compound'
        });
    });

    const sessionIsos = (plan.isolations || []).filter(iso => iso.session === session);
    sessionIsos.forEach((iso) => {
        items.push({
            name: resolveProgrammedBwName(iso.name),
            slotLabel: `Isolation · ${iso.muscleKey}`,
            notes: `Session ${session} · Isolation · ${isoSets}×8 (6–10) · 2 min rest`,
            sets: isoSets,
            setsOverride: isoSets,
            isIsolation: true,
            isStrengthIsolation: true,
            role: 'isolation',
            muscleKey: iso.muscleKey,
            targetReps: 8,
            repMin: 6,
            repMax: 10,
            restSec: 120
        });
    });

    const coreOnThis = includeCore && plan.coreSession === session && coreSets > 0;
    if (coreOnThis) {
        const coreExercises = (plan.coreExercises && plan.coreExercises.length)
            ? plan.coreExercises.slice(0, 5)
            : getCoreCatalogNames().slice(0, 5);
        items.push({
            name: 'Core Circuit',
            slotLabel: 'Core',
            notes: `Session ${session} · Core · ${coreSets} set(s) · 5 exercises × 20 reps · no rest between exercises · 1 min between sets`,
            sets: coreSets,
            setsOverride: coreSets,
            isCoreBlock: true,
            isIsolation: false,
            role: 'core',
            coreExercises,
            restSec: 60
        });
    }

    return {
        session,
        setBudget: setBudget || (prefs && prefs.setBudget) || compoundSets * Math.max(1, slotIds.length),
        timeTier: tier,
        items
    };
}

/** Resolve A/B compound slot lists; at 60 min drop unilateral and force 3+3. */
function resolveSessionCompoundSlots(plan, session, includeUnilateral) {
    let a = [...(plan.sessionA || [])];
    let b = [...(plan.sessionB || [])];
    if (!includeUnilateral) {
        a = a.filter(id => id !== 'unilateral_legs');
        b = b.filter(id => id !== 'unilateral_legs');
        // Rebalance to 3+3
        while (a.length > 3 && b.length < 3) b.push(a.pop());
        while (b.length > 3 && a.length < 3) a.push(b.pop());
        const used = new Set([...a, ...b]);
        for (const id of ALL_COMPOUND_IDS) {
            if (id === 'unilateral_legs' || used.has(id)) continue;
            if (a.length < 3) { a.push(id); used.add(id); }
            else if (b.length < 3) { b.push(id); used.add(id); }
        }
        a = a.slice(0, 3);
        b = b.slice(0, 3);
    }
    return session === 'B' ? b : a;
}

function getStrengthTimeTierFromPrefs(prefs, maxTime, setBudget) {
    if (prefs && prefs.timeTier) return prefs.timeTier;
    // Legacy setBudget mapping if someone still passes 10/12/14
    if (setBudget != null && !prefs) {
        if (setBudget <= 10) return 75;
        if (setBudget <= 12) return 90;
        return 105;
    }
    return getStrengthTimeTier(maxTime);
}

/** @deprecated — set counts now come from time tier */
export function getStrengthSetSplit(session, totalSets) {
    const n = Number(totalSets) || 12;
    if (n <= 10) return [3, 3, 2, 2];
    if (n <= 12) return [3, 3, 3, 3];
    return [4, 4, 3, 3];
}

/**
 * Progress isolation load when last session: set 1 ≥ 8 and every work set in 6–10.
 */
export function progressStrengthIsolationWeight(exName, hist, currentWeight, equipmentRound) {
    if (skipsWeightProgression(exName)) return { weight: currentWeight, note: '' };
    const name = String(exName || '').toLowerCase();
    const logs = (hist || []).filter(l => String(l.exercise || '').toLowerCase() === name);
    if (!logs.length) return { weight: currentWeight, note: '' };

    const dayKey = (l) => l.created_at || l.date || l.day || '';
    const days = [...new Set(logs.map(dayKey).filter(Boolean))];
    if (!days.length) return { weight: currentWeight, note: '' };
    const latestDay = days[0];
    const daySets = logs.filter(l => dayKey(l) === latestDay && Number(l.reps) > 0);
    // Prefer chronological order if set index exists
    daySets.sort((a, b) => (Number(a.sets) || 0) - (Number(b.sets) || 0));
    if (daySets.length < 1) return { weight: currentWeight, note: '' };

    const reps = daySets.map(l => Number(l.reps) || 0);
    const firstOk = reps[0] >= 8;
    const allInRange = reps.every(r => r >= 6 && r <= 10);
    if (!firstOk || !allInRange) return { weight: currentWeight, note: '' };

    const step = typeof equipmentRound === 'function'
        ? null
        : 2.5;
    let next = Number(currentWeight) || 0;
    if (typeof equipmentRound === 'function') {
        next = equipmentRound(next + 2.5);
    } else {
        next = Math.round((next + step) * 2) / 2;
    }
    return {
        weight: next,
        note: 'AUTO-PROGRESSION: Isolation — first set ≥8 and all sets 6–10. Load increased.'
    };
}

export function getGymPlanPrefs() {
    const domWill = document.getElementById('set-gym-willingness');
    const domTime = document.getElementById('set-max-gym-time');
    const domBand = document.getElementById('toggle-band-auxiliary');

    let willingnessRaw = store.userConfig.gymWillingness;
    if (domWill && domWill.value !== '') willingnessRaw = domWill.value;
    else if (willingnessRaw == null || willingnessRaw === '') willingnessRaw = store.userConfig.trainingFreq;

    const hypertrophy = isHypertrophyPhase();
    const strengthPhase = isStrengthPhase();
    const hybrid = isHybridPhase();

    // Strength / hybrid: no auxiliary. Cap willingness at 4 for pure strength.
    let willingness = Math.min(6, Math.max(1, parseInt(willingnessRaw, 10) || 4));
    if (strengthPhase && !hybrid) {
        willingness = Math.min(4, willingness);
    }

    // Band aux only for non-strength phases that still support it (legacy power/adaptation)
    let band = domBand ? !!domBand.checked : !!store.userConfig.bandAuxiliary;
    if (domBand) store.userConfig.bandAuxiliary = band;
    if (hypertrophy || strengthPhase) {
        band = false;
    }

    const maxTimeRaw = (domTime && domTime.value !== '') ? domTime.value : store.userConfig.maxGymTime;
    const maxTime = parseInt(maxTimeRaw, 10) || 90;
    const timeTier = getStrengthTimeTier(maxTime);

    let strengthCount = 0;
    let hypertrophyCount = 0;
    let auxCount = 0;

    if (hypertrophy) {
        strengthCount = 0;
        hypertrophyCount = willingness;
        auxCount = 0;
    } else if (hybrid) {
        const split = readHybridSplit(willingness);
        strengthCount = split.strengthDays;
        hypertrophyCount = split.hypertrophyDays;
        willingness = split.total;
        auxCount = 0;
        store.userConfig.hybridStrengthDays = strengthCount;
        store.userConfig.hybridHypertrophyDays = hypertrophyCount;
    } else if (strengthPhase) {
        // All gym days are strength; no aux
        strengthCount = willingness;
        hypertrophyCount = 0;
        auxCount = 0;
    } else {
        // Adaptation / Power — keep legacy aux table for those phases
        const MAX_AUX_PER_WEEK = 2;
        if (band) {
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
        auxCount = Math.min(2, Math.max(0, auxCount));
    }

    let setBudget = 10;
    if (timeTier >= 105) setBudget = 14;
    else if (timeTier >= 90) setBudget = 12;
    else setBudget = 10;

    const preferAttach = false;
    const attachMode = 'none';
    const separateAuxDays = 0;

    return {
        willingness,
        band: false,
        maxTime,
        timeTier,
        strengthCount,
        hypertrophyCount,
        auxCount,
        setBudget,
        attachMode,
        separateAuxDays,
        preferAttach,
        maxAuxPerWeek: 0,
        hybrid,
        strengthPhase
    };
}

export function buildAuxiliaryExerciseList(sportData) {
    // Strength + hypertrophy + hybrid: no auxiliary track
    if (isHypertrophyPhase() || isStrengthPhase()) return [];
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
        items.push({ name: band ? 'Band Side Plank Row' : 'Side-sit on Hyperextension Bench', isAux: true });
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
    if (isHypertrophyPhase() || isStrengthPhase()) return [];
    const prefs = getGymPlanPrefs();
    const auxCap = Math.min(2, prefs.auxCount || 0);
    if (prefs.attachMode === 'none' || auxCap <= 0) return [];
    if (prefs.band && prefs.attachMode === 'none') return [];

    const auxItems = buildAuxiliaryExerciseList(sportData || SPORT_MATRIX['None']);
    const weekStart = getMondayISO(new Date(dateStr + 'T12:00:00'));
    const plan = buildWeeklyTrainingPlan(weekStart);
    const strengthDays = plan.filter(d => (d.events || []).some(isStrengthEvent));
    const thisIdx = strengthDays.findIndex(d => d.dateStr === dateStr);
    if (thisIdx < 0) return [];

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
    if (localStorage.getItem('ascensus_strength_label_v7') === 'done') return;
    try {
        if (!store.supabaseClient) return;
        const { data: existing, error } = await store.supabaseClient.from('exercise_inventory').select('id, name, domain, muscle_group');
        if (error) throw error;

        const norm = (n) => String(n || '').trim().toLowerCase().replace(/\s+/g, ' ');
        const aliases = {
            'side sit': 'Side-sit on Hyperextension Bench',
            'sidesit': 'Side-sit on Hyperextension Bench',
            'back squat': 'Squat',
            'wide squat': 'Sumo Squat',
            'bulgarian split squat': 'Bulgarian Squat',
            'trap bar deadlift': 'Rack Deadlift',
            'db bench press': 'Bench Press',
            'neutral db bench press': 'Bench Press',
            'dips': 'Dip',
            'seated db press': 'Seated Dumbbell Shoulder Press',
            'military press': 'Barbell Military Press',
            'seated military press': 'Machine Overhead Press',
            'barbell row': 'Overhand Barbell Row',
            'single arm db row': 'Dumbbell Row',
            'chest-supported row': 'Neutral Cable Row',
            'cable row (underhand)': 'Underhand Cable Row',
            'cable row (overhand)': 'Overhand Cable Row',
            'cable row (neutral)': 'Neutral Cable Row',
            'cable row': 'Overhand Cable Row',
            'pull ups': 'Pull Up',
            'chin ups': 'Chin Up',
            'neutral chin ups': 'Neutral Pull Up',
            'lat pulldown': 'Lat Machine Pull',
            'back extension': 'Hyperextension',
            'bicep curls': 'Dumbbell Curl',
            'french press': 'Cable French Press',
            'cable french press': 'Cable French Press',
            'seated french press': 'Single Overhead Seated French Press',
            'seated one arm french press': 'Single Overhead Seated French Press',
            'one arm french press': 'Single Overhead Seated French Press',
            'single arm french press': 'Single Overhead Seated French Press',
            'overhead french press': 'Single Overhead Seated French Press',
            'single overhead seated french press': 'Single Overhead Seated French Press',
            'calf raises': 'Calf Raise Machine',
            'quad extension': 'Leg Extension',
            'hamstring curl': 'Seated Hamstring Curl',
            'hamstring curls': 'Seated Hamstring Curl',
            'reverse flyes': 'Bent Over Rear Flye',
            'front raises': 'Standing Dumbbell Front Raise',
            'lateral raises': 'Lateral Raise',
            'pec flyes': 'Flye',
            'db pullovers': 'Pullover',
            'roman chair': 'Knee Raise Machine',
            'roman chair knee raise': 'Knee Raise Machine',
            'roman chair leg raise': 'Knee Raise Machine Leg Raise'
        };

        for (const ex of (existing || [])) {
            const aliasTarget = aliases[norm(ex.name)];
            if (aliasTarget && ex.name !== aliasTarget) {
                const targetExists = (existing || []).some(e => e.id !== ex.id && norm(e.name) === norm(aliasTarget));
                if (targetExists) {
                    await store.supabaseClient.from('exercise_inventory').delete().eq('id', ex.id);
                } else {
                    const meta = STRENGTH_EXERCISE_META[aliasTarget] || {};
                    await store.supabaseClient.from('exercise_inventory')
                        .update({
                            name: aliasTarget,
                            domain: meta.domain || ex.domain,
                            muscle_group: meta.muscle_group || ex.muscle_group
                        })
                        .eq('id', ex.id);
                    ex.name = aliasTarget;
                }
            }
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

        localStorage.setItem('ascensus_strength_label_v7', 'done');
        localStorage.setItem('ascensus_strength_label_v6', 'done');
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

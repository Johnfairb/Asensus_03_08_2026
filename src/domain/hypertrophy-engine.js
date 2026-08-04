/**
 * Hypertrophy session engine — PPL / Upper-Lower / Full Body templates,
 * warmups, fatigue points, progression, and exercise criteria (DB / grip).
 */
import { store } from '../state/store.js';
import { SPORT_MATRIX } from './sports-matrix.js';
import {
    bodyweightCompoundSet,
    buildHypertrophyMetaMap,
    getExerciseMeta
} from './exercise-catalog.js';

// horizontal push ↔ lower push | vertical push ↔ upper push
// horizontal pull ↔ lower pull | vertical pull ↔ upper pull

export const BODYWEIGHT_COMPOUNDS = bodyweightCompoundSet();

/** Compound + isolation catalogue used by hypertrophy programming. */
export const HYPERTROPHY_EXERCISE_META = buildHypertrophyMetaMap();

export const HYPERTROPHY_POOLS = {
    anterior_bilateral: ['Squat', 'Front Squat', 'Sumo Squat', 'Goblet Squat', 'Leg Press', 'Wide Leg Press'],
    anterior_unilateral: ['Bulgarian Squat', 'Split Squat', 'Lunge', 'Walk Lunge', 'Pistol Squat'],
    posterior_bilateral: ['Deadlift', 'Sumo Deadlift', 'Rack Deadlift', 'Romanian Deadlift'],
    posterior_unilateral: ['Single Leg Deadlift'],
    horizontal_push_db: ['Dumbbell Bench Press', 'Neutral Bench Press'],
    horizontal_push_bb: ['Bench Press', 'Decline Bench Press', 'Close Grip Bench Press', 'Dip', 'Press-up', 'Machine Bench Press'],
    vertical_push_db: ['Seated Dumbbell Shoulder Press', 'Seated Dumbbell Screw Press', 'Dumbbell Incline Bench Press'],
    vertical_push_bb: ['Barbell Military Press', 'Machine Overhead Press', 'Incline Bench Press', 'Incline Press-up'],
    vertical_pull: [
        'Pull Up', 'Chin Up', 'Neutral Pull Up',
        'Lat Machine Pull', 'Lat Machine Chin-up', 'Lat Machine Close Grip',
        'Lat Machine Single Pull', 'Low Pulley Wide Grip', 'Low Pulley Close Grip'
    ],
    horizontal_pull: [
        'Overhand Barbell Row', 'Underhand Barbell Row', 'Dumbbell Row',
        'Underhand Cable Row', 'Overhand Cable Row', 'Neutral Cable Row'
    ],
    bicep_isolation: [
        'Barbell Curl', 'Dumbbell Curl', 'Hammer Curl', 'Reverse Curl',
        'Cable Curl', 'Concentration Curl', 'Preacher Curl EZ Bar', 'Dumbbell Preacher Curl'
    ],
    tricep_isolation: [
        'Rope Push Down', 'Bar Push Down', 'Single Push Down', 'Cable French Press',
        'Kick Back', 'Skull Crusher', 'Single Overhead Seated French Press', 'Reverse Dips'
    ],
    calf_isolation: ['Calf Raise Machine', 'Calf Raise Barbell', 'Single Calf Raise'],
    groin_isolation: ['Adductor Machine'],
    abductor_isolation: ['Abductor Machine'],
    quad_isolation: ['Leg Extension', 'Hack Squat'],
    hamstring_isolation: ['Seated Hamstring Curl', 'Lying Hamstring Curl'],
    rear_delt_isolation: ['Bent Over Rear Flye', 'Machine Reverse Rear Flye'],
    front_delt_isolation: ['Standing Dumbbell Front Raise', 'Incline Dumbbell Front Raise'],
    side_delt_isolation: [
        'Lateral Raise', 'Lying 30 Degree Single Lateral Raise',
        'Cable Lateral Raise (Single)', 'Cable Lateral Raise (Double)', 'Upright Row'
    ],
    mid_trap_isolation: ['Reverse Row'],
    pec_isolation: ['Flye', 'Incline Flye', 'Pullover', 'Cable Crossover', 'Pec Deck'],
    rotator_cuff_isolation: ['Lateral Rotation']
};

export const HYPERTROPHY_EVENT_TYPES = {
    push: 'Hypertrophy / Push',
    pull: 'Hypertrophy / Pull',
    legs: 'Hypertrophy / Legs',
    upper: 'Hypertrophy / Upper',
    lower: 'Hypertrophy / Lower',
    full: 'Hypertrophy / Full Body'
};

export const HYPERTROPHY_DISPLAY_LABELS = {
    [HYPERTROPHY_EVENT_TYPES.push]: 'Pecs, Triceps & Shoulders',
    [HYPERTROPHY_EVENT_TYPES.pull]: 'Back & Biceps',
    [HYPERTROPHY_EVENT_TYPES.legs]: 'Legs',
    [HYPERTROPHY_EVENT_TYPES.upper]: 'Upper Body',
    [HYPERTROPHY_EVENT_TYPES.lower]: 'Lower Body',
    [HYPERTROPHY_EVENT_TYPES.full]: 'Full Body'
};

export function isHypertrophyPhase(phase) {
    const p = phase || store.userConfig?.seasonPhase || 'OffSeason_Hypertrophy';
    const sel = typeof document !== 'undefined' ? document.getElementById('set-season-phase') : null;
    const live = sel?.value || p;
    return live === 'OffSeason_Hypertrophy';
}

export function isHypertrophyEvent(e) {
    return typeof e === 'string' && e.includes('Hypertrophy');
}

export function isHypertrophyFocus(focus) {
    return isHypertrophyEvent(focus);
}

export function resolveHypertrophySessionKind(focus) {
    if (!focus || typeof focus !== 'string') return null;
    if (/Push/i.test(focus) || /Pecs/i.test(focus)) return 'push';
    if (/Pull/i.test(focus) || /Back\s*&\s*Biceps/i.test(focus)) return 'pull';
    if (/Legs/i.test(focus) && !/Full/i.test(focus)) return 'legs';
    if (/Upper/i.test(focus)) return 'upper';
    if (/Lower/i.test(focus)) return 'lower';
    if (/Full\s*Body/i.test(focus)) return 'full';
    if (isHypertrophyEvent(focus)) return 'full';
    return null;
}

export function getDumbbellIncrement() {
    const dom = document.getElementById('set-db-increment');
    const raw = (dom && dom.value !== '') ? dom.value : store.userConfig.dumbbellIncrement;
    const n = parseFloat(raw);
    return Number.isFinite(n) && n > 0 ? n : 2;
}

/** Round UP to equipment step (hypertrophy warmups / drop sets). */
export function roundUpLoad(val, equipment = 'barbell') {
    const v = Number(val) || 0;
    if (v <= 0) return 0;
    let step = 2.5;
    if (equipment === 'dumbbell') step = getDumbbellIncrement();
    else if (equipment === 'pullup_dip') step = 1.25;
    return Math.ceil(v / step - 1e-9) * step;
}

export function equipmentForExercise(name) {
    const meta = HYPERTROPHY_EXERCISE_META[name];
    if (!meta) return 'barbell';
    if (BODYWEIGHT_COMPOUNDS.has(name)) return 'pullup_dip';
    if (meta.dumbbell) return 'dumbbell';
    return 'barbell';
}

function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function pickRandom(list, exclude = new Set()) {
    const pool = (list || []).filter(n => !exclude.has(n));
    if (!pool.length) return (list || [])[0] || null;
    return pool[Math.floor(Math.random() * pool.length)];
}

function getSportData() {
    const sport = store.userConfig.sport || 'None';
    return SPORT_MATRIX[sport] || SPORT_MATRIX.None;
}

function canDoPullups() {
    return store.userConfig.canDoPullups !== 'No';
}

function gymTimeMinutes() {
    const dom = document.getElementById('set-max-gym-time');
    const raw = (dom && dom.value !== '') ? dom.value : store.userConfig.maxGymTime;
    return parseInt(raw, 10) || 90;
}

/** Hypertrophy days willing (1–6). Ideal guidance: 3–4. */
export function getHypertrophyPlanPrefs() {
    const domWill = document.getElementById('set-gym-willingness');
    let willingnessRaw = store.userConfig.gymWillingness;
    if (domWill && domWill.value !== '') willingnessRaw = domWill.value;
    else if (willingnessRaw == null || willingnessRaw === '') willingnessRaw = store.userConfig.trainingFreq || 4;

    const willingness = Math.min(6, Math.max(1, parseInt(willingnessRaw, 10) || 4));
    const maxTime = gymTimeMinutes();

    let split = 'ul';
    if (willingness >= 5) split = 'ppl';
    else if (willingness <= 2) split = 'fb';

    return {
        willingness,
        maxTime,
        split,
        sessionCount: willingness,
        idealNote: willingness >= 3 && willingness <= 4
            ? 'Ideal hypertrophy frequency (3–4 days).'
            : 'Recommended hypertrophy frequency is 3–4 days / week.'
    };
}

function timeTier(maxTime, _split) {
    // Returns: '45' | '60' | '75' | '90' — same ladder for PPL / UL / full body
    if (maxTime <= 45) return '45';
    if (maxTime <= 60) return '60';
    if (maxTime <= 75) return '75';
    return '90'; // as long as needed → 90
}

function pickVerticalPull(usedGrips, exclude) {
    const noPu = !canDoPullups();
    let pool = HYPERTROPHY_POOLS.vertical_pull.slice();
    if (noPu) pool = pool.filter(n => String(n).includes('Lat Machine') || String(n).includes('Low Pulley') || !BODYWEIGHT_COMPOUNDS.has(n));
    // Prefer unused grips
    const withMeta = pool.map(n => ({ n, grip: HYPERTROPHY_EXERCISE_META[n]?.grip || 'overhand' }));
    const unused = withMeta.filter(x => !usedGrips.has(x.grip) && !exclude.has(x.n));
    const pick = unused.length
        ? unused[Math.floor(Math.random() * unused.length)].n
        : pickRandom(pool, exclude);
    if (pick) usedGrips.add(HYPERTROPHY_EXERCISE_META[pick]?.grip || 'overhand');
    return pick;
}

function pickHorizontalPull(usedGrips, exclude) {
    const pool = HYPERTROPHY_POOLS.horizontal_pull;
    const withMeta = pool.map(n => ({ n, grip: HYPERTROPHY_EXERCISE_META[n]?.grip || 'neutral' }));
    const unused = withMeta.filter(x => !usedGrips.has(x.grip) && !exclude.has(x.n));
    const pick = unused.length
        ? unused[Math.floor(Math.random() * unused.length)].n
        : pickRandom(pool, exclude);
    if (pick) usedGrips.add(HYPERTROPHY_EXERCISE_META[pick]?.grip || 'neutral');
    return pick;
}

function pickPush(movement, preferDb, exclude) {
    const key = movement === 'horizontal'
        ? (preferDb ? 'horizontal_push_db' : 'horizontal_push_bb')
        : (preferDb ? 'vertical_push_db' : 'vertical_push_bb');
    let pick = pickRandom(HYPERTROPHY_POOLS[key], exclude);
    if (!pick) {
        const alt = movement === 'horizontal'
            ? (preferDb ? 'horizontal_push_bb' : 'horizontal_push_db')
            : (preferDb ? 'vertical_push_bb' : 'vertical_push_db');
        pick = pickRandom(HYPERTROPHY_POOLS[alt], exclude);
    }
    return pick;
}

function makeItem(name, slotLabel, opts = {}) {
    const meta = HYPERTROPHY_EXERCISE_META[name] || {};
    return {
        name,
        slotLabel,
        role: meta.role || 'compound',
        isIsolation: meta.role === 'isolation',
        sets: 3,
        setsOverride: 3,
        notes: opts.notes || `Hypertrophy · ${slotLabel}`,
        primary: meta.primary,
        secondary: meta.secondary,
        ...opts
    };
}

function buildLegsGroups(tier, sport) {
    const exclude = new Set();
    const g1 = [];
    const anteriorBias = !!(sport && sport.quad);
    const posteriorBias = !!(sport && sport.ham) && !anteriorBias;

    if (tier === '45') {
        // Any anterior compound (uni or bi)
        const ant = pickRandom([
            ...HYPERTROPHY_POOLS.anterior_bilateral,
            ...HYPERTROPHY_POOLS.anterior_unilateral
        ], exclude);
        if (ant) { exclude.add(ant); g1.push(makeItem(ant, 'Anterior Compound')); }
        const post = pickRandom([
            ...HYPERTROPHY_POOLS.posterior_bilateral,
            ...HYPERTROPHY_POOLS.posterior_unilateral
        ], exclude);
        if (post) { exclude.add(post); g1.push(makeItem(post, 'Posterior Compound')); }
    } else if (tier === '60') {
        // Sport bias: 2 of biased chain (bi+uni) + 1 opposite
        if (anteriorBias || (!posteriorBias && Math.random() < 0.5)) {
            const bi = pickRandom(HYPERTROPHY_POOLS.anterior_bilateral, exclude);
            const uni = pickRandom(HYPERTROPHY_POOLS.anterior_unilateral, exclude);
            if (bi) { exclude.add(bi); g1.push(makeItem(bi, 'Bilateral Anterior')); }
            if (uni) { exclude.add(uni); g1.push(makeItem(uni, 'Unilateral Anterior')); }
            const post = pickRandom([
                ...HYPERTROPHY_POOLS.posterior_bilateral,
                ...HYPERTROPHY_POOLS.posterior_unilateral
            ], exclude);
            if (post) { exclude.add(post); g1.push(makeItem(post, 'Posterior Compound')); }
        } else {
            const bi = pickRandom(HYPERTROPHY_POOLS.posterior_bilateral, exclude);
            const uni = pickRandom(HYPERTROPHY_POOLS.posterior_unilateral, exclude);
            if (bi) { exclude.add(bi); g1.push(makeItem(bi, 'Bilateral Posterior')); }
            if (uni) { exclude.add(uni); g1.push(makeItem(uni, 'Unilateral Posterior')); }
            const ant = pickRandom([
                ...HYPERTROPHY_POOLS.anterior_bilateral,
                ...HYPERTROPHY_POOLS.anterior_unilateral
            ], exclude);
            if (ant) { exclude.add(ant); g1.push(makeItem(ant, 'Anterior Compound')); }
        }
    } else {
        // 75 / 90: bi+uni anterior and bi+uni posterior
        const abi = pickRandom(HYPERTROPHY_POOLS.anterior_bilateral, exclude);
        const auni = pickRandom(HYPERTROPHY_POOLS.anterior_unilateral, exclude);
        const pbi = pickRandom(HYPERTROPHY_POOLS.posterior_bilateral, exclude);
        const puni = pickRandom(HYPERTROPHY_POOLS.posterior_unilateral, exclude);
        [abi, auni, pbi, puni].forEach((n, i) => {
            if (!n) return;
            exclude.add(n);
            g1.push(makeItem(n, ['Bilateral Anterior', 'Unilateral Anterior', 'Bilateral Posterior', 'Unilateral Posterior'][i]));
        });
    }

    const g2Slots = ['quad_isolation', 'hamstring_isolation', 'calf_isolation', 'groin_isolation'];
    if (tier === '90') g2Slots.push('abductor_isolation');
    const g2 = g2Slots.map(slot => {
        const n = pickRandom(HYPERTROPHY_POOLS[slot], exclude);
        if (n) exclude.add(n);
        return n ? makeItem(n, slot.replace(/_/g, ' ')) : null;
    }).filter(Boolean);

    return { g1, g2 };
}

function buildPullGroups(tier, sport) {
    const exclude = new Set();
    const usedGrips = new Set();
    const g1 = [];

    const v1 = pickVerticalPull(usedGrips, exclude);
    if (v1) { exclude.add(v1); g1.push(makeItem(v1, 'Vertical Pull')); }
    const h1 = pickHorizontalPull(usedGrips, exclude);
    if (h1) { exclude.add(h1); g1.push(makeItem(h1, 'Horizontal Pull')); }

    if (tier === '60' || tier === '75' || tier === '90') {
        const v2 = pickVerticalPull(usedGrips, exclude);
        if (v2) { exclude.add(v2); g1.push(makeItem(v2, 'Vertical Pull')); }
    }
    if (tier === '75' || tier === '90') {
        const h2 = pickHorizontalPull(usedGrips, exclude);
        if (h2) { exclude.add(h2); g1.push(makeItem(h2, 'Horizontal Pull')); }
    }

    // Ensure 3 pulls use 3 grips when possible
    if (g1.length >= 3 && usedGrips.size < 3) {
        // already best-effort via pickers
    }

    const g2 = [
        makeItem(pickRandom(HYPERTROPHY_POOLS.bicep_isolation, exclude), 'Bicep Isolation'),
        makeItem(pickRandom(HYPERTROPHY_POOLS.rear_delt_isolation, exclude), 'Rear Delt Isolation'),
        makeItem(pickRandom(HYPERTROPHY_POOLS.mid_trap_isolation, exclude), 'Mid Trap Isolation'),
        makeItem(pickRandom(HYPERTROPHY_POOLS.bicep_isolation, exclude), 'Bicep Isolation')
    ].filter(i => i && i.name);
    g2.forEach(i => exclude.add(i.name));

    if (tier === '90') {
        // Sport pull specificity → else extra rear delt / mid trap
        let extra = pickRandom(HYPERTROPHY_POOLS.mid_trap_isolation, exclude);
        if (sport && sport.arm_imbalance) {
            extra = pickRandom(HYPERTROPHY_POOLS.rear_delt_isolation, exclude) || extra;
        }
        if (extra) g2.push(makeItem(extra, 'Sport / Extra Isolation'));
    }

    return { g1, g2 };
}

function buildPushGroups(tier, sport) {
    const exclude = new Set();
    const g1 = [];
    // Shoulder sports bias vertical; else horizontal bias
    const verticalBias = !!(sport && sport.shoulder);

    const firstMove = verticalBias ? 'vertical' : 'horizontal';
    const secondMove = verticalBias ? 'horizontal' : 'vertical';

    // Always one of each base
    let p1 = pickPush(firstMove, false, exclude);
    if (p1) { exclude.add(p1); g1.push(makeItem(p1, firstMove === 'vertical' ? 'Vertical Push' : 'Horizontal Push')); }
    let p2 = pickPush(secondMove, true, exclude);
    if (p2) { exclude.add(p2); g1.push(makeItem(p2, secondMove === 'vertical' ? 'Vertical Push' : 'Horizontal Push')); }

    if (tier === '60' || tier === '75' || tier === '90') {
        // Extra of biased type; if two of same type → one DB one BB
        const preferDb = !HYPERTROPHY_EXERCISE_META[p1]?.dumbbell;
        const p3 = pickPush(firstMove, preferDb, exclude);
        if (p3) { exclude.add(p3); g1.push(makeItem(p3, firstMove === 'vertical' ? 'Vertical Push' : 'Horizontal Push')); }
    }
    if (tier === '75' || tier === '90') {
        const preferDb = !HYPERTROPHY_EXERCISE_META[p2]?.dumbbell;
        const p4 = pickPush(secondMove, preferDb, exclude);
        if (p4) { exclude.add(p4); g1.push(makeItem(p4, secondMove === 'vertical' ? 'Vertical Push' : 'Horizontal Push')); }
    }

    const g2 = [
        makeItem(pickRandom(HYPERTROPHY_POOLS.pec_isolation, exclude), 'Pec Isolation'),
        makeItem(pickRandom(HYPERTROPHY_POOLS.tricep_isolation, exclude), 'Tricep Isolation'),
        makeItem(pickRandom(HYPERTROPHY_POOLS.front_delt_isolation, exclude), 'Front Delt Isolation'),
        makeItem(pickRandom(HYPERTROPHY_POOLS.side_delt_isolation, exclude), 'Side Delt Isolation')
    ].filter(i => i && i.name);
    g2.forEach(i => exclude.add(i.name));

    if (tier === '90') {
        let extra = pickRandom(HYPERTROPHY_POOLS.side_delt_isolation, exclude);
        if (sport && sport.shoulder) {
            extra = pickRandom(HYPERTROPHY_POOLS.rear_delt_isolation, exclude) || extra;
        } else {
            extra = pickRandom(HYPERTROPHY_POOLS.rotator_cuff_isolation, exclude) || extra;
        }
        if (extra) g2.push(makeItem(extra, 'Sport / Extra Isolation'));
    }

    return { g1, g2 };
}

function buildUpperGroups(tier) {
    const exclude = new Set();
    const usedGrips = new Set();
    const g1 = [
        makeItem(pickPush('horizontal', false, exclude), 'Horizontal Push'),
        makeItem(pickPush('vertical', true, exclude), 'Vertical Push'),
        makeItem(pickVerticalPull(usedGrips, exclude), 'Vertical Pull'),
        makeItem(pickHorizontalPull(usedGrips, exclude), 'Horizontal Pull')
    ].filter(i => i && i.name);
    g1.forEach(i => exclude.add(i.name));

    const g2 = [
        makeItem(pickRandom(HYPERTROPHY_POOLS.tricep_isolation, exclude), 'Tricep Isolation'),
        makeItem(pickRandom(HYPERTROPHY_POOLS.bicep_isolation, exclude), 'Bicep Isolation')
    ].filter(i => i && i.name);
    g2.forEach(i => exclude.add(i.name));

    if (tier === '60' || tier === '75' || tier === '90') {
        ['pec_isolation', 'mid_trap_isolation'].forEach(slot => {
            const n = pickRandom(HYPERTROPHY_POOLS[slot], exclude);
            if (n) { exclude.add(n); g2.push(makeItem(n, slot.replace(/_/g, ' '))); }
        });
    }
    if (tier === '75' || tier === '90') {
        ['front_delt_isolation', 'side_delt_isolation', 'rear_delt_isolation'].forEach(slot => {
            const n = pickRandom(HYPERTROPHY_POOLS[slot], exclude);
            if (n) { exclude.add(n); g2.push(makeItem(n, slot.replace(/_/g, ' '))); }
        });
    }
    if (tier === '90') {
        const n = pickRandom(HYPERTROPHY_POOLS.calf_isolation, exclude);
        if (n) g2.push(makeItem(n, 'Calf Isolation'));
    }

    return { g1, g2 };
}

function buildFullBodyGroups(tier) {
    // Template (brackets stack with time):
    // Group 1: Horizontal Push, anterior, Posterior, vertical pull, (vertical push), [horizontal pull]
    // Group 2: Calf, Bicep, Tricep, Side delt, {rear delt and side delt}
    // 1 hour = the 4 unbracketed compounds + 4 unbracketed isolations
    const exclude = new Set();
    const usedGrips = new Set();
    const g1 = [];

    const hp = pickPush('horizontal', false, exclude);
    if (hp) { exclude.add(hp); g1.push(makeItem(hp, 'Horizontal Push')); }

    // Anterior / posterior: one bilateral, one unilateral
    const antFirst = Math.random() < 0.5;
    if (antFirst) {
        const ant = pickRandom(HYPERTROPHY_POOLS.anterior_bilateral, exclude);
        const post = pickRandom(HYPERTROPHY_POOLS.posterior_unilateral, exclude);
        if (ant) { exclude.add(ant); g1.push(makeItem(ant, 'Anterior Compound')); }
        if (post) { exclude.add(post); g1.push(makeItem(post, 'Posterior Compound')); }
    } else {
        const ant = pickRandom(HYPERTROPHY_POOLS.anterior_unilateral, exclude);
        const post = pickRandom(HYPERTROPHY_POOLS.posterior_bilateral, exclude);
        if (ant) { exclude.add(ant); g1.push(makeItem(ant, 'Anterior Compound')); }
        if (post) { exclude.add(post); g1.push(makeItem(post, 'Posterior Compound')); }
    }

    const vpull = pickVerticalPull(usedGrips, exclude);
    if (vpull) { exclude.add(vpull); g1.push(makeItem(vpull, 'Vertical Pull')); }

    // (vertical push) — longer than the base hour template (keeps 1h at 4 compounds)
    if (tier === '75' || tier === '90') {
        const preferDb = !HYPERTROPHY_EXERCISE_META[hp]?.dumbbell;
        const vpush = pickPush('vertical', preferDb, exclude);
        if (vpush) { exclude.add(vpush); g1.push(makeItem(vpush, 'Vertical Push')); }
    }

    // [horizontal pull] — ~1h 30
    if (tier === '90') {
        const hpull = pickHorizontalPull(usedGrips, exclude);
        if (hpull) { exclude.add(hpull); g1.push(makeItem(hpull, 'Horizontal Pull')); }
    }

    const g2 = [
        makeItem(pickRandom(HYPERTROPHY_POOLS.calf_isolation, exclude), 'Calf Isolation'),
        makeItem(pickRandom(HYPERTROPHY_POOLS.bicep_isolation, exclude), 'Bicep Isolation'),
        makeItem(pickRandom(HYPERTROPHY_POOLS.tricep_isolation, exclude), 'Tricep Isolation'),
        makeItem(pickRandom(HYPERTROPHY_POOLS.side_delt_isolation, exclude), 'Side Delt Isolation')
    ].filter(i => i && i.name);
    g2.forEach(i => exclude.add(i.name));

    // {rear delt and side delt} — 1h 15+
    if (tier === '75' || tier === '90') {
        const rd = pickRandom(HYPERTROPHY_POOLS.rear_delt_isolation, exclude);
        if (rd) { exclude.add(rd); g2.push(makeItem(rd, 'Rear Delt Isolation')); }
        const sd = pickRandom(HYPERTROPHY_POOLS.side_delt_isolation, exclude);
        if (sd) g2.push(makeItem(sd, 'Side Delt Isolation'));
    }

    return { g1, g2 };
}

function trimToBudget(g1, g2, compoundTarget, isoTarget) {
    const compounds = shuffle(g1).slice(0, compoundTarget);
    const isos = shuffle(g2).slice(0, isoTarget);
    // Group 1 always precedes group 2; shuffle within each
    return [...shuffle(compounds), ...shuffle(isos)];
}

function budgetFor(kind, tier, split) {
    // Full body uses the template counts (1 hour = 4 compounds + 4 isolations)
    if (split === 'fb' || kind === 'full') {
        if (tier === '45') return { compounds: 4, isolations: 4 };
        if (tier === '60') return { compounds: 4, isolations: 4 };
        if (tier === '75') return { compounds: 5, isolations: 6 }; // + vert push + {rear, side}
        return { compounds: 6, isolations: 6 }; // + [horizontal pull]
    }
    // PPL / UL
    if (tier === '45') return { compounds: 2, isolations: 4 };
    if (tier === '60') return { compounds: 3, isolations: 4 };
    if (tier === '75') return { compounds: 4, isolations: 4 };
    return { compounds: 4, isolations: 5 }; // 90
}

const HYPERTROPHY_DAY_CACHE_KEY = 'ascensus_hypertrophy_day_plan_v1';

function hypertrophyCacheDateKey(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function hypertrophyPlanCacheKey(focus, date = new Date()) {
    const kind = resolveHypertrophySessionKind(focus) || 'full';
    const prefs = getHypertrophyPlanPrefs();
    const tier = timeTier(prefs.maxTime, prefs.split);
    return `${hypertrophyCacheDateKey(date)}|${kind}|${prefs.split}|${tier}|${prefs.maxTime}`;
}

/** Clear cached day plan (e.g. when prefs change). */
export function clearHypertrophyDayPlanCache() {
    try { localStorage.removeItem(HYPERTROPHY_DAY_CACHE_KEY); } catch (e) { /* ignore */ }
}

/**
 * Stable hypertrophy routine for the day — same picks until date/prefs/kind change.
 */
export function getHypertrophySessionRoutine(focus, date = new Date()) {
    const key = hypertrophyPlanCacheKey(focus, date);
    try {
        const raw = localStorage.getItem(HYPERTROPHY_DAY_CACHE_KEY);
        if (raw) {
            const cached = JSON.parse(raw);
            if (cached && cached.key === key && cached.plan && Array.isArray(cached.plan.items)) {
                window.currentHypertrophySession = cached.plan;
                return cached.plan;
            }
        }
    } catch (e) { /* rebuild */ }

    const plan = buildHypertrophySessionRoutine(focus);
    try {
        localStorage.setItem(HYPERTROPHY_DAY_CACHE_KEY, JSON.stringify({ key, plan }));
    } catch (e) { /* ignore */ }
    window.currentHypertrophySession = plan;
    return plan;
}

/**
 * Build hypertrophy routine items for a session kind (fresh shuffle — prefer getHypertrophySessionRoutine).
 */
export function buildHypertrophySessionRoutine(focus) {
    const kind = resolveHypertrophySessionKind(focus) || 'full';
    const prefs = getHypertrophyPlanPrefs();
    const tier = timeTier(prefs.maxTime, prefs.split);
    const sport = getSportData();
    let groups;

    if (kind === 'legs' || kind === 'lower') groups = buildLegsGroups(tier, sport);
    else if (kind === 'pull') groups = buildPullGroups(tier, sport);
    else if (kind === 'push') groups = buildPushGroups(tier, sport);
    else if (kind === 'upper') groups = buildUpperGroups(tier);
    else groups = buildFullBodyGroups(tier);

    const budget = budgetFor(kind, tier, prefs.split === 'fb' || kind === 'full' ? 'fb' : prefs.split);
    // For UL/PPL use actual group sizes guided by template then trim to time budget
    let items = trimToBudget(groups.g1, groups.g2, budget.compounds, budget.isolations);

    // Fatigue filter: avoid primary muscles that are blocked
    items = items.filter(it => !isPrimaryMuscleBlocked(it.primary));
    // If filtering removed too many, refill lightly from same groups
    if (items.length < Math.min(4, budget.compounds + budget.isolations)) {
        items = trimToBudget(groups.g1, groups.g2, budget.compounds, budget.isolations);
    }

    const label = HYPERTROPHY_DISPLAY_LABELS[HYPERTROPHY_EVENT_TYPES[kind]] || kind;
    return {
        kind,
        label,
        tier,
        maxTime: prefs.maxTime,
        split: prefs.split,
        items,
        note: `Hypertrophy · ${label} · ~${prefs.maxTime >= 90 && tier === '90' ? 90 : prefs.maxTime} min · Stick to rest times for accurate session length. First time on an exercise: find a weight for 10 reps @ 5 RIR.`
    };
}

// ---------- Fatigue (primary 3 / secondary 1) ----------
const FATIGUE_KEY = 'ascensus_hypertrophy_fatigue';

export function loadHypertrophyFatigue() {
    try { return JSON.parse(localStorage.getItem(FATIGUE_KEY) || '{}'); }
    catch (e) { return {}; }
}

export function saveHypertrophyFatigue(map) {
    try { localStorage.setItem(FATIGUE_KEY, JSON.stringify(map)); } catch (e) { /* ignore */ }
}

export function applyHypertrophyFatigueFromSession(items) {
    const map = loadHypertrophyFatigue();
    const now = Date.now();
    (items || []).forEach(it => {
        const name = it.exercise?.name || it.name;
        const meta = HYPERTROPHY_EXERCISE_META[name];
        if (!meta) return;
        const add = (muscle, pts) => {
            if (!muscle) return;
            if (!map[muscle]) map[muscle] = { points: 0, updatedAt: now };
            // Decay old points before adding
            map[muscle].points = decayPoints(map[muscle].points, map[muscle].updatedAt, now);
            map[muscle].points += pts;
            map[muscle].updatedAt = now;
        };
        add(meta.primary, 3);
        add(meta.secondary, 1);
    });
    saveHypertrophyFatigue(map);

    const hot = Object.entries(map).find(([, v]) => (v.points || 0) >= 22);
    if (hot) {
        return {
            warning: true,
            message: `Fatigue alert on ${hot[0]}: prioritise sleep, enough food, and hydration before loading it hard again.`
        };
    }
    return { warning: false };
}

function decayPoints(points, updatedAt, now) {
    const hrs = (now - (updatedAt || now)) / 3600000;
    // Soft decay: lose ~1 point per 4 hours of rest
    const decay = Math.floor(hrs / 4);
    return Math.max(0, (points || 0) - decay);
}

export function getMuscleFatigueStatus(muscle) {
    const map = loadHypertrophyFatigue();
    const now = Date.now();
    const entry = map[muscle];
    if (!entry) return { points: 0, band: 'green', blockPrimaryHours: 0 };
    const points = decayPoints(entry.points, entry.updatedAt, now);
    if (points >= 22) return { points, band: 'critical', blockPrimaryHours: 60 };
    if (points >= 16) return { points, band: 'red', blockPrimaryHours: 60 };
    if (points >= 9) return { points, band: 'dark_yellow', blockPrimaryHours: 48 };
    if (points >= 3) return { points, band: 'yellow', blockPrimaryHours: 24 };
    return { points, band: 'green', blockPrimaryHours: 0 };
}

export function isPrimaryMuscleBlocked(muscle) {
    if (!muscle) return false;
    const st = getMuscleFatigueStatus(muscle);
    if (!st.blockPrimaryHours) return false;
    const map = loadHypertrophyFatigue();
    const entry = map[muscle];
    if (!entry) return false;
    const elapsedHrs = (Date.now() - (entry.updatedAt || 0)) / 3600000;
    return elapsedHrs < st.blockPrimaryHours;
}

// ---------- Warmup sets ----------
export function buildHypertrophyWarmupSets(exName, workWeight, workReps, isIsolation) {
    const eq = equipmentForExercise(exName);
    const w = Number(workWeight) || 0;
    const reps = Number(workReps) || 10;
    const sets = [];

    if (BODYWEIGHT_COMPOUNDS.has(exName)) {
        if (w > 0 && w < 10) {
            sets.push({ weight: 0, reps, rpe: 5, completed: false, isWarmup: true, partName: 'Warmup · Shrugs', notes: 'Shrugs warmup', restTime: 60 });
            sets.push({ weight: 0, reps: Math.max(1, Math.ceil(reps / 2)), rpe: 5, completed: false, isWarmup: true, partName: 'Warmup · Bodyweight', notes: 'Bodyweight', restTime: 60 });
            sets.push({ weight: 0, reps: Math.max(1, Math.ceil(reps / 2)), rpe: 5, completed: false, isWarmup: true, partName: 'Warmup · Bodyweight', notes: 'Bodyweight', restTime: 90 });
        } else if (w <= 0) {
            sets.push({ weight: 0, reps, rpe: 5, completed: false, isWarmup: true, partName: 'Warmup · Shrugs', notes: 'Shrugs', restTime: 60 });
            sets.push({ weight: 0, reps: Math.max(1, Math.ceil(reps / 2)), rpe: 5, completed: false, isWarmup: true, partName: 'Warmup · Half reps', notes: 'Half reps bodyweight', restTime: 90 });
        } else if (w <= 20) {
            sets.push({ weight: 0, reps, rpe: 5, completed: false, isWarmup: true, partName: 'Warmup · Bodyweight', notes: 'Bodyweight', restTime: 60 });
            sets.push({
                weight: roundUpLoad(w * 0.5, eq),
                reps: Math.max(1, Math.ceil(reps / 2)),
                rpe: 5, completed: false, isWarmup: true, partName: 'Warmup · 50%', notes: 'Half load / half reps', restTime: 90
            });
        } else {
            // Normal compound warmups
            sets.push({ weight: roundUpLoad(w, eq), reps, rpe: 5, completed: false, isWarmup: true, partName: 'Warmup · Full', notes: 'Work weight · full reps', restTime: 60 });
            sets.push({
                weight: roundUpLoad(w * 0.75, eq),
                reps: Math.max(1, Math.ceil(reps / 2)),
                rpe: 5, completed: false, isWarmup: true, partName: 'Warmup · 75%', notes: '75% · half reps', restTime: 90
            });
        }
        return sets;
    }

    if (isIsolation || HYPERTROPHY_EXERCISE_META[exName]?.role === 'isolation') {
        sets.push({
            weight: roundUpLoad(w * 0.5, eq),
            reps,
            rpe: 5,
            completed: false,
            isWarmup: true,
            partName: 'Warmup',
            notes: 'Half work weight',
            restTime: 60
        });
        return sets;
    }

    // Standard compounds: 2 warmups
    sets.push({
        weight: roundUpLoad(w, eq),
        reps,
        rpe: 5,
        completed: false,
        isWarmup: true,
        partName: 'Warmup · Full',
        notes: 'Work weight · full reps',
        restTime: 60
    });
    sets.push({
        weight: roundUpLoad(w * 0.75, eq),
        reps: Math.max(1, Math.ceil(reps / 2)),
        rpe: 5,
        completed: false,
        isWarmup: true,
        partName: 'Warmup · 75%',
        notes: '75% · half reps',
        restTime: 90
    });
    return sets;
}

/** Hypertrophy load progression: all sets 8–12 → increase; plateau → −15%. */
export function progressHypertrophyWeight(exName, hist, currentWeight, targetReps = 10) {
    const eq = equipmentForExercise(exName);
    let tWeight = Number(currentWeight) || 0;
    if (!hist || !hist.length || tWeight <= 0) return { weight: tWeight, note: null };

    const logDayKey = (row) => {
        const raw = row && row.created_at;
        if (!raw) return '';
        return String(raw).includes('T') ? String(raw).split('T')[0] : String(raw).slice(0, 10);
    };

    const allExLogs = hist.filter(l => l.exercise === exName);
    const uniqueDays = [...new Set(allExLogs.map(logDayKey).filter(Boolean))].slice(0, 3);

    // Plateau: stuck same weight across last 3 sessions without progressing
    if (uniqueDays.length >= 3) {
        const dayWeights = uniqueDays.map(day => {
            const sets = allExLogs.filter(l => logDayKey(l) === day);
            return Math.max(...sets.map(s => Number(s.weight_kg) || 0));
        });
        const allSame = dayWeights.every(w => Math.abs(w - dayWeights[0]) < 0.01);
        const failedOften = uniqueDays.filter(day => {
            const sets = allExLogs.filter(l => logDayKey(l) === day && !l.is_warmup);
            const bad = sets.filter(l => (Number(l.reps) || 0) < 8);
            return sets.length && bad.length > sets.length / 2;
        }).length;
        if (allSame && failedOften >= 2 && tWeight > 20) {
            return {
                weight: roundUpLoad(tWeight * 0.85, eq),
                note: 'PLATEAU: Weight stuck — dropped 15%. Build back up slowly.'
            };
        }
    }

    const latestDay = uniqueDays[0];
    if (!latestDay) return { weight: tWeight, note: null };
    const recent = allExLogs.filter(l => logDayKey(l) === latestDay && !l.is_warmup);
    if (!recent.length) return { weight: tWeight, note: null };

    const allInRange = recent.every(l => {
        const r = Number(l.reps) || 0;
        return r >= 8 && r <= 12;
    });
    if (allInRange && recent.length >= 2) {
        const step = eq === 'dumbbell' ? getDumbbellIncrement() : (eq === 'pullup_dip' ? 1.25 : 2.5);
        return {
            weight: roundUpLoad(tWeight + step, eq),
            note: 'PROGRESSION: All sets in 8–12. Load increased.'
        };
    }
    return { weight: tWeight, note: null };
}

export function hypertrophyRestSeconds(rir) {
    let rest = 90;
    if (Number(rir) === 0) rest += 10;
    return rest;
}

/**
 * First-session finder: weight for ~10 reps @ 5 RIR → work weight ≈ +10%.
 * Rounds up to the exercise equipment step.
 */
export function workWeightFromFinder(finderKg, exName) {
    const raw = Number(finderKg) || 0;
    if (raw <= 0) return 0;
    const eq = equipmentForExercise(exName);
    return roundUpLoad(raw * 1.10, eq);
}

/** Round a known work weight to equipment increments. */
export function roundHypertrophyWorkWeight(kg, exName) {
    const raw = Number(kg) || 0;
    if (raw <= 0) return 0;
    return roundUpLoad(raw, equipmentForExercise(exName));
}

/**
 * Apply a hypertrophy work weight to an active-log item:
 * rebuild warmups and set all non-warmup working sets to that load.
 */
export function applyHypertrophyWorkWeight(item, workKg) {
    if (!item || !item.exercise) return 0;
    const exName = item.exercise.name || '';
    const w = roundHypertrophyWorkWeight(workKg, exName);
    if (w <= 0) return 0;

    const workReps = 10;
    const isIso = !!(item.isIsolation || HYPERTROPHY_EXERCISE_META[exName]?.role === 'isolation');
    const workSets = (item.sets || []).filter(s => s && !s.isWarmup && !s.isText && !s.isLactateHit);
    const planned = typeof item.plannedSets === 'number' ? item.plannedSets : Math.max(3, workSets.length || 3);
    const rest = hypertrophyRestSeconds(4);

    const warmups = buildHypertrophyWarmupSets(exName, w, workReps, isIso);
    const working = [];
    for (let i = 0; i < planned; i++) {
        const prev = workSets[i] || {};
        working.push({
            ...prev,
            weight: w,
            reps: prev.reps || workReps,
            rpe: prev.rpe === '' || prev.rpe == null ? 4 : prev.rpe,
            completed: false,
            restTime: prev.restTime != null ? prev.restTime : rest,
            isWarmup: false
        });
    }
    item.sets = [...warmups, ...working];
    item.weightFinderResolved = true;
    item.needsWeightFind = false;
    item.workWeightKg = w;
    return w;
}

/** Drop set: 80% of previous set weight, rounded up. */
export function buildDropSetFromPrevious(prevSet, equipment = 'barbell') {
    const prevW = Number(prevSet?.weight) || 0;
    const w = roundUpLoad(prevW * 0.8, equipment);
    return {
        weight: w,
        reps: prevSet?.reps || 10,
        rpe: 1,
        completed: false,
        isDropSet: true,
        restTime: 90,
        notes: 'Drop set · 80% previous'
    };
}

export function nextHypertrophyRotation(prevKinds, split) {
    const seq = split === 'ppl'
        ? ['push', 'pull', 'legs']
        : split === 'ul'
            ? ['upper', 'lower']
            : ['full'];
    if (!prevKinds || !prevKinds.length) return seq[0];
    const last = prevKinds[prevKinds.length - 1];
    const idx = seq.indexOf(last);
    if (idx < 0) return seq[0];
    return seq[(idx + 1) % seq.length];
}

export function hypertrophyEventForKind(kind) {
    return HYPERTROPHY_EVENT_TYPES[kind] || HYPERTROPHY_EVENT_TYPES.full;
}

/** Library criteria — logic-only fields; detail UI no longer surfaces these as labeled rows. */
export function getExerciseCriteriaLabel(name) {
    const meta = HYPERTROPHY_EXERCISE_META[name] || getExerciseMeta(name);
    if (!meta) return null;
    const move = meta.movement || '';
    if (/push/i.test(move)) {
        return { criteria: 'Dumbbell', value: meta.dumbbell ? 'Yes' : 'No' };
    }
    if (/pull/i.test(move) || /bicep isolation/i.test(move)) {
        const g = meta.grip || '—';
        const label = g === 'underhand' ? 'Underhand' : g === 'overhand' ? 'Overhand' : g === 'neutral' ? 'Neutral' : g;
        return { criteria: 'Grip', value: label };
    }
    if (meta.lateralityEither) {
        return { criteria: 'Laterality', value: 'Either' };
    }
    if (meta.laterality) {
        return { criteria: 'Laterality', value: meta.laterality };
    }
    return { criteria: 'Role', value: meta.role || '—' };
}

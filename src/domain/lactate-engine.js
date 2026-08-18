/**
 * Lactate / HIT session engine.
 * Baselines → RPE-scaled intensity targets; HIT block duration from desired RPE.
 */
import { getBillingMonthKeyNumber } from './billing-month.js';

const BASELINE_STORAGE_KEY = 'ascensus_lactate_baselines_v1';

/** HIT work block minutes from initial desired RPE (excludes warmup + stretch). */
export const LACTATE_DURATION_BY_RPE = {
    7: 20,
    8: 15,
    9: 10,
    10: 5
};

/** @deprecated Prefer lactateWorkBlockSec(rpe) — kept for older imports. */
export const LACTATE_WORK_BLOCK_SEC = 10 * 60;

export function lactateWorkBlockMinutes(rpe) {
    const r = clampDesiredRpe(rpe);
    return LACTATE_DURATION_BY_RPE[r] || 20;
}

export function lactateWorkBlockSec(rpe) {
    return lactateWorkBlockMinutes(rpe) * 60;
}

export function clampDesiredRpe(rpe) {
    const n = Math.round(Number(rpe) || 7);
    return Math.max(7, Math.min(10, n));
}

export function clampSessionRpe(rpe) {
    const n = Math.round(Number(rpe) || 7);
    return Math.max(1, Math.min(10, n));
}

/**
 * Per-modality baseline tests + how intensity is displayed.
 * Machine modalities use resistance 7 (disclaimer in UI).
 */
export const HIT_MODALITY_META = {
    treadmill_sprints: {
        label: 'Treadmill sprints',
        intensityKind: 'speed',
        unitLabel: 'm/s',
        machineResistance: null,
        tests: [
            { id: 'm400', label: '400 m time (track preferred)', unit: 'sec', distanceM: 400, hint: 'Advise a track for the 400 m to reduce injury risk.' },
            { id: 'm100', label: '100 m time', unit: 'sec', distanceM: 100 },
            { id: 'm200', label: '200 m time', unit: 'sec', distanceM: 200 }
        ]
    },
    incline_treadmill: {
        label: 'Incline treadmill sprints',
        intensityKind: 'speed',
        unitLabel: 'm/s',
        machineResistance: null,
        tests: [
            { id: 'm400', label: '400 m time (track preferred)', unit: 'sec', distanceM: 400 },
            { id: 'm100', label: '100 m time', unit: 'sec', distanceM: 100 },
            { id: 'm200', label: '200 m time', unit: 'sec', distanceM: 200 }
        ]
    },
    swimming: {
        label: 'Swimming intervals',
        intensityKind: 'time',
        unitLabel: 'sec',
        machineResistance: null,
        tests: [
            { id: 'len50', label: '1 length (50 m) time', unit: 'sec', distanceM: 50 },
            { id: 'len100', label: '2 lengths (100 m) time', unit: 'sec', distanceM: 100 }
        ]
    },
    attack_bike: {
        label: 'Attack bike intervals',
        intensityKind: 'split',
        unitLabel: 'split',
        machineResistance: 7,
        tests: [
            { id: 'd20', label: 'Max distance in 20 s', unit: 'm', durationSec: 20 },
            { id: 'd40', label: 'Max distance in 40 s', unit: 'm', durationSec: 40 }
        ]
    },
    rower: {
        label: 'Rower intervals',
        intensityKind: 'split',
        unitLabel: 'split',
        machineResistance: 7,
        tests: [
            { id: 'd20', label: 'Max distance in 20 s', unit: 'm', durationSec: 20 },
            { id: 'd40', label: 'Max distance in 40 s', unit: 'm', durationSec: 40 }
        ]
    },
    skier: {
        label: 'SkiErg intervals',
        intensityKind: 'split',
        unitLabel: 'split',
        machineResistance: 7,
        tests: [
            { id: 'd20', label: 'Max distance in 20 s', unit: 'm', durationSec: 20 },
            { id: 'd40', label: 'Max distance in 40 s', unit: 'm', durationSec: 40 }
        ]
    },
    battle_rope: {
        label: 'Battle rope',
        intensityKind: 'chops',
        unitLabel: 'chops',
        machineResistance: null,
        tests: [
            { id: 'c20', label: 'Max rope chops in 20 s', unit: 'count', durationSec: 20 },
            { id: 'c40', label: 'Max rope chops in 40 s', unit: 'count', durationSec: 40 }
        ]
    },
    cycling: {
        label: 'Cycling',
        intensityKind: 'speed',
        unitLabel: 'm/s',
        machineResistance: 7,
        tests: [
            { id: 'd20', label: 'Max distance in 20 s', unit: 'm', durationSec: 20 },
            { id: 'd40', label: 'Max distance in 40 s', unit: 'm', durationSec: 40 }
        ]
    },
    elliptical: {
        label: 'Elliptical',
        intensityKind: 'speed',
        unitLabel: 'm/s',
        machineResistance: 7,
        tests: [
            { id: 'd20', label: 'Max distance in 20 s', unit: 'm', durationSec: 20 },
            { id: 'd40', label: 'Max distance in 40 s', unit: 'm', durationSec: 40 }
        ]
    }
};

/** Legacy id aliases → current modality ids. */
const TYPE_ALIASES = {
    interval_sprints: 'treadmill_sprints',
    hill_sprint: 'incline_treadmill',
    spinning: 'cycling'
};

export function normalizeHitTypeId(id) {
    if (!id || id === 'hit_class') return id;
    return TYPE_ALIASES[id] || id;
}

export const HIT_TYPE_OPTIONS = [
    ...Object.entries(HIT_MODALITY_META).map(([id, meta]) => ({ id, label: meta.label })),
    { id: 'hit_class', label: 'HIT class' }
];

/** RPE rule table from Ascensus lactate spec. */
export const LACTATE_RPE_RULES = {
    10: { firstFactor: 1.0, workStep: 0.92, minRestRatio: 2.0, refRestSec: 60, restRecovery: 0.9, restStep: 0.95, maxRestSec: null },
    9:  { firstFactor: 0.9, workStep: 0.94, minRestRatio: 1.5, refRestSec: 60, restRecovery: 0.94, restStep: 0.96, maxRestSec: null },
    8:  { firstFactor: 0.8, workStep: 0.96, minRestRatio: 1.0, refRestSec: 60, restRecovery: 0.98, restStep: 0.97, maxRestSec: null },
    7:  { firstFactor: 0.7, workStep: 0.98, minRestRatio: 0.5, refRestSec: 60, restRecovery: 1.0, restStep: 0.98, maxRestSec: 60 },
    6:  { firstFactor: 0.6, workStep: 0.99, minRestRatio: 0.25, refRestSec: 30, restRecovery: 1.0, restStep: 0.99, maxRestSec: 30 },
    5:  { firstFactor: 0.5, workStep: 0.99, minRestRatio: 0.25, refRestSec: 30, restRecovery: 1.0, restStep: 0.99, maxRestSec: 30 },
    4:  { firstFactor: 0.4, workStep: 0.99, minRestRatio: 0.25, refRestSec: 30, restRecovery: 1.0, restStep: 0.99, maxRestSec: 30 },
    3:  { firstFactor: 0.3, workStep: 0.99, minRestRatio: 0.25, refRestSec: 30, restRecovery: 1.0, restStep: 0.99, maxRestSec: 30 },
    2:  { firstFactor: 0.2, workStep: 0.99, minRestRatio: 0.25, refRestSec: 30, restRecovery: 1.0, restStep: 0.99, maxRestSec: 30 },
    1:  { firstFactor: 0.1, workStep: 0.99, minRestRatio: 0.25, refRestSec: 30, restRecovery: 1.0, restStep: 0.99, maxRestSec: 30 }
};

function mulberry32(seed) {
    let t = seed >>> 0;
    return () => {
        t += 0x6D2B79F5;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
}

export function getLactateMonthKey(date = new Date()) {
    try {
        return getBillingMonthKeyNumber(date);
    } catch (e) {
        const d = date instanceof Date ? date : new Date(date);
        return d.getFullYear() * 100 + (d.getMonth() + 1);
    }
}

function formatSec(sec) {
    const s = Math.max(0, Math.round(Number(sec) || 0));
    if (s % 60 === 0) return `${s / 60}m`;
    if (s > 60) return `${Math.floor(s / 60)}m ${s % 60}s`;
    return `${s}s`;
}

export function formatWorkRestLabel(workSec, restSec) {
    return `${formatSec(workSec)} work / ${formatSec(restSec)} rest`;
}

export const BASELINE_REST_AFTER_SHORT_SEC = 60;
export const BASELINE_REST_AFTER_LONG_SEC = 120;

/** In-session tests, shortest first (20 s before 40 s; 100 m before 400 m). */
export function getBaselineTestSequence(typeId) {
    const meta = HIT_MODALITY_META[normalizeHitTypeId(typeId)];
    if (!meta?.tests?.length) return [];
    return [...meta.tests].sort((a, b) => {
        const ka = Number(a.durationSec || a.distanceM || 0);
        const kb = Number(b.durationSec || b.distanceM || 0);
        return ka - kb;
    });
}

export function isDurationBaselineTest(test) {
    return !!(test && test.durationSec);
}

/** Planning duration so tests eat into the HIT block before remaining intervals are generated. */
export function estimateBaselineWorkSec(typeId, test) {
    if (test?.durationSec) return Math.round(Number(test.durationSec));
    const dist = Number(test?.distanceM) || 0;
    if (!(dist > 0)) return 20;
    const id = normalizeHitTypeId(typeId);
    if (id === 'swimming') return Math.max(20, Math.round(dist * 0.9));
    return Math.max(15, Math.round(dist * 0.2));
}

export function missingBaselineTests(typeId) {
    const seq = getBaselineTestSequence(typeId);
    const stored = getModalityBaselines(typeId)?.tests || {};
    return seq.filter(t => !(Number(stored[t.id]) > 0));
}

export function hasCompleteBaseline(typeId) {
    const seq = getBaselineTestSequence(typeId);
    return seq.length > 0 && missingBaselineTests(typeId).length === 0;
}

export function buildBaselineProtocolRows(typeId, tests = null) {
    const id = normalizeHitTypeId(typeId);
    const seq = Array.isArray(tests) ? tests : getBaselineTestSequence(id);
    if (!seq.length) return [];
    const lastIdx = seq.length - 1;
    return seq.map((test, i) => {
        const durationKind = isDurationBaselineTest(test);
        const workSec = estimateBaselineWorkSec(id, test);
        const restSec = i === lastIdx ? BASELINE_REST_AFTER_LONG_SEC : BASELINE_REST_AFTER_SHORT_SEC;
        const restLabel = restSec >= 120 ? '2 min rest' : '1 min rest';
        return {
            typeId: id,
            name: hitTypeLabel(id),
            setIndex: i + 1,
            workSec,
            restSec,
            durationSec: workSec,
            isBaselineTest: true,
            baselineTestId: test.id,
            baselineKind: durationKind ? 'duration' : 'distance',
            baselineUnit: test.unit,
            baselineLabel: test.label,
            baselineHint: test.hint || null,
            baselineDistanceM: test.distanceM || null,
            baselineFixedWorkSec: test.durationSec || null,
            repsLabel: durationKind
                ? `${formatSec(test.durationSec)} all-out`
                : `${test.label} · stopwatch`,
            targetDisplay: 'All-out',
            targetRate: 0,
            targetValue: 0,
            _baseNotes: `Baseline test · ${test.label} · then ${restLabel}`
        };
    });
}

export function mergeModalityBaselineTest(typeId, testId, rawValue) {
    const n = Number(rawValue);
    if (!(n > 0) || !testId) return null;
    const existing = getModalityBaselines(typeId)?.tests || {};
    existing[testId] = n;
    return saveModalityBaselines(typeId, existing);
}

export function lactateLogSetFromRow(row) {
    const workSec = Number(row?.workSec || row?.durationSec) || 0;
    return {
        weight: 0,
        reps: 0,
        duration_sec: workSec,
        rpe: '',
        completed: false,
        isLactateHit: true,
        restTime: Number(row?.restSec) || 0,
        notes: row?.notes || row?._baseNotes || undefined,
        targetDisplay: row?.targetDisplay || undefined,
        targetRate: row?.targetRate || undefined,
        targetValue: row?.targetValue || undefined,
        isBaselineTest: !!row?.isBaselineTest,
        baselineTestId: row?.baselineTestId || null,
        baselineKind: row?.baselineKind || null,
        baselineUnit: row?.baselineUnit || null,
        baselineLabel: row?.baselineLabel || null,
        baselineHint: row?.baselineHint || null,
        baselineFixedWorkSec: row?.baselineFixedWorkSec || null,
        typeId: row?.typeId || null
    };
}

export function getRpeRules(rpe) {
    const r = clampSessionRpe(rpe);
    return LACTATE_RPE_RULES[r] || LACTATE_RPE_RULES[7];
}

export function needsLowRpeDisclaimer(rpe) {
    return clampSessionRpe(rpe) <= 5;
}

/* ─── Baselines persistence ─────────────────────────────────────────────── */

export function loadLactateBaselines() {
    try {
        const raw = localStorage.getItem(BASELINE_STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
        return {};
    }
}

export function saveLactateBaselines(all) {
    try {
        localStorage.setItem(BASELINE_STORAGE_KEY, JSON.stringify(all || {}));
    } catch (e) { /* ignore */ }
}

export function getModalityBaselines(typeId) {
    const id = normalizeHitTypeId(typeId);
    const all = loadLactateBaselines();
    return all[id] || null;
}

export function hasAnyBaseline(typeId) {
    const b = getModalityBaselines(typeId);
    if (!b || !b.tests) return false;
    return Object.values(b.tests).some(v => Number(v) > 0);
}

export function modalitiesNeedingBaseline(typeIds) {
    return (typeIds || [])
        .map(normalizeHitTypeId)
        .filter(id => id && id !== 'hit_class' && HIT_MODALITY_META[id] && missingBaselineTests(id).length > 0);
}

export function saveModalityBaselines(typeId, testsObj) {
    const id = normalizeHitTypeId(typeId);
    const all = loadLactateBaselines();
    const cleaned = {};
    Object.entries(testsObj || {}).forEach(([k, v]) => {
        const n = Number(v);
        if (Number.isFinite(n) && n > 0) cleaned[k] = n;
    });
    all[id] = { tests: cleaned, updatedAt: new Date().toISOString() };
    saveLactateBaselines(all);
    return all[id];
}

export function clearModalityBaselines(typeId) {
    const id = normalizeHitTypeId(typeId);
    const all = loadLactateBaselines();
    delete all[id];
    saveLactateBaselines(all);
}

/* ─── Rate / intensity math ─────────────────────────────────────────────── */

/** Convert a filled baseline test into a comparable rate (higher = harder). */
export function baselineTestToRate(typeId, testId, rawValue) {
    const meta = HIT_MODALITY_META[normalizeHitTypeId(typeId)];
    if (!meta) return 0;
    const test = meta.tests.find(t => t.id === testId);
    const v = Number(rawValue);
    if (!test || !(v > 0)) return 0;

    if (test.distanceM && test.unit === 'sec') {
        return test.distanceM / v;
    }
    if (test.durationSec && (test.unit === 'm' || test.unit === 'count')) {
        return v / test.durationSec;
    }
    return v;
}

/**
 * Build weighted baseline rate + reference duration from saved tests.
 */
export function resolveBaselineRate(typeId, workSec, baselinesOverride = null) {
    const id = normalizeHitTypeId(typeId);
    const meta = HIT_MODALITY_META[id];
    const stored = baselinesOverride || getModalityBaselines(id);
    if (!meta || !stored?.tests) return { rate: 0, refDurationSec: 20, points: [] };

    const points = [];
    meta.tests.forEach(test => {
        const raw = Number(stored.tests[test.id]);
        if (!(raw > 0)) return;
        const rate = baselineTestToRate(id, test.id, raw);
        let dur;
        if (test.durationSec) dur = test.durationSec;
        else if (test.distanceM && test.unit === 'sec') dur = raw;
        else dur = 20;
        if (rate > 0) points.push({ testId: test.id, rate, durationSec: dur, raw });
    });

    if (!points.length) return { rate: 0, refDurationSec: 20, points: [] };

    const W = Math.max(5, Number(workSec) || 20);
    let wSum = 0;
    let rateSum = 0;
    let durSum = 0;
    points.forEach(p => {
        const w = 1 / (Math.abs(W - p.durationSec) + 1);
        wSum += w;
        rateSum += p.rate * w;
        durSum += p.durationSec * w;
    });
    return {
        rate: rateSum / wSum,
        refDurationSec: durSum / wSum,
        points
    };
}

/** Scale rate for work duration vs reference (every ±5s of work). */
export function scaleRateForWorkDuration(rate, workSec, refDurationSec, workStep) {
    const steps = (Number(workSec) - Number(refDurationSec)) / 5;
    if (!Number.isFinite(steps) || !Number.isFinite(rate) || rate <= 0) return rate;
    return rate * Math.pow(workStep, steps);
}

export function computeSetIntensity({
    typeId,
    workSec,
    restSec,
    rpe,
    setIndex = 1,
    prevRate = null,
    prevWorkSec = null,
    baselinesOverride = null
} = {}) {
    const rules = getRpeRules(rpe);
    const resolved = resolveBaselineRate(typeId, workSec, baselinesOverride);
    if (!(resolved.rate > 0)) {
        return {
            rate: 0,
            display: '—',
            displayUnit: HIT_MODALITY_META[normalizeHitTypeId(typeId)]?.unitLabel || '',
            notes: 'Complete a baseline test to unlock intensity targets.'
        };
    }

    let rate;
    if (setIndex <= 1 || !(prevRate > 0)) {
        const atRef = resolved.rate * rules.firstFactor;
        rate = scaleRateForWorkDuration(atRef, workSec, resolved.refDurationSec, rules.workStep);
    } else {
        const afterRefRest = prevRate * rules.restRecovery;
        const scaledForWork = scaleRateForWorkDuration(
            afterRefRest,
            workSec,
            prevWorkSec > 0 ? prevWorkSec : resolved.refDurationSec,
            rules.workStep
        );
        const restDeltaSteps = (rules.refRestSec - Number(restSec || 0)) / 5;
        let withRest = scaledForWork * Math.pow(rules.restStep, restDeltaSteps);
        const prevWorkScaled = scaleRateForWorkDuration(
            prevRate,
            workSec,
            prevWorkSec > 0 ? prevWorkSec : workSec,
            rules.workStep
        );
        rate = Math.min(withRest, prevWorkScaled);
    }

    const formatted = formatIntensityDisplay(typeId, rate, workSec);
    return {
        rate,
        ...formatted,
        refDurationSec: resolved.refDurationSec,
        notes: null
    };
}

export function formatIntensityDisplay(typeId, rate, workSec = 20) {
    const id = normalizeHitTypeId(typeId);
    const meta = HIT_MODALITY_META[id];
    if (!(rate > 0) || !meta) {
        return { display: '—', displayUnit: '', targetValue: 0 };
    }
    const kind = meta.intensityKind;
    if (kind === 'speed') {
        const ms = Math.round(rate * 100) / 100;
        return { display: `${ms.toFixed(2)} m/s`, displayUnit: 'm/s', targetValue: ms };
    }
    if (kind === 'time') {
        const dist = rate * Math.max(5, Number(workSec) || 20);
        const timeFor50 = 50 / rate;
        return {
            display: `${timeFor50.toFixed(1)}s / 50m · ~${Math.round(dist)}m in ${formatSec(workSec)}`,
            displayUnit: 'sec/50m',
            targetValue: Math.round(timeFor50 * 10) / 10
        };
    }
    if (kind === 'split') {
        const split = 500 / rate;
        const dist = rate * Math.max(5, Number(workSec) || 20);
        return {
            display: `${formatSplit(split)} /500m · ~${Math.round(dist)}m`,
            displayUnit: '/500m',
            targetValue: Math.round(split * 10) / 10
        };
    }
    if (kind === 'chops') {
        const chops = Math.round(rate * Math.max(5, Number(workSec) || 20));
        return {
            display: `${chops} chops`,
            displayUnit: 'chops',
            targetValue: chops
        };
    }
    return { display: String(Math.round(rate * 100) / 100), displayUnit: meta.unitLabel, targetValue: rate };
}

function formatSplit(sec) {
    const s = Math.max(0, Number(sec) || 0);
    const m = Math.floor(s / 60);
    const rem = (s - m * 60).toFixed(1);
    return m > 0 ? `${m}:${String(rem).padStart(4, '0')}` : `${Number(rem).toFixed(1)}s`;
}

/* ─── Interval generation ───────────────────────────────────────────────── */

/**
 * Build work/rest pairs filling totalSec, honouring RPE min rest:work and max rest.
 */
export function generateVariableIntervalSets(totalSec = LACTATE_WORK_BLOCK_SEC, rng = Math.random, rpe = 7) {
    const rand = typeof rng === 'function' ? rng : Math.random;
    const rules = getRpeRules(rpe);
    const sets = [];
    let remaining = Math.max(40, Math.round(totalSec / 5) * 5);
    const minRatio = rules.minRestRatio;
    const maxRest = rules.maxRestSec;

    while (remaining >= 40) {
        const leaveRoom = remaining - 40;
        const forceLast = leaveRoom < 40 || (remaining <= 120 && rand() < 0.45);
        let cycle;
        if (forceLast) {
            cycle = remaining;
        } else {
            const maxCycle = Math.min(180, remaining - 40);
            const choices = [];
            for (let c = 40; c <= maxCycle; c += 5) choices.push(c);
            cycle = choices[Math.floor(rand() * choices.length)] || 40;
        }

        const workChoices = [];
        for (let w = 20; w <= cycle - 20; w += 5) {
            let rest = cycle - w;
            if (rest < w * minRatio - 0.01) continue;
            if (maxRest != null && rest > maxRest) continue;
            workChoices.push(w);
        }
        let workSec;
        if (workChoices.length) {
            workSec = workChoices[Math.floor(rand() * workChoices.length)];
        } else {
            workSec = Math.min(40, Math.max(20, Math.round((cycle / (1 + minRatio)) / 5) * 5));
            let restSec = Math.max(20, Math.ceil((workSec * minRatio) / 5) * 5);
            if (maxRest != null) restSec = Math.min(restSec, maxRest);
            const newCycle = workSec + restSec;
            sets.push({ workSec, restSec, cycleSec: newCycle });
            remaining -= newCycle;
            if (remaining < 0) remaining = 0;
            continue;
        }
        const restSec = cycle - workSec;
        sets.push({ workSec, restSec, cycleSec: cycle });
        remaining -= cycle;
    }

    if (remaining > 0 && sets.length) {
        const last = sets[sets.length - 1];
        if (maxRest == null || last.restSec + remaining <= maxRest) {
            last.restSec += remaining;
            last.cycleSec += remaining;
        } else {
            last.workSec += remaining;
            last.cycleSec += remaining;
        }
    }

    return sets;
}

export function getMonthlyLactateProtocols(date = new Date()) {
    const monthKey = getLactateMonthKey(date);
    const rng = mulberry32(monthKey * 9973 + 42);
    const wrap = (slot) => {
        const sample = generateVariableIntervalSets(lactateWorkBlockSec(8), rng, 8);
        const avgWork = Math.round(sample.reduce((s, x) => s + x.workSec, 0) / Math.max(1, sample.length));
        const avgRest = Math.round(sample.reduce((s, x) => s + x.restSec, 0) / Math.max(1, sample.length));
        return {
            slot,
            monthKey,
            sets: sample.length,
            workSec: avgWork,
            restSec: avgRest,
            blockMinutes: 15,
            label: `variable intervals (~${formatSec(avgWork)} / ${formatSec(avgRest)} avg)`,
            summary: `${sample.length}× variable work/rest · duration from desired RPE`
        };
    };
    return { A: wrap('A'), B: wrap('B'), monthKey };
}

export function getLactateProtocolForSlot(slot = 'A', date = new Date()) {
    const pair = getMonthlyLactateProtocols(date);
    return slot === 'B' ? pair.B : pair.A;
}

export function hitTypeLabel(id) {
    const nid = normalizeHitTypeId(id);
    if (nid === 'hit_class') return 'HIT class';
    return HIT_MODALITY_META[nid]?.label || HIT_TYPE_OPTIONS.find(t => t.id === nid)?.label || id;
}

export function applyIntensityToRows(rows, sessionRpe, baselinesByType = null) {
    let prevByType = Object.create(null);
    return (rows || []).map((row) => {
        const typeId = normalizeHitTypeId(row.typeId);
        if (row.isBaselineTest) {
            const baseNotes = row._baseNotes || row.notes || `Baseline test · ${row.baselineLabel || ''}`.trim();
            return {
                ...row,
                typeId,
                _baseNotes: baseNotes,
                targetRate: 0,
                targetDisplay: 'All-out',
                targetUnit: '',
                targetValue: 0,
                notes: baseNotes
            };
        }
        const prev = prevByType[typeId] || null;
        const baselines = baselinesByType?.[typeId] || null;
        const intensity = computeSetIntensity({
            typeId,
            workSec: row.workSec,
            restSec: row.restSec,
            rpe: sessionRpe,
            setIndex: prev ? (prev.setIndex + 1) : 1,
            prevRate: prev?.rate,
            prevWorkSec: prev?.workSec,
            baselinesOverride: baselines
        });
        prevByType[typeId] = {
            rate: intensity.rate,
            workSec: row.workSec,
            setIndex: (prev?.setIndex || 0) + 1
        };
        const intensityNote = intensity.display && intensity.display !== '—'
            ? `Target ${intensity.display}`
            : (intensity.notes || '');
        const baseNotes = row._baseNotes || (row.notes || '').split(' · Target')[0];
        return {
            ...row,
            typeId,
            _baseNotes: baseNotes,
            targetRate: intensity.rate,
            targetDisplay: intensity.display,
            targetUnit: intensity.displayUnit,
            targetValue: intensity.targetValue,
            notes: [baseNotes, intensityNote].filter(Boolean).join(' · ')
        };
    });
}

/**
 * Build ordered interval rows for selected HIT types.
 */
export function buildLactateIntervalPlan({
    types = [],
    slot = 'A',
    date = new Date(),
    desiredRpe = 7,
    sessionRpe = null,
    forceRetestTypes = null
} = {}) {
    const selected = (types || []).map(normalizeHitTypeId).filter(Boolean);
    const isHitClass = selected.length === 1 && selected[0] === 'hit_class';
    const intervalTypes = selected.filter(t => t !== 'hit_class');
    const initialRpe = clampDesiredRpe(desiredRpe);
    const liveRpe = sessionRpe != null ? clampSessionRpe(sessionRpe) : initialRpe;
    const blockSec = lactateWorkBlockSec(initialRpe);
    const blockMin = lactateWorkBlockMinutes(initialRpe);
    const retest = new Set((forceRetestTypes || []).map(normalizeHitTypeId).filter(Boolean));

    if (isHitClass || (!intervalTypes.length && selected.includes('hit_class'))) {
        return {
            isHitClass: true,
            slot,
            protocol: null,
            types: ['hit_class'],
            desiredRpe: initialRpe,
            sessionRpe: liveRpe,
            blockMinutes: null,
            rows: [{
                typeId: 'hit_class',
                name: 'HIT class',
                setIndex: 1,
                workSec: 0,
                restSec: 0,
                repsLabel: 'Class — diary RPE only',
                durationSec: 0,
                notes: 'No intervals to log. Rate the class RPE in the diary.'
            }],
            summary: 'HIT class · diary RPE only'
        };
    }

    const seed = Date.now() ^ (getLactateMonthKey(date) * 1009) ^ (slot === 'B' ? 77 : 13) ^ (initialRpe * 17);
    const rng = mulberry32(seed);
    const modalities = intervalTypes.length ? intervalTypes : ['treadmill_sprints'];

    const testRows = [];
    modalities.forEach((typeId) => {
        const tests = retest.has(typeId) ? getBaselineTestSequence(typeId) : missingBaselineTests(typeId);
        if (tests.length) testRows.push(...buildBaselineProtocolRows(typeId, tests));
    });
    const consumedSec = testRows.reduce((s, r) => s + (Number(r.workSec) || 0) + (Number(r.restSec) || 0), 0);
    const remainingSec = Math.max(0, blockSec - consumedSec);
    const intervals = remainingSec >= 40 ? generateVariableIntervalSets(remainingSec, rng, liveRpe) : [];
    const totalSets = intervals.length;
    const rawRows = [...testRows];

    if (modalities.length === 1) {
        for (let i = 0; i < totalSets; i++) {
            const iv = intervals[i];
            rawRows.push({
                typeId: modalities[0],
                name: hitTypeLabel(modalities[0]),
                setIndex: i + 1,
                workSec: iv.workSec,
                restSec: iv.restSec,
                repsLabel: `${formatSec(iv.workSec)} work`,
                durationSec: iv.workSec,
                _baseNotes: `${formatWorkRestLabel(iv.workSec, iv.restSec)} · set ${i + 1}/${totalSets}`
            });
        }
    } else {
        const counts = Object.create(null);
        modalities.forEach(m => { counts[m] = 0; });
        const targetPer = Math.floor(totalSets / modalities.length);
        let remainder = totalSets - targetPer * modalities.length;
        const budget = Object.create(null);
        modalities.forEach(m => {
            budget[m] = targetPer + (remainder > 0 ? 1 : 0);
            if (remainder > 0) remainder--;
        });

        let mi = 0;
        for (let i = 0; i < totalSets; i++) {
            let tries = 0;
            while (counts[modalities[mi]] >= budget[modalities[mi]] && tries < modalities.length) {
                mi = (mi + 1) % modalities.length;
                tries++;
            }
            const typeId = modalities[mi];
            counts[typeId] += 1;
            const iv = intervals[i];
            rawRows.push({
                typeId,
                name: hitTypeLabel(typeId),
                setIndex: counts[typeId],
                workSec: iv.workSec,
                restSec: iv.restSec,
                repsLabel: `${formatSec(iv.workSec)} work`,
                durationSec: iv.workSec,
                _baseNotes: `${formatWorkRestLabel(iv.workSec, iv.restSec)} · ${hitTypeLabel(typeId)} set ${counts[typeId]}`
            });
            mi = (mi + 1) % modalities.length;
        }
    }

    const rows = applyIntensityToRows(rawRows, liveRpe);
    const typeNames = modalities.map(hitTypeLabel).join(' + ');
    const nTest = testRows.length;
    const workSummary = totalSets
        ? `${totalSets}× variable · ${blockMin} min HIT @ RPE ${initialRpe}`
        : `${blockMin} min HIT @ RPE ${initialRpe}`;
    const protocol = {
        slot,
        sets: nTest + totalSets,
        blockMinutes: blockMin,
        desiredRpe: initialRpe,
        label: nTest ? 'baseline tests + variable work/rest' : 'variable work/rest',
        summary: nTest
            ? `${nTest} baseline test${nTest === 1 ? '' : 's'} + ${workSummary}`
            : workSummary
    };
    return {
        isHitClass: false,
        slot,
        protocol,
        types: modalities,
        desiredRpe: initialRpe,
        sessionRpe: liveRpe,
        blockMinutes: blockMin,
        hasBaselineTests: nTest > 0,
        rows,
        summary: `Session ${slot}: ${protocol.summary} · ${typeNames}`
    };
}

/** Rebuild intensity targets when live session RPE changes (duration unchanged). */
export function recalculateLactatePlanIntensities(selection, newSessionRpe) {
    if (!selection || selection.isHitClass) return selection;
    const rpe = clampSessionRpe(newSessionRpe);
    const baseRows = (selection.rows || []).map(r => ({
        ...r,
        _baseNotes: r._baseNotes || (r.notes || '').split(' · Target')[0]
    }));
    const rows = applyIntensityToRows(baseRows, rpe);
    const blockMin = selection.blockMinutes || lactateWorkBlockMinutes(selection.desiredRpe || 7);
    const nTest = rows.filter(r => r.isBaselineTest).length;
    const nWork = rows.length - nTest;
    const typeNames = (selection.types || []).map(hitTypeLabel).join(' + ');
    const workBit = nWork ? `${nWork}× variable · ` : '';
    return {
        ...selection,
        sessionRpe: rpe,
        hasBaselineTests: nTest > 0,
        rows,
        summary: `Session ${selection.slot || 'A'}: ${nTest ? `${nTest} baseline test${nTest === 1 ? '' : 's'} + ` : ''}${workBit}${blockMin} min HIT @ RPE ${selection.desiredRpe || rpe} (live ${rpe}) · ${typeNames}`
    };
}

export function getLactateWarmupParts() {
    // Nested children so lactate warmup parts expand like hypertrophy (press for teaching points)
    const joints = ['Neck', 'Shoulders', 'Hips', 'Ankles'];
    return [
        {
            name: 'Pulse Raising',
            reps: '3–5 Mins',
            notes: 'Light jog, skip, bike, or skip rope.',
            children: [
                { name: 'Light jog / skip / bike', reps: 'Video', notes: 'Teaching point video placeholder' },
                { name: 'Skip rope', reps: 'Video', notes: 'Teaching point video placeholder' }
            ]
        },
        {
            name: 'Mobilisation',
            reps: '10 Reps/Joint',
            notes: 'Tap a joint for its teaching-point video.',
            children: joints.map(j => ({ name: j, reps: 'Video', notes: 'Teaching point video placeholder' }))
        }
    ];
}

export function resolveHitClassRecovery(rpe) {
    const r = Number(rpe);
    if (!Number.isFinite(r)) return null;
    if (r >= 8) {
        return {
            nextDayOverride: 'Rest (Cardio Only)',
            message: 'HIT class RPE ≥ 8: tomorrow locked to Rest (optional steady is fine).'
        };
    }
    if (r > 6) {
        return {
            nextDayOverride: null,
            message: 'HIT class RPE > 6 counts as this week’s Lactate/HIT credit.'
        };
    }
    return {
        nextDayOverride: null,
        message: 'HIT class logged. Recovery looks manageable — keep hydration and sleep on point.'
    };
}

export function restSecFromHitClassRpe(rpe) {
    const r = Math.max(1, Math.min(10, Number(rpe) || 6));
    return Math.round(45 + (r - 1) * 15);
}

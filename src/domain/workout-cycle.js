/**
 * Fixed ~4-week workout cycle for strength + hypertrophy session types.
 * Starts on first gym session; ends on the Sunday on/after day 28.
 * On that Sunday the user chooses change / keep / custom per session type.
 */
import { getGymPlanPrefs, isHybridPhase, isStrengthPhase, loadStrengthMonthPlan, saveStrengthMonthPlan, rebuildStrengthSessionInPlan } from './strength-engine.js';
import {
    buildHypertrophySessionRoutine,
    getHypertrophyPlanPrefs,
    isHypertrophyPhase,
    HYPERTROPHY_EVENT_TYPES,
    HYPERTROPHY_DISPLAY_LABELS
} from './hypertrophy-engine.js';

const CYCLE_KEY = 'ascensus_workout_cycle_v1';
const PLANS_KEY = 'ascensus_cycle_session_plans_v1';

export function dateToISO(d = new Date()) {
    const x = d instanceof Date ? d : new Date(d);
    const y = x.getFullYear();
    const m = String(x.getMonth() + 1).padStart(2, '0');
    const day = String(x.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

export function parseISODate(iso) {
    if (!iso || typeof iso !== 'string') return null;
    const [y, m, d] = iso.split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
}

export function addDaysISO(iso, days) {
    const d = parseISODate(iso);
    if (!d) return null;
    d.setDate(d.getDate() + days);
    return dateToISO(d);
}

/** Next Sunday on or after the given date (inclusive). */
export function sundayOnOrAfterISO(iso) {
    const d = parseISODate(iso);
    if (!d) return null;
    const day = d.getDay();
    if (day !== 0) d.setDate(d.getDate() + (7 - day));
    return dateToISO(d);
}

/** End Sunday = Sunday on/after (start + 28 days). */
export function computeCycleEndSunday(startISO) {
    const day28 = addDaysISO(startISO, 28);
    return sundayOnOrAfterISO(day28);
}

export function loadCycleState() {
    try {
        const raw = JSON.parse(localStorage.getItem(CYCLE_KEY) || 'null');
        if (!raw || typeof raw !== 'object') return null;
        return {
            startDate: raw.startDate || null,
            endSunday: raw.endSunday || null,
            decisionsResolved: !!raw.decisionsResolved,
            pendingDecisions: raw.pendingDecisions && typeof raw.pendingDecisions === 'object' ? raw.pendingDecisions : {}
        };
    } catch (e) {
        return null;
    }
}

export function saveCycleState(state) {
    try {
        localStorage.setItem(CYCLE_KEY, JSON.stringify(state));
    } catch (e) { /* ignore */ }
}

export function loadCyclePlans() {
    try {
        const raw = JSON.parse(localStorage.getItem(PLANS_KEY) || 'null');
        return raw && typeof raw === 'object' ? raw : {};
    } catch (e) {
        return {};
    }
}

export function saveCyclePlans(plans) {
    try {
        localStorage.setItem(PLANS_KEY, JSON.stringify(plans || {}));
    } catch (e) { /* ignore */ }
}

export function getCyclePlan(sessionTypeId) {
    const plans = loadCyclePlans();
    return plans[sessionTypeId] || null;
}

export function setCyclePlan(sessionTypeId, plan) {
    const plans = loadCyclePlans();
    plans[sessionTypeId] = plan;
    saveCyclePlans(plans);
}

/** Start a cycle on first gym session if none is active. */
export function ensureCycleStarted(date = new Date()) {
    let state = loadCycleState();
    const today = dateToISO(date);
    if (state?.startDate && state?.endSunday && !state.decisionsResolved) {
        return state;
    }
    if (state?.startDate && state?.endSunday && state.decisionsResolved) {
        // Waiting for next cycle start after decisions — begin new block
        const start = today;
        state = {
            startDate: start,
            endSunday: computeCycleEndSunday(start),
            decisionsResolved: false,
            pendingDecisions: {}
        };
        saveCycleState(state);
        return state;
    }
    state = {
        startDate: today,
        endSunday: computeCycleEndSunday(today),
        decisionsResolved: false,
        pendingDecisions: {}
    };
    saveCycleState(state);
    return state;
}

/** True when the cycle has ended and Sunday choices are still outstanding. */
export function needsCycleDecisions(date = new Date()) {
    const state = loadCycleState();
    if (!state?.startDate || !state?.endSunday) return false;
    if (state.decisionsResolved) return false;
    const today = dateToISO(date);
    return today >= state.endSunday;
}

export function isCycleDecisionSunday(date = new Date()) {
    return date.getDay() === 0 && needsCycleDecisions(date);
}

/**
 * Unique gym session types for the current programme (strength A/B and/or hypertrophy kinds).
 */
export function getSessionTypesForCurrentProgramme() {
    const prefs = getGymPlanPrefs();
    const types = [];
    const strengthN = prefs.strengthCount || 0;
    const hypN = prefs.hypertrophyCount || 0;

    if (strengthN > 0 || (isStrengthPhase() && !isHypertrophyPhase()) || isHybridPhase()) {
        const n = Math.max(strengthN, (isStrengthPhase() && !isHybridPhase()) ? (prefs.willingness || 2) : strengthN);
        if (n >= 1) types.push({ id: 'strength_A', label: 'Strength Session A', family: 'strength', session: 'A' });
        if (n >= 2) types.push({ id: 'strength_B', label: 'Strength Session B', family: 'strength', session: 'B' });
    }

    if (hypN > 0 || isHypertrophyPhase()) {
        const hypPrefs = getHypertrophyPlanPrefs();
        const split = hypPrefs.split || 'ul';
        if (split === 'ppl') {
            ['push', 'pull', 'legs'].forEach((k) => {
                types.push({
                    id: `hyp_${k}`,
                    label: `Hypertrophy · ${HYPERTROPHY_DISPLAY_LABELS[HYPERTROPHY_EVENT_TYPES[k]] || k}`,
                    family: 'hypertrophy',
                    hypKind: k
                });
            });
        } else if (split === 'ul') {
            ['upper', 'lower'].forEach((k) => {
                types.push({
                    id: `hyp_${k}`,
                    label: `Hypertrophy · ${HYPERTROPHY_DISPLAY_LABELS[HYPERTROPHY_EVENT_TYPES[k]] || k}`,
                    family: 'hypertrophy',
                    hypKind: k
                });
            });
        } else {
            types.push({
                id: 'hyp_full',
                label: `Hypertrophy · ${HYPERTROPHY_DISPLAY_LABELS[HYPERTROPHY_EVENT_TYPES.full] || 'Full Body'}`,
                family: 'hypertrophy',
                hypKind: 'full'
            });
        }
    }

    return types;
}

export function sessionTypeIdFromFocus(focus) {
    if (!focus || typeof focus !== 'string') return null;
    if (/Strength\s*A/i.test(focus) || (focus.includes('Strength') && !/B/i.test(focus) && !/Hypertrophy/i.test(focus))) {
        if (/Strength\s*B/i.test(focus)) return 'strength_B';
        return 'strength_A';
    }
    if (/Strength\s*B/i.test(focus)) return 'strength_B';
    if (/Hypertrophy/i.test(focus) || /Push|Pull|Legs|Upper|Lower/i.test(focus)) {
        if (/Push/i.test(focus)) return 'hyp_push';
        if (/Pull/i.test(focus)) return 'hyp_pull';
        if (/Legs/i.test(focus) && !/Full/i.test(focus)) return 'hyp_legs';
        if (/Upper/i.test(focus)) return 'hyp_upper';
        if (/Lower/i.test(focus)) return 'hyp_lower';
        if (/Full/i.test(focus)) return 'hyp_full';
        return 'hyp_full';
    }
    return null;
}

function snapshotStrengthSession(session) {
    const plan = loadStrengthMonthPlan();
    if (!plan) return null;
    const slotIds = session === 'B' ? plan.sessionB : plan.sessionA;
    const compounds = (slotIds || []).map((slotId) => ({
        slotId,
        name: (plan.compoundPicks && plan.compoundPicks[slotId]) || null
    }));
    const isolations = (plan.isolations || []).filter((iso) => iso.session === session);
    return {
        source: 'generated',
        family: 'strength',
        session,
        compounds,
        isolations,
        coreSession: plan.coreSession,
        coreExercises: plan.coreExercises || [],
        strengthPlan: plan
    };
}

function snapshotHypertrophyKind(hypKind) {
    const focus = HYPERTROPHY_EVENT_TYPES[hypKind] || `Hypertrophy / ${hypKind}`;
    const built = buildHypertrophySessionRoutine(focus);
    return {
        source: 'generated',
        family: 'hypertrophy',
        hypKind,
        plan: built
    };
}

/** Ensure each programme session type has a locked plan for this cycle. */
export function ensureCyclePlansForProgramme() {
    ensureCycleStarted();
    const types = getSessionTypesForCurrentProgramme();
    const plans = loadCyclePlans();
    let changed = false;

    // Keep a shared strength month plan keyed by cycle
    if (types.some((t) => t.family === 'strength')) {
        loadStrengthMonthPlan();
    }

    types.forEach((t) => {
        if (plans[t.id]) return;
        if (t.family === 'strength') {
            plans[t.id] = snapshotStrengthSession(t.session);
            changed = true;
        } else if (t.family === 'hypertrophy') {
            plans[t.id] = snapshotHypertrophyKind(t.hypKind);
            changed = true;
        }
    });
    if (changed) saveCyclePlans(plans);
    return plans;
}

/**
 * Apply one session-type decision for the next cycle.
 * @param {'change'|'keep'|'custom'} decision
 * @param {{ templateId?: string, template?: object }} [opts]
 */
export function applyCycleDecision(sessionTypeId, decision, opts = {}) {
    const types = getSessionTypesForCurrentProgramme();
    const meta = types.find((t) => t.id === sessionTypeId) || null;
    const plans = loadCyclePlans();
    const prev = plans[sessionTypeId] || null;

    if (decision === 'keep') {
        if (prev) {
            plans[sessionTypeId] = { ...prev, source: 'kept' };
        } else if (meta?.family === 'strength') {
            plans[sessionTypeId] = { ...snapshotStrengthSession(meta.session), source: 'kept' };
        } else if (meta?.family === 'hypertrophy') {
            plans[sessionTypeId] = { ...snapshotHypertrophyKind(meta.hypKind), source: 'kept' };
        }
    } else if (decision === 'change') {
        if (meta?.family === 'strength') {
            const plan = loadStrengthMonthPlan();
            const rebuilt = rebuildStrengthSessionInPlan(plan, meta.session);
            saveStrengthMonthPlan(rebuilt);
            // Refresh both A/B snapshots from shared plan so slots stay consistent
            plans.strength_A = { ...snapshotStrengthSession('A'), source: sessionTypeId === 'strength_A' ? 'generated' : (plans.strength_A?.source || 'generated') };
            if (types.some((t) => t.id === 'strength_B')) {
                plans.strength_B = { ...snapshotStrengthSession('B'), source: sessionTypeId === 'strength_B' ? 'generated' : (plans.strength_B?.source || 'generated') };
            }
            plans[sessionTypeId] = { ...snapshotStrengthSession(meta.session), source: 'generated' };
        } else if (meta?.family === 'hypertrophy') {
            plans[sessionTypeId] = { ...snapshotHypertrophyKind(meta.hypKind), source: 'generated' };
        }
    } else if (decision === 'custom') {
        const items = Array.isArray(opts.items) ? opts.items : null;
        if (!items || !items.length) throw new Error('No saved workout selected.');
        plans[sessionTypeId] = {
            source: 'custom',
            family: meta?.family || 'custom',
            session: meta?.session || null,
            hypKind: meta?.hypKind || null,
            templateId: opts.templateId || null,
            templateName: opts.templateName || null,
            sessionKind: opts.sessionKind || null,
            items
        };
    }

    saveCyclePlans(plans);

    const state = loadCycleState() || {};
    const pending = { ...(state.pendingDecisions || {}) };
    pending[sessionTypeId] = decision;
    state.pendingDecisions = pending;
    saveCycleState(state);
    return plans[sessionTypeId];
}

/** After all session types have a decision, roll into the next cycle starting tomorrow (or Monday). */
export function finalizeCycleDecisions(date = new Date()) {
    const types = getSessionTypesForCurrentProgramme();
    const state = loadCycleState() || {};
    const pending = state.pendingDecisions || {};
    const missing = types.filter((t) => !pending[t.id]);
    if (missing.length) return { ok: false, missing };

    // Next cycle starts the day after decision Sunday (usually Monday)
    const start = addDaysISO(dateToISO(date), 1) || dateToISO(date);
    const next = {
        startDate: start,
        endSunday: computeCycleEndSunday(start),
        decisionsResolved: false,
        pendingDecisions: {}
    };
    saveCycleState(next);

    // Kept/custom plans already in PLANS_KEY; regenerated ones already updated.
    // Stamp strength month plan to cycle key for compatibility.
    try {
        const plan = loadStrengthMonthPlan();
        if (plan) {
            plan.month = next.startDate;
            plan.cycleStart = next.startDate;
            plan.cycleEnd = next.endSunday;
            saveStrengthMonthPlan(plan);
        }
    } catch (e) { /* ignore */ }

    return { ok: true, cycle: next };
}

export function allCycleDecisionsComplete() {
    const types = getSessionTypesForCurrentProgramme();
    const state = loadCycleState();
    const pending = state?.pendingDecisions || {};
    return types.length > 0 && types.every((t) => !!pending[t.id]);
}

/** Focus string used when building a hypertrophy kind from a cycle plan id. */
export function focusForSessionType(sessionType) {
    if (!sessionType) return null;
    if (sessionType.family === 'strength') {
        return sessionType.session === 'B' ? 'Full Body / Strength B' : 'Full Body / Strength A';
    }
    if (sessionType.family === 'hypertrophy') {
        return HYPERTROPHY_EVENT_TYPES[sessionType.hypKind] || 'Hypertrophy / Full Body';
    }
    return null;
}

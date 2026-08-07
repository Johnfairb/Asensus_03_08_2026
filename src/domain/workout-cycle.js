/**
 * Monthly workout cycle for strength + hypertrophy session types.
 * Anchor = onboarding / payment day; rolls on the same calendar day each month.
 * On/after anniversary the user chooses change / keep / custom per session type.
 */
import {
    getBillingPeriodForDate,
    ensureMonthAnchor,
    dateToISO,
    anniversaryAfter,
    getAnchorDayOfMonth,
    parseISODate
} from './billing-month.js';
import { getGymPlanPrefs, isHybridPhase, isStrengthPhase, loadStrengthMonthPlan, saveStrengthMonthPlan, rebuildStrengthSessionInPlan } from './strength-engine.js';
import {
    buildHypertrophySessionRoutine,
    getHypertrophyPlanPrefs,
    isHypertrophyPhase,
    HYPERTROPHY_EVENT_TYPES,
    HYPERTROPHY_DISPLAY_LABELS
} from './hypertrophy-engine.js';

// Re-export date helpers used by other modules
export { dateToISO, parseISODate } from './billing-month.js';

const CYCLE_KEY = 'ascensus_workout_cycle_v1';
const PLANS_KEY = 'ascensus_cycle_session_plans_v1';

export function addDaysISO(iso, days) {
    const d = parseISODate(iso);
    if (!d) return null;
    d.setDate(d.getDate() + days);
    return dateToISO(d);
}

/** @deprecated Sunday snap removed — kept as alias of period endDate for callers. */
export function computeCycleEndSunday(startISO) {
    return computeCycleEndDate(startISO);
}

/** Next monthly anniversary after start (billing period end / decision day). */
export function computeCycleEndDate(startISO) {
    const anchor = ensureMonthAnchor(parseISODate(startISO) || new Date());
    const day = getAnchorDayOfMonth(anchor);
    return anniversaryAfter(startISO, day);
}

export function loadCycleState() {
    try {
        const raw = JSON.parse(localStorage.getItem(CYCLE_KEY) || 'null');
        if (!raw || typeof raw !== 'object') return null;
        const endDate = raw.endDate || raw.endSunday || null;
        return {
            startDate: raw.startDate || null,
            endDate,
            endSunday: endDate, // back-compat alias
            decisionsResolved: !!raw.decisionsResolved,
            pendingDecisions: raw.pendingDecisions && typeof raw.pendingDecisions === 'object' ? raw.pendingDecisions : {}
        };
    } catch (e) {
        return null;
    }
}

export function saveCycleState(state) {
    try {
        const toSave = {
            startDate: state.startDate || null,
            endDate: state.endDate || state.endSunday || null,
            decisionsResolved: !!state.decisionsResolved,
            pendingDecisions: state.pendingDecisions && typeof state.pendingDecisions === 'object' ? state.pendingDecisions : {}
        };
        localStorage.setItem(CYCLE_KEY, JSON.stringify(toSave));
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

/**
 * Start / resume the monthly cycle from the onboarding (billing) anchor.
 */
export function ensureCycleStarted(date = new Date()) {
    ensureMonthAnchor(date);
    let state = loadCycleState();
    const period = getBillingPeriodForDate(date);

    if (state?.startDate && state?.endDate && !state.decisionsResolved) {
        // Migrate period bounds if we're still in an active block but endDate drifted
        return state;
    }

    if (state?.startDate && state?.endDate && state.decisionsResolved) {
        state = {
            startDate: period.startDate,
            endDate: period.endDate,
            decisionsResolved: false,
            pendingDecisions: {}
        };
        saveCycleState(state);
        return state;
    }

    state = {
        startDate: period.startDate,
        endDate: period.endDate,
        decisionsResolved: false,
        pendingDecisions: {}
    };
    saveCycleState(state);
    return state;
}

/** True when the monthly anniversary has arrived and choices are still outstanding. */
export function needsCycleDecisions(date = new Date()) {
    const state = loadCycleState();
    if (!state?.startDate || !state?.endDate) return false;
    if (state.decisionsResolved) return false;
    const today = dateToISO(date);
    return today >= state.endDate;
}

/** @deprecated Sunday no longer special — alias of needsCycleDecisions. */
export function isCycleDecisionSunday(date = new Date()) {
    return needsCycleDecisions(date);
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
        strengthPlan: plan,
        exercisesConfirmed: false
    };
}

function snapshotHypertrophyKind(hypKind) {
    const focus = HYPERTROPHY_EVENT_TYPES[hypKind] || `Hypertrophy / ${hypKind}`;
    const built = buildHypertrophySessionRoutine(focus);
    return {
        source: 'generated',
        family: 'hypertrophy',
        hypKind,
        plan: built,
        exercisesConfirmed: false
    };
}

/** True when this session type still needs the swap-and-confirm flow. */
export function sessionNeedsExerciseConfirm(sessionTypeId) {
    if (!sessionTypeId) return false;
    const plan = getCyclePlan(sessionTypeId);
    if (!plan) return true;
    if (plan.source === 'kept' || plan.source === 'custom') return false;
    if (plan.exercisesConfirmed) return false;
    return true;
}

/**
 * Lock ghost items (programmed + pre-confirm extras) for the rest of the month.
 */
export function confirmSessionExercises(sessionTypeId, ghostItems) {
    if (!sessionTypeId) return null;
    const plans = loadCyclePlans();
    const prev = plans[sessionTypeId] || { source: 'generated', family: sessionTypeId.startsWith('strength') ? 'strength' : 'hypertrophy' };
    const items = Array.isArray(ghostItems) ? JSON.parse(JSON.stringify(ghostItems)) : [];

    const next = {
        ...prev,
        exercisesConfirmed: true,
        confirmedAt: dateToISO(new Date()),
        lockedItems: items,
        source: prev.source === 'custom' ? 'custom' : (prev.source === 'kept' ? 'kept' : 'confirmed')
    };

    // Keep hypertrophy `.plan.items` in sync for generators that read plan
    if (next.family === 'hypertrophy' || sessionTypeId.startsWith('hyp_')) {
        const mapped = items
            .filter((it) => it && it.exercise?.name && !it.isWarmupGroup && !it.isStretchGroup && !it.isSportSessionBlock)
            .map((it) => ({
                name: it.exercise.name,
                slotLabel: it.slotLabel || null,
                notes: it.note || it.notes || '',
                sets: (it.sets || []).filter((s) => s && !s.isWarmup && !s.isText).length || it.plannedSets || 3,
                isIsolation: !!it.isIsolation,
                isExtra: !!it.isExtra,
                isSuperset: !!it.isSuperset,
                sides: it.sides,
                equipmentChoice: it.equipmentChoice || it.exercise?.equipmentChoice || null
            }));
        next.plan = {
            ...(next.plan || {}),
            items: mapped,
            source: 'confirmed'
        };
        next.family = 'hypertrophy';
    }

    if (next.family === 'strength' || sessionTypeId.startsWith('strength_')) {
        next.family = 'strength';
        // Update shared strength month compound picks from locked compounds
        try {
            const strengthPlan = loadStrengthMonthPlan();
            if (strengthPlan) {
                const STRENGTH_LABEL_TO_ID = {
                    'Bilateral Posterior': 'bilateral_posterior',
                    'Bilateral Anterior': 'bilateral_anterior',
                    'Unilateral Legs': 'unilateral_legs',
                    'Horizontal Pull': 'horizontal_pull',
                    'Horizontal Push': 'horizontal_push',
                    'Vertical Pull': 'vertical_pull',
                    'Vertical Push': 'vertical_push'
                };
                items.forEach((it) => {
                    if (!it?.slotLabel || !it.exercise?.name || it.isExtra) return;
                    const label = it.slotLabel;
                    const slotId = STRENGTH_LABEL_TO_ID[label];
                    if (slotId && strengthPlan.compoundPicks) {
                        strengthPlan.compoundPicks[slotId] = it.exercise.name;
                    }
                    if (label && label.startsWith('Isolation ·') && Array.isArray(strengthPlan.isolations)) {
                        const muscleKey = label.replace(/^Isolation\s*·\s*/i, '').trim();
                        const session = next.session || (sessionTypeId === 'strength_B' ? 'B' : 'A');
                        const iso = strengthPlan.isolations.find(
                            (row) => row.session === session && String(row.muscleKey).toLowerCase() === muscleKey.toLowerCase()
                        );
                        if (iso) iso.name = it.exercise.name;
                    }
                });
                saveStrengthMonthPlan(strengthPlan);
                next.strengthPlan = strengthPlan;
                next.compounds = snapshotStrengthSession(next.session || (sessionTypeId === 'strength_B' ? 'B' : 'A'))?.compounds;
            }
        } catch (e) { /* ignore */ }
    }

    plans[sessionTypeId] = next;
    saveCyclePlans(plans);
    return next;
}

/**
 * After mid-month swap/ban: update locked plan exercise for a slot (or by index).
 */
export function updateLockedExerciseInPlan(sessionTypeId, { slotLabel, oldName, newName, itemIndex }) {
    if (!sessionTypeId || !newName) return null;
    const plans = loadCyclePlans();
    const plan = plans[sessionTypeId];
    if (!plan) return null;

    const renameInList = (list) => {
        if (!Array.isArray(list)) return false;
        let changed = false;
        list.forEach((it, idx) => {
            const name = it.exercise?.name || it.name;
            const matchIdx = itemIndex != null && idx === itemIndex;
            const matchSlot = slotLabel && (it.slotLabel === slotLabel) && (!oldName || name === oldName);
            const matchName = oldName && name === oldName && (!slotLabel || it.slotLabel === slotLabel);
            if (matchIdx || matchSlot || matchName) {
                if (it.exercise) it.exercise = { ...it.exercise, name: newName };
                if (it.name != null) it.name = newName;
                changed = true;
            }
        });
        return changed;
    };

    renameInList(plan.lockedItems);
    if (plan.plan?.items) renameInList(plan.plan.items);
    if (Array.isArray(plan.items)) renameInList(plan.items);

    // Strength shared picks
    if (plan.family === 'strength' || sessionTypeId.startsWith('strength_')) {
        try {
            const STRENGTH_LABEL_TO_ID = {
                'Bilateral Posterior': 'bilateral_posterior',
                'Bilateral Anterior': 'bilateral_anterior',
                'Unilateral Legs': 'unilateral_legs',
                'Horizontal Pull': 'horizontal_pull',
                'Horizontal Push': 'horizontal_push',
                'Vertical Pull': 'vertical_pull',
                'Vertical Push': 'vertical_push'
            };
            const strengthPlan = loadStrengthMonthPlan();
            const slotId = STRENGTH_LABEL_TO_ID[slotLabel];
            if (strengthPlan?.compoundPicks && slotId) {
                strengthPlan.compoundPicks[slotId] = newName;
                saveStrengthMonthPlan(strengthPlan);
            }
            if (slotLabel && String(slotLabel).startsWith('Isolation ·') && strengthPlan?.isolations) {
                const muscleKey = String(slotLabel).replace(/^Isolation\s*·\s*/i, '').trim();
                const session = plan.session || (sessionTypeId === 'strength_B' ? 'B' : 'A');
                strengthPlan.isolations.forEach((row) => {
                    if (row.session === session && String(row.muscleKey).toLowerCase() === muscleKey.toLowerCase()) {
                        row.name = newName;
                    }
                });
                saveStrengthMonthPlan(strengthPlan);
            }
        } catch (e) { /* ignore */ }
    }

    plans[sessionTypeId] = plan;
    saveCyclePlans(plans);
    return plan;
}

/** Ensure each programme session type has a locked plan for this cycle. */
export function ensureCyclePlansForProgramme() {
    ensureCycleStarted();
    const types = getSessionTypesForCurrentProgramme();
    const plans = loadCyclePlans();
    let changed = false;

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
            plans[sessionTypeId] = {
                ...prev,
                source: 'kept',
                exercisesConfirmed: true
            };
        } else if (meta?.family === 'strength') {
            plans[sessionTypeId] = { ...snapshotStrengthSession(meta.session), source: 'kept', exercisesConfirmed: true };
        } else if (meta?.family === 'hypertrophy') {
            plans[sessionTypeId] = { ...snapshotHypertrophyKind(meta.hypKind), source: 'kept', exercisesConfirmed: true };
        }
    } else if (decision === 'change') {
        if (meta?.family === 'strength') {
            const plan = loadStrengthMonthPlan();
            const rebuilt = rebuildStrengthSessionInPlan(plan, meta.session);
            saveStrengthMonthPlan(rebuilt);
            plans.strength_A = {
                ...snapshotStrengthSession('A'),
                source: sessionTypeId === 'strength_A' ? 'generated' : (plans.strength_A?.source || 'generated'),
                exercisesConfirmed: sessionTypeId === 'strength_A' ? false : !!plans.strength_A?.exercisesConfirmed
            };
            if (types.some((t) => t.id === 'strength_B')) {
                plans.strength_B = {
                    ...snapshotStrengthSession('B'),
                    source: sessionTypeId === 'strength_B' ? 'generated' : (plans.strength_B?.source || 'generated'),
                    exercisesConfirmed: sessionTypeId === 'strength_B' ? false : !!plans.strength_B?.exercisesConfirmed
                };
            }
            plans[sessionTypeId] = { ...snapshotStrengthSession(meta.session), source: 'generated', exercisesConfirmed: false };
        } else if (meta?.family === 'hypertrophy') {
            plans[sessionTypeId] = { ...snapshotHypertrophyKind(meta.hypKind), source: 'generated', exercisesConfirmed: false };
        }
        // Clear previous lockedItems so confirm flow runs again
        if (plans[sessionTypeId]) {
            delete plans[sessionTypeId].lockedItems;
            plans[sessionTypeId].exercisesConfirmed = false;
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
            items,
            exercisesConfirmed: true
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

/** After all session types have a decision, roll into the next monthly cycle. */
export function finalizeCycleDecisions(date = new Date()) {
    const types = getSessionTypesForCurrentProgramme();
    const state = loadCycleState() || {};
    const pending = state.pendingDecisions || {};
    const missing = types.filter((t) => !pending[t.id]);
    if (missing.length) return { ok: false, missing };

    // New month starts on the anniversary that triggered decisions (state.endDate)
    const start = state.endDate || dateToISO(date);
    const next = {
        startDate: start,
        endDate: computeCycleEndDate(start),
        decisionsResolved: false,
        pendingDecisions: {}
    };
    saveCycleState(next);

    // Drop plans that were "change" so they regenerate; keep kept/custom/confirmed
    try {
        const plans = loadCyclePlans();
        const cleaned = {};
        Object.keys(plans).forEach((id) => {
            const p = plans[id];
            if (!p) return;
            if (pending[id] === 'change' && !p.exercisesConfirmed) {
                // leave generated plan for confirm flow
                cleaned[id] = p;
            } else if (pending[id] === 'keep' || pending[id] === 'custom') {
                cleaned[id] = p;
            } else if (pending[id] === 'change') {
                cleaned[id] = p;
            }
        });
        // For change decisions, ensure exercisesConfirmed false
        types.forEach((t) => {
            if (pending[t.id] === 'change' && cleaned[t.id]) {
                cleaned[t.id].exercisesConfirmed = false;
                delete cleaned[t.id].lockedItems;
            }
        });
        saveCyclePlans(cleaned);
    } catch (e) { /* ignore */ }

    try {
        const plan = loadStrengthMonthPlan();
        if (plan) {
            plan.month = next.startDate;
            plan.cycleStart = next.startDate;
            plan.cycleEnd = next.endDate;
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

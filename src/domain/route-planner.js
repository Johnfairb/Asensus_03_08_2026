import { store } from '../state/store.js';
import {
    DOMAIN_LABELS,
    buildPlainSessionCardHtml,
    getTodayFocus,
    isGuidanceOff,
    mergeDayDomainTargets
} from './fitness-hud.js';
import { buildMealPlanCardsHtml, getDayRecipeNames, resolveDayMealItems } from './meal-planner.js';
import { computeMacroBarLayout, formatMacroAimLabel } from '../lib/macro-range.js';
import { applyInjuryPainFollowUpFromJournal } from './periodization.js';
import { getGymPlanPrefs, isStrengthFocus } from './strength-engine.js';
import {
    getHypertrophyPlanPrefs,
    HYPERTROPHY_DISPLAY_LABELS,
    hypertrophyEventForKind,
    isHypertrophyEvent,
    isHypertrophyPhase,
    nextHypertrophyRotation,
    resolveHypertrophySessionKind
} from './hypertrophy-engine.js';
import { calculateTDEE, computeDayNutritionTargets, persistUserConfigToCloud } from './thermodynamics.js';
import { recordHydrationMl, specificEventName } from '../lib/food-parse.js';
import { drawMacroChart } from '../ui/charts.js';
import { upsertTodaySleep } from './body-metrics.js';
import { getTonightSleepTargetHours, sleepHoursFromTotalRpe } from './sleep-rpe.js';
import { configureJournalModal } from '../ui/drive.js';
import { buildDiaryEntryFromForm } from '../ui/diary-ui.js';
import { loadDayJournal, loadHistory, persistPendingJournalMedia, renderJournalMediaPreview, resetJournalMedia, saveMatchJournalEntry, savePracticeJournalEntry, deleteMatchJournalEntry, deletePracticeJournalEntry } from '../ui/journey.js';
import { canProgramPower, isPowerEvent, POWER_EVENT } from './power-engine.js';
import { getExerciseTeachingPoints, getTeachingPointVideoUrl } from './exercise-catalog.js';
import {
    getSportWeeklyQuotas,
    isGameEvent,
    isPracticeEvent,
    isSportEvent,
    populateSportSelects,
    sameSportEvent as catalogSameSportEvent,
    sportEventLabel
} from './sports-matrix.js';

export { isPowerEvent, POWER_EVENT, isGameEvent, isPracticeEvent, isSportEvent };

// ==========================================
// 14. UNIFIED ROUTE FORECAST & PLAN VIEWER
// ==========================================
// --- FIXED SCHEDULE ENGINE ---
export const LIFTING_EVENT_TYPES = [
    'Full Body / Strength', 'Full Body / Strength A', 'Full Body / Strength B',
    'Hypertrophy / Push', 'Hypertrophy / Pull', 'Hypertrophy / Legs',
    'Hypertrophy / Upper', 'Hypertrophy / Lower', 'Hypertrophy / Full Body',
    'Full Body / Power', 'Auxiliary', 'Cardio', 'Cardio (Steady)', 'Lactate'
];
export function isRestEvent(e) { return e === 'Rest' || e === 'Rest (Cardio Only)' || e === 'Cannot Workout'; }
export function isSteadyCardio(e) {
    if (!e || typeof e !== 'string') return false;
    if (e === 'Cardio' || e === 'Cardio (Steady)') return true;
    if (/lactate|hit\s*class/i.test(e)) return false;
    return /steady(\s*state)?(\s*cardio)?/i.test(e);
}

/** Lifting “row” movements — must not be treated as rowing / steady cardio. */
export function isStrengthRowExerciseName(name) {
    const n = String(name || '');
    if (!n) return false;
    if (/rowing|\brower\b|concept\s*2/i.test(n)) return false;
    return /\brows?\b/i.test(n);
}

export function isPrepBlockExerciseName(name) {
    return /warmup|stretch|mobilisation|mobility/i.test(String(name || ''));
}

/** Zone-2 cardio exercise names (rowing machine, not barbell row). */
export function looksLikeSteadyCardioExercise(name) {
    const n = String(name || '').trim();
    if (!n) return false;
    if (isStrengthRowExerciseName(n) || isPrepBlockExerciseName(n)) return false;
    if (/rowing(\s*machine)?|\brower\b|concept\s*2|ski\s*erg/i.test(n)) return true;
    if (/steady(\s*state)?(\s*cardio)?/i.test(n)) return true;
    if (/easy\s*run|incline\s*walk|cross\s*trainer|spin(\s*bike)?|elliptical/i.test(n)) return true;
    if (/^(jog|bike|cycle|cycling|swim)$/i.test(n)) return true;
    return false;
}

/** True when a flattened workout_log row is actually steady cardio — not a gym lift or stretch. */
export function isCardioWorkoutLogRow(log) {
    if (!log) return false;
    const name = log.exercise || log.name || '';
    if (isPrepBlockExerciseName(name) || isStrengthRowExerciseName(name)) return false;
    if (Number(log.weight_kg) > 0) return false;
    if (Number(log.distance_km) > 0) return true;
    if (looksLikeSteadyCardioExercise(name)) return true;
    const type = String(log.type || '').toLowerCase();
    if (type === 'cardio' && Number(log.reps) > 0) return false;
    if (type === 'cardio') return true;
    const timed = Number(log.time_minutes) > 0;
    return timed && !(Number(log.reps) > 0);
}


/** Snapshot labelled Steady State that is actually leftover gym work (rows / stretching). */
export function sessionIsMisfiledGymTail(sess) {
    if (!sess) return false;
    const n = normalizeLoggedSessionKind(sess.kind);
    if (n !== 'Cardio (Steady)' && !isSteadyCardio(sess.kind)) return false;
    const items = sess.items || [];
    if (!items.length) return false;
    return items.every((it) => {
        const name = it?.exercise?.name || it?.name || '';
        if (it?.isStretchGroup || it?.isWarmupGroup || it?.isCustomStretch || /stretch|warmup/i.test(name)) return true;
        if (isStrengthRowExerciseName(name)) return true;
        const d = (it?.exercise?.domain || '').toLowerCase();
        if (d === 'strength' || d === 'power' || d === 'hypertrophy') return true;
        if (looksLikeSteadyCardioExercise(name) || d === 'cardio' || it?.isSteadyCardio) return false;
        return (it?.sets || []).some(s => Number(s?.weight) > 0);
    });
}

function snapshotItemNameKey(item) {
    return String(item?.exercise?.name || item?.name || '').trim().toLowerCase();
}

function snapshotAlreadyHasItem(hostItems, item) {
    const n = snapshotItemNameKey(item);
    if (!n) return false;
    return (hostItems || []).some((h) => {
        const hn = snapshotItemNameKey(h);
        if (hn && hn === n) return true;
        if ((h?.isStretchGroup || /stretch/i.test(hn)) && /stretch/i.test(n)) return true;
        if ((h?.isWarmupGroup || /warmup/i.test(hn)) && /warmup/i.test(n)) return true;
        return false;
    });
}

function absorbSessionsIntoHost(host, tails) {
    if (!host || !tails?.length) return;
    tails.forEach((s) => {
        (s.items || []).forEach((it) => {
            if (!snapshotAlreadyHasItem(host.items, it)) {
                host.items = [...(host.items || []), it];
            }
        });
        (s.logIds || []).forEach((id) => {
            if (id == null) return;
            if (!(host.logIds || []).map(String).includes(String(id))) {
                host.logIds = [...(host.logIds || []), id];
            }
        });
    });
    try {
        const snaps = loadWorkoutSessionSnapshots();
        if (host.id && snaps[host.id]) {
            snaps[host.id] = {
                ...snaps[host.id],
                items: host.items,
                logIds: host.logIds,
                updatedAt: new Date().toISOString()
            };
            saveWorkoutSessionSnapshots(snaps);
        }
        tails.forEach((s) => {
            if (s?.id) removeWorkoutSessionSnapshot(s.id);
        });
    } catch (e) { /* display-only if storage fails */ }
}

function sessionIsPrepOnlyTail(sess) {
    const items = sess?.items || [];
    if (!items.length) return false;
    return items.every((it) => {
        const name = it?.exercise?.name || it?.name || '';
        return it?.isStretchGroup || it?.isWarmupGroup || it?.isCustomStretch
            || isPrepBlockExerciseName(name);
    });
}

/** Generic leftover labels — not Strength A/B, hypertrophy, power, lactate, or named cardio. */
function sessionIsGenericWorkoutKind(kind) {
    const n = normalizeLoggedSessionKind(kind);
    if (n === 'Cardio (Steady)' || n === 'Lactate' || n === 'Full Body / Power' || n === 'Auxiliary') return false;
    if (isHypertrophyEvent(kind) || /Strength\s*[AB]/i.test(kind || '')) return false;
    const s = String(kind || '').trim();
    return !s || /^workout$/i.test(s) || /^gym(\s*workout)?$/i.test(s) || n === 'Full Body / Strength';
}

function sessionLooksLikeSteadyCardioWork(sess) {
    const items = sess?.items || [];
    const work = items.filter((it) => {
        const name = it?.exercise?.name || it?.name || '';
        return !(it?.isStretchGroup || it?.isWarmupGroup || it?.isCustomStretch || isPrepBlockExerciseName(name));
    });
    if (!work.length) return false;
    const hasLift = work.some((it) => {
        const d = (it?.exercise?.domain || '').toLowerCase();
        if (d === 'strength' || d === 'power' || d === 'hypertrophy' || it?.isPower) return true;
        if (isStrengthRowExerciseName(it?.exercise?.name || it?.name || '')) return true;
        return (it?.sets || []).some(s => Number(s?.weight) > 0);
    });
    if (hasLift) return false;
    return work.some((it) => {
        const name = it?.exercise?.name || it?.name || '';
        const d = (it?.exercise?.domain || '').toLowerCase();
        return it?.isSteadyCardio || d === 'cardio' || looksLikeSteadyCardioExercise(name);
    });
}

/** Display-time: fold a mislabelled Steady State snapshot back into the gym session. */
export function foldMisfiledGymTailSessions(sessions) {
    let list = Array.isArray(sessions) ? sessions.slice() : [];
    const gymHost = list.find((s) => {
        const n = normalizeLoggedSessionKind(s?.kind);
        return n === 'Full Body / Strength' || n === 'Full Body / Power' || isStrengthEvent(s?.kind);
    });
    if (gymHost) {
        const misfiled = list.filter((s) => s && s !== gymHost && sessionIsMisfiledGymTail(s));
        if (misfiled.length) {
            absorbSessionsIntoHost(gymHost, misfiled);
            list = list.filter((s) => !misfiled.includes(s));
        }
    }

    // Stretch-only (or duplicate cardio) leftovers labelled Workout next to a real Steady State
    const cardioHost = list.find((s) => {
        const n = normalizeLoggedSessionKind(s?.kind);
        return n === 'Cardio (Steady)' || isSteadyCardio(s?.kind);
    });
    if (cardioHost) {
        const tails = list.filter((s) => {
            if (!s || s === cardioHost) return false;
            if (!sessionIsGenericWorkoutKind(s.kind)) return false;
            const items = s.items || [];
            if (!items.length) return true;
            return sessionIsPrepOnlyTail(s) || sessionLooksLikeSteadyCardioWork(s);
        });
        if (tails.length) {
            absorbSessionsIntoHost(cardioHost, tails);
            list = list.filter((s) => !tails.includes(s));
        }
    }
    return list;
}

export function isLactateEvent(e) { return e === 'Lactate' || e === 'Cardio (Lactate)'; }
export function isAuxEvent(e) {
    if (!e || typeof e !== 'string') return false;
    if (e === 'Auxiliary' || e === 'Band Auxiliary') return true;
    return /auxiliar/i.test(e);
}
/** Strength A/B or hypertrophy gym sessions (hard lift days). */
export function isStrengthEvent(e) {
    return typeof e === 'string' && (e.includes('Strength') || e.includes('Hypertrophy'));
}
export function isLiftingEvent(e) {
    return LIFTING_EVENT_TYPES.includes(e) || (typeof e === 'string' && (
        e.includes('Strength') || e.includes('Hypertrophy') || e.includes('Power') ||
        e === 'Auxiliary' || e.includes('Cardio') || e === 'Lactate'
    ));
}
export function canShareWithPractice(focus) {
    if (!focus || isGameEvent(focus) || isRestEvent(focus)) return false;
    // Lactate may follow practice on the same day (afternoon slot)
    return isLactateEvent(focus) || isStrengthEvent(focus) || isAuxEvent(focus)
        || isSteadyCardio(focus) || isPowerEvent(focus);
}

export function invalidateWeekPlanCache() { store._weekPlanCache = { key: '', plan: null }; }

export function getMondayISO(d) {
    const x = new Date(d);
    x.setHours(12, 0, 0, 0);
    const day = x.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    x.setDate(x.getDate() + diff);
    return dateToISO(x);
}

/**
 * Hard sessions (Practice / Match) with RPE > 6 each replace one Lactate that week.
 * Cap at 2 so the weekly lactate quota never goes negative beyond plan intent.
 */
export function countPracticeLactateCredits(weekStartISO) {
    let credits = 0;
    const seen = new Set();
    for (let i = 0; i < 7; i++) {
        const ds = addDaysISO(weekStartISO, i);
        if (seen.has(ds)) continue;
        seen.add(ds);
        const j = loadDayJournal(ds);
        if (!j) continue;
        const rpe = Number(j.rpe);
        if (!(rpe > 6)) continue;
        if (j.source === 'practice' || j.type === 'practice') credits++;
        else if (j.source === 'match' || j.type === 'match') credits++;
    }
    return Math.min(2, credits);
}

/** Which monthly lactate slot (A/B) this date is on the weekly plan. */
export function getLactateSlotForDate(dateIso) {
    if (!dateIso) return 'A';
    try {
        const weekStart = getMondayISO(dateIso + 'T12:00:00');
        // Full week (ignore logged credits) so logging the first HIT session
        // cannot flip the second day's A/B assignment.
        const plan = buildWeeklyTrainingPlan(weekStart, { ignoreLoggedCredits: true });
        const lactateDays = (plan || [])
            .filter(d => (d.events || []).some(isLactateEvent))
            .map(d => d.dateStr)
            .sort();
        const idx = lactateDays.indexOf(dateIso);
        if (idx <= 0) return 'A';
        return 'B';
    } catch (e) {
        return 'A';
    }
}

const LOGGED_SESSIONS_KEY = 'ascensus_logged_sessions';
const WORKOUT_SESSION_SNAPSHOTS_KEY = 'ascensus_workout_session_snapshots';
const COMPLETED_PLAN_SLOTS_KEY = 'ascensus_completed_plan_slots';

/** Canonical kinds that count toward the weekly plan. */
export const WORKOUT_TYPE_OPTIONS = [
    { kind: 'Cardio (Steady)', label: 'Steady State', blurb: 'Zone 2 aerobic base' },
    { kind: 'Lactate', label: 'Lactate/HIT', blurb: '~45 min · 10 min HIT block' },
    { kind: 'Full Body / Strength', label: 'Gym Workout', blurb: 'Strength / lifting session' },
    { kind: 'Full Body / Power', label: 'Power', blurb: 'Plyometrics · maximal effort · 3 min rest' }
];

export function loadLoggedSessionsMap() {
    try {
        return JSON.parse(localStorage.getItem(LOGGED_SESSIONS_KEY) || '{}') || {};
    } catch (e) {
        return {};
    }
}

export function saveLoggedSessionsMap(map) {
    localStorage.setItem(LOGGED_SESSIONS_KEY, JSON.stringify(map || {}));
    invalidateWeekPlanCache();
}

export function loadWorkoutSessionSnapshots() {
    try {
        return JSON.parse(localStorage.getItem(WORKOUT_SESSION_SNAPSHOTS_KEY) || '{}') || {};
    } catch (e) {
        return {};
    }
}

export function saveWorkoutSessionSnapshots(map) {
    localStorage.setItem(WORKOUT_SESSION_SNAPSHOTS_KEY, JSON.stringify(map || {}));
}

/** Normalize a focus / picker value into a plan-credit kind (or null if none). */
export function normalizeLoggedSessionKind(kind) {
    if (!kind || typeof kind !== 'string') return null;
    if (isSteadyCardio(kind)) return 'Cardio (Steady)';
    if (isLactateEvent(kind)) return 'Lactate';
    if (isAuxEvent(kind)) return 'Auxiliary';
    if (isPowerEvent(kind)) return 'Full Body / Power';
    if (isStrengthEvent(kind) || kind === 'Gym' || kind === 'Gym Workout') {
        return 'Full Body / Strength';
    }
    return null;
}

function parsePlanSlotEvent(slotKey) {
    const parts = String(slotKey || '').split('|');
    if (parts.length < 3) return parts[1] || '';
    return parts.slice(1, -1).join('|');
}

function bumpCreditKind(out, kind) {
    const k = normalizeLoggedSessionKind(kind);
    if (k === 'Cardio (Steady)') out.steady++;
    else if (k === 'Lactate') out.lactate++;
    else if (k === 'Full Body / Power') out.power++;
    else if (k === 'Full Body / Strength') out.strength++;
    return k;
}

/** Walk local logs, snapshots, and synced completed GPS slots for one calendar day. */
function forEachCreditOnDate(dateIso, fn) {
    if (!dateIso || typeof fn !== 'function') return;
    const map = loadLoggedSessionsMap();
    (Array.isArray(map[dateIso]) ? map[dateIso] : []).forEach((entry) => {
        fn(entry?.kind || entry, [entry?.sessionId, entry?.planSlotKey]);
    });
    Object.values(loadWorkoutSessionSnapshots() || {}).forEach((snap) => {
        if (snap?.dateIso !== dateIso) return;
        fn(snap.kind, [snap.id]);
    });
    Object.entries(loadCompletedPlanSlots() || {}).forEach(([slotKey, meta]) => {
        const slotDate = String(slotKey || '').split('|')[0];
        if (slotDate !== dateIso) return;
        fn(parsePlanSlotEvent(slotKey), [meta?.sessionId, slotKey]);
    });
}

/** Count logged Steady / Lactate / Gym sessions that already count for this week. */
export function countLoggedWorkoutCredits(weekStartISO) {
    const out = { steady: 0, lactate: 0, strength: 0, power: 0 };
    const seen = new Set();
    const weekEnd = addDaysISO(weekStartISO, 6);
    for (let i = 0; i < 7; i++) {
        const ds = addDaysISO(weekStartISO, i);
        if (ds < weekStartISO || ds > weekEnd) continue;
        forEachCreditOnDate(ds, (kind, ids) => {
            const tokens = (ids || []).filter(Boolean);
            if (tokens.some((t) => seen.has(t))) {
                tokens.forEach((t) => seen.add(t));
                return;
            }
            const before = out.steady + out.lactate + out.strength + out.power;
            const normalized = bumpCreditKind(out, kind);
            if (!normalized || out.steady + out.lactate + out.strength + out.power === before) return;
            if (tokens.length) tokens.forEach((t) => seen.add(t));
            else seen.add(`${ds}:${normalized}:${before}`);
        });
    }
    return out;
}

/** Consumable plan-credit kinds already logged on this calendar day (deduped). */
export function listLoggedCreditKeysForDate(dateIso) {
    const keys = [];
    const seen = new Set();
    forEachCreditOnDate(dateIso, (kind, ids) => {
        const tokens = (ids || []).filter(Boolean);
        if (tokens.some((t) => seen.has(t))) {
            tokens.forEach((t) => seen.add(t));
            return;
        }
        const normalized = normalizeLoggedSessionKind(kind);
        if (!normalized) return;
        if (tokens.length) tokens.forEach((t) => seen.add(t));
        else seen.add(`${dateIso}:${normalized}:${keys.length}`);
        keys.push(normalized);
    });
    return keys;
}

/** True when a gym/strength/hypertrophy slot on this date is already credited. */
export function dateHasCompletedLiftCredit(dateStr) {
    if (!dateStr) return false;
    let hit = false;
    forEachCreditOnDate(dateStr, (kind) => {
        if (normalizeLoggedSessionKind(kind) === 'Full Body / Strength') hit = true;
    });
    return hit;
}

export function dateHasCompletedPowerCredit(dateStr) {
    if (!dateStr) return false;
    let hit = false;
    forEachCreditOnDate(dateStr, (kind) => {
        if (normalizeLoggedSessionKind(kind) === 'Full Body / Power') hit = true;
    });
    return hit;
}

export function loadCompletedPlanSlots() {
    try {
        return JSON.parse(localStorage.getItem(COMPLETED_PLAN_SLOTS_KEY) || '{}') || {};
    } catch (e) {
        return {};
    }
}

export function saveCompletedPlanSlots(map) {
    localStorage.setItem(COMPLETED_PLAN_SLOTS_KEY, JSON.stringify(map || {}));
}

export function planSlotKey(dateIso, event, eventIndex = 0) {
    return `${dateIso}|${event}|${Number(eventIndex) || 0}`;
}

export function isPlanSlotCompleted(slotKey) {
    if (!slotKey) return false;
    return !!loadCompletedPlanSlots()[slotKey];
}

/** Mark a GPS plan slot done (idempotent). Returns true if newly marked. */
export function markPlanSlotCompleted(slotKey, { sessionId = null, weekStart = null } = {}) {
    if (!slotKey) return false;
    const map = loadCompletedPlanSlots();
    if (map[slotKey]) return false;
    map[slotKey] = {
        completedAt: new Date().toISOString(),
        sessionId: sessionId || null,
        weekStart: weekStart || null
    };
    saveCompletedPlanSlots(map);
    return true;
}

/**
 * List this week's GPS-planned sessions (full intended week, including already-done).
 * Done slots remain listed so they can still be loaded without earning another credit.
 */
export function listWeekGpsPlanSessions(refDate = new Date()) {
    const weekStart = getMondayISO(refDate);
    const plan = buildWeeklyTrainingPlan(weekStart, { ignoreLoggedCredits: true });
    const completed = loadCompletedPlanSlots();
    const out = [];
    (plan || []).forEach(day => {
        const events = (day.events || []).filter(e => e && !isRestEvent(e));
        events.forEach((event, eventIndex) => {
            const slotKey = planSlotKey(day.dateStr, event, eventIndex);
            const creditKind = normalizeLoggedSessionKind(event);
            out.push({
                slotKey,
                dateIso: day.dateStr,
                event,
                eventIndex,
                weekStart,
                label: prettyWorkoutTypeLabel(event),
                creditKind,
                completed: !!completed[slotKey],
                countsTowardQuota: !!(creditKind && !completed[slotKey])
            });
        });
    });
    return out;
}

/**
 * Record (or replace) a logged session for week-plan credit + Log tab editing.
 * Pass the same sessionId when re-saving an edited session to avoid double-counting.
 * Always writes a Log snapshot — even for Auxiliary / generic planned sessions.
 * Optional planSlotKey: marks that GPS slot done; skipCredit avoids double-counting repeats.
 */
export function recordLoggedWorkoutSession({
    dateIso,
    kind,
    sessionId,
    logIds = [],
    items = [],
    durationMinutes = 0,
    durationMs = 0,
    durationLabel = null,
    rpe = null,
    hitTypes = null,
    lactateSlot = null,
    isHitClass = null,
    lactateSummary = null,
    miscellaneousMs = null,
    planSlotKey: slotKey = null,
    skipCredit = false
} = {}) {
    if (!dateIso || !sessionId) return null;
    const creditKind = normalizeLoggedSessionKind(kind);
    // Keep the original session label for Log/display; only credits are collapsed
    const displayKind = kind || creditKind || 'Workout';

    // If loaded from GPS picker we have a slot; otherwise (new logs only) match first open week slot
    let resolvedSlotKey = slotKey || null;
    const existingSnap = loadWorkoutSessionSnapshots()[sessionId];
    if (!resolvedSlotKey && creditKind && !skipCredit && !existingSnap) {
        try {
            const weekSessions = listWeekGpsPlanSessions(new Date(dateIso + 'T12:00:00'));
            const open = (weekSessions || []).filter(s => s.creditKind === creditKind && !s.completed);
            const sameDay = open.find(s => s.dateIso === dateIso);
            resolvedSlotKey = (sameDay || open[0])?.slotKey || null;
        } catch (e) { /* ignore */ }
    }

    const alreadyDone = resolvedSlotKey ? isPlanSlotCompleted(resolvedSlotKey) : false;
    // New log of an already-done GPS slot: keep snapshot, skip quota. Re-saves still refresh the credit row.
    const isRepeatOfCompletedSlot = !existingSnap && alreadyDone;
    const shouldCredit = !!creditKind && !skipCredit && !isRepeatOfCompletedSlot;

    // Week-plan credit only for Steady / Lactate / Gym
    if (shouldCredit) {
        const map = loadLoggedSessionsMap();
        const dayList = Array.isArray(map[dateIso]) ? map[dateIso].filter(e => e && e.sessionId !== sessionId) : [];
        dayList.push({ kind: creditKind, sessionId, logIds: logIds.filter(Boolean), planSlotKey: resolvedSlotKey || null });
        map[dateIso] = dayList;
        saveLoggedSessionsMap(map);
    }

    if (resolvedSlotKey && !alreadyDone) {
        try {
            markPlanSlotCompleted(resolvedSlotKey, {
                sessionId,
                weekStart: getMondayISO(dateIso + 'T12:00:00')
            });
        } catch (e) { /* ignore */ }
    }

    const snaps = loadWorkoutSessionSnapshots();
    const prev = snaps[sessionId] || existingSnap || {};
    const mins = Number(durationMinutes);
    const ms = Number(durationMs);
    snaps[sessionId] = {
        id: sessionId,
        dateIso,
        kind: displayKind,
        createdAt: prev.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        logIds: logIds.filter(Boolean),
        items: JSON.parse(JSON.stringify(items || [])),
        durationMinutes: Number.isFinite(mins) && mins > 0 ? mins : (prev.durationMinutes || 0),
        durationMs: Number.isFinite(ms) && ms > 0 ? ms : (prev.durationMs || ((Number.isFinite(mins) && mins > 0) ? mins * 60000 : 0)),
        durationLabel: durationLabel || prev.durationLabel || null,
        rpe: rpe != null && Number.isFinite(Number(rpe)) ? Number(rpe) : (prev.rpe != null ? prev.rpe : null),
        hitTypes: Array.isArray(hitTypes) ? hitTypes : (prev.hitTypes || null),
        lactateSlot: lactateSlot != null ? lactateSlot : (prev.lactateSlot || null),
        isHitClass: isHitClass != null ? !!isHitClass : !!prev.isHitClass,
        lactateSummary: lactateSummary != null ? lactateSummary : (prev.lactateSummary || null),
        miscellaneousMs: Number.isFinite(Number(miscellaneousMs)) && Number(miscellaneousMs) >= 0
            ? Number(miscellaneousMs)
            : (prev.miscellaneousMs || 0)
    };
    saveWorkoutSessionSnapshots(snaps);

    try {
        if (typeof persistUserConfigToCloud === 'function') persistUserConfigToCloud();
    } catch (e) { /* ignore */ }

    return snaps[sessionId];
}

export function getWorkoutSessionSnapshot(sessionId) {
    if (!sessionId) return null;
    return loadWorkoutSessionSnapshots()[sessionId] || null;
}

export function removeWorkoutSessionSnapshot(sessionId) {
    if (!sessionId) return;
    const snaps = loadWorkoutSessionSnapshots();
    if (!snaps[sessionId]) return;
    const dateIso = snaps[sessionId].dateIso;
    delete snaps[sessionId];
    saveWorkoutSessionSnapshots(snaps);

    const map = loadLoggedSessionsMap();
    if (dateIso && Array.isArray(map[dateIso])) {
        map[dateIso] = map[dateIso].filter(e => e && e.sessionId !== sessionId);
        if (!map[dateIso].length) delete map[dateIso];
        saveLoggedSessionsMap(map);
    }
}

export function listWorkoutSessionsForDate(dateIso) {
    const snaps = loadWorkoutSessionSnapshots();
    return Object.values(snaps)
        .filter(s => s && s.dateIso === dateIso)
        .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
}

/** Collapse a planned/logged kind so gym variants (and sport labels) match across plan vs snapshots. */
export function daySessionMatchKey(kind) {
    const n = normalizeLoggedSessionKind(kind);
    if (n) return n;
    if (isPracticeEvent(kind) || /^practice$/i.test(kind || '')) return 'Practice';
    if (isGameEvent(kind) || /^(match|game)$/i.test(kind || '')) return 'Match';
    const s = String(kind || '').trim();
    return s || 'Workout';
}

/**
 * True once every planned training event for the calendar day has a matching completed session.
 * Extra unplanned sessions after that still count as “last session” (remaining planned is 0).
 */
export function isLastPlannedSessionOfDay(dateObj = new Date()) {
    const day = dateObj instanceof Date ? dateObj : new Date(dateObj);
    const planned = (getPlannedDayEvents(day) || []).filter(e => e && !isRestEvent(e));
    const iso = dateToISO(day);
    const completed = listWorkoutSessionsForDate(iso) || [];
    if (!completed.length) return false;
    const used = new Set();
    for (const ev of planned) {
        const pk = daySessionMatchKey(ev);
        const idx = completed.findIndex((s, i) => !used.has(i) && daySessionMatchKey(s.kind) === pk);
        if (idx >= 0) used.add(idx);
        else return false;
    }
    return true;
}

export function prettyWorkoutTypeLabel(kind) {
    // Hypertrophy / Strength A·B keep their plan labels (do not collapse to a generic gym title)
    if (isHypertrophyEvent(kind)) return prettyFocusName(kind) || kind;
    if (kind === 'Full Body / Strength A' || /Strength\s*A/i.test(kind || '')) return 'Strength Session A';
    if (kind === 'Full Body / Strength B' || /Strength\s*B/i.test(kind || '')) return 'Strength Session B';
    if (/steady(\s*state)?/i.test(kind || '')) return 'Steady State';
    const normalized = normalizeLoggedSessionKind(kind) || kind;
    if (normalized === 'Cardio (Steady)') return 'Steady State';
    if (normalized === 'Lactate') return 'Lactate/HIT';
    if (normalized === 'Full Body / Strength') return 'Strength Session';
    if (normalized === 'Auxiliary' || isAuxEvent(normalized)) return 'Auxiliary';
    if (typeof normalized === 'string' && normalized.includes('Power')) return 'Power';
    if (normalized === 'Workout') return 'Workout';
    return prettyFocusName(kind || 'Workout');
}

export function matchRequiresNextDayRest(matchDateStr) {
    const j = loadDayJournal(matchDateStr);
    if (j && (j.source === 'match' || j.type === 'match') && Number(j.rpe) > 5) return true;
    try {
        const raw = localStorage.getItem('ascensus_match_journal_' + matchDateStr);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Number(parsed.rpe) > 5) return true;
        }
    } catch (e) {}
    // Legacy override written by older match logs
    const next = addDaysISO(matchDateStr, 1);
    const ov = loadRouteOverrides()[next];
    return (ov === 'Rest' || ov === 'Rest (Cardio Only)')
        && localStorage.getItem('ascensus_match_rest_' + matchDateStr) === '1';
}

export function dayHasStrength(events) {
    return (events || []).some(isStrengthEvent);
}

export function isHardLiftEvent(e) {
    // Strength / Aux / Lactate / Power — NOT steady cardio
    return isStrengthEvent(e) || isAuxEvent(e) || isLactateEvent(e) ||
        (typeof e === 'string' && e.includes('Power'));
}

export function dayHasHardLift(events) {
    return (events || []).some(isHardLiftEvent);
}

export function slotsUsed(events) {
    return (events || []).length;
}

export function canAcceptGPS(day, focus) {
    if (!day || !focus) return false;
    if (day.events.some(isRestEvent) || day.events.some(isGameEvent)) return false;
    if (slotsUsed(day.events) >= 2) return false;
    if (day.events.some(isPracticeEvent) && !canShareWithPractice(focus)) return false;
    // Never two of the same session type on one day
    if (isStrengthEvent(focus) && dayHasStrength(day.events)) return false;
    if (isPowerEvent(focus) && day.events.some(isPowerEvent)) return false;
    if (isPowerEvent(focus) && dayHasStrength(day.events)) return false;
    if (isStrengthEvent(focus) && day.events.some(isPowerEvent)) return false;
    if (isPowerEvent(focus) && day.events.some(isLactateEvent)) return false;
    if (isLactateEvent(focus) && day.events.some(isPowerEvent)) return false;
    if (isAuxEvent(focus) && day.events.some(isAuxEvent)) return false;
    if (isLactateEvent(focus) && day.events.some(isLactateEvent)) return false;
    if (isSteadyCardio(focus) && day.events.some(isSteadyCardio)) return false;
    return true;
}

export function wouldCreateThreeStrengthStreak(days, index) {
    const has = (i) => i >= 0 && i < days.length && dayHasStrength(days[i].events);
    if (has(index - 2) && has(index - 1)) return true;
    if (has(index - 1) && has(index + 1)) return true;
    if (has(index + 1) && has(index + 2)) return true;
    return false;
}

export function isDayBeforeMatch(days, index) {
    return index < days.length - 1 && (days[index + 1].events || []).some(isGameEvent);
}

export function sameFocusFamily(focus, e) {
    if (isStrengthEvent(focus)) return isStrengthEvent(e);
    if (isAuxEvent(focus)) return isAuxEvent(e);
    if (isLactateEvent(focus)) return isLactateEvent(e);
    if (isSteadyCardio(focus)) return isSteadyCardio(e);
    return e === focus;
}

export function scoreDayForPlacement(days, index, focus, opts = {}) {
    if (!canAcceptGPS(days[index], focus)) return -Infinity;
    if (!opts.ignoreStrengthStreak && isStrengthEvent(focus) && wouldCreateThreeStrengthStreak(days, index)) return -Infinity;
    if (opts.forbidBeforeMatch && isLactateEvent(focus) && isDayBeforeMatch(days, index)) return -Infinity;

    let score = 0;
    const placingHard = isHardLiftEvent(focus);
    const adjLift =
        (index > 0 && dayHasHardLift(days[index - 1].events)) ||
        (index < days.length - 1 && dayHasHardLift(days[index + 1].events));
    // Prefer no back-to-back hard lifts unless absolutely necessary
    if (placingHard && adjLift) score -= opts.allowAdjacent ? 40 : 120;

    let minDistSame = 99;
    days.forEach((d, i) => {
        if (i === index) return;
        if ((d.events || []).some(e => sameFocusFamily(focus, e))) {
            minDistSame = Math.min(minDistSame, Math.abs(i - index));
        }
    });
    score += (minDistSame < 99 ? minDistSame * 12 : 55);
    score += (2 - slotsUsed(days[index].events)) * 4;
    // Slight preference for mid-week spacing anchors
    score += (index === 0 || index === 6) ? 0 : 1;

    // Lactate: prefer after Match, and on / after Practice (so high RPE can replace it)
    if (isLactateEvent(focus)) {
        if (index > 0 && (days[index - 1].events || []).some(isGameEvent)) score += 100;
        if ((days[index].events || []).some(isPracticeEvent)) score += 80;
        else if (index > 0 && (days[index - 1].events || []).some(isPracticeEvent)) score += 45;
    }
    return score;
}

export function placeBestGPS(days, focus, opts = {}) {
    let best = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < days.length; i++) {
        const s = scoreDayForPlacement(days, i, focus, { ...opts, allowAdjacent: false });
        if (s > bestScore) { bestScore = s; best = i; }
    }
    // Absolute necessity: allow adjacent hard lifts if nothing else fits
    if (best < 0 || bestScore === -Infinity) {
        best = -1;
        bestScore = -Infinity;
        for (let i = 0; i < days.length; i++) {
            const s = scoreDayForPlacement(days, i, focus, { ...opts, allowAdjacent: true });
            if (s > bestScore) { bestScore = s; best = i; }
        }
    }
    if (best < 0 || bestScore === -Infinity) return false;
    return pushGPS(days[best], focus);
}

export function pushGPS(day, focus) {
    if (!canAcceptGPS(day, focus)) return false;
    day.events.push(focus);
    return true;
}

/** Strength Session A/B only — hypertrophy shares isStrengthEvent but must not take A/B labels. */
export function isStrengthABEvent(e) {
    return typeof e === 'string' && e.includes('Strength') && !e.includes('Hypertrophy');
}

export function resolveStrengthEventLetter(e) {
    if (!isStrengthABEvent(e)) return null;
    if (/Strength\s*B/i.test(e) || /\sB$/i.test(e)) return 'B';
    if (/Strength\s*A/i.test(e) || /\sA$/i.test(e)) return 'A';
    return null;
}

export function strengthLabelForLetter(letter) {
    return letter === 'B' ? 'Full Body / Strength B' : 'Full Body / Strength A';
}

const STRENGTH_WEEK_STICKY_KEY = 'ascensus_strength_week_sticky_v1';
const STRENGTH_STICKY_KEEP_WEEKS = 20;

function loadAllStrengthWeekSticky() {
    try {
        const raw = JSON.parse(localStorage.getItem(STRENGTH_WEEK_STICKY_KEY) || 'null');
        if (raw && raw.weeks && typeof raw.weeks === 'object') return raw.weeks;
        if (raw && raw.weekStart) {
            return { [raw.weekStart]: { sessions: raw.sessions || [], lastLetter: raw.lastLetter || null } };
        }
    } catch (e) { /* ignore */ }
    return {};
}

function pruneStrengthWeekSticky(weeks, keepAroundISO) {
    const keys = Object.keys(weeks || {});
    if (keys.length <= STRENGTH_STICKY_KEEP_WEEKS) return weeks;
    const anchor = keepAroundISO || keys[keys.length - 1];
    const scored = keys.map((k) => {
        const a = new Date((anchor || k) + 'T12:00:00').getTime();
        const b = new Date(k + 'T12:00:00').getTime();
        return { k, dist: Number.isFinite(a) && Number.isFinite(b) ? Math.abs(a - b) : Infinity };
    });
    scored.sort((x, y) => x.dist - y.dist);
    const keep = new Set(scored.slice(0, STRENGTH_STICKY_KEEP_WEEKS).map((s) => s.k));
    const next = {};
    keys.forEach((k) => { if (keep.has(k)) next[k] = weeks[k]; });
    return next;
}

function loadStrengthWeekSticky(weekStart) {
    const weeks = loadAllStrengthWeekSticky();
    const row = weekStart ? weeks[weekStart] : null;
    if (!row || typeof row !== 'object') return { sessions: [], lastLetter: null };
    return {
        sessions: Array.isArray(row.sessions) ? row.sessions : [],
        lastLetter: row.lastLetter === 'B' ? 'B' : (row.lastLetter === 'A' ? 'A' : null)
    };
}

function saveStrengthWeekSticky(weekStart, sessions, lastLetter) {
    if (!weekStart) return;
    let weeks = loadAllStrengthWeekSticky();
    weeks[weekStart] = { sessions: sessions || [], lastLetter: lastLetter || null };
    weeks = pruneStrengthWeekSticky(weeks, weekStart);
    try {
        localStorage.setItem(STRENGTH_WEEK_STICKY_KEY, JSON.stringify({ weeks }));
    } catch (e) { /* ignore */ }
}

export function getWeekStartStrengthLetter(weekStartISO) {
    if (!weekStartISO) return 'A';
    const sticky = loadStrengthWeekSticky(weekStartISO);
    const first = sticky.sessions && sticky.sessions[0] && sticky.sessions[0].letter;
    if (first === 'A' || first === 'B') return first;

    const prevISO = addDaysISO(weekStartISO, -7);
    const prev = loadStrengthWeekSticky(prevISO);
    if (prev.lastLetter === 'A' || prev.lastLetter === 'B') {
        return prev.lastLetter === 'A' ? 'B' : 'A';
    }
    // Legacy single-tail keys — only valid when they actually belong to last week
    try {
        const prevWeek = localStorage.getItem('ascensus_strength_plan_tail_week');
        const prevTail = localStorage.getItem('ascensus_strength_plan_tail');
        if (prevWeek === prevISO && (prevTail === 'A' || prevTail === 'B')) {
            return prevTail === 'A' ? 'B' : 'A';
        }
    } catch (e) { /* ignore */ }
    return 'A';
}

export function persistWeekStrengthTail(days) {
    if (!days || !days.length) return;
    const weekStart = days[0].dateStr;
    const sessions = [];
    let lastLetter = null;
    for (let i = 0; i < days.length; i++) {
        const ev = (days[i].events || []).find(isStrengthABEvent);
        if (!ev) continue;
        const letter = resolveStrengthEventLetter(ev) || 'A';
        sessions.push({ dateStr: days[i].dateStr, letter });
        lastLetter = letter;
    }
    if (!sessions.length) return;
    saveStrengthWeekSticky(weekStart, sessions, lastLetter);
    // Keep legacy keys for cloud sync, but never let another week clobber this week's map entry
    try {
        localStorage.setItem('ascensus_strength_plan_tail', lastLetter);
        localStorage.setItem('ascensus_strength_plan_tail_week', weekStart);
    } catch (e) { /* ignore */ }
}

/** Apply Strength A/B labels. Dates already sticky for this week keep their letter. */
export function enforceStrengthABAlternation(days, startLetter = 'A', { pinSticky = true } = {}) {
    const weekStart = days[0] && days[0].dateStr;
    const sticky = (pinSticky && weekStart) ? loadStrengthWeekSticky(weekStart) : { sessions: [] };
    const byDate = Object.create(null);
    (sticky.sessions || []).forEach((s) => {
        if (s && s.dateStr && (s.letter === 'A' || s.letter === 'B')) byDate[s.dateStr] = s.letter;
    });

    let letter = startLetter === 'B' ? 'B' : 'A';
    for (let i = 0; i < days.length; i++) {
        const sIdx = (days[i].events || []).findIndex(isStrengthABEvent);
        if (sIdx < 0) continue;
        const pinned = byDate[days[i].dateStr];
        const use = (pinned === 'A' || pinned === 'B') ? pinned : letter;
        days[i].events[sIdx] = strengthLabelForLetter(use);
        letter = use === 'A' ? 'B' : 'A';
    }
}

function indexCombinations(arr, k) {
    if (k <= 0) return [[]];
    if (k > arr.length) return [];
    const out = [];
    const rec = (start, acc) => {
        if (acc.length === k) {
            out.push(acc.slice());
            return;
        }
        for (let i = start; i < arr.length; i++) {
            acc.push(arr[i]);
            rec(i + 1, acc);
            acc.pop();
        }
    };
    rec(0, []);
    return out;
}

function countStrengthTriples(indices) {
    const set = new Set(indices);
    let n = 0;
    for (let i = 0; i <= 4; i++) {
        if (set.has(i) && set.has(i + 1) && set.has(i + 2)) n++;
    }
    return n;
}

function strengthPackSpacing(indices) {
    if (indices.length <= 1) return 50;
    const sorted = [...indices].sort((a, b) => a - b);
    let minDist = 99;
    let gapSum = 0;
    for (let i = 1; i < sorted.length; i++) {
        const d = sorted[i] - sorted[i - 1];
        minDist = Math.min(minDist, d);
        gapSum += d;
    }
    return minDist * 12 + gapSum + (sorted[sorted.length - 1] - sorted[0]);
}

/** Pick `target` strength days. Prefer no 3-in-a-row, then sticky dates, then spacing. */
function chooseStrengthDayIndexes(available, target, stickySet) {
    const n = Math.min(target, available.length);
    if (n <= 0) return [];
    if (n >= available.length) return available.slice();
    let best = null;
    let bestScore = -Infinity;
    indexCombinations(available, n).forEach((combo) => {
        const triples = countStrengthTriples(combo);
        let stickyKept = 0;
        combo.forEach((i) => { if (stickySet.has(i)) stickyKept++; });
        const score = (-triples * 10000) + (stickyKept * 100) + strengthPackSpacing(combo);
        if (score > bestScore) {
            bestScore = score;
            best = combo;
        }
    });
    return best || available.slice(0, n);
}

export function placeStrengthSessions(days, count) {
    const target = Math.min(4, Math.max(0, parseInt(count, 10) || 0));
    const weekStartISO = days[0] ? days[0].dateStr : null;
    const startLetter = weekStartISO ? getWeekStartStrengthLetter(weekStartISO) : 'A';
    const sticky = weekStartISO ? loadStrengthWeekSticky(weekStartISO) : { sessions: [] };
    const stickyDates = (sticky.sessions || []).map((s) => s.dateStr).filter(Boolean);

    const available = [];
    const stickySet = new Set();
    for (let i = 0; i < days.length; i++) {
        const has = (days[i].events || []).some(isStrengthABEvent);
        if (has && dateHasCompletedLiftCredit(days[i].dateStr)) {
            const sIdx = days[i].events.findIndex(isStrengthABEvent);
            if (sIdx >= 0) days[i].events.splice(sIdx, 1);
            continue;
        }
        if (has || canAcceptGPS(days[i], 'Full Body / Strength A')) {
            available.push(i);
            if (stickyDates.includes(days[i].dateStr)) stickySet.add(i);
        }
    }

    const chosen = chooseStrengthDayIndexes(available, target, stickySet);
    const chosenSet = new Set(chosen);
    for (let i = 0; i < days.length; i++) {
        const sIdx = (days[i].events || []).findIndex(isStrengthABEvent);
        if (chosenSet.has(i)) {
            if (sIdx < 0) pushGPS(days[i], 'Full Body / Strength A');
        } else if (sIdx >= 0) {
            days[i].events.splice(sIdx, 1);
            if (!days[i].events.length) days[i].events = [];
        }
    }

    const chosenDates = chosen.map((i) => days[i].dateStr).sort().join('|');
    const stickyKey = [...stickyDates].sort().join('|');
    enforceStrengthABAlternation(days, startLetter, { pinSticky: chosenDates === stickyKey && !!chosenDates });
    persistWeekStrengthTail(days);
    return chosen.length;
}

/**
 * Place hypertrophy sessions (PPL / Upper-Lower / Full Body) up to 6×/week.
 * Never on Match/Game; Rest overrides win. Adjacent days allowed for PPL.
 * Kind labels are sticky for the calendar week so hard refresh does not rotate Push/Pull/Legs.
 */
export function placeHypertrophySessions(days, count) {
    const prefs = getHypertrophyPlanPrefs();
    const target = Math.min(6, Math.max(0, parseInt(count, 10) || prefs.sessionCount || 0));
    const split = prefs.split;
    const weekStart = days[0]?.dateStr || '';
    const sticky = loadHypertrophyWeekSticky(weekStart, split);

    let liftIdx = [];
    for (let i = 0; i < days.length; i++) {
        if (!dayHasStrength(days[i].events)) continue;
        if (dateHasCompletedLiftCredit(days[i].dateStr)) {
            const sIdx = days[i].events.findIndex(isStrengthEvent);
            if (sIdx >= 0) days[i].events.splice(sIdx, 1);
            continue;
        }
        liftIdx.push(i);
    }

    // Re-apply sticky dates first (as long as day is still placeable)
    const stickyDates = sticky.sessions.map(s => s.dateStr);
    stickyDates.forEach(dateStr => {
        const i = days.findIndex(d => d.dateStr === dateStr);
        if (i < 0 || liftIdx.includes(i)) return;
        if (dateHasCompletedLiftCredit(dateStr)) return;
        if ((days[i].events || []).some(isGameEvent)) return;
        if ((days[i].events || []).some(e => e === 'Rest' || e === 'Cannot Workout')) return;
        const kind = sticky.sessions.find(s => s.dateStr === dateStr)?.kind
            || (split === 'ppl' ? 'push' : split === 'ul' ? 'upper' : 'full');
        if (pushGPS(days[i], hypertrophyEventForKind(kind))) {
            liftIdx.push(i);
        }
    });
    liftIdx.sort((a, b) => a - b);

    while (liftIdx.length > target) {
        // Prefer trimming days that were not in the sticky plan (newest extras)
        let dropPos = -1;
        for (let k = liftIdx.length - 1; k >= 0; k--) {
            const ds = days[liftIdx[k]].dateStr;
            if (!stickyDates.includes(ds)) { dropPos = k; break; }
        }
        if (dropPos < 0) dropPos = liftIdx.length - 1;
        const i = liftIdx.splice(dropPos, 1)[0];
        const sIdx = days[i].events.findIndex(isStrengthEvent);
        if (sIdx >= 0) days[i].events.splice(sIdx, 1);
    }

    while (liftIdx.length < target) {
        let best = -1;
        let bestScore = -Infinity;
        for (let i = 0; i < 7; i++) {
            if (liftIdx.includes(i)) continue;
            if ((days[i].events || []).some(isGameEvent)) continue;
            if ((days[i].events || []).some(e => e === 'Rest' || e === 'Cannot Workout')) continue;
            const probe = hypertrophyEventForKind(split === 'ppl' ? 'push' : split === 'ul' ? 'upper' : 'full');
            let s = scoreDayForPlacement(days, i, probe, { allowAdjacent: true, ignoreStrengthStreak: true });
            if (s === -Infinity) continue;
            let minDist = 99;
            liftIdx.forEach(idx => { minDist = Math.min(minDist, Math.abs(idx - i)); });
            if (split === 'ppl') s += (minDist === 1 ? 12 : minDist * 4);
            else s += (minDist < 99 ? minDist * 8 : 40);
            if (s > bestScore) { bestScore = s; best = i; }
        }
        if (best < 0) break;
        const probe = hypertrophyEventForKind(split === 'ppl' ? 'push' : split === 'ul' ? 'upper' : 'full');
        if (!pushGPS(days[best], probe)) break;
        liftIdx.push(best);
        liftIdx.sort((a, b) => a - b);
    }

    // Assign kinds: reuse sticky by date; only mint new kinds for new dates
    const byDate = {};
    sticky.sessions.forEach(s => { byDate[s.dateStr] = s.kind; });

    let kindCursor = sticky.nextStartKind
        || (() => {
            try {
                const prev = localStorage.getItem('ascensus_hypertrophy_tail');
                if (prev) return nextHypertrophyRotation([prev], split);
            } catch (e) { /* ignore */ }
            return split === 'ppl' ? 'push' : split === 'ul' ? 'upper' : 'full';
        })();

    const sessions = [];
    for (let i = 0; i < days.length; i++) {
        const sIdx = (days[i].events || []).findIndex(isStrengthEvent);
        if (sIdx < 0) continue;
        const dateStr = days[i].dateStr;
        let kind = byDate[dateStr];
        if (!kind || !isHypertrophyKindForSplit(kind, split)) {
            kind = kindCursor;
            kindCursor = nextHypertrophyRotation([kind], split);
        }
        days[i].events[sIdx] = hypertrophyEventForKind(kind);
        sessions.push({ dateStr, kind });
    }

    saveHypertrophyWeekSticky(weekStart, split, sessions, kindCursor);

    // Tail = last kind this week (for NEXT week only). Do not advance on every rebuild.
    if (sessions.length) {
        try {
            localStorage.setItem('ascensus_hypertrophy_tail', sessions[sessions.length - 1].kind);
            localStorage.setItem('ascensus_hypertrophy_tail_week', weekStart);
        } catch (e) { /* ignore */ }
    }
    return liftIdx.length;
}

const HYP_WEEK_STICKY_KEY = 'ascensus_hyp_week_sticky_v1';

function isHypertrophyKindForSplit(kind, split) {
    if (split === 'ppl') return kind === 'push' || kind === 'pull' || kind === 'legs';
    if (split === 'ul') return kind === 'upper' || kind === 'lower';
    return kind === 'full';
}

function loadHypertrophyWeekSticky(weekStart, split) {
    try {
        const raw = JSON.parse(localStorage.getItem(HYP_WEEK_STICKY_KEY) || 'null');
        if (!raw || raw.weekStart !== weekStart || raw.split !== split) {
            return { sessions: [], nextStartKind: null };
        }
        return {
            sessions: Array.isArray(raw.sessions) ? raw.sessions : [],
            nextStartKind: raw.nextStartKind || null
        };
    } catch (e) {
        return { sessions: [], nextStartKind: null };
    }
}

function saveHypertrophyWeekSticky(weekStart, split, sessions, nextStartKind) {
    try {
        localStorage.setItem(HYP_WEEK_STICKY_KEY, JSON.stringify({
            weekStart,
            split,
            sessions,
            nextStartKind
        }));
    } catch (e) { /* ignore */ }
}

export function isQualifyingRestDay(events) {
    const ev = events || [];
    if (!ev.length) return true;
    if (ev.some(isGameEvent) || ev.some(isPracticeEvent) || dayHasHardLift(ev)) return false;
    return ev.every(e => isRestEvent(e) || isSteadyCardio(e));
}

export function ensureWeeklySoftRestDay(days) {
    if (days.some(d => isQualifyingRestDay(d.events))) return;
    // Prefer an empty / Rest day, else a Steady-only day, else strip a removable GPS day
    for (let i = 0; i < days.length; i++) {
        if (days[i].events.length === 0 || days[i].events.every(isRestEvent)) {
            days[i].events = ['Rest'];
            return;
        }
    }
    for (let i = 0; i < days.length; i++) {
        if (days[i].events.every(e => isSteadyCardio(e) || isRestEvent(e)) &&
            !days[i].events.some(isPracticeEvent) && !days[i].events.some(isGameEvent)) {
            days[i].events = days[i].events.filter(isSteadyCardio);
            if (!days[i].events.length) days[i].events = ['Rest'];
            return;
        }
    }
    // Last resort: clear a day that only has Aux/Lactate/Steady (never Match/Practice/locked Rest)
    for (let i = days.length - 1; i >= 0; i--) {
        const d = days[i];
        if (d.events.some(isGameEvent) || d.events.some(isPracticeEvent)) continue;
        if (d.events.some(isStrengthEvent) || d.events.some(isPowerEvent)) continue;
        const removable = d.events.every(e => isAuxEvent(e) || isLactateEvent(e) || isSteadyCardio(e) || isRestEvent(e));
        if (removable) {
            d.events = ['Rest'];
            return;
        }
    }
}

/** Keep at most one Aux / one Lactate / one Strength / one Steady per day (fixed schedules can duplicate). */
export function dedupeHardSessionsPerDay(days) {
    (days || []).forEach(day => {
        let seenAux = false;
        let seenLactate = false;
        let seenStrength = false;
        let seenSteady = false;
        let seenPower = false;
        day.events = (day.events || []).filter(e => {
            if (isAuxEvent(e)) {
                if (seenAux) return false;
                seenAux = true;
            } else if (isLactateEvent(e)) {
                if (seenLactate) return false;
                seenLactate = true;
            } else if (isPowerEvent(e)) {
                if (seenPower) return false;
                seenPower = true;
            } else if (isStrengthEvent(e)) {
                if (seenStrength) return false;
                seenStrength = true;
            } else if (isSteadyCardio(e)) {
                if (seenSteady) return false;
                seenSteady = true;
            }
            return true;
        });
    });
}

/**
 * Weekly GPS quotas (driven by Algorithms gym prefs):
 * - Strength count from gym willingness / band aux (max 4)
 * - Aux: separate days when attachMode is none; otherwise co-scheduled on strength days
 * - Space equivalent hard sessions; avoid back-to-back lifts when possible
 * - Lactate never the day before a Match/Game; prefer after Match / with Practice
 * - ≥1 soft rest day (Rest or Steady-only) per week
 * - Steady ×2; Lactate ×2 minus Practice/Match RPE > 6 credits
 */
export function countEventType(days, pred) {
    return (days || []).reduce((n, d) => n + ((d.events || []).some(pred) ? 1 : 0), 0);
}

export function trimEventTypeToQuota(days, pred, quota) {
    const cap = Math.max(0, Number(quota) || 0);
    let count = countEventType(days, pred);
    if (count <= cap) return;
    for (let i = days.length - 1; i >= 0 && count > cap; i--) {
        const idx = (days[i].events || []).findIndex(pred);
        if (idx < 0) continue;
        days[i].events.splice(idx, 1);
        count--;
        if (!days[i].events.length) days[i].events = [];
    }
}

/** Absolute last-pass: never more than `cap` Auxiliary days in the week. */
export function enforceAuxiliaryCap(days, cap = 2) {
    const limit = Math.min(2, Math.max(0, Number(cap) || 0));
    trimEventTypeToQuota(days, isAuxEvent, limit);
    return countEventType(days, isAuxEvent);
}

/** Remove every Auxiliary marker from the week (before re-placing to quota). */
export function stripAllAuxiliary(days) {
    (days || []).forEach(day => {
        day.events = (day.events || []).filter(e => !isAuxEvent(e));
        if (!day.events.length) day.events = [];
    });
}

/**
 * Place Auxiliary to an exact weekly quota (max 2).
 * Band mode: always standalone Aux days (never co-label Strength + Aux on the timetable).
 * Non-band: attach to strength when attachMode says so, else standalone.
 */
export function placeAuxiliarySessions(days, prefs) {
    if (isHypertrophyPhase() || (prefs && prefs.strengthPhase)) {
        stripAllAuxiliary(days);
        return 0;
    }
    const cap = Math.min(2, Math.max(0, Number(prefs.auxCount) || 0));
    stripAllAuxiliary(days);
    if (cap <= 0) return 0;

    // Band auxiliary: always exactly `cap` separate calendar sessions (max 2)
    if (prefs.band || prefs.attachMode === 'none') {
        let left = cap;
        while (left > 0) {
            if (!placeBestGPS(days, 'Auxiliary')) break;
            left--;
        }
        // Force onto Rest / empty days if scoring placement fell short
        left = Math.max(0, cap - countEventType(days, isAuxEvent));
        for (let i = 0; i < days.length && left > 0; i++) {
            const ev = days[i].events || [];
            if (ev.some(isAuxEvent) || ev.some(isGameEvent) || ev.some(isStrengthEvent)) continue;
            if (!ev.length || (ev.length === 1 && isRestEvent(ev[0]))) {
                days[i].events = ['Auxiliary'];
                left--;
            }
        }
        // Last resort: share with Practice only
        left = Math.max(0, cap - countEventType(days, isAuxEvent));
        for (let i = 0; i < days.length && left > 0; i++) {
            if (pushGPS(days[i], 'Auxiliary')) left--;
        }
    } else {
        // Gym aux attached to strength days (still max 2)
        attachAuxiliaryToStrengthDays(days, cap);
    }

    enforceAuxiliaryCap(days, cap);
    return countEventType(days, isAuxEvent);
}

/**
 * Land exactly `quota` Lactate days (default 2, reduced by Practice/Match RPE > 6).
 * Prefer: day after Match → same day as Practice → day after Practice → scored fill.
 */
export function ensureLactateSessions(days, quota = 2) {
    const target = Math.max(0, Number(quota) || 0);

    const tryPlaceOn = (i) => {
        if (i < 0 || i >= days.length) return false;
        if (isDayBeforeMatch(days, i)) return false;
        const ev = days[i].events || [];
        if (ev.some(isLactateEvent)) return true;
        if (ev.some(isGameEvent)) return false;
        if (pushGPS(days[i], 'Lactate')) return true;
        if (!ev.length || (ev.length === 1 && isRestEvent(ev[0]))) {
            days[i].events = ['Lactate'];
            return true;
        }
        return false;
    };

    // Pass 0: one lactate after Match when a match is in the week
    let left = Math.max(0, target - countEventType(days, isLactateEvent));
    if (left > 0) {
        const matchIdx = days.findIndex(d => (d.events || []).some(isGameEvent));
        if (matchIdx >= 0 && tryPlaceOn(matchIdx + 1)) left--;
    }

    // Pass 1: follow Practice (same day — afternoon)
    left = Math.max(0, target - countEventType(days, isLactateEvent));
    for (let i = 0; i < days.length && left > 0; i++) {
        if (!(days[i].events || []).some(isPracticeEvent)) continue;
        if (tryPlaceOn(i)) left--;
    }

    // Pass 2: day after Practice
    left = Math.max(0, target - countEventType(days, isLactateEvent));
    for (let i = 1; i < days.length && left > 0; i++) {
        if (!(days[i - 1].events || []).some(isPracticeEvent)) continue;
        if (tryPlaceOn(i)) left--;
    }

    // Pass 3: scored placement (never day before match)
    left = Math.max(0, target - countEventType(days, isLactateEvent));
    while (left > 0) {
        if (!placeBestGPS(days, 'Lactate', { forbidBeforeMatch: true })) break;
        left--;
    }

    // Pass 4: empty / Rest-only days
    left = Math.max(0, target - countEventType(days, isLactateEvent));
    for (let i = 0; i < days.length && left > 0; i++) {
        if (isDayBeforeMatch(days, i)) continue;
        const ev = days[i].events || [];
        if (!ev.length || (ev.length === 1 && isRestEvent(ev[0]))) {
            days[i].events = ['Lactate'];
            left--;
        }
    }

    // Pass 5: any open GPS slot
    left = Math.max(0, target - countEventType(days, isLactateEvent));
    for (let i = 0; i < days.length && left > 0; i++) {
        if (isDayBeforeMatch(days, i)) continue;
        if (pushGPS(days[i], 'Lactate')) left--;
    }

    // Pass 6: last resort — replace soft days (keep Match / Strength / Aux / Steady)
    left = Math.max(0, target - countEventType(days, isLactateEvent));
    for (let i = days.length - 1; i >= 0 && left > 0; i--) {
        if (isDayBeforeMatch(days, i)) continue;
        const d = days[i];
        const ev = d.events || [];
        if (ev.some(isLactateEvent)) continue;
        if (ev.some(isGameEvent) || ev.some(isStrengthEvent) || ev.some(isAuxEvent) || ev.some(isSteadyCardio)) continue;
        const keep = ev.filter(e => isPracticeEvent(e));
        d.events = keep.length ? [...keep, 'Lactate'].slice(0, 2) : ['Lactate'];
        left--;
    }

    trimEventTypeToQuota(days, isLactateEvent, target);
    return countEventType(days, isLactateEvent);
}

export function attachAuxiliaryToStrengthDays(days, auxCount) {
    const cap = Math.min(2, Math.max(0, auxCount || 0));
    if (cap <= 0) return 0;
    const strengthDays = days.filter(d => dayHasStrength(d.events));
    let attached = 0;
    for (const day of strengthDays) {
        if (attached >= cap) break;
        if (day.events.some(isAuxEvent)) { attached++; continue; }
        if (pushGPS(day, 'Auxiliary')) attached++;
    }
    return attached;
}

/** Always land exactly `quota` steady-state days (default 2). */
export function ensureSteadySessions(days, quota = 2) {
    const target = Math.max(0, quota);

    // Pass 1: normal scored placement
    let left = Math.max(0, target - countEventType(days, isSteadyCardio));
    while (left > 0) {
        if (!placeBestGPS(days, 'Cardio (Steady)')) break;
        left--;
    }

    // Pass 2: convert empty / Rest-only days into Steady
    left = Math.max(0, target - countEventType(days, isSteadyCardio));
    for (let i = 0; i < days.length && left > 0; i++) {
        const ev = days[i].events || [];
        if (!ev.length || (ev.length === 1 && isRestEvent(ev[0]))) {
            days[i].events = ['Cardio (Steady)'];
            left--;
        }
    }

    // Pass 3: share with Practice / open slots via normal GPS rules
    left = Math.max(0, target - countEventType(days, isSteadyCardio));
    for (let i = 0; i < days.length && left > 0; i++) {
        if (pushGPS(days[i], 'Cardio (Steady)')) left--;
    }

    // Pass 4: last resort — replace non-match / non-strength / non-aux days
    left = Math.max(0, target - countEventType(days, isSteadyCardio));
    for (let i = days.length - 1; i >= 0 && left > 0; i--) {
        const d = days[i];
        const ev = d.events || [];
        if (ev.some(isSteadyCardio)) continue;
        if (ev.some(isGameEvent) || ev.some(isStrengthEvent) || ev.some(isAuxEvent)) continue;
        const keep = ev.filter(e => isPracticeEvent(e));
        d.events = keep.length ? [...keep, 'Cardio (Steady)'].slice(0, 2) : ['Cardio (Steady)'];
        left--;
    }

    // Never keep more than `target`
    trimEventTypeToQuota(days, isSteadyCardio, target);
    return countEventType(days, isSteadyCardio);
}

function stripPowerEvents(days) {
    (days || []).forEach((day) => {
        day.events = (day.events || []).filter((e) => !isPowerEvent(e));
        if (!day.events.length) day.events = [];
    });
}

function dayIsRestish(day) {
    const ev = day?.events || [];
    if (!ev.length) return true;
    return ev.every((e) => isRestEvent(e));
}

function dayAfterLactate(days, i) {
    return i > 0 && (days[i - 1].events || []).some(isLactateEvent);
}

function dayAfterPractice(days, i) {
    return i > 0 && (days[i - 1].events || []).some(isPracticeEvent);
}

function canHostPower(days, i, { allowAfterPractice = false } = {}) {
    if (i < 0 || i >= days.length) return false;
    const ev = days[i].events || [];
    if (ev.some(isPowerEvent)) return true;
    if (ev.some(isGameEvent)) return false;
    if (dayAfterLactate(days, i)) return false;
    if (!allowAfterPractice && dayAfterPractice(days, i)) return false;
    if (ev.some(isStrengthEvent) || ev.some(isLactateEvent)) return false;
    const live = ev.filter((e) => !isRestEvent(e));
    if (live.some(isPracticeEvent)) return live.length < 2;
    if (live.length >= 2) return false;
    return true;
}

function commitPowerOnDay(days, i) {
    if (i < 0 || i >= days.length) return false;
    const ev = (days[i].events || []).filter((e) => !isRestEvent(e) && !isPowerEvent(e));
    if (ev.some(isGameEvent) || ev.some(isStrengthEvent) || ev.some(isLactateEvent)) return false;
    if (ev.some(isPracticeEvent)) {
        days[i].events = [POWER_EVENT, ...ev].slice(0, 2);
        return true;
    }
    if (!ev.length) {
        days[i].events = [POWER_EVENT];
        return true;
    }
    if (ev.length < 2) {
        days[i].events = [POWER_EVENT, ...ev].slice(0, 2);
        return true;
    }
    return false;
}

function tryPlacePowerAt(days, i, opts = {}) {
    if (!canHostPower(days, i, opts)) return false;
    if ((days[i].events || []).some(isPowerEvent)) return true;
    return commitPowerOnDay(days, i);
}

function placePowerEarliestAfterRest(days, opts = {}) {
    for (let i = 1; i < days.length; i++) {
        if (!dayIsRestish(days[i - 1]) && !isQualifyingRestDay(days[i - 1].events)) continue;
        if (tryPlacePowerAt(days, i, opts)) return true;
    }
    return false;
}

function placePowerAnyLegal(days, opts = {}) {
    for (let i = 0; i < days.length; i++) {
        if (tryPlacePowerAt(days, i, opts)) return true;
    }
    return false;
}

/**
 * One power session / week: day before match, else first day after a rest day.
 * Never the day after lactate. Assume practice counts as lactate unless no other slot exists.
 */
export function placePowerSessions(days, quota = 1) {
    const target = Math.max(0, Number(quota) || 0);
    stripPowerEvents(days);
    if (target <= 0) return 0;
    if (countEventType(days, isPowerEvent) >= target) return countEventType(days, isPowerEvent);

    const matchIdx = days.findIndex((d) => (d.events || []).some(isGameEvent));
    const strict = { allowAfterPractice: false };
    const relaxed = { allowAfterPractice: true };

    if (matchIdx > 0 && tryPlacePowerAt(days, matchIdx - 1, strict)) {
        return countEventType(days, isPowerEvent);
    }
    if (placePowerEarliestAfterRest(days, strict)) return countEventType(days, isPowerEvent);
    if (matchIdx > 0 && tryPlacePowerAt(days, matchIdx - 1, relaxed)) {
        return countEventType(days, isPowerEvent);
    }
    if (placePowerEarliestAfterRest(days, relaxed)) return countEventType(days, isPowerEvent);
    if (placePowerAnyLegal(days, strict)) return countEventType(days, isPowerEvent);
    placePowerAnyLegal(days, relaxed);
    return countEventType(days, isPowerEvent);
}

export function buildWeeklyTrainingPlan(weekStartISO, opts = {}) {
    const ignoreLoggedCredits = !!opts.ignoreLoggedCredits;
    const prefs = getGymPlanPrefs();
    const hypPrefs = getHypertrophyPlanPrefs();
    const hypertrophyMode = isHypertrophyPhase();
    const hybridMode = !!(prefs.hybrid);
    const loggedCredits = ignoreLoggedCredits
        ? { steady: 0, lactate: 0, strength: 0, power: 0 }
        : countLoggedWorkoutCredits(weekStartISO);
    const sportQuotas = getSportWeeklyQuotas();
    const lactateQuota = Math.max(0, sportQuotas.lactate - countPracticeLactateCredits(weekStartISO) - (loggedCredits.lactate || 0));
    const steadyQuota = Math.max(0, sportQuotas.steady - (loggedCredits.steady || 0));
    const powerEligible = sportQuotas.power > 0 && canProgramPower();
    const powerTarget = powerEligible
        ? Math.max(0, sportQuotas.power - (loggedCredits.power || 0))
        : 0;
    const strengthTarget = hybridMode
        ? Math.max(0, (prefs.strengthCount || 0) - Math.min(loggedCredits.strength || 0, prefs.strengthCount || 0))
        : hypertrophyMode
            ? 0
            : Math.max(0, (prefs.strengthCount || 0) - (loggedCredits.strength || 0));
    const gymTargetPureHyp = hypertrophyMode
        ? Math.max(0, (hypPrefs.sessionCount || 0) - (loggedCredits.strength || 0))
        : 0;
    const cacheKey = [
        'v11-week-extra-merge',
        weekStartISO,
        store.userConfig?.sport || '',
        ignoreLoggedCredits ? 'full' : 'net',
        hypertrophyMode ? 1 : 0,
        hybridMode ? 1 : 0,
        hypPrefs.split,
        prefs.willingness,
        prefs.band ? 1 : 0,
        prefs.maxTime,
        prefs.strengthCount,
        prefs.hypertrophyCount || 0,
        prefs.powerCount || 0,
        prefs.auxCount,
        prefs.attachMode,
        prefs.separateAuxDays,
        lactateQuota,
        steadyQuota,
        strengthTarget,
        gymTargetPureHyp,
        powerTarget,
        loggedCredits.steady || 0,
        loggedCredits.lactate || 0,
        loggedCredits.strength || 0,
        loggedCredits.power || 0,
        isGuidanceOff('timetabling') ? 1 : 0,
        weekSpecificFingerprint(weekStartISO)
    ].join('|');

    if (store._weekPlanCache.key === cacheKey && store._weekPlanCache.plan) return store._weekPlanCache.plan;

    const fixedScheds = loadFixedSchedules();
    const specificScheds = loadSpecificSchedulesMap();
    const routeOverrides = loadRouteOverrides();

    const days = [];
    for (let i = 0; i < 7; i++) {
        const dateStr = addDaysISO(weekStartISO, i);
        const d = new Date(dateStr + 'T12:00:00');
        const dayOfWeek = d.getDay();
        let events = [];

        const yStr = addDaysISO(dateStr, -1);
        if (matchRequiresNextDayRest(yStr)) {
            events = ['Rest (Cardio Only)'];
        } else if (routeOverrides[dateStr]) {
            events = [routeOverrides[dateStr]];
        } else {
            events = seedEventsForDate(dateStr, dayOfWeek, specificScheds, fixedScheds);
        }

        days.push({ dateStr, dayOfWeek, events: events.slice(0, 2) });
    }

    // Cap any pre-seeded Lactate/Steady/Aux before placing more
    const auxCap = Math.min(2, Math.max(0, Number(prefs.auxCount) || 0));
    trimEventTypeToQuota(days, isLactateEvent, lactateQuota);
    trimEventTypeToQuota(days, isSteadyCardio, steadyQuota);
    stripAllAuxiliary(days);

    const timetablingOff = isGuidanceOff('timetabling');

    if (!timetablingOff) {
        // 1) Power first so it can claim the day before a match
        if (powerTarget > 0) placePowerSessions(days, powerTarget);

        // 2) Gym sessions — hypertrophy, strength A/B, or hybrid mix
        if (hypertrophyMode) {
            placeHypertrophySessions(days, gymTargetPureHyp);
        } else if (hybridMode) {
            placeStrengthSessions(days, strengthTarget);
            placeHybridHypertrophySessions(days, prefs.hypertrophyCount || 0);
            trimHybridGymDays(days, prefs.strengthCount || 0, prefs.hypertrophyCount || 0);
        } else {
            placeStrengthSessions(days, strengthTarget);
        }

        // 2) Auxiliary — never for hypertrophy / strength / hybrid
        if (!hypertrophyMode && !prefs.strengthPhase && auxCap > 0) {
            placeAuxiliarySessions(days, prefs);
        } else {
            stripAllAuxiliary(days);
        }

        // 3) Steady cardio — remaining after logged steady sessions
        ensureSteadySessions(days, steadyQuota);

        // 4) Lactate — remaining after Practice/Match RPE > 6 credits + logged lactate
        ensureLactateSessions(days, lactateQuota);
    }

    // Empty days → Rest, then enforce ≥1 soft rest day
    days.forEach(day => {
        if (day.events.length === 0) day.events = ['Rest'];
    });
    dedupeHardSessionsPerDay(days);
    if (!timetablingOff) ensureWeeklySoftRestDay(days);

    // Final hard caps — Aux ≤ 2 always (strip+verify); re-assert steady + lactate
    if (!timetablingOff) {
        if (hypertrophyMode || prefs.strengthPhase) {
            stripAllAuxiliary(days);
        } else {
            enforceAuxiliaryCap(days, 2);
            if (countEventType(days, isAuxEvent) < auxCap && (prefs.band || prefs.attachMode === 'none')) {
                placeAuxiliarySessions(days, prefs);
            }
            enforceAuxiliaryCap(days, 2);
        }
        ensureSteadySessions(days, steadyQuota);
        ensureLactateSessions(days, lactateQuota);
        if (hypertrophyMode || prefs.strengthPhase) stripAllAuxiliary(days);
        else enforceAuxiliaryCap(days, 2);
    }
    days.forEach(day => {
        if (day.events.length === 0) day.events = ['Rest'];
    });

    // Prefer remaining steady slots onto pure rest days (never above weekly quota)
    ensureSteadyOnRestDays(days, steadyQuota);

    // Sanity: never ship a plan with >2 Aux
    if (countEventType(days, isAuxEvent) > 2) enforceAuxiliaryCap(days, 2);
    if (hypertrophyMode || prefs.strengthPhase) stripAllAuxiliary(days);

    if (!ignoreLoggedCredits) {
        days.forEach((day) => {
            if (dateHasCompletedPowerCredit(day.dateStr)) {
                const next = (day.events || []).filter((e) => !isPowerEvent(e));
                day.events = next.length ? next : ['Rest'];
                if (!day.events.length) day.events = ['Rest'];
            }
            if (!dateHasCompletedLiftCredit(day.dateStr)) return;
            const next = (day.events || []).filter((e) => normalizeLoggedSessionKind(e) !== 'Full Body / Strength');
            day.events = next.length ? next : (day.events.some(isRestEvent) ? day.events.filter(isRestEvent) : ['Rest']);
            if (!day.events.length) day.events = ['Rest'];
        });
    }
    persistWeekStrengthTail(days);
    store._weekPlanCache = { key: cacheKey, plan: days };
    return days;
}

/** Keep hybrid weeks at strengthCount Strength + hypertrophyCount Hypertrophy events. */
function trimHybridGymDays(days, strengthCount, hypertrophyCount) {
    const sTarget = Math.min(4, Math.max(0, parseInt(strengthCount, 10) || 0));
    const hTarget = Math.max(0, parseInt(hypertrophyCount, 10) || 0);

    const strengthIdx = [];
    const hypIdx = [];
    for (let i = 0; i < days.length; i++) {
        const ev = days[i].events || [];
        const sPos = ev.findIndex(e => typeof e === 'string' && e.includes('Strength'));
        const hPos = ev.findIndex(e => typeof e === 'string' && e.includes('Hypertrophy'));
        if (sPos >= 0) strengthIdx.push(i);
        else if (hPos >= 0) hypIdx.push(i);
    }

    while (strengthIdx.length > sTarget) {
        const i = strengthIdx.pop();
        const sPos = days[i].events.findIndex(e => typeof e === 'string' && e.includes('Strength'));
        if (sPos >= 0) days[i].events.splice(sPos, 1);
    }
    while (hypIdx.length > hTarget) {
        const i = hypIdx.pop();
        const hPos = days[i].events.findIndex(e => typeof e === 'string' && e.includes('Hypertrophy'));
        if (hPos >= 0) days[i].events.splice(hPos, 1);
    }
}

/**
 * Place hypertrophy sessions for hybrid weeks without overwriting Strength A/B days.
 * Uses full-body hypertrophy templates when session count is low.
 */
function placeHybridHypertrophySessions(days, count) {
    const target = Math.max(0, parseInt(count, 10) || 0);
    if (target <= 0) return 0;

    const hypPrefs = getHypertrophyPlanPrefs();
    // Temporarily bias split by hypertrophy day count alone
    const split = target <= 2 ? 'fb' : target <= 4 ? 'ul' : 'ppl';
    void hypPrefs;

    let hypIdx = [];
    for (let i = 0; i < days.length; i++) {
        const ev = days[i].events || [];
        if (ev.some(e => typeof e === 'string' && e.includes('Hypertrophy'))) hypIdx.push(i);
    }

    while (hypIdx.length > target) {
        const i = hypIdx.pop();
        const hPos = days[i].events.findIndex(e => typeof e === 'string' && e.includes('Hypertrophy'));
        if (hPos >= 0) days[i].events.splice(hPos, 1);
    }

    const rotation = split === 'ppl'
        ? ['push', 'pull', 'legs']
        : split === 'ul'
            ? ['upper', 'lower']
            : ['full'];
    let rot = 0;

    while (hypIdx.length < target) {
        let best = -1;
        let bestScore = -Infinity;
        for (let i = 0; i < days.length; i++) {
            if (hypIdx.includes(i)) continue;
            const ev = days[i].events || [];
            // Never place on Strength / Match / hard rest
            if (ev.some(e => typeof e === 'string' && e.includes('Strength'))) continue;
            if (ev.some(isGameEvent)) continue;
            if (ev.some(e => e === 'Rest' || e === 'Cannot Workout')) continue;
            const probe = hypertrophyEventForKind(rotation[rot % rotation.length]);
            let s = scoreDayForPlacement(days, i, probe, { allowAdjacent: true, ignoreStrengthStreak: true });
            if (s === -Infinity) continue;
            let minDist = 99;
            hypIdx.forEach(idx => { minDist = Math.min(minDist, Math.abs(idx - i)); });
            // Also distance from strength days
            for (let j = 0; j < days.length; j++) {
                if ((days[j].events || []).some(e => typeof e === 'string' && e.includes('Strength'))) {
                    minDist = Math.min(minDist, Math.abs(j - i));
                }
            }
            s += (minDist < 99 ? minDist * 6 : 30);
            if (s > bestScore) { bestScore = s; best = i; }
        }
        if (best < 0) break;
        const kind = rotation[rot % rotation.length];
        rot++;
        if (!pushGPS(days[best], hypertrophyEventForKind(kind))) break;
        hypIdx.push(best);
        hypIdx.sort((a, b) => a - b);
    }
    return hypIdx.length;
}

/** Fill leftover steady quota on pure rest days only — never exceeds `quota` (default 2). */
export function ensureSteadyOnRestDays(days, quota = 2) {
    const target = Math.max(0, Number(quota) || 0);
    let left = Math.max(0, target - countEventType(days, isSteadyCardio));
    for (let i = 0; i < (days || []).length && left > 0; i++) {
        const ev = days[i].events || [];
        if (!ev.length) continue;
        if (ev.some(isSteadyCardio)) continue;
        if (!ev.every(isRestEvent)) continue;
        days[i].events = ['Cardio (Steady)'];
        left--;
    }
}

export function getPlannedDayEvents(dateObj) {
    const weekStart = getMondayISO(dateObj);
    const plan = buildWeeklyTrainingPlan(weekStart);
    const dateStr = dateToISO(dateObj);
    const day = plan.find(d => d.dateStr === dateStr);
    return day ? [...day.events] : ['Rest'];
}

export function loadRouteOverrides() {
    return JSON.parse(localStorage.getItem('ascensus_route_overrides')) || {};
}
export function saveRouteOverrides(map) {
    localStorage.setItem('ascensus_route_overrides', JSON.stringify(map));
    invalidateWeekPlanCache();
    if (typeof persistUserConfigToCloud === 'function') persistUserConfigToCloud();
}
export function setRouteOverride(dateStr, value) {
    const map = loadRouteOverrides();
    if (!value) delete map[dateStr];
    else map[dateStr] = value;
    saveRouteOverrides(map);
    try { calculateTDEE(); } catch (e) { /* ignore */ }
}
export function dateToISO(d) {
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
export function addDaysISO(dateStr, days) {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() + days);
    return dateToISO(d);
}

export function loadFixedSchedules() {
    const raw = JSON.parse(localStorage.getItem('ascensus_fixed_schedules')) || {};
    const migrated = {};
    for (let d in raw) {
        const arr = Array.isArray(raw[d]) ? raw[d] : [raw[d]];
        migrated[d] = arr.map(item => {
            if (item && typeof item === 'object') {
                return {
                    event: item.event || item.type || 'Practice',
                    time: item.time || item.timeOfDay || ''
                };
            }
            if (typeof item === 'string' && item.includes('|')) {
                const [event, time] = item.split('|');
                return { event, time: time || '' };
            }
            return { event: item, time: '' };
        });
    }
    return migrated;
}
export function saveFixedSchedules(scheds) {
    localStorage.setItem('ascensus_fixed_schedules', JSON.stringify(scheds));
    invalidateWeekPlanCache();
    renderFixedSchedules();
    generateFutureTimeline();
    try { getTodayFocus(); } catch(e) {}
    if (typeof persistUserConfigToCloud === 'function') persistUserConfigToCloud();
}

export function scheduleEventName(entry) {
    if (!entry) return '';
    return typeof entry === 'object' ? (entry.event || '') : String(entry);
}

export function scheduleEventTime(entry) {
    if (!entry || typeof entry !== 'object') return '';
    return entry.time || '';
}

/** Event names only (for planner rules). */
export function fixedScheduleEventNames(dayOfWeek) {
    return (loadFixedSchedules()[dayOfWeek] || []).map(scheduleEventName).filter(Boolean);
}

export function getFixedEventTime(dayOfWeek, eventName) {
    const list = loadFixedSchedules()[dayOfWeek] || [];
    const hit = list.find(e => scheduleEventName(e) === eventName);
    return scheduleEventTime(hit) || '';
}

function loadSpecificSchedulesMap() {
    try {
        if (store.specificSchedules && typeof store.specificSchedules === 'object') return store.specificSchedules;
    } catch (e) { /* ignore */ }
    try {
        return JSON.parse(localStorage.getItem('ascensus_specific_schedules') || '{}') || {};
    } catch (e) {
        return {};
    }
}

function sameSportEvent(a, b) {
    return catalogSameSportEvent(a, b);
}

export function getSpecificEventTime(dateStr, eventName) {
    if (!dateStr || !eventName) return '';
    const raw = loadSpecificSchedulesMap()[dateStr];
    if (!raw || typeof raw !== 'object') return '';
    const name = specificEventName(raw);
    if (!name || !sameSportEvent(name, eventName)) return '';
    return raw.time || '';
}

function specificEntryEvents(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map(scheduleEventName).filter(Boolean);
    if (typeof raw === 'object' && Array.isArray(raw.events)) {
        return raw.events.map(scheduleEventName).filter(Boolean);
    }
    const name = specificEventName(raw);
    return name ? [name] : [];
}

function isWeekExtraEntry(raw) {
    return !!(raw && typeof raw === 'object' && raw.note === 'Week extra');
}

function weekSpecificFingerprint(weekStartISO) {
    const map = loadSpecificSchedulesMap();
    const bits = [];
    for (let i = 0; i < 7; i++) {
        const ds = addDaysISO(weekStartISO, i);
        bits.push(ds + ':' + JSON.stringify(map[ds] ?? null));
    }
    return bits.join('|');
}

/**
 * Seed a day from repeating locks plus optional one-off / Sunday extras.
 * Week extras merge onto locks when a slot is free; Rest extras cancel the day.
 * Calendar / spontaneous entries still replace the whole day.
 */
export function seedEventsForDate(dateStr, dayOfWeek, specificScheds, fixedScheds) {
    const locks = (fixedScheds?.[dayOfWeek] || []).map(scheduleEventName).filter(Boolean);
    const raw = specificScheds?.[dateStr];
    const extras = specificEntryEvents(raw);
    if (!extras.length) return locks.slice();

    if (!isWeekExtraEntry(raw)) return extras.slice(0, 2);

    const extra = extras[0];
    if (isRestEvent(extra)) return [extra];
    if (locks.some(isRestEvent)) return extras.slice(0, 2);
    if (locks.some((e) => e === extra || sameSportEvent(e, extra))) return locks.slice();

    const merged = locks.slice();
    const check = canAddScheduleEvent(merged, extra);
    if (check.ok) {
        merged.push(extra);
        return merged.slice(0, 2);
    }
    return extras.slice(0, 2);
}

/** True if any fixed-schedule entry that day is Morning. */
export function dayHasFixedMorningEvent(dayOfWeek) {
    const list = loadFixedSchedules()[dayOfWeek] || [];
    return list.some(e => String(scheduleEventTime(e) || '').toLowerCase() === 'morning');
}

/**
 * Resolve Morning / Afternoon / All Day for a planned session (single-event days).
 * Strength is Morning unless a fixed schedule event that day is already Morning.
 */
export function resolveSessionTimeOfDay(dateObj, eventName) {
    if (!eventName || isRestEvent(eventName)) return 'All Day';
    const dow = dateObj instanceof Date ? dateObj.getDay() : new Date(dateObj).getDay();
    if (isPracticeEvent(eventName) || isGameEvent(eventName)) {
        const dateStr = dateObj instanceof Date ? dateToISO(dateObj) : String(dateObj || '').slice(0, 10);
        return getSpecificEventTime(dateStr, eventName) || getFixedEventTime(dow, eventName) || 'Afternoon';
    }
    if (isStrengthEvent(eventName) || isStrengthFocus(eventName) || isPowerEvent(eventName)) {
        return dayHasFixedMorningEvent(dow) ? 'Afternoon' : 'Morning';
    }
    const fixed = getFixedEventTime(dow, eventName);
    if (fixed) return fixed;
    return 'Afternoon';
}

/**
 * For 2-event days: always one Morning + one Afternoon (Morning listed first).
 * Prefers fixed-schedule times and Strength→Morning when choosing who gets which slot.
 */
export function assignPairedSessionSlots(dateObj, dayEvents) {
    const events = (dayEvents || []).filter(e => e && !isRestEvent(e));
    if (!events.length) return [];
    if (events.length === 1) {
        return [{ event: events[0], name: prettyFocusName(events[0]), time: resolveSessionTimeOfDay(dateObj, events[0]) }];
    }

    const pair = events.slice(0, 2);
    const dow = dateObj instanceof Date ? dateObj.getDay() : new Date(dateObj).getDay();

    const preferred = pair.map(ev => {
        if (isPracticeEvent(ev) || isGameEvent(ev)) {
            const dateStr = dateObj instanceof Date ? dateToISO(dateObj) : String(dateObj || '').slice(0, 10);
            const st = getSpecificEventTime(dateStr, ev);
            if (st) return String(st);
            const ft = getFixedEventTime(dow, ev);
            if (ft) return String(ft);
        }
        if (isStrengthEvent(ev) || isStrengthFocus(ev) || isPowerEvent(ev)) {
            return dayHasFixedMorningEvent(dow) ? 'Afternoon' : 'Morning';
        }
        const ft = getFixedEventTime(dow, ev);
        return ft ? String(ft) : '';
    });

    let morningIdx = preferred.findIndex(t => String(t).toLowerCase() === 'morning');
    let afternoonIdx = preferred.findIndex(t => String(t).toLowerCase() === 'afternoon');

    // Conflict: both want same slot → Strength keeps Morning preference; otherwise first keeps claim
    if (morningIdx >= 0 && afternoonIdx >= 0 && morningIdx === afternoonIdx) {
        afternoonIdx = -1;
    }
    if (morningIdx >= 0 && afternoonIdx >= 0 && morningIdx !== afternoonIdx) {
        // already a clean pair
    } else if (morningIdx >= 0) {
        afternoonIdx = morningIdx === 0 ? 1 : 0;
    } else if (afternoonIdx >= 0) {
        morningIdx = afternoonIdx === 0 ? 1 : 0;
    } else {
        // Lactate follows Practice on the same day
        const practiceIdx = pair.findIndex(isPracticeEvent);
        const lactateIdx = pair.findIndex(isLactateEvent);
        const powerIdx = pair.findIndex(isPowerEvent);
        if (practiceIdx >= 0 && powerIdx >= 0) {
            morningIdx = powerIdx;
            afternoonIdx = practiceIdx;
        } else if (practiceIdx >= 0 && lactateIdx >= 0) {
            morningIdx = practiceIdx;
            afternoonIdx = lactateIdx;
        } else {
            const strengthIdx = pair.findIndex(e => isStrengthEvent(e) || isStrengthFocus(e) || isPowerEvent(e));
            morningIdx = strengthIdx >= 0 ? strengthIdx : 0;
            afternoonIdx = morningIdx === 0 ? 1 : 0;
        }
    }

    return [
        { event: pair[morningIdx], name: prettyFocusName(pair[morningIdx]), time: 'Morning' },
        { event: pair[afternoonIdx], name: prettyFocusName(pair[afternoonIdx]), time: 'Afternoon' }
    ];
}

export function formatDaySessionTimes(dateObj, dayEvents) {
    const slots = assignPairedSessionSlots(dateObj, dayEvents);
    if (!slots.length) return { rowsHtml: '' };

    const rowsHtml = slots.map(x => {
        const color = String(x.time).toLowerCase() === 'morning' ? 'var(--gold-accent)'
            : (String(x.time).toLowerCase() === 'afternoon' ? '#0A84FF' : 'var(--text-silver)');
        return `<div style="font-size:11px; color:var(--text-silver); font-family:'Roboto Mono'; margin-bottom:4px; line-height:1.4;">
            <span style="color:var(--text-main); font-weight:700;">${x.name}</span>
            <span style="color:${color};"> · ${x.time}</span>
        </div>`;
    }).join('');

    return { rowsHtml };
}

export function canAddScheduleEvent(existing, event) {
    existing = (existing || []).map(scheduleEventName);
    if (existing.includes(event)) return { ok: false, reason: "That event is already on this day." };
    if (existing.length >= 2) return { ok: false, reason: "Maximum of 2 events per day." };

    const hasGame = existing.some(isGameEvent);
    const hasPractice = existing.some(isPracticeEvent);
    const hasRest = existing.some(isRestEvent);
    const hasLift = existing.some(isLiftingEvent);

    if (isGameEvent(event)) {
        if (hasLift) return { ok: false, reason: "Games cannot share a day with lifting." };
        if (hasRest) return { ok: false, reason: "Cannot add a Game on a Rest day." };
        return { ok: true };
    }
    if (isPracticeEvent(event)) {
        if (hasRest) return { ok: false, reason: "Cannot add Practice on a Rest day." };
        return { ok: true };
    }
    if (isRestEvent(event)) {
        if (existing.length > 0) return { ok: false, reason: "Rest must be the only event that day." };
        return { ok: true };
    }
    if (isLiftingEvent(event)) {
        if (hasGame) return { ok: false, reason: "Lifting cannot share a day with a Game." };
        if (hasRest) return { ok: false, reason: "Cannot lift on a Rest day." };
        if (hasPractice && hasLift) return { ok: false, reason: "Maximum of 2 events per day." };
        return { ok: true };
    }
    return { ok: true };
}

export function toggleSchedTimeVisibility() {
    const ev = document.getElementById('sched-event')?.value;
    const timeEl = document.getElementById('sched-time');
    if (!timeEl) return;
    timeEl.style.display = (ev === 'Rest' || ev === 'None') ? 'none' : '';
}

export function openFixedScheduleModal() {
    const modal = document.getElementById('schedule-modal');
    if (!modal) return;
    try { populateSportSelects(); } catch (e) { /* ignore */ }
    modal.classList.remove('hidden');
    toggleSchedTimeVisibility();
    renderFixedSchedules();
}
export function closeFixedScheduleModal() {
    document.getElementById('schedule-modal')?.classList.add('hidden');
}

export function addFixedSchedule() {
    const day = document.getElementById('sched-day').value;
    const event = document.getElementById('sched-event').value;
    let time = (event === 'Rest') ? '' : (document.getElementById('sched-time')?.value || 'Afternoon');
    let scheds = loadFixedSchedules();
    if (!scheds[day]) scheds[day] = [];
    const check = canAddScheduleEvent(scheds[day], event);
    if (!check.ok) return alert(check.reason);

    // Two events on one day must be Morning + Afternoon (never the same window)
    if (scheds[day].length === 1 && event !== 'Rest') {
        const existing = scheds[day][0];
        let existT = String(scheduleEventTime(existing) || '').trim();
        if (!existT) {
            // Existing had no time — give it the opposite of the new event
            existT = (String(time).toLowerCase() === 'morning') ? 'Afternoon' : 'Morning';
            if (typeof existing === 'object') existing.time = existT;
            else scheds[day][0] = { event: scheduleEventName(existing), time: existT };
        }
        if (String(existT).toLowerCase() === String(time).toLowerCase()) {
            time = String(existT).toLowerCase() === 'morning' ? 'Afternoon' : 'Morning';
        }
    }

    scheds[day].push({ event, time });
    saveFixedSchedules(scheds);
}
export function deleteFixedSchedule(day, eventName) {
    let scheds = loadFixedSchedules();
    if (!scheds[day]) return;
    if (eventName === undefined || eventName === null) {
        delete scheds[day];
    } else {
        scheds[day] = scheds[day].filter(e => scheduleEventName(e) !== eventName);
        if (scheds[day].length === 0) delete scheds[day];
    }
    saveFixedSchedules(scheds);
}
export function renderFixedSchedules() {
    // Only populate the Edit Fixed Schedule modal list (timetable already shows locks)
    const list = document.getElementById('fixed-schedule-list');
    if (!list) return;
    const scheds = loadFixedSchedules();
    const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    let html = '';
    for (let d in scheds) {
        (scheds[d] || []).forEach(ev => {
            const name = scheduleEventName(ev);
            const time = scheduleEventTime(ev);
            const safeEv = String(name).replace(/'/g, "\\'");
            const timeBit = time ? ` · ${time}` : '';
            const label = sportEventLabel(name) || name;
            html += `<div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-surface-elevated); border:1px solid var(--border-subtle); padding:12px; border-radius:8px; font-size:12px;">
                <span style="color:var(--text-main); font-weight:bold;">${days[d]}: <span style="color:var(--gold-accent);">${label}${timeBit}</span></span>
                <button onclick="deleteFixedSchedule('${d}', '${safeEv}')" style="background:none; border:none; color:var(--text-stealth); font-size:18px; cursor:pointer;">&times;</button>
            </div>`;
        });
    }
    list.innerHTML = html || `<div style="font-size:11px; color:var(--text-muted); padding:8px 0;">No locks yet. Add a sport event or Rest above.</div>`;
}

/** Resolve a day's event list: sport overrides + optional GPS lift (max 2). */
export function resolveDayEvents(options) {
    const {
        dayOfWeek, dateStr, gpsFocus, fixedScheds, specificScheds, routeOverrides,
        forceRestFromPrevGame, forceCardioOnlyRest
    } = options;

    let events = [];

    // 1) Forced recovery from previous Game / high-RPE Practice
    if (forceCardioOnlyRest) {
        return ['Rest (Cardio Only)'];
    }
    if (forceRestFromPrevGame) {
        return ['Rest'];
    }

    // 2) One-off date overrides (calendar / practice RPE flags)
    if (routeOverrides[dateStr]) {
        return [routeOverrides[dateStr]];
    }
    events = seedEventsForDate(dateStr, dayOfWeek, specificScheds, fixedScheds);

    const hasGame = events.some(isGameEvent);
    const hasPractice = events.some(isPracticeEvent);
    const hasRest = events.some(isRestEvent);
    const slotsLeft = 2 - events.length;

    // Games never share with lifting. Practice+Game already = 2 slots → no lift.
    // Practice alone can take a GPS lift. Empty day takes GPS focus alone.
    if (!hasGame && !hasRest && slotsLeft > 0 && gpsFocus && !isRestEvent(gpsFocus)) {
        if (hasPractice) {
            // Practice + lifting OK
            if (isLiftingEvent(gpsFocus)) events.push(gpsFocus);
        } else if (events.length === 0) {
            events.push(gpsFocus);
        }
    }

    if (events.length === 0) events = [gpsFocus || 'Rest'];
    return events.slice(0, 2);
}

export function prettyFocusName(focus) {
    if (!focus || typeof focus !== 'string') return focus;
    if (HYPERTROPHY_DISPLAY_LABELS[focus]) return HYPERTROPHY_DISPLAY_LABELS[focus];
    if (isHypertrophyEvent(focus)) {
        const kind = resolveHypertrophySessionKind(focus);
        const key = kind ? hypertrophyEventForKind(kind) : null;
        if (key && HYPERTROPHY_DISPLAY_LABELS[key]) return HYPERTROPHY_DISPLAY_LABELS[key];
        return focus.replace(/^Hypertrophy\s*\/\s*/i, '');
    }
    if (focus === 'Full Body / Strength A' || /Strength\s*A/i.test(focus)) return 'Strength Session A';
    if (focus === 'Full Body / Strength B' || /Strength\s*B/i.test(focus)) return 'Strength Session B';
    if (focus === 'Full Body / Strength') return 'Strength Session';
    if (isPowerEvent(focus)) return 'Power';
    if (isSteadyCardio(focus)) return 'Steady Cardio';
    if (isLactateEvent(focus)) return 'Lactate/HIT';
    if (isAuxEvent(focus)) {
        const bandOn = !!(typeof getGymPlanPrefs === 'function' ? getGymPlanPrefs().band : store.userConfig.bandAuxiliary);
        return bandOn ? 'Band Auxiliary' : 'Auxiliary';
    }
    if (isSportEvent(focus)) return sportEventLabel(focus);
    return focus;
}

export function normalizeFocusName(focus) {
    if (!focus || typeof focus !== 'string') return focus;
    // Pretty hypertrophy labels → event keys
    for (const [eventKey, label] of Object.entries(HYPERTROPHY_DISPLAY_LABELS)) {
        if (focus === label || focus.includes(label)) return eventKey;
    }
    if (isHypertrophyEvent(focus)) return focus;
    // openFuturePlan may receive pretty labels or multi-event strings
    if (focus.includes('Strength Session A') || focus === 'Full Body / Strength A') return 'Full Body / Strength A';
    if (focus.includes('Strength Session B') || focus === 'Full Body / Strength B') return 'Full Body / Strength B';
    if (focus.includes('Strength Session') || focus === 'Full Body / Strength') return 'Full Body / Strength A';
    if (focus === 'Power' || /Full Body \/ Power/i.test(focus)) return 'Full Body / Power';
    // Multi-event label e.g. "Practice + Strength Session A"
    const parts = focus.split(/\s*\+\s*/);
    if (parts.length > 1) {
        const lift = parts.map(normalizeFocusName).find(p => isLiftingEvent(p) || isStrengthFocus(p));
        if (lift) return lift;
    }
    return focus;
}

export function formatEventsLabel(events) {
    return events.map(prettyFocusName).join(' + ');
}

export function pickPrimaryFocus(events) {
    if (!events || !events.length) return 'Rest';
    const matchEv = events.find(isGameEvent);
    if (matchEv) return matchEv;
    if (events.includes('Rest (Cardio Only)')) return 'Rest (Cardio Only)';
    if (events.some(isRestEvent)) return 'Rest';
    const strength = events.find(isStrengthEvent);
    if (strength) return strength;
    const lactate = events.find(isLactateEvent);
    if (lactate) return lactate;
    const lift = events.find(isLiftingEvent);
    if (lift) return lift;
    const practiceEv = events.find(isPracticeEvent);
    if (practiceEv) return practiceEv;
    return events[0];
}

/** Macro goals for a calendar day (plan + prior-day load driven). */
export function getDayMacroTargets(focus, dateObj = new Date()) {
    const day = dateObj instanceof Date ? dateObj : new Date(dateObj);
    const t = computeDayNutritionTargets(day);
    return { cals: t.cals, tPro: t.pro, tCarb: t.carb, tFat: t.fat };
}

function shortDayLabel(i, futureDate) {
    if (i === 0) return 'Today';
    if (i === 1) return 'Tomorrow';
    return futureDate.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
}

export function generateFutureTimeline() {
    const container = document.getElementById('future-timeline-container');
    if (!container) return;

    let html = '';
    const numDays = 7;
    const today = new Date();

    for (let i = 0; i <= numDays; i++) {
        const futureDate = new Date();
        futureDate.setDate(today.getDate() + i);
        const dateStr = dateToISO(futureDate);
        const dayName = shortDayLabel(i, futureDate);
        const dayEvents = getPlannedDayEvents(futureDate);
        const primary = pickPrimaryFocus(dayEvents);
        const macros = getDayMacroTargets(primary, futureDate);
        const slots = assignPairedSessionSlots(futureDate, dayEvents);
        const sectionLabelStyle = `font-size:11px; color:var(--text-muted); font-family:'Roboto Mono'; letter-spacing:0.4px;`;
        const itemLineStyle = `font-size:12px; font-weight:600; color:var(--text-main); line-height:1.35;`;
        let sessionItemsHtml = '';
        if (!slots.length) {
            const restLabel = (dayEvents || []).includes('Rest (Cardio Only)') ? 'Rest (Cardio Only)' : 'Rest';
            sessionItemsHtml = `<div style="${itemLineStyle}">${restLabel}</div>`;
        } else {
            sessionItemsHtml = slots.map(s =>
                `<div style="${itemLineStyle}">${s.time} ${s.name}</div>`
            ).join('');
        }
        const sessionLinesHtml = `<div>
            <strong style="${sectionLabelStyle}">Exercise</strong>
            <div style="margin-top:4px; display:flex; flex-direction:column; gap:4px;">${sessionItemsHtml}</div>
        </div>`;
        let recipeLinesHtml = '';
        if (!isGuidanceOff('food') && store.globalFoodDB.length && store.userConfig.targets) {
            const recipeNames = getDayRecipeNames({
                tPro: macros.tPro,
                tCarb: macros.tCarb,
                tFat: macros.tFat,
                forDate: futureDate
            });
            if (recipeNames.length) {
                recipeLinesHtml = `<div style="margin-top:10px; padding-top:8px; border-top:1px solid var(--border-subtle);">
                    <strong style="${sectionLabelStyle}">Food</strong>
                    <div style="margin-top:4px; display:flex; flex-direction:column; gap:2px;">
                        ${recipeNames.map(n => `<div style="${itemLineStyle}">${n}</div>`).join('')}
                    </div>
                </div>`;
            }
        }
        const safeRaw = String(primary).replace(/'/g, "\\'");
        const safeDay = String(dayName).replace(/'/g, "\\'");
        let sleepLine = '';
        try {
            const sleepH = getPlanTonightSleepHours(futureDate, dayEvents);
            if (sleepH > 0) {
                sleepLine = `<div style="margin-top:8px; font-size:10px; color:var(--gold-accent); font-family:'Roboto Mono',monospace;">Tonight's sleep · ${Number(sleepH).toFixed(1)} h</div>`;
            }
        } catch (e) { /* ignore */ }

        html += `<div class="card" onclick="openFuturePlan('${safeDay}', '${safeRaw}', ${macros.cals}, '${dateStr}')" style="padding:16px; margin-bottom:12px; cursor:pointer; transition:transform 0.1s ease;" onmousedown="this.style.transform='scale(0.98)'" onmouseup="this.style.transform='scale(1)'" onmouseleave="this.style.transform='scale(1)'">
            <div style="display:flex; justify-content:flex-start; align-items:center; margin-bottom:10px; border-bottom:1px solid var(--border-subtle); padding-bottom:6px; gap:8px; min-width:0;">
                <span style="font-size:11px; color:var(--text-muted); font-family:'Roboto Mono'; letter-spacing:0.4px; min-width:0;">${dayName}</span>
            </div>
            ${sessionLinesHtml}
            ${recipeLinesHtml}
            ${sleepLine}
        </div>`;
    }
    container.innerHTML = html;
}

function sumSimulatedDayMacros(macros, forDate) {
    const meals = resolveDayMealItems({
        tPro: macros.tPro,
        tCarb: macros.tCarb,
        tFat: macros.tFat,
        forDate
    });
    let pro = 0, carb = 0, fat = 0;
    meals.forEach(entry => {
        (entry.items || []).forEach(item => {
            if (!item?.food) return;
            const m = (item.mass || 0) / 100;
            pro += (item.food.protein_per_100g || 0) * m;
            carb += (item.food.carbs_per_100g || 0) * m;
            fat += (item.food.fat_per_100g || 0) * m;
        });
    });
    const cals = Math.round((pro * 4) + (carb * 4) + (fat * 9));
    return { cals, pro, carb, fat };
}

function buildMacroGoalBarsHtml(macros, forDate = new Date()) {
    const simulated = sumSimulatedDayMacros(macros, forDate);
    const rows = [
        { metric: 'cals', label: 'Calories', current: simulated.cals, target: macros.cals },
        { metric: 'pro', label: 'Protein', current: simulated.pro, target: macros.tPro },
        { metric: 'carb', label: 'Carbs', current: simulated.carb, target: macros.tCarb },
        { metric: 'fat', label: 'Fat', current: simulated.fat, target: macros.tFat }
    ];
    let html = `<div style="display:flex; flex-direction:column; gap:12px; margin-bottom:20px; padding-bottom:16px; border-bottom:1px solid var(--border-subtle); width:100%; min-width:0;">`;
    rows.forEach(r => {
        const layout = computeMacroBarLayout(r.metric, r.current, r.target);
        const label = formatMacroAimLabel(r.metric, r.current, r.target);
        const tickHtml = r.target > 0
            ? `<div class="macro-aim-tick" style="left:${layout.aimPct}%;"></div>`
            : '';
        html += `<div style="width:100%; min-width:0;">
            <div class="day-plan-metric-row" style="margin-bottom:4px;">
                <span class="hud-label" style="margin:0;">${r.label}</span>
                <span class="day-plan-metric-val">${label}</span>
            </div>
            <div class="progress-bar-bg macro-bar-track">
                <div class="macro-range-band" style="left:${layout.bandLeft}%; width:${layout.bandWidth}%; background:${layout.bandGradient};"></div>
                ${tickHtml}
                <div class="progress-bar-fill ${layout.state}" style="width:${layout.fillPct}%; --in-range-t:${layout.inRangeT};"></div>
            </div>
        </div>`;
    });
    html += `</div>`;
    return html;
}

/** Rough RPE for planned sessions so sleep can be estimated before anything is logged. */
function estimatePlannedEventsRpe(events) {
    let plannedRpe = 0;
    (events || []).forEach((ev) => {
        const s = String(ev || '');
        if (/^rest$/i.test(s)) return;
        if (isStrengthEvent(s) || /hypertrophy|gym|full body/i.test(s)) plannedRpe += 5;
        else if (isLactateEvent(s)) plannedRpe += 7;
        else if (isPracticeEvent(s) || isGameEvent(s)) plannedRpe += 7;
        else if (isSteadyCardio(s)) plannedRpe += 2;
        else if (s && !/^rest\b/i.test(s)) plannedRpe += 5;
    });
    return plannedRpe;
}

/**
 * Tonight's sleep hours for a plan day.
 * Uses logged workout load when present, otherwise (or if higher) the planned-session estimate.
 */
function getPlanTonightSleepHours(forDate = new Date(), events) {
    let hours = 8.5;
    try {
        hours = getTonightSleepTargetHours(forDate) || 8.5;
        const plannedRpe = estimatePlannedEventsRpe(events || getPlannedDayEvents(forDate));
        if (plannedRpe > 0) {
            const fromPlan = sleepHoursFromTotalRpe(plannedRpe);
            if (fromPlan > hours) hours = fromPlan;
        }
    } catch (e) {
        hours = 8.5;
    }
    return hours;
}

/** Tonight's sleep target for a plan day (logged the following morning). */
function buildPlanSleepTargetHtml(forDate = new Date()) {
    const hours = getPlanTonightSleepHours(forDate);
    const label = Number(hours).toFixed(1);
    return `<div style="margin-bottom:16px; padding:12px 14px; border:1px solid rgba(212,175,55,0.28); border-radius:10px; background:rgba(212,175,55,0.06);">
        <div style="font-size:9px; color:var(--gold-accent); font-family:'Roboto Mono',monospace; font-weight:800; letter-spacing:0.5px; text-transform:uppercase; margin-bottom:6px;">Tonight's sleep target</div>
        <div style="font-size:20px; font-weight:800; color:var(--text-main); font-family:'Roboto Mono',monospace;">${label} h</div>
        <div style="font-size:11px; color:var(--text-muted); margin-top:6px; line-height:1.4;">Based on this day's training load. Log it the following morning on the Sleep badge (that morning's log = tonight's sleep).</div>
    </div>`;
}

function buildDomainGoalBarsHtml(targets) {
    const t = targets || { str: 0, pow: 0, spd: 0, crd: 0, end: 0 };
    const keys = ['str', 'pow', 'spd', 'crd', 'end'];
    const max = Math.max(1, ...keys.map(k => t[k] || 0));
    const colors = {
        str: 'var(--silver-accent)',
        pow: 'var(--text-silver)',
        spd: 'var(--text-stealth)',
        crd: 'var(--text-stealth)',
        end: 'var(--text-main)'
    };
    let html = `<div style="display:flex; flex-direction:column; gap:12px; margin-bottom:20px; padding-bottom:16px; border-bottom:1px solid var(--border-subtle); width:100%; min-width:0;">`;
    keys.forEach(k => {
        const val = t[k] || 0;
        const pct = Math.round((val / max) * 100);
        html += `<div style="width:100%; min-width:0;">
            <div class="day-plan-metric-row" style="margin-bottom:4px;">
                <span class="hud-label" style="margin:0; color:${colors[k]};">${DOMAIN_LABELS[k]}</span>
                <span class="day-plan-metric-val">${val}</span>
            </div>
            <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${pct}%; background-color:${colors[k]};"></div></div>
        </div>`;
    });
    html += `</div>`;
    return html;
}

export function switchDayPlanSubTab(panel, btn) {
    const food = document.getElementById('day-plan-panel-food');
    const ex = document.getElementById('day-plan-panel-exercise');
    if (food) food.classList.toggle('hidden', panel !== 'food');
    if (ex) ex.classList.toggle('hidden', panel !== 'exercise');
    document.querySelectorAll('#day-detail-forecast .catalogue-sub-btn').forEach(b => {
        const on = btn ? b === btn : b.getAttribute('data-day-plan') === panel;
        b.classList.toggle('active', on);
        b.classList.toggle('is-primary', on);
        b.classList.toggle('is-secondary', !on);
    });
}

export function setDayDetailMode(mode) {
    const forecast = document.getElementById('day-detail-forecast');
    const summary = document.getElementById('modal-summary');
    const logList = document.getElementById('modal-log-list');
    if (mode === 'forecast') {
        if (forecast) forecast.classList.remove('hidden');
        if (summary) { summary.classList.add('hidden'); summary.innerHTML = ''; }
        if (logList) { logList.classList.add('hidden'); logList.innerHTML = ''; }
    } else {
        if (forecast) forecast.classList.add('hidden');
        if (summary) summary.classList.remove('hidden');
        if (logList) logList.classList.remove('hidden');
    }
}

export function openPracticeLogModal(dateStr, opts = {}) {
    window.journalMode = 'practice';
    window.pendingPracticeDate = dateStr || dateToISO(new Date());
    resetJournalMedia();
    window._editingJournalExistingMedia = [];
    let prefill = null;
    if (opts.prefill) {
        const journal = loadDayJournal(window.pendingPracticeDate);
        if (journal && (journal.source === 'practice' || journal.type === 'practice' || !journal.source)) {
            prefill = journal;
            window._editingJournalExistingMedia = Array.isArray(journal.media) ? journal.media : [];
            const notes = document.getElementById('journal-notes');
            if (notes) notes.value = journal.notes || '';
        }
    } else {
        const notes = document.getElementById('journal-notes');
        if (notes) notes.value = '';
    }
    configureJournalModal('practice', prefill);
    const eyebrow = document.getElementById('journal-modal-eyebrow');
    const title = document.getElementById('journal-modal-title');
    if (eyebrow) eyebrow.innerText = opts.prefill ? 'Edit Practice' : 'Practice Complete';
    if (title) title.innerText = opts.prefill ? 'EDIT PRACTICE DIARY' : 'PRACTICE BRAIN DUMP';

    renderJournalMediaPreview();
    const modal = document.getElementById('post-session-modal');
    if (modal) modal.classList.remove('hidden');
    const btn = document.getElementById('btn-finalize-workout');
    if (btn) btn.innerText = opts.prefill ? 'Save changes' : 'Save & close';
}

export function openMatchLogModal(dateStr, opts = {}) {
    window.journalMode = 'match';
    window.pendingMatchDate = dateStr || dateToISO(new Date());
    resetJournalMedia();
    window._editingJournalExistingMedia = [];
    let prefill = null;
    if (opts.prefill) {
        const journal = loadDayJournal(window.pendingMatchDate);
        if (journal && (journal.source === 'match' || journal.type === 'match')) {
            prefill = journal;
            window._editingJournalExistingMedia = Array.isArray(journal.media) ? journal.media : [];
            const notes = document.getElementById('journal-notes');
            if (notes) notes.value = journal.notes || '';
        }
    } else {
        const notes = document.getElementById('journal-notes');
        if (notes) notes.value = '';
    }
    configureJournalModal('match', prefill);
    const eyebrow = document.getElementById('journal-modal-eyebrow');
    const title = document.getElementById('journal-modal-title');
    if (eyebrow) eyebrow.innerText = opts.prefill ? 'Edit Match' : 'Match Complete';
    if (title) title.innerText = opts.prefill ? 'EDIT MATCH DIARY' : 'MATCH BRAIN DUMP';

    renderJournalMediaPreview();
    const modal = document.getElementById('post-session-modal');
    if (modal) modal.classList.remove('hidden');
    const btn = document.getElementById('btn-finalize-workout');
    if (btn) btn.innerText = opts.prefill ? 'Save changes' : 'Save & close';
}

/** Open today's Practice/Match diary from Drive → Log for editing. */
export function editSportDiaryFromLog(kind) {
    const dateStr = dateToISO(new Date());
    const todayStr = new Date().toLocaleDateString();
    const exerciseName = kind === 'Match' ? 'Match' : 'Practice';
    const logs = (store.globalGroupedHistory?.[todayStr]?.items || [])
        .filter(i => i.type === 'workout' && i.exercise === exerciseName);
    window.editingSportJournal = true;
    window.editingSportJournalLogIds = logs.map(l => l.id).filter(id => id != null);

    if (exerciseName === 'Match') openMatchLogModal(dateStr, { prefill: true });
    else openPracticeLogModal(dateStr, { prefill: true });
}

/** Delete today's Practice/Match diary + matching workout_log rows from Drive → Log. */
export async function deleteSportDiaryFromLog(kind) {
    const exerciseName = kind === 'Match' ? 'Match' : 'Practice';
    if (!confirm(`Delete this ${exerciseName.toLowerCase()} diary entry?`)) return;

    const dateStr = dateToISO(new Date());
    const todayStr = new Date().toLocaleDateString();
    const logs = (store.globalGroupedHistory?.[todayStr]?.items || [])
        .filter(i => i.type === 'workout' && i.exercise === exerciseName);
    const ids = logs.map(l => l.id).filter(id => id != null);

    if (exerciseName === 'Match') {
        deleteMatchJournalEntry(dateStr);
        const next = addDaysISO(dateStr, 1);
        const ov = loadRouteOverrides();
        // Clear auto Rest-from-match if present
        localStorage.removeItem('ascensus_match_rest_' + dateStr);
        const map = loadRouteOverrides();
        if (map[next] === 'Rest' || map[next] === 'Rest (Cardio Only)') {
            delete map[next];
            saveRouteOverrides(map);
        }
    } else {
        deletePracticeJournalEntry(dateStr);
    }

    if (ids.length && navigator.onLine) {
        try {
            await store.supabaseClient.from('workout_logs').delete().in('id', ids);
        } catch (e) {
            console.warn('Could not delete sport diary workout rows:', e);
        }
    }

    // Drop from in-memory history immediately
    if (store.globalGroupedHistory?.[todayStr]) {
        const idSet = new Set(ids.map(String));
        store.globalGroupedHistory[todayStr].items = store.globalGroupedHistory[todayStr].items.filter(it =>
            !(it.type === 'workout' && (it.exercise === exerciseName || idSet.has(String(it.id))))
        );
    }

    invalidateWeekPlanCache();
    try { generateFutureTimeline(); } catch (e) { /* ignore */ }
    try { getTodayFocus(); } catch (e) { /* ignore */ }
    try { await loadHistory(); } catch (e) { /* ignore */ }
    try {
        const { generateDailyExerciseLog } = await import('./fitness-hud.js');
        generateDailyExerciseLog();
    } catch (e) {
        if (typeof window.generateDailyExerciseLog === 'function') window.generateDailyExerciseLog();
    }
}

export async function commitPracticeSession() {
    const stash = window._sportDiaryStash?.mode === 'practice' ? window._sportDiaryStash : null;
    window._sportDiaryStash = null;
    const notes = stash?.notes ?? (document.getElementById('journal-notes')?.value || '');
    const entry = stash?.entry || buildDiaryEntryFromForm({ notes, type: 'practice' });
    const rpe = Number(entry.rpe) || 5;
    const ath = Number(entry.athletic) || 5;
    const ment = Number(entry.mental) || 5;
    const hydrationMl = Math.max(0, Number(entry.hydration_ml) || 0);
    const dateStr = window.pendingPracticeDate || dateToISO(new Date());
    const isEdit = !!window.editingSportJournal;

    let media = Array.isArray(window._editingJournalExistingMedia) ? [...window._editingJournalExistingMedia] : [];
    try {
        const added = await persistPendingJournalMedia(dateStr);
        if (Array.isArray(added) && added.length) media = media.concat(added);
    } catch (e) { console.warn(e); }
    savePracticeJournalEntry(dateStr, { ...entry, notes, rpe, athletic: ath, mental: ment, hydration_ml: hydrationMl, type: 'practice', media });
    try { calculateTDEE(); } catch (e) { /* ignore */ }
    if (hydrationMl > 0) recordHydrationMl(hydrationMl, 'practice', dateStr);
    resetJournalMedia();
    window._editingJournalExistingMedia = [];
    applyInjuryPainFollowUpFromJournal();

    // Replace prior Practice log rows when editing
    const editIds = isEdit ? (window.editingSportJournalLogIds || []) : [];
    if (editIds.length && navigator.onLine) {
        try {
            await store.supabaseClient.from('workout_logs').delete().in('id', editIds);
        } catch (e) {
            console.warn('Could not clear previous Practice rows:', e);
        }
    }

    const timedMin = Number(window._lastSessionDurationMin) || 0;
    const payload = [{
        exercise: 'Practice',
        sets: 1,
        reps: 0,
        weight_kg: 0,
        distance_km: 0,
        time_minutes: timedMin,
        rpe: Math.round(rpe),
        type: 'cardio',
        session_duration_min: timedMin
    }];

    try {
        if (!navigator.onLine) throw new Error('Offline');
        const { error } = await store.supabaseClient.from('workout_logs').insert(payload);
        if (error) throw error;
    } catch (e) {
        store.offlineQueue.push({ table: 'workout_logs', payload });
        localStorage.setItem('ascensus_offline_queue', JSON.stringify(store.offlineQueue));
    }

    if (rpe > 8) {
        const next = addDaysISO(dateStr, 1);
        setRouteOverride(next, 'Rest (Cardio Only)');
        if (!isEdit) alert('RPE > 8: Tomorrow locked to Rest (Cardio Only).');
    }
    if (rpe > 6) {
        invalidateWeekPlanCache();
        if (!isEdit) alert('Practice RPE > 6 counts as a Lactate session — one Lactate removed from this week\'s plan.');
    }
    if (ath < 4) {
        localStorage.setItem('ascensus_gps_index', '2');
        if (!isEdit) alert('Athletic Performance < 4: GPS forced toward Rest.');
    }
    if (ment < 4 && !isEdit) {
        alert('Mental Fatigue < 4: Prioritize sleep and recovery tonight.');
    }

    window.journalMode = null;
    window.pendingPracticeDate = null;
    window.editingSportJournal = false;
    window.editingSportJournalLogIds = [];
    invalidateWeekPlanCache();
    generateFutureTimeline();
    try { getTodayFocus(); } catch(e) {}
    try { await loadHistory(); } catch(e) {}
    try {
        const driveNav = document.querySelector('#main-nav .nav-item[onclick*="drive"]');
        if (typeof window.switchTab === 'function' && driveNav) window.switchTab(driveNav, 'drive', 'Drive');
        if (typeof window.switchDriveSubTab === 'function') window.switchDriveSubTab('log');
    } catch (e) { /* ignore */ }
    alert(isEdit ? 'Practice diary updated.' : 'Practice logged.');
}

export async function commitMatchSession() {
    const stash = window._sportDiaryStash?.mode === 'match' ? window._sportDiaryStash : null;
    window._sportDiaryStash = null;
    const notes = stash?.notes ?? (document.getElementById('journal-notes')?.value || '');
    const entry = stash?.entry || buildDiaryEntryFromForm({ notes, type: 'match' });
    const rpe = Number(entry.rpe) || 5;
    const ath = Number(entry.athletic) || 5;
    const ment = Number(entry.mental) || 5;
    const matchPerf = Number(entry.matchPerformance) || ath;
    const hydrationMl = Math.max(0, Number(entry.hydration_ml) || 0);
    const dateStr = window.pendingMatchDate || dateToISO(new Date());
    const isEdit = !!window.editingSportJournal;

    let media = Array.isArray(window._editingJournalExistingMedia) ? [...window._editingJournalExistingMedia] : [];
    try {
        const added = await persistPendingJournalMedia(dateStr);
        if (Array.isArray(added) && added.length) media = media.concat(added);
    } catch (e) { console.warn(e); }
    saveMatchJournalEntry(dateStr, { ...entry, notes, rpe, athletic: ath, mental: ment, matchPerformance: matchPerf, hydration_ml: hydrationMl, media });
    try { calculateTDEE(); } catch (e) { /* ignore */ }
    if (hydrationMl > 0) recordHydrationMl(hydrationMl, 'match', dateStr);
    resetJournalMedia();
    window._editingJournalExistingMedia = [];
    applyInjuryPainFollowUpFromJournal();

    const editIds = isEdit ? (window.editingSportJournalLogIds || []) : [];
    if (editIds.length && navigator.onLine) {
        try {
            await store.supabaseClient.from('workout_logs').delete().in('id', editIds);
        } catch (e) {
            console.warn('Could not clear previous Match rows:', e);
        }
    }

    const timedMin = Number(window._lastSessionDurationMin) || 0;
    const payload = [{
        exercise: 'Match',
        sets: 1,
        reps: 0,
        weight_kg: 0,
        distance_km: 0,
        time_minutes: timedMin,
        rpe: Math.round(rpe),
        type: 'cardio',
        session_duration_min: timedMin
    }];

    try {
        if (!navigator.onLine) throw new Error('Offline');
        const { error } = await store.supabaseClient.from('workout_logs').insert(payload);
        if (error) throw error;
    } catch (e) {
        store.offlineQueue.push({ table: 'workout_logs', payload });
        localStorage.setItem('ascensus_offline_queue', JSON.stringify(store.offlineQueue));
    }

    store.fatigueLockouts['legs'] = true;
    if (rpe > 5) {
        const next = addDaysISO(dateStr, 1);
        // Rest (Cardio Only) — recovery day that still allows optional steady
        setRouteOverride(next, 'Rest (Cardio Only)');
        localStorage.setItem('ascensus_match_rest_' + dateStr, '1');
        if (!isEdit) alert('Match RPE > 5: Tomorrow locked to Rest (optional steady is fine).');
    } else {
        localStorage.removeItem('ascensus_match_rest_' + dateStr);
        if (isEdit) {
            const next = addDaysISO(dateStr, 1);
            const map = loadRouteOverrides();
            if (map[next] === 'Rest' || map[next] === 'Rest (Cardio Only)') {
                delete map[next];
                saveRouteOverrides(map);
            }
        } else {
            alert('Match logged. No Rest day scheduled (RPE ≤ 5).');
        }
    }
    if (rpe > 6) {
        invalidateWeekPlanCache();
        if (!isEdit) alert('Match RPE > 6 counts as a Lactate session — one Lactate removed from this week\'s plan.');
    }
    if (ath < 4 && !isEdit) alert('Athletic Performance < 4: Prioritize recovery.');
    if (ment < 4 && !isEdit) alert('Mental Fatigue < 4: Prioritize sleep tonight.');

    window.journalMode = null;
    window.pendingMatchDate = null;
    window.editingSportJournal = false;
    window.editingSportJournalLogIds = [];
    invalidateWeekPlanCache();
    generateFutureTimeline();
    try { getTodayFocus(); } catch(e) {}
    try { await loadHistory(); } catch(e) {}
    try {
        const driveNav = document.querySelector('#main-nav .nav-item[onclick*="drive"]');
        if (typeof window.switchTab === 'function' && driveNav) window.switchTab(driveNav, 'drive', 'Drive');
        if (typeof window.switchDriveSubTab === 'function') window.switchDriveSubTab('log');
    } catch (e) { /* ignore */ }
    alert(isEdit ? 'Match diary updated.' : 'Match logged.');
}

export function pickFixedFocusForDay(events) {
    // Kept for compatibility; prefer resolveDayEvents for new logic
    if (!events || events.length === 0) return null;
    if (!Array.isArray(events)) return events;
    return pickPrimaryFocus(events);
}

export function openFuturePlan(dateStr, focus, totalCals, isoDate) {
    const titleEl = document.getElementById('modal-date-title');
    if (titleEl) titleEl.innerText = dateStr;

    const planDate = isoDate ? new Date(isoDate + 'T12:00:00') : new Date();
    const dayEvents = getPlannedDayEvents(planDate);
    const primary = pickPrimaryFocus(dayEvents.length ? dayEvents : [normalizeFocusName(focus) || focus]);
    const macros = getDayMacroTargets(primary, planDate);
    const domains = mergeDayDomainTargets(dayEvents.length ? dayEvents : [primary]);
    const slots = assignPairedSessionSlots(planDate, dayEvents.length ? dayEvents : [primary]);

    setDayDetailMode('forecast');

    const foodPanel = document.getElementById('day-plan-panel-food');
    const exPanel = document.getElementById('day-plan-panel-exercise');

    if (foodPanel) {
        foodPanel.innerHTML = buildPlanSleepTargetHtml(planDate)
            + buildMacroGoalBarsHtml(macros, planDate)
            + buildMealPlanCardsHtml({
                tPro: macros.tPro,
                tCarb: macros.tCarb,
                tFat: macros.tFat,
                includeLog: false,
                forDate: planDate,
                plain: true
            });
    }

    if (exPanel) {
        let sessionHtml = buildDomainGoalBarsHtml(domains);
        if (!slots.length || slots.every(s => isRestEvent(s.event))) {
            const restFocus = dayEvents.includes('Rest (Cardio Only)') ? 'Rest (Cardio Only)' : 'Rest';
            sessionHtml += buildPlainSessionCardHtml(restFocus, '');
        } else {
            slots.forEach(slot => {
                sessionHtml += buildPlainSessionCardHtml(slot.event, slot.time);
            });
        }
        exPanel.innerHTML = sessionHtml;
    }

    const foodBtn = document.querySelector('#day-detail-forecast .catalogue-sub-btn[data-day-plan="food"]');
    switchDayPlanSubTab('food', foodBtn);

    const modal = document.getElementById('day-detail-modal');
    if (modal) {
        const body = modal.querySelector('.day-detail-body');
        if (body) body.scrollTop = 0;
        modal.classList.remove('hidden');
        setTimeout(() => modal.classList.add('show'), 10);
    }
}

// Call renderFixedSchedules on boot
setTimeout(renderFixedSchedules, 1000);

// --- MODAL & METRIC LOGIC ---
export function syncSleepHoursWarning() {
    const warn = document.getElementById('sleep-hours-warning');
    if (!warn) return;
    const h = parseInt(document.getElementById('sleep-input-hours')?.value, 10) || 0;
    const m = parseInt(document.getElementById('sleep-input-mins')?.value, 10) || 0;
    const total = h + (m / 60);
    if (m < 0 || m > 59) {
        warn.textContent = 'Minutes must be between 0 and 59.';
        warn.classList.remove('hidden');
        return;
    }
    if (total > 24) {
        warn.textContent = 'Maximum sleep is 24 hours. Please enter 24 or less.';
        warn.classList.remove('hidden');
        return;
    }
    warn.classList.add('hidden');
}

export function openSleepModal() {
    const modal = document.getElementById('sleep-modal');
    const warn = document.getElementById('sleep-hours-warning');
    if (warn) {
        warn.textContent = 'Maximum sleep is 24 hours. Please enter 24 or less.';
        warn.classList.add('hidden');
    }
    modal.classList.remove('hidden');
    setTimeout(() => modal.classList.add('show'), 10);
}

export function closeSleepModal() {
    const modal = document.getElementById('sleep-modal');
    modal.classList.remove('show');
    setTimeout(() => modal.classList.add('hidden'), 300);
}

export function submitSleepLog() {
    const hoursEl = document.getElementById('sleep-input-hours');
    const minsEl = document.getElementById('sleep-input-mins');
    const warn = document.getElementById('sleep-hours-warning');
    const h = parseInt(hoursEl?.value, 10);
    const m = parseInt(minsEl?.value, 10) || 0;
    if (!Number.isFinite(h) || h < 0 || (h === 0 && m <= 0)) {
        if (warn) {
            warn.textContent = 'Enter a sleep duration greater than 0.';
            warn.classList.remove('hidden');
        }
        return;
    }
    if (m < 0 || m > 59) {
        if (warn) {
            warn.textContent = 'Minutes must be between 0 and 59.';
            warn.classList.remove('hidden');
        }
        return;
    }
    const hours = h + (m / 60);
    if (hours > 24) {
        if (warn) {
            warn.textContent = 'Maximum sleep is 24 hours. Please enter 24 or less.';
            warn.classList.remove('hidden');
        } else {
            alert('Maximum sleep is 24 hours. Please enter 24 or less.');
        }
        return;
    }
    if (warn) {
        warn.textContent = '';
        warn.classList.add('hidden');
    }
    upsertTodaySleep(Math.round(hours * 100) / 100);
    
    closeSleepModal();
    
    let sleepBadge = document.getElementById('status-badge-sleep');
    if (sleepBadge) sleepBadge.classList.add('completed');
    if (store.macroChartInstance) drawMacroChart(); // Live update chart if visible
    try {
        const todayStr = new Date().toLocaleDateString();
        const foods = store.globalGroupedHistory?.[todayStr]?.items?.filter(i => i.type === 'food') || [];
        if (typeof window.updateLiveDashboard === 'function') window.updateLiveDashboard(foods);
    } catch (e) { /* ignore */ }
}

const TEACHING_POINT_PLACEHOLDER_URL = 'https://www.youtube.com/embed/placeholder';

function teachingPoint(label, videoUrl) {
    const url = videoUrl || getTeachingPointVideoUrl(label) || TEACHING_POINT_PLACEHOLDER_URL;
    return { label, videoUrl: url };
}

function youtubeVideoId(url) {
    const m = String(url || '').match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i);
    if (!m || m[1] === 'placeholder') return '';
    return m[1];
}

function youtubeWatchUrl(url) {
    const id = youtubeVideoId(url);
    return id ? `https://www.youtube.com/watch?v=${id}` : '';
}

function youtubeEmbedSrc(url) {
    const id = youtubeVideoId(url);
    if (!id) return String(url || '');
    const params = new URLSearchParams({
        rel: '0',
        modestbranding: '1',
        playsinline: '1'
    });
    try {
        if (/^https?:$/i.test(location.protocol) && location.origin && location.origin !== 'null') {
            params.set('origin', location.origin);
        }
    } catch (e) { /* ignore */ }
    return `https://www.youtube.com/embed/${id}?${params.toString()}`;
}

function canEmbedYouTube() {
    try { return /^https?:$/i.test(location.protocol); } catch (e) { return false; }
}

function youtubePlayerHtml(url, title = '') {
    const src = escapeVideoModalText(youtubeEmbedSrc(url));
    const t = escapeVideoModalText(title || 'Form video');
    return `<iframe width="100%" height="100%" src="${src}" title="${t}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
}

function syncVideoModalWatchLink(url) {
    const el = document.getElementById('video-modal-open-yt');
    if (!el) return;
    const watch = youtubeWatchUrl(url);
    if (!watch) {
        el.classList.add('hidden');
        el.removeAttribute('href');
        return;
    }
    el.href = watch;
    el.classList.remove('hidden');
}

function loadVideoModalFrame(frame, url, title) {
    if (!frame) return;
    frame.onclick = null;
    if (!canEmbedYouTube()) {
        frame.innerHTML = `<div style="padding:16px; text-align:center; line-height:1.45;">YouTube can't play inside this window. Use Open in YouTube below.</div>`;
        return;
    }
    frame.innerHTML = youtubePlayerHtml(url, title);
}

export function openVideoModal(title, url) {
    document.getElementById('video-modal-title').innerText = title;
    const frame = document.getElementById('video-modal-frame');
    const formUrl = url || TEACHING_POINT_PLACEHOLDER_URL;
    window._videoModalFormUrl = formUrl;
    window._videoModalTitle = title;
    window._videoModalActiveTp = null;
    syncVideoModalWatchLink(formUrl);
    frame.innerHTML = 'TAP TO LOAD INTEL';
    frame.onclick = function() {
        loadVideoModalFrame(frame, formUrl, title);
        window._videoModalActiveTp = null;
        syncTeachingPointActiveState();
    };

    const notesEl = document.getElementById('video-modal-notes');
    const points = getTeachingPoints(title);
    window._videoModalTeachingPoints = points;
    if (notesEl) {
        notesEl.innerHTML = points.map((tp, idx) => `
            <button type="button" class="video-tp-btn" data-tp-index="${idx}" onclick="selectTeachingPointVideo(${idx})" style="width:100%; text-align:left; cursor:pointer; background:transparent; border:1px solid var(--border-subtle); border-radius:10px; padding:12px; color:inherit;">
                <div style="display:flex; justify-content:space-between; gap:12px; align-items:center;">
                    <span style="font-size:12px; color:var(--text-silver); line-height:1.45;">${escapeVideoModalText(tp.label)}</span>
                    <span style="font-family:'Roboto Mono'; font-size:10px; color:var(--text-stealth); flex-shrink:0; text-transform:uppercase;">Video</span>
                </div>
            </button>
        `).join('');
    }

    document.getElementById('video-modal').classList.remove('hidden');
}

function escapeVideoModalText(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function syncTeachingPointActiveState() {
    const active = window._videoModalActiveTp;
    document.querySelectorAll('#video-modal-notes .video-tp-btn').forEach((btn) => {
        const idx = Number(btn.getAttribute('data-tp-index'));
        const on = active != null && idx === active;
        btn.style.borderColor = on ? 'var(--gold-accent)' : 'var(--border-subtle)';
        btn.style.background = on ? 'rgba(212,175,55,0.08)' : 'transparent';
    });
}

/** Load a teaching-point clip into the form-video frame (tap again to return to form video). */
export function selectTeachingPointVideo(index) {
    const points = window._videoModalTeachingPoints || [];
    const tp = points[index];
    const frame = document.getElementById('video-modal-frame');
    if (!tp || !frame) return;

    if (window._videoModalActiveTp === index) {
        // Toggle off — restore overall form video
        window._videoModalActiveTp = null;
        const formUrl = window._videoModalFormUrl || TEACHING_POINT_PLACEHOLDER_URL;
        syncVideoModalWatchLink(formUrl);
        frame.innerHTML = 'TAP TO LOAD INTEL';
        frame.onclick = function() {
            loadVideoModalFrame(frame, formUrl, window._videoModalTitle || '');
            frame.onclick = null;
        };
        syncTeachingPointActiveState();
        return;
    }

    window._videoModalActiveTp = index;
    syncVideoModalWatchLink(tp.videoUrl);
    loadVideoModalFrame(frame, tp.videoUrl, tp.label);
    syncTeachingPointActiveState();
}

/** Pressable teaching points for the form-video modal (label + clip URL). */
export function getTeachingPoints(title) {
    const catalogPoints = getExerciseTeachingPoints(title);
    if (catalogPoints) {
        return catalogPoints.map((label) => teachingPoint(label));
    }
    const t = String(title || '').toLowerCase();
    if (t.includes('insulin') || t.includes('berg')) {
        return [
            teachingPoint('Prioritise protein and fibre at every meal.'),
            teachingPoint('Cut liquid sugar and ultra-processed snacks this week.'),
            teachingPoint('Walk 10 minutes after your largest carbohydrate meal.')
        ];
    }
    if (t.includes('sleep')) {
        return [
            teachingPoint('Fixed bedtime ±30 minutes — consistency beats one long night.'),
            teachingPoint('Dim screens and lights in the final 60 minutes.'),
            teachingPoint('Cool, dark room; leave caffeine for the morning window only.')
        ];
    }
    if (t.includes('huberman') || t.includes('dopamine')) {
        return [
            teachingPoint('Stack hard work before cheap dopamine (scroll / sugar).'),
            teachingPoint('Protect one morning block of deep focus without notifications.'),
            teachingPoint('Use sunlight early and finish intense training before late evening.')
        ];
    }
    if (t.includes('band') || t.includes('pull-apart') || t.includes('face pull')) {
        return [
            teachingPoint('Light tension — own the end range without shrugging.'),
            teachingPoint('Slow eccentric; pause where you feel the target muscle.'),
            teachingPoint('Breathing stays easy; this is prehab, not a max set.')
        ];
    }
    return [];
}

/** @deprecated Prefer getTeachingPoints — returns label strings for older callers. */
export function getVideoDirectives(title) {
    return getTeachingPoints(title).map(tp => tp.label);
}

export function closeVideoModal() {
    const frame = document.getElementById('video-modal-frame');
    if (frame) {
        frame.innerHTML = 'TAP TO LOAD INTEL';
        frame.onclick = null;
    }
    window._videoModalTeachingPoints = null;
    window._videoModalActiveTp = null;
    window._videoModalFormUrl = null;
    window._videoModalTitle = null;
    syncVideoModalWatchLink('');
    document.getElementById('video-modal').classList.add('hidden');
}


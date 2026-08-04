/**
 * In-progress workout draft — survives leaving the execution zone / switching tabs
 * after Confirm workout, until Complete log or Back to plan.
 */
import { store } from '../state/store.js';
import { isLactateEvent, isSteadyCardio, normalizeLoggedSessionKind } from './route-planner.js';

const DRAFT_KEY = 'ascensus_workout_draft_v1';

export function loadWorkoutDraft() {
    try {
        const raw = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
        if (!raw || raw.type !== 'workout' || !Array.isArray(raw.items) || !raw.items.length) return null;
        return raw;
    } catch (e) {
        return null;
    }
}

export function hasWorkoutDraft() {
    return !!loadWorkoutDraft();
}

export function clearWorkoutDraft() {
    localStorage.removeItem(DRAFT_KEY);
    window._workoutSessionConfirmed = false;
}

export function saveWorkoutDraft(partial = {}) {
    if (store.activeLog?.type !== 'workout') return null;
    const items = store.activeLog.items || [];
    // Never overwrite a parked draft with an empty live log
    if (!items.length) return loadWorkoutDraft();

    const draft = {
        type: 'workout',
        items: JSON.parse(JSON.stringify(items)),
        manualSessionKind: window.manualSessionKind || document.getElementById('today-focus')?.value || null,
        manualWorkoutMode: !!window.manualWorkoutMode,
        editingSessionId: window.editingSessionId || null,
        journalMode: window.journalMode || 'workout',
        lactateHitSelection: window._lactateHitSelection
            ? JSON.parse(JSON.stringify(window._lactateHitSelection))
            : null,
        ghostBackup: store._ghostBackupForUnconfirm
            ? JSON.parse(JSON.stringify(store._ghostBackupForUnconfirm))
            : null,
        workoutLogFilter: window._workoutLogFilter === 'logged' ? 'logged' : 'todo',
        elapsedMs: typeof partial.elapsedMs === 'number'
            ? partial.elapsedMs
            : (partial.elapsedMs == null ? undefined : Number(partial.elapsedMs) || 0),
        routeTitle: document.getElementById('current-route-title')?.innerText || '',
        confirmed: true,
        savedAt: new Date().toISOString(),
        ...partial
    };
    if (draft.elapsedMs == null) delete draft.elapsedMs;
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    window._workoutSessionConfirmed = true;
    return draft;
}

/** True when any draft blob exists in storage (even if items were corrupted empty). */
export function hasWorkoutDraftKey() {
    try {
        return !!localStorage.getItem(DRAFT_KEY);
    } catch (e) {
        return false;
    }
}

/** True when the draft is for this planned event kind. */
export function draftMatchesPlanEvent(eventName, draft = loadWorkoutDraft()) {
    if (!draft || !eventName) return false;
    const draftKind = normalizeLoggedSessionKind(draft.manualSessionKind)
        || draft.manualSessionKind
        || '';
    const eventKind = normalizeLoggedSessionKind(eventName) || eventName;
    if (!draftKind) return false;
    if (draftKind === eventKind) return true;
    if (isLactateEvent(draftKind) && isLactateEvent(eventName)) return true;
    if (isSteadyCardio(draftKind) && isSteadyCardio(eventName)) return true;
    if ((draftKind.includes('Strength') || draftKind === 'Full Body / Strength')
        && (String(eventName).includes('Strength') || eventName === 'Full Body / Strength')) {
        return true;
    }
    return false;
}

export function getDraftSessionLabel(draft = loadWorkoutDraft()) {
    if (!draft) return 'Workout';
    const kind = draft.manualSessionKind || 'Workout';
    if (draft.lactateHitSelection?.summary) {
        return draft.lactateHitSelection.isHitClass
            ? 'Lactate/HIT · HIT class'
            : `Lactate/HIT · Session ${draft.lactateHitSelection.slot || 'A'}`;
    }
    return kind;
}

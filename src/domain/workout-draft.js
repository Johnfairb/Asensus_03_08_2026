/**
 * In-progress workout draft — survives leaving the execution zone / switching tabs
 * after Confirm workout, until Complete log or Back to plan.
 * Timer starts on the first exercise Log tap (not on Confirm).
 */
import { store } from '../state/store.js';
import { isHypertrophyEvent } from './hypertrophy-engine.js';
import {
    isGameEvent,
    isLactateEvent,
    isPracticeEvent,
    isSteadyCardio,
    normalizeLoggedSessionKind,
    prettyFocusName
} from './route-planner.js';

const DRAFT_KEY = 'ascensus_workout_draft_v1';

/** Drop File/Blob fields that break JSON.stringify (exercise diary pending media). */
function serializableDraftItems(items) {
    return (items || []).map(item => {
        if (!item || typeof item !== 'object') return item;
        const copy = { ...item };
        if (Array.isArray(copy._diaryPendingMedia)) {
            copy._diaryPendingMediaMeta = copy._diaryPendingMedia.map(m => ({
                id: m.id,
                kind: m.kind,
                name: m.name,
                mime: m.mime
            }));
            delete copy._diaryPendingMedia;
        }
        if (Array.isArray(copy.sets)) {
            copy.sets = copy.sets.map(s => {
                if (!s || typeof s !== 'object') return s;
                const sc = { ...s };
                delete sc._restAudioHeld;
                delete sc.lockAlarmFired;
                return sc;
            });
        }
        return copy;
    });
}

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

    const prev = (() => {
        try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch (e) { return null; }
    })();

    const draft = {
        type: 'workout',
        items: JSON.parse(JSON.stringify(serializableDraftItems(items))),
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
        timerRunning: true,
        savedAt: new Date().toISOString(),
        ...partial
    };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(draft.dateIso || ''))) {
        draft.dateIso = (prev && /^\d{4}-\d{2}-\d{2}$/.test(String(prev.dateIso || '')))
            ? prev.dateIso
            : (window._sessionDateIso && /^\d{4}-\d{2}-\d{2}$/.test(window._sessionDateIso)
                ? window._sessionDateIso
                : null);
    }
    if (draft.dateIso) window._sessionDateIso = draft.dateIso;
    if (draft.elapsedMs == null && prev && typeof prev.elapsedMs === 'number') {
        draft.elapsedMs = prev.elapsedMs;
    }
    // Wall-clock anchor so elapsed keeps advancing while the user is away from the workout page
    if (draft.timerRunning !== false) {
        draft.timerRunning = true;
        const elapsed = Math.max(0, Number(draft.elapsedMs) || 0);
        if (partial.timerAnchorAt != null && Number.isFinite(Number(partial.timerAnchorAt))) {
            draft.timerAnchorAt = Number(partial.timerAnchorAt);
        } else {
            draft.timerAnchorAt = Date.now() - elapsed;
        }
        draft.elapsedMs = elapsed;
    }
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
    const draftRaw = draft.manualSessionKind || '';
    if (!draftRaw) return false;
    if (draftRaw === eventName) return true;

    if (isLactateEvent(draftRaw) && isLactateEvent(eventName)) return true;
    if (isSteadyCardio(draftRaw) && isSteadyCardio(eventName)) return true;
    if (isPracticeEvent(draftRaw) && isPracticeEvent(eventName) && draftRaw === eventName) return true;
    if (isGameEvent(draftRaw) && isGameEvent(eventName) && (
        draftRaw === eventName || ((draftRaw === 'Match' || draftRaw === 'Game') && (eventName === 'Match' || eventName === 'Game'))
    )) return true;

    // Hypertrophy must not collapse into generic strength matching
    if (isHypertrophyEvent(draftRaw) || isHypertrophyEvent(eventName)) {
        return isHypertrophyEvent(draftRaw) && isHypertrophyEvent(eventName) && draftRaw === eventName;
    }

    const draftKind = normalizeLoggedSessionKind(draftRaw) || draftRaw;
    const eventKind = normalizeLoggedSessionKind(eventName) || eventName;
    if (draftKind === eventKind) return true;
    if ((draftRaw.includes('Strength') || draftKind === 'Full Body / Strength')
        && (String(eventName).includes('Strength') || eventName === 'Full Body / Strength')) {
        return true;
    }
    return false;
}

export function getDraftSessionLabel(draft = loadWorkoutDraft()) {
    if (!draft) return 'Workout';
    if (draft.lactateHitSelection?.summary) {
        return draft.lactateHitSelection.isHitClass
            ? 'HIT · HIT class'
            : `HIT · Session ${draft.lactateHitSelection.slot || 'A'}`;
    }
    // Prefer the title shown while training; fall back to the planned event label
    const titled = (draft.routeTitle || '').trim();
    if (titled && !/^workout$/i.test(titled) && !/^active workout$/i.test(titled)) {
        return titled;
    }
    const kind = draft.manualSessionKind || 'Workout';
    try {
        return prettyFocusName(kind) || kind;
    } catch (e) {
        return kind;
    }
}

/**
 * Live elapsed for a parked/in-progress draft.
 * Uses wall-clock anchor so time keeps advancing after leaving the workout page.
 */
export function getDraftRunningElapsedMs(draft = loadWorkoutDraft()) {
    if (!draft) return 0;
    const anchor = Number(draft.timerAnchorAt);
    if (draft.timerRunning !== false && Number.isFinite(anchor) && anchor > 0) {
        return Math.max(0, Date.now() - anchor);
    }
    return Math.max(0, Number(draft.elapsedMs) || 0);
}

export function remainingRestSecondsFromSet(setObj) {
    if (!setObj) return 0;
    if (setObj.lockEndsAt) return Math.max(0, Math.ceil((setObj.lockEndsAt - Date.now()) / 1000));
    return Math.max(0, Math.round(Number(setObj.lockTimeLeft) || 0));
}

function upcomingRestExerciseName(item, set) {
    if (item?.isSuperset && set?.side && Array.isArray(item.sides)) {
        const side = item.sides.find(s => s.key === set.side);
        const n = String(side?.exercise?.name || side?.name || '').trim();
        if (n) return set.side ? `${set.side} · ${n}` : n;
    }
    return String(item?.exercise?.name || item?.name || '').trim();
}

/** First locked rest that still has time left (live items or a parked draft). */
export function findActiveRestOnItems(items) {
    const list = items || [];
    for (let exIdx = 0; exIdx < list.length; exIdx++) {
        const item = list[exIdx];
        const sets = item?.sets || [];
        for (let setIdx = 0; setIdx < sets.length; setIdx++) {
            const set = sets[setIdx];
            if (!set?.locked) continue;
            const left = remainingRestSecondsFromSet(set);
            if (left <= 0) continue;
            const name = upcomingRestExerciseName(item, set);
            return { exIdx, setIdx, left, name, set, item };
        }
    }
    return null;
}

/** Write a parked draft blob (live saveWorkoutDraft no-ops when the log is empty). */
export function writeWorkoutDraft(draft) {
    if (!draft) return null;
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch (e) { /* ignore */ }
    return draft;
}

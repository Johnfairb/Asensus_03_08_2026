/**
 * Planned cool-down stretch session timer.
 * Starts only when the user taps Start stretching; continues in the background.
 */
import { store } from '../state/store.js';
import {
    getStretchGapSeconds,
    getStretchHoldSeconds,
    cooldownStretchSides,
    isUnilateralCooldownStretch,
    isWristCooldownStretch,
    stretchPartDisplayLabel
} from '../domain/session-prep.js';
import { saveWorkoutDraft } from '../domain/workout-draft.js';
import { getWorkoutElapsedMs } from './workout-timer.js';
import { holdAudioAlive, playStretchBeepSound, pokeLockScreenPosition, releaseAudioAlive, unlockAudio } from './audio.js';

let _tickInterval = null;
let _stretchAudioHeld = false;

/** Single short beep (distinct from the multi-tone rest alarm). */
export function playStretchBeep() {
    playStretchBeepSound();
}

function holdStretchAudio() {
    if (_stretchAudioHeld) return;
    _stretchAudioHeld = true;
    holdAudioAlive();
}

function releaseStretchAudio() {
    if (!_stretchAudioHeld) return;
    _stretchAudioHeld = false;
    releaseAudioAlive();
}

export function resetStretchAudioHold() {
    _stretchAudioHeld = false;
}

export function isPlannedTimedStretchItem(item) {
    if (!item || !item.isStretchGroup || !Array.isArray(item.sets) || item.sets.length === 0) return false;
    const timed = item.sets.some(s => s && (
        Number(s.holdSec) > 0
        || s.baseName
        || (s.partName && !/^custom stretching$/i.test(String(s.partName)))
    ));
    if (item.isCustomStretch && !timed) return false;
    return true;
}

/**
 * Expand unilateral cool-down rows into Left → Right if this session was built
 * before laterality existed (or holdSec is missing).
 */
export function ensurePlannedStretchSetsShape(item) {
    if (!item || !item.isStretchGroup) return;
    if (item.isCustomStretch && !isPlannedTimedStretchItem(item)) return;
    if (getStretchTimerState(item)?.running || getStretchTimerState(item)?.finished) return;
    const next = [];
    let changed = false;
    (item.sets || []).forEach(set => {
        if (!set) return;
        const base = stretchSetBaseName(set) || set.partName;
        if (!set.baseName) {
            set.baseName = base;
            changed = true;
        }
        if (set.holdSec == null) {
            set.holdSec = getStretchHoldSeconds(base);
            set.reps = `Hold ${set.holdSec}s`;
            changed = true;
        }
        if (isWristCooldownStretch(base) && /^(left|right)$/i.test(String(set.side || ''))) {
            changed = true;
            set.side = /^left$/i.test(set.side) ? 'Finger' : 'Palm';
            set.unilateral = true;
            next.push(set);
            return;
        }
        const sides = cooldownStretchSides(base);
        if ((isUnilateralCooldownStretch(base) || isWristCooldownStretch(base)) && !set.side && sides.length > 1) {
            changed = true;
            sides.forEach((side) => {
                next.push({
                    ...set,
                    side,
                    unilateral: true,
                    baseName: base,
                    completed: !!set.completed,
                    _sessionSkipped: !!set._sessionSkipped
                });
            });
        } else {
            next.push(set);
        }
    });
    if (changed) item.sets = next;
}

export function stretchSetBaseName(set) {
    return String(set?.baseName || set?.partName || '').trim();
}

export function stretchSetLabel(set) {
    return stretchPartDisplayLabel(set);
}

export function stretchStepHeading(step) {
    if (!step) return '';
    if (step.kind === 'gap') {
        const next = step.nextLabel || (step.label && step.label !== 'Between stretches' ? step.label : '');
        return next ? `Rest · next: ${next}` : 'Rest · next up';
    }
    return `Hold · ${step.label}`;
}

export function stretchStepStatusLine(step, leftSec) {
    const left = Math.max(0, Number(leftSec) || 0);
    if (!step) return `${left}s`;
    if (step.kind === 'gap') {
        const next = step.nextLabel || (step.label && step.label !== 'Between stretches' ? step.label : '');
        return next ? `Next: ${next} · ${left}s` : `Next in ${left}s`;
    }
    return `${step.label} · ${left}s`;
}

function activeHoldSets(item) {
    return (item?.sets || [])
        .map((set, setIdx) => ({ set, setIdx }))
        .filter(({ set }) => set && !set._sessionSkipped);
}

export function buildStretchTimerSteps(item) {
    const gap = getStretchGapSeconds();
    const holds = activeHoldSets(item).map(({ set, setIdx }) => {
        const base = stretchSetBaseName(set);
        const holdSec = Math.max(1, Number(set.holdSec) || getStretchHoldSeconds(base));
        return {
            kind: 'hold',
            setIdx,
            label: stretchSetLabel(set),
            durationSec: holdSec
        };
    });
    const steps = [];
    holds.forEach((hold, i) => {
        steps.push(hold);
        if (i < holds.length - 1 && gap > 0) {
            steps.push({
                kind: 'gap',
                setIdx: null,
                label: holds[i + 1].label,
                nextLabel: holds[i + 1].label,
                durationSec: gap
            });
        }
    });
    return steps;
}

export function getStretchTimerState(item) {
    return item?._stretchTimer || null;
}

export function remainingStretchStepSeconds(item) {
    const t = getStretchTimerState(item);
    if (!t?.running || !t.stepEndsAt) return 0;
    return Math.max(0, Math.ceil((t.stepEndsAt - Date.now()) / 1000));
}

export function currentStretchStep(item) {
    const t = getStretchTimerState(item);
    if (!t || t.stepIndex == null) return null;
    return t.steps?.[t.stepIndex] || null;
}

/** First running stretch timer on live or parked items. */
export function findRunningStretchOnItems(items) {
    const list = items || [];
    for (let exIdx = 0; exIdx < list.length; exIdx++) {
        const item = list[exIdx];
        const t = getStretchTimerState(item);
        if (!t?.running) continue;
        return {
            exIdx,
            item,
            step: currentStretchStep(item),
            left: remainingStretchStepSeconds(item)
        };
    }
    return null;
}

function refreshStretchUi(exIdx) {
    try {
        if (window.currentModalExIdx === exIdx && typeof window.renderExerciseSets === 'function') {
            window.renderExerciseSets();
        } else if (typeof window.renderWorkoutLog === 'function') {
            window.renderWorkoutLog();
        } else if (typeof window.renderActiveLog === 'function') {
            window.renderActiveLog();
        }
    } catch (e) { /* ignore */ }
}

function updateStretchCountdownDom(exIdx, item) {
    const el = document.getElementById(`stretch-timer-countdown-${exIdx}`);
    const labelEl = document.getElementById(`stretch-timer-label-${exIdx}`);
    const t = getStretchTimerState(item);
    if (!t?.running) return;
    const step = currentStretchStep(item);
    const left = remainingStretchStepSeconds(item);
    if (el) el.textContent = `${left}s`;
    if (labelEl && step) {
        labelEl.textContent = stretchStepHeading(step);
    }
    const cardSub = document.getElementById(`stretch-card-sub-${exIdx}`);
    if (cardSub && step) {
        cardSub.textContent = stretchStepStatusLine(step, left);
    }
    try { pokeLockScreenPosition(); } catch (e) { /* ignore */ }
}

function anyStretchTimerRunning() {
    return (store.activeLog?.items || []).some(item => getStretchTimerState(item)?.running);
}

function ensureStretchTick() {
    if (_tickInterval) return;
    _tickInterval = setInterval(() => {
        const items = store.activeLog?.items || [];
        let stillRunning = false;
        items.forEach((item, exIdx) => {
            const t = getStretchTimerState(item);
            if (!t?.running) return;
            stillRunning = true;
            if (Date.now() >= t.stepEndsAt) {
                advanceStretchStep(exIdx);
            } else {
                updateStretchCountdownDom(exIdx, item);
            }
        });
        if (!stillRunning) {
            clearInterval(_tickInterval);
            _tickInterval = null;
        }
    }, 250);
}

function completeHoldSet(item, setIdx) {
    const set = item?.sets?.[setIdx];
    if (set) set.completed = true;
}

function markStretchSessionFinished(item) {
    (item.sets || []).forEach(set => {
        if (set && !set._sessionSkipped) set.completed = true;
    });
    if (item._stretchTimer) {
        item._stretchTimer.running = false;
        item._stretchTimer.finished = true;
    }
    if (!anyStretchTimerRunning()) releaseStretchAudio();
    if (navigator.vibrate) navigator.vibrate([40, 40, 80]);
    try {
        if (window._workoutSessionConfirmed) {
            saveWorkoutDraft({ elapsedMs: getWorkoutElapsedMs() });
        }
        if (typeof window.updateDomainBars === 'function') window.updateDomainBars();
        if (typeof window.syncGlobalRestBanners === 'function') window.syncGlobalRestBanners();
    } catch (e) { /* ignore */ }
}

function advanceStretchStepOn(items, exIdx, { refresh = true, persist = true } = {}) {
    const item = items?.[exIdx];
    const t = getStretchTimerState(item);
    if (!item || !t?.running) return;

    playStretchBeep();
    const cur = t.steps[t.stepIndex];
    if (cur?.kind === 'hold' && cur.setIdx != null) {
        completeHoldSet(item, cur.setIdx);
        try {
            if (persist && window._workoutSessionConfirmed) {
                saveWorkoutDraft({ elapsedMs: getWorkoutElapsedMs() });
            }
        } catch (e) { /* ignore */ }
    }

    let nextIndex = t.stepIndex + 1;
    // Skip holds whose sets were session-removed; also skip gaps with no remaining holds
    while (nextIndex < t.steps.length) {
        const cand = t.steps[nextIndex];
        if (cand.kind === 'hold') {
            const set = item.sets?.[cand.setIdx];
            if (!set || set._sessionSkipped) {
                nextIndex += 1;
                continue;
            }
            break;
        }
        const laterHold = t.steps.slice(nextIndex + 1).find(s => {
            if (s.kind !== 'hold') return false;
            const set = item.sets?.[s.setIdx];
            return !!(set && !set._sessionSkipped);
        });
        if (!laterHold) {
            nextIndex = t.steps.length;
            break;
        }
        break;
    }

    if (nextIndex >= t.steps.length) {
        markStretchSessionFinished(item);
        if (refresh) refreshStretchUi(exIdx);
        try { window.syncGlobalRestBanners?.(); } catch (e) { /* ignore */ }
        return;
    }

    const next = t.steps[nextIndex];
    t.stepIndex = nextIndex;
    t.stepStartedAt = Date.now();
    t.stepEndsAt = Date.now() + Math.max(1, next.durationSec) * 1000;
    if (refresh) refreshStretchUi(exIdx);
    try { window.syncGlobalRestBanners?.(); } catch (e) { /* ignore */ }
}

function advanceStretchStep(exIdx) {
    advanceStretchStepOn(store.activeLog?.items, exIdx);
}

/** Fast-forward overdue stretch steps on live or parked items. */
export function catchUpStretchTimersOnItems(items, { refresh = false, persist = false } = {}) {
    const list = items || [];
    let changed = false;
    list.forEach((item, exIdx) => {
        const t = getStretchTimerState(item);
        if (!t?.running) return;
        let guard = 0;
        while (t.running && Date.now() >= t.stepEndsAt && guard < 200) {
            advanceStretchStepOn(list, exIdx, { refresh, persist });
            changed = true;
            guard += 1;
        }
    });
    return changed;
}

export function startStretchTimer(exIdx) {
    const item = store.activeLog?.items?.[exIdx];
    if (!isPlannedTimedStretchItem(item)) return;
    if (getStretchTimerState(item)?.running) return;
    if (getStretchTimerState(item)?.finished) return;

    const steps = buildStretchTimerSteps(item);
    if (!steps.length) return;

    item._stretchTimer = {
        running: true,
        finished: false,
        stepIndex: 0,
        steps,
        stepStartedAt: Date.now(),
        stepEndsAt: Date.now() + Math.max(1, steps[0].durationSec) * 1000
    };
    try { unlockAudio(); } catch (e) { /* ignore */ }
    holdStretchAudio();
    ensureStretchTick();
    refreshStretchUi(exIdx);
    try { window.syncGlobalRestBanners?.(); } catch (e) { /* ignore */ }
}

/** Rebuild remaining steps after session excludes change mid-run. */
export function rebuildStretchTimerAfterExclude(exIdx) {
    const item = store.activeLog?.items?.[exIdx];
    const t = getStretchTimerState(item);
    if (!item || !t?.running) {
        refreshStretchUi(exIdx);
        return;
    }

    const cur = t.steps[t.stepIndex];
    const fresh = buildStretchTimerSteps(item);
    if (!fresh.length) {
        markStretchSessionFinished(item);
        refreshStretchUi(exIdx);
        return;
    }

    // If current hold was excluded, advance immediately (beep + next)
    if (cur?.kind === 'hold' && cur.setIdx != null) {
        const set = item.sets?.[cur.setIdx];
        if (!set || set._sessionSkipped) {
            t.steps = fresh;
            t.stepIndex = -1;
            advanceStretchStep(exIdx);
            return;
        }
    }

    // Keep current phase; append fresh future holds after this one
    const remainingLeft = remainingStretchStepSeconds(item);
    const currentKept = { ...cur, durationSec: Math.max(1, remainingLeft) };
    let startFrom = 0;
    if (cur?.kind === 'hold' && cur.setIdx != null) {
        const idx = fresh.findIndex(s => s.kind === 'hold' && s.setIdx === cur.setIdx);
        startFrom = idx >= 0 ? idx + 1 : 0;
    } else if (cur?.kind === 'gap') {
        // Drop leading gap in rebuilt list; resume gap then continue
        startFrom = fresh[0]?.kind === 'gap' ? 1 : 0;
    }
    t.steps = [currentKept, ...fresh.slice(startFrom)];
    t.stepIndex = 0;
    t.stepStartedAt = Date.now();
    t.stepEndsAt = Date.now() + currentKept.durationSec * 1000;
    ensureStretchTick();
    refreshStretchUi(exIdx);
    try { window.syncGlobalRestBanners?.(); } catch (e) { /* ignore */ }
}

export function toggleSessionStretchExclude(exIdx, baseName) {
    const item = store.activeLog?.items?.[exIdx];
    if (!item || !baseName) return;
    const key = String(baseName).toLowerCase();
    const matches = (item.sets || []).filter(s => stretchSetBaseName(s).toLowerCase() === key);
    if (!matches.length) return;
    const turnOff = !matches.every(s => s._sessionSkipped);
    matches.forEach(s => {
        s._sessionSkipped = turnOff;
        if (turnOff) s.completed = false;
    });
    if (getStretchTimerState(item)?.running) {
        rebuildStretchTimerAfterExclude(exIdx);
    } else {
        refreshStretchUi(exIdx);
    }
}

/** Catch up after tab backgrounding. */
export function syncStretchTimersFromWallClock() {
    const items = store.activeLog?.items || [];
    catchUpStretchTimersOnItems(items, { refresh: true, persist: true });
    items.forEach((item, exIdx) => {
        const t = getStretchTimerState(item);
        if (t?.running) updateStretchCountdownDom(exIdx, item);
    });
    if (anyStretchTimerRunning()) {
        holdStretchAudio();
        ensureStretchTick();
    } else {
        releaseStretchAudio();
    }
}

export function stretchTimerStatusSubtitle(item) {
    const t = getStretchTimerState(item);
    if (t?.finished) return 'Done';
    if (t?.running) {
        const step = currentStretchStep(item);
        const left = remainingStretchStepSeconds(item);
        if (!step) return `${left}s`;
        return stretchStepStatusLine(step, left);
    }
    return 'Tap Log · Start stretching';
}

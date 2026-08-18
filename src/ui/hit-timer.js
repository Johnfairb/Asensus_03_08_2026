/**
 * Lactate/HIT work + rest chain, same pattern as stretching:
 * one Start → work countdown → auto-log → rest → next work.
 * Duration baselines pause after work so the user can enter the result.
 */
import { store } from '../state/store.js';
import { saveWorkoutDraft } from '../domain/workout-draft.js';
import { ensureWorkoutTimerStarted, getWorkoutElapsedMs, syncExerciseTimer } from './workout-timer.js';
import { notifyRestTimerDone } from './notifications.js';
import {
    holdAudioAlive,
    playPrepareBeepSound,
    playRestAlarmSound,
    playStretchBeepSound,
    pokeLockScreenPosition,
    releaseAudioAlive,
    unlockAudio
} from './audio.js';

let _tickInterval = null;
let _hitAudioHeld = false;

function isHitClassItem(item) {
    return /hit\s*class/i.test(item?.exercise?.name || item?.name || '');
}

function isTimedLactateItem(item) {
    if (!item || item.isWarmupGroup) return false;
    if (isHitClassItem(item)) return false;
    return !!(item.isLactateHit || (item.sets || []).some(s => s && s.isLactateHit));
}

function isTimeTrialBaseline(set) {
    return !!(set?.isBaselineTest && set.baselineKind === 'distance');
}

function liveItems() {
    return store.activeLog?.items || [];
}

export function getHitTimerState() {
    const items = liveItems();
    for (const item of items) {
        if (item?._hitTimer) return item._hitTimer;
    }
    return null;
}

function writeHitTimerState(state) {
    const items = liveItems();
    const host = items.find(isTimedLactateItem) || items[0];
    items.forEach((item) => {
        if (item && item !== host) delete item._hitTimer;
    });
    if (host) host._hitTimer = state;
}

function currentStep(t = getHitTimerState()) {
    if (!t || t.stepIndex == null) return null;
    return t.steps?.[t.stepIndex] || null;
}

export function remainingHitStepSeconds(t = getHitTimerState()) {
    if (!t?.running || t.pausedForResult || !t.stepEndsAt) return 0;
    return Math.max(0, Math.ceil((t.stepEndsAt - Date.now()) / 1000));
}

export function currentHitStep() {
    return currentStep();
}

export function isHitTimerRunning() {
    return !!getHitTimerState()?.running;
}

export function isHitTimerActiveOnItem(item) {
    const t = getHitTimerState();
    if (!t?.running || !item) return false;
    const step = currentStep(t);
    if (!step) return !!t.running;
    const items = liveItems();
    return items[step.exIdx] === item;
}

function holdHitAudio() {
    if (_hitAudioHeld) return;
    _hitAudioHeld = true;
    holdAudioAlive();
}

function releaseHitAudio() {
    if (!_hitAudioHeld) return;
    _hitAudioHeld = false;
    releaseAudioAlive();
}

export function resetHitAudioHold() {
    _hitAudioHeld = false;
}

function refreshHitUi(exIdx) {
    try {
        if (window.currentModalExIdx != null && typeof window.renderExerciseSets === 'function') {
            window.renderExerciseSets();
        } else if (typeof window.renderWorkoutLog === 'function') {
            window.renderWorkoutLog();
        } else if (typeof window.renderActiveLog === 'function') {
            window.renderActiveLog();
        }
        if (typeof window.syncGlobalRestBanners === 'function') window.syncGlobalRestBanners();
    } catch (e) { /* ignore */ }
    try { pokeLockScreenPosition(); } catch (e) { /* ignore */ }
}

function persistDraft() {
    try {
        if (window._workoutSessionConfirmed) {
            saveWorkoutDraft({ elapsedMs: getWorkoutElapsedMs() });
        }
    } catch (e) { /* ignore */ }
}

export function buildHitTimerSteps(items = liveItems()) {
    const steps = [];
    const list = items || [];
    for (let exIdx = 0; exIdx < list.length; exIdx++) {
        const item = list[exIdx];
        if (!isTimedLactateItem(item)) continue;
        const sets = item.sets || [];
        for (let setIdx = 0; setIdx < sets.length; setIdx++) {
            const set = sets[setIdx];
            if (!set || set.completed || set._sessionSkipped) continue;
            if (isTimeTrialBaseline(set)) {
                return steps;
            }
            const workSec = set.isBaselineTest
                ? Math.max(1, Number(set.baselineFixedWorkSec) || Number(set.duration_sec) || 20)
                : Math.max(1, Number(set.duration_sec) || 20);
            const name = item.exercise?.name || item.name || 'HIT';
            steps.push({
                kind: 'work',
                exIdx,
                setIdx,
                durationSec: workSec,
                isBaseline: !!set.isBaselineTest,
                label: set.isBaselineTest ? (set.baselineLabel || 'Baseline') : name
            });
            if (set.isBaselineTest && set.baselineKind === 'duration') {
                steps.push({
                    kind: 'result',
                    exIdx,
                    setIdx,
                    label: set.baselineLabel || 'Baseline'
                });
            }
            const restSec = Number(set.restTime) || 0;
            if (restSec > 0) {
                steps.push({
                    kind: 'rest',
                    exIdx,
                    setIdx,
                    durationSec: restSec,
                    label: name
                });
            }
        }
    }
    return steps;
}

export function canStartHitTimer() {
    if (getHitTimerState()?.running) return false;
    const items = liveItems();
    if (items.some(item => (item.sets || []).some(s => s && s.locked))) return false;
    return buildHitTimerSteps().length > 0;
}

export function hitStepHeading(step) {
    if (!step) return '';
    if (step.kind === 'rest') return `Rest · ${step.label || 'next interval'}`;
    if (step.kind === 'result') return `Log result · ${step.label || 'baseline'}`;
    if (step.isBaseline) return `Work · ${step.label || 'baseline'}`;
    return `Work · ${step.label || 'interval'}`;
}

export function hitStepStatusLine(step, leftSec) {
    const left = Math.max(0, Number(leftSec) || 0);
    if (!step) return `${left}s`;
    if (step.kind === 'result') return `Enter ${step.label || 'result'}`;
    if (step.kind === 'rest') return `Rest · ${left}s`;
    return `${step.label || 'Work'} · ${left}s`;
}

export function hitTimerStatusSubtitle(item) {
    const t = getHitTimerState();
    if (t?.running) {
        const step = currentStep(t);
        if (t.pausedForResult || step?.kind === 'result') {
            return hitStepStatusLine(step, 0);
        }
        return hitStepStatusLine(step, remainingHitStepSeconds(t));
    }
    if (!item) return '';
    const sets = item.sets || [];
    const done = sets.filter(s => s && s.completed).length;
    return `${done} / ${sets.length} Intervals Logged`;
}

function updateHitCountdownDom() {
    const t = getHitTimerState();
    if (!t?.running) return;
    const step = currentStep(t);
    const left = remainingHitStepSeconds(t);
    const label = hitStepHeading(step);
    document.querySelectorAll('[data-hit-timer-countdown]').forEach((el) => {
        el.textContent = step?.kind === 'result' || t.pausedForResult ? '—' : `${left}s`;
    });
    document.querySelectorAll('[data-hit-timer-label]').forEach((el) => {
        el.textContent = label;
    });
    if (step?.exIdx != null) {
        const cardSub = document.getElementById(`hit-card-sub-${step.exIdx}`);
        if (cardSub) cardSub.textContent = hitStepStatusLine(step, left);
    }
    try { pokeLockScreenPosition(); } catch (e) { /* ignore */ }
}

function fireRestPrepareCue(t, step) {
    if (!t || !step || step.kind !== 'rest' || t.prepareFired) return;
    const left = remainingHitStepSeconds(t);
    const total = Number(step.durationSec) || 0;
    if (!(total > 30) || !(left <= 30) || !(left > 0)) return;
    t.prepareFired = true;
    try { playPrepareBeepSound(); } catch (e) { /* ignore */ }
    if (navigator.vibrate) navigator.vibrate(40);
}

function completeWorkSet(step) {
    const set = liveItems()?.[step.exIdx]?.sets?.[step.setIdx];
    if (!set) return;
    if (step.isBaseline && set.baselineKind === 'duration') {
        set.baselineAwaitingResult = true;
        return;
    }
    set.completed = true;
    if (navigator.vibrate) navigator.vibrate([50]);
    try {
        const item = liveItems()?.[step.exIdx];
        if (item) syncExerciseTimer(item, { editing: false });
        ensureWorkoutTimerStarted();
        if (typeof window.updateDomainBars === 'function') window.updateDomainBars();
    } catch (e) { /* ignore */ }
    persistDraft();
}

function markHitFinished(t) {
    if (t) {
        t.running = false;
        t.finished = true;
        t.pausedForResult = false;
        t.stepEndsAt = null;
    }
    releaseHitAudio();
    if (navigator.vibrate) navigator.vibrate([40, 40, 80]);
    persistDraft();
}

function beginStep(t, index) {
    const step = t.steps[index];
    t.stepIndex = index;
    t.prepareFired = false;
    if (!step) {
        markHitFinished(t);
        return;
    }
    if (step.kind === 'result') {
        t.pausedForResult = true;
        t.stepEndsAt = null;
        const set = liveItems()?.[step.exIdx]?.sets?.[step.setIdx];
        if (set) set.baselineAwaitingResult = true;
        return;
    }
    t.pausedForResult = false;
    t.stepStartedAt = Date.now();
    t.stepEndsAt = Date.now() + Math.max(1, Number(step.durationSec) || 1) * 1000;
}

function advanceHitStep({ refresh = true } = {}) {
    const t = getHitTimerState();
    if (!t?.running) return;
    const cur = currentStep(t);
    if (cur?.kind === 'work') {
        try { playStretchBeepSound(); } catch (e) { /* ignore */ }
        completeWorkSet(cur);
    } else if (cur?.kind === 'rest') {
        try { playRestAlarmSound(); } catch (e) { /* ignore */ }
        try { notifyRestTimerDone(); } catch (e) { /* ignore */ }
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    } else if (cur?.kind === 'result') {
        try { playStretchBeepSound(); } catch (e) { /* ignore */ }
    }

    const nextIndex = t.stepIndex + 1;
    if (nextIndex >= t.steps.length) {
        markHitFinished(t);
        if (refresh) refreshHitUi(cur?.exIdx);
        return;
    }
    beginStep(t, nextIndex);
    persistDraft();
    if (refresh) refreshHitUi(t.steps[nextIndex]?.exIdx);
}

function ensureHitTick() {
    if (_tickInterval) return;
    _tickInterval = setInterval(() => {
        const t = getHitTimerState();
        if (!t?.running) {
            clearInterval(_tickInterval);
            _tickInterval = null;
            return;
        }
        if (t.pausedForResult) return;
        fireRestPrepareCue(t, currentStep(t));
        if (Date.now() >= (t.stepEndsAt || 0)) {
            advanceHitStep();
        } else {
            updateHitCountdownDom();
        }
    }, 250);
}

export function startHitTimer() {
    if (!canStartHitTimer()) return;
    const steps = buildHitTimerSteps();
    if (!steps.length) return;
    const state = {
        running: true,
        finished: false,
        pausedForResult: false,
        stepIndex: 0,
        steps,
        stepStartedAt: Date.now(),
        stepEndsAt: Date.now() + Math.max(1, steps[0].durationSec) * 1000,
        prepareFired: false
    };
    if (steps[0].kind === 'result') {
        state.pausedForResult = true;
        state.stepEndsAt = null;
    }
    writeHitTimerState(state);
    try { unlockAudio(); } catch (e) { /* ignore */ }
    try { ensureWorkoutTimerStarted(); } catch (e) { /* ignore */ }
    holdHitAudio();
    ensureHitTick();
    persistDraft();
    refreshHitUi(steps[0].exIdx);
}

export function logHitWorkNow() {
    const t = getHitTimerState();
    const step = currentStep(t);
    if (!t?.running || step?.kind !== 'work') return;
    t.stepEndsAt = Date.now();
    advanceHitStep();
}

export function skipHitTimerRest() {
    const t = getHitTimerState();
    const step = currentStep(t);
    if (!t?.running || step?.kind !== 'rest') return;
    t.stepEndsAt = Date.now();
    advanceHitStep();
}

export function adjustHitTimerRest(seconds) {
    const t = getHitTimerState();
    const step = currentStep(t);
    if (!t?.running || step?.kind !== 'rest' || t.pausedForResult) return;
    const delta = Number(seconds) || 0;
    if (delta === -999) {
        skipHitTimerRest();
        return;
    }
    t.stepEndsAt = (t.stepEndsAt || Date.now()) + delta * 1000;
    if (t.stepEndsAt <= Date.now()) {
        advanceHitStep();
        return;
    }
    updateHitCountdownDom();
    persistDraft();
}

/** After a duration baseline result is saved, continue into rest. */
export function resumeHitTimerAfterBaselineResult(exIdx, setIdx) {
    const t = getHitTimerState();
    const step = currentStep(t);
    if (!t?.running) return false;
    const matches = step
        && step.exIdx === exIdx
        && step.setIdx === setIdx
        && (step.kind === 'result' || (step.kind === 'work' && step.isBaseline));
    if (!matches && !t.pausedForResult) return false;
    t.pausedForResult = false;
    if (step?.kind === 'work' && step.isBaseline) {
        // Work ended and result was saved in the same beat — skip the result step.
        const next = t.steps[t.stepIndex + 1];
        if (next?.kind === 'result') t.stepIndex += 1;
    }
    advanceHitStep();
    return true;
}

export function catchUpHitTimers({ refresh = true } = {}) {
    const t = getHitTimerState();
    if (!t?.running || t.pausedForResult) return false;
    let changed = false;
    let guard = 0;
    while (t.running && !t.pausedForResult && t.stepEndsAt && Date.now() >= t.stepEndsAt && guard < 200) {
        advanceHitStep({ refresh: false });
        changed = true;
        guard += 1;
    }
    if (t.running) {
        holdHitAudio();
        ensureHitTick();
        if (refresh) updateHitCountdownDom();
    } else {
        releaseHitAudio();
        if (refresh) refreshHitUi();
    }
    return changed;
}

export function syncHitTimersFromWallClock() {
    catchUpHitTimers({ refresh: true });
    if (getHitTimerState()?.running) {
        holdHitAudio();
        ensureHitTick();
    } else {
        releaseHitAudio();
    }
}

export function hitTimerRestOverrideHtml() {
    const t = getHitTimerState();
    const step = currentStep(t);
    if (!t?.running || step?.kind !== 'rest') return '';
    return `<div style="display:flex; gap:6px; margin-top:8px; justify-content:center; flex-wrap:wrap;">
        <button type="button" onclick="adjustHitTimerRest(-30)" style="background:var(--bg-surface-elevated); border:1px solid var(--border-subtle); color:var(--text-silver); font-size:9px; padding:4px 8px; border-radius:4px; font-family:'Roboto Mono'; cursor:pointer;">−30s</button>
        <button type="button" onclick="adjustHitTimerRest(30)" style="background:var(--bg-surface-elevated); border:1px solid var(--border-subtle); color:var(--text-silver); font-size:9px; padding:4px 8px; border-radius:4px; font-family:'Roboto Mono'; cursor:pointer;">+30s</button>
        <button type="button" onclick="skipHitTimerRest()" style="background:rgba(255,59,48,0.1); border:1px solid #FF3B30; color:#FF3B30; font-size:9px; padding:4px 8px; border-radius:4px; font-family:'Roboto Mono'; cursor:pointer;">SKIP</button>
    </div>`;
}

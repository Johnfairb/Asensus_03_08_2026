import { store } from '../state/store.js';
import { isExerciseBanned } from '../domain/bans.js';
import { resolveSessionRpe } from '../domain/sleep-rpe.js';
import { calculateLiveFitnessScores, generateDailyExerciseLog, getSeasonPhase, getTodayFocus, getWeeklyCoachTip, getWorkoutSessionAdvice, isGuidanceOff } from '../domain/fitness-hud.js';
import { applyInjuryPainFollowUpFromJournal, injuryAreaLabel, needsInjuryPainFollowUp } from '../domain/periodization.js';
import { HIT_TYPE_OPTIONS, resolveHitClassRecovery } from '../domain/lactate-engine.js';
import { commitMatchSession, commitPracticeSession, dateToISO, generateFutureTimeline, getWorkoutSessionSnapshot, invalidateWeekPlanCache, isAuxEvent, isLactateEvent, isLiftingEvent, isPracticeEvent, isSteadyCardio, isStrengthEvent, normalizeLoggedSessionKind, openMatchLogModal, openPracticeLogModal, openVideoModal, prettyWorkoutTypeLabel, recordLoggedWorkoutSession, setRouteOverride, addDaysISO } from '../domain/route-planner.js';
import { lactateSessionRpeBarHtml, openLactateHitPicker, shouldPromptLactateHitTypes } from './lactate-ui.js';

const HIT_TYPE_LABELS_RE = new RegExp(
    (HIT_TYPE_OPTIONS || []).map(o => String(o.label || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).filter(Boolean).join('|') || 'HIT class',
    'i'
);
import { saveSettings } from '../domain/thermodynamics.js';
import { addDropSetToExercise, addDropSetToSupersetSide, addExerciseToActiveLog, addSetToExercise, addSupersetRound, addSupersetWithNext, canSupersetPair, createSupersetFromIndices, repairSupersetWarmups, supersetRestAfterB, supersetTitleFromItem } from '../domain/workout-generator.js';
import { applyHypertrophyFatigueFromSession, buildHypertrophyWarmupSets, hypertrophyRestSeconds, isHypertrophyPhase } from '../domain/hypertrophy-engine.js';
import { maybePromptWeightFinder } from './weight-finder-ui.js';
import { maybeRetirePressUpsFromSet } from '../domain/bodyweight-lifts.js';
import { recordHydrationMl } from '../lib/food-parse.js';
import { syncAuthThemeUI } from './auth-onboarding.js';
import { loadHistory, persistPendingJournalMedia, renderAdherenceCalendar, renderJournalMediaPreview, resetJournalMedia, saveGymJournalEntry } from './journey.js';
import { notifyRestTimerDone } from './notifications.js';
import { addFoodToActiveLog, loadGhostTemplate, refreshTemplateSelector, removeFoodFromActiveLog, renderActiveLog, setConfirmRouteButtons, switchLogType, updateExecutionAuxBlocks, updateExerciseDropdowns, updateSaveTemplateButtonLabel } from './templates.js';
import {
    clearWorkoutDraft,
    draftMatchesPlanEvent,
    getDraftRunningElapsedMs,
    getDraftSessionLabel,
    hasWorkoutDraft,
    hasWorkoutDraftKey,
    loadWorkoutDraft,
    saveWorkoutDraft
} from '../domain/workout-draft.js';
import {
    formatDurationMs,
    getWorkoutElapsedMs,
    resetWorkoutTimer,
    setWorkoutElapsedMs,
    startWorkoutTimer,
    stopWorkoutTimer,
    stopWorkoutTimerDetailed
} from './workout-timer.js';

/** Read editable duration field (edit-workout mode) into frozen session duration. */
function syncEditDurationFromInput() {
    const input = document.getElementById('workout-edit-duration-min');
    if (!input) return;
    const mins = Math.max(0, Math.round(Number(input.value) || 0));
    window._lastSessionDurationMin = mins;
    window._loggedSessionDurationMs = mins > 0 ? mins * 60000 : 0;
    window._loggedSessionDurationLabel = mins > 0 ? formatDurationMs(mins * 60000) : '00:00';
}

/** Show frozen, editable duration instead of a running timer (edit workout). */
function showEditableSessionDuration(snap) {
    const mins = Number(snap?.durationMinutes) || Math.round((Number(snap?.durationMs) || 0) / 60000) || 0;
    const ms = Number(snap?.durationMs) || (mins > 0 ? mins * 60000 : 0);
    window._editingPreservedDuration = true;
    window._lastSessionDurationMin = mins;
    window._loggedSessionDurationMs = ms;
    window._loggedSessionDurationLabel = snap?.durationLabel || formatDurationMs(ms);
    resetWorkoutTimer();
    if (ms > 0) setWorkoutElapsedMs(ms);

    const wrap = document.getElementById('workout-timer-wrap');
    if (!wrap) return;
    wrap.classList.remove('hidden');
    const label = wrap.querySelector('.workout-timer-label');
    if (label) label.textContent = 'Duration';
    const span = document.getElementById('workout-session-timer');
    if (span) span.style.display = 'none';
    let input = document.getElementById('workout-edit-duration-min');
    if (!input) {
        input = document.createElement('input');
        input.id = 'workout-edit-duration-min';
        input.type = 'number';
        input.min = '0';
        input.max = '600';
        input.step = '1';
        input.setAttribute('inputmode', 'numeric');
        input.style.cssText = 'width:72px; background:transparent; border:1px solid var(--border-subtle); border-radius:6px; color:var(--gold-accent); font-family:Roboto Mono,monospace; font-size:16px; font-weight:800; padding:4px 6px; text-align:center;';
        input.addEventListener('change', syncEditDurationFromInput);
        input.addEventListener('input', syncEditDurationFromInput);
        wrap.appendChild(input);
    }
    input.style.display = '';
    input.value = String(mins || 0);
    let unit = document.getElementById('workout-edit-duration-unit');
    if (!unit) {
        unit = document.createElement('span');
        unit.id = 'workout-edit-duration-unit';
        unit.textContent = 'min';
        unit.style.cssText = 'font-size:10px; color:var(--text-muted); font-family:Roboto Mono,monospace; margin-left:4px;';
        wrap.appendChild(unit);
    }
    unit.style.display = '';
}

function clearEditableSessionDurationUi() {
    window._editingPreservedDuration = false;
    const span = document.getElementById('workout-session-timer');
    if (span) span.style.display = '';
    const input = document.getElementById('workout-edit-duration-min');
    if (input) input.style.display = 'none';
    const unit = document.getElementById('workout-edit-duration-unit');
    if (unit) unit.style.display = 'none';
    const label = document.querySelector('#workout-timer-wrap .workout-timer-label');
    if (label) label.textContent = 'Timer';
}

/** Freeze the session timer when Complete log is pressed (before diary). */
function captureSessionTimerAtLog() {
    syncEditDurationFromInput();
    if (window._editingPreservedDuration || window._loggedSessionDurationMs > 0 || window._lastSessionDurationMin > 0) {
        return {
            minutes: Number(window._lastSessionDurationMin) || 0,
            ms: Number(window._loggedSessionDurationMs) || 0,
            label: window._loggedSessionDurationLabel || formatDurationMs(window._loggedSessionDurationMs || 0)
        };
    }
    const detail = stopWorkoutTimerDetailed();
    window._lastSessionDurationMin = detail.minutes;
    window._loggedSessionDurationMs = detail.ms;
    window._loggedSessionDurationLabel = detail.label;
    return detail;
}
import { buildDiaryEntryFromForm, closeDiarySchemaEditor, renderDiaryFields } from './diary-ui.js';
import { collectDiaryFieldValues, journalModeToSchemaMode } from '../domain/diary-schema.js';
import { upsertTodayBodyFat, upsertTodayWeight } from '../domain/body-metrics.js';

export function calculatePlates(targetWeight = null) {
    let isUI = false;
    if (targetWeight === null || typeof targetWeight === 'object') {
        const inputEl = document.getElementById('plate-calc-target');
        if (!inputEl) return;
        targetWeight = parseFloat(inputEl.value) || 0;
        isUI = true;
    }
    if (targetWeight <= 20) {
        if (isUI) document.getElementById('plate-visuals').innerText = "BAR ONLY";
        return "BAR ONLY";
    }
    let sideWeight = Math.round(((targetWeight - 20) / 2) * 100) / 100; 
    const plates = [25, 20, 15, 10, 5, 2.5, 1.25]; let loaded = [];
    for (let plate of plates) { while (sideWeight >= plate - 0.01) { loaded.push(plate); sideWeight = Math.round((sideWeight - plate) * 100) / 100; } }
    
    let result = loaded.length > 0 ? loaded.join(' | ') : "BAR ONLY";
    if (isUI) document.getElementById('plate-visuals').innerText = result;
    return result;
}


export function renderWorkoutLog() {
    const focus = getTodayFocus();
    const { footerNote, showCoachTip } = getWorkoutSessionAdvice(focus);
    let html = '';

    if (footerNote || showCoachTip) {
        html += `<div style="margin-bottom:12px;">`;
        if (footerNote) {
            html += `<div style="font-size:9px; color:var(--text-stealth); font-style:italic; margin-bottom:${showCoachTip ? '10px' : '0'};">${footerNote}</div>`;
        }
        if (showCoachTip) {
            const weekTip = getWeeklyCoachTip();
            html += `<div style="font-size:10px; color:var(--gold-accent); padding:10px; border:1px solid rgba(212,175,55,0.25); border-radius:8px; background:rgba(212,175,55,0.05); font-family:'Roboto Mono'; line-height:1.45;"><strong>Coach tip · this week:</strong> ${weekTip.title} — ${weekTip.body}</div>`;
        }
        html += `</div>`;
    }

    // Lactate/HIT: live session RPE adjuster at top of the workout log
    html += lactateSessionRpeBarHtml();

    const filter = window._workoutLogFilter === 'logged' ? 'logged' : 'todo';
    const todoCount = (store.activeLog.items || []).filter((item, i) => !isWorkoutItemFullyLogged(item)).length;
    const loggedCount = (store.activeLog.items || []).filter((item) => isWorkoutItemFullyLogged(item)).length;
    html += `<div style="display:flex; gap:8px; margin-bottom:14px;">
        <button type="button" onclick="setWorkoutLogFilter('todo')" style="flex:1; padding:10px; border-radius:8px; border:1px solid ${filter === 'todo' ? 'var(--gold-accent)' : 'var(--border-highlight)'}; background:${filter === 'todo' ? 'rgba(212,175,55,0.12)' : 'var(--bg-surface-elevated)'}; color:${filter === 'todo' ? 'var(--gold-accent)' : 'var(--text-silver)'}; font-size:11px; font-family:'Roboto Mono'; font-weight:800; cursor:pointer;">TO DO (${todoCount})</button>
        <button type="button" onclick="setWorkoutLogFilter('logged')" style="flex:1; padding:10px; border-radius:8px; border:1px solid ${filter === 'logged' ? 'var(--gold-accent)' : 'var(--border-highlight)'}; background:${filter === 'logged' ? 'rgba(212,175,55,0.12)' : 'var(--bg-surface-elevated)'}; color:${filter === 'logged' ? 'var(--gold-accent)' : 'var(--text-silver)'}; font-size:11px; font-family:'Roboto Mono'; font-weight:800; cursor:pointer;">LOGGED (${loggedCount})</button>
    </div>`;

    store.activeLog.items.forEach((item, exIdx) => {
        const isAllCompleted = isWorkoutItemFullyLogged(item);
        if (filter === 'todo' && isAllCompleted) return;
        if (filter === 'logged' && !isAllCompleted) return;

        const isCardio = (item.exercise.domain || '').toLowerCase() === 'cardio';
        // Never collapse Lactate/HIT interval stacks (e.g. Cycling) into one steady set
        if (!isLactateHitLogItem(item) && isSteadyCardioLogItem(item) && Array.isArray(item.sets) && item.sets.length > 1) {
            item.sets = [item.sets[0]];
        }
        let domainTag = item.isWarmupGroup ? 'WARMUP' : (item.exercise.domain ? item.exercise.domain.toUpperCase() : 'CUSTOM');
        let domainColor = item.isWarmupGroup ? 'var(--gold-accent)' : (isCardio ? 'var(--text-stealth)' : 'var(--gold-accent)');
        if (item.isSuperset || item.supersetId) domainTag = 'SUPERSET';
        if (item.isStretchGroup || isStaticStretchingLogItem(item)) {
            domainTag = 'STRETCH';
            domainColor = 'var(--gold-accent)';
        }
        
        const workSets = (item.sets || []).filter(s => !s.isWarmup && !(item.isSuperset && s.side === 'A' && !s.isDropSet));
        // For supersets, count B rounds (or unique rounds) as "sets"
        let completedSets = item.isSuperset
            ? (item.sets || []).filter(s => s.side === 'B' && !s.isWarmup && !s.isDropSet && s.completed).length
            : workSets.filter(s => s.completed).length;
        let totalSets = item.isSuperset
            ? (typeof item.plannedSets === 'number'
                ? item.plannedSets
                : (item.sets || []).filter(s => s.side === 'B' && !s.isWarmup && !s.isDropSet).length)
            : (typeof item.plannedSets === 'number' ? item.plannedSets : workSets.length);
        let checkIcon = isAllCompleted ? `<span style="color:var(--gold-accent); margin-left:8px;">✓</span>` : '';
        const isLactateHit = isLactateHitLogItem(item);
        let unitLabel = item.isWarmupGroup
            ? 'Parts'
            : (item.isSuperset ? 'Rounds' : (isSteadyCardioLogItem(item) || isStaticStretchingLogItem(item) ? 'Session' : 'Sets'));
        if (isLactateHit) {
            domainTag = 'LACTATE/HIT';
            domainColor = 'var(--gold-accent)';
            unitLabel = 'Intervals';
            totalSets = (item.sets || []).length;
            completedSets = (item.sets || []).filter(s => s.completed).length;
        }

        let subtitle = `${completedSets} / ${totalSets} ${unitLabel} Logged`;
        if (item.isStretchGroup || isStaticStretchingLogItem(item)) {
            subtitle = isAllCompleted ? 'Done' : 'Tap Log when finished';
        } else if (item.isWarmupGroup) {
            subtitle = `${completedSets} / ${totalSets} parts`;
        } else if (item.isSuperset) {
            subtitle = `${completedSets}/${totalSets} rounds`;
        } else if (!isLactateHit && !isCardio && !item.isSportSessionBlock) {
            const lifting = (item.sets || []).filter(s => s && !s.isWarmup && !s.isText);
            if (lifting.length) {
                const sample = lifting[0];
                const n = typeof item.plannedSets === 'number' ? item.plannedSets : lifting.length;
                const reps = sample.reps || 10;
                const load = Number(sample.weight) > 0 ? `${sample.weight}kg` : 'BW';
                subtitle = `${load} · ${n}×${reps}`;
                if (completedSets > 0) subtitle += ` · ${completedSets}/${n}`;
            }
        } else if (item.isSportSessionBlock) {
            subtitle = isAllCompleted ? 'Done' : 'Tap Log when finished';
        }
        const nextItem = store.activeLog.items[exIdx + 1];
        const canSuperset = !item.isSuperset && !isLactateHit && !item.isWarmupGroup && !isStaticStretchingLogItem(item)
            && nextItem && canSupersetPair(item, nextItem);
        const restSlot = isLactateHit
            ? lactateRestSlotHtml(item, exIdx)
            : (canSuperset
                ? `<button type="button" onclick="addSupersetWithNext(${exIdx})" style="width:100%; margin-top:10px; background:transparent; color:var(--text-silver); border:1px dashed var(--border-subtle); padding:8px; border-radius:6px; cursor:pointer; font-size:10px; font-family:'Roboto Mono';">+ Superset with next</button>`
                : '');

        const displayName = (item.isStretchGroup || isStaticStretchingLogItem(item))
            ? 'Stretching'
            : (item.isSuperset
                ? (supersetTitleFromItem(item) || item.exercise.name)
                : item.exercise.name);

        const removeAction = item.isWarmupGroup
            ? `dismissPlannedWarmupFromLog(${exIdx})`
            : ((item.isStretchGroup || isStaticStretchingLogItem(item)) && !item.isCustomStretch
                ? `dismissPlannedStretchFromLog(${exIdx})`
                : `removeFoodFromActiveLog(${exIdx})`);

        html += `<div class="workout-card" style="padding: 16px;" data-ex-idx="${exIdx}"
            draggable="${!item.isWarmupGroup && !item.isStretchGroup && !isLactateHit && !item.isSportSessionBlock ? 'true' : 'false'}"
            ondragstart="workoutCardDragStart(event, ${exIdx})"
            ondragover="workoutCardDragOver(event, ${exIdx})"
            ondragleave="workoutCardDragLeave(event)"
            ondrop="workoutCardDrop(event, ${exIdx})"
            ontouchstart="workoutCardTouchStart(event, ${exIdx})"
            ontouchend="workoutCardTouchEnd(event, ${exIdx})">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <div style="display:flex; align-items:center; gap:8px; min-width:0;">
                    <span class="superset-drag-handle" title="Drag onto another exercise to superset" style="cursor:grab; color:var(--text-stealth); font-size:14px; letter-spacing:-2px; user-select:none; touch-action:none;">⠿</span>
                    <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05); padding:4px 8px; border-radius:4px; font-size:9px; font-family:'Roboto Mono'; color:${domainColor}; font-weight:bold; letter-spacing:1px;">
                        [ ${domainTag} ]
                    </div>
                </div>
                <button type="button" onclick="${removeAction}" style="background:none; border:none; color:var(--text-stealth); font-size:14px; cursor:pointer; display:flex; align-items:center;" aria-label="Remove"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
            </div>
            
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <div class="workout-title" style="color:var(--text-main); margin-bottom:4px; font-size: 15px;">${displayName}${checkIcon}</div>
                    <div style="font-size:11px; color:var(--text-muted); font-family:'Roboto Mono';">${subtitle}</div>
                </div>
                <button class="btn-primary is-primary" style="width:auto; margin:0; padding:10px 20px; font-size:12px;" onclick="window.beginExerciseLog(${exIdx})">${isAllCompleted ? 'Edit' : 'Log'}</button>
            </div>
            ${restSlot}
        </div>`;
    });

    if (filter === 'todo' && todoCount === 0) {
        html += `<div style="font-size:12px; color:var(--text-muted); text-align:center; padding:18px 8px;">All exercises logged. Switch to Logged to review.</div>`;
    }
    if (filter === 'logged' && loggedCount === 0) {
        html += `<div style="font-size:12px; color:var(--text-muted); text-align:center; padding:18px 8px;">Nothing logged yet — complete sets under To do.</div>`;
    }
    
    if (filter === 'todo') {
        html += `<button onclick="toggleToolsMenu()" style="width:100%; background:transparent; color:var(--text-silver); border:1px dashed var(--border-highlight); padding:12px; margin-top:8px; border-radius:8px; cursor:pointer; font-size:12px; font-weight:bold;">+ Add exercise</button>`;
    }
    
    document.getElementById('active-log-list').innerHTML = html;
}

function isWorkoutItemFullyLogged(item) {
    if (!item || !Array.isArray(item.sets) || !item.sets.length) return false;
    return item.sets.every(s => s.completed);
}

export function setWorkoutLogFilter(filter) {
    window._workoutLogFilter = filter === 'logged' ? 'logged' : 'todo';
    renderWorkoutLog();
}

/** Drag an exercise card onto another to create a merged superset. */
export function workoutCardDragStart(event, exIdx) {
    window._supersetDragIdx = exIdx;
    try {
        event.dataTransfer.setData('text/plain', String(exIdx));
        event.dataTransfer.effectAllowed = 'move';
    } catch (e) { /* ignore */ }
    event.currentTarget?.classList?.add('superset-dragging');
}

export function workoutCardDragOver(event, exIdx) {
    const from = window._supersetDragIdx;
    if (from == null || from === exIdx) return;
    event.preventDefault();
    try { event.dataTransfer.dropEffect = 'move'; } catch (e) { /* ignore */ }
    event.currentTarget?.classList?.add('superset-drop-target');
}

export function workoutCardDragLeave(event) {
    event.currentTarget?.classList?.remove('superset-drop-target');
}

export function workoutCardDrop(event, targetIdx) {
    event.preventDefault();
    event.currentTarget?.classList?.remove('superset-drop-target');
    document.querySelectorAll('.superset-dragging').forEach(el => el.classList.remove('superset-dragging'));
    let from = window._supersetDragIdx;
    try {
        const raw = event.dataTransfer.getData('text/plain');
        if (raw !== '' && raw != null) from = Number(raw);
    } catch (e) { /* ignore */ }
    window._supersetDragIdx = null;
    if (from == null || Number.isNaN(from) || from === targetIdx) return;
    const items = store.activeLog?.items || [];
    if (!canSupersetPair(items[from], items[targetIdx])) {
        alert('Those exercises cannot be supersetted. Drag one lifting exercise onto another.');
        return;
    }
    // Dropped exercise becomes A; target becomes B (order: dragged first)
    createSupersetFromIndices(from, targetIdx);
}

/** Mobile: tap ⠿ on one exercise, then ⠿ on another to pair. */
export function workoutCardTouchStart(event, exIdx) {
    const handle = event.target?.closest?.('.superset-drag-handle');
    if (!handle) return;
    event.preventDefault();
    event.stopPropagation();
    const from = window._supersetTouchSelect;
    if (from != null && from !== exIdx) {
        const items = store.activeLog?.items || [];
        window._supersetTouchSelect = null;
        document.querySelectorAll('.workout-card.superset-selected').forEach(el => el.classList.remove('superset-selected'));
        if (!canSupersetPair(items[from], items[exIdx])) {
            alert('Those exercises cannot be supersetted.');
            return;
        }
        createSupersetFromIndices(from, exIdx);
        return;
    }
    window._supersetTouchSelect = exIdx;
    document.querySelectorAll('.workout-card.superset-selected').forEach(el => el.classList.remove('superset-selected'));
    event.currentTarget?.classList?.add('superset-selected');
}

export function workoutCardTouchEnd(event, exIdx) {
    // Selection is confirmed on the second ⠿ tap (touchstart); nothing to do here.
}

/** Expand/collapse a warmup or stretch parent part (shows children only when open). */
export function togglePrepPartExpand(exIdx, setIdx) {
    const item = store.activeLog?.items?.[exIdx];
    const set = item?.sets?.[setIdx];
    if (!set) return;
    set._uiExpanded = !set._uiExpanded;
    renderExerciseSets();
}

/** Expand/collapse a child drill/joint under a warmup part. */
export function togglePrepChildExpand(exIdx, setIdx, childIdx) {
    const item = store.activeLog?.items?.[exIdx];
    const set = item?.sets?.[setIdx];
    const child = set?.children?.[childIdx];
    if (!child) return;
    child._uiExpanded = !child._uiExpanded;
    renderExerciseSets();
}

/** Ask for work weight (first time on this exercise) before opening the sets log. */
export function beginExerciseLog(exIdx) {
    if (maybePromptWeightFinder(exIdx, { openLogAfter: true })) return;
    openExerciseSetsModal(exIdx);
}

export function openExerciseSetsModal(exIdx) {
    window.currentModalExIdx = exIdx;
    const item = store.activeLog.items[exIdx];
    // Steady cardio is always a single distance/duration entry
    if (!isLactateHitLogItem(item) && isSteadyCardioLogItem(item) && Array.isArray(item.sets) && item.sets.length > 1) {
        item.sets = [item.sets[0]];
    }
    maybeFixStaleWarmupLoads(item);
    if (item.isSuperset) repairSupersetWarmups(item);
    const title = item.isSuperset
        ? (supersetTitleFromItem(item) || item.exercise.name)
        : item.exercise.name;
    document.getElementById('sets-modal-title').innerText = title;
    renderExerciseSets();
    populateSwapDropdown(exIdx);
    populateCardioTypePicker(exIdx);
    const chartName = item.isSuperset
        ? (item.sides?.[0]?.exercise?.name || item.exercise.name)
        : item.exercise.name;
    drawModalExerciseChart(
        chartName,
        item.isWarmupGroup || item.isSuperset || isStaticStretchingLogItem(item) || isSteadyCardioLogItem(item) || isLactateHitLogItem(item)
    );
    document.getElementById('exercise-sets-modal').classList.remove('hidden');
}

/** True if no warmup set has been completed yet. */
function warmupsStillEditable(item) {
    return !(item?.sets || []).some(s => s && s.isWarmup && s.completed);
}

/**
 * Rebuild per-lift warmups from current working weight when warmups are not started.
 * Also self-heals drafts where warmup 1 was incorrectly set to the work weight.
 */
function maybeRebuildLiftWarmups(item, workKg) {
    if (!item || item.isWarmupGroup || item.isSuperset || isStaticStretchingLogItem(item) || isSteadyCardioLogItem(item) || isLactateHitLogItem(item)) {
        return false;
    }
    if (!warmupsStillEditable(item)) return false;
    const domain = (item.exercise?.domain || '').toLowerCase();
    if (domain === 'cardio' || domain === 'warmup') return false;
    const w = Number(workKg);
    if (!Number.isFinite(w) || w < 0) return false;

    const nonWarmup = (item.sets || []).filter(s => s && !s.isWarmup);
    const workSets = nonWarmup.filter(s => !s.isText && !s.isLactateHit);
    const reps = Number(workSets[0]?.reps) || 10;
    const isIso = !!(item.isIsolation);
    const warmups = buildHypertrophyWarmupSets(item.exercise?.name || '', w, reps, isIso);
    const updatedWork = nonWarmup.map(s => {
        if (s.isText || s.isLactateHit || s.isDropSet) return s;
        return { ...s, weight: w };
    });
    item.sets = [...warmups, ...updatedWork];
    item.workWeightKg = w;
    return true;
}

function maybeFixStaleWarmupLoads(item) {
    if (!item || !warmupsStillEditable(item)) return;
    if (item.isSuperset) {
        repairSupersetWarmups(item);
        return;
    }
    const working = (item.sets || []).filter(s => s && !s.isWarmup && !s.isText && !s.isLactateHit);
    const warmups = (item.sets || []).filter(s => s && s.isWarmup);
    if (!working.length) return;
    const workW = Number(working[0].weight) || 0;
    if (workW <= 0) return;
    const stale = warmups.some(wu => Math.abs((Number(wu.weight) || 0) - workW) < 0.01)
        || (warmups.length >= 2 && (Number(warmups[1].weight) || 0) + 0.01 < (Number(warmups[0].weight) || 0));
    if (stale || !warmups.length) maybeRebuildLiftWarmups(item, workW);
}

/** Steady duration always comes from the session timer (minutes, floored by rounding). */
function getTimerDurationMinutes() {
    return Math.max(0, Math.round(getWorkoutElapsedMs() / 60000));
}

function applyTimerDurationToSteadyItem(item) {
    if (!isSteadyCardioLogItem(item)) return;
    const mins = getTimerDurationMinutes();
    (item.sets || []).forEach(set => {
        if (!set.isText) set.time_minutes = mins;
    });
}

export function closeExerciseSetsModal() {
    // Confirm on steady cardio / stretch counts as logged for that block
    const exIdx = window.currentModalExIdx;
    if (exIdx != null && store.activeLog?.items?.[exIdx]) {
        const item = store.activeLog.items[exIdx];
        if (isSteadyCardioLogItem(item)) {
            applyTimerDurationToSteadyItem(item);
            (item.sets || []).forEach(set => {
                if (set.isText) {
                    set.completed = true;
                    return;
                }
                if ((Number(set.distance_km) > 0) || (Number(set.time_minutes) > 0)) {
                    set.completed = true;
                }
            });
        } else if (isStaticStretchingLogItem(item)) {
            (item.sets || []).forEach(set => {
                if (set.isText) {
                    set.completed = true;
                    return;
                }
                if ((Number(set.distance_km) > 0) || (Number(set.time_minutes) > 0) || isStaticStretchingLogItem(item)) {
                    set.completed = true;
                }
            });
        }
    }
    document.getElementById('exercise-sets-modal').classList.add('hidden');
    window.currentModalExIdx = null;
    if (store.modalExerciseChartInstance) {
        store.modalExerciseChartInstance.destroy();
        store.modalExerciseChartInstance = null;
    }
    const cardioSearch = document.getElementById('sets-modal-cardio-search');
    if (cardioSearch) cardioSearch.value = '';
    if (window._workoutSessionConfirmed) saveWorkoutDraft({ elapsedMs: getWorkoutElapsedMs() });
    renderActiveLog();
}

/** Steady Zone-2 style cardio (not sprints / lactate intervals). */
export function isSteadyCardioLogItem(item) {
    if (!item?.exercise) return false;
    // Lactate/HIT modalities (cycling, rower, elliptical, etc.) are cardio-domain
    // but must keep all interval sets — never collapse to a single steady entry.
    if (item.isLactateHit || (item.sets || []).some(s => s && s.isLactateHit)) return false;
    const domain = (item.exercise.domain || '').toLowerCase();
    const name = item.exercise.name || '';
    if (domain !== 'cardio') return false;
    if (/sprint|lactate|interval|30s\s*on|hit\s*class|attack\s*bike|skierg|rower|battle\s*rope|elliptical|cycling/i.test(name)) return false;
    return true;
}

/** Cool-down static stretching block — duration + log only. */
export function isStaticStretchingLogItem(item) {
    if (!item?.exercise) return false;
    if (item.isStretchGroup || item.isCustomStretch) return true;
    return /stretch/i.test(item.exercise.name || '');
}

/** Lactate/HIT interval block — duration + rest timer, no load/RIR. */
export function isLactateHitLogItem(item) {
    if (!item) return false;
    if (item.isLactateHit) return true;
    return (item.sets || []).some(s => s && s.isLactateHit);
}

function formatDurationSecLabel(sec) {
    const n = Math.max(0, Math.round(Number(sec) || 0));
    if (n % 60 === 0) return `${n / 60}m`;
    if (n > 60) return `${Math.floor(n / 60)}m ${n % 60}s`;
    return `${n}s`;
}

/** Rest countdown in the former “Superset with next” slot on lactate cards. */
function lactateRestSlotHtml(item, exIdx) {
    const sets = item.sets || [];
    const locked = sets.find(s => s.locked && s.lockTimeLeft > 0);
    if (locked) {
        return `<div id="lactate-rest-slot-${exIdx}" style="width:100%; margin-top:10px; padding:10px 12px; border-radius:6px; border:1px solid rgba(212,175,55,0.35); background:rgba(212,175,55,0.08); text-align:center;">
            <div style="font-size:9px; color:var(--text-muted); font-family:'Roboto Mono'; letter-spacing:0.5px; text-transform:uppercase; margin-bottom:4px;">Rest timer</div>
            <div style="font-size:18px; font-weight:800; color:var(--gold-accent); font-family:'Roboto Mono';">${locked.lockTimeLeft}s</div>
            <div style="display:flex; gap:6px; margin-top:8px; justify-content:center;">
                <button type="button" onclick="overrideRest(${exIdx}, ${sets.indexOf(locked)}, 30)" style="background:var(--bg-surface-elevated); border:1px solid var(--border-subtle); color:var(--text-silver); font-size:9px; padding:4px 8px; border-radius:4px; font-family:'Roboto Mono'; cursor:pointer;">+30s</button>
                <button type="button" onclick="overrideRest(${exIdx}, ${sets.indexOf(locked)}, -999)" style="background:rgba(255,59,48,0.1); border:1px solid #FF3B30; color:#FF3B30; font-size:9px; padding:4px 8px; border-radius:4px; font-family:'Roboto Mono'; cursor:pointer;">SKIP</button>
            </div>
        </div>`;
    }
    // Also show rest targeting the next lactate exercise (mixed modalities)
    const nextItem = store.activeLog.items[exIdx + 1];
    if (nextItem && isLactateHitLogItem(nextItem)) {
        const nextLocked = (nextItem.sets || []).find(s => s.locked && s.lockTimeLeft > 0);
        if (nextLocked) {
            const nIdx = (nextItem.sets || []).indexOf(nextLocked);
            return `<div id="lactate-rest-slot-${exIdx}" style="width:100%; margin-top:10px; padding:10px 12px; border-radius:6px; border:1px solid rgba(212,175,55,0.35); background:rgba(212,175,55,0.08); text-align:center;">
                <div style="font-size:9px; color:var(--text-muted); font-family:'Roboto Mono'; letter-spacing:0.5px; text-transform:uppercase; margin-bottom:4px;">Rest before next interval</div>
                <div style="font-size:18px; font-weight:800; color:var(--gold-accent); font-family:'Roboto Mono';">${nextLocked.lockTimeLeft}s</div>
                <div style="display:flex; gap:6px; margin-top:8px; justify-content:center;">
                    <button type="button" onclick="overrideRest(${exIdx + 1}, ${nIdx}, 30)" style="background:var(--bg-surface-elevated); border:1px solid var(--border-subtle); color:var(--text-silver); font-size:9px; padding:4px 8px; border-radius:4px; font-family:'Roboto Mono'; cursor:pointer;">+30s</button>
                    <button type="button" onclick="overrideRest(${exIdx + 1}, ${nIdx}, -999)" style="background:rgba(255,59,48,0.1); border:1px solid #FF3B30; color:#FF3B30; font-size:9px; padding:4px 8px; border-radius:4px; font-family:'Roboto Mono'; cursor:pointer;">SKIP</button>
                </div>
            </div>`;
        }
    }
    return `<div id="lactate-rest-slot-${exIdx}" style="width:100%; margin-top:10px; padding:8px; border-radius:6px; border:1px dashed var(--border-subtle); color:var(--text-stealth); font-size:10px; font-family:'Roboto Mono'; text-align:center;">Rest timer starts when you log an interval</div>`;
}

function startRestOnSet(exIdx, setIdx, restSec) {
    const item = store.activeLog.items[exIdx];
    const target = item?.sets?.[setIdx];
    if (!target || !(restSec > 0)) return;
    target.locked = true;
    target.lockTimeLeft = Math.round(restSec);
    const key = `${exIdx}-${setIdx}`;
    if (store.restIntervals[key]) clearInterval(store.restIntervals[key]);
    store.restIntervals[key] = setInterval(() => {
        target.lockTimeLeft--;
        const btn = document.getElementById(`btn-check-${exIdx}-${setIdx}`);
        if (btn && target.locked) btn.innerText = target.lockTimeLeft + 's';
        if (window.currentModalExIdx == null) renderWorkoutLog();
        if (target.lockTimeLeft <= 0) {
            clearInterval(store.restIntervals[key]);
            target.locked = false;
            playRestAlarm();
            if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200]);
            if (window.currentModalExIdx !== null && window.currentModalExIdx !== undefined) renderExerciseSets();
            else renderWorkoutLog();
        }
    }, 1000);
}

function formatCardioPace(distanceKm, timeMinutes) {
    const dist = Number(distanceKm) || 0;
    const mins = Number(timeMinutes) || 0;
    if (!(dist > 0) || !(mins > 0)) return '—';
    // distance ÷ duration (hours) → km/h
    const kmh = dist / (mins / 60);
    const minPerKm = mins / dist;
    const paceClock = (() => {
        const totalSec = Math.round(minPerKm * 60);
        const m = Math.floor(totalSec / 60);
        const s = totalSec % 60;
        return `${m}:${String(s).padStart(2, '0')}`;
    })();
    return `${kmh.toFixed(2)} km/h · ${paceClock} /km`;
}

export function updateCardioPaceReadout(exIdx, setIdx) {
    const el = document.getElementById(`cardio-pace-${exIdx}-${setIdx}`);
    if (!el) return;
    const item = store.activeLog.items?.[exIdx];
    const set = item?.sets?.[setIdx];
    if (!set) return;
    const mins = isSteadyCardioLogItem(item) ? getTimerDurationMinutes() : set.time_minutes;
    el.innerText = formatCardioPace(set.distance_km, mins);
    const durEl = document.getElementById(`cardio-timer-duration-${exIdx}-${setIdx}`);
    if (durEl && isSteadyCardioLogItem(item)) {
        const timerMins = getTimerDurationMinutes();
        const timerLabel = formatDurationMs(getWorkoutElapsedMs());
        durEl.textContent = `${timerLabel}${timerMins > 0 ? ` · ${timerMins} min` : ''}`;
    }
}

export async function drawModalExerciseChart(exerciseName, hideChart = false) {
    const wrap = document.getElementById('sets-modal-progress-wrap');
    const canvas = document.getElementById('sets-modal-exercise-chart');
    if (!wrap || !canvas) return;

    window._modalChartExerciseName = exerciseName || window._modalChartExerciseName || '';
    window._modalChartHidden = !!hideChart;

    if (hideChart || !exerciseName || exerciseName === 'Warmup') {
        wrap.style.display = 'none';
        return;
    }

    wrap.style.display = 'block';
    try {
        const { data: workoutData } = await store.supabaseClient.from('workout_logs').select('*').order('created_at', { ascending: true });
        let actualData = [];
        let isCardio = false;
        const rangeEl = document.getElementById('sets-modal-chart-range');
        const range = rangeEl?.value || 'all';
        const now = Date.now();
        const cutoffMs = range === 'month'
            ? now - (30 * 24 * 60 * 60 * 1000)
            : range === 'year'
                ? now - (365 * 24 * 60 * 60 * 1000)
                : 0;

        if (workoutData) {
            let exLogs = workoutData.filter(l => l.exercise === exerciseName);
            if (exLogs.length > 0 && exLogs[0].type === 'cardio') isCardio = true;

            const grouped = exLogs.reduce((acc, log) => {
                const ms = new Date(log.created_at).setHours(0, 0, 0, 0);
                if (cutoffMs && ms < cutoffMs) return acc;
                const val = isCardio ? log.distance_km : log.weight_kg;
                if (!acc[ms] || val > acc[ms]) acc[ms] = val;
                return acc;
            }, {});

            actualData = Object.keys(grouped).map(ts => {
                const ms = parseInt(ts, 10);
                return {
                    ms,
                    label: new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
                    y: grouped[ts]
                };
            }).sort((a, b) => a.ms - b.ms);

            // If user has less history than the selected window, chart is effectively all-time
            if ((range === 'month' || range === 'year') && actualData.length === 0 && exLogs.length) {
                const allGrouped = exLogs.reduce((acc, log) => {
                    const ms = new Date(log.created_at).setHours(0, 0, 0, 0);
                    const val = isCardio ? log.distance_km : log.weight_kg;
                    if (!acc[ms] || val > acc[ms]) acc[ms] = val;
                    return acc;
                }, {});
                actualData = Object.keys(allGrouped).map(ts => {
                    const ms = parseInt(ts, 10);
                    return {
                        ms,
                        label: new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
                        y: allGrouped[ts]
                    };
                }).sort((a, b) => a.ms - b.ms);
            }
        }

        if (store.modalExerciseChartInstance) store.modalExerciseChartInstance.destroy();

        if (actualData.length === 0) {
            wrap.style.display = 'none';
            return;
        }

        const ctx = canvas.getContext('2d');
        let gradient = ctx.createLinearGradient(0, 0, 0, 140);
        gradient.addColorStop(0, 'rgba(212, 175, 55, 0.4)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

        store.modalExerciseChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: actualData.map(d => d.label),
                datasets: [{
                    label: isCardio ? 'Max Distance' : 'Max Weight',
                    data: actualData.map(d => d.y),
                    borderColor: '#D4AF37',
                    backgroundColor: gradient,
                    borderWidth: 2,
                    pointBackgroundColor: '#fff',
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: {
                        ticks: {
                            color: '#888',
                            font: { family: 'Roboto Mono', size: 9 },
                            maxTicksLimit: 4
                        },
                        grid: { display: false }
                    },
                    y: {
                        ticks: {
                            color: '#888',
                            font: { family: 'Roboto Mono', size: 9 },
                            callback: (val) => val + (isCardio ? ' km' : ' kg')
                        },
                        grid: { color: 'rgba(255,255,255,0.03)' },
                        border: { display: false }
                    }
                }
            }
        });
    } catch (e) {
        console.warn('drawModalExerciseChart', e);
        wrap.style.display = 'none';
    }
}

export function redrawModalExerciseChart() {
    const name = window._modalChartExerciseName;
    if (!name) return;
    drawModalExerciseChart(name, !!window._modalChartHidden);
}

export function populateSwapDropdown(exIdx) {
    const wrap = document.getElementById('sets-modal-swap-wrap');
    const select = document.getElementById('sets-modal-swap-select');
    const cardioWrap = document.getElementById('sets-modal-cardio-type-wrap');
    if (!wrap || !select) return;

    const item = store.activeLog.items[exIdx];
    // Steady cardio / stretching / lactate use their own UI instead of muscle-group swap
    if (!item || item.isWarmupGroup || isSteadyCardioLogItem(item) || isStaticStretchingLogItem(item) || isLactateHitLogItem(item) || !item.exercise.muscle_group) {
        wrap.style.display = 'none';
        return;
    }

    if (cardioWrap) cardioWrap.style.display = 'none';

    const group = item.exercise.muscle_group;
    const equivalents = store.globalExerciseDB.filter(e =>
        e.muscle_group === group && e.name !== item.exercise.name && !isExerciseBanned(e.id)
    );

    if (equivalents.length === 0) {
        wrap.style.display = 'none';
        return;
    }

    wrap.style.display = 'block';
    select.innerHTML = `<option value="">Keep: ${item.exercise.name}</option>` +
        equivalents.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
}

/** Cardio modalities available for steady-state type selection. */
const STEADY_CARDIO_TYPE_FALLBACKS = [
    'Steady State Cardio',
    'Easy Run',
    'Jog',
    'Bike',
    'Spin Bike',
    'Rowing Machine',
    'Swim',
    'Elliptical',
    'Incline Walk',
    'Ski Erg',
    'Cross Trainer'
];

function getSteadyCardioTypeOptions() {
    const fromDb = (store.globalExerciseDB || []).filter(e =>
        e && (e.domain || '').toLowerCase() === 'cardio' &&
        !/sprint|lactate|interval|30s\s*on/i.test(e.name || '')
    );
    const seen = new Set();
    const out = [];
    fromDb.forEach(e => {
        const key = String(e.name || '').toLowerCase();
        if (!key || seen.has(key)) return;
        seen.add(key);
        out.push(e);
    });
    // Ensure common modalities exist even if the local library was seeded earlier
    STEADY_CARDIO_TYPE_FALLBACKS.forEach((name, i) => {
        const key = name.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        out.push({
            id: `steady_cardio_fallback_${i}`,
            name,
            domain: 'cardio',
            muscle_group: 'full',
            _fallback: true
        });
    });
    out.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    return out;
}

export function populateCardioTypePicker(exIdx) {
    const wrap = document.getElementById('sets-modal-cardio-type-wrap');
    const select = document.getElementById('sets-modal-cardio-type-select');
    const search = document.getElementById('sets-modal-cardio-search');
    const swapWrap = document.getElementById('sets-modal-swap-wrap');
    if (!wrap || !select) return;

    const item = store.activeLog.items[exIdx];
    if (!item || item.isWarmupGroup || isStaticStretchingLogItem(item) || !isSteadyCardioLogItem(item)) {
        wrap.style.display = 'none';
        return;
    }

    if (swapWrap) swapWrap.style.display = 'none';
    wrap.style.display = 'block';
    if (search) search.value = '';

    window._cardioTypeOptions = getSteadyCardioTypeOptions();
    renderCardioTypeSelectOptions(item.exercise);
}

function renderCardioTypeSelectOptions(currentEx, filterText = '') {
    const select = document.getElementById('sets-modal-cardio-type-select');
    if (!select) return;
    const q = String(filterText || '').trim().toLowerCase();
    const options = (window._cardioTypeOptions || []).filter(e =>
        !q || String(e.name || '').toLowerCase().includes(q)
    );

    const currentId = currentEx?.id != null ? String(currentEx.id) : '';
    const currentName = currentEx?.name || 'Steady State Cardio';

    if (!options.length) {
        select.innerHTML = `<option value="">No types match</option>`;
        return;
    }

    select.innerHTML = options.map(e => {
        const selected = (currentId && String(e.id) === currentId) || e.name === currentName ? ' selected' : '';
        return `<option value="${e.id}"${selected}>${e.name}</option>`;
    }).join('');
}

export function filterCardioTypeList() {
    const search = document.getElementById('sets-modal-cardio-search');
    const exIdx = window.currentModalExIdx;
    const item = store.activeLog.items?.[exIdx];
    renderCardioTypeSelectOptions(item?.exercise, search?.value || '');
}

export function selectCardioTypeInLog(newId) {
    if (!newId || window.currentModalExIdx === null || window.currentModalExIdx === undefined) return;
    const exIdx = window.currentModalExIdx;
    let newEx = store.globalExerciseDB.find(e => String(e.id) === String(newId));
    if (!newEx) {
        newEx = (window._cardioTypeOptions || []).find(e => String(e.id) === String(newId));
    }
    if (!newEx) return;

    const oldSets = store.activeLog.items[exIdx].sets || [];
    store.activeLog.items[exIdx].exercise = { ...newEx, domain: 'cardio' };
    // Keep distance / duration; clear completion so values can be confirmed
    store.activeLog.items[exIdx].sets = oldSets.map(s => ({
        ...s,
        completed: false,
        locked: false,
        isText: false,
        weight: 0,
        reps: 0,
        distance_km: s.distance_km || 0,
        time_minutes: s.time_minutes || 0,
        rpe: ''
    }));
    document.getElementById('sets-modal-title').innerText = newEx.name;
    renderExerciseSets();
    populateCardioTypePicker(exIdx);
    drawModalExerciseChart(newEx.name, false);
    if (navigator.vibrate) navigator.vibrate(40);
}

export function swapExerciseInLog(newId) {
    if (!newId || window.currentModalExIdx === null || window.currentModalExIdx === undefined) return;
    const exIdx = window.currentModalExIdx;
    const newEx = store.globalExerciseDB.find(e => e.id == newId);
    if (!newEx) return;

    const oldSets = store.activeLog.items[exIdx].sets;
    store.activeLog.items[exIdx].exercise = newEx;
    store.activeLog.items[exIdx].sets = oldSets.map(s => ({ ...s, completed: false, locked: false }));
    document.getElementById('sets-modal-title').innerText = newEx.name;
    renderExerciseSets();
    drawModalExerciseChart(newEx.name, false);
    populateSwapDropdown(exIdx);
    populateCardioTypePicker(exIdx);
    if (navigator.vibrate) navigator.vibrate(40);
}


export function renderExerciseSets() {
    if (window.currentModalExIdx === null || window.currentModalExIdx === undefined) return;
    let exIdx = window.currentModalExIdx;
    let item = store.activeLog.items[exIdx];
    
    // Warmup group: top-level parts only; children expand on part tap
    if (item.isWarmupGroup) {
        let html = `<div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:16px;">
            <div style="font-size:11px; color:var(--text-muted); font-family:'Roboto Mono';">Complete each warmup block, then confirm.</div>
            ${item.isCustomWarmup ? '' : `<button type="button" onclick="dismissPlannedWarmupFromLog(${exIdx})" style="background:none; border:none; color:var(--text-stealth); font-size:22px; cursor:pointer; line-height:1;" aria-label="Dismiss warmup">&times;</button>`}
        </div>`;
        item.sets.forEach((set, setIdx) => {
            const kids = Array.isArray(set.children) ? set.children : null;
            const expanded = !!set._uiExpanded;
            const hasKids = !!(kids && kids.length);
            const chevron = hasKids ? (expanded ? '−' : '+') : '';
            html += `<div style="display:flex; flex-direction:column; margin-bottom:14px; border-bottom: 1px solid var(--border-subtle); padding-bottom: 12px;">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
                    <button type="button" ${hasKids ? `onclick="togglePrepPartExpand(${exIdx}, ${setIdx})"` : ''}
                        style="flex:1; min-width:0; text-align:left; background:none; border:none; padding:0; cursor:${hasKids ? 'pointer' : 'default'}; color:inherit;">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <div style="font-size:13px; font-weight:800; color:var(--text-main);">${set.partName || ('Part ' + (setIdx+1))}</div>
                            ${chevron ? `<span style="font-family:'Roboto Mono'; font-size:14px; color:var(--gold-accent);">${chevron}</span>` : ''}
                        </div>
                        <div style="font-size:11px; color:var(--gold-accent); font-family:'Roboto Mono'; margin-top:4px;">${set.reps || ''}</div>
                    </button>
                    <div class="check-btn ${set.completed ? 'completed' : ''}" style="flex-shrink:0;" onclick="event.stopPropagation(); toggleSetComplete(${exIdx}, ${setIdx})">${set.completed ? '✓' : ''}</div>
                </div>`;
            if (hasKids && expanded) {
                html += `<div style="margin-top:10px; display:flex; flex-direction:column; gap:6px;">`;
                if (set.notes) {
                    html += `<div style="font-size:10px; color:var(--text-muted); margin-bottom:2px; line-height:1.4;">${set.notes}</div>`;
                }
                kids.forEach((child, cIdx) => {
                    const safe = String(child.name || '').replace(/</g, '&lt;');
                    const childOpen = !!child._uiExpanded;
                    html += `<button type="button" style="width:100%; text-align:left; cursor:pointer; background:transparent; border:1px solid var(--border-subtle); border-radius:8px; padding:10px; color:inherit;" onclick="togglePrepChildExpand(${exIdx}, ${setIdx}, ${cIdx})">
                        <div style="display:flex; justify-content:space-between; gap:8px;"><span style="font-size:12px; font-weight:600;">${safe}</span><span style="font-size:10px; color:var(--text-stealth); font-family:'Roboto Mono';">${childOpen ? '−' : '+'} Video</span></div>
                    </button>`;
                    if (childOpen) {
                        html += `<div style="border:1px dashed var(--border-highlight); border-radius:8px; min-height:72px; display:flex; align-items:center; justify-content:center; color:var(--text-stealth); font-size:10px; font-family:'Roboto Mono';">Teaching point video placeholder</div>`;
                    }
                });
                html += `</div>`;
            }
            html += `</div>`;
        });
        document.getElementById('sets-modal-content').innerHTML = html;
        return;
    }

    // Lactate/HIT: duration only (no weight / RIR / drop / superset)
    if (isLactateHitLogItem(item) && !item.isWarmupGroup) {
        const isHitClass = /hit\s*class/i.test(item.exercise?.name || '');
        if (isHitClass || (item.sets || []).every(s => s.isText)) {
            const set = item.sets[0] || { completed: false, reps: '~20–45 min' };
            const html = `
                <div style="font-size:11px; color:var(--text-muted); margin-bottom:16px; line-height:1.45;">HIT class — no intervals to log here. Session RPE is collected in the diary.</div>
                <div style="display:flex; justify-content:space-between; align-items:center; gap:16px; padding:18px 16px; border:1px solid var(--border-subtle); border-radius:12px; background:var(--bg-surface-elevated);">
                    <div style="min-width:0; flex:1;">
                        <div style="font-size:10px; color:var(--text-muted); font-family:'Roboto Mono'; letter-spacing:0.4px; text-transform:uppercase; margin-bottom:6px;">Session</div>
                        <div style="font-size:22px; font-weight:800; color:var(--gold-accent); font-family:'Roboto Mono';">${set.reps || 'Diary RPE only'}</div>
                        ${item.note ? `<div style="font-size:11px; color:var(--text-silver); margin-top:8px; line-height:1.4;">${item.note}</div>` : ''}
                    </div>
                    <div style="flex-shrink:0; text-align:center;">
                        <div style="font-size:9px; color:var(--text-muted); font-family:'Roboto Mono'; margin-bottom:8px; text-transform:uppercase;">Log</div>
                        <div class="check-btn ${set.completed ? 'completed' : ''}" id="btn-check-${exIdx}-0" style="width:48px; height:48px; font-size:18px;" onclick="toggleSetComplete(${exIdx}, 0)">${set.completed ? '✓' : ''}</div>
                    </div>
                </div>`;
            document.getElementById('sets-modal-content').innerHTML = html;
            return;
        }

        let html = `<div style="font-size:11px; color:var(--text-muted); margin-bottom:14px; line-height:1.45;">Hit each interval’s <strong style="color:var(--text-main);">target intensity</strong> for the work time. Rest starts automatically.</div>`;
        html += `<div class="set-header" style="margin-top:8px;"><div style="width:25px;">SET</div><div style="flex:1;text-align:center;">WORK</div><div style="flex:1;text-align:center; color:var(--text-muted);">REST</div><div style="width:48px;"></div></div>`;
        item.sets.forEach((set, setIdx) => {
            const dur = set.duration_sec != null ? set.duration_sec : (parseInt(set.reps, 10) || 30);
            const restLabel = set.restTime > 0 ? formatDurationSecLabel(set.restTime) : '—';
            const rowMeta = (item.lactateRows && item.lactateRows[setIdx]) || null;
            const target = set.targetDisplay || rowMeta?.targetDisplay || '';
            let lockOutClass = set.locked ? 'locked disabled' : '';
            let btnText = set.lockTimeLeft ? set.lockTimeLeft + 's' : '✓';
            let overridesHtml = '';
            if (set.locked) {
                overridesHtml = `<div style="display:flex; gap:6px; margin-top:8px; justify-content:flex-end;">
                    <button onclick="overrideRest(${exIdx}, ${setIdx}, 30)" style="background:var(--bg-surface-elevated); border:1px solid var(--border-subtle); color:var(--text-silver); font-size:9px; padding:4px 8px; border-radius:4px; font-family:'Roboto Mono'; cursor:pointer;">+30s</button>
                    <button onclick="overrideRest(${exIdx}, ${setIdx}, -999)" style="background:rgba(255, 59, 48, 0.1); border:1px solid #FF3B30; color:#FF3B30; font-size:9px; padding:4px 8px; border-radius:4px; font-family:'Roboto Mono'; cursor:pointer;">SKIP</button>
                </div>`;
            }
            html += `<div style="display:flex; flex-direction:column; margin-bottom:14px; border-bottom: 1px solid var(--border-subtle); padding-bottom: 10px;">
                <div class="set-row" style="margin-bottom:0;">
                    <div class="set-num">${setIdx + 1}</div>
                    <div class="set-input-group">
                        <input type="number" step="5" min="20" class="set-input" style="flex:1;" value="${dur}" onchange="updateWorkoutSet(${exIdx}, ${setIdx}, 'duration_sec', this.value)">
                        <div style="flex:1; text-align:center; color:var(--text-muted); font-size:12px; font-weight:700; align-self:center; font-family:'Roboto Mono';">${restLabel}</div>
                    </div>
                    <div class="set-check"><div class="check-btn ${set.completed ? 'completed' : ''} ${lockOutClass}" id="btn-check-${exIdx}-${setIdx}" onclick="toggleSetComplete(${exIdx}, ${setIdx})">${btnText}</div></div>
                </div>
                ${target ? `<div style="font-size:12px; color:var(--gold-accent); margin-top:6px; font-family:'Roboto Mono'; font-weight:700;">Target · ${target}</div>` : ''}
                ${overridesHtml}
                ${set.notes ? `<div style="font-size:9px; color:var(--text-muted); margin-top:4px; font-family:'Roboto Mono';">${set.notes}</div>` : ''}
            </div>`;
        });
        document.getElementById('sets-modal-content').innerHTML = html;
        return;
    }

    // Stretching: list stretch names; tap a name to reveal its video/teaching point
    if (isStaticStretchingLogItem(item)) {
        const parts = (item.sets || []).filter(s => s && (s.partName || s.isText));
        const useAccordion = item.isStretchGroup || parts.length > 1;
        if (!useAccordion) {
            const set = item.sets[0] || { completed: false, reps: 'Log when done' };
            const html = `
                <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:16px;">
                    <div style="font-size:11px; color:var(--text-muted); line-height:1.45;">Cool-down block. Mark when finished.</div>
                    ${item.isCustomStretch ? '' : `<button type="button" onclick="dismissPlannedStretchFromLog(${exIdx})" style="background:none; border:none; color:var(--text-stealth); font-size:22px; cursor:pointer; line-height:1;" aria-label="Dismiss stretching">&times;</button>`}
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; gap:16px; padding:18px 16px; border:1px solid var(--border-subtle); border-radius:12px; background:var(--bg-surface-elevated);">
                    <div style="min-width:0; flex:1;">
                        <div style="font-size:10px; color:var(--text-muted); font-family:'Roboto Mono'; letter-spacing:0.4px; text-transform:uppercase; margin-bottom:6px;">Stretching</div>
                        <div style="font-size:16px; font-weight:800; color:var(--text-main);">${set.reps || 'Log when done'}</div>
                    </div>
                    <div style="flex-shrink:0; text-align:center;">
                        <div style="font-size:9px; color:var(--text-muted); font-family:'Roboto Mono'; margin-bottom:8px; text-transform:uppercase;">Log</div>
                        <div class="check-btn ${set.completed ? 'completed' : ''}" id="btn-check-${exIdx}-0" style="width:48px; height:48px; font-size:18px;" onclick="toggleSetComplete(${exIdx}, 0)">${set.completed ? '✓' : ''}</div>
                    </div>
                </div>`;
            document.getElementById('sets-modal-content').innerHTML = html;
            return;
        }

        let html = `<div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:16px;">
            <div style="font-size:11px; color:var(--text-muted); font-family:'Roboto Mono';">Tap a stretch for its teaching point. Check each when done.</div>
            ${item.isCustomStretch ? '' : `<button type="button" onclick="dismissPlannedStretchFromLog(${exIdx})" style="background:none; border:none; color:var(--text-stealth); font-size:22px; cursor:pointer; line-height:1;" aria-label="Dismiss stretching">&times;</button>`}
        </div>`;
        parts.forEach((set, setIdx) => {
            const expanded = !!set._uiExpanded;
            const label = set.partName || set.reps || `Stretch ${setIdx + 1}`;
            html += `<div style="display:flex; flex-direction:column; margin-bottom:12px; border-bottom:1px solid var(--border-subtle); padding-bottom:10px;">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
                    <button type="button" onclick="togglePrepPartExpand(${exIdx}, ${setIdx})"
                        style="flex:1; min-width:0; text-align:left; background:none; border:none; padding:0; cursor:pointer; color:inherit;">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <div style="font-size:13px; font-weight:800; color:var(--text-main);">${String(label).replace(/</g, '&lt;')}</div>
                            <span style="font-family:'Roboto Mono'; font-size:14px; color:var(--gold-accent);">${expanded ? '−' : '+'}</span>
                        </div>
                    </button>
                    <div class="check-btn ${set.completed ? 'completed' : ''}" style="flex-shrink:0;" onclick="event.stopPropagation(); toggleSetComplete(${exIdx}, ${setIdx})">${set.completed ? '✓' : ''}</div>
                </div>`;
            if (expanded) {
                html += `<div style="margin-top:10px; border:1px dashed var(--border-highlight); border-radius:8px; min-height:72px; display:flex; align-items:center; justify-content:center; color:var(--text-stealth); font-size:10px; font-family:'Roboto Mono';">Teaching point video placeholder</div>`;
            }
            html += `</div>`;
        });
        document.getElementById('sets-modal-content').innerHTML = html;
        return;
    }

    const isCardio = (item.exercise.domain || '').toLowerCase() === 'cardio';
    const isSteadyCardio = isSteadyCardioLogItem(item);
    const isBarbell = /barbell|squat|deadlift|bench press|military press|power clean/i.test(item.exercise.name);

    let html = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
            <button onclick="openVideoModal('${item.exercise.name}', 'https://www.youtube.com/embed/placeholder')" style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05); padding:6px 10px; border-radius:4px; color:var(--text-silver); font-size:10px; font-family:'Roboto Mono'; font-weight:bold; cursor:pointer; display:flex; align-items:center; gap:4px;">🎥 FORM VIDEO</button>
            ${isBarbell ? `<button onclick="document.getElementById('plate-calculator-modal').classList.remove('hidden')" style="background:var(--bg-surface-elevated); border:1px solid var(--border-subtle); color:var(--gold-accent); font-size:10px; padding:6px 10px; border-radius:4px; font-family:'Roboto Mono'; cursor:pointer; font-weight:bold;">[PLATES]</button>` : ''}
        </div>`;

    if (isSteadyCardio) {
        html += `<div style="font-size:11px; color:var(--text-muted); margin-bottom:12px; line-height:1.4;">Enter distance, then tap <strong style="color:var(--text-main);">Confirm &amp; Close</strong>. Duration is taken from the session timer at the top.</div>`;
        // Always a single session — keep only the first set if extras exist
        if (item.sets.length > 1) item.sets = [item.sets[0]];
        applyTimerDurationToSteadyItem(item);
        const set = item.sets[0] || { distance_km: 0, time_minutes: 0, completed: false };
        const setIdx = 0;
        const timerMins = getTimerDurationMinutes();
        const timerLabel = formatDurationMs(getWorkoutElapsedMs());

        let borderClass = 'prog-same';
        if (set.distance_km > (set.prevDist || 0)) borderClass = 'prog-up';
        else if (set.distance_km < (set.prevDist || 0) && (set.prevDist || 0) > 0) borderClass = 'prog-down';

        let lockOutClass = set.locked ? 'locked disabled' : '';
        let btnText = set.lockTimeLeft ? set.lockTimeLeft + 's' : '✓';
        let overridesHtml = '';
        if (set.locked) {
            overridesHtml = `<div style="display:flex; gap:6px; margin-top:8px; justify-content:flex-end;">
                <button onclick="overrideRest(${exIdx}, ${setIdx}, 30)" style="background:var(--bg-surface-elevated); border:1px solid var(--border-subtle); color:var(--text-silver); font-size:9px; padding:4px 8px; border-radius:4px; font-family:'Roboto Mono'; cursor:pointer;">+30s</button>
                <button onclick="overrideRest(${exIdx}, ${setIdx}, 60)" style="background:var(--bg-surface-elevated); border:1px solid var(--border-subtle); color:var(--text-silver); font-size:9px; padding:4px 8px; border-radius:4px; font-family:'Roboto Mono'; cursor:pointer;">+60s</button>
                <button onclick="overrideRest(${exIdx}, ${setIdx}, -999)" style="background:rgba(255, 59, 48, 0.1); border:1px solid #FF3B30; color:#FF3B30; font-size:9px; padding:4px 8px; border-radius:4px; font-family:'Roboto Mono'; cursor:pointer;">SKIP</button>
            </div>`;
        }

        const paceText = formatCardioPace(set.distance_km, timerMins);
        html += `<div style="display:flex; flex-direction:column; margin-bottom:8px; gap:10px;">
            <div style="display:flex; justify-content:flex-end; align-items:center;">
                <div style="text-align:center;">
                    <div style="font-size:9px; color:var(--text-muted); font-family:'Roboto Mono'; margin-bottom:8px; text-transform:uppercase;">Log</div>
                    <div class="check-btn ${set.completed ? 'completed' : ''} ${lockOutClass}" id="btn-check-${exIdx}-${setIdx}" onclick="toggleSetComplete(${exIdx}, ${setIdx})">${btnText}</div>
                </div>
            </div>
            <div>
                <label style="margin-top:0; font-size:10px;">Distance (km)</label>
                <input type="number" step="0.1" min="0" class="input-field set-input ${borderClass}" style="margin-bottom:0;" inputmode="decimal" value="${set.distance_km || 0}" onchange="updateWorkoutSet(${exIdx}, ${setIdx}, 'distance_km', this.value)" oninput="updateWorkoutSet(${exIdx}, ${setIdx}, 'distance_km', this.value)">
            </div>
            <div>
                <label style="margin-top:0; font-size:10px;">Duration <span style="color:var(--text-stealth); font-weight:500;">(from session timer)</span></label>
                <div id="cardio-timer-duration-${exIdx}-${setIdx}" style="padding:14px 16px; border-radius:10px; border:1px solid var(--border-subtle); background:var(--bg-surface-elevated); font-family:'Roboto Mono'; font-size:13px; font-weight:700; color:var(--gold-accent);">${timerLabel}${timerMins > 0 ? ` · ${timerMins} min` : ''}</div>
            </div>
            <div>
                <label style="margin-top:0; font-size:10px;">Pace <span style="color:var(--text-stealth); font-weight:500;">(distance ÷ timer)</span></label>
                <div id="cardio-pace-${exIdx}-${setIdx}" style="padding:14px 16px; border-radius:10px; border:1px solid var(--border-subtle); background:var(--bg-surface-elevated); font-family:'Roboto Mono'; font-size:13px; font-weight:700; color:var(--gold-accent);">${paceText}</div>
            </div>
            ${overridesHtml}
        </div>`;
        document.getElementById('sets-modal-content').innerHTML = html;
        return;
    }

    html += `<div class="set-header" style="margin-top:20px;"><div style="width:25px;">SET</div><div style="flex:1;text-align:center;">${isCardio ? 'KM' : 'KG'}</div><div style="flex:1;text-align:center;">${isCardio ? 'MINS' : 'REPS'}</div><div style="flex:1;text-align:center; color:var(--text-muted);">RIR</div><div style="width:48px;"></div></div>`;
    
    item.sets.forEach((set, setIdx) => {
        let borderClass = 'prog-same';
        if (isCardio) {
            if (set.distance_km > (set.prevDist || 0)) borderClass = 'prog-up';
            else if (set.distance_km < (set.prevDist || 0) && (set.prevDist || 0) > 0) borderClass = 'prog-down';
        } else {
            if (set.weight > (set.prevWeight || 0)) borderClass = 'prog-up';
            else if (set.weight < (set.prevWeight || 0) && (set.prevWeight || 0) > 0) borderClass = 'prog-down';
        }

        let plateMath = (!isCardio && isBarbell && set.weight > 20) ? `<div style="width:100%; text-align:center; font-size:10px; color:var(--text-silver); margin-top:6px; font-family:'Roboto Mono', monospace; font-weight: bold; letter-spacing: 0.5px;">└ LOAD: [ ${calculatePlates(set.weight)} ] PER SIDE</div>` : '';

        let inputGroupHtml = '';
        if (set.isText) {
            inputGroupHtml = `<div style="flex:1; text-align:center; color:var(--gold-accent); font-size:12px; font-weight:bold; align-self:center;">${set.reps}</div>`;
        } else {
            inputGroupHtml = `
                <input type="number" step="0.1" class="set-input ${borderClass}" value="${isCardio ? (set.distance_km||0) : (set.weight||0)}" onchange="updateWorkoutSet(${exIdx}, ${setIdx}, '${isCardio?'distance_km':'weight'}', this.value)">
                <input type="number" class="set-input" value="${isCardio ? (set.time_minutes||0) : (set.reps||0)}" onchange="updateWorkoutSet(${exIdx}, ${setIdx}, '${isCardio?'time_minutes':'reps'}', this.value)">
                <input type="number" class="set-input" style="color:var(--text-muted);" placeholder="0-5" value="${set.rpe||''}" onchange="updateWorkoutSet(${exIdx}, ${setIdx}, 'rpe', this.value)">
            `;
        }

        let lockOutClass = set.locked ? 'locked disabled' : '';
        let btnText = set.lockTimeLeft ? set.lockTimeLeft + 's' : '✓';

        let overridesHtml = '';
        if (set.locked) {
            overridesHtml = `<div style="display:flex; gap:6px; margin-top:8px; justify-content:flex-end;">
                <button onclick="overrideRest(${exIdx}, ${setIdx}, 30)" style="background:var(--bg-surface-elevated); border:1px solid var(--border-subtle); color:var(--text-silver); font-size:9px; padding:4px 8px; border-radius:4px; font-family:'Roboto Mono'; cursor:pointer;">+30s</button>
                <button onclick="overrideRest(${exIdx}, ${setIdx}, 60)" style="background:var(--bg-surface-elevated); border:1px solid var(--border-subtle); color:var(--text-silver); font-size:9px; padding:4px 8px; border-radius:4px; font-family:'Roboto Mono'; cursor:pointer;">+60s</button>
                <button onclick="overrideRest(${exIdx}, ${setIdx}, -999)" style="background:rgba(255, 59, 48, 0.1); border:1px solid #FF3B30; color:#FF3B30; font-size:9px; padding:4px 8px; border-radius:4px; font-family:'Roboto Mono'; cursor:pointer;">SKIP</button>
            </div>`;
        }

        let workNum = 0;
        let setLabel;
        if (item.isSuperset) {
            const side = set.side || '?';
            const sideName = (item.sides || []).find(s => s.key === side)?.exercise?.name || side;
            if (set.isWarmup) {
                let wuNum = 0;
                for (let j = 0; j <= setIdx; j++) {
                    const s = item.sets[j];
                    if (s && s.side === side && s.isWarmup) wuNum++;
                }
                setLabel = `${side}·WU${wuNum}`;
            } else if (set.isDropSet) {
                setLabel = `${side}·DS`;
            } else {
                const round = set.round || (() => {
                    let n = 0;
                    for (let j = 0; j <= setIdx; j++) {
                        const s = item.sets[j];
                        if (s && s.side === side && !s.isWarmup && !s.isDropSet) n++;
                    }
                    return n;
                })();
                setLabel = `${round}${side}`;
            }
            if (!set.isWarmup) set._sideCaption = sideName;
        } else {
            setLabel = set.isWarmup
                ? 'WU'
                : (set.isDropSet ? 'DS' : String((() => {
                    let n = 0;
                    for (let j = 0; j <= setIdx; j++) {
                        const s = item.sets[j];
                        if (s && !s.isWarmup && !s.isDropSet) n++;
                    }
                    workNum = n;
                    return n;
                })()));
        }
        const sideCaption = item.isSuperset && set._sideCaption
            ? `<div style="font-size:8px; color:var(--text-stealth); font-family:'Roboto Mono'; margin-top:2px; max-width:48px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${set._sideCaption}</div>`
            : '';
        html += `<div style="display:flex; flex-direction:column; margin-bottom:14px; border-bottom: 1px solid var(--border-subtle); padding-bottom: 10px;">
            <div class="set-row" style="margin-bottom:0;">
                <div class="set-num" style="${set.isWarmup || set.isDropSet || item.isSuperset ? 'font-size:9px; color:var(--text-muted);' : ''}">${setLabel}${sideCaption}</div>
                <div class="set-input-group">${inputGroupHtml}</div>
                <div class="set-check"><div class="check-btn ${set.completed ? 'completed' : ''} ${lockOutClass}" id="btn-check-${exIdx}-${setIdx}" onclick="toggleSetComplete(${exIdx}, ${setIdx})">${btnText}</div></div>
            </div>
            ${overridesHtml}
            ${plateMath}
            ${set.notes && (set.isWarmup || set.isDropSet) ? `<div style="font-size:9px; color:var(--text-muted); margin-top:4px; font-family:'Roboto Mono';">${set.notes}</div>` : ''}
        </div>`;
    });
    const hypFixed = isHypertrophyPhase();
    const nameA = item.sides?.[0]?.exercise?.name || 'A';
    const nameB = item.sides?.[1]?.exercise?.name || 'B';
    if (item.isSuperset) {
        html += `<div style="display:flex; flex-direction:column; gap:8px; margin-top:8px;">
            <div style="font-size:10px; color:var(--text-muted); font-family:'Roboto Mono'; text-align:center; line-height:1.4;">A · ${nameA}<br>B · ${nameB}<br>Rest after B only · 100s +10s per 0 RIR</div>
            <button type="button" onclick="addDropSetToSupersetSide(${exIdx}, 'A')" style="width:100%; background:var(--bg-surface-elevated); color:var(--text-silver); border:1px dashed var(--border-subtle); padding:10px; border-radius:8px; cursor:pointer; font-size:11px; font-weight:bold;">+ DROP SET · A</button>
            <button type="button" onclick="addDropSetToSupersetSide(${exIdx}, 'B')" style="width:100%; background:var(--bg-surface-elevated); color:var(--text-silver); border:1px dashed var(--border-subtle); padding:10px; border-radius:8px; cursor:pointer; font-size:11px; font-weight:bold;">+ DROP SET · B</button>
            <button type="button" onclick="addSupersetRound(${exIdx})" style="width:100%; background:var(--bg-surface-elevated); color:var(--gold-accent); border:1px dashed var(--border-highlight); padding:12px; border-radius:8px; cursor:pointer; font-size:12px; font-weight:bold;">+ ADD ROUND (A+B)</button>
        </div>`;
    } else {
        html += `<div style="display:flex; flex-direction:column; gap:8px; margin-top:8px;">
            ${hypFixed ? `<div style="font-size:10px; color:var(--text-muted); font-family:'Roboto Mono'; text-align:center;">Hypertrophy · 3 working sets prescribed</div>` : ''}
            <button type="button" onclick="addDropSetToExercise(${exIdx})" style="width:100%; background:var(--bg-surface-elevated); color:var(--text-silver); border:1px dashed var(--border-subtle); padding:10px; border-radius:8px; cursor:pointer; font-size:11px; font-weight:bold;">+ DROP SET (80%)</button>
            <button type="button" onclick="addSetToExercise(${exIdx})" style="width:100%; background:var(--bg-surface-elevated); color:var(--gold-accent); border:1px dashed var(--border-highlight); padding:12px; border-radius:8px; cursor:pointer; font-size:12px; font-weight:bold;">+ ADD SET</button>
        </div>`;
    }
    
    document.getElementById('sets-modal-content').innerHTML = html;
};

export function updateWorkoutSet(exIdx, setIdx, field, val) { 
    // Steady duration is timer-owned — ignore manual edits
    if (field === 'time_minutes' && isSteadyCardioLogItem(store.activeLog.items[exIdx])) {
        applyTimerDurationToSteadyItem(store.activeLog.items[exIdx]);
        updateCardioPaceReadout(exIdx, setIdx);
        if (window._workoutSessionConfirmed) saveWorkoutDraft({ elapsedMs: getWorkoutElapsedMs() });
        return;
    }
    let num = parseFloat(val) || 0;
    if (field === 'duration_sec') {
        // Lactate intervals: multiples of 5s, minimum 20s
        num = Math.max(20, Math.round(num / 5) * 5);
    }
    const item = store.activeLog.items[exIdx];
    const setObj = item.sets[setIdx];
    setObj[field] = num;
    if (field === 'weight' && setObj && !setObj.isWarmup && !setObj.isText) {
        if (item.isSuperset && setObj.side) {
            (item.sets || []).forEach(s => {
                if (s && s.side === setObj.side && !s.isWarmup && !s.isText && !s.isDropSet) s.weight = num;
            });
            // Rebuild that side's warmups if none completed yet
            const sideWarmDone = (item.sets || []).some(s => s.side === setObj.side && s.isWarmup && s.completed);
            if (!sideWarmDone) {
                const sideMeta = (item.sides || []).find(s => s.key === setObj.side);
                const exName = sideMeta?.exercise?.name || '';
                const reps = Number((item.sets || []).find(s => s.side === setObj.side && !s.isWarmup)?.reps) || 10;
                const isIso = !!sideMeta?.isIsolation;
                const newWu = buildHypertrophyWarmupSets(exName, num, reps, isIso).map(s => ({
                    ...s, side: setObj.side, completed: false, locked: false
                }));
                const withoutOldWu = (item.sets || []).filter(s => !(s.side === setObj.side && s.isWarmup));
                const otherWu = withoutOldWu.filter(s => s.isWarmup);
                const work = withoutOldWu.filter(s => !s.isWarmup);
                // Keep order: A warmups, B warmups, then work
                const aWu = setObj.side === 'A' ? newWu : otherWu.filter(s => s.side === 'A');
                const bWu = setObj.side === 'B' ? newWu : otherWu.filter(s => s.side === 'B');
                item.sets = [...aWu, ...bWu, ...work];
                item.exercise = {
                    ...item.exercise,
                    name: supersetTitleFromItem(item)
                };
                if (window.currentModalExIdx != null) renderExerciseSets();
            }
        } else {
            (item.sets || []).forEach(s => {
                if (s && !s.isWarmup && !s.isText && !s.isLactateHit && !s.isDropSet) s.weight = num;
            });
            if (maybeRebuildLiftWarmups(item, num) && window.currentModalExIdx != null) {
                renderExerciseSets();
            }
        }
    }
    if (field === 'reps' && setObj && !setObj.isWarmup && !setObj.isText) {
        const exName = item.isSuperset
            ? ((item.sides || []).find(s => s.key === setObj.side)?.exercise?.name)
            : item.exercise?.name;
        if (maybeRetirePressUpsFromSet(exName, num)) {
            try { window.alert('Press-ups retired: logged >12 reps. Bench variants will be used going forward.'); } catch (e) { /* ignore */ }
        }
    }
    if (field === 'distance_km' || field === 'time_minutes') {
        if (field === 'distance_km' && isSteadyCardioLogItem(item)) {
            applyTimerDurationToSteadyItem(item);
        }
        updateCardioPaceReadout(exIdx, setIdx);
    }
    if (field === 'duration_sec' && window.currentModalExIdx != null) renderExerciseSets();
    if (window._workoutSessionConfirmed) saveWorkoutDraft({ elapsedMs: getWorkoutElapsedMs() });
    calculateLiveFitnessScores();
}

/** Short multi-tone alarm when a rest timer finishes (plays 3 times, louder) */
export function playRestAlarm() {
    try { notifyRestTimerDone(); } catch (e) { /* ignore */ }
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        if (!window._ascensusAudioCtx) window._ascensusAudioCtx = new AudioCtx();
        const ctx = window._ascensusAudioCtx;
        if (ctx.state === 'suspended') ctx.resume();

        const pattern = [
            { freq: 880, offset: 0, dur: 0.16 },
            { freq: 1174.7, offset: 0.18, dur: 0.16 },
            { freq: 1318.5, offset: 0.36, dur: 0.22 }
        ];
        const cycleLen = 0.75; // gap between repeats
        const repeats = 3;
        const peak = 0.55; // louder than before (~0.22)
        const now = ctx.currentTime;

        for (let r = 0; r < repeats; r++) {
            const base = now + r * cycleLen;
            pattern.forEach(t => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'square'; // more piercing / audible on phone speakers
                osc.frequency.value = t.freq;
                const start = base + t.offset;
                gain.gain.setValueAtTime(0.0001, start);
                gain.gain.exponentialRampToValueAtTime(peak, start + 0.015);
                gain.gain.exponentialRampToValueAtTime(0.0001, start + t.dur);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(start);
                osc.stop(start + t.dur + 0.02);
            });
        }
    } catch (e) {
        console.warn("Rest alarm unavailable:", e);
    }
}

export function toggleSetComplete(exIdx, setIdx) { 
    let setObj = store.activeLog.items[exIdx].sets[setIdx];
    if (setObj.locked) return; 
    
    setObj.completed = !setObj.completed; 
    if (setObj.completed && navigator.vibrate) navigator.vibrate([50]); 
    
    const item = store.activeLog.items[exIdx];
    if (setObj.completed && !setObj.isWarmup && !setObj.isText) {
        const retireName = item.isSuperset
            ? ((item.sides || []).find(s => s.key === setObj.side)?.exercise?.name)
            : item.exercise?.name;
        if (maybeRetirePressUpsFromSet(retireName, setObj.reps)) {
            try { window.alert('Press-ups retired: logged >12 reps. Bench variants will be used going forward.'); } catch (e) { /* ignore */ }
        }
    }
    const isLactate = isLactateHitLogItem(item);
    // Skip rest timers for text/warmup blocks and steady cardio (no RIR-based rests)
    // Lactate intervals always start their protocol rest after a logged set
    const isWarmupOrText = item.isWarmupGroup || (setObj.isText && !isLactate);
    const skipRest = !isLactate && (isWarmupOrText || isSteadyCardioLogItem(item));

    if (setObj.completed && isLactate && setObj.restTime > 0) {
        // Prefer next set in this exercise; else first set of next lactate exercise
        if (item.sets[setIdx + 1]) {
            startRestOnSet(exIdx, setIdx + 1, setObj.restTime);
        } else {
            for (let j = exIdx + 1; j < store.activeLog.items.length; j++) {
                const nxt = store.activeLog.items[j];
                if (!isLactateHitLogItem(nxt) || nxt.isWarmupGroup) continue;
                if (isStaticStretchingLogItem(nxt)) break;
                if ((nxt.sets || []).length) {
                    startRestOnSet(j, 0, setObj.restTime);
                    break;
                }
            }
        }
    } else if (setObj.completed && !skipRest && item.isSuperset) {
        if (setObj.isWarmup) {
            const wuRest = Number(setObj.restTime) || 0;
            if (item.sets[setIdx + 1] && wuRest > 0) startRestOnSet(exIdx, setIdx + 1, wuRest);
        } else if (setObj.side === 'A') {
            // No rest between A and B — unlock the partner set immediately
            const next = item.sets[setIdx + 1];
            if (next) {
                next.locked = false;
                delete next.lockTimeLeft;
                try { clearInterval(store.restIntervals[`${exIdx}-${setIdx + 1}`]); } catch (e) { /* ignore */ }
            }
        } else if (setObj.side === 'B') {
            let partnerA = null;
            if (!setObj.isDropSet && setObj.round) {
                partnerA = (item.sets || []).find(s =>
                    s.side === 'A' && !s.isWarmup && !s.isDropSet && s.round === setObj.round
                );
            }
            const restSec = setObj.isDropSet
                ? (100 + (parseFloat(setObj.rpe) === 0 ? 10 : 0))
                : supersetRestAfterB(partnerA, setObj);
            if (item.sets[setIdx + 1] && restSec > 0) {
                startRestOnSet(exIdx, setIdx + 1, restSec);
            }
        }
    } else if (setObj.completed && !skipRest && item.sets[setIdx + 1]) {
        let nextSet = item.sets[setIdx + 1];
        
        let baseRest = setObj.restTime || 120; 
        let loggedRIR = parseFloat(setObj.rpe);
        if (!Number.isFinite(loggedRIR)) loggedRIR = 0;

        if (isHypertrophyPhase() || setObj.restTime === 90) {
            // Hypertrophy: 90s base, +10s only at true 0 RIR
            baseRest = hypertrophyRestSeconds(loggedRIR);
        } else {
            if (loggedRIR <= 1 && baseRest > 0) baseRest += 60;
            else if (loggedRIR >= 4 && baseRest > 60) baseRest -= 30;
        } 
        
        startRestOnSet(exIdx, setIdx + 1, baseRest);
    } else if (!setObj.completed) {
        if (item.sets[setIdx + 1]) {
            item.sets[setIdx + 1].locked = false;
            clearInterval(store.restIntervals[`${exIdx}-${setIdx+1}`]);
        }
        // Clear cross-exercise lactate rest if unchecking
        if (isLactate) {
            for (let j = exIdx + 1; j < store.activeLog.items.length; j++) {
                const nxt = store.activeLog.items[j];
                if (!isLactateHitLogItem(nxt)) break;
                (nxt.sets || []).forEach((s, si) => {
                    if (s.locked) {
                        s.locked = false;
                        clearInterval(store.restIntervals[`${j}-${si}`]);
                    }
                });
                break;
            }
        }
    }
    
    if (window.currentModalExIdx !== null && window.currentModalExIdx !== undefined) renderExerciseSets();
    else renderActiveLog(); 

    if (window._workoutSessionConfirmed) saveWorkoutDraft({ elapsedMs: getWorkoutElapsedMs() });
    
    calculateLiveFitnessScores();
}

export function overrideRest(exIdx, setIdx, seconds) {
    let setObj = store.activeLog.items[exIdx].sets[setIdx];
    if (!setObj.locked) return;
    
    if (seconds === -999) setObj.lockTimeLeft = 0; 
    else setObj.lockTimeLeft += seconds;
    
    if (setObj.lockTimeLeft <= 0) {
        clearInterval(store.restIntervals[`${exIdx}-${setIdx}`]);
        setObj.locked = false;
        playRestAlarm();
        if(navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200]);
    }
    
    if (window.currentModalExIdx !== null && window.currentModalExIdx !== undefined) renderExerciseSets();
    else renderActiveLog();
    // Keep lactate rest slot on the plan cards in sync
    if (isLactateHitLogItem(store.activeLog.items?.[exIdx])) renderWorkoutLog();
}

// ==========================================
// 9. UI MENUS & SUBMITTING THE ROUTE
// ==========================================
export function toggleConstraint(type) {
    const btn = document.getElementById(`btn-${type}`);
    const checkbox = document.getElementById(`toggle-${type==='zero-prep'?'zero-prep':'budget-saver'}`);
    checkbox.checked = !checkbox.checked;
    if(checkbox.checked) btn.classList.add('active'); else btn.classList.remove('active');
    loadGhostTemplate();
}

export function showConstraintInfo(type) {
    const tip = document.getElementById('fuel-toggle-tip');
    if (!tip) return;
    const key = type === 'budget' ? 'budget' : 'zero-prep';
    const already = tip.dataset.active === key && !tip.classList.contains('hidden');
    if (already) {
        tip.classList.add('hidden');
        tip.dataset.active = '';
        return;
    }
    if (key === 'zero-prep') {
        tip.innerHTML = `<strong style="color:var(--gold-accent);">⚡ Avoid Prep</strong><br>Switches meal suggestions to no-cook staples (e.g. whey / soy, rice) and skips vegetables that need chopping or cooking.`;
    } else {
        tip.innerHTML = `<strong style="color:var(--gold-accent);">£ Budget Saver</strong><br>Chooses the cheapest protein options that still hit your macros for this meal.`;
    }
    tip.dataset.active = key;
    tip.classList.remove('hidden');
}

function setManualAddBtnSymbol(open) {
    const btn = document.getElementById('btn-manual-add');
    if (!btn) return;
    btn.textContent = open ? '−' : '+';
    btn.title = open ? 'Close manual add' : 'Add manually';
    btn.setAttribute('aria-label', open ? 'Close manual add' : 'Add manually');
}

export function toggleToolsMenu() {
    const menu = document.getElementById('tools-menu');
    if (!menu) return;
    menu.classList.toggle('hidden');
    const opening = !menu.classList.contains('hidden');
    setManualAddBtnSymbol(opening);
    const foodSel = document.getElementById('select-food');
    const exSel = document.getElementById('select-exercise');
    if (!opening) {
        if (foodSel) foodSel.style.display = 'none';
        if (exSel) exSel.style.display = 'none';
        return;
    }
    refreshTemplateSelector();
    if (store.activeLog.type === 'workout') {
        try { updateExerciseDropdowns(); } catch (e) { /* ignore */ }
        if (foodSel) foodSel.style.display = 'none';
        if (exSel) exSel.style.display = 'block';
    } else if (['breakfast', 'lunch', 'dinner', 'snack'].includes(store.activeLog.type)) {
        if (foodSel) foodSel.style.display = 'block';
        if (exSel) exSel.style.display = 'none';
    } else {
        if (foodSel) foodSel.style.display = 'none';
        if (exSel) exSel.style.display = 'none';
    }
}

export function manualAdd() {
    if (store.activeLog.type === 'workout') addExerciseToActiveLog(); else addFoodToActiveLog();
    // Keep manual add open until the user closes it or leaves the zone
    const menu = document.getElementById('tools-menu');
    if (menu) menu.classList.remove('hidden');
    setManualAddBtnSymbol(true);
    const foodSel = document.getElementById('select-food');
    const exSel = document.getElementById('select-exercise');
    if (store.activeLog.type === 'workout') {
        if (foodSel) foodSel.style.display = 'none';
        if (exSel) exSel.style.display = 'block';
    } else {
        if (foodSel) foodSel.style.display = 'block';
        if (exSel) exSel.style.display = 'none';
    }
}

export function startManualWorkout(buttonElement = null) {
    window._pendingManualWorkoutBtn = buttonElement || null;
    if (typeof window.openWorkoutTypePicker === 'function') {
        window.openWorkoutTypePicker('manual');
    } else {
        beginManualWorkoutSession('Full Body / Strength');
    }
}

/** Called after Steady / Lactate / Gym is chosen for a manual session. */
export function beginManualWorkoutSession(kind, opts = {}) {
    const normalized = kind || window.manualSessionKind || 'Full Body / Strength';

    if (!opts.afterHitPicker && hasWorkoutDraft()) {
        const draft = loadWorkoutDraft();
        if (draftMatchesPlanEvent(normalized, draft) || !normalized) {
            return resumeInProgressWorkout();
        }
        if (!confirm('You already have a workout in progress. Stop it and start this one instead?')) {
            return;
        }
        discardInProgressWorkout();
    }

    window.manualSessionKind = normalized;
    window.editingSessionId = null;

    if (isLactateEvent(normalized) && !opts.afterHitPicker) {
        openLactateHitPicker(() => beginManualWorkoutSession(normalized, { afterHitPicker: true }));
        return;
    }

    // Steady / Lactate should use the same GPS template + log UI as a planned day
    const usePlanTemplate = isSteadyCardio(normalized) || isLactateEvent(normalized);
    window.manualWorkoutMode = !usePlanTemplate;

    const buttonElement = window._pendingManualWorkoutBtn;
    window._pendingManualWorkoutBtn = null;
    document.querySelectorAll('.exe-btn').forEach(btn => btn.classList.remove('active-glow'));
    if (buttonElement) buttonElement.classList.add('active-glow');

    const zone = document.getElementById('execution-zone');
    const fuelToggles = document.getElementById('fuel-toggles');
    document.getElementById('log-type-selector').value = 'workout';
    const focusEl = document.getElementById('today-focus');
    if (focusEl) focusEl.value = normalized;
    document.getElementById('current-route-title').innerText = prettyWorkoutTypeLabel(normalized).toUpperCase();
    if (fuelToggles) fuelToggles.style.display = 'none';
    document.body.classList.add('workout-focus-mode');
    window.journalMode = 'workout';

    switchLogType();
    loadGhostTemplate();
    document.getElementById('tools-menu')?.classList.add('hidden');
    const exSelect = document.getElementById('select-exercise');
    const foodSelect = document.getElementById('select-food');
    if (exSelect) exSelect.style.display = 'none';
    if (foodSelect) foodSelect.style.display = 'none';
    updateSaveTemplateButtonLabel();

    zone.classList.remove('hidden');
    setTimeout(() => zone.classList.add('show'), 10);
    window._loggedSessionDurationMs = 0;
    window._loggedSessionDurationLabel = '';
    window._lastSessionDurationMin = 0;
    resetWorkoutTimer();
    // Manual empty sessions have no Confirm step — start clock now.
    // GPS Steady/Lactate templates start the timer on Confirm workout.
    if (window.manualWorkoutMode) {
        startWorkoutTimer();
        window._workoutSessionConfirmed = true;
        saveWorkoutDraft({ elapsedMs: 0 });
    }
}

// Bridge for route.js (avoids circular import of beginManualWorkoutSession)
window._beginManualWorkoutSession = beginManualWorkoutSession;

export function resolveActiveSessionKind() {
    // Prefer the exact planned label (e.g. Hypertrophy / Push, Strength A) — do not
    // collapse to Full Body / Strength here; week-plan credits normalize separately.
    const fromManual = window.manualSessionKind || null;
    if (fromManual) return fromManual;
    const focus = document.getElementById('today-focus')?.value || '';
    const fromFocus = (focus && focus !== 'Rest' && focus !== 'Practice' && focus !== 'Game' && focus !== 'Match')
        ? focus
        : null;
    if (fromFocus) return fromFocus;
    const items = store.activeLog?.items || [];
    // Lactate/HIT before generic cardio — HIT modalities use domain "cardio"
    if (items.some(i => i.isLactateHit || (i.sets || []).some(s => s && s.isLactateHit)
        || /lactate|sprint|interval|30s\s*on|attack bike|skier|battle rope|hit\s*class/i.test(i.exercise?.name || ''))) {
        return 'Lactate';
    }
    if (items.some(i => ((i.exercise?.domain || '').toLowerCase() === 'cardio'))) return 'Cardio (Steady)';
    if (items.some(i => /auxiliar|prehab|band/i.test(i.exercise?.name || '') || isAuxEvent(i.exercise?.name))) return 'Auxiliary';
    if (items.some(i => isStrengthEvent(i.exercise?.name) || (i.exercise?.domain || '').toLowerCase() === 'strength')) {
        return 'Full Body / Strength';
    }
    // Any completed planned session should still land in Log
    if (items.length) return 'Full Body / Strength';
    return 'Full Body / Strength';
}

/**
 * On Complete Log, treat entered sets as done so Steady Cardio etc. still save
 * even if the user skipped the checkmark.
 */
/**
 * Lactate/HIT: include every protocol interval on Complete log (same idea as steady timer).
 * Other workouts still require explicit ✓ on each set.
 */
export function finalizeSetsBeforeCommit() {
    const focus = resolveActiveSessionKind() || document.getElementById('today-focus')?.value || '';
    const isLactate = isLactateEvent(focus) || focus === 'Lactate' || !!window._lactateHitSelection;
    if (!isLactate) return;
    (store.activeLog.items || []).forEach(item => {
        if (!isLactateHitLogItem(item)) return;
        (item.sets || []).forEach(set => {
            if (set.isText && !/hit\s*class/i.test(item.exercise?.name || '')) return;
            set.completed = true;
        });
    });
}

/** Rebuild an editable session from today's orphan workout_log rows (pre-session-snapshot logs). */
export function editOrphanWorkoutLogs(exerciseNamesCsv, logIdsCsv) {
    const names = String(exerciseNamesCsv || '').split('||').map(s => s.trim()).filter(Boolean);
    const logIds = String(logIdsCsv || '').split(',').map(s => s.trim()).filter(Boolean);
    const todayStr = new Date().toLocaleDateString();
    const day = store.globalGroupedHistory?.[todayStr];
    const all = (day?.items || []).filter(i => i.type === 'workout');
    const idSet = new Set(logIds.map(String));
    const logs = all.filter(l => idSet.has(String(l.id)) || names.includes(l.exercise));
    if (!logs.length) {
        alert('Could not find those log rows to edit.');
        return;
    }

    const byEx = logs.reduce((acc, log) => {
        const key = log.exercise || 'Workout';
        if (!acc[key]) acc[key] = [];
        acc[key].push(log);
        return acc;
    }, {});

    const items = Object.keys(byEx).map(exName => {
        const rows = byEx[exName].slice().sort((a, b) => (a.sets || 0) - (b.sets || 0));
        const dbEx = (store.globalExerciseDB || []).find(e => e.name === exName);
        const looksCardio = rows.some(r => (r.distance_km > 0) || (r.time_minutes > 0) || String(r.type || '').toLowerCase() === 'cardio')
            || /cardio|steady|run|cycle|row|swim|bike/i.test(exName);
        const isStretch = /static\s*stretch/i.test(exName);
        const isLactate = /lactate|sprint|interval|attack bike|skier|battle rope|rower|hill sprint|^spinning$|cycling|elliptical|treadmill|hit\s*class/i.test(exName)
            || HIT_TYPE_LABELS_RE.test(exName);
        const sets = rows.map(log => {
            if (isStretch) {
                return {
                    weight: 0,
                    reps: '~12 mins',
                    distance_km: 0,
                    time_minutes: 0,
                    rpe: 0,
                    completed: true,
                    isText: true
                };
            }
            if (isLactate && !(log.distance_km > 0)) {
                const dur = Number(log.reps) >= 20 ? Number(log.reps) : (Number(log.time_minutes) > 0 ? Number(log.time_minutes) * 60 : 30);
                return {
                    weight: 0,
                    reps: 0,
                    duration_sec: dur,
                    distance_km: 0,
                    time_minutes: Number(log.time_minutes) || 0,
                    rpe: '',
                    completed: true,
                    isText: false,
                    isLactateHit: true,
                    restTime: 0
                };
            }
            return {
                weight: Number(log.weight_kg) || 0,
                reps: Number(log.reps) || 0,
                distance_km: Number(log.distance_km) || 0,
                time_minutes: Number(log.time_minutes) || 0,
                rpe: log.rpe === '' || log.rpe == null ? '' : Number(log.rpe),
                completed: true,
                isText: false
            };
        });
        return {
            exercise: dbEx || {
                id: `orphan_${exName}`,
                name: exName,
                domain: looksCardio || isLactate ? 'cardio' : 'strength',
                muscle_group: dbEx?.muscle_group || ''
            },
            note: '',
            sets,
            isLactateHit: isLactate
        };
    });

    const kind = (() => {
        if (items.some(i => i.isLactateHit || /lactate|sprint|interval|hit\s*class/i.test(i.exercise?.name || ''))) return 'Lactate';
        if (items.some(i => ((i.exercise?.domain || '').toLowerCase() === 'cardio'))) return 'Cardio (Steady)';
        return 'Full Body / Strength';
    })();

    const sessionId = `orphan_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    try {
        recordLoggedWorkoutSession({
            dateIso: window._lactateEditDateIso || dateToISO(new Date()),
            kind,
            sessionId,
            logIds: logs.map(l => l.id).filter(Boolean),
            items
        });
        window._lactateEditDateIso = null;
    } catch (e) {
        console.warn(e);
    }

    editLoggedWorkoutSession(sessionId);
}

export function editLoggedWorkoutSession(sessionId) {
    const snap = getWorkoutSessionSnapshot(sessionId);
    if (!snap || !Array.isArray(snap.items) || !snap.items.length) {
        alert('Could not find that session to edit.');
        return;
    }

    // Navigate to Drive → Log without switchTab (which calls closeExecutionZone and wipes edit state)
    try {
        document.getElementById('header-title').innerText = 'Drive';
        document.querySelectorAll('.tab-content').forEach(tab => tab.classList.add('hidden'));
        document.getElementById('tab-drive')?.classList.remove('hidden');
        document.querySelectorAll('#main-nav .nav-item, .btn-icon').forEach(item => item.classList.remove('active'));
        const driveNav = document.querySelector('#main-nav .nav-item[onclick*="drive"]');
        if (driveNav) driveNav.classList.add('active');
        if (typeof window.switchDriveSubTab === 'function') window.switchDriveSubTab('log');
    } catch (e) { /* ignore */ }

    window.editingSessionId = sessionId;
    window.manualSessionKind = snap.kind || 'Full Body / Strength';
    window.manualWorkoutMode = true;
    const isLactateEdit = isLactateEvent(snap.kind) || snap.kind === 'Lactate';
    window.journalMode = isLactateEdit ? 'lactate' : 'workout';
    if (isLactateEdit) {
        window._lactateHitSelection = {
            types: snap.hitTypes || [],
            slot: snap.lactateSlot || null,
            isHitClass: !!snap.isHitClass,
            summary: snap.lactateSummary || '',
            rows: []
        };
    }

    document.querySelectorAll('.exe-btn').forEach(btn => btn.classList.remove('active-glow'));
    document.getElementById('log-type-selector').value = 'workout';
    const focusEl = document.getElementById('today-focus');
    if (focusEl) focusEl.value = window.manualSessionKind;
    document.getElementById('current-route-title').innerText = `EDIT · ${prettyWorkoutTypeLabel(window.manualSessionKind).toUpperCase()}`;

    store.activeLog.type = 'workout';
    store.activeLog.items = JSON.parse(JSON.stringify(snap.items));
    store.activeLog.items.forEach(ex => {
        if (Array.isArray(ex.sets)) {
            ex.sets.forEach(s => {
                s.completed = !!s.completed;
                // Restore lactate duration fields for editing extra sets
                if (isLactateEdit || ex.isLactateHit || s.isLactateHit) {
                    ex.isLactateHit = true;
                    s.isLactateHit = true;
                    if (s.duration_sec == null && Number(s.reps) >= 20 && !(Number(s.weight) > 0)) {
                        s.duration_sec = Number(s.reps);
                    }
                }
            });
        }
    });

    const zone = document.getElementById('execution-zone');
    const fuelToggles = document.getElementById('fuel-toggles');
    if (fuelToggles) fuelToggles.style.display = 'none';
    document.body.classList.add('workout-focus-mode');
    document.getElementById('ghost-template-container')?.classList.add('hidden');
    document.getElementById('tools-menu')?.classList.add('hidden');
    setManualAddBtnSymbol(false);
    updateSaveTemplateButtonLabel();
    renderActiveLog();

    if (zone) {
        zone.classList.remove('hidden');
        setTimeout(() => zone.classList.add('show'), 10);
    }
    // Keep original logged duration — do not restart the timer
    showEditableSessionDuration(snap);
    window._workoutSessionConfirmed = true;
    saveWorkoutDraft({ elapsedMs: Number(snap.durationMs) || ((Number(snap.durationMinutes) || 0) * 60000) });
}

export function startExecution(type, buttonElement = null, eventFocus = null, opts = {}) {
    document.querySelectorAll('.exe-btn').forEach(btn => btn.classList.remove('active-glow'));
    if (buttonElement) buttonElement.classList.add('active-glow');

    window.manualWorkoutMode = false;
    window.editingSessionId = null;

    if (type === 'workout') {
        if (isGuidanceOff('workout')) {
            return startManualWorkout(buttonElement);
        }
        // Prefer the specific plan-card event when starting from Plan
        const focus = (eventFocus && String(eventFocus).trim())
            || document.getElementById('today-focus')?.value
            || '';

        // In-progress draft: resume matching session, or confirm before replacing
        if (!opts.afterHitPicker && hasWorkoutDraft()) {
            const draft = loadWorkoutDraft();
            if (draftMatchesPlanEvent(focus, draft) || !focus) {
                return resumeInProgressWorkout();
            }
            if (!confirm('You already have a workout in progress. Stop it and start this one instead?')) {
                return;
            }
            discardInProgressWorkout();
        }

        if (eventFocus && String(eventFocus).trim()) {
            const input = document.getElementById('today-focus');
            if (input) input.value = String(eventFocus).trim();
        }
        if (focus === 'Game' || focus === 'Match' || isPracticeEvent(focus) || focus === 'Practice') {
            // Practice / match run as a timed workout (warmup → session → stretch); diary after Complete log
            const input = document.getElementById('today-focus');
            if (input) input.value = focus === 'Game' ? 'Match' : focus;
            window.manualSessionKind = (focus === 'Game' || focus === 'Match') ? 'Match' : 'Practice';
        } else if (focus === 'Rest' || focus === 'Rest (Cardio Only)') {
            if (isSteadyCardio(eventFocus) || eventFocus === 'Cardio (Steady)') {
                const input = document.getElementById('today-focus');
                if (input) input.value = 'Cardio (Steady)';
            } else if (focus === 'Rest' && !eventFocus) {
                return alert('Rest day: no lifting. You can still Start optional Steady State from Plan.');
            } else {
                const input = document.getElementById('today-focus');
                if (input) input.value = 'Cardio (Steady)';
            }
        }
        // Lactate/HIT: ask modality before building the 10-min protocol
        if (shouldPromptLactateHitTypes(focus) && !opts.afterHitPicker && !window.editingSessionId) {
            openLactateHitPicker(() => startExecution(type, buttonElement, eventFocus || focus, { afterHitPicker: true }));
            return;
        }
        // Planned GPS session — keep the exact plan label (not credit-collapsed Full Body)
        const focusNow = document.getElementById('today-focus')?.value || focus || '';
        if (window.manualSessionKind !== 'Practice' && window.manualSessionKind !== 'Match') {
            window.manualSessionKind = focusNow || 'Full Body / Strength';
        }
    } else {
        window.manualSessionKind = null;
        window._lactateHitSelection = null;
    }

    const zone = document.getElementById('execution-zone');
    const fuelToggles = document.getElementById('fuel-toggles');
    
    document.getElementById('log-type-selector').value = type;
    const titleMap = { bodyfat: 'Body fat', weight: 'Weight' };
    const lactateTitle = window._lactateHitSelection?.summary
        ? `Lactate/HIT · ${window._lactateHitSelection.isHitClass
            ? 'HIT class'
            : `RPE ${window._lactateHitSelection.sessionRpe ?? window._lactateHitSelection.desiredRpe ?? ''} · ${window._lactateHitSelection.blockMinutes || ''} min`}`
        : null;
    const workoutTitle = (type === 'workout' && window.manualSessionKind)
        ? prettyWorkoutTypeLabel(window.manualSessionKind)
        : null;
    document.getElementById('current-route-title').innerText = lactateTitle
        || titleMap[type]
        || workoutTitle
        || (type.charAt(0).toUpperCase() + type.slice(1));
    
    document.body.classList.add('workout-focus-mode');

    if (type === 'workout') {
        fuelToggles.style.display = 'none';
        window.journalMode = 'workout';
    } else if (type === 'weight' || type === 'bodyfat') {
        fuelToggles.style.display = 'none';
        const tip = document.getElementById('fuel-toggle-tip');
        if (tip) tip.classList.add('hidden');
    } else {
        fuelToggles.style.display = 'flex';
    }

    switchLogType(); 
    loadGhostTemplate();
    updateSaveTemplateButtonLabel();
    
    // Full-screen focus fade-in
    zone.classList.remove('hidden');
    setTimeout(() => zone.classList.add('show'), 10);
    // Workout timer starts on Confirm workout (acceptGhostTemplate), not during preview
    resetWorkoutTimer();
}

function hideExecutionZoneShell() {
    const zone = document.getElementById('execution-zone');
    if (!zone) return;
    zone.style.pointerEvents = '';
    zone.classList.remove('show');
    setTimeout(() => zone.classList.add('hidden'), 300);
    document.body.classList.remove('workout-focus-mode');
    document.querySelectorAll('.exe-btn').forEach(btn => btn.classList.remove('active-glow'));
    document.getElementById('tools-menu')?.classList.add('hidden');
    setManualAddBtnSymbol(false);
    const foodSel = document.getElementById('select-food');
    const exSel = document.getElementById('select-exercise');
    if (foodSel) foodSel.style.display = 'none';
    if (exSel) exSel.style.display = 'none';
}

/** Park the in-progress workout (save draft) and leave the execution overlay.
 *  Timer keeps advancing via a wall-clock anchor stored on the draft.
 */
export function parkInProgressWorkout() {
    const items = store.activeLog?.type === 'workout' ? (store.activeLog.items || []) : [];
    const elapsed = getWorkoutElapsedMs();
    const anchorAt = Date.now() - elapsed;
    // Only write when we still have live items — never overwrite a parked draft with an empty log
    if (store.activeLog?.type === 'workout' && items.length) {
        saveWorkoutDraft({
            elapsedMs: elapsed,
            timerRunning: true,
            timerAnchorAt: anchorAt
        });
    } else if (store.activeLog?.type === 'workout'
        && window._workoutSessionConfirmed
        && !hasWorkoutDraft()) {
        saveWorkoutDraft({
            elapsedMs: elapsed,
            timerRunning: true,
            timerAnchorAt: anchorAt
        });
    }
    resetWorkoutTimer();
    window._workoutSessionConfirmed = false;
    if (store.activeLog?.type === 'workout') {
        store.activeLog.items = [];
    }
    hideExecutionZoneShell();
    const unconfirm = document.getElementById('btn-unconfirm-route');
    if (unconfirm) unconfirm.classList.add('hidden');
    try { getTodayFocus(); } catch (e) { /* refresh Plan Resume/Stop */ }
    return true;
}

/** Restore a parked workout draft into the execution overlay (same view as before ×). */
export function resumeInProgressWorkout() {
    const draft = loadWorkoutDraft();
    if (!draft || !Array.isArray(draft.items) || !draft.items.length) {
        // Clear corrupted empty drafts so Stop/Plan UI can recover
        if (hasWorkoutDraftKey()) clearWorkoutDraft();
        alert('No workout in progress to resume.');
        try { getTodayFocus(); } catch (e) { /* ignore */ }
        return false;
    }

    // Do NOT call switchLogType() — it clears activeLog.items
    window.manualSessionKind = draft.manualSessionKind || null;
    window.manualWorkoutMode = !!draft.manualWorkoutMode;
    window.editingSessionId = draft.editingSessionId || null;
    window.journalMode = draft.journalMode || 'workout';
    window._lactateHitSelection = draft.lactateHitSelection
        ? JSON.parse(JSON.stringify(draft.lactateHitSelection))
        : null;
    window._hitClassDiaryOnly = false;
    window._workoutSessionConfirmed = true;
    window._workoutLogFilter = draft.workoutLogFilter === 'logged' ? 'logged' : 'todo';
    if (draft.ghostBackup) {
        store._ghostBackupForUnconfirm = JSON.parse(JSON.stringify(draft.ghostBackup));
    }

    const focusEl = document.getElementById('today-focus');
    if (focusEl && draft.manualSessionKind) focusEl.value = draft.manualSessionKind;

    const fuelToggles = document.getElementById('fuel-toggles');
    if (fuelToggles) fuelToggles.style.display = 'none';
    document.getElementById('log-type-selector').value = 'workout';
    store.activeLog.type = 'workout';
    store.activeLog.items = JSON.parse(JSON.stringify(draft.items));
    document.getElementById('current-route-title').innerText =
        draft.routeTitle || getDraftSessionLabel(draft) || 'Active workout';

    document.body.classList.add('workout-focus-mode');
    updateExecutionAuxBlocks('workout');
    refreshTemplateSelector();
    updateSaveTemplateButtonLabel();
    document.getElementById('ghost-template-container')?.classList.add('hidden');
    document.getElementById('log-status').innerText = '';
    setConfirmRouteButtons(true);
    renderActiveLog();

    const wrap = document.getElementById('workout-timer-wrap');
    if (wrap) wrap.classList.remove('hidden');
    const span = document.getElementById('workout-session-timer');
    if (span) span.style.display = '';
    const editDur = document.getElementById('workout-edit-duration-min');
    if (editDur) editDur.style.display = 'none';
    const unit = document.getElementById('workout-edit-duration-unit');
    if (unit) unit.style.display = 'none';
    const tLabel = document.querySelector('#workout-timer-wrap .workout-timer-label');
    if (tLabel) tLabel.textContent = 'Timer';

    resetWorkoutTimer();
    // Continue from wall-clock anchor so time away still counts
    const elapsed = getDraftRunningElapsedMs(draft);
    if (elapsed > 0) setWorkoutElapsedMs(elapsed);
    startWorkoutTimer();
    saveWorkoutDraft({
        elapsedMs: getWorkoutElapsedMs(),
        timerRunning: true,
        timerAnchorAt: Date.now() - getWorkoutElapsedMs()
    });

    const zone = document.getElementById('execution-zone');
    if (zone) {
        zone.style.pointerEvents = '';
        zone.classList.remove('hidden');
        setTimeout(() => zone.classList.add('show'), 10);
    }
    return true;
}

/** Discard a parked or live in-progress workout. */
export function discardInProgressWorkout() {
    clearWorkoutDraft();
    window._workoutSessionConfirmed = false;
    window.manualWorkoutMode = false;
    window.manualSessionKind = null;
    window.editingSessionId = null;
    window._lactateHitSelection = null;
    window._hitClassDiaryOnly = false;
    if (store.activeLog?.type === 'workout') {
        store.activeLog.items = [];
    }
    resetWorkoutTimer();
    hideExecutionZoneShell();
    const unconfirm = document.getElementById('btn-unconfirm-route');
    if (unconfirm) unconfirm.classList.add('hidden');
}

/** Stop (discard) a parked workout — used from Plan. */
export function stopInProgressWorkout() {
    const liveItems = store.activeLog?.type === 'workout' ? (store.activeLog.items || []) : [];
    if (!hasWorkoutDraft() && !hasWorkoutDraftKey() && !liveItems.length) {
        alert('No workout in progress.');
        return false;
    }
    if (!confirm('Stop workout and discard progress? This cannot be undone.')) return false;
    discardInProgressWorkout();
    clearWorkoutDraft();
    try { getTodayFocus(); } catch (e) { /* refresh Plan */ }
    return true;
}

/**
 * Close the execution overlay.
 * In-progress workouts are parked (resumable from Plan), not discarded.
 * Pass { discard: true } after a successful log to clear the draft.
 * Tab switches call this with no args — must not wipe a parked draft.
 */
export function closeExecutionZone(opts = {}) {
    const discard = opts === true || opts?.discard === true;
    const items = store.activeLog?.type === 'workout' ? (store.activeLog.items || []) : [];
    const liveWorkout = store.activeLog?.type === 'workout'
        && !!(window._workoutSessionConfirmed || items.length);

    if (!discard && liveWorkout) {
        parkInProgressWorkout();
        return;
    }

    if (discard) {
        clearWorkoutDraft();
        window._workoutSessionConfirmed = false;
        window.manualWorkoutMode = false;
        window.manualSessionKind = null;
        window.editingSessionId = null;
        window._lactateHitSelection = null;
        window._hitClassDiaryOnly = false;
        if (store.activeLog?.type === 'workout') store.activeLog.items = [];
    }

    resetWorkoutTimer();
    hideExecutionZoneShell();
    const unconfirm = document.getElementById('btn-unconfirm-route');
    if (unconfirm) unconfirm.classList.add('hidden');
}

function showMetricSheet(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.remove('hidden');
    setTimeout(() => modal.classList.add('show'), 10);
}

function hideMetricSheet(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.remove('show');
    setTimeout(() => modal.classList.add('hidden'), 300);
}

export function openWeightModal() {
    const input = document.getElementById('weight-input-kg');
    const warn = document.getElementById('weight-input-warning');
    if (input) input.value = store.userConfig.weight > 0 ? String(store.userConfig.weight) : '';
    if (warn) warn.classList.add('hidden');
    showMetricSheet('weight-modal');
    setTimeout(() => { input?.focus(); input?.select(); }, 80);
}

export function closeWeightModal() {
    hideMetricSheet('weight-modal');
}

export async function submitWeightLog() {
    const input = document.getElementById('weight-input-kg');
    const warn = document.getElementById('weight-input-warning');
    const w = parseFloat(input?.value);
    if (!w || w <= 0) {
        if (warn) { warn.textContent = 'Enter a valid weight.'; warn.classList.remove('hidden'); }
        return;
    }
    if (w > 250) {
        if (warn) { warn.textContent = 'Maximum weight is 250 kg.'; warn.classList.remove('hidden'); }
        return;
    }
    if (warn) warn.classList.add('hidden');
    const { error } = await upsertTodayWeight(w);
    if (error) console.warn('body_metrics weight upsert', error);
    store.userConfig.weight = w;
    saveSettings();
    document.getElementById('status-badge-weight')?.classList.add('completed');
    window.weightLoggedToday = true;
    closeWeightModal();
}

export function openBodyFatModal() {
    const input = document.getElementById('bodyfat-input-pct');
    const warn = document.getElementById('bodyfat-input-warning');
    if (input) input.value = store.userConfig.bodyFat > 0 ? String(store.userConfig.bodyFat) : '';
    if (warn) warn.classList.add('hidden');
    showMetricSheet('bodyfat-modal');
    setTimeout(() => { input?.focus(); input?.select(); }, 80);
}

export function closeBodyFatModal() {
    hideMetricSheet('bodyfat-modal');
}

export async function submitBodyFatLog() {
    const input = document.getElementById('bodyfat-input-pct');
    const warn = document.getElementById('bodyfat-input-warning');
    const bf = parseFloat(input?.value);
    if (!bf || bf <= 0) {
        if (warn) { warn.textContent = 'Enter a valid body fat %.'; warn.classList.remove('hidden'); }
        return;
    }
    if (bf > 100) {
        if (warn) { warn.textContent = 'Maximum body fat is 100%.'; warn.classList.remove('hidden'); }
        return;
    }
    if (warn) warn.classList.add('hidden');
    const { error } = await upsertTodayBodyFat(bf);
    if (error) console.warn('body_metrics bodyfat upsert', error);
    store.userConfig.bodyFat = bf;
    const bfEl = document.getElementById('set-bf');
    if (bfEl) bfEl.value = String(bf);
    saveSettings();
    document.getElementById('status-badge-bodyfat')?.classList.add('completed');
    window.bodyFatLoggedToday = true;
    closeBodyFatModal();
}

export async function submitLog() {
    const status = document.getElementById('log-status');
    
    if (store.activeLog.type === 'weight') {
        const w = parseFloat(document.getElementById('drive-weight-input')?.value);
        if (!w || w <= 0) { if (status) status.innerText = "❌ Enter weight."; return; }
        if (w > 250) { if (status) status.innerText = "❌ Max weight is 250 kg."; return; }
        if (status) status.innerText = "Syncing telemetry...";
        const { error } = await upsertTodayWeight(w);
        if (error) console.warn('body_metrics weight upsert', error);
        store.userConfig.weight = w;
        saveSettings();
        document.getElementById('status-badge-weight')?.classList.add('completed');
        window.weightLoggedToday = true;
        if (status) status.innerText = "✅ Weight Logged.";
        closeExecutionZone();
        setTimeout(() => { if (status) status.innerText = ""; }, 1000);
        return;
    }

    if (store.activeLog.type === 'bodyfat') {
        const bf = parseFloat(document.getElementById('drive-bf-input')?.value);
        if (!bf || bf <= 0) { if (status) status.innerText = "❌ Enter body fat %."; return; }
        if (bf > 100) { if (status) status.innerText = "❌ Max body fat is 100%."; return; }
        if (status) status.innerText = "Syncing telemetry...";
        const { error } = await upsertTodayBodyFat(bf);
        if (error) console.warn('body_metrics bodyfat upsert', error);
        store.userConfig.bodyFat = bf;
        const bfEl = document.getElementById('set-bf');
        if (bfEl) bfEl.value = String(bf);
        saveSettings();
        document.getElementById('status-badge-bodyfat')?.classList.add('completed');
        window.bodyFatLoggedToday = true;
        if (status) status.innerText = "✅ Body fat logged.";
        closeExecutionZone();
        setTimeout(() => { if (status) status.innerText = ""; }, 1000);
        return;
    }

    if(store.activeLog.items.length === 0) {
        if (status) status.innerText = "❌ Nothing to log.";
        return;
    }

    // Workouts: gym → short journal; Steady/Aux → silent; Lactate → user RPE; then commit
    if (store.activeLog.type === 'workout') {
        const focus = resolveActiveSessionKind() || document.getElementById('today-focus')?.value || '';
        const isLactate = isLactateEvent(focus) || focus === 'Lactate';
        const skipDiary = isSteadyCardio(focus) || isAuxEvent(focus) ||
            focus === 'Cardio' || focus === 'Cardio (Steady)';
        // Still open diary when injury pain follow-up is due this week
        // Stop the wall-clock timer at Complete log — this is the session duration
        captureSessionTimerAtLog();

        if (skipDiary && !needsInjuryPainFollowUp()) {
            window.journalMode = 'workout-silent';
            await commitWorkoutSession();
            return;
        }
        if (isLactate) {
            window.journalMode = 'lactate';
            configureJournalModal('lactate');
            const eyebrow = document.getElementById('journal-modal-eyebrow');
            const title = document.getElementById('journal-modal-title');
            if (eyebrow) eyebrow.innerText = 'Lactate/HIT Session';
            if (title) title.innerText = 'RATE THE SESSION';
            ['journal-rpe','journal-athletic','journal-mental','journal-notes','journal-match-perf','journal-injury-pain'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            resetJournalMedia();
            renderJournalMediaPreview();
            // Diary must receive taps above the full-screen workout shell
            const zone = document.getElementById('execution-zone');
            if (zone) zone.style.pointerEvents = 'none';
            const modal = document.getElementById('post-session-modal');
            if (modal) {
                modal.classList.remove('hidden');
                const content = modal.querySelector('.modal-content');
                if (content) {
                    content.style.animation = 'none';
                    void content.offsetHeight;
                    content.style.animation = '';
                }
            }
            return;
        }
        const isPracticeOrMatch = isPracticeEvent(focus) || focus === 'Practice'
            || focus === 'Game' || focus === 'Match'
            || window.manualSessionKind === 'Practice' || window.manualSessionKind === 'Match';
        if (isPracticeOrMatch) {
            const matchMode = focus === 'Game' || focus === 'Match' || window.manualSessionKind === 'Match';
            window.journalMode = matchMode ? 'match' : 'practice';
            configureJournalModal(window.journalMode);
            const eyebrow = document.getElementById('journal-modal-eyebrow');
            const title = document.getElementById('journal-modal-title');
            if (eyebrow) eyebrow.innerText = matchMode ? 'Match Complete' : 'Practice Complete';
            if (title) title.innerText = 'THE BRAIN DUMP';
            ['journal-rpe','journal-athletic','journal-mental','journal-notes','journal-match-perf','journal-injury-pain'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            resetJournalMedia();
            renderJournalMediaPreview();
            const zone = document.getElementById('execution-zone');
            if (zone) zone.style.pointerEvents = 'none';
            const modal = document.getElementById('post-session-modal');
            if (modal) {
                modal.classList.remove('hidden');
                const content = modal.querySelector('.modal-content');
                if (content) {
                    content.style.animation = 'none';
                    void content.offsetHeight;
                    content.style.animation = '';
                }
            }
            return;
        }
        if (skipDiary && needsInjuryPainFollowUp()) {
            window.journalMode = 'workout';
            configureJournalModal('pain-only');
            const eyebrow = document.getElementById('journal-modal-eyebrow');
            const title = document.getElementById('journal-modal-title');
            if (eyebrow) eyebrow.innerText = 'Injury Follow-up';
            if (title) title.innerText = 'PAIN CHECK';
            ['journal-rpe','journal-athletic','journal-mental','journal-notes','journal-match-perf','journal-injury-pain'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            resetJournalMedia();
            renderJournalMediaPreview();
            const modal = document.getElementById('post-session-modal');
            if (modal) modal.classList.remove('hidden');
            return;
        }
        window.journalMode = 'workout';
        configureJournalModal('gym');
        const eyebrow = document.getElementById('journal-modal-eyebrow');
        const title = document.getElementById('journal-modal-title');
        if (eyebrow) eyebrow.innerText = 'Gym Session Complete';
        if (title) title.innerText = 'GYM NOTES';
        ['journal-rpe','journal-athletic','journal-mental','journal-notes','journal-match-perf','journal-injury-pain'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        resetJournalMedia();
        renderJournalMediaPreview();
        const zone = document.getElementById('execution-zone');
        if (zone) zone.style.pointerEvents = 'none';
        const modal = document.getElementById('post-session-modal');
        if (modal) {
            modal.classList.remove('hidden');
            const content = modal.querySelector('.modal-content');
            if (content) {
                content.style.animation = 'none';                void content.offsetHeight;
                content.style.animation = '';
            }
        }
        if (status) status.innerText = "Awaiting brain dump...";
        return;
    }

    if (status) status.innerText = "Saving...";

    let saveError = null;

    if (['breakfast', 'lunch', 'dinner', 'snack'].includes(store.activeLog.type)) {
        let pro=0, carb=0, fat=0, cost=0;
        
        store.activeLog.items.forEach(item => {
            const m = item.mass/100; pro += item.food.protein_per_100g * m; carb += item.food.carbs_per_100g * m;
            fat += item.food.fat_per_100g * m; cost += item.food.price_per_100g * m;
            if (item.food && item.food.id && !item.food.id.toString().startsWith('QA_')) {
                let newStock = Math.max(0, (item.food.stock_g || 0) - item.mass);
                item.food.stock_g = newStock;
                store.supabaseClient.from('food_inventory').update({stock_g: newStock}).eq('id', item.food.id).then();
            }
        });

        const hydrationMl = Math.max(0, parseFloat(document.getElementById('meal-hydration-ml')?.value) || 0);
        const detailsPayload = hydrationMl > 0
            ? { items: store.activeLog.items, hydration_ml: hydrationMl }
            : store.activeLog.items;
        if (hydrationMl > 0) recordHydrationMl(hydrationMl, store.activeLog.type, dateToISO(new Date()));

        const payload = [{
            meal_name: store.activeLog.type.toUpperCase(), calories: Math.round((pro*4) + (carb*4) + (fat*9)), protein: Math.round(pro),
            carbs: Math.round(carb), fat: Math.round(fat), cost: Math.round(cost*100)/100, food_details: JSON.stringify(detailsPayload)
        }];
        
        try {
            if (!navigator.onLine) throw new Error("Offline");
            const { error } = await store.supabaseClient.from('food_logs').insert(payload);
            if (error) throw error;
        } catch(e) {
            store.offlineQueue.push({ table: 'food_logs', payload: payload });
            localStorage.setItem('ascensus_offline_queue', JSON.stringify(store.offlineQueue));
            saveError = "offline"; 
        }
    }

    if (saveError && saveError !== "offline") { 
        if (status) status.innerText = "[ ERROR ] DB Failure! Check console."; 
    } else {
        if (status) status.innerText = saveError === "offline" ? "Saved offline. Will sync later." : "Saved.";
        closeExecutionZone();
        document.body.classList.remove('workout-focus-mode');
        setTimeout(()=> { if (status) status.innerText=""; store.activeLog.items = []; renderActiveLog(); }, 1500);
        loadHistory(); 
    }
}

/** Saves the active workout after the post-session journal — does NOT re-open the journal. */
export async function commitWorkoutSession() {
    const status = document.getElementById('log-status');
    if (status) status.innerText = "Syncing session to cloud...";

    // Ensure entered sets are marked done (Steady Cardio often skipped the ✓)
    // (timer capture below — need previousSnap first for edit fallback)

    let logsToSave = [];
    let saveError = null;
    const sessionKind = resolveActiveSessionKind();
    const dateIso = dateToISO(new Date());
    const sessionId = window.editingSessionId || (`sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
    const previousSnap = window.editingSessionId ? getWorkoutSessionSnapshot(window.editingSessionId) : null;

    // Prefer timer frozen at Complete log; otherwise stop now
    const timerSnap = captureSessionTimerAtLog();
    let timedMinutes = timerSnap.minutes;
    let timedMs = timerSnap.ms;
    if (!(timedMinutes > 0) && previousSnap?.durationMinutes > 0) {
        timedMinutes = Number(previousSnap.durationMinutes) || 0;
        timedMs = Number(previousSnap.durationMs) || timedMinutes * 60000;
    }
    window._lastSessionDurationMin = timedMinutes;
    window._loggedSessionDurationMs = timedMs;
    window._loggedSessionDurationLabel = timerSnap.label || formatDurationMs(timedMs);

    // Steady State: duration is always the session timer (no manual time entry)
    (store.activeLog.items || []).forEach(item => {
        if (!isSteadyCardioLogItem(item)) return;
        (item.sets || []).forEach(set => {
            if (set.isText) return;
            set.time_minutes = timedMinutes || 0;
            if ((Number(set.distance_km) > 0) || timedMinutes > 0) set.completed = true;
        });
    });

    finalizeSetsBeforeCommit();
    // Snapshot only exercises/sets the user checked off
    const sessionItemsSnapshot = JSON.parse(JSON.stringify(store.activeLog.items || []))
        .map(item => ({
            ...item,
            sets: (item.sets || []).filter(s => s.completed)
        }))
        .filter(item => (item.sets || []).length > 0);

    const diaryFields = collectDiaryFieldValues();
    const notesEl = document.getElementById('journal-notes');

    let globalRPE = diaryFields.rpe != null ? diaryFields.rpe : 5;
    let athPerf = diaryFields.athletic != null ? diaryFields.athletic : 5;
    let mentFat = diaryFields.mental != null ? diaryFields.mental : 5;
    let jNotes = notesEl?.value || '';

    // Derive session RPE from duration rules (steady=2, gym from minutes, lactate=user)
    const derivedRpe = resolveSessionRpe({
        kind: sessionKind,
        durationMinutes: timedMinutes || previousSnap?.durationMinutes || 45,
        userRpe: diaryFields.rpe
    });

    if (window.journalMode === 'lactate') {
        globalRPE = derivedRpe; // user-judged via journal-rpe
        athPerf = 5;
        mentFat = 5;
    } else if (window.journalMode === 'workout' || window.journalMode === 'workout-silent') {
        if (window.journalMode === 'workout') {
            globalRPE = derivedRpe;
            athPerf = 5;
            mentFat = diaryFields.mental != null ? diaryFields.mental : 5;
        } else {
            // Silent (Steady / Aux) — fixed/derived RPE
            globalRPE = derivedRpe;
            athPerf = 5;
            mentFat = 5;
            jNotes = '';
        }
    }

    if (window.journalMode !== 'workout' && window.journalMode !== 'workout-silent') {
        if (athPerf < 4) {
            alert("TACTICAL ALERT: Performance < 4. Automatically forcing tomorrow into a Rest Day.");
            localStorage.setItem('ascensus_gps_index', 2);
        }
    }
    if (window.journalMode === 'workout' || window.journalMode === 'practice' || window.journalMode === 'match') {
        if (mentFat < 4) {
            alert("TACTICAL ALERT: Mental Fatigue < 4. Prioritize 9 hours sleep and Omega-3 supplementation tonight.");
        }
    }

    applyInjuryPainFollowUpFromJournal();

    store.activeLog.items.forEach(item => {
        if (item.isSuperset && Array.isArray(item.sides)) {
            item.sides.forEach(sideInfo => {
                const sideKey = sideInfo.key;
                const exName = sideInfo.exercise?.name || `Side ${sideKey}`;
                const baseDomain = (sideInfo.exercise?.domain || '').toLowerCase();
                const isCardio = baseDomain === 'cardio';
                const sideCompleted = (item.sets || []).filter(s =>
                    s.side === sideKey && s.completed && !s.isWarmup && !s.isText
                );
                sideCompleted.forEach((set, i) => {
                    const rpeVal = (set.rpe === '' || set.rpe === undefined || set.rpe === null)
                        ? 0
                        : Math.round(Number(set.rpe)) || 0;
                    logsToSave.push({
                        exercise: exName,
                        sets: i + 1,
                        reps: Math.round(set.reps) || 0,
                        weight_kg: set.weight || 0,
                        distance_km: 0,
                        time_minutes: 0,
                        rpe: rpeVal,
                        type: baseDomain || 'strength',
                        session_duration_min: timedMinutes || 0
                    });
                    if (!isCardio && set.rpe <= 1 && isHypertrophyPhase()) {
                        store.fatigueLockouts[sideInfo.exercise?.muscle_group] = true;
                    }
                });
                const last = sideCompleted[sideCompleted.length - 1];
                if (last && last.rpe > 2 && !isCardio && last.weight > 0) {
                    alert(`RIR Auto-Progression: ${exName} felt easy (RIR > 2). +2.5kg applied for next session.`);
                }
            });
            return;
        }

        let baseDomain = (item.exercise?.domain || '').toLowerCase();
        let isCardio = baseDomain === 'cardio' || globalRPE > 6 || isSteadyCardio(sessionKind) || isLactateEvent(sessionKind);

        let completedSets = (item.sets || []).filter(s => s.completed && !s.isText);
        if (completedSets.length > 0) {
            let finalSet = completedSets[completedSets.length - 1];
            if (finalSet.rpe > 2 && !isCardio && !item.isLactateHit && finalSet.weight > 0) {
                alert(`RIR Auto-Progression: ${item.exercise.name} felt easy (RIR > 2). +2.5kg applied for next session.`);
            }
        }

        (item.sets || []).forEach((set, sIdx) => {
            if (set.isWarmup) return; // warmups are session-local only
            if (set.completed && !set.isText) {
                const rpeVal = (set.rpe === '' || set.rpe === undefined || set.rpe === null) ? 0 : Math.round(Number(set.rpe)) || 0;
                const durationSec = Number(set.duration_sec) || 0;
                const timeMins = durationSec > 0
                    ? Math.max(1, Math.round(durationSec / 60))
                    : (Math.round(set.time_minutes) || 0);
                const exName = item.exercise?.name || item.name || 'Exercise';
                logsToSave.push({
                    exercise: exName,
                    sets: sIdx + 1,
                    reps: durationSec > 0 ? Math.round(durationSec) : (Math.round(set.reps) || 0),
                    weight_kg: set.isLactateHit ? 0 : (set.weight || 0),
                    distance_km: set.distance_km || 0,
                    time_minutes: timeMins,
                    rpe: set.isLactateHit ? 0 : rpeVal,
                    type: isCardio || set.isLactateHit ? 'cardio' : (baseDomain || 'strength'),
                    session_duration_min: timedMinutes || 0
                });

                if (!isCardio && set.rpe <= 1 && isHypertrophyPhase()) {
                    store.fatigueLockouts[item.exercise?.muscle_group] = true;
                }
            } else if (set.completed && set.isText) {
                // Protocol / stretch blocks still need a log row so the session appears in Log
                const exName = item.exercise?.name || item.name || 'Exercise';
                logsToSave.push({
                    exercise: exName,
                    sets: sIdx + 1,
                    reps: 0,
                    weight_kg: 0,
                    distance_km: 0,
                    time_minutes: 0,
                    rpe: 0,
                    type: isCardio ? 'cardio' : (baseDomain || 'strength'),
                    session_duration_min: timedMinutes || 0
                });
            }
        });
    });

    if (!logsToSave.length) {
        // Lactate/HIT: still persist diary + session snapshot when intervals were checked
        // but row-building skipped (e.g. edge-case text/warmup-only). Prefer real set rows.
        const hasLactateSnapshot = (window.journalMode === 'lactate' || isLactateEvent(sessionKind))
            && (sessionItemsSnapshot || []).some(i => (i.sets || []).some(s => s.completed));
        if (!hasLactateSnapshot) {
            const msg = 'Nothing to save — open each exercise, tick completed sets, then try Sync again.';
            if (status) status.innerText = msg;
            throw new Error(msg);
        }
        // Synthetic placeholder so Log/calendar still get a session card
        logsToSave.push({
            exercise: 'Lactate/HIT',
            sets: 1,
            reps: 0,
            weight_kg: 0,
            distance_km: 0,
            time_minutes: timedMinutes || 0,
            rpe: globalRPE || 0,
            type: 'cardio',
            session_duration_min: timedMinutes || 0
        });
    }

    if (isHypertrophyPhase()) {
        const fat = applyHypertrophyFatigueFromSession(store.activeLog.items);
        if (fat?.warning && fat.message) alert(fat.message);
    }

    // When editing, remove previous set rows first so Log stays a single session
    if (previousSnap && Array.isArray(previousSnap.logIds) && previousSnap.logIds.length) {
        try {
            if (navigator.onLine) {
                await store.supabaseClient.from('workout_logs').delete().in('id', previousSnap.logIds);
            }
        } catch (e) {
            console.warn('Could not clear previous session rows before edit:', e);
        }
    }

    let insertedRows = [];
    if (logsToSave.length > 0) {
        try {
            if (!navigator.onLine) throw new Error("Offline");
            const { data, error } = await store.supabaseClient.from('workout_logs').insert(logsToSave).select();
            if (error) throw error;
            insertedRows = Array.isArray(data) ? data : [];
        } catch (e) {
            console.error("Workout save error:", e);
            store.offlineQueue.push({ table: 'workout_logs', payload: logsToSave });
            localStorage.setItem('ascensus_offline_queue', JSON.stringify(store.offlineQueue));
            saveError = "offline";
            // Optimistic local rows so Log updates immediately even offline
            insertedRows = logsToSave.map((row, idx) => ({
                ...row,
                id: `local_${sessionId}_${idx}`,
                created_at: new Date().toISOString(),
                type: 'workout'
            }));
        }
    }

    const logIds = insertedRows.map(r => r.id).filter(id => id != null);

    // Credit / snapshot this session for the Log tab (always — planned + manual)
    if (logsToSave.length > 0 || (sessionItemsSnapshot || []).some(i => (i.sets || []).some(s => s.completed))) {
        try {
            recordLoggedWorkoutSession({
                dateIso,
                kind: sessionKind || resolveActiveSessionKind() || 'Full Body / Strength',
                sessionId,
                logIds,
                items: sessionItemsSnapshot,
                durationMinutes: timedMinutes || previousSnap?.durationMinutes || 0,
                durationMs: timedMs || previousSnap?.durationMs || 0,
                durationLabel: window._loggedSessionDurationLabel || null,
                rpe: globalRPE,
                hitTypes: window._lactateHitSelection?.types || previousSnap?.hitTypes || null,
                lactateSlot: window._lactateHitSelection?.slot || previousSnap?.lactateSlot || null,
                isHitClass: window._lactateHitSelection
                    ? !!window._lactateHitSelection.isHitClass
                    : (previousSnap?.isHitClass || null),
                lactateSummary: window._lactateHitSelection?.summary || previousSnap?.lactateSummary || null
            });
            invalidateWeekPlanCache();
            try { generateFutureTimeline(); } catch (e) { /* ignore */ }
            try { getTodayFocus(); } catch (e) { /* ignore */ }
        } catch (e) {
            console.warn('Week-plan session credit failed:', e);
        }
    }

    // Optimistic merge into today's Log history so the session appears straight away
    try {
        const todayStr = new Date().toLocaleDateString();
        if (!store.globalGroupedHistory) store.globalGroupedHistory = {};
        if (!store.globalGroupedHistory[todayStr]) {
            store.globalGroupedHistory[todayStr] = { items: [], macros: { cals:0, pro:0, carb:0, fat:0, cost:0 }, hasWorkout: false };
        }
        const dayBucket = store.globalGroupedHistory[todayStr];
        if (previousSnap && Array.isArray(previousSnap.logIds)) {
            const oldIds = new Set(previousSnap.logIds.map(String));
            dayBucket.items = dayBucket.items.filter(it => !(it.type === 'workout' && oldIds.has(String(it.id))));
        }
        insertedRows.forEach(row => {
            dayBucket.items.unshift({
                ...row,
                type: 'workout',
                created_at: row.created_at || new Date().toISOString()
            });
        });
        dayBucket.hasWorkout = dayBucket.items.some(i => i.type === 'workout');
        try { generateDailyExerciseLog(); } catch (e) { console.warn(e); }
    } catch (e) {
        console.warn('Optimistic log refresh failed:', e);
    }

    if (!saveError || saveError === 'offline') {
        let currentIdx = parseInt(localStorage.getItem('ascensus_gps_index')) || 0;
        localStorage.setItem('ascensus_gps_index', currentIdx + 1);
        if (window.completedStatusGlobal) window.completedStatusGlobal.WRK = true;
        try { getTodayFocus(); } catch (e) { console.warn(e); }
    }

    // Persist gym / lactate diary (custom fields + media)
    if (window.journalMode === 'workout' || window.journalMode === 'lactate') {
        let media = [];
        try {
            media = await persistPendingJournalMedia(dateIso);
        } catch (e) {
            console.warn('Gym journal media save failed', e);
        }
        try {
            const entry = buildDiaryEntryFromForm({
                notes: jNotes,
                mental: mentFat,
                rpe: globalRPE,
                media,
                type: window.journalMode === 'lactate' ? 'lactate' : 'gym'
            });
            if (window._lactateHitSelection) {
                entry.hitTypes = window._lactateHitSelection.types || [];
                entry.lactateSlot = window._lactateHitSelection.slot || null;
                entry.isHitClass = !!window._lactateHitSelection.isHitClass;
                entry.lactateSummary = window._lactateHitSelection.summary || '';
            }
            saveGymJournalEntry(dateIso, entry);
            try { renderAdherenceCalendar(); } catch (e) { /* ignore */ }
        } catch (e) {
            console.warn('Gym journal save failed', e);
            if (jNotes) localStorage.setItem('ascensus_journal_' + new Date().toLocaleDateString(), jNotes);
        }
        resetJournalMedia();
    }

    // HIT class: schedule recovery from session RPE
    if (window.journalMode === 'lactate' && window._lactateHitSelection?.isHitClass) {
        try {
            const recovery = resolveHitClassRecovery(globalRPE);
            if (recovery?.nextDayOverride) {
                setRouteOverride(addDaysISO(dateIso, 1), recovery.nextDayOverride);
                invalidateWeekPlanCache();
                try { generateFutureTimeline(); } catch (e) { /* ignore */ }
            }
            if (recovery?.message && (!saveError || saveError === 'offline')) {
                alert(recovery.message);
            }
        } catch (e) {
            console.warn('HIT class recovery failed:', e);
        }
    }

    window.journalPending = false;
    window.editingSessionId = null;
    window.manualSessionKind = null;
    window._lactateHitSelection = null;
    window._hitClassDiaryOnly = false;
    window._workoutSessionConfirmed = false;
    window._loggedSessionDurationMs = 0;
    window._loggedSessionDurationLabel = '';
    window._lastSessionDurationMin = 0;
    clearEditableSessionDurationUi();
    clearWorkoutDraft();
    if (store.activeLog) store.activeLog.items = [];

    if (status) {
        status.innerText = saveError === "offline"
            ? "[ OFFLINE ] Saved locally. Will sync."
            : "[ SUCCESS ] Session synced.";
    }

    closeExecutionZone({ discard: true });
    document.body.classList.remove('workout-focus-mode');

    const dash = document.getElementById('drive-dashboard');
    if (dash) dash.style.display = 'block';
    document.getElementById('status-badge-workout')?.classList.add('completed');

    // Show the Log tab immediately with the new session
    try {
        const driveNav = document.querySelector('#main-nav .nav-item[onclick*="drive"]');
        if (typeof window.switchTab === 'function' && driveNav) window.switchTab(driveNav, 'drive', 'Drive');
        if (typeof window.switchDriveSubTab === 'function') window.switchDriveSubTab('log');
    } catch (e) { /* ignore */ }

    setTimeout(() => {
        if (status) status.innerText = "";
        store.activeLog.items = [];
        renderActiveLog();
    }, 1200);

    try { await loadHistory(); } catch (e) { console.warn(e); }
}

export async function finalizeWorkoutLog() {
    if (window._finalizeInProgress) return;
    window._finalizeInProgress = true;

    const modal = document.getElementById('post-session-modal');
    const btn = document.getElementById('btn-finalize-workout');
    const modeAtStart = window.journalMode;

    // Validate injury pain follow-up before closing the diary
    if (needsInjuryPainFollowUp()) {
        const input = document.getElementById('journal-injury-pain');
        const raw = input ? input.value : '';
        if (raw === '' || raw == null || isNaN(parseFloat(raw))) {
            alert('Please rate injury-area pain (0–10) to complete your follow-up.');
            window._finalizeInProgress = false;
            return;
        }
    }
    if (modeAtStart === 'lactate') {
        const fields = collectDiaryFieldValues();
        let rpeNum = Number(fields.rpe);
        if (!Number.isFinite(rpeNum)) {
            rpeNum = Number(document.getElementById('journal-rpe')?.value);
        }
        if (!Number.isFinite(rpeNum) || rpeNum < 1 || rpeNum > 10) {
            alert('Please rate Lactate/HIT session RPE (1–10).');
            window._finalizeInProgress = false;
            return;
        }
    }

    if (btn) {
        btn.disabled = true;
        btn.innerText = 'SYNCING...';
    }

    // Stop wall-clock timer when Confirm log finishes (practice / match / gym)
    try {
        if (modeAtStart === 'practice' || modeAtStart === 'match') {
            window._lastSessionDurationMin = stopWorkoutTimer();
        }
    } catch (e) { /* ignore */ }

    let synced = false;
    try {
        // Keep mode stable for the whole commit (finally must not clear it early)
        window.journalMode = modeAtStart;
        if (modeAtStart === 'practice' || modeAtStart === 'match') {
            const notes = document.getElementById('journal-notes')?.value || '';
            const entry = buildDiaryEntryFromForm({ notes, type: modeAtStart });
            window._sportDiaryStash = { mode: modeAtStart, entry, notes };
            window.journalMode = 'workout-silent';
            await commitWorkoutSession();
            window.journalMode = modeAtStart;
            if (modeAtStart === 'practice') await commitPracticeSession();
            else await commitMatchSession();
        } else {
            await commitWorkoutSession();
        }
        synced = true;
        if (modal) modal.classList.add('hidden');
    } catch (err) {
        console.error('finalizeWorkoutLog error:', err);
        if (modal) modal.classList.remove('hidden');
        const detail = (err && err.message) ? String(err.message) : '';
        alert(detail && /nothing to save/i.test(detail)
            ? detail
            : 'Could not sync session. Check connection and try again.');
    } finally {
        window._finalizeInProgress = false;
        if (btn) {
            btn.disabled = false;
            btn.innerText = 'Sync & Close Session';
        }
        if (synced) {
            window.journalMode = null;
            closeDiarySchemaEditor();
            // Reset fields without leaving journalMode stuck on "practice"
            const prevMode = window.journalMode;
            window.journalMode = 'practice';
            configureJournalModal('practice');
            window.journalMode = prevMode;
            resetJournalMedia();
            const eyebrow = document.getElementById('journal-modal-eyebrow');
            const title = document.getElementById('journal-modal-title');
            if (eyebrow) eyebrow.innerText = 'Session Complete';
            if (title) title.innerText = 'THE BRAIN DUMP';
        } else {
            // Keep lactate/gym mode so a retry still validates & saves correctly
            window.journalMode = modeAtStart;
        }
    }
}

/** Show/hide journal fields by session type (dynamic schema). */
export function configureJournalModal(mode, prefillEntry = null) {
    const pain = document.getElementById('journal-injury-pain-block');
    const notes = document.getElementById('journal-notes');
    const painInput = document.getElementById('journal-injury-pain');
    const show = (el, on) => { if (el) el.style.display = on ? '' : 'none'; };
    const needPain = needsInjuryPainFollowUp();

    const schemaMode = journalModeToSchemaMode(
        mode === 'pain-only' ? 'workout' : (mode === 'gym' ? 'workout' : mode)
    );
    // Align window.journalMode for schema editor when configure is called with mode strings
    if (!window.journalMode) {
        if (mode === 'gym' || mode === 'pain-only') window.journalMode = 'workout';
        else if (mode === 'lactate' || mode === 'match' || mode === 'practice') window.journalMode = mode;
    }

    if (mode === 'gym') {
        if (notes) notes.placeholder = 'How did the session feel? Any form notes for next time.';
    } else if (mode === 'lactate') {
        if (notes) notes.placeholder = 'Optional notes — how hard did the Lactate/HIT work feel?';
    } else if (mode === 'match') {
        if (notes) notes.placeholder = 'What broke down in the match? What went well?';
    } else if (mode === 'pain-only') {
        if (notes) notes.placeholder = 'Optional notes about how the area feels.';
    } else {
        if (notes) notes.placeholder = 'What broke down? What went well? Document it for next time.';
    }

    renderDiaryFields(schemaMode, prefillEntry);

    show(pain, needPain || mode === 'pain-only');
    if (needPain || mode === 'pain-only') {
        const rec = store.userConfig.injuryRecord || {};
        const areaLabel = injuryAreaLabel(rec.area);
        const label = document.getElementById('journal-injury-pain-label');
        const hint = document.getElementById('journal-injury-pain-hint');
        if (label) label.innerText = `Injury follow-up · ${areaLabel} pain (0–10)`;
        if (hint) {
            const days = rec.durationDays != null ? ` (lasted ${rec.durationDays} day${rec.durationDays === 1 ? '' : 's'})` : '';
            hint.innerText = `Rate pain in your previously injured ${areaLabel.toLowerCase()} today${days}. This recalibrates Repair Mode for the week.`;
        }
    }
    if (painInput && !prefillEntry) painInput.value = '';
}

export function dismissJournalModal() {
    const modal = document.getElementById('post-session-modal');
    if (modal) modal.classList.add('hidden');
    const zone = document.getElementById('execution-zone');
    if (zone && zone.classList.contains('show')) zone.style.pointerEvents = '';
    // HIT class diary-only: abandoning the diary clears the synthetic session
    if (window._hitClassDiaryOnly) {
        window._hitClassDiaryOnly = false;
        window._lactateHitSelection = null;
        window._workoutSessionConfirmed = false;
        window.manualSessionKind = null;
        if (store.activeLog) store.activeLog.items = [];
    }
    window.journalMode = null;
    window.pendingPracticeDate = null;
    window.pendingMatchDate = null;
    window.editingSportJournal = false;
    window.editingSportJournalLogIds = [];
    window._editingJournalExistingMedia = [];
    closeDiarySchemaEditor();
    const btn = document.getElementById('btn-finalize-workout');
    if (btn) btn.innerText = 'Save & close';
    const status = document.getElementById('log-status');
    if (status) status.innerText = '';
}

// Expose early so the journal button always has a handler (ES modules are not global by default)

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncAuthThemeUI);
} else {
    syncAuthThemeUI();
}

export function submitBlindReroute(severity) {
    if(navigator.vibrate) navigator.vibrate([100, 50, 100]); 
    
    let cals = 0, pro = 0, carb = 0, fat = 0, cost = 0, name = "";
    if (severity === 'light') { cals = 700; pro = 40; carb = 60; fat = 33; cost = 15; name = "Light Deviation"; }
    else if (severity === 'moderate') { cals = 1200; pro = 30; carb = 120; fat = 66; cost = 20; name = "Moderate Deviation"; }
    else if (severity === 'heavy') { cals = 2000; pro = 20; carb = 200; fat = 124; cost = 30; name = "Heavy Deviation"; }

    const costInput = document.getElementById('blind-reroute-cost');
    const customCost = costInput ? parseFloat(costInput.value) : NaN;
    if (!isNaN(customCost) && customCost >= 0) {
        cost = customCost;
    }

    // Always treat deviation as a snack meal — never open a workout diary
    const previousType = store.activeLog?.type;
    const previousItems = Array.isArray(store.activeLog?.items) ? store.activeLog.items.slice() : [];
    store.activeLog.type = 'snack';
    store.activeLog.items = [{
        food: {
            id: 'QA_' + Date.now(),
            _category: 'MISC',
            _cleanName: name,
            protein_per_100g: pro,
            carbs_per_100g: carb,
            fat_per_100g: fat,
            price_per_100g: cost
        },
        mass: 100
    }];
    document.getElementById('quick-add-modal').classList.add('hidden');
    if (costInput) costInput.value = '';
    
    const term = document.getElementById('tactile-terminal');
    term.classList.remove('hidden');
    
    const lines = [
        document.getElementById('term-line-1'),
        document.getElementById('term-line-2'),
        document.getElementById('term-line-3'),
        document.getElementById('term-line-4')
    ];
    
    lines.forEach(l => l.style.opacity = '0');
    
    setTimeout(() => { lines[0].style.opacity = '1'; if(navigator.vibrate) navigator.vibrate(50); }, 300);
    setTimeout(() => { lines[1].style.opacity = '1'; if(navigator.vibrate) navigator.vibrate(50); }, 900);
    setTimeout(() => { lines[2].style.opacity = '1'; if(navigator.vibrate) navigator.vibrate(50); }, 1500);
    setTimeout(() => { lines[3].style.opacity = '1'; if(navigator.vibrate) navigator.vibrate([150, 50, 150]); }, 2100);
    
    setTimeout(() => {
        term.classList.add('hidden');
        submitLog().then(() => {
            // Restore prior log context if user was mid-meal / mid-workout
            if (previousType && previousType !== 'snack') {
                store.activeLog.type = previousType;
                store.activeLog.items = previousItems;
            }
            document.getElementById('execution-zone').classList.remove('hidden');
            loadGhostTemplate();
        }).catch(() => {
            if (previousType) {
                store.activeLog.type = previousType;
                store.activeLog.items = previousItems;
            }
        });
    }, 3500);
}

/** Populate day picker (today + next 2 days) and open spontaneous modal. */
export function openSpontaneousEventModal() {
    const sel = document.getElementById('spontaneous-day');
    if (sel) {
        const today = new Date();
        let html = '';
        for (let i = 0; i < 3; i++) {
            const d = new Date(today);
            d.setDate(today.getDate() + i);
            const iso = dateToISO(d);
            const label = i === 0
                ? `Today — ${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`
                : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
            html += `<option value="${iso}">${label}</option>`;
        }
        sel.innerHTML = html;
    }
    document.getElementById('spontaneous-event-modal')?.classList.remove('hidden');
}

/**
 * Schedule a spontaneous event onto the Route for a day within the next 3 days.
 * Logging happens later from Exercise (normal practice/match/workout flow).
 * After log: RPE&gt;8 → rest next day; RPE&gt;6 practice → counts as lactate.
 */
export async function submitSpontaneousEvent() {
    const type = document.getElementById('spontaneous-type')?.value;
    const dayIso = document.getElementById('spontaneous-day')?.value || dateToISO(new Date());
    if (!type) return alert('Choose an event type.');

    // Calendar / specific schedule uses Match; route planner maps Match → Game
    let scheduleVal = type;
    if (type === 'Game') scheduleVal = 'Match';

    try {
        if (!store.specificSchedules || typeof store.specificSchedules !== 'object') {
            store.specificSchedules = JSON.parse(localStorage.getItem('ascensus_specific_schedules') || '{}') || {};
        }
        store.specificSchedules[dayIso] = { event: scheduleVal, note: 'Spontaneous' };
        localStorage.setItem('ascensus_specific_schedules', JSON.stringify(store.specificSchedules));
        invalidateWeekPlanCache();
        document.getElementById('spontaneous-event-modal')?.classList.add('hidden');
        try { generateFutureTimeline(); } catch (e) { /* ignore */ }
        try { getTodayFocus(); } catch (e) { /* ignore */ }
        const pretty = prettyWorkoutTypeLabel(type === 'Game' ? 'Game' : type);
        const when = new Date(dayIso + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
        alert(`${pretty} added to Route for ${when}.\nLog it from Exercise when done — RPE>8 triggers rest; practice RPE>6 counts as lactate.`);
    } catch (e) {
        console.warn(e);
        alert('Could not schedule event.');
    }
}

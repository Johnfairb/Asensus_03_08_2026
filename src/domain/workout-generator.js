import { store } from '../state/store.js';
import { excludeBannedExercises } from './bans.js';
import { PERIODIZATION, getPhaseLoadMultiplier, getSeasonPhase, isGuidanceOff } from './fitness-hud.js';
import { buildLactateIntervalPlan } from './lactate-engine.js';
import { dateToISO, getLactateSlotForDate, isGameEvent, isLactateEvent, isLiftingEvent, isPracticeEvent, isSteadyCardio, openVideoModal, prettyFocusName } from './route-planner.js';
import { getSportData } from './sports-matrix.js';
import { buildAuxiliaryExerciseList, buildStrengthSessionRoutine, getGymPlanPrefs, isStrengthFocus, isStrengthPhase, progressStrengthIsolationWeight } from './strength-engine.js';
import {
    buildHypertrophyWarmupSets,
    equipmentForExercise,
    getHypertrophySessionRoutine,
    HYPERTROPHY_EXERCISE_META,
    isHypertrophyFocus,
    isHypertrophyPhase,
    isExerciseMuscleLocked,
    usesHypertrophyProgramming,
    progressHypertrophyWeight,
    resolveWarmupRestOptions,
    roundUpLoad
} from './hypertrophy-engine.js';
import {
    isBwGateExercise,
    isPressUpVariant,
    needsBwCompetencyAsk,
    resolveProgrammedBwName
} from './bodyweight-lifts.js';
import {
    prepContextForFocus,
    resolveStretchBlock,
    resolveWarmupBlock,
    buildSportSessionBlock
} from './session-prep.js';
import { formatCoreRepLabel, isUnilateralCompound } from './exercise-catalog.js';
import { hasCoreStrengthRating } from './core-programming.js';
import {
    applyPowerExerciseToItem,
    buildPowerSessionRoutine,
    buildPowerWarmupAndWorkSets,
    isPowerEvent,
    POWER_REST_SEC
} from './power-engine.js';

import { renderActiveLog } from '../ui/templates.js';
import { syncExerciseTimer } from '../ui/workout-timer.js';
import { ensureCycleStarted, ensureCyclePlansForProgramme, sessionTypeIdFromFocus, confirmSessionExercises } from './workout-cycle.js';
import { getEquivalentExercises, resolveItemSlotLabel } from './exercise-slots.js';
import { latestPhaseWeight, lastCompletedWorkingWeight, strengthLoadFromHypertrophy, resolveLogPeriodization } from './periodization-logs.js';

// ==========================================
// 8. ELITE WORKOUT ENGINE (DRIVE TAB)
// ==========================================

function emptySetForExercise(ex) {
    return { weight: 0, reps: 0, distance_km: 0, time_minutes: 0, rpe: 2, completed: false };
}

export function mergeLocalWorkoutHistory(remote) {
    const out = Array.isArray(remote) ? remote.slice() : [];
    const seen = new Set(out.map((r) => String(r.id)).filter((id) => id && id !== 'undefined'));
    const grouped = store.globalGroupedHistory || {};
    Object.values(grouped).forEach((day) => {
        (day?.items || []).forEach((row) => {
            if (!row || row.type !== 'workout' || !row.exercise) return;
            const id = row.id != null ? String(row.id) : '';
            if (id && seen.has(id)) return;
            if (id) seen.add(id);
            out.push(row);
        });
    });
    out.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    return out;
}

function savedCoreLoad(name) {
    try {
        const map = store.userConfig?.coreExerciseLoads || {};
        const direct = map[name];
        if (direct != null && Number.isFinite(Number(direct)) && Number(direct) >= 0) return Number(direct);
        const lower = String(name || '').toLowerCase();
        for (const [k, v] of Object.entries(map)) {
            if (String(k).toLowerCase() === lower && Number.isFinite(Number(v)) && Number(v) >= 0) return Number(v);
        }
    } catch (e) { /* ignore */ }
    return 0;
}

/** Add one or more exercises (by id). Before Confirm workout → ghost; after → active log. */
export function addExercisesByIds(ids) {
    const list = (Array.isArray(ids) ? ids : [ids]).filter(Boolean);
    if (!list.length) return;

    const ghostOpen = store.activeLog.type === 'workout'
        && document.getElementById('ghost-template-container')
        && !document.getElementById('ghost-template-container').classList.contains('hidden')
        && !window._workoutSessionConfirmed;

    list.forEach((id) => {
        const ex = store.globalExerciseDB.find(e => e.id == id || String(e.id) === String(id));
        if (!ex) return;
        if (store.fatigueLockouts[ex.muscle_group] || isExerciseMuscleLocked(ex.name)) {
            if (!confirm(`System Optimization Notice: The [${ex.muscle_group.toUpperCase()}] muscle group is in a recovery phase. Loading this mechanical pathway may be suboptimal. Proceed with override?`)) {
                return;
            }
        }
        const isIso = !!(HYPERTROPHY_EXERCISE_META[ex.name]?.role === 'isolation');
        const restOpts = resolveWarmupRestOptions(isIso, ex.name);
        const workRest = restOpts.mode === 'none' ? 0 : restOpts.workRestSec;
        const entry = {
            exercise: ex,
            sets: [{ weight: 0, reps: 0, distance_km: 0, time_minutes: 0, rpe: 2, completed: false, restTime: workRest }],
            plannedSets: 1,
            slotLabel: null,
            isExtra: true,
            isIsolation: isIso,
            note: 'Extra'
        };
        if (ghostOpen) {
            store.currentGhostItems.push(entry);
        } else {
            store.activeLog.items.push({
                exercise: ex,
                sets: [{ weight: 0, reps: 0, distance_km: 0, time_minutes: 0, rpe: 2, completed: false, restTime: workRest }],
                isExtra: true,
                isIsolation: isIso
            });
        }
    });

    if (ghostOpen) {
        renderGhostWorkoutFromItems();
    } else {
        renderActiveLog();
    }
}

export function addExerciseToActiveLog() {
    const select = document.getElementById('select-exercise');
    if (!select?.value) return;
    addExercisesByIds([select.value]);
    select.value = '';
}

function canRemoveGhostItem(item) {
    if (!item) return false;
    if (item.isWarmupGroup || item.isStretchGroup || item.isSportSessionBlock) return false;
    if (/stretch/i.test(item.exercise?.name || '')) return false;
    return !!(item.exercise?.name || item.isCoreBlock);
}

/** Swap an exercise in the ghost preview (pre-confirm). */
export function swapGhostExercise(ghostIdx, newId) {
    if (!newId && newId !== 0) return;
    const item = store.currentGhostItems[ghostIdx];
    if (!item || !item.exercise) return;
    const newEx = store.globalExerciseDB.find(e => e.id == newId || String(e.id) === String(newId));
    if (!newEx) return;
    item.exercise = newEx;
    if (item.isPower || /power/i.test(item.slotLabel || '')) {
        applyPowerExerciseToItem(item, newEx.name);
        item.exercise = newEx;
    } else if (item.sets) {
        item.sets = item.sets.map(s => ({ ...s, completed: false, locked: false }));
    }
    renderGhostWorkoutFromItems();
}

/** Remove an exercise from the ghost preview (pre-confirm). */
export function removeGhostExercise(ghostIdx) {
    const item = store.currentGhostItems[ghostIdx];
    if (!canRemoveGhostItem(item)) return;
    store.currentGhostItems.splice(ghostIdx, 1);
    renderGhostWorkoutFromItems();
}

export function renderGhostWorkoutFromItems() {
    const content = document.getElementById('ghost-content');
    const container = document.getElementById('ghost-template-container');
    if (!content || !container) return;

    const focus = document.getElementById('today-focus')?.value || window.manualSessionKind || '';
    const sessionTypeId = sessionTypeIdFromFocus(focus) || sessionTypeIdFromFocus(window.manualSessionKind || '');
    const allowEdit = !!sessionTypeId || store.currentGhostItems.some(canRemoveGhostItem);

    let html = '';
    if (allowEdit) {
        html += `<div style="margin-bottom:12px; padding:10px 12px; border:1px solid rgba(212,175,55,0.35); border-radius:8px; background:rgba(212,175,55,0.06); font-family:'Roboto Mono'; font-size:11px; color:var(--gold-accent); line-height:1.45;">
            Review exercises — swap any for an equivalent in the same slot, or remove any you don't want. Confirm workout to keep this list until you change it again.
        </div>`;
    }

    store.currentGhostItems.forEach((item, idx) => {
        if (item.isWarmupGroup) {
            html += `<div style="margin-bottom: 15px; border-bottom: 1px dashed #333; padding-bottom: 10px;">
                <div style="font-size: 12px; color:#D4AF37; font-weight:800; margin-bottom: 4px; text-transform:uppercase;">Warmup</div>
                <div style="font-size: 9px; color:#aaa; margin-bottom: 8px; font-style:italic;">${item.note || 'Includes pulse raising, mobilisation, shoulder warmup & dynamic stretching'}</div>
            </div>`;
            return;
        }
        if (item.isCoreBlock) {
            const n = item.plannedSets || (item.sets || []).length;
            html += `<div style="margin-bottom: 15px; border-bottom: 1px dashed #333; padding-bottom: 10px;">
                <div style="display:flex; justify-content:space-between; align-items:baseline; gap:8px; margin-bottom: 4px;">
                    <div style="font-size: 12px; color:#D4AF37; font-weight:800; text-transform:uppercase;">Core Circuit</div>
                    <button type="button" onclick="removeGhostExercise(${idx})" style="background:rgba(255,59,48,0.08); border:1px solid rgba(255,59,48,0.28); padding:4px 8px; border-radius:4px; color:#FF3B30; font-size:9px; font-family:'Roboto Mono'; font-weight:bold; cursor:pointer;">REMOVE</button>
                </div>
                <div style="display:flex; justify-content:space-between; font-size:11px; color:#ccc;"><span>Circuits</span><span style="color:#D4AF37; font-weight:bold;">${n} set${n === 1 ? '' : 's'}</span></div>
            </div>`;
            return;
        }
        if (item.isStretchGroup || /stretch/i.test(item.exercise?.name || '')) {
            html += `<div style="margin-bottom: 15px; border-bottom: 1px dashed #333; padding-bottom: 10px;">
                <div style="font-size: 12px; color:#D4AF37; font-weight:800; margin-bottom: 4px; text-transform:uppercase;">Stretching</div>
            </div>`;
            return;
        }
        if (item.isSportSessionBlock) {
            html += `<div style="margin-bottom: 15px; border-bottom: 1px dashed #333; padding-bottom: 10px;">
                <div style="font-size: 12px; color:#D4AF37; font-weight:800; margin-bottom: 4px; text-transform:uppercase;">${item.exercise.name}</div>
            </div>`;
            return;
        }

        const slot = resolveItemSlotLabel(item);
        const equivalents = !item.isExtra ? getEquivalentExercises(item) : [];
        html += `<div style="margin-bottom: 15px; border-bottom: 1px dashed #333; padding-bottom: 10px;">
            <div style="display:flex; justify-content:space-between; align-items:baseline; gap:8px; margin-bottom: 4px;">
                <div style="font-size: 12px; color:#D4AF37; font-weight:800; text-transform:uppercase;">${item.exercise.name}</div>
                <div style="display:flex; align-items:center; gap:8px;">
                    <button type="button" onclick="openVideoModal('${String(item.exercise.name).replace(/'/g, "\\'")}', 'https://www.youtube.com/embed/placeholder')" style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); padding:4px 8px; border-radius:4px; color:var(--text-silver); font-size:9px; font-family:'Roboto Mono'; font-weight:bold; cursor:pointer;">🎥 FORM</button>
                    <button type="button" onclick="removeGhostExercise(${idx})" style="background:rgba(255,59,48,0.08); border:1px solid rgba(255,59,48,0.28); padding:4px 8px; border-radius:4px; color:#FF3B30; font-size:9px; font-family:'Roboto Mono'; font-weight:bold; cursor:pointer;">REMOVE</button>
                </div>
            </div>`;
        if (slot) {
            html += `<div style="font-size:9px; color:var(--text-muted); margin-bottom:6px; font-family:'Roboto Mono'; text-transform:uppercase; letter-spacing:0.5px;">${slot}${item.isExtra ? ' · Extra' : ''}</div>`;
        } else if (item.isExtra) {
            html += `<div style="font-size:9px; color:var(--text-muted); margin-bottom:6px; font-family:'Roboto Mono';">EXTRA</div>`;
        }
        if (item.note) html += `<div style="font-size: 9px; color:#aaa; margin-bottom: 8px; font-style:italic;">${item.note}</div>`;
        if (equivalents.length) {
            html += `<label style="font-size:9px; color:var(--text-muted); font-family:'Roboto Mono'; display:block; margin-bottom:4px;">Swap equivalent</label>
                <select class="input-field" style="font-size:12px; padding:8px; margin-bottom:8px;" onchange="swapGhostExercise(${idx}, this.value)">
                    <option value="">Keep: ${item.exercise.name}</option>
                    ${equivalents.map(e => `<option value="${e.id}">${e.name}</option>`).join('')}
                </select>`;
        }
        const workSets = (item.sets || []).filter(s => s && !s.isWarmup && !s.isText && !s.isLactateHit);
        if (item.isSteadyCardio || (item.exercise?.domain || '').toLowerCase() === 'cardio') {
            html += `<div style="font-size:11px; color:var(--text-muted); font-family:'Roboto Mono'; margin-bottom:4px;">Choose type · timer + distance</div>`;
        } else if (workSets.length) {
            const sample = workSets[0];
            const nSets = typeof item.plannedSets === 'number' ? item.plannedSets : workSets.length;
            const reps = sample.reps || 10;
            const isNew = !!item.needsWeightFind && !item.weightFinderResolved;
            const load = isNew
                ? `<span style="color:var(--gold-accent); font-weight:800;">new exercise</span>`
                : (Number(sample.weight) > 0 ? `${sample.weight}kg` : 'BW');
            html += `<div style="display:flex; justify-content:space-between; font-size:11px; color:#ccc; margin-bottom: 4px;">
                <span>${load}</span>
                <span style="color:#D4AF37; font-weight:bold; font-family:'Roboto Mono';">${nSets}×${reps}</span>
            </div>`;
        }
        html += `</div>`;
    });

    if (isHypertrophyFocus(focus) && window.currentHypertrophySession) {
        const hs = window.currentHypertrophySession;
        html = `<div style="margin-bottom:14px; padding:10px 12px; border:1px solid rgba(212,175,55,0.35); border-radius:8px; background:rgba(212,175,55,0.06); font-family:'Roboto Mono'; font-size:11px; color:var(--gold-accent); font-weight:800; letter-spacing:0.5px; text-transform:uppercase;">Hypertrophy · ${hs.label || 'Session'} · Stick to rest times</div>` + html;
    } else if (isStrengthFocus(focus) && window.currentStrengthSession) {
        html = `<div style="margin-bottom:14px; padding:10px 12px; border:1px solid rgba(212,175,55,0.35); border-radius:8px; background:rgba(212,175,55,0.06); font-family:'Roboto Mono'; font-size:11px; color:var(--gold-accent); font-weight:800; letter-spacing:1px; text-transform:uppercase;">Strength Session ${window.currentStrengthSession} · Monthly movement picks</div>` + html;
    }

    content.innerHTML = html;
    container.classList.remove('hidden');
    const lockBtn = document.getElementById('btn-lock-in-route');
    if (lockBtn) {
        lockBtn.style.display = '';
        lockBtn.textContent = 'Confirm workout';
    }
}

export function addSetToExercise(exIdx) {
    const exItem = store.activeLog.items[exIdx];
    if (!exItem) return;
    if (exItem.isSuperset) {
        addSupersetRound(exIdx);
        return;
    }
    const domain = (exItem.exercise?.domain || '').toLowerCase();
    const name = exItem.exercise?.name || '';
    // Lactate/HIT intervals are protocol-fixed; steady cardio is a single session
    if (exItem.isLactateHit || (exItem.sets || []).some(s => s.isLactateHit)) return;
    if (domain === 'cardio' && !/sprint|lactate|interval|30s\s*on/i.test(name)) return;
    if (/static\s*stretch/i.test(name)) return;
    const workSets = (exItem.sets || []).filter(s => s && !s.isWarmup && !s.isText && !s.isDropSet);
    const lastWork = workSets[workSets.length - 1]
        || (exItem.sets || []).filter(s => s && !s.isWarmup && !s.isText).slice(-1)[0]
        || { weight: 0, reps: 0, distance_km: 0, time_minutes: 0, rpe: 2, restTime: 90 };
    exItem.sets.push({
        weight: lastWork.weight || 0,
        reps: lastWork.reps || 0,
        distance_km: lastWork.distance_km || 0,
        time_minutes: lastWork.time_minutes || 0,
        rpe: 2,
        completed: false,
        isDropSet: false,
        isWarmup: false,
        restTime: lastWork.restTime != null ? lastWork.restTime : 90,
        prevWeight: lastWork.prevWeight || lastWork.weight || 0
    });
    try { syncExerciseTimer(exItem, { editing: !!(window.editingSessionId || window._editingPreservedDuration) }); } catch (e) { /* ignore */ }
    if (window.currentModalExIdx !== null && window.currentModalExIdx !== undefined) window.renderExerciseSets();
    else renderActiveLog();
}

/** Drop set at 80% of previous working set weight (rounded up). */
export function addDropSetToExercise(exIdx) {
    const exItem = store.activeLog.items[exIdx];
    if (!exItem) return;
    const domain = (exItem.exercise?.domain || '').toLowerCase();
    const name = exItem.exercise?.name || '';
    if (exItem.isLactateHit || (exItem.sets || []).some(s => s.isLactateHit)) return;
    if (domain === 'cardio' || /static\s*stretch/i.test(name) || exItem.isWarmupGroup) return;
    const workSets = (exItem.sets || []).filter(s => !s.isWarmup && !s.isText);
    const last = workSets[workSets.length - 1] || exItem.sets[exItem.sets.length - 1];
    if (!last) return;
    const eq = equipmentForExercise(name);
    const dropW = roundUpLoad((Number(last.weight) || 0) * 0.8, eq);
    exItem.sets.push({
        weight: dropW,
        reps: last.reps || 10,
        rpe: 1,
        completed: false,
        isDropSet: true,
        restTime: 90,
        prevWeight: last.weight || 0,
        notes: 'Drop set · 80%'
    });
    try { syncExerciseTimer(exItem, { editing: !!(window.editingSessionId || window._editingPreservedDuration) }); } catch (e) { /* ignore */ }
    if (window.currentModalExIdx !== null && window.currentModalExIdx !== undefined) window.renderExerciseSets();
    else renderActiveLog();
}

/** Pair this exercise with the next as a merged superset (one log card, A/B rows). */
export function addSupersetWithNext(exIdx) {
    const items = store.activeLog.items;
    if (!items[exIdx] || !items[exIdx + 1]) {
        alert('Add another exercise below this one first, then tap Add Superset.');
        return;
    }
    createSupersetFromIndices(exIdx, exIdx + 1);
}

/**
 * Merge two lifting items into one superset card:
 * warmups A → warmups B → alternating work rounds (1A, 1B, 2A, 2B…).
 * History still saves each side as its own exercise on commit.
 */
export function createSupersetFromIndices(idxA, idxB) {
    const items = store.activeLog.items;
    if (!items?.[idxA] || !items?.[idxB] || idxA === idxB) return false;
    const itemA = items[idxA];
    const itemB = items[idxB];
    if (!canSupersetPair(itemA, itemB)) {
        alert('Those exercises cannot be supersetted.');
        return false;
    }

    const merged = buildSupersetItem(itemA, itemB);
    const hi = Math.max(idxA, idxB);
    const lo = Math.min(idxA, idxB);
    items.splice(hi, 1);
    items.splice(lo, 1);
    items.splice(lo, 0, merged);
    try { syncExerciseTimer(merged, { editing: !!(window.editingSessionId || window._editingPreservedDuration) }); } catch (e) { /* ignore */ }

    if (window.currentModalExIdx != null) {
        if (window.currentModalExIdx === hi || window.currentModalExIdx === lo) {
            window.currentModalExIdx = lo;
        } else if (window.currentModalExIdx > hi) {
            window.currentModalExIdx -= 1;
        }
    }
    if (window.currentModalExIdx !== null && window.currentModalExIdx !== undefined) {
        try { window.renderExerciseSets?.(); } catch (e) { /* ignore */ }
    }
    renderActiveLog();
    return true;
}

/** Split a merged superset back into two separate exercise cards. */
export function unmergeSuperset(exIdx) {
    const items = store.activeLog?.items;
    const item = items?.[exIdx];
    if (!item?.isSuperset || !Array.isArray(item.sides) || item.sides.length < 2) {
        alert('Not a merged superset.');
        return false;
    }

    const rebuildSide = (sideKey) => {
        const meta = item.sides.find(s => s.key === sideKey) || {};
        const sideSets = (item.sets || [])
            .filter(s => s && s.side === sideKey)
            .map(s => {
                const clone = JSON.parse(JSON.stringify(s));
                delete clone.side;
                delete clone.round;
                return clone;
            });
        return {
            exercise: JSON.parse(JSON.stringify(meta.exercise || { name: `Exercise ${sideKey}` })),
            note: item.note || '',
            sets: sideSets.length ? sideSets : [{ weight: 0, reps: 10, rpe: 2, completed: false, restTime: 90 }],
            plannedSets: typeof meta.plannedSets === 'number' ? meta.plannedSets : undefined,
            isIsolation: !!meta.isIsolation,
            role: meta.role || null,
            workWeightKg: meta.workWeightKg,
            needsWeightFind: !!meta.needsWeightFind,
            needsBwGate: !!meta.needsBwGate,
            weightFinderResolved: !!meta.weightFinderResolved,
            bwGateResolved: !!meta.bwGateResolved,
            isExtra: !!item.isExtra
        };
    };

    const a = rebuildSide('A');
    const b = rebuildSide('B');
    items.splice(exIdx, 1, a, b);

    if (window.currentModalExIdx === exIdx) {
        try { window.closeExerciseSetsModal?.(); } catch (e) { /* ignore */ }
        window.currentModalExIdx = null;
    } else if (window.currentModalExIdx != null && window.currentModalExIdx > exIdx) {
        window.currentModalExIdx += 1;
    }

    renderActiveLog();
    return true;
}

export function canSupersetPair(a, b) {
    if (!a || !b) return false;
    if (a.isSuperset || b.isSuperset) return false;
    if (a.isWarmupGroup || b.isWarmupGroup) return false;
    if (a.isStretchGroup || b.isStretchGroup) return false;
    if (a.isLactateHit || b.isLactateHit) return false;
    if (a.isSportSessionBlock || b.isSportSessionBlock) return false;
    const aDom = (a.exercise?.domain || '').toLowerCase();
    const bDom = (b.exercise?.domain || '').toLowerCase();
    if (aDom === 'cardio' || bDom === 'cardio') return false;
    if (/static\s*stretch/i.test(a.exercise?.name || '') || /static\s*stretch/i.test(b.exercise?.name || '')) return false;
    return true;
}

function cloneSets(sets, side) {
    return (sets || []).map(s => ({
        ...JSON.parse(JSON.stringify(s)),
        side,
        completed: !!s.completed
    }));
}

export function buildSupersetItem(itemA, itemB) {
    const id = `ss_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const nameA = itemA.exercise?.name || 'Exercise A';
    const nameB = itemB.exercise?.name || 'Exercise B';

    const aWarm = cloneSets((itemA.sets || []).filter(s => s && s.isWarmup), 'A');
    const bWarm = cloneSets((itemB.sets || []).filter(s => s && s.isWarmup), 'B');
    const aWorkAll = (itemA.sets || []).filter(s => s && !s.isWarmup && !s.isText && !s.isLactateHit);
    const bWorkAll = (itemB.sets || []).filter(s => s && !s.isWarmup && !s.isText && !s.isLactateHit);
    const aWork = aWorkAll.filter(s => !s.isDropSet);
    const bWork = bWorkAll.filter(s => !s.isDropSet);
    const aDrops = aWorkAll.filter(s => s.isDropSet);
    const bDrops = bWorkAll.filter(s => s.isDropSet);

    const rounds = Math.max(
        aWork.length || (typeof itemA.plannedSets === 'number' ? itemA.plannedSets : 0) || 3,
        bWork.length || (typeof itemB.plannedSets === 'number' ? itemB.plannedSets : 0) || 3
    );

    const templateA = aWork[0] || { weight: 0, reps: 10, rpe: 2, restTime: 0 };
    const templateB = bWork[0] || { weight: 0, reps: 10, rpe: 2, restTime: 100 };

    // Prefer fresh warmups from each side's work weight when clones are missing
    const aWuFinal = aWarm.length
        ? aWarm
        : buildHypertrophyWarmupSets(nameA, Number(templateA.weight) || 0, Number(templateA.reps) || 10, !!itemA.isIsolation)
            .map(s => ({ ...s, side: 'A', completed: false }));
    const bWuFinal = bWarm.length
        ? bWarm
        : buildHypertrophyWarmupSets(nameB, Number(templateB.weight) || 0, Number(templateB.reps) || 10, !!itemB.isIsolation)
            .map(s => ({ ...s, side: 'B', completed: false }));

    const sets = [...aWuFinal, ...bWuFinal];
    for (let i = 0; i < rounds; i++) {
        const aw = aWork[i] || templateA;
        const bw = bWork[i] || templateB;
        sets.push({
            weight: aw.weight || 0,
            reps: aw.reps || 10,
            rpe: aw.rpe === '' || aw.rpe == null ? 2 : aw.rpe,
            completed: false,
            isWarmup: false,
            isDropSet: false,
            side: 'A',
            round: i + 1,
            restTime: 0,
            prevWeight: aw.prevWeight || 0,
            notes: aw.notes
        });
        sets.push({
            weight: bw.weight || 0,
            reps: bw.reps || 10,
            rpe: bw.rpe === '' || bw.rpe == null ? 2 : bw.rpe,
            completed: false,
            isWarmup: false,
            isDropSet: false,
            side: 'B',
            round: i + 1,
            restTime: 100,
            prevWeight: bw.prevWeight || 0,
            notes: bw.notes
        });
    }
    aDrops.forEach(d => sets.push({
        ...JSON.parse(JSON.stringify(d)),
        side: 'A',
        isDropSet: true,
        isWarmup: false,
        completed: false,
        restTime: 0
    }));
    bDrops.forEach(d => sets.push({
        ...JSON.parse(JSON.stringify(d)),
        side: 'B',
        isDropSet: true,
        isWarmup: false,
        completed: false,
        restTime: 100
    }));

    return {
        isSuperset: true,
        supersetId: id,
        exercise: {
            id: `SUPERSET_${id}`,
            name: formatSupersetTitle(nameA, nameB),
            domain: itemA.exercise?.domain || itemB.exercise?.domain || 'strength',
            muscle_group: itemA.exercise?.muscle_group || 'full'
        },
        note: [itemA.note, itemB.note].filter(Boolean).join(' · ') || 'Superset — log A then B each round',
        sides: [
            {
                key: 'A',
                exercise: JSON.parse(JSON.stringify(itemA.exercise)),
                plannedSets: typeof itemA.plannedSets === 'number' ? itemA.plannedSets : rounds,
                isIsolation: !!itemA.isIsolation,
                role: itemA.role || null,
                workWeightKg: itemA.workWeightKg,
                needsWeightFind: !!itemA.needsWeightFind,
                needsBwGate: !!itemA.needsBwGate,
                weightFinderResolved: !!itemA.weightFinderResolved,
                bwGateResolved: !!itemA.bwGateResolved
            },
            {
                key: 'B',
                exercise: JSON.parse(JSON.stringify(itemB.exercise)),
                plannedSets: typeof itemB.plannedSets === 'number' ? itemB.plannedSets : rounds,
                isIsolation: !!itemB.isIsolation,
                role: itemB.role || null,
                workWeightKg: itemB.workWeightKg,
                needsWeightFind: !!itemB.needsWeightFind,
                needsBwGate: !!itemB.needsBwGate,
                weightFinderResolved: !!itemB.weightFinderResolved,
                bwGateResolved: !!itemB.bwGateResolved
            }
        ],
        sets,
        plannedSets: rounds,
        exerciseTimerStartedAt: [itemA.exerciseTimerStartedAt, itemB.exerciseTimerStartedAt]
            .map(n => Number(n) || 0).filter(n => n > 0).sort((a, b) => a - b)[0] || null,
        exerciseTimerEndedAt: null,
        exerciseDurationMs: 0
    };
}

/** Display title: "A · Bench / B · Row" */
export function formatSupersetTitle(nameA, nameB) {
    const a = String(nameA || 'Exercise A').trim();
    const b = String(nameB || 'Exercise B').trim();
    return `A · ${a} / B · ${b}`;
}

export function supersetTitleFromItem(item) {
    if (!item?.isSuperset) return item?.exercise?.name || 'Superset';
    return formatSupersetTitle(
        item.sides?.[0]?.exercise?.name,
        item.sides?.[1]?.exercise?.name
    );
}

/**
 * Rebuild missing/stale warmups for each side independently (does not touch completed warmups).
 */
export function repairSupersetWarmups(item) {
    if (!item?.isSuperset || !Array.isArray(item.sides)) return false;
    let changed = false;
    const sides = ['A', 'B'];
    const rebuiltWu = { A: null, B: null };

    sides.forEach(sideKey => {
        const meta = (item.sides || []).find(s => s.key === sideKey);
        const sideWu = (item.sets || []).filter(s => s.side === sideKey && s.isWarmup);
        if (sideWu.some(s => s.completed)) {
            rebuiltWu[sideKey] = sideWu;
            return;
        }
        const sideWork = (item.sets || []).filter(s =>
            s.side === sideKey && !s.isWarmup && !s.isDropSet && !s.isText
        );
        const w = Number(sideWork[0]?.weight);
        const workW = Number.isFinite(w) ? w : (Number(meta?.workWeightKg) || 0);
        const reps = Number(sideWork[0]?.reps) || 10;
        const exName = meta?.exercise?.name || '';
        const isIso = !!meta?.isIsolation;

        const stale = !sideWu.length
            || (workW > 0 && sideWu.some(wu => Math.abs((Number(wu.weight) || 0) - workW) < 0.01))
            || (sideWu.length >= 2 && (Number(sideWu[1].weight) || 0) + 0.01 < (Number(sideWu[0].weight) || 0));

        if (stale) {
            rebuiltWu[sideKey] = buildHypertrophyWarmupSets(exName, workW, reps, isIso).map(s => ({
                ...s,
                side: sideKey,
                completed: false,
                locked: false
            }));
            changed = true;
        } else {
            rebuiltWu[sideKey] = sideWu;
        }
    });

    if (!changed) return false;

    const workAndDrops = (item.sets || []).filter(s => !s.isWarmup);
    item.sets = [...(rebuiltWu.A || []), ...(rebuiltWu.B || []), ...workAndDrops];
    item.exercise = {
        ...item.exercise,
        name: supersetTitleFromItem(item)
    };
    return true;
}

/** Add one more A+B work round to a merged superset. */
export function addSupersetRound(exIdx) {
    const item = store.activeLog.items[exIdx];
    if (!item?.isSuperset) return;
    const aWork = (item.sets || []).filter(s => s.side === 'A' && !s.isWarmup && !s.isDropSet && !s.isText);
    const bWork = (item.sets || []).filter(s => s.side === 'B' && !s.isWarmup && !s.isDropSet && !s.isText);
    const ta = aWork[aWork.length - 1] || { weight: 0, reps: 10, rpe: 2 };
    const tb = bWork[bWork.length - 1] || { weight: 0, reps: 10, rpe: 2 };
    const round = Math.max(aWork.length, bWork.length) + 1;
    item.sets.push({
        weight: ta.weight || 0, reps: ta.reps || 10, rpe: 2, completed: false,
        isWarmup: false, isDropSet: false, side: 'A', round, restTime: 0,
        prevWeight: ta.prevWeight || ta.weight || 0
    });
    item.sets.push({
        weight: tb.weight || 0, reps: tb.reps || 10, rpe: 2, completed: false,
        isWarmup: false, isDropSet: false, side: 'B', round, restTime: 100,
        prevWeight: tb.prevWeight || tb.weight || 0
    });
    item.plannedSets = round;
    try { syncExerciseTimer(item, { editing: !!(window.editingSessionId || window._editingPreservedDuration) }); } catch (e) { /* ignore */ }
    if (window.currentModalExIdx !== null && window.currentModalExIdx !== undefined) window.renderExerciseSets();
    else renderActiveLog();
}

/** Drop set on one side of a superset (80% of that side's last work weight). */
export function addDropSetToSupersetSide(exIdx, side) {
    const item = store.activeLog.items[exIdx];
    if (!item?.isSuperset || (side !== 'A' && side !== 'B')) return;
    const sideSets = (item.sets || []).filter(s => s.side === side && !s.isWarmup && !s.isText);
    const last = sideSets[sideSets.length - 1];
    if (!last) return;
    const sideMeta = (item.sides || []).find(s => s.key === side);
    const eq = equipmentForExercise(sideMeta?.exercise?.name || '');
    const dropW = roundUpLoad((Number(last.weight) || 0) * 0.8, eq);
    item.sets.push({
        weight: dropW,
        reps: last.reps || 10,
        rpe: 1,
        completed: false,
        isDropSet: true,
        isWarmup: false,
        side,
        restTime: side === 'B' ? 100 : 0,
        prevWeight: last.weight || 0,
        notes: `Drop set · 80% · ${side}`
    });
    try { syncExerciseTimer(item, { editing: !!(window.editingSessionId || window._editingPreservedDuration) }); } catch (e) { /* ignore */ }
    if (window.currentModalExIdx !== null && window.currentModalExIdx !== undefined) window.renderExerciseSets();
    else renderActiveLog();
}

/** Rest after B of a superset round: 100s + 10s per side that hit 0 RIR. */
export function supersetRestAfterB(setA, setB) {
    let rest = 100;
    const rirA = parseFloat(setA?.rpe);
    const rirB = parseFloat(setB?.rpe);
    if (Number.isFinite(rirA) && rirA === 0) rest += 10;
    if (Number.isFinite(rirB) && rirB === 0) rest += 10;
    return rest;
}

export async function generateWorkoutTemplate() {
    const content = document.getElementById('ghost-content');
    const container = document.getElementById('ghost-template-container');
    if (!content || !container) return;

    try {
    if (store.globalExerciseDB.length === 0) {
        content.innerHTML = "<div style='text-align:center;'><p style='font-size:13px; color:var(--text-muted); font-weight:bold;'>Exercise library still loading.</p><p style='font-size:11px; color:var(--text-muted); margin-top:10px;'>Wait a moment, then tap Start workout again.</p></div>";
        container.classList.remove('hidden');
        return;
    }
    const forcedKind = String(window.manualSessionKind || '').trim();
    let focus = (forcedKind && forcedKind !== 'Practice' && forcedKind !== 'Match')
        ? forcedKind
        : (document.getElementById('today-focus')?.value || '');
    if (focus && document.getElementById('today-focus') && document.getElementById('today-focus').value !== focus
        && (isSteadyCardio(focus) || isLactateEvent(focus) || isPowerEvent(focus))) {
        document.getElementById('today-focus').value = focus;
    }
    store.currentGhostItems = [];

    if (isGuidanceOff('workout') && !window._forceGpsTemplateLoad) {
        // Manual Steady / Lactate still gets the planned-style template when the user picks that type
        const forced = window.manualSessionKind || '';
        const allowForced = isSteadyCardio(forced) || isLactateEvent(forced) || isPowerEvent(forced);
        if (!allowForced) {
            content.innerHTML = "<div style='text-align:center;'><p style='font-size:13px; color:var(--text-muted); font-weight:bold;'>Workout guidance off</p><p style='font-size:11px; color:var(--text-muted); margin-top:10px;'>No session will be generated. Switch Workout back on in Tracker (Settings) to resume programming.</p></div>";
            container.classList.remove('hidden');
            const lockBtn = document.getElementById('btn-lock-in-route');
            if (lockBtn) lockBtn.style.display = 'none';
            return;
        }
    }

    if (isGameEvent(focus)) {
        const label = prettyFocusName(focus);
        content.innerHTML = `<div style='text-align:center;'><p style='font-size:13px; color:#0A84FF; font-weight:bold;'>${label} Day — lifting locked.</p><p style='font-size:11px; color:var(--text-muted); margin-top:10px;'>Compete. Recover. Rest is auto-scheduled tomorrow if RPE is high.</p></div>`;
        container.classList.remove('hidden'); return;
    }
    if (focus === 'Rest' && !isSteadyCardio(forcedKind) && !isLactateEvent(forcedKind) && !isPowerEvent(forcedKind)) {
        content.innerHTML = "<div style='text-align:center;'><p style='font-size:13px; color:var(--gold-accent); font-weight:bold;'>Rest Day</p><p style='font-size:11px; color:var(--text-muted); margin-top:10px;'>Prioritize sleep and hydration. Optional Zone 2 steady is available from Plan if you feel good.</p></div>";
        container.classList.remove('hidden'); return;
    }
    if (focus === 'Rest (Cardio Only)') {
        // Treat as optional steady session when user starts from Plan
        focus = 'Cardio (Steady)';
        document.getElementById('today-focus').value = 'Cardio (Steady)';
    }
    if (isPracticeEvent(focus) && !(window.todayRouteEvents || []).some(isLiftingEvent)) {
        const label = prettyFocusName(focus);
        content.innerHTML = `<div style='text-align:center;'><p style='font-size:13px; color:#0A84FF; font-weight:bold;'>${label} Day</p><p style='font-size:11px; color:var(--text-muted); margin-top:10px;'>Use Log on the ${label.toLowerCase()} card under Exercise Plan to open the brain dump.</p></div>`;
        container.classList.remove('hidden'); return;
    }

    let hist = [];
    try {
        const res = await store.supabaseClient.from('workout_logs').select('*').order('created_at', { ascending: false });
        if (!res.error && Array.isArray(res.data)) hist = res.data;
    } catch (e) {
        console.warn('workout_logs history unavailable:', e);
    }
    hist = mergeLocalWorkoutHistory(hist);
    const logDayKey = (row) => {
        const raw = row && row.created_at;
        if (!raw) return '';
        return String(raw).includes('T') ? String(raw).split('T')[0] : String(raw).slice(0, 10);
    };
    const EX_ALIASES = {
        'Side Sit': 'Side-sit on Hyperextension Bench',
        'Sidesit': 'Side-sit on Hyperextension Bench',
        'Back Squat': 'Squat',
        'DB Bench Press': 'Bench Press',
        'Dips': 'Dip',
        'Pull Ups': 'Pull Up',
        'Chin Ups': 'Chin Up',
        'Lat Pulldown': 'Lat Machine Pull',
        'Military Press': 'Barbell Military Press',
        'Seated DB Press': 'Seated Dumbbell Shoulder Press'
    };
    const getEx = (exName) => {
        const lookup = EX_ALIASES[exName] || exName;
        // Prefer non-banned catalogue matches for auto plans; fall back to banned/TMP so the slot still resolves
        const pool = excludeBannedExercises(store.globalExerciseDB);
        return pool.find(e => e.name.toLowerCase() === lookup.toLowerCase())
            || pool.find(e => e.name.toLowerCase().includes(lookup.toLowerCase()))
            || store.globalExerciseDB.find(e => e.name.toLowerCase() === lookup.toLowerCase())
            || store.globalExerciseDB.find(e => e.name.toLowerCase().includes(lookup.toLowerCase()))
            || { id: 'TMP_'+Date.now(), name: lookup, domain: 'strength', muscle_group: 'custom' };
    };

    let html = ''; let mainRoutine = [];
    let phaseStr = getSeasonPhase();
    let pData = PERIODIZATION[phaseStr] || PERIODIZATION['OffSeason_Strength'];
    let sportData = getSportData();

    // 1. MANDATORY WARM-UP BLOCK (skipped for Steady State — the session itself is the aerobic work)
    if (store.userConfig.injury !== 'None' && store.userConfig.repairLevel && store.userConfig.repairLevel < 4) {
        mainRoutine.push({ name: "Injury Prehab Protocol", isText: true, reps: "10 Mins", notes: "REPAIR MODE: Execute physio/prehab exercises before main session." });
    }

    const isSteadyFocus = isSteadyCardio(focus) || focus === 'Cardio';
    const isLactateFocus = isLactateEvent(focus);
    const isPracticeFocus = /practice/i.test(String(focus || ''));
    const isMatchFocus = /^(game|match)$/i.test(String(focus || ''));
    const prepCtx = (isPracticeFocus || isMatchFocus) ? 'practice' : prepContextForFocus(focus);

    if (!isSteadyFocus) {
        const wu = resolveWarmupBlock({ context: prepCtx, isLactate: isLactateFocus });
        if (wu) mainRoutine.push(wu);
    }

    // If Repair Level is 1 and it's a Lower Body focus, completely abort the lower body routine.
    let isLowerInjury = store.userConfig.injury === 'Knee' || store.userConfig.injury === 'LowerBack';
    if (isLowerInjury && store.userConfig.repairLevel === 1 && (focus === 'Lower Body' || focus === 'Full Body / Power' || isStrengthFocus(focus))) {
        content.innerHTML = "<div style='text-align:center;'><p style='font-size:12px; color:#FF3B30; font-weight:bold;'>REPAIR MODE OVERRIDE.</p><p style='font-size:10px; color:#aaa; margin-top:10px;'>Lower body mechanical loading is locked until Diagnostics improve. Rest or swap to Upper Body.</p></div>";
        container.classList.remove('hidden'); return;
    }

    // ----------------------------------------------------------------
    // WEIGHTED RANDOMIZER ENGINE
    // ----------------------------------------------------------------
    const getWeightedExercise = (options) => {
        let total = options.reduce((sum, opt) => sum + opt.w, 0);
        let r = Math.random() * total;
        let current = 0;
        for (let opt of options) { current += opt.w; if (r <= current) return opt.n; }
        return options[options.length - 1].n;
    };

    const useHypertrophy = usesHypertrophyProgramming(focus);
    if (useHypertrophy || (isStrengthFocus(focus) && !isHypertrophyFocus(focus))) {
        try {
            ensureCycleStarted(new Date());
            ensureCyclePlansForProgramme();
        } catch (e) { /* ignore */ }
    }

    // First time core is programmed: ask the user to rate core strength
    if (!useHypertrophy && isStrengthFocus(focus) && !isHypertrophyFocus(focus) && !hasCoreStrengthRating()) {
        const { promptCoreStrengthRating } = await import('../ui/core-strength-ui.js');
        const rated = await promptCoreStrengthRating();
        if (!rated) {
            content.innerHTML = "<div style='text-align:center;'><p style='font-size:13px; color:var(--text-muted); font-weight:bold;'>Core strength rating needed</p><p style='font-size:11px; color:var(--text-muted); margin-top:10px;'>Rate your core strength to build the strength session core circuit.</p></div>";
            container.classList.remove('hidden');
            return;
        }
    }

    if (useHypertrophy) {
        // Stable day plan — same exercises until date / prefs / session kind change
        const built = getHypertrophySessionRoutine(focus);
        window.currentHypertrophySession = built;
        window.currentStrengthSession = null;
        built.items.forEach(item => mainRoutine.push(item));
    } else if (focus === 'Full Body / Strength' || (isStrengthFocus(focus) && !isHypertrophyFocus(focus))) {
        const prefs = getGymPlanPrefs();
        const built = buildStrengthSessionRoutine(focus, sportData, prefs.setBudget);
        built.items.forEach(item => mainRoutine.push(item));
        // Persist which session ran for legacy Strength labels
        localStorage.setItem('ascensus_strength_ab', built.session);
        window.currentStrengthSession = built.session;
        window.currentStrengthTimeTier = built.timeTier;
        // No auxiliary attachment in strength / hybrid
    } 
    else if (isPowerEvent(focus) || focus === 'Full Body / Power') {
        const { promptPowerFatigueCheck } = await import('../ui/power-fatigue-ui.js');
        const fatigueResult = await promptPowerFatigueCheck();
        if (!fatigueResult?.proceed) {
            content.innerHTML = "<div style='text-align:center;'><p style='font-size:13px; color:var(--gold-accent); font-weight:bold;'>Power skipped</p><p style='font-size:11px; color:var(--text-muted); margin-top:10px;'>Plyometrics need you fresh. Do strength, hypertrophy, or rest instead.</p></div>";
            container.classList.remove('hidden');
            const lockBtn = document.getElementById('btn-lock-in-route');
            if (lockBtn) lockBtn.style.display = 'none';
            return;
        }
        pData = {
            reps: 5,
            sets: 3,
            rest_sec: POWER_REST_SEC,
            notes: 'POWER: Maximal effort on every work set. No RIR. 3 min rest.'
        };
        const built = buildPowerSessionRoutine({
            fatigue: fatigueResult.fatigue,
            allowUnclassified: true
        });
        if (!built.ok || !built.items.length) {
            content.innerHTML = "<div style='text-align:center;'><p style='font-size:13px; color:var(--text-muted); font-weight:bold;'>Could not build a power session</p><p style='font-size:11px; color:var(--text-muted); margin-top:10px;'>Need a classifiable strength level, or try logging power after you have lift data.</p></div>";
            container.classList.remove('hidden');
            return;
        }
        built.items.forEach((item) => mainRoutine.push(item));
        window.currentPowerSession = built;
    } 
    else if (focus === 'Auxiliary' && !isHypertrophyPhase(phaseStr) && !isStrengthPhase(phaseStr)) { 
        pData = { reps: 12, sets: 3, rest_sec: 60, notes: "Prehab & Weaknesses. Short rests. Target vulnerable areas." }; 
        buildAuxiliaryExerciseList(sportData).forEach(item => mainRoutine.push(item));
    } else if (focus === 'Auxiliary' && (isHypertrophyPhase(phaseStr) || isStrengthPhase(phaseStr))) {
        // No auxiliary track in hypertrophy / strength / hybrid
        content.innerHTML = "<div style='text-align:center;'><p style='font-size:13px; color:var(--gold-accent); font-weight:bold;'>No auxiliary in this phase</p><p style='font-size:11px; color:var(--text-muted); margin-top:10px;'>Strength and hypertrophy do not schedule separate auxiliary sessions.</p></div>";
        container.classList.remove('hidden');
        return;
    } 
    else if (isLactateEvent(focus)) {
        const sel = window._lactateHitSelection;
        const todayIso = dateToISO(new Date());
        const slot = sel?.slot || getLactateSlotForDate(todayIso);
        const plan = (sel && Array.isArray(sel.rows) && sel.rows.length)
            ? sel
            : buildLactateIntervalPlan({
                types: sel?.types || ['treadmill_sprints'],
                slot,
                date: new Date(),
                desiredRpe: sel?.desiredRpe || 7,
                sessionRpe: sel?.sessionRpe || sel?.desiredRpe || 7
            });

        if (plan.isHitClass) {
            mainRoutine.push({
                name: 'HIT Class',
                isText: true,
                isLactateHit: true,
                reps: 'Diary RPE only',
                notes: plan.summary || 'No intervals — rate the class in the diary.',
                sets: 1
            });
        } else if ((plan.types || []).length <= 1) {
            const rows = plan.rows || [];
            mainRoutine.push({
                name: rows[0]?.name || 'Treadmill sprints',
                isLactateHit: true,
                notes: plan.summary || `Variable work:rest · ${plan.blockMinutes || 10} min HIT block`,
                sets: rows.length || 1,
                lactateRows: rows
            });
        } else {
            // Mixed: one row per set so modalities alternate in order
            (plan.rows || []).forEach((row, idx) => {
                mainRoutine.push({
                    name: row.name,
                    isLactateHit: true,
                    notes: row.notes || plan.summary,
                    restSec: row.restSec,
                    workSec: row.workSec || row.durationSec,
                    sets: 1,
                    lactateSetIndex: idx + 1,
                    lactateRows: [row]
                });
            });
        }
        window._lactateHitSelection = {
            ...(sel || {}),
            ...plan,
            slot,
            desiredRpe: plan.desiredRpe,
            sessionRpe: plan.sessionRpe,
            blockMinutes: plan.blockMinutes,
            summary: plan.summary
        };
    }
    else if (isSteadyCardio(focus) || focus === 'Cardio') {
        mainRoutine.push({
            name: 'Steady State Cardio',
            notes: 'Choose a cardio type, then start. Duration is tracked by the session timer.',
            isSteadyCardio: true,
            sets: 1
        });
    }
    else if (isPracticeFocus || isMatchFocus) {
        mainRoutine.push(buildSportSessionBlock(isMatchFocus ? 'match' : 'practice'));
    }

    // 2. COOL-DOWN STRETCH (honours prefs — including after Steady State)
    {
        const stretch = resolveStretchBlock({ context: prepCtx });
        if (stretch) mainRoutine.push(stretch);
    }

    const roundLoad = (val, type) => {
        return roundUpLoad(val, type || 'barbell');
    };

    mainRoutine.forEach(item => {
        // Combined Warmup block — one list item, four parts when LOG is opened
        if (item.isWarmupGroup) {
            let setsArray = (item.warmupParts || []).map(part => ({
                weight: 0,
                reps: part.reps,
                rpe: 0,
                completed: false,
                isText: true,
                partName: part.name,
                notes: part.notes,
                children: Array.isArray(part.children) ? part.children : null
            }));
            store.currentGhostItems.push({
                exercise: { id: item.isCustomWarmup ? 'CUSTOM_WARMUP' : 'WARMUP_GROUP', name: item.name || 'Warmup', domain: 'warmup', muscle_group: 'full' },
                note: item.warmupNote || 'Includes pulse raising, mobilisation, shoulder warmup & dynamic stretching',
                sets: setsArray,
                isWarmupGroup: true,
                isCustomWarmup: !!item.isCustomWarmup,
                prepContext: prepCtx
            });
            return;
        }
        if (item.isStretchGroup || (/static\s*stretch/i.test(item.name || '') && item.stretchParts)) {
            const parts = item.stretchParts || [];
            let setsArray = parts.length
                ? parts.map(part => ({
                    weight: 0,
                    reps: part.reps,
                    rpe: 0,
                    completed: false,
                    isText: true,
                    partName: part.name,
                    baseName: part.baseName || part.name,
                    side: part.side || null,
                    holdSec: part.holdSec || null,
                    unilateral: !!part.unilateral,
                    notes: part.notes
                }))
                : [{
                    weight: 0,
                    reps: item.reps || 'Log when done',
                    rpe: 0,
                    completed: false,
                    isText: true,
                    partName: item.name || 'Stretching',
                    notes: item.notes
                }];
            store.currentGhostItems.push({
                exercise: { id: item.isCustomStretch ? 'CUSTOM_STRETCH' : 'STRETCH_GROUP', name: item.name || 'Stretching', domain: 'mobility', muscle_group: 'full' },
                note: item.notes || '',
                sets: setsArray,
                isStretchGroup: true,
                isCustomStretch: !!item.isCustomStretch,
                prepContext: prepCtx
            });
            return;
        }
        if (item.isSportSessionBlock) {
            store.currentGhostItems.push({
                exercise: { id: 'SPORT_SESSION', name: item.name, domain: 'sport', muscle_group: 'full' },
                note: item.notes || '',
                sets: [{
                    weight: 0,
                    reps: item.reps || 'Log when done',
                    rpe: 0,
                    completed: false,
                    isText: true,
                    partName: item.name,
                    notes: item.notes
                }],
                isSportSessionBlock: true,
                plannedSets: 1
            });
            return;
        }

        // Steady State — always cardio domain, one distance/time set, no warmups / weight find
        if (item.isSteadyCardio || /steady\s*state\s*cardio/i.test(item.name || '')) {
            const latestCardio = hist.find(l =>
                l && (l.exercise === item.name || /steady|easy\s*run|jog|bike|swim|elliptical|incline\s*walk|ski\s*erg|cross\s*trainer|rowing/i.test(String(l.exercise || '')))
                && (Number(l.distance_km) > 0 || Number(l.time_minutes) > 0)
            ) || null;
            const tDist = latestCardio ? (Number(latestCardio.distance_km) || 0) : 0;
            store.currentGhostItems.push({
                exercise: {
                    id: 'STEADY_CARDIO',
                    name: item.name || 'Steady State Cardio',
                    domain: 'cardio',
                    muscle_group: 'full'
                },
                note: item.notes || 'Aerobic base. Zone 2. Choose a type to start the timer.',
                sets: [{
                    weight: 0,
                    reps: 0,
                    distance_km: 0,
                    time_minutes: 0,
                    rpe: '',
                    completed: false,
                    prevDist: tDist
                }],
                plannedSets: 1,
                isSteadyCardio: true,
                cardioTypeChosen: false,
                needsWeightFind: false,
                needsBwGate: false,
                weightFinderResolved: true,
                bwGateResolved: true
            });
            return;
        }

        // Strength core circuit — Set 1 / Set 2 expand to 5 exercises with advised reps
        if (item.isCoreBlock) {
            const coreEx = Array.isArray(item.coreExercises) ? item.coreExercises : [];
            const circuitCount = typeof item.sets === 'number' ? item.sets
                : (typeof item.setsOverride === 'number' ? item.setsOverride : 2);
            const setsArray = [];
            for (let i = 0; i < circuitCount; i++) {
                setsArray.push({
                    partName: `Set ${i + 1}`,
                    reps: '5 exercises · advised reps',
                    weight: 0,
                    rpe: 0,
                    completed: false,
                    isText: true,
                    isCoreCircuit: true,
                    restTime: i < circuitCount - 1 ? 60 : 0,
                    children: coreEx.map(n => ({
                        name: n,
                        reps: formatCoreRepLabel(n),
                        weight: savedCoreLoad(n),
                        _uiExpanded: false
                    }))
                });
            }
            store.currentGhostItems.push({
                exercise: { id: 'CORE_CIRCUIT', name: 'Core Circuit', domain: 'strength', muscle_group: 'core' },
                note: item.notes || 'No rest between exercises · 1 min between sets',
                sets: setsArray,
                isCoreBlock: true,
                plannedSets: circuitCount,
                coreExercises: coreEx
            });
            return;
        }

        // Bodyweight competency: monthly / permanent swaps before catalogue lookup
        const programmedName = item.isText ? item.name : resolveProgrammedBwName(item.name);
        if (!item.isText && programmedName !== item.name) {
            item = { ...item, name: programmedName, notes: ((item.notes || '') + ` (swapped from bodyweight variant for this month)`).trim() };
        }
        let exObj = getEx(item.name);
        if (item.isPower || item.skipHypertrophyWarmup) {
            if (exObj && !exObj.domain) exObj = { ...exObj, domain: 'power' };
            else if (exObj) exObj = { ...exObj, domain: exObj.domain || 'power' };
            const setsArray = buildPowerWarmupAndWorkSets(exObj.name, {
                slotLabel: item.slotLabel,
                reps: item.reps,
                workWeight: item.workWeight,
                restSec: item.restSec || POWER_REST_SEC
            });
            store.currentGhostItems.push({
                exercise: exObj,
                note: item.notes || 'Maximal effort — every work-set rep should be as explosive as possible.',
                sets: setsArray,
                plannedSets: 3,
                slotLabel: item.slotLabel || null,
                powerIntensity: item.powerIntensity || null,
                isPower: true,
                hideRir: true,
                skipHypertrophyWarmup: true
            });
            return;
        }
        let latestLog = hist.find(l => String(l.exercise || '').toLowerCase() === String(exObj.name || '').toLowerCase()) || null;
        const isCardioEx = ((exObj.domain || '').toLowerCase() === 'cardio');
        const eqType = equipmentForExercise(exObj.name);
        const inStrengthPhase = !useHypertrophy && (phaseStr === 'OffSeason_Strength' || phaseStr === 'OffSeason_Hybrid' || isStrengthPhase(phaseStr));

        // Seed weight — never use 1RM for strength (strength = hypertrophy work +15%, then normal progression).
        // Adaptation may still use phase multipliers for light loads.
        let calcWeight = 20;
        if (!inStrengthPhase && store.userConfig.oneRepMax) {
            let mult = getPhaseLoadMultiplier(phaseStr);
            if (exObj.name.includes("Squat") && store.userConfig.oneRepMax.squat > 0) calcWeight = store.userConfig.oneRepMax.squat * mult;
            else if (exObj.name.includes("Bench") && store.userConfig.oneRepMax.bench > 0) calcWeight = store.userConfig.oneRepMax.bench * mult;
            else if (exObj.name.includes("Deadlift") && store.userConfig.oneRepMax.deadlift > 0) calcWeight = store.userConfig.oneRepMax.deadlift * mult;
            else if (!item.isText) calcWeight = Math.max(10, 20 * mult / 0.65);
            const eq0 = equipmentForExercise(exObj.name);
            calcWeight = roundLoad(calcWeight, eq0);
            if (phaseStr === 'OffSeason_Adaptation' && calcWeight < 10) calcWeight = 10;
        }

        let tWeight;
        const loggedWorkKg = lastCompletedWorkingWeight(hist, exObj.name);
        if (item.isText) {
            tWeight = 0;
        } else if (inStrengthPhase) {
            tWeight = 0; // filled below from strength log, hypertrophy+15%, or finder
        } else if (phaseStr === 'OffSeason_Adaptation') {
            if (loggedWorkKg != null && loggedWorkKg > 0 && loggedWorkKg <= calcWeight * 1.15) {
                tWeight = loggedWorkKg;
            } else {
                tWeight = calcWeight;
            }
        } else {
            tWeight = loggedWorkKg != null ? loggedWorkKg : calcWeight;
        }
        let tDist = latestLog ? latestLog.distance_km : 0;
        // Steady duration comes from the session timer at log time — don't prefill a fake target
        let tMins = 0;
        let itemNoteExtra = '';

        // Bodyweight competency ask (hypertrophy 8 / strength 5) — unless already answered this month
        let needsBwGate = false;
        if (!item.isText && !isCardioEx && isBwGateExercise(exObj.name) && needsBwCompetencyAsk(exObj.name)) {
            needsBwGate = true;
            itemNoteExtra = ` Bodyweight check: can you do the required reps? If not, we swap for this month.`;
        }

        // Strength: last strength log (+ same progression below); else hypertrophy work +15% (BW in total); else 10@5 RIR finder → +15%
        if (!item.isText && !isCardioEx && inStrengthPhase) {
            const strengthW = latestPhaseWeight(hist, exObj.name, 'strength');
            const hypW = latestPhaseWeight(hist, exObj.name, 'hypertrophy');
            if (strengthW != null) {
                tWeight = strengthW;
                latestLog = hist.find(l => l.exercise === exObj.name && resolveLogPeriodization(l) === 'strength') || null;
            } else if (hypW != null) {
                tWeight = strengthLoadFromHypertrophy(hypW, exObj.name);
                itemNoteExtra = (itemNoteExtra ? itemNoteExtra + ' ' : '') + 'Strength load = hypertrophy +15% (bodyweight included for BW lifts).';
                latestLog = null; // first strength prescription from hyp — progression starts next session
            }
        }

        // First time THIS exact exercise name is logged — ask for work weight / 10@5 RIR finder
        // History at 0 kg (pure BW) still counts so we don't re-ask every session.
        // Strength with no hyp history also uses the hypertrophy finder, then +15%.
        // Library-seeded working weights count as known (skip finder; still subject to progression once logged).
        let needsWeightFind = false;
        const savedWorkKg = (() => {
            try {
                const map = store.userConfig?.exerciseWorkingWeights || {};
                const direct = map[exObj.name];
                if (direct != null && Number.isFinite(Number(direct)) && Number(direct) >= 0) return Number(direct);
                const lower = String(exObj.name || '').toLowerCase();
                for (const [k, v] of Object.entries(map)) {
                    if (String(k).toLowerCase() === lower && Number.isFinite(Number(v)) && Number(v) >= 0) return Number(v);
                }
            } catch (e) { /* ignore */ }
            return null;
        })();
        if (!item.isText && !isCardioEx && savedWorkKg != null) {
            if (inStrengthPhase) {
                const hasPhaseHist = latestPhaseWeight(hist, exObj.name, 'strength') != null
                    || latestPhaseWeight(hist, exObj.name, 'hypertrophy') != null;
                if (!hasPhaseHist && tWeight <= 0) tWeight = savedWorkKg;
            } else if (loggedWorkKg == null) {
                tWeight = savedWorkKg;
            }
        }
        if (!item.isText && !isCardioEx && (useHypertrophy || isBwGateExercise(exObj.name) || inStrengthPhase)) {
            const exName = String(exObj.name || '').toLowerCase();
            const nameMatch = (n) => String(n || '').toLowerCase() === exName;
            const hasHist = (hist || []).some(l => nameMatch(l.exercise) && (l.weight_kg != null && Number(l.weight_kg) >= 0) && (Number(l.reps) > 0 || Number(l.weight_kg) > 0));
            let hasLocal = false;
            try {
                const grouped = store.globalGroupedHistory || {};
                for (const day of Object.values(grouped)) {
                    const rows = day?.items || [];
                    if (rows.some(l => nameMatch(l.exercise) && l.weight_kg != null && Number(l.weight_kg) >= 0 && (Number(l.reps) > 0 || Number(l.weight_kg) > 0))) {
                        hasLocal = true;
                        break;
                    }
                }
            } catch (e) { /* ignore */ }
            const hasStrengthOrHyp = inStrengthPhase && (
                latestPhaseWeight(hist, exObj.name, 'strength') != null
                || latestPhaseWeight(hist, exObj.name, 'hypertrophy') != null
            );
            const hasSavedSeed = savedWorkKg != null;
            if (isPressUpVariant(exObj.name) && !needsBwGate) {
                tWeight = 0;
            } else if (!needsBwGate && !hasStrengthOrHyp && !hasHist && !hasLocal && !latestLog && !hasSavedSeed) {
                needsWeightFind = true;
                itemNoteExtra = (itemNoteExtra ? itemNoteExtra + ' ' : '')
                    + (inStrengthPhase
                        ? 'First time on this exercise in strength: find 10 reps @ 5 RIR (hypertrophy protocol), then we set strength at +15%.'
                        : 'First time on this exercise: we will ask for your work weight (or help you find 10 reps @ 5 RIR).');
            } else if (inStrengthPhase && !hasStrengthOrHyp && tWeight <= 0 && !needsBwGate && !hasSavedSeed) {
                // No 1RM fallback — must find via hypertrophy protocol
                needsWeightFind = true;
                itemNoteExtra = (itemNoteExtra ? itemNoteExtra + ' ' : '')
                    + 'Find 10 reps @ 5 RIR (hypertrophy protocol), then strength is set at +15%.';
            }
        }

        // REPAIR MODE THROTTLING
        if (store.userConfig.injury !== 'None' && store.userConfig.repairLevel < 4 && !item.isText && !isCardioEx) {
            let throttle = 1.0;
            if (store.userConfig.repairLevel === 2) throttle = 0.50; // 50% max
            if (store.userConfig.repairLevel === 3) throttle = 0.75; // 75% max
            tWeight = roundLoad(tWeight * throttle, eqType);
            pData.notes = `REPAIR MODE: Weight restricted to ${throttle*100}% to protect ${store.userConfig.injury}.`;
        }
        
        if (latestLog && !item.isText && !item.isStrengthIsolation && !item.isCoreBlock
            && (phaseStr === 'OffSeason_Strength' || phaseStr === 'OffSeason_Hybrid')) {
            let allExLogs = hist.filter(l => l.exercise === exObj.name);
            const strengthOnly = allExLogs.filter(l => resolveLogPeriodization(l) === 'strength');
            if (strengthOnly.length) allExLogs = strengthOnly;
            // Group by day to check last 2 sessions
            let uniqueDays = [...new Set(allExLogs.map(logDayKey).filter(Boolean))].slice(0, 2);
            let missedConsecutive = 0;
            uniqueDays.forEach(day => {
                let daySets = allExLogs.filter(l => logDayKey(l) === day);
                let failedSets = daySets.filter(l => l.reps < pData.reps || l.rpe === 0); // RIR 0 is absolute failure
                if (failedSets.length > daySets.length / 2) missedConsecutive++; 
            });

            if (missedConsecutive >= 2 && tWeight > 20) {
                // AUTO DELOAD: Drop weight 15%, increase reps to build new tissue
                tWeight = roundLoad(tWeight * 0.85, eqType);
                pData = { ...pData, reps: 8, notes: "AUTO-DELOAD: Plateau detected. Weight dropped 15%, reps increased to 8 to build new tissue." };
            } else {
                const latestDay = logDayKey(latestLog);
                let recentLogs = hist.filter(l => l.exercise === exObj.name && logDayKey(l) === latestDay);
                // Grab the absolute last set completed in that session to check true RIR
                let finalSet = recentLogs.reduce((max, obj) => (obj.sets > max.sets ? obj : max), recentLogs[0]);
                
                if (finalSet && finalSet.rpe > 2) {
                    tWeight += 2.5; 
                    pData = { ...pData, notes: "AUTO-PROGRESSION: Last session felt easy (RIR > 2). Load increased." };
                } else {
                    let successSets = recentLogs.filter(l => l.reps >= pData.reps && l.rpe >= 1); // RIR >= 1 is successful
                    if (successSets.length >= 2) tWeight += 2.5; 
                }
            }
        }

        if (latestLog && !item.isText && item.isStrengthIsolation) {
            const prog = progressStrengthIsolationWeight(exObj.name, hist, tWeight, (w) => roundLoad(w, eqType));
            tWeight = prog.weight;
            if (prog.note) itemNoteExtra = (itemNoteExtra ? itemNoteExtra + ' ' : '') + prog.note;
        }

        if (latestLog && !item.isText && (useHypertrophy || phaseStr === 'OffSeason_Hypertrophy') && !item.isStrengthIsolation) {
            const prog = progressHypertrophyWeight(exObj.name, hist, tWeight, 10);
            tWeight = prog.weight;
            if (prog.note) itemNoteExtra = (itemNoteExtra ? itemNoteExtra + ' ' : '') + prog.note;
        }

        let setsArray = [];
        // Strength gym-time budget wins over periodization set count (e.g. 5x5)
        const plannedSets = (typeof item.sets === 'number') ? item.sets
            : (typeof item.setsOverride === 'number') ? item.setsOverride
            : (item.isAux ? 3 : null);
        let activeSets = (plannedSets != null) ? plannedSets : (pData.sets || 3);
        if (useHypertrophy && !item.isText && !item.isAux && !item.isLactateHit) activeSets = 3;
        if (item.isText) activeSets = (item.isLactateHit && plannedSets != null) ? plannedSets : 1;
        if (item.isLactateHit && Array.isArray(item.lactateRows) && item.lactateRows.length) {
            activeSets = item.lactateRows.length;
        }
        // Steady-state cardio is one continuous session (distance + duration), not multiple sets
        if (!item.isLactateHit && (isCardioEx || /steady\s*state\s*cardio/i.test(item.name || exObj.name || ''))) activeSets = 1;
        const itemReps = item.isAux ? 12
            : (item.isStrengthIsolation ? (item.targetReps || 8)
                : (useHypertrophy ? 10 : pData.reps));
        let itemRest = item.isAux ? 60
            : (item.isStrengthIsolation ? (item.restSec || 120)
                : (useHypertrophy ? 90
                    : (item.restSec != null
                        ? item.restSec
                        : (isUnilateralCompound(exObj.name) ? 200 : (pData.rest_sec || 240)))));
        // Manual gym session: override work rest from session prefs
        if (store.manualGymRest?.active) {
            if (store.manualGymRest.custom) {
                itemRest = 0;
            } else {
                const isIso = !!item.isIsolation || !!item.isStrengthIsolation;
                itemRest = isIso
                    ? (Number(store.manualGymRest.isolationSec) || 90)
                    : (Number(store.manualGymRest.compoundSec) || 180);
            }
        }

        // Per-exercise warmups (strength + hypertrophy) — same warmup weight logic
        if (!item.isText && !isCardioEx && !item.isLactateHit) {
            const wuOpts = {
                workRestSec: itemRest,
                mode: (store.manualGymRest?.active && store.manualGymRest?.custom) ? 'none'
                    : (store.manualGymRest?.active ? 'manual' : 'phase')
            };
            const wu = buildHypertrophyWarmupSets(
                exObj.name,
                tWeight,
                itemReps,
                !!item.isIsolation || !!item.isStrengthIsolation,
                wuOpts
            );
            setsArray.push(...wu);
        }

        for (let i = 0; i < activeSets; i++) {
            if (item.isLactateHit && !item.isText) {
                const row = (item.lactateRows && item.lactateRows[i]) || null;
                const workSec = Number(row?.workSec || row?.durationSec || item.workSec) || 30;
                const restSec = Number(row?.restSec != null ? row.restSec : item.restSec) || 0;
                setsArray.push({
                    weight: 0,
                    reps: 0,
                    duration_sec: workSec,
                    rpe: '',
                    completed: false,
                    isLactateHit: true,
                    restTime: restSec,
                    notes: row?.notes || item.notes || undefined,
                    targetDisplay: row?.targetDisplay || undefined,
                    targetRate: row?.targetRate || undefined,
                    targetValue: row?.targetValue || undefined
                });
            } else if (item.isText) {
                setsArray.push({
                    weight: 0,
                    reps: item.reps,
                    rpe: 0,
                    completed: false,
                    isText: true,
                    isLactateHit: !!item.isLactateHit,
                    restTime: item.isLactateHit && item.restSec > 0 ? item.restSec : undefined,
                    notes: item.notes || undefined
                });
            } else if (isCardioEx) {
                setsArray.push({
                    weight: 0,
                    reps: 0,
                    distance_km: tDist || 0,
                    time_minutes: tMins,
                    rpe: '',
                    completed: false,
                    prevDist: tDist || 0
                });
            } else {
                setsArray.push({
                    weight: tWeight,
                    reps: itemReps,
                    rpe: 2,
                    completed: false,
                    restTime: itemRest,
                    prevWeight: latestLog ? latestLog.weight_kg : 0,
                    prevDist: tDist
                });
            }
        }
        
        let setNote = (item.notes ? item.notes : pData.notes) + itemNoteExtra;
        const exerciseOut = item.isLactateHit
            ? { ...exObj, domain: 'cardio', muscle_group: exObj.muscle_group || 'cardio' }
            : exObj;
        store.currentGhostItems.push({
            exercise: exerciseOut,
            note: setNote,
            sets: setsArray,
            plannedSets: activeSets,
            slotLabel: item.slotLabel || null,
            isIsolation: !!item.isIsolation || !!item.isStrengthIsolation,
            isStrengthIsolation: !!item.isStrengthIsolation,
            isStrengthCompound: !!item.isStrengthCompound,
            role: item.role || null,
            isLactateHit: !!item.isLactateHit,
            lactateRows: item.lactateRows || null,
            needsWeightFind: !!needsWeightFind,
            needsBwGate: !!needsBwGate,
            weightFinderResolved: false,
            bwGateResolved: false
        });
    });

    renderGhostWorkoutFromItems();
    } catch (err) {
        console.error('generateWorkoutTemplate failed:', err);
        const content = document.getElementById('ghost-content');
        const container = document.getElementById('ghost-template-container');
        if (content) {
            content.innerHTML = `<div style="text-align:center;"><p style="font-size:13px; color:#FF3B30; font-weight:bold;">Could not build GPS workout.</p><p style="font-size:11px; color:var(--text-muted); margin-top:10px;">${String(err && err.message ? err.message : err)}</p></div>`;
        }
        if (container) container.classList.remove('hidden');
    }
}

import { store } from '../state/store.js';
import { excludeBannedExercises } from './bans.js';
import { PERIODIZATION, getPhaseLoadMultiplier, getSeasonPhase, isGuidanceOff } from './fitness-hud.js';
import { buildLactateIntervalPlan } from './lactate-engine.js';
import { dateToISO, getLactateSlotForDate, isLactateEvent, isLiftingEvent, isSteadyCardio, openVideoModal } from './route-planner.js';
import { SPORT_MATRIX } from './sports-matrix.js';
import { buildAuxiliaryExerciseList, buildStrengthSessionRoutine, getAttachedAuxForStrengthDay, getGymPlanPrefs, isStrengthFocus } from './strength-engine.js';
import {
    buildHypertrophyWarmupSets,
    equipmentForExercise,
    getDumbbellIncrement,
    getHypertrophySessionRoutine,
    isHypertrophyFocus,
    isHypertrophyPhase,
    progressHypertrophyWeight,
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
import { roundToEquipment } from './thermodynamics.js';
import { renderActiveLog } from '../ui/templates.js';

// ==========================================
// 8. ELITE WORKOUT ENGINE (DRIVE TAB)
// ==========================================
export function addExerciseToActiveLog() {
    const select = document.getElementById('select-exercise');
    if(!select.value) return;
    const ex = store.globalExerciseDB.find(e => e.id == select.value);
    
    if(store.fatigueLockouts[ex.muscle_group]) {
        if(!confirm(`System Optimization Notice: The [${ex.muscle_group.toUpperCase()}] muscle group is in a recovery phase. Loading this mechanical pathway may be suboptimal. Proceed with override?`)) { select.value = ''; return; }
    }
    store.activeLog.items.push({ exercise: ex, sets: [{ weight: 0, reps: 0, distance_km: 0, time_minutes: 0, rpe: 2, completed: false }] }); // rpe variable used for RIR internally to avoid breaking DB
    select.value = ''; renderActiveLog();
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
        plannedSets: rounds
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
    let focus = document.getElementById('today-focus').value;
    store.currentGhostItems = [];

    if (isGuidanceOff('workout')) {
        // Manual Steady / Lactate still gets the planned-style template when the user picks that type
        const forced = window.manualSessionKind || '';
        const allowForced = isSteadyCardio(forced) || isLactateEvent(forced);
        if (!allowForced) {
            content.innerHTML = "<div style='text-align:center;'><p style='font-size:13px; color:var(--text-muted); font-weight:bold;'>Workout guidance off</p><p style='font-size:11px; color:var(--text-muted); margin-top:10px;'>No session will be generated. Switch Workout back on in Tracker (Settings) to resume programming.</p></div>";
            container.classList.remove('hidden');
            const lockBtn = document.getElementById('btn-lock-in-route');
            if (lockBtn) lockBtn.style.display = 'none';
            return;
        }
    }

    if (focus === 'Game') {
        content.innerHTML = "<div style='text-align:center;'><p style='font-size:13px; color:#0A84FF; font-weight:bold;'>Match Day — lifting locked.</p><p style='font-size:11px; color:var(--text-muted); margin-top:10px;'>Compete. Recover. Rest is auto-scheduled tomorrow.</p></div>";
        container.classList.remove('hidden'); return;
    }
    if (focus === 'Rest') {
        content.innerHTML = "<div style='text-align:center;'><p style='font-size:13px; color:var(--gold-accent); font-weight:bold;'>Rest Day</p><p style='font-size:11px; color:var(--text-muted); margin-top:10px;'>Prioritize sleep and hydration. Optional Zone 2 steady is available from Plan if you feel good.</p></div>";
        container.classList.remove('hidden'); return;
    }
    if (focus === 'Rest (Cardio Only)') {
        // Treat as optional steady session when user starts from Plan
        focus = 'Cardio (Steady)';
        document.getElementById('today-focus').value = 'Cardio (Steady)';
    }
    if (focus === 'Practice' && !(window.todayRouteEvents || []).some(isLiftingEvent)) {
        content.innerHTML = "<div style='text-align:center;'><p style='font-size:13px; color:#0A84FF; font-weight:bold;'>Practice Day</p><p style='font-size:11px; color:var(--text-muted); margin-top:10px;'>Use Log on the practice card under Exercise Plan to open the brain dump.</p></div>";
        container.classList.remove('hidden'); return;
    }

    let hist = [];
    try {
        const res = await store.supabaseClient.from('workout_logs').select('*').order('created_at', { ascending: false });
        if (!res.error && Array.isArray(res.data)) hist = res.data;
    } catch (e) {
        console.warn('workout_logs history unavailable:', e);
    }
    const logDayKey = (row) => {
        const raw = row && row.created_at;
        if (!raw) return '';
        return String(raw).includes('T') ? String(raw).split('T')[0] : String(raw).slice(0, 10);
    };
    const EX_ALIASES = {
        'Side Sit': 'Side-sit on Hyperextension Bench',
        'Sidesit': 'Side-sit on Hyperextension Bench',
        'Back Squat': 'Squat',
        'DB Bench Press': 'Dumbbell Bench Press',
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

    let html = ''; let isElite = store.userConfig.sport !== 'None'; let mainRoutine = [];
    let phaseStr = getSeasonPhase();
    let pData = PERIODIZATION[phaseStr] || PERIODIZATION['OffSeason_Strength'];
    let sportData = (isElite && SPORT_MATRIX[store.userConfig.sport]) ? SPORT_MATRIX[store.userConfig.sport] : SPORT_MATRIX['None'];

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

    const useHypertrophy = isHypertrophyFocus(focus)
        || (isHypertrophyPhase(phaseStr) && (isStrengthFocus(focus) || focus === 'Full Body / Strength'));
    if (useHypertrophy) {
        // Stable day plan — same exercises until date / prefs / session kind change
        const built = getHypertrophySessionRoutine(focus);
        window.currentHypertrophySession = built;
        window.currentStrengthSession = null;
        built.items.forEach(item => mainRoutine.push(item));
    } else if (focus === 'Full Body / Strength' || isStrengthFocus(focus)) {
        const prefs = getGymPlanPrefs();
        const built = buildStrengthSessionRoutine(focus, sportData, prefs.setBudget);
        built.items.forEach(item => mainRoutine.push(item));
        // Persist which session ran for legacy Strength labels
        localStorage.setItem('ascensus_strength_ab', built.session);
        window.currentStrengthSession = built.session;

        // Attach auxiliary work to strength when prefs say so (time / gym-day convenience)
        const todayISO = dateToISO(new Date());
        getAttachedAuxForStrengthDay(todayISO, sportData).forEach(item => {
            const auxSets = item.setsOverride != null ? item.setsOverride : (item.sets != null ? item.sets : 2);
            mainRoutine.push({
                ...item,
                sets: auxSets,
                setsOverride: auxSets,
                notes: item.notes || 'Auxiliary finisher'
            });
        });
    } 
    else if (focus === 'Full Body / Power') { 
        pData = PERIODIZATION['PreSeason_Power']; 
        mainRoutine = [
            { name: "Squat Jumps" }, 
            { name: "Single Leg Broad Jumps" }, // Unilateral Power
            { name: "Med Ball Throws" },
            { name: sportData.cardio === 'anaerobic' ? "Side-to-Side Shuffle" : "Clap Pushups" }
        ]; 
    } 
    else if (focus === 'Auxiliary' && !isHypertrophyPhase(phaseStr)) { 
        pData = { reps: 12, sets: 3, rest_sec: 60, notes: "Prehab & Weaknesses. Short rests. Target vulnerable areas." }; 
        buildAuxiliaryExerciseList(sportData).forEach(item => mainRoutine.push(item));
    } else if (focus === 'Auxiliary' && isHypertrophyPhase(phaseStr)) {
        // Hypertrophy has no auxiliary track — treat leftover Aux days as rest guidance
        content.innerHTML = "<div style='text-align:center;'><p style='font-size:13px; color:var(--gold-accent); font-weight:bold;'>No auxiliary in hypertrophy</p><p style='font-size:11px; color:var(--text-muted); margin-top:10px;'>Switch periodization to Strength if you want auxiliary / band sessions, or start a hypertrophy gym day from Plan.</p></div>";
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
        mainRoutine.push({ name: "Steady State Cardio", notes: "Aerobic base. Zone 2. Duration tracked by the session timer." }); 
    }
    else if (isPracticeFocus || isMatchFocus) {
        mainRoutine.push(buildSportSessionBlock(isMatchFocus ? 'match' : 'practice'));
    }

    // 2. COOL-DOWN STRETCH (honours prefs; skipped for steady)
    if (!isSteadyFocus) {
        const stretch = resolveStretchBlock({ context: prepCtx });
        if (stretch) mainRoutine.push(stretch);
    }

    const roundLoad = (val, type) => {
        if (type === 'dumbbell') {
            const step = getDumbbellIncrement();
            return Math.max(step, Math.round((Number(val) || 0) / step) * step);
        }
        if (typeof roundToEquipment === 'function') return roundToEquipment(val, type);
        if (typeof window.roundEquipment === 'function') return window.roundEquipment(val, type);
        return Math.round((Number(val) || 0) / 2.5) * 2.5;
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

        // Bodyweight competency: monthly / permanent swaps before catalogue lookup
        const programmedName = item.isText ? item.name : resolveProgrammedBwName(item.name);
        if (!item.isText && programmedName !== item.name) {
            item = { ...item, name: programmedName, notes: ((item.notes || '') + ` (swapped from bodyweight variant for this month)`).trim() };
        }
        let exObj = getEx(item.name);
        let latestLog = hist.find(l => l.exercise === exObj.name) || null;
        
        // 1RM Calculation Logic — Adaptation uses ~25% so loads stay in true 50-rep territory
        let calcWeight = 20;
        if (store.userConfig.oneRepMax) {
            let mult = getPhaseLoadMultiplier(phaseStr);
            if (exObj.name.includes("Squat") && store.userConfig.oneRepMax.squat > 0) calcWeight = store.userConfig.oneRepMax.squat * mult;
            else if (exObj.name.includes("Bench") && store.userConfig.oneRepMax.bench > 0) calcWeight = store.userConfig.oneRepMax.bench * mult;
            else if (exObj.name.includes("Deadlift") && store.userConfig.oneRepMax.deadlift > 0) calcWeight = store.userConfig.oneRepMax.deadlift * mult;
            else if (!item.isText) calcWeight = Math.max(10, 20 * mult / 0.65); // light default accessories
            const eq0 = equipmentForExercise(exObj.name);
            calcWeight = roundLoad(calcWeight, eq0);
            if (phaseStr === 'OffSeason_Adaptation' && calcWeight < 10) calcWeight = 10;
        }

        // Prefer calculated light loads in Adaptation — never inherit heavy strength-phase logs
        let tWeight;
        if (item.isText) {
            tWeight = 0;
        } else if (phaseStr === 'OffSeason_Adaptation') {
            if (latestLog && Number(latestLog.weight_kg) > 0 && Number(latestLog.weight_kg) <= calcWeight * 1.15) {
                tWeight = Number(latestLog.weight_kg);
            } else {
                tWeight = calcWeight;
            }
        } else {
            tWeight = latestLog ? latestLog.weight_kg : calcWeight;
        }
        let tDist = latestLog ? latestLog.distance_km : 0;
        // Steady duration comes from the session timer at log time — don't prefill a fake target
        let tMins = 0;
        const isCardioEx = ((exObj.domain || '').toLowerCase() === 'cardio');
        const eqType = equipmentForExercise(exObj.name);
        let itemNoteExtra = '';

        // Bodyweight competency ask (hypertrophy 8 / strength 4) — unless already answered this month
        let needsBwGate = false;
        if (!item.isText && !isCardioEx && isBwGateExercise(exObj.name) && needsBwCompetencyAsk(exObj.name)) {
            needsBwGate = true;
            itemNoteExtra = ` Bodyweight check: can you do the required reps? If not, we swap for this month.`;
        }

        // First time THIS exact exercise name is logged — ask for work weight / 10@5 RIR finder
        // History at 0 kg (pure BW) still counts so we don't re-ask every session.
        let needsWeightFind = false;
        if (!item.isText && !isCardioEx && (useHypertrophy || isBwGateExercise(exObj.name))) {
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
            if (isPressUpVariant(exObj.name) && !needsBwGate) {
                tWeight = 0;
            } else if (!needsBwGate && !hasHist && !hasLocal && !latestLog) {
                needsWeightFind = true;
                itemNoteExtra = (itemNoteExtra ? itemNoteExtra + ' ' : '') + 'First time on this exercise: we will ask for your work weight (or help you find 10 reps @ 5 RIR).';
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
        
        if (latestLog && !item.isText && phaseStr === 'OffSeason_Strength') {
            let allExLogs = hist.filter(l => l.exercise === exObj.name);
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

        if (latestLog && !item.isText && (useHypertrophy || phaseStr === 'OffSeason_Hypertrophy')) {
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
        const itemReps = item.isAux ? 12 : (useHypertrophy ? 10 : pData.reps);
        const itemRest = item.isAux ? 60 : (useHypertrophy ? 90 : pData.rest_sec);

        // Per-exercise warmups (strength + hypertrophy)
        if (!item.isText && !isCardioEx && !item.isLactateHit) {
            const wu = buildHypertrophyWarmupSets(exObj.name, tWeight, itemReps, !!item.isIsolation);
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
            isIsolation: !!item.isIsolation,
            role: item.role || null,
            isLactateHit: !!item.isLactateHit,
            lactateRows: item.lactateRows || null,
            needsWeightFind: !!needsWeightFind,
            needsBwGate: !!needsBwGate,
            weightFinderResolved: false,
            bwGateResolved: false
        });
    });

    store.currentGhostItems.forEach(item => {
        if (item.isWarmupGroup) {
            html += `<div style="margin-bottom: 15px; border-bottom: 1px dashed #333; padding-bottom: 10px;">
                <div style="font-size: 12px; color:#D4AF37; font-weight:800; margin-bottom: 4px; text-transform:uppercase;">Warmup</div>
                <div style="font-size: 9px; color:#aaa; margin-bottom: 8px; font-style:italic;">${item.note || 'Includes pulse raising, mobilisation, shoulder warmup & dynamic stretching'}</div>
                <div style="display:flex; justify-content:space-between; font-size:11px; color:#ccc;"><span>Blocks</span><span style="color:#D4AF37; font-weight:bold;">${item.sets.length} parts</span></div>
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
        html += `<div style="margin-bottom: 15px; border-bottom: 1px dashed #333; padding-bottom: 10px;">
            <div style="display:flex; justify-content:space-between; align-items:baseline; gap:8px; margin-bottom: 4px;">
                <div style="font-size: 12px; color:#D4AF37; font-weight:800; text-transform:uppercase;">${item.exercise.name}</div>
                <div style="display:flex; align-items:center; gap:8px;">
                    <button type="button" onclick="openVideoModal('${String(item.exercise.name).replace(/'/g, "\\'")}', 'https://www.youtube.com/embed/placeholder')" style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); padding:4px 8px; border-radius:4px; color:var(--text-silver); font-size:9px; font-family:'Roboto Mono'; font-weight:bold; cursor:pointer;">🎥 FORM</button>
                </div>
            </div>`;
        if (item.note) html += `<div style="font-size: 9px; color:#aaa; margin-bottom: 8px; font-style:italic; display:flex; align-items:center; gap:4px;"><svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg> ${item.note}</div>`;
        
        // Adaptation: reserve a form-video cue under each lift
        if (phaseStr === 'OffSeason_Adaptation' && !item.isWarmupGroup) {
            html += `<div style="font-size:9px; color:var(--text-muted); margin-bottom:8px; font-family:'Roboto Mono'; border:1px dashed var(--border-subtle); border-radius:6px; padding:8px;">Form check space — tap FORM before loading. Keep the bar path identical for all 50 reps.</div>`;
        }

        const workSets = (item.sets || []).filter(s => s && !s.isWarmup && !s.isText && !s.isLactateHit);
        const lactateSets = (item.sets || []).filter(s => s && s.isLactateHit);
        const isCardio = (item.exercise.domain || '').toLowerCase() === 'cardio';

        if (lactateSets.length) {
            lactateSets.forEach((set, idx) => {
                const rest = set.restTime > 0 ? ` · ${set.restTime}s rest` : '';
                html += `<div style="display:flex; justify-content:space-between; font-size:11px; color:#ccc; margin-bottom: 4px;"><span>Interval ${idx + 1}</span><span style="color:#D4AF37; font-weight:bold;">${set.duration_sec}s work${rest}</span></div>`;
            });
        } else if (isCardio && item.sets?.[0]) {
            const set = item.sets[0];
            const dist = set.distance_km > 0 ? `${set.distance_km} km` : 'Distance';
            html += `<div style="display:flex; justify-content:space-between; font-size:11px; color:#ccc; margin-bottom: 4px;"><span>Session</span><span style="color:#D4AF37; font-weight:bold;">${dist} · duration from timer</span></div>`;
        } else if (workSets.length) {
            const sample = workSets[0];
            const nSets = typeof item.plannedSets === 'number' ? item.plannedSets : workSets.length;
            const reps = pData.reps === 50 ? '50' : (sample.reps || pData.reps || 10);
            const load = Number(sample.weight) > 0 ? `${sample.weight}kg` : 'BW';
            html += `<div style="display:flex; justify-content:space-between; font-size:11px; color:#ccc; margin-bottom: 4px;">
                <span>${load}</span>
                <span style="color:#D4AF37; font-weight:bold; font-family:'Roboto Mono';">${nSets}×${reps}</span>
            </div>`;
        } else if ((item.sets || []).some(s => s && s.isText)) {
            const textSet = (item.sets || []).find(s => s && s.isText);
            html += `<div style="display:flex; justify-content:space-between; font-size:11px; color:#ccc; margin-bottom: 4px;"><span>Target</span><span style="color:#D4AF37; font-weight:bold;">${textSet.reps || ''}</span></div>`;
        }
        html += `</div>`;
    });

    if (useHypertrophy && window.currentHypertrophySession) {
        const hs = window.currentHypertrophySession;
        html = `<div style="margin-bottom:14px; padding:10px 12px; border:1px solid rgba(212,175,55,0.35); border-radius:8px; background:rgba(212,175,55,0.06); font-family:'Roboto Mono'; font-size:11px; color:var(--gold-accent); font-weight:800; letter-spacing:0.5px; text-transform:uppercase;">Hypertrophy · ${hs.label || 'Session'} · Stick to rest times</div>` + html;
    } else if (isStrengthFocus(focus) && window.currentStrengthSession) {
        html = `<div style="margin-bottom:14px; padding:10px 12px; border:1px solid rgba(212,175,55,0.35); border-radius:8px; background:rgba(212,175,55,0.06); font-family:'Roboto Mono'; font-size:11px; color:var(--gold-accent); font-weight:800; letter-spacing:1px; text-transform:uppercase;">Strength Session ${window.currentStrengthSession} · Monthly movement picks locked</div>` + html;
    }

    content.innerHTML = html; 
    container.classList.remove('hidden');
    const lockBtn = document.getElementById('btn-lock-in-route');
    if (lockBtn) {
        lockBtn.style.display = '';
        lockBtn.textContent = 'Confirm workout';
    }
    } catch (err) {
        console.error('generateWorkoutTemplate failed:', err);
        content.innerHTML = `<div style="text-align:center;"><p style="font-size:13px; color:#FF3B30; font-weight:bold;">Could not build GPS workout.</p><p style="font-size:11px; color:var(--text-muted); margin-top:10px;">${String(err && err.message ? err.message : err)}</p></div>`;
        container.classList.remove('hidden');
    }
}

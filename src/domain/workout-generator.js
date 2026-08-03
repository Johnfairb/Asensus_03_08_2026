import { store } from '../state/store.js';
import { excludeBannedExercises } from './bans.js';
import { PERIODIZATION, getPhaseLoadMultiplier, getSeasonPhase, isGuidanceOff } from './fitness-hud.js';
import { buildLactateIntervalPlan, getLactateWarmupParts } from './lactate-engine.js';
import { dateToISO, getLactateSlotForDate, isLactateEvent, isLiftingEvent, isSteadyCardio, openVideoModal } from './route-planner.js';
import { SPORT_MATRIX } from './sports-matrix.js';
import { buildAuxiliaryExerciseList, buildStrengthSessionRoutine, getAttachedAuxForStrengthDay, getGymPlanPrefs, isStrengthFocus } from './strength-engine.js';
import {
    buildHypertrophySessionRoutine,
    buildHypertrophyWarmupSets,
    equipmentForExercise,
    getDumbbellIncrement,
    isHypertrophyFocus,
    isHypertrophyPhase,
    progressHypertrophyWeight,
    roundUpLoad
} from './hypertrophy-engine.js';
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
    const domain = (exItem.exercise?.domain || '').toLowerCase();
    const name = exItem.exercise?.name || '';
    // Lactate/HIT intervals are protocol-fixed; steady cardio is a single session
    if (exItem.isLactateHit || (exItem.sets || []).some(s => s.isLactateHit)) return;
    if (domain === 'cardio' && !/sprint|lactate|interval|30s\s*on/i.test(name)) return;
    if (/static\s*stretch/i.test(name)) return;
    const lastSet = exItem.sets[exItem.sets.length - 1] || { weight: 0, reps: 0, distance_km: 0, time_minutes: 0, rpe: 2 };
    exItem.sets.push({ ...lastSet, completed: false, isDropSet: false }); 
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

/** Pair this exercise with the next as a superset (minimal rest between). */
export function addSupersetWithNext(exIdx) {
    const items = store.activeLog.items;
    if (!items[exIdx] || !items[exIdx + 1]) {
        alert('Add another exercise below this one first, then tap Add Superset.');
        return;
    }
    if (items[exIdx].isWarmupGroup || items[exIdx + 1].isWarmupGroup) return;
    if (items[exIdx].isLactateHit || items[exIdx + 1].isLactateHit) return;
    const a = items[exIdx];
    const b = items[exIdx + 1];
    const id = `ss_${Date.now()}`;
    a.supersetId = id;
    b.supersetId = id;
    a.note = ((a.note || '') + ' · Superset A').replace(/^ · /, '');
    b.note = ((b.note || '') + ' · Superset B').replace(/^ · /, '');
    (a.sets || []).forEach(s => { if (!s.isWarmup) s.restTime = 30; });
    (b.sets || []).forEach(s => { if (!s.isWarmup) s.restTime = 90; });
    if (window.currentModalExIdx !== null && window.currentModalExIdx !== undefined) window.renderExerciseSets();
    else renderActiveLog();
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
    const EX_ALIASES = { 'Side Sit': 'Sidesit' };
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
    if (!isSteadyFocus) {
        if (isLactateFocus) {
            // Shorter warmup so HIT block (~20 min) + stretch ≈ 45 min total
            mainRoutine.push({
                name: 'Warmup',
                isWarmupGroup: true,
                warmupParts: getLactateWarmupParts(),
                warmupNote: 'Pulse raising, mobilisation & dynamic stretching'
            });
        } else {
            mainRoutine.push(
                {
                    name: "Warmup",
                    isWarmupGroup: true,
                    warmupParts: [
                        { name: "Pulse Raising", reps: "3-5 Mins", notes: "Light jog, skip, or bike." },
                        { name: "Mobilisation", reps: "10 Reps/Joint", notes: "Neck, shoulders, hips, ankles. [Video available]" },
                        { name: "Shoulder / Dynamic Warmup", reps: "2 Rounds", notes: "Banded dislocates, arm circles, leg swings." },
                        { name: "Dynamic Stretching", reps: "5 Mins", notes: "Walking lunges, high knees, open/close gate." }
                    ],
                    warmupNote: 'Pulse raising, mobilisation, shoulder warmup & dynamic stretching'
                }
            );
        }
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
        // Hypertrophy is default programming — also remaps leftover Strength labels
        const built = buildHypertrophySessionRoutine(focus);
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
                types: sel?.types || ['interval_sprints'],
                slot,
                date: new Date()
            });

        if (plan.isHitClass) {
            mainRoutine.push({
                name: 'HIT Class',
                isText: true,
                isLactateHit: true,
                reps: '~20–45 min',
                notes: plan.summary || 'Log class effort. Recovery is based on your RPE.',
                sets: 1
            });
        } else if ((plan.types || []).length <= 1) {
            const rows = plan.rows || [];
            mainRoutine.push({
                name: rows[0]?.name || 'Interval sprints',
                isLactateHit: true,
                notes: plan.summary || 'Variable work:rest · 10 min HIT block',
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
            summary: plan.summary
        };
    }
    else if (isSteadyCardio(focus) || focus === 'Cardio') { 
        mainRoutine.push({ name: "Steady State Cardio", notes: "Aerobic base. Zone 2. Duration tracked by the session timer." }); 
    }

    // 2. MANDATORY COOL-DOWN BLOCK
    mainRoutine.push({ name: "Static Stretching", isText: true, reps: "~12 mins", notes: "Hold stretches for 30s each. [Video available]" });

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
                notes: part.notes
            }));
            store.currentGhostItems.push({
                exercise: { id: 'WARMUP_GROUP', name: 'Warmup', domain: 'warmup', muscle_group: 'full' },
                note: item.warmupNote || 'Pulse raising, mobilisation, shoulder warmup & dynamic stretching',
                sets: setsArray,
                isWarmupGroup: true
            });
            return;
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

        // First hypertrophy session cue when no history
        if (useHypertrophy && !latestLog && !item.isText) {
            itemNoteExtra = ' First session: choose a weight you can do for ~10 reps with 4–5 RIR.';
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

        // Hypertrophy per-exercise warmups (compounds 2 / isolations 1)
        if (useHypertrophy && !item.isText && !isCardioEx && !item.isLactateHit) {
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
                    notes: row?.notes || item.notes || undefined
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
                    rpe: useHypertrophy ? 4 : 2,
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
            isLactateHit: !!item.isLactateHit
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
        html += `<div style="margin-bottom: 15px; border-bottom: 1px dashed #333; padding-bottom: 10px;">
            <div style="display:flex; justify-content:space-between; align-items:baseline; gap:8px; margin-bottom: 4px;">
                <div style="font-size: 12px; color:#D4AF37; font-weight:800; text-transform:uppercase;">${item.exercise.name}</div>
                <div style="display:flex; align-items:center; gap:8px;">
                    ${(!item.isWarmupGroup) ? `<button type="button" onclick="openVideoModal('${String(item.exercise.name).replace(/'/g, "\\'")}', 'https://www.youtube.com/embed/placeholder')" style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); padding:4px 8px; border-radius:4px; color:var(--text-silver); font-size:9px; font-family:'Roboto Mono'; font-weight:bold; cursor:pointer;">🎥 FORM</button>` : ''}
                    ${(!item.isWarmupGroup && item.sets && item.sets.length && !item.sets[0].isText && (item.exercise.domain || '').toLowerCase() !== 'cardio') ? `<div style="font-size:10px; color:var(--gold-accent); font-family:'Roboto Mono'; font-weight:700; white-space:nowrap;">${item.sets.length} SETS</div>` : ''}
                    ${(!item.isWarmupGroup && (item.exercise.domain || '').toLowerCase() === 'cardio' && item.sets?.[0]) ? `<div style="font-size:10px; color:var(--gold-accent); font-family:'Roboto Mono'; font-weight:700; white-space:nowrap;">TIMER</div>` : ''}
                </div>
            </div>`;
        if (item.note) html += `<div style="font-size: 9px; color:#aaa; margin-bottom: 8px; font-style:italic; display:flex; align-items:center; gap:4px;"><svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg> ${item.note}</div>`;
        
        // Adaptation: reserve a form-video cue under each lift
        if (phaseStr === 'OffSeason_Adaptation' && !item.isWarmupGroup) {
            html += `<div style="font-size:9px; color:var(--text-muted); margin-bottom:8px; font-family:'Roboto Mono'; border:1px dashed var(--border-subtle); border-radius:6px; padding:8px;">Form check space — tap FORM before loading. Keep the bar path identical for all 50 reps.</div>`;
        }
        item.sets.forEach((set, idx) => {
            if (set.isLactateHit && set.duration_sec) {
                const rest = set.restTime > 0 ? ` · ${set.restTime}s rest` : '';
                html += `<div style="display:flex; justify-content:space-between; font-size:11px; color:#ccc; margin-bottom: 4px;"><span>Interval ${idx + 1}</span><span style="color:#D4AF37; font-weight:bold;">${set.duration_sec}s work${rest}</span></div>`;
            } else if (set.isText) {
                html += `<div style="display:flex; justify-content:space-between; font-size:11px; color:#ccc; margin-bottom: 4px;"><span>Target</span><span style="color:#D4AF37; font-weight:bold;">${set.reps}</span></div>`;
            } else if ((item.exercise.domain || '').toLowerCase() === 'cardio') {
                const dist = set.distance_km > 0 ? `${set.distance_km} km` : 'Distance';
                html += `<div style="display:flex; justify-content:space-between; font-size:11px; color:#ccc; margin-bottom: 4px;"><span>Session</span><span style="color:#D4AF37; font-weight:bold;">${dist} · duration from timer</span></div>`;
            } else {
                let restStr = set.restTime ? `<span style="color:#7a7a7a; font-size:9px; margin-right:5px; display:inline-flex; align-items:center; gap:3px;"><svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> ${set.restTime/60}m rest</span>` : '';
                let repText = pData.reps === 50 ? "50 Total" : `${set.reps}`;
                html += `<div style="display:flex; justify-content:space-between; align-items:center; font-size:11px; color:#ccc; margin-bottom: 4px;"><span>Set ${idx+1}</span><div style="display:flex; align-items:center;">${restStr}<span>${set.weight > 0 ? set.weight+'kg' : 'BW'} x ${repText}</span></div></div>`;
            }
        });
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

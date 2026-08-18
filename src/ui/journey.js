import { store } from '../state/store.js';
import { DAILY_HYDRATION_TARGET_L, JOURNAL_MEDIA_DB, JOURNAL_MEDIA_MAX, JOURNAL_MEDIA_MAX_IMAGE_BYTES, JOURNAL_MEDIA_MAX_VIDEO_BYTES, JOURNAL_MEDIA_STORE } from '../config/constants.js';
import { calculateLiveFitnessScores, generateDailyExerciseLog, getTodayFocus } from '../domain/fitness-hud.js';
import { getRecommendedSleepHours, getTodaySleepHours } from '../domain/sleep-rpe.js';
import { HIT_TYPE_OPTIONS, hitTypeLabel } from '../domain/lactate-engine.js';
import {
    dateToISO,
    generateFutureTimeline,
    getDayMacroTargets,
    getWorkoutSessionSnapshot,
    isLactateEvent,
    isSteadyCardio,
    listWorkoutSessionsForDate,
    loadWorkoutSessionSnapshots,
    normalizeLoggedSessionKind,
    prettyWorkoutTypeLabel
} from '../domain/route-planner.js';
import { formatDurationMs, formatExerciseDurationLabel } from './workout-timer.js';
import { buildStructuredStretchParts, stretchPartDisplayLabel } from '../domain/session-prep.js';
import { estimateFoodWaterMl, getHydrationLitersForDate, parseFoodLogDetails } from '../lib/food-parse.js';
import { computeAimBarLayout, formatMacroAimLabel, getMacroRange } from '../lib/macro-range.js';
import { generateDailyMealPlan, generateDailyFoodLog, getPlannedDayCost } from '../domain/meal-planner.js';
import { resolveLogPeriodization } from '../domain/periodization-logs.js';

// ==========================================
// 10. DASHBOARD, FORECAST, & TIMELINE
// ==========================================
export function updateLiveDashboard(todayFoods) {
    store.consumedToday = { cals:0, pro:0, carb:0, fat:0, cost:0, mealsLogged:0, water:0 };
    let completed = { BRK: false, LUN: false, DIN: false, WRK: false };
    document.querySelectorAll('.status-badge').forEach(b => b.classList.remove('completed'));
    
    if (window.weightLoggedToday) document.getElementById('status-badge-weight')?.classList.add('completed');
    if (localStorage.getItem(`sleep_${new Date().toLocaleDateString()}`)) document.getElementById('status-badge-sleep')?.classList.add('completed');

    let uniqueMeals = new Set();
    let foodWaterLiters = 0;
    todayFoods.forEach(log => {
        store.consumedToday.cals += log.calories; store.consumedToday.pro += log.protein;
        store.consumedToday.carb += log.carbs; store.consumedToday.fat += log.fat; store.consumedToday.cost += log.cost;
        
        try {
            const parsed = parseFoodLogDetails(log.food_details);
            parsed.items.forEach(item => {
                if (item.food) foodWaterLiters += estimateFoodWaterMl(item.food, item.mass) / 1000;
            });
        } catch(e) {}

        if(log.meal_name !== 'SNACK') uniqueMeals.add(log.meal_name);
        if(log.meal_name === 'BREAKFAST') completed.BRK = true;
        if(log.meal_name === 'LUNCH') completed.LUN = true;
        if(log.meal_name === 'DINNER') completed.DIN = true;
    });

    store.consumedToday.mealsLogged = uniqueMeals.size;
    const loggedHydrationL = getHydrationLitersForDate(dateToISO(new Date()));
    store.consumedToday.water = foodWaterLiters + loggedHydrationL;

    const targets = store.userConfig.targets || {};
    const setMacroBar = (metric, current, target) => {
        const bar = document.getElementById(`bar-${metric}`);
        const band = document.getElementById(`band-${metric}`);
        const tick = document.getElementById(`tick-${metric}`);
        const txt = document.getElementById(`hud-txt-${metric}`);
        if (!bar || !target || target <= 0) {
            if (tick) tick.classList.add('is-hidden');
            return;
        }

        const range = getMacroRange(metric, target);
        if (metric === 'cost') {
            const budget = store.userConfig.budget || 0;
            if (budget > 0) {
                range.max = Math.min(range.max, budget);
                range.min = Math.min(range.min, range.max);
            }
        }
        const layout = computeAimBarLayout(range, current, target);

        bar.style.width = `${layout.fillPct}%`;
        bar.classList.remove('under', 'in-range', 'over', 'over-target');
        bar.classList.add(layout.state);
        bar.style.setProperty('--in-range-t', String(layout.inRangeT));

        if (band) {
            band.style.left = `${layout.bandLeft}%`;
            band.style.width = `${layout.bandWidth}%`;
            band.style.background = layout.bandGradient;
        }
        if (tick) {
            tick.style.left = `${layout.aimPct}%`;
            tick.classList.remove('is-hidden');
        }
        if (txt) txt.innerHTML = formatMacroAimLabel(metric, current, target);
        return layout.state === 'over';
    };

    const budget = store.userConfig.budget || 0;
    const dayMacros = getDayMacroTargets(getTodayFocus());
    let costAim = 0;
    try {
        costAim = getPlannedDayCost({ tPro: dayMacros.tPro, tCarb: dayMacros.tCarb, forDate: new Date() });
    } catch (e) { /* pantry may not be ready yet */ }
    if (!costAim || costAim <= 0) costAim = budget;

    let isRerouting = false;
    if (targets.cals > 0) {
        if (setMacroBar('cals', store.consumedToday.cals, targets.cals)) isRerouting = true;
        if (setMacroBar('pro', store.consumedToday.pro, targets.pro)) isRerouting = true;
        if (setMacroBar('carb', store.consumedToday.carb, targets.carb)) isRerouting = true;
        if (setMacroBar('fat', store.consumedToday.fat, targets.fat)) isRerouting = true;
        if (setMacroBar('cost', store.consumedToday.cost, costAim)) isRerouting = true;
        setMacroBar('water', store.consumedToday.water, DAILY_HYDRATION_TARGET_L);
        const sleepLogged = getTodaySleepHours();
        const sleepAim = getRecommendedSleepHours();
        setMacroBar('sleep', sleepLogged, sleepAim > 0 ? sleepAim : 8.5);
    }

    const costEl = document.getElementById('hud-txt-cost');
    if (costEl) costEl.innerHTML = formatMacroAimLabel('cost', store.consumedToday.cost, costAim);
    const sleepEl = document.getElementById('hud-txt-sleep');
    if (sleepEl) {
        sleepEl.innerHTML = formatMacroAimLabel('sleep', getTodaySleepHours(), getRecommendedSleepHours() || 8.5);
    }

    const rerouteEl = document.getElementById('reroute-notice');
    if (rerouteEl) {
        if (isRerouting) {
            // Preserve a more specific overflow message if templates already set one
            if (!rerouteEl.innerText || rerouteEl.innerText.includes('Architecture') || rerouteEl.innerText.includes('Rerouting')) {
                rerouteEl.innerText = 'Over target — today adjusted.';
            }
            rerouteEl.style.display = 'block';
        } else {
            rerouteEl.style.display = 'none';
        }
    }

    window.completedStatusGlobal = completed;
    const todayKey = new Date().toLocaleDateString();
    if (store.globalGroupedHistory?.[todayKey]?.hasWorkout) {
        window.completedStatusGlobal.WRK = true;
        document.getElementById('status-badge-workout')?.classList.add('completed');
    }
    if (document.getElementById('today-focus')) {
        let isRest = document.getElementById('today-focus').value === 'Rest';
        if (isRest) document.getElementById('status-badge-workout')?.classList.add('completed');
    }
    try { generateDailyMealPlan(); } catch (e) { /* pantry may not be ready yet */ }
    try { generateDailyFoodLog(); } catch (e) { /* history may not be ready yet */ }
}

export async function loadHistory() {
    const { data: workouts } = await store.supabaseClient.from('workout_logs').select('*');
    const { data: foods } = await store.supabaseClient.from('food_logs').select('*');
    
    store.fatigueLockouts = {}; 
    const fortyEightHoursAgo = new Date(Date.now() - (48 * 60 * 60 * 1000));
    if(workouts && store.globalExerciseDB.length > 0) {
        workouts.forEach(w => {
            if (w.rpe <= 1 && new Date(w.created_at) > fortyEightHoursAgo && resolveLogPeriodization(w) === 'hypertrophy') {
                let ex = store.globalExerciseDB.find(e => e.name === w.exercise); if(ex && ex.muscle_group) store.fatigueLockouts[ex.muscle_group] = true;
            }
        });
    }
    updateSystemReadiness();

    let allLogs = [];
    if(workouts) allLogs.push(...workouts.map(w => ({...w, type: 'workout'})));
    if(foods) allLogs.push(...foods.map(f => ({...f, type: 'food'})));
    allLogs.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));

    store.globalGroupedHistory = allLogs.reduce((acc, log) => {
        const date = new Date(log.created_at).toLocaleDateString();
        if(!acc[date]) acc[date] = { items: [], macros: { cals:0, pro:0, carb:0, fat:0, cost:0 }, hasWorkout: false };
        acc[date].items.push(log);
        if (log.type === 'food') { 
            acc[date].macros.cals += log.calories; 
            acc[date].macros.pro += log.protein; 
            acc[date].macros.carb += log.carbs; 
            acc[date].macros.fat += log.fat; 
            acc[date].macros.cost += log.cost; 
        } 
        else { acc[date].hasWorkout = true; }
        return acc;
    }, {});

    const todayStr = new Date().toLocaleDateString();
    if (store.globalGroupedHistory[todayStr]) {
        updateLiveDashboard(store.globalGroupedHistory[todayStr].items.filter(i => i.type === 'food'));
        if (store.globalGroupedHistory[todayStr].hasWorkout) {
            if (window.completedStatusGlobal) window.completedStatusGlobal.WRK = true;
            document.getElementById('status-badge-workout')?.classList.add('completed');
        }
    } else { updateLiveDashboard([]); }
    
    // Update the Fitness Bars based on loaded history!
    calculateLiveFitnessScores();

    try { getTodayFocus(); } catch (e) { console.warn(e); }
    try { generateDailyExerciseLog(); } catch (e) { console.warn(e); }

    if (!window._adherenceMonth) {
        const now = new Date();
        window._adherenceMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    renderAdherenceCalendar();
    try {
        if (typeof window.renderMonthlySummaryBanner === 'function') window.renderMonthlySummaryBanner();
    } catch (e) { /* ignore */ }
}

export function shiftAdherenceMonth(delta) {
    if (!window._adherenceMonth) {
        const now = new Date();
        window._adherenceMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    window._adherenceMonth = new Date(
        window._adherenceMonth.getFullYear(),
        window._adherenceMonth.getMonth() + delta,
        1
    );
    renderAdherenceCalendar();
}

export function renderAdherenceCalendar() {
    const gridEl = document.getElementById('calendar-grid');
    if (!gridEl) return;

    const targetCals = store.userConfig.targets ? store.userConfig.targets.cals : 2000;
    const targetCost = store.userConfig.budget || 50;

    const now = new Date();
    if (!window._adherenceMonth) {
        window._adherenceMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    const view = window._adherenceMonth;
    const year = view.getFullYear();
    const month = view.getMonth();

    const labelEl = document.getElementById('adherence-month-label');
    if (labelEl) {
        labelEl.innerText = view.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }).toUpperCase();
    }

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startPad = new Date(year, month, 1).getDay(); // 0 = Sunday

    let gridHtml = '';
    for (let i = 0; i < startPad; i++) {
        gridHtml += `<div class="calendar-day" style="background:transparent; border:none; cursor:default; aspect-ratio:1/1;"></div>`;
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const d = new Date(year, month, day);
        const dateStr = d.toLocaleDateString();
        const iso = dateToISO(d);
        const data = store.globalGroupedHistory[dateStr];
        const daySessions = listWorkoutSessionsForDate(iso);
        const dayJournal = loadDayJournal(dateStr);
        const gymJournal = loadGymJournalEntry(dateStr) || loadGymJournalEntry(iso);
        const hasDiary = !!(dayJournal && (
            dayJournal.source === 'practice' ||
            dayJournal.source === 'match' ||
            dayJournal.source === 'gym' ||
            dayJournal.source === 'journal' ||
            dayJournal.type === 'lactate' ||
            dayJournal.type === 'gym' ||
            dayJournal.notes ||
            (dayJournal.media && dayJournal.media.length)
        )) || !!gymJournal
            || daySessions.some(s => (s.items || []).some(it =>
                String(it?.diaryNotes || '').trim() || (Array.isArray(it?.diaryMedia) && it.diaryMedia.length)
            ));
        const hasWorkout = !!(data && data.hasWorkout) || daySessions.length > 0;

        let bgStyle = 'background: var(--bg-surface-elevated); border: 1px solid var(--border-subtle);';
        let markers = '';
        let goldDay = false;

        if (data && data.macros.cals > 0) {
            let calDiff = Math.abs(data.macros.cals - targetCals);
            let overBudget = data.macros.cost > targetCost;

            if (calDiff <= 150 && !overBudget && hasWorkout) {
                goldDay = true;
                bgStyle = 'background: var(--gold-accent); box-shadow: 0 0 8px var(--gold-glow); border:none;';
            } else if (calDiff <= 300) {
                bgStyle = 'background: #A0A0A0; border:none;';
            } else {
                bgStyle = 'background: var(--border-highlight); border:none;';
            }
        } else if (hasWorkout) {
            bgStyle = 'background: var(--bg-surface-elevated); border: 1px solid var(--border-subtle);';
        }

        if (hasWorkout && !goldDay) {
            markers += `<div class="grid-workout-dot" title="Workout"></div>`;
        }

        if (hasDiary) {
            markers += `<div class="grid-diary-star" title="Diary entry">★</div>`;
        }

        const isToday = d.toDateString() === now.toDateString();
        const todayRing = isToday ? 'outline:1px solid var(--gold-accent); outline-offset:1px;' : '';
        const tip = `${dateStr}${hasDiary ? ' — diary' : ''}${hasWorkout ? ' — workout' : ''}`;

        gridHtml += `<div class="calendar-day" style="${bgStyle}${todayRing} position:relative; aspect-ratio:1/1; border-radius:6px; cursor:pointer;" onclick="openDayDetail('${dateStr}', '${iso}')" title="${tip}"><span class="calendar-day-num">${day}</span>${markers}</div>`;
    }

    gridEl.innerHTML = gridHtml;
}

export function updateSystemReadiness() {
    const fatigueText = document.getElementById('hud-txt-fatigue');
    if(!fatigueText) return;
    
    let lockedMuscles = Object.keys(store.fatigueLockouts);
    if(lockedMuscles.length > 0) { 
        fatigueText.innerText = "Locked out: " + lockedMuscles.join(', ');
        fatigueText.style.color = "#FF3B30";
    } else { 
        fatigueText.innerText = "None. All clear.";
        fatigueText.style.color = "var(--text-muted)";
    }
}

setTimeout(() => { getTodayFocus(); generateFutureTimeline(); updateSystemReadiness(); }, 1000);

export async function deleteHistoryLog(table, id) {
    if(!confirm("Erase this execution entirely?")) return;
    await store.supabaseClient.from(table).delete().eq('id', id);
    loadHistory(); closeDayDetail(); 
}

export async function editHistoryFoodMass(logId, itemIndex, newMass) {
    const { data } = await store.supabaseClient.from('food_logs').select('*').eq('id', logId).single();
    if (!data) return;
    const parsed = parseFoodLogDetails(data.food_details);
    let items = parsed.items;
    if (!items[itemIndex]) return;
    items[itemIndex].mass = parseFloat(newMass) || 0;
    
    let pro=0, carb=0, fat=0, cost=0;
    items.forEach(item => { const m = item.mass/100; pro += item.food.protein_per_100g * m; carb += item.food.carbs_per_100g * m; fat += item.food.fat_per_100g * m; cost += item.food.price_per_100g * m; });
    
    const detailsOut = parsed.hydration_ml > 0
        ? { items, hydration_ml: parsed.hydration_ml }
        : items;
    await store.supabaseClient.from('food_logs').update({ calories: Math.round((pro*4)+(carb*4)+(fat*9)), protein: Math.round(pro), carbs: Math.round(carb), fat: Math.round(fat), cost: Math.round(cost*100)/100, food_details: JSON.stringify(detailsOut) }).eq('id', logId);
    await loadHistory();
    // Refresh open meal detail after history reload (macros + quantities)
    if (window._loggedMealDetailId != null && String(window._loggedMealDetailId) === String(logId)
        && typeof window.openLoggedMealDetail === 'function') {
        const allowEdit = !!window._loggedMealAllowEdit;
        window.openLoggedMealDetail(logId, { allowEdit });
    }
}

export async function openDayDetail(dateStr, isoHint) {
    const data = store.globalGroupedHistory[dateStr];
    document.getElementById('modal-date-title').innerText = dateStr;
    const forecast = document.getElementById('day-detail-forecast');
    if (forecast) forecast.classList.add('hidden');
    const summary = document.getElementById('modal-summary');
    if (summary) summary.classList.remove('hidden');
    const logList = document.getElementById('modal-log-list');
    if (logList) logList.classList.remove('hidden');

    const iso = (isoHint && /^\d{4}-\d{2}-\d{2}$/.test(isoHint))
        ? isoHint
        : resolveIsoFromDateStr(dateStr);
    window._adherenceDayIso = iso;
    window._adherenceDaySessions = {};

    const gymJournal = loadGymJournalEntry(dateStr) || loadGymJournalEntry(iso);
    const practiceJournal = loadPracticeJournalEntry(dateStr) || loadPracticeJournalEntry(iso);
    const matchJournal = loadMatchJournalEntry(dateStr) || loadMatchJournalEntry(iso);
    const sessions = listSessionsForAdherenceDay(dateStr, iso);
    const wks = data ? data.items.filter(i => i.type === 'workout') : [];
    const foods = data ? data.items.filter(i => i.type === 'food') : [];

    const hasAnything = !!(data || gymJournal || practiceJournal || matchJournal || sessions.length);

    if (!hasAnything) {
        document.getElementById('modal-summary').innerText = 'No telemetry recorded.';
        document.getElementById('modal-log-list').innerHTML = '';
    } else {
        if (data) {
            const costColor = data.macros.cost > store.userConfig.budget ? 'var(--text-stealth)' : 'var(--text-silver)';
            document.getElementById('modal-summary').innerHTML = `<span style="color:var(--text-main);">${data.macros.cals} kcal</span> | ${data.macros.pro}g pro | <span style="color:${costColor}">£${data.macros.cost.toFixed(2)}</span>`;
        } else if (sessions.some(s => isLactateEvent(s.kind) || s.kind === 'Lactate') || gymJournal?.type === 'lactate' || gymJournal?.hitTypes?.length) {
            document.getElementById('modal-summary').innerHTML = `<span style="color:var(--gold-accent);">Lactate/HIT session on file</span>`;
        } else if (sessions.length) {
            document.getElementById('modal-summary').innerHTML = `<span style="color:var(--gold-accent);">Logged sessions on file</span>`;
        } else if (matchJournal) {
            document.getElementById('modal-summary').innerHTML = `<span style="color:#0A84FF;">Match notes on file</span>`;
        } else if (practiceJournal) {
            document.getElementById('modal-summary').innerHTML = `<span style="color:#0A84FF;">Practice notes on file</span>`;
        } else {
            document.getElementById('modal-summary').innerHTML = `<span style="color:var(--text-silver);">Diary on file</span>`;
        }

        let html = '';

        // Practice / Match / Gym diary blocks (same events as Drive → Log)
        html += renderSportDiaryBlockHtml('Match', matchJournal, wks);
        html += renderSportDiaryBlockHtml('Practice', practiceJournal, wks);
        html += renderGymDiaryBlockHtml(gymJournal);

        foods.forEach(log => {
            let preview = '';
            try {
                const items = parseFoodLogDetails(log.food_details).items || [];
                preview = items.map(it => it.food?._cleanName || it.food?.name).filter(Boolean).slice(0, 3).join(', ');
                if (items.length > 3) preview += '…';
            } catch (e) { /* ignore */ }
            html += `<div style="margin-bottom:16px; padding-bottom:12px; border-bottom: 1px dashed var(--border-highlight);">
                <div style="display:flex; justify-content:space-between; margin-bottom:8px; gap:8px;">
                    <button type="button" onclick="openLoggedMealDetail(${log.id}, { allowEdit: true })" style="background:none; border:none; padding:0; text-align:left; cursor:pointer; min-width:0; flex:1;">
                        <strong style="font-size:10px; color:var(--text-muted); font-family:'Roboto Mono'; text-transform:uppercase; letter-spacing: 1px; display:block;">[ ${log.meal_name} ]</strong>
                        <span style="font-size:12px; color:var(--text-main); font-weight:600; line-height:1.35; display:block; margin-top:6px;">${preview || (Math.round(log.calories || 0) + ' kcal')}</span>
                        <span style="font-size:10px; color:var(--gold-accent); font-family:'Roboto Mono'; margin-top:6px; display:block;">Tap to view / edit quantities</span>
                    </button>
                    <button onclick="deleteHistoryLog('food_logs', ${log.id})" style="background:none; color:var(--text-stealth); border:none; cursor:pointer; font-size:14px; display:flex; align-items:center; flex-shrink:0;"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
                </div>
            </div>`;
        });

        // All Drive → Log workout sessions for this day
        const { lactateBlocks, otherWorkouts, usedLogIds } = splitLactateSessionsFromDay(dateStr, wks, gymJournal, iso);
        const nonLactateSessions = sessions
            .filter(s => !(isLactateEvent(s.kind) || s.kind === 'Lactate'))
            .map(s => hydrateAdherenceSessionItems(s, dateStr, wks));
        nonLactateSessions.forEach((sess) => {
            const idSet = new Set((sess.logIds || []).map(String));
            const names = new Set((sess.items || []).map(it => it.exercise?.name || it.name).filter(Boolean));
            (wks || []).forEach(w => {
                if (idSet.has(String(w.id)) || names.has(w.exercise)) usedLogIds.add(String(w.id));
            });
        });
        const orphanWorkouts = otherWorkouts.filter(l =>
            !usedLogIds.has(String(l.id))
            && l.exercise !== 'Practice'
            && l.exercise !== 'Match'
        );
        if (orphanWorkouts.length) {
            const host = nonLactateSessions.length === 1 && !(nonLactateSessions[0].items || []).length
                ? nonLactateSessions[0]
                : null;
            if (host) {
                host.items = mergeDiaryOntoItems(itemsFromWorkoutLogs(orphanWorkouts), dateStr, iso);
                host.logIds = [...(host.logIds || []), ...orphanWorkouts.map(l => l.id).filter(Boolean)];
                window._adherenceDaySessions[String(host.id)] = host;
                orphanWorkouts.forEach(l => usedLogIds.add(String(l.id)));
            } else {
                nonLactateSessions.push(synthesizeAdherenceSessionFromLogs(dateStr, iso, orphanWorkouts));
            }
        }
        html += renderAdherenceSessionCardsHtml(nonLactateSessions, dateStr, wks, usedLogIds);
        html += renderLactateSessionCardsHtml(lactateBlocks, dateStr);

        // Diary-only lactate day (journal + optional snapshot, no food/history rows)
        if (!lactateBlocks.length && (gymJournal?.type === 'lactate' || gymJournal?.hitTypes?.length)) {
            const snap = sessions.find(s => isLactateEvent(s.kind) || s.kind === 'Lactate');
            const block = {
                sessionId: snap?.id || '',
                dateIso: iso,
                dateStr,
                durationMinutes: Number(snap?.durationMinutes) || 0,
                durationMs: Number(snap?.durationMs) || 0,
                durationLabel: snap?.durationLabel || null,
                rpe: gymJournal.rpe,
                hitTypes: gymJournal.hitTypes || [],
                isHitClass: !!gymJournal.isHitClass,
                lactateSummary: gymJournal.lactateSummary || '',
                items: snap?.items || [],
                logs: [],
                typeLabels: resolveHitTypeLabels({ hitTypes: gymJournal.hitTypes, isHitClass: gymJournal.isHitClass }, gymJournal)
            };
            window._lactateDayBlocks = { [dateStr]: [block], [iso]: [block] };
            html += renderLactateSessionCardsHtml([block], dateStr);
        }

        document.getElementById('modal-log-list').innerHTML = html;

        const mediaJournal = matchJournal?.media?.length ? matchJournal
            : (practiceJournal?.media?.length ? practiceJournal
                : (gymJournal?.media?.length ? gymJournal : null));
        if (mediaJournal?.media?.length) {
            const slot = document.getElementById('day-journal-media-slot');
            if (slot) slot.innerHTML = await buildJournalMediaGalleryHtml(mediaJournal.media);
        }
    }
    document.getElementById('day-detail-modal').classList.remove('hidden');
    const body = document.querySelector('#day-detail-modal .day-detail-body');
    if (body) body.scrollTop = 0;
    setTimeout(() => document.getElementById('day-detail-modal').classList.add('show'), 10);
}
export function closeDayDetail() { document.getElementById('day-detail-modal').classList.remove('show'); setTimeout(() => document.getElementById('day-detail-modal').classList.add('hidden'), 300); }

/** Session length from the workout timer at log time (never interval work time). */
function formatSessionTimerDuration(block) {
    if (!block) return '—';
    if (block.durationLabel) return block.durationLabel;
    if (block.durationMs > 0) return formatDurationMs(block.durationMs);
    if (block.durationMinutes > 0) return formatDurationMs(block.durationMinutes * 60000);
    return '—';
}

function resolveSessionTimerFromLogs(logs = []) {
    // Only session_duration_min — not per-set time_minutes (those are interval work)
    return (logs || []).reduce((m, l) => Math.max(m, Number(l.session_duration_min) || 0), 0);
}

function renderLactateSessionCardsHtml(lactateBlocks, dateStr) {
    let html = '';
    (lactateBlocks || []).forEach((block, idx) => {
        const typesLabel = (block.typeLabels && block.typeLabels.length)
            ? block.typeLabels.join(' · ')
            : 'HIT intervals';
        const durLabel = formatSessionTimerDuration(block);
        const sid = String(block.sessionId || '').replace(/'/g, "\\'");
        const safeDate = String(dateStr).replace(/'/g, "\\'");
        html += `<button type="button" onclick="openLactateSessionDetail('${sid}', '${safeDate}', ${idx})" style="display:block; width:100%; text-align:left; background:none; border:none; padding:0; margin-bottom:16px; padding-bottom:12px; border-bottom: 1px dashed var(--border-highlight); cursor:pointer;">
            <div style="color:var(--gold-accent); font-weight:800; font-family:'Roboto Mono'; font-size:10px; margin-bottom:8px; text-transform:uppercase; letter-spacing:1px;">[ Lactate/HIT session ]</div>
            <div style="font-size:13px; color:var(--text-main); font-weight:700; margin-bottom:6px;">${escapeHtml(typesLabel)}</div>
            <div style="font-size:11px; color:var(--text-silver); font-family:'Roboto Mono';">${escapeHtml(durLabel)}${block.rpe != null ? ` · RPE ${block.rpe}` : ''}</div>
            <div style="font-size:10px; color:var(--gold-accent); font-family:'Roboto Mono'; margin-top:6px;">Tap for details</div>
        </button>`;
    });
    return html;
}

function localeDateEquals(dateStr, iso) {
    try {
        return new Date(`${iso}T12:00:00`).toLocaleDateString() === dateStr;
    } catch (e) {
        return false;
    }
}

function resolveIsoFromDateStr(dateStr) {
    if (!dateStr) return dateToISO(new Date());
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
    if (window._adherenceDayIso && /^\d{4}-\d{2}-\d{2}$/.test(window._adherenceDayIso)) {
        if (localeDateEquals(dateStr, window._adherenceDayIso)) return window._adherenceDayIso;
    }
    const today = new Date();
    if (dateStr === today.toLocaleDateString()) return dateToISO(today);

    try {
        const snaps = Object.values(loadWorkoutSessionSnapshots() || {});
        for (const s of snaps) {
            if (s?.dateIso && localeDateEquals(dateStr, s.dateIso)) return s.dateIso;
        }
    } catch (e) { /* ignore */ }

    const day = store.globalGroupedHistory?.[dateStr];
    if (day?.items?.length) {
        for (const item of day.items) {
            const t = item.timestamp || item.created_at;
            if (!t) continue;
            try {
                const d = new Date(t);
                if (!isNaN(d.getTime()) && d.toLocaleDateString() === dateStr) return dateToISO(d);
            } catch (e) { /* ignore */ }
        }
    }

    if (window._adherenceMonth) {
        const y = window._adherenceMonth.getFullYear();
        const m = window._adherenceMonth.getMonth();
        const daysInMonth = new Date(y, m + 1, 0).getDate();
        for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
            const d = new Date(y, m, dayNum);
            if (d.toLocaleDateString() === dateStr) return dateToISO(d);
        }
    }

    const parsed = new Date(dateStr.includes('T') ? dateStr : dateStr);
    return !isNaN(parsed.getTime()) ? dateToISO(parsed) : dateToISO(new Date());
}

/** Sessions for an adherence day — ISO, locale date, or matching log ids. */
function listSessionsForAdherenceDay(dateStr, isoHint) {
    const iso = (isoHint && /^\d{4}-\d{2}-\d{2}$/.test(isoHint))
        ? isoHint
        : resolveIsoFromDateStr(dateStr);
    const byId = new Map();
    const add = (s) => {
        if (s?.id && !byId.has(String(s.id))) byId.set(String(s.id), s);
    };
    try {
        listWorkoutSessionsForDate(iso).forEach(add);
        Object.values(loadWorkoutSessionSnapshots() || {}).forEach((s) => {
            if (!s) return;
            if (s.dateIso && localeDateEquals(dateStr, s.dateIso)) add(s);
        });
        const dayLogs = store.globalGroupedHistory?.[dateStr]?.items?.filter(i => i.type === 'workout') || [];
        const dayIds = new Set(dayLogs.map(l => String(l.id)));
        if (dayIds.size) {
            Object.values(loadWorkoutSessionSnapshots() || {}).forEach((s) => {
                if ((s?.logIds || []).some(id => dayIds.has(String(id)))) add(s);
            });
        }
    } catch (e) { /* ignore */ }
    return [...byId.values()].sort((a, b) =>
        String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''))
    );
}

function renderSportDiaryBlockHtml(kind, journal, workoutLogs = []) {
    const isMatch = kind === 'Match';
    const logs = (workoutLogs || []).filter(w => w.exercise === kind);
    const jOk = journal && (
        journal.source === kind.toLowerCase()
        || journal.type === kind.toLowerCase()
    );
    if (!logs.length && !jOk) return '';

    const rpe = jOk && journal.rpe != null
        ? journal.rpe
        : (logs[0]?.rpe != null ? logs[0].rpe : '—');
    const notes = jOk && journal.notes
        ? String(journal.notes)
        : '';
    const metaBits = [];
    if (jOk && journal.athletic != null) metaBits.push(`Athletic ${journal.athletic}`);
    if (jOk && journal.mental != null) metaBits.push(`Mental ${journal.mental}`);
    if (jOk && isMatch && journal.matchPerformance != null) metaBits.push(`Match ${journal.matchPerformance}`);

    return `<div style="margin-bottom:16px; padding:14px; border:1px solid rgba(10,132,255,0.35); border-radius:10px; background:rgba(10,132,255,0.06);">
        <div style="font-size:10px; color:#0A84FF; font-family:'Roboto Mono'; font-weight:800; text-transform:uppercase; letter-spacing:1px; margin-bottom:10px;">[ ${kind.toUpperCase()} DIARY ]</div>
        <div style="display:flex; gap:12px; flex-wrap:wrap; margin-bottom:${notes ? '10px' : '0'}; font-family:'Roboto Mono'; font-size:11px; color:var(--text-silver);">
            <span>RPE <strong style="color:var(--text-main);">${rpe}</strong></span>
            ${metaBits.map(b => `<span>${escapeHtml(b)}</span>`).join('')}
        </div>
        ${notes ? `<div style="font-size:13px; color:var(--text-main); line-height:1.5; white-space:pre-wrap;">${escapeHtml(notes)}</div>` : ''}
        ${jOk && journal.media?.length ? `<div id="day-journal-media-slot"></div>` : ''}
    </div>`;
}

/** Gym / lactate diary on adherence day detail (same pattern as practice/match). */
function renderGymDiaryBlockHtml(journal) {
    if (!journal) return '';

    const isLactate = journal.type === 'lactate' || (Array.isArray(journal.hitTypes) && journal.hitTypes.length);
    const fields = journal.fields || {};
    const fieldLines = Object.keys(fields)
        .filter(k => fields[k] != null && fields[k] !== '' && !['rpe', 'mental', 'athletic', 'matchPerformance'].includes(k))
        .map(k => `<div style="display:flex; justify-content:space-between; gap:10px; margin-top:8px; font-size:12px;">
            <span style="color:var(--text-muted);">${escapeHtml(k)}</span>
            <span style="color:var(--text-main); font-weight:700;">${escapeHtml(fields[k])}</span>
        </div>`).join('');

    const hasContent = journal.notes
        || journal.rpe != null
        || journal.mental != null
        || fieldLines
        || (journal.media && journal.media.length)
        || (isLactate && (journal.lactateSummary || journal.hitTypes?.length));
    if (!hasContent) return '';

    const metaBits = [];
    if (journal.mental != null) metaBits.push(`Mental ${journal.mental}`);
    if (isLactate && journal.hitTypes?.length) {
        metaBits.push(journal.hitTypes.map(String).join(' · '));
    }

    const title = isLactate ? 'LACTATE DIARY' : 'WORKOUT DIARY';
    return `<div style="margin-bottom:16px; padding:14px; border:1px solid rgba(212,175,55,0.35); border-radius:10px; background:rgba(212,175,55,0.06);">
        <div style="font-size:10px; color:var(--gold-accent); font-family:'Roboto Mono'; font-weight:800; text-transform:uppercase; letter-spacing:1px; margin-bottom:10px;">[ ${title} ]</div>
        <div style="display:flex; gap:12px; flex-wrap:wrap; margin-bottom:${journal.notes || fieldLines || journal.lactateSummary ? '10px' : '0'}; font-family:'Roboto Mono'; font-size:11px; color:var(--text-silver);">
            ${journal.rpe != null ? `<span>RPE <strong style="color:var(--text-main);">${journal.rpe}</strong></span>` : ''}
            ${metaBits.map(b => `<span>${escapeHtml(b)}</span>`).join('')}
        </div>
        ${journal.lactateSummary ? `<div style="font-size:11px; color:var(--text-muted); margin-bottom:8px;">${escapeHtml(journal.lactateSummary)}</div>` : ''}
        ${journal.notes ? `<div style="font-size:13px; color:var(--text-main); line-height:1.5; white-space:pre-wrap;">${escapeHtml(journal.notes)}</div>` : ''}
        ${fieldLines}
        ${journal.media?.length ? `<div id="day-journal-media-slot"></div>` : ''}
    </div>`;
}

function formatAdherenceCardioPace(distanceKm, timeMinutes) {
    const dist = Number(distanceKm) || 0;
    const mins = Number(timeMinutes) || 0;
    if (!(dist > 0) || !(mins > 0)) return null;
    const ms = (dist / (mins / 60)) / 3.6;
    return `${ms.toFixed(2)} m/s`;
}

function isAdherenceStretchItem(item) {
    if (!item) return false;
    if (item.isStretchGroup || item.isCustomStretch) return true;
    return /stretch/i.test(item.exercise?.name || item.name || '');
}

function adherenceItemDisplayName(item) {
    if (item?.isSuperset && Array.isArray(item.sides) && item.sides.length) {
        const a = item.sides[0]?.exercise?.name || 'A';
        const b = item.sides[1]?.exercise?.name || 'B';
        return `A · ${a} / B · ${b}`;
    }
    return item?.exercise?.name || item?.name || 'Exercise';
}

function exerciseDiaryNameCandidates(item) {
    const names = [];
    const add = (n) => {
        const s = String(n || '').trim();
        if (s && !names.includes(s)) names.push(s);
    };
    add(adherenceItemDisplayName(item));
    add(item?.exercise?.name);
    add(item?.name);
    if (item?.isSuperset && Array.isArray(item.sides)) {
        item.sides.forEach(side => add(side?.exercise?.name || side?.name));
    }
    return names;
}

function exerciseDiaryHasContent(item) {
    if (!item) return false;
    if (String(item.diaryNotes || '').trim()) return true;
    return Array.isArray(item.diaryMedia) && item.diaryMedia.length > 0;
}

function namesMatchExercise(item, exName) {
    const want = String(exName || '').trim().toLowerCase();
    if (!want) return false;
    return exerciseDiaryNameCandidates(item).some(n => n.toLowerCase() === want);
}

/** Copy per-exercise diary notes/media onto reconstructed log items for the same day. */
function mergeDiaryOntoItems(items, dateStr, iso) {
    const list = items || [];
    if (!list.length) return list;
    let snaps = [];
    try {
        snaps = Object.values(loadWorkoutSessionSnapshots() || {});
    } catch (e) {
        return list;
    }
    const dateIso = iso || resolveIsoFromDateStr(dateStr);
    const dayLogs = store.globalGroupedHistory?.[dateStr]?.items?.filter(i => i.type === 'workout') || [];
    const dayIds = new Set(dayLogs.map(l => String(l.id)));
    const daySnaps = snaps.filter(s => {
        if (!s) return false;
        if (dateIso && s.dateIso === dateIso) return true;
        if (s.dateIso && dateStr && localeDateEquals(dateStr, s.dateIso)) return true;
        if (dayIds.size && (s.logIds || []).some(id => dayIds.has(String(id)))) return true;
        return false;
    });
    const byName = new Map();
    daySnaps.forEach(s => {
        (s.items || []).forEach(it => {
            if (!exerciseDiaryHasContent(it)) return;
            exerciseDiaryNameCandidates(it).forEach(n => {
                const key = n.toLowerCase();
                if (!byName.has(key)) {
                    byName.set(key, {
                        diaryNotes: it.diaryNotes || '',
                        diaryMedia: Array.isArray(it.diaryMedia) ? it.diaryMedia : []
                    });
                }
            });
        });
    });
    list.forEach(it => {
        if (exerciseDiaryHasContent(it)) return;
        const hit = exerciseDiaryNameCandidates(it).map(n => byName.get(n.toLowerCase())).find(Boolean);
        if (!hit) return;
        it.diaryNotes = hit.diaryNotes;
        it.diaryMedia = hit.diaryMedia;
    });
    return list;
}

function stretchMuscleLabel(set, index) {
    const raw = stretchPartDisplayLabel(set);
    if (raw && !/^set\s*\d+/i.test(raw) && !/^stretch(ing)?$/i.test(raw) && !/^muscle\s*\d+/i.test(raw)) return raw;
    const parsed = parseStretchPartFields(set);
    if (parsed.partName) {
        return parsed.side ? `${parsed.partName} · ${parsed.side}` : parsed.partName;
    }
    const base = String(set?.baseName || set?.partName || set?.name || '').trim();
    if (base && !/^set\s*\d+/i.test(base) && !/^stretch(ing)?$/i.test(base) && !/^muscle\s*\d+/i.test(base)) {
        return set?.side ? `${base} · ${set.side}` : base;
    }
    return `Muscle ${index + 1}`;
}

function parseStretchPartFields(setOrName) {
    if (setOrName && typeof setOrName === 'object') {
        const partName = String(setOrName.partName || setOrName.baseName || '').trim();
        const side = setOrName.side || null;
        if (partName && !/^stretch(ing)?$/i.test(partName) && !/^set\s*\d+/i.test(partName) && !/^muscle\s*\d+/i.test(partName)) {
            return { partName, baseName: setOrName.baseName || partName, side };
        }
        const fromReps = parseStretchLogSuffix(setOrName.reps);
        if (fromReps.partName) return fromReps;
        return parseStretchLogSuffix(setOrName.name || '');
    }
    return parseStretchLogSuffix(setOrName);
}

function parseStretchLogSuffix(raw) {
    const text = String(raw || '').trim();
    if (!text) return { partName: null, baseName: null, side: null };
    let rest = text;
    const prefixed = rest.match(/^stretch(ing)?(?:\s*[·—–:-]\s*|\s+)(.+)$/i);
    if (prefixed) rest = prefixed[2].trim();
    else if (/^stretch(ing)?$/i.test(rest) || /^set\s*\d+/i.test(rest) || /^muscle\s*\d+/i.test(rest) || /^hold\s+\d+/i.test(rest)) {
        return { partName: null, baseName: null, side: null };
    }
    const sideM = rest.match(/^(.*?)\s*[·—–-]\s*(Left|Right|Finger|Palm)$/i);
    if (sideM && sideM[1].trim()) {
        const partName = sideM[1].trim();
        const sideRaw = sideM[2];
        const side = sideRaw.charAt(0).toUpperCase() + sideRaw.slice(1).toLowerCase();
        const sideNorm = /finger/i.test(side) ? 'Finger' : (/palm/i.test(side) ? 'Palm' : side);
        return { partName, baseName: partName, side: sideNorm };
    }
    if (rest && !/^stretch(ing)?$/i.test(rest) && !/^set\s*\d+/i.test(rest) && !/^muscle\s*\d+/i.test(rest)) {
        return { partName: rest, baseName: rest, side: null };
    }
    return { partName: null, baseName: null, side: null };
}

function cooldownMuscleCatalog(unilateral = true) {
    const parts = buildStructuredStretchParts() || [];
    if (unilateral) {
        return parts.map(p => ({
            partName: p.baseName || p.name,
            baseName: p.baseName || p.name,
            side: p.side || null
        }));
    }
    const seen = new Set();
    const out = [];
    parts.forEach(p => {
        const name = p.baseName || p.name;
        const key = String(name || '').toLowerCase();
        if (!name || seen.has(key)) return;
        seen.add(key);
        out.push({ partName: name, baseName: name, side: null });
    });
    return out;
}

function stretchSetLooksUnnamed(set) {
    const label = stretchMuscleLabel(set, 0);
    return !label || /^set\s*\d+/i.test(label) || /^stretch(ing)?$/i.test(label) || /^muscle\s*\d+/i.test(label);
}

function applyStretchPartToSet(set, part) {
    if (!set || !part) return;
    if (part.partName) set.partName = part.partName;
    if (part.baseName) set.baseName = part.baseName;
    if (part.side) set.side = part.side;
}

function enrichStretchItemLabels(item) {
    if (!isAdherenceStretchItem(item)) return item;
    const sets = item.sets || [];
    sets.forEach((set) => {
        if (!set || !stretchSetLooksUnnamed(set)) return;
        const parsed = parseStretchPartFields(set);
        if (parsed.partName) applyStretchPartToSet(set, parsed);
    });
    if (!sets.length) return item;
    const catalogUni = cooldownMuscleCatalog(true);
    const catalogBi = cooldownMuscleCatalog(false);
    const catalog = sets.length === catalogBi.length && sets.length !== catalogUni.length
        ? catalogBi
        : catalogUni;
    sets.forEach((set, i) => {
        if (!set || !stretchSetLooksUnnamed(set)) return;
        const part = catalog[i];
        if (part) applyStretchPartToSet(set, part);
    });
    return item;
}

function isStretchLogName(exName) {
    return /stretch/i.test(String(exName || ''));
}

function itemsFromWorkoutLogs(logs = []) {
    const byEx = (logs || []).reduce((acc, log) => {
        const rawName = log.exercise || 'Exercise';
        const key = isStretchLogName(rawName) ? '__stretching__' : rawName;
        if (!acc[key]) acc[key] = [];
        acc[key].push(log);
        return acc;
    }, {});
    return Object.keys(byEx).map((exKey) => {
        const rows = byEx[exKey].slice().sort((a, b) => (Number(a.sets) || 0) - (Number(b.sets) || 0));
        const stretch = exKey === '__stretching__' || isStretchLogName(rows[0]?.exercise);
        const item = {
            exercise: { name: stretch ? 'Stretching' : (exKey === '__stretching__' ? 'Stretching' : exKey), domain: stretch ? 'mobility' : (rows[0]?.type || 'strength') },
            name: stretch ? 'Stretching' : exKey,
            isStretchGroup: stretch,
            sets: rows.map((log) => {
                const parsed = stretch ? parseStretchLogSuffix(log.exercise) : { partName: null, baseName: null, side: null };
                return {
                    completed: true,
                    weight: Number(log.weight_kg) || 0,
                    reps: log.reps,
                    distance_km: Number(log.distance_km) || 0,
                    time_minutes: Number(log.time_minutes) || 0,
                    rpe: log.rpe,
                    isText: stretch || !(Number(log.weight_kg) > 0) && !(Number(log.reps) > 0) && !(Number(log.distance_km) > 0),
                    partName: parsed.partName || undefined,
                    baseName: parsed.baseName || undefined,
                    side: parsed.side || undefined
                };
            })
        };
        return enrichStretchItemLabels(item);
    });
}

function logsForAdherenceSession(snap, dateStr, workoutLogs) {
    const logs = workoutLogs || store.globalGroupedHistory?.[dateStr]?.items?.filter(i => i.type === 'workout') || [];
    const idSet = new Set((snap?.logIds || []).map(String));
    const byId = idSet.size ? logs.filter(l => idSet.has(String(l.id))) : [];
    if (byId.length) return byId;
    const names = new Set((snap?.items || []).map(it => it.exercise?.name || it.name).filter(Boolean));
    if (names.size) return logs.filter(l => names.has(l.exercise));
    return [];
}

function sessionKindFromAdherenceItems(items) {
    const list = items || [];
    if (list.some(it => it?.isLactateHit || (it?.sets || []).some(s => s?.isLactateHit))) return 'Lactate';
    const skip = (it) => !!(it?.isStretchGroup || it?.isWarmupGroup || it?.isCustomStretch
        || /stretch|warmup/i.test(it?.exercise?.name || it?.name || ''));
    const work = list.filter(it => !skip(it));
    const hasSteady = work.some(it => it?.isSteadyCardio
        || (it?.exercise?.domain || '').toLowerCase() === 'cardio'
        || /steady/i.test(it?.exercise?.name || it?.name || ''));
    const hasLift = work.some(it => {
        const d = (it?.exercise?.domain || '').toLowerCase();
        return d === 'strength' || d === 'power' || d === 'hypertrophy' || it?.isPower;
    });
    if (hasSteady && !hasLift) return 'Cardio (Steady)';
    if (work.some(it => it?.isPower || (it?.exercise?.domain || '').toLowerCase() === 'power') && !hasSteady) {
        return 'Full Body / Power';
    }
    return null;
}

function resolveAdherenceSessionKind(snap) {
    const kind = snap?.kind;
    const inferred = sessionKindFromAdherenceItems(snap?.items);
    const norm = normalizeLoggedSessionKind(kind);
    if (inferred === 'Cardio (Steady)' && (!kind || kind === 'Workout' || norm === 'Full Body / Strength')) {
        return 'Cardio (Steady)';
    }
    if (inferred && inferred !== 'Full Body / Strength' && (!kind || kind === 'Workout' || norm === 'Full Body / Strength')) {
        return inferred;
    }
    return kind;
}

function hydrateAdherenceSessionItems(snap, dateStr, workoutLogs) {
    if (!snap) return snap;
    const copy = {
        ...snap,
        items: Array.isArray(snap.items) ? snap.items.map(it => ({ ...it, sets: [...(it.sets || [])] })) : []
    };
    if (!copy.items.length) {
        copy.items = itemsFromWorkoutLogs(logsForAdherenceSession(snap, dateStr, workoutLogs));
    }
    copy.items.forEach(enrichStretchItemLabels);
    copy.kind = resolveAdherenceSessionKind(copy);
    mergeDiaryOntoItems(copy.items, dateStr, copy.dateIso);
    if (!window._adherenceDaySessions) window._adherenceDaySessions = {};
    window._adherenceDaySessions[String(copy.id)] = copy;
    return copy;
}

function synthesizeAdherenceSessionFromLogs(dateStr, iso, logs) {
    const items = mergeDiaryOntoItems(itemsFromWorkoutLogs(logs), dateStr, iso);
    const dur = (logs || []).reduce((m, l) => Math.max(m, Number(l.session_duration_min) || 0), 0);
    const hasStretchOnly = items.length > 0 && items.every(it => /stretch/i.test(it.name || '') || it.isStretchGroup);
    const inferred = sessionKindFromAdherenceItems(items);
    const hasCardioLogs = (logs || []).some(l => l.type === 'cardio' || /steady/i.test(l.exercise || ''));
    const kind = hasStretchOnly
        ? 'Workout'
        : (inferred || (hasCardioLogs ? 'Cardio (Steady)' : 'Full Body / Strength'));
    const snap = {
        id: `orphan-day-${iso || dateStr}`,
        dateIso: iso,
        kind,
        items,
        logIds: (logs || []).map(l => l.id).filter(Boolean),
        durationMinutes: dur,
        durationLabel: dur > 0 ? `${dur} min` : null
    };
    if (!window._adherenceDaySessions) window._adherenceDaySessions = {};
    window._adherenceDaySessions[String(snap.id)] = snap;
    return snap;
}

function isAdherenceWarmupSet(set) {
    if (!set) return false;
    if (set.isWarmup) return true;
    const part = String(set.partName || '').trim();
    return /^warmup\b/i.test(part);
}

function adherenceCompletedSets(item) {
    return (item?.sets || []).filter(s => s && s.completed !== false && !s._sessionSkipped);
}

function adherenceWorkSets(item) {
    return adherenceCompletedSets(item).filter(s => !isAdherenceWarmupSet(s) && !s.isText);
}

function adherenceWorkSetCount(item) {
    if (!item || item.isWarmupGroup || item.isStretchGroup || isAdherenceStretchItem(item)) return 0;
    if (item.isSteadyCardio) return 0;
    if (item.isCoreBlock) {
        return adherenceCompletedSets(item).length;
    }
    if (item.isSuperset) {
        const bWork = adherenceCompletedSets(item).filter(s => s.side === 'B' && !isAdherenceWarmupSet(s) && !s.isDropSet);
        if (bWork.length) return bWork.length;
    }
    return adherenceWorkSets(item).filter(s => !s.isDropSet).length;
}

function adherenceWorkSetCountLabel(item) {
    const n = adherenceWorkSetCount(item);
    if (!n) return '';
    if (item?.isCoreBlock) return n === 1 ? '1 circuit' : `${n} circuits`;
    if (item?.isSuperset) return n === 1 ? '1 round' : `${n} rounds`;
    if (item?.isLactateHit) return n === 1 ? '1 interval' : `${n} intervals`;
    return n === 1 ? '1 set' : `${n} sets`;
}

function adherenceSetRowLabel(set, index, { stretch = false, item = null } = {}) {
    if (stretch) return stretchMuscleLabel(set, index);
    if (isAdherenceWarmupSet(set)) {
        const warmups = adherenceCompletedSets(item).filter(isAdherenceWarmupSet);
        const n = warmups.indexOf(set) + 1;
        return `Warmup ${n > 0 ? n : index + 1}`;
    }
    if (item?.isSuperset && set?.side) {
        if (set.isDropSet) return `${set.side} · Drop`;
        const sideSets = adherenceCompletedSets(item).filter(s => s.side === set.side && !isAdherenceWarmupSet(s) && !s.isDropSet);
        const n = sideSets.indexOf(set) + 1;
        return `${set.side} · Set ${n > 0 ? n : index + 1}`;
    }
    const part = String(set?.partName || '').trim();
    if (part && !/^set\s*\d+/i.test(part) && !isAdherenceWarmupSet(set)) return part;
    if (set?.isDropSet) return 'Drop';
    const work = adherenceWorkSets(item);
    const n = work.indexOf(set) + 1;
    return `Set ${n > 0 ? n : index + 1}`;
}

function formatAdherenceSetDetail(set, { stretch = false, lactate = false } = {}) {
    if (!set) return '—';
    if (stretch) {
        if (Number(set.holdSec) > 0) return formatDurationSecShort(set.holdSec);
        if (set.reps && typeof set.reps === 'string' && !/^\d+$/.test(String(set.reps).trim())) {
            return String(set.reps);
        }
        return 'Done';
    }
    if (lactate || set.isLactateHit || Number(set.duration_sec) > 0) {
        const { work, rest } = extractLactateWorkRest(set);
        return `${formatDurationSecShort(work)} action · ${rest > 0 ? formatDurationSecShort(rest) : '—'} rest`;
    }
    const weight = Number(set.weight) || 0;
    const reps = Number(set.reps) || 0;
    if (weight > 0 && reps > 0) return `${weight}kg × ${reps}`;
    if (weight > 0) return `${weight}kg`;
    if (reps > 0) return `${reps} reps`;
    const dist = Number(set.distance_km) || 0;
    const dur = Number(set.time_minutes) || 0;
    const bits = [];
    if (dist > 0) bits.push(`${dist}km`);
    if (dur > 0) bits.push(`${dur} min`);
    const pace = formatAdherenceCardioPace(dist, dur);
    if (pace) bits.push(pace);
    if (bits.length) return bits.join(' · ');
    if (set.reps) return String(set.reps);
    return 'Done';
}

function adherenceLogSets(item, { stretch = false } = {}) {
    return (item?.sets || []).filter(s => {
        if (!s || s.completed === false || s._sessionSkipped) return false;
        if (stretch || item?.isWarmupGroup || item?.isStretchGroup) return true;
        return !isAdherenceWarmupSet(s);
    });
}

function renderAdherenceExerciseLogHtml(item, { lactate = false } = {}) {
    enrichStretchItemLabels(item);
    const timeLabel = formatExerciseDurationLabel(item);
    const timeBanner = timeLabel
        ? `<div style="margin-bottom:14px; padding:12px; border:1px solid var(--border-subtle); border-radius:10px; background:var(--bg-surface-elevated);">
            <div style="font-size:10px; color:var(--text-muted); font-family:'Roboto Mono'; text-transform:uppercase; letter-spacing:0.4px; margin-bottom:6px;">Time on exercise</div>
            <div style="font-size:20px; font-weight:800; color:var(--gold-accent); font-family:'Roboto Mono';">${escapeHtml(timeLabel)}</div>
        </div>`
        : '';
    if (item?.isCoreBlock) {
        const sets = (item.sets || []).filter(s => s && s.completed !== false);
        if (!sets.length) return timeBanner || `<div style="font-size:12px; color:var(--text-muted);">No sets stored</div>`;
        return timeBanner + sets.map((set, si) => {
            const head = set.partName && !/^set\s*\d+/i.test(String(set.partName))
                ? set.partName
                : `Set ${si + 1}`;
            const kids = Array.isArray(set.children) ? set.children : [];
            const kidHtml = kids.length
                ? kids.map(ch => `<div style="display:flex; justify-content:space-between; gap:10px; margin-top:6px; font-size:12px;">
                    <span style="color:var(--text-main);">${escapeHtml(ch.name || 'Exercise')}</span>
                    <span style="color:var(--text-silver); font-family:'Roboto Mono';">${escapeHtml(ch.reps || '')}${Number(ch.weight) > 0 ? ` · ${ch.weight}kg` : ''}</span>
                </div>`).join('')
                : `<div style="margin-top:6px; font-size:12px; color:var(--text-silver); font-family:'Roboto Mono';">${escapeHtml(formatAdherenceSetDetail(set, {}))}</div>`;
            return `<div style="margin-bottom:12px; padding-bottom:12px; border-bottom:1px solid var(--border-subtle);">
                <div style="font-size:13px; color:var(--text-main); font-weight:700;">${escapeHtml(head)}</div>
                ${kidHtml}
            </div>`;
        }).join('');
    }
    const stretch = isAdherenceStretchItem(item);
    let rows = adherenceLogSets(item, { stretch });
    if (!rows.length && !stretch) {
        rows = adherenceCompletedSets(item);
    }
    if (!rows.length) return timeBanner || `<div style="font-size:12px; color:var(--text-muted);">No sets stored</div>`;
    return timeBanner + rows.map((set, i) => {
        const label = adherenceSetRowLabel(set, i, { stretch, item });
        const detail = formatAdherenceSetDetail(set, { stretch, lactate: lactate || !!item.isLactateHit });
        return `<div style="display:flex; justify-content:space-between; align-items:baseline; gap:10px; margin-bottom:10px; padding-bottom:10px; border-bottom:1px solid var(--border-subtle);">
            <div style="font-size:13px; color:var(--text-main); font-weight:700; min-width:0;">${escapeHtml(label)}</div>
            <div style="font-size:12px; color:var(--text-silver); font-family:'Roboto Mono'; font-weight:600; text-align:right; flex-shrink:0;">${escapeHtml(detail)}</div>
        </div>`;
    }).join('');
}

function renderAdherenceSessionCardsHtml(sessions, dateStr, workoutLogs, usedLogIds) {
    let html = '';
    (sessions || []).forEach(sess => {
        const hydrated = hydrateAdherenceSessionItems(sess, dateStr, workoutLogs);
        const label = prettyWorkoutTypeLabel(hydrated.kind);
        const idSet = new Set((hydrated.logIds || []).map(String));
        const itemNames = new Set((hydrated.items || []).map(it => it.exercise?.name || it.name).filter(Boolean));
        (workoutLogs || []).forEach(w => {
            if (idSet.has(String(w.id)) || itemNames.has(w.exercise)) usedLogIds.add(String(w.id));
        });
        const isLactate = isLactateEvent(hydrated.kind) || hydrated.kind === 'Lactate';
        const durMin = Number(hydrated.durationMinutes) || 0;
        const durLabel = hydrated.durationLabel || (durMin > 0 ? `${durMin} min` : '');
        const sid = String(hydrated.id || '').replace(/'/g, "\\'");
        const safeDate = String(dateStr).replace(/'/g, "\\'");
        const openAction = isLactate
            ? `openLactateSessionDetail('${sid}', '${safeDate}', 0)`
            : `openAdherenceSessionDetail('${sid}', '${safeDate}')`;
        html += `<button type="button" onclick="${openAction}" style="display:block; width:100%; text-align:left; background:none; border:none; padding:0; margin-bottom:16px; padding-bottom:12px; border-bottom: 1px dashed var(--border-highlight); cursor:pointer;">
            <div style="color:var(--gold-accent); font-weight:800; font-family:'Roboto Mono'; font-size:10px; margin-bottom:8px; text-transform:uppercase; letter-spacing:1px;">[ ${escapeHtml(label)} ]</div>
            ${durLabel ? `<div style="font-size:11px; color:var(--text-silver); font-family:'Roboto Mono'; margin-bottom:8px;">${escapeHtml(durLabel)}${hydrated.rpe != null ? ` · RPE ${hydrated.rpe}` : ''}</div>` : ''}
            <div style="font-size:10px; color:var(--gold-accent); font-family:'Roboto Mono'; margin-top:6px;">Tap to view exercises</div>
        </button>`;
    });
    return html;
}

function renderAdherenceSessionMetaCards(snap) {
    const durLabel = snap.durationLabel
        || (snap.durationMs > 0 ? formatDurationMs(snap.durationMs) : (snap.durationMinutes > 0 ? `${snap.durationMinutes} min` : '—'));
    const isSteady = isSteadyCardio(snap.kind) || /steady|cardio\s*\(steady\)/i.test(String(snap.kind || ''));
    let cardioMeta = null;
    const cardioItem = (snap.items || []).find(item => {
        if (item?.isSteadyCardio) return true;
        if (!isSteady) return false;
        const domain = (item?.exercise?.domain || '').toLowerCase();
        const sets = item?.sets || [];
        return domain === 'cardio'
            || /steady\s*state/i.test(item?.exercise?.name || item?.name || '')
            || sets.some(s => Number(s?.distance_km) > 0 || (Number(s?.time_minutes) > 0 && !(Number(s?.weight) > 0) && !(Number(s?.reps) > 0)));
    });
    if (cardioItem) {
        const rows = (cardioItem.sets || []).filter(s => s && s.completed !== false);
        const dist = rows.map(s => Number(s.distance_km) || 0).find(n => n > 0) || 0;
        const setDur = rows.map(s => Number(s.time_minutes) || 0).find(n => n > 0) || 0;
        const durMin = setDur || Number(snap.durationMinutes) || 0;
        cardioMeta = {
            distance: dist,
            durationLabel: setDur > 0
                ? `${setDur} min`
                : (snap.durationLabel || (durMin > 0 ? `${durMin} min` : '—')),
            pace: formatAdherenceCardioPace(dist, durMin)
        };
    }

    const cards = [];
    if (cardioMeta) {
        cards.push(`<div style="padding:12px; border:1px solid var(--border-subtle); border-radius:10px; background:var(--bg-surface-elevated);">
            <div style="font-size:10px; color:var(--text-muted); font-family:'Roboto Mono'; text-transform:uppercase; letter-spacing:0.4px; margin-bottom:6px;">Time</div>
            <div style="font-size:20px; font-weight:800; color:var(--gold-accent); font-family:'Roboto Mono';">${escapeHtml(cardioMeta.durationLabel)}</div>
        </div>`);
        cards.push(`<div style="padding:12px; border:1px solid var(--border-subtle); border-radius:10px; background:var(--bg-surface-elevated);">
            <div style="font-size:10px; color:var(--text-muted); font-family:'Roboto Mono'; text-transform:uppercase; letter-spacing:0.4px; margin-bottom:6px;">Distance</div>
            <div style="font-size:20px; font-weight:800; color:var(--text-main); font-family:'Roboto Mono';">${cardioMeta.distance > 0 ? `${cardioMeta.distance} km` : '—'}</div>
        </div>`);
        if (cardioMeta.pace) {
            cards.push(`<div style="padding:12px; border:1px solid var(--border-subtle); border-radius:10px; background:var(--bg-surface-elevated);">
                <div style="font-size:10px; color:var(--text-muted); font-family:'Roboto Mono'; text-transform:uppercase; letter-spacing:0.4px; margin-bottom:6px;">Pace</div>
                <div style="font-size:20px; font-weight:800; color:var(--gold-accent); font-family:'Roboto Mono';">${escapeHtml(cardioMeta.pace)}</div>
            </div>`);
        }
    } else {
        cards.push(`<div style="padding:12px; border:1px solid var(--border-subtle); border-radius:10px; background:var(--bg-surface-elevated);">
            <div style="font-size:10px; color:var(--text-muted); font-family:'Roboto Mono'; text-transform:uppercase; letter-spacing:0.4px; margin-bottom:6px;">Duration</div>
            <div style="font-size:20px; font-weight:800; color:var(--gold-accent); font-family:'Roboto Mono';">${escapeHtml(durLabel)}</div>
        </div>`);
    }
    if (snap.rpe != null) {
        cards.push(`<div style="padding:12px; border:1px solid var(--border-subtle); border-radius:10px; background:var(--bg-surface-elevated);">
            <div style="font-size:10px; color:var(--text-muted); font-family:'Roboto Mono'; text-transform:uppercase; letter-spacing:0.4px; margin-bottom:6px;">RPE</div>
            <div style="font-size:20px; font-weight:800; color:var(--text-main); font-family:'Roboto Mono';">${snap.rpe}</div>
        </div>`);
    }
    return cards.join('');
}

function renderAdherenceSessionSheet() {
    const snap = window._openGymSessionSnap;
    const sessionId = window._adherenceSessionId;
    const dateStr = window._adherenceSessionDate;
    const exerciseIndex = window._adherenceExerciseIndex;
    const sheet = document.getElementById('meal-detail-sheet');
    const titleEl = document.getElementById('meal-detail-title');
    const subEl = document.getElementById('meal-detail-subtitle');
    const macrosEl = document.getElementById('meal-detail-macros');
    const foodsEl = document.getElementById('meal-detail-foods');
    const actionsEl = document.getElementById('meal-detail-actions');
    if (!snap || !sheet || !foodsEl) return;

    const label = prettyWorkoutTypeLabel(snap.kind);
    const isLactate = isLactateEvent(snap.kind) || snap.kind === 'Lactate';
    const sid = String(sessionId || snap.id || '').replace(/'/g, "\\'");
    const safeDate = String(dateStr || snap.dateIso || '').replace(/'/g, "\\'");
    const item = Number.isInteger(exerciseIndex) ? (snap.items || [])[exerciseIndex] : null;

    if (item) {
        if (titleEl) titleEl.textContent = adherenceItemDisplayName(item);
        if (subEl) subEl.textContent = label;
        if (macrosEl) macrosEl.innerHTML = '';
        foodsEl.innerHTML = `
            <button type="button" onclick="backToAdherenceSession()" style="background:none; border:none; padding:0; margin-bottom:14px; cursor:pointer; font-size:11px; color:var(--gold-accent); font-family:'Roboto Mono';">← Back to session</button>
            ${renderAdherenceExerciseLogHtml(item, { lactate: isLactate || !!item.isLactateHit })}
            ${renderAdherenceExerciseDiaryHtml(item)}`;
        if (actionsEl) {
            actionsEl.classList.remove('hidden');
            actionsEl.innerHTML = `
                <div style="display:flex; flex-direction:column; gap:8px;">
                    <button type="button" class="btn-primary is-secondary" style="margin:0;" onclick="backToAdherenceSession()">Back to session</button>
                    <button type="button" class="btn-primary is-secondary" style="margin:0;" onclick="editLoggedWorkoutSession('${sid}')">Edit workout</button>
                </div>`;
        }
        sheet.classList.remove('hidden');
        fillAdherenceExerciseDiaryMedia(item, dateStr || snap.dateIso);
        return;
    }

    if (titleEl) titleEl.textContent = label;
    if (subEl) subEl.textContent = dateStr || snap.dateIso || '';
    if (macrosEl) macrosEl.innerHTML = renderAdherenceSessionMetaCards(snap);

    let body = '';
    (snap.items || []).forEach((exItem, idx) => {
        const name = adherenceItemDisplayName(exItem);
        const diaryHint = exerciseDiaryHasContent(exItem) ? ' · diary' : '';
        const timeLabel = formatExerciseDurationLabel(exItem);
        const setCountLabel = adherenceWorkSetCountLabel(exItem);
        const tapBits = [setCountLabel, 'Tap to view log' + diaryHint].filter(Boolean).join(' · ');
        body += `<button type="button" onclick="openAdherenceExerciseLog(${idx})" style="display:block; width:100%; text-align:left; background:none; border:none; padding:0; margin-bottom:14px; padding-bottom:12px; border-bottom:1px solid var(--border-subtle); cursor:pointer;">
            <div style="display:flex; justify-content:space-between; align-items:baseline; gap:10px;">
                <div style="font-size:13px; color:var(--text-main); font-weight:700; min-width:0;">${escapeHtml(name)}</div>
                ${timeLabel ? `<div class="exercise-log-time" style="flex-shrink:0;">${escapeHtml(timeLabel)}</div>` : ''}
            </div>
            <div style="font-size:10px; color:var(--gold-accent); font-family:'Roboto Mono'; margin-top:6px;">${escapeHtml(tapBits)}</div>
        </button>`;
    });
    foodsEl.innerHTML = (body || `<div style="font-size:12px; color:var(--text-muted);">No exercises stored</div>`)
        + `<div id="gym-session-diary-panel" style="margin-top:12px;"></div>`;
    window._gymSessionDiaryOpen = false;

    if (actionsEl) {
        actionsEl.classList.remove('hidden');
        actionsEl.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:8px;">
                <button type="button" class="btn-primary is-secondary" style="margin:0;" onclick="editLoggedWorkoutSession('${sid}')">Edit workout</button>
                <button type="button" id="btn-gym-diary" class="btn-primary is-secondary" style="margin:0;" onclick="showGymSessionDiary('${safeDate}')">View diary</button>
            </div>`;
    }
    sheet.classList.remove('hidden');
}

/** Open a non-lactate logged session from the adherence calendar (mirrors Drive → Log). */
export function openAdherenceSessionDetail(sessionId, dateStr) {
    const snap = getWorkoutSessionSnapshot(sessionId)
        || window._adherenceDaySessions?.[String(sessionId)]
        || null;
    if (!snap) {
        alert('Could not find that session.');
        return;
    }
    const hydrated = hydrateAdherenceSessionItems(snap, dateStr);
    window._openGymSessionSnap = hydrated;
    window._adherenceSessionId = sessionId;
    window._adherenceSessionDate = dateStr || hydrated.dateIso || '';
    window._adherenceExerciseIndex = null;
    window._gymSessionDiaryOpen = false;
    renderAdherenceSessionSheet();
}

export function openAdherenceExerciseLog(itemIndex) {
    const snap = window._openGymSessionSnap;
    const idx = Number(itemIndex);
    if (!snap || !Number.isInteger(idx) || !(snap.items || [])[idx]) return;
    window._adherenceExerciseIndex = idx;
    window._gymSessionDiaryOpen = false;
    renderAdherenceSessionSheet();
}

export function backToAdherenceSession() {
    window._adherenceExerciseIndex = null;
    window._gymSessionDiaryOpen = false;
    renderAdherenceSessionSheet();
}

function renderAdherenceExerciseDiaryHtml(item) {
    const notes = String(item?.diaryNotes || '').trim();
    return `<div style="margin-top:20px; padding:14px; border:1px solid rgba(212,175,55,0.35); border-radius:10px; background:rgba(212,175,55,0.06);">
        <div style="font-size:10px; color:var(--gold-accent); font-family:'Roboto Mono'; font-weight:800; text-transform:uppercase; letter-spacing:1px; margin-bottom:10px;">[ Exercise diary ]</div>
        ${notes
            ? `<div style="font-size:13px; color:var(--text-main); line-height:1.5; white-space:pre-wrap;">${escapeHtml(notes)}</div>`
            : `<div style="font-size:12px; color:var(--text-muted);">No notes saved for this exercise.</div>`}
        <div id="adherence-exercise-diary-media"></div>
    </div>`;
}

let _adherenceDiaryMediaGen = 0;

async function fillAdherenceExerciseDiaryMedia(item, dateStr) {
    const gen = ++_adherenceDiaryMediaGen;
    const slot = document.getElementById('adherence-exercise-diary-media');
    if (!slot) return;
    const media = await resolveExerciseDiaryMedia(item, dateStr);
    if (gen !== _adherenceDiaryMediaGen) return;
    const liveSlot = document.getElementById('adherence-exercise-diary-media');
    if (!liveSlot) return;
    if (!media.length) {
        if (!String(item?.diaryNotes || '').trim()) {
            liveSlot.innerHTML = `<div style="font-size:12px; color:var(--text-muted); margin-top:10px;">No photos or videos saved.</div>`;
        }
        return;
    }
    const html = await buildJournalMediaGalleryHtml(media, 'Photos / videos');
    if (gen !== _adherenceDiaryMediaGen) return;
    const still = document.getElementById('adherence-exercise-diary-media');
    if (still) still.innerHTML = html;
}

async function resolveExerciseDiaryMedia(item, dateStr) {
    const declared = Array.isArray(item?.diaryMedia) ? item.diaryMedia.filter(m => m && m.id) : [];
    if (declared.length) return declared;
    try {
        const all = await idbGetAllJournalMedia();
        const names = new Set(exerciseDiaryNameCandidates(item).map(n => n.toLowerCase()));
        const dateKeys = new Set(
            [dateStr, resolveIsoFromDateStr(dateStr), window._adherenceDayIso, window._adherenceSessionDate, window._openGymSessionSnap?.dateIso]
                .filter(Boolean)
                .map(String)
        );
        return all
            .filter(rec => {
                if (!rec?.id) return false;
                const ex = String(rec.exerciseName || '').toLowerCase();
                if (!names.has(ex)) return false;
                if (!rec.dateKey) return true;
                return dateKeys.has(String(rec.dateKey));
            })
            .map(rec => ({ id: rec.id, kind: rec.kind, name: rec.name, mime: rec.mime }));
    } catch (e) {
        return [];
    }
}

/** Toggle gym/workout diary inside the adherence session sheet. */
export async function showGymSessionDiary(dateStr) {
    const panel = document.getElementById('gym-session-diary-panel');
    const diaryBtn = document.getElementById('btn-gym-diary');
    const snap = window._openGymSessionSnap;
    if (!panel) return;

    if (window._gymSessionDiaryOpen) {
        window._gymSessionDiaryOpen = false;
        panel.innerHTML = '';
        if (diaryBtn) diaryBtn.textContent = 'View diary';
        return;
    }

    window._gymSessionDiaryOpen = true;
    if (diaryBtn) diaryBtn.textContent = 'Hide diary';

    const entry = loadGymJournalEntry(dateStr)
        || loadGymJournalEntry(snap?.dateIso)
        || loadGymJournalEntry(resolveIsoFromDateStr(dateStr));
    panel.innerHTML = `
        <div style="font-size:10px; color:var(--gold-accent); font-family:'Roboto Mono'; font-weight:800; letter-spacing:0.5px; text-transform:uppercase; margin-bottom:12px;">Diary entry</div>
        ${buildLactateDiaryHtml(entry)}`;
    if (entry?.media?.length) {
        const slot = document.getElementById('lactate-diary-media-slot');
        if (slot) slot.innerHTML = await buildJournalMediaGalleryHtml(entry.media);
    }
}

function parseSecLabel(label) {
    const t = String(label || '').trim();
    if (!t) return null;
    let sec = 0;
    const mins = t.match(/(\d+)\s*m/);
    const secs = t.match(/(\d+)\s*s/);
    if (mins) sec += Number(mins[1]) * 60;
    if (secs) sec += Number(secs[1]);
    if (!mins && !secs && /^\d+$/.test(t)) sec = Number(t);
    return sec > 0 ? sec : null;
}

function parseWorkRestNotes(notes) {
    const s = String(notes || '');
    const m = s.match(/((?:\d+\s*m\s*)?(?:\d+\s*s)?|\d+\s*m|\d+\s*s)\s*work\s*\/\s*((?:\d+\s*m\s*)?(?:\d+\s*s)?|\d+\s*m|\d+\s*s)\s*rest/i);
    if (!m) return {};
    return { work: parseSecLabel(m[1]), rest: parseSecLabel(m[2]) };
}

function extractLactateWorkRest(set) {
    if (!set) return { work: null, rest: null };
    let work = null;
    let rest = null;
    if (set.duration_sec != null && Number(set.duration_sec) > 0) work = Number(set.duration_sec);
    else if (set.isLactateHit && Number(set.reps) >= 20) work = Number(set.reps);
    if (set.restTime != null && Number(set.restTime) > 0) rest = Number(set.restTime);
    if ((work == null || rest == null) && set.notes) {
        const parsed = parseWorkRestNotes(set.notes);
        if (work == null && parsed.work != null) work = parsed.work;
        if (rest == null && parsed.rest != null) rest = parsed.rest;
    }
    return { work, rest };
}

export function isLactateExerciseName(name) {
    const n = String(name || '').trim();
    if (!n) return false;
    if (/practice|match/i.test(n)) return false;
    if (/static\s*stretch/i.test(n)) return false;
    if (/warmup|pulse raising|mobilisation|dynamic stretch|injury prehab/i.test(n)) return false;
    if (/hit\s*class/i.test(n)) return true;
    const lower = n.toLowerCase();
    if (HIT_TYPE_OPTIONS.some(o => o.label.toLowerCase() === lower)) return true;
    return /interval|sprint|attack bike|skier|battle rope|rower|hill sprint|^spinning$/i.test(n);
}

function formatDurationSecShort(sec) {
    const n = Math.max(0, Math.round(Number(sec) || 0));
    if (!n) return '—';
    if (n % 60 === 0) return `${n / 60}m`;
    if (n > 60) return `${Math.floor(n / 60)}m ${n % 60}s`;
    return `${n}s`;
}

function resolveHitTypeLabels(block, journal) {
    const fromJournal = (journal?.hitTypes || block?.hitTypes || [])
        .map(id => hitTypeLabel(id))
        .filter(Boolean);
    if (fromJournal.length) return [...new Set(fromJournal)];
    if (journal?.isHitClass || block?.isHitClass) return ['HIT class'];
    const fromItems = (block?.items || [])
        .map(i => i.exercise?.name || i.name)
        .filter(n => isLactateExerciseName(n));
    if (fromItems.length) return [...new Set(fromItems)];
    const fromLogs = (block?.logs || [])
        .map(l => l.exercise)
        .filter(n => isLactateExerciseName(n));
    return [...new Set(fromLogs)];
}

/**
 * Split day workout rows into Lactate/HIT session card(s) vs everything else.
 * Prefers session snapshots; falls back to grouping HIT-looking orphan logs.
 * Uses gym/lactate journal only for HIT metadata (never match/practice).
 */
export function splitLactateSessionsFromDay(dateStr, workoutLogs = [], journal = null, isoHint = null) {
    const iso = (isoHint && /^\d{4}-\d{2}-\d{2}$/.test(isoHint))
        ? isoHint
        : resolveIsoFromDateStr(dateStr);
    const gymJournal = (journal && (journal.source === 'gym' || journal.type === 'lactate' || journal.type === 'gym' || journal.hitTypes?.length))
        ? journal
        : (loadGymJournalEntry(dateStr) || loadGymJournalEntry(iso));
    const sessions = listSessionsForAdherenceDay(dateStr, iso);
    const lactateSessions = sessions.filter(s => isLactateEvent(s.kind) || s.kind === 'Lactate');
    const usedIds = new Set();
    const lactateBlocks = [];

    lactateSessions.forEach(sess => {
        (sess.logIds || []).forEach(id => usedIds.add(String(id)));
        const snapItems = Array.isArray(sess.items) && sess.items.length
            ? sess.items
            : (getWorkoutSessionSnapshot(sess.id)?.items || []);
        const block = {
            sessionId: sess.id,
            dateIso: iso,
            dateStr,
            durationMinutes: Number(sess.durationMinutes) || 0,
            durationMs: Number(sess.durationMs) || 0,
            durationLabel: sess.durationLabel || null,
            rpe: sess.rpe != null ? sess.rpe : (gymJournal?.rpe != null ? gymJournal.rpe : null),
            hitTypes: sess.hitTypes || gymJournal?.hitTypes || [],
            isHitClass: !!(sess.isHitClass || gymJournal?.isHitClass),
            lactateSummary: sess.lactateSummary || gymJournal?.lactateSummary || '',
            items: snapItems,
            logs: (workoutLogs || []).filter(l => (sess.logIds || []).map(String).includes(String(l.id)))
        };
        block.typeLabels = resolveHitTypeLabels(block, gymJournal);
        if (!block.durationMinutes && !block.durationMs && block.logs.length) {
            const fromLogs = resolveSessionTimerFromLogs(block.logs);
            block.durationMinutes = fromLogs;
            if (fromLogs > 0) block.durationMs = fromLogs * 60000;
        }
        lactateBlocks.push(block);
    });

    const remaining = (workoutLogs || []).filter(l =>
        !usedIds.has(String(l.id))
        && l.exercise !== 'Practice'
        && l.exercise !== 'Match'
    );

    const lactateOrphans = remaining.filter(l => isLactateExerciseName(l.exercise));
    const stretchOrphans = remaining.filter(l => /static\s*stretch/i.test(l.exercise || ''));
    const warmupOrphans = remaining.filter(l => /warmup|pulse raising|mobilisation|dynamic stretch/i.test(l.exercise || ''));

    if (lactateOrphans.length && !lactateBlocks.length) {
        const bundled = [...warmupOrphans, ...lactateOrphans, ...stretchOrphans];
        bundled.forEach(l => usedIds.add(String(l.id)));
        const block = {
            sessionId: '',
            dateIso: iso,
            dateStr,
            durationMinutes: resolveSessionTimerFromLogs(bundled),
            durationMs: resolveSessionTimerFromLogs(bundled) * 60000,
            durationLabel: null,
            rpe: gymJournal?.rpe != null ? gymJournal.rpe : null,
            hitTypes: gymJournal?.hitTypes || [],
            isHitClass: !!gymJournal?.isHitClass,
            lactateSummary: gymJournal?.lactateSummary || '',
            items: [],
            logs: bundled
        };
        block.typeLabels = resolveHitTypeLabels(block, gymJournal);
        lactateBlocks.push(block);
    } else if (lactateBlocks.length) {
        const fold = [...lactateOrphans, ...warmupOrphans, ...stretchOrphans];
        fold.forEach(l => usedIds.add(String(l.id)));
        if (fold.length) {
            lactateBlocks[0].logs = [...(lactateBlocks[0].logs || []), ...fold];
        }
        if (!lactateBlocks[0].typeLabels?.length) {
            lactateBlocks[0].typeLabels = resolveHitTypeLabels(lactateBlocks[0], gymJournal);
        }
    }

    if (!lactateBlocks.length && gymJournal && (gymJournal.type === 'lactate' || gymJournal.hitTypes?.length)) {
        const bundled = [...warmupOrphans, ...stretchOrphans, ...remaining.filter(l => (l.type || '') === 'cardio')];
        if (bundled.length) {
            bundled.forEach(l => usedIds.add(String(l.id)));
            const block = {
                sessionId: '',
                dateIso: iso,
                dateStr,
                durationMinutes: resolveSessionTimerFromLogs(bundled),
                durationMs: resolveSessionTimerFromLogs(bundled) * 60000,
                durationLabel: null,
                rpe: gymJournal.rpe,
                hitTypes: gymJournal.hitTypes || [],
                isHitClass: !!gymJournal.isHitClass,
                lactateSummary: gymJournal.lactateSummary || '',
                items: [],
                logs: bundled
            };
            block.typeLabels = resolveHitTypeLabels(block, gymJournal);
            lactateBlocks.push(block);
        }
    }

    const otherWorkouts = (workoutLogs || []).filter(l => !usedIds.has(String(l.id)));
    window._lactateDayBlocks = { [dateStr]: lactateBlocks, [iso]: lactateBlocks };
    return { lactateBlocks, otherWorkouts, usedLogIds: usedIds };
}

function getCachedLactateBlock(sessionId, dateStr, blockIndex = 0) {
    const iso = resolveIsoFromDateStr(dateStr);
    const cache = window._lactateDayBlocks || {};
    const list = cache[dateStr] || cache[iso] || [];
    if (sessionId) {
        const hit = list.find(b => String(b.sessionId) === String(sessionId));
        if (hit) {
            hydrateLactateBlockFromSnapshot(hit);
            return hit;
        }
        const snap = getWorkoutSessionSnapshot(sessionId);
        if (snap) {
            const journal = loadGymJournalEntry(dateStr) || loadGymJournalEntry(iso) || loadGymJournalEntry(snap.dateIso);
            return {
                sessionId: snap.id,
                dateIso: snap.dateIso || iso,
                dateStr,
                durationMinutes: Number(snap.durationMinutes) || 0,
                durationMs: Number(snap.durationMs) || 0,
                durationLabel: snap.durationLabel || null,
                rpe: snap.rpe != null ? snap.rpe : journal?.rpe,
                hitTypes: snap.hitTypes || journal?.hitTypes || [],
                isHitClass: !!(snap.isHitClass || journal?.isHitClass),
                lactateSummary: snap.lactateSummary || journal?.lactateSummary || '',
                items: snap.items || [],
                logs: [],
                typeLabels: resolveHitTypeLabels({
                    hitTypes: snap.hitTypes || journal?.hitTypes,
                    isHitClass: snap.isHitClass || journal?.isHitClass,
                    items: snap.items
                }, journal)
            };
        }
    }
    const block = list[blockIndex] || list[0] || null;
    if (block) hydrateLactateBlockFromSnapshot(block);
    return block;
}

/** Prefer live session snapshot items (same source as Drive → Log). */
function hydrateLactateBlockFromSnapshot(block) {
    if (!block?.sessionId) return block;
    const snap = getWorkoutSessionSnapshot(block.sessionId);
    if (!snap) return block;
    if (Array.isArray(snap.items) && snap.items.length) block.items = snap.items;
    if (snap.durationLabel) block.durationLabel = snap.durationLabel;
    if (snap.durationMs > 0) block.durationMs = snap.durationMs;
    if (snap.durationMinutes > 0) block.durationMinutes = snap.durationMinutes;
    if (snap.rpe != null) block.rpe = snap.rpe;
    if (Array.isArray(snap.hitTypes) && snap.hitTypes.length) block.hitTypes = snap.hitTypes;
    return block;
}

function buildLactateIntervalRowsHtml(block) {
    hydrateLactateBlockFromSnapshot(block);
    const rows = [];
    if (Array.isArray(block.items) && block.items.length) {
        block.items.forEach(item => {
            const name = item.exercise?.name || item.name || 'Interval';
            if (item.isWarmupGroup || /warmup/i.test(name)) {
                rows.push(`<div style="margin-bottom:12px; padding-bottom:12px; border-bottom:1px solid var(--border-subtle);">
                    <div style="font-size:12px; color:var(--text-main); font-weight:700;">${escapeHtml(name)}</div>
                    <div style="margin-top:6px; font-size:11px; color:var(--text-silver); font-family:'Roboto Mono';">Warmup block</div>
                </div>`);
                return;
            }
            if (item.isStretchGroup || /static\s*stretch/i.test(name) || /stretch/i.test(name)) {
                const muscles = adherenceLogSets(item, { stretch: true })
                    .map((s, i) => stretchMuscleLabel(s, i));
                const muscleHtml = muscles.length
                    ? muscles.map(m => `<div>${escapeHtml(m)}</div>`).join('')
                    : 'Cool-down';
                rows.push(`<div style="margin-bottom:12px; padding-bottom:12px; border-bottom:1px solid var(--border-subtle);">
                    <div style="font-size:12px; color:var(--text-main); font-weight:700;">${escapeHtml(name)}</div>
                    <div style="margin-top:6px; font-size:11px; color:var(--text-silver); font-family:'Roboto Mono'; line-height:1.5;">${muscleHtml}</div>
                </div>`);
                return;
            }
            const timeLabel = formatExerciseDurationLabel(item);
            if (timeLabel) {
                rows.push(`<div style="margin-bottom:10px; font-size:11px; color:var(--gold-accent); font-family:'Roboto Mono'; font-weight:700;">${escapeHtml(name)} · ${escapeHtml(timeLabel)}</div>`);
            }
            const sets = (item.sets || []).filter(s => s && s.completed !== false);
            sets.forEach((set, si) => {
                if (set.isText && !set.isLactateHit && !set.duration_sec) {
                    rows.push(`<div style="margin-bottom:12px; padding-bottom:12px; border-bottom:1px solid var(--border-subtle);">
                        <div style="font-size:12px; color:var(--text-main); font-weight:700;">${escapeHtml(name)} · set ${si + 1}</div>
                        <div style="margin-top:6px; font-size:11px; color:var(--text-silver);">${escapeHtml(set.reps || 'done')}</div>
                    </div>`);
                    return;
                }
                const { work, rest } = extractLactateWorkRest(set);
                rows.push(`<div style="margin-bottom:12px; padding-bottom:12px; border-bottom:1px solid var(--border-subtle);">
                    <div style="font-size:12px; color:var(--text-main); font-weight:700;">${escapeHtml(name)} · set ${si + 1}</div>
                    <div style="margin-top:8px; display:flex; flex-direction:column; gap:4px; font-family:'Roboto Mono'; font-size:12px;">
                        <div style="color:var(--gold-accent); font-weight:700;">Action: ${formatDurationSecShort(work)}</div>
                        <div style="color:var(--text-silver); font-weight:600;">Rest: ${rest > 0 ? formatDurationSecShort(rest) : '—'}</div>
                    </div>
                </div>`);
            });
        });
    }
    if (!rows.length && Array.isArray(block.logs) && block.logs.length) {
        block.logs.filter(l => isLactateExerciseName(l.exercise)).forEach(log => {
            const workSec = Number(log.reps) >= 20 && !(Number(log.weight_kg) > 0) ? Number(log.reps) : null;
            rows.push(`<div style="margin-bottom:12px; padding-bottom:12px; border-bottom:1px solid var(--border-subtle);">
                <div style="font-size:12px; color:var(--text-main); font-weight:700;">${escapeHtml(log.exercise)} · set ${log.sets || 1}</div>
                <div style="margin-top:8px; display:flex; flex-direction:column; gap:4px; font-family:'Roboto Mono'; font-size:12px;">
                    <div style="color:var(--gold-accent); font-weight:700;">Action: ${workSec ? formatDurationSecShort(workSec) : (log.time_minutes ? log.time_minutes + ' min' : '—')}</div>
                    <div style="color:var(--text-silver); font-weight:600;">Rest: —</div>
                </div>
            </div>`);
        });
    }
    return rows.length
        ? rows.join('')
        : `<div style="font-size:12px; color:var(--text-muted);">No interval breakdown stored for this session.</div>`;
}

function buildLactateDiaryHtml(journal) {
    if (!journal || (journal.type !== 'lactate' && journal.source !== 'gym' && !journal.hitTypes?.length && journal.rpe == null && !journal.notes)) {
        // Still show gym journal if it's the day's lactate diary
        if (!journal) return `<div style="font-size:12px; color:var(--text-muted);">No diary entry for this Lactate/HIT session.</div>`;
    }
    const fields = journal.fields || {};
    const fieldLines = Object.keys(fields).filter(k => fields[k] != null && fields[k] !== '')
        .map(k => `<div style="display:flex; justify-content:space-between; gap:10px; margin-bottom:8px; font-size:12px;">
            <span style="color:var(--text-muted);">${escapeHtml(k)}</span>
            <span style="color:var(--text-main); font-weight:700;">${escapeHtml(fields[k])}</span>
        </div>`).join('');
    return `<div>
        ${journal.rpe != null ? `<div style="margin-bottom:10px; font-family:'Roboto Mono'; font-size:12px; color:var(--text-silver);">Session RPE <strong style="color:var(--text-main);">${journal.rpe}</strong></div>` : ''}
        ${journal.lactateSummary ? `<div style="font-size:11px; color:var(--text-muted); margin-bottom:10px;">${escapeHtml(journal.lactateSummary)}</div>` : ''}
        ${journal.notes ? `<div style="font-size:13px; color:var(--text-main); line-height:1.5; white-space:pre-wrap; margin-bottom:12px;">${escapeHtml(journal.notes)}</div>` : ''}
        ${fieldLines || (!journal.notes && journal.rpe == null ? `<div style="font-size:12px; color:var(--text-muted);">Diary saved with no extra notes.</div>` : '')}
        <div id="lactate-diary-media-slot"></div>
    </div>`;
}

/** Lactate/HIT session sheet from adherence calendar. */
export function openLactateSessionDetail(sessionId, dateStr, blockIndex = 0) {
    let block = getCachedLactateBlock(sessionId, dateStr, blockIndex);
    if (!block) {
        const data = store.globalGroupedHistory[dateStr];
        const journal = loadGymJournalEntry(dateStr);
        const wks = (data?.items || []).filter(i => i.type === 'workout');
        const split = splitLactateSessionsFromDay(dateStr, wks, journal);
        block = split.lactateBlocks[blockIndex] || split.lactateBlocks[0];
    }
    if (!block) {
        alert('Could not find that Lactate/HIT session.');
        return;
    }

    hydrateLactateBlockFromSnapshot(block);
    window._openLactateBlock = block;
    window._lactateFullWorkoutOpen = false;
    window._lactateDiaryOpen = false;
    const journal = loadGymJournalEntry(dateStr)
        || loadGymJournalEntry(block.dateIso)
        || loadGymJournalEntry(resolveIsoFromDateStr(dateStr));
    const typesLabel = (block.typeLabels && block.typeLabels.length)
        ? block.typeLabels.join(' · ')
        : resolveHitTypeLabels(block, journal).join(' · ') || 'HIT intervals';
    const durLabel = formatSessionTimerDuration(block);

    const sheet = document.getElementById('meal-detail-sheet');
    const titleEl = document.getElementById('meal-detail-title');
    const subEl = document.getElementById('meal-detail-subtitle');
    const macrosEl = document.getElementById('meal-detail-macros');
    const foodsEl = document.getElementById('meal-detail-foods');
    const actionsEl = document.getElementById('meal-detail-actions');
    if (!sheet || !foodsEl) return;

    if (titleEl) titleEl.textContent = 'Lactate/HIT session';
    if (subEl) subEl.textContent = dateStr || block.dateIso || '';
    if (macrosEl) {
        macrosEl.innerHTML = `
            <div style="padding:12px; border:1px solid var(--border-subtle); border-radius:10px; background:var(--bg-surface-elevated);">
                <div style="font-size:10px; color:var(--text-muted); font-family:'Roboto Mono'; text-transform:uppercase; letter-spacing:0.4px; margin-bottom:6px;">Duration (session timer)</div>
                <div style="font-size:20px; font-weight:800; color:var(--gold-accent); font-family:'Roboto Mono';">${escapeHtml(durLabel)}</div>
            </div>
            <div style="padding:12px; border:1px solid var(--border-subtle); border-radius:10px; background:var(--bg-surface-elevated);">
                <div style="font-size:10px; color:var(--text-muted); font-family:'Roboto Mono'; text-transform:uppercase; letter-spacing:0.4px; margin-bottom:6px;">Training types</div>
                <div style="font-size:13px; font-weight:700; color:var(--text-main); line-height:1.4;">${escapeHtml(typesLabel)}</div>
                ${block.rpe != null || journal?.rpe != null ? `<div style="font-size:11px; color:var(--text-silver); font-family:'Roboto Mono'; margin-top:8px;">RPE ${block.rpe != null ? block.rpe : journal.rpe}</div>` : ''}
            </div>`;
    }

    foodsEl.innerHTML = `<div id="lactate-detail-panel" style="font-size:12px; color:var(--text-muted);"></div>`;

    if (actionsEl) {
        const sid = String(block.sessionId || '').replace(/'/g, "\\'");
        const safeDate = String(dateStr || block.dateStr || '').replace(/'/g, "\\'");
        actionsEl.classList.remove('hidden');
        actionsEl.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:8px;">
                <button type="button" id="btn-lactate-full-workout" class="btn-primary is-secondary" style="margin:0;" onclick="toggleLactateFullWorkout()">View full workout</button>
                <button type="button" class="btn-primary is-secondary" style="margin:0;" onclick="editLactateSessionFromCalendar('${sid}', '${safeDate}')">Edit workout</button>
                <button type="button" id="btn-lactate-diary" class="btn-primary is-secondary" style="margin:0;" onclick="showLactateSessionDiary('${safeDate}')">View diary</button>
            </div>`;
    }
    sheet.classList.remove('hidden');
}

export function toggleLactateFullWorkout() {
    const panel = document.getElementById('lactate-detail-panel');
    const btn = document.getElementById('btn-lactate-full-workout');
    const diaryBtn = document.getElementById('btn-lactate-diary');
    const block = window._openLactateBlock;
    if (!panel || !block) return;

    if (window._lactateFullWorkoutOpen) {
        window._lactateFullWorkoutOpen = false;
        panel.innerHTML = '';
        if (btn) btn.textContent = 'View full workout';
        return;
    }

    window._lactateFullWorkoutOpen = true;
    window._lactateDiaryOpen = false;
    if (diaryBtn) diaryBtn.textContent = 'View diary';
    panel.innerHTML = `
        <div style="font-size:10px; color:var(--gold-accent); font-family:'Roboto Mono'; font-weight:800; letter-spacing:0.5px; text-transform:uppercase; margin-bottom:12px;">Full workout</div>
        ${buildLactateIntervalRowsHtml(block)}`;
    if (btn) btn.textContent = 'Close full workout';
}

/** @deprecated use toggleLactateFullWorkout */
export function showLactateFullWorkout() {
    if (!window._lactateFullWorkoutOpen) toggleLactateFullWorkout();
}

export async function showLactateSessionDiary(dateStr) {
    const panel = document.getElementById('lactate-detail-panel');
    const block = window._openLactateBlock;
    const diaryBtn = document.getElementById('btn-lactate-diary');
    if (!panel) return;

    if (window._lactateDiaryOpen) {
        window._lactateDiaryOpen = false;
        panel.innerHTML = '';
        if (diaryBtn) diaryBtn.textContent = 'View diary';
        return;
    }

    // Diary replaces full-workout panel; reset that toggle
    window._lactateFullWorkoutOpen = false;
    window._lactateDiaryOpen = true;
    const fullBtn = document.getElementById('btn-lactate-full-workout');
    if (fullBtn) fullBtn.textContent = 'View full workout';
    if (diaryBtn) diaryBtn.textContent = 'Hide diary';

    // Always the gym/lactate diary — never match/practice (loadDayJournal prefers those)
    const entry = loadGymJournalEntry(dateStr)
        || loadGymJournalEntry(block?.dateIso)
        || loadGymJournalEntry(resolveIsoFromDateStr(dateStr));
    panel.innerHTML = `
        <div style="font-size:10px; color:var(--gold-accent); font-family:'Roboto Mono'; font-weight:800; letter-spacing:0.5px; text-transform:uppercase; margin-bottom:12px;">Diary entry</div>
        ${buildLactateDiaryHtml(entry)}`;
    if (entry?.media?.length) {
        const slot = document.getElementById('lactate-diary-media-slot');
        if (slot) slot.innerHTML = await buildJournalMediaGalleryHtml(entry.media);
    }
}

export function editLactateSessionFromCalendar(sessionId, dateStr) {
    const block = window._openLactateBlock || getCachedLactateBlock(sessionId, dateStr);
    try { closeMealDetailSafe(); } catch (e) { /* ignore */ }
    try { closeDayDetail(); } catch (e) { /* ignore */ }

    if (sessionId && typeof window.editLoggedWorkoutSession === 'function') {
        // Ensure lactate edit mode
        const snap = getWorkoutSessionSnapshot(sessionId);
        if (snap) {
            window._lactateHitSelection = {
                types: snap.hitTypes || block?.hitTypes || [],
                slot: snap.lactateSlot || null,
                isHitClass: !!(snap.isHitClass || block?.isHitClass),
                summary: snap.lactateSummary || block?.lactateSummary || '',
                rows: []
            };
        }
        window.editLoggedWorkoutSession(sessionId);
        window.journalMode = 'lactate';
        window.manualSessionKind = 'Lactate';
        return;
    }

    // Orphan path — rebuild from log ids / names
    const logs = block?.logs || [];
    if (!logs.length) {
        alert('No editable sets found for this Lactate/HIT session.');
        return;
    }
    const names = [...new Set(logs.map(l => l.exercise).filter(Boolean))];
    const ids = logs.map(l => l.id).filter(Boolean);
    if (typeof window.editOrphanWorkoutLogs === 'function') {
        window._lactateEditDateIso = resolveIsoFromDateStr(dateStr);
        window.editOrphanWorkoutLogs(names.join('||'), ids.join(','));
        window.journalMode = 'lactate';
        window.manualSessionKind = 'Lactate';
    }
}

function closeMealDetailSafe() {
    if (typeof window.closeMealDetail === 'function') window.closeMealDetail();
    else {
        const sheet = document.getElementById('meal-detail-sheet');
        if (sheet) sheet.classList.add('hidden');
    }
}

/** Read-only workout detail opened from adherence (no inline quantity edits on the calendar list). */
export function openHistoryWorkoutDetail(exName, dateStr) {
    // Lactate interval names open the session sheet instead of per-exercise sets
    if (isLactateExerciseName(exName)) {
        openLactateSessionDetail('', dateStr, 0);
        return;
    }

    const sessions = listSessionsForAdherenceDay(dateStr);
    for (const sess of sessions) {
        const items = Array.isArray(sess.items) && sess.items.length
            ? sess.items
            : (getWorkoutSessionSnapshot(sess.id)?.items || []);
        const idx = items.findIndex(it => namesMatchExercise(it, exName)
            || adherenceItemDisplayName(it) === exName
            || (it.exercise?.name || it.name) === exName);
        if (idx >= 0 && sess.id) {
            openAdherenceSessionDetail(sess.id, dateStr);
            openAdherenceExerciseLog(idx);
            return;
        }
    }

    const data = store.globalGroupedHistory[dateStr];
    if (!data) return;
    const logs = (data.items || [])
        .filter(i => i.type === 'workout' && i.exercise === exName)
        .slice()
        .sort((a, b) => (Number(a.sets) || 0) - (Number(b.sets) || 0));
    const sheet = document.getElementById('meal-detail-sheet');
    const titleEl = document.getElementById('meal-detail-title');
    const subEl = document.getElementById('meal-detail-subtitle');
    const macrosEl = document.getElementById('meal-detail-macros');
    const foodsEl = document.getElementById('meal-detail-foods');
    const actionsEl = document.getElementById('meal-detail-actions');
    if (!sheet || !foodsEl) return;

    if (titleEl) titleEl.textContent = exName || 'Workout';
    if (subEl) subEl.textContent = dateStr || '';
    if (macrosEl) macrosEl.innerHTML = '';

    let diaryItem = null;
    try {
        const iso = resolveIsoFromDateStr(dateStr);
        const snaps = Object.values(loadWorkoutSessionSnapshots() || {});
        for (const s of snaps) {
            if (!(s?.dateIso === iso || (s?.dateIso && localeDateEquals(dateStr, s.dateIso)))) continue;
            const hit = (s.items || []).find(it => namesMatchExercise(it, exName));
            if (hit) {
                diaryItem = hit;
                if (exerciseDiaryHasContent(hit)) break;
            }
        }
    } catch (e) { /* ignore */ }
    if (diaryItem) mergeDiaryOntoItems([diaryItem], dateStr, diaryItem.dateIso);

    const isStretch = /stretch/i.test(exName || '');
    const isCore = /core(\s*circuit)?/i.test(exName || '');
    let html = '';
    const timeLabel = formatExerciseDurationLabel(diaryItem);
    if (timeLabel) {
        html += `<div style="margin-bottom:14px; padding:12px; border:1px solid var(--border-subtle); border-radius:10px; background:var(--bg-surface-elevated);">
            <div style="font-size:10px; color:var(--text-muted); font-family:'Roboto Mono'; text-transform:uppercase; letter-spacing:0.4px; margin-bottom:6px;">Time on exercise</div>
            <div style="font-size:20px; font-weight:800; color:var(--gold-accent); font-family:'Roboto Mono';">${escapeHtml(timeLabel)}</div>
        </div>`;
    }
    logs.forEach((log, i) => {
        const detail = log.weight_kg > 0
            ? `${log.weight_kg}kg × ${log.reps}`
            : (exName === 'Practice' || exName === 'Match'
                ? `RPE ${log.rpe || '—'}`
                : `${log.distance_km || 0} km${log.time_minutes ? ` · ${log.time_minutes} min` : ''}`);
        const rowLabel = isStretch
            ? (String(log.notes || '').trim() || 'Stretch')
            : (isCore ? `Circuit ${i + 1}` : `Set ${i + 1}`);
        html += `<div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:10px; padding-bottom:10px; border-bottom:1px solid var(--border-subtle);">
            <div>
                <div style="font-size:11px; color:var(--text-muted); font-family:'Roboto Mono';">${escapeHtml(rowLabel)}</div>
                <div style="font-size:13px; color:var(--text-main); font-weight:700; margin-top:4px;">${isStretch || isCore ? 'Done' : detail}</div>
            </div>
            <button type="button" onclick="deleteHistoryLog('workout_logs', ${log.id})" style="background:none; color:var(--text-stealth); border:none; cursor:pointer; font-size:14px; display:flex; align-items:center;"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
        </div>`;
    });
    foodsEl.innerHTML = (html || `<div style="font-size:12px; color:var(--text-muted);">No sets</div>`)
        + (diaryItem ? renderAdherenceExerciseDiaryHtml(diaryItem) : renderAdherenceExerciseDiaryHtml({ diaryNotes: '', diaryMedia: [] }));
    if (actionsEl) {
        actionsEl.classList.add('hidden');
        actionsEl.innerHTML = '';
    }
    sheet.classList.remove('hidden');
    fillAdherenceExerciseDiaryMedia(diaryItem || { exercise: { name: exName }, name: exName }, dateStr);
}

export function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// --- Diary media (photos / videos) stored in IndexedDB ---
export function openJournalMediaDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(JOURNAL_MEDIA_DB, 1);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(JOURNAL_MEDIA_STORE)) {
                db.createObjectStore(JOURNAL_MEDIA_STORE, { keyPath: 'id' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

export async function idbPutJournalMedia(record) {
    const db = await openJournalMediaDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(JOURNAL_MEDIA_STORE, 'readwrite');
        tx.objectStore(JOURNAL_MEDIA_STORE).put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

export async function idbGetJournalMedia(id) {
    const db = await openJournalMediaDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(JOURNAL_MEDIA_STORE, 'readonly');
        const req = tx.objectStore(JOURNAL_MEDIA_STORE).get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
    });
}

export async function idbGetAllJournalMedia() {
    const db = await openJournalMediaDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(JOURNAL_MEDIA_STORE, 'readonly');
        const req = tx.objectStore(JOURNAL_MEDIA_STORE).getAll();
        req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
        req.onerror = () => reject(req.error);
    });
}

let _voiceRecorder = null;
let _voiceChunks = [];
let _voiceStream = null;

function setVoiceStatus(text, recording = false) {
    const el = document.getElementById('journal-voice-status');
    const btn = document.getElementById('journal-media-voice-btn');
    if (el) {
        el.style.display = text ? 'block' : 'none';
        el.textContent = text || '';
    }
    if (btn) {
        btn.textContent = recording ? 'Stop' : 'Voice';
        btn.style.borderColor = recording ? '#FF3B30' : 'var(--gold-accent)';
        btn.style.color = recording ? '#FF3B30' : 'var(--gold-accent)';
    }
}

export function resetJournalMedia() {
    if (_voiceRecorder && _voiceRecorder.state === 'recording') {
        try { _voiceRecorder.stop(); } catch (e) { /* ignore */ }
    }
    if (_voiceStream) {
        _voiceStream.getTracks().forEach(t => t.stop());
        _voiceStream = null;
    }
    _voiceRecorder = null;
    _voiceChunks = [];
    setVoiceStatus('');
    (window._journalPendingMedia || []).forEach(m => {
        if (m.previewUrl) URL.revokeObjectURL(m.previewUrl);
    });
    window._journalPendingMedia = [];
    const preview = document.getElementById('journal-media-preview');
    if (preview) preview.innerHTML = '';
    ['journal-media-photo', 'journal-media-video', 'journal-media-library'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
}

export function renderJournalMediaPreview() {
    const preview = document.getElementById('journal-media-preview');
    if (!preview) return;
    const items = window._journalPendingMedia || [];
    if (!items.length) {
        preview.innerHTML = `<div style="font-size:10px; color:var(--text-stealth); font-family:'Roboto Mono';">No media attached yet.</div>`;
        return;
    }
    preview.innerHTML = items.map(m => {
        let thumb;
        let badge = 'PHOTO';
        if (m.kind === 'video') {
            thumb = `<video src="${m.previewUrl}" muted style="width:100%; height:100%; object-fit:cover;"></video>`;
            badge = 'VIDEO';
        } else if (m.kind === 'voice' || m.kind === 'audio') {
            thumb = `<div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; color:var(--gold-accent); font-size:22px;">♪</div>`;
            badge = 'VOICE';
        } else {
            thumb = `<img src="${m.previewUrl}" alt="" style="width:100%; height:100%; object-fit:cover;">`;
        }
        return `<div style="position:relative; width:76px; height:76px; border-radius:8px; overflow:hidden; border:1px solid var(--border-subtle); background:#111;">
            ${thumb}
            <button type="button" onclick="removeJournalMedia('${m.id}')" style="position:absolute; top:2px; right:2px; width:22px; height:22px; border:none; border-radius:50%; background:rgba(0,0,0,0.7); color:#fff; cursor:pointer; font-size:14px; line-height:22px; padding:0;">&times;</button>
            <div style="position:absolute; left:0; right:0; bottom:0; font-size:8px; text-align:center; background:rgba(0,0,0,0.55); color:#ccc; font-family:'Roboto Mono'; padding:2px 0;">${badge}</div>
        </div>`;
    }).join('');
}

/** Start / stop an in-diary voice note (MediaRecorder). */
export async function toggleJournalVoiceNote() {
    if (_voiceRecorder && _voiceRecorder.state === 'recording') {
        _voiceRecorder.stop();
        return;
    }
    if (!window._journalPendingMedia) window._journalPendingMedia = [];
    if (window._journalPendingMedia.length >= JOURNAL_MEDIA_MAX) {
        alert(`Max ${JOURNAL_MEDIA_MAX} media files per diary entry.`);
        return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        alert('Voice notes aren’t supported in this browser.');
        return;
    }
    try {
        _voiceStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
            : (MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '');
        _voiceChunks = [];
        _voiceRecorder = mime ? new MediaRecorder(_voiceStream, { mimeType: mime }) : new MediaRecorder(_voiceStream);
        _voiceRecorder.ondataavailable = (e) => {
            if (e.data && e.data.size) _voiceChunks.push(e.data);
        };
        _voiceRecorder.onstop = () => {
            try {
                const blobType = (_voiceRecorder && _voiceRecorder.mimeType) || mime || 'audio/webm';
                const blob = new Blob(_voiceChunks, { type: blobType });
                if (blob.size > 0) {
                    const ext = blobType.includes('mp4') ? 'm4a' : 'webm';
                    const file = new File([blob], `voice_${Date.now()}.${ext}`, { type: blobType });
                    const id = 'jm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
                    const previewUrl = URL.createObjectURL(file);
                    window._journalPendingMedia.push({
                        id,
                        kind: 'voice',
                        name: file.name,
                        mime: file.type,
                        blob: file,
                        previewUrl
                    });
                    renderJournalMediaPreview();
                }
            } finally {
                if (_voiceStream) {
                    _voiceStream.getTracks().forEach(t => t.stop());
                    _voiceStream = null;
                }
                _voiceRecorder = null;
                _voiceChunks = [];
                setVoiceStatus('Voice note added.');
                setTimeout(() => setVoiceStatus(''), 1600);
            }
        };
        _voiceRecorder.start();
        setVoiceStatus('Recording… tap Stop when finished.', true);
    } catch (e) {
        console.warn('Voice note failed', e);
        alert('Could not access the microphone. Check permissions and try again.');
        setVoiceStatus('');
    }
}

export function removeJournalMedia(id) {
    const list = window._journalPendingMedia || [];
    const hit = list.find(m => m.id === id);
    if (hit && hit.previewUrl) URL.revokeObjectURL(hit.previewUrl);
    window._journalPendingMedia = list.filter(m => m.id !== id);
    renderJournalMediaPreview();
}

export function compressImageFile(file, maxEdge = 1280, quality = 0.72) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            try {
                let { width, height } = img;
                const scale = Math.min(1, maxEdge / Math.max(width, height));
                width = Math.round(width * scale);
                height = Math.round(height * scale);
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob((blob) => {
                    URL.revokeObjectURL(url);
                    if (!blob) return reject(new Error('Image compress failed'));
                    resolve(new File([blob], (file.name || 'photo').replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }));
                }, 'image/jpeg', quality);
            } catch (e) {
                URL.revokeObjectURL(url);
                reject(e);
            }
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
        img.src = url;
    });
}

export async function onJournalMediaSelected(inputEl) {
    const files = Array.from(inputEl?.files || []);
    if (!files.length) return;
    if (!window._journalPendingMedia) window._journalPendingMedia = [];

    for (const file of files) {
        if (window._journalPendingMedia.length >= JOURNAL_MEDIA_MAX) {
            alert(`Max ${JOURNAL_MEDIA_MAX} media files per diary entry.`);
            break;
        }
        const isVideo = (file.type || '').startsWith('video/');
        const isImage = (file.type || '').startsWith('image/');
        const isAudio = (file.type || '').startsWith('audio/');
        if (!isVideo && !isImage && !isAudio) continue;

        if (isVideo && file.size > JOURNAL_MEDIA_MAX_VIDEO_BYTES) {
            alert(`Video too large (max ~${Math.round(JOURNAL_MEDIA_MAX_VIDEO_BYTES / (1024 * 1024))}MB). Try a shorter clip.`);
            continue;
        }

        let storeFile = file;
        if (isImage) {
            try {
                storeFile = await compressImageFile(file);
            } catch (e) {
                console.warn(e);
            }
            if (storeFile.size > JOURNAL_MEDIA_MAX_IMAGE_BYTES) {
                alert('Photo is still too large after compression. Try another shot.');
                continue;
            }
        }

        const id = 'jm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        const previewUrl = URL.createObjectURL(storeFile);
        window._journalPendingMedia.push({
            id,
            kind: isVideo ? 'video' : (isAudio ? 'voice' : 'photo'),
            name: storeFile.name || (isVideo ? 'clip.mp4' : (isAudio ? 'voice.webm' : 'photo.jpg')),
            mime: storeFile.type || (isVideo ? 'video/mp4' : (isAudio ? 'audio/webm' : 'image/jpeg')),
            blob: storeFile,
            previewUrl
        });
    }

    inputEl.value = '';
    renderJournalMediaPreview();
}

export async function persistPendingJournalMedia(dateKey) {
    const pending = window._journalPendingMedia || [];
    if (!pending.length) return [];
    const meta = [];
    for (const m of pending) {
        await idbPutJournalMedia({
            id: m.id,
            dateKey,
            kind: m.kind,
            name: m.name,
            mime: m.mime,
            blob: m.blob,
            savedAt: Date.now()
        });
        meta.push({ id: m.id, kind: m.kind, name: m.name, mime: m.mime });
    }
    return meta;
}

export async function buildJournalMediaGalleryHtml(mediaList, heading = 'Session media') {
    if (!mediaList || !mediaList.length) return '';
    const cards = [];
    for (const m of mediaList) {
        try {
            const rec = await idbGetJournalMedia(m.id);
            if (!rec || !rec.blob) continue;
            const url = URL.createObjectURL(rec.blob);
            const kind = m.kind || rec.kind;
            if (kind === 'video') {
                cards.push(`<div style="width:100%; border-radius:8px; overflow:hidden; border:1px solid var(--border-subtle); background:#111;">
                    <video src="${url}" controls playsinline style="width:100%; max-height:220px; display:block; background:#000;"></video>
                </div>`);
            } else if (kind === 'voice' || kind === 'audio') {
                cards.push(`<div style="width:100%; border-radius:8px; overflow:hidden; border:1px solid var(--border-subtle); background:var(--bg-surface-elevated); padding:10px;">
                    <div style="font-size:10px; color:var(--text-muted); font-family:'Roboto Mono'; margin-bottom:6px;">VOICE NOTE</div>
                    <audio src="${url}" controls style="width:100%;"></audio>
                </div>`);
            } else {
                cards.push(`<a href="${url}" target="_blank" rel="noopener" style="display:block; width:96px; height:96px; border-radius:8px; overflow:hidden; border:1px solid var(--border-subtle);">
                    <img src="${url}" alt="${escapeHtml(m.name || 'photo')}" style="width:100%; height:100%; object-fit:cover;">
                </a>`);
            }
        } catch (e) {
            console.warn('media load failed', e);
        }
    }
    if (!cards.length) return '';
    return `<div style="margin-top:12px;">
        ${heading ? `<div style="font-size:10px; color:var(--text-muted); font-family:'Roboto Mono'; text-transform:uppercase; letter-spacing:1px; margin-bottom:8px;">${escapeHtml(heading)}</div>` : ''}
        <div style="display:flex; flex-wrap:wrap; gap:8px;">${cards.join('')}</div>
    </div>`;
}

export function savePracticeJournalEntry(isoDate, entry) {
    const d = new Date((isoDate || dateToISO(new Date())) + 'T12:00:00');
    if (isNaN(d.getTime())) return;
    const payload = JSON.stringify({
        notes: entry.notes || '',
        rpe: entry.rpe,
        athletic: entry.athletic,
        mental: entry.mental,
        hydration_ml: entry.hydration_ml || 0,
        fields: entry.fields || {},
        media: entry.media || [],
        type: entry.type || 'practice',
        savedAt: Date.now()
    });
    const localeKey = d.toLocaleDateString();
    const isoKey = dateToISO(d);
    localStorage.setItem('ascensus_practice_journal_' + localeKey, payload);
    localStorage.setItem('ascensus_practice_journal_' + isoKey, payload);
    if (entry.notes) localStorage.setItem('ascensus_journal_' + localeKey, entry.notes);
}

export function saveMatchJournalEntry(isoDate, entry) {
    const d = new Date((isoDate || dateToISO(new Date())) + 'T12:00:00');
    if (isNaN(d.getTime())) return;
    const payload = JSON.stringify({
        notes: entry.notes || '',
        rpe: entry.rpe,
        athletic: entry.athletic,
        mental: entry.mental,
        matchPerformance: entry.matchPerformance,
        hydration_ml: entry.hydration_ml || 0,
        fields: entry.fields || {},
        media: entry.media || [],
        type: 'match',
        savedAt: Date.now()
    });
    const localeKey = d.toLocaleDateString();
    const isoKey = dateToISO(d);
    localStorage.setItem('ascensus_match_journal_' + localeKey, payload);
    localStorage.setItem('ascensus_match_journal_' + isoKey, payload);
    if (entry.notes) localStorage.setItem('ascensus_journal_' + localeKey, entry.notes);
}

export function saveGymJournalEntry(isoDate, entry) {
    const d = new Date((isoDate || dateToISO(new Date())) + 'T12:00:00');
    if (isNaN(d.getTime())) return;
    const payload = JSON.stringify({
        notes: entry.notes || '',
        mental: entry.mental,
        rpe: entry.rpe,
        fields: entry.fields || {},
        media: entry.media || [],
        type: entry.type || 'gym',
        hitTypes: entry.hitTypes || [],
        lactateSlot: entry.lactateSlot || null,
        isHitClass: !!entry.isHitClass,
        lactateSummary: entry.lactateSummary || '',
        savedAt: Date.now()
    });
    const localeKey = d.toLocaleDateString();
    const isoKey = dateToISO(d);
    localStorage.setItem('ascensus_gym_journal_' + isoKey, payload);
    localStorage.setItem('ascensus_gym_journal_' + localeKey, payload);
    if (entry.notes) localStorage.setItem('ascensus_journal_' + localeKey, entry.notes);
}

function journalStorageKeysForDate(isoDate) {
    const d = new Date((isoDate || dateToISO(new Date())) + 'T12:00:00');
    if (isNaN(d.getTime())) return [];
    return [...new Set([dateToISO(d), d.toLocaleDateString(), isoDate].filter(Boolean))];
}

/** Remove practice diary keys for a date (locale + ISO). */
export function deletePracticeJournalEntry(isoDate) {
    journalStorageKeysForDate(isoDate).forEach(key => {
        localStorage.removeItem('ascensus_practice_journal_' + key);
    });
}

/** Remove match diary keys for a date (locale + ISO). */
export function deleteMatchJournalEntry(isoDate) {
    journalStorageKeysForDate(isoDate).forEach(key => {
        localStorage.removeItem('ascensus_match_journal_' + key);
        localStorage.removeItem('ascensus_match_rest_' + key);
    });
}

function journalLookupKeys(dateStr) {
    if (!dateStr) return [];
    let keys = [dateStr];
    try {
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            const d = new Date(dateStr + 'T12:00:00');
            if (!isNaN(d.getTime())) keys.push(dateToISO(d), d.toLocaleDateString());
        } else {
            const maybe = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T12:00:00');
            if (!isNaN(maybe.getTime())) {
                keys.push(dateToISO(maybe), maybe.toLocaleDateString());
            }
            const resolved = resolveIsoFromDateStr(dateStr);
            if (resolved) {
                keys.push(resolved);
                try {
                    const d2 = new Date(resolved + 'T12:00:00');
                    if (!isNaN(d2.getTime())) keys.push(d2.toLocaleDateString());
                } catch (e) { /* ignore */ }
            }
        }
    } catch (e) { /* ignore */ }
    return [...new Set(keys.filter(Boolean))];
}

function tryParseJournal(raw, source) {
    if (!raw) return null;
    try { return { ...JSON.parse(raw), source }; } catch (e) { return null; }
}

/** Gym / Lactate/HIT diary only (never match or practice). */
export function loadGymJournalEntry(dateStr) {
    for (const key of journalLookupKeys(dateStr)) {
        const gym = tryParseJournal(localStorage.getItem('ascensus_gym_journal_' + key), 'gym');
        if (gym) return gym;
    }
    return null;
}

export function loadPracticeJournalEntry(dateStr) {
    for (const key of journalLookupKeys(dateStr)) {
        const practice = tryParseJournal(localStorage.getItem('ascensus_practice_journal_' + key), 'practice');
        if (practice) return practice;
    }
    return null;
}

export function loadMatchJournalEntry(dateStr) {
    for (const key of journalLookupKeys(dateStr)) {
        const match = tryParseJournal(localStorage.getItem('ascensus_match_journal_' + key), 'match');
        if (match) return match;
    }
    return null;
}

export function loadDayJournal(dateStr) {
    if (!dateStr) return null;
    const keys = journalLookupKeys(dateStr);

    for (const key of keys) {
        const match = tryParseJournal(localStorage.getItem('ascensus_match_journal_' + key), 'match');
        if (match) return match;
    }
    for (const key of keys) {
        const practice = tryParseJournal(localStorage.getItem('ascensus_practice_journal_' + key), 'practice');
        if (practice) return practice;
    }
    for (const key of keys) {
        const gym = tryParseJournal(localStorage.getItem('ascensus_gym_journal_' + key), 'gym');
        if (gym) return gym;
    }
    for (const key of keys) {
        const notes = localStorage.getItem('ascensus_journal_' + key);
        if (notes) {
            try {
                const parsed = JSON.parse(notes);
                if (parsed && typeof parsed === 'object') return { ...parsed, source: 'journal' };
            } catch (e) {}
            return { notes, source: 'journal' };
        }
    }
    return null;
}


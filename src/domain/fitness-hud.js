import { store } from '../state/store.js';
import { generateDailyMealPlan, generateDailyFoodLog, getPlannedDayCost } from './meal-planner.js';
import { getLactateProtocolForSlot } from './lactate-engine.js';
import { assignPairedSessionSlots, dateToISO, formatEventsLabel, generateFutureTimeline, getDayMacroTargets, getLactateSlotForDate, getPlannedDayEvents, invalidateWeekPlanCache, isAuxEvent, isGameEvent, isLactateEvent, isLiftingEvent, isPracticeEvent, isRestEvent, isSteadyCardio, isStrengthEvent, listWorkoutSessionsForDate, loadWorkoutSessionSnapshots, normalizeLoggedSessionKind, pickPrimaryFocus, prettyFocusName, prettyWorkoutTypeLabel, saveWorkoutSessionSnapshots } from './route-planner.js';
import { loadDayJournal } from '../ui/journey.js';
import { SPORT_MATRIX } from './sports-matrix.js';
import { buildStrengthSessionRoutine, getGymPlanPrefs, isStrengthFocus, resolveStrengthSession } from './strength-engine.js';
import {
    getHypertrophySessionRoutine,
    isHypertrophyFocus,
    isHypertrophyPhase
} from './hypertrophy-engine.js';
import { persistUserConfigToCloud } from './thermodynamics.js';
import { DAILY_HYDRATION_TARGET_L } from '../config/constants.js';
import { estimateFoodWaterMl, getHydrationLitersForDate, parseFoodLogDetails } from '../lib/food-parse.js';
import { computeDomainBarLayout, formatDomainAimLabel, getMacroRange } from '../lib/macro-range.js';
import { getRecommendedSleepHours, getSleepDrivingRpeLoad, getTodaySleepHours, resolveSessionRpe } from './sleep-rpe.js';
import {
    draftMatchesPlanEvent,
    getDraftSessionLabel,
    loadWorkoutDraft
} from './workout-draft.js';

// --- THE FITNESS HUD DOMAIN MULTIPLIERS ---
// Before the JSON seed is applied, these fallbacks convert volume into fitness scores.
// MULTIPLIERS NOW BASED ON "EFFECTIVE STRAIN MINUTES" 
// (1 point = 1 minute of intense work in that system)
export const FITNESS_MULTIPLIERS = {
    lifting: { str: 4.0, pow: 0.5, crd: 0.0, end: 1.5, spd: 0.0 },  // Consolidated Lifting Category
    strength: { str: 4.0, pow: 0.5, crd: 0.0, end: 1.0, spd: 0.0 }, 
    power: { str: 1.0, pow: 4.0, crd: 0.0, end: 0.5, spd: 2.0 },    
    cardio: { str: 0.0, pow: 0.0, crd: 1.0, end: 0.5, spd: 0.0 },    
    sprint: { str: 0.0, pow: 1.0, crd: 0.5, end: 1.0, spd: 2.0 },    
    hypertrophy: { str: 1.0, pow: 0.0, crd: 0.0, end: 3.0, spd: 0.0 }, 
    custom: { str: 1.0, pow: 1.0, crd: 1.0, end: 1.0, spd: 1.0 }
};

// --- THE AUTO-PLANNER (Sequential GPS with Fatigue Rerouting) ---
export function getTodayFocus() {
    // Apply weekly quota planner + sport locks to TODAY
    let focus = 'Rest';
    try {
        const today = new Date();
        const dayEvents = getPlannedDayEvents(today);
        focus = pickPrimaryFocus(dayEvents);
        window.todayRouteEvents = dayEvents;
        // Keep legacy index roughly synced for any remaining callers
        const cycle = ['Full Body / Strength A', 'Cardio (Steady)', 'Rest', 'Auxiliary', 'Lactate', 'Full Body / Strength B', 'Rest'];
        const idx = cycle.findIndex(c => c === focus || (isSteadyCardio(focus) && isSteadyCardio(c)) || (isStrengthEvent(focus) && isStrengthEvent(c) && c.includes(focus.includes('B') ? 'B' : 'A')));
        if (idx >= 0) localStorage.setItem('ascensus_gps_index', String(idx));
    } catch (e) {
        console.warn('Route overlay failed:', e);
        window.todayRouteEvents = [focus];
    }
    
    const titleEl = document.getElementById('auto-focus-title');
    const descEl = document.getElementById('auto-focus-desc');
    const inputEl = document.getElementById('today-focus');
    const label = (window.todayRouteEvents && window.todayRouteEvents.length > 1)
        ? formatEventsLabel(window.todayRouteEvents)
        : prettyFocusName(focus);

    if (inputEl) inputEl.value = focus;
    if (titleEl) titleEl.innerText = label;
    if (descEl) {
        if(focus === 'Rest') descEl.innerText = "System recovery. Optional Zone 2 steady is available if you feel good.";
        else if(focus === 'Rest (Cardio Only)') descEl.innerText = "Recovery day — no lifting. Optional Zone 2 steady is available.";
        else if(focus === 'Game') descEl.innerText = "Match day. Log Match when done — Rest tomorrow only if RPE > 5.";
        else if(focus === 'Practice') descEl.innerText = "Practice day. Tap LOG PRACTICE below when done.";
        else if (isSteadyCardio(focus)) descEl.innerText = "Steady-state cardio. Zone 2 aerobic work.";
        else if (isLactateEvent(focus)) {
            try {
                const slot = getLactateSlotForDate(dateToISO(new Date()));
                const proto = getLactateProtocolForSlot(slot);
                descEl.innerText = `Lactate/HIT (~45 min). Session ${slot}: ${proto.summary}. Search HIT type(s) when you start.`;
            } catch (e) {
                descEl.innerText = "Lactate/HIT session (~45 min). 10 min HIT — search type(s) when you start.";
            }
        }
        else if (focus === 'Auxiliary' && !isHypertrophyPhase()) {
            const bandOn = !!(typeof getGymPlanPrefs === 'function' ? getGymPlanPrefs().band : store.userConfig.bandAuxiliary);
            descEl.innerText = bandOn
                ? "Band auxiliary — resistance-band prehab & weak-point work (no machines required)."
                : "Prehab, weak points, and joint integrity.";
        }
        else if (isHypertrophyFocus(focus) || (isHypertrophyPhase() && isStrengthFocus(focus))) {
            const built = getHypertrophySessionRoutine(focus);
            descEl.innerText = `Hypertrophy — ${built.label || 'session'}. Stick to rest times so the session finishes on schedule.`;
        }
        else if (isStrengthFocus(focus)) {
            const sess = resolveStrengthSession(focus) || 'A';
            const withAux = !isHypertrophyPhase() && (window.todayRouteEvents || []).some(isAuxEvent);
            descEl.innerText = (sess === 'A'
                ? "Strength Session A — Hinge, Upper Push, Lower Pull, Unilateral Flexion."
                : "Strength Session B — Bilateral Flexion, Upper Pull, Lower Push, Core.")
                + (withAux ? " Auxiliary finisher attached." : "");
        }
        else descEl.innerText = "Mechanical Load Protocol.";
    }

    try {
        let targetFocus = focus;
        if (focus === 'Rest (Cardio Only)') targetFocus = 'Cardio';
        else if (isSteadyCardio(focus)) targetFocus = 'Cardio';
        else if (isLactateEvent(focus)) targetFocus = 'Cardio';
        setDailyFitnessTargets(targetFocus);
        renderWorkoutPreview(focus);
    } catch (e) {
        console.warn('Drive preview refresh failed:', e);
    } finally {
        updateSportLogButtons();
        try { generateDailyExerciseLog(); } catch (e) { console.warn(e); }
    }
    return focus;
}

/** App-generated sessions that use Execute GPS Route (Strength, Aux, Lactate, Steady, etc.). */
export function isAppGeneratedWorkoutEvent(e) {
    if (!e || isPracticeEvent(e) || isGameEvent(e) || isRestEvent(e)) return false;
    return isLiftingEvent(e) || isAuxEvent(e) || isLactateEvent(e) || isSteadyCardio(e) || isStrengthEvent(e);
}

export function updateSportLogButtons() {
    const practiceBtn = document.getElementById('log-practice-btn');
    const matchBtn = document.getElementById('log-match-btn');
    const gpsBtn = document.getElementById('btn-execute-gps-route');
    const gpsRow = document.getElementById('gps-route-actions');
    const manualBtn = document.getElementById('log-manual-workout-btn');
    // Per-card Log on Exercise Plan replaces the shared Start / practice / match footers.
    if (gpsBtn) gpsBtn.style.display = 'none';
    if (gpsRow) gpsRow.style.display = 'none';
    if (practiceBtn) practiceBtn.style.display = 'none';
    if (matchBtn) matchBtn.style.display = 'none';
    if (manualBtn) manualBtn.style.display = 'flex';
}
export function updateLogPracticeButton() { updateSportLogButtons(); }

/** Periodization note + coach tip — for Start workout view, not the default preview card. */
export function getWorkoutSessionAdvice(focus) {
    const phaseStr = getSeasonPhase();
    const pData = PERIODIZATION[phaseStr] || { notes: 'Standard' };
    let footerNote = '';
    let showCoachTip = true;

    if (isGuidanceOff('workout') && focus !== 'Rest' && focus !== 'Game' && focus !== 'Practice' && focus !== 'Match') {
        footerNote = 'No recommended session. Use Log manual workout in the Log tab, or switch Workout back on in Tracker.';
        showCoachTip = false;
    } else if (focus === 'Rest') {
        footerNote = 'Active rest recommended. Prioritize sleep and hydration.';
        showCoachTip = false;
    } else if (focus === 'Rest (Cardio Only)') {
        footerNote = 'High-RPE practice recovery. Steady cardio permitted — no lifting.';
        showCoachTip = false;
    } else if (focus === 'Game' || focus === 'Match') {
        footerNote = 'No lifting. Log Match below — Rest tomorrow only if Match RPE > 5.';
        showCoachTip = false;
    } else if (isLactateEvent(focus)) {
        footerNote = 'High-intensity anaerobic work. Not paired with Practice.';
    } else if (isSteadyCardio(focus) || focus === 'Cardio') {
        footerNote = 'Zone 2 aerobic work. Can share a day with Practice.';
    } else if (focus === 'Practice') {
        const alsoLift = (window.todayRouteEvents || []).some(isLiftingEvent);
        footerNote = alsoLift ? 'Lifting is also scheduled today.' : 'Use Log practice below when finished to open the brain dump.';
        showCoachTip = false;
    } else {
        footerNote = pData.notes;
    }

    return { footerNote, showCoachTip };
}

function buildSessionExerciseRowsHtml(exercises) {
    let html = '';
    (exercises || []).forEach(ex => {
        const row = (typeof ex === 'string') ? { name: ex } : ex;
        const name = row.name || row.label || 'Exercise';
        const hasPrescription = typeof row.sets === 'number' && typeof row.reps === 'number';
        const qty = hasPrescription
            ? `<span style="color:var(--text-main); font-family:'Roboto Mono'; font-weight:600; font-size:11px;">${row.sets}x${row.reps}</span>`
            : '';
        html += `<div style="font-size:12px; color:var(--text-silver); margin-bottom:6px; line-height:1.35;">
            ${qty}${qty ? '<span style="color:var(--text-muted);"> </span>' : ''}
            <span style="color:var(--text-main); font-weight:600;">${name}</span>
        </div>`;
    });
    return html;
}

/** Map a planned/logged event to a stable credit key for plan↔log matching. */
function planEventCreditKey(eventName) {
    if (!eventName || typeof eventName !== 'string') return null;
    if (isPracticeEvent(eventName) || /^practice$/i.test(eventName)) return 'Practice';
    if (isGameEvent(eventName) || /^(match|game)$/i.test(eventName)) return 'Match';
    if (isRestEvent(eventName)) return null;
    const normalized = normalizeLoggedSessionKind(eventName);
    if (normalized) return normalized;
    if (isAuxEvent(eventName)) return 'Auxiliary';
    if (isLiftingEvent(eventName) || isStrengthEvent(eventName)) return 'Full Body / Strength';
    return eventName;
}

/** Logged session/journal credits available for today's plan (consumable counts). */
function getTodayLoggedCreditCounts() {
    const todayIso = (() => {
        try { return dateToISO(new Date()); } catch (e) {
            const d = new Date();
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        }
    })();
    const counts = Object.create(null);
    const bump = (key) => {
        if (!key) return;
        counts[key] = (counts[key] || 0) + 1;
    };

    const sessions = (typeof listWorkoutSessionsForDate === 'function')
        ? listWorkoutSessionsForDate(todayIso)
        : [];
    sessions.forEach(s => bump(planEventCreditKey(s?.kind)));

    const dayJournal = loadDayJournal(todayIso);
    if (dayJournal && (dayJournal.source === 'practice' || dayJournal.type === 'practice')) {
        if (!(counts.Practice > 0)) bump('Practice');
    }
    if (dayJournal && (dayJournal.source === 'match' || dayJournal.type === 'match')) {
        if (!(counts.Match > 0)) bump('Match');
    }

    return counts;
}

/** Drop plan slots already covered by today's log; mutates credit counts. */
function filterUnloggedPlanSlots(slots, creditCounts) {
    const counts = { ...creditCounts };
    return (slots || []).filter(slot => {
        const key = planEventCreditKey(slot?.event);
        if (!key) return true;
        if ((counts[key] || 0) > 0) {
            counts[key] -= 1;
            return false;
        }
        return true;
    });
}

export function renderWorkoutPreview(focus) {
    const previewEl = document.getElementById('daily-workout-preview');
    if (!previewEl) return;

    const today = new Date();
    const dayEvents = window.todayRouteEvents || getPlannedDayEvents(today);
    const slots = assignPairedSessionSlots(today, dayEvents);
    const loggedCredits = getTodayLoggedCreditCounts();
    const remainingSlots = filterUnloggedPlanSlots(slots, loggedCredits);
    const hadTasks = slots.length > 0;
    const allTasksDone = hadTasks && remainingSlots.length === 0;

    const primary = focus || pickPrimaryFocus(dayEvents);
    if (primary === 'Full Body / Strength' || isStrengthFocus(primary)) {
        try {
            const prefs = getGymPlanPrefs();
            const isElite = store.userConfig.sport !== 'None';
            const sportData = (isElite && SPORT_MATRIX[store.userConfig.sport]) ? SPORT_MATRIX[store.userConfig.sport] : SPORT_MATRIX['None'];
            const built = buildStrengthSessionRoutine(primary, sportData, prefs.setBudget);
            window._strengthPreviewSession = built.session;
        } catch (_) { /* preview session letter is best-effort */ }
    }

    const draft = loadWorkoutDraft();

    const resumeStopActions = () => `<div style="display:flex; flex-direction:column; gap:6px; flex-shrink:0;" onclick="event.stopPropagation();">
        <button type="button" class="btn-primary is-secondary meal-log-btn" onclick="event.stopPropagation(); resumeInProgressWorkout();">Resume</button>
        <button type="button" class="btn-primary is-secondary meal-log-btn" onclick="event.stopPropagation(); stopInProgressWorkout();">Stop</button>
    </div>`;

    const buildCard = (eventName, timeLabel) => {
        const { sessionType, sessionName } = getWorkoutExerciseRows(eventName);
        const safeFocus = String(eventName || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const userPlanned = isPracticeEvent(eventName) || isGameEvent(eventName);
        const isRest = isRestEvent(eventName);
        const accent = isPracticeEvent(eventName)
            ? '#0A84FF'
            : (isGameEvent(eventName) ? 'var(--gold-accent)' : null);
        const borderStyle = accent
            ? `border-left:3px solid ${accent};`
            : '';
        const timeLine = timeLabel
            ? `<div style="margin-top:2px; font-size:10px; color:var(--text-stealth); font-family:'Roboto Mono'; letter-spacing:0.3px;">${timeLabel}</div>`
            : '';
        const scheduleChip = userPlanned
            ? `<div style="margin-top:4px; font-size:10px; color:${accent}; font-family:'Roboto Mono'; letter-spacing:0.3px;">Your schedule</div>`
            : '';
        const clickAttrs = userPlanned
            ? ''
            : `role="button" tabindex="0" onclick="openWorkoutDomainsDetail('${safeFocus}')"`;
        const cardStyle = `padding:16px; margin-bottom:12px; ${userPlanned ? '' : 'cursor:pointer;'} ${borderStyle}`;

        let logAction = '';
        if (!isRest) {
            if (draft && draftMatchesPlanEvent(eventName, draft)) {
                logAction = resumeStopActions();
            } else {
                logAction = `<button type="button" class="btn-primary is-secondary meal-log-btn" onclick="event.stopPropagation(); startExecution('workout', this, '${safeFocus}')">Start</button>`;
            }
        }

        return `<div class="card" ${clickAttrs} style="${cardStyle}">
            <div style="display:flex; justify-content:space-between; align-items:stretch; gap:12px; min-width:0;">
                <div style="min-width:0; flex:1;">
                    <strong style="font-size:11px; color:var(--text-muted); font-family:'Roboto Mono'; letter-spacing:0.4px; display:flex; align-items:center; min-width:0;">${sessionType}</strong>
                    ${timeLine}
                    <div style="margin-top:4px; color:var(--text-main); font-size:12px; font-weight:600; line-height:1.35; min-width:0;">${sessionName}</div>
                    ${scheduleChip}
                </div>
                ${logAction}
            </div>
        </div>`;
    };

    const draftBanner = draft
        ? `<div class="card" style="padding:14px 16px; margin-bottom:12px; border-left:3px solid var(--gold-accent);">
            <div style="display:flex; justify-content:space-between; align-items:stretch; gap:12px; min-width:0;">
                <div style="min-width:0; flex:1;">
                    <strong style="font-size:11px; color:var(--gold-accent); font-family:'Roboto Mono'; letter-spacing:0.4px;">Workout in progress</strong>
                    <div style="margin-top:4px; color:var(--text-main); font-size:12px; font-weight:600; line-height:1.35;">${getDraftSessionLabel(draft)}</div>
                    <div style="margin-top:2px; font-size:10px; color:var(--text-stealth); font-family:'Roboto Mono';">Resume to continue, or Stop to discard.</div>
                </div>
                ${resumeStopActions()}
            </div>
        </div>`
        : '';

    if (allTasksDone) {
        previewEl.innerHTML = draftBanner + `<div class="card" style="padding:20px 16px; margin-bottom:12px; text-align:center;">
            <div style="font-family:'Roboto Mono'; font-size:12px; font-weight:600; color:var(--gold-accent); letter-spacing:0.3px; line-height:1.5;">
                Congrats, you have completed all tasks set for today
            </div>
        </div>`;
        updatePreviousMatchEntryButton(dayEvents);
        return;
    }

    if (!remainingSlots.length) {
        const restFocus = (dayEvents || []).includes('Rest (Cardio Only)') ? 'Rest (Cardio Only)' : 'Rest';
        const steadyAlreadyLogged = (loggedCredits['Cardio (Steady)'] || 0) > 0;
        let html = draftBanner + buildCard(restFocus, '');
        // Rest days always offer optional steady (unless already logged today)
        if (!steadyAlreadyLogged) {
            html += buildOptionalSteadyCard();
        }
        previewEl.innerHTML = html;
        updatePreviousMatchEntryButton(dayEvents);
        return;
    }

    previewEl.innerHTML = draftBanner + remainingSlots.map(s => buildCard(s.event, s.time)).join('');
    updatePreviousMatchEntryButton(dayEvents);
}

/** Optional Zone 2 card shown on every Rest day. */
function buildOptionalSteadyCard() {
    const draft = loadWorkoutDraft();
    const action = (draft && draftMatchesPlanEvent('Cardio (Steady)', draft))
        ? `<div style="display:flex; flex-direction:column; gap:6px; flex-shrink:0;" onclick="event.stopPropagation();">
            <button type="button" class="btn-primary is-secondary meal-log-btn" onclick="event.stopPropagation(); resumeInProgressWorkout();">Resume</button>
            <button type="button" class="btn-primary is-secondary meal-log-btn" onclick="event.stopPropagation(); stopInProgressWorkout();">Stop</button>
        </div>`
        : `<button type="button" class="btn-primary is-secondary meal-log-btn" onclick="event.stopPropagation(); startExecution('workout', this, 'Cardio (Steady)')">Start</button>`;
    return `<div class="card" role="button" tabindex="0" onclick="openWorkoutDomainsDetail('Cardio (Steady)')" style="padding:16px; margin-bottom:12px; cursor:pointer; border-left:3px solid var(--text-stealth);">
        <div style="display:flex; justify-content:space-between; align-items:stretch; gap:12px; min-width:0;">
            <div style="min-width:0; flex:1;">
                <strong style="font-size:11px; color:var(--text-muted); font-family:'Roboto Mono'; letter-spacing:0.4px;">Optional</strong>
                <div style="margin-top:4px; color:var(--text-main); font-size:12px; font-weight:600; line-height:1.35;">Steady State Cardio</div>
                <div style="margin-top:4px; font-size:10px; color:var(--text-stealth); font-family:'Roboto Mono'; letter-spacing:0.3px;">Zone 2 — available on rest days</div>
            </div>
            ${action}
        </div>
    </div>`;
}

/** Show “View previous match's entry” when a prior match diary exists. */
function updatePreviousMatchEntryButton(dayEvents) {
    const wrap = document.getElementById('previous-match-entry-wrap');
    if (!wrap) return;
    const todayHasMatch = (dayEvents || []).some(e => isGameEvent(e));
    const prev = findPreviousMatchJournal();
    wrap.classList.toggle('hidden', !(todayHasMatch && prev));
}

function findPreviousMatchJournal() {
    const today = new Date();
    for (let i = 1; i <= 60; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const iso = dateToISO(d);
        const j = loadDayJournal(iso);
        if (j && (j.source === 'match' || j.type === 'match')) {
            return { iso, journal: j };
        }
    }
    return null;
}

export function viewPreviousMatchEntry() {
    const prev = findPreviousMatchJournal();
    if (!prev) return alert('No previous match diary found.');
    const j = prev.journal;
    const when = new Date(prev.iso + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    const bits = [
        `Previous match — ${when}`,
        `RPE: ${j.rpe != null ? j.rpe : '—'}`,
        j.athletic != null ? `Athletic: ${j.athletic}` : null,
        j.mental != null ? `Mental: ${j.mental}` : null,
        j.matchPerformance != null ? `Match: ${j.matchPerformance}` : null,
        j.notes ? `\n${j.notes}` : null
    ].filter(Boolean);
    alert(bits.join('\n'));
}

/** Edit session duration from Drive → Log (feeds sleep RPE rules). */
export function updateLoggedSessionDuration(sessionId, minutes) {
    const mins = Math.max(0, Math.round(parseFloat(minutes) || 0));
    const snaps = loadWorkoutSessionSnapshots();
    if (!snaps[sessionId]) return;
    snaps[sessionId].durationMinutes = mins;
    snaps[sessionId].durationMs = mins > 0 ? mins * 60000 : 0;
    snaps[sessionId].durationLabel = null; // rebuilt from durationMs when shown
    snaps[sessionId].rpe = resolveSessionRpe({
        kind: snaps[sessionId].kind,
        durationMinutes: mins,
        userRpe: snaps[sessionId].rpe
    });
    snaps[sessionId].updatedAt = new Date().toISOString();
    saveWorkoutSessionSnapshots(snaps);
    try { persistUserConfigToCloud(); } catch (e) { /* ignore */ }
    try {
        if (typeof window.updateLiveDashboard === 'function') {
            const todayStr = new Date().toLocaleDateString();
            const foods = store.globalGroupedHistory?.[todayStr]?.items?.filter(i => i.type === 'food') || [];
            window.updateLiveDashboard(foods);
        }
    } catch (e) { /* ignore */ }
    generateDailyExerciseLog();
}

/** Estimate domain points for a planned session (preview popup). */
export function estimateSessionDomainPoints(focus) {
    const { exercises } = getWorkoutExerciseRows(focus);
    const pts = { str: 0, pow: 0, spd: 0, crd: 0, end: 0 };

    (exercises || []).forEach(ex => {
        const name = typeof ex === 'string' ? ex : (ex?.name || '');
        if (!name || /no recommended|log (match|practice)|follow start|active recovery/i.test(name)) return;

        const sets = (typeof ex === 'object' && typeof ex.sets === 'number' && ex.sets > 0) ? ex.sets : 1;
        let exObj = store.globalExerciseDB.find(e => e.name === name);
        let domain = (exObj && exObj.domain ? exObj.domain : 'custom').toLowerCase();
        if (name.toLowerCase().includes('sprint')) domain = 'sprint';

        let isCardio = domain === 'cardio' || /zone\s*2|cardio|interval/i.test(name);
        if (isCardio && domain !== 'sprint') domain = 'cardio';
        if (!FITNESS_MULTIPLIERS[domain]) domain = 'custom';

        const mults = FITNESS_MULTIPLIERS[domain];
        const units = isCardio ? Math.max(1, /45|60|zone/i.test(name) ? 45 : sets) : sets;

        pts.str += units * mults.str;
        pts.pow += units * mults.pow;
        pts.spd += units * mults.spd;
        pts.crd += units * mults.crd;
        pts.end += units * mults.end;
    });

    return pts;
}

function detailMetricRowHtml(label, valueText, pct) {
    const width = Math.min(100, Math.max(0, Number(pct) || 0));
    return `<div class="detail-metric-row">
        <div style="display:flex; justify-content:space-between;">
            <span class="hud-label" style="margin:0;">${label}</span>
            <span style="font-family:'Roboto Mono'; font-size:11px; color:var(--text-silver);">${valueText}</span>
        </div>
        <div class="progress-bar-bg"><div class="progress-bar-fill under" style="width:${width}%;"></div></div>
    </div>`;
}

export function openWorkoutDomainsDetail(focus) {
    const sheet = document.getElementById('workout-domains-sheet');
    const titleEl = document.getElementById('workout-domains-title');
    const listEl = document.getElementById('workout-domains-list');
    const exercisesEl = document.getElementById('workout-domains-exercises');
    if (!sheet || !listEl) return;

    const resolved = focus || getTodayFocus();
    const { sessionName, exercises } = getWorkoutExerciseRows(resolved);
    const pts = estimateSessionDomainPoints(resolved);
    const max = Math.max(pts.str, pts.pow, pts.spd, pts.crd, pts.end, 1);

    if (titleEl) titleEl.textContent = sessionName || 'Workout';

    listEl.innerHTML = [
        ['str', 'Strength'],
        ['pow', 'Power'],
        ['spd', 'Speed'],
        ['crd', 'Cardio'],
        ['end', 'Endurance']
    ].map(([k, label]) => {
        const v = Math.round(pts[k] || 0);
        return detailMetricRowHtml(label, String(v), (pts[k] / max) * 100);
    }).join('');

    if (exercisesEl) {
        exercisesEl.innerHTML = buildSessionExerciseRowsHtml(exercises)
            || `<div style="font-size:12px; color:var(--text-muted);">No exercises</div>`;
    }

    sheet.classList.remove('hidden');
}

export function closeWorkoutDomainsDetail() {
    document.getElementById('workout-domains-sheet')?.classList.add('hidden');
}

/** Bottom "Logged today" list on Drive — mirrors meal plan cards under Today's Food. */
export function generateDailyExerciseLog() {
    const container = document.getElementById('daily-exercise-log');
    if (!container) return;

    const todayStr = new Date().toLocaleDateString();
    const todayIso = (() => {
        try { return dateToISO(new Date()); } catch (e) {
            const d = new Date();
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        }
    })();
    const day = store.globalGroupedHistory && store.globalGroupedHistory[todayStr];
    const workouts = day ? day.items.filter(i => i.type === 'workout') : [];
    const sessions = (typeof listWorkoutSessionsForDate === 'function')
        ? listWorkoutSessionsForDate(todayIso)
        : [];

    const dayJournal = loadDayJournal(todayIso);
    const hasSportDiary = !!(dayJournal && (
        dayJournal.source === 'practice' || dayJournal.type === 'practice'
        || dayJournal.source === 'match' || dayJournal.type === 'match'
    ));

    let html = '';

    if (!workouts.length && !sessions.length && !hasSportDiary) {
        html = `<div style="font-size:12px; color:var(--text-muted); font-family:'Roboto Mono'; margin-bottom:24px; line-height:1.45;">Nothing logged yet</div>`;
        container.innerHTML = html;
        return;
    }

    const usedLogIds = new Set();

    const summarizeSetRows = (rows) => {
        if (!rows || !rows.length) return '';
        const first = rows[0];
        const isSport = first.exercise === 'Practice' || first.exercise === 'Match';
        const isCardio = rows.some(r => Number(r.distance_km) > 0 || (Number(r.time_minutes) > 0 && !(Number(r.weight_kg) > 0) && !(Number(r.reps) > 0)));
        const isStretch = rows.every(r =>
            Number(r.time_minutes) > 0 && !(Number(r.weight_kg) > 0) && !(Number(r.reps) > 0) && !(Number(r.distance_km) > 0)
            && /stretch|mobility|yoga/i.test(r.exercise || '')
        );

        if (isSport) {
            return `RPE ${first.rpe != null ? first.rpe : '—'}`;
        }
        if (isStretch) {
            const durations = rows.map(r => Number(r.time_minutes) || 0).filter(n => n > 0);
            const avg = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
            return avg > 0 ? `${rows.length}×${avg} min` : `${rows.length} sets`;
        }
        if (isCardio) {
            const dist = rows.map(r => Number(r.distance_km) || 0).find(n => n > 0) || 0;
            const dur = rows.map(r => Number(r.time_minutes) || 0).find(n => n > 0) || 0;
            const bits = [];
            if (dist > 0) bits.push(`${dist}km`);
            if (dur > 0) bits.push(`${dur} min`);
            return bits.length ? bits.join(' · ') : `${rows.length} sets`;
        }

        const repsList = rows.map(r => Number(r.reps) || 0);
        const weights = rows.map(r => Number(r.weight_kg) || 0);
        const positiveReps = repsList.filter(n => n > 0);
        const positiveWeights = weights.filter(n => n > 0);
        const commonReps = positiveReps.length && positiveReps.every(r => r === positiveReps[0]) ? positiveReps[0] : null;
        const commonWeight = positiveWeights.length && positiveWeights.every(w => w === positiveWeights[0]) ? positiveWeights[0] : null;

        if (commonReps != null) {
            let detail = `${rows.length}×${commonReps}`;
            if (commonWeight != null) detail += ` @ ${commonWeight}kg`;
            else if (positiveWeights.length) detail += ` @ ${[...new Set(positiveWeights)].join('/')}kg`;
            return detail;
        }
        if (positiveReps.length) {
            const parts = rows.map((r, i) => {
                const reps = Number(r.reps) || 0;
                const w = Number(r.weight_kg) || 0;
                if (!reps) return null;
                return w > 0 ? `${reps}@${w}kg` : String(reps);
            }).filter(Boolean);
            return parts.length ? `${rows.length} sets (${parts.join(', ')})` : `${rows.length} sets`;
        }
        if (first.notes) return String(first.notes).slice(0, 80);
        if (first.rpe != null) return `RPE ${first.rpe}`;
        return `${rows.length} sets`;
    };

    const renderExerciseLines = (logs) => {
        let block = '';
        const grouped = (logs || []).reduce((acc, w) => {
            const key = w.exercise || 'Workout';
            if (!acc[key]) acc[key] = [];
            acc[key].push(w);
            return acc;
        }, {});
        for (const exName in grouped) {
            const rows = grouped[exName];
            rows.forEach(log => { if (log.id != null) usedLogIds.add(String(log.id)); });
            const detail = summarizeSetRows(rows);
            block += `<div style="display:flex; justify-content:space-between; align-items:baseline; gap:10px; margin-bottom:8px;">
                <div style="font-size:13px; color:var(--text-main); font-weight:700; min-width:0;">${exName}</div>
                <div style="font-size:12px; color:var(--text-silver); font-family:'Roboto Mono'; font-weight:600; white-space:nowrap; flex-shrink:0;">${detail}</div>
            </div>`;
        }
        return block;
    };

    const formatSecShort = (sec) => {
        const n = Math.max(0, Math.round(Number(sec) || 0));
        if (!n) return '—';
        if (n % 60 === 0) return `${n / 60}m`;
        if (n > 60) return `${Math.floor(n / 60)}m ${n % 60}s`;
        return `${n}s`;
    };

    const parseWorkRestFromNotes = (notes) => {
        const m = String(notes || '').match(/((?:\d+\s*m\s*)?(?:\d+\s*s)?|\d+\s*m|\d+\s*s)\s*work\s*\/\s*((?:\d+\s*m\s*)?(?:\d+\s*s)?|\d+\s*m|\d+\s*s)\s*rest/i);
        if (!m) return {};
        const parseLabel = (label) => {
            const t = String(label || '').trim();
            let sec = 0;
            const mins = t.match(/(\d+)\s*m/);
            const secs = t.match(/(\d+)\s*s/);
            if (mins) sec += Number(mins[1]) * 60;
            if (secs) sec += Number(secs[1]);
            if (!mins && !secs && /^\d+$/.test(t)) sec = Number(t);
            return sec > 0 ? sec : null;
        };
        return { work: parseLabel(m[1]), rest: parseLabel(m[2]) };
    };

    const summarizeLactateSnapshotSets = (sets) => {
        const rows = (sets || []).filter(s => s && s.completed !== false);
        if (!rows.length) return 'No sets';
        return rows.map((s, i) => {
            let work = Number(s.duration_sec) > 0 ? Number(s.duration_sec)
                : (s.isLactateHit && Number(s.reps) >= 20 ? Number(s.reps) : null);
            let rest = Number(s.restTime) > 0 ? Number(s.restTime) : null;
            if ((work == null || rest == null) && s.notes) {
                const parsed = parseWorkRestFromNotes(s.notes);
                if (work == null && parsed.work != null) work = parsed.work;
                if (rest == null && parsed.rest != null) rest = parsed.rest;
            }
            return `Set ${i + 1}: ${formatSecShort(work)} action · ${rest > 0 ? formatSecShort(rest) : '—'} rest`;
        }).join('<br>');
    };

    const summarizeSnapshotSets = (sets) => {
        // Only sets the user checked off
        const rows = (sets || []).filter(s => s.completed === true);
        if (!rows.length) return 'No checked sets';
        if (rows.some(s => s.isLactateHit || Number(s.duration_sec) > 0)) {
            return summarizeLactateSnapshotSets(rows);
        }
        const isCardio = rows.some(s => Number(s.distance_km) > 0 || (Number(s.time_minutes) > 0 && !(Number(s.weight) > 0) && !(Number(s.reps) > 0)));
        if (isCardio) {
            const dist = rows.map(s => Number(s.distance_km) || 0).find(n => n > 0) || 0;
            const dur = rows.map(s => Number(s.time_minutes) || 0).find(n => n > 0) || 0;
            const bits = [];
            if (dist > 0) bits.push(`${dist}km`);
            if (dur > 0) bits.push(`${dur} min`);
            return bits.length ? bits.join(' · ') : `${rows.length} sets`;
        }
        const repsList = rows.map(s => {
            if (typeof s.reps === 'string' && s.reps.trim()) return s.reps.trim();
            return Number(s.reps) || 0;
        });
        const numericReps = repsList.map(r => typeof r === 'number' ? r : 0).filter(n => n > 0);
        const weights = rows.map(s => Number(s.weight) || 0);
        const positiveWeights = weights.filter(n => n > 0);
        const commonReps = numericReps.length && numericReps.every(r => r === numericReps[0]) ? numericReps[0] : null;
        const commonWeight = positiveWeights.length && positiveWeights.every(w => w === positiveWeights[0]) ? positiveWeights[0] : null;
        if (commonReps != null) {
            let detail = `${rows.length}×${commonReps}`;
            if (commonWeight != null) detail += ` @ ${commonWeight}kg`;
            else if (positiveWeights.length) detail += ` @ ${[...new Set(positiveWeights)].join('/')}kg`;
            return detail;
        }
        if (numericReps.length) {
            const parts = rows.map(s => {
                const reps = Number(s.reps) || 0;
                const w = Number(s.weight) || 0;
                if (!reps) return typeof s.reps === 'string' ? s.reps : null;
                return w > 0 ? `${reps}@${w}kg` : String(reps);
            }).filter(Boolean);
            return parts.length ? `${rows.length} sets (${parts.join(', ')})` : `${rows.length} sets`;
        }
        const stringReps = repsList.filter(r => typeof r === 'string' && r);
        if (stringReps.length) return stringReps.length === 1 ? stringReps[0] : `${rows.length} sets`;
        return `${rows.length} sets`;
    };

    if (sessions.length) {
        sessions.forEach(sess => {
            const label = prettyWorkoutTypeLabel(sess.kind);
            const idSet = new Set((sess.logIds || []).map(String));
            const sessionLogs = workouts.filter(w => idSet.has(String(w.id)));
            sessionLogs.forEach(w => { if (w.id != null) usedLogIds.add(String(w.id)); });
            const isLactateSess = isLactateEvent(sess.kind) || sess.kind === 'Lactate'
                || (Array.isArray(sess.items) && sess.items.some(i => i.isLactateHit || (i.sets || []).some(s => s.isLactateHit || Number(s.duration_sec) > 0)));
            // Lactate/HIT: always use session snapshot (has action + rest). Other kinds: logs then snapshot.
            let bodyHtml = '';
            if (isLactateSess && Array.isArray(sess.items) && sess.items.length) {
                bodyHtml = sess.items.map(item => {
                    const name = item.exercise?.name || item.name || 'Exercise';
                    const summary = summarizeLactateSnapshotSets(item.sets || []);
                    return `<div style="display:flex; justify-content:space-between; align-items:baseline; gap:10px; margin-bottom:8px;">
                        <div style="font-size:13px; color:var(--text-main); font-weight:700; min-width:0;">${name}</div>
                        <div style="font-size:11px; color:var(--text-silver); font-family:'Roboto Mono'; font-weight:600; text-align:right; flex-shrink:0;">${summary}</div>
                    </div>`;
                }).join('');
            } else {
                bodyHtml = renderExerciseLines(sessionLogs);
            }
            if (!bodyHtml && Array.isArray(sess.items)) {
                bodyHtml = sess.items.map(item => {
                    const name = item.exercise?.name || item.name || 'Exercise';
                    const summary = summarizeSnapshotSets(item.sets || []);
                    return `<div style="display:flex; justify-content:space-between; align-items:baseline; gap:10px; margin-bottom:8px;">
                        <div style="font-size:13px; color:var(--text-main); font-weight:700; min-width:0;">${name}</div>
                        <div style="font-size:12px; color:var(--text-silver); font-family:'Roboto Mono'; font-weight:600; white-space:nowrap; flex-shrink:0;">${summary}</div>
                    </div>`;
                }).join('');
            }
            const durMin = Number(sess.durationMinutes) || 0;
            html += `<div class="card" style="padding:16px; margin-bottom:12px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; gap:10px;">
                    <div>
                        <div style="font-size:10px; color:var(--gold-accent); font-family:'Roboto Mono'; font-weight:800; letter-spacing:0.6px; text-transform:uppercase;">${label}</div>
                        <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">Logged today</div>
                        <div style="display:flex; align-items:center; gap:6px; margin-top:8px;">
                            <span style="font-size:10px; color:var(--text-stealth); font-family:'Roboto Mono'; text-transform:uppercase;">Time</span>
                            <input type="number" min="1" max="600" step="1" value="${durMin > 0 ? durMin : ''}" placeholder="min"
                                onchange="updateLoggedSessionDuration('${sess.id}', this.value)"
                                style="width:64px; background:var(--bg-surface-elevated); border:1px solid var(--border-subtle); border-radius:6px; color:var(--text-main); font-family:'Roboto Mono'; font-size:12px; padding:4px 6px; text-align:center;">
                            <span style="font-size:10px; color:var(--text-muted);">min</span>
                        </div>
                    </div>
                    <button type="button" class="btn-primary is-secondary" style="width:auto; margin:0; padding:8px 14px; font-size:11px;" onclick="editLoggedWorkoutSession('${sess.id}')">Edit</button>
                </div>
                ${bodyHtml || `<div style="font-size:12px; color:var(--text-muted);">Session saved</div>`}
            </div>`;
        });
    }

    // Any workout rows not yet attached to a session snapshot (legacy) — still editable
    const orphanLogs = workouts.filter(w => !usedLogIds.has(String(w.id)) && w.exercise !== 'Practice' && w.exercise !== 'Match');
    if (orphanLogs.length) {
        // Prefer one combined card when it's clearly a cardio session bundle
        const cardioOrphans = orphanLogs.filter(l =>
            (Number(l.distance_km) > 0) || (Number(l.time_minutes) > 0)
            || /cardio|steady|stretch|lactate|sprint|run|cycle|row|swim|bike/i.test(l.exercise || '')
        );
        const strengthOrphans = orphanLogs.filter(l => !cardioOrphans.includes(l));

        const renderOrphanSession = (logs, label) => {
            if (!logs.length) return;
            const names = [...new Set(logs.map(l => l.exercise || 'Workout'))];
            const ids = logs.map(l => l.id).filter(Boolean);
            const namesCsv = names.join('||').replace(/'/g, "\\'");
            const idsCsv = ids.join(',');
            let body = renderExerciseLines(logs);
            html += `<div class="card" style="padding:16px; margin-bottom:12px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; gap:10px;">
                    <div>
                        <div style="font-size:10px; color:var(--gold-accent); font-family:'Roboto Mono'; font-weight:800; letter-spacing:0.6px; text-transform:uppercase;">${label}</div>
                        <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">Logged today</div>
                    </div>
                    <button type="button" class="btn-primary is-secondary" style="width:auto; margin:0; padding:8px 14px; font-size:11px;" onclick="editOrphanWorkoutLogs('${namesCsv}', '${idsCsv}')">Edit</button>
                </div>
                ${body}
            </div>`;
        };

        if (cardioOrphans.length) {
            const isLactate = cardioOrphans.some(l => /lactate|sprint|interval/i.test(l.exercise || ''));
            renderOrphanSession(cardioOrphans, isLactate ? 'Lactate/HIT' : 'Steady State');
        }

        if (strengthOrphans.length) {
            // One combined card for the planned gym session (not one card per lift)
            const looksAux = strengthOrphans.every(l => /auxiliar|prehab|band/i.test(l.exercise || ''));
            renderOrphanSession(strengthOrphans, looksAux ? 'Auxiliary' : 'Gym Workout');
        }
    }

    // Practice / Match diary cards — editable/deletable from Log
    const practiceLogs = workouts.filter(w => !usedLogIds.has(String(w.id)) && w.exercise === 'Practice');
    const matchLogs = workouts.filter(w => !usedLogIds.has(String(w.id)) && w.exercise === 'Match');
    practiceLogs.forEach(l => usedLogIds.add(String(l.id)));
    matchLogs.forEach(l => usedLogIds.add(String(l.id)));

    const renderSportDiaryCard = (kind, logs, journal) => {
        const isMatch = kind === 'Match';
        const jOk = journal && (
            journal.source === kind.toLowerCase()
            || journal.type === kind.toLowerCase()
        );
        if (!logs.length && !jOk) return;

        const rpe = jOk && journal.rpe != null
            ? journal.rpe
            : (logs[0]?.rpe != null ? logs[0].rpe : '—');
        const notes = jOk && journal.notes
            ? String(journal.notes).slice(0, 140) + (String(journal.notes).length > 140 ? '…' : '')
            : '';
        const metaBits = [];
        if (jOk && journal.athletic != null) metaBits.push(`Athletic ${journal.athletic}`);
        if (jOk && journal.mental != null) metaBits.push(`Mental ${journal.mental}`);
        if (jOk && isMatch && journal.matchPerformance != null) metaBits.push(`Match ${journal.matchPerformance}`);

        html += `<div class="card" style="padding:16px; margin-bottom:12px;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px; margin-bottom:10px;">
                <div style="min-width:0; flex:1;">
                    <div style="font-size:10px; color:${isMatch ? '#0A84FF' : 'var(--gold-accent)'}; font-family:'Roboto Mono'; font-weight:800; letter-spacing:0.6px; text-transform:uppercase;">${kind} diary</div>
                    <div style="font-size:13px; color:var(--text-main); font-weight:700; margin-top:6px;">RPE ${rpe}</div>
                    ${metaBits.length ? `<div style="font-size:11px; color:var(--text-silver); margin-top:4px; font-family:'Roboto Mono';">${metaBits.join(' · ')}</div>` : ''}
                    ${notes ? `<div style="font-size:12px; color:var(--text-muted); margin-top:8px; line-height:1.45;">${notes.replace(/</g, '&lt;')}</div>` : ''}
                </div>
                <div style="display:flex; flex-direction:column; gap:8px; flex-shrink:0;">
                    <button type="button" class="btn-primary is-secondary" style="width:auto; margin:0; padding:8px 14px; font-size:11px;" onclick="editSportDiaryFromLog('${kind}')">Edit</button>
                    <button type="button" onclick="deleteSportDiaryFromLog('${kind}')" style="background:none; border:1px solid var(--border-subtle); color:var(--text-stealth); border-radius:8px; padding:8px 14px; font-size:11px; cursor:pointer; font-family:'Roboto Mono';">Delete</button>
                </div>
            </div>
        </div>`;
    };

    const practiceJournal = dayJournal && (dayJournal.source === 'practice' || dayJournal.type === 'practice') ? dayJournal : null;
    const matchJournal = dayJournal && (dayJournal.source === 'match' || dayJournal.type === 'match') ? dayJournal : null;
    renderSportDiaryCard('Practice', practiceLogs, practiceJournal);
    renderSportDiaryCard('Match', matchLogs, matchJournal);

    container.innerHTML = html;
}

export const DOMAIN_LABELS = { str: 'Strength', pow: 'Power', spd: 'Speed', crd: 'Cardio', end: 'Endurance' };

/** Normalize focus for domain target lookup (matches getTodayFocus). */
export function normalizeDomainFocus(focus) {
    if (!focus) return 'Rest';
    if (focus === 'Rest (Cardio Only)') return 'Cardio';
    if (isSteadyCardio(focus)) return 'Cardio';
    if (isLactateEvent(focus)) return 'Cardio';
    return focus;
}

/** Day domain targets without mutating store. */
export function getDayDomainTargets(focus) {
    const f = normalizeDomainFocus(focus);
    if (f === 'Rest') return { str: 0, pow: 0, spd: 0, crd: 0, end: 0 };
    if (typeof f === 'string' && f.includes('Strength')) return { str: 25, pow: 5, spd: 0, crd: 0, end: 10 };
    if (typeof f === 'string' && f.includes('Power')) return { str: 10, pow: 20, spd: 15, crd: 0, end: 5 };
    if (typeof f === 'string' && f.includes('Cardio')) return { str: 0, pow: 0, spd: 10, crd: 45, end: 20 };
    if (f === 'Auxiliary' || isAuxEvent(f)) return { str: 5, pow: 0, spd: 0, crd: 0, end: 20 };
    if (f === 'Practice' || f === 'Game' || f === 'Match') return { str: 20, pow: 10, spd: 5, crd: 10, end: 15 };
    return { str: 20, pow: 10, spd: 5, crd: 10, end: 15 };
}

/** Merge targets across multiple events (max per domain). */
export function mergeDayDomainTargets(events) {
    const raw = events || [];
    const list = raw.filter(e => e && !isRestEvent(e));
    if (!list.length) {
        if (raw.includes('Rest (Cardio Only)')) return getDayDomainTargets('Cardio');
        return getDayDomainTargets('Rest');
    }
    const merged = { str: 0, pow: 0, spd: 0, crd: 0, end: 0 };
    list.forEach(ev => {
        const t = getDayDomainTargets(ev);
        Object.keys(merged).forEach(k => { merged[k] = Math.max(merged[k], t[k] || 0); });
    });
    return merged;
}

export function formatDayDomainNames(targets) {
    const t = targets || {};
    const names = ['str', 'pow', 'spd', 'crd', 'end']
        .filter(k => (t[k] || 0) > 0)
        .map(k => DOMAIN_LABELS[k]);
    return names.length ? names.join(', ') : '—';
}

/** Top N domain labels by target weight, with ellipsis if more remain. */
export function formatTopDomainChip(targets, max = 2) {
    const t = targets || {};
    const ranked = ['str', 'pow', 'spd', 'crd', 'end']
        .map(k => ({ k, v: t[k] || 0 }))
        .filter(d => d.v > 0)
        .sort((a, b) => b.v - a.v);
    if (!ranked.length) return '—';
    const shown = ranked.slice(0, max).map(d => DOMAIN_LABELS[d.k]);
    const more = ranked.length > max;
    return more ? `${shown.join(', ')}...` : shown.join(', ');
}

function defaultPhaseReps() {
    const phaseStr = getSeasonPhase();
    const pData = PERIODIZATION[phaseStr] || { reps: 8 };
    return pData.reps;
}

function withPhaseReps(exercises) {
    const reps = defaultPhaseReps();
    return (exercises || []).map(ex => {
        const row = (typeof ex === 'string') ? { name: ex } : { ...ex };
        if (typeof row.sets === 'number' && row.reps == null) row.reps = reps;
        return row;
    });
}

export function setDailyFitnessTargets(focus) {
    store.dailyFitnessTargets = getDayDomainTargets(focus);
    updateFitnessHUD();
}

/** Exercise rows for a focus (no chrome). Used by Today preview and Plan popup. */
export function getWorkoutExerciseRows(focus) {
    let isElite = store.userConfig.sport !== 'None';
    let sportData = (isElite && SPORT_MATRIX[store.userConfig.sport]) ? SPORT_MATRIX[store.userConfig.sport] : SPORT_MATRIX['None'];

    if (isGuidanceOff('workout') && focus !== 'Rest' && focus !== 'Game' && focus !== 'Practice' && focus !== 'Match') {
        return { sessionType: 'Manual', sessionName: 'Workout guidance off', exercises: [{ name: 'No recommended session' }] };
    }
    if (focus === 'Rest') {
        return {
            sessionType: 'Rest',
            sessionName: 'System Recovery',
            exercises: [
                { name: 'Active recovery — sleep and hydration' },
                { name: 'Optional: 45–60 min Zone 2 steady' }
            ]
        };
    }
    if (focus === 'Rest (Cardio Only)') {
        return {
            sessionType: 'Rest',
            sessionName: 'Recovery (optional steady)',
            exercises: [
                { name: 'No lifting today' },
                { name: 'Optional: 45–60 min Zone 2 steady' }
            ]
        };
    }
    if (focus === 'Game' || focus === 'Match') {
        return { sessionType: 'Match', sessionName: 'Match Day', exercises: [{ name: 'Log match when finished' }] };
    }
    if (isLactateEvent(focus)) {
        const todayIso = dateToISO(new Date());
        const slot = getLactateSlotForDate(todayIso);
        const proto = getLactateProtocolForSlot(slot);
        const other = getLactateProtocolForSlot(slot === 'A' ? 'B' : 'A');
        return {
            sessionType: 'Lactate/HIT',
            sessionName: `Lactate/HIT Session ${slot}`,
            exercises: withPhaseReps([
                { name: 'Warmup (~10 min)', sets: 1 },
                { name: proto.summary, sets: proto.sets },
                { name: `Other weekly session (${other.slot}): ${other.summary}`, sets: 1 },
                { name: 'Static stretch (~12 min)', sets: 1 }
            ])
        };
    }
    if (isSteadyCardio(focus) || focus === 'Cardio') {
        return {
            sessionType: 'Cardio',
            sessionName: isSteadyCardio(focus) ? 'Steady Cardio' : 'Cardio',
            exercises: sportData.cardio === 'anaerobic'
                ? [{ name: 'Sprints (30s on/off)' }]
                : [{ name: '45–60 min Zone 2' }]
        };
    }
    if (focus === 'Practice') {
        return { sessionType: 'Practice', sessionName: 'Practice Day', exercises: [{ name: 'Log practice when finished' }] };
    }
    if (isHypertrophyFocus(focus) || (isHypertrophyPhase() && isStrengthFocus(focus))) {
        const built = getHypertrophySessionRoutine(focus);
        return {
            sessionType: 'Hypertrophy',
            sessionName: built.label || 'Hypertrophy',
            exercises: withPhaseReps(built.items.map(i => ({
                name: i.name,
                sets: i.setsOverride || i.sets || 3
            })))
        };
    }
    if (focus === 'Full Body / Strength' || isStrengthFocus(focus)) {
        const prefs = getGymPlanPrefs();
        const built = buildStrengthSessionRoutine(focus, sportData, prefs.setBudget);
        let exercises = built.items.map(i => ({
            name: i.name,
            sets: i.setsOverride || i.sets
        }));
        if (!isHypertrophyPhase() && prefs.attachMode !== 'none' && prefs.auxCount > 0) {
            exercises.push({
                name: prefs.attachMode === 'half' ? 'Half Auxiliary finisher' : 'Auxiliary finisher',
                sets: 2
            });
        }
        return {
            sessionType: 'Workout',
            sessionName: `Strength Session ${built.session}`,
            exercises: withPhaseReps(exercises)
        };
    }
    if (focus === 'Full Body / Power') {
        return {
            sessionType: 'Workout',
            sessionName: 'Power',
            exercises: withPhaseReps([
                sportData.unilateral ? 'Single Leg Broad Jumps' : 'Squat Jumps',
                'Med Ball Throws',
                sportData.cardio === 'anaerobic' ? 'Side-to-Side Shuffle' : 'Clap Pushups'
            ].map(n => ({ name: n, sets: PERIODIZATION[getSeasonPhase()]?.sets || 3 })))
        };
    }
    if ((focus === 'Auxiliary' || isAuxEvent(focus)) && !isHypertrophyPhase()) {
        const bandOn = !!(typeof getGymPlanPrefs === 'function' ? getGymPlanPrefs().band : store.userConfig.bandAuxiliary);
        return {
            sessionType: 'Auxiliary',
            sessionName: bandOn ? 'Band Auxiliary' : 'Auxiliary',
            exercises: withPhaseReps(bandOn
                ? ['Band Pull-Aparts', 'Band Monster Walks', 'Band Pallof Press'].map(n => ({ name: n, sets: 3 }))
                : ['Prehab & Joint Integrity', 'Core Stability', 'Rotator Cuff Work'].map(n => ({ name: n })))
        };
    }
    return {
        sessionType: 'Workout',
        sessionName: prettyFocusName(focus) || String(focus || 'Session'),
        exercises: [{ name: 'Follow Start workout below' }]
    };
}

/** Plain session block for Plan day popup (no log/start, no .card). */
export function buildPlainSessionCardHtml(focus, _timeLabel) {
    const { sessionType, sessionName, exercises } = getWorkoutExerciseRows(focus);
    const domainChip = formatTopDomainChip(getDayDomainTargets(focus), 2);
    let html = `<div style="padding:4px 0 16px; margin-bottom:8px; border-bottom:1px solid var(--border-subtle); width:100%; min-width:0;">
        <div class="day-plan-section-head" style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px; padding-bottom:6px; gap:8px; min-width:0;">
            <div style="min-width:0; flex:1;">
                <strong style="font-size:11px; color:var(--text-muted); font-family:'Roboto Mono'; letter-spacing:0.4px; min-width:0;">${sessionType}</strong>
                <div style="margin-top:4px; color:var(--text-main); font-size:12px; font-weight:600; line-height:1.35; min-width:0;">${sessionName}</div>
            </div>
            <div style="flex-shrink:0; text-align:right;">
                <span class="day-plan-metric-val" style="color:var(--text-main); white-space:nowrap;">${domainChip}</span>
            </div>
        </div>
        ${buildSessionExerciseRowsHtml(exercises)}
    </div>`;
    return html;
}

export function calculateLiveFitnessScores() {
    store.currentFitnessScore = { str: 0, pow: 0, spd: 0, crd: 0, end: 0 };
    const daysToCheck = [new Date().toLocaleDateString()];

    const processSetMath = (domain, rpe, isCardio, durationMins) => {
        let actualDomain = domain;
        if (isCardio && domain !== 'sprint') actualDomain = 'cardio';
        if (!FITNESS_MULTIPLIERS[actualDomain]) actualDomain = 'custom';
        
        let pts = { str:0, pow:0, spd:0, crd:0, end:0 };
        const mults = FITNESS_MULTIPLIERS[actualDomain];
        
        // Strain Unit: 1 Set of lifting OR 1 minute of cardio
        let units = isCardio ? Math.max(1, durationMins) : 1; 

        pts.str += (units * mults.str);
        pts.pow += (units * mults.pow);
        pts.spd += (units * mults.spd);
        pts.crd += (units * mults.crd);
        pts.end += (units * mults.end);

        // LACTATE RULE: If RPE > 6 on a lifting set, it bleeds heavily into Endurance/Metabolic
        if (!isCardio && rpe > 6) {
            pts.end += 2.0; 
            pts.crd += 0.5;
        }

        return pts;
    };

    // 1. Add points from ALREADY SAVED workouts
    daysToCheck.forEach(dateStr => {
        const data = store.globalGroupedHistory[dateStr];
        if (data && data.items) {
            let wks = data.items.filter(i => i.type === 'workout');
            wks.forEach(log => {
                let exObj = store.globalExerciseDB.find(e => e.name === log.exercise);
                let domain = (exObj && exObj.domain ? exObj.domain : (log.type || 'custom')).toLowerCase();
                let isCardio = domain === 'cardio' || log.type === 'cardio';
                if (log.exercise.toLowerCase().includes('sprint')) domain = 'sprint';

                // Saved DB rows are basically 1 set per row in our structure
                let pts = processSetMath(domain, log.rpe, isCardio, log.time_minutes);
                store.currentFitnessScore.str += pts.str;
                store.currentFitnessScore.pow += pts.pow;
                store.currentFitnessScore.spd += pts.spd;
                store.currentFitnessScore.crd += pts.crd;
                store.currentFitnessScore.end += pts.end;
            });
        }
    });

    // 2. Add points from the LIVE UNSAVED workout
    if (store.activeLog.type === 'workout') {
        store.activeLog.items.forEach(item => {
            let domain = (item.exercise.domain || 'custom').toLowerCase();
            let isCardio = domain === 'cardio';
            if (item.exercise.name.toLowerCase().includes('sprint')) domain = 'sprint';
            
            item.sets.forEach(set => {
                if (set.completed && !set.isText) {
                    let pts = processSetMath(domain, set.rpe, isCardio, set.time_minutes);
                    store.currentFitnessScore.str += pts.str;
                    store.currentFitnessScore.pow += pts.pow;
                    store.currentFitnessScore.spd += pts.spd;
                    store.currentFitnessScore.crd += pts.crd;
                    store.currentFitnessScore.end += pts.end;
                }
            });
        });
    }
    updateFitnessHUD();
}

export function updateFitnessHUD() {
    const bars = ['str', 'pow', 'spd', 'crd', 'end'];
    const multiplier = 1;
    
    let maxTarget = 0;
    let primaryBar = '';
    bars.forEach(b => {
        let target = store.dailyFitnessTargets[b] * multiplier;
        if (target > maxTarget) { maxTarget = target; primaryBar = b; }
    });

    bars.forEach(b => {
        const txtEl = document.getElementById(`hud-txt-${b}`);
        const barEl = document.getElementById(`bar-${b}`);
        const bandEl = document.getElementById(`band-${b}`);
        const tickEl = document.getElementById(`tick-${b}`);
        const labelEl = document.getElementById(`label-${b}`);
        if (!barEl || !labelEl) return;

        const current = Math.round(store.currentFitnessScore[b]);
        const target = store.dailyFitnessTargets[b] * multiplier;
        if (txtEl) txtEl.innerHTML = formatDomainAimLabel(current, target);

        // Same path as food Goals setMacroBar: only paint aim geometry when target > 0.
        if (!target || target <= 0) {
            barEl.style.width = '0%';
            barEl.classList.remove('under', 'in-range', 'over', 'over-target');
            barEl.classList.add('under');
            barEl.style.setProperty('--in-range-t', '0');
            if (bandEl) bandEl.style.width = '0%';
            if (tickEl) tickEl.classList.add('is-hidden');
            labelEl.style.color = 'var(--text-stealth)';
            return;
        }

        const layout = computeDomainBarLayout(current, target);

        barEl.style.backgroundColor = '';
        barEl.style.boxShadow = '';
        barEl.style.width = `${layout.fillPct}%`;
        barEl.classList.remove('under', 'in-range', 'over', 'over-target');
        barEl.classList.add(layout.state);
        barEl.style.setProperty('--in-range-t', String(layout.inRangeT));

        if (bandEl) {
            bandEl.style.left = `${layout.bandLeft}%`;
            bandEl.style.width = `${layout.bandWidth}%`;
            bandEl.style.background = layout.bandGradient;
            bandEl.style.removeProperty('display');
        }
        if (tickEl) {
            tickEl.style.left = `${layout.aimPct}%`;
            tickEl.classList.remove('is-hidden');
        }

        labelEl.style.color = (b === primaryBar) ? 'var(--gold-accent)' : 'var(--text-stealth)';
    });
}


// THE DRILL-DOWN INSPECTOR
export function closeMacroBreakdown() {
    document.getElementById('macro-breakdown-sheet')?.classList.add('hidden');
}

export function showBreakdown(type) {
    let msg = "";
    const todayStr = new Date().toLocaleDateString();

    if (['str', 'pow', 'spd', 'crd', 'end'].includes(type)) {
        msg = `FITNESS BREAKDOWN [${type.toUpperCase()}]\n\n`;
        let foundPoints = false;

        // 1. Check Completed/Saved DB Logs
        const todayData = store.globalGroupedHistory[todayStr];
        if (todayData && todayData.items) {
            let todayWks = todayData.items.filter(i => i.type === 'workout');
            let wksGrouped = {}; 
            todayWks.forEach(log => {
                let exObj = store.globalExerciseDB.find(e => e.name === log.exercise);
                let domain = (exObj && exObj.domain ? exObj.domain : (log.type || 'custom')).toLowerCase();
                if (!FITNESS_MULTIPLIERS[domain]) domain = 'custom';
                
                const mult = FITNESS_MULTIPLIERS[domain][type];
                // Convert to Strain Points
                let units = (domain === 'cardio' || log.exercise.toLowerCase().includes('sprint')) ? Math.max(1, log.time_minutes) : 1;
                let pts = units * mult;
                if (!domain.includes('cardio') && log.rpe > 6 && type === 'end') pts += 2.0; // Lactate Bonus
                pts = Math.round(pts * 10) / 10;
                if (pts > 0) {
                    if(!wksGrouped[log.exercise]) wksGrouped[log.exercise] = 0;
                    wksGrouped[log.exercise] += pts;
                    foundPoints = true;
                }
            });
            for(let ex in wksGrouped) {
                msg += `[LOGGED] ${ex}: +${wksGrouped[ex]} pts\n`;
            }
        }

        // 2. Check Live Active Logs
        if (store.activeLog.type === 'workout') {
            store.activeLog.items.forEach(item => {
                let domain = (item.exercise.domain || 'custom').toLowerCase();
                if (!FITNESS_MULTIPLIERS[domain]) domain = 'custom';
                const mult = FITNESS_MULTIPLIERS[domain][type];
                let vol = 0;
                let pts = 0;
                item.sets.forEach(set => {
                    if(set.completed && !set.isText) {
                        let units = (domain === 'cardio' || item.exercise.name.toLowerCase().includes('sprint')) ? Math.max(1, set.time_minutes) : 1;
                        let setPts = units * mult;
                        if (!domain.includes('cardio') && set.rpe > 6 && type === 'end') setPts += 2.0;
                        pts += setPts;
                    }
                });
                pts = Math.round(pts * 10) / 10;
                if(pts > 0) {
                    msg += `[LIVE] ${item.exercise.name}: +${pts} pts\n`;
                    foundPoints = true;
                }
            });
        }
        
        if (!foundPoints) msg += "Complete and log exercises to see points accumulate here.";
        alert(msg);
        return;
    }

    if (type === 'sleep') {
        const logged = getTodaySleepHours();
        const rpeLoad = getSleepDrivingRpeLoad();
        const aim = getRecommendedSleepHours();
        const listEl = document.getElementById('macro-breakdown-list');
        const titleEl = document.getElementById('macro-breakdown-title');
        const subEl = document.getElementById('macro-breakdown-subtitle');
        const sheet = document.getElementById('macro-breakdown-sheet');
        if (!listEl || !sheet) return;

        if (titleEl) titleEl.textContent = 'Sleep';
        if (subEl) {
            subEl.textContent = `${logged.toFixed(1)} h logged · aim ${aim.toFixed(1)} h · yesterday RPE load ${rpeLoad}`;
        }
        listEl.innerHTML = `
            <div class="macro-breakdown-row">
                <span class="macro-breakdown-name">Logged (last night)</span>
                <span class="macro-breakdown-val">${logged.toFixed(1)} h</span>
            </div>
            <div class="macro-breakdown-row">
                <span class="macro-breakdown-name">Recommended</span>
                <span class="macro-breakdown-val">${aim.toFixed(1)} h</span>
            </div>
            <div class="macro-breakdown-row">
                <span class="macro-breakdown-name">Yesterday’s workout RPE load</span>
                <span class="macro-breakdown-val">${rpeLoad}</span>
            </div>
            <p style="font-size:12px; color:var(--text-silver); line-height:1.5; margin:14px 0 0;">
                Sleep logged today is last night’s sleep, so yesterday’s training sets the target.
            </p>
            <p style="font-size:12px; color:var(--text-muted); line-height:1.5; margin:10px 0 0;">
                Rule: RPE 10 → 8.5 h; each extra RPE point → +5 min.
                Gym: 45 min = 5 RPE (+1 per extra 15 min). Steady = 2 RPE. Lactate/HIT = your RPE.
            </p>
            <button type="button" class="btn-primary is-secondary" style="margin:14px 0 0; width:100%;" onclick="closeMacroBreakdown(); openRpeGuidanceTab()">View RPE guidance</button>`;
        sheet.classList.remove('hidden');
        try {
            if (typeof window.maybePromptRpeAwareness === 'function') window.maybePromptRpeAwareness();
        } catch (e) { /* ignore */ }
        return;
    }

    // Nutrition: bottom sheet with per-food contributions
    const titles = { cals: 'Calories', pro: 'Protein', carb: 'Carbs', fat: 'Fat', cost: 'Cost', water: 'Hydration' };
    const title = titles[type] || type.toUpperCase();
    const todayFoods = (store.globalGroupedHistory[todayStr] && store.globalGroupedHistory[todayStr].items)
        ? store.globalGroupedHistory[todayStr].items.filter(i => i.type === 'food')
        : [];

    const contribMap = {};
    todayFoods.forEach(log => {
        let items = [];
        try { items = parseFoodLogDetails(log.food_details).items; } catch (e) { return; }
        items.forEach(item => {
            if (!item.food) return;
            const m = item.mass / 100;
            let val = 0;
            if (type === 'cals') val = (item.food.protein_per_100g * 4 * m) + (item.food.carbs_per_100g * 4 * m) + (item.food.fat_per_100g * 9 * m);
            if (type === 'pro') val = item.food.protein_per_100g * m;
            if (type === 'carb') val = item.food.carbs_per_100g * m;
            if (type === 'fat') val = item.food.fat_per_100g * m;
            if (type === 'cost') val = (item.food.price_per_100g || 0) * m;
            if (type === 'water') val = estimateFoodWaterMl(item.food, item.mass) / 1000;
            if (val <= 0) return;
            const name = item.food._cleanName || item.food.name || 'Food';
            contribMap[name] = (contribMap[name] || 0) + val;
        });
    });

    const rows = Object.entries(contribMap)
        .map(([name, val]) => ({ name, val }))
        .sort((a, b) => b.val - a.val);
    if (type === 'water') {
        const manualL = getHydrationLitersForDate();
        if (manualL > 0) rows.push({ name: 'Manual drinks', val: manualL });
        rows.sort((a, b) => b.val - a.val);
    }
    const total = rows.reduce((s, r) => s + r.val, 0);

    let subtitle = '';
    if (type === 'cost') {
        const budget = store.userConfig.budget || 0;
        const dayMacros = getDayMacroTargets(getTodayFocus());
        let costAim = 0;
        try {
            costAim = getPlannedDayCost({ tPro: dayMacros.tPro, tCarb: dayMacros.tCarb, forDate: new Date() });
        } catch (e) { /* pantry may not be ready yet */ }
        if (!costAim || costAim <= 0) costAim = budget;
        const range = getMacroRange('cost', costAim);
        if (budget > 0) {
            range.max = Math.min(range.max, budget);
            range.min = Math.min(range.min, range.max);
        }
        subtitle = `£${total.toFixed(2)} today · aim £${range.min.toFixed(2)}–£${range.max.toFixed(2)} · budget £${budget.toFixed(2)}`;
    } else if (type === 'water') {
        const waterTotal = store.consumedToday?.water ?? 0;
        const range = getMacroRange('water', DAILY_HYDRATION_TARGET_L);
        const left = Math.max(0, range.min - waterTotal);
        subtitle = `${waterTotal.toFixed(1)} L · aim ${range.min.toFixed(1)}–${range.max.toFixed(1)}`;
        if (waterTotal < range.min && left > 0) subtitle += ` · ${left.toFixed(1)} left`;
    } else if (type !== 'cals' && type !== 'pro' && type !== 'carb' && type !== 'fat') {
        subtitle = '';
    } else {
        const target = store.userConfig.targets?.[type] || 0;
        const range = getMacroRange(type, target);
        const unit = type === 'cals' ? 'kcal' : 'g';
        const left = Math.max(0, Math.round(range.min - total));
        subtitle = `${Math.round(total)} ${unit} · aim ${Math.round(range.min)}–${Math.round(range.max)}`;
        if (total < range.min && left > 0) subtitle += ` · ${left} left`;
    }

    const listEl = document.getElementById('macro-breakdown-list');
    const titleEl = document.getElementById('macro-breakdown-title');
    const subEl = document.getElementById('macro-breakdown-subtitle');
    const sheet = document.getElementById('macro-breakdown-sheet');
    if (!listEl || !sheet) return;

    if (titleEl) titleEl.textContent = title;
    if (subEl) subEl.textContent = subtitle;

    if (rows.length === 0) {
        const emptyMsg = type === 'water'
            ? 'No food moisture or drinks logged today.'
            : 'No foods logged today.';
        listEl.innerHTML = `<p style="font-size:13px; color:var(--text-silver); margin:12px 0 0;">${emptyMsg}</p>`;
    } else {
        listEl.innerHTML = rows.map(r => {
            const pct = total > 0 ? Math.round((r.val / total) * 100) : 0;
            let amount;
            if (type === 'cost') amount = `£${r.val.toFixed(2)}`;
            else if (type === 'cals') amount = `${Math.round(r.val)} kcal`;
            else if (type === 'water') amount = `${r.val.toFixed(2)} L`;
            else amount = `${Math.round(r.val)} g`;
            return `<div class="macro-breakdown-row">
                <span class="macro-breakdown-name">${r.name}</span>
                <span class="macro-breakdown-val">${amount} · ${pct}%</span>
            </div>`;
        }).join('');
    }

    sheet.classList.remove('hidden');
}

export const PERIODIZATION = {
    OffSeason_Adaptation: { reps: 50, sets: 1, rest_sec: 60, notes: "ADAPTATION: Target 50 total reps (Min 35 per set). Very light weight — a load you could grind for 50 clean reps. Strengthen tendons." },
    OffSeason_Hypertrophy: { reps: 10, sets: 3, rest_sec: 90, notes: "HYPERTROPHY: 8-12 reps · ~90s rest (stick to the timer so session length stays accurate). Stop ~1–2 RIR on work sets." },
    OffSeason_Strength: { reps: 5, sets: 4, rest_sec: 240, notes: "STRENGTH: Stop 2 reps before failure. Heavy, slow eccentric and concentric. NO STRAPS." },
    PreSeason_Power: { reps: 3, sets: 3, rest_sec: 240, notes: "POWER: Maximum intent. Explosive concentric. Must be completely fresh." },
    InSeason_Maintenance: { reps: 5, sets: 3, rest_sec: 120, notes: "MAINTENANCE: Maintain mechanics. Perfect form. Avoid failure entirely." }
};

/** Visible periodization select is source of truth so UI and workouts stay aligned. */
export function getSeasonPhase() {
    const sel = document.getElementById('set-season-phase');
    if (sel && sel.value && PERIODIZATION[sel.value]) {
        if (store.userConfig.seasonPhase !== sel.value) store.userConfig.seasonPhase = sel.value;
        return sel.value;
    }
    const phase = store.userConfig.seasonPhase || 'OffSeason_Hypertrophy';
    return PERIODIZATION[phase] ? phase : 'OffSeason_Hypertrophy';
}

export function isGuidanceOff(kind) {
    const g = store.userConfig.guidanceOff || {};
    return !!g[kind];
}

export function syncTrackerPillUI() {
    const g = store.userConfig.guidanceOff || {};
    const anyOff = !!(g.food || g.workout || g.timetabling);
    const toggle = document.getElementById('toggle-tracker-mode');
    if (toggle) toggle.checked = anyOff;
}

export function openTrackerGuidanceModal() {
    const g = store.userConfig.guidanceOff || { food: false, workout: false, timetabling: false };
    const foodEl = document.getElementById('tracker-off-food');
    const workoutEl = document.getElementById('tracker-off-workout');
    const timeEl = document.getElementById('tracker-off-timetabling');
    if (foodEl) foodEl.checked = !!g.food;
    if (workoutEl) workoutEl.checked = !!g.workout;
    if (timeEl) timeEl.checked = !!g.timetabling;
    const modal = document.getElementById('tracker-guidance-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
}

export function closeTrackerGuidanceModal() {
    const modal = document.getElementById('tracker-guidance-modal');
    if (modal) modal.classList.add('hidden');
}

export function saveTrackerGuidance() {
    store.userConfig.guidanceOff = {
        food: !!document.getElementById('tracker-off-food')?.checked,
        workout: !!document.getElementById('tracker-off-workout')?.checked,
        timetabling: !!document.getElementById('tracker-off-timetabling')?.checked
    };
    syncTrackerPillUI();
    closeTrackerGuidanceModal();
    invalidateWeekPlanCache();
    try {
        if (typeof generateDailyMealPlan === 'function') generateDailyMealPlan();
        if (typeof generateDailyFoodLog === 'function') generateDailyFoodLog();
        if (typeof getTodayFocus === 'function') getTodayFocus();
        if (typeof generateFutureTimeline === 'function') generateFutureTimeline();
    } catch (e) {}
    localStorage.setItem('ascensus_settings', JSON.stringify(store.userConfig));
    if (store.currentUser) {
        persistUserConfigToCloud();
    }
}

/** Weekly rotating coach tips (ISO week index). */
export const WEEKLY_COACH_TIPS = [
    { title: 'Tendon tempo', body: 'Own the eccentric — 3 seconds down on every rep this week. Light weight, perfect grooves.' },
    { title: 'Brace first', body: 'Big breath into the belt before every set. Ribs down, glutes on — then move.' },
    { title: 'Sleep is training', body: 'Protect a fixed bedtime. Adaptation happens overnight; short sleep kills tendon progress.' },
    { title: 'Warm-up non-negotiable', body: 'Pulse raise → mobilise → activation. Skip it and the main sets get sloppy.' },
    { title: 'Leave reps in the tank', body: 'Stop when form softens. Volume at clean technique beats grinding ugly reps.' },
    { title: 'Hydrate early', body: 'Front-load hydration before noon. Dehydrated joints feel older than they are.' },
    { title: 'Film one set', body: 'Record a working set this week and check depth, bar path, and knee tracking.' },
    { title: 'Protein at breakfast', body: 'Hit protein in meal one. It sets the day up for recovery and satiety.' }
];

export function getISOWeekNumber(dateObj) {
    const d = new Date(dateObj);
    d.setHours(12, 0, 0, 0);
    const dayNum = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - dayNum + 3);
    const firstThursday = new Date(d.getFullYear(), 0, 4);
    const week = 1 + Math.round(((d - firstThursday) / 86400000 - 3 + ((firstThursday.getDay() + 6) % 7)) / 7);
    return Math.max(1, week);
}

export function getWeeklyCoachTip(dateObj = new Date()) {
    const tip = WEEKLY_COACH_TIPS[(getISOWeekNumber(dateObj) - 1) % WEEKLY_COACH_TIPS.length];
    return tip;
}

export function renderCoachesNotesModal() {
    const list = document.getElementById('coaches-notes-list');
    if (!list) return;
    const tip = getWeeklyCoachTip();
    const standing = [
        '<li style="margin-bottom:8px;"><strong>Do not overtrain.</strong> Adhere to prescribed fatigue lockouts.</li>',
        '<li style="margin-bottom:8px;"><strong>Dietary limits.</strong> Avoid additives in food, seed oils, and preservatives.</li>',
        '<li style="margin-bottom:8px;"><strong>Water quality.</strong> Buy a water filter for unfluoridated water.</li>',
        '<li style="margin-bottom:8px;"><strong>Supplements.</strong> Vitamin D in winter (British Supplements — 10,000 IU), Magnesium Glycinate.</li>',
        '<li style="margin-bottom:8px;"><strong>Gym Protocol.</strong> Fixed warm-up before every session, warm-down at the end.</li>'
    ];
    list.innerHTML = `<li style="margin-bottom:12px; padding:10px; border:1px solid rgba(212,175,55,0.35); border-radius:8px; background:rgba(212,175,55,0.06); list-style:none; margin-left:-15px;"><strong style="color:var(--gold-accent);">This week — ${tip.title}:</strong> ${tip.body}</li>` + standing.join('');
}

export function openCoachesNotesModal() {
    renderCoachesNotesModal();
    document.getElementById('coaches-notes-modal')?.classList.remove('hidden');
}

/** 1RM → working load by phase. Adaptation ≈ weight you can do for ~50 reps. */
export function getPhaseLoadMultiplier(phaseStr) {
    if (phaseStr === 'OffSeason_Adaptation') return 0.25;
    if (phaseStr === 'OffSeason_Strength') return 0.80;
    if (phaseStr === 'OffSeason_Hypertrophy') return 0.65;
    if (phaseStr === 'PreSeason_Power') return 0.55;
    if (phaseStr === 'InSeason_Maintenance') return 0.70;
    return 0.65;
}

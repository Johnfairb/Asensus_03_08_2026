/**
 * Weekly Exercise goals (Mon–Sun) + Asensus points.
 */
import { store } from '../state/store.js';
import { getMondayISO, dateToISO, addDaysISO, getPlannedDayEvents, isLactateEvent, isSteadyCardio, isLiftingEvent, isStrengthEvent, isPracticeEvent, isGameEvent, loadWorkoutSessionSnapshots } from './route-planner.js';

const POINTS_KEY = 'ascensus_points_total';
const WEEK_AWARD_KEY = 'ascensus_points_week_awarded';

function localeKey(d) {
    return d.toLocaleDateString();
}

function parseISO(iso) {
    return new Date(iso + 'T12:00:00');
}

export function getAsensusPoints() {
    return Math.max(0, parseInt(localStorage.getItem(POINTS_KEY) || '0', 10) || 0);
}

function setAsensusPoints(n) {
    localStorage.setItem(POINTS_KEY, String(Math.max(0, n)));
}

function weekAwarded(weekStart) {
    try {
        const raw = JSON.parse(localStorage.getItem(WEEK_AWARD_KEY) || '{}');
        return !!raw[weekStart];
    } catch (e) {
        return false;
    }
}

function markWeekAwarded(weekStart) {
    try {
        const raw = JSON.parse(localStorage.getItem(WEEK_AWARD_KEY) || '{}');
        raw[weekStart] = 1;
        localStorage.setItem(WEEK_AWARD_KEY, JSON.stringify(raw));
    } catch (e) { /* ignore */ }
}

/** First app open after local Sunday night (i.e. now is Mon+ and previous week complete). */
export function maybeAwardWeeklyAsensusPoint() {
    const now = new Date();
    const thisMonday = getMondayISO(now);
    const prevMonday = addDaysISO(thisMonday, -7);
    if (weekAwarded(prevMonday)) return getAsensusPoints();

    // Only award once we've entered the new week
    if (dateToISO(now) < thisMonday) return getAsensusPoints();

    const scores = computeWeeklyGoalScores(prevMonday);
    const complete = Object.values(scores).every(s => s.pct >= 0.999);
    if (complete) {
        setAsensusPoints(getAsensusPoints() + 1);
        markWeekAwarded(prevMonday);
    } else {
        // Mark checked so we don't re-evaluate forever; only award if complete
        markWeekAwarded(prevMonday);
    }
    return getAsensusPoints();
}

function sessionHasCompletedWarmup(snap) {
    const items = snap?.items || [];
    return items.some(it => {
        const name = String(it.exercise?.name || it.exercise || '');
        if (!/warmup/i.test(name) && !it.isWarmupGroup) return false;
        return (it.sets || []).some(s => s.completed);
    });
}

function sessionHasCompletedStretch(snap) {
    const items = snap?.items || [];
    return items.some(it => {
        const name = String(it.exercise?.name || it.exercise || '');
        if (!/stretch/i.test(name) && !it.isStretchGroup) return false;
        return (it.sets || []).some(s => s.completed);
    });
}

function gymSetFraction(snap) {
    const items = (snap?.items || []).filter(it => {
        if (it.isWarmupGroup || it.isStretchGroup || it.isSportSessionBlock) return false;
        const name = String(it.exercise?.name || '');
        if (/warmup|stretch|practice|match/i.test(name)) return false;
        const domain = String(it.exercise?.domain || '').toLowerCase();
        if (domain === 'cardio' || domain === 'warmup') return false;
        return true;
    });
    let done = 0;
    let total = 0;
    items.forEach(it => {
        const sets = (it.sets || []).filter(s => !s.isWarmup && !s.isText);
        total += sets.length;
        done += sets.filter(s => s.completed).length;
    });
    if (total <= 0) return 0;
    return done / total;
}

function lactateBlockFraction(snap) {
    const items = (snap?.items || []).filter(it => it.isLactateHit || (it.sets || []).some(s => s.isLactateHit));
    if (!items.length) return 0;
    let done = 0;
    let total = 0;
    items.forEach(it => {
        const sets = (it.sets || []).filter(s => s.isLactateHit || (!s.isWarmup && !s.isText));
        // Prefer HIT intervals only
        const hit = (it.sets || []).filter(s => s.isLactateHit);
        const use = hit.length ? hit : sets;
        total += use.length;
        done += use.filter(s => s.completed).length;
    });
    if (total <= 0) return 0;
    const frac = done / total;
    return frac < 0.5 ? 0 : frac;
}

function steadyMinutes(snap) {
    let mins = Number(snap?.durationMinutes) || 0;
    (snap?.items || []).forEach(it => {
        (it.sets || []).forEach(s => {
            if (Number(s.time_minutes) > mins) mins = Number(s.time_minutes);
        });
    });
    return mins;
}

/**
 * @returns {{ anaerobic, aerobic, flexibility, preparation, strength }} each { value, target, pct }
 */
export function computeWeeklyGoalScores(weekStartISO = getMondayISO(new Date())) {
    const snaps = loadWorkoutSessionSnapshots() || {};
    const days = [];
    for (let i = 0; i < 7; i++) days.push(addDaysISO(weekStartISO, i));

    // Planned sessions for flexibility / preparation denominators
    let plannedSessions = 0;
    days.forEach(iso => {
        const events = getPlannedDayEvents(parseISO(iso)) || [];
        events.forEach(e => {
            if (isLactateEvent(e) || isSteadyCardio(e) || isLiftingEvent(e) || isStrengthEvent(e)
                || isPracticeEvent(e) || isGameEvent(e) || e === 'Practice' || e === 'Game' || e === 'Match') {
                plannedSessions += 1;
            }
        });
    });

    let anaerobic = 0;
    let aerobic = 0;
    let stretchDone = 0;
    let warmupDone = 0;
    let strengthFracSum = 0;
    let strengthSessionCount = 0;

    days.forEach(iso => {
        const daySnaps = snaps[iso] || [];
        daySnaps.forEach(snap => {
            const kind = String(snap.kind || '');
            if (isLactateEvent(kind) || /lactate|hit/i.test(kind)) {
                const f = lactateBlockFraction(snap);
                anaerobic += f >= 0.5 ? f : 0;
            }
            // Practice/match with diary RPE ≥ 7 counts as anaerobic
            if ((/practice/i.test(kind) || /match|game/i.test(kind))) {
                const rpe = Number(snap.rpe);
                if (Number.isFinite(rpe) && rpe >= 7) anaerobic += 1;
            }
            if (isSteadyCardio(kind) || /steady/i.test(kind)) {
                if (steadyMinutes(snap) > 40) aerobic += 1;
            }
            if (sessionHasCompletedStretch(snap)) stretchDone += 1;
            if (sessionHasCompletedWarmup(snap)) warmupDone += 1;

            if (isLiftingEvent(kind) || isStrengthEvent(kind) || /hypertrophy|strength/i.test(kind)) {
                strengthFracSum += gymSetFraction(snap);
                strengthSessionCount += 1;
            }
        });

        // Diary-only practice RPE credit (if snapshot missing rpe)
        try {
            const pj = JSON.parse(localStorage.getItem('ascensus_practice_journal_' + iso) || 'null');
            if (pj && Number(pj.rpe) >= 7) {
                // Avoid double-count if already counted from snap with same day
                const already = (snaps[iso] || []).some(s => /practice/i.test(String(s.kind || '')) && Number(s.rpe) >= 7);
                if (!already) anaerobic += 1;
            }
            const mj = JSON.parse(localStorage.getItem('ascensus_match_journal_' + iso) || 'null');
            if (mj && Number(mj.rpe) >= 7) {
                const already = (snaps[iso] || []).some(s => /match|game/i.test(String(s.kind || '')) && Number(s.rpe) >= 7);
                if (!already) anaerobic += 1;
            }
        } catch (e) { /* ignore */ }
    });

    const clampPct = (v, t) => {
        const target = Math.max(0.0001, t);
        return Math.max(0, Math.min(1, v / target));
    };

    const flexTarget = Math.max(1, plannedSessions);
    const prepTarget = Math.max(1, plannedSessions);
    // Strength: average set-completion across gym sessions, target = 1.0 (all sets)
    // Represent as filled bar = mean fraction; also need session count vs planned gym?
    // Spec: total sets in the week — fraction completed/total. Already gymSetFraction per session — weight by sets:
    let strengthPct = 0;
    if (strengthSessionCount > 0) {
        strengthPct = Math.min(1, strengthFracSum / strengthSessionCount);
    }

    return {
        anaerobic: { value: anaerobic, target: 2, pct: clampPct(anaerobic, 2) },
        aerobic: { value: aerobic, target: 2, pct: clampPct(aerobic, 2) },
        flexibility: { value: stretchDone, target: flexTarget, pct: clampPct(stretchDone, flexTarget) },
        preparation: { value: warmupDone, target: prepTarget, pct: clampPct(warmupDone, prepTarget) },
        strength: { value: strengthPct, target: 1, pct: strengthPct }
    };
}

export function renderWeeklyExerciseGoals() {
    maybeAwardWeeklyAsensusPoint();
    const scores = computeWeeklyGoalScores();
    const points = getAsensusPoints();

    const rows = [
        ['anaerobic', 'Anaerobic Cardio', scores.anaerobic],
        ['aerobic', 'Aerobic Cardio', scores.aerobic],
        ['flexibility', 'Flexibility', scores.flexibility],
        ['preparation', 'Preparation', scores.preparation],
        ['strength', 'Strength', scores.strength]
    ];

    rows.forEach(([id, label, s]) => {
        const labelEl = document.getElementById('label-' + id);
        const bar = document.getElementById('bar-' + id);
        const txt = document.getElementById('hud-txt-' + id);
        if (labelEl) labelEl.textContent = label;
        if (bar) bar.style.width = `${Math.round((s.pct || 0) * 100)}%`;
        if (txt) txt.textContent = ''; // no numbers per spec
    });

    let pointsEl = document.getElementById('asensus-points-row');
    if (!pointsEl) {
        const panel = document.getElementById('drive-panel-goals');
        const card = panel?.querySelector('.card');
        if (card) {
            pointsEl = document.createElement('div');
            pointsEl.id = 'asensus-points-row';
            pointsEl.style.cssText = 'display:flex; align-items:center; justify-content:center; gap:10px; margin-top:14px; padding-top:12px; border-top:1px solid var(--border-subtle);';
            card.appendChild(pointsEl);
        }
    }
    if (pointsEl) {
        pointsEl.innerHTML = `
            <img src="assets/logo-mark.svg" alt="" width="22" height="22" style="opacity:0.95;">
            <span style="font-family:'Roboto Mono',monospace; font-size:12px; color:var(--gold-accent); font-weight:800; letter-spacing:0.4px;">ASENSUS POINTS</span>
            <span style="font-family:'Roboto Mono',monospace; font-size:16px; color:var(--text-main); font-weight:800;">${points}</span>`;
    }
}

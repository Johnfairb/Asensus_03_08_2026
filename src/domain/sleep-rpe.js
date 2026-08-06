/**
 * Sleep target from daily workout RPE load.
 * RPE 10 → 8.5 h; each extra RPE point → +5 minutes.
 */
import { store } from '../state/store.js';

const BASE_SLEEP_HOURS = 8.5;
const BASE_RPE = 10;
const MINS_PER_EXTRA_RPE = 5;
const SNAPSHOTS_KEY = 'ascensus_workout_session_snapshots';

function kindLooksSteady(k) {
  return k === 'Cardio' || k === 'Cardio (Steady)' || /steady/i.test(k || '');
}
function kindLooksLactate(k) {
  return k === 'Lactate' || k === 'Cardio (Lactate)' || /lactate/i.test(k || '');
}
function kindLooksStrength(k) {
  return /strength|hypertrophy|gym|full body|auxiliar|power/i.test(k || '');
}

function normalizeKind(kind) {
  if (!kind || typeof kind !== 'string') return '';
  if (kindLooksSteady(kind)) return 'Cardio (Steady)';
  if (kindLooksLactate(kind)) return 'Lactate';
  if (kindLooksStrength(kind) || kind === 'Gym' || kind === 'Gym Workout') return 'Full Body / Strength';
  return kind;
}

/** Gym / hypertrophy: 45 min = 5 RPE; +1 RPE per extra 15 min. */
export function gymRpeFromMinutes(minutes) {
  const m = Math.max(0, Number(minutes) || 0);
  if (m <= 0) return 5;
  if (m <= 45) return 5;
  return 5 + Math.floor((m - 45) / 15);
}

/** Session RPE used for sleep load (steady fixed, gym from duration or diary RPE, lactate/user as given). */
export function resolveSessionRpe({ kind, durationMinutes, userRpe }) {
  const k = normalizeKind(kind) || kind || '';
  const u = Number(userRpe);
  const hasUserRpe = Number.isFinite(u) && u > 0;
  if (kindLooksSteady(k)) return 2;
  if (kindLooksLactate(k)) {
    return hasUserRpe ? u : 6;
  }
  if (kindLooksStrength(k) || !k) {
    // Prefer diary / session RPE when the user logged one; else duration rule
    return hasUserRpe ? u : gymRpeFromMinutes(durationMinutes);
  }
  return hasUserRpe ? u : gymRpeFromMinutes(durationMinutes);
}

export function sleepHoursFromTotalRpe(totalRpe) {
  const rpe = Math.max(0, Number(totalRpe) || 0);
  const hours = BASE_SLEEP_HOURS + ((rpe - BASE_RPE) * MINS_PER_EXTRA_RPE) / 60;
  return Math.round(Math.min(14, Math.max(4, hours)) * 100) / 100;
}

export function getTodaySleepHours() {
  const v = parseFloat(localStorage.getItem(`sleep_${new Date().toLocaleDateString()}`));
  return Number.isFinite(v) && v > 0 ? v : 0;
}

function toDateAtNoon(dateKey) {
  if (!dateKey) return new Date();
  if (dateKey instanceof Date) {
    const d = new Date(dateKey);
    d.setHours(12, 0, 0, 0);
    return d;
  }
  if (typeof dateKey === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateKey)) {
    return new Date(dateKey.slice(0, 10) + 'T12:00:00');
  }
  const d = new Date(dateKey);
  if (isNaN(d.getTime())) return new Date();
  d.setHours(12, 0, 0, 0);
  return d;
}

function dateToIsoLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todayIso() {
  return dateToIsoLocal(new Date());
}

/** Sum session RPEs for a local-date day from history + session snapshots. */
export function getDailyWorkoutRpeLoad(dateKey = new Date().toLocaleDateString()) {
  let total = 0;
  const dayDate = toDateAtNoon(dateKey);
  const localeKey = dayDate.toLocaleDateString();
  const isoHint = dateToIsoLocal(dayDate);
  // History may be keyed by either locale string or the passed key
  const historyKeys = [...new Set([dateKey, localeKey].filter(Boolean))];

  let usedSnapshots = false;
  try {
    const snaps = JSON.parse(localStorage.getItem(SNAPSHOTS_KEY) || '{}') || {};
    Object.values(snaps).forEach(s => {
      if (!s || !s.dateIso) return;
      if (!isoHint || s.dateIso !== isoHint) return;
      usedSnapshots = true;
      total += resolveSessionRpe({
        kind: s.kind,
        durationMinutes: s.durationMinutes || 0,
        userRpe: s.rpe
      });
    });
  } catch (e) { /* ignore */ }

  let day = null;
  for (const key of historyKeys) {
    if (store.globalGroupedHistory?.[key]) {
      day = store.globalGroupedHistory[key];
      break;
    }
  }
  if (!day) return Math.round(total * 10) / 10;

  const sessions = day.items.filter(i => i.type === 'workout');
  // Practice/Match/Spontaneous from history only when no session snapshots cover the day
  // (timed sport sessions already recorded a snapshot — double-counting kept sleep at baseline 8.5h)
  if (!usedSnapshots) {
    sessions.forEach(log => {
      const name = log.exercise || '';
      if (name === 'Practice' || name === 'Match' || /^Spontaneous:/i.test(name)) {
        total += Number(log.rpe) || 0;
      }
    });
  }

  // Fallback: reconstruct gym/cardio load from raw logs when no snapshots
  if (!usedSnapshots) {
    const bySession = new Map();
    sessions.forEach(log => {
      const name = log.exercise || 'Workout';
      if (name === 'Practice' || name === 'Match' || /^Spontaneous:/i.test(name)) return;
      const key = log.session_id || name;
      if (!bySession.has(key)) {
        bySession.set(key, {
          kind: name,
          minutes: 0,
          rpe: Number(log.rpe) || 0,
          durationStamp: Number(log.session_duration_min) || 0
        });
      }
      const g = bySession.get(key);
      g.minutes += Number(log.time_minutes) || 0;
      if (Number(log.rpe) > g.rpe) g.rpe = Number(log.rpe);
      if (Number(log.session_duration_min) > g.durationStamp) {
        g.durationStamp = Number(log.session_duration_min);
      }
    });
    bySession.forEach(g => {
      const mins = g.durationStamp > 0 ? g.durationStamp : g.minutes;
      total += resolveSessionRpe({ kind: g.kind, durationMinutes: mins, userRpe: g.rpe });
    });
  }

  return Math.round(total * 10) / 10;
}

/**
 * Sleep logged on a given day is the night before.
 * So today's sleep bar uses yesterday's workout RPE load.
 */
export function getRecommendedSleepHours(dateKey) {
  const forDay = toDateAtNoon(dateKey || new Date());
  const prev = new Date(forDay);
  prev.setDate(prev.getDate() - 1);
  return sleepHoursFromTotalRpe(getDailyWorkoutRpeLoad(prev.toLocaleDateString()));
}

/**
 * Tonight's sleep target for a plan day (driven by that day's training load).
 * Logged the following morning via the sleep badge.
 */
export function getTonightSleepTargetHours(dateKey) {
  const forDay = toDateAtNoon(dateKey || new Date());
  return sleepHoursFromTotalRpe(getDailyWorkoutRpeLoad(forDay.toLocaleDateString()));
}

/** Yesterday's RPE load that drives today's sleep target. */
export function getSleepDrivingRpeLoad(dateKey) {
  const forDay = toDateAtNoon(dateKey || new Date());
  const prev = new Date(forDay);
  prev.setDate(prev.getDate() - 1);
  return getDailyWorkoutRpeLoad(prev.toLocaleDateString());
}

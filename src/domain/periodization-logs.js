/**
 * Periodization tags on lifting logs + helpers for strength load from hypertrophy.
 */
import { store } from '../state/store.js';
import { getSeasonPhase } from './fitness-hud.js';
import { getExerciseMeta, resolveCatalogName } from './exercise-catalog.js';
import {
    BODYWEIGHT_COMPOUNDS,
    equipmentForExercise,
    isHypertrophyFocus,
    isHypertrophyPhase,
    roundUpLoad,
    usesHypertrophyProgramming
} from './hypertrophy-engine.js';
import { isStrengthFocus, isStrengthPhase } from './strength-engine.js';

const PHASE_MAP_KEY = 'ascensus_log_periodization_v1';

export function periodizationBucketForSession(phase, focus) {
    const p = phase || getSeasonPhase();
    if (usesHypertrophyProgramming(focus)) return 'hypertrophy';
    if (isStrengthFocus(focus) && !isHypertrophyFocus(focus)) return 'strength';
    if (isHypertrophyPhase(p)) return 'hypertrophy';
    if (isStrengthPhase(p)) return 'strength';
    return null;
}

export function loadLogPhaseMap() {
    try {
        const raw = JSON.parse(localStorage.getItem(PHASE_MAP_KEY) || '{}');
        return raw && typeof raw === 'object' ? raw : {};
    } catch (e) {
        return {};
    }
}

export function rememberLogPhases(rows) {
    if (!Array.isArray(rows) || !rows.length) return;
    const map = loadLogPhaseMap();
    rows.forEach((row) => {
        if (!row || row.id == null || !row.periodization_phase) return;
        map[`id:${row.id}`] = row.periodization_phase;
    });
    try { localStorage.setItem(PHASE_MAP_KEY, JSON.stringify(map)); } catch (e) { /* ignore */ }
}

export function rememberLogPhasesByFingerprint(logs, phase) {
    if (!phase || !Array.isArray(logs)) return;
    const map = loadLogPhaseMap();
    logs.forEach((l) => {
        const key = fingerprintLog(l);
        if (key) map[key] = phase;
    });
    try { localStorage.setItem(PHASE_MAP_KEY, JSON.stringify(map)); } catch (e) { /* ignore */ }
}

function fingerprintLog(l) {
    if (!l) return null;
    if (l.id != null) return `id:${l.id}`;
    const day = String(l.created_at || '').slice(0, 10);
    return `fp:${day}|${l.exercise}|${l.sets}|${l.reps}|${l.weight_kg}`;
}

export function resolveLogPeriodization(log) {
    if (!log) return null;
    if (log.periodization_phase) return log.periodization_phase;
    const map = loadLogPhaseMap();
    if (log.id != null && map[`id:${log.id}`]) return map[`id:${log.id}`];
    const fp = fingerprintLog(log);
    if (fp && map[fp]) return map[fp];
    return null;
}

/**
 * Chart filter by current periodization.
 * Hypertrophy includes untagged (legacy) logs. Strength prefers tagged strength
 * rows, but falls back to untagged so graphs are not blank before tagging exists.
 */
export function filterLogsForProgressChart(logs) {
    const phase = getSeasonPhase();
    let want = null;
    if (phase === 'OffSeason_Hypertrophy') want = 'hypertrophy';
    else if (phase === 'OffSeason_Strength') want = 'strength';
    else return logs || [];

    const list = logs || [];
    const taggedWanted = list.filter((l) => resolveLogPeriodization(l) === want);
    return list.filter((l) => {
        const tag = resolveLogPeriodization(l);
        if (tag === want) return true;
        if (tag) return false;
        if (want === 'hypertrophy') return true;
        return taggedWanted.length === 0;
    });
}

export function isBodyweightLoadExercise(exName) {
    if (BODYWEIGHT_COMPOUNDS.has(exName)) return true;
    const meta = getExerciseMeta(exName);
    return !!(meta && meta.bodyweight);
}

function logDayKey(row) {
    const raw = row && row.created_at;
    if (!raw) return '';
    return String(raw).includes('T') ? String(raw).split('T')[0] : String(raw).slice(0, 10);
}

function canonExName(name) {
    return String(resolveCatalogName(name) || name || '').trim().toLowerCase();
}

export function exerciseLogNamesMatch(a, b) {
    const ca = canonExName(a);
    const cb = canonExName(b);
    return !!ca && ca === cb;
}

/**
 * Last completed working-set load from the most recent session for this exercise.
 * Prefers the highest set number on that day (the set the user finished on).
 */
export function lastCompletedWorkingWeight(hist, exName) {
    const rows = (hist || []).filter((l) => {
        if (!exerciseLogNamesMatch(l.exercise, exName)) return false;
        if (l.is_warmup) return false;
        const w = Number(l.weight_kg);
        const reps = Number(l.reps);
        return (Number.isFinite(w) && w > 0) || (Number.isFinite(reps) && reps > 0);
    });
    if (!rows.length) return null;
    const days = [...new Set(rows.map(logDayKey).filter(Boolean))].sort().reverse();
    const latestDay = days[0];
    const dayRows = latestDay ? rows.filter((l) => logDayKey(l) === latestDay) : rows;
    dayRows.sort((a, b) => {
        const setDiff = (Number(a.sets) || 0) - (Number(b.sets) || 0);
        if (setDiff) return setDiff;
        return String(a.created_at || '').localeCompare(String(b.created_at || ''));
    });
    const last = dayRows[dayRows.length - 1];
    const w = Number(last?.weight_kg);
    return Number.isFinite(w) ? w : null;
}

/**
 * Strength work load = 15% above hypertrophy equivalent.
 * For bodyweight lifts, bodyweight is included in the total before the +15%, then subtracted back.
 */
export function strengthLoadFromHypertrophy(hypKg, exName) {
    const added = Number(hypKg) || 0;
    const bw = isBodyweightLoadExercise(exName) ? (Number(store.userConfig?.weight) || 0) : 0;
    const strengthTotal = (added + bw) * 1.15;
    const strengthAdded = Math.max(0, strengthTotal - bw);
    const eq = equipmentForExercise(exName);
    return roundUpLoad(strengthAdded, eq);
}

export function latestPhaseWeight(hist, exName, phaseBucket) {
    const rows = (hist || []).filter((l) => {
        if (!exerciseLogNamesMatch(l.exercise, exName)) return false;
        if (Number(l.reps) <= 0 && !(Number(l.weight_kg) >= 0)) return false;
        const tag = resolveLogPeriodization(l);
        if (phaseBucket === 'hypertrophy') {
            return tag === 'hypertrophy' || tag == null;
        }
        if (phaseBucket === 'strength') {
            return tag === 'strength';
        }
        return true;
    });
    return lastCompletedWorkingWeight(rows, exName);
}

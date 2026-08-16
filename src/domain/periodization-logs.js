/**
 * Periodization tags on lifting logs + helpers for strength load from hypertrophy.
 */
import { store } from '../state/store.js';
import { getSeasonPhase } from './fitness-hud.js';
import { getExerciseMeta } from './exercise-catalog.js';
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

/** Chart filter: hypertrophy phase → hypertrophy logs only; strength → strength only. Hide untagged. */
export function filterLogsForProgressChart(logs) {
    const phase = getSeasonPhase();
    let want = null;
    if (phase === 'OffSeason_Hypertrophy') want = 'hypertrophy';
    else if (phase === 'OffSeason_Strength') want = 'strength';
    else return logs || [];

    return (logs || []).filter((l) => resolveLogPeriodization(l) === want);
}

export function isBodyweightLoadExercise(exName) {
    if (BODYWEIGHT_COMPOUNDS.has(exName)) return true;
    const meta = getExerciseMeta(exName);
    return !!(meta && meta.bodyweight);
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
    const name = String(exName || '').toLowerCase();
    const rows = (hist || []).filter((l) => {
        if (String(l.exercise || '').toLowerCase() !== name) return false;
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
    if (!rows.length) return null;
    const sorted = [...rows].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    const w = Number(sorted[0].weight_kg);
    return Number.isFinite(w) ? w : null;
}

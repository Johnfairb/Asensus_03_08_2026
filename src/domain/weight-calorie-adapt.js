/**
 * Weight-trend calorie adapter.
 * After 14 distinct daily weigh-ins, least-squares kg/week is mapped to 7 rate
 * bands. Calories are scaled by 1.1 per band step toward the desired rate.
 * The factor is frozen for 14 days, then recomputed against formula calories
 * (not stacked on the previous factor).
 */
import { store } from '../state/store.js';
import { fetchAllDailyWeights } from './body-metrics.js';

export const WEIGHT_ADAPT_MIN_LOGS = 14;
export const WEIGHT_ADAPT_LOCK_DAYS = 14;
export const WEIGHT_ADAPT_HINT_FROM = 10;
export const WEIGHT_ADAPT_STEP = 1.1;
export const ADHERENCE_MIN_RATIO = 0.9;
export const ADHERENCE_MIN_DAYS = 10;
const AT_TARGET_KG = 0.1;
const TAPER_KG = 2;
const OUTLIER_Z = 3.5;
const RATE_BANDS = [-0.5, -0.3, -0.1, 0.1, 0.3, 0.5];

let cachedLogs = [];
let cacheLoaded = false;
let intakeByIso = new Map();
let intakeCacheLoaded = false;

function toISODate(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function addDaysIso(iso, days) {
    const d = new Date(`${iso}T12:00:00`);
    d.setDate(d.getDate() + days);
    return toISODate(d);
}

function dayIndex(iso) {
    return new Date(`${iso}T12:00:00`).getTime() / 86400000;
}

function todayIso(now = new Date()) {
    return toISODate(now);
}

function ensureAdaptState(config = store.userConfig) {
    if (!config.weightAdapt || typeof config.weightAdapt !== 'object') {
        config.weightAdapt = { multiplier: 1, lockedUntilIso: null, lastAdjustedIso: null };
    }
    if (!Number.isFinite(Number(config.weightAdapt.multiplier))) {
        config.weightAdapt.multiplier = 1;
    }
    return config.weightAdapt;
}

export function weightLogsCacheLoaded() {
    return cacheLoaded;
}

export function intakeCacheIsReady() {
    return intakeCacheLoaded;
}

export function getDailyIntakeCals(iso) {
    return Number(intakeByIso.get(iso)) || 0;
}

export function getCachedWeightLogs() {
    return cachedLogs;
}

export function setWeightLogCache(logs) {
    cachedLogs = Array.isArray(logs) ? logs.slice() : [];
    cacheLoaded = true;
    return cachedLogs;
}

function mergeHistoryIntake(byIso) {
    const grouped = store.globalGroupedHistory || {};
    Object.entries(grouped).forEach(([locale, day]) => {
        const cals = Number(day?.macros?.cals) || 0;
        if (cals <= 0) return;
        const parsed = new Date(locale);
        if (Number.isNaN(parsed.getTime())) return;
        parsed.setHours(0, 0, 0, 0);
        const iso = toISODate(parsed);
        if (!byIso.has(iso)) byIso.set(iso, cals);
    });
}

export async function loadDailyIntakeCache() {
    const byIso = new Map();
    if (store.supabaseClient) {
        try {
            const { data, error } = await store.supabaseClient
                .from('food_logs')
                .select('calories, created_at');
            if (error) throw error;
            (data || []).forEach((row) => {
                const cals = Number(row.calories) || 0;
                if (!row.created_at) return;
                const created = new Date(row.created_at);
                if (Number.isNaN(created.getTime())) return;
                const day = new Date(created);
                day.setHours(0, 0, 0, 0);
                const iso = toISODate(day);
                byIso.set(iso, (byIso.get(iso) || 0) + cals);
            });
        } catch (e) {
            console.warn('food_logs intake history', e);
            intakeCacheLoaded = false;
            return false;
        }
    }
    mergeHistoryIntake(byIso);
    intakeByIso = byIso;
    intakeCacheLoaded = true;
    return true;
}

export async function loadWeightLogCache() {
    const logs = await fetchAllDailyWeights();
    await loadDailyIntakeCache();
    return setWeightLogCache(logs);
}

export function ingestBodyMetricRows(rows) {
    const byIso = new Map();
    (rows || []).forEach((row) => {
        const kg = Number(row?.weight_kg);
        if (!Number.isFinite(kg) || kg <= 0) return;
        const created = row.created_at ? new Date(row.created_at) : null;
        if (!created || Number.isNaN(created.getTime())) return;
        const day = new Date(created);
        day.setHours(0, 0, 0, 0);
        const iso = toISODate(day);
        byIso.set(iso, { iso, dayMs: day.getTime(), kg });
    });
    const logs = [...byIso.values()].sort((a, b) => a.dayMs - b.dayMs);
    return setWeightLogCache(logs);
}

function median(values) {
    if (!values.length) return 0;
    const sorted = values.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function leastSquares(points) {
    const n = points.length;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;
    for (const p of points) {
        sumX += p.t;
        sumY += p.y;
        sumXY += p.t * p.y;
        sumXX += p.t * p.t;
    }
    const denom = n * sumXX - sumX * sumX;
    if (Math.abs(denom) < 1e-12) {
        return { slopePerDay: 0, intercept: n ? sumY / n : 0 };
    }
    const slopePerDay = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slopePerDay * sumX) / n;
    return { slopePerDay, intercept };
}

function dropObviousOutliers(points, fit) {
    if (points.length < 4) return points;
    const residuals = points.map((p) => p.y - (fit.intercept + fit.slopePerDay * p.t));
    const med = median(residuals);
    const mad = median(residuals.map((r) => Math.abs(r - med)));
    if (mad < 1e-6) return points;
    const kept = points.filter((_, i) => {
        const z = (0.6745 * (residuals[i] - med)) / mad;
        return Math.abs(z) <= OUTLIER_Z;
    });
    return kept.length >= 3 ? kept : points;
}

function lastDistinctLogs(logs, n = WEIGHT_ADAPT_MIN_LOGS) {
    if (!logs?.length) return [];
    return logs.slice(-n);
}

export function fitWeightTrend(logs) {
    const window = lastDistinctLogs(logs, WEIGHT_ADAPT_MIN_LOGS);
    if (window.length < 2) return null;
    const raw = window.map((p) => ({
        iso: p.iso,
        dayMs: p.dayMs,
        y: p.kg,
        t: dayIndex(p.iso)
    }));
    const firstFit = leastSquares(raw);
    const cleaned = dropObviousOutliers(raw, firstFit);
    const fit = cleaned === raw ? firstFit : leastSquares(cleaned);
    const minMs = Math.min(...cleaned.map((p) => p.dayMs));
    const maxMs = Math.max(...cleaned.map((p) => p.dayMs));
    return {
        slopePerDay: fit.slopePerDay,
        intercept: fit.intercept,
        slopeKgPerWeek: fit.slopePerDay * 7,
        minMs,
        maxMs,
        points: cleaned
    };
}

/** Left-closed / right-open interior bands; 0.5 stays in the 0.3–0.5 band. */
export function rateBandIndex(rate) {
    const r = Number(rate);
    if (!Number.isFinite(r)) return 3;
    if (r < RATE_BANDS[0]) return 0;
    if (r < RATE_BANDS[1]) return 1;
    if (r < RATE_BANDS[2]) return 2;
    if (r < RATE_BANDS[3]) return 3;
    if (r < RATE_BANDS[4]) return 4;
    if (r <= RATE_BANDS[5]) return 5;
    return 6;
}

export function isAtTargetWeight(config = store.userConfig) {
    const current = Number(config.weight);
    const target = Number(config.targetWeight);
    if (!Number.isFinite(current) || !Number.isFinite(target)) return false;
    return Math.abs(current - target) < AT_TARGET_KG;
}

export function desiredKgPerWeek(config = store.userConfig) {
    if (config.restStop) return 0;
    const goal = config.goal;
    if (goal !== 'Fat_Loss' && goal !== 'Muscle_Gain') return 0;
    const current = Number(config.weight);
    const target = Number(config.targetWeight);
    const weeks = Number(config.targetWeeks) || 8;
    if (!Number.isFinite(current) || !Number.isFinite(target) || weeks <= 0) return 0;
    const gap = target - current;
    if (Math.abs(gap) < AT_TARGET_KG) return 0;
    const taper = Math.min(1, Math.abs(gap) / TAPER_KG);
    return (gap / weeks) * taper;
}

function lockExpired(adapt, iso) {
    if (!adapt?.lockedUntilIso) return true;
    return iso >= adapt.lockedUntilIso;
}

export function formatSlopeKgPerWeek(kgPerWeek) {
    if (kgPerWeek == null || !Number.isFinite(Number(kgPerWeek))) return '';
    const v = Math.round(Number(kgPerWeek) * 10) / 10;
    if (v === 0) return '0.0 kg/week';
    return `${v > 0 ? '+' : ''}${v.toFixed(1)} kg/week`;
}

export function summarizeCalorieAdherence(days) {
    const logged = (days || []).filter((d) => Number(d.eaten) > 0 && Number(d.aim) > 0);
    let eatenSum = 0;
    let aimSum = 0;
    logged.forEach((d) => {
        eatenSum += Number(d.eaten);
        aimSum += Number(d.aim);
    });
    const ratio = aimSum > 0 ? eatenSum / aimSum : null;
    return {
        ok: logged.length >= ADHERENCE_MIN_DAYS && ratio != null && ratio >= ADHERENCE_MIN_RATIO,
        pending: false,
        loggedDays: logged.length,
        windowDays: (days || []).length,
        ratio,
        minDays: ADHERENCE_MIN_DAYS,
        minRatio: ADHERENCE_MIN_RATIO
    };
}

export function pendingAdherence() {
    return {
        ok: false,
        pending: true,
        loggedDays: 0,
        windowDays: 0,
        ratio: null,
        minDays: ADHERENCE_MIN_DAYS,
        minRatio: ADHERENCE_MIN_RATIO
    };
}

export function peekWeightAdapt(logs = cachedLogs, config = store.userConfig, now = new Date(), extras = {}) {
    const adapt = ensureAdaptState(config);
    const iso = todayIso(now);
    const count = (logs || []).length;
    const fit = fitWeightTrend(logs);
    const slope = fit ? fit.slopeKgPerWeek : null;
    const atTarget = isAtTargetWeight(config);
    const restStop = !!config.restStop;
    const desired = desiredKgPerWeek(config);
    const actualBand = slope == null ? null : rateBandIndex(slope);
    const desiredBand = rateBandIndex(desired);
    const steps = actualBand == null ? 0 : desiredBand - actualBand;
    const adherence = extras.adherence || pendingAdherence();
    const hintRemaining = !adapt.lastAdjustedIso && count >= WEIGHT_ADAPT_HINT_FROM && count < WEIGHT_ADAPT_MIN_LOGS
        ? WEIGHT_ADAPT_MIN_LOGS - count
        : 0;
    const wouldAdjust = count >= WEIGHT_ADAPT_MIN_LOGS
        && slope != null
        && lockExpired(adapt, iso)
        && !atTarget
        && !restStop;
    const adherenceHint = wouldAdjust && !adherence.pending && !adherence.ok;
    return {
        distinctLogCount: count,
        slopeKgPerWeek: slope,
        fit,
        atTarget,
        restStop,
        desiredKgPerWeek: desired,
        actualBand,
        desiredBand,
        steps,
        adherence,
        wouldAdjust,
        canAdjust: wouldAdjust && adherence.ok,
        locked: !lockExpired(adapt, iso),
        lockedUntilIso: adapt.lockedUntilIso,
        hintRemaining,
        adherenceHint,
        storedMultiplier: Number(adapt.multiplier) || 1
    };
}

/** Persistent factor on today's formula calories. Never stacked on last week's adapted total. */
export function getAppliedAdaptiveMultiplier(config = store.userConfig) {
    if (config.restStop || isAtTargetWeight(config)) return 1;
    const adapt = ensureAdaptState(config);
    const n = Number(adapt.multiplier);
    return Number.isFinite(n) && n > 0 ? n : 1;
}

/** Recompute / lock the stored factor from cached logs. Returns true if persisted fields changed. */
export function syncWeightAdaptState(logs = cachedLogs, config = store.userConfig, now = new Date(), extras = {}) {
    if (!cacheLoaded && !(logs && logs.length)) return false;
    const adapt = ensureAdaptState(config);
    const before = JSON.stringify(adapt);
    const ev = peekWeightAdapt(logs, config, now, extras);
    const iso = todayIso(now);

    if (ev.atTarget && adapt.multiplier !== 1) {
        adapt.multiplier = 1;
        adapt.adherenceBlocked = false;
    }
    if (ev.distinctLogCount < WEIGHT_ADAPT_MIN_LOGS) {
        adapt.adherenceBlocked = false;
    }

    if (ev.canAdjust) {
        // Replace the factor from formula bands — do not multiply the previous adapted calories.
        adapt.multiplier = WEIGHT_ADAPT_STEP ** ev.steps;
        adapt.lastAdjustedIso = iso;
        adapt.lockedUntilIso = addDaysIso(iso, WEIGHT_ADAPT_LOCK_DAYS);
        adapt.adherenceBlocked = false;
    } else if (ev.wouldAdjust && ev.adherence && !ev.adherence.pending && !ev.adherence.ok) {
        adapt.lockedUntilIso = addDaysIso(iso, WEIGHT_ADAPT_LOCK_DAYS);
        adapt.adherenceBlocked = true;
    }

    adapt.slopeKgPerWeek = ev.slopeKgPerWeek;
    adapt.distinctLogCount = ev.distinctLogCount;
    return before !== JSON.stringify(adapt);
}

export function trendYsForDayMs(dayMsList, fit) {
    if (!fit || !dayMsList?.length) return (dayMsList || []).map(() => null);
    return dayMsList.map((ms) => {
        if (ms == null || ms < fit.minMs || ms > fit.maxMs) return null;
        const d = new Date(ms);
        if (Number.isNaN(d.getTime())) return null;
        const t = dayIndex(toISODate(d));
        const y = fit.intercept + fit.slopePerDay * t;
        return Number.isFinite(y) ? y : null;
    });
}

export function renderWeightAdaptUi(evaluation) {
    const ev = evaluation || peekWeightAdapt();
    const rateEl = document.getElementById('weight-trend-rate');
    if (rateEl) rateEl.textContent = formatSlopeKgPerWeek(ev.slopeKgPerWeek);
    let hint = '';
    if (ev.hintRemaining > 0) {
        hint = `${ev.hintRemaining} more weigh-in${ev.hintRemaining === 1 ? '' : 's'} and calories will adapt`;
    } else if ((ev.adherenceHint || store.userConfig?.weightAdapt?.adherenceBlocked) && !ev.restStop && !ev.atTarget) {
        hint = 'Eat closer to your calorie aim so calories can adapt';
    }
    ['weight-adapt-hint', 'weight-adapt-hint-fuel'].forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = hint;
        el.classList.toggle('hidden', !hint);
    });
}

/**
 * Billing / onboarding anniversary month periods.
 * Anchor = onboarding-complete date (later: payment date). Periods roll on the
 * same calendar day each month (clamped to last day of short months).
 */
import { store } from '../state/store.js';

const ANCHOR_LS_KEY = 'ascensus_month_anchor_v1';

export function dateToISO(d = new Date()) {
    const x = d instanceof Date ? d : new Date(d);
    const y = x.getFullYear();
    const m = String(x.getMonth() + 1).padStart(2, '0');
    const day = String(x.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

export function parseISODate(iso) {
    if (!iso || typeof iso !== 'string') return null;
    const [y, m, d] = iso.split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
}

export function daysInMonth(year, monthIndex) {
    return new Date(year, monthIndex + 1, 0).getDate();
}

/** Calendar date for year/month with day clamped to last day of that month. */
export function clampedDateISO(year, monthIndex, dayOfMonth) {
    const dim = daysInMonth(year, monthIndex);
    const day = Math.min(Math.max(1, dayOfMonth), dim);
    return dateToISO(new Date(year, monthIndex, day));
}

export function getAnchorDayOfMonth(anchorISO) {
    const d = parseISODate(anchorISO);
    return d ? d.getDate() : null;
}

/** Next anniversary on or after `fromISO` (inclusive), using clamped day-of-month. */
export function anniversaryOnOrAfter(fromISO, dayOfMonth) {
    const from = parseISODate(fromISO);
    if (!from || !dayOfMonth) return null;
    const y = from.getFullYear();
    const m = from.getMonth();
    const candidate = clampedDateISO(y, m, dayOfMonth);
    if (candidate >= fromISO) return candidate;
    const nextM = m + 1;
    const ny = nextM > 11 ? y + 1 : y;
    const nm = nextM > 11 ? 0 : nextM;
    return clampedDateISO(ny, nm, dayOfMonth);
}

/** Anniversary strictly after `fromISO`. */
export function anniversaryAfter(fromISO, dayOfMonth) {
    const from = parseISODate(fromISO);
    if (!from || !dayOfMonth) return null;
    const next = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1);
    return anniversaryOnOrAfter(dateToISO(next), dayOfMonth);
}

/**
 * Persist month anchor (onboarding / payment day).
 * Stored on userConfig and localStorage.
 */
export function setMonthAnchorISO(iso) {
    if (!iso || typeof iso !== 'string') return;
    try {
        if (store.userConfig) store.userConfig.monthAnchorDate = iso;
        localStorage.setItem(ANCHOR_LS_KEY, iso);
    } catch (e) { /* ignore */ }
}

export function getMonthAnchorISO() {
    try {
        const fromConfig = store.userConfig?.monthAnchorDate;
        if (fromConfig && typeof fromConfig === 'string') return fromConfig;
    } catch (e) { /* ignore */ }
    try {
        const raw = localStorage.getItem(ANCHOR_LS_KEY);
        if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    } catch (e) { /* ignore */ }
    return null;
}

/**
 * Ensure an anchor exists. Prefer stored; else seed from `date` (first gym /
 * first call after migration for users without onboarding stamp).
 */
export function ensureMonthAnchor(date = new Date()) {
    let iso = getMonthAnchorISO();
    if (iso) return iso;
    iso = dateToISO(date);
    setMonthAnchorISO(iso);
    return iso;
}

/**
 * Billing period containing `date`.
 * startDate = anniversary on/before date
 * endDate = next anniversary (modal available from this day inclusive)
 */
export function getBillingPeriodForDate(date = new Date()) {
    const today = dateToISO(date);
    const anchor = ensureMonthAnchor(date);
    const dayOfMonth = getAnchorDayOfMonth(anchor);
    if (!dayOfMonth) {
        return { startDate: today, endDate: today, periodKey: today, dayOfMonth: 1 };
    }

    // Walk back at most one month to find period start
    const d = parseISODate(today);
    const thisMonthAnn = clampedDateISO(d.getFullYear(), d.getMonth(), dayOfMonth);
    let startDate;
    if (today >= thisMonthAnn) {
        startDate = thisMonthAnn;
    } else {
        const prevM = d.getMonth() - 1;
        const py = prevM < 0 ? d.getFullYear() - 1 : d.getFullYear();
        const pm = prevM < 0 ? 11 : prevM;
        startDate = clampedDateISO(py, pm, dayOfMonth);
    }
    const endDate = anniversaryAfter(startDate, dayOfMonth);
    return {
        startDate,
        endDate,
        periodKey: startDate,
        dayOfMonth
    };
}

/** Stable string key for the current billing month (ISO start date). */
export function getBillingMonthKey(date = new Date()) {
    return getBillingPeriodForDate(date).periodKey;
}

/**
 * Numeric month key for engines that previously used YYYYMM.
 * Derived from period start so it stays stable within a billing month.
 */
export function getBillingMonthKeyNumber(date = new Date()) {
    const key = getBillingMonthKey(date);
    const [y, m, d] = key.split('-').map(Number);
    // Encode start day so short-month clamps stay unique: YYYY * 10000 + MM * 100 + DD
    return (y || 0) * 10000 + (m || 0) * 100 + (d || 0);
}

/**
 * Which billing period's summary should show:
 * - last day of a period (day before next anniversary), or
 * - anniversary day through the following 6 days (summarizing the period that just ended).
 */
export function getActiveBillingSummaryPeriod(now = new Date()) {
    const today = dateToISO(now);
    const period = getBillingPeriodForDate(now);
    const dayOfMonth = period.dayOfMonth;
    const start = parseISODate(period.startDate);
    const todayD = parseISODate(today);
    if (!start || !todayD) return null;

    const diffFromStart = Math.round((todayD - start) / 86400000);
    if (diffFromStart >= 0 && diffFromStart <= 6) {
        const prevEnd = period.startDate;
        const d = parseISODate(prevEnd);
        const prevM = d.getMonth() - 1;
        const py = prevM < 0 ? d.getFullYear() - 1 : d.getFullYear();
        const pm = prevM < 0 ? 11 : prevM;
        const prevStart = clampedDateISO(py, pm, dayOfMonth);
        const anchor = getMonthAnchorISO();
        // No summary for a billing period before the user existed
        if (anchor && prevStart < anchor) return null;
        return { startDate: prevStart, endDate: prevEnd, periodKey: prevStart };
    }

    const end = parseISODate(period.endDate);
    if (!end) return null;
    const dayBeforeEnd = dateToISO(new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1));
    if (today === dayBeforeEnd) {
        return {
            startDate: period.startDate,
            endDate: period.endDate,
            periodKey: period.startDate
        };
    }
    return null;
}

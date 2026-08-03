/**
 * Body metrics helpers — one weight / body-fat / sleep log per calendar day.
 */
import { store } from '../state/store.js';

function toISODate(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function dayBounds(dayDate = new Date()) {
    const start = new Date(dayDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(dayDate);
    end.setHours(23, 59, 59, 999);
    return { start, end };
}

export async function fetchBodyMetricsForLocalDay(dayDate = new Date()) {
    const { start, end } = dayBounds(dayDate);
    try {
        const { data, error } = await store.supabaseClient
            .from('body_metrics')
            .select('*')
            .gte('created_at', start.toISOString())
            .lte('created_at', end.toISOString())
            .order('created_at', { ascending: false });
        if (error) {
            console.warn('body_metrics day fetch', error);
            return [];
        }
        return Array.isArray(data) ? data : [];
    } catch (e) {
        console.warn(e);
        return [];
    }
}

async function collapseDayToSingleRow(keepId, fields, dayRows) {
    let { error } = await store.supabaseClient.from('body_metrics').update(fields).eq('id', keepId);
    if (error) return { error };
    for (const r of dayRows) {
        if (String(r.id) === String(keepId)) continue;
        await store.supabaseClient.from('body_metrics').delete().eq('id', r.id);
    }
    return { error: null };
}

/** Upsert today's weight — collapses to one body_metrics row per day. */
export async function upsertTodayWeight(weightKg) {
    const w = Number(weightKg);
    if (!Number.isFinite(w) || w <= 0) return { error: new Error('Invalid weight') };

    const rows = await fetchBodyMetricsForLocalDay(new Date());
    let error = null;

    if (rows.length) {
        const keep = rows[0];
        const fields = { weight_kg: w };
        const bf = keep.body_fat ?? rows.find(r => r.body_fat != null)?.body_fat;
        if (bf != null) fields.body_fat = bf;
        ({ error } = await collapseDayToSingleRow(keep.id, fields, rows));
    } else {
        ({ error } = await store.supabaseClient.from('body_metrics').insert([{ weight_kg: w }]));
    }

    try {
        localStorage.setItem(`weight_${toISODate()}`, String(w));
        localStorage.setItem(`weight_${new Date().toLocaleDateString()}`, String(w));
    } catch (e) { /* ignore */ }

    return { error };
}

/** Upsert today's body fat — collapses to one body_metrics row per day. */
export async function upsertTodayBodyFat(bodyFatPct) {
    const bf = Number(bodyFatPct);
    if (!Number.isFinite(bf) || bf <= 0) return { error: new Error('Invalid body fat') };

    const rows = await fetchBodyMetricsForLocalDay(new Date());
    const weight = store.userConfig.weight > 0
        ? store.userConfig.weight
        : (rows.find(r => r.weight_kg != null)?.weight_kg || null);

    let error = null;
    if (rows.length) {
        const keep = rows[0];
        const fields = { body_fat: bf };
        const w = keep.weight_kg ?? weight;
        if (w != null) fields.weight_kg = w;
        ({ error } = await collapseDayToSingleRow(keep.id, fields, rows));
        if (error && weight != null) {
            ({ error } = await collapseDayToSingleRow(keep.id, { body_fat: bf, weight_kg: weight }, rows));
        }
    } else {
        const payload = { body_fat: bf };
        if (weight != null) payload.weight_kg = weight;
        ({ error } = await store.supabaseClient.from('body_metrics').insert([payload]));
        if (error && weight != null) {
            ({ error } = await store.supabaseClient.from('body_metrics')
                .insert([{ weight_kg: weight, body_fat: bf }]));
        }
    }

    try {
        localStorage.setItem(`bodyfat_${toISODate()}`, String(bf));
        localStorage.setItem(`bodyfat_${new Date().toLocaleDateString()}`, String(bf));
    } catch (e) { /* ignore */ }

    return { error };
}

/** Sleep is localStorage-only; overwrite the day key (one value per day). */
export function upsertTodaySleep(hours) {
    const h = Number(hours);
    if (!Number.isFinite(h) || h <= 0) return false;
    const locale = new Date().toLocaleDateString();
    localStorage.setItem(`sleep_${locale}`, String(h));
    try {
        localStorage.setItem(`sleep_${toISODate()}`, String(h));
    } catch (e) { /* ignore */ }
    return true;
}

export function clearSleepForLocaleDay(dateStr, dayDate = null) {
    if (dateStr) localStorage.removeItem(`sleep_${dateStr}`);
    try {
        const d = dayDate instanceof Date ? dayDate : (dateStr ? new Date(dateStr) : null);
        if (d && !Number.isNaN(d.getTime())) {
            localStorage.removeItem(`sleep_${toISODate(d)}`);
            localStorage.removeItem(`sleep_${d.toLocaleDateString()}`);
        }
    } catch (e) { /* ignore */ }
}

export function clearLocalWeightForDay(dayDate) {
    try {
        const d = dayDate instanceof Date ? dayDate : new Date(dayDate);
        localStorage.removeItem(`weight_${toISODate(d)}`);
        localStorage.removeItem(`weight_${d.toLocaleDateString()}`);
        localStorage.removeItem(`bodyfat_${toISODate(d)}`);
        localStorage.removeItem(`bodyfat_${d.toLocaleDateString()}`);
    } catch (e) { /* ignore */ }
}

/** Delete all body_metrics rows for a local calendar day. */
export async function deleteBodyMetricsForLocalDay(dayMs) {
    const day = new Date(dayMs);
    const rows = await fetchBodyMetricsForLocalDay(day);
    for (const r of rows) {
        await store.supabaseClient.from('body_metrics').delete().eq('id', r.id);
    }
    clearLocalWeightForDay(day);
    return rows.length;
}

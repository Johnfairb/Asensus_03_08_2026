import { store } from '../state/store.js';
import { persistUserConfigToCloud } from './thermodynamics.js';
import { specificEventName } from '../lib/food-parse.js';
import {
    getSportEvents,
    sameSportEvent,
    sportEventLabel,
    sportEventSelectOptionsHtml
} from './sports-matrix.js';
import {
    addDaysISO,
    dateToISO,
    generateFutureTimeline,
    getMondayISO,
    invalidateWeekPlanCache,
    isRestEvent,
    loadFixedSchedules,
    scheduleEventName,
    scheduleEventTime
} from './route-planner.js';

const FORECAST_WEEK_KEY = 'last_sunday_forecast_week';
const FORECAST_DAY_KEY = 'last_sunday_forecast';

function loadSpecificSchedules() {
    try {
        if (store.specificSchedules && typeof store.specificSchedules === 'object') {
            return store.specificSchedules;
        }
    } catch (e) { /* ignore */ }
    try {
        return JSON.parse(localStorage.getItem('ascensus_specific_schedules') || '{}') || {};
    } catch (e) {
        return {};
    }
}

function persistSpecificSchedules(map) {
    store.specificSchedules = map;
    localStorage.setItem('ascensus_specific_schedules', JSON.stringify(map));
}

function prettyLockName(name) {
    if (name === 'Rest' || name === 'Cannot Workout') return 'Rest';
    return sportEventLabel(name) || name || 'Lock';
}

function isWeekExtraEntry(raw) {
    return !!(raw && typeof raw === 'object' && raw.note === 'Week extra');
}

function lockNames(locks) {
    return (locks || []).map(scheduleEventName).filter(Boolean);
}

function extraAlreadyOnLocks(locks, event) {
    if (!event || event === 'None') return false;
    const names = lockNames(locks);
    if (isRestEvent(event)) return names.some(isRestEvent);
    return names.some((name) => name === event || sameSportEvent(name, event));
}

/** Monday ISO of the week this forecast is planning (tomorrow’s Mon–Sun when opened on Sunday). */
export function getSundayForecastWeekStartISO(now = new Date()) {
    const d = new Date(now);
    d.setHours(12, 0, 0, 0);
    if (d.getDay() === 0) return addDaysISO(dateToISO(d), 1);
    return getMondayISO(d);
}

export function shouldShowSundayForecast(now = new Date()) {
    const day = now.getDay();
    if (day !== 0 && day !== 1) return false;
    const weekStart = getSundayForecastWeekStartISO(now);
    if (localStorage.getItem(FORECAST_WEEK_KEY) === weekStart) return false;
    if (day === 0 && localStorage.getItem(FORECAST_DAY_KEY) === now.toDateString()) return false;
    if (day === 1) {
        const yest = new Date(now);
        yest.setDate(yest.getDate() - 1);
        if (localStorage.getItem(FORECAST_DAY_KEY) === yest.toDateString()) return false;
    }
    return true;
}

export function markSundayForecastComplete(now = new Date()) {
    localStorage.setItem(FORECAST_DAY_KEY, now.toDateString());
    localStorage.setItem(FORECAST_WEEK_KEY, getSundayForecastWeekStartISO(now));
}

export function onSundayWeekEventTypeChange(dateStr) {
    const sel = document.getElementById('sunday-week-event-' + dateStr);
    const timeEl = document.getElementById('sunday-week-time-' + dateStr);
    if (!timeEl) return;
    const val = sel?.value || 'None';
    timeEl.style.display = (val === 'None' || val === 'Rest') ? 'none' : '';
}

function sportOptionsHtml(selected, noneLabel) {
    let html = sportEventSelectOptionsHtml({
        selected,
        includeNone: true,
        includeRest: true,
        noneLabel
    });
    if (getSportEvents().length) return html;
    const practiceSel = selected === 'Practice' ? ' selected' : '';
    const matchSel = (selected === 'Match' || selected === 'Game') ? ' selected' : '';
    return html.replace(
        '<option value="Rest"',
        `<option value="Practice"${practiceSel}>Practice</option><option value="Match"${matchSel}>Match</option><option value="Rest"`
    );
}

function eventSelectHtml(dateStr, selected, time, noneLabel = 'None') {
    const timeVal = time || 'Afternoon';
    const showTime = selected && selected !== 'None' && selected !== 'Rest';
    return `
        <select id="sunday-week-event-${dateStr}" class="input-field" style="margin:0; padding:10px; font-size:12px;" onchange="onSundayWeekEventTypeChange('${dateStr}')">
            ${sportOptionsHtml(selected, noneLabel)}
        </select>
        <select id="sunday-week-time-${dateStr}" class="input-field" style="margin:0; padding:10px; font-size:12px;${showTime ? '' : ' display:none;'}">
            <option value="Morning"${timeVal === 'Morning' ? ' selected' : ''}>Morning</option>
            <option value="Afternoon"${timeVal !== 'Morning' && timeVal !== 'Evening' ? ' selected' : ''}>Afternoon</option>
            <option value="Evening"${timeVal === 'Evening' ? ' selected' : ''}>Evening</option>
        </select>`;
}

export function populateSundayWeekEvents(now = new Date()) {
    const list = document.getElementById('sunday-week-events-list');
    if (!list) return;
    const weekStart = getSundayForecastWeekStartISO(now);
    const fixed = loadFixedSchedules();
    const specific = loadSpecificSchedules();
    let html = '';
    for (let i = 0; i < 7; i++) {
        const dateStr = addDaysISO(weekStart, i);
        const d = new Date(dateStr + 'T12:00:00');
        const dow = d.getDay();
        const label = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
        const locks = fixed[dow] || [];
        const raw = specific[dateStr];
        const showSpecific = isWeekExtraEntry(raw) || !locks.length;
        const extraName = showSpecific ? (specificEventName(raw) || 'None') : 'None';
        const time = showSpecific && raw && typeof raw === 'object' ? (raw.time || '') : '';
        html += `<div style="display:flex; flex-direction:column; gap:6px; padding:10px; border:1px solid var(--border-subtle); border-radius:10px;">
            <div style="font-size:11px; font-family:'Roboto Mono'; color:var(--text-main); font-weight:700;">${label}</div>`;
        if (locks.length) {
            const lockBits = locks.map((ev) => {
                const name = prettyLockName(scheduleEventName(ev));
                const lockTime = scheduleEventTime(ev);
                return lockTime ? `${name} · ${lockTime}` : name;
            }).join(' · ');
            html += `<div style="font-size:11px; color:var(--gold-accent); font-family:'Roboto Mono';">Repeating: ${lockBits}</div>`;
        }
        html += eventSelectHtml(
            dateStr,
            extraName,
            time,
            locks.length ? 'Keep repeating' : 'None'
        );
        html += `</div>`;
    }
    list.innerHTML = html;
}

export function saveSundayWeekEvents(now = new Date()) {
    const weekStart = getSundayForecastWeekStartISO(now);
    const fixed = loadFixedSchedules();
    const specific = { ...loadSpecificSchedules() };
    for (let i = 0; i < 7; i++) {
        const dateStr = addDaysISO(weekStart, i);
        const d = new Date(dateStr + 'T12:00:00');
        const dow = d.getDay();
        const locks = fixed[dow] || [];
        const sel = document.getElementById('sunday-week-event-' + dateStr);
        if (!sel) continue;
        const val = sel.value || 'None';
        const existing = specific[dateStr];
        const existingIsExtra = isWeekExtraEntry(existing) || (!locks.length && existing);

        if (val === 'None' || extraAlreadyOnLocks(locks, val)) {
            if (existingIsExtra) delete specific[dateStr];
            continue;
        }

        const event = val;
        const timeEl = document.getElementById('sunday-week-time-' + dateStr);
        const time = (val === 'Rest') ? '' : (timeEl?.value || 'Afternoon');
        specific[dateStr] = { event, time, note: 'Week extra' };
    }
    persistSpecificSchedules(specific);
    invalidateWeekPlanCache();
    try { generateFutureTimeline(); } catch (e) { /* ignore */ }
    try { persistUserConfigToCloud(); } catch (e) { /* ignore */ }
}

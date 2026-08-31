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

function isOneOffEntry(raw) {
    return isWeekExtraEntry(raw) || !!(raw && typeof raw === 'object' && raw.note === 'Spontaneous');
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

const KEEP_REPEATING = '__keep__';

function weekExtraCancelsLocks(raw) {
    return !!(isWeekExtraEntry(raw) && raw.cancelLocks);
}

function weekExtraRows(raw) {
    if (!raw) return [];
    if (Array.isArray(raw.events) && raw.events.length) {
        return raw.events.map((ev) => ({
            event: scheduleEventName(ev) || (typeof ev === 'string' ? ev : ''),
            time: (ev && typeof ev === 'object' ? (ev.time || '') : (raw.time || ''))
        })).filter((row) => row.event && row.event !== 'None' && row.event !== KEEP_REPEATING);
    }
    const name = specificEventName(raw);
    if (!name || name === 'None' || name === KEEP_REPEATING) return [];
    return [{ event: name, time: (raw && typeof raw === 'object' ? (raw.time || '') : '') }];
}

function sportEventOptionsHtml(selected) {
    let html = sportEventSelectOptionsHtml({
        selected,
        includeNone: false,
        includeRest: true
    });
    if (getSportEvents().length) return html;
    const practiceSel = selected === 'Practice' ? ' selected' : '';
    const matchSel = (selected === 'Match' || selected === 'Game') ? ' selected' : '';
    return html.replace(
        '<option value="Rest"',
        `<option value="Practice"${practiceSel}>Practice</option><option value="Match"${matchSel}>Match</option><option value="Rest"`
    );
}

function extraSlotOptionsHtml(selected, { includeKeep = false, includeEvents = true } = {}) {
    let html = '';
    if (includeKeep) {
        html += `<option value="${KEEP_REPEATING}"${selected === KEEP_REPEATING ? ' selected' : ''}>Keep repeating</option>`;
    }
    const noneSel = !selected || selected === 'None';
    html += `<option value="None"${noneSel && selected !== KEEP_REPEATING ? ' selected' : ''}>None</option>`;
    if (includeEvents) {
        html += sportEventOptionsHtml(selected === KEEP_REPEATING || selected === 'None' ? '' : selected);
    } else {
        html += `<option value="Rest"${selected === 'Rest' ? ' selected' : ''}>Cannot Workout / Rest</option>`;
    }
    return html;
}

function extraSlotHtml(dateStr, slotIdx, selected, time, { includeKeep = false, includeEvents = true } = {}) {
    const timeVal = time || 'Afternoon';
    const showTime = selected && selected !== 'None' && selected !== KEEP_REPEATING && selected !== 'Rest';
    return `<div class="sunday-week-extra-slot" data-date="${dateStr}" data-slot="${slotIdx}" style="display:flex; flex-direction:column; gap:6px;">
        <select id="sunday-week-event-${dateStr}-${slotIdx}" class="input-field" style="margin:0; padding:10px; font-size:12px;" onchange="onSundayWeekEventTypeChange('${dateStr}', ${slotIdx})">
            ${extraSlotOptionsHtml(selected, { includeKeep: includeKeep && slotIdx === 0, includeEvents })}
        </select>
        <select id="sunday-week-time-${dateStr}-${slotIdx}" class="input-field" style="margin:0; padding:10px; font-size:12px;${showTime ? '' : ' display:none;'}">
            <option value="Morning"${timeVal === 'Morning' ? ' selected' : ''}>Morning</option>
            <option value="Afternoon"${timeVal !== 'Morning' && timeVal !== 'Evening' ? ' selected' : ''}>Afternoon</option>
            <option value="Evening"${timeVal === 'Evening' ? ' selected' : ''}>Evening</option>
        </select>
    </div>`;
}

function readLiveExtraCount(dateStr) {
    let n = 0;
    while (document.getElementById(`sunday-week-event-${dateStr}-${n}`)) n += 1;
    return n;
}

function lockCountForDate(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    if (isNaN(d.getTime())) return 0;
    const locks = loadFixedSchedules()[d.getDay()] || [];
    return locks.length;
}

function firstSlotCancelsLocks(dateStr) {
    const sel = document.getElementById(`sunday-week-event-${dateStr}-0`);
    return (sel?.value || 'None') === 'None';
}

function extraSlotsUsed(dateStr) {
    let used = 0;
    for (let i = 0; i < readLiveExtraCount(dateStr); i++) {
        const val = document.getElementById(`sunday-week-event-${dateStr}-${i}`)?.value || 'None';
        if (val !== 'None' && val !== KEEP_REPEATING) used += 1;
    }
    return used;
}

function canAddAnotherExtra(dateStr) {
    const count = readLiveExtraCount(dateStr);
    if (count >= 3) return false;
    const locks = firstSlotCancelsLocks(dateStr) ? 0 : lockCountForDate(dateStr);
    return (locks + extraSlotsUsed(dateStr)) < 2;
}

function refreshSundayAddExtraBtn(dateStr) {
    const btn = document.getElementById(`sunday-week-add-${dateStr}`);
    if (!btn) return;
    btn.style.display = canAddAnotherExtra(dateStr) ? '' : 'none';
}

export function onSundayWeekEventTypeChange(dateStr, slotIdx = 0) {
    const sel = document.getElementById(`sunday-week-event-${dateStr}-${slotIdx}`)
        || document.getElementById('sunday-week-event-' + dateStr);
    const timeEl = document.getElementById(`sunday-week-time-${dateStr}-${slotIdx}`)
        || document.getElementById('sunday-week-time-' + dateStr);
    const val = sel?.value || 'None';
    if (timeEl) timeEl.style.display = (val === 'None' || val === 'Rest' || val === KEEP_REPEATING) ? 'none' : '';
    refreshSundayAddExtraBtn(dateStr);
}

export function addSundayWeekExtra(dateStr) {
    if (!canAddAnotherExtra(dateStr)) return;
    const wrap = document.getElementById(`sunday-week-slots-${dateStr}`);
    if (!wrap) return;
    const slotIdx = readLiveExtraCount(dateStr);
    wrap.insertAdjacentHTML('beforeend', extraSlotHtml(dateStr, slotIdx, 'None', 'Afternoon'));
    refreshSundayAddExtraBtn(dateStr);
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
        const extraIsWeek = isOneOffEntry(raw) || (!locks.length && raw);
        const cancelLocks = extraIsWeek && weekExtraCancelsLocks(raw);
        const extras = extraIsWeek ? weekExtraRows(raw) : [];
        let firstVal;
        let extraSlots = extras.slice();
        if (locks.length) {
            if (cancelLocks) {
                firstVal = extras.some((r) => isRestEvent(r.event)) ? 'Rest' : 'None';
                extraSlots = extras.filter((r) => !isRestEvent(r.event));
            } else {
                firstVal = KEEP_REPEATING;
                extraSlots = extras;
            }
        } else {
            firstVal = extras[0]?.event || 'None';
            extraSlots = extras.slice(1);
        }
        const firstTime = (firstVal === extras[0]?.event) ? (extras[0]?.time || '') : '';

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
        html += `<div id="sunday-week-slots-${dateStr}" style="display:flex; flex-direction:column; gap:6px;">`;
        html += extraSlotHtml(dateStr, 0, firstVal, firstTime, {
            includeKeep: locks.length > 0,
            includeEvents: !locks.length
        });
        extraSlots.forEach((row, idx) => {
            html += extraSlotHtml(dateStr, idx + 1, row.event, row.time);
        });
        html += `</div>`;
        const locksForCap = (firstVal === 'None') ? 0 : locks.length;
        const extraUsed = [firstVal, ...extraSlots.map((r) => r.event)].filter((v) => v && v !== 'None' && v !== KEEP_REPEATING).length;
        const showAdd = extraSlots.length < 2 && (locksForCap + extraUsed) < 2;
        html += `<button type="button" id="sunday-week-add-${dateStr}" class="btn-primary is-secondary" style="margin:0; padding:8px 10px; font-size:11px;${showAdd ? '' : ' display:none;'}" onclick="addSundayWeekExtra('${dateStr}')">+ Add extra</button>`;
        html += `</div>`;
    }
    list.innerHTML = html;
    for (let i = 0; i < 7; i++) {
        const dateStr = addDaysISO(weekStart, i);
        for (let s = 1; s < 3; s++) {
            const extraSel = document.getElementById(`sunday-week-event-${dateStr}-${s}`);
            if (extraSel) {
                [...extraSel.querySelectorAll(`option[value="${KEEP_REPEATING}"]`)].forEach((o) => o.remove());
            }
        }
    }
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
        const existing = specific[dateStr];
        const existingIsExtra = isOneOffEntry(existing) || (!locks.length && existing);
        const slotCount = Math.max(readLiveExtraCount(dateStr), document.getElementById('sunday-week-event-' + dateStr) ? 1 : 0);
        if (!slotCount && !document.getElementById('sunday-week-event-' + dateStr)) continue;

        const rows = [];
        let cancelLocks = false;
        const liveCount = readLiveExtraCount(dateStr);
        if (liveCount) {
            for (let s = 0; s < liveCount; s++) {
                const val = document.getElementById(`sunday-week-event-${dateStr}-${s}`)?.value || 'None';
                if (s === 0 && val === 'None') cancelLocks = true;
                if (val === 'None' || val === KEEP_REPEATING) continue;
                const timeEl = document.getElementById(`sunday-week-time-${dateStr}-${s}`);
                const time = (val === 'Rest') ? '' : (timeEl?.value || 'Afternoon');
                if (!extraAlreadyOnLocks(cancelLocks ? [] : locks, val) || cancelLocks) {
                    rows.push({ event: val, time });
                }
            }
        } else {
            const val = document.getElementById('sunday-week-event-' + dateStr)?.value || 'None';
            if (val === 'None') cancelLocks = !!locks.length;
            else if (val !== KEEP_REPEATING) {
                const timeEl = document.getElementById('sunday-week-time-' + dateStr);
                const time = (val === 'Rest') ? '' : (timeEl?.value || 'Afternoon');
                rows.push({ event: val, time });
            }
        }

        const prevCancelled = (existing && typeof existing === 'object' && Array.isArray(existing.cancelled))
            ? existing.cancelled.filter(Boolean)
            : [];
        const cancelled = (cancelLocks || rows.some((r) => isRestEvent(r.event)))
            ? []
            : prevCancelled.filter((c) => !rows.some((r) => r.event === c));

        if (rows.some((r) => isRestEvent(r.event))) {
            specific[dateStr] = { event: 'Rest', time: '', note: 'Week extra', cancelLocks: true, events: [{ event: 'Rest', time: '' }], cancelled: [] };
            continue;
        }

        if (!cancelLocks && !rows.length) {
            if (cancelled.length) {
                specific[dateStr] = {
                    event: 'None',
                    time: '',
                    note: (existing && existing.note) || 'Spontaneous',
                    cancelLocks: false,
                    events: [],
                    cancelled
                };
            } else if (existingIsExtra) {
                delete specific[dateStr];
            }
            continue;
        }

        // Date-only extras — never copy into the repeating fixed schedule.
        specific[dateStr] = {
            event: rows[0]?.event || 'None',
            time: rows[0]?.time || '',
            note: 'Week extra',
            cancelLocks: !!cancelLocks,
            events: rows,
            cancelled
        };
    }
    persistSpecificSchedules(specific);
    invalidateWeekPlanCache();
    try { generateFutureTimeline(); } catch (e) { /* ignore */ }
    try { persistUserConfigToCloud(); } catch (e) { /* ignore */ }
}

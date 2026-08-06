/**
 * Monthly Progress summary — visible from the last day of a billing period
 * through the first 7 days of the next period.
 */
import { store } from '../state/store.js';
import { getDiaryFieldsForMode } from './diary-schema.js';
import { getActiveBillingSummaryPeriod, parseISODate, daysInMonth, dateToISO as billingDateToISO } from './billing-month.js';

function dateToISO(d) {
  return billingDateToISO(d);
}

function loadDayJournalLite(dateStr) {
  if (!dateStr) return null;
  const keys = [dateStr];
  try {
    const maybe = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T12:00:00');
    if (!isNaN(maybe.getTime())) {
      keys.push(dateToISO(maybe), maybe.toLocaleDateString());
    }
  } catch (e) { /* ignore */ }
  const uniq = [...new Set(keys)];
  for (const key of uniq) {
    for (const prefix of ['ascensus_match_journal_', 'ascensus_practice_journal_', 'ascensus_gym_journal_']) {
      const raw = localStorage.getItem(prefix + key);
      if (!raw) continue;
      try { return JSON.parse(raw); } catch (e) { /* ignore */ }
    }
  }
  return null;
}

/** Which billing period's summary should show right now (or null). */
export function getActiveSummaryMonth(now = new Date()) {
  const period = getActiveBillingSummaryPeriod(now);
  if (!period) return null;
  const start = parseISODate(period.startDate);
  if (!start) return null;
  return {
    year: start.getFullYear(),
    month: start.getMonth(),
    startDate: period.startDate,
    endDate: period.endDate,
    periodKey: period.periodKey
  };
}

function eachDayOfMonth(year, month) {
  const n = daysInMonth(year, month);
  const out = [];
  for (let d = 1; d <= n; d++) out.push(new Date(year, month, d, 12, 0, 0));
  return out;
}

/** Inclusive of startDate, exclusive of endDate (anniversary). */
function eachDayOfPeriod(startISO, endISO) {
  const start = parseISODate(startISO);
  const end = parseISODate(endISO);
  if (!start || !end) return [];
  const out = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 12, 0, 0);
  const endT = end.getTime();
  while (cur.getTime() < endT) {
    out.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function daysForSummary(activeOrYear, maybeMonth) {
  if (activeOrYear && typeof activeOrYear === 'object' && activeOrYear.startDate) {
    return eachDayOfPeriod(activeOrYear.startDate, activeOrYear.endDate);
  }
  return eachDayOfMonth(activeOrYear, maybeMonth);
}

function localeKey(d) {
  return d.toLocaleDateString();
}

function bestExerciseProgress(days) {
  if (!days.length) return null;
  const start = days[0].getTime();
  const end = days[days.length - 1].getTime() + 86400000 - 1;
  const byEx = new Map();

  Object.values(store.globalGroupedHistory || {}).forEach(day => {
    (day.items || []).forEach(log => {
      if (log.type !== 'workout') return;
      const name = log.exercise;
      if (!name || name === 'Practice' || name === 'Match' || /^Spontaneous:/i.test(name)) return;
      const t = new Date(log.created_at).getTime();
      if (t < start || t > end) return;
      const w = Number(log.weight_kg) || 0;
      if (w <= 0) return;
      if (!byEx.has(name)) byEx.set(name, []);
      byEx.get(name).push({ t, w });
    });
  });

  let best = null;
  byEx.forEach((points, name) => {
    points.sort((a, b) => a.t - b.t);
    const first = points[0].w;
    const last = points[points.length - 1].w;
    if (first <= 0 || points.length < 2) return;
    const pct = ((last - first) / first) * 100;
    const delta = last - first;
    if (!best || pct > best.pct) {
      best = { name, pct: Math.round(pct * 10) / 10, delta: Math.round(delta * 10) / 10, from: first, to: last };
    }
  });
  return best;
}

function diaryMonthlyAverages(days) {
  const fieldIds = new Map();
  ['practice', 'match', 'gym', 'lactate'].forEach(mode => {
    getDiaryFieldsForMode(mode).filter(f => f.type === 'quantitative').forEach(f => {
      if (!fieldIds.has(f.id)) fieldIds.set(f.id, f.label);
    });
  });
  [['rpe', 'RPE'], ['athletic', 'Athletic'], ['mental', 'Mental'], ['matchPerformance', 'Match perf']].forEach(([id, label]) => {
    if (!fieldIds.has(id)) fieldIds.set(id, label);
  });

  const sums = {};
  const counts = {};
  fieldIds.forEach((_, id) => { sums[id] = 0; counts[id] = 0; });

  days.forEach(d => {
    const j = loadDayJournalLite(dateToISO(d)) || loadDayJournalLite(localeKey(d));
    if (!j) return;
    const bag = { ...(j.fields || {}), ...j };
    fieldIds.forEach((_, id) => {
      const n = Number(bag[id]);
      if (Number.isFinite(n)) {
        sums[id] += n;
        counts[id] += 1;
      }
    });
  });

  const avgs = [];
  fieldIds.forEach((label, id) => {
    if (counts[id] > 0) {
      avgs.push({ id, label, avg: Math.round((sums[id] / counts[id]) * 10) / 10, n: counts[id] });
    }
  });
  avgs.sort((a, b) => b.n - a.n);
  return avgs;
}

function averageSleep(days) {
  let sum = 0;
  let n = 0;
  days.forEach(d => {
    const v = parseFloat(localStorage.getItem(`sleep_${localeKey(d)}`));
    if (Number.isFinite(v) && v > 0) { sum += v; n += 1; }
  });
  return n ? Math.round((sum / n) * 10) / 10 : null;
}

function adherencePercent(days) {
  const targetCals = store.userConfig?.targets?.cals || 2000;
  const targetCost = store.userConfig?.budget || 50;
  let scored = 0;
  let hit = 0;
  days.forEach(d => {
    const data = store.globalGroupedHistory?.[localeKey(d)];
    if (!data || !(data.macros?.cals > 0)) return;
    scored += 1;
    const calDiff = Math.abs(data.macros.cals - targetCals);
    const overBudget = data.macros.cost > targetCost;
    if (calDiff <= 300 && !overBudget) hit += 1;
  });
  if (!scored) return null;
  return Math.round((hit / scored) * 100);
}

function weightChange(days) {
  let first = null;
  let last = null;
  days.forEach(d => {
    const iso = dateToISO(d);
    const fromKey = parseFloat(localStorage.getItem(`weight_${iso}`))
      || parseFloat(localStorage.getItem(`weight_${localeKey(d)}`));
    if (Number.isFinite(fromKey) && fromKey > 0) {
      if (first == null) first = fromKey;
      last = fromKey;
    }
  });
  if (first == null) return null;
  if (last == null) last = first;
  return { from: first, to: last, delta: Math.round((last - first) * 10) / 10 };
}

function budgetDelta(days) {
  const dailyBudget = Number(store.userConfig?.budget) || 0;
  if (dailyBudget <= 0) return null;
  let spent = 0;
  let daysWithFood = 0;
  days.forEach(d => {
    const data = store.globalGroupedHistory?.[localeKey(d)];
    if (!data || !(data.macros?.cals > 0)) return;
    spent += Number(data.macros.cost) || 0;
    daysWithFood += 1;
  });
  if (!daysWithFood) return null;
  const budget = dailyBudget * daysWithFood;
  const net = Math.round((spent - budget) * 100) / 100;
  return { spent: Math.round(spent * 100) / 100, budget: Math.round(budget * 100) / 100, net, days: daysWithFood };
}

export function computeMonthlySummary(year, month, period = null) {
  const days = period?.startDate
    ? eachDayOfPeriod(period.startDate, period.endDate)
    : eachDayOfMonth(year, month);
  const monthLabel = period?.startDate
    ? `${period.startDate} → ${period.endDate}`
    : new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  return {
    year,
    month,
    monthLabel,
    bestExercise: bestExerciseProgress(days),
    diaryAverages: diaryMonthlyAverages(days),
    avgSleep: averageSleep(days),
    adherencePct: adherencePercent(days),
    weight: weightChange(days),
    budget: budgetDelta(days)
  };
}

export function renderMonthlySummaryBanner() {
  const host = document.getElementById('monthly-summary-banner');
  if (!host) return;
  const active = getActiveSummaryMonth();
  if (!active) {
    host.classList.add('hidden');
    host.innerHTML = '';
    return;
  }
  const s = computeMonthlySummary(active.year, active.month, active);
  const exLine = s.bestExercise
    ? `<div class="monthly-summary-row"><span>Top progress</span><strong>${s.bestExercise.name}</strong><em>+${s.bestExercise.pct}% (${s.bestExercise.delta > 0 ? '+' : ''}${s.bestExercise.delta} kg)</em></div>`
    : `<div class="monthly-summary-row"><span>Top progress</span><strong>No lifting progression data</strong></div>`;

  const diaryLines = (s.diaryAverages || []).slice(0, 6).map(a =>
    `<div class="monthly-summary-chip">${a.label}: <strong>${a.avg}</strong> <span>avg</span></div>`
  ).join('') || `<div class="monthly-summary-chip">No diary stats</div>`;

  const sleepLine = s.avgSleep != null
    ? `${s.avgSleep} h`
    : '—';
  const adhereLine = s.adherencePct != null ? `${s.adherencePct}%` : '—';
  const weightLine = s.weight
    ? `${s.weight.delta > 0 ? '+' : ''}${s.weight.delta} kg (${s.weight.from} → ${s.weight.to})`
    : '—';
  const budgetLine = s.budget
    ? (s.budget.net > 0
      ? `£${s.budget.net.toFixed(2)} over`
      : s.budget.net < 0
        ? `£${Math.abs(s.budget.net).toFixed(2)} under`
        : 'On budget')
    : '—';

  const open = host.dataset.open === '1';
  host.classList.remove('hidden');
  host.innerHTML = `
    <div class="monthly-summary-card">
      <button type="button" class="monthly-summary-toggle" onclick="toggleMonthlySummaryDropdown()" aria-expanded="${open ? 'true' : 'false'}">
        <div>
          <div class="monthly-summary-eyebrow">Monthly summary</div>
          <div class="monthly-summary-title">${s.monthLabel}</div>
        </div>
        <span class="monthly-summary-chevron" aria-hidden="true">${open ? '▴' : '▾'}</span>
      </button>
      <div class="monthly-summary-body ${open ? '' : 'hidden'}">
        <div class="monthly-summary-sub">Shown through the first week of the next month</div>
        ${exLine}
        <div class="monthly-summary-section">Diary averages</div>
        <div class="monthly-summary-chips">${diaryLines}</div>
        <div class="monthly-summary-grid">
          <div><span>Avg sleep</span><strong>${sleepLine}</strong></div>
          <div><span>Adherence</span><strong>${adhereLine}</strong></div>
          <div><span>Weight change</span><strong>${weightLine}</strong></div>
          <div><span>Budget</span><strong>${budgetLine}</strong></div>
        </div>
      </div>
    </div>`;
}

export function toggleMonthlySummaryDropdown() {
  const host = document.getElementById('monthly-summary-banner');
  if (!host) return;
  host.dataset.open = host.dataset.open === '1' ? '0' : '1';
  renderMonthlySummaryBanner();
}

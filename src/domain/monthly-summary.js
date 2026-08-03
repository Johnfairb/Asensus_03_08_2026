/**
 * Monthly Progress summary — visible from the last day of a month
 * through the first 7 days of the next month.
 */
import { store } from '../state/store.js';
import { getDiaryFieldsForMode } from './diary-schema.js';

function dateToISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** Which calendar month's summary should show right now (or null). */
export function getActiveSummaryMonth(now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();
  const day = now.getDate();
  const last = daysInMonth(y, m);
  if (day === last) return { year: y, month: m };
  if (day >= 1 && day <= 7) {
    const prev = new Date(y, m - 1, 1);
    return { year: prev.getFullYear(), month: prev.getMonth() };
  }
  return null;
}

function eachDayOfMonth(year, month) {
  const n = daysInMonth(year, month);
  const out = [];
  for (let d = 1; d <= n; d++) out.push(new Date(year, month, d, 12, 0, 0));
  return out;
}

function localeKey(d) {
  return d.toLocaleDateString();
}

function bestExerciseProgress(year, month) {
  const start = new Date(year, month, 1).getTime();
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999).getTime();
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

function diaryMonthlyAverages(year, month) {
  const fieldIds = new Map();
  ['practice', 'match', 'gym', 'lactate'].forEach(mode => {
    getDiaryFieldsForMode(mode).filter(f => f.type === 'quantitative').forEach(f => {
      if (!fieldIds.has(f.id)) fieldIds.set(f.id, f.label);
    });
  });
  // Always include classic keys
  [['rpe', 'RPE'], ['athletic', 'Athletic'], ['mental', 'Mental'], ['matchPerformance', 'Match perf']].forEach(([id, label]) => {
    if (!fieldIds.has(id)) fieldIds.set(id, label);
  });

  const sums = {};
  const counts = {};
  fieldIds.forEach((_, id) => { sums[id] = 0; counts[id] = 0; });

  eachDayOfMonth(year, month).forEach(d => {
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

function averageSleep(year, month) {
  let sum = 0;
  let n = 0;
  eachDayOfMonth(year, month).forEach(d => {
    const v = parseFloat(localStorage.getItem(`sleep_${localeKey(d)}`));
    if (Number.isFinite(v) && v > 0) { sum += v; n += 1; }
  });
  return n ? Math.round((sum / n) * 10) / 10 : null;
}

function adherencePercent(year, month) {
  const targetCals = store.userConfig?.targets?.cals || 2000;
  const targetCost = store.userConfig?.budget || 50;
  let scored = 0;
  let hit = 0;
  eachDayOfMonth(year, month).forEach(d => {
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

function weightChange(year, month) {
  const days = eachDayOfMonth(year, month);
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

function budgetDelta(year, month) {
  const dailyBudget = Number(store.userConfig?.budget) || 0;
  if (dailyBudget <= 0) return null;
  let spent = 0;
  let daysWithFood = 0;
  eachDayOfMonth(year, month).forEach(d => {
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

export function computeMonthlySummary(year, month) {
  const monthLabel = new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  return {
    year,
    month,
    monthLabel,
    bestExercise: bestExerciseProgress(year, month),
    diaryAverages: diaryMonthlyAverages(year, month),
    avgSleep: averageSleep(year, month),
    adherencePct: adherencePercent(year, month),
    weight: weightChange(year, month),
    budget: budgetDelta(year, month)
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
  const s = computeMonthlySummary(active.year, active.month);
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

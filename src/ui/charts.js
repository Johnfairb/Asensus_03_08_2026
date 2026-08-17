import { store } from '../state/store.js';
import { generateGroceryList } from '../domain/grocery.js';
import { calculateTDEE } from '../domain/thermodynamics.js';
import {
    clearSleepForLocaleDay,
    deleteBodyMetricsForLocalDay,
    upsertTodayWeight
} from '../domain/body-metrics.js';
import { filterLogsForProgressChart } from '../domain/periodization-logs.js';
import { needsCycleDecisions } from '../domain/workout-cycle.js';

async function refreshHistoryAfterChartDelete() {
    // Dynamic import avoids charts ↔ journey ↔ route-planner cycle
    const { loadHistory } = await import('./journey.js');
    await loadHistory();
}

// ==========================================
// 11. THE UNIFIED ASCENT MAP & SYSTEM TRENDS
// ==========================================

/** Session-scoped progress chart date range (defaults: first log → today). */
const progressRange = { fromMs: null, toMs: null, seeded: false };
let _exerciseChartNames = [];
/** Metadata for click-to-delete (rebuilt each draw). */
let _unifiedPointMeta = [];
let _exercisePointMeta = [];
let _macroPointMeta = [];

function toDateInputValue(ms) {
    const d = new Date(ms);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function startOfDayFromInput(iso) {
    if (!iso) return null;
    const d = new Date(`${iso}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d.getTime();
}

function endOfDayFromInput(iso) {
    if (!iso) return null;
    const d = new Date(`${iso}T23:59:59.999`);
    return Number.isNaN(d.getTime()) ? null : d.getTime();
}

function syncProgressRangeInputs() {
    document.querySelectorAll('.progress-range-from').forEach(el => {
        if (progressRange.fromMs != null) el.value = toDateInputValue(progressRange.fromMs);
    });
    document.querySelectorAll('.progress-range-to').forEach(el => {
        if (progressRange.toMs != null) el.value = toDateInputValue(progressRange.toMs);
    });
}

/** Seed or refresh range bounds from earliest data timestamp. */
function ensureProgressDateRange(earliestMs) {
    const now = new Date();
    now.setHours(23, 59, 59, 999);
    const toMs = now.getTime();
    let fromMs = earliestMs != null && !Number.isNaN(earliestMs) ? earliestMs : toMs;
    const fromDay = new Date(fromMs);
    fromDay.setHours(0, 0, 0, 0);
    fromMs = fromDay.getTime();

    if (!progressRange.seeded) {
        progressRange.fromMs = fromMs;
        progressRange.toMs = toMs;
        progressRange.seeded = true;
        syncProgressRangeInputs();
        return;
    }

    // Keep user picks; only fill missing inputs
    const firstFrom = document.querySelector('.progress-range-from');
    const firstTo = document.querySelector('.progress-range-to');
    if (firstFrom?.value) progressRange.fromMs = startOfDayFromInput(firstFrom.value);
    if (firstTo?.value) progressRange.toMs = endOfDayFromInput(firstTo.value);
    if (progressRange.fromMs == null) progressRange.fromMs = fromMs;
    if (progressRange.toMs == null) progressRange.toMs = toMs;
    syncProgressRangeInputs();
}

function inProgressRange(ms) {
    if (ms == null || Number.isNaN(ms)) return false;
    if (progressRange.fromMs != null && ms < progressRange.fromMs) return false;
    if (progressRange.toMs != null && ms > progressRange.toMs) return false;
    return true;
}

function chartClickElements(chart, evt) {
    if (!chart || !evt) return [];
    try {
        return chart.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, true) || [];
    } catch (e) {
        return [];
    }
}

export function onProgressRangeChange() {
    const firstFrom = document.querySelector('.progress-range-from');
    const firstTo = document.querySelector('.progress-range-to');
    progressRange.fromMs = startOfDayFromInput(firstFrom?.value) ?? progressRange.fromMs;
    progressRange.toMs = endOfDayFromInput(firstTo?.value) ?? progressRange.toMs;
    progressRange.seeded = true;
    syncProgressRangeInputs();
    drawUnifiedChart();
    drawExerciseChart();
    drawMacroChart();
}

export function filterExerciseChartList() {
    const term = (document.getElementById('exercise-chart-search')?.value || '').trim().toLowerCase();
    const selected = document.getElementById('exercise-chart-select')?.value || '';
    const list = document.getElementById('exercise-chart-list');
    if (!list) return;
    const filtered = !_exerciseChartNames.length
        ? []
        : _exerciseChartNames.filter(name => !term || String(name).toLowerCase().includes(term));
    if (!filtered.length) {
        list.innerHTML = `<div style="padding:14px; font-size:11px; color:var(--text-muted); text-align:center;">No exercises found.</div>`;
        return;
    }
    list.innerHTML = filtered.map(name => {
        const safe = String(name).replace(/</g, '&lt;');
        const encoded = encodeURIComponent(String(name));
        const active = name === selected ? ' active' : '';
        return `<button type="button" class="exercise-chart-option${active}" onclick="selectExerciseForChart(decodeURIComponent('${encoded}'))">${safe}</button>`;
    }).join('');
}

export function selectExerciseForChart(name) {
    const select = document.getElementById('exercise-chart-select');
    if (select) select.value = name || '';
    filterExerciseChartList();
    drawExerciseChart();
}

export async function drawUnifiedChart() {
    const { data: bodyData } = await store.supabaseClient.from('body_metrics').select('*').order('created_at', { ascending: true });

    const etaLabel = document.getElementById('unified-eta-label');
    const etaValue = document.getElementById('unified-eta-value');

    const targetVal = parseFloat(
        store.userConfig.targetWeight
        || store.savedTargets?.bodyweight
        || ''
    );
    let labels = [];
    let weightYs = [];
    let bodyFatYs = [];
    let routeYs = [];
    let etaText = "Set target for ETA.";
    _unifiedPointMeta = [];

    ensureProgressDateRange(
        bodyData?.length ? new Date(bodyData[0].created_at).getTime() : Date.now()
    );

    if (bodyData && bodyData.length > 0) {
        // One point per calendar day (latest weight / body fat wins)
        const byDay = {};
        bodyData.forEach(l => {
            const d = new Date(l.created_at);
            const dayMs = new Date(d).setHours(0, 0, 0, 0);
            if (!inProgressRange(dayMs)) return;
            if (!byDay[dayMs]) {
                byDay[dayMs] = {
                    dayMs,
                    label: new Date(dayMs).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
                    weight: null,
                    bodyFat: null
                };
            }
            if (l.weight_kg != null) byDay[dayMs].weight = l.weight_kg;
            if (l.body_fat != null) byDay[dayMs].bodyFat = l.body_fat;
        });

        const points = Object.values(byDay)
            .filter(p => (p.weight != null || p.bodyFat != null) && inProgressRange(p.dayMs))
            .sort((a, b) => a.dayMs - b.dayMs);

        _unifiedPointMeta = points;
        labels = points.map(p => p.label);
        weightYs = points.map(p => p.weight);
        bodyFatYs = points.map(p => p.bodyFat);

        const weightSeries = weightYs.filter(v => v != null);
        if (targetVal && weightSeries.length) {
            const current = weightSeries[weightSeries.length - 1];
            const diff = current - targetVal;
            let speedLimit = 0;
            if (store.userConfig.goal === 'Fat_Loss' && diff > 0) speedLimit = current * 0.0075;
            else if (store.userConfig.goal === 'Muscle_Gain' && diff < 0) speedLimit = current * 0.0025;
            
            if (speedLimit > 0) {
                const weeks = Math.abs(diff) / speedLimit;
                const etaDate = new Date();
                etaDate.setDate(etaDate.getDate() + (weeks * 7));
                etaText = `ETA: ${etaDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
                const etaLabelStr = etaDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                if (labels[labels.length - 1] !== etaLabelStr) {
                    labels.push(etaLabelStr);
                    weightYs.push(null);
                    bodyFatYs.push(null);
                    _unifiedPointMeta.push(null);
                }
                const startY = points.find(p => p.weight != null)?.weight ?? current;
                const n = labels.length;
                routeYs = labels.map((_, i) => startY + (targetVal - startY) * (n === 1 ? 1 : i / (n - 1)));
            } else {
                etaText = "Target achieved/Invalid.";
            }
        }
        if (etaLabel) etaLabel.style.color = "var(--gold-accent)";
    }
    if (etaValue) etaValue.innerText = etaText;

    const canvas = document.getElementById('unifiedChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if(store.unifiedChartInstance) store.unifiedChartInstance.destroy();

    let gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, 'rgba(212, 175, 55, 0.4)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

    const hasBodyFat = bodyFatYs.some(v => v != null);

    const datasets = [{
        label: 'Bodyweight',
        data: weightYs,
        borderColor: '#D4AF37',
        backgroundColor: gradient,
        borderWidth: 3,
        pointBackgroundColor: '#fff',
        pointRadius: 4,
        pointHoverRadius: 7,
        fill: true,
        tension: 0.3,
        spanGaps: false,
        yAxisID: 'y'
    }];
    if (hasBodyFat) {
        datasets.push({
            label: 'Body fat %',
            data: bodyFatYs,
            borderColor: '#0A84FF',
            backgroundColor: 'transparent',
            borderWidth: 2,
            pointBackgroundColor: '#0A84FF',
            pointRadius: 4,
            pointHoverRadius: 7,
            fill: false,
            tension: 0.3,
            spanGaps: false,
            yAxisID: 'bf'
        });
    }
    if (routeYs.length) {
        datasets.push({
            label: 'Optimal Route',
            data: routeYs,
            borderColor: '#7a7a7a',
            borderWidth: 2,
            borderDash: [5, 5],
            pointRadius: 0,
            fill: false,
            yAxisID: 'y'
        });
    }

    store.unifiedChartInstance = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: hasBodyFat, labels: { color: '#888', boxWidth: 10, font: { size: 10 } } },
                tooltip: {
                    callbacks: {
                        afterBody: () => ['Tap point to delete']
                    }
                }
            },
            onClick: async (evt, elements) => {
                const hits = elements?.length ? elements : chartClickElements(store.unifiedChartInstance, evt);
                if (!hits.length) return;
                const idx = hits[0].index;
                const meta = _unifiedPointMeta[idx];
                if (!meta) return;
                const parts = [];
                if (meta.weight != null) parts.push(`${meta.weight} kg`);
                if (meta.bodyFat != null) parts.push(`${meta.bodyFat}% BF`);
                if (!confirm(`Delete ${meta.label} body metrics (${parts.join(', ') || 'log'})?`)) return;
                await deleteBodyMetricsForLocalDay(meta.dayMs);
                const todayMs = new Date().setHours(0, 0, 0, 0);
                if (meta.dayMs === todayMs) {
                    window.weightLoggedToday = false;
                    window.bodyFatLoggedToday = false;
                    document.getElementById('status-badge-weight')?.classList.remove('completed');
                    document.getElementById('status-badge-bodyfat')?.classList.remove('completed');
                }
                drawUnifiedChart();
            },
            scales: {
                x: {
                    ticks: {
                        color: '#888',
                        font: { family: 'Roboto Mono', size: 10 },
                        maxTicksLimit: 5
                    },
                    grid: { display: false }
                },
                y: {
                    position: 'left',
                    ticks: {
                        color: '#888',
                        font: { family: 'Roboto Mono', size: 10 },
                        callback: (val) => val + ' kg'
                    },
                    grid: { color: 'rgba(255,255,255,0.03)' },
                    border: { display: false }
                },
                ...(hasBodyFat ? {
                    bf: {
                        position: 'right',
                        ticks: {
                            color: '#0A84FF',
                            font: { family: 'Roboto Mono', size: 10 },
                            callback: (val) => val + '%'
                        },
                        grid: { drawOnChartArea: false },
                        border: { display: false }
                    }
                } : {})
            }
        }
    });
}

export async function drawExerciseChart() {
    const { data: workoutData } = await store.supabaseClient.from('workout_logs').select('*').order('created_at', { ascending: true });
    const select = document.getElementById('exercise-chart-select');
    if (!select) return;

    const isLiftingExercise = (name) => {
        if (!name || name === 'Practice' || name === 'Match') return false;
        if (/^Spontaneous:/i.test(name)) return false;
        const ex = (store.globalExerciseDB || []).find(e => e.name === name);
        if (!ex) return false;
        const d = String(ex.domain || '').toLowerCase();
        return d === 'lifting' || d === 'strength' || d === 'power';
    };
    const uniqueEx = workoutData
        ? [...new Set(
            filterLogsForProgressChart(workoutData)
                .map(l => l.exercise)
                .filter(isLiftingExercise)
          )].sort((a, b) => String(a).localeCompare(String(b)))
        : [];
    _exerciseChartNames = uniqueEx;

    if (workoutData?.length) {
        ensureProgressDateRange(new Date(workoutData[0].created_at).getTime());
    } else {
        ensureProgressDateRange(Date.now());
    }

    if (!select.value || !uniqueEx.includes(select.value)) {
        select.value = uniqueEx[0] || '';
    }
    filterExerciseChartList();

    const selectedMetric = select.value;
    _exercisePointMeta = [];
    if (!selectedMetric) {
        const ctx = document.getElementById('exerciseChart')?.getContext('2d');
        if (ctx && store.exerciseChartInstance) store.exerciseChartInstance.destroy();
        return;
    }

    let actualData = [];
    let isCardio = false;

    // Group by day — max weight (or distance) within the selected date range
    if (workoutData) {
        let exLogs = filterLogsForProgressChart(
            workoutData.filter(l => l.exercise === selectedMetric && inProgressRange(new Date(l.created_at).getTime()))
        );
        if (exLogs.length > 0 && exLogs[0].type === 'cardio') isCardio = true;

        const grouped = exLogs.reduce((acc, log) => {
            const ts = new Date(log.created_at).setHours(0, 0, 0, 0);
            const val = isCardio ? log.distance_km : log.weight_kg;
            if (!acc[ts]) acc[ts] = { y: val, ids: [] };
            acc[ts].ids.push(log.id);
            if (val > acc[ts].y || acc[ts].y == null) acc[ts].y = val;
            return acc;
        }, {});

        actualData = Object.keys(grouped).map(ts => {
            const ms = parseInt(ts, 10);
            return {
                ms,
                label: new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
                y: grouped[ts].y,
                ids: grouped[ts].ids
            };
        }).sort((a, b) => a.ms - b.ms);
    }

    _exercisePointMeta = actualData;

    const canvas = document.getElementById('exerciseChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if(store.exerciseChartInstance) store.exerciseChartInstance.destroy();

    let gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, 'rgba(212, 175, 55, 0.4)'); // Gold Fade
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

    store.exerciseChartInstance = new Chart(ctx, {
        type: 'line', 
        data: { 
            labels: actualData.map(d => d.label),
            datasets: [ { 
                label: isCardio ? 'Max Distance' : 'Max Weight', 
                data: actualData.map(d => d.y), 
                borderColor: '#D4AF37', // Gold Line
                backgroundColor: gradient, 
                borderWidth: 3, 
                pointBackgroundColor: '#fff',
                pointRadius: 4,
                pointHoverRadius: 7,
                fill: true, 
                tension: 0.3 
            }] 
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        afterBody: () => ['Tap point to delete']
                    }
                }
            },
            onClick: async (evt, elements) => {
                const hits = elements?.length ? elements : chartClickElements(store.exerciseChartInstance, evt);
                if (!hits.length) return;
                const meta = _exercisePointMeta[hits[0].index];
                if (!meta?.ids?.length) return;
                const unit = isCardio ? 'km' : 'kg';
                if (!confirm(`Delete ${selectedMetric} on ${meta.label} (${meta.y} ${unit})? This removes all sets that day.`)) return;
                for (const id of meta.ids) {
                    await store.supabaseClient.from('workout_logs').delete().eq('id', id);
                }
                await refreshHistoryAfterChartDelete();
                drawExerciseChart();
            },
            scales: { 
                x: { 
                    ticks: { 
                        color: '#888', 
                        font: { family: 'Roboto Mono', size: 10 }, 
                        maxTicksLimit: 5 
                    }, 
                    grid: { display: false } 
                }, 
                y: { 
                    ticks: { 
                        color: '#888', 
                        font: { family: 'Roboto Mono', size: 10 },
                        callback: (val) => val + (isCardio ? ' km' : ' kg')
                    }, 
                    grid: { color: 'rgba(255,255,255,0.03)' }, 
                    border: { display: false } 
                } 
            } 
        }
    });
}

export function drawMacroChart() {
    const select = document.getElementById('macro-chart-select');
    if (!select) return;
    const metric = select.value;

    let labels = [];
    let loggedYs = [];
    let targetYs = [];
    let targetVal = 0;
    if (metric === 'cost') targetVal = store.userConfig.budget;
    else if (metric === 'sleep') targetVal = 8.0;
    else if (store.userConfig.targets) targetVal = store.userConfig.targets[metric];

    const historyKeys = Object.keys(store.globalGroupedHistory || {});
    let earliestMs = Date.now();
    historyKeys.forEach(dateStr => {
        const t = new Date(dateStr).getTime();
        if (!Number.isNaN(t) && t < earliestMs) earliestMs = t;
    });
    ensureProgressDateRange(earliestMs);

    const from = new Date(progressRange.fromMs || Date.now());
    from.setHours(0, 0, 0, 0);
    const to = new Date(progressRange.toMs || Date.now());
    to.setHours(0, 0, 0, 0);

    _macroPointMeta = [];

    for (let d = new Date(from); d.getTime() <= to.getTime(); d.setDate(d.getDate() + 1)) {
        const day = new Date(d);
        const dateStr = day.toLocaleDateString();
        let yVal = 0;
        let foodIds = [];

        if (metric === 'sleep') {
            yVal = parseFloat(localStorage.getItem(`sleep_${dateStr}`)) || 0;
        } else if (store.globalGroupedHistory[dateStr]) {
            yVal = store.globalGroupedHistory[dateStr].macros[metric] || 0;
            foodIds = (store.globalGroupedHistory[dateStr].items || [])
                .filter(i => i.type === 'food')
                .map(i => i.id);
        }

        labels.push(day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
        loggedYs.push(yVal);
        targetYs.push(targetVal);
        _macroPointMeta.push({
            dateStr,
            dayMs: day.getTime(),
            label: day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
            y: yVal,
            foodIds,
            metric
        });
    }

    const canvas = document.getElementById('macroChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if(store.macroChartInstance) store.macroChartInstance.destroy();

    const colors = { cals: '#D4AF37', pro: '#E0E0E0', carb: '#A0A0A0', fat: '#555555', sleep: '#0A84FF', cost: '#FFFFFF' };
    let color = colors[metric] || '#E0E0E0';
    let gradient = ctx.createLinearGradient(0, 0, 0, 200);
    gradient.addColorStop(0, color + '66'); gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');


    store.macroChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                { label: 'Logged', data: loggedYs, backgroundColor: gradient, borderColor: color, borderWidth: 1, borderRadius: 4 },
                { label: 'Target', data: targetYs, type: 'line', borderColor: '#7a7a7a', borderWidth: 2, borderDash: [5, 5], pointRadius: 0, fill: false }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        afterBody: () => ['Tap bar to delete']
                    }
                }
            },
            onClick: async (evt, elements) => {
                const hits = (elements || []).filter(e => e.datasetIndex === 0);
                const hit = hits[0] || chartClickElements(store.macroChartInstance, evt).find(e => e.datasetIndex === 0);
                if (!hit) return;
                const meta = _macroPointMeta[hit.index];
                if (!meta || !(meta.y > 0)) return;

                if (meta.metric === 'sleep') {
                    if (!confirm(`Delete sleep log for ${meta.label} (${meta.y} hrs)?`)) return;
                    clearSleepForLocaleDay(meta.dateStr, new Date(meta.dayMs));
                    if (meta.dateStr === new Date().toLocaleDateString()) {
                        document.getElementById('status-badge-sleep')?.classList.remove('completed');
                    }
                    drawMacroChart();
                    return;
                }

                if (!meta.foodIds?.length) return;
                if (!confirm(`Delete all food logs for ${meta.label}? This clears that day's ${meta.metric} chart value.`)) return;
                for (const id of meta.foodIds) {
                    await store.supabaseClient.from('food_logs').delete().eq('id', id);
                }
                await refreshHistoryAfterChartDelete();
                drawMacroChart();
            },
            scales: {
                x: {
                    ticks: {
                        color: '#888',
                        font: { family: 'Roboto Mono', size: 10 },
                        maxTicksLimit: 7
                    },
                    grid: { display: false }
                },
                y: {
                    ticks: {
                        color: '#888',
                        font: { family: 'Roboto Mono', size: 10 }
                    },
                    grid: { color: 'rgba(255,255,255,0.03)' },
                    border: { display: false }
                }
            }
        }
    });
}

export function checkSundayForecast() {
    import('../domain/sunday-forecast.js').then((sunday) => {
        const today = new Date();
        if (!sunday.shouldShowSundayForecast(today)) {
            if (needsCycleDecisions()) {
                import('./workout-cycle-ui.js').then((m) => m.maybeOpenWorkoutCycleModal()).catch(() => {});
            }
            return;
        }
        document.getElementById('sunday-weight').value = store.userConfig.weight;
        document.getElementById('sunday-budget').value = store.userConfig.budget;
        if (store.userConfig.dependentAthlete) {
            document.getElementById('dependent-athlete-warning').style.display = 'block';
            document.getElementById('sunday-budget-container').style.display = 'none';
        }

        const pantryContainer = document.getElementById('sunday-pantry-list');
        let auditHtml = '';
        let hasStock = false;
        store.globalFoodDB.forEach(f => {
            if (f.stock_g && f.stock_g > 0) {
                hasStock = true;
                let unit = f._category === 'LIQUID' || f._cleanName.toLowerCase().includes('oil') ? 'ml' : 'g';
                auditHtml += `
                <label style="display:flex; justify-content:space-between; align-items:center; background:#111; padding:10px; border-radius:6px; border:1px solid #222; margin:0; cursor:pointer;">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <input type="checkbox" class="audit-checkbox" data-id="${f.id}" checked style="width:16px; height:16px; accent-color:var(--gold-accent);">
                        <span style="font-size:12px; color:#fff; font-weight:bold;">${f._cleanName}</span>
                    </div>
                    <span style="font-size:10px; color:var(--text-muted); font-family:'Roboto Mono';">~${Math.round(f.stock_g)}${unit}</span>
                </label>`;
            }
        });

        if (!hasStock) auditHtml = '<div style="font-size:11px; color:var(--text-stealth); text-align:center;">Pantry is empty. Starting fresh.</div>';
        pantryContainer.innerHTML = auditHtml;
        sunday.populateSundayWeekEvents(today);
        document.getElementById('sunday-forecast-modal').classList.remove('hidden');
    }).catch(() => {
        if (needsCycleDecisions()) {
            import('./workout-cycle-ui.js').then((m) => m.maybeOpenWorkoutCycleModal()).catch(() => {});
        }
    });
}
setTimeout(checkSundayForecast, 1500);

export async function executeSundayForecast() {
    const newWeight = parseFloat(document.getElementById('sunday-weight').value);
    const newBudget = parseFloat(document.getElementById('sunday-budget').value);
    if (!newWeight) return alert("Telemetry required. Enter your weight.");
    
    const checkboxes = document.querySelectorAll('.audit-checkbox');
    let zeroedItems = [];
    checkboxes.forEach(box => {
        if(!box.checked) {
            let f = store.globalFoodDB.find(food => food.id == box.getAttribute('data-id'));
            if(f) {
                f.stock_g = 0; 
                zeroedItems.push(f.id);
            }
        }
    });

    for(let id of zeroedItems) {
        store.supabaseClient.from('food_inventory').update({ stock_g: 0 }).eq('id', id).then();
    }
    
    const { error } = await upsertTodayWeight(newWeight);
    if (error) console.warn('sunday weight upsert', error);
    store.userConfig.weight = newWeight;
    if (!store.userConfig.dependentAthlete && newBudget) store.userConfig.budget = newBudget;
    
    store.userConfig.tdeePenalty = 0; 
    localStorage.setItem('ascensus_settings', JSON.stringify(store.userConfig));
    try {
        const sunday = await import('../domain/sunday-forecast.js');
        sunday.saveSundayWeekEvents();
        sunday.markSundayForecastComplete();
        try {
            const { getTodayFocus } = await import('../domain/fitness-hud.js');
            getTodayFocus();
        } catch (e) { /* ignore */ }
    } catch (e) {
        localStorage.setItem('last_sunday_forecast', new Date().toDateString());
    }
    
    calculateTDEE();
    document.getElementById('sunday-forecast-modal').classList.add('hidden');
    generateGroceryList();

    // After Sunday calibration, prompt for ~4-week workout block choices when due
    try {
        const { maybeOpenWorkoutCycleModal } = await import('./workout-cycle-ui.js');
        maybeOpenWorkoutCycleModal();
    } catch (e) {
        console.warn('workout cycle modal', e);
    }
}

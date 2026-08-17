import { store } from '../state/store.js';
import { getTodayFocus } from '../domain/fitness-hud.js';
import { generateFutureTimeline, invalidateWeekPlanCache, isGameEvent, isPracticeEvent, listWeekGpsPlanSessions, prettyWorkoutTypeLabel, isLactateEvent } from '../domain/route-planner.js';
import { persistUserConfigToCloud } from '../domain/thermodynamics.js';
import { specificEventName } from '../lib/food-parse.js';
import { populateSportSelects } from '../domain/sports-matrix.js';
import { loadSavedTemplate, parseTemplateDetails, parseTemplateMeta, renderActiveLog, switchLogType, updateExecutionAuxBlocks, updateSaveTemplateButtonLabel } from './templates.js';
import { generateWorkoutTemplate } from '../domain/workout-generator.js';

// ==========================================
// 14.8. LONG TERM CALENDAR ENGINE
// ==========================================
try {
    store.specificSchedules = JSON.parse(localStorage.getItem('ascensus_specific_schedules') || '{}') || {};
} catch (e) {
    store.specificSchedules = {};
}

export function closeCalendarEventModal() {
    const eventModal = document.getElementById('calendar-event-modal');
    if (!eventModal) return;
    eventModal.classList.remove('show');
    setTimeout(() => eventModal.classList.add('hidden'), 300);
}

export function closeLongTermCalendar() {
    closeCalendarEventModal();
}

/** Navigate to Plan → Future and render the in-page calendar. */
export function openLongTermCalendar() {
    const routeNav = document.querySelector('#main-nav .nav-item[onclick*="route"]');
    if (typeof window.switchTab === 'function' && routeNav) {
        window.switchTab(routeNav, 'route', 'Plan');
    }
    if (typeof window.switchPlanSubTab === 'function') {
        window.switchPlanSubTab('future');
    } else {
        document.getElementById('plan-panel-week')?.classList.add('hidden');
        document.getElementById('plan-panel-future')?.classList.remove('hidden');
        try { renderLongTermCalendar(); } catch (err) {
            console.error('renderLongTermCalendar failed', err);
        }
    }
}

export function renderLongTermCalendar() {
    const container = document.getElementById('calendar-months-container');
    if (!container) return;
    let html = '';
    let date = new Date();
    date.setDate(1); 
    
    for(let i=0; i<12; i++) {
        let monthName = date.toLocaleString('default', { month: 'long', year: 'numeric' });
        html += `<div style="margin-bottom: 25px;">
            <div style="font-family:'Roboto Mono'; font-size:12px; color:var(--text-main); font-weight:bold; margin-bottom:10px; border-bottom:1px solid #333; padding-bottom:4px;">${monthName.toUpperCase()}</div>
            <div style="display:grid; grid-template-columns: repeat(7, 1fr); gap:4px; margin-bottom:4px;">`;
        
        ['M','T','W','T','F','S','S'].forEach(d => { html += `<div style="text-align:center; font-size:9px; color:var(--text-stealth); font-family:'Roboto Mono';">${d}</div>`; });
        html += `</div><div style="display:grid; grid-template-columns: repeat(7, 1fr); gap:4px;">`;
        
        let firstDay = date.getDay(); 
        let offset = firstDay === 0 ? 6 : firstDay - 1; 
        for(let j=0; j<offset; j++) { html += `<div></div>`; }
        
        let daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
        for(let d=1; d<=daysInMonth; d++) {
            let fullDate = new Date(date.getFullYear(), date.getMonth(), d);
            let dateStr = fullDate.getFullYear() + '-' + String(fullDate.getMonth()+1).padStart(2, '0') + '-' + String(fullDate.getDate()).padStart(2, '0');
            
            let bg = 'var(--bg-surface-elevated)';
            let color = 'var(--text-silver)';
            let border = '1px solid transparent';
            
            let event = specificEventName(store.specificSchedules[dateStr]);
            const note = (store.specificSchedules[dateStr] && typeof store.specificSchedules[dateStr] === 'object')
                ? (store.specificSchedules[dateStr].note || '')
                : '';
            if (isGameEvent(event)) { bg = '#0A84FF22'; border = '1px solid #0A84FF'; color = '#0A84FF'; }
            else if (isPracticeEvent(event)) { bg = '#D4AF3722'; border = '1px solid #D4AF37'; color = '#D4AF37'; }
            else if(event === 'Rest') { bg = '#FF3B3022'; border = '1px solid #FF3B30'; color = '#FF3B30'; }
            
            if(new Date().toDateString() === fullDate.toDateString()) border = '1px solid var(--gold-accent)';
            const title = note ? ` title="${String(note).replace(/"/g, '&quot;')}"` : '';
            
            html += `<div onclick="openCalendarEventModal('${dateStr}')"${title} style="position:relative; aspect-ratio:1/1; display:flex; justify-content:center; align-items:center; font-size:11px; font-weight:bold; font-family:'Roboto Mono'; border-radius:4px; background:${bg}; color:${color}; border:${border}; cursor:pointer; transition: transform 0.1s ease;" onmousedown="this.style.transform='scale(0.9)'" onmouseup="this.style.transform='scale(1)'">${d}${note ? '<span style="position:absolute;width:4px;height:4px;border-radius:50%;background:var(--gold-accent);bottom:3px;left:50%;transform:translateX(-50%);"></span>' : ''}</div>`;
        }
        
        html += `</div></div>`;
        date.setMonth(date.getMonth() + 1);
    }
    container.innerHTML = html;
}

export function openCalendarEventModal(dateStr) {
    const eventModal = document.getElementById('calendar-event-modal');
    if (!eventModal) return;
    document.getElementById('cal-event-date').innerText = new Date(dateStr + 'T12:00:00').toLocaleDateString(undefined, {weekday:'long', month:'short', day:'numeric'});
    document.getElementById('cal-event-hidden-date').value = dateStr;
    try { populateSportSelects(); } catch (e) { /* ignore */ }
    const raw = store.specificSchedules[dateStr];
    const ev = specificEventName(raw) || 'None';
    const note = (raw && typeof raw === 'object') ? (raw.note || '') : '';
    const sel = document.getElementById('cal-event-select');
    if (sel) {
        const hasVal = [...sel.options].some((o) => o.value === ev);
        if (!hasVal && ev && ev !== 'None') {
            const opt = document.createElement('option');
            opt.value = ev;
            opt.textContent = ev;
            sel.appendChild(opt);
        }
        if ([...sel.options].some((o) => o.value === ev)) sel.value = ev;
        else if ((ev === 'Game' || ev === 'Match') && [...sel.options].some((o) => o.value === 'Match')) sel.value = 'Match';
    }
    const noteEl = document.getElementById('cal-event-note');
    if (noteEl) noteEl.value = note;
    eventModal.classList.remove('hidden');
    setTimeout(() => eventModal.classList.add('show'), 10);
}

export function saveCalendarEvent() {
    let dateStr = document.getElementById('cal-event-hidden-date').value;
    let ev = document.getElementById('cal-event-select').value;
    const note = (document.getElementById('cal-event-note')?.value || '').trim();
    if(ev === 'None') delete store.specificSchedules[dateStr];
    else store.specificSchedules[dateStr] = note ? { event: ev, note } : ev;
    
    localStorage.setItem('ascensus_specific_schedules', JSON.stringify(store.specificSchedules));
    invalidateWeekPlanCache();
    closeCalendarEventModal();
    renderLongTermCalendar();
    generateFutureTimeline();
    try { getTodayFocus(); } catch(e) {}
    if (typeof persistUserConfigToCloud === 'function') persistUserConfigToCloud();
}

export function openLoadWorkoutPicker() {
    // If a workout type was already chosen for this session, reuse it
    const zone = document.getElementById('execution-zone');
    const inSession = zone && !zone.classList.contains('hidden') && store.activeLog?.type === 'workout';
    if (inSession && window.manualSessionKind) {
        openLoadWorkoutList();
        return;
    }
    openWorkoutTypePicker('load');
}

export function closeLoadWorkoutPicker() {
    document.getElementById('load-workout-modal')?.classList.add('hidden');
}

export function openWorkoutTypePicker(mode = 'load') {
    window._workoutTypePickerMode = mode === 'manual' ? 'manual' : 'load';
    const modal = document.getElementById('workout-type-modal');
    if (!modal) {
        // Fallback if modal markup missing
        if (window._workoutTypePickerMode === 'manual') beginManualWorkoutAfterType('Full Body / Strength');
        else openLoadWorkoutList();
        return;
    }
    const title = document.getElementById('workout-type-modal-title');
    const hint = document.getElementById('workout-type-modal-hint');
    if (title) title.innerText = 'Which type of workout?';
    if (hint) {
        hint.innerText = window._workoutTypePickerMode === 'manual'
            ? 'Choose the session type so it counts toward this week’s plan.'
            : 'Choose the session type, then pick a saved workout.';
    }
    modal.classList.remove('hidden');
}

export function closeWorkoutTypePicker() {
    document.getElementById('workout-type-modal')?.classList.add('hidden');
}

export function selectWorkoutType(kind) {
    const normalized = kind || 'Full Body / Strength';
    window.manualSessionKind = normalized;
    closeWorkoutTypePicker();
    if (window._workoutTypePickerMode === 'manual') {
        beginManualWorkoutAfterType(normalized);
        return;
    }
    openLoadWorkoutList();
}

function applySessionKindToFocus(kind) {
    const el = document.getElementById('today-focus');
    if (el && kind) el.value = kind;
}

export function openLoadWorkoutList(tab = null) {
    const list = document.getElementById('load-workout-list');
    const modal = document.getElementById('load-workout-modal');
    if (!list || !modal) return;
    if (tab === 'saved' || tab === 'gps') window._loadWorkoutTab = tab;
    if (!window._loadWorkoutTab) window._loadWorkoutTab = 'saved';
    syncLoadWorkoutTabs();

    const typeLabel = prettyWorkoutTypeLabel(window.manualSessionKind || 'Full Body / Strength');
    const subtitle = document.getElementById('load-workout-modal-subtitle');
    if (window._loadWorkoutTab === 'gps') {
        if (subtitle) {
            subtitle.innerHTML = `This week’s GPS plan — load any session. Already-done sessions stay available but won’t count again toward the weekly quota.`;
        }
        renderGpsPlanLoadList(list);
    } else {
        if (subtitle) {
            subtitle.innerHTML = `Type: <strong style="color:var(--gold-accent);">${typeLabel}</strong> — choose a saved workout from My Workouts.`;
        }
        renderSavedWorkoutLoadList(list, typeLabel);
    }
    modal.classList.remove('hidden');
}

function syncLoadWorkoutTabs() {
    const savedBtn = document.getElementById('load-workout-tab-saved');
    const gpsBtn = document.getElementById('load-workout-tab-gps');
    const active = window._loadWorkoutTab || 'saved';
    [savedBtn, gpsBtn].forEach(btn => {
        if (!btn) return;
        const on = btn.getAttribute('data-load-tab') === active;
        btn.classList.toggle('active', on);
        btn.classList.toggle('is-primary', on);
        btn.classList.toggle('is-secondary', !on);
    });
}

export function switchLoadWorkoutTab(tab) {
    window._loadWorkoutTab = tab === 'gps' ? 'gps' : 'saved';
    openLoadWorkoutList(window._loadWorkoutTab);
}

function renderSavedWorkoutLoadList(list, typeLabel) {
    const wantedKind = window.manualSessionKind || '';
    let workouts = (store.globalTemplates || []).filter(t => t.type === 'workout');
    // Prefer templates stamped with the chosen session kind
    if (wantedKind) {
        const matched = workouts.filter(t => {
            const meta = parseTemplateMeta(t.details);
            const k = t.sessionKind || meta.sessionKind || '';
            if (!k) return false;
            return k === wantedKind
                || (wantedKind.includes('Strength') && String(k).includes('Strength'))
                || (wantedKind.includes('Steady') && /steady|cardio/i.test(k))
                || (wantedKind === 'Lactate' && /lactate/i.test(k));
        });
        if (matched.length) workouts = matched;
    }
    if (!workouts.length) {
        list.innerHTML = `<div style="text-align:center; padding:24px 8px; color:var(--text-muted); font-size:12px; line-height:1.5;">No saved workouts yet.<br>Save one from a session with <strong style="color:var(--text-main);">Save Workout</strong>, or tap <strong style="color:var(--text-main);">+</strong> after closing this to add exercises.</div>
            <button type="button" class="btn-primary is-primary" style="margin-top:8px;" onclick="closeLoadWorkoutPicker(); beginManualWorkoutAfterType(window.manualSessionKind || 'Full Body / Strength')">Start empty ${typeLabel}</button>`;
    } else {
        list.innerHTML = workouts.map(t => {
            const items = parseTemplateDetails(t.details);
            const safeName = String(t.name || 'Untitled').replace(/</g, '&lt;');
            return `<button type="button" onclick="selectLoadedWorkout('${t.id}')" style="display:block; width:100%; text-align:left; background:var(--bg-surface-elevated); border:1px solid var(--border-highlight); border-radius:10px; padding:14px; margin-bottom:8px; cursor:pointer;">
                <div style="font-size:14px; color:var(--text-main); font-weight:700; margin-bottom:4px;">${safeName}</div>
                <div style="font-size:10px; color:var(--text-muted); font-family:'Roboto Mono'; text-transform:uppercase;">${items.length} exercise${items.length === 1 ? '' : 's'}</div>
            </button>`;
        }).join('');
    }
}

function renderGpsPlanLoadList(list) {
    let sessions = [];
    try {
        sessions = listWeekGpsPlanSessions(new Date()) || [];
    } catch (e) {
        console.warn(e);
    }
    if (!sessions.length) {
        list.innerHTML = `<div style="text-align:center; padding:24px 8px; color:var(--text-muted); font-size:12px; line-height:1.5;">No GPS sessions planned for this week.</div>`;
        return;
    }
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    list.innerHTML = sessions.map(s => {
        const d = new Date(s.dateIso + 'T12:00:00');
        const dayLabel = `${dayNames[d.getDay()]} ${s.dateIso.slice(5)}`;
        const safeKey = String(s.slotKey).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const status = s.completed
            ? `<span style="color:var(--text-stealth);">Done · won’t count again</span>`
            : (s.countsTowardQuota
                ? `<span style="color:var(--gold-accent);">Counts toward week</span>`
                : `<span style="color:var(--text-muted);">Available</span>`);
        return `<button type="button" onclick="selectLoadedGpsSession('${safeKey}')" style="display:block; width:100%; text-align:left; background:var(--bg-surface-elevated); border:1px solid var(--border-highlight); border-radius:10px; padding:14px; margin-bottom:8px; cursor:pointer; opacity:${s.completed ? '0.85' : '1'};">
            <div style="display:flex; justify-content:space-between; gap:8px; align-items:flex-start;">
                <div style="min-width:0;">
                    <div style="font-size:14px; color:var(--text-main); font-weight:700; margin-bottom:4px;">${String(s.label || s.event).replace(/</g, '&lt;')}</div>
                    <div style="font-size:10px; color:var(--text-muted); font-family:'Roboto Mono'; text-transform:uppercase;">${dayLabel}</div>
                </div>
                <div style="font-size:10px; font-family:'Roboto Mono'; text-align:right; flex-shrink:0; line-height:1.35;">${status}</div>
            </div>
        </button>`;
    }).join('');
}

export function selectLoadedWorkout(id) {
    window.plannedGpsSlot = null;
    closeLoadWorkoutPicker();
    applySessionKindToFocus(window.manualSessionKind);
    loadSavedTemplate(id);
    const kindLabel = prettyWorkoutTypeLabel(window.manualSessionKind || 'Full Body / Strength');
    const title = document.getElementById('current-route-title');
    if (title) title.innerText = kindLabel.toUpperCase();
}

export async function selectLoadedGpsSession(slotKey) {
    let sessions = [];
    try {
        sessions = listWeekGpsPlanSessions(new Date()) || [];
    } catch (e) {
        console.warn(e);
    }
    const session = sessions.find(s => s.slotKey === slotKey);
    if (!session) {
        alert('That planned session could not be found.');
        return;
    }
    closeLoadWorkoutPicker();
    window.plannedGpsSlot = {
        slotKey: session.slotKey,
        dateIso: session.dateIso,
        event: session.event,
        weekStart: session.weekStart,
        completed: !!session.completed
    };
    window.manualSessionKind = session.event;
    window.manualWorkoutMode = false;
    window._forceGpsTemplateLoad = true;
    applySessionKindToFocus(session.event);

    const focusEl = document.getElementById('today-focus');
    if (focusEl) focusEl.value = session.event;

    // Ensure we are in a workout execution session
    const zone = document.getElementById('execution-zone');
    const inSession = zone && !zone.classList.contains('hidden') && store.activeLog?.type === 'workout';
    if (!inSession) {
        document.getElementById('log-type-selector').value = 'workout';
        switchLogType();
        if (zone) {
            zone.classList.remove('hidden');
            setTimeout(() => zone.classList.add('show'), 10);
        }
        document.body.classList.add('workout-focus-mode');
        const fuelToggles = document.getElementById('fuel-toggles');
        if (fuelToggles) fuelToggles.style.display = 'none';
    }

    const title = document.getElementById('current-route-title');
    if (title) title.innerText = prettyWorkoutTypeLabel(session.event).toUpperCase();

    const finishLoad = async () => {
        try {
            await generateWorkoutTemplate();
        } catch (e) {
            console.warn(e);
            alert('Could not load that planned workout.');
        } finally {
            window._forceGpsTemplateLoad = false;
        }
    };

    if (isLactateEvent(session.event) && typeof window.openLactateHitPicker === 'function') {
        window.openLactateHitPicker(() => { finishLoad(); });
        return;
    }
    await finishLoad();
}

export function beginManualWorkoutAfterType(kind) {
    const normalized = kind || window.manualSessionKind || 'Full Body / Strength';
    window.manualSessionKind = normalized;
    applySessionKindToFocus(normalized);
    if (typeof window._beginManualWorkoutSession === 'function') {
        window._beginManualWorkoutSession(normalized);
    }
}

export function openLoadRecipePicker() {
    const list = document.getElementById('load-recipe-list');
    const modal = document.getElementById('load-recipe-modal');
    if (!list || !modal) return;
    const recipes = (store.globalTemplates || []).filter(t => t.type === 'meal' || t.type === 'recipe');
    if (!recipes.length) {
        list.innerHTML = `<div style="text-align:center; padding:24px 8px; color:var(--text-muted); font-size:12px; line-height:1.5;">No saved recipes yet.<br>Save one from a meal with <strong style="color:var(--text-main);">Save Recipe</strong>.</div>`;
    } else {
        list.innerHTML = recipes.map(t => {
            const items = parseTemplateDetails(t.details);
            const safeName = String(t.name || 'Untitled').replace(/</g, '&lt;');
            return `<button type="button" onclick="selectLoadedRecipe('${t.id}')" style="display:block; width:100%; text-align:left; background:var(--bg-surface-elevated); border:1px solid var(--border-highlight); border-radius:10px; padding:14px; margin-bottom:8px; cursor:pointer;">
                <div style="font-size:14px; color:var(--text-main); font-weight:700; margin-bottom:4px;">${safeName}</div>
                <div style="font-size:10px; color:var(--text-muted); font-family:'Roboto Mono'; text-transform:uppercase;">${items.length} ingredient${items.length === 1 ? '' : 's'}</div>
            </button>`;
        }).join('');
    }
    modal.classList.remove('hidden');
}

export function closeLoadRecipePicker() {
    document.getElementById('load-recipe-modal')?.classList.add('hidden');
}

export function selectLoadedRecipe(id) {
    closeLoadRecipePicker();
    // Keep the meal type the user already opened (breakfast/lunch/etc.)
    const currentMeal = document.getElementById('log-type-selector')?.value;
    const template = (store.globalTemplates || []).find(t => String(t.id) === String(id));
    if (!template) return alert('Saved recipe not found.');
    const items = parseTemplateDetails(template.details);
    if (!items.length) return alert('That recipe is empty.');

    if (!['breakfast', 'lunch', 'dinner', 'snack'].includes(currentMeal)) {
        document.getElementById('log-type-selector').value = 'lunch';
    }
    // Don't wipe the meal type via switchLogType — apply items into the open meal log
    store.activeLog.type = document.getElementById('log-type-selector').value;
    store.activeLog.items = items;
    window.manualWorkoutMode = false;
    document.getElementById('current-route-title').innerText = 'SAVED RECIPE';
    const fuelToggles = document.getElementById('fuel-toggles');
    if (fuelToggles) fuelToggles.style.display = 'flex';
    document.body.classList.remove('workout-focus-mode');
    updateSaveTemplateButtonLabel();
    updateExecutionAuxBlocks(store.activeLog.type);
    renderActiveLog();
    document.getElementById('tools-menu')?.classList.add('hidden');
    document.getElementById('ghost-template-container')?.classList.add('hidden');
    const zone = document.getElementById('execution-zone');
    if (zone) {
        zone.classList.remove('hidden');
        setTimeout(() => zone.classList.add('show'), 10);
    }
}


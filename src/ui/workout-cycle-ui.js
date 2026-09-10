/**
 * Sunday ~4-week cycle decisions: change / keep / custom per gym session type.
 */
import { store } from '../state/store.js';
import {
    applyCycleDecision,
    ensureCycleStarted,
    finalizeCycleDecisions,
    getSessionTypesForCurrentProgramme,
    loadCycleState,
    needsCycleDecisions,
    allCycleDecisionsComplete,
    focusForSessionType,
    seedKeepDecisionsIfNeeded
} from '../domain/workout-cycle.js';
import { parseTemplateDetails, parseTemplateMeta } from './templates.js';
import { prettyWorkoutTypeLabel } from '../domain/route-planner.js';

let _customForTypeId = null;

function ensureModal() {
    let modal = document.getElementById('workout-cycle-modal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'workout-cycle-modal';
    modal.className = 'hidden';
    modal.innerHTML = `
        <div class="modal-content stealth-panel">
            <div style="font-family:'Roboto Mono',monospace;font-size:10px;color:var(--text-muted);font-weight:800;text-transform:uppercase;margin-bottom:5px;letter-spacing:1px;">Training month</div>
            <h2 style="color:var(--text-main);margin-bottom:5px;font-family:'Roboto Mono',monospace;letter-spacing:1px;text-transform:uppercase;">Next month</h2>
            <p id="workout-cycle-modal-hint" style="font-size:11px;color:var(--text-muted);margin-bottom:15px;line-height:1.5;font-family:'Roboto Mono',monospace;">
                Your training month ends today. For each gym session type, choose change, keep, or a custom saved workout.
            </p>
            <div id="workout-cycle-session-list" style="display:flex;flex-direction:column;gap:14px;margin-bottom:16px;"></div>
            <button type="button" class="btn-primary is-primary" style="margin-top:0;" onclick="confirmWorkoutCycleDecisions()">Lock next month</button>
        </div>`;
    const root = document.querySelector('.iphone-screen') || document.body;
    root.appendChild(modal);
    return modal;
}

export function maybeOpenWorkoutCycleModal() {
    try { ensureCycleStarted(new Date()); } catch (e) { /* still try */ }
    try { seedKeepDecisionsIfNeeded(new Date()); } catch (e) { /* still try */ }
    if (!needsCycleDecisions()) return false;
    const types = getSessionTypesForCurrentProgramme();
    if (!types.length) return false;
    const existing = document.getElementById('workout-cycle-modal');
    if (existing && !existing.classList.contains('hidden')) return true;
    renderWorkoutCycleModal();
    return true;
}

export function renderWorkoutCycleModal() {
    const modal = ensureModal();
    const list = document.getElementById('workout-cycle-session-list');
    const hint = document.getElementById('workout-cycle-modal-hint');
    const state = loadCycleState();
    const pending = state?.pendingDecisions || {};
    if (hint && (state?.endDate || state?.endSunday)) {
        const end = state.endDate || state.endSunday;
        hint.textContent = `Month renewing ${end}. For each session type below, choose change (new workout), keep the same, or load a custom saved workout for the next month.`;
    }
    const types = getSessionTypesForCurrentProgramme();
    list.innerHTML = types.map((t) => {
        const chosen = pending[t.id] || '';
        const badge = chosen
            ? `<span style="font-size:10px;color:var(--gold-accent);font-family:'Roboto Mono';">✓ ${chosen}</span>`
            : `<span style="font-size:10px;color:var(--text-stealth);font-family:'Roboto Mono';">choose</span>`;
        return `
        <div style="border:1px solid var(--border-highlight);border-radius:10px;padding:12px;background:rgba(255,255,255,0.02);">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px;">
                <div style="font-size:13px;font-weight:700;color:var(--text-main);">${t.label}</div>
                ${badge}
            </div>
            <div class="workout-cycle-choices" style="display:flex;flex-direction:row;flex-wrap:wrap;gap:6px;align-items:center;">
                <button type="button" class="btn-primary ${chosen === 'change' ? 'is-primary' : 'is-secondary'}" style="width:auto;flex:0 0 auto;margin:0;padding:8px 12px;font-size:11px;" onclick="chooseWorkoutCycleOption('${t.id}','change')">Change</button>
                <button type="button" class="btn-primary ${chosen === 'keep' ? 'is-primary' : 'is-secondary'}" style="width:auto;flex:0 0 auto;margin:0;padding:8px 12px;font-size:11px;" onclick="chooseWorkoutCycleOption('${t.id}','keep')">Keep</button>
                <button type="button" class="btn-primary ${chosen === 'custom' ? 'is-primary' : 'is-secondary'}" style="width:auto;flex:0 0 auto;margin:0;padding:8px 12px;font-size:11px;" onclick="chooseWorkoutCycleOption('${t.id}','custom')">Custom</button>
            </div>
        </div>`;
    }).join('');
    modal.classList.remove('hidden');
}

export function chooseWorkoutCycleOption(sessionTypeId, decision) {
    if (decision === 'custom') {
        _customForTypeId = sessionTypeId;
        openCycleLoadWorkoutPicker(sessionTypeId);
        return;
    }
    try {
        applyCycleDecision(sessionTypeId, decision);
        renderWorkoutCycleModal();
    } catch (e) {
        alert(e.message || 'Could not apply that choice.');
    }
}

function openCycleLoadWorkoutPicker(sessionTypeId) {
    const types = getSessionTypesForCurrentProgramme();
    const meta = types.find((t) => t.id === sessionTypeId);
    window.manualSessionKind = focusForSessionType(meta) || (meta?.family === 'strength'
        ? (meta.session === 'B' ? 'Full Body / Strength B' : 'Full Body / Strength A')
        : 'Hypertrophy / Full Body');
    window._cycleCustomSessionTypeId = sessionTypeId;

    const list = document.getElementById('load-workout-list');
    const modal = document.getElementById('load-workout-modal');
    if (!list || !modal) {
        alert('Load Workout UI not available.');
        return;
    }
    const typeLabel = prettyWorkoutTypeLabel(window.manualSessionKind);
    const subtitle = document.getElementById('load-workout-modal-subtitle');
    if (subtitle) {
        subtitle.innerHTML = `Pick a saved workout for <strong style="color:var(--gold-accent);">${meta?.label || typeLabel}</strong> — it will lock for the next month.`;
    }
    let workouts = (store.globalTemplates || []).filter((t) => t.type === 'workout');
    if (!workouts.length) {
        list.innerHTML = `<div style="text-align:center;padding:24px 8px;color:var(--text-muted);font-size:12px;line-height:1.5;">No saved workouts yet. Save one from a session first, then return here.</div>`;
    } else {
        list.innerHTML = workouts.map((t) => {
            const items = parseTemplateDetails(t.details);
            const safeName = String(t.name || 'Untitled').replace(/</g, '&lt;');
            return `<button type="button" onclick="selectCycleCustomWorkout('${t.id}')" style="display:block;width:100%;text-align:left;background:var(--bg-surface-elevated);border:1px solid var(--border-highlight);border-radius:10px;padding:14px;margin-bottom:8px;cursor:pointer;">
                <div style="font-size:14px;color:var(--text-main);font-weight:700;margin-bottom:4px;">${safeName}</div>
                <div style="font-size:10px;color:var(--text-muted);font-family:'Roboto Mono';text-transform:uppercase;">${items.length} exercise${items.length === 1 ? '' : 's'}</div>
            </button>`;
        }).join('');
    }
    document.getElementById('workout-cycle-modal')?.classList.add('hidden');
    modal.classList.remove('hidden');
}

export function selectCycleCustomWorkout(templateId) {
    const sessionTypeId = window._cycleCustomSessionTypeId || _customForTypeId;
    if (!sessionTypeId) return;
    const template = (store.globalTemplates || []).find((t) => String(t.id) === String(templateId));
    if (!template) return alert('Saved workout not found.');
    const items = parseTemplateDetails(template.details);
    const tMeta = parseTemplateMeta(template.details);
    try {
        applyCycleDecision(sessionTypeId, 'custom', {
            items,
            templateId: template.id,
            templateName: template.name,
            sessionKind: template.sessionKind || tMeta.sessionKind || null
        });
    } catch (e) {
        return alert(e.message || 'Could not lock that workout.');
    }
    document.getElementById('load-workout-modal')?.classList.add('hidden');
    window._cycleCustomSessionTypeId = null;
    _customForTypeId = null;
    renderWorkoutCycleModal();
}

export function confirmWorkoutCycleDecisions() {
    if (!allCycleDecisionsComplete()) {
        return alert('Choose an option for every session type first.');
    }
    const result = finalizeCycleDecisions(new Date());
    if (!result.ok) {
        return alert('Still missing choices for: ' + (result.missing || []).map((t) => t.label).join(', '));
    }
    document.getElementById('workout-cycle-modal')?.classList.add('hidden');
    alert('Next training block locked.');
}

export function closeWorkoutCycleModal() {
    document.getElementById('workout-cycle-modal')?.classList.add('hidden');
}

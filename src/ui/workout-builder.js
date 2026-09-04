/**
 * Guided gym Workout Builder: Type → Compounds (sets/reps or Custom, then picks)
 * → Isolations (same). Opened from a manual gym session, next to Load Workout.
 */
import { store } from '../state/store.js';
import { excludeBannedExercises } from '../domain/bans.js';
import { getLibraryMuscleGroup, LIBRARY_MUSCLE_ORDER } from '../domain/bodyweight-lifts.js';
import { getExerciseMeta } from '../domain/exercise-catalog.js';
import { isExerciseMuscleLocked } from '../domain/hypertrophy-engine.js';
import { isPowerEvent, powerMovementForName } from '../domain/power-engine.js';
import { isCustomWorkoutKind, isLactateEvent, isSteadyCardio } from '../domain/route-planner.js';
import { addExercisesByIds } from '../domain/workout-generator.js';

const STEPS = ['type', 'compoundSets', 'compoundPicks', 'isoSets', 'isoPicks'];
const TYPE_HEADINGS = {
    full: ['Legs', 'Pecs', 'Lats', 'Shoulders', 'Biceps', 'Triceps', 'Core'],
    lower: ['Legs'],
    upper: ['Pecs', 'Lats', 'Shoulders', 'Biceps', 'Triceps']
};
const PARAM_STYLE = "width:42px;margin:0;padding:6px 2px;font-size:10px;text-align:center;font-family:'Roboto Mono',monospace;";

const builderState = {
    step: 'type',
    type: 'full',
    compoundCustom: false,
    compoundSets: 3,
    compoundReps: 10,
    isoCustom: false,
    isoSets: 3,
    isoReps: 10,
    skipIsolation: false
};

export function isManualGymBuilderContext() {
    if (!window.manualWorkoutMode) return false;
    const type = document.getElementById('log-type-selector')?.value || store.activeLog?.type;
    if (type !== 'workout') return false;
    const kind = window.manualSessionKind || '';
    if (isCustomWorkoutKind(kind)) return false;
    if (isLactateEvent(kind) || isSteadyCardio(kind) || isPowerEvent(kind)) return false;
    return true;
}

export function syncWorkoutBuilderButton() {
    const show = isManualGymBuilderContext();
    const footer = document.getElementById('btn-workout-builder');
    const tools = document.getElementById('btn-open-workout-builder-tools');
    if (footer) footer.classList.toggle('hidden', !show);
    if (tools) tools.style.display = show ? '' : 'none';
}

export function openWorkoutBuilder() {
    if (!isManualGymBuilderContext()) return;
    const modal = document.getElementById('workout-builder-modal');
    if (!modal) return;
    builderState.step = 'type';
    builderState.type = 'full';
    builderState.compoundCustom = false;
    builderState.compoundSets = 3;
    builderState.compoundReps = 10;
    builderState.isoCustom = false;
    builderState.isoSets = 3;
    builderState.isoReps = 10;
    builderState.skipIsolation = false;
    builderState._compoundIds = [];
    builderState._compoundSpecs = {};
    builderState._isoIds = [];
    builderState._isoSpecs = {};
    renderWorkoutBuilder();
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
}

export function closeWorkoutBuilder() {
    const modal = document.getElementById('workout-builder-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.style.display = 'none';
}

export function workoutBuilderSelectType(type) {
    if (!TYPE_HEADINGS[type]) return;
    builderState.type = type;
    renderWorkoutBuilder();
}

export function workoutBuilderOnRepsInput(which) {
    const repsEl = document.getElementById(which === 'iso' ? 'wb-iso-reps' : 'wb-compound-reps');
    const hintEl = document.getElementById(which === 'iso' ? 'wb-iso-hint' : 'wb-compound-hint');
    if (!repsEl || !hintEl) return;
    hintEl.textContent = repRangeHint(repsEl.value);
}

function parsePositiveInt(raw, fallback) {
    const n = parseInt(String(raw ?? '').trim(), 10);
    if (!Number.isFinite(n) || n < 1) return fallback;
    return n;
}

function readSetsReps(prefix) {
    const setsEl = document.getElementById(`wb-${prefix}-sets`);
    const repsEl = document.getElementById(`wb-${prefix}-reps`);
    return {
        sets: parsePositiveInt(setsEl?.value, null),
        reps: parsePositiveInt(repsEl?.value, null)
    };
}

function repRangeHint(raw) {
    const n = parseInt(String(raw ?? '').trim(), 10);
    if (!Number.isFinite(n) || n < 1) return 'Enter reps to see the training focus.';
    if (n <= 6) return 'You are doing strength training.';
    if (n <= 12) return 'You are training for hypertrophy.';
    return 'You are training for muscular endurance.';
}

function stepIndex() {
    return STEPS.indexOf(builderState.step);
}

function headingForType(type) {
    return TYPE_HEADINGS[type] || TYPE_HEADINGS.full;
}

function typeLabel(type) {
    if (type === 'lower') return 'Lower body';
    if (type === 'upper') return 'Upper body';
    return 'Full body';
}

function isGymBuilderExercise(ex) {
    if (!ex) return false;
    const domain = String(ex.domain || getExerciseMeta(ex.name)?.domain || '').toLowerCase();
    if (domain === 'power' || domain === 'cardio' || domain === 'warmup') return false;
    if (powerMovementForName(ex.name)) return false;
    if (/stretch|lactate|hit\s*class|steady/i.test(ex.name || '')) return false;
    return true;
}

function groupExercises(role) {
    const allowed = new Set(headingForType(builderState.type));
    const exercises = excludeBannedExercises(store.globalExerciseDB || []).filter((ex) => {
        if (!isGymBuilderExercise(ex)) return false;
        if (store.fatigueLockouts && ex.muscle_group && store.fatigueLockouts[ex.muscle_group]) return false;
        if (isExerciseMuscleLocked(ex.name)) return false;
        const meta = getExerciseMeta(ex.name);
        if (!meta || meta.role !== role) return false;
        const heading = getLibraryMuscleGroup(meta.name || ex.name);
        return heading && allowed.has(heading);
    });
    const grouped = new Map();
    exercises.forEach((ex) => {
        const displayName = getExerciseMeta(ex.name)?.name || ex.name;
        const heading = getLibraryMuscleGroup(displayName);
        if (!heading || !allowed.has(heading)) return;
        if (!grouped.has(heading)) grouped.set(heading, []);
        grouped.get(heading).push({ ex, displayName });
    });
    grouped.forEach((list) => list.sort((a, b) =>
        String(a.displayName || '').localeCompare(String(b.displayName || ''))
    ));
    const order = LIBRARY_MUSCLE_ORDER.filter((h) => allowed.has(h));
    const headings = [
        ...order.filter((h) => (grouped.get(h) || []).length > 0),
        ...[...grouped.keys()].filter((h) => !order.includes(h))
    ];
    return { grouped, headings };
}

function pickerHtml(role, custom) {
    const { grouped, headings } = groupExercises(role);
    if (!headings.length) {
        return `<div style="text-align:center;color:var(--text-muted);font-size:12px;padding:24px;">No ${role} exercises for ${typeLabel(builderState.type)}.</div>`;
    }
    return headings.map((heading) => {
        const rows = (grouped.get(heading) || []).map(({ ex, displayName }) => {
            const safeName = String(displayName || ex.name || '').replace(/</g, '&lt;');
            const id = String(ex.id).replace(/"/g, '&quot;');
            const params = custom
                ? `<div class="wb-ex-params" style="display:none;align-items:center;gap:4px;flex-shrink:0;">
                    <input type="number" min="1" step="1" inputmode="numeric" class="input-field wb-ex-sets" placeholder="Sets" aria-label="Sets" style="${PARAM_STYLE}" onclick="event.stopPropagation()">
                    <input type="number" min="1" step="1" inputmode="numeric" class="input-field wb-ex-reps" placeholder="Reps" aria-label="Reps" style="${PARAM_STYLE}" onclick="event.stopPropagation()">
                </div>`
                : '';
            return `<div data-wb-ex-row style="display:flex;align-items:center;gap:8px;padding:8px 4px;border-bottom:1px solid var(--border-subtle);">
                ${params}
                <label style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;cursor:pointer;">
                    <input type="checkbox" class="wb-ex-check" value="${id}" style="width:16px;height:16px;accent-color:var(--gold-accent);flex-shrink:0;">
                    <span style="font-size:13px;color:var(--text-main);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${safeName}</span>
                </label>
            </div>`;
        }).join('');
        return `<details open style="margin-bottom:12px;">
            <summary style="font-family:'Roboto Mono';font-size:11px;font-weight:800;color:var(--gold-accent);text-transform:uppercase;letter-spacing:0.5px;cursor:pointer;padding:6px 0;">${heading}</summary>
            <div>${rows}</div>
        </details>`;
    }).join('');
}

function wirePickerChecks() {
    document.querySelectorAll('#workout-builder-list .wb-ex-check').forEach((cb) => {
        cb.addEventListener('change', () => {
            const params = cb.closest('[data-wb-ex-row]')?.querySelector('.wb-ex-params');
            if (params) params.style.display = cb.checked ? 'flex' : 'none';
        });
    });
}

function collectPickerSelection(requireCustomParams) {
    const checks = [...document.querySelectorAll('#workout-builder-list .wb-ex-check:checked')];
    const ids = [];
    const specsById = {};
    for (const c of checks) {
        const id = c.value;
        if (!id) continue;
        if (requireCustomParams) {
            const row = c.closest('[data-wb-ex-row]');
            const sets = parsePositiveInt(row?.querySelector('.wb-ex-sets')?.value, null);
            const reps = parsePositiveInt(row?.querySelector('.wb-ex-reps')?.value, null);
            if (sets == null || reps == null) {
                window.alert('Enter sets and reps for each selected exercise.');
                return null;
            }
            specsById[id] = { sets, reps };
        }
        ids.push(id);
    }
    return { ids, specsById };
}

function typeCard(id, label) {
    const on = builderState.type === id;
    return `<button type="button" onclick="workoutBuilderSelectType('${id}')" class="btn-primary ${on ? 'is-primary' : 'is-secondary'}"
        style="margin:0;width:100%;padding:14px;font-size:13px;text-align:left;">${label}</button>`;
}

function setsRepsStepHtml(prefix, title, customLabel) {
    const sets = prefix === 'iso' ? builderState.isoSets : builderState.compoundSets;
    const reps = prefix === 'iso' ? builderState.isoReps : builderState.compoundReps;
    return `
        <p style="font-size:12px;color:var(--text-muted);line-height:1.45;margin:0 0 14px;">${title} Choose shared sets and reps, or Custom to set them per exercise.</p>
        <div style="display:flex;align-items:flex-end;gap:10px;margin-bottom:10px;">
            <div style="flex:1;">
                <label style="display:block;font-size:10px;color:var(--text-muted);font-family:'Roboto Mono';text-transform:uppercase;margin-bottom:6px;">Sets</label>
                <input type="number" min="1" step="1" inputmode="numeric" id="wb-${prefix}-sets" class="input-field" value="${sets}" style="margin:0;">
            </div>
            <div style="flex:1;">
                <label style="display:block;font-size:10px;color:var(--text-muted);font-family:'Roboto Mono';text-transform:uppercase;margin-bottom:6px;">Reps</label>
                <input type="number" min="1" step="1" inputmode="numeric" id="wb-${prefix}-reps" class="input-field" value="${reps}" style="margin:0;" oninput="workoutBuilderOnRepsInput('${prefix}')">
            </div>
            <button type="button" class="btn-primary is-secondary" style="margin:0;flex:0 0 auto;padding:12px 14px;font-size:11px;" onclick="workoutBuilderChooseCustom('${prefix}')">${customLabel}</button>
        </div>
        <div id="wb-${prefix}-hint" style="font-size:12px;color:var(--gold-accent);font-family:'Roboto Mono';line-height:1.4;min-height:1.4em;">${repRangeHint(reps)}</div>
    `;
}

function renderWorkoutBuilder() {
    const body = document.getElementById('workout-builder-body');
    const footer = document.getElementById('workout-builder-footer');
    const stepEl = document.getElementById('workout-builder-step-label');
    const subEl = document.getElementById('workout-builder-sub');
    if (!body || !footer) return;

    const idx = Math.max(0, stepIndex());
    if (stepEl) stepEl.textContent = `Step ${idx + 1} of ${STEPS.length}`;

    let html = '';
    let footerHtml = '';
    const back = `<button type="button" class="btn-primary is-secondary" style="margin:0;flex:1;" onclick="workoutBuilderBack()">Back</button>`;
    const next = (label, fn) => `<button type="button" class="btn-primary is-primary" style="margin:0;flex:1;" onclick="${fn}">${label}</button>`;

    if (builderState.step === 'type') {
        if (subEl) subEl.textContent = 'Type';
        html = `
            <p style="font-size:12px;color:var(--text-muted);line-height:1.45;margin:0 0 14px;">Which muscles is this gym session for?</p>
            <div style="display:flex;flex-direction:column;gap:8px;">
                ${typeCard('full', 'Full body')}
                ${typeCard('lower', 'Lower body')}
                ${typeCard('upper', 'Upper body')}
            </div>`;
        footerHtml = next('Continue', 'workoutBuilderContinue()');
    } else if (builderState.step === 'compoundSets') {
        if (subEl) subEl.textContent = 'Compounds · sets & reps';
        html = setsRepsStepHtml('compound', `Shared sets and reps for ${typeLabel(builderState.type)} compounds.`, 'Custom');
        footerHtml = `${back}${next('Continue', 'workoutBuilderContinue()')}`;
    } else if (builderState.step === 'compoundPicks') {
        if (subEl) subEl.textContent = builderState.compoundCustom
            ? 'Compounds · pick exercises (custom sets/reps)'
            : 'Compounds · pick exercises';
        html = `<p style="font-size:12px;color:var(--text-muted);line-height:1.45;margin:0 0 12px;">Compound lifts whose primary muscle matches ${typeLabel(builderState.type).toLowerCase()}.${builderState.compoundCustom ? ' Enter sets and reps on each selected lift.' : ` Each selected lift gets ${builderState.compoundSets} × ${builderState.compoundReps}.`}</p>
            <div id="workout-builder-list">${pickerHtml('compound', builderState.compoundCustom)}</div>`;
        footerHtml = `${back}${next('Continue', 'workoutBuilderContinue()')}`;
    } else if (builderState.step === 'isoSets') {
        if (subEl) subEl.textContent = 'Isolations · sets & reps';
        html = setsRepsStepHtml('iso', `Shared sets and reps for ${typeLabel(builderState.type)} isolations.`, 'Custom');
        footerHtml = `${back}
            <button type="button" class="btn-primary is-secondary" style="margin:0;flex:1;" onclick="workoutBuilderSkipIsolations()">Skip</button>
            ${next('Continue', 'workoutBuilderContinue()')}`;
    } else if (builderState.step === 'isoPicks') {
        if (subEl) subEl.textContent = builderState.isoCustom
            ? 'Isolations · pick exercises (custom sets/reps)'
            : 'Isolations · pick exercises';
        html = `<p style="font-size:12px;color:var(--text-muted);line-height:1.45;margin:0 0 12px;">Isolation movements whose primary muscle matches ${typeLabel(builderState.type).toLowerCase()}.${builderState.isoCustom ? ' Enter sets and reps on each selected lift.' : ` Each selected lift gets ${builderState.isoSets} × ${builderState.isoReps}.`}</p>
            <div id="workout-builder-list">${pickerHtml('isolation', builderState.isoCustom)}</div>`;
        footerHtml = `${back}${next('Add to workout', 'workoutBuilderFinish()')}`;
    }

    body.innerHTML = html;
    footer.innerHTML = `<div style="display:flex;gap:8px;">${footerHtml}</div>`;
    if (builderState.step === 'compoundPicks' || builderState.step === 'isoPicks') wirePickerChecks();
}

export function workoutBuilderChooseCustom(prefix) {
    if (prefix === 'iso') {
        builderState.isoCustom = true;
        builderState.step = 'isoPicks';
    } else {
        builderState.compoundCustom = true;
        builderState.step = 'compoundPicks';
    }
    renderWorkoutBuilder();
}

export function workoutBuilderSkipIsolations() {
    builderState.skipIsolation = true;
    builderState._isoIds = [];
    builderState._isoSpecs = {};
    applyBuilderToLog();
}

export function workoutBuilderBack() {
    captureOpenSetsReps();
    const idx = stepIndex();
    if (idx <= 0) {
        closeWorkoutBuilder();
        return;
    }
    if (builderState.step === 'compoundPicks' && builderState.compoundCustom) {
        builderState.compoundCustom = false;
        builderState.step = 'compoundSets';
    } else if (builderState.step === 'isoPicks' && builderState.isoCustom) {
        builderState.isoCustom = false;
        builderState.step = 'isoSets';
    } else {
        builderState.step = STEPS[idx - 1];
    }
    renderWorkoutBuilder();
}

function captureOpenSetsReps() {
    if (builderState.step === 'compoundSets') {
        const { sets, reps } = readSetsReps('compound');
        if (sets != null) builderState.compoundSets = sets;
        if (reps != null) builderState.compoundReps = reps;
    }
    if (builderState.step === 'isoSets') {
        const { sets, reps } = readSetsReps('iso');
        if (sets != null) builderState.isoSets = sets;
        if (reps != null) builderState.isoReps = reps;
    }
}

export function workoutBuilderContinue() {
    if (builderState.step === 'type') {
        builderState.step = 'compoundSets';
        renderWorkoutBuilder();
        return;
    }
    if (builderState.step === 'compoundSets') {
        const { sets, reps } = readSetsReps('compound');
        if (sets == null || reps == null) {
            window.alert('Enter sets and reps, or tap Custom.');
            return;
        }
        builderState.compoundCustom = false;
        builderState.compoundSets = sets;
        builderState.compoundReps = reps;
        builderState.step = 'compoundPicks';
        renderWorkoutBuilder();
        return;
    }
    if (builderState.step === 'compoundPicks') {
        const picked = collectPickerSelection(builderState.compoundCustom);
        if (!picked) return;
        builderState._compoundIds = picked.ids;
        builderState._compoundSpecs = picked.specsById;
        builderState.step = 'isoSets';
        renderWorkoutBuilder();
        return;
    }
    if (builderState.step === 'isoSets') {
        const { sets, reps } = readSetsReps('iso');
        if (sets == null || reps == null) {
            window.alert('Enter sets and reps, tap Custom, or Skip isolations.');
            return;
        }
        builderState.isoCustom = false;
        builderState.isoSets = sets;
        builderState.isoReps = reps;
        builderState.skipIsolation = false;
        builderState.step = 'isoPicks';
        renderWorkoutBuilder();
    }
}

export function workoutBuilderFinish() {
    const picked = collectPickerSelection(builderState.isoCustom);
    if (!picked) return;
    builderState._isoIds = picked.ids;
    builderState._isoSpecs = picked.specsById;
    builderState.skipIsolation = false;
    applyBuilderToLog();
}

function applyBuilderToLog() {
    const compoundIds = builderState._compoundIds || [];
    const isoIds = builderState.skipIsolation ? [] : (builderState._isoIds || []);
    if (!compoundIds.length && !isoIds.length) {
        window.alert('Pick at least one exercise.');
        return;
    }
    const compoundSpecs = {};
    compoundIds.forEach((id) => {
        compoundSpecs[id] = builderState.compoundCustom
            ? (builderState._compoundSpecs?.[id] || {})
            : { sets: builderState.compoundSets, reps: builderState.compoundReps };
    });
    const isoSpecs = {};
    isoIds.forEach((id) => {
        isoSpecs[id] = builderState.isoCustom
            ? (builderState._isoSpecs?.[id] || {})
            : { sets: builderState.isoSets, reps: builderState.isoReps };
    });
    const ids = [...compoundIds, ...isoIds];
    const specsById = { ...compoundSpecs, ...isoSpecs };
    addExercisesByIds(ids, specsById);
    closeWorkoutBuilder();
    const menu = document.getElementById('tools-menu');
    if (menu) menu.classList.add('hidden');
    const btn = document.getElementById('btn-manual-add');
    if (btn) {
        btn.textContent = '+';
        btn.title = 'Add manually';
    }
}

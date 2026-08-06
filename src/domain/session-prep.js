/**
 * Session warmup / stretching preferences and structured part catalogues.
 * Modes: planned | custom | none — separate for gym vs practice/match.
 */
import { store } from '../state/store.js';
import { getLactateWarmupParts } from './lactate-engine.js';

const PREFS_KEY = 'ascensus_session_prep_prefs_v1';

export const MOBILISATION_JOINTS = [
    'Neck', 'Shoulder', 'Shoulder girdle', 'Elbow', 'Wrists',
    'Spine', 'QL', 'Hips', 'Knees', 'Ankles'
];

export const SHOULDER_WARMUP_DRILLS = [
    'Band pull-aparts', 'Y raises', 'W raises', 'Wall slides'
];

export const DYNAMIC_WARMUP_DRILLS = [
    '5m sprints', 'Vertical jumps', 'Clap push-ups'
];

export const DYNAMIC_STRETCHES = [
    'Hamstring', 'Adductors', 'Hip flexor', 'Chest', 'Triceps', 'Biceps'
];

export const COOLDOWN_STRETCHES = [
    'Lower back', 'Hamstrings', 'Adductors', 'QL', 'Wrists', 'Glute medius',
    'Hip flexor', 'Core', 'Lats', 'Rotator cuff', 'Biceps', 'Pecs', 'Triceps'
];

/** @typedef {'planned'|'custom'|'none'} PrepMode */

function defaultPrefs() {
    return {
        gymWarmup: 'planned',
        gymStretch: 'planned',
        practiceWarmup: 'planned',
        practiceStretch: 'planned'
    };
}

export function loadSessionPrepPrefs() {
    try {
        const raw = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null');
        return { ...defaultPrefs(), ...(raw && typeof raw === 'object' ? raw : {}) };
    } catch (e) {
        return defaultPrefs();
    }
}

export function saveSessionPrepPrefs(partial) {
    const next = { ...loadSessionPrepPrefs(), ...partial };
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    try {
        store.userConfig = store.userConfig || {};
        store.userConfig.sessionPrep = next;
    } catch (e) { /* ignore */ }
    return next;
}

/** Map focus / session kind → gym | practice pair key. */
export function prepContextForFocus(focus) {
    const f = String(focus || '');
    if (/practice/i.test(f) || /match|game/i.test(f)) return 'practice';
    return 'gym';
}

export function getWarmupMode(context = 'gym') {
    const p = loadSessionPrepPrefs();
    return context === 'practice' ? p.practiceWarmup : p.gymWarmup;
}

export function getStretchMode(context = 'gym') {
    const p = loadSessionPrepPrefs();
    return context === 'practice' ? p.practiceStretch : p.gymStretch;
}

export function setWarmupMode(context, mode) {
    const key = context === 'practice' ? 'practiceWarmup' : 'gymWarmup';
    return saveSessionPrepPrefs({ [key]: mode });
}

export function setStretchMode(context, mode) {
    const key = context === 'practice' ? 'practiceStretch' : 'gymStretch';
    return saveSessionPrepPrefs({ [key]: mode });
}

function part(name, reps, notes, children = null) {
    return { name, reps, notes, children };
}

/** Structured warmup parts for gym (hypertrophy/strength) or practice/match. */
export function buildStructuredWarmupParts(context = 'gym') {
    const pulse = part(
        'Pulse Raising',
        'Until heat / light sweat',
        'Undergo pulse raising until you feel a sense of heat or a light sweat.'
    );
    const mobilisation = part(
        'Mobilisation',
        'All joints',
        'Tap to open joints. Each joint has a teaching-point video placeholder.',
        MOBILISATION_JOINTS.map(j => part(j, 'Video', 'Teaching point video placeholder'))
    );
    const dynamicStretch = part(
        'Dynamic Stretching',
        `${DYNAMIC_STRETCHES.length} stretches`,
        'Tap a stretch for teaching-point video placeholder.',
        DYNAMIC_STRETCHES.map(s => part(s, 'Video', 'Teaching point video placeholder'))
    );

    if (context === 'practice') {
        const dynamicWarmup = part(
            'Dynamic Warmup',
            `${DYNAMIC_WARMUP_DRILLS.length} drills`,
            'A few explosive reps of common sport movements.',
            DYNAMIC_WARMUP_DRILLS.map(s => part(s, 'Video', 'Teaching point video placeholder'))
        );
        return [pulse, mobilisation, dynamicWarmup, dynamicStretch];
    }

    const shoulder = part(
        'Shoulder Warmup',
        `${SHOULDER_WARMUP_DRILLS.length} drills`,
        'Tap a drill for teaching-point video placeholder.',
        SHOULDER_WARMUP_DRILLS.map(s => part(s, 'Video', 'Teaching point video placeholder'))
    );
    return [pulse, mobilisation, shoulder, dynamicStretch];
}

export function buildStructuredStretchParts() {
    return COOLDOWN_STRETCHES.map(s =>
        part(s, 'Hold ~30s', 'Teaching point video placeholder')
    );
}

/**
 * Resolve warmup block for a session, honouring prefs.
 * Lactate keeps its shorter protocol (caller should pass isLactate).
 */
export function resolveWarmupBlock({ context = 'gym', isLactate = false } = {}) {
    if (isLactate) {
        return {
            name: 'Warmup',
            isWarmupGroup: true,
            warmupParts: getLactateWarmupParts(),
            warmupNote: 'Pulse raising, mobilisation & dynamic stretching'
        };
    }
    const mode = getWarmupMode(context);
    if (mode === 'none') return null;
    if (mode === 'custom') {
        return {
            name: 'Custom Warmup',
            isWarmupGroup: true,
            isCustomWarmup: true,
            warmupParts: [{ name: 'Custom Warmup', reps: 'Log when done', notes: 'Your own warmup — mark complete when finished.' }],
            warmupNote: 'Custom warmup (no prescribed parts)'
        };
    }
    const parts = buildStructuredWarmupParts(context);
    return {
        name: 'Warmup',
        isWarmupGroup: true,
        warmupParts: parts,
        warmupNote: context === 'practice'
            ? 'Pulse raising, mobilisation, dynamic warmup & dynamic stretching'
            : 'Pulse raising, mobilisation, shoulder warmup & dynamic stretching'
    };
}

export function resolveStretchBlock({ context = 'gym' } = {}) {
    const mode = getStretchMode(context);
    if (mode === 'none') return null;
    if (mode === 'custom') {
        return {
            name: 'Custom Stretching',
            isText: true,
            isStretchGroup: true,
            isCustomStretch: true,
            reps: 'Log when done',
            notes: 'Your own stretching routine — mark complete when finished.',
            stretchParts: null
        };
    }
    return {
        name: 'Stretching',
        isText: true,
        isStretchGroup: true,
        reps: 'Log when done',
        notes: '',
        stretchParts: buildStructuredStretchParts()
    };
}

/** After dismissing planned warmup — permanently set mode for that context. */
export function dismissWarmupToCustom(context) {
    setWarmupMode(context, 'custom');
}

export function dismissWarmupToNone(context) {
    setWarmupMode(context, 'none');
}

export function dismissStretchToCustom(context) {
    setStretchMode(context, 'custom');
}

export function dismissStretchToNone(context) {
    setStretchMode(context, 'none');
}

/** Practice / match middle block — empty loggable session. */
export function buildSportSessionBlock(kind = 'practice') {
    const label = /match|game/i.test(kind) ? 'Match' : 'Practice';
    return {
        name: label,
        isSportSessionBlock: true,
        isText: true,
        reps: 'Log when done',
        notes: `${label} block — mark complete when the session finishes.`
    };
}

export function saveSessionPrepSettings() {
    saveSessionPrepPrefs({
        gymWarmup: document.getElementById('set-gym-warmup')?.value || 'planned',
        gymStretch: document.getElementById('set-gym-stretch')?.value || 'planned',
        practiceWarmup: document.getElementById('set-practice-warmup')?.value || 'planned',
        practiceStretch: document.getElementById('set-practice-stretch')?.value || 'planned'
    });
}

function refreshPrepLogUi(exIdx, { closeModal = false, reRenderSets = false } = {}) {
    try {
        if (closeModal && typeof window.closeExerciseSetsModal === 'function') window.closeExerciseSetsModal();
        if (typeof window.renderActiveLog === 'function') window.renderActiveLog();
        if (typeof window.renderWorkoutLog === 'function') window.renderWorkoutLog();
        if (reRenderSets && window.currentModalExIdx === exIdx && typeof window.renderExerciseSets === 'function') {
            window.renderExerciseSets();
        }
    } catch (e) { /* ignore */ }
}

function applyWarmupToCustom(item) {
    item.exercise = { id: 'CUSTOM_WARMUP', name: 'Custom Warmup', domain: 'warmup', muscle_group: 'full' };
    item.isCustomWarmup = true;
    item.note = 'Custom warmup (no prescribed parts)';
    item.sets = [{
        weight: 0, reps: 'Log when done', rpe: 0, completed: false, isText: true,
        partName: 'Custom Warmup', notes: 'Your own warmup — mark complete when finished.'
    }];
}

function applyStretchToCustom(item) {
    item.exercise = { id: 'CUSTOM_STRETCH', name: 'Custom Stretching', domain: 'mobility', muscle_group: 'full' };
    item.isCustomStretch = true;
    item.isStretchGroup = true;
    item.note = 'Your own stretching routine';
    item.sets = [{
        weight: 0, reps: 'Log when done', rpe: 0, completed: false, isText: true,
        partName: 'Custom Stretching', notes: 'Mark complete when finished.'
    }];
}

/** Three-way chooser for dismissing planned warmup / stretching. */
function showPrepDismissChooser({ kind, onChoice }) {
    const existing = document.getElementById('prep-dismiss-chooser');
    if (existing) existing.remove();

    const label = kind === 'warmup' ? 'warmup' : 'stretching';
    const overlay = document.createElement('div');
    overlay.id = 'prep-dismiss-chooser';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:100050;background:rgba(0,0,0,0.55);display:flex;align-items:flex-end;justify-content:center;padding:16px;';
    overlay.innerHTML = `
        <div class="stealth-panel" style="width:100%;max-width:390px;background:var(--bg-surface);padding:20px 16px 16px;border-radius:14px 14px 0 0;">
            <div style="font-size:13px;font-weight:800;color:var(--text-main);margin-bottom:6px;">Remove ${label}?</div>
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:14px;line-height:1.4;">Choose how you want to change this session.</div>
            <div style="display:flex;flex-direction:column;gap:8px;">
                <button type="button" data-prep-choice="session" class="btn-primary is-secondary" style="margin:0;">Remove for this workout only</button>
                <button type="button" data-prep-choice="custom" class="btn-primary is-secondary" style="margin:0;">Exchange permanently for custom ${label}</button>
                <button type="button" data-prep-choice="none" class="btn-primary is-secondary" style="margin:0;">Remove ${label} permanently</button>
                <button type="button" data-prep-choice="cancel" style="margin:8px 0 0;background:none;border:none;color:var(--text-stealth);font-size:12px;cursor:pointer;font-family:'Roboto Mono';">Cancel</button>
            </div>
        </div>`;
    const close = () => overlay.remove();
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
    });
    overlay.querySelectorAll('[data-prep-choice]').forEach(btn => {
        btn.addEventListener('click', () => {
            const choice = btn.getAttribute('data-prep-choice');
            close();
            if (choice && choice !== 'cancel' && typeof onChoice === 'function') onChoice(choice);
        });
    });
    document.body.appendChild(overlay);
}

export function dismissPlannedWarmupFromLog(exIdx) {
    const item = store.activeLog?.items?.[exIdx];
    if (!item || !item.isWarmupGroup) return;
    const ctx = item.prepContext || 'gym';

    showPrepDismissChooser({
        kind: 'warmup',
        onChoice: (choice) => {
            if (choice === 'session') {
                store.activeLog.items.splice(exIdx, 1);
                refreshPrepLogUi(exIdx, { closeModal: true });
                return;
            }
            if (choice === 'custom') {
                dismissWarmupToCustom(ctx);
                applyWarmupToCustom(item);
                refreshPrepLogUi(exIdx, { reRenderSets: true });
                alert('Custom warmup saved for this session type. Re-enable planned warmup in Settings → Algorithms.');
                return;
            }
            if (choice === 'none') {
                dismissWarmupToNone(ctx);
                store.activeLog.items.splice(exIdx, 1);
                refreshPrepLogUi(exIdx, { closeModal: true });
                alert('Warmup removed for this session type. Re-enable planned warmup in Settings → Algorithms.');
            }
        }
    });
}

export function dismissPlannedStretchFromLog(exIdx) {
    const item = store.activeLog?.items?.[exIdx];
    if (!item) return;
    const isStretch = !!(item.isStretchGroup || item.isCustomStretch
        || /stretch/i.test(item.exercise?.name || '')
        || /stretch/i.test(item.name || ''));
    if (!isStretch) return;

    const ctx = item.prepContext || 'gym';

    showPrepDismissChooser({
        kind: 'stretch',
        onChoice: (choice) => {
            if (choice === 'session') {
                store.activeLog.items.splice(exIdx, 1);
                refreshPrepLogUi(exIdx, { closeModal: true });
                return;
            }
            if (choice === 'custom') {
                dismissStretchToCustom(ctx);
                applyStretchToCustom(item);
                refreshPrepLogUi(exIdx, { reRenderSets: true });
                alert('Custom stretching saved for this session type. Re-enable planned stretching in Settings → Algorithms.');
                return;
            }
            if (choice === 'none') {
                dismissStretchToNone(ctx);
                store.activeLog.items.splice(exIdx, 1);
                refreshPrepLogUi(exIdx, { closeModal: true });
                alert('Stretching removed for this session type. Re-enable planned stretching in Settings → Algorithms.');
            }
        }
    });
}

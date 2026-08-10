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

/** Planned cool-down muscles that get separate Left → Right timer steps. */
export const UNILATERAL_COOLDOWN_STRETCHES = [
    'Pecs', 'Triceps', 'Hip flexor', 'Glute medius', 'QL', 'Wrists'
];

const UNILATERAL_SET = new Set(UNILATERAL_COOLDOWN_STRETCHES.map(s => s.toLowerCase()));

/** @typedef {'planned'|'custom'|'none'} PrepMode */

function defaultPrefs() {
    return {
        gymWarmup: 'planned',
        gymStretch: 'planned',
        practiceWarmup: 'planned',
        practiceStretch: 'planned',
        stretchHoldSeconds: 30,
        stretchGapSeconds: 5,
        stretchAdductorHoldSeconds: 45,
        bannedStretches: []
    };
}

function clampPositiveInt(value, fallback) {
    const n = Math.round(Number(value));
    return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function loadSessionPrepPrefs() {
    try {
        const raw = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null');
        const merged = { ...defaultPrefs(), ...(raw && typeof raw === 'object' ? raw : {}) };
        merged.stretchHoldSeconds = clampPositiveInt(merged.stretchHoldSeconds, 30) || 30;
        merged.stretchGapSeconds = clampPositiveInt(merged.stretchGapSeconds, 5);
        merged.stretchAdductorHoldSeconds = clampPositiveInt(merged.stretchAdductorHoldSeconds, 45) || 45;
        merged.bannedStretches = Array.isArray(merged.bannedStretches)
            ? merged.bannedStretches.map(s => String(s || '').trim()).filter(Boolean)
            : [];
        return merged;
    } catch (e) {
        return defaultPrefs();
    }
}

export function isUnilateralCooldownStretch(name) {
    return UNILATERAL_SET.has(String(name || '').toLowerCase());
}

export function getStretchHoldSeconds(muscleName) {
    const p = loadSessionPrepPrefs();
    if (/^adductors$/i.test(String(muscleName || ''))) {
        return Math.max(1, clampPositiveInt(p.stretchAdductorHoldSeconds, 45) || 45);
    }
    return Math.max(1, clampPositiveInt(p.stretchHoldSeconds, 30) || 30);
}

export function getStretchGapSeconds() {
    return clampPositiveInt(loadSessionPrepPrefs().stretchGapSeconds, 5);
}

export function isStretchBanned(name) {
    const key = String(name || '').trim().toLowerCase();
    if (!key) return false;
    return (loadSessionPrepPrefs().bannedStretches || [])
        .some(b => String(b).trim().toLowerCase() === key);
}

export function setStretchBanned(name, banned) {
    const label = String(name || '').trim();
    if (!label) return loadSessionPrepPrefs();
    const prefs = loadSessionPrepPrefs();
    const others = (prefs.bannedStretches || [])
        .filter(b => String(b).trim().toLowerCase() !== label.toLowerCase());
    if (banned) others.push(label);
    return saveSessionPrepPrefs({ bannedStretches: others });
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

function part(name, reps, notes, children = null, extra = null) {
    return { name, reps, notes, children, ...(extra && typeof extra === 'object' ? extra : {}) };
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
    const parts = [];
    for (const s of COOLDOWN_STRETCHES) {
        if (isStretchBanned(s)) continue;
        const hold = getStretchHoldSeconds(s);
        const holdLabel = `Hold ${hold}s`;
        if (isUnilateralCooldownStretch(s)) {
            parts.push(part(s, holdLabel, 'Teaching point video placeholder', null, {
                side: 'Left', baseName: s, holdSec: hold, unilateral: true
            }));
            parts.push(part(s, holdLabel, 'Teaching point video placeholder', null, {
                side: 'Right', baseName: s, holdSec: hold, unilateral: true
            }));
        } else {
            parts.push(part(s, holdLabel, 'Teaching point video placeholder', null, {
                baseName: s, holdSec: hold, unilateral: false
            }));
        }
    }
    return parts;
}

export function stretchPartDisplayLabel(partOrSet) {
    if (!partOrSet) return 'Stretch';
    const name = partOrSet.partName || partOrSet.name || 'Stretch';
    const side = partOrSet.side;
    return side ? `${name} · ${side}` : name;
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
    const partial = {
        gymWarmup: document.getElementById('set-gym-warmup')?.value || 'planned',
        gymStretch: document.getElementById('set-gym-stretch')?.value || 'planned',
        practiceWarmup: document.getElementById('set-practice-warmup')?.value || 'planned',
        practiceStretch: document.getElementById('set-practice-stretch')?.value || 'planned'
    };
    const holdEl = document.getElementById('set-stretch-hold-sec');
    const gapEl = document.getElementById('set-stretch-gap-sec');
    const addEl = document.getElementById('set-stretch-adductor-hold-sec');
    if (holdEl) partial.stretchHoldSeconds = clampPositiveInt(holdEl.value, 30) || 30;
    if (gapEl) partial.stretchGapSeconds = clampPositiveInt(gapEl.value, 5);
    if (addEl) partial.stretchAdductorHoldSeconds = clampPositiveInt(addEl.value, 45) || 45;

    const banInputs = document.querySelectorAll('[data-stretch-ban]');
    if (banInputs.length) {
        const banned = [];
        banInputs.forEach(el => {
            if (el instanceof HTMLInputElement && !el.checked) {
                const name = el.getAttribute('data-stretch-ban');
                if (name) banned.push(name);
            }
        });
        partial.bannedStretches = banned;
    }
    saveSessionPrepPrefs(partial);
}

/** Hydrate stretch timer + ban controls in Settings → Algorithms. */
export function hydrateStretchSettingsDom() {
    const prefs = loadSessionPrepPrefs();
    const setNum = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = String(val);
    };
    setNum('set-stretch-hold-sec', prefs.stretchHoldSeconds);
    setNum('set-stretch-gap-sec', prefs.stretchGapSeconds);
    setNum('set-stretch-adductor-hold-sec', prefs.stretchAdductorHoldSeconds);

    const host = document.getElementById('stretch-ban-list');
    if (!host) return;
    const banned = new Set((prefs.bannedStretches || []).map(s => String(s).toLowerCase()));
    host.innerHTML = COOLDOWN_STRETCHES.map(name => {
        const checked = banned.has(name.toLowerCase()) ? '' : ' checked';
        const sideNote = isUnilateralCooldownStretch(name) ? ' <span style="color:var(--text-stealth);">(L/R)</span>' : '';
        return `<label style="display:flex; align-items:center; gap:8px; font-size:11px; color:var(--text-silver); margin:0; font-weight:500; cursor:pointer;">
            <input type="checkbox" data-stretch-ban="${name.replace(/"/g, '&quot;')}"${checked} onchange="saveSessionPrepSettings()" style="accent-color:var(--gold-accent);">
            <span>${name}${sideNote}</span>
        </label>`;
    }).join('');
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

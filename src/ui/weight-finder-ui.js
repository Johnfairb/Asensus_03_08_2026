/**
 * First-time / bodyweight competency prompts before logging sets:
 * BW gate → work weight (0 kg allowed) or 10@5 RIR finder (+10%).
 */
import { store } from '../state/store.js';
import {
    applyHypertrophyWorkWeight,
    workWeightFromFinder
} from '../domain/hypertrophy-engine.js';
import {
    bwRepThreshold,
    isPressUpVariant,
    needsBwCompetencyAsk,
    recordBwCanDo,
    recordBwCannotDo,
    swapTargetFor
} from '../domain/bodyweight-lifts.js';
import { excludeBannedExercises } from '../domain/bans.js';

let _finderOpen = false;
let _finderExIdx = null;
let _openLogAfterFinder = false;

function ensureWeightFinderSheet() {
    let sheet = document.getElementById('weight-finder-sheet');
    if (sheet) return sheet;

    sheet = document.createElement('div');
    sheet.id = 'weight-finder-sheet';
    sheet.className = 'hidden detail-bottom-sheet';
    sheet.style.zIndex = '27000';
    sheet.onclick = (e) => {
        if (e.target === sheet) dismissWeightFinder();
    };
    sheet.innerHTML = `
        <div id="weight-finder-panel" class="detail-bottom-panel" onclick="event.stopPropagation()" style="max-height:85vh;">
            <div id="weight-finder-body"></div>
        </div>`;
    const root = document.querySelector('.iphone-screen') || document.body;
    root.appendChild(sheet);
    return sheet;
}

function exerciseItem(exIdx) {
    return store.activeLog?.items?.[exIdx] || null;
}

function exerciseNameForIdx(exIdx) {
    return exerciseItem(exIdx)?.exercise?.name || 'this exercise';
}

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function showError(msg) {
    const el = document.getElementById('weight-finder-error');
    if (!el) return;
    el.style.display = 'block';
    el.textContent = msg;
}

function refreshSetsUi() {
    try {
        if (typeof window.renderExerciseSets === 'function') window.renderExerciseSets();
    } catch (e) { /* ignore */ }
    try {
        if (typeof window.renderActiveLog === 'function') window.renderActiveLog();
    } catch (e) { /* ignore */ }
}

function resolveDbExercise(name) {
    const pool = excludeBannedExercises(store.globalExerciseDB || []);
    const lower = String(name || '').toLowerCase();
    return pool.find(e => String(e.name).toLowerCase() === lower)
        || (store.globalExerciseDB || []).find(e => String(e.name).toLowerCase() === lower)
        || { id: 'TMP_' + Date.now(), name, domain: 'strength', muscle_group: 'custom' };
}

function renderBwCompetencyQuestion(exIdx) {
    const body = document.getElementById('weight-finder-body');
    if (!body) return;
    const name = exerciseNameForIdx(exIdx);
    const n = bwRepThreshold();
    body.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:12px;">
            <div>
                <div style="font-family:'Roboto Mono',monospace; font-size:10px; color:var(--gold-accent); font-weight:800; letter-spacing:0.6px; text-transform:uppercase; margin-bottom:6px;">Bodyweight check</div>
                <div style="font-size:16px; font-weight:800; color:var(--text-main); line-height:1.35;">Can you do ${n} bodyweight reps of ${escapeHtml(name)}?</div>
            </div>
            <button type="button" onclick="dismissWeightFinder()" style="background:none; border:none; color:var(--text-stealth); font-size:24px; cursor:pointer; line-height:1; padding:0;" aria-label="Close">&times;</button>
        </div>
        <p style="font-size:13px; color:var(--text-silver); line-height:1.5; margin:0 0 18px;">
            If not, we’ll swap this lift for the rest of the calendar month and ask again next month.
        </p>
        <div style="display:flex; flex-direction:column; gap:8px;">
            <button type="button" class="btn-primary is-primary" style="margin:0;" onclick="confirmBwGateYes()">Yes</button>
            <button type="button" class="btn-primary is-secondary" style="margin:0;" onclick="confirmBwGateNo()">No — swap for this month</button>
        </div>`;
}

function renderKnowWeightQuestion(exIdx) {
    const body = document.getElementById('weight-finder-body');
    if (!body) return;
    const name = exerciseNameForIdx(exIdx);
    body.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:12px;">
            <div>
                <div style="font-family:'Roboto Mono',monospace; font-size:10px; color:var(--gold-accent); font-weight:800; letter-spacing:0.6px; text-transform:uppercase; margin-bottom:6px;">First time on this exercise</div>
                <div style="font-size:16px; font-weight:800; color:var(--text-main); line-height:1.35;">Do you know what weight to use for ${escapeHtml(name)}?</div>
            </div>
            <button type="button" onclick="dismissWeightFinder()" style="background:none; border:none; color:var(--text-stealth); font-size:24px; cursor:pointer; line-height:1; padding:0;" aria-label="Close">&times;</button>
        </div>
        <p style="font-size:13px; color:var(--text-silver); line-height:1.5; margin:0 0 18px;">
            You haven't logged this exercise before. Set a work weight now (before logging sets), or find a starting load with 10 reps @ 5 RIR. Bodyweight is allowed (0 kg).
        </p>
        <div style="display:flex; flex-direction:column; gap:8px;">
            <button type="button" class="btn-primary is-primary" style="margin:0;" onclick="confirmWeightFinderKnowsYes()">Yes — I know the weight</button>
            <button type="button" class="btn-primary is-secondary" style="margin:0;" onclick="confirmWeightFinderKnowsNo()">No — help me find it</button>
        </div>`;
}

function renderKnownWeightEntry(exIdx) {
    const body = document.getElementById('weight-finder-body');
    if (!body) return;
    const name = exerciseNameForIdx(exIdx);
    body.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:12px;">
            <div>
                <div style="font-family:'Roboto Mono',monospace; font-size:10px; color:var(--gold-accent); font-weight:800; letter-spacing:0.6px; text-transform:uppercase; margin-bottom:6px;">Work weight</div>
                <div style="font-size:16px; font-weight:800; color:var(--text-main); line-height:1.35;">Enter your work weight for ${escapeHtml(name)}</div>
            </div>
            <button type="button" onclick="dismissWeightFinder()" style="background:none; border:none; color:var(--text-stealth); font-size:24px; cursor:pointer; line-height:1; padding:0;" aria-label="Close">&times;</button>
        </div>
        <p style="font-size:13px; color:var(--text-silver); line-height:1.5; margin:0 0 14px;">
            Use the load you plan to work with. Enter <strong style="color:var(--text-main);">0</strong> for pure bodyweight.
        </p>
        <label style="display:block; font-size:11px; color:var(--text-muted); font-family:'Roboto Mono',monospace; margin-bottom:6px;">WEIGHT (KG)</label>
        <input id="weight-finder-input" type="number" inputmode="decimal" min="0" step="0.5" placeholder="e.g. 60"
            style="width:100%; box-sizing:border-box; padding:12px; border-radius:8px; border:1px solid var(--border-subtle); background:rgba(255,255,255,0.04); color:var(--text-main); font-size:16px; font-weight:700; margin-bottom:8px;" />
        <div id="weight-finder-error" style="display:none; font-size:12px; color:#ff6b6b; margin-bottom:10px;"></div>
        <div style="display:flex; flex-direction:column; gap:8px; margin-top:10px;">
            <button type="button" class="btn-primary is-primary" style="margin:0;" onclick="submitKnownWorkWeight()">Set work weight</button>
            <button type="button" class="btn-primary is-secondary" style="margin:0;" onclick="confirmWeightFinderKnowsNo()">Actually, help me find it</button>
        </div>`;
    setTimeout(() => document.getElementById('weight-finder-input')?.focus(), 50);
}

function renderFinderEntry(exIdx) {
    const body = document.getElementById('weight-finder-body');
    if (!body) return;
    const name = exerciseNameForIdx(exIdx);
    body.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:12px;">
            <div>
                <div style="font-family:'Roboto Mono',monospace; font-size:10px; color:var(--gold-accent); font-weight:800; letter-spacing:0.6px; text-transform:uppercase; margin-bottom:6px;">Find a starting load</div>
                <div style="font-size:16px; font-weight:800; color:var(--text-main); line-height:1.35;">${escapeHtml(name)}</div>
            </div>
            <button type="button" onclick="dismissWeightFinder()" style="background:none; border:none; color:var(--text-stealth); font-size:24px; cursor:pointer; line-height:1; padding:0;" aria-label="Close">&times;</button>
        </div>
        <p style="font-size:13px; color:var(--text-silver); line-height:1.5; margin:0 0 14px;">
            Warm up, then find a weight you can do for <strong style="color:var(--text-main);">10 reps with 5 reps in reserve</strong> (RIR 5). Enter that finder weight below. Work weight will be set <strong style="color:var(--text-main);">10% higher</strong>.
        </p>
        <label style="display:block; font-size:11px; color:var(--text-muted); font-family:'Roboto Mono',monospace; margin-bottom:6px;">FINDER WEIGHT — 10 REPS @ 5 RIR (KG)</label>
        <input id="weight-finder-input" type="number" inputmode="decimal" min="0" step="0.5" placeholder="e.g. 50"
            style="width:100%; box-sizing:border-box; padding:12px; border-radius:8px; border:1px solid var(--border-subtle); background:rgba(255,255,255,0.04); color:var(--text-main); font-size:16px; font-weight:700; margin-bottom:8px;" />
        <div id="weight-finder-preview" style="font-size:12px; color:var(--gold-accent); font-family:'Roboto Mono',monospace; margin-bottom:8px; min-height:16px;"></div>
        <div id="weight-finder-error" style="display:none; font-size:12px; color:#ff6b6b; margin-bottom:10px;"></div>
        <div style="display:flex; flex-direction:column; gap:8px; margin-top:10px;">
            <button type="button" class="btn-primary is-primary" style="margin:0;" onclick="submitFinderWorkWeight()">Set work weight (+10%)</button>
            <button type="button" class="btn-primary is-secondary" style="margin:0;" onclick="confirmWeightFinderKnowsYes()">I know the work weight</button>
        </div>`;
    const input = document.getElementById('weight-finder-input');
    if (input) {
        input.addEventListener('input', updateFinderPreview);
        setTimeout(() => input.focus(), 50);
    }
}

function updateFinderPreview() {
    const preview = document.getElementById('weight-finder-preview');
    const input = document.getElementById('weight-finder-input');
    if (!preview || !input) return;
    const exIdx = _finderExIdx;
    const name = exerciseNameForIdx(exIdx);
    const finder = parseFloat(input.value);
    if (!Number.isFinite(finder) || finder < 0) {
        preview.textContent = '';
        return;
    }
    if (finder === 0) {
        preview.textContent = 'Work weight → 0 kg (bodyweight)';
        return;
    }
    const work = workWeightFromFinder(finder, name);
    preview.textContent = `Work weight → ${work} kg`;
}

function openSheet(exIdx, renderFn) {
    _finderExIdx = exIdx;
    const sheet = ensureWeightFinderSheet();
    renderFn(exIdx);
    sheet.classList.remove('hidden');
    _finderOpen = true;
}

/** Open prompt before the sets log (BW gate and/or first-time weight). */
export function maybePromptWeightFinder(exIdx, opts = {}) {
    const item = exerciseItem(exIdx);
    if (!item) return false;
    if (item.isWarmupGroup || item.isLactateHit) return false;
    const domain = (item.exercise?.domain || '').toLowerCase();
    if (domain === 'cardio' || domain === 'warmup') return false;
    if (_finderOpen) return true;

    const name = item.exercise?.name || '';
    const needsBw = !item.bwGateResolved && (item.needsBwGate || needsBwCompetencyAsk(name));
    const needsWeight = !item.weightFinderResolved && !!item.needsWeightFind;

    if (!needsBw && !needsWeight) return false;

    _openLogAfterFinder = !!opts.openLogAfter;
    if (needsBw) {
        openSheet(exIdx, renderBwCompetencyQuestion);
        return true;
    }
    openSheet(exIdx, renderKnowWeightQuestion);
    return true;
}

export function confirmBwGateYes() {
    const exIdx = _finderExIdx;
    const item = exerciseItem(exIdx);
    if (!item) {
        dismissWeightFinder();
        return;
    }
    const name = item.exercise?.name || '';
    recordBwCanDo(name);
    item.needsBwGate = false;
    item.bwGateResolved = true;

    // Press-ups: no added weight — apply 0 kg and open log
    if (isPressUpVariant(name)) {
        applyHypertrophyWorkWeight(item, 0);
        item.needsWeightFind = false;
        finishWeightFinderAndMaybeOpenLog();
        return;
    }

    // Other BW lifts: ask for work weight (0 allowed)
    item.needsWeightFind = true;
    item.weightFinderResolved = false;
    renderKnownWeightEntry(exIdx);
}

export function confirmBwGateNo() {
    const exIdx = _finderExIdx;
    const item = exerciseItem(exIdx);
    if (!item) {
        dismissWeightFinder();
        return;
    }
    const original = item.exercise?.name || '';
    const swapName = recordBwCannotDo(original, swapTargetFor(original));
    const swapped = resolveDbExercise(swapName);
    item.exercise = { ...swapped };
    item.note = ((item.note || '') + ` Swapped from ${original} (bodyweight competency) for this month.`).trim();
    item.needsBwGate = false;
    item.bwGateResolved = true;
    item.needsWeightFind = true;
    item.weightFinderResolved = false;
    const workSets = (item.sets || []).filter(s => s && !s.isWarmup && !s.isText);
    const planned = typeof item.plannedSets === 'number' ? item.plannedSets : Math.max(3, workSets.length || 3);
    const reps = workSets[0]?.reps || 10;
    const rest = workSets[0]?.restTime != null ? workSets[0].restTime : 90;
    item.sets = Array.from({ length: planned }, () => ({
        weight: 0, reps, rpe: 4, completed: false, restTime: rest, isWarmup: false
    }));
    renderKnowWeightQuestion(exIdx);
    refreshSetsUi();
}

export function confirmWeightFinderKnowsYes() {
    if (_finderExIdx == null) return;
    renderKnownWeightEntry(_finderExIdx);
}

export function confirmWeightFinderKnowsNo() {
    if (_finderExIdx == null) return;
    renderFinderEntry(_finderExIdx);
}

export function submitKnownWorkWeight() {
    const input = document.getElementById('weight-finder-input');
    const kg = parseFloat(input?.value);
    if (!Number.isFinite(kg) || kg < 0) {
        showError('Enter a weight of 0 or more.');
        return;
    }
    const item = exerciseItem(_finderExIdx);
    if (!item) {
        dismissWeightFinder();
        return;
    }
    const applied = applyHypertrophyWorkWeight(item, kg);
    if (applied < 0) {
        showError('Could not apply that weight.');
        return;
    }
    finishWeightFinderAndMaybeOpenLog();
}

export function submitFinderWorkWeight() {
    const input = document.getElementById('weight-finder-input');
    const finder = parseFloat(input?.value);
    if (!Number.isFinite(finder) || finder < 0) {
        showError('Enter the finder weight (0 or more).');
        return;
    }
    const item = exerciseItem(_finderExIdx);
    if (!item) {
        dismissWeightFinder();
        return;
    }
    const work = finder === 0 ? 0 : workWeightFromFinder(finder, item.exercise?.name || '');
    const applied = applyHypertrophyWorkWeight(item, work);
    if (applied < 0) {
        showError('Could not apply that weight.');
        return;
    }
    item.finderWeightKg = finder;
    finishWeightFinderAndMaybeOpenLog();
}

function finishWeightFinderAndMaybeOpenLog() {
    const exIdx = _finderExIdx;
    const openAfter = _openLogAfterFinder;
    dismissWeightFinder();
    refreshSetsUi();
    if (openAfter && exIdx != null && typeof window.openExerciseSetsModal === 'function') {
        window.openExerciseSetsModal(exIdx);
    }
}

export function dismissWeightFinder() {
    const sheet = document.getElementById('weight-finder-sheet');
    if (sheet) sheet.classList.add('hidden');
    _finderOpen = false;
    _finderExIdx = null;
    _openLogAfterFinder = false;
}

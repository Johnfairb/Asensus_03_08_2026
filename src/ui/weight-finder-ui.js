/**
 * First-time hypertrophy weight prompt:
 * know the load? → enter work weight
 * otherwise → find 10 reps @ 5 RIR, then work = +10%
 */
import { store } from '../state/store.js';
import {
    applyHypertrophyWorkWeight,
    workWeightFromFinder
} from '../domain/hypertrophy-engine.js';

let _finderOpen = false;
let _finderExIdx = null;

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

function exerciseNameForIdx(exIdx) {
    return store.activeLog?.items?.[exIdx]?.exercise?.name || 'this exercise';
}

function renderKnowWeightQuestion(exIdx) {
    const body = document.getElementById('weight-finder-body');
    if (!body) return;
    const name = exerciseNameForIdx(exIdx);
    body.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:12px;">
            <div>
                <div style="font-family:'Roboto Mono',monospace; font-size:10px; color:var(--gold-accent); font-weight:800; letter-spacing:0.6px; text-transform:uppercase; margin-bottom:6px;">First time</div>
                <div style="font-size:16px; font-weight:800; color:var(--text-main); line-height:1.35;">Do you know what weight to use for ${escapeHtml(name)}?</div>
            </div>
            <button type="button" onclick="dismissWeightFinder()" style="background:none; border:none; color:var(--text-stealth); font-size:24px; cursor:pointer; line-height:1; padding:0;" aria-label="Close">&times;</button>
        </div>
        <p style="font-size:13px; color:var(--text-silver); line-height:1.5; margin:0 0 18px;">
            This is your first logged session on this lift. We can set the hypertrophy work weight from what you already know, or help you find a starting load.
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
            Use the load you plan to work with for your hypertrophy sets (usually ~10 reps with a few reps in reserve).
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
            Warm up, then find a weight you can do for <strong style="color:var(--text-main);">10 reps with 5 reps in reserve</strong> (RIR 5 — it should feel clearly submaximal). Enter that finder weight below. Your hypertrophy work weight will be set <strong style="color:var(--text-main);">10% higher</strong>.
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
    if (!Number.isFinite(finder) || finder <= 0) {
        preview.textContent = '';
        return;
    }
    const work = workWeightFromFinder(finder, name);
    preview.textContent = `Work weight → ${work} kg`;
}

function showError(msg) {
    const el = document.getElementById('weight-finder-error');
    if (!el) return;
    el.style.display = 'block';
    el.textContent = msg;
}

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function refreshSetsUi() {
    try {
        if (typeof window.renderExerciseSets === 'function') window.renderExerciseSets();
    } catch (e) { /* ignore */ }
    try {
        if (typeof window.renderActiveLog === 'function') window.renderActiveLog();
    } catch (e) { /* ignore */ }
}

/** Open prompt when opening sets for a first-time hypertrophy lift. */
export function maybePromptWeightFinder(exIdx) {
    const item = store.activeLog?.items?.[exIdx];
    if (!item || item.weightFinderResolved || !item.needsWeightFind) return false;
    if (item.isWarmupGroup || item.isLactateHit) return false;
    const domain = (item.exercise?.domain || '').toLowerCase();
    if (domain === 'cardio' || domain === 'warmup') return false;
    if (_finderOpen) return true;

    _finderExIdx = exIdx;
    const sheet = ensureWeightFinderSheet();
    renderKnowWeightQuestion(exIdx);
    sheet.classList.remove('hidden');
    _finderOpen = true;
    return true;
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
    if (!Number.isFinite(kg) || kg <= 0) {
        showError('Enter a weight greater than 0.');
        return;
    }
    const item = store.activeLog?.items?.[_finderExIdx];
    if (!item) {
        dismissWeightFinder();
        return;
    }
    const applied = applyHypertrophyWorkWeight(item, kg);
    if (applied <= 0) {
        showError('Could not apply that weight.');
        return;
    }
    dismissWeightFinder();
    refreshSetsUi();
}

export function submitFinderWorkWeight() {
    const input = document.getElementById('weight-finder-input');
    const finder = parseFloat(input?.value);
    if (!Number.isFinite(finder) || finder <= 0) {
        showError('Enter the finder weight greater than 0.');
        return;
    }
    const item = store.activeLog?.items?.[_finderExIdx];
    if (!item) {
        dismissWeightFinder();
        return;
    }
    const work = workWeightFromFinder(finder, item.exercise?.name || '');
    const applied = applyHypertrophyWorkWeight(item, work);
    if (applied <= 0) {
        showError('Could not apply that weight.');
        return;
    }
    item.finderWeightKg = finder;
    dismissWeightFinder();
    refreshSetsUi();
}

export function dismissWeightFinder() {
    const sheet = document.getElementById('weight-finder-sheet');
    if (sheet) sheet.classList.add('hidden');
    _finderOpen = false;
    _finderExIdx = null;
}

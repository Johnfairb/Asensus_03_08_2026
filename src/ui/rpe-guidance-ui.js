/**
 * RPE awareness prompt + open Guidance tab helpers.
 */
import {
    buildRpeScaleHtml,
    hasAcknowledgedRpeScale,
    markRpeScaleAcknowledged,
    renderRpeGuidancePanel
} from '../domain/rpe-guidance.js';

let _awarenessOpen = false;
let _pendingAfterAware = null;

function ensureRpeAwarenessSheet() {
    let sheet = document.getElementById('rpe-awareness-sheet');
    if (sheet) return sheet;

    sheet = document.createElement('div');
    sheet.id = 'rpe-awareness-sheet';
    sheet.className = 'hidden detail-bottom-sheet';
    sheet.style.zIndex = '27000';
    sheet.onclick = (e) => {
        if (e.target === sheet) dismissRpeAwareness({ acknowledge: false });
    };
    sheet.innerHTML = `
        <div id="rpe-awareness-panel" class="detail-bottom-panel" onclick="event.stopPropagation()" style="max-height:85vh;">
            <div id="rpe-awareness-body"></div>
        </div>`;
    const root = document.querySelector('.iphone-screen') || document.body;
    root.appendChild(sheet);
    return sheet;
}

function renderAwarenessQuestion() {
    const body = document.getElementById('rpe-awareness-body');
    if (!body) return;
    body.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:12px;">
            <div>
                <div style="font-family:'Roboto Mono',monospace; font-size:10px; color:var(--gold-accent); font-weight:800; letter-spacing:0.6px; text-transform:uppercase; margin-bottom:6px;">Before you rate</div>
                <div style="font-size:16px; font-weight:800; color:var(--text-main); line-height:1.35;">Are you familiar with how the RPE scale works?</div>
            </div>
            <button type="button" onclick="dismissRpeAwareness()" style="background:none; border:none; color:var(--text-stealth); font-size:24px; cursor:pointer; line-height:1; padding:0;" aria-label="Close">&times;</button>
        </div>
        <p style="font-size:13px; color:var(--text-silver); line-height:1.5; margin:0 0 18px;">
            RPE (Rate of Perceived Exertion) is a 1–10 score for how hard the session felt. Accurate ratings improve sleep targets and recovery planning.
        </p>
        <div style="display:flex; flex-direction:column; gap:8px;">
            <button type="button" class="btn-primary is-primary" style="margin:0;" onclick="confirmRpeAwarenessYes()">Yes, I know the scale</button>
            <button type="button" class="btn-primary is-secondary" style="margin:0;" onclick="confirmRpeAwarenessNo()">No — show me the guide</button>
        </div>`;
}

function renderAwarenessGuideInline() {
    const body = document.getElementById('rpe-awareness-body');
    if (!body) return;
    body.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:10px;">
            <div>
                <div style="font-family:'Roboto Mono',monospace; font-size:10px; color:var(--gold-accent); font-weight:800; letter-spacing:0.6px; text-transform:uppercase; margin-bottom:6px;">RPE guide</div>
                <div style="font-size:16px; font-weight:800; color:var(--text-main);">How to rate effort</div>
            </div>
            <button type="button" onclick="dismissRpeAwareness()" style="background:none; border:none; color:var(--text-stealth); font-size:24px; cursor:pointer; line-height:1; padding:0;" aria-label="Close">&times;</button>
        </div>
        <p style="font-size:12px; color:var(--text-silver); line-height:1.45; margin:0 0 8px;">
            Use speech and breathing as your cues. You can revisit this anytime under Exercise → Guidance.
        </p>
        <div style="max-height:48vh; overflow-y:auto; margin-bottom:14px; padding-right:2px;">
            ${buildRpeScaleHtml({ compact: true })}
        </div>
        <div style="display:flex; flex-direction:column; gap:8px;">
            <button type="button" class="btn-primary is-primary" style="margin:0;" onclick="finishRpeGuideAndContinue()">Got it — continue</button>
            <button type="button" class="btn-primary is-secondary" style="margin:0;" onclick="openRpeGuidanceTab()">Open Guidance tab</button>
        </div>`;
}

/** Show first-time RPE awareness when an RPE field is about to appear. */
export function maybePromptRpeAwareness(opts = {}) {
    if (hasAcknowledgedRpeScale()) return false;
    if (_awarenessOpen) return true;
    _pendingAfterAware = typeof opts.onContinue === 'function' ? opts.onContinue : null;
    const sheet = ensureRpeAwarenessSheet();
    renderAwarenessQuestion();
    sheet.classList.remove('hidden');
    _awarenessOpen = true;
    return true;
}

export function confirmRpeAwarenessYes() {
    markRpeScaleAcknowledged();
    dismissRpeAwareness({ acknowledge: true, runContinue: true });
}

export function confirmRpeAwarenessNo() {
    // Show the guide immediately; mark aware once they finish
    renderAwarenessGuideInline();
}

export function finishRpeGuideAndContinue() {
    markRpeScaleAcknowledged();
    dismissRpeAwareness({ acknowledge: true, runContinue: true });
}

export function dismissRpeAwareness(opts = {}) {
    const sheet = document.getElementById('rpe-awareness-sheet');
    if (sheet) sheet.classList.add('hidden');
    _awarenessOpen = false;
    if (opts.acknowledge) markRpeScaleAcknowledged();
    const cb = _pendingAfterAware;
    _pendingAfterAware = null;
    if (opts.runContinue && typeof cb === 'function') {
        try { cb(); } catch (e) { /* ignore */ }
    }
}

/** Navigate to Exercise → Guidance. */
export function openRpeGuidanceTab() {
    markRpeScaleAcknowledged();
    dismissRpeAwareness({ acknowledge: true, runContinue: false });
    try {
        // Close diary so the Guidance tab is visible
        if (typeof window.dismissJournalModal === 'function') window.dismissJournalModal();
    } catch (e) { /* ignore */ }
    try {
        document.getElementById('header-title').innerText = 'Exercise';
        document.querySelectorAll('.tab-content').forEach(tab => tab.classList.add('hidden'));
        document.getElementById('tab-drive')?.classList.remove('hidden');
        document.querySelectorAll('#main-nav .nav-item, .btn-icon').forEach(item => item.classList.remove('active'));
        const driveNav = document.querySelector('#main-nav .nav-item[onclick*="drive"]');
        if (driveNav) driveNav.classList.add('active');
        if (typeof window.switchDriveSubTab === 'function') window.switchDriveSubTab('guidance');
    } catch (e) {
        console.warn(e);
    }
    renderRpeGuidancePanel();
}

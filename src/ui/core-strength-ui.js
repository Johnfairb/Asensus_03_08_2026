/**
 * First-time (and settings) core strength rating UI.
 */
import { store } from '../state/store.js';
import {
    CORE_STRENGTH_LEVELS,
    hasCoreStrengthRating,
    setCoreStrengthLevel
} from '../domain/core-programming.js';
import { refreshCoreExercisesInMonthPlan } from '../domain/strength-engine.js';

function glassRoot() {
    return document.querySelector('.iphone-screen') || document.body;
}

function escapeHtml(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/"/g, '&quot;');
}

export function ensureCoreStrengthModal() {
    let modal = document.getElementById('core-strength-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'core-strength-modal';
        glassRoot().appendChild(modal);
    }
    modal.className = 'hidden';
    modal.style.cssText = 'position:fixed; inset:0; z-index:22000; display:flex; justify-content:center; align-items:flex-end; padding:16px; box-sizing:border-box; background:rgba(0,0,0,0.45);';
    modal.innerHTML = `
        <div class="modal-content stealth-panel" style="width:100%; max-width:390px; max-height:min(88%, calc(100% - 48px)); overflow:auto; background:var(--bg-surface); padding:18px 16px 16px; border-radius:16px 16px 12px 12px; box-sizing:border-box;" onclick="event.stopPropagation()">
            <div style="font-family:'Roboto Mono', monospace; font-size:10px; color:var(--gold-accent); font-weight:800; text-transform:uppercase; letter-spacing:1px; margin-bottom:8px;">Core programming</div>
            <h2 style="color:var(--text-main); margin:0 0 8px 0; font-family:'Roboto Mono', monospace; letter-spacing:1px; text-transform:uppercase; font-size:15px;">Rate your core strength</h2>
            <p style="font-size:12px; color:var(--text-muted); margin:0 0 16px 0; line-height:1.45;">This sets which core exercises appear in your monthly strength circuit. You can change it later in Settings.</p>
            <div id="core-strength-options" style="display:flex; flex-direction:column; gap:8px;"></div>
        </div>
    `;
    return modal;
}

/**
 * Show the core strength picker. Resolves true if a level was saved, false if dismissed without rating.
 * @returns {Promise<boolean>}
 */
export function promptCoreStrengthRating() {
    if (hasCoreStrengthRating()) return Promise.resolve(true);

    return new Promise((resolve) => {
        const modal = ensureCoreStrengthModal();
        const list = document.getElementById('core-strength-options');
        if (!list) {
            resolve(false);
            return;
        }

        const finish = (level) => {
            if (!setCoreStrengthLevel(level)) {
                resolve(false);
                return;
            }
            try {
                localStorage.setItem('ascensus_settings', JSON.stringify(store.userConfig));
            } catch (e) { /* ignore */ }
            try {
                refreshCoreExercisesInMonthPlan();
            } catch (e) { /* ignore */ }
            const sel = document.getElementById('set-core-strength');
            if (sel) sel.value = store.userConfig.coreStrength;
            modal.classList.add('hidden');
            resolve(true);
        };

        list.innerHTML = CORE_STRENGTH_LEVELS.map((level) => `
            <button type="button" data-core-level="${escapeHtml(level)}"
                style="width:100%; text-align:left; padding:14px 12px; border-radius:10px; border:1px solid var(--border-highlight); background:var(--bg-surface-elevated); color:var(--text-main); cursor:pointer;">
                <div style="font-size:13px; font-weight:800;">${escapeHtml(level)}</div>
                <div style="font-size:10px; color:var(--text-muted); margin-top:4px; font-family:'Roboto Mono';">
                    ${level === 'Beginner' ? 'Beginner core exercises only'
                        : level === 'Intermediate' ? '3 beginner + 2 intermediate'
                        : 'Mix of advanced, intermediate, and beginner'}
                </div>
            </button>
        `).join('');

        list.querySelectorAll('[data-core-level]').forEach((btn) => {
            btn.onclick = () => finish(btn.getAttribute('data-core-level'));
        });

        modal.onclick = (e) => {
            if (e.target === modal) {
                // Require a choice on first implementation — do not dismiss without rating
            }
        };

        modal.classList.remove('hidden');
    });
}

/** Settings select change: persist + refresh monthly core picks. */
export function onCoreStrengthSettingChange() {
    const sel = document.getElementById('set-core-strength');
    if (!sel || !sel.value) return;
    if (!setCoreStrengthLevel(sel.value)) return;
    try {
        localStorage.setItem('ascensus_settings', JSON.stringify(store.userConfig));
    } catch (e) { /* ignore */ }
    try {
        refreshCoreExercisesInMonthPlan();
    } catch (e) { /* ignore */ }
}

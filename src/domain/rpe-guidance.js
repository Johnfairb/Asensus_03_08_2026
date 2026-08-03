/**
 * RPE scale guidance + first-time awareness prompt.
 */
const RPE_AWARE_KEY = 'ascensus_rpe_scale_aware';

/** Official Ascensus RPE descriptors (1–10). */
export const RPE_SCALE = [
    { score: 10, title: 'Maximum effort', body: 'Unable to talk, feels impossible to continue at the given pace.' },
    { score: 9, title: 'Very hard', body: 'Difficult to speak more than one word; can barely breathe.' },
    { score: 8, title: 'Very hard', body: 'Can speak very short sentences; struggle breathing.' },
    { score: 7, title: 'Vigorous', body: 'Can speak a sentence but nothing more; uncomfortable; beginning to sweat a lot.' },
    { score: 6, title: 'Moderate', body: 'Moderate sweating; can maintain a conversation but with difficulty.' },
    { score: 5, title: 'Moderate', body: 'Light sweating; can maintain a conversation with only slight difficulty.' },
    { score: 4, title: 'Moderate', body: 'Pulse raising, with a small feeling of heat.' },
    { score: 3, title: 'Light', body: 'Very slightly out of breath but very comfortable.' },
    { score: 2, title: 'Very light', body: 'Very little difficulty speaking or breathing; very light exercise.' },
    { score: 1, title: 'Rest', body: 'Barely exercising at all.' }
];

export function hasAcknowledgedRpeScale() {
    try {
        return localStorage.getItem(RPE_AWARE_KEY) === '1';
    } catch (e) {
        return false;
    }
}

export function markRpeScaleAcknowledged() {
    try {
        localStorage.setItem(RPE_AWARE_KEY, '1');
    } catch (e) { /* ignore */ }
}

export function buildRpeScaleHtml({ compact = false } = {}) {
    const rows = RPE_SCALE.map(({ score, title, body }) => `
        <div class="rpe-guide-row" style="display:flex; gap:12px; align-items:flex-start; padding:${compact ? '10px 0' : '12px 0'}; border-bottom:1px solid var(--border-subtle);">
            <div style="flex-shrink:0; width:36px; height:36px; border-radius:10px; background:rgba(212,175,55,0.12); border:1px solid rgba(212,175,55,0.35); display:flex; align-items:center; justify-content:center; font-family:'Roboto Mono',monospace; font-weight:800; font-size:14px; color:var(--gold-accent);">${score}</div>
            <div style="min-width:0; flex:1;">
                <div style="font-size:13px; font-weight:700; color:var(--text-main); margin-bottom:4px;">RPE ${score} · ${title}</div>
                <div style="font-size:12px; color:var(--text-silver); line-height:1.45;">${body}</div>
            </div>
        </div>`).join('');
    return `<div class="rpe-guide-list">${rows}</div>`;
}

export function renderRpeGuidancePanel() {
    const host = document.getElementById('rpe-guidance-content');
    if (!host) return;
    host.innerHTML = `
        <div style="margin-bottom:16px;">
            <div style="font-family:'Roboto Mono',monospace; font-size:10px; color:var(--gold-accent); font-weight:800; letter-spacing:0.6px; text-transform:uppercase; margin-bottom:8px;">Session effort</div>
            <h2 style="margin:0 0 8px; font-size:18px; color:var(--text-main);">RPE scale</h2>
            <p style="margin:0; font-size:13px; color:var(--text-silver); line-height:1.5;">
                Rate of Perceived Exertion (1–10) is how hard the work felt. Use breathing and speech as your guide — not ego.
            </p>
        </div>
        ${buildRpeScaleHtml()}`;
}

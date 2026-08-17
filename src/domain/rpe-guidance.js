/**
 * Exercise Guidance tab — RPE scale + training term explainers.
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

/** Topic cards under Exercise → Guidance (accordion, same pattern as shopping / My Foods). */
export const GUIDANCE_TOPICS = [
    {
        id: 'rpe',
        label: 'RPE SCALE',
        intro: 'Rate of Perceived Exertion (1–10) is how hard the work felt. Use breathing and speech as your guide — not ego.',
        kind: 'rpe'
    },
    {
        id: 'lactate',
        label: 'LACTATE / HIT',
        body: 'A Lactate/HIT session is geared around improving the athlete’s anaerobic cardio. Improving anaerobic cardio allows the athlete to perform high-intensity activity for longer periods of time.'
    },
    {
        id: 'steady',
        label: 'STEADY STATE',
        body: 'Steady state cardio trains the body’s aerobic cardio. This gives the athlete a better baseline for anaerobic cardio and improves their ability to maintain low intensity for long periods of time.'
    },
    {
        id: 'hypertrophy',
        label: 'HYPERTROPHY',
        body: 'This is training based around increasing the size of the muscles. This will also provide strength gains, however not as much as strength training.'
    },
    {
        id: 'rir',
        label: 'RIR',
        body: 'Reps in reserve (RIR) is how many more reps you could have completed after the set. 0 RIR means you failed on the last rep. 1 RIR means you would have failed on the next rep. For strength work, aim for about 2 RIR. For hypertrophy, 0 or 1 RIR is ideal.'
    }
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

function escapeHtml(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function buildTopicAccordionHtml(topic) {
    const panelBody = topic.kind === 'rpe'
        ? `<p style="margin:12px 0 8px; font-size:13px; color:var(--text-silver); line-height:1.55;">${escapeHtml(topic.intro || '')}</p>${buildRpeScaleHtml()}`
        : `<p style="margin:12px 0 4px; font-size:13px; color:var(--text-silver); line-height:1.55;">${escapeHtml(topic.body)}</p>`;
    return `
        <div class="card grocery-aisle-card rpe-guidance-card" style="margin-bottom:12px;">
            <button type="button" id="guidance-header-${topic.id}" class="grocery-aisle-header" aria-expanded="false" onclick="toggleGuidanceSection('${topic.id}')">
                <strong>${escapeHtml(topic.label)}</strong>
                <span id="guidance-chevron-${topic.id}" class="grocery-aisle-chevron">+</span>
            </button>
            <div id="guidance-panel-${topic.id}" class="grocery-aisle-panel hidden" style="padding:4px 16px 12px;">
                ${panelBody}
            </div>
        </div>`;
}

/** Expand / collapse any Guidance accordion section. */
export function toggleGuidanceSection(id) {
    const panel = document.getElementById(`guidance-panel-${id}`);
    const chevron = document.getElementById(`guidance-chevron-${id}`);
    const header = document.getElementById(`guidance-header-${id}`);
    if (!panel) return;
    const opening = panel.classList.contains('hidden');
    panel.classList.toggle('hidden', !opening);
    if (chevron) chevron.textContent = opening ? '−' : '+';
    if (header) header.setAttribute('aria-expanded', opening ? 'true' : 'false');
}

/** @deprecated use toggleGuidanceSection('rpe') */
export function toggleRpeGuidanceSection() {
    toggleGuidanceSection('rpe');
}

export function renderRpeGuidancePanel() {
    const host = document.getElementById('rpe-guidance-content');
    if (!host) return;
    host.innerHTML = GUIDANCE_TOPICS.map(buildTopicAccordionHtml).join('');
}

import {
    HIT_TYPE_OPTIONS,
    buildLactateIntervalPlan,
    getLactateProtocolForSlot,
    getMonthlyLactateProtocols
} from '../domain/lactate-engine.js';
import { dateToISO, getLactateSlotForDate, isLactateEvent } from '../domain/route-planner.js';

let _pendingContinue = null;
let _selectedHitIds = new Set(['interval_sprints']);

function glassRoot() {
    return document.querySelector('.iphone-screen') || document.body;
}

function escapeHtml(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/"/g, '&quot;');
}

export function ensureLactateHitModal() {
    let modal = document.getElementById('lactate-hit-modal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'lactate-hit-modal';
    modal.className = 'hidden';
    modal.style.cssText = 'position:fixed; inset:0; z-index:22000; display:flex; justify-content:center; align-items:flex-end; padding:16px; box-sizing:border-box; background:rgba(0,0,0,0.45);';
    modal.onclick = (e) => { if (e.target === modal) closeLactateHitPicker(false); };

    modal.innerHTML = `
        <div class="modal-content stealth-panel" style="width:100%; max-width:390px; max-height:min(78%, calc(100% - 48px)); overflow:auto; background:var(--bg-surface); padding:18px 16px 16px; border-radius:16px 16px 12px 12px; box-sizing:border-box;" onclick="event.stopPropagation()">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:8px;">
                <div style="min-width:0;">
                    <h2 style="color:var(--text-main); font-family:'Roboto Mono', monospace; letter-spacing:0.4px; margin:0; font-size:14px;">Lactate/HIT type</h2>
                    <p id="lactate-hit-protocol-hint" style="font-size:11px; color:var(--text-muted); margin:6px 0 0; line-height:1.4;"></p>
                </div>
                <button type="button" onclick="closeLactateHitPicker(false)" style="background:none; border:none; color:var(--text-stealth); font-size:24px; cursor:pointer; line-height:1; padding:0;" aria-label="Close">&times;</button>
            </div>
            <p style="font-size:11px; color:var(--text-silver); margin:0 0 12px; line-height:1.4;">Search and add one or more. Mixed types alternate sets. HIT class is a single Lactate/HIT log with RPE-based recovery.</p>
            <input type="search" id="lactate-hit-search" class="input-field" placeholder="Search HIT types…" autocomplete="off" style="margin-bottom:10px;" oninput="filterLactateHitOptions()">
            <div id="lactate-hit-selected" style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:10px; min-height:28px;"></div>
            <div id="lactate-hit-options" style="display:flex; flex-direction:column; gap:6px; margin-bottom:14px; max-height:220px; overflow:auto;"></div>
            <button type="button" class="btn-primary is-primary" style="margin:0;" onclick="confirmLactateHitPicker()">Build session</button>
        </div>
    `;
    glassRoot().appendChild(modal);
    return modal;
}

function renderSelectedChips() {
    const wrap = document.getElementById('lactate-hit-selected');
    if (!wrap) return;
    if (!_selectedHitIds.size) {
        wrap.innerHTML = `<div style="font-size:10px; color:var(--text-stealth); font-family:'Roboto Mono';">Nothing selected yet</div>`;
        return;
    }
    wrap.innerHTML = [..._selectedHitIds].map(id => {
        const label = HIT_TYPE_OPTIONS.find(t => t.id === id)?.label || id;
        return `<button type="button" onclick="toggleLactateHitType('${id}')" style="display:inline-flex; align-items:center; gap:6px; padding:6px 10px; border-radius:999px; border:1px solid var(--gold-accent); background:rgba(212,175,55,0.12); color:var(--gold-accent); font-size:11px; font-weight:700; cursor:pointer;">
            ${escapeHtml(label)} <span style="opacity:0.8;">×</span>
        </button>`;
    }).join('');
}

export function filterLactateHitOptions() {
    const wrap = document.getElementById('lactate-hit-options');
    const search = document.getElementById('lactate-hit-search');
    if (!wrap) return;
    const q = String(search?.value || '').trim().toLowerCase();
    const matches = HIT_TYPE_OPTIONS.filter(opt =>
        !q || opt.label.toLowerCase().includes(q) || opt.id.toLowerCase().includes(q)
    );

    if (!matches.length) {
        wrap.innerHTML = `<div style="font-size:12px; color:var(--text-muted); padding:8px 0;">No types match “${escapeHtml(q)}”.</div>`;
        return;
    }

    wrap.innerHTML = matches.map(opt => {
        const selected = _selectedHitIds.has(opt.id);
        return `<button type="button" onclick="toggleLactateHitType('${opt.id}')" style="display:flex; align-items:center; justify-content:space-between; gap:10px; width:100%; padding:10px 12px; border:1px solid ${selected ? 'var(--gold-accent)' : 'var(--border-highlight)'}; border-radius:10px; background:${selected ? 'rgba(212,175,55,0.1)' : 'var(--bg-surface-elevated)'}; cursor:pointer; text-align:left;">
            <span style="font-size:13px; color:var(--text-main); font-weight:600;">${escapeHtml(opt.label)}</span>
            <span style="font-size:10px; font-family:'Roboto Mono'; color:${selected ? 'var(--gold-accent)' : 'var(--text-stealth)'}; font-weight:700;">${selected ? 'ADDED' : '+ ADD'}</span>
        </button>`;
    }).join('');
}

export function toggleLactateHitType(id) {
    if (!id) return;
    if (_selectedHitIds.has(id)) {
        _selectedHitIds.delete(id);
    } else if (id === 'hit_class') {
        _selectedHitIds = new Set(['hit_class']);
    } else {
        _selectedHitIds.delete('hit_class');
        _selectedHitIds.add(id);
    }
    renderSelectedChips();
    filterLactateHitOptions();
}

export function openLactateHitPicker(onContinue) {
    _pendingContinue = typeof onContinue === 'function' ? onContinue : null;
    const modal = ensureLactateHitModal();
    const todayIso = dateToISO(new Date());
    const slot = getLactateSlotForDate(todayIso);
    const protocol = getLactateProtocolForSlot(slot, new Date());
    const monthPair = getMonthlyLactateProtocols(new Date());
    const hint = document.getElementById('lactate-hit-protocol-hint');
    if (hint) {
        hint.textContent = `This week’s session ${slot}: ${protocol.summary}. Pair this month — A / B reshuffle work:rest every session (10 min HIT).`;
    }
    _selectedHitIds = new Set(['interval_sprints']);
    const search = document.getElementById('lactate-hit-search');
    if (search) search.value = '';
    renderSelectedChips();
    filterLactateHitOptions();
    modal.classList.remove('hidden');
    setTimeout(() => search?.focus(), 50);
}

export function closeLactateHitPicker(confirmed) {
    const modal = document.getElementById('lactate-hit-modal');
    if (modal) modal.classList.add('hidden');
    if (!confirmed) _pendingContinue = null;
}

export function confirmLactateHitPicker() {
    const types = [..._selectedHitIds];
    if (!types.length) {
        alert('Select at least one HIT type (or HIT class).');
        return;
    }

    const todayIso = dateToISO(new Date());
    const slot = getLactateSlotForDate(todayIso);
    const plan = buildLactateIntervalPlan({ types, slot, date: new Date() });
    window._lactateHitSelection = {
        types: plan.types,
        slot: plan.slot,
        isHitClass: !!plan.isHitClass,
        protocol: plan.protocol,
        rows: plan.rows,
        summary: plan.summary,
        createdAt: new Date().toISOString()
    };

    closeLactateHitPicker(true);
    const cont = _pendingContinue;
    _pendingContinue = null;
    if (cont) cont(window._lactateHitSelection);
}

/** True when starting a lactate session should open the HIT picker first. */
export function shouldPromptLactateHitTypes(focus) {
    return isLactateEvent(focus) || focus === 'Lactate';
}

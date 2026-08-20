/**
 * Lactate/HIT picker wizard:
 * types → desired RPE (≥7) → build session
 * Unknown / redo baselines run as the first intervals in-session.
 * HIT class → diary RPE only (no interval log)
 */
import { store } from '../state/store.js';
import {
    HIT_TYPE_OPTIONS,
    HIT_MODALITY_META,
    LACTATE_DURATION_BY_RPE,
    buildBaselineProtocolRows,
    buildLactateIntervalPlan,
    clampDesiredRpe,
    clampSessionRpe,
    clearModalityBaselines,
    defaultTrackLengthM,
    getBaselineTestSequence,
    getLactateProtocolForSlot,
    getModalityTrackLength,
    hasAnyBaseline,
    hasCompleteBaseline,
    isLengthBasedModality,
    lactateLogSetFromRow,
    needsLowRpeDisclaimer,
    normalizeHitTypeId,
    recalculateLactatePlanIntensities,
    setModalityTrackLength
} from '../domain/lactate-engine.js';
import { dateToISO, getLactateSlotForDate, isLactateEvent } from '../domain/route-planner.js';

let _pendingContinue = null;
let _selectedHitIds = new Set(['interval_sprints']);
let _wizardStep = 'types';
let _desiredRpe = null; // user must choose (min 7)
let _redoMode = false;
let _forceRedoTypes = null;

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
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'lactate-hit-modal';
        glassRoot().appendChild(modal);
    }

    // Always refresh shell so hot-reloads / older DOM structures don't blank the list
    modal.className = 'hidden';
    modal.style.cssText = 'position:fixed; inset:0; z-index:22000; display:flex; justify-content:center; align-items:flex-end; padding:16px; box-sizing:border-box; background:rgba(0,0,0,0.45);';
    modal.onclick = (e) => { if (e.target === modal) closeLactateHitPicker(false); };
    modal.innerHTML = `
        <div class="modal-content stealth-panel" style="width:100%; max-width:390px; max-height:min(88%, calc(100% - 48px)); overflow:auto; background:var(--bg-surface); padding:18px 16px 16px; border-radius:16px 16px 12px 12px; box-sizing:border-box;" onclick="event.stopPropagation()">
            <div id="lactate-hit-wizard-body"></div>
        </div>
    `;
    return modal;
}

function renderWizard() {
    const body = document.getElementById('lactate-hit-wizard-body');
    if (!body) return;
    if (_wizardStep === 'rpe') renderRpeStep(body);
    else if (_wizardStep === 'track') renderTrackLengthStep(body);
    else if (_wizardStep === 'redo') renderRedoPicker(body);
    else renderTypesStep(body);
}

function renderTypesStep(body) {
    let slot = 'A';
    let protocolSummary = 'Duration is set by desired RPE on the next step.';
    try {
        const todayIso = dateToISO(new Date());
        slot = getLactateSlotForDate(todayIso) || 'A';
        const protocol = getLactateProtocolForSlot(slot, new Date());
        if (protocol?.summary) protocolSummary = protocol.summary;
    } catch (e) {
        console.warn('Lactate protocol hint failed:', e);
    }

    body.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:8px;">
            <div style="min-width:0;">
                <h2 style="color:var(--text-main); font-family:'Roboto Mono', monospace; letter-spacing:0.4px; margin:0; font-size:14px;">HIT type</h2>
                <p style="font-size:11px; color:var(--text-muted); margin:6px 0 0; line-height:1.4;">Session ${escapeHtml(slot)} · ${escapeHtml(protocolSummary)}</p>
            </div>
            <button type="button" onclick="closeLactateHitPicker(false)" style="background:none; border:none; color:var(--text-stealth); font-size:24px; cursor:pointer; line-height:1; padding:0;" aria-label="Close">&times;</button>
        </div>
        <p style="font-size:11px; color:var(--text-silver); margin:0 0 12px; line-height:1.4;">Pick one or more modalities. Mixed types alternate sets. <strong style="color:var(--text-main);">HIT class</strong> skips intervals — only a diary RPE is collected. Missing baselines are tested as the first intervals and count toward the HIT block.</p>
        <input type="search" id="lactate-hit-search" class="input-field" placeholder="Search HIT types…" autocomplete="off" style="margin-bottom:10px;" oninput="filterLactateHitOptions()">
        <div id="lactate-hit-selected" style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:10px; min-height:28px;"></div>
        <div id="lactate-hit-options" style="display:flex; flex-direction:column; gap:8px; margin-bottom:14px;"></div>
        <button type="button" class="btn-primary is-primary" style="margin:0;" onclick="confirmLactateHitPicker()">Continue</button>
    `;
    renderSelectedChips();
    filterLactateHitOptions();
}

function renderRpeStep(body) {
    const hasPick = _desiredRpe != null;
    const mins = hasPick ? (LACTATE_DURATION_BY_RPE[_desiredRpe] || 20) : null;
    body.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:12px;">
            <div>
                <div style="font-family:'Roboto Mono',monospace; font-size:10px; color:var(--gold-accent); font-weight:800; letter-spacing:0.6px; text-transform:uppercase; margin-bottom:6px;">Desired RPE</div>
                <div style="font-size:16px; font-weight:800; color:var(--text-main); line-height:1.35;">How hard should this HIT session feel?</div>
            </div>
            <button type="button" onclick="closeLactateHitPicker(false)" style="background:none; border:none; color:var(--text-stealth); font-size:24px; cursor:pointer; line-height:1; padding:0;" aria-label="Close">&times;</button>
        </div>
        <p style="font-size:12px; color:var(--text-silver); line-height:1.45; margin:0 0 14px;">Choose an RPE (minimum <strong style="color:var(--text-main);">7</strong>). HIT block duration (excluding warmup &amp; stretch) follows your choice:</p>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:14px;">
            ${[7, 8, 9, 10].map(r => `
                <button type="button" onclick="selectLactateDesiredRpe(${r})" style="padding:14px 10px; border-radius:10px; border:1px solid ${r === _desiredRpe ? 'var(--gold-accent)' : 'var(--border-highlight)'}; background:${r === _desiredRpe ? 'rgba(212,175,55,0.12)' : 'var(--bg-surface-elevated)'}; cursor:pointer; text-align:center;">
                    <div style="font-size:18px; font-weight:800; color:var(--gold-accent); font-family:'Roboto Mono';">RPE ${r}</div>
                    <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">${LACTATE_DURATION_BY_RPE[r]} min HIT</div>
                </button>`).join('')}
        </div>
        <div style="font-size:12px; color:${hasPick ? 'var(--gold-accent)' : 'var(--text-muted)'}; font-family:'Roboto Mono'; margin-bottom:14px;">${hasPick ? `Selected → ${_desiredRpe} · ${mins} min work block` : 'Tap an RPE to continue'}</div>
        <div style="display:flex; flex-direction:column; gap:8px;">
            <button type="button" class="btn-primary is-primary" style="margin:0; opacity:${hasPick ? '1' : '0.5'};" onclick="confirmLactateDesiredRpe()" ${hasPick ? '' : 'disabled'}>Continue</button>
            <button type="button" class="btn-primary is-secondary" style="margin:0;" onclick="lactateWizardBackToTypes()">Back</button>
        </div>`;
}

function selectedLengthBasedTypes() {
    return [..._selectedHitIds].map(normalizeHitTypeId).filter(isLengthBasedModality);
}

function renderTrackLengthStep(body) {
    const types = selectedLengthBasedTypes();
    const fields = types.map((id) => {
        const meta = HIT_MODALITY_META[id] || {};
        const prefill = getModalityTrackLength(id) || defaultTrackLengthM(id) || '';
        const warn = id === 'interval_sprints'
            ? 'Keep it under 50 m so turns stay realistic.'
            : '25 m and 50 m are the recommended 1-length / 2-length distances.';
        return `
            <label style="display:block; margin-bottom:12px;">
                <div style="font-size:13px; font-weight:700; color:var(--text-main); margin-bottom:4px;">${escapeHtml(meta.lengthPrompt || 'Track length')}</div>
                <div style="font-size:11px; color:var(--text-muted); margin-bottom:8px; line-height:1.4;">${escapeHtml(meta.lengthHint || '')} ${escapeHtml(warn)}</div>
                <div style="display:flex; align-items:center; gap:8px;">
                    <input type="number" min="5" max="200" step="1" inputmode="decimal"
                        id="lactate-track-len-${escapeHtml(id)}"
                        class="input-field" value="${escapeHtml(String(prefill))}"
                        style="flex:1; margin:0;">
                    <span style="font-size:12px; color:var(--text-silver); font-family:'Roboto Mono';">m</span>
                </div>
            </label>`;
    }).join('');
    body.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:12px;">
            <div>
                <div style="font-family:'Roboto Mono',monospace; font-size:10px; color:var(--gold-accent); font-weight:800; letter-spacing:0.6px; text-transform:uppercase; margin-bottom:6px;">Length</div>
                <div style="font-size:16px; font-weight:800; color:var(--text-main); line-height:1.35;">Set the rep distance</div>
            </div>
            <button type="button" onclick="closeLactateHitPicker(false)" style="background:none; border:none; color:var(--text-stealth); font-size:24px; cursor:pointer; line-height:1; padding:0;" aria-label="Close">&times;</button>
        </div>
        <p style="font-size:12px; color:var(--text-silver); line-height:1.45; margin:0 0 14px;">Baselines are 1 length and 2 lengths. Changing the distance clears old times so you retest.</p>
        ${fields}
        <div style="display:flex; flex-direction:column; gap:8px;">
            <button type="button" class="btn-primary is-primary" style="margin:0;" onclick="confirmLactateTrackLength()">Continue</button>
            <button type="button" class="btn-primary is-secondary" style="margin:0;" onclick="lactateWizardBackToRpe()">Back</button>
        </div>`;
}

function renderRedoPicker(body) {
    const options = HIT_TYPE_OPTIONS.filter(t => t.id !== 'hit_class');
    body.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:10px;">
            <div>
                <div style="font-family:'Roboto Mono',monospace; font-size:10px; color:var(--gold-accent); font-weight:800; letter-spacing:0.6px; text-transform:uppercase; margin-bottom:6px;">Redo tests</div>
                <div style="font-size:16px; font-weight:800; color:var(--text-main);">Which baselines do you want to retest?</div>
            </div>
            <button type="button" onclick="closeLactateHitPicker(false)" style="background:none; border:none; color:var(--text-stealth); font-size:24px; cursor:pointer; line-height:1; padding:0;" aria-label="Close">&times;</button>
        </div>
        <p style="font-size:12px; color:var(--text-silver); line-height:1.45; margin:0 0 12px;">Use this after fitness gains or if a prior test was inaccurate. Retests run as the next intervals — shortest to longest, with rest after each result.</p>
        <div id="lactate-redo-options" style="display:flex; flex-direction:column; gap:6px; margin-bottom:14px; max-height:240px; overflow:auto;">
            ${options.map(opt => {
                const has = hasAnyBaseline(opt.id);
                return `<button type="button" data-redo-id="${escapeHtml(opt.id)}" onclick="toggleLactateRedoType('${escapeHtml(opt.id)}')" style="display:flex; align-items:center; justify-content:space-between; gap:10px; width:100%; padding:10px 12px; border:1px solid var(--border-highlight); border-radius:10px; background:var(--bg-surface-elevated); cursor:pointer; text-align:left;">
                    <span style="font-size:13px; color:var(--text-main); font-weight:600;">${escapeHtml(opt.label)}</span>
                    <span style="font-size:10px; font-family:'Roboto Mono'; color:var(--text-stealth);">${has ? 'HAS DATA' : 'NONE'}</span>
                </button>`;
            }).join('')}
        </div>
        <div style="display:flex; flex-direction:column; gap:8px;">
            <button type="button" class="btn-primary is-primary" style="margin:0;" onclick="confirmLactateRedoSelection()">Retest selected</button>
            <button type="button" class="btn-primary is-secondary" style="margin:0;" onclick="lactateWizardBackToTypes()">Back</button>
        </div>`;
    _forceRedoTypes = new Set();
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

    const options = Array.isArray(HIT_TYPE_OPTIONS) ? HIT_TYPE_OPTIONS : [];
    const q = String(search?.value || '').trim().toLowerCase();
    const matches = options.filter(opt =>
        !q || String(opt.label || '').toLowerCase().includes(q) || String(opt.id || '').toLowerCase().includes(q)
    );

    if (!options.length) {
        wrap.innerHTML = `<div style="font-size:12px; color:#ff6b6b; padding:8px 0;">HIT types failed to load. Refresh the page.</div>`;
        return;
    }

    if (!matches.length) {
        wrap.innerHTML = `<div style="font-size:12px; color:var(--text-muted); padding:8px 0;">No types match “${escapeHtml(q)}”.</div>`;
        return;
    }

    wrap.innerHTML = matches.map(opt => {
        const id = String(opt.id || '');
        const label = String(opt.label || id);
        const selected = _selectedHitIds.has(id);
        const isClass = id === 'hit_class';
        const hasComplete = !isClass && hasCompleteBaseline(id);
        const hasBase = !isClass && hasAnyBaseline(id);
        const border = selected ? 'var(--gold-accent)' : 'var(--border-highlight)';
        const bg = selected ? 'rgba(212,175,55,0.1)' : 'var(--bg-surface-elevated)';
        const status = selected ? 'ADDED' : '+ ADD';
        const statusColor = selected ? 'var(--gold-accent)' : 'var(--text-stealth)';
        const sub = isClass
            ? 'Diary RPE only — no intervals'
            : (hasComplete ? 'Baseline saved'
                : (hasBase ? 'Baseline incomplete — tests in session' : 'No baseline yet — tests in session'));

        const redoBtn = !isClass && hasBase
            ? `<button type="button" onclick="redoLactateBaselineForType('${escapeHtml(id)}')"
                style="flex-shrink:0; background:transparent; border:1px solid var(--border-subtle); border-radius:6px; color:var(--text-silver); font-size:9px; font-family:'Roboto Mono',monospace; font-weight:700; padding:6px 8px; cursor:pointer; white-space:nowrap;">
                REDO BASELINE
               </button>`
            : '';

        return `
        <div style="display:flex; align-items:stretch; gap:8px;">
            <button type="button" onclick="toggleLactateHitType('${escapeHtml(id)}')"
                style="flex:1; min-width:0; display:flex; align-items:center; justify-content:space-between; gap:10px; padding:12px; border:1px solid ${border}; border-radius:10px; background:${bg}; cursor:pointer; text-align:left; color:inherit;">
                <span style="min-width:0;">
                    <span style="display:block; font-size:13px; color:var(--text-main); font-weight:700; line-height:1.3;">${escapeHtml(label)}</span>
                    <span style="display:block; font-size:9px; color:var(--text-stealth); font-family:'Roboto Mono',monospace; margin-top:4px;">${escapeHtml(sub)}</span>
                </span>
                <span style="flex-shrink:0; font-size:10px; font-family:'Roboto Mono',monospace; color:${statusColor}; font-weight:800;">${status}</span>
            </button>
            ${redoBtn}
        </div>`;
    }).join('');
}

export function toggleLactateHitType(id) {
    if (!id) return;
    const nid = normalizeHitTypeId(id);
    if (_selectedHitIds.has(nid) || _selectedHitIds.has(id)) {
        _selectedHitIds.delete(nid);
        _selectedHitIds.delete(id);
    } else if (nid === 'hit_class') {
        _selectedHitIds = new Set(['hit_class']);
    } else {
        _selectedHitIds.delete('hit_class');
        _selectedHitIds.add(nid);
    }
    renderSelectedChips();
    filterLactateHitOptions();
}

export function selectLactateDesiredRpe(rpe) {
    _desiredRpe = clampDesiredRpe(rpe);
    renderWizard();
}

export function lactateWizardBackToTypes() {
    _wizardStep = 'types';
    _redoMode = false;
    _forceRedoTypes = null;
    renderWizard();
}

export function lactateWizardBackToRpe() {
    _wizardStep = 'rpe';
    renderWizard();
}

export function openLactateBaselineRedo() {
    _wizardStep = 'redo';
    renderWizard();
}

/** Redo / enter baseline for one modality from the type list. */
export function redoLactateBaselineForType(id) {
    const nid = normalizeHitTypeId(id);
    if (!nid || nid === 'hit_class' || !HIT_MODALITY_META[nid]) return;
    if (hasAnyBaseline(nid)) clearModalityBaselines(nid);
    _selectedHitIds.delete('hit_class');
    _selectedHitIds.add(nid);
    _redoMode = true;
    if (sessionHasLactateLog()) {
        spliceBaselineTestsIntoActiveLog([nid]);
        closeLactateHitPicker(true);
        return;
    }
    _wizardStep = 'types';
    renderWizard();
}

export function toggleLactateRedoType(id) {
    if (!_forceRedoTypes) _forceRedoTypes = new Set();
    const nid = normalizeHitTypeId(id);
    if (_forceRedoTypes.has(nid)) _forceRedoTypes.delete(nid);
    else _forceRedoTypes.add(nid);
    const btn = document.querySelector(`#lactate-redo-options [data-redo-id="${nid}"]`);
    if (btn) {
        const on = _forceRedoTypes.has(nid);
        btn.style.borderColor = on ? 'var(--gold-accent)' : 'var(--border-highlight)';
        btn.style.background = on ? 'rgba(212,175,55,0.1)' : 'var(--bg-surface-elevated)';
    }
}

export function confirmLactateRedoSelection() {
    const ids = [...(_forceRedoTypes || [])];
    if (!ids.length) {
        alert('Select at least one modality to retest.');
        return;
    }
    ids.forEach((id) => {
        clearModalityBaselines(id);
        _selectedHitIds.delete('hit_class');
        _selectedHitIds.add(normalizeHitTypeId(id));
    });
    _redoMode = true;
    if (sessionHasLactateLog()) {
        spliceBaselineTestsIntoActiveLog(ids);
        closeLactateHitPicker(true);
        return;
    }
    _wizardStep = 'types';
    renderWizard();
}

export function confirmLactateDesiredRpe() {
    if (_desiredRpe == null) {
        alert('Choose a desired RPE (7–10) for this session.');
        return;
    }
    if (selectedLengthBasedTypes().length) {
        _wizardStep = 'track';
        renderWizard();
        return;
    }
    finishLactateWizardAndContinue();
}

export function confirmLactateTrackLength() {
    const types = selectedLengthBasedTypes();
    for (const id of types) {
        const el = document.getElementById(`lactate-track-len-${id}`);
        const n = Number(el?.value);
        if (!(n > 0)) {
            alert('Enter a length in metres.');
            return;
        }
        if (id === 'interval_sprints' && n > 50) {
            const ok = confirm(`Recommended under 50 m. Use ${n} m anyway?`);
            if (!ok) return;
        }
        setModalityTrackLength(id, n);
    }
    finishLactateWizardAndContinue();
}

/** @deprecated Wizard form removed — in-session tests collect results. */
export function submitLactateBaselineStep() {
    finishLactateWizardAndContinue();
}

function sessionHasLactateLog() {
    const items = store.activeLog?.items;
    if (!Array.isArray(items) || !items.length) return false;
    return items.some(item => item?.isLactateHit || (item.sets || []).some(s => s?.isLactateHit));
}

function isLactateLogItem(item) {
    if (!item) return false;
    if (/hit\s*class/i.test(item.exercise?.name || '')) return false;
    return !!(item.isLactateHit || (item.sets || []).some(s => s && s.isLactateHit));
}

function spliceBaselineTestsIntoActiveLog(typeIds) {
    const ids = (typeIds || []).map(normalizeHitTypeId).filter(id => id && HIT_MODALITY_META[id]);
    if (!ids.length) return;
    ids.forEach(clearModalityBaselines);
    const testRows = [];
    ids.forEach((id) => {
        testRows.push(...buildBaselineProtocolRows(id, getBaselineTestSequence(id)));
    });
    if (!testRows.length) return;

    const sel = window._lactateHitSelection;
    const items = store.activeLog?.items;
    if (!sel || sel.isHitClass || !Array.isArray(items)) {
        if (sel && !sel.isHitClass) {
            sel.rows = [...testRows, ...(sel.rows || []).filter(r => !r.isBaselineTest)];
            sel.hasBaselineTests = true;
        }
        return;
    }

    let insertAt = items.findIndex(isLactateLogItem);
    if (insertAt < 0) insertAt = items.length;
    let cursor = 0;
    let foundIncomplete = false;
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!isLactateLogItem(item)) continue;
        const sets = item.sets || [];
        for (let s = 0; s < sets.length; s++) {
            if (sets[s]?.isBaselineTest && !sets[s].completed) {
                foundIncomplete = true;
                break;
            }
            if (!sets[s]?.completed) {
                insertAt = i;
                foundIncomplete = true;
                break;
            }
            cursor += 1;
        }
        if (foundIncomplete) break;
        insertAt = i + 1;
    }

    const lactateItems = items.filter(isLactateLogItem);
    const mixed = (sel.types || []).length > 1 || lactateItems.length > 1;

    if (!mixed && lactateItems.length === 1) {
        const item = lactateItems[0];
        const setInsert = (item.sets || []).findIndex(s => s && !s.completed && !s.isBaselineTest);
        const at = setInsert < 0 ? (item.sets || []).length : setInsert;
        const newSets = testRows.map(lactateLogSetFromRow);
        item.sets.splice(at, 0, ...newSets);
        item.lactateRows = item.lactateRows || [];
        item.lactateRows.splice(at, 0, ...testRows);
        item.plannedSets = (item.sets || []).length;
        const rowAt = Math.max(0, Math.min(cursor, (sel.rows || []).length));
        sel.rows = sel.rows || [];
        sel.rows.splice(rowAt, 0, ...testRows);
    } else {
        const newItems = testRows.map((row) => ({
            exercise: {
                id: `HIT_${row.typeId || 'TEST'}`,
                name: row.name,
                domain: 'cardio',
                muscle_group: 'cardio'
            },
            note: row.notes || row._baseNotes,
            isLactateHit: true,
            plannedSets: 1,
            lactateRows: [row],
            sets: [lactateLogSetFromRow(row)]
        }));
        items.splice(insertAt, 0, ...newItems);
        sel.rows = sel.rows || [];
        const rowAt = Math.max(0, Math.min(cursor, sel.rows.length));
        sel.rows.splice(rowAt, 0, ...testRows);
    }

    sel.hasBaselineTests = true;
    window._lactateHitSelection = recalculateLactatePlanIntensities(
        sel,
        sel.sessionRpe ?? sel.desiredRpe ?? 7
    );
    syncLactateIntensitiesIntoActiveLog();
    if (typeof window.renderWorkoutLog === 'function') window.renderWorkoutLog();
    if (window.currentModalExIdx != null && typeof window.renderExerciseSets === 'function') {
        window.renderExerciseSets();
    }
}

function finishLactateWizardAndContinue() {
    const types = [..._selectedHitIds].map(normalizeHitTypeId);
    if (!types.length) {
        alert('Select at least one HIT type (or HIT class).');
        _wizardStep = 'types';
        renderWizard();
        return;
    }

    const todayIso = dateToISO(new Date());
    const slot = getLactateSlotForDate(todayIso);
    const plan = buildLactateIntervalPlan({
        types,
        slot,
        date: new Date(),
        desiredRpe: _desiredRpe,
        sessionRpe: _desiredRpe
    });

    window._lactateHitSelection = {
        types: plan.types,
        slot: plan.slot,
        isHitClass: !!plan.isHitClass,
        protocol: plan.protocol,
        rows: plan.rows,
        summary: plan.summary,
        desiredRpe: plan.desiredRpe,
        sessionRpe: plan.sessionRpe,
        blockMinutes: plan.blockMinutes,
        hasBaselineTests: !!plan.hasBaselineTests,
        createdAt: new Date().toISOString()
    };

    closeLactateHitPicker(true);

    if (plan.isHitClass) {
        startHitClassDiaryOnly(window._lactateHitSelection);
        return;
    }

    const cont = _pendingContinue;
    _pendingContinue = null;
    if (cont) cont(window._lactateHitSelection);
}

/** HIT class: no interval log — open diary for session RPE only. */
export function startHitClassDiaryOnly(selection) {
    window._lactateHitSelection = selection || window._lactateHitSelection;
    window._hitClassDiaryOnly = true;
    window.manualSessionKind = 'Lactate';
    window.journalMode = 'lactate';
    window._workoutSessionConfirmed = true;
    store.activeLog = {
        type: 'workout',
        items: [{
            exercise: { id: 'HIT_CLASS', name: 'HIT Class', domain: 'cardio', muscle_group: 'cardio' },
            note: 'HIT class — diary RPE only',
            isLactateHit: true,
            sets: [{ completed: true, isText: true, isLactateHit: true, reps: 'HIT class', weight: 0, rpe: 0 }]
        }]
    };
    window._loggedSessionDurationMs = 0;
    window._loggedSessionDurationLabel = 'HIT class';
    window._lastSessionDurationMin = 0;

    if (typeof window.configureJournalModal === 'function') {
        window.configureJournalModal('lactate');
    }
    const eyebrow = document.getElementById('journal-modal-eyebrow');
    const title = document.getElementById('journal-modal-title');
    if (eyebrow) eyebrow.innerText = 'HIT Class';
    if (title) title.innerText = 'RATE THE SESSION';
    ['journal-rpe', 'journal-athletic', 'journal-mental', 'journal-notes', 'journal-match-perf', 'journal-injury-pain'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const modal = document.getElementById('post-session-modal');
    if (modal) {
        modal.classList.remove('hidden');
        const content = modal.querySelector('.modal-content');
        if (content) {
            content.style.transform = 'translateY(100%)';
            requestAnimationFrame(() => {
                content.style.transition = 'transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)';
                content.style.transform = 'translateY(0)';
            });
        }
    }
}

export function openLactateHitPicker(onContinue) {
    _pendingContinue = typeof onContinue === 'function' ? onContinue : null;
    _wizardStep = 'types';
    _desiredRpe = null;
    _redoMode = false;
    _forceRedoTypes = null;
    _selectedHitIds = new Set(['interval_sprints']);
    const modal = ensureLactateHitModal();
    renderWizard();
    modal.classList.remove('hidden');
    setTimeout(() => document.getElementById('lactate-hit-search')?.focus(), 50);
}

export function closeLactateHitPicker(confirmed) {
    const modal = document.getElementById('lactate-hit-modal');
    if (modal) modal.classList.add('hidden');
    if (!confirmed) _pendingContinue = null;
}

export function confirmLactateHitPicker() {
    const types = [..._selectedHitIds].map(normalizeHitTypeId);
    if (!types.length) {
        alert('Select at least one HIT type (or HIT class).');
        return;
    }
    if (types.length === 1 && types[0] === 'hit_class') {
        finishLactateWizardAndContinue();
        return;
    }
    _wizardStep = 'rpe';
    renderWizard();
}

export function adjustLactateSessionRpe(delta) {
    const sel = window._lactateHitSelection;
    if (!sel || sel.isHitClass) return;
    const next = clampSessionRpe((sel.sessionRpe ?? sel.desiredRpe ?? 7) + Number(delta || 0));
    if (needsLowRpeDisclaimer(next) && !sel._lowRpeAck) {
        const ok = confirm('RPE 5 or lower is unlikely to train anaerobic cardio and drifts toward steady-state. Continue anyway?');
        if (!ok) return;
        sel._lowRpeAck = true;
    }
    window._lactateHitSelection = recalculateLactatePlanIntensities(sel, next);
    syncLactateIntensitiesIntoActiveLog();
    if (typeof window.renderWorkoutLog === 'function') window.renderWorkoutLog();
    if (window.currentModalExIdx != null && typeof window.renderExerciseSets === 'function') {
        window.renderExerciseSets();
    }
    const title = document.getElementById('current-route-title');
    if (title && window._lactateHitSelection?.summary) {
        title.innerText = `HIT · live RPE ${window._lactateHitSelection.sessionRpe}`;
    }
}

export function syncLactateIntensitiesIntoActiveLog() {
    const sel = window._lactateHitSelection;
    if (!sel?.rows?.length || !store.activeLog?.items) return;
    const rows = sel.rows;
    let rowCursor = 0;
    store.activeLog.items.forEach(item => {
        if (!item?.isLactateHit && !(item.sets || []).some(s => s?.isLactateHit)) return;
        if (/hit\s*class/i.test(item.exercise?.name || '')) return;
        const itemRows = item.lactateRows;
        if (Array.isArray(itemRows) && itemRows.length) {
            item.lactateRows = itemRows.map((old, i) => {
                const fresh = rows[rowCursor + i];
                return fresh ? { ...old, ...fresh } : old;
            });
            (item.sets || []).forEach((set, i) => {
                const fresh = rows[rowCursor + i];
                if (!fresh || set.isText) return;
                if (set.isBaselineTest) {
                    set.notes = fresh.notes || set.notes;
                    set.targetDisplay = fresh.targetDisplay || set.targetDisplay;
                    return;
                }
                set.notes = fresh.notes;
                set.targetDisplay = fresh.targetDisplay;
                set.targetRate = fresh.targetRate;
                set.targetLengths = fresh.targetLengths;
                set.lengthM = fresh.lengthM;
                set.hitWorkSec = fresh.hitWorkSec;
                set.duration_sec = fresh.workSec || set.duration_sec;
                set.restTime = fresh.restSec != null ? fresh.restSec : set.restTime;
            });
            rowCursor += itemRows.length;
        }
    });
}

export function lactateSessionRpeBarHtml() {
    const sel = window._lactateHitSelection;
    if (!sel || sel.isHitClass) return '';
    const live = sel.sessionRpe ?? sel.desiredRpe ?? 7;
    const warn = needsLowRpeDisclaimer(live)
        ? `<div style="font-size:10px; color:#ff6b6b; margin-top:6px; line-height:1.35;">Low RPE — likely drifting toward steady-state cardio.</div>`
        : '';
    return `
        <div id="lactate-session-rpe-bar" style="margin-bottom:14px; padding:12px 14px; border:1px solid rgba(212,175,55,0.28); border-radius:12px; background:rgba(212,175,55,0.06);">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
                <div style="min-width:0;">
                    <div style="font-size:9px; color:var(--gold-accent); font-family:'Roboto Mono'; font-weight:800; letter-spacing:0.5px; text-transform:uppercase;">Session RPE</div>
                </div>
                <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
                    <button type="button" onclick="adjustLactateSessionRpe(-1)" style="width:36px; height:36px; border-radius:8px; border:1px solid var(--border-highlight); background:var(--bg-surface-elevated); color:var(--text-main); font-size:18px; font-weight:700; cursor:pointer;">−</button>
                    <div style="min-width:42px; text-align:center; font-size:22px; font-weight:800; color:var(--gold-accent); font-family:'Roboto Mono';">${live}</div>
                    <button type="button" onclick="adjustLactateSessionRpe(1)" style="width:36px; height:36px; border-radius:8px; border:1px solid var(--border-highlight); background:var(--bg-surface-elevated); color:var(--text-main); font-size:18px; font-weight:700; cursor:pointer;">+</button>
                </div>
            </div>
            ${warn}
            <button type="button" onclick="openLactateBaselineRedoFromSession()" style="margin-top:10px; background:none; border:none; color:var(--text-silver); font-size:11px; text-decoration:underline; cursor:pointer; padding:0;">Redo baseline tests</button>
        </div>`;
}

export function openLactateBaselineRedoFromSession() {
    openLactateHitPicker(null);
    openLactateBaselineRedo();
}

export function shouldPromptLactateHitTypes(focus) {
    return isLactateEvent(focus) || focus === 'Lactate';
}

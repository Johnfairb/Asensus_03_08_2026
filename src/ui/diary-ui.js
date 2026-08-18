/**
 * Dynamic diary field rendering + schema editor UI.
 */
import {
  addDiaryField,
  applyDiaryFieldValues,
  collectDiaryFieldValues,
  getDiaryFieldsForMode,
  getWeeklyDiaryAverages,
  isTenPointScaleField,
  journalModeToSchemaMode,
  removeDiaryField,
  resetDiarySchemaMode,
  updateDiaryField
} from '../domain/diary-schema.js';
import { maybePromptRpeAwareness } from './rpe-guidance-ui.js';

let _editorOpen = false;

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

function currentSchemaMode() {
  return journalModeToSchemaMode(window.journalMode || 'practice');
}

/** Hide legacy static blocks — dynamic form replaces them. */
function hideLegacyBlocks() {
  ['journal-rpe-block', 'journal-scores-row', 'journal-match-block', 'journal-hydration-block'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

function fieldTypeLabel(f) {
  if (f.type === 'qualitative') return 'Text';
  // Scale range lives in the input placeholder only — not in the title/badge
  if (f.type === 'scale10' || isTenPointScaleField(f)) return '';
  return 'Number';
}

export function renderDiaryFields(mode, prefillEntry = null) {
  const host = document.getElementById('journal-dynamic-fields');
  if (!host) return;
  hideLegacyBlocks();
  const schemaMode = mode || currentSchemaMode();
  const fields = getDiaryFieldsForMode(schemaMode);
  let html = '';
  fields.forEach(f => {
    const isText = f.type === 'qualitative';
    const tenScale = !isText && (f.type === 'scale10' || isTenPointScaleField(f));
    const isQuant = !isText;
    const min = tenScale ? (f.min != null ? f.min : 1) : f.min;
    const max = tenScale ? 10 : f.max;
    const inputAttrs = isQuant
      ? `type="number" inputmode="decimal" ${min != null ? `min="${min}"` : ''} ${max != null ? `max="${max}"` : ''} ${f.step != null ? `step="${f.step}"` : 'step="any"'} ${tenScale ? 'data-diary-scale="10"' : ''}`
      : `type="text"`;
    const storeType = isText ? 'qualitative' : (tenScale ? 'scale10' : 'quantitative');
    const typeBadge = fieldTypeLabel(f);
    html += `<div class="diary-field-block" style="margin-bottom:15px;">
      <label style="margin-top:0;">${escapeHtml(f.label)}${typeBadge ? ` <span style="color:var(--text-stealth); font-weight:600; font-size:9px; text-transform:uppercase;">${typeBadge}</span>` : ''}</label>
      ${f.hint ? `<div style="font-size:9px; color:var(--text-muted); margin-bottom:8px;">${escapeHtml(f.hint)}</div>` : ''}
      <input class="input-field" style="margin-bottom:0;" data-diary-field-id="${escapeHtml(f.id)}" data-diary-field-type="${storeType}" ${inputAttrs} placeholder="${isQuant ? (tenScale ? '1–10' : (f.id === 'hydration_ml' ? 'e.g. 500' : '0')) : 'Type here…'}">
    </div>`;
  });
  host.innerHTML = html || `<div style="font-size:12px; color:var(--text-muted); margin-bottom:12px;">No diary fields — use Edit diary entry to add some.</div>`;

  // Live-clamp quantitative inputs that have min/max (including 1–10)
  host.querySelectorAll('input[data-diary-field-type="quantitative"], input[data-diary-field-type="scale10"]').forEach(el => {
    el.addEventListener('input', () => {
      if (el.value === '' || el.value == null) return;
      let n = parseFloat(el.value);
      if (isNaN(n)) return;
      const maxAttr = el.getAttribute('max');
      const minAttr = el.getAttribute('min');
      if (maxAttr != null && maxAttr !== '' && n > Number(maxAttr)) { n = Number(maxAttr); el.value = String(n); }
      if (minAttr != null && minAttr !== '' && n < Number(minAttr)) { n = Number(minAttr); el.value = String(n); }
    });
  });

  if (prefillEntry) applyDiaryFieldValues(prefillEntry);

  // First time an RPE field appears — ask if they know the scale
  if (fields.some(f => String(f.id || '').toLowerCase() === 'rpe' || /rpe/i.test(f.label || ''))) {
    try { maybePromptRpeAwareness(); } catch (e) { /* ignore */ }
  }

  const avgEl = document.getElementById('journal-weekly-averages');
  if (avgEl) {
    const avgs = getWeeklyDiaryAverages(schemaMode);
    const parts = Object.values(avgs).map(a => `${a.label}: ${a.avg}`);
    avgEl.textContent = parts.length
      ? `This week’s averages — ${parts.join(' · ')}`
      : '';
    avgEl.style.display = parts.length ? 'block' : 'none';
  }

  renderDiarySchemaEditor(schemaMode);
}

export function renderDiarySchemaEditor(mode) {
  const editor = document.getElementById('journal-schema-editor');
  if (!editor) return;
  const schemaMode = mode || currentSchemaMode();
  if (!_editorOpen) {
    editor.innerHTML = '';
    editor.classList.add('hidden');
    return;
  }
  editor.classList.remove('hidden');
  const fields = getDiaryFieldsForMode(schemaMode);
  let rows = fields.map(f => {
    const selType = f.type === 'qualitative' ? 'qualitative'
      : (f.type === 'scale10' || isTenPointScaleField(f) ? 'scale10' : 'quantitative');
    return `<div class="diary-schema-row" data-field-id="${escapeHtml(f.id)}">
      <input type="text" class="input-field" style="margin:0; padding:10px; font-size:13px;" value="${escapeHtml(f.label)}"
        onchange="updateDiarySchemaField('${schemaMode}', '${escapeHtml(f.id)}', { label: this.value })" placeholder="Label">
      <select class="input-field" style="margin:0; padding:10px; font-size:12px;"
        onchange="updateDiarySchemaField('${schemaMode}', '${escapeHtml(f.id)}', { type: this.value })">
        <option value="quantitative" ${selType === 'quantitative' ? 'selected' : ''}>Number</option>
        <option value="qualitative" ${selType === 'qualitative' ? 'selected' : ''}>Text</option>
        <option value="scale10" ${selType === 'scale10' ? 'selected' : ''}>1–10</option>
      </select>
      <button type="button" class="btn-primary is-secondary" style="margin:0; padding:8px 10px; font-size:11px; width:auto;"
        onclick="removeDiarySchemaField('${schemaMode}', '${escapeHtml(f.id)}')">Remove</button>
    </div>`;
  }).join('');

  editor.innerHTML = `
    <div style="font-size:10px; color:var(--gold-accent); font-family:'Roboto Mono'; font-weight:800; letter-spacing:0.6px; text-transform:uppercase; margin-bottom:10px;">Edit diary layout</div>
    <div style="font-size:11px; color:var(--text-muted); margin-bottom:12px; line-height:1.4;">Number = any value (no 10 cap). 1–10 = score scale. Text = free notes. Changes save for next time.</div>
    <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:12px;">${rows || '<div style="color:var(--text-muted); font-size:12px;">No fields</div>'}</div>
    <div style="display:flex; gap:8px; flex-wrap:wrap;">
      <button type="button" class="btn-primary is-secondary" style="margin:0; padding:10px 12px; font-size:11px; width:auto;" onclick="addDiarySchemaField('${schemaMode}', 'quantitative')">+ Number</button>
      <button type="button" class="btn-primary is-secondary" style="margin:0; padding:10px 12px; font-size:11px; width:auto;" onclick="addDiarySchemaField('${schemaMode}', 'qualitative')">+ Text</button>
      <button type="button" class="btn-primary is-secondary" style="margin:0; padding:10px 12px; font-size:11px; width:auto;" onclick="addDiarySchemaField('${schemaMode}', 'scale10')">+ 1–10</button>
      <button type="button" class="btn-primary" style="margin:0; padding:10px 12px; font-size:11px; width:auto; border-color:var(--text-stealth); color:var(--text-silver);" onclick="resetDiarySchemaFields('${schemaMode}')">Reset defaults</button>
    </div>`;
}

export function toggleDiarySchemaEditor() {
  _editorOpen = !_editorOpen;
  const btn = document.getElementById('btn-edit-diary-schema');
  if (btn) btn.textContent = _editorOpen ? 'Done editing diary' : 'Edit diary entry';
  renderDiarySchemaEditor(currentSchemaMode());
  if (!_editorOpen) renderDiaryFields(currentSchemaMode());
}

export function addDiarySchemaField(mode, type) {
  const labels = {
    qualitative: 'Notes field',
    scale10: 'Score (1-10)',
    quantitative: 'Number'
  };
  addDiaryField(mode, { type, label: labels[type] || 'Field' });
  renderDiarySchemaEditor(mode);
}

export function removeDiarySchemaField(mode, fieldId) {
  removeDiaryField(mode, fieldId);
  renderDiarySchemaEditor(mode);
}

export function updateDiarySchemaField(mode, fieldId, patch) {
  if (patch.type === 'scale10') {
    patch = { ...patch, min: 1, max: 10 };
  } else if (patch.type === 'quantitative') {
    patch = { ...patch, min: undefined, max: undefined };
  }
  updateDiaryField(mode, fieldId, patch);
  // Keep live form labels in sync if editor stays open
}

export function resetDiarySchemaFields(mode) {
  if (!confirm('Reset this diary layout to the default fields?')) return;
  resetDiarySchemaMode(mode);
  renderDiarySchemaEditor(mode);
}

export function closeDiarySchemaEditor() {
  _editorOpen = false;
  const btn = document.getElementById('btn-edit-diary-schema');
  if (btn) btn.textContent = 'Edit diary entry';
  const editor = document.getElementById('journal-schema-editor');
  if (editor) { editor.classList.add('hidden'); editor.innerHTML = ''; }
}

/** Build legacy-compatible entry bag + fields map from the form. */
export function buildDiaryEntryFromForm(base = {}) {
  const fields = collectDiaryFieldValues();
  return {
    ...base,
    fields,
    rpe: fields.rpe != null ? fields.rpe : base.rpe,
    athletic: fields.athletic != null ? fields.athletic : base.athletic,
    mental: fields.mental != null ? fields.mental : base.mental,
    matchPerformance: fields.matchPerformance != null ? fields.matchPerformance : base.matchPerformance,
    hydration_ml: fields.hydration_ml != null ? fields.hydration_ml : (base.hydration_ml || 0),
    notes: base.notes != null ? base.notes : (document.getElementById('journal-notes')?.value || '')
  };
}

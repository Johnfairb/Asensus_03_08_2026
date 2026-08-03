/**
 * Customizable post-session diary field schemas.
 * Persisted so the edited layout is used next time.
 */
const SCHEMA_KEY = 'ascensus_diary_schema_v1';

const DEFAULTS = {
  practice: [
    { id: 'rpe', label: 'Session RPE (1-10)', type: 'scale10', hint: '1 = Rest, 10 = Absolute Maximum Effort. (>6 triggers Lactate/HIT tracking)', min: 1, max: 10 },
    { id: 'athletic', label: 'Athletic Performance', type: 'scale10', hint: '(1-10)', min: 1, max: 10 },
    { id: 'mental', label: 'Mental Fatigue', type: 'scale10', hint: '(1-10)', min: 1, max: 10 },
    { id: 'hydration_ml', label: 'Hydration (ml)', type: 'quantitative', hint: 'Counts toward your daily hydration goal', min: 0, step: 50 }
  ],
  match: [
    { id: 'rpe', label: 'Session RPE (1-10)', type: 'scale10', hint: '1 = Rest, 10 = Absolute Maximum Effort. (>6 replaces a Lactate/HIT this week)', min: 1, max: 10 },
    { id: 'athletic', label: 'Athletic Performance', type: 'scale10', hint: '(1-10)', min: 1, max: 10 },
    { id: 'mental', label: 'Mental Fatigue', type: 'scale10', hint: '(1-10)', min: 1, max: 10 },
    { id: 'matchPerformance', label: 'Match Performance', type: 'scale10', hint: 'How did you play overall? (1-10)', min: 1, max: 10 },
    { id: 'hydration_ml', label: 'Hydration (ml)', type: 'quantitative', hint: 'Counts toward your daily hydration goal', min: 0, step: 50 }
  ],
  gym: [
    { id: 'mental', label: 'Mental Fatigue', type: 'scale10', hint: '(1-10)', min: 1, max: 10 }
  ],
  lactate: [
    { id: 'rpe', label: 'Session RPE (1-10)', type: 'scale10', hint: 'Rate the Lactate/HIT work. HIT class recovery uses this score.', min: 1, max: 10 }
  ]
};

function uid() {
  return `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function loadDiarySchemaMap() {
  try {
    const raw = JSON.parse(localStorage.getItem(SCHEMA_KEY) || '{}') || {};
    const out = {};
    for (const mode of Object.keys(DEFAULTS)) {
      out[mode] = Array.isArray(raw[mode]) && raw[mode].length
        ? raw[mode].map(normalizeField)
        : DEFAULTS[mode].map(f => ({ ...f }));
    }
    return out;
  } catch (e) {
    return Object.fromEntries(Object.entries(DEFAULTS).map(([k, v]) => [k, v.map(f => ({ ...f }))]));
  }
}

/** True for classic 1–10 diary scores (RPE, athletic, mental, match, pain, etc.). */
export function isTenPointScaleField(f) {
  if (!f || f.type === 'qualitative') return false;
  if (f.type === 'scale10') return true;
  const id = String(f.id || '').toLowerCase();
  const label = String(f.label || '').toLowerCase();
  if (id === 'hydration_ml' || /hydrat|ml|kg|hour|%|percent|cost|£|\$/.test(id + ' ' + label)) return false;
  // Only treat as 1–10 when explicitly labelled / known score fields — not every max:10 number
  if (/rpe|athletic|mental|matchperformance|match perf|fatigue|performance|pain|score \(1|1-10|1–10/.test(id + ' ' + label)) return true;
  if (f.max != null && Number(f.max) === 10 && /score|effort|intensity|rating/.test(id + ' ' + label)) return true;
  return false;
}

function normalizeField(f) {
  let type = f.type === 'qualitative' ? 'qualitative'
    : (f.type === 'scale10' ? 'scale10' : 'quantitative');
  // Legacy: quantitative with max 10 / score labels → scale10
  if (type === 'quantitative' && (f.scale === '10' || f.scale10 === true)) type = 'scale10';
  const base = {
    id: String(f.id || uid()),
    label: String(f.label || 'Field').trim() || 'Field',
    type,
    hint: String(f.hint || ''),
    min: f.min != null ? Number(f.min) : undefined,
    max: f.max != null ? Number(f.max) : undefined,
    step: f.step != null ? Number(f.step) : undefined
  };
  // scale10, or legacy quantitative score fields that already had max 10
  if (base.type === 'scale10' || (base.type === 'quantitative' && base.max === 10 && isTenPointScaleField(base))) {
    base.type = 'scale10';
    if (base.min == null) base.min = 1;
    base.max = 10;
  }
  // Explicit Number fields stay uncapped (no forced max 10)
  return base;
}

export function saveDiarySchemaMap(map) {
  const clean = {};
  for (const mode of Object.keys(DEFAULTS)) {
    clean[mode] = (Array.isArray(map?.[mode]) ? map[mode] : DEFAULTS[mode])
      .map(normalizeField)
      .filter(f => f.label);
  }
  localStorage.setItem(SCHEMA_KEY, JSON.stringify(clean));
  return clean;
}

export function getDiaryFieldsForMode(mode) {
  const key = DEFAULTS[mode] ? mode : 'practice';
  return loadDiarySchemaMap()[key] || [];
}

export function resetDiarySchemaMode(mode) {
  const map = loadDiarySchemaMap();
  if (DEFAULTS[mode]) map[mode] = DEFAULTS[mode].map(f => ({ ...f }));
  return saveDiarySchemaMap(map);
}

/** Resolve journalMode → schema mode. */
export function journalModeToSchemaMode(journalMode) {
  if (journalMode === 'match') return 'match';
  if (journalMode === 'lactate') return 'lactate';
  if (journalMode === 'workout' || journalMode === 'workout-silent') return 'gym';
  if (journalMode === 'pain-only') return 'gym';
  return 'practice';
}

/** Collect field values from the dynamic diary form. */
export function collectDiaryFieldValues() {
  const values = {};
  document.querySelectorAll('[data-diary-field-id]').forEach(el => {
    const id = el.getAttribute('data-diary-field-id');
    const type = el.getAttribute('data-diary-field-type') || 'quantitative';
    if (!id) return;
    if (type === 'quantitative' || type === 'scale10') {
      let n = parseFloat(el.value);
      if (el.value === '' || el.value == null || isNaN(n)) {
        values[id] = null;
        return;
      }
      const maxAttr = el.getAttribute('max');
      const minAttr = el.getAttribute('min');
      if (maxAttr != null && maxAttr !== '' && n > Number(maxAttr)) n = Number(maxAttr);
      if (minAttr != null && minAttr !== '' && n < Number(minAttr)) n = Number(minAttr);
      // Hard cap for 1–10 scale inputs only
      if ((type === 'scale10' || el.getAttribute('data-diary-scale') === '10') && n > 10) n = 10;
      values[id] = n;
      if (String(el.value) !== String(n)) el.value = String(n);
    } else {
      values[id] = String(el.value || '').trim();
    }
  });
  return values;
}

/** Prefill dynamic inputs from a saved journal entry. */
export function applyDiaryFieldValues(entry) {
  if (!entry) return;
  const bag = { ...(entry.fields || {}), ...entry };
  document.querySelectorAll('[data-diary-field-id]').forEach(el => {
    const id = el.getAttribute('data-diary-field-id');
    if (id == null || bag[id] == null || bag[id] === '') return;
    el.value = String(bag[id]);
  });
}

/**
 * Weekly averages for quantitative diary fields (Mon–Sun of current week).
 * Returns { fieldId: { label, avg, n } }
 */
export function getWeeklyDiaryAverages(schemaMode = 'practice') {
  const fields = getDiaryFieldsForMode(schemaMode).filter(f => f.type === 'quantitative' || f.type === 'scale10');
  if (!fields.length) return {};

  const now = new Date();
  const day = (now.getDay() + 6) % 7; // Mon=0
  const monday = new Date(now);
  monday.setHours(12, 0, 0, 0);
  monday.setDate(now.getDate() - day);

  const sums = {};
  const counts = {};
  fields.forEach(f => { sums[f.id] = 0; counts[f.id] = 0; });

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const locale = d.toLocaleDateString();
    const prefixes = ['ascensus_practice_journal_', 'ascensus_match_journal_', 'ascensus_gym_journal_'];
    for (const prefix of prefixes) {
      for (const key of [iso, locale]) {
        const raw = localStorage.getItem(prefix + key);
        if (!raw) continue;
        try {
          const j = JSON.parse(raw);
          const bag = { ...(j.fields || {}), ...j };
          fields.forEach(f => {
            const n = Number(bag[f.id]);
            if (Number.isFinite(n)) {
              sums[f.id] += n;
              counts[f.id] += 1;
            }
          });
        } catch (e) { /* ignore */ }
      }
    }
  }

  const out = {};
  fields.forEach(f => {
    if (counts[f.id] > 0) {
      out[f.id] = {
        label: f.label,
        avg: Math.round((sums[f.id] / counts[f.id]) * 10) / 10,
        n: counts[f.id]
      };
    }
  });
  return out;
}

export function addDiaryField(mode, field = {}) {
  const map = loadDiarySchemaMap();
  const list = map[mode] || [];
  const type = field.type || 'quantitative';
  const labels = {
    qualitative: 'Notes field',
    scale10: 'Score (1-10)',
    quantitative: 'Number'
  };
  const hints = {
    qualitative: '',
    scale10: '(1-10)',
    quantitative: 'Any number'
  };
  list.push(normalizeField({
    id: uid(),
    label: field.label || labels[type] || 'Field',
    type,
    hint: field.hint != null ? field.hint : (hints[type] || ''),
    min: type === 'scale10' ? 1 : (field.min != null ? field.min : undefined),
    max: type === 'scale10' ? 10 : (field.max != null ? field.max : undefined)
  }));
  map[mode] = list;
  saveDiarySchemaMap(map);
  return map[mode];
}

export function removeDiaryField(mode, fieldId) {
  const map = loadDiarySchemaMap();
  map[mode] = (map[mode] || []).filter(f => f.id !== fieldId);
  if (!map[mode].length) map[mode] = (DEFAULTS[mode] || DEFAULTS.practice).map(f => ({ ...f }));
  saveDiarySchemaMap(map);
  return map[mode];
}

export function updateDiaryField(mode, fieldId, patch) {
  const map = loadDiarySchemaMap();
  map[mode] = (map[mode] || []).map(f => f.id === fieldId ? normalizeField({ ...f, ...patch, id: f.id }) : f);
  saveDiarySchemaMap(map);
  return map[mode];
}

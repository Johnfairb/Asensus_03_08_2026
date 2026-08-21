/**
 * Multi-select add-exercises popup grouped like My Exercises (library headings).
 * Strength muscle groups first, then plyos with no heading, then Cardio / Other.
 */
import { store } from '../state/store.js';
import { excludeBannedExercises } from '../domain/bans.js';
import { getLibraryMuscleGroup, LIBRARY_MUSCLE_ORDER } from '../domain/bodyweight-lifts.js';
import { getExerciseMeta } from '../domain/exercise-catalog.js';
import { isExerciseMuscleLocked } from '../domain/hypertrophy-engine.js';
import { allowsWeightInput } from '../domain/load-increments.js';
import { powerMovementForName } from '../domain/power-engine.js';
import { addExercisesByIds } from '../domain/workout-generator.js';

/** Sentinel: plyos sit after strength groups with no "Power" heading. */
const POWER_FLAT_GROUP = '__power_flat__';

function isPowerPickerExercise(ex) {
    if (!ex) return false;
    if (String(ex.domain || '').toLowerCase() === 'power') return true;
    if (String(getExerciseMeta(ex.name)?.domain || '').toLowerCase() === 'power') return true;
    return !!powerMovementForName(ex.name);
}

function groupExercisesForPicker() {
    const exercises = excludeBannedExercises(store.globalExerciseDB || []).filter((ex) => {
        if (!ex) return false;
        if (store.fatigueLockouts && ex.muscle_group && store.fatigueLockouts[ex.muscle_group]) {
            return false;
        }
        if (isExerciseMuscleLocked(ex.name)) return false;
        return true;
    });
    const grouped = new Map();
    exercises.forEach((ex) => {
        const displayName = getExerciseMeta(ex.name)?.name || ex.name;
        let heading;
        if (isPowerPickerExercise(ex)) {
            heading = POWER_FLAT_GROUP;
        } else {
            heading = getLibraryMuscleGroup(displayName);
            if (!heading) {
                const domain = String(ex.domain || '').toLowerCase();
                if (domain === 'cardio') heading = 'Cardio';
                else heading = 'Other';
            }
        }
        if (!grouped.has(heading)) grouped.set(heading, []);
        grouped.get(heading).push({ ex, displayName });
    });
    grouped.forEach((list) => list.sort((a, b) =>
        String(a.displayName || '').localeCompare(String(b.displayName || ''))
    ));
    const order = [...LIBRARY_MUSCLE_ORDER, POWER_FLAT_GROUP, 'Cardio', 'Other'];
    const headings = [
        ...order.filter((h) => (grouped.get(h) || []).length > 0),
        ...[...grouped.keys()].filter((h) => !order.includes(h))
    ];
    return { grouped, headings };
}

function isStrengthPickerExercise(ex) {
    if (isPowerPickerExercise(ex)) return false;
    const domain = String(ex?.domain || '').toLowerCase();
    if (domain === 'cardio' || domain === 'power' || domain === 'warmup') return false;
    if (/stretch|lactate|hit\s*class|steady/i.test(ex?.name || '')) return false;
    return allowsWeightInput(ex?.name);
}

const PARAM_INPUT_STYLE = "width:42px;margin:0;padding:6px 2px;font-size:10px;text-align:center;font-family:'Roboto Mono',monospace;";

function parseOptionalNumber(raw, { integer = false, min = 0 } = {}) {
    const s = String(raw ?? '').trim();
    if (s === '') return null;
    const n = integer ? parseInt(s, 10) : parseFloat(s);
    if (!Number.isFinite(n) || n < min) return null;
    return n;
}

export function openAddExercisesModal() {
    let modal = document.getElementById('add-exercises-modal');
    if (!modal) return;
    const list = document.getElementById('add-exercises-list');
    if (!list) return;

    const { grouped, headings } = groupExercisesForPicker();
    list.innerHTML = headings.map((heading) => {
        const rows = (grouped.get(heading) || []).map(({ ex, displayName }) => {
            const safeName = String(displayName || ex.name || '').replace(/</g, '&lt;');
            const id = String(ex.id).replace(/"/g, '&quot;');
            const strength = isStrengthPickerExercise(ex);
            const params = strength
                ? `<div class="add-ex-params" style="display:none;align-items:center;gap:4px;flex-shrink:0;">
                    <input type="number" min="1" step="1" inputmode="numeric" class="input-field add-ex-sets" placeholder="Sets" aria-label="Sets" style="${PARAM_INPUT_STYLE}" onclick="event.stopPropagation()">
                    <input type="number" min="0" step="0.5" inputmode="decimal" class="input-field add-ex-kg" placeholder="kg" aria-label="Work weight kg" style="${PARAM_INPUT_STYLE}width:48px;" onclick="event.stopPropagation()">
                    <input type="number" min="1" step="1" inputmode="numeric" class="input-field add-ex-reps" placeholder="Reps" aria-label="Reps" style="${PARAM_INPUT_STYLE}" onclick="event.stopPropagation()">
                </div>`
                : '';
            return `<div data-add-ex-row style="display:flex;align-items:center;gap:8px;padding:8px 4px;border-bottom:1px solid var(--border-subtle);">
                ${params}
                <label style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;cursor:pointer;">
                    <input type="checkbox" class="add-ex-check" value="${id}" data-strength="${strength ? '1' : '0'}" style="width:16px;height:16px;accent-color:var(--gold-accent);flex-shrink:0;">
                    <span style="font-size:13px;color:var(--text-main);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${safeName}</span>
                </label>
            </div>`;
        }).join('');
        if (heading === POWER_FLAT_GROUP) {
            return `<div style="margin:16px 0 12px;padding-top:8px;border-top:1px solid var(--border-subtle);">${rows}</div>`;
        }
        return `<details style="margin-bottom:12px;">
            <summary style="font-family:'Roboto Mono';font-size:11px;font-weight:800;color:var(--gold-accent);text-transform:uppercase;letter-spacing:0.5px;cursor:pointer;padding:6px 0;">${heading}</summary>
            <div>${rows || `<div style="font-size:11px;color:var(--text-muted);padding:8px 0;">None</div>`}</div>
        </details>`;
    }).join('') || `<div style="text-align:center;color:var(--text-muted);font-size:12px;padding:24px;">No exercises available.</div>`;

    list.querySelectorAll('.add-ex-check').forEach((cb) => {
        cb.addEventListener('change', () => {
            const params = cb.closest('[data-add-ex-row]')?.querySelector('.add-ex-params');
            if (params) params.style.display = cb.checked ? 'flex' : 'none';
        });
    });

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
}

export function closeAddExercisesModal() {
    const modal = document.getElementById('add-exercises-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.style.display = 'none';
}

function specFromCheckbox(check) {
    const row = check.closest('[data-add-ex-row]');
    if (!row) return {};
    const kgEl = row.querySelector('.add-ex-kg');
    const kgRaw = kgEl ? String(kgEl.value || '').trim() : '';
    const weight = parseOptionalNumber(kgRaw, { min: 0 });
    return {
        sets: parseOptionalNumber(row.querySelector('.add-ex-sets')?.value, { integer: true, min: 1 }),
        reps: parseOptionalNumber(row.querySelector('.add-ex-reps')?.value, { integer: true, min: 1 }),
        weight,
        weightProvided: kgRaw !== '' && weight != null
    };
}

export function confirmAddExercisesModal() {
    const checks = [...document.querySelectorAll('#add-exercises-list .add-ex-check:checked')];
    const ids = checks.map((c) => c.value).filter(Boolean);
    if (!ids.length) {
        closeAddExercisesModal();
        return;
    }
    const specsById = {};
    for (const c of checks) {
        const spec = specFromCheckbox(c);
        if (c.dataset.strength === '1' && (spec.sets == null || spec.reps == null)) {
            window.alert('Enter sets and reps for each added exercise.');
            return;
        }
        specsById[c.value] = spec;
    }
    addExercisesByIds(ids, specsById);
    closeAddExercisesModal();
    const menu = document.getElementById('tools-menu');
    if (menu) menu.classList.add('hidden');
    const btn = document.getElementById('btn-manual-add');
    if (btn) {
        btn.textContent = '+';
        btn.title = 'Add manually';
    }
}

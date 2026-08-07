/**
 * Multi-select add-exercises popup grouped like My Exercises (library headings).
 */
import { store } from '../state/store.js';
import { excludeBannedExercises } from '../domain/bans.js';
import { getLibraryMuscleGroup, LIBRARY_MUSCLE_ORDER } from '../domain/bodyweight-lifts.js';
import { getExerciseMeta } from '../domain/exercise-catalog.js';
import { addExercisesByIds } from '../domain/workout-generator.js';

function groupExercisesForPicker() {
    const exercises = excludeBannedExercises(store.globalExerciseDB || []).filter((ex) => {
        if (!ex) return false;
        if (store.fatigueLockouts && ex.muscle_group && store.fatigueLockouts[ex.muscle_group]) {
            return false;
        }
        return true;
    });
    const grouped = new Map();
    exercises.forEach((ex) => {
        const displayName = getExerciseMeta(ex.name)?.name || ex.name;
        let heading = getLibraryMuscleGroup(displayName);
        if (!heading) {
            const domain = String(ex.domain || '').toLowerCase();
            if (domain === 'power') heading = 'Power';
            else if (domain === 'cardio') heading = 'Cardio';
            else heading = 'Other';
        }
        if (!grouped.has(heading)) grouped.set(heading, []);
        grouped.get(heading).push({ ex, displayName });
    });
    grouped.forEach((list) => list.sort((a, b) =>
        String(a.displayName || '').localeCompare(String(b.displayName || ''))
    ));
    const order = [...LIBRARY_MUSCLE_ORDER, 'Power', 'Cardio', 'Other'];
    const headings = [
        ...order.filter((h) => (grouped.get(h) || []).length > 0),
        ...[...grouped.keys()].filter((h) => !order.includes(h))
    ];
    return { grouped, headings };
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
            return `<label style="display:flex;align-items:center;gap:10px;padding:8px 4px;border-bottom:1px solid var(--border-subtle);cursor:pointer;">
                <input type="checkbox" class="add-ex-check" value="${id}" style="width:16px;height:16px;accent-color:var(--gold-accent);">
                <span style="font-size:13px;color:var(--text-main);">${safeName}</span>
            </label>`;
        }).join('');
        return `<details style="margin-bottom:12px;">
            <summary style="font-family:'Roboto Mono';font-size:11px;font-weight:800;color:var(--gold-accent);text-transform:uppercase;letter-spacing:0.5px;cursor:pointer;padding:6px 0;">${heading}</summary>
            <div>${rows || `<div style="font-size:11px;color:var(--text-muted);padding:8px 0;">None</div>`}</div>
        </details>`;
    }).join('') || `<div style="text-align:center;color:var(--text-muted);font-size:12px;padding:24px;">No exercises available.</div>`;

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
}

export function closeAddExercisesModal() {
    const modal = document.getElementById('add-exercises-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.style.display = 'none';
}

export function confirmAddExercisesModal() {
    const checks = [...document.querySelectorAll('#add-exercises-list .add-ex-check:checked')];
    const ids = checks.map((c) => c.value).filter(Boolean);
    if (!ids.length) {
        closeAddExercisesModal();
        return;
    }
    addExercisesByIds(ids);
    closeAddExercisesModal();
    const menu = document.getElementById('tools-menu');
    if (menu) menu.classList.add('hidden');
    const btn = document.getElementById('btn-manual-add');
    if (btn) {
        btn.textContent = '+';
        btn.title = 'Add manually';
    }
}

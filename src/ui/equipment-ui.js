/**
 * First-confirm equipment picker + mid-session cable switch helpers.
 */
import { store } from '../state/store.js';
import {
    exercisesNeedingEquipmentPick,
    optionLabel,
    resolveLoadProfile,
    roundUpLoad
} from '../domain/load-increments.js';
import { buildHypertrophyWarmupSets } from '../domain/hypertrophy-engine.js';

let _pendingConfirmAfterPick = null;

export function ensureEquipmentPickModal() {
    let el = document.getElementById('equipment-pick-modal');
    const host = document.querySelector('.iphone-screen') || document.body;
    if (el) {
        if (el.parentElement !== host) host.appendChild(el);
        return el;
    }
    el = document.createElement('div');
    el.id = 'equipment-pick-modal';
    el.className = 'hidden';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.innerHTML = `
        <div class="modal-content stealth-panel equipment-pick-sheet" onclick="event.stopPropagation()">
            <div class="sheet-handle" style="margin:0 auto 12px;"></div>
            <div style="padding:0 16px 4px;">
                <div style="font-family:'Roboto Mono';font-size:10px;color:var(--gold-accent);font-weight:800;letter-spacing:1px;text-transform:uppercase;">Confirm workout</div>
                <h2 style="color:var(--text-main);font-family:'Roboto Mono',monospace;font-size:15px;text-transform:uppercase;margin:4px 0 0;letter-spacing:1px;">Choose equipment</h2>
                <p style="font-size:11px;color:var(--text-muted);line-height:1.45;margin:8px 0 0;">Required for each exercise below before the plan locks.</p>
            </div>
            <div id="equipment-pick-list" class="equipment-pick-list"></div>
            <p id="equipment-pick-error" class="hidden" style="font-size:11px;color:#ff6b6b;margin:0;padding:0 16px;font-family:'Roboto Mono';"></p>
            <div style="padding:12px 16px calc(16px + env(safe-area-inset-bottom, 0px));border-top:1px solid var(--border-subtle);">
                <button type="button" class="btn-primary is-primary" style="margin:0;width:100%;" onclick="confirmEquipmentPicks()">Confirm choices</button>
            </div>
        </div>`;
    el.addEventListener('click', (e) => {
        if (e.target === el) { /* block dismiss — must pick */ }
    });
    host.appendChild(el);
    return el;
}

/**
 * @returns {boolean} true if confirm can proceed; false if modal opened
 */
export function gateConfirmForEquipmentPicks(onReady) {
    const needing = exercisesNeedingEquipmentPick(store.currentGhostItems);
    if (!needing.length) return true;
    _pendingConfirmAfterPick = onReady;
    const modal = ensureEquipmentPickModal();
    const list = document.getElementById('equipment-pick-list');
    const err = document.getElementById('equipment-pick-error');
    if (err) {
        err.classList.add('hidden');
        err.textContent = '';
    }
    list.innerHTML = needing.map(({ name, options }, i) => {
        const radios = options.map((code) => `
            <label class="equipment-pick-option">
                <input type="radio" name="eq-pick-${i}" value="${code}" />
                <span>${optionLabel(code)}</span>
            </label>`).join('');
        return `
            <div class="equipment-pick-row" data-eq-name="${name.replace(/"/g, '&quot;')}" data-eq-idx="${i}">
                <div class="equipment-pick-name">${name}</div>
                <div class="equipment-pick-options">${radios}</div>
            </div>`;
    }).join('');
    modal.classList.remove('hidden');
    return false;
}

export function confirmEquipmentPicks() {
    const list = document.getElementById('equipment-pick-list');
    const err = document.getElementById('equipment-pick-error');
    if (!list) return;
    const blocks = [...list.querySelectorAll('[data-eq-name]')];
    const picks = [];
    for (const block of blocks) {
        const name = block.getAttribute('data-eq-name');
        const checked = block.querySelector('input[type="radio"]:checked');
        if (!checked) {
            if (err) {
                err.textContent = `Pick equipment for ${name}`;
                err.classList.remove('hidden');
            }
            return;
        }
        picks.push({ name, choice: checked.value });
    }

    const applyToItems = (items) => {
        (items || []).forEach((it) => {
            const name = it?.exercise?.name;
            if (!name) return;
            const hit = picks.find((p) => p.name === name);
            if (hit) {
                it.equipmentChoice = hit.choice;
                if (it.exercise) it.exercise.equipmentChoice = hit.choice;
            }
        });
    };
    applyToItems(store.currentGhostItems);
    applyToItems(store.activeLog?.items);

    // Rebuild warmups for chosen equipment where work weight already known
    (store.currentGhostItems || []).forEach((it) => {
        if (!it?.equipmentChoice || !it.exercise?.name) return;
        const work = (it.sets || []).find((s) => s && !s.isWarmup && !s.isText);
        const w = Number(work?.weight) || Number(it.workWeightKg) || 0;
        if (w <= 0) return;
        const reps = Number(work?.reps) || 10;
        const isIso = !!it.isIsolation;
        const warmups = buildHypertrophyWarmupSets(it.exercise.name, w, reps, isIso, {
            equipmentChoice: it.equipmentChoice
        });
        const working = (it.sets || []).filter((s) => s && !s.isWarmup);
        const roundedWork = working.map((s) => ({
            ...s,
            weight: roundUpLoad(Number(s.weight) || w, resolveLoadProfile(it.exercise.name, it.equipmentChoice, { weight: s.weight || w }))
        }));
        it.sets = [...warmups, ...roundedWork];
    });

    document.getElementById('equipment-pick-modal')?.classList.add('hidden');
    const cb = _pendingConfirmAfterPick;
    _pendingConfirmAfterPick = null;
    if (typeof cb === 'function') cb();
}

/**
 * Switch Fca/Cca mid-session: re-round incomplete future sets only.
 */
export function switchCableEquipment(exIdx, newChoice) {
    const item = store.activeLog?.items?.[exIdx];
    if (!item?.exercise?.name) return;
    if (newChoice !== 'Fca' && newChoice !== 'Cca') return;
    item.equipmentChoice = newChoice;
    if (item.exercise) item.exercise.equipmentChoice = newChoice;

    const sets = item.sets || [];
    let pastCompleted = true;
    const profile = resolveLoadProfile(item.exercise.name, newChoice);
    sets.forEach((s) => {
        if (!s || s.isText) return;
        if (s.completed) {
            pastCompleted = true;
            return;
        }
        // Future / current incomplete
        const raw = Number(s.weight) || 0;
        if (raw > 0) s.weight = roundUpLoad(raw, profile);
        pastCompleted = false;
    });
}

export function saveExerciseIncrementOverrides(exName, overridesByCode) {
    if (!store.userConfig.exerciseIncrements || typeof store.userConfig.exerciseIncrements !== 'object') {
        store.userConfig.exerciseIncrements = {};
    }
    store.userConfig.exerciseIncrements[exName] = {
        ...(store.userConfig.exerciseIncrements[exName] || {}),
        ...overridesByCode
    };
    try {
        import('../domain/thermodynamics.js').then((m) => m.persistUserConfigToCloud?.()).catch(() => {});
    } catch (e) { /* ignore */ }
}

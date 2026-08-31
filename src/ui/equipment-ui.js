/**
 * First-confirm equipment picker + mid-session cable switch helpers.
 */
import { store } from '../state/store.js';
import {
    catalogLoadOptions,
    exercisesNeedingEquipmentPick,
    expandLoadChoices,
    optionLabel,
    resolveLoadProfile,
    roundUpLoad
} from '../domain/load-increments.js';
import { buildHypertrophyWarmupSets, clusterItemsByEquipment, sessionUsesHypertrophyProgramming } from '../domain/hypertrophy-engine.js';

let _pendingConfirmAfterPick = null;

export function ensureEquipmentPickModal() {
    let el = document.getElementById('equipment-pick-modal');
    // Host inside the phone glass so fixed overlays stay framed on desktop;
    // on real phones .iphone-screen is pass-through full viewport.
    const host = document.querySelector('.iphone-screen') || document.body;
    const coverCss = 'position:fixed;inset:0;width:100%;height:100%;display:flex;justify-content:center;align-items:flex-end;padding:0;box-sizing:border-box;z-index:22000;background:rgba(0,0,0,0.45);pointer-events:auto;';
    if (el) {
        if (el.parentElement !== host) host.appendChild(el);
        // Keep coverage styles even if an older DOM node was left without them
        el.style.cssText = coverCss;
        return el;
    }
    el = document.createElement('div');
    el.id = 'equipment-pick-modal';
    el.className = 'hidden';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    // Inline fallback so the sheet covers the viewport even if CSS fails to load/cache
    el.style.cssText = coverCss;
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
                <button type="button" class="btn-primary is-primary" style="margin:0;width:100%;touch-action:manipulation;" onclick="confirmEquipmentPicks()">Confirm choices</button>
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

    if (sessionUsesHypertrophyProgramming()) {
        store.currentGhostItems = clusterItemsByEquipment(store.currentGhostItems || []);
        if (Array.isArray(store.activeLog?.items)) {
            store.activeLog.items = clusterItemsByEquipment(store.activeLog.items);
        }
    }

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
 * Switch equipment mid-session (cable Fca/Cca or barbell/dumbbell): re-round incomplete future sets only.
 */
export function switchLoadEquipment(exIdx, newChoice) {
    const item = store.activeLog?.items?.[exIdx];
    if (!item?.exercise?.name) return;
    const allowed = expandLoadChoices(catalogLoadOptions(item.exercise.name));
    if (!allowed.includes(newChoice)) return;
    item.equipmentChoice = newChoice;
    if (item.exercise) item.exercise.equipmentChoice = newChoice;

    const sets = item.sets || [];
    const profile = resolveLoadProfile(item.exercise.name, newChoice);
    sets.forEach((s) => {
        if (!s || s.isText) return;
        if (s.completed) return;
        const raw = Number(s.weight) || 0;
        if (raw > 0) s.weight = roundUpLoad(raw, profile);
    });
}

/**
 * Switch Fca/Cca mid-session: re-round incomplete future sets only.
 */
export function switchCableEquipment(exIdx, newChoice) {
    switchLoadEquipment(exIdx, newChoice);
}

export function saveExerciseIncrementOverrides(exName, overridesByCode) {
    if (!store.userConfig.exerciseIncrements || typeof store.userConfig.exerciseIncrements !== 'object') {
        store.userConfig.exerciseIncrements = {};
    }
    store.userConfig.exerciseIncrements[exName] = {
        ...(store.userConfig.exerciseIncrements[exName] || {}),
        ...overridesByCode
    };
    persistCableOrIncrementConfig();
}

function persistCableOrIncrementConfig() {
    try { localStorage.setItem('ascensus_settings', JSON.stringify(store.userConfig)); } catch (e) { /* ignore */ }
    try {
        import('../domain/thermodynamics.js').then((m) => m.persistUserConfigToCloud?.()).catch(() => {});
    } catch (e) { /* ignore */ }
}

function cableChoiceOfItem(it) {
    const name = it?.exercise?.name || it?.name;
    if (!name) return null;
    const choice = it.equipmentChoice || it.exercise?.equipmentChoice || null;
    const code = choice || resolveLoadProfile(name, choice)?.code;
    return code === 'Fca' || code === 'Cca' ? code : null;
}

function firstItemUsingCable(items, code) {
    return (items || []).find((it) => cableChoiceOfItem(it) === code) || null;
}

export function isCableStackConfirmed(code) {
    return !!(store.userConfig?.cableStackConfirmed?.[code]);
}

export function markCableStackConfirmed(code) {
    if (!code) return;
    if (!store.userConfig.cableStackConfirmed || typeof store.userConfig.cableStackConfirmed !== 'object') {
        store.userConfig.cableStackConfirmed = {};
    }
    store.userConfig.cableStackConfirmed[code] = true;
    persistCableOrIncrementConfig();
}

function sessionItemsForCableCheck() {
    if (Array.isArray(store.activeLog?.items) && store.activeLog.items.length) return store.activeLog.items;
    return store.currentGhostItems || [];
}

export function unconfirmedCableTypesInItems(items) {
    const list = items || sessionItemsForCableCheck();
    const found = [];
    ['Fca', 'Cca'].forEach((code) => {
        if (isCableStackConfirmed(code)) return;
        if (firstItemUsingCable(list, code)) found.push(code);
    });
    return found;
}

let _cableQueue = [];
let _cableAfter = null;
let _cableExName = '';

function ensureCableIncrementModal() {
    let el = document.getElementById('cable-increment-modal');
    const host = document.querySelector('.iphone-screen') || document.body;
    const coverCss = 'position:fixed;inset:0;width:100%;height:100%;display:flex;justify-content:center;align-items:flex-end;padding:0;box-sizing:border-box;z-index:22100;background:rgba(0,0,0,0.45);pointer-events:auto;';
    if (el) {
        if (el.parentElement !== host) host.appendChild(el);
        el.style.cssText = coverCss;
        return el;
    }
    el = document.createElement('div');
    el.id = 'cable-increment-modal';
    el.className = 'hidden';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.style.cssText = coverCss;
    el.innerHTML = `
        <div class="modal-content stealth-panel equipment-pick-sheet" onclick="event.stopPropagation()">
            <div class="sheet-handle" style="margin:0 auto 12px;"></div>
            <div style="padding:0 16px 4px;">
                <div style="font-family:'Roboto Mono';font-size:10px;color:var(--gold-accent);font-weight:800;letter-spacing:1px;text-transform:uppercase;">Cable stack</div>
                <h2 id="cable-increment-title" style="color:var(--text-main);font-family:'Roboto Mono',monospace;font-size:15px;text-transform:uppercase;margin:4px 0 0;letter-spacing:1px;">Are the weights correct?</h2>
                <p id="cable-increment-body" style="font-size:13px;color:var(--text-muted);line-height:1.45;margin:8px 0 0;"></p>
            </div>
            <div style="padding:12px 16px calc(16px + env(safe-area-inset-bottom, 0px));border-top:1px solid var(--border-subtle);display:flex;flex-direction:column;gap:8px;">
                <button type="button" class="btn-primary is-primary" style="margin:0;width:100%;" onclick="confirmCableIncrementsYes()">Yes — weights look right</button>
                <button type="button" class="btn-primary is-secondary" style="margin:0;width:100%;" onclick="confirmCableIncrementsNo()">No — correct increments</button>
            </div>
        </div>`;
    host.appendChild(el);
    return el;
}

function showNextCableConfirm() {
    const code = _cableQueue[0];
    if (!code) {
        document.getElementById('cable-increment-modal')?.classList.add('hidden');
        const cb = _cableAfter;
        _cableAfter = null;
        if (typeof cb === 'function') cb();
        return;
    }
    const items = sessionItemsForCableCheck();
    const it = firstItemUsingCable(items, code);
    _cableExName = it?.exercise?.name || it?.name || '';
    const label = optionLabel(code);
    const modal = ensureCableIncrementModal();
    const title = document.getElementById('cable-increment-title');
    const body = document.getElementById('cable-increment-body');
    if (title) title.textContent = `${label} — are the weights correct?`;
    if (body) {
        body.textContent = `First time using ${label.toLowerCase()}. Check that the stack min and increment match the machine. If they don't, we'll open the increment editor for ${ _cableExName || 'this exercise' }.`;
    }
    modal.classList.remove('hidden');
}

/**
 * @returns {boolean} true if confirm can proceed; false if modal opened
 */
export function gateConfirmForCableIncrements(onReady, items) {
    const needed = unconfirmedCableTypesInItems(items || sessionItemsForCableCheck());
    if (!needed.length) return true;
    _cableQueue = needed.slice();
    _cableAfter = onReady;
    showNextCableConfirm();
    return false;
}

export function maybePromptCableIncrementConfirm(onReady) {
    return gateConfirmForCableIncrements(typeof onReady === 'function' ? onReady : () => {});
}

export function confirmCableIncrementsYes() {
    const code = _cableQueue.shift();
    if (code) markCableStackConfirmed(code);
    showNextCableConfirm();
}

export function confirmCableIncrementsNo() {
    const code = _cableQueue.shift();
    const exName = _cableExName;
    if (code) markCableStackConfirmed(code);
    document.getElementById('cable-increment-modal')?.classList.add('hidden');
    _cableQueue = [];
    const cb = _cableAfter;
    _cableAfter = null;
    if (typeof cb === 'function') cb();
    openCableIncrementEditor(exName);
}

async function openCableIncrementEditor(exName) {
    if (!exName) return;
    try {
        const { openMyExercises } = await import('./navigation.js');
        const { openExerciseDetailByName } = await import('./fuel.js');
        openMyExercises();
        openExerciseDetailByName(exName, { scrollToIncrements: true });
    } catch (e) {
        console.warn('openCableIncrementEditor', e);
    }
}


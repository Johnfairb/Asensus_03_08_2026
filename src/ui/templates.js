import { store } from '../state/store.js';
import { applyDietFilter } from '../domain/food-catalog.js';
import { excludeBannedExercises, excludeBannedFoods } from '../domain/bans.js';
import { getLibraryMuscleGroup, LIBRARY_MUSCLE_ORDER } from '../domain/bodyweight-lifts.js';
import { getExerciseMeta } from '../domain/exercise-catalog.js';
import { isGuidanceOff } from '../domain/fitness-hud.js';
import { getVisualPortion, resolveDayMealItems } from '../domain/meal-planner.js';
import { smartRoundMass } from '../domain/thermodynamics.js';
import { generateWorkoutTemplate } from '../domain/workout-generator.js';
import { renderWorkoutLog } from './drive.js';
import { clearWorkoutDraft, saveWorkoutDraft } from '../domain/workout-draft.js';
import { resetWorkoutTimer, startWorkoutTimer } from './workout-timer.js';

// ==========================================
// 7. TEMPLATE MANAGER & GHOST PLANNER
// ==========================================
export function parseTemplateDetails(raw) {
    if (Array.isArray(raw)) return raw;
    try {
        const parsed = JSON.parse(raw || '[]');
        if (Array.isArray(parsed)) return parsed;
        if (parsed && Array.isArray(parsed.items)) return parsed.items;
        return [];
    } catch (e) { return []; }
}

export function parseTemplateMeta(raw) {
    try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw;
        if (parsed && !Array.isArray(parsed) && parsed.sessionKind) return { sessionKind: parsed.sessionKind };
    } catch (e) { /* ignore */ }
    return {};
}

export function updateSaveTemplateButtonLabel() {
    const btn = document.getElementById('btn-save-as-template');
    const loadRecipeBtn = document.getElementById('btn-load-recipe');
    const loadWorkoutBtn = document.getElementById('btn-load-workout-picker');
    if (!btn) return;
    const type = document.getElementById('log-type-selector')?.value || store.activeLog.type;
    const isMeal = ['breakfast', 'lunch', 'dinner', 'snack'].includes(type);
    if (type === 'workout') {
        btn.textContent = 'Save Workout';
        btn.style.display = '';
        if (loadRecipeBtn) loadRecipeBtn.classList.add('hidden');
        if (loadWorkoutBtn) loadWorkoutBtn.classList.remove('hidden');
    } else if (type === 'weight' || type === 'bodyfat') {
        btn.style.display = 'none';
        if (loadRecipeBtn) loadRecipeBtn.classList.add('hidden');
        if (loadWorkoutBtn) loadWorkoutBtn.classList.add('hidden');
    } else {
        btn.textContent = 'Save Recipe';
        btn.style.display = '';
        if (loadRecipeBtn) loadRecipeBtn.classList.toggle('hidden', !isMeal);
        if (loadWorkoutBtn) loadWorkoutBtn.classList.add('hidden');
    }
}

export function switchFoodsSubTab(panel, btn) {
    // Legacy alias → Library
    if (typeof window.switchLibrarySubTab === 'function') {
        window.switchLibrarySubTab(panel === 'recipes' ? 'recipes' : 'foods', btn);
        return;
    }
    document.getElementById('library-panel-foods')?.classList.toggle('hidden', panel !== 'foods');
    document.getElementById('library-panel-recipes')?.classList.toggle('hidden', panel !== 'recipes');
}

export function switchExercisesSubTab(panel, btn) {
    // Legacy alias → Library
    if (typeof window.switchLibrarySubTab === 'function') {
        window.switchLibrarySubTab(panel === 'workouts' ? 'workouts' : 'exercises', btn);
        return;
    }
    document.getElementById('library-panel-exercises')?.classList.toggle('hidden', panel !== 'exercises');
    document.getElementById('library-panel-workouts')?.classList.toggle('hidden', panel !== 'workouts');
}

export function switchLogisticsSubTab(panel, btn) {
    document.getElementById('logistics-panel-shop')?.classList.toggle('hidden', panel !== 'shop');
    document.getElementById('logistics-panel-pantry')?.classList.toggle('hidden', panel !== 'pantry');
    document.querySelectorAll('#tab-logistics .catalogue-sub-btn').forEach(b => {
        const on = b === btn;
        b.classList.toggle('active', on);
        b.classList.toggle('is-primary', on);
        b.classList.toggle('is-secondary', !on);
        b.style.borderColor = '';
        b.style.color = '';
    });
}

export function filterSavedLibrary(kind) {
    const term = (document.getElementById(kind === 'recipe' ? 'search-recipe' : 'search-workout')?.value || '').toLowerCase();
    const listId = kind === 'recipe' ? 'recipe-list' : 'workout-library-list';
    document.querySelectorAll(`#${listId} .saved-library-row`).forEach(row => {
        row.style.display = row.innerText.toLowerCase().includes(term) ? 'flex' : 'none';
    });
}

export function renderMyWorkouts() {
    const list = document.getElementById('workout-library-list');
    if (!list) return;
    const workouts = (store.globalTemplates || []).filter(t => t.type === 'workout');
    if (!workouts.length) {
        list.innerHTML = `<div style="text-align:center; padding:24px 8px; color:var(--text-muted); font-size:12px; line-height:1.5;">No saved workouts yet.<br>Log a session on Drive, then tap <strong style="color:var(--text-main);">Save Workout</strong>.</div>`;
        return;
    }
    list.innerHTML = workouts.map(t => {
        const items = parseTemplateDetails(t.details);
        const count = items.length;
        const safeName = String(t.name || 'Untitled').replace(/</g, '&lt;');
        return `<div class="saved-library-row" style="display:flex; justify-content:space-between; align-items:center; padding:14px 0; border-bottom:1px dashed var(--border-highlight); gap:10px;">
            <div style="min-width:0;">
                <div style="font-size:14px; color:var(--text-main); font-weight:700; margin-bottom:4px;">${safeName}</div>
                <div style="color:var(--text-muted); text-transform:uppercase; font-size:9px; font-family:'Roboto Mono'; letter-spacing:0.5px;">${count} exercise${count === 1 ? '' : 's'}</div>
            </div>
            <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
                <button type="button" onclick="loadSavedTemplate('${t.id}')" style="background:rgba(212,175,55,0.08); border:1px solid var(--gold-accent); color:var(--gold-accent); font-size:10px; font-family:'Roboto Mono'; font-weight:700; padding:8px 10px; border-radius:8px; cursor:pointer;">LOAD</button>
                <button type="button" onclick="deleteSavedTemplate('${t.id}')" style="background:none; color:var(--text-stealth); border:none; cursor:pointer; padding:4px;" title="Delete">${'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>'}</button>
            </div>
        </div>`;
    }).join('');
}

export function renderMyRecipes() {
    const list = document.getElementById('recipe-list');
    if (!list) return;
    const recipes = (store.globalTemplates || []).filter(t => t.type === 'meal' || t.type === 'recipe');
    if (!recipes.length) {
        list.innerHTML = `<div style="text-align:center; padding:24px 8px; color:var(--text-muted); font-size:12px; line-height:1.5;">No saved recipes yet.<br>Log a meal on Drive, then tap <strong style="color:var(--text-main);">Save Recipe</strong>.</div>`;
        return;
    }
    list.innerHTML = recipes.map(t => {
        const items = parseTemplateDetails(t.details);
        const count = items.length;
        const safeName = String(t.name || 'Untitled').replace(/</g, '&lt;');
        return `<div class="saved-library-row" style="display:flex; justify-content:space-between; align-items:center; padding:14px 0; border-bottom:1px dashed var(--border-highlight); gap:10px;">
            <div style="min-width:0;">
                <div style="font-size:14px; color:var(--text-main); font-weight:700; margin-bottom:4px;">${safeName}</div>
                <div style="color:var(--text-muted); text-transform:uppercase; font-size:9px; font-family:'Roboto Mono'; letter-spacing:0.5px;">${count} ingredient${count === 1 ? '' : 's'}</div>
            </div>
            <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
                <button type="button" onclick="loadSavedTemplate('${t.id}')" style="background:rgba(212,175,55,0.08); border:1px solid var(--gold-accent); color:var(--gold-accent); font-size:10px; font-family:'Roboto Mono'; font-weight:700; padding:8px 10px; border-radius:8px; cursor:pointer;">LOAD</button>
                <button type="button" onclick="deleteSavedTemplate('${t.id}')" style="background:none; color:var(--text-stealth); border:none; cursor:pointer; padding:4px;" title="Delete">${'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>'}</button>
            </div>
        </div>`;
    }).join('');
}

export async function loadTemplates() {
    const { data, error } = await store.supabaseClient.from('user_templates').select('*');
    let cloud = (!error && data) ? data : [];
    // Merge any offline-only saves
    try {
        const local = JSON.parse(localStorage.getItem('ascensus_local_templates') || '[]');
        if (Array.isArray(local) && local.length) {
            const ids = new Set(cloud.map(t => String(t.id)));
            local.forEach(t => { if (!ids.has(String(t.id))) cloud.push(t); });
        }
    } catch (e) {}
    store.globalTemplates = cloud;
    refreshTemplateSelector();
    renderMyWorkouts();
    renderMyRecipes();
}

/** Populate #template-selector with only workouts or only recipes for the active log type. */
export function refreshTemplateSelector() {
    const select = document.getElementById('template-selector');
    if (!select) return;
    const logType = store.activeLog?.type || document.getElementById('log-type-selector')?.value || '';
    const isWorkout = logType === 'workout';
    const isMeal = ['breakfast', 'lunch', 'dinner', 'snack'].includes(logType);
    const all = store.globalTemplates || [];
    const list = isWorkout
        ? all.filter(t => t.type === 'workout')
        : (isMeal ? all.filter(t => t.type === 'meal' || t.type === 'recipe') : all);

    const placeholder = isWorkout
        ? 'Select saved workout...'
        : (isMeal ? 'Select saved recipe...' : 'Select saved workout / recipe...');
    let html = `<option value="">${placeholder}</option>`;
    list.forEach(t => {
        html += `<option value="${t.id}">${t.name}</option>`;
    });
    select.innerHTML = html;
}

export async function saveCurrentAsTemplate() {
    if (store.activeLog.type === 'weight' || store.activeLog.type === 'bodyfat') return alert('Weight and body fat logs cannot be saved as a workout or recipe.');
    if (!store.activeLog.items || store.activeLog.items.length === 0) return alert('Add at least one item before saving.');

    const isWorkout = store.activeLog.type === 'workout';
    const tName = prompt(isWorkout
        ? 'Name this workout (e.g. Push Day A):'
        : 'Name this recipe (e.g. High-Protein Breakfast):');
    if (!tName || !String(tName).trim()) return;

    const sessionKind = isWorkout
        ? (window.manualSessionKind || document.getElementById('today-focus')?.value || 'Full Body / Strength')
        : null;
    const detailsPayload = isWorkout
        ? { sessionKind, items: store.activeLog.items }
        : store.activeLog.items;
    const payload = {
        type: isWorkout ? 'workout' : 'meal',
        name: String(tName).trim(),
        details: JSON.stringify(detailsPayload),
        sessionKind: sessionKind || undefined
    };

    const { data, error } = await store.supabaseClient.from('user_templates').insert([payload]).select();
    if (error || !data || !data[0]) {
        // Offline / cloud failure — keep a local copy so My Workouts / My Recipes still work
        const localRow = { id: 'local_' + Date.now(), ...payload };
        store.globalTemplates = [...(store.globalTemplates || []), localRow];
        try {
            const local = JSON.parse(localStorage.getItem('ascensus_local_templates') || '[]');
            local.push(localRow);
            localStorage.setItem('ascensus_local_templates', JSON.stringify(local));
        } catch (e) {}
        alert((isWorkout ? 'Workout' : 'Recipe') + ' saved locally (cloud sync unavailable).');
    } else {
        alert((isWorkout ? 'Workout' : 'Recipe') + ' saved!');
    }
    await loadTemplates();
    document.getElementById('tools-menu')?.classList.add('hidden');
}

export function applyUserTemplate() {
    const id = document.getElementById('template-selector')?.value;
    if (!id) {
        const isWorkout = store.activeLog?.type === 'workout';
        return alert(isWorkout ? 'Select a saved workout first.' : 'Select a saved recipe first.');
    }
    const template = (store.globalTemplates || []).find(t => String(t.id) === String(id));
    if (!template) return alert('Saved item not found.');
    if (store.activeLog?.type === 'workout' && template.type !== 'workout') {
        return alert('Only saved workouts can be loaded here.');
    }
    if (['breakfast', 'lunch', 'dinner', 'snack'].includes(store.activeLog?.type)
        && template.type !== 'meal' && template.type !== 'recipe') {
        return alert('Only saved recipes can be loaded here.');
    }
    loadSavedTemplate(id);
}

export function loadSavedTemplate(id) {
    const template = (store.globalTemplates || []).find(t => String(t.id) === String(id));
    if (!template) return alert('Saved item not found.');

    // Never load a recipe into a workout session (or vice versa) from this path
    if (store.activeLog?.type === 'workout' && template.type !== 'workout') {
        return alert('Only saved workouts can be loaded into a workout log.');
    }

    const items = parseTemplateDetails(template.details);
    if (!items.length) return alert('That save is empty.');

    window.manualWorkoutMode = template.type === 'workout';
    if (template.type === 'workout') document.getElementById('log-type-selector').value = 'workout';
    else document.getElementById('log-type-selector').value = 'lunch';

    switchLogType();
    store.activeLog.items = items;
    if (store.activeLog.type === 'workout') {
        store.activeLog.items.forEach(ex => {
            if (Array.isArray(ex.sets)) ex.sets.forEach(s => { s.completed = false; });
        });
    }

    const zone = document.getElementById('execution-zone');
    const fuelToggles = document.getElementById('fuel-toggles');
    document.getElementById('current-route-title').innerText = template.type === 'workout' ? 'SAVED WORKOUT' : 'SAVED RECIPE';
    if (fuelToggles) fuelToggles.style.display = template.type === 'workout' ? 'none' : 'flex';
    if (template.type === 'workout') {
        document.body.classList.add('workout-focus-mode');
        window.journalMode = 'workout';
        resetWorkoutTimer();
        startWorkoutTimer();
        window._workoutSessionConfirmed = true;
        saveWorkoutDraft({ elapsedMs: 0 });
    } else {
        document.body.classList.remove('workout-focus-mode');
    }
    updateSaveTemplateButtonLabel();
    renderActiveLog();
    document.getElementById('tools-menu')?.classList.add('hidden');
    document.getElementById('ghost-template-container')?.classList.add('hidden');

    if (zone) {
        zone.classList.remove('hidden');
        setTimeout(() => zone.classList.add('show'), 10);
    }
}

export async function deleteSavedTemplate(id) {
    if (!confirm('Delete this saved item?')) return;
    const isLocal = String(id).startsWith('local_');
    if (!isLocal) {
        const { error } = await store.supabaseClient.from('user_templates').delete().eq('id', id);
        if (error) console.warn('Cloud delete failed', error);
    }
    try {
        const local = JSON.parse(localStorage.getItem('ascensus_local_templates') || '[]').filter(t => String(t.id) !== String(id));
        localStorage.setItem('ascensus_local_templates', JSON.stringify(local));
    } catch (e) {}
    store.globalTemplates = (store.globalTemplates || []).filter(t => String(t.id) !== String(id));
    await loadTemplates();
}


export function updateFoodDropdowns() {
    let options = '<option value="">+ Manual Food...</option>';
    excludeBannedFoods(store.globalFoodDB).forEach(f => options += `<option value="${f.id}">${f._cleanName}</option>`);
    const select = document.getElementById('select-food');
    if(select) select.innerHTML = options;
}

export function updateExerciseDropdowns() {
    const select = document.getElementById('select-exercise');
    if (!select) return;

    const exercises = excludeBannedExercises(store.globalExerciseDB || []);
    const grouped = new Map();
    exercises.forEach(ex => {
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
    grouped.forEach(list => list.sort((a, b) =>
        String(a.displayName || '').localeCompare(String(b.displayName || ''))
    ));

    const order = [...LIBRARY_MUSCLE_ORDER, 'Power', 'Cardio', 'Other'];
    const headings = [
        ...order.filter(h => (grouped.get(h) || []).length > 0),
        ...[...grouped.keys()].filter(h => !order.includes(h))
    ];

    let options = '<option value="">+ Manual Exercise...</option>';
    headings.forEach(heading => {
        const safeLabel = String(heading).replace(/"/g, '&quot;');
        options += `<optgroup label="${safeLabel}">`;
        (grouped.get(heading) || []).forEach(({ ex, displayName }) => {
            const safeName = String(displayName || ex.name || '').replace(/</g, '&lt;');
            options += `<option value="${ex.id}">${safeName}</option>`;
        });
        options += '</optgroup>';
    });
    select.innerHTML = options;
}

export function updateGhostOverride(slotKey, foodId) { 
    store.ghostOverrides[slotKey] = foodId; 
    let food = store.globalFoodDB.find(f => f.id == foodId);
    if (food) {
        food.preference_score = (food.preference_score || 0) + 1;
        store.supabaseClient.from('food_inventory').update({ preference_score: food.preference_score }).eq('id', foodId).then();
    }
    loadGhostTemplate(); 
}

export function switchLogType() {
    const type = document.getElementById('log-type-selector').value;
    store.activeLog.type = type;
    store.activeLog.items = []; 
    document.getElementById('ghost-template-container').classList.add('hidden');
    document.getElementById('active-log-list').innerHTML = '';
    document.getElementById('log-status').innerText = '';
    updateSaveTemplateButtonLabel();
    updateExecutionAuxBlocks(type);
    refreshTemplateSelector();
}

export function updateExecutionAuxBlocks(type) {
    const t = type || store.activeLog.type;
    const hydra = document.getElementById('meal-hydration-block');
    const hydraInput = document.getElementById('meal-hydration-ml');
    const loadBtn = document.getElementById('btn-load-workout-picker');
    const loadRecipeBtn = document.getElementById('btn-load-recipe');
    const addBtn = document.getElementById('btn-manual-add');
    const tools = document.getElementById('tools-menu');
    const isMeal = ['breakfast', 'lunch', 'dinner', 'snack'].includes(t);
    if (hydra) hydra.classList.toggle('hidden', !isMeal);
    if (hydraInput && isMeal) hydraInput.value = '';
    if (loadBtn) loadBtn.classList.toggle('hidden', t !== 'workout');
    if (loadRecipeBtn) loadRecipeBtn.classList.toggle('hidden', !isMeal);
    const unconfirmBtn = document.getElementById('btn-unconfirm-route');
    if (unconfirmBtn) unconfirmBtn.classList.add('hidden');
    // Weight / body fat logs only need Complete Log — no manual-add (+)
    if (addBtn) {
        addBtn.style.display = (t === 'weight' || t === 'bodyfat') ? 'none' : '';
        addBtn.textContent = '+';
        addBtn.title = 'Add manually';
        addBtn.setAttribute('aria-label', 'Add manually');
    }
    if (tools) tools.classList.add('hidden');
    // Keep food/exercise pickers hidden until + is opened
    const foodSel = document.getElementById('select-food');
    const exSel = document.getElementById('select-exercise');
    if (foodSel) foodSel.style.display = 'none';
    if (exSel) exSel.style.display = 'none';
}

export function loadGhostTemplate() {
    const container = document.getElementById('ghost-template-container');
    const content = document.getElementById('ghost-content');
    store.currentGhostItems = [];

    if (store.activeLog.type === 'weight') {
        content.innerHTML = `
            <div style="text-align:center; padding: 12px 0 8px 0;">
                <div style="font-size:10px; color:var(--gold-accent); text-transform:uppercase; font-weight:bold; margin-bottom:12px; letter-spacing:2px;">Step on the scale</div>
                <input type="number" step="0.1" min="20" max="250" id="drive-weight-input" class="input-field" inputmode="decimal" autocomplete="off" value="${store.userConfig.weight || ''}" placeholder="e.g. 84.2" style="width:100%; font-size:32px; font-weight:800; text-align:center; color:var(--text-main); background:var(--bg-surface-elevated); border:1px solid var(--border-highlight); border-radius:12px; outline:none; padding:18px 12px; -webkit-user-select:text; user-select:text; pointer-events:auto;">
                <div style="font-size:12px; color:var(--text-muted); margin-top:10px;">Kilograms (KG)</div>
                <div style="font-size:11px; color:var(--text-muted); margin-top:14px; line-height:1.4;">Enter weight, then tap <strong style="color:var(--gold-accent);">Complete Log</strong>.</div>
            </div>`;
        container.classList.remove('hidden');
        const lockBtn = document.getElementById('btn-lock-in-route');
        if (lockBtn) lockBtn.style.display = 'none';
        setTimeout(() => {
            const wEl = document.getElementById('drive-weight-input');
            if (wEl) { wEl.focus(); wEl.select(); }
        }, 80);
        return;
    }

    if (store.activeLog.type === 'bodyfat') {
        const bfVal = store.userConfig.bodyFat > 0 ? store.userConfig.bodyFat : '';
        content.innerHTML = `
            <div style="text-align:center; padding: 12px 0 8px 0;">
                <div style="font-size:10px; color:var(--gold-accent); text-transform:uppercase; font-weight:bold; margin-bottom:12px; letter-spacing:2px;">Body fat</div>
                <input type="number" step="0.1" min="1" max="100" id="drive-bf-input" class="input-field" inputmode="decimal" autocomplete="off" value="${bfVal}" placeholder="e.g. 12.5" style="width:100%; font-size:32px; font-weight:800; text-align:center; color:var(--text-main); background:var(--bg-surface-elevated); border:1px solid var(--border-highlight); border-radius:12px; outline:none; padding:18px 12px; -webkit-user-select:text; user-select:text; pointer-events:auto;">
                <div style="font-size:12px; color:var(--text-muted); margin-top:10px;">Body fat %</div>
                <div style="font-size:11px; color:var(--text-muted); margin-top:14px; line-height:1.4;">Enter value, then tap <strong style="color:var(--gold-accent);">Complete Log</strong>.</div>
            </div>`;
        container.classList.remove('hidden');
        const lockBtn = document.getElementById('btn-lock-in-route');
        if (lockBtn) lockBtn.style.display = 'none';
        setTimeout(() => {
            const bfEl = document.getElementById('drive-bf-input');
            if (bfEl) { bfEl.focus(); bfEl.select(); }
        }, 80);
        return;
    }
    
    if (store.activeLog.type === 'workout') {
        const lockBtnWorkout = document.getElementById('btn-lock-in-route');
        if (lockBtnWorkout) lockBtnWorkout.textContent = 'Confirm workout';
        if (window.manualWorkoutMode) {
            content.innerHTML = `
                <div style="text-align:center;">
                    <p style="font-size:12px; color:var(--text-muted); font-weight:600; line-height:1.5; margin:0;">Manual workout — no GPS template. Use <strong style="color:var(--gold-accent);">Load Workout</strong> below, or tap <strong style="color:var(--gold-accent);">+</strong> to add exercises, then Complete Log.</p>
                </div>`;
            container.classList.remove('hidden');
            if (lockBtnWorkout) lockBtnWorkout.style.display = 'none';
            return;
        }
        if (typeof generateWorkoutTemplate === "function") generateWorkoutTemplate();
        return;
    }
    if (isGuidanceOff('food') && ['breakfast','lunch','dinner','snack'].includes(store.activeLog.type)) {
        content.innerHTML = "<p style='font-size:12px; color:var(--text-muted); text-align:center; font-weight:600;'>Food guidance is off. Use '+' to log meals manually — no recommended plate.</p>";
        container.classList.remove('hidden');
        const lockBtn = document.getElementById('btn-lock-in-route');
        if (lockBtn) lockBtn.style.display = 'none';
        return;
    }
    if (store.globalFoodDB.length === 0) return alert("Add staples to your Pantry first!");
    if (store.activeLog.type === 'snack') {
        content.innerHTML = "<p style='font-size:12px; color:var(--gold-accent); text-align:center; font-weight:600;'>Snacks are free-form. Use the '+' button below to log your extra items.</p>";
        container.classList.remove('hidden');
        const lockBtn = document.getElementById('btn-lock-in-route');
        if (lockBtn) lockBtn.style.display = 'none';
        return;
    }

    const mealsTotal = store.userConfig.mealsPerDay || 3;
    let mealsLeft = Math.max(1, mealsTotal - store.consumedToday.mealsLogged);
    
    let remainingPro = store.userConfig.targets.pro - store.consumedToday.pro;
    let remainingCarb = store.userConfig.targets.carb - store.consumedToday.carb;
    let remainingFat = store.userConfig.targets.fat - store.consumedToday.fat;

    // THE GPS SHOCK ABSORBER
    // Never drop a meal below a satiating baseline. If they blew their calories earlier today, 
    // absorb the debt into the WEEKLY rolling average rather than starving them at dinner.
    let activePro = Math.max(30, remainingPro / mealsLeft);
    let activeCarb = Math.max(20, remainingCarb / mealsLeft);
    let activeFat = Math.max(10, remainingFat / mealsLeft);

    // Did they overeat? Calculate overflow and spread it over tomorrow and the rest of the week.
    let predictedMealCals = (activePro * 4) + (activeCarb * 4) + (activeFat * 9);
    let projectedTodayCals = store.consumedToday.cals + predictedMealCals;
    
    if (projectedTodayCals > store.userConfig.targets.cals) {
        let overflow = projectedTodayCals - store.userConfig.targets.cals;
        let daysLeftInWeek = 7 - new Date().getDay(); 
        if (daysLeftInWeek > 0 && overflow > 100) {
            let dailyPenalty = Math.round(overflow / daysLeftInWeek);
            store.userConfig.tdeePenalty = (store.userConfig.tdeePenalty || 0) + dailyPenalty;
            localStorage.setItem('ascensus_settings', JSON.stringify(store.userConfig));
            // Show alert so user knows the GPS handled it.
            const rerouteEl = document.getElementById('reroute-notice');
            if (rerouteEl) {
                rerouteEl.style.display = 'block';
                rerouteEl.innerText = `Over target — about ${dailyPenalty} kcal shifted into later days. Eat your planned meal.`;
            }
        }
    }

    const getFoodsByCat = (cat) => excludeBannedFoods(applyDietFilter(store.globalFoodDB.filter(f => f._category === cat)));

    const renderSlot = (slotKey, label, cat, resolvedFood, mass, customDisplayStr = null, isFixed = false, customList = null) => {
        const massText = customDisplayStr || getVisualPortion(mass, cat);
        if (isFixed) {
            return `<div class="ghost-row"><div style="flex:1;"><div style="font-size:9px; color:var(--gold-accent); text-transform:uppercase; font-weight:bold; margin-bottom:2px;">${label} (LOCKED)</div><div style="font-size:13px; color:var(--text-main); padding:6px 0;">${resolvedFood._cleanName}</div></div><div class="ghost-mass" style="width:75px; text-align:right; font-size:14px; color:var(--text-main);">${massText}</div></div>`;
        }
        let options = '';
        let listToUse = customList || getFoodsByCat(cat);
        // Include resolved food even if it came from another category (chickpeas etc.)
        if (resolvedFood?.id && !listToUse.some(f => f.id == resolvedFood.id)) {
            listToUse = [resolvedFood, ...listToUse];
        }
        listToUse.forEach(f => { let sel = f.id == resolvedFood.id ? 'selected' : ''; options += `<option value="${f.id}" ${sel}>${f._cleanName}</option>`; });
        return `<div class="ghost-row"><div style="flex:1;"><div style="font-size:9px; color:var(--gold-accent); text-transform:uppercase; font-weight:bold; margin-bottom:2px;">${label}</div><select class="input-field" style="padding:6px; margin:0; font-size:13px; width:95%; background:var(--bg-surface-elevated); border: 1px solid var(--border-highlight); color:var(--text-main);" onchange="updateGhostOverride('${slotKey}', this.value)">${options || '<option>No options</option>'}</select></div><div class="ghost-mass" style="width:75px; text-align:right; font-size:14px; color:var(--text-main);">${massText}</div></div>`;
    };

    const mealType = store.activeLog.type;
    if (!['breakfast', 'lunch', 'dinner'].includes(mealType)) {
        content.innerHTML = "<p style='font-size:12px; color:var(--text-muted); text-align:center; font-weight:600;'>Use '+' to add foods.</p>";
        container.classList.remove('hidden');
        return;
    }

    // Resolve with the same day targets as Today's plan / recipe modal so name + foods match.
    // Then re-scale primary PRO/CARB masses to the remaining-macro shock absorber.
    const dayMeals = resolveDayMealItems({
        tPro: store.userConfig.targets.pro,
        tCarb: store.userConfig.targets.carb,
        forDate: new Date()
    });
    const mealPlan = dayMeals.find(m => m.meal === mealType) || dayMeals[0];
    let html = '';
    if (mealPlan?.recipeName) {
        const safeId = String(mealPlan.recipeId || '').replace(/'/g, "\\'");
        const todayIso = (() => {
            const d = new Date();
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        })();
        html += `<div style="margin-bottom:12px; padding-bottom:10px; border-bottom:1px solid var(--border-subtle);">
            <div style="font-size:9px; color:var(--gold-accent); text-transform:uppercase; font-weight:bold; letter-spacing:1px; margin-bottom:4px;">Recipe</div>
            <button type="button" onclick="event.stopPropagation(); openFlexibleRecipe('${safeId}', '${todayIso}', ${Number(store.userConfig.targets.pro) || 0}, ${Number(store.userConfig.targets.carb) || 0})" style="background:none;border:none;padding:0;cursor:pointer;color:var(--text-main);font-size:14px;font-weight:700;text-align:left;">${mealPlan.recipeName}</button>
        </div>`;
    }

    const routeTitle = document.getElementById('current-route-title');
    if (routeTitle && mealPlan?.recipeName) {
        routeTitle.innerText = mealPlan.recipeName;
    }

    let scaledPro = false;
    let scaledCarb = false;
    (mealPlan?.items || []).forEach((item, idx) => {
        const cat = item.role || item.food._category || 'PRO';
        const slotKey = `${mealType}_${cat}_${idx}`;
        const isVeg = cat === 'VEG_G' || cat === 'VEG_C';
        let mass = item.mass;
        // Keep the same foods as the plan card; only retarget primary macros to what's left today
        if (cat === 'PRO' && !scaledPro && item.food?.protein_per_100g) {
            mass = smartRoundMass((activePro / Math.max(0.1, item.food.protein_per_100g)) * 100, item.food._cleanName, 'PRO');
            scaledPro = true;
        } else if (cat === 'CARB' && !scaledCarb && item.food?.carbs_per_100g) {
            if (activeCarb <= 0) mass = 0;
            else mass = smartRoundMass((activeCarb / Math.max(0.1, item.food.carbs_per_100g)) * 100, item.food._cleanName, 'CARB');
            scaledCarb = true;
        }
        if (mass <= 0 && cat === 'CARB') return;
        store.currentGhostItems.push({ food: item.food, mass });
        html += renderSlot(slotKey, cat, cat, item.food, mass, null, isVeg);
    });
    
    content.innerHTML = html; 
    container.classList.remove('hidden');
    const lockBtnMeal = document.getElementById('btn-lock-in-route');
    if (lockBtnMeal) {
        lockBtnMeal.style.display = '';
        lockBtnMeal.textContent = 'Confirm meal';
    }
}

export function setConfirmRouteButtons(confirmed) {
    const loadRecipeBtn = document.getElementById('btn-load-recipe');
    const loadWorkoutBtn = document.getElementById('btn-load-workout-picker');
    const unconfirmBtn = document.getElementById('btn-unconfirm-route');
    const lockBtn = document.getElementById('btn-lock-in-route');
    const isMeal = ['breakfast', 'lunch', 'dinner', 'snack'].includes(store.activeLog.type);
    const isWorkout = store.activeLog.type === 'workout';

    if (confirmed) {
        if (loadRecipeBtn) loadRecipeBtn.classList.add('hidden');
        if (loadWorkoutBtn) loadWorkoutBtn.classList.add('hidden');
        if (unconfirmBtn) unconfirmBtn.classList.remove('hidden');
        if (lockBtn) lockBtn.style.display = 'none';
    } else {
        if (unconfirmBtn) unconfirmBtn.classList.add('hidden');
        if (lockBtn) {
            lockBtn.style.display = '';
            lockBtn.textContent = isWorkout ? 'Confirm workout' : 'Confirm meal';
        }
        if (loadRecipeBtn) loadRecipeBtn.classList.toggle('hidden', !isMeal);
        if (loadWorkoutBtn) loadWorkoutBtn.classList.toggle('hidden', !isWorkout);
    }
}

export function acceptGhostTemplate() {
    store._ghostBackupForUnconfirm = JSON.parse(JSON.stringify(store.currentGhostItems || []));
    store.activeLog.items = [...store.currentGhostItems];
    // Stamp planned-session kind so Complete Log always creates a Log tab card
    if (!window.manualSessionKind) {
        const focus = document.getElementById('today-focus')?.value || '';
        window.manualSessionKind = focus || 'Full Body / Strength';
    }
    document.getElementById('ghost-template-container').classList.add('hidden');
    store.ghostOverrides = {};
    renderActiveLog();
    setConfirmRouteButtons(true);
    // Workout clock starts when the plan is confirmed (not during preview)
    if (store.activeLog.type === 'workout') {
        window._loggedSessionDurationMs = 0;
        window._loggedSessionDurationLabel = '';
        window._lastSessionDurationMin = 0;
        window._editingPreservedDuration = false;
        const span = document.getElementById('workout-session-timer');
        if (span) span.style.display = '';
        const editDur = document.getElementById('workout-edit-duration-min');
        if (editDur) editDur.style.display = 'none';
        const unit = document.getElementById('workout-edit-duration-unit');
        if (unit) unit.style.display = 'none';
        const tLabel = document.querySelector('#workout-timer-wrap .workout-timer-label');
        if (tLabel) tLabel.textContent = 'Timer';
        resetWorkoutTimer();
        startWorkoutTimer();
        window._workoutSessionConfirmed = true;
        saveWorkoutDraft({ elapsedMs: 0 });
    }
}

/** Undo Confirm meal / Confirm workout — restore planned ghost and Load Recipe/Workout. */
export function unconfirmGhostTemplate() {
    const backup = store._ghostBackupForUnconfirm;
    store.activeLog.items = [];
    document.getElementById('active-log-list').innerHTML = '';
    setConfirmRouteButtons(false);
    if (store.activeLog.type === 'workout') {
        clearWorkoutDraft();
        window._workoutSessionConfirmed = false;
        resetWorkoutTimer();
    }
    if (Array.isArray(backup) && backup.length) {
        store.currentGhostItems = JSON.parse(JSON.stringify(backup));
    }
    loadGhostTemplate();
}

export function addFoodToActiveLog() {
    const select = document.getElementById('select-food');
    if(!select.value) return;
    store.activeLog.items.push({ food: store.globalFoodDB.find(f => f.id == select.value), mass: 100 }); 
    select.value = ''; renderActiveLog();
}

export function updateActiveLogMass(index, newMass, isDA) { store.activeLog.items[index].mass = isDA ? (parseFloat(newMass) * 100) || 0 : parseFloat(newMass) || 0; renderActiveLog(); }
export function removeFoodFromActiveLog(index) { store.activeLog.items.splice(index, 1); renderActiveLog(); }

export function renderActiveLog() {
    if (store.activeLog.type === 'workout') return renderWorkoutLog(); 

    let html = '';
    const isDA = store.userConfig.dependentAthlete;
    store.activeLog.items.forEach((item, index) => {
        const mult = item.mass / 100;
        const pro = item.food.protein_per_100g * mult; const carb = item.food.carbs_per_100g * mult; const fat = item.food.fat_per_100g * mult;
        let displayVal = isDA ? (item.mass/100).toFixed(1) : Math.round(item.mass);
        let unitLabel = isDA ? getVisualPortion(100, item.food._category).split(' ')[1] : 'g';

        html += `
        <div class="active-log-item">
            <div style="flex:1;"><div class="log-item-name">${item.food._cleanName}</div><div class="log-item-macros">PRO: ${pro.toFixed(1)}g | CARB: ${carb.toFixed(1)}g | FAT: ${fat.toFixed(1)}g</div></div>
            <div style="display:flex; align-items:center;">
                <input type="number" step="0.1" class="log-item-input" style="color:var(--text-main);" value="${displayVal}" onchange="updateActiveLogMass(${index}, this.value, ${isDA})"> <span style="font-size:10px; color:#7a7a7a; margin-right:10px; text-transform:uppercase;">${unitLabel}</span>
                <button onclick="removeFoodFromActiveLog(${index})" style="background:none; border:none; color:#FF3B30; font-size:18px; cursor:pointer;">✕</button>
            </div>
        </div>`;
    });
    document.getElementById('active-log-list').innerHTML = html;
}

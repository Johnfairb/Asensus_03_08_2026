import { store } from '../state/store.js';
import { formatFoodMass } from './grocery.js';
import { resolveDayMealItems } from './meal-planner.js';
import { getFlexibleRecipeById } from './flexible-recipes.js';

/**
 * Open the flexible recipe modal for a catalog recipe.
 * @param {string} recipeId
 * @param {string} [isoDate] YYYY-MM-DD — scales to that day's plan when provided
 * @param {number} [tPro]
 * @param {number} [tCarb]
 */
export function openFlexibleRecipe(recipeId, isoDate, tPro, tCarb) {
    if (!store.userConfig.targets || store.globalFoodDB.length === 0) {
        return alert('Pantry not loaded. Cannot calculate macros.');
    }

    const recipe = getFlexibleRecipeById(recipeId);
    if (!recipe) return alert('Recipe not found.');

    const forDate = isoDate ? new Date(`${isoDate}T12:00:00`) : new Date();
    const macros = {
        tPro: tPro != null && tPro > 0 ? tPro : store.userConfig.targets.pro,
        tCarb: tCarb != null && tCarb > 0 ? tCarb : store.userConfig.targets.carb
    };

    const dayMeals = resolveDayMealItems({ ...macros, forDate });
    // Strict recipeId match so the title always pairs with that recipe's foods
    let resolved = dayMeals.find(m => String(m.recipeId) === String(recipeId));

    // Fallback: only use another slot when it is the same recipe; never borrow a different meal's foods
    if (!resolved) {
        resolved = {
            recipeName: recipe.name,
            instructions: recipe.instructions || '',
            items: []
        };
    }

    let ingredientsHTML = '';
    (resolved.items || []).forEach(item => {
        const unit = item.food._category === 'LIQUID' ? 'ml' : 'g';
        const massLabel = formatFoodMass(item.mass, unit);
        ingredientsHTML += `<div style="display:flex; justify-content:space-between; color:var(--text-main); font-size:14px; font-weight:600; border-bottom:1px solid #333; padding-bottom:8px; gap:12px;">
            <span>${item.food._cleanName}</span>
            <span style="font-family:'Roboto Mono'; color:var(--silver-accent); flex-shrink:0;">${massLabel}</span>
        </div>`;
    });

    if (!ingredientsHTML) {
        ingredientsHTML = `<div style="color:var(--text-muted); font-size:13px;">No ingredients resolved — check pantry staples.</div>`;
    }

    const titleEl = document.getElementById('recipe-modal-title');
    const listEl = document.getElementById('recipe-ingredients-list');
    const instrEl = document.getElementById('recipe-instructions');
    if (titleEl) titleEl.innerText = resolved.recipeName || recipe.name;
    if (listEl) listEl.innerHTML = ingredientsHTML;
    if (instrEl) {
        const text = resolved.instructions || recipe.instructions || '';
        instrEl.innerHTML = text.replace(/\n/g, '<br>');
    }

    document.getElementById('recipe-modal')?.classList.remove('hidden');
}

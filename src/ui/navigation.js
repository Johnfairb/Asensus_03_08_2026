import { store } from '../state/store.js';
import { getTodayFocus } from '../domain/fitness-hud.js';
import { generateFutureTimeline } from '../domain/route-planner.js';
import { hydrateStretchSettingsDom } from '../domain/session-prep.js';
import { drawExerciseChart, drawMacroChart, drawUnifiedChart } from './charts.js';
import { closeExecutionZone } from './drive.js';
import { renderAdherenceCalendar } from './journey.js';
import { renderLongTermCalendar } from './route.js';
import { renderMonthlySummaryBanner } from '../domain/monthly-summary.js';

// ==========================================
// 3. NAVIGATION & UI
// ==========================================
/** Open Foods catalogue inside Library. */
export function openMyFoods() {
    const libraryBtn = document.querySelector('#main-header .btn-icon[title="Library"]');
    if (libraryBtn) switchTab(libraryBtn, 'library', 'Library');
    else {
        document.getElementById('header-title').innerText = 'Library';
        document.querySelectorAll('.tab-content').forEach(tab => tab.classList.add('hidden'));
        document.getElementById('tab-library')?.classList.remove('hidden');
    }
    switchLibrarySubTab('foods');
}

/** Open Exercises catalogue inside Library. */
export function openMyExercises() {
    const libraryBtn = document.querySelector('#main-header .btn-icon[title="Library"]');
    if (libraryBtn) switchTab(libraryBtn, 'library', 'Library');
    else {
        document.getElementById('header-title').innerText = 'Library';
        document.querySelectorAll('.tab-content').forEach(tab => tab.classList.add('hidden'));
        document.getElementById('tab-library')?.classList.remove('hidden');
    }
    switchLibrarySubTab('exercises');
}

function getActiveJourneyPanel() {
    const panels = ['weight', 'exercise', 'targets', 'adherence'];
    for (const id of panels) {
        const el = document.getElementById(`journey-panel-${id}`);
        if (el && !el.classList.contains('hidden')) return id;
    }
    return 'weight';
}

function getActivePlanPanel() {
    const panels = ['week', 'future'];
    for (const id of panels) {
        const el = document.getElementById(`plan-panel-${id}`);
        if (el && !el.classList.contains('hidden')) return id;
    }
    return 'week';
}

function refreshPlanPanel(panel, delayMs = 100) {
    setTimeout(() => {
        if (panel === 'future') {
            try { renderLongTermCalendar(); } catch (e) { console.warn(e); }
        } else {
            try { generateFutureTimeline(); } catch (e) { console.warn(e); }
        }
    }, delayMs);
}

function redrawJourneyPanel(panel, delayMs = 100) {
    setTimeout(() => {
        if (panel === 'weight' && typeof drawUnifiedChart === 'function') drawUnifiedChart();
        else if (panel === 'exercise' && typeof drawExerciseChart === 'function') drawExerciseChart();
        else if (panel === 'targets' && typeof drawMacroChart === 'function') drawMacroChart();
        else if (panel === 'adherence' && typeof renderAdherenceCalendar === 'function') renderAdherenceCalendar();
    }, delayMs);
}

function setCatalogueSubBtnActive(scopeSelector, btn) {
    document.querySelectorAll(`${scopeSelector} .catalogue-sub-btn`).forEach(b => {
        const on = b === btn;
        b.classList.toggle('active', on);
        b.classList.toggle('is-primary', on);
        b.classList.toggle('is-secondary', !on);
        b.style.borderColor = '';
        b.style.color = '';
    });
}

export function switchTab(element, tabId, title) {
    if (tabId === 'network' && store.userConfig.networkEnabled === false) {
        const notice = document.getElementById('network-disabled-notice');
        if (notice) notice.classList.remove('hidden');
        const fuelNav = document.querySelector('#main-nav .nav-item');
        if (fuelNav && fuelNav !== element) {
            return switchTab(fuelNav, 'fuel', 'Food');
        }
        alert('Turn on Network in Settings to use this add-on.');
        return;
    }

    document.getElementById('header-title').innerText = title;
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.add('hidden'));
    document.querySelectorAll('.nav-item, .btn-icon').forEach(item => item.classList.remove('active'));

    // FIX 1: Reset scroll instantly to prevent jarring jumps on Route/Journey tabs
    document.getElementById('app-container').scrollTo(0, 0);

    document.getElementById(`tab-${tabId}`).classList.remove('hidden');
    element.classList.add('active');

    closeExecutionZone();
    document.body.classList.remove('workout-focus-mode');

    // FIX 2: Delay Chart.js until AFTER the CSS animation finishes (400ms instead of 50ms)
    // This stops Chart.js from freezing the browser mid-animation.
    if (tabId === 'journey') {
        try { renderMonthlySummaryBanner(); } catch (e) { /* ignore */ }
        redrawJourneyPanel(getActiveJourneyPanel(), 400);
    }
    if (tabId === 'route') {
        refreshPlanPanel(getActivePlanPanel(), 100);
    }
    if (tabId === 'drive') {
        try { getTodayFocus(); } catch (e) { console.warn(e); }
    }
    if (tabId === 'library') {
        const active = document.querySelector('#library-sub-nav .catalogue-sub-btn.active');
        const panel = active?.getAttribute('data-library') || 'foods';
        switchLibrarySubTab(panel, active || undefined);
    }
    if (tabId === 'network' && typeof window.renderSharePreview === 'function') {
        try { window.renderSharePreview('workout'); } catch (e) { /* ignore */ }
    }
}

export function switchFuelSubTab(panel, btn) {
    const panels = ['goals', 'meals', 'log'];
    panels.forEach(id => {
        document.getElementById(`fuel-panel-${id}`)?.classList.toggle('hidden', id !== panel);
    });
    if (btn) setCatalogueSubBtnActive('#fuel-sub-nav', btn);
    else {
        const fallback = document.querySelector(`#fuel-sub-nav .catalogue-sub-btn[data-fuel="${panel}"]`);
        if (fallback) setCatalogueSubBtnActive('#fuel-sub-nav', fallback);
    }
    if (panel === 'log' && typeof window.generateDailyFoodLog === 'function') {
        try { window.generateDailyFoodLog(); } catch (e) { /* ignore */ }
    }
    document.getElementById('app-container')?.scrollTo(0, 0);
}

export function switchDriveSubTab(panel, btn) {
    const panels = ['goals', 'workout', 'log', 'guidance'];
    panels.forEach(id => {
        document.getElementById(`drive-panel-${id}`)?.classList.toggle('hidden', id !== panel);
    });
    if (btn) setCatalogueSubBtnActive('#drive-sub-nav', btn);
    else {
        const fallback = document.querySelector(`#drive-sub-nav .catalogue-sub-btn[data-drive="${panel}"]`);
        if (fallback) setCatalogueSubBtnActive('#drive-sub-nav', fallback);
    }
    if (panel === 'log') {
        try {
            if (typeof window.generateDailyExerciseLog === 'function') window.generateDailyExerciseLog();
        } catch (e) { /* ignore */ }
    }
    if (panel === 'guidance') {
        try {
            if (typeof window.renderRpeGuidancePanel === 'function') window.renderRpeGuidancePanel();
        } catch (e) { /* ignore */ }
    }
    document.getElementById('app-container')?.scrollTo(0, 0);
}

export function switchLibrarySubTab(panel, btn) {
    const panels = ['foods', 'recipes', 'exercises', 'workouts'];
    panels.forEach(id => {
        document.getElementById(`library-panel-${id}`)?.classList.toggle('hidden', id !== panel);
    });
    if (btn) setCatalogueSubBtnActive('#library-sub-nav', btn);
    else {
        const fallback = document.querySelector(`#library-sub-nav .catalogue-sub-btn[data-library="${panel}"]`);
        if (fallback) setCatalogueSubBtnActive('#library-sub-nav', fallback);
    }
    if (panel === 'recipes' && typeof window.renderMyRecipes === 'function') {
        try { window.renderMyRecipes(); } catch (e) { /* ignore */ }
    }
    if (panel === 'workouts' && typeof window.renderMyWorkouts === 'function') {
        try { window.renderMyWorkouts(); } catch (e) { /* ignore */ }
    }
    if (panel === 'foods' && typeof window.loadInventory === 'function') {
        try { window.loadInventory(); } catch (e) { /* ignore */ }
    }
    if (panel === 'exercises' && typeof window.loadExercises === 'function') {
        try { window.loadExercises(); } catch (e) { /* ignore */ }
    }
    document.getElementById('app-container')?.scrollTo(0, 0);
}

export function switchPlanSubTab(panel, btn) {
    const panels = ['week', 'future'];
    panels.forEach(id => {
        document.getElementById(`plan-panel-${id}`)?.classList.toggle('hidden', id !== panel);
    });
    if (btn) setCatalogueSubBtnActive('#tab-route', btn);
    else {
        const fallback = document.querySelector(`#tab-route .catalogue-sub-btn[data-plan="${panel}"]`);
        if (fallback) setCatalogueSubBtnActive('#tab-route', fallback);
    }
    document.getElementById('app-container')?.scrollTo(0, 0);
    refreshPlanPanel(panel, 50);
}

export function switchJourneySubTab(panel, btn) {
    const panels = ['weight', 'exercise', 'targets', 'adherence'];
    panels.forEach(id => {
        document.getElementById(`journey-panel-${id}`)?.classList.toggle('hidden', id !== panel);
    });
    setCatalogueSubBtnActive('#tab-journey', btn);
    document.getElementById('app-container')?.scrollTo(0, 0);
    redrawJourneyPanel(panel, 100);
}

export function switchEngineSubTab(panel, btn) {
    const panels = ['algorithms', 'biometrics', 'lifestyle', 'system'];
    panels.forEach(id => {
        document.getElementById(`engine-panel-${id}`)?.classList.toggle('hidden', id !== panel);
    });
    setCatalogueSubBtnActive('#tab-engine', btn);
    document.getElementById('app-container')?.scrollTo(0, 0);
    if (panel === 'algorithms') {
        try { hydrateStretchSettingsDom(); } catch (e) { /* ignore */ }
    }
}

export function switchNetworkTab(sectionId, element) {
    // Hide all network sections
    document.querySelectorAll('.network-section').forEach(sec => sec.classList.add('hidden'));
    // Remove active styles from buttons
    document.querySelectorAll('.network-tab-btn').forEach(btn => {
        btn.classList.remove('is-primary', 'active');
        btn.classList.add('is-secondary');
        btn.style.borderColor = '';
        btn.style.color = '';
    });

    // Show selected section and light up button
    document.getElementById(`network-${sectionId}`).classList.remove('hidden');
    element.classList.remove('is-secondary');
    element.classList.add('is-primary', 'active');
    element.style.borderColor = '';
    element.style.color = '';

    if (sectionId === 'share' && typeof window.renderSharePreview === 'function') {
        try { window.renderSharePreview('workout'); } catch (e) { /* ignore */ }
    }
}

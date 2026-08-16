import { store } from '../state/store.js';
import { getTodayFocus, syncTrackerPillUI } from './fitness-hud.js';
import { generateGroceryList } from './grocery.js';
import { generateDailyMealPlan } from './meal-planner.js';
import { updateInjuryStatusPanel } from './periodization.js';
import {
    dateToISO,
    generateFutureTimeline,
    getPlannedDayEvents,
    invalidateWeekPlanCache,
    isGameEvent,
    isLactateEvent,
    isPracticeEvent,
    isStrengthEvent,
    listWorkoutSessionsForDate
} from './route-planner.js';
import { getGymPlanPrefs } from './strength-engine.js';
import { clearHypertrophyDayPlanCache } from './hypertrophy-engine.js';
import { generateWorkoutTemplate } from './workout-generator.js';
import { updateLiveDashboard } from '../ui/journey.js';
import { applyNetworkKillSwitch, hydrateNetworkProfileDom } from '../ui/network.js';
import { roundUpLoad } from './load-increments.js';
import { hydrateStretchSettingsDom } from './session-prep.js';

const DEFAULT_EVENT_RPE = 7;

// ==========================================
// 4. THERMODYNAMICS & ETA ENGINE
// ==========================================
export function toggleRestStop() { store.userConfig.restStop = document.getElementById('toggle-rest-stop').checked; saveSettings(); }

export function calculateAchievability() {
    const curr = parseFloat(document.getElementById('set-weight').value);
    const targ = parseFloat(document.getElementById('set-target-weight').value);
    const weeks = parseFloat(document.getElementById('set-target-weeks').value) || 8;
    const out = document.getElementById('achievability-score');
    
    if (!curr || !targ || !out) return;
    if (curr === targ) { out.innerHTML = `<span style="color:#34C759;">Maintenance Phase.</span>`; return; }
    
    const diff = Math.abs(curr - targ);
    const pctPerWeek = (diff / curr) / weeks * 100;
    
    if (targ < curr) {
        if (pctPerWeek > 1.2) out.innerHTML = `⚠️ <span style="color:#FF3B30;">Aggressive Drop: ${pctPerWeek.toFixed(1)}% / wk. High risk of muscle loss.</span>`;
        else if (pctPerWeek > 0.7) out.innerHTML = `🟡 <span style="color:var(--gold-accent);">Moderate Target: ${pctPerWeek.toFixed(1)}% / wk. Strict adherence needed.</span>`;
        else out.innerHTML = `🟢 <span style="color:#34C759;">Optimal Target: ${pctPerWeek.toFixed(1)}% / wk. Highly sustainable.</span>`;
    } else {
        if (pctPerWeek > 0.5) out.innerHTML = `⚠️ <span style="color:#FF3B30;">Aggressive Bulk: ${pctPerWeek.toFixed(1)}% / wk. High risk of fat spillover.</span>`;
        else if (pctPerWeek > 0.25) out.innerHTML = `🟡 <span style="color:var(--gold-accent);">Moderate Bulk: ${pctPerWeek.toFixed(1)}% / wk. Standard hypertrophy.</span>`;
        else out.innerHTML = `🟢 <span style="color:#34C759;">Lean Bulk: ${pctPerWeek.toFixed(1)}% / wk. Highly sustainable.</span>`;
    }
}

function readSyncedJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
    catch (e) { return fallback; }
}

function writeSyncedJson(key, val) {
    if (val == null) return;
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* ignore */ }
}

function mergeCompletedPlanSlots(local, remote) {
    return { ...(remote || {}), ...(local || {}) };
}

function mergeLoggedSessions(local, remote) {
    const out = { ...(remote || {}) };
    Object.entries(local || {}).forEach(([date, list]) => {
        const loc = Array.isArray(list) ? list : [];
        const rem = Array.isArray(out[date]) ? out[date] : [];
        const byId = new Map();
        [...rem, ...loc].forEach((entry) => {
            const id = entry?.sessionId || JSON.stringify(entry);
            byId.set(id, entry);
        });
        out[date] = [...byId.values()];
    });
    return out;
}

function mergeHypertrophyFatigue(local, remote) {
    const out = { ...(remote || {}) };
    Object.entries(local || {}).forEach(([muscle, entry]) => {
        const cur = out[muscle];
        const localAt = Number(entry?.updatedAt) || 0;
        const remoteAt = Number(cur?.updatedAt) || 0;
        out[muscle] = localAt >= remoteAt ? entry : cur;
    });
    return out;
}

/** Union credit / fatigue maps from another device into localStorage. */
function mergeCreditStateFromRemote(remote) {
    if (!remote || typeof remote !== 'object') return false;
    writeSyncedJson(
        'ascensus_completed_plan_slots',
        mergeCompletedPlanSlots(readSyncedJson('ascensus_completed_plan_slots', {}), remote.completedPlanSlots)
    );
    writeSyncedJson(
        'ascensus_logged_sessions',
        mergeLoggedSessions(readSyncedJson('ascensus_logged_sessions', {}), remote.loggedSessions)
    );
    writeSyncedJson(
        'ascensus_hypertrophy_fatigue',
        mergeHypertrophyFatigue(readSyncedJson('ascensus_hypertrophy_fatigue', {}), remote.hypertrophyFatigue)
    );
    invalidateWeekPlanCache();
    return true;
}

export function captureSyncedLocalState() {
    return {
        fixedSchedules: readSyncedJson('ascensus_fixed_schedules', {}),
        specificSchedules: readSyncedJson('ascensus_specific_schedules', {}),
        routeOverrides: readSyncedJson('ascensus_route_overrides', {}),
        strengthMonthPicks: readSyncedJson('ascensus_strength_month_picks', {}),
        metricTargets: readSyncedJson('ascensus_metric_targets', {}),
        gpsIndex: localStorage.getItem('ascensus_gps_index'),
        strengthAB: localStorage.getItem('ascensus_strength_ab'),
        theme: localStorage.getItem('ascensus_theme'),
        strengthPlanTail: localStorage.getItem('ascensus_strength_plan_tail'),
        strengthPlanTailWeek: localStorage.getItem('ascensus_strength_plan_tail_week'),
        strengthWeekSticky: readSyncedJson('ascensus_strength_week_sticky_v1', {}),
        completedPlanSlots: readSyncedJson('ascensus_completed_plan_slots', {}),
        loggedSessions: readSyncedJson('ascensus_logged_sessions', {}),
        hypertrophyFatigue: readSyncedJson('ascensus_hypertrophy_fatigue', {})
    };
}

export function restoreSyncedLocalState(sync) {
    if (!sync || typeof sync !== 'object') return;
    writeSyncedJson('ascensus_fixed_schedules', sync.fixedSchedules);
    writeSyncedJson('ascensus_specific_schedules', sync.specificSchedules);
    writeSyncedJson('ascensus_route_overrides', sync.routeOverrides);
    writeSyncedJson('ascensus_strength_month_picks', sync.strengthMonthPicks);
    writeSyncedJson('ascensus_metric_targets', sync.metricTargets);
    if (sync.gpsIndex != null) localStorage.setItem('ascensus_gps_index', String(sync.gpsIndex));
    if (sync.strengthAB != null) localStorage.setItem('ascensus_strength_ab', String(sync.strengthAB));
    if (sync.theme) localStorage.setItem('ascensus_theme', sync.theme);
    if (sync.strengthPlanTail != null) localStorage.setItem('ascensus_strength_plan_tail', String(sync.strengthPlanTail));
    if (sync.strengthPlanTailWeek != null) localStorage.setItem('ascensus_strength_plan_tail_week', String(sync.strengthPlanTailWeek));
    writeSyncedJson('ascensus_strength_week_sticky_v1', sync.strengthWeekSticky);
    mergeCreditStateFromRemote(sync);
    try {
        if (typeof store.specificSchedules !== 'undefined') {
            store.specificSchedules = JSON.parse(localStorage.getItem('ascensus_specific_schedules') || '{}') || {};
        }
    } catch (e) {
        if (typeof store.specificSchedules !== 'undefined') store.specificSchedules = {};
    }
}

/** Pull plan credits logged on another device so this week's timetable does not grow an extra session. */
export async function refreshCloudPlanCredits() {
    if (!store.currentUser || !store.supabaseClient) return false;
    try {
        const { data } = await store.supabaseClient
            .from('user_profiles')
            .select('config')
            .eq('id', store.currentUser.id)
            .maybeSingle();
        const remote = data?.config?.syncedLocal;
        if (!remote) return false;
        return mergeCreditStateFromRemote(remote);
    } catch (e) {
        return false;
    }
}

export async function onAppBecameVisible() {
    const pulled = await refreshCloudPlanCredits();
    if (!pulled) return;
    try { generateFutureTimeline(); } catch (e) { /* ignore */ }
    try { getTodayFocus(); } catch (e) { /* ignore */ }
}

export function applyUserConfigToDom() {
    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (!el || val === undefined || val === null) return;
        if (el.type === 'checkbox') el.checked = !!val;
        else el.value = String(val);
    };
    if (!store.userConfig.guidanceOff || typeof store.userConfig.guidanceOff !== 'object') {
        store.userConfig.guidanceOff = { food: false, workout: false, timetabling: false };
    }
    if (!store.userConfig.exerciseWorkingWeights || typeof store.userConfig.exerciseWorkingWeights !== 'object') {
        store.userConfig.exerciseWorkingWeights = {};
    }
    setVal('set-weight', store.userConfig.weight);
    setVal('set-target-weight', store.userConfig.targetWeight);
    setVal('set-height', store.userConfig.height);
    setVal('set-age', store.userConfig.age);
    setVal('set-sex', store.userConfig.sex);
    setVal('set-goal', store.userConfig.goal);
    setVal('set-diet', store.userConfig.diet);
    setVal('set-shop-style', store.userConfig.shopStyle || 'Cheap');
    setVal('set-sport', store.userConfig.sport);
    setVal('set-bf', store.userConfig.bodyFat);
    setVal('set-injury', store.userConfig.injury || 'None');
    setVal('set-bw-test', store.userConfig.canDoPullups);
    setVal('set-core-strength', store.userConfig.coreStrength || '');
    if (store.userConfig.seasonPhase === 'InSeason_Maintenance') {
        store.userConfig.seasonPhase = 'OffSeason_Hypertrophy';
    }
    setVal('set-season-phase', store.userConfig.seasonPhase || 'OffSeason_Hypertrophy');
    setVal('set-training-window', store.userConfig.trainingWindow);
    setVal('set-meals-per-day', store.userConfig.mealsPerDay);
    setVal('set-budget', store.userConfig.budget);
    setVal('set-training-freq', store.userConfig.trainingFreq);
    setVal('set-db-inc-low', store.userConfig.dbIncrements?.low ?? 1);
    setVal('set-db-inc-mid', store.userConfig.dbIncrements?.mid ?? store.userConfig.dumbbellIncrement ?? 2);
    setVal('set-db-inc-high', store.userConfig.dbIncrements?.high ?? store.userConfig.dumbbellIncrement ?? 2);
    try {
        const prefs = JSON.parse(localStorage.getItem('ascensus_session_prep_prefs_v1') || '{}') || {};
        setVal('set-gym-warmup', prefs.gymWarmup || 'planned');
        setVal('set-gym-stretch', prefs.gymStretch || 'planned');
        setVal('set-practice-warmup', prefs.practiceWarmup || 'planned');
        setVal('set-practice-stretch', prefs.practiceStretch || 'planned');
    } catch (e) { /* ignore */ }
    try { hydrateStretchSettingsDom(); } catch (e) { /* ignore */ }
    const disc = document.getElementById('strength-phase-disclaimer');
    if (disc) disc.classList.toggle('hidden', (store.userConfig.seasonPhase || '') !== 'OffSeason_Strength');
    const hybridDisc = document.getElementById('hybrid-phase-disclaimer');
    if (hybridDisc) hybridDisc.classList.toggle('hidden', (store.userConfig.seasonPhase || '') !== 'OffSeason_Hybrid');
    // Day/time menus depend on phase — rebuild, preserving saved willingness/time when valid
    const daysEl = document.getElementById('set-gym-willingness');
    if (daysEl) daysEl.value = String(store.userConfig.gymWillingness != null ? store.userConfig.gymWillingness : (store.userConfig.trainingFreq || 4));
    const timeEl = document.getElementById('set-max-gym-time');
    if (timeEl) timeEl.setAttribute('data-preferred', String(store.userConfig.maxGymTime || 90));
    syncGymPlanOptionMenus();
    setVal('toggle-band-auxiliary', !!store.userConfig.bandAuxiliary);
    setVal('toggle-dependent-athlete', !!store.userConfig.dependentAthlete);
    if (store.userConfig.notificationsEnabled === undefined) store.userConfig.notificationsEnabled = true;
    setVal('toggle-notifications', !!store.userConfig.notificationsEnabled);
    setVal('toggle-rest-stop', !!store.userConfig.restStop);
    document.body.classList.toggle('dependent-mode', !!store.userConfig.dependentAthlete);
    if (store.userConfig.networkEnabled === undefined) store.userConfig.networkEnabled = true;
    if (store.userConfig.networkPrivate === undefined) store.userConfig.networkPrivate = true;
    if (store.userConfig.networkShowStreak === undefined) store.userConfig.networkShowStreak = true;
    if (store.userConfig.networkShowLift === undefined) store.userConfig.networkShowLift = true;
    hydrateNetworkProfileDom();
    applyNetworkKillSwitch();
}

export async function persistUserConfigToCloud(statusElId) {
    try { await refreshCloudPlanCredits(); } catch (e) { /* still persist local */ }
    store.userConfig.syncedLocal = captureSyncedLocalState();
    localStorage.setItem('ascensus_settings', JSON.stringify(store.userConfig));
    if (!store.currentUser || !store.supabaseClient) return;
    try {
        const { error } = await store.supabaseClient.from('user_profiles').upsert({
            id: store.currentUser.id,
            config: store.userConfig
        });
        if (error) throw error;
        if (statusElId) {
            const el = document.getElementById(statusElId);
            if (el) {
                el.innerText = "✅ Architecture Secured in Cloud!";
                setTimeout(() => { el.innerText = ""; }, 2000);
            }
        }
    } catch (e) {
        console.warn('Cloud profile sync failed:', e);
        if (statusElId) {
            const el = document.getElementById(statusElId);
            if (el) {
                el.innerText = "⚠️ Saved on device — cloud sync pending.";
                setTimeout(() => { el.innerText = ""; }, 3000);
            }
        }
    }
}

export function saveSettings() {
    store.userConfig.weight = parseFloat(document.getElementById('set-weight').value) || 80;
    store.userConfig.targetWeight = parseFloat(document.getElementById('set-target-weight').value) || 75;
    store.userConfig.height = parseFloat(document.getElementById('set-height').value) || 180;
    store.userConfig.age = parseInt(document.getElementById('set-age').value) || 25;
    store.userConfig.sex = document.getElementById('set-sex').value;
    store.userConfig.goal = document.getElementById('set-goal').value;
    store.userConfig.mealsPerDay = parseInt(document.getElementById('set-meals-per-day').value) || 3;
    store.userConfig.budget = parseFloat(document.getElementById('set-budget').value) || 15.00;
    store.userConfig.trainingFreq = parseInt(document.getElementById('set-training-freq').value) || 4;
    const prevDiet = store.userConfig.diet;
    store.userConfig.diet = document.getElementById('set-diet').value;
    const shopStyleEl = document.getElementById('set-shop-style');
    const prevShopStyle = store.userConfig.shopStyle || 'Cheap';
    if (shopStyleEl) store.userConfig.shopStyle = shopStyleEl.value || 'Cheap';
    store.userConfig.injury = document.getElementById('set-injury').value;
    store.userConfig.sport = document.getElementById('set-sport').value;
    store.userConfig.bodyFat = parseFloat(document.getElementById('set-bf').value) || 0;
    store.userConfig.canDoPullups = document.getElementById('set-bw-test').value || 'Yes';
    const coreStrEl = document.getElementById('set-core-strength');
    if (coreStrEl && coreStrEl.value) store.userConfig.coreStrength = coreStrEl.value;
    store.userConfig.dependentAthlete = document.getElementById('toggle-dependent-athlete').checked;
    const notifEl = document.getElementById('toggle-notifications');
    if (notifEl) store.userConfig.notificationsEnabled = !!notifEl.checked;
    store.userConfig.seasonPhase = document.getElementById('set-season-phase').value;
    store.userConfig.trainingWindow = document.getElementById('set-training-window').value;
    if (!store.userConfig.guidanceOff || typeof store.userConfig.guidanceOff !== 'object') {
        store.userConfig.guidanceOff = { food: false, workout: false, timetabling: false };
    }
    syncTrackerPillUI();
    if (typeof updateInjuryStatusPanel === 'function') updateInjuryStatusPanel();

    const gymWillEl = document.getElementById('set-gym-willingness');
    const gymTimeEl = document.getElementById('set-max-gym-time');
    const bandEl = document.getElementById('toggle-band-auxiliary');
    const dbLow = document.getElementById('set-db-inc-low');
    const dbMid = document.getElementById('set-db-inc-mid');
    const dbHigh = document.getElementById('set-db-inc-high');
    if (gymWillEl && gymWillEl.value !== '') {
        store.userConfig.gymWillingness = Math.min(6, Math.max(1, parseInt(gymWillEl.value, 10) || 4));
    } else if (store.userConfig.gymWillingness == null) {
        store.userConfig.gymWillingness = Math.min(6, Math.max(1, parseInt(store.userConfig.trainingFreq, 10) || 4));
    }
    if (gymTimeEl && gymTimeEl.value !== '') {
        store.userConfig.maxGymTime = parseInt(gymTimeEl.value, 10) || 90;
    }
    if (!store.userConfig.dbIncrements || typeof store.userConfig.dbIncrements !== 'object') {
        store.userConfig.dbIncrements = { low: 1, mid: 2, high: 2 };
    }
    if (dbLow && dbLow.value !== '') store.userConfig.dbIncrements.low = parseFloat(dbLow.value) || 1;
    if (dbMid && dbMid.value !== '') store.userConfig.dbIncrements.mid = parseFloat(dbMid.value) || 2;
    if (dbHigh && dbHigh.value !== '') store.userConfig.dbIncrements.high = parseFloat(dbHigh.value) || 2;
    // Keep legacy field in sync with mid range for older readers
    store.userConfig.dumbbellIncrement = store.userConfig.dbIncrements.mid;
    if (bandEl) store.userConfig.bandAuxiliary = !!bandEl.checked;
    const disc = document.getElementById('strength-phase-disclaimer');
    if (disc) disc.classList.toggle('hidden', store.userConfig.seasonPhase !== 'OffSeason_Strength');
    const hybridDisc = document.getElementById('hybrid-phase-disclaimer');
    if (hybridDisc) hybridDisc.classList.toggle('hidden', store.userConfig.seasonPhase !== 'OffSeason_Hybrid');
    syncHybridSplitFromDom();
    syncAuxiliaryUiVisibility();

    const networkEl = document.getElementById('toggle-network');
    if (networkEl) store.userConfig.networkEnabled = !!networkEl.checked;
    const usernameEl = document.getElementById('network-username');
    const privateEl = document.getElementById('network-private');
    const streakEl = document.getElementById('network-show-streak');
    const liftEl = document.getElementById('network-show-lift');
    if (usernameEl) store.userConfig.networkUsername = String(usernameEl.value || '').trim();
    if (privateEl) store.userConfig.networkPrivate = !!privateEl.checked;
    if (streakEl) store.userConfig.networkShowStreak = !!streakEl.checked;
    if (liftEl) store.userConfig.networkShowLift = !!liftEl.checked;
    applyNetworkKillSwitch();

    // Keep lifestyle Days/Wk aligned with gym willingness for HUD scaling
    store.userConfig.trainingFreq = store.userConfig.gymWillingness;
    const freqEl = document.getElementById('set-training-freq');
    if (freqEl) freqEl.value = String(store.userConfig.trainingFreq);

    const bandHint = document.getElementById('band-aux-hint');
    if (bandHint) {
        const prefs = getGymPlanPrefs();
        if (prefs.strengthPhase) {
            bandHint.innerHTML = prefs.hybrid
                ? `<span style="color:var(--gold-accent);">${prefs.strengthCount} Strength</span> + <span style="color:var(--gold-accent);">${prefs.hypertrophyCount} Hypertrophy</span> · no auxiliary.`
                : `<span style="color:var(--gold-accent);">${prefs.strengthCount} Strength</span> · no auxiliary.`;
        } else {
            bandHint.innerHTML = prefs.band
                ? `On: <span style="color:var(--gold-accent);">${prefs.strengthCount} Strength</span> + <span style="color:var(--gold-accent);">2 Band Aux</span>${prefs.attachMode === 'none' ? ' (separate days)' : ' (attached to strength)'}.`
                : `Off: <span style="color:var(--gold-accent);">${prefs.strengthCount} Strength</span> + <span style="color:var(--gold-accent);">${prefs.auxCount} Aux</span> from gym-day budget.`;
        }
    }

    document.getElementById('ghost-template-container').classList.add('hidden'); 
    document.body.classList.toggle('dependent-mode', store.userConfig.dependentAthlete);

    invalidateWeekPlanCache();
    calculateTDEE();
    if (prevShopStyle !== store.userConfig.shopStyle || prevDiet !== store.userConfig.diet) {
        if (typeof window.loadInventory === 'function') window.loadInventory();
        else generateGroceryList();
    } else {
        generateGroceryList();
    }
    try {
        if (typeof getTodayFocus === 'function') getTodayFocus();
        if (typeof generateFutureTimeline === 'function') generateFutureTimeline();
    } catch (e) {}
    
    persistUserConfigToCloud('settings-status');
}

export function handleSportChange() {
    const sport = document.getElementById('set-sport').value;
    if (sport === 'Rugby' || sport === 'Football') document.getElementById('set-goal').value = "Muscle_Gain"; 
    else if (sport === 'Rowing') document.getElementById('set-goal').value = "Maintenance"; 
    saveSettings();
}

/** BMR: Katch-McArdle when BF% is known and < 20%, otherwise Mifflin–St Jeor. */
export function computeBmr(config = store.userConfig) {
    const weight = Number(config.weight) || 80;
    const height = Number(config.height) || 180;
    const age = Number(config.age) || 25;
    const bodyFat = Number(config.bodyFat) || 0;
    if (bodyFat > 0 && bodyFat < 20) {
        const leanBodyMass = weight * (1 - (bodyFat / 100));
        return 370 + (21.6 * leanBodyMass);
    }
    let bmr = (10 * weight) + (6.25 * height) - (5 * age);
    bmr += (config.sex === 'Male') ? 5 : -161;
    return bmr;
}

function journalLookupKeys(dateIso) {
    const keys = [];
    if (!dateIso) return keys;
    keys.push(String(dateIso));
    try {
        const d = new Date(String(dateIso).includes('T') ? dateIso : dateIso + 'T12:00:00');
        if (!Number.isNaN(d.getTime())) keys.push(d.toLocaleDateString());
    } catch (e) { /* ignore */ }
    return [...new Set(keys)];
}

function readLocalJournal(prefix, dateIso) {
    for (const key of journalLookupKeys(dateIso)) {
        try {
            const raw = localStorage.getItem(prefix + key);
            if (!raw) continue;
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') return parsed;
        } catch (e) { /* ignore */ }
    }
    return null;
}

function readNumericRpe(journal) {
    if (!journal || journal.rpe == null || journal.rpe === '') return null;
    const n = Number(journal.rpe);
    return Number.isFinite(n) ? n : null;
}

function resolveLactateRpe(dateIso) {
    try {
        const sessions = listWorkoutSessionsForDate(dateIso) || [];
        for (const s of sessions) {
            if (!s) continue;
            if (isLactateEvent(s.kind) || s.kind === 'Lactate' || s.isHitClass) {
                const rpe = readNumericRpe(s);
                if (rpe != null) return rpe;
            }
        }
    } catch (e) { /* ignore */ }
    const gym = readLocalJournal('ascensus_gym_journal_', dateIso);
    if (gym && (gym.type === 'lactate' || (Array.isArray(gym.hitTypes) && gym.hitTypes.length))) {
        const rpe = readNumericRpe(gym);
        if (rpe != null) return rpe;
    }
    return null;
}

/** RPE multipliers for practice / match / lactate (missing RPE → 7). Applies to the day after the event. */
function eventRpeMultiplier(rpe) {
    const r = rpe == null || !Number.isFinite(Number(rpe)) ? DEFAULT_EVENT_RPE : Number(rpe);
    if (r <= 5) return 1.05;
    if (r <= 7) return 1.2;
    return 1.3;
}

/** Collect planned sport-event RPEs for a calendar day (one entry per event type on the plan). */
function collectPlannedEventRpes(dateObj) {
    const events = getPlannedDayEvents(dateObj) || [];
    const dateIso = dateToISO(dateObj);
    const rpes = [];
    if (events.some(isPracticeEvent)) {
        rpes.push(readNumericRpe(readLocalJournal('ascensus_practice_journal_', dateIso)) ?? DEFAULT_EVENT_RPE);
    }
    if (events.some(isGameEvent)) {
        rpes.push(readNumericRpe(readLocalJournal('ascensus_match_journal_', dateIso)) ?? DEFAULT_EVENT_RPE);
    }
    if (events.some(isLactateEvent)) {
        rpes.push(resolveLactateRpe(dateIso) ?? DEFAULT_EVENT_RPE);
    }
    return rpes;
}

/**
 * Protein first at 2 g/kg bodyweight (calories from protein are a consequence of food quantity).
 * Leftover calories → 70% carbs / 30% fat. If protein already exceeds the calorie aim, carb/fat = 0.
 */
function macrosFromCalories(targetCals, config = store.userConfig) {
    const cals = Math.max(0, Math.round(targetCals));
    const weightKg = Number(config?.weight) || 80;
    const pro = Math.max(0, Math.round(weightKg * 2));
    const proCals = pro * 4;
    const leftover = Math.max(0, cals - proCals);
    const carb = Math.round((leftover * 0.70) / 4);
    const fat = Math.round((leftover * 0.30) / 9);
    return { cals, pro, carb, fat };
}

/**
 * Daily maintenance calories from BMR × 1.3, stacked with prior-day load and today's plan.
 * Same-day logs do not affect that day's target — only the week plan does for "today".
 */
export function computeDayNutritionTargets(dateObj = new Date(), config = store.userConfig) {
    return explainDayNutritionTargets(dateObj, config).macros;
}

/** Breakdown of what set today's calorie aim (for Goals → Calories sheet). */
export function explainDayNutritionTargets(dateObj = new Date(), config = store.userConfig) {
    const day = dateObj instanceof Date ? new Date(dateObj) : new Date(dateObj);
    day.setHours(12, 0, 0, 0);
    const dayIso = dateToISO(day);
    const yesterday = new Date(dayIso + 'T12:00:00');
    yesterday.setDate(yesterday.getDate() - 1);
    const twoDaysAgo = new Date(dayIso + 'T12:00:00');
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    const BMR = computeBmr(config);
    const factors = [];
    let mult = 1.3; // baseline when nothing calorie-affecting happened yesterday or two days ago
    factors.push({ label: 'Baseline activity', detail: '×1.3 on BMR', mult: 1.3 });

    const yesterdayEvents = getPlannedDayEvents(yesterday) || [];
    if (yesterdayEvents.some(isStrengthEvent)) {
        mult *= 1.2;
        factors.push({ label: 'Yesterday strength (planned)', detail: '×1.2', mult: 1.2 });
    }

    for (const rpe of collectPlannedEventRpes(yesterday)) {
        const m = eventRpeMultiplier(rpe);
        mult *= m;
        factors.push({
            label: `Yesterday sport / HIT · RPE ${rpe == null ? DEFAULT_EVENT_RPE : rpe}`,
            detail: `×${m}`,
            mult: m
        });
    }

    // High RPE (8+): next day gets ×1.3 via eventRpeMultiplier; two days after gets ×1.05
    for (const rpe of collectPlannedEventRpes(twoDaysAgo)) {
        if (rpe >= 8) {
            mult *= 1.05;
            factors.push({ label: `RPE ${rpe} two days ago`, detail: '×1.05 recovery bump', mult: 1.05 });
        }
    }

    // Same-day strength / practice / match / lactate: no calorie bump (×1)

    let maintenanceCals = BMR * mult;
    let goalMult = 1;
    let targetCals = maintenanceCals;
    if (!config.restStop) {
        if (config.goal === 'Fat_Loss') {
            goalMult = 0.9;
            targetCals = maintenanceCals * 0.9;
            factors.push({ label: 'Goal · Fat loss', detail: '×0.9', mult: 0.9 });
        } else if (config.goal === 'Muscle_Gain') {
            goalMult = 1.1;
            targetCals = maintenanceCals * 1.1;
            factors.push({ label: 'Goal · Muscle gain', detail: '×1.1', mult: 1.1 });
        }
    }

    const macros = macrosFromCalories(targetCals, config);
    return {
        bmr: Math.round(BMR),
        activityMult: mult,
        goalMult,
        maintenanceCals: Math.round(maintenanceCals),
        targetCals: macros.cals,
        factors,
        macros,
        note: 'Same-day sessions update tomorrow’s calorie aim, not today’s.'
    };
}

export function calculateTDEE() {
    const targets = computeDayNutritionTargets(new Date());
    store.userConfig.baselineTargets = { ...targets };
    store.userConfig.targets = { ...targets };
    localStorage.setItem('ascensus_settings', JSON.stringify(store.userConfig));
    applyDailyModifiers();
}

export function applyDailyModifiers() {
    if (!store.userConfig.baselineTargets) {
        store.userConfig.baselineTargets = computeDayNutritionTargets(new Date());
    }
    store.userConfig.targets = { ...store.userConfig.baselineTargets };

    const notice = document.getElementById('refund-notice');
    if (notice) notice.style.display = 'none';

    localStorage.setItem('ascensus_settings', JSON.stringify(store.userConfig));
    updateMacroDashboard();
}

export function updateMacroDashboard() {
    if(!store.userConfig.targets) return;
    if (store.globalGroupedHistory[new Date().toLocaleDateString()]) {
        updateLiveDashboard(store.globalGroupedHistory[new Date().toLocaleDateString()].items.filter(i => i.type === 'food'));
    }
    generateDailyMealPlan(); // Auto-generate the visual dashboard
}

export function handleFocusChange() {
    calculateTDEE();
    document.getElementById('ghost-template-container').classList.add('hidden');
    generateDailyMealPlan();
}

// --- SMART ROUNDING ENGINE ---
export function roundToEquipment(val, type) {
   return roundUpLoad(val, type || 'barbell');
}

function readLivePhase() {
    const sel = document.getElementById('set-season-phase');
    return sel?.value || store.userConfig?.seasonPhase || 'OffSeason_Hypertrophy';
}

function readLiveGymDays() {
    const el = document.getElementById('set-gym-willingness');
    const raw = (el && el.value !== '') ? el.value : store.userConfig?.gymWillingness;
    return Math.min(6, Math.max(1, parseInt(raw, 10) || 4));
}

/**
 * Gym-time choices depend on periodization + days/week.
 * Hypertrophy mirrors the stated session timing templates.
 */
export function getGymTimeOptionsForContext(phase, gymDays) {
    const days = Math.min(6, Math.max(1, parseInt(gymDays, 10) || 4));
    const p = phase || 'OffSeason_Hypertrophy';

    if (p === 'OffSeason_Hypertrophy') {
        if (days <= 2) {
            return {
                hint: 'Full body — same time ladder as other hypertrophy splits.',
                options: [
                    { value: 45, label: '45 min' },
                    { value: 60, label: '1 hour' },
                    { value: 75, label: '1 hour 15' },
                    { value: 90, label: 'As long as needed (~1h 30)' }
                ]
            };
        }
        if (days <= 4) {
            return {
                hint: 'Upper / Lower (ideal 3–4 days). Stick to rest times so the clock matches.',
                options: [
                    { value: 45, label: '45 min' },
                    { value: 60, label: '1 hour' },
                    { value: 75, label: '1 hour 15' },
                    { value: 90, label: 'As long as needed (~1h 30)' }
                ]
            };
        }
        // 5–6 = PPL
        return {
            hint: 'Push / Pull / Legs. Stick to rest times so the clock matches.',
            options: [
                { value: 45, label: '45 min' },
                { value: 60, label: '1 hour' },
                { value: 75, label: '1 hour 15' },
                { value: 90, label: 'As long as needed (~1h 30)' }
            ]
        };
    }

    // Strength + hybrid — timing ladder (60 / 75 / 90 / 105)
    if (p === 'OffSeason_Strength' || p === 'OffSeason_Hybrid') {
        return {
            hint: p === 'OffSeason_Hybrid'
                ? 'Applies to strength days. Hypertrophy days use the same clock for their own templates.'
                : '1 hour drops unilateral + core. Stick to rest times so the clock matches.',
            options: [
                { value: 60, label: '1 hour' },
                { value: 75, label: '1 hour 15' },
                { value: 90, label: '1 hour 30' },
                { value: 105, label: '1 hour 45' }
            ]
        };
    }

    // Adaptation / Power (and any other non-hypertrophy / non-strength phase)
    return {
        hint: 'Session length for this phase.',
        options: [
            { value: 60, label: '1 hour' },
            { value: 75, label: '1 hour 15' },
            { value: 90, label: '1 hour 30' },
            { value: 105, label: '1 hour 45' },
            { value: 120, label: '2 hours+' }
        ]
    };
}

export function getGymDaysOptionsForPhase(phase) {
    if (phase === 'OffSeason_Hypertrophy') {
        return {
            hint: 'Hypertrophy ideal: 3–4 days. 1–2 = full body · 3–4 = upper/lower · 5–6 = PPL.',
            options: [
                { value: 1, label: '1 — Full body ×1' },
                { value: 2, label: '2 — Full body ×2' },
                { value: 3, label: '3 — Upper / Lower (ideal)' },
                { value: 4, label: '4 — Upper / Lower (ideal)' },
                { value: 5, label: '5 — Push / Pull / Legs' },
                { value: 6, label: '6 — Push / Pull / Legs' }
            ]
        };
    }
    if (phase === 'OffSeason_Strength') {
        return {
            hint: 'All gym days are strength (max 4). No auxiliary sessions.',
            options: [
                { value: 1, label: '1 — Strength ×1' },
                { value: 2, label: '2 — Strength ×2' },
                { value: 3, label: '3 — Strength ×3' },
                { value: 4, label: '4 — Strength ×4' }
            ]
        };
    }
    if (phase === 'OffSeason_Hybrid') {
        return {
            hint: 'Total gym days / week. Set the strength : hypertrophy split below.',
            options: [
                { value: 2, label: '2 days / week' },
                { value: 3, label: '3 days / week' },
                { value: 4, label: '4 days / week' },
                { value: 5, label: '5 days / week' },
                { value: 6, label: '6 days / week' }
            ]
        };
    }
    return {
        hint: 'How many days you can train in the gym each week.',
        options: [
            { value: 2, label: '2 days / week' },
            { value: 3, label: '3 days / week' },
            { value: 4, label: '4 days / week' },
            { value: 5, label: '5 days / week' },
            { value: 6, label: '6 days / week' }
        ]
    };
}

function rebuildSelectOptions(selectEl, options, preferredValue) {
    if (!selectEl) return preferredValue;
    const prev = preferredValue != null ? String(preferredValue) : selectEl.value;
    selectEl.innerHTML = options.map(o =>
        `<option value="${o.value}">${o.label}</option>`
    ).join('');
    const allowed = new Set(options.map(o => String(o.value)));
    let next = prev;
    if (!allowed.has(String(next))) {
        // Clamp to nearest allowed time (prefer next longer, else longest)
        const nums = options.map(o => Number(o.value)).sort((a, b) => a - b);
        const cur = Number(prev) || nums[0];
        next = String(nums.find(n => n >= cur) ?? nums[nums.length - 1]);
    }
    selectEl.value = next;
    return Number(next);
}

/** Hide auxiliary settings when hypertrophy/strength/hybrid; rebuild day/time menus for phase + days. */
export function syncAuxiliaryUiVisibility() {
    syncGymPlanOptionMenus();
}

function syncHybridSplitMenus(totalDays) {
    const block = document.getElementById('hybrid-split-block');
    const phase = readLivePhase();
    const isHybrid = phase === 'OffSeason_Hybrid';
    if (block) block.classList.toggle('hidden', !isHybrid);
    if (!isHybrid) return;

    const total = Math.min(6, Math.max(2, parseInt(totalDays, 10) || 4));
    const maxS = Math.min(4, total);
    let s = store.userConfig.hybridStrengthDays != null
        ? parseInt(store.userConfig.hybridStrengthDays, 10)
        : Math.min(maxS, Math.max(1, total - 1));
    if (!Number.isFinite(s)) s = Math.min(maxS, 3);
    s = Math.min(maxS, Math.max(0, s));
    let h = total - s;
    if (h < 0) { s = total; h = 0; }

    const sEl = document.getElementById('set-hybrid-strength-days');
    const hEl = document.getElementById('set-hybrid-hypertrophy-days');
    if (sEl) {
        sEl.innerHTML = Array.from({ length: maxS + 1 }, (_, i) =>
            `<option value="${i}">${i}</option>`
        ).join('');
        sEl.value = String(s);
    }
    if (hEl) {
        hEl.innerHTML = Array.from({ length: total + 1 }, (_, i) =>
            `<option value="${i}">${i}</option>`
        ).join('');
        hEl.value = String(h);
    }
    store.userConfig.hybridStrengthDays = s;
    store.userConfig.hybridHypertrophyDays = h;
    const hint = document.getElementById('hybrid-split-hint');
    if (hint) hint.textContent = `${s} strength : ${h} hypertrophy (of ${total} gym days)`;
}

export function syncHybridSplitFromDom() {
    if (readLivePhase() !== 'OffSeason_Hybrid') return;
    const total = readLiveGymDays();
    const sEl = document.getElementById('set-hybrid-strength-days');
    const hEl = document.getElementById('set-hybrid-hypertrophy-days');
    let s = sEl ? parseInt(sEl.value, 10) : store.userConfig.hybridStrengthDays;
    let h = hEl ? parseInt(hEl.value, 10) : store.userConfig.hybridHypertrophyDays;
    s = Math.min(4, Math.max(0, parseInt(s, 10) || 0));
    h = Math.max(0, parseInt(h, 10) || 0);
    if (s + h !== total) {
        // Adjust the field that was not just edited — prefer keeping strength, clamp hypertrophy
        if (s > total) s = Math.min(4, total);
        h = Math.max(0, total - s);
    }
    store.userConfig.hybridStrengthDays = s;
    store.userConfig.hybridHypertrophyDays = h;
    if (sEl) sEl.value = String(s);
    if (hEl) hEl.value = String(h);
    const hint = document.getElementById('hybrid-split-hint');
    if (hint) hint.textContent = `${s} strength : ${h} hypertrophy (of ${total} gym days)`;
}

export function onHybridSplitChange() {
    const total = readLiveGymDays();
    const sEl = document.getElementById('set-hybrid-strength-days');
    const hEl = document.getElementById('set-hybrid-hypertrophy-days');
    const active = document.activeElement;
    let s = sEl ? parseInt(sEl.value, 10) : 0;
    let h = hEl ? parseInt(hEl.value, 10) : 0;
    s = Math.min(4, Math.max(0, s || 0));
    h = Math.max(0, h || 0);
    if (active === hEl) {
        if (h > total) h = total;
        s = Math.min(4, Math.max(0, total - h));
    } else {
        if (s > total) s = Math.min(4, total);
        h = Math.max(0, total - s);
    }
    if (sEl) sEl.value = String(s);
    if (hEl) hEl.value = String(h);
    store.userConfig.hybridStrengthDays = s;
    store.userConfig.hybridHypertrophyDays = h;
    saveSettings();
}

export function syncGymPlanOptionMenus() {
    const phase = readLivePhase();
    const hideAux = phase === 'OffSeason_Hypertrophy'
        || phase === 'OffSeason_Strength'
        || phase === 'OffSeason_Hybrid';
    const auxBlock = document.getElementById('aux-settings-block');
    if (auxBlock) auxBlock.classList.toggle('hidden', hideAux);

    const daysPack = getGymDaysOptionsForPhase(phase);
    const daysHint = document.getElementById('gym-days-hint');
    if (daysHint) daysHint.textContent = daysPack.hint;
    const daysEl = document.getElementById('set-gym-willingness');
    const daysVal = rebuildSelectOptions(
        daysEl,
        daysPack.options,
        daysEl?.value || store.userConfig?.gymWillingness || 4
    );
    if (daysVal != null) store.userConfig.gymWillingness = daysVal;

    const timePack = getGymTimeOptionsForContext(phase, daysVal || readLiveGymDays());
    const timeHint = document.getElementById('gym-time-hint');
    if (timeHint) timeHint.textContent = timePack.hint;
    const timeEl = document.getElementById('set-max-gym-time');
    const preferredTime = timeEl?.getAttribute('data-preferred')
        || timeEl?.value
        || store.userConfig?.maxGymTime
        || 90;
    if (timeEl) timeEl.removeAttribute('data-preferred');
    const timeVal = rebuildSelectOptions(timeEl, timePack.options, preferredTime);
    if (timeVal != null) store.userConfig.maxGymTime = timeVal;

    syncHybridSplitMenus(daysVal || readLiveGymDays());
}

export function onGymDaysOrPhaseUiChange() {
    syncGymPlanOptionMenus();
    clearHypertrophyDayPlanCache();
    saveSettings();
}

export function onSeasonPhaseChange() {
    const sel = document.getElementById('set-season-phase');
    const disc = document.getElementById('strength-phase-disclaimer');
    if (disc) disc.classList.toggle('hidden', !sel || sel.value !== 'OffSeason_Strength');
    const hybridDisc = document.getElementById('hybrid-phase-disclaimer');
    if (hybridDisc) hybridDisc.classList.toggle('hidden', !sel || sel.value !== 'OffSeason_Hybrid');
    syncGymPlanOptionMenus();
    clearHypertrophyDayPlanCache();
    saveSettings();
}
export function smartRoundMass(rawMass, foodName, category) {
    const name = (foodName || '').toLowerCase();
    // Eggs: ~50g per egg. Round to nearest 50.
    if (name.includes('egg')) return Math.max(50, Math.round(rawMass / 50) * 50);
    // Bread/Wraps: ~40g per slice/wrap.
    if (name.includes('bread') || name.includes('wrap') || name.includes('tortilla')) return Math.max(40, Math.round(rawMass / 40) * 40);
    // Fats/Oils/Butter: Round to nearest 5g.
    if (category === 'FAT' || name.includes('oil') || name.includes('butter')) return Math.max(5, Math.round(rawMass / 5) * 5);
    // Liquids: Round to nearest 50ml.
    if (category === 'LIQUID') return Math.max(50, Math.round(rawMass / 50) * 50);
    // Everything else (Meats, Rice, Potatoes, Oats): Round to practical 25g increments (e.g. 100, 125, 150).
    return Math.max(25, Math.round(rawMass / 25) * 25);
}

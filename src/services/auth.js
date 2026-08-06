import { store } from '../state/store.js';
import { syncTrackerPillUI } from '../domain/fitness-hud.js';
import { generateGroceryList } from '../domain/grocery.js';
import { updateInjuryStatusPanel } from '../domain/periodization.js';
import { applyUserConfigToDom, calculateTDEE, restoreSyncedLocalState } from '../domain/thermodynamics.js';
import { setMonthAnchorISO, ensureMonthAnchor } from '../domain/billing-month.js';
import { ensureCycleStarted } from '../domain/workout-cycle.js';
import { nextObStep, syncAuthThemeUI } from '../ui/auth-onboarding.js';
import { loadExercises, loadInventory } from '../ui/fuel.js';
import { loadHistory } from '../ui/journey.js';
import { loadTemplates } from '../ui/templates.js';

export function showAuthForm() {
    document.getElementById('boot-screen').classList.add('hidden');
    document.getElementById('auth-form-container').classList.remove('hidden');
    document.getElementById('onboarding-container').classList.add('hidden');
    document.getElementById('app-container').classList.add('hidden');
    document.getElementById('auth-layer').classList.remove('hidden');
    syncAuthThemeUI();
}

export async function handleAuth(action) {
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value.trim();
    const status = document.getElementById('auth-status');
    
    if(!email || !password) {
        return status.innerText = "[ ERROR ] Enter Email and Passcode first.";
    }
    if (password.length < 6) {
        return status.innerText = "[ ERROR ] Passcode must be at least 6 characters.";
    }
    
    status.innerText = "AUTHENTICATING...";

    let result;
    if (action === 'register') result = await store.supabaseClient.auth.signUp({ email, password });
    else result = await store.supabaseClient.auth.signInWithPassword({ email, password });

    if (result.error) status.innerText = `[ REJECTED ] ${result.error.message}`;
    else status.innerText = "[ GRANTED ] Decrypting Telemetry...";
}

export function quickLogin(email, password) {
    // Autofill the inputs
    document.getElementById('auth-email').value = email;
    document.getElementById('auth-password').value = password;
    
    // Automatically trigger the login function
    handleAuth('login');
}

export async function handleSignOut() {
    await store.supabaseClient.auth.signOut();
    window.location.reload(); 
}

export async function bootOperatorProfile() {
    document.getElementById('boot-status').innerText = "SYNCING PROFILE...";
    
    try {
        // Fetch profile. We use maybeSingle() instead of single() so it doesn't error out if the row doesn't exist yet.
        const { data: profile, error } = await store.supabaseClient.from('user_profiles').select('config').eq('id', store.currentUser.id).maybeSingle();
        
        if (error) {
            console.error("Supabase Fetch Error:", error);
            alert("Database Error: Could not fetch profile.");
            return;
        }

        if (profile && profile.config && Object.keys(profile.config).length > 0) {
            // -- OPERATOR EXISTS: LOAD SETTINGS --
            store.userConfig = { ...store.userConfig, ...profile.config };
            restoreSyncedLocalState(store.userConfig.syncedLocal);
            if (store.userConfig.monthAnchorDate) {
                setMonthAnchorISO(store.userConfig.monthAnchorDate);
            } else {
                // Existing users without an anchor: seed today so months align going forward
                ensureMonthAnchor(new Date());
            }
            ensureCycleStarted(new Date());
            applyUserConfigToDom();
            if (typeof syncTrackerPillUI === 'function') syncTrackerPillUI();
            if (typeof updateInjuryStatusPanel === 'function') updateInjuryStatusPanel();
            
            calculateTDEE();
            
            // Hide Auth/Onboarding, Show Main App
            document.getElementById('auth-layer').classList.add('hidden');
            document.getElementById('app-container').classList.remove('hidden');
            
            // Load app data
            await loadInventory();
            loadExercises();
            loadTemplates();
            loadHistory(); 
            generateGroceryList();
            
        } else {
            // -- BRAND NEW USER: SHOW ONBOARDING --
            document.getElementById('boot-screen').classList.add('hidden');
            document.getElementById('auth-form-container').classList.add('hidden');
            document.getElementById('onboarding-container').classList.remove('hidden');
            nextObStep(1); // Ensure we start at step 1
        }
    } catch (err) {
        console.error("Critical Boot Error:", err);
        alert("Critical Error during boot. Check console.");
    }
}

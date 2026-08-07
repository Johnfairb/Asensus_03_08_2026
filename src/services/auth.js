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

/** Dev/demo override: provision missing accounts, then sign in. */
export async function quickLogin(email, password) {
    document.getElementById('auth-email').value = email;
    document.getElementById('auth-password').value = password;

    const status = document.getElementById('auth-status');
    if (!store.supabaseClient) {
        if (status) status.innerText = '[ REJECTED ] Auth client not ready.';
        return;
    }
    if (status) status.innerText = 'AUTHENTICATING...';

    const confirmHint =
        'Confirm email is ON in Supabase. Turn it off (Auth → Providers → Email → Confirm email), then confirm or recreate theo/tyler/john.';

    let result = await store.supabaseClient.auth.signInWithPassword({ email, password });
    if (result.error) {
        const code = String(result.error.code || '');
        const msg = String(result.error.message || '').toLowerCase();
        const needsProvision = code === 'invalid_credentials' || msg.includes('invalid login');
        if (needsProvision) {
            if (status) status.innerText = 'PROVISIONING DEMO ACCOUNT...';
            const signUp = await store.supabaseClient.auth.signUp({ email, password });
            if (signUp.error) {
                const sMsg = String(signUp.error.message || '');
                if (status) {
                    status.innerText = /rate limit/i.test(sMsg)
                        ? `[ REJECTED ] Email rate limit — wait a minute, then retry. (${confirmHint})`
                        : `[ REJECTED ] ${sMsg}`;
                }
                return;
            }
            // If Confirm email is enabled, signup returns a user but no session.
            if (!signUp.data?.session) {
                if (status) status.innerText = `[ REJECTED ] ${confirmHint}`;
                return;
            }
            if (status) status.innerText = '[ GRANTED ] Decrypting Telemetry...';
            return;
        }
        if (code === 'email_not_confirmed' || msg.includes('email not confirmed')) {
            if (status) status.innerText = `[ REJECTED ] ${confirmHint}`;
            return;
        }
    }

    if (result.error) {
        if (status) status.innerText = `[ REJECTED ] ${result.error.message}`;
    } else if (status) {
        status.innerText = '[ GRANTED ] Decrypting Telemetry...';
    }
}

export async function handleSignOut() {
    await store.supabaseClient.auth.signOut();
    window.location.reload(); 
}

async function recoverToSignIn(message) {
    const bootStatus = document.getElementById('boot-status');
    if (bootStatus) bootStatus.innerText = message || 'BOOT FAILED.';
    try {
        if (store.supabaseClient) await store.supabaseClient.auth.signOut();
    } catch (e) { /* ignore */ }
    store.currentUser = null;
    showAuthForm();
    const status = document.getElementById('auth-status');
    if (status) status.innerText = message || '[ ERROR ] Could not load profile. Signed out — try again.';
}

export async function bootOperatorProfile() {
    const bootStatus = document.getElementById('boot-status');
    if (bootStatus) bootStatus.innerText = 'SYNCING PROFILE...';

    if (!store.supabaseClient || !store.currentUser?.id) {
        await recoverToSignIn('[ ERROR ] No signed-in session. Please sign in.');
        return;
    }

    try {
        // Fetch profile. We use maybeSingle() instead of single() so it doesn't error out if the row doesn't exist yet.
        const { data: profile, error } = await store.supabaseClient.from('user_profiles').select('config').eq('id', store.currentUser.id).maybeSingle();

        if (error) {
            console.error('Supabase Fetch Error:', error);
            const detail = error.message || error.code || 'Could not fetch profile';
            const missingTable = String(error.code || '') === 'PGRST205'
                || /could not find the table/i.test(String(error.message || ''));
            const hint = missingTable
                ? ' Missing table public.user_profiles — run supabase/create_user_profiles.sql in the SQL Editor.'
                : ' Check RLS on user_profiles.';
            await recoverToSignIn(`[ ERROR ] Profile fetch failed: ${detail}.${hint} Signed out — fix DB, then sign in again.`);
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
            document.getElementById('auth-layer').classList.remove('hidden');
            nextObStep(1); // Ensure we start at step 1
        }
    } catch (err) {
        console.error('Critical Boot Error:', err);
        await recoverToSignIn(`[ ERROR ] Boot failed: ${err?.message || 'unknown'}. Signed out — try again.`);
    }
}

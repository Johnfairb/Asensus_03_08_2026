import { store } from '../state/store.js';
import { generateGroceryList } from '../domain/grocery.js';
import { needsFoodSeedSync, syncOfficialFoods } from '../domain/food-catalog.js';
import { calculateTDEE, captureSyncedLocalState } from '../domain/thermodynamics.js';
import { bootOperatorProfile } from '../services/auth.js';
import { loadExercises, loadInventory } from './fuel.js';

// --- ELITE ONBOARDING LOGIC ---

export function selectObCard(element, hiddenInputId, value) {
    // Visually deselect all siblings
    const siblings = element.parentElement.querySelectorAll('.ob-card');
    siblings.forEach(sib => sib.classList.remove('active'));
    // Select this one
    element.classList.add('active');
    // Set the hidden input value
    document.getElementById(hiddenInputId).value = value;
}

export function selectAuthTheme(element, theme) {
    document.getElementById('auth-theme-dark')?.classList.remove('active');
    document.getElementById('auth-theme-light')?.classList.remove('active');
    element.classList.add('active');
    applyThemeChoice(theme);
}

export function applyThemeChoice(theme) {
    const isLight = theme === 'light';
    document.body.classList.toggle('light-theme', isLight);
    localStorage.setItem('ascensus_theme', isLight ? 'light' : 'dark');
    localStorage.setItem('ascensus_theme_chosen', '1');
    const toggle = document.getElementById('toggle-light-mode');
    if (toggle) toggle.checked = isLight;
}

export function syncAuthThemeUI() {
    const theme = localStorage.getItem('ascensus_theme') || 'dark';
    document.getElementById('auth-theme-dark')?.classList.toggle('active', theme !== 'light');
    document.getElementById('auth-theme-light')?.classList.toggle('active', theme === 'light');
}

export function nextObStep(stepNumber) {
    document.querySelectorAll('.ob-step').forEach(step => step.classList.add('hidden'));
    document.getElementById(`ob-step-${stepNumber}`).classList.remove('hidden');
    
    const titles = ["OPERATOR BIOMETRICS", "CHASSIS & TARGET", "SYSTEM LOGIC"];
    document.getElementById('ob-phase-title').innerText = `PHASE ${stepNumber} / 3`;
    document.getElementById('ob-main-title').innerText = titles[stepNumber - 1];
    
    let progress = stepNumber === 1 ? '33%' : (stepNumber === 2 ? '66%' : '100%');
    document.getElementById('ob-progress').style.width = progress;
}

export function triggerBootSequence() {
    if(!document.getElementById('ob-req-gym').checked || !document.getElementById('ob-req-scale').checked) {
        return alert("You must confirm access to a gym and a digital scale to use the GPS.");
    }
    // Hide all steps, show the spinning terminal
    document.querySelectorAll('.ob-step').forEach(step => step.classList.add('hidden'));
    document.getElementById('ob-step-boot').classList.remove('hidden');
    document.getElementById('ob-phase-title').innerText = "SYSTEM SECURED";
    document.getElementById('ob-main-title').innerHTML = '<img src="assets/logo-mark.svg" alt="Ascensus" class="boot-logo boot-logo-sm" style="margin: 0 auto 8px auto;">';
    document.getElementById('ob-progress').style.width = "100%";

    const log = document.getElementById('ob-boot-log');
    
    // Fake terminal loading sequence for elite UX
    setTimeout(() => log.innerText = "Applying Macro Periodization...", 600);
    setTimeout(() => log.innerText = "Securing Cloud Connection...", 1200);
    setTimeout(() => {
        completeOnboarding();
    }, 2000);
}

export async function completeOnboarding() {
    try {
        // 1. Grab values from the sleek UI
        store.userConfig.weight = parseFloat(document.getElementById('ob-weight').value) || 80;
        store.userConfig.targetWeight = parseFloat(document.getElementById('ob-target').value) || 75;
        store.userConfig.height = parseFloat(document.getElementById('ob-height').value) || 180;
        store.userConfig.age = parseInt(document.getElementById('ob-age').value) || 25;
        store.userConfig.bodyFat = parseFloat(document.getElementById('ob-bf').value) || 0;
        store.userConfig.sex = document.getElementById('ob-sex').value || 'Male';
        store.userConfig.goal = document.getElementById('ob-goal').value || 'Fat_Loss';
        store.userConfig.diet = document.getElementById('ob-diet').value || 'Standard';
        store.userConfig.shopStyle = document.getElementById('ob-shop-style')?.value || 'Cheap';
        store.userConfig.sport = document.getElementById('ob-sport').value || 'None';
        store.userConfig.injury = document.getElementById('ob-injury').value || 'None';
        store.userConfig.canDoPullups = document.getElementById('ob-bodyweight-test').value || 'Yes';
        
        store.userConfig.experience = document.getElementById('ob-experience').value || 'Beginner';
        if (store.userConfig.experience === 'Advanced') {
            store.userConfig.oneRepMax = {
                squat: parseFloat(document.getElementById('ob-1rm-squat').value) || 0,
                bench: parseFloat(document.getElementById('ob-1rm-bench').value) || 0,
                deadlift: parseFloat(document.getElementById('ob-1rm-dead').value) || 0
            };
        }
        
        calculateTDEE();

        const log = document.getElementById('ob-boot-log');
        log.innerText = "UPLOADING TO SUPABASE...";

        // 2. Push to Supabase (include any local device state for cross-browser restore)
        store.userConfig.syncedLocal = captureSyncedLocalState();
        const { error } = await store.supabaseClient.from('user_profiles').upsert({ 
            id: store.currentUser.id, 
            config: store.userConfig 
        });

        if (error) {
            console.error("Supabase Save Error:", error);
            alert(`Supabase Rejected Save: ${error.message}\n(Check your RLS policies!)`);
            
            // If it fails, revert the UI so they aren't stuck on the spinner
            document.getElementById('ob-step-boot').classList.add('hidden');
            document.getElementById('ob-step-3').classList.remove('hidden');
            return;
        }

        // 3. Success! Boot the app.
        log.innerText = "ACCESS GRANTED. BOOTING...";
        setTimeout(() => {
            bootOperatorProfile(); 
        }, 500);

    } catch (err) {
        console.error("Onboarding Error:", err);
        alert("Javascript crashed during onboarding. Press F12 to check the console.");
    }
}

export async function seedDefaultDatabase() {
    try {
        if (!store.supabaseClient) return;
        const { data: foodCheck, error: checkError } = await store.supabaseClient.from('food_inventory').select('id').limit(1);

        if (checkError) {
            console.error("❌ Error checking food_inventory (Check RLS or Table existence):", checkError);
            return;
        }

        const isEmpty = !foodCheck || foodCheck.length === 0;
        if (isEmpty || needsFoodSeedSync()) {
            console.log(isEmpty
                ? "🌱 Database empty. Syncing John's official foods..."
                : "🌱 Food seed version changed. Syncing official foods (keeping custom)...");
            await syncOfficialFoods();
            await loadInventory();
            await loadExercises();
            setTimeout(generateGroceryList, 1000);
        }
    } catch (err) {
        console.error("❌ Seed DB Error:", err);
    }
}

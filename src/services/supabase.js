import { store } from '../state/store.js';
import { SUPABASE_URL, SUPABASE_KEY } from '../config/keys.js';
import { bootOperatorProfile, showAuthForm } from './auth.js';

export async function initializeSupabase() {
    try {
        store.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        console.log("✅ SUPABASE CONNECTED");
        
        store.supabaseClient.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
                if (session) {
                    store.currentUser = session.user;
                    bootOperatorProfile();
                } else {
                    showAuthForm();
                }
            } else if (event === 'SIGNED_OUT') {
                store.currentUser = null;
                showAuthForm();
            }
        });
    } catch (error) {
        console.error("❌ Failed to connect.", error);
        document.getElementById('boot-status').innerText = "CONNECTION FAILED.";
    }
}

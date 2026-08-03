import { store } from '../state/store.js';

// --- OFFLINE SYNC ENGINE ---
export async function processOfflineQueue() {
    if (!navigator.onLine || store.offlineQueue.length === 0) return;
    console.log(`🔄 Syncing ${store.offlineQueue.length} offline logs to cloud...`);
    let pending = [...store.offlineQueue];
    store.offlineQueue = []; 
    localStorage.setItem('ascensus_offline_queue', JSON.stringify(store.offlineQueue));

    for (let item of pending) {
        const { error } = await store.supabaseClient.from(item.table).insert(item.payload);
        if (error) {
            store.offlineQueue.push(item);
            localStorage.setItem('ascensus_offline_queue', JSON.stringify(store.offlineQueue));
        }
    }
}

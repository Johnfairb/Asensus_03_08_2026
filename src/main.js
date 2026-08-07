import { installAlerts } from './ui/alerts.js';
import { initializeSupabase } from './services/supabase.js';
import { processOfflineQueue } from './services/offline-queue.js';
import { seedDefaultDatabase } from './ui/auth-onboarding.js';
import { checkMidnightRollover } from './lib/dates-rollover.js';
import { bindUi } from './ui/bind.js';
import { applyThemeChoice } from './ui/auth-onboarding.js';
import { startNotificationScheduler } from './ui/notifications.js';
import { syncRestTimersFromWallClock } from './ui/drive.js';

installAlerts();
bindUi();
startNotificationScheduler();

// Hydrate theme before paint of auth UI
const savedTheme = localStorage.getItem('ascensus_theme') || 'dark';
applyThemeChoice(savedTheme === 'light' ? 'light' : 'dark');

initializeSupabase();

window.addEventListener('online', processOfflineQueue);
setInterval(processOfflineQueue, 15000);

setTimeout(seedDefaultDatabase, 2000);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    checkMidnightRollover();
    try { syncRestTimersFromWallClock(); } catch (e) { /* ignore */ }
  }
});
setTimeout(checkMidnightRollover, 1000);

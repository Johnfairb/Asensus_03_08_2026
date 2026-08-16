import { installAlerts } from './ui/alerts.js';
import { initializeSupabase } from './services/supabase.js';
import { processOfflineQueue } from './services/offline-queue.js';
import { seedDefaultDatabase } from './ui/auth-onboarding.js';
import { checkMidnightRollover } from './lib/dates-rollover.js';
import { bindUi } from './ui/bind.js';
import { applyThemeChoice } from './ui/auth-onboarding.js';
import { startNotificationScheduler } from './ui/notifications.js';
import { syncRestTimersFromWallClock, syncStretchTimersFromWallClock } from './ui/drive.js';
import { unlockAudio } from './ui/audio.js';
import { onAppBecameVisible } from './domain/thermodynamics.js';

installAlerts();
bindUi();
startNotificationScheduler();

function syncVisibleViewportHeight() {
  const h = window.visualViewport?.height || window.innerHeight;
  if (!h) return;
  document.documentElement.style.setProperty('--vvh', `${Math.round(h)}px`);
}
syncVisibleViewportHeight();
window.visualViewport?.addEventListener('resize', syncVisibleViewportHeight);
window.visualViewport?.addEventListener('scroll', syncVisibleViewportHeight);
window.addEventListener('resize', syncVisibleViewportHeight);
window.addEventListener('orientationchange', () => setTimeout(syncVisibleViewportHeight, 200));

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
    try { unlockAudio(); } catch (e) { /* ignore */ }
    try { syncRestTimersFromWallClock(); } catch (e) { /* ignore */ }
    try { syncStretchTimersFromWallClock(); } catch (e) { /* ignore */ }
    try { onAppBecameVisible(); } catch (e) { /* ignore */ }
    try { syncVisibleViewportHeight(); } catch (e) { /* ignore */ }
  }
});
setTimeout(checkMidnightRollover, 1000);

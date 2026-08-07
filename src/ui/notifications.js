/**
 * Optional push-style toasts (Settings → Alerts).
 * Events: match day, rest timer done, missed morning workout (after 2pm).
 * Rest-end uses Notification API when the app is backgrounded so the user still hears/sees it.
 */
import { store } from '../state/store.js';
import { dateToISO, getPlannedDayEvents, isGameEvent, isLiftingEvent, isPracticeEvent } from '../domain/route-planner.js';

const SEEN_KEY = 'ascensus_notif_seen';

function alertsEnabled() {
  if (store.userConfig.notificationsEnabled === false) return false;
  const el = document.getElementById('toggle-notifications');
  if (el) return !!el.checked;
  return store.userConfig.notificationsEnabled !== false;
}

function seenMap() {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}') || {}; }
  catch (e) { return {}; }
}

function markSeen(key) {
  const m = seenMap();
  m[key] = Date.now();
  localStorage.setItem(SEEN_KEY, JSON.stringify(m));
}

function alreadySeen(key) {
  return !!seenMap()[key];
}

export function showAppNotification(message, { key = null, force = false } = {}) {
  if (!force && !alertsEnabled()) return;
  if (key && alreadySeen(key)) return;
  if (key) markSeen(key);
  if (typeof window.alert === 'function') window.alert(message);
}

/** Ask for system notification permission once (needed for background rest alarms). */
export async function ensureNotificationPermission() {
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    const result = await Notification.requestPermission();
    return result === 'granted';
  } catch (e) {
    return false;
  }
}

function showSystemNotification(title, body) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
  try {
    const n = new Notification(title, {
      body,
      tag: 'ascensus-rest-timer',
      renotify: true,
      silent: false,
      requireInteraction: false
    });
    n.onclick = () => {
      try { window.focus(); } catch (e) { /* ignore */ }
      try { n.close(); } catch (e) { /* ignore */ }
    };
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Rest finished. Always try system notification when tab is hidden;
 * in-app alert only when Alerts are on and the app is visible.
 */
export function notifyRestTimerDone() {
  const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
  if (hidden) {
    ensureNotificationPermission().then((ok) => {
      if (ok) showSystemNotification('Rest over', 'Rest timer finished — next set.');
    });
    return;
  }
  showAppNotification('Rest timer finished — next set.', { key: `rest_${Date.now()}`, force: false });
}

function todayHasWorkoutLogged() {
  const todayKey = new Date().toLocaleDateString();
  const day = store.globalGroupedHistory?.[todayKey];
  if (!day) return false;
  return (day.items || []).some(i => i.type === 'workout');
}

function todayIsMatchDay() {
  try {
    const events = getPlannedDayEvents(new Date()) || [];
    return events.some(e => isGameEvent(e));
  } catch (e) {
    const focus = document.getElementById('today-focus')?.value || '';
    return /game|match/i.test(focus);
  }
}

function todayHadMorningWorkoutPlanned() {
  try {
    const events = getPlannedDayEvents(new Date()) || [];
    const hasLift = events.some(e => isLiftingEvent(e) || isPracticeEvent(e) || isGameEvent(e));
    if (!hasLift) return false;
    const win = (store.userConfig.trainingWindow || 'Afternoon').toLowerCase();
    if (win === 'morning') return true;
    return events.some(e => isPracticeEvent(e) || isGameEvent(e) || isLiftingEvent(e));
  } catch (e) {
    return false;
  }
}

export function checkScheduledNotifications() {
  if (!alertsEnabled()) return;
  const iso = dateToISO(new Date());
  const hour = new Date().getHours();

  if (todayIsMatchDay()) {
    showAppNotification('Match day — log your match when finished.', { key: `matchday_${iso}` });
  }

  if (hour >= 14 && todayHadMorningWorkoutPlanned() && !todayHasWorkoutLogged()) {
    showAppNotification('No workout logged yet today — afternoon check-in.', { key: `missed_am_${iso}` });
  }
}

let _notifInterval = null;

export function startNotificationScheduler() {
  checkScheduledNotifications();
  if (_notifInterval) clearInterval(_notifInterval);
  _notifInterval = setInterval(checkScheduledNotifications, 5 * 60 * 1000);
}

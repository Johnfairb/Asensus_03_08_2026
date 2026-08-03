/**
 * Optional push-style toasts (Settings → Alerts).
 * Events: match day, rest timer done, missed morning workout (after 2pm).
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

export function notifyRestTimerDone() {
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
    // Morning window: trainingWindow Morning, or any practice/match/strength today
    const win = (store.userConfig.trainingWindow || 'Afternoon').toLowerCase();
    if (win === 'morning') return true;
    // Also treat Practice/Match as "shouldn't be missed by 2pm"
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

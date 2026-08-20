/** Wall-clock workout timer — armed on Confirm workout, starts on first exercise Log tap. */

let _timerInterval = null;
let _startedAt = null;
let _elapsedMs = 0;
let _running = false;
let _onTick = null;

function pad(n) {
  return String(n).padStart(2, '0');
}

export function formatDurationMs(ms) {
  const totalSec = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

export function getWorkoutElapsedMs() {
  if (_running && _startedAt != null) {
    return _elapsedMs + (Date.now() - _startedAt);
  }
  return _elapsedMs;
}

export function getWorkoutElapsedMinutes() {
  return Math.max(1, Math.round(getWorkoutElapsedMs() / 60000));
}

export function setWorkoutTimerTickHandler(fn) {
  _onTick = typeof fn === 'function' ? fn : null;
}

function renderTimerUi() {
  const el = document.getElementById('workout-session-timer');
  if (el) {
    el.textContent = formatDurationMs(getWorkoutElapsedMs());
    el.classList.toggle('is-running', _running);
  }
  try { _onTick?.(); } catch (e) { /* ignore */ }
}

/** Show 00:00 without counting — used after Confirm / session setup. */
export function armWorkoutTimer() {
  if (_running) return;
  _elapsedMs = 0;
  _startedAt = null;
  if (_timerInterval) {
    clearInterval(_timerInterval);
    _timerInterval = null;
  }
  const wrap = document.getElementById('workout-timer-wrap');
  if (wrap) wrap.classList.remove('hidden');
  renderTimerUi();
}

export function startWorkoutTimer() {
  if (_running) return;
  _startedAt = Date.now();
  _running = true;
  if (_timerInterval) clearInterval(_timerInterval);
  _timerInterval = setInterval(renderTimerUi, 1000);
  const wrap = document.getElementById('workout-timer-wrap');
  if (wrap) wrap.classList.remove('hidden');
  renderTimerUi();
}

/** Start the clock the first time the user opens an exercise to log (no-op if already running). */
export function ensureWorkoutTimerStarted() {
  if (_running) return false;
  startWorkoutTimer();
  return true;
}

/** Stop timer; returns elapsed minutes (min 1 if any time ran). */
export function stopWorkoutTimer() {
  const { minutes } = stopWorkoutTimerDetailed();
  return minutes;
}

/** Stop timer; returns { minutes, ms, label } matching the on-screen timer. */
export function stopWorkoutTimerDetailed() {
  if (_running && _startedAt != null) {
    _elapsedMs += Date.now() - _startedAt;
  }
  _startedAt = null;
  _running = false;
  if (_timerInterval) {
    clearInterval(_timerInterval);
    _timerInterval = null;
  }
  renderTimerUi();
  const ms = Math.max(0, _elapsedMs);
  const mins = ms > 0 ? Math.max(1, Math.round(ms / 60000)) : 0;
  return { minutes: mins, ms, label: formatDurationMs(ms) };
}

export function resetWorkoutTimer() {
  stopWorkoutTimer();
  _elapsedMs = 0;
  const wrap = document.getElementById('workout-timer-wrap');
  if (wrap) wrap.classList.add('hidden');
  renderTimerUi();
}

export function setWorkoutElapsedMinutes(minutes) {
  const m = Math.max(0, Number(minutes) || 0);
  setWorkoutElapsedMs(m * 60000);
}

/** Restore elapsed ms without starting (used when parking/resuming a draft). */
export function setWorkoutElapsedMs(ms) {
  const wasRunning = _running;
  if (wasRunning) stopWorkoutTimer();
  _elapsedMs = Math.max(0, Number(ms) || 0);
  const wrap = document.getElementById('workout-timer-wrap');
  if (wrap && _elapsedMs > 0) wrap.classList.remove('hidden');
  renderTimerUi();
  if (wasRunning) startWorkoutTimer();
}

/** Pause without clearing elapsed (leave / switch tabs mid-session). */
export function pauseWorkoutTimer() {
  return stopWorkoutTimer();
}

export function isWorkoutTimerRunning() {
  return _running;
}

/** True for gym lifts / supersets / core — not warmup, stretch, steady cardio, or lactate. */
export function itemUsesExerciseTimer(item) {
  if (!item) return false;
  if (item.isWarmupGroup || item.isCustomWarmup) return false;
  if (item.isStretchGroup || item.isCustomStretch) return false;
  if (item.isSportSessionBlock) return false;
  if (item.isSteadyCardio) return false;
  if (item.isLactateHit || (item.sets || []).some(s => s && s.isLactateHit)) return false;
  const name = String(item.exercise?.name || item.name || '');
  if (/static\s*stretch/i.test(name)) return false;
  if (/hit\s*class/i.test(name)) return false;
  if (/steady\s*state\s*cardio/i.test(name)) return false;
  const domain = String(item.exercise?.domain || '').toLowerCase();
  if (domain === 'cardio' && !item.isSuperset) return false;
  return Array.isArray(item.sets) && item.sets.length > 0;
}

function timedExerciseSets(item) {
  return (item?.sets || []).filter(s => s && !s._sessionSkipped);
}

export function isExerciseTimerRunning(item) {
  return !!(item?.exerciseTimerStartedAt && !item.exerciseTimerEndedAt);
}

/** Live or frozen time on this exercise (first logged set → last logged set). */
export function getExerciseDurationMs(item) {
  if (!item) return 0;
  const started = Number(item.exerciseTimerStartedAt) || 0;
  const ended = Number(item.exerciseTimerEndedAt) || 0;
  const frozen = Number(item.exerciseDurationMs) || 0;
  if (started && ended && ended >= started) return ended - started;
  if (started && !ended) return Math.max(0, Date.now() - started);
  return Math.max(0, frozen);
}

export function formatExerciseDurationLabel(item) {
  const ms = getExerciseDurationMs(item);
  return ms > 0 ? formatDurationMs(ms) : '';
}

/**
 * Start on the first logged set (typically the first warmup) and freeze when
 * every remaining set is logged. Adding a set after finish resumes the clock.
 * No-op while editing a past session so stored times are not rewritten.
 */
export function syncExerciseTimer(item, { editing = false } = {}) {
  if (!item || editing || !itemUsesExerciseTimer(item)) return;
  const sets = timedExerciseSets(item);
  if (!sets.length) return;

  const completed = sets.filter(s => s.completed);
  if (!completed.length) {
    item.exerciseTimerStartedAt = null;
    item.exerciseTimerEndedAt = null;
    item.exerciseDurationMs = 0;
    return;
  }

  const now = Date.now();
  if (!item.exerciseTimerStartedAt) {
    item.exerciseTimerStartedAt = now;
  }

  const allDone = sets.every(s => s.completed);
  if (allDone) {
    if (!item.exerciseTimerEndedAt) item.exerciseTimerEndedAt = now;
    item.exerciseDurationMs = Math.max(0, item.exerciseTimerEndedAt - item.exerciseTimerStartedAt);
  } else {
    item.exerciseTimerEndedAt = null;
  }
}

export function sumExerciseDurationMs(items) {
  return (items || []).reduce((sum, it) => {
    if (!itemUsesExerciseTimer(it)) return sum;
    const frozen = Number(it.exerciseDurationMs) || 0;
    const live = getExerciseDurationMs(it);
    return sum + Math.max(0, frozen || live);
  }, 0);
}

/** Session clock minus the sum of per-exercise clocks (transitions, rests between lifts, warmup/stretch). */
export function computeMiscellaneousMs(items, sessionMs) {
  const total = Math.max(0, Number(sessionMs) || 0);
  return Math.max(0, total - sumExerciseDurationMs(items));
}

/** Freeze any still-running exercise clocks when Complete log is pressed. */
export function freezeOpenExerciseTimers(items) {
  const now = Date.now();
  (items || []).forEach(item => {
    if (!item?.exerciseTimerStartedAt || item.exerciseTimerEndedAt) return;
    item.exerciseTimerEndedAt = now;
    item.exerciseDurationMs = Math.max(0, now - Number(item.exerciseTimerStartedAt));
  });
}

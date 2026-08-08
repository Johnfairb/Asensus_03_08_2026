/** Wall-clock workout timer — armed on Confirm workout, starts on first exercise Log tap. */

let _timerInterval = null;
let _startedAt = null;
let _elapsedMs = 0;
let _running = false;

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

function renderTimerUi() {
  const el = document.getElementById('workout-session-timer');
  if (!el) return;
  el.textContent = formatDurationMs(getWorkoutElapsedMs());
  el.classList.toggle('is-running', _running);
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

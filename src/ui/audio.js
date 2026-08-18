/**
 * Workout alarm audio. Phones suspend Web Audio after ~30s of silence, and
 * rest timers are 60–300s, so a later beep from setInterval often never plays.
 * Unlock on user taps. During rest/stretch, play a near-silent track matching
 * the countdown so lock-screen Now Playing shows remaining time (not a 1s loop).
 * Cues (rest alarm, prepare, stretch) use HTML audio on that same element so
 * they still play when the phone is locked.
 */

const REST_PATTERN = [
    { freq: 880, offset: 0, dur: 0.16 },
    { freq: 1174.7, offset: 0.18, dur: 0.16 },
    { freq: 1318.5, offset: 0.36, dur: 0.22 }
];
const REST_CYCLE = 0.75;
const REST_REPEATS = 3;

let _ctx = null;
let _holdCount = 0;
let _keepOsc = null;
let _keepGain = null;
let _beepEl = null;
let _keepEl = null;
let _unlockInstalled = false;
let _htmlUnlocked = false;
let _restWavUrl = null;
let _stretchWavUrl = null;
let _prepareWavUrl = null;
let _silentWavUrl = null;
let _timerKeepUrl = null;
let _timerKeepSec = 0;
let _lockScreen = null;
let _cuePlaying = false;
let _cueGen = 0;
let _mediaHandlersInstalled = false;

function pcmWavUrl(samples, sampleRate) {
    const n = samples.length;
    const buffer = new ArrayBuffer(44 + n * 2);
    const view = new DataView(buffer);
    const writeStr = (offset, str) => {
        for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };
    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + n * 2, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) view.setInt16(44 + i * 2, samples[i], true);
    return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
}

function synthTones(notes, { sampleRate = 22050, peak = 0.55 } = {}) {
    let end = 0;
    notes.forEach(n => { end = Math.max(end, n.offset + n.dur + 0.03); });
    const samples = new Int16Array(Math.ceil(end * sampleRate));
    notes.forEach(n => {
        const startI = Math.floor(n.offset * sampleRate);
        const durI = Math.floor(n.dur * sampleRate);
        for (let i = 0; i < durI; i++) {
            const t = i / sampleRate;
            const env = t < 0.012 ? t / 0.012 : Math.max(0, 1 - (t / n.dur));
            const sq = Math.sin(2 * Math.PI * n.freq * t) >= 0 ? 1 : -1;
            const v = sq * peak * env * 32767;
            const idx = startI + i;
            if (idx >= 0 && idx < samples.length) {
                samples[idx] = Math.max(-32767, Math.min(32767, samples[idx] + v));
            }
        }
    });
    return pcmWavUrl(samples, sampleRate);
}

function restAlarmUrl() {
    if (_restWavUrl) return _restWavUrl;
    const notes = [];
    for (let r = 0; r < REST_REPEATS; r++) {
        REST_PATTERN.forEach(t => notes.push({
            freq: t.freq,
            offset: r * REST_CYCLE + t.offset,
            dur: t.dur
        }));
    }
    _restWavUrl = synthTones(notes, { peak: 0.55 });
    return _restWavUrl;
}

function stretchBeepUrl() {
    if (_stretchWavUrl) return _stretchWavUrl;
    _stretchWavUrl = synthTones([{ freq: 880, offset: 0, dur: 0.14 }], { peak: 0.28 });
    return _stretchWavUrl;
}

function prepareBeepUrl() {
    if (_prepareWavUrl) return _prepareWavUrl;
    _prepareWavUrl = synthTones([{ freq: 1244.5, offset: 0, dur: 0.14 }], { peak: 0.52 });
    return _prepareWavUrl;
}

function silentUrl() {
    if (_silentWavUrl) return _silentWavUrl;
    const sr = 8000;
    const samples = new Int16Array(sr); // 1s, near-silence (not all-zero — iOS may skip those)
    for (let i = 0; i < samples.length; i++) samples[i] = i % 64 === 0 ? 2 : 0;
    _silentWavUrl = pcmWavUrl(samples, sr);
    return _silentWavUrl;
}

/** Near-silent WAV whose length matches the rest/stretch countdown (lock-screen Now Playing). */
function silentDurationUrl(durationSec) {
    const sec = Math.max(1, Math.min(600, Math.round(Number(durationSec) || 1)));
    if (_timerKeepUrl && _timerKeepSec === sec) return _timerKeepUrl;
    const sr = 8000;
    const samples = new Int16Array(sec * sr);
    for (let i = 0; i < samples.length; i++) samples[i] = i % 64 === 0 ? 2 : 0;
    if (_timerKeepUrl) {
        try { URL.revokeObjectURL(_timerKeepUrl); } catch (e) { /* ignore */ }
    }
    _timerKeepUrl = pcmWavUrl(samples, sr);
    _timerKeepSec = sec;
    return _timerKeepUrl;
}

function lockScreenRemainingSec() {
    if (!_lockScreen?.endsAt) return 0;
    return Math.max(0, Math.ceil((_lockScreen.endsAt - Date.now()) / 1000));
}

function installMediaSessionHandlers() {
    if (_mediaHandlersInstalled || typeof navigator === 'undefined' || !navigator.mediaSession) return;
    _mediaHandlersInstalled = true;
    const resume = () => {
        try { startKeepAlive(); } catch (e) { /* ignore */ }
    };
    try { navigator.mediaSession.setActionHandler('play', resume); } catch (e) { /* ignore */ }
    try { navigator.mediaSession.setActionHandler('pause', resume); } catch (e) { /* ignore */ }
}

function applyMediaSession() {
    if (typeof navigator === 'undefined' || !navigator.mediaSession) return;
    installMediaSessionHandlers();
    const title = _lockScreen?.title || 'Timer';
    const artist = _lockScreen?.artist || 'Ascensus';
    try {
        navigator.mediaSession.metadata = new MediaMetadata({
            title,
            artist,
            album: 'Ascensus'
        });
        navigator.mediaSession.playbackState = 'playing';
    } catch (e) { /* ignore */ }
    pokeLockScreenPosition();
}

function clearMediaSession() {
    if (typeof navigator === 'undefined' || !navigator.mediaSession) return;
    try { navigator.mediaSession.playbackState = 'none'; } catch (e) { /* ignore */ }
    try { navigator.mediaSession.metadata = null; } catch (e) { /* ignore */ }
}

export function pokeLockScreenPosition() {
    if (!_lockScreen || typeof navigator === 'undefined' || !navigator.mediaSession?.setPositionState) return;
    const dur = Math.max(1, Number(_lockScreen.durationSec) || 1);
    const elapsed = Math.max(0, (Date.now() - (_lockScreen.startedAt || Date.now())) / 1000);
    try {
        navigator.mediaSession.setPositionState({
            duration: dur,
            playbackRate: 1,
            position: Math.max(0, Math.min(dur - 0.05, elapsed))
        });
    } catch (e) { /* ignore */ }
}

/**
 * Drive lock-screen Now Playing from the live rest or stretch countdown.
 * Plays a near-silent track whose length is the remaining time (replaces the 1s loop).
 */
export function ensureLockScreenTimer({ remainingSec, title, artist } = {}) {
    const remaining = Math.max(0, Math.ceil(Number(remainingSec) || 0));
    if (remaining < 1) {
        clearLockScreenTimer();
        return;
    }
    const endsAt = Date.now() + remaining * 1000;
    const nextTitle = String(title || 'Timer');
    const nextArtist = String(artist || 'Ascensus');
    if (
        _lockScreen
        && _lockScreen.title === nextTitle
        && Math.abs((_lockScreen.endsAt || 0) - endsAt) < 2000
    ) {
        pokeLockScreenPosition();
        return;
    }
    _lockScreen = {
        title: nextTitle,
        artist: nextArtist,
        durationSec: remaining,
        startedAt: Date.now(),
        endsAt
    };
    if (!_cuePlaying) startKeepAlive();
    applyMediaSession();
}

export function clearLockScreenTimer() {
    _lockScreen = null;
    if (_cuePlaying) return;
    if (_holdCount > 0) startKeepAlive();
    else {
        stopKeepAlive();
        clearMediaSession();
    }
}

function getAudioContext() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!_ctx) _ctx = new AudioCtx();
    window._ascensusAudioCtx = _ctx;
    return _ctx;
}

function getBeepEl() {
    if (!_beepEl) {
        _beepEl = new Audio();
        _beepEl.preload = 'auto';
        _beepEl.setAttribute('playsinline', '');
        _beepEl.setAttribute('webkit-playsinline', '');
    }
    return _beepEl;
}

function getKeepEl() {
    if (!_keepEl) {
        _keepEl = new Audio();
        _keepEl.preload = 'auto';
        _keepEl.loop = true;
        _keepEl.volume = 0.01;
        _keepEl.setAttribute('playsinline', '');
        _keepEl.setAttribute('webkit-playsinline', '');
    }
    return _keepEl;
}

function onCueEnded() {
    _cuePlaying = false;
    if (_holdCount > 0 || lockScreenRemainingSec() > 0) startKeepAlive();
    else {
        stopKeepAlive();
        clearMediaSession();
    }
}

function playHtmlWav(url) {
    try {
        const keepPlaying = _keepEl && !_keepEl.paused;
        const holdActive = _holdCount > 0 || !!_lockScreen || keepPlaying;
        const el = holdActive ? getKeepEl() : getBeepEl();
        const gen = ++_cueGen;
        _cuePlaying = true;
        el.loop = false;
        el.pause();
        el.volume = 1;
        el.src = url;
        el.currentTime = 0;
        const p = el.play();
        if (p && p.catch) p.catch(() => { if (gen === _cueGen) _cuePlaying = false; });
        el.addEventListener('ended', () => {
            if (gen !== _cueGen) return;
            onCueEnded();
        }, { once: true });
        return true;
    } catch (e) {
        _cuePlaying = false;
        return false;
    }
}

function startKeepAlive() {
    if (_cuePlaying) return;
    const ctx = getAudioContext();
    if (ctx) {
        try {
            if (!_keepOsc) {
                _keepOsc = ctx.createOscillator();
                _keepGain = ctx.createGain();
                _keepGain.gain.value = 0.00008;
                _keepOsc.frequency.value = 20;
                _keepOsc.connect(_keepGain);
                _keepGain.connect(ctx.destination);
                _keepOsc.start();
            }
        } catch (e) { /* ignore */ }
        ctx.resume?.().catch?.(() => {});
    }
    try {
        const el = getKeepEl();
        el.volume = 0.01;
        const left = lockScreenRemainingSec();
        if (left > 0 && _lockScreen) {
            _lockScreen.durationSec = left;
            _lockScreen.startedAt = Date.now();
            el.loop = false;
            const url = silentDurationUrl(left);
            if (el.src !== url) el.src = url;
            applyMediaSession();
        } else {
            el.loop = true;
            if (el.src !== silentUrl()) el.src = silentUrl();
        }
        const p = el.play();
        if (p && p.catch) p.catch(() => {});
        el.onended = () => {
            if (_cuePlaying) return;
            if (lockScreenRemainingSec() > 1 || _holdCount > 0) startKeepAlive();
        };
    } catch (e) { /* ignore */ }
}

function stopKeepAlive() {
    if (_cuePlaying) return;
    if (_keepOsc) {
        try { _keepOsc.stop(); } catch (e) { /* ignore */ }
        try { _keepOsc.disconnect(); } catch (e) { /* ignore */ }
        try { _keepGain?.disconnect(); } catch (e) { /* ignore */ }
        _keepOsc = null;
        _keepGain = null;
    }
    if (_keepEl) {
        try { _keepEl.pause(); } catch (e) { /* ignore */ }
    }
}

function scheduleWebAudio(notes, { type = 'square', peak = 0.55, now } = {}) {
    const ctx = getAudioContext();
    if (!ctx || ctx.state !== 'running') return false;
    const t0 = now != null ? now : ctx.currentTime;
    try {
        notes.forEach(t => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = type;
            osc.frequency.value = t.freq;
            const start = t0 + t.offset;
            gain.gain.setValueAtTime(0.0001, start);
            gain.gain.exponentialRampToValueAtTime(peak, start + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + t.dur);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(start);
            osc.stop(start + t.dur + 0.02);
        });
        return true;
    } catch (e) {
        return false;
    }
}

/** Resume/create audio during a user gesture so later timer beeps are allowed. */
export function unlockAudio() {
    installAudioUnlock();
    const ctx = getAudioContext();
    if (ctx && ctx.state !== 'running') {
        try { ctx.resume(); } catch (e) { /* ignore */ }
    }
    if (!_htmlUnlocked) {
        try {
            const el = getBeepEl();
            if (!el.src) el.src = silentUrl();
            const p = el.play();
            if (p && p.then) {
                p.then(() => {
                    _htmlUnlocked = true;
                    try { el.pause(); el.currentTime = 0; } catch (e) { /* ignore */ }
                }).catch(() => {});
            }
        } catch (e) { /* ignore */ }
    }
}

export function installAudioUnlock() {
    if (_unlockInstalled || typeof document === 'undefined') return;
    _unlockInstalled = true;
    const unlock = () => { unlockAudio(); };
    ['pointerdown', 'touchstart', 'keydown'].forEach(ev => {
        document.addEventListener(ev, unlock, { capture: true, passive: true });
    });
}

/** Keep the audio graph alive for the duration of a rest/stretch timer. */
export function holdAudioAlive() {
    unlockAudio();
    _holdCount += 1;
    startKeepAlive();
}

export function pokeAudioAlive() {
    unlockAudio();
    if (_cuePlaying) return;
    if (_holdCount > 0 || lockScreenRemainingSec() > 0) startKeepAlive();
}

export function releaseAudioAlive() {
    _holdCount = Math.max(0, _holdCount - 1);
    if (_holdCount === 0 && !_cuePlaying && lockScreenRemainingSec() <= 0) stopKeepAlive();
}

export function releaseAllAudioHolds() {
    _holdCount = 0;
    _lockScreen = null;
    if (_cuePlaying) return;
    stopKeepAlive();
    clearMediaSession();
}

function preferHtmlCues() {
    if (_holdCount > 0 || _lockScreen || (_keepEl && !_keepEl.paused)) return true;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return true;
    return false;
}

async function playSequence(notes, { type, peak, fallbackUrl }) {
    unlockAudio();
    if (!preferHtmlCues()) {
        const ctx = getAudioContext();
        if (ctx) {
            try {
                if (ctx.state === 'suspended' || ctx.state === 'interrupted') {
                    await ctx.resume();
                }
            } catch (e) { /* ignore */ }
            if (ctx.state === 'running' && scheduleWebAudio(notes, { type, peak })) return;
        }
    }
    playHtmlWav(fallbackUrl());
}

/** Multi-tone rest-over alarm (3 repeats). */
export function playRestAlarmSound() {
    const notes = [];
    for (let r = 0; r < REST_REPEATS; r++) {
        REST_PATTERN.forEach(t => notes.push({
            freq: t.freq,
            offset: r * REST_CYCLE + t.offset,
            dur: t.dur
        }));
    }
    playSequence(notes, { type: 'square', peak: 0.55, fallbackUrl: restAlarmUrl }).catch(() => {
        playHtmlWav(restAlarmUrl());
    });
}

/** Single short stretch beep. */
export function playStretchBeepSound() {
    playSequence(
        [{ freq: 880, offset: 0, dur: 0.14 }],
        { type: 'sine', peak: 0.28, fallbackUrl: stretchBeepUrl }
    ).catch(() => {
        playHtmlWav(stretchBeepUrl());
    });
}

/** Very short cue at 30s remaining — get ready for the next set. */
export function playPrepareBeepSound() {
    playSequence(
        [{ freq: 1244.5, offset: 0, dur: 0.14 }],
        { type: 'sine', peak: 0.52, fallbackUrl: prepareBeepUrl }
    ).catch(() => {
        playHtmlWav(prepareBeepUrl());
    });
}

installAudioUnlock();

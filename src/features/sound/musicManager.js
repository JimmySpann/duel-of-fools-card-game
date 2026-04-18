/**
 * musicManager.js
 * Background music playlist player using the HTML Audio API.
 * Singleton — import and use anywhere; changes are broadcast to subscribers.
 */

export const TRACKS = [
    { name: 'Court Jam', src: '/audio/Court%20Jam.mp3', bpm: 120 },
    { name: 'Free Diver', src: '/audio/Free%20Diver.mp3', bpm: 80 },
    { name: 'Jester on the Prowl', src: '/audio/Jester%20on%20the%20Prowl.mp3', bpm: 135 },
    { name: 'Steppin n Jestin', src: '/audio/Steppin%20n%20Jestin.mp3', bpm: 95 },
    { name: 'Zesty Lester', src: '/audio/Zesty%20Lester.mp3', bpm: 128 },
];

// ── Persistence helpers ───────────────────────────────────────────────────────

const load = (key, fallback) => {
    try {
        const v = localStorage.getItem(key);
        return v !== null ? JSON.parse(v) : fallback;
    } catch { return fallback; }
};

const save = (key, val) => {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch { }
};

// Cookie helpers (used for muted state so it persists across sessions)
const loadCookie = (key, fallback) => {
    try {
        const match = document.cookie.split('; ').find((c) => c.startsWith(key + '='));
        return match ? JSON.parse(decodeURIComponent(match.split('=')[1])) : fallback;
    } catch { return fallback; }
};

const saveCookie = (key, val) => {
    try {
        const expires = new Date();
        expires.setFullYear(expires.getFullYear() + 1);
        document.cookie = `${key}=${encodeURIComponent(JSON.stringify(val))};expires=${expires.toUTCString()};path=/;SameSite=Lax`;
    } catch { }
};

// ── Internal state ────────────────────────────────────────────────────────────

let _audio = null;
let _audioContext = null;
let _mediaSource = null;
let _analyser = null;
let _frequencyData = null;
let _reactiveLevel = 0;
let _state = {
    playing: false,
    currentIndex: load('cg_musicIndex', 0),
    volume: load('cg_musicVolume', 0.5),
    enabled: loadCookie('cg_musicEnabled', true),
};

const _subscribers = new Set();

const notify = () => _subscribers.forEach((fn) => fn({ ..._state }));

// ── Audio analysis (Web Audio) ───────────────────────────────────────────────

const ensureAnalyser = () => {
    const audio = getAudio();
    if (!audio || typeof window === 'undefined') return null;
    if (_analyser && _frequencyData) return _analyser;

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;

    try {
        if (!_audioContext) {
            _audioContext = new AudioCtx();
        }

        if (!_mediaSource) {
            _mediaSource = _audioContext.createMediaElementSource(audio);
        }

        if (!_analyser) {
            _analyser = _audioContext.createAnalyser();
            _analyser.fftSize = 256;
            _analyser.smoothingTimeConstant = 0.75;
            _frequencyData = new Uint8Array(_analyser.frequencyBinCount);

            _mediaSource.connect(_analyser);
            _analyser.connect(_audioContext.destination);
        }
    } catch {
        return null;
    }

    return _analyser;
};

// ── Audio element ─────────────────────────────────────────────────────────────

const getAudio = () => {
    if (!_audio) {
        _audio = new Audio();
        _audio.volume = _state.volume;
        _audio.src = TRACKS[_state.currentIndex].src;

        _audio.addEventListener('ended', () => {
            _state.currentIndex = (_state.currentIndex + 1) % TRACKS.length;
            save('cg_musicIndex', _state.currentIndex);
            _audio.src = TRACKS[_state.currentIndex].src;
            _audio.play().catch(() => { });
            notify();
        });
    }
    return _audio;
};

// ── Public API ────────────────────────────────────────────────────────────────

const musicManager = {
    TRACKS,

    getState: () => ({ ..._state }),

    subscribe(fn) {
        _subscribers.add(fn);
        return () => _subscribers.delete(fn);
    },

    play() {
        const a = getAudio();
        // Re-set src if we're pointing at the wrong track
        const expected = window.location.origin + TRACKS[_state.currentIndex].src;
        if (a.src !== expected) {
            a.src = TRACKS[_state.currentIndex].src;
        }
        a.play()
            .then(() => {
                ensureAnalyser();
                if (_audioContext?.state === 'suspended') {
                    _audioContext.resume().catch(() => { });
                }
                _state.playing = true;
                _state.enabled = true;
                saveCookie('cg_musicEnabled', true);
                notify();
            })
            .catch(() => { });
    },

    pause() {
        if (_audio) _audio.pause();
        _state.playing = false;
        _state.enabled = false;
        saveCookie('cg_musicEnabled', false);
        notify();
    },

    toggle() {
        if (_state.playing) this.pause();
        else this.play();
    },

    setTrack(index) {
        const a = getAudio();
        _state.currentIndex = index;
        save('cg_musicIndex', index);
        a.src = TRACKS[index].src;
        if (_state.playing) {
            a.play().catch(() => { });
        }
        notify();
    },

    next() {
        this.setTrack((_state.currentIndex + 1) % TRACKS.length);
    },

    prev() {
        this.setTrack((_state.currentIndex - 1 + TRACKS.length) % TRACKS.length);
    },

    setVolume(v) {
        _state.volume = Math.max(0, Math.min(1, v));
        save('cg_musicVolume', _state.volume);
        if (_audio) _audio.volume = _state.volume;
        notify();
    },

    /** Returns the current playback position of the audio in seconds. */
    getCurrentTime() {
        return _audio?.currentTime ?? 0;
    },

    /** Returns the BPM of the currently playing track. */
    getCurrentBPM() {
        return TRACKS[_state.currentIndex].bpm;
    },

    /** Returns normalized track progress from 0..1, or 0 when unavailable. */
    getTrackProgress() {
        const duration = _audio?.duration;
        const currentTime = _audio?.currentTime ?? 0;
        if (!Number.isFinite(duration) || duration <= 0) return 0;
        return Math.max(0, Math.min(1, currentTime / duration));
    },

    /**
     * Returns a smoothed 0..1 reactive value based on low-mid frequency energy.
     * Safe fallback: returns 0 when analysis is unavailable or music is paused.
     */
    getReactiveLevel() {
        if (!_state.playing || _state.volume <= 0) {
            _reactiveLevel *= 0.9;
            return _reactiveLevel;
        }

        const analyser = ensureAnalyser();
        if (!analyser || !_frequencyData) return 0;

        analyser.getByteFrequencyData(_frequencyData);
        // Focus on low-mid bins for punch without noisy treble jitter.
        const start = 2;
        const end = Math.min(28, _frequencyData.length - 1);
        let sum = 0;
        for (let i = start; i <= end; i += 1) sum += _frequencyData[i];
        const avg = sum / (end - start + 1);
        const normalized = Math.max(0, Math.min(1, avg / 160));

        // Attack fast, release slowly for natural motion.
        const alpha = normalized > _reactiveLevel ? 0.35 : 0.14;
        _reactiveLevel += (normalized - _reactiveLevel) * alpha;
        return _reactiveLevel;
    },

    /**
     * Start music only if the user hasn't disabled it and volume is above zero.
     * No-op if already playing. Safe to call on every page/view change.
     */
    autoPlay() {
        if (_state.enabled && _state.volume > 0 && !_state.playing) {
            this.play();
        }
    },
};

export default musicManager;

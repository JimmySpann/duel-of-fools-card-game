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
let _state = {
    playing: false,
    currentIndex: load('cg_musicIndex', 0),
    volume: load('cg_musicVolume', 0.5),
    enabled: loadCookie('cg_musicEnabled', true),
};

const _subscribers = new Set();

const notify = () => _subscribers.forEach((fn) => fn({ ..._state }));

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

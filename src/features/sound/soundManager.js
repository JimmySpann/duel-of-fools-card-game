/**
 * soundManager.js
 * Procedural sound effects using the Web Audio API — no audio files required.
 * All sounds are synthesised from oscillators and gain envelopes.
 *
 * Usage:
 *   import sounds from '../sound/soundManager';
 *   sounds.hit();
 *   sounds.setVolume(0.5); // 0–1, default 0.6
 */

let _ctx = null;
let _masterVol = 0.6;

/** Lazily create / resume the AudioContext (browsers require a user gesture first). */
const getCtx = () => {
    if (!_ctx) {
        _ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (_ctx.state === 'suspended') _ctx.resume();
    return _ctx;
};

/** Wire an oscillator through a gain envelope and fire it. */
const playOsc = (ctx, dest, { type = 'sine', startFreq, endFreq, duration, gainPeak, startTime = 0 }) => {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.connect(env);
    env.connect(dest);

    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, ctx.currentTime + startTime);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, ctx.currentTime + startTime + duration);

    env.gain.setValueAtTime(0.001, ctx.currentTime + startTime);
    env.gain.linearRampToValueAtTime(gainPeak, ctx.currentTime + startTime + 0.005);
    env.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startTime + duration);

    osc.start(ctx.currentTime + startTime);
    osc.stop(ctx.currentTime + startTime + duration + 0.02);
};

/** Create a master gain node at the current volume level. */
const makeDest = (ctx, vol = 1) => {
    const g = ctx.createGain();
    g.gain.value = _masterVol * vol;
    g.connect(ctx.destination);
    return g;
};

// ─────────────────────────────────────────────────────────────────────────────

const sounds = {
    /** Set master volume (0–1). */
    setVolume(v) {
        _masterVol = Math.max(0, Math.min(1, v));
    },

    /** Basic attack lands on an enemy card. */
    hit() {
        try {
            const ctx = getCtx();
            const dest = makeDest(ctx, 0.55);
            // Sharp downward sawtooth strike
            playOsc(ctx, dest, { type: 'sawtooth', startFreq: 380, endFreq: 70, duration: 0.14, gainPeak: 0.6 });
            // Thin high click for impact clarity
            playOsc(ctx, dest, { type: 'square', startFreq: 1200, endFreq: 400, duration: 0.06, gainPeak: 0.2 });
        } catch (_) { /* AudioContext unavailable */ }
    },

    /** Attack was evaded — soft swish. */
    miss() {
        try {
            const ctx = getCtx();
            const dest = makeDest(ctx, 0.3);
            playOsc(ctx, dest, { type: 'sine', startFreq: 700, endFreq: 180, duration: 0.22, gainPeak: 0.18 });
        } catch (_) { }
    },

    /** A card is defeated and removed from the field. */
    defeat() {
        try {
            const ctx = getCtx();
            const dest = makeDest(ctx, 0.6);
            // Heavy low thud
            playOsc(ctx, dest, { type: 'triangle', startFreq: 220, endFreq: 40, duration: 0.3, gainPeak: 0.7 });
            // Descending whine
            playOsc(ctx, dest, { type: 'sawtooth', startFreq: 500, endFreq: 80, duration: 0.5, gainPeak: 0.3, startTime: 0.05 });
        } catch (_) { }
    },

    /** Attack was blocked by invulnerability / invisible status. */
    blocked() {
        try {
            const ctx = getCtx();
            const dest = makeDest(ctx, 0.3);
            playOsc(ctx, dest, { type: 'square', startFreq: 260, endFreq: 220, duration: 0.12, gainPeak: 0.15 });
            playOsc(ctx, dest, { type: 'sine', startFreq: 440, endFreq: 440, duration: 0.15, gainPeak: 0.12, startTime: 0.03 });
        } catch (_) { }
    },

    /** Direct hit on the opposing player (no enemy cards on field). */
    directHit() {
        try {
            const ctx = getCtx();
            const dest = makeDest(ctx, 0.65);
            // Deep powerful thud
            playOsc(ctx, dest, { type: 'sawtooth', startFreq: 180, endFreq: 35, duration: 0.28, gainPeak: 0.75 });
            // Crack layer
            playOsc(ctx, dest, { type: 'square', startFreq: 900, endFreq: 200, duration: 0.08, gainPeak: 0.3 });
        } catch (_) { }
    },

    /** A card is played from hand to the battlefield. */
    cardPlay() {
        try {
            const ctx = getCtx();
            const dest = makeDest(ctx, 0.45);
            // Upward sweep — card "landing"
            playOsc(ctx, dest, { type: 'triangle', startFreq: 280, endFreq: 720, duration: 0.1, gainPeak: 0.45 });
            // Subtle echo
            playOsc(ctx, dest, { type: 'sine', startFreq: 560, endFreq: 560, duration: 0.2, gainPeak: 0.15, startTime: 0.08 });
        } catch (_) { }
    },

    /** End Turn button clicked. */
    endTurn() {
        try {
            const ctx = getCtx();
            const dest = makeDest(ctx, 0.4);
            // Two descending bell tones
            [
                { startFreq: 523, startTime: 0 },
                { startFreq: 392, startTime: 0.13 },
            ].forEach(({ startFreq, startTime }) => {
                playOsc(ctx, dest, { type: 'sine', startFreq, duration: 0.35, gainPeak: 0.35, startTime });
            });
        } catch (_) { }
    },

    /** It's now this client's turn. */
    yourTurn() {
        try {
            const ctx = getCtx();
            const dest = makeDest(ctx, 0.45);
            // Three ascending chime notes
            [392, 523, 659].forEach((freq, i) => {
                playOsc(ctx, dest, { type: 'sine', startFreq: freq, duration: 0.38, gainPeak: 0.3, startTime: i * 0.14 });
            });
        } catch (_) { }
    },

    /** An ability is used (before knowing the outcome). */
    ability() {
        try {
            const ctx = getCtx();
            const dest = makeDest(ctx, 0.38);
            playOsc(ctx, dest, { type: 'sine', startFreq: 800, endFreq: 1400, duration: 0.08, gainPeak: 0.28 });
            playOsc(ctx, dest, { type: 'sine', startFreq: 1400, endFreq: 600, duration: 0.14, gainPeak: 0.22, startTime: 0.07 });
        } catch (_) { }
    },

    /** Healing ability resolves. */
    heal() {
        try {
            const ctx = getCtx();
            const dest = makeDest(ctx, 0.4);
            [523, 659, 784].forEach((freq, i) => {
                playOsc(ctx, dest, { type: 'sine', startFreq: freq, duration: 0.45, gainPeak: 0.25, startTime: i * 0.1 });
            });
        } catch (_) { }
    },

    /** Status effect applied (freeze, burn, poison, etc.). */
    statusApply() {
        try {
            const ctx = getCtx();
            const dest = makeDest(ctx, 0.32);
            playOsc(ctx, dest, { type: 'square', startFreq: 300, endFreq: 600, duration: 0.12, gainPeak: 0.18 });
            playOsc(ctx, dest, { type: 'square', startFreq: 600, endFreq: 300, duration: 0.12, gainPeak: 0.14, startTime: 0.1 });
        } catch (_) { }
    },

    /** Current player wins the game. */
    gameWin() {
        try {
            const ctx = getCtx();
            const dest = makeDest(ctx, 0.55);
            // Ascending triumphant fanfare
            [
                [261, 0], [329, 0.16], [392, 0.32], [523, 0.52],
                [523, 0.72], [659, 0.92], [784, 1.15],
            ].forEach(([freq, startTime]) => {
                playOsc(ctx, dest, { type: 'triangle', startFreq: freq, duration: 0.38, gainPeak: 0.42, startTime });
            });
        } catch (_) { }
    },

    /** Current player loses the game. */
    gameLose() {
        try {
            const ctx = getCtx();
            const dest = makeDest(ctx, 0.5);
            // Descending sad tones
            [
                [392, 0], [349, 0.3], [330, 0.65], [261, 1.05],
            ].forEach(([freq, startTime]) => {
                playOsc(ctx, dest, { type: 'sine', startFreq: freq, duration: 0.55, gainPeak: 0.35, startTime });
            });
        } catch (_) { }
    },
};

export default sounds;

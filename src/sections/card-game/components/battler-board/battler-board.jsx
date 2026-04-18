import { useState, useEffect, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import MiniCard from '../card-layouts/mini-card/mini-card.jsx';
import { commitDefeats } from '../../database/cardGameSlice.js';
import musicManager from '../../../../features/sound/musicManager';
import './battler-board.css'

const ANIM_DURATION = 900;
const DANCE_MOTION_THRESHOLD = 0.24;
const DANCE_PEAK_BOOST = 1.95;
const DANCE_MAX_X_TRAVEL = 34;
const DANCE_MAX_LIFT = 18;
const DANCE_MAX_ROTATION = 22;
const DANCE_Y_SPIN_INTERVAL = 32;  // beats between pirouette windows (~every 8 bars)
const DANCE_Y_SPIN_DURATION = 3.2; // beats for a full 360 Y-spin (slow pirouette)
const DANCE_Y_SPIN_THRESHOLD = 0.72; // min energy required to trigger

const TWO_PI = Math.PI * 2;
const DANCE_CHOREOGRAPHIES = [
    {
        // Court Jam: tight two-step intro, then bigger chorus spins.
        cycleBars: 8,
        base: {
            xRange: 10.5,
            xKick: 4.5,
            yLift: 7,
            yKick: 8.5,
            rebound: 2.5,
            rotSwing: 2.5,
            rotKick: 1.8,
            leanDeg: 1.9,
            scalePulse: 0.045,
            swayFreq: 1,
            hopFreq: 2,
            stepFreq: 1,
            stepAmp: 4.2,
            accentLag: 0.06,
            spinBeatFreq: 0.5,
            spinWidth: 0.16,
            spinDeg: 95,
            spinLag: 0.08,
            spinEnergyThreshold: 0.35,
        },
        phases: [
            { startBar: 0, endBar: 2, stepAmp: 3.4, yKick: 6.8, spinDeg: 0 },
            { startBar: 2, endBar: 4, xRange: 12, stepAmp: 5.2, yKick: 9.4, spinDeg: 75 },
            { startBar: 4, endBar: 6, xRange: 13.5, xKick: 6, yKick: 10.2, stepAmp: 5.8, spinDeg: 150 },
            { startBar: 6, endBar: 8, hopFreq: 1, yLift: 5.6, stepAmp: 3.2, spinDeg: 45 },
        ],
    },
    {
        // Free Diver: floaty drift with delayed accents and rare spins.
        cycleBars: 10,
        base: {
            xRange: 7.5,
            xKick: 2.8,
            yLift: 6.8,
            yKick: 6.2,
            rebound: 1.8,
            rotSwing: 1.6,
            rotKick: 1.1,
            leanDeg: 1.2,
            scalePulse: 0.032,
            swayFreq: 0.5,
            hopFreq: 1,
            stepFreq: 0.5,
            stepAmp: 2.4,
            accentLag: 0.13,
            spinBeatFreq: 0.25,
            spinWidth: 0.2,
            spinDeg: 65,
            spinLag: 0.15,
            spinEnergyThreshold: 0.5,
        },
        phases: [
            { startBar: 0, endBar: 4, swayFreq: 0.45, yLift: 5.8, stepAmp: 1.6, spinDeg: 0 },
            { startBar: 4, endBar: 7, xRange: 8.6, yLift: 7.5, yKick: 7.2, stepAmp: 2.8, spinDeg: 55 },
            { startBar: 7, endBar: 10, xRange: 9.4, stepFreq: 1, stepAmp: 3.2, spinDeg: 90, spinEnergyThreshold: 0.58 },
        ],
    },
    {
        // Jester on the Prowl: aggressive zig-zag with quick turn bursts.
        cycleBars: 8,
        base: {
            xRange: 12.5,
            xKick: 6.5,
            yLift: 8.2,
            yKick: 11,
            rebound: 3.2,
            rotSwing: 3.4,
            rotKick: 2.8,
            leanDeg: 2.4,
            scalePulse: 0.06,
            swayFreq: 2,
            hopFreq: 2,
            stepFreq: 2,
            stepAmp: 5.4,
            accentLag: 0.03,
            spinBeatFreq: 1,
            spinWidth: 0.14,
            spinDeg: 135,
            spinLag: 0.04,
            spinEnergyThreshold: 0.32,
        },
        phases: [
            { startBar: 0, endBar: 2, yKick: 8.8, stepAmp: 4.6, spinDeg: 70 },
            { startBar: 2, endBar: 4, xRange: 14.5, xKick: 8, stepAmp: 6.5, spinDeg: 165 },
            { startBar: 4, endBar: 6, hopFreq: 4, yLift: 7.2, yKick: 12.5, spinDeg: 180 },
            { startBar: 6, endBar: 8, swayFreq: 1, xRange: 9.8, stepAmp: 3.6, spinDeg: 80 },
        ],
    },
    {
        // Steppin n Jestin: shuffle pattern with lane-cross style travel.
        cycleBars: 12,
        base: {
            xRange: 9,
            xKick: 4,
            yLift: 6.8,
            yKick: 8.1,
            rebound: 2.3,
            rotSwing: 2,
            rotKick: 1.7,
            leanDeg: 1.8,
            scalePulse: 0.041,
            swayFreq: 1,
            hopFreq: 2,
            stepFreq: 1,
            stepAmp: 4.1,
            accentLag: 0.08,
            spinBeatFreq: 0.5,
            spinWidth: 0.16,
            spinDeg: 100,
            spinLag: 0.1,
            spinEnergyThreshold: 0.42,
        },
        phases: [
            { startBar: 0, endBar: 3, stepFreq: 0.5, stepAmp: 2.5, yLift: 5.8, spinDeg: 0 },
            { startBar: 3, endBar: 6, xRange: 10.8, xKick: 4.8, stepAmp: 4.6, spinDeg: 80 },
            { startBar: 6, endBar: 9, hopFreq: 4, yKick: 9.6, stepFreq: 2, stepAmp: 5.3, spinDeg: 130 },
            { startBar: 9, endBar: 12, swayFreq: 0.5, xRange: 7.8, stepAmp: 2.8, spinDeg: 55 },
        ],
    },
    {
        // Zesty Lester: brisk footwork and quick center-out spins.
        cycleBars: 8,
        base: {
            xRange: 10.8,
            xKick: 5.1,
            yLift: 7,
            yKick: 9,
            rebound: 2.7,
            rotSwing: 2.4,
            rotKick: 2,
            leanDeg: 2,
            scalePulse: 0.048,
            swayFreq: 2,
            hopFreq: 4,
            stepFreq: 2,
            stepAmp: 4.7,
            accentLag: 0.05,
            spinBeatFreq: 1,
            spinWidth: 0.13,
            spinDeg: 115,
            spinLag: 0.05,
            spinEnergyThreshold: 0.38,
        },
        phases: [
            { startBar: 0, endBar: 2, yKick: 8.2, stepAmp: 3.7, spinDeg: 75 },
            { startBar: 2, endBar: 4, xRange: 12.2, stepAmp: 5.4, spinDeg: 140 },
            { startBar: 4, endBar: 6, hopFreq: 2, yLift: 8.2, yKick: 10.5, spinDeg: 165 },
            { startBar: 6, endBar: 8, swayFreq: 1, stepFreq: 1, xRange: 8.4, stepAmp: 2.9, spinDeg: 65 },
        ],
    },
];

const beatEnvelope = (phase, width = 0.32) => {
    const wrapped = phase - Math.floor(phase);
    const dist = Math.min(wrapped, 1 - wrapped);
    if (dist >= width) return 0;
    const normalized = 1 - dist / width;
    return normalized * normalized;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const getPhaseProfile = (choreo, trackBeats) => {
    const cycleBars = Math.max(1, choreo.cycleBars || 8);
    const barInCycle = ((trackBeats / 4) % cycleBars + cycleBars) % cycleBars;
    const phaseOverride = choreo.phases?.find((phase) => barInCycle >= phase.startBar && barInCycle < phase.endBar) || {};
    return {
        ...choreo.base,
        ...phaseOverride,
    };
};

const DANCE_PHASE_MAPS = [
    [
        { name: 'intro', start: 0, end: 0.14, pattern: 'twoStep', overrides: { spinDeg: 0, stepAmp: 3.1, yKick: 6.4 } },
        { name: 'verse', start: 0.14, end: 0.45, pattern: 'grapevine', overrides: { xRange: 12.2, stepAmp: 5.2 } },
        { name: 'chorus', start: 0.45, end: 0.7, pattern: 'spinCombo', overrides: { spinDeg: 165, yKick: 10.6 } },
        { name: 'bridge', start: 0.7, end: 0.88, pattern: 'shuffleRun', overrides: { hopFreq: 4, stepFreq: 2, yLift: 6.2 } },
        { name: 'outro', start: 0.88, end: 1.01, pattern: 'twoStep', overrides: { xRange: 8.8, spinDeg: 40 } },
    ],
    [
        { name: 'intro', start: 0, end: 0.2, pattern: 'floatStep', overrides: { swayFreq: 0.35, stepAmp: 1.4, spinDeg: 0 } },
        { name: 'verse', start: 0.2, end: 0.48, pattern: 'floatStep', overrides: { xRange: 8.4, yLift: 7.2 } },
        { name: 'chorus', start: 0.48, end: 0.74, pattern: 'grapevine', overrides: { stepAmp: 3.5, spinDeg: 75, spinEnergyThreshold: 0.56 } },
        { name: 'bridge', start: 0.74, end: 0.9, pattern: 'shuffleRun', overrides: { hopFreq: 2, xKick: 3.3, stepFreq: 1 } },
        { name: 'outro', start: 0.9, end: 1.01, pattern: 'floatStep', overrides: { xRange: 6.8, yKick: 5.2, spinDeg: 0 } },
    ],
    [
        { name: 'intro', start: 0, end: 0.1, pattern: 'shuffleRun', overrides: { stepAmp: 4.5, spinDeg: 70 } },
        { name: 'verse', start: 0.1, end: 0.43, pattern: 'zigZag', overrides: { xRange: 14.8, stepAmp: 6.9, yKick: 11.2 } },
        { name: 'chorus', start: 0.43, end: 0.7, pattern: 'spinCombo', overrides: { spinDeg: 190, spinBeatFreq: 1.2 } },
        { name: 'bridge', start: 0.7, end: 0.88, pattern: 'zigZag', overrides: { hopFreq: 4, stepFreq: 2, yLift: 7.1 } },
        { name: 'outro', start: 0.88, end: 1.01, pattern: 'twoStep', overrides: { xRange: 10.2, spinDeg: 60 } },
    ],
    [
        { name: 'intro', start: 0, end: 0.14, pattern: 'twoStep', overrides: { stepFreq: 0.5, stepAmp: 2.2, spinDeg: 0 } },
        { name: 'verse', start: 0.14, end: 0.46, pattern: 'grapevine', overrides: { xRange: 10.9, stepAmp: 4.8 } },
        { name: 'chorus', start: 0.46, end: 0.72, pattern: 'shuffleRun', overrides: { hopFreq: 4, stepFreq: 2, spinDeg: 135 } },
        { name: 'bridge', start: 0.72, end: 0.9, pattern: 'spinCombo', overrides: { spinDeg: 150, spinEnergyThreshold: 0.46 } },
        { name: 'outro', start: 0.9, end: 1.01, pattern: 'twoStep', overrides: { xRange: 7.6, stepAmp: 2.4, spinDeg: 35 } },
    ],
    [
        { name: 'intro', start: 0, end: 0.12, pattern: 'shuffleRun', overrides: { stepAmp: 3.4, spinDeg: 65 } },
        { name: 'verse', start: 0.12, end: 0.42, pattern: 'zigZag', overrides: { xRange: 12.3, stepAmp: 5.6, yKick: 9.8 } },
        { name: 'chorus', start: 0.42, end: 0.7, pattern: 'spinCombo', overrides: { spinDeg: 175, spinBeatFreq: 1.1 } },
        { name: 'bridge', start: 0.7, end: 0.88, pattern: 'grapevine', overrides: { swayFreq: 1, xKick: 4.4, stepFreq: 1 } },
        { name: 'outro', start: 0.88, end: 1.01, pattern: 'twoStep', overrides: { xRange: 8.2, spinDeg: 50 } },
    ],
];

const getNamedSongPhase = (trackIndex, progress) => {
    const map = DANCE_PHASE_MAPS[trackIndex % DANCE_PHASE_MAPS.length] || DANCE_PHASE_MAPS[0];
    const safeProgress = Number.isFinite(progress) ? clamp(progress, 0, 1) : 0;
    return map.find((phase) => safeProgress >= phase.start && safeProgress < phase.end) || map[map.length - 1];
};

const getPatternMotion = (pattern, { trackBeats, phase, onBeat, offBeat, barline, stepAmp, effectiveEnergy, intensity }) => {
    if (pattern === 'grapevine') {
        const glide = Math.sin(trackBeats * Math.PI * 0.5 + phase * 0.5);
        const cross = Math.sin(trackBeats * TWO_PI + phase * 1.7);
        return {
            extraX: (glide * 0.72 + cross * 0.42) * stepAmp * 1.26,
            extraY: Math.max(0, cross) * 1.4,
            extraRot: glide * 1.15,
            spinBoost: 0.12,
        };
    }

    if (pattern === 'shuffleRun') {
        const run = Math.sin(trackBeats * Math.PI + phase * 0.7);
        const tap = Math.sin(trackBeats * TWO_PI * 2 + phase * 1.4);
        const snap = Math.sign(tap) * Math.pow(Math.abs(tap), 0.6);
        return {
            extraX: (run * 0.62 + snap * 0.95) * stepAmp,
            extraY: Math.max(0, tap) * 1.9 + onBeat * 0.8,
            extraRot: snap * 1.05,
            spinBoost: 0.2,
        };
    }

    if (pattern === 'zigZag') {
        const zig = Math.sin(trackBeats * TWO_PI * 1.5 + phase * 0.5);
        const zag = Math.sin(trackBeats * TWO_PI * 3 + phase * 1.9);
        return {
            extraX: (zig * 0.94 + zag * 0.52) * stepAmp,
            extraY: Math.max(0, zag) * 1.3,
            extraRot: zig * 1.35,
            spinBoost: 0.22,
        };
    }

    if (pattern === 'floatStep') {
        const drift = Math.sin(trackBeats * Math.PI * 0.5 + phase * 0.4);
        const swell = Math.sin(trackBeats * Math.PI + phase * 0.9);
        return {
            extraX: drift * stepAmp * 0.75,
            extraY: Math.max(0, swell) * 1.1,
            extraRot: drift * 0.55,
            spinBoost: 0,
        };
    }

    if (pattern === 'spinCombo') {
        const windup = beatEnvelope(trackBeats * 0.5 + phase / TWO_PI, 0.2);
        const release = beatEnvelope(trackBeats + 0.25 + phase / TWO_PI, 0.16);
        const settle = beatEnvelope(trackBeats + 0.62 + phase / TWO_PI, 0.22);
        const lane = Math.sin(trackBeats * TWO_PI + phase * 0.5);
        const comboBoost = (windup * 0.32 + release * 1.05 + barline * 0.45 - settle * 0.35);
        return {
            extraX: lane * stepAmp * 0.58,
            extraY: windup * 1.7 + release * 1.4,
            extraRot: (release - settle) * 3.4 * effectiveEnergy * intensity,
            spinBoost: comboBoost * 0.72,
        };
    }

    // twoStep default
    const step = Math.sin(trackBeats * Math.PI + phase * 0.65);
    const groove = Math.sign(step) * Math.pow(Math.abs(step), 0.75);
    return {
        extraX: groove * stepAmp * 0.9,
        extraY: Math.max(0, step) * 1.2,
        extraRot: groove * 0.9 + (onBeat - offBeat * 0.35) * 0.6,
        spinBoost: 0.06,
    };
};

const CardLayout = ({ cards, onCardClick, highlight, playerId, showExhausted = true }) => {
    const dispatch = useDispatch();
    const lastHitEvents = useSelector((state) => state.cardGame.lastHitEvents);
    const cardDanceEnabled = useSelector((state) => state.profile.cardDanceEnabled !== false);
    const cardDanceIntensity = useSelector((state) => state.profile.cardDanceIntensity ?? 0.8);
    const [hoveredCardIndex, setHoveredCardIndex] = useState(null);
    const [flippedCards] = useState({});
    // { [cardId]: { type, damage } }
    const [animations, setAnimations] = useState({});
    const [danceEnergy, setDanceEnergy] = useState(0);
    const [danceAudioTime, setDanceAudioTime] = useState(0);
    const [danceBpm, setDanceBpm] = useState(120);
    const [danceTrackIndex, setDanceTrackIndex] = useState(0);
    const [danceTrackProgress, setDanceTrackProgress] = useState(0);
    const danceSmoothRef = useRef(0);
    const rafRef = useRef(null);
    const ySpinRef = useRef({});

    useEffect(() => {
        if (!lastHitEvents?.length) return;
        const relevant = lastHitEvents.filter((e) => e.defenderPlayerId === playerId);
        if (!relevant.length) return;

        // Deduplicate by cardId – keep last event per card
        const newAnims = {};
        relevant.forEach((e) => { newAnims[e.cardId] = { type: e.type, damage: e.damage }; });
        setAnimations((prev) => ({ ...prev, ...newAnims }));

        const timer = setTimeout(() => {
            setAnimations((prev) => {
                const next = { ...prev };
                relevant.forEach((e) => { delete next[e.cardId]; });
                return next;
            });
            dispatch(commitDefeats());
        }, ANIM_DURATION);
        return () => clearTimeout(timer);
    }, [lastHitEvents]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!cardDanceEnabled || cards.length === 0) {
            danceSmoothRef.current = 0;
            setDanceEnergy(0);
            setDanceAudioTime(0);
            setDanceTrackProgress(0);
            return;
        }

        let lastCommit = 0;
        const tick = (t) => {
            const target = musicManager.getReactiveLevel();
            const now = musicManager.getCurrentTime();
            const bpm = Math.max(60, musicManager.getCurrentBPM() || 120);
            const trackIndex = musicManager.getState().currentIndex || 0;
            const trackProgress = musicManager.getTrackProgress();
            // Extra local smoothing to keep board motion calm.
            danceSmoothRef.current += (target - danceSmoothRef.current) * 0.28;

            if (t - lastCommit > 32) {
                lastCommit = t;
                setDanceEnergy(danceSmoothRef.current);
                setDanceAudioTime(now);
                setDanceBpm(bpm);
                setDanceTrackIndex(trackIndex);
                setDanceTrackProgress(trackProgress);
            }
            rafRef.current = requestAnimationFrame(tick);
        };

        rafRef.current = requestAnimationFrame(tick);
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [cardDanceEnabled, cards.length]);

    const animClass = (card) => {
        const a = animations[card.id];
        if (!a) return '';
        if (a.type === 'defeat') return 'card-anim-defeat';
        if (a.type === 'hit') return 'card-anim-hit';
        if (a.type === 'miss' || a.type === 'blocked') return 'card-anim-miss';
        return '';
    };

    const damageLabel = (card) => {
        const a = animations[card.id];
        if (!a) return null;
        if (a.type === 'miss') return 'MISS';
        if (a.type === 'blocked') return 'BLOCK';
        return `-${a.damage}`;
    };

    const phaseFrom = (cardId, index) => {
        const seed = `${playerId ?? ''}:${cardId ?? index}`;
        let hash = 0;
        for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 100000;
        return (hash / 100000) * Math.PI * 2;
    };

    return (
        <div className={`board${highlight === true ? ' board-targetable' : highlight === 'ally' ? ' board-ally-targetable' : ''}`}>
            {cards.map((card, index) => (
                <div
                    className={`card-game-card ${hoveredCardIndex === index ? 'card-hover' : ''} ${animClass(card)}`}
                    onMouseEnter={() => setHoveredCardIndex(index)}
                    onMouseLeave={() => setHoveredCardIndex(null)}
                    onClick={() => !card.dying && onCardClick(index)}
                    key={card.id || index}
                    style={card.dying ? { pointerEvents: 'none' } : {}}
                >
                    {damageLabel(card) && (
                        <div className={`damage-float damage-float-${animations[card.id]?.type}`}>
                            {damageLabel(card)}
                        </div>
                    )}
                    <div
                        className={`card-dance-layer${cardDanceEnabled ? ' card-dance-enabled' : ''}`}
                        style={(() => {
                            if (!cardDanceEnabled || danceEnergy <= 0.001) return undefined;
                            const gated = Math.max(0, (danceEnergy - DANCE_MOTION_THRESHOLD) / (1 - DANCE_MOTION_THRESHOLD));
                            if (gated <= 0.001) return undefined;

                            const choreo = DANCE_CHOREOGRAPHIES[danceTrackIndex % DANCE_CHOREOGRAPHIES.length] || DANCE_CHOREOGRAPHIES[0];
                            const phase = phaseFrom(card.id, index);
                            const trackBeats = danceAudioTime * (danceBpm / 60);
                            const namedPhase = getNamedSongPhase(danceTrackIndex, danceTrackProgress);
                            const profile = {
                                ...getPhaseProfile(choreo, trackBeats),
                                ...(namedPhase.overrides || {}),
                            };
                            const primaryWave = Math.sin(trackBeats * TWO_PI * profile.swayFreq + phase);
                            const hopWave = Math.sin(trackBeats * TWO_PI * profile.hopFreq + phase * 0.7);
                            const accentWave = Math.sin(trackBeats * TWO_PI + phase + profile.accentLag * TWO_PI);
                            const onBeat = beatEnvelope(trackBeats + phase / TWO_PI, 0.22);
                            const offBeat = beatEnvelope(trackBeats + 0.5 + phase / TWO_PI, 0.2);
                            const barline = beatEnvelope(trackBeats / 4 + phase / TWO_PI, 0.09);

                            const intensity = Math.pow(cardDanceIntensity, 2) * 0.40;
                            const motionEnergy = Math.pow(gated, 1.45);
                            const peakBoost = 1 + Math.pow(gated, 1.2) * (DANCE_PEAK_BOOST - 1);
                            const effectiveEnergy = motionEnergy * peakBoost;

                            const stepWave = Math.sin(trackBeats * Math.PI * profile.stepFreq + phase * 0.9);
                            const stepShape = Math.sign(stepWave) * Math.pow(Math.abs(stepWave), 0.68);
                            const stepBlock = Math.floor(trackBeats * 0.5 + phase / TWO_PI);
                            const lanePattern = [1, -1, -1, 1];
                            const laneBias = lanePattern[((stepBlock % lanePattern.length) + lanePattern.length) % lanePattern.length];
                            const patternMotion = getPatternMotion(namedPhase.pattern, {
                                trackBeats,
                                phase,
                                onBeat,
                                offBeat,
                                barline,
                                stepAmp: profile.stepAmp,
                                effectiveEnergy,
                                intensity,
                            });

                            const lateralSwing = primaryWave * profile.xRange;
                            const lateralKick = accentWave * onBeat * profile.xKick;
                            const laneSwitch = laneBias * profile.stepAmp * (0.36 + onBeat * 0.6);
                            const sideStepTravel = (stepShape * profile.stepAmp) + laneSwitch + patternMotion.extraX;
                            const slideX = (lateralSwing + lateralKick + sideStepTravel) * effectiveEnergy * intensity;

                            const liftBase = Math.max(0, hopWave) * profile.yLift;
                            const liftKick = (onBeat * profile.yKick) + (offBeat * profile.yKick * 0.24);
                            const reboundLift = (onBeat - offBeat * 0.42) * profile.rebound;
                            const bassPulse = clamp((onBeat * 0.95) + (barline * 1.15) + Math.max(0, gated - 0.42) * 0.95, 0, 2.2);
                            const bassJump = bassPulse * (profile.bassJump ?? 2.7);
                            const liftPx = (liftBase + liftKick + reboundLift + bassJump + patternMotion.extraY * 0.62) * effectiveEnergy * intensity;

                            const spinPulse =
                                effectiveEnergy >= profile.spinEnergyThreshold
                                    ? beatEnvelope(trackBeats * profile.spinBeatFreq + phase / TWO_PI + profile.spinLag, profile.spinWidth)
                                    : 0;
                            const spinDirection = ((Math.floor(trackBeats) + index) % 2 === 0 ? 1 : -1);
                            const spinDeg = spinPulse * profile.spinDeg * 0.56 * spinDirection * (0.56 + barline * 0.44 + patternMotion.spinBoost) * intensity;

                            // Y-axis pirouette — one smooth full spin every ~8 bars; cumulative angle prevents snap-back glitch
                            const ySpinBeat = trackBeats + phase / TWO_PI;
                            const ySpinSlot = Math.floor(ySpinBeat / DANCE_Y_SPIN_INTERVAL);
                            const ySpinOffset = ySpinBeat - ySpinSlot * DANCE_Y_SPIN_INTERVAL;
                            const ySpinDir = (ySpinSlot + index) % 2 === 0 ? 1 : -1;
                            const isSpinActive = effectiveEnergy >= DANCE_Y_SPIN_THRESHOLD && ySpinOffset < DANCE_Y_SPIN_DURATION;
                            const ySpinKey = card.id ?? index;
                            if (!ySpinRef.current[ySpinKey]) ySpinRef.current[ySpinKey] = { slot: -1, baseAngle: 0, prevSpinning: false, dir: 1 };
                            const ys = ySpinRef.current[ySpinKey];
                            if (ySpinSlot !== ys.slot) { ys.slot = ySpinSlot; ys.dir = ySpinDir; }
                            if (!isSpinActive && ys.prevSpinning) { ys.baseAngle += 360 * ys.dir; }
                            ys.prevSpinning = isSpinActive;
                            const spinEase = (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
                            const rotateYDeg = isSpinActive ? ys.baseAngle + spinEase(ySpinOffset / DANCE_Y_SPIN_DURATION) * 360 * ys.dir : ys.baseAngle;

                            const baseRotateDeg =
                                ((primaryWave * profile.rotSwing) + (accentWave * onBeat * profile.rotKick) + (stepShape * profile.leanDeg) + (patternMotion.extraRot * 0.72)) *
                                effectiveEnergy *
                                intensity;
                            const rotateDeg = baseRotateDeg + spinDeg;

                            const scale =
                                1 +
                                (onBeat * profile.scalePulse + Math.max(0, hopWave) * profile.scalePulse * 0.6) * effectiveEnergy * intensity +
                                bassPulse * (profile.bassScale ?? 0.12) * effectiveEnergy * intensity;

                            const safeX = clamp(slideX, -DANCE_MAX_X_TRAVEL * intensity, DANCE_MAX_X_TRAVEL * intensity);
                            const safeLift = clamp(liftPx, 0, DANCE_MAX_LIFT * intensity);
                            const safeRotate = clamp(rotateDeg, -DANCE_MAX_ROTATION, DANCE_MAX_ROTATION);
                            // rotateYDeg is a full 360 — intentionally not clamped so the pirouette completes smoothly

                            return {
                                transform: `perspective(760px) translateX(${safeX.toFixed(2)}px) translateY(${-safeLift.toFixed(2)}px) rotateY(${rotateYDeg.toFixed(2)}deg) rotate(${safeRotate.toFixed(2)}deg) scale(${scale.toFixed(4)})`,
                            };
                        })()}
                    >
                        <MiniCard
                            card={card}
                            isFlipped={flippedCards[index]}
                            showExhausted={showExhausted}
                        />
                    </div>
                </div>
            ))}
            {cards.length === 0 && (
                <div className="no-battlers-card">No Battlers In Play</div>
            )}
        </div>
    );
}

export default CardLayout;
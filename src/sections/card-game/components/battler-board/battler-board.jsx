import { useState, useEffect, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import MiniCard from '../card-layouts/mini-card/mini-card.jsx';
import { commitDefeats } from '../../database/cardGameSlice.js';
import musicManager from '../../../../features/sound/musicManager';
import './battler-board.css'

const ANIM_DURATION = 900;
const DANCE_MOTION_THRESHOLD = 0.3;
const DANCE_PEAK_BOOST = 1.55;

const TWO_PI = Math.PI * 2;
const DANCE_PROFILES = [
    {
        // Court Jam: two-step groove with strong side travel.
        xRange: 11.5,
        xKick: 5.5,
        yLift: 7.5,
        yKick: 10,
        rotSwing: 2.6,
        rotKick: 2.2,
        scalePulse: 0.05,
        swayFreq: 1,
        hopFreq: 2,
        accentLag: 0.06,
    },
    {
        // Free Diver: fluid, lower-frequency drift and softer kicks.
        xRange: 7,
        xKick: 2.8,
        yLift: 6.5,
        yKick: 7,
        rotSwing: 1.8,
        rotKick: 1.2,
        scalePulse: 0.033,
        swayFreq: 0.5,
        hopFreq: 1,
        accentLag: 0.12,
    },
    {
        // Jester on the Prowl: punchy zig-zag with aggressive accents.
        xRange: 13,
        xKick: 7,
        yLift: 8,
        yKick: 12,
        rotSwing: 3,
        rotKick: 2.8,
        scalePulse: 0.06,
        swayFreq: 2,
        hopFreq: 2,
        accentLag: 0.03,
    },
    {
        // Steppin n Jestin: medium shuffle, balanced side steps.
        xRange: 9,
        xKick: 4.2,
        yLift: 7.2,
        yKick: 8.2,
        rotSwing: 2.15,
        rotKick: 1.85,
        scalePulse: 0.042,
        swayFreq: 1,
        hopFreq: 2,
        accentLag: 0.08,
    },
    {
        // Zesty Lester: brisk lateral dance with crisp off-beat movement.
        xRange: 10.8,
        xKick: 4.9,
        yLift: 7,
        yKick: 9,
        rotSwing: 2.35,
        rotKick: 2,
        scalePulse: 0.048,
        swayFreq: 2,
        hopFreq: 4,
        accentLag: 0.05,
    },
];

const beatEnvelope = (phase, width = 0.32) => {
    const wrapped = phase - Math.floor(phase);
    const dist = Math.min(wrapped, 1 - wrapped);
    if (dist >= width) return 0;
    const normalized = 1 - dist / width;
    return normalized * normalized;
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
    const danceSmoothRef = useRef(0);
    const rafRef = useRef(null);

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
            return;
        }

        let lastCommit = 0;
        const tick = (t) => {
            const target = musicManager.getReactiveLevel();
            const now = musicManager.getCurrentTime();
            const bpm = Math.max(60, musicManager.getCurrentBPM() || 120);
            const trackIndex = musicManager.getState().currentIndex || 0;
            // Extra local smoothing to keep board motion calm.
            danceSmoothRef.current += (target - danceSmoothRef.current) * 0.2;

            if (t - lastCommit > 45) {
                lastCommit = t;
                setDanceEnergy(danceSmoothRef.current);
                setDanceAudioTime(now);
                setDanceBpm(bpm);
                setDanceTrackIndex(trackIndex);
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

                            const profile = DANCE_PROFILES[danceTrackIndex % DANCE_PROFILES.length] || DANCE_PROFILES[0];
                            const phase = phaseFrom(card.id, index);
                            const trackBeats = danceAudioTime * (danceBpm / 60);
                            const primaryWave = Math.sin(trackBeats * TWO_PI * profile.swayFreq + phase);
                            const hopWave = Math.sin(trackBeats * TWO_PI * profile.hopFreq + phase * 0.7);
                            const accentWave = Math.sin(trackBeats * TWO_PI + phase + profile.accentLag * TWO_PI);
                            const onBeat = beatEnvelope(trackBeats + phase / TWO_PI, 0.22);
                            const offBeat = beatEnvelope(trackBeats + 0.5 + phase / TWO_PI, 0.2);

                            const intensity = cardDanceIntensity;
                            const motionEnergy = Math.pow(gated, 1.45);
                            const peakBoost = 1 + Math.pow(gated, 1.2) * (DANCE_PEAK_BOOST - 1);
                            const effectiveEnergy = motionEnergy * peakBoost;

                            const lateralSwing = primaryWave * profile.xRange;
                            const lateralKick = accentWave * onBeat * profile.xKick;
                            const slideX = (lateralSwing + lateralKick) * effectiveEnergy * intensity;

                            const liftBase = Math.max(0, hopWave) * profile.yLift;
                            const liftKick = (onBeat * profile.yKick) + (offBeat * profile.yKick * 0.45);
                            const liftPx = (liftBase + liftKick) * effectiveEnergy * intensity;

                            const rotateDeg =
                                ((primaryWave * profile.rotSwing) + (accentWave * onBeat * profile.rotKick)) *
                                effectiveEnergy *
                                intensity;
                            const scale = 1 + (onBeat * profile.scalePulse + Math.max(0, hopWave) * profile.scalePulse * 0.6) * effectiveEnergy * intensity;

                            return {
                                transform: `translateX(${slideX.toFixed(2)}px) translateY(${-liftPx.toFixed(2)}px) rotate(${rotateDeg.toFixed(2)}deg) scale(${scale.toFixed(4)})`,
                                filter: `saturate(${(1 + effectiveEnergy * 0.2 * intensity).toFixed(3)}) brightness(${(1 + effectiveEnergy * 0.13 * intensity).toFixed(3)})`,
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
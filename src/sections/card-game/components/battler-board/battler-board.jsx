import { useState, useEffect, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import MiniCard from '../card-layouts/mini-card/mini-card.jsx';
import { commitDefeats } from '../../database/cardGameSlice.js';
import musicManager from '../../../../features/sound/musicManager';
import './battler-board.css'

const ANIM_DURATION = 900;
const DANCE_MOTION_THRESHOLD = 0.3;
const DANCE_PEAK_BOOST = 1.55;

const CardLayout = ({ cards, onCardClick, highlight, playerId, showExhausted = true }) => {
    const dispatch = useDispatch();
    const lastHitEvents = useSelector((state) => state.cardGame.lastHitEvents);
    const cardDanceEnabled = useSelector((state) => state.profile.cardDanceEnabled !== false);
    const cardDanceIntensity = useSelector((state) => state.profile.cardDanceIntensity ?? 0.8);
    const [hoveredCardIndex, setHoveredCardIndex] = useState(null);
    const [flippedCards, setFlippedCards] = useState({});
    // { [cardId]: { type, damage } }
    const [animations, setAnimations] = useState({});
    const [danceEnergy, setDanceEnergy] = useState(0);
    const [danceClock, setDanceClock] = useState(0);
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
            setDanceClock(0);
            return;
        }

        let lastCommit = 0;
        const tick = (t) => {
            const target = musicManager.getReactiveLevel();
            // Extra local smoothing to keep board motion calm.
            danceSmoothRef.current += (target - danceSmoothRef.current) * 0.2;

            if (t - lastCommit > 45) {
                lastCommit = t;
                setDanceEnergy(danceSmoothRef.current);
                setDanceClock(t);
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
                            const phase = phaseFrom(card.id, index);
                            const wobble = Math.sin(danceClock * 0.008 + phase);
                            const pulse = Math.sin(danceClock * 0.013 + phase * 0.7);
                            const intensity = cardDanceIntensity;
                            const motionEnergy = Math.pow(gated, 1.45);
                            const peakBoost = 1 + Math.pow(gated, 1.2) * (DANCE_PEAK_BOOST - 1);
                            const effectiveEnergy = motionEnergy * peakBoost;
                            const rotateDeg = wobble * 2.2 * effectiveEnergy * intensity;
                            const liftPx = Math.max(0, pulse) * 9 * effectiveEnergy * intensity;
                            const scale = 1 + Math.max(0, pulse) * 0.048 * effectiveEnergy * intensity;
                            return {
                                transform: `translateY(${-liftPx.toFixed(2)}px) rotate(${rotateDeg.toFixed(2)}deg) scale(${scale.toFixed(4)})`,
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
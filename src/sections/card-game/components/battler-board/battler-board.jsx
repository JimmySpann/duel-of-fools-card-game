import { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import MiniCard from '../card-layouts/mini-card/mini-card.jsx';
import { commitDefeats } from '../../database/cardGameSlice.js';
import './battler-board.css'

const ANIM_DURATION = 900;

const CardLayout = ({ cards, onCardClick, highlight, playerId, showExhausted = true }) => {
    const dispatch = useDispatch();
    const lastHitEvents = useSelector((state) => state.cardGame.lastHitEvents);
    const [hoveredCardIndex, setHoveredCardIndex] = useState(null);
    const [flippedCards, setFlippedCards] = useState({});
    // { [cardId]: { type, damage } }
    const [animations, setAnimations] = useState({});

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
                    <MiniCard
                        card={card}
                        isFlipped={flippedCards[index]}
                        showExhausted={showExhausted}
                    />
                </div>
            ))}
            {cards.length === 0 && (
                <div className="no-battlers-card">No Battlers In Play</div>
            )}
        </div>
    );
}

export default CardLayout;
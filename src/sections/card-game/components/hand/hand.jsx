import fireIcon from '../../../../assets/elements/fire-icon.png';
import iceIcon from '../../../../assets/elements/ice-icon.png';
import earthIcon from '../../../../assets/elements/earth-icon.png';
import airIcon from '../../../../assets/elements/air-icon.png';
import electricIcon from '../../../../assets/elements/lightning-icon.png';
import waterIcon from '../../../../assets/elements/water-icon.png';
import deathIcon from '../../../../assets/elements/death-icon.png';
import MiniCard from '../card-layouts/mini-card/mini-card.jsx';
import './hand.css';

const ELEMENT_ICONS = { fire: fireIcon, ice: iceIcon, earth: earthIcon, air: airIcon, electric: electricIcon, water: waterIcon, death: deathIcon };

/* ── Mobile thumbnail card ─────────────────────────────────────────────── */
const HandCard = ({ card, index, locked, dimmed, onCardClick }) => {
    const elements = Object.entries(card.elements ?? {})
        .filter(([k]) => k !== 'normal')
        .flatMap(([k, v]) => Array(v).fill(k))
        .slice(0, 3);

    return (
        <div
            className={`hand-card${locked ? ' hand-card-locked' : ''}${dimmed ? ' hand-card-dimmed' : ''}`}
            onClick={() => !locked && onCardClick && onCardClick(index)}
            role="button"
            tabIndex={locked ? -1 : 0}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !locked && onCardClick && onCardClick(index)}
            aria-label={card.name}
        >
            <img className="hand-card-image" src={card.image} alt={card.name} />

            {elements.length > 0 && (
                <div className="hand-card-elements">
                    {elements.map((el, i) => (
                        <img key={i} src={ELEMENT_ICONS[el]} className="hand-card-element-icon" alt={el} />
                    ))}
                </div>
            )}

            <div className="hand-card-footer">
                <span className="hand-card-name">{card.name}</span>
                <div className="hand-card-stats">
                    <span className="hand-stat">HP {card.currentHealth ?? card.health}</span>
                    <span className="hand-stat">ATK {card.attack}</span>
                    <span className="hand-stat">DEF {card.defense}</span>
                    <span className="hand-stat">AGI {card.agility}</span>
                    <span className="hand-stat">EVA {card.evasion}</span>
                </div>
            </div>
        </div>
    );
};

/* ── Desktop mini-card hand entry ──────────────────────────────────────── */
const DesktopHandCard = ({ card, index, locked, dimmed, onCardClick }) => {
    return (
        <div
            className={`desktop-hand-entry${locked ? ' hand-card-locked' : ''}${dimmed ? ' hand-card-dimmed' : ''}`}
            onClick={() => !locked && onCardClick && onCardClick(index)}
            role="button"
            tabIndex={locked ? -1 : 0}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !locked && onCardClick && onCardClick(index)}
            aria-label={card.name}
        >
            <MiniCard card={card} isFlipped={false} />
        </div>
    );
};

const Hand = ({ _hand, onCardClick, locked = false, dimmed = false }) => {
    if (!_hand || _hand.length === 0) {
        return (
            <div className="hand-container hand-container--empty">
                <span className="hand-empty-label">No cards in hand</span>
            </div>
        );
    }

    return (
        <>
            {/* Wide-screen: full mini-card layout */}
            <div className="hand-container hand-container--desktop">
                {_hand.map((card, index) => (
                    <DesktopHandCard
                        key={card.id ?? index}
                        card={card}
                        index={index}
                        locked={locked}
                        dimmed={dimmed}
                        onCardClick={onCardClick}
                    />
                ))}
            </div>

            {/* Small-screen: thumbnail layout */}
            <div className="hand-container hand-container--mobile">
                {_hand.map((card, index) => (
                    <HandCard
                        key={card.id ?? index}
                        card={card}
                        index={index}
                        locked={locked}
                        dimmed={dimmed}
                        onCardClick={onCardClick}
                    />
                ))}
            </div>
        </>
    );
};

export default Hand;
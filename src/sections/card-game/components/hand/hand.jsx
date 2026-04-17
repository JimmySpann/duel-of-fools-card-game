import fireIcon from '../../../../assets/elements/fire-icon.png';
import iceIcon from '../../../../assets/elements/ice-icon.png';
import earthIcon from '../../../../assets/elements/earth-icon.png';
import airIcon from '../../../../assets/elements/air-icon.png';
import electricIcon from '../../../../assets/elements/lightning-icon.png';
import waterIcon from '../../../../assets/elements/water-icon.png';
import deathIcon from '../../../../assets/elements/death-icon.png';
import './hand.css';

const ELEMENT_ICONS = { fire: fireIcon, ice: iceIcon, earth: earthIcon, air: airIcon, electric: electricIcon, water: waterIcon, death: deathIcon };

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
            </div>
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
        <div className="hand-container">
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
    );
};

export default Hand;
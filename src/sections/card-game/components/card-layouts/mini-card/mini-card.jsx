import React from 'react';
import cardBack from '../../../../../assets/card-back.jpg';
import fireIcon from '../../../../../assets/elements/fire-icon.png';
import iceIcon from '../../../../../assets/elements/ice-icon.png';
import earthIcon from '../../../../../assets/elements/earth-icon.png';
import airIcon from '../../../../../assets/elements/air-icon.png';
import electricIcon from '../../../../../assets/elements/lightning-icon.png';
import waterIcon from '../../../../../assets/elements/water-icon.png';
import deathIcon from '../../../../../assets/elements/death-icon.png';
import './mini-card.css';

const STATUS_BADGE_CONFIG = {
    burned: { label: 'BRN', bg: '#c0392b' },
    frozen: { label: 'FRZ', bg: '#2980b9' },
    invulnerable: { label: 'INV', bg: '#f39c12' },
    invisible: { label: 'GHT', bg: '#7f8c8d' },
    poisoned: { label: 'PSN', bg: '#27ae60' },
    bleeding: { label: 'BLD', bg: '#922b21' },
    focused: { label: 'FOC', bg: '#8e44ad' },
    shielded: { label: 'SHD', bg: '#1abc9c' },
    def_up: { label: '+DEF', bg: '#2ecc71' },
    def_down: { label: '-DEF', bg: '#e74c3c' },
    eva_up: { label: '+EVA', bg: '#3498db' },
    damage_reduction: { label: '½DMG', bg: '#e67e22' },
};

// Returns the net modifier for a given stat from statusEffects
const getStatMod = (statusEffects, stat) => {
    if (!statusEffects?.length) return 0;
    let mod = 0;
    for (const s of statusEffects) {
        if (stat === 'def' && s.type === 'def_up') mod += s.value;
        if (stat === 'def' && s.type === 'def_down') mod -= s.value;
        if (stat === 'eva' && s.type === 'eva_up') mod += s.value;
    }
    return mod;
};

const StatMod = ({ mod }) => {
    if (!mod) return null;
    return (
        <span className={`stat-mod ${mod > 0 ? 'stat-mod-up' : 'stat-mod-down'}`}>
            {mod > 0 ? `+${mod}` : mod}
        </span>
    );
};

const StatusBadges = ({ statusEffects }) => {
    if (!statusEffects || statusEffects.length === 0) return null;
    return (
        <div className="status-badges">
            {statusEffects.map((s, i) => {
                const cfg = STATUS_BADGE_CONFIG[s.type];
                if (!cfg) return null;
                return (
                    <span
                        key={i}
                        className="status-badge"
                        style={{ backgroundColor: cfg.bg }}
                        title={`${s.type}${s.duration !== 999 ? ` (${s.duration})` : ''}`}
                    >
                        {cfg.label}
                    </span>
                );
            })}
        </div>
    );
};

const getElementIcon = (element) => {
    switch (element) {
        case 'fire':
            return fireIcon;
        case 'ice':
            return iceIcon;
        case 'earth':
            return earthIcon;
        case 'air':
            return airIcon;
        case 'electric':
            return electricIcon;
        case 'water':
            return waterIcon;
        case 'death':
            return deathIcon;
        default:
            return null;
    }
};

const CardHeader = ({ type, elements }) => {

    const processElements = () => {
        let elementArray = [];
        for (const [key, value] of Object.entries(elements)) {
            for (let i = 0; i < value; i++) {
                elementArray.push(key);
            }
        }
        let normalCount = elements['normal'] || 0;
        elementArray = elementArray.filter((el) => el !== 'normal');
        return { elementArray, normalCount };
    }
    const { elementArray, normalCount } = processElements();

    return (
        <div className="mini-card-header">
            <div className="mini-card-type">{type}</div>

            <div className='mini-card-elements'>
                {elementArray.map((type, index) => (
                    <div className="mini-card-elements-icon" key={index}>
                        <img src={getElementIcon(type)} className="mini-card-elements-icon-image" alt={type} />
                    </div>
                ))}
                {normalCount > 0 && (
                    <div className="mini-card-elements-icon" style={{ backgroundColor: 'gray', textAlign: 'center', fontWeight: 'bold' }}>
                        {normalCount}
                    </div>
                )}
            </div>
        </div>
    )
}

const Card = ({
    card,
    isFlipped
}) => {

    return (
        <div className="mini-card-container">
            <div className={`mini-card-front ${isFlipped ? 'rotateY-180' : ''}`}>
                <CardHeader type={card?.type} elements={card?.elements} />

                <div className="mini-card-image-container">
                    <img
                        className="mini-card-image"
                        src={card.image}
                        alt="Card Visual"
                    />
                    <div className="mini-card-name">{card.name}</div>
                </div>

                <div className="mini-card-info-container">
                    <div className="mini-card-attribute-container">
                        <div className="mini-card-attibute">ATK: {card.attack}</div>
                        <div className="mini-card-attibute">DEF: {card.defense}<StatMod mod={getStatMod(card.statusEffects, 'def')} /></div>
                    </div>
                    <div className="mini-card-attribute-container">
                        <div className="mini-card-attibute">AGI: {card.agility}</div>
                        <div className="mini-card-attibute">EVA: {card.evasion}<StatMod mod={getStatMod(card.statusEffects, 'eva')} /></div>
                    </div>
                    <div className='mini-card-health-container'>
                        <div className="mini-health-circle">
                            {card.currentHealth ?? card.health}/{card.health}
                            <div className="mini-health-text">HP</div>
                        </div>
                    </div>
                </div>

                <div className="mini-card-footer">
                    <StatusBadges statusEffects={card.statusEffects} />
                </div>

                {(card.acted || card.justPlayed) && (
                    <div className={`card-exhausted-overlay${card.justPlayed ? ' card-not-ready' : ''}`}>
                        {card.justPlayed ? 'NOT READY' : 'ACTED'}
                    </div>
                )}
            </div>

            <div className={`mini-card-back ${isFlipped ? 'rotateY-0' : ''}`}>
                <img
                    src={cardBack}
                    className="mini-card-back-image"
                    alt="Card Back"
                />
            </div>
        </div>
    );
}

export default Card;
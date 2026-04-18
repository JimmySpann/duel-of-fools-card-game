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
    burned: { label: 'BRN', bg: '#7a1500', border: '#c0392b', showVal: true, valSuffix: '/t', buff: false },
    frozen: { label: 'FRZ', bg: '#0a3d62', border: '#2980b9', showVal: false, buff: false },
    invulnerable: { label: 'INV', bg: '#7d4e00', border: '#f39c12', showVal: false, buff: true },
    invisible: { label: 'GHT', bg: '#2c3e50', border: '#7f8c8d', showVal: false, buff: true },
    poisoned: { label: 'PSN', bg: '#0b5120', border: '#27ae60', showVal: true, valSuffix: '/t', buff: false },
    bleeding: { label: 'BLD', bg: '#5b0a07', border: '#922b21', showVal: true, valSuffix: '/t', buff: false },
    focused: { label: 'FOC', bg: '#4a1a6b', border: '#8e44ad', showVal: false, buff: true },
    shielded: { label: 'SHD', bg: '#0e5549', border: '#1abc9c', showVal: true, valPrefix: '+', buff: true },
    def_up: { label: '+DEF', bg: '#145a32', border: '#2ecc71', showVal: true, buff: true },
    def_down: { label: '-DEF', bg: '#78281f', border: '#e74c3c', showVal: true, buff: false },
    eva_up: { label: '+EVA', bg: '#1a3f6f', border: '#3498db', showVal: true, buff: true },
    damage_reduction: { label: '½DMG', bg: '#6e3000', border: '#e67e22', showVal: false, buff: true },
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
                const showVal = cfg.showVal && s.value != null && s.value !== 1;
                const showDur = s.duration != null && s.duration < 999;
                return (
                    <span
                        key={i}
                        className={`status-badge${cfg.buff ? ' buff' : ' debuff'}`}
                        style={{ backgroundColor: cfg.bg, borderColor: cfg.border }}
                        title={`${s.type}${s.value != null ? ` (${s.value})` : ''}${showDur ? `, ${s.duration} turns remaining` : ''}`}
                    >
                        <span className="status-badge-label">{cfg.label}</span>
                        {showVal && (
                            <span className="status-badge-value">
                                {cfg.valPrefix || ''}{s.value}{cfg.valSuffix || ''}
                            </span>
                        )}
                        {showDur && (
                            <span className="status-badge-dur">{s.duration}t</span>
                        )}
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
    isFlipped,
    showExhausted = true,
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

                {showExhausted && (card.acted || card.justPlayed) && (
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
import React, { useState } from 'react';

import cardBack from '../../../../../assets/card-back.jpg';
import fireIcon from '../../../../../assets/elements/fire-icon.png';
import iceIcon from '../../../../../assets/elements/ice-icon.png';
import earthIcon from '../../../../../assets/elements/earth-icon.png';
import airIcon from '../../../../../assets/elements/air-icon.png';
import electricIcon from '../../../../../assets/elements/lightning-icon.png';
import waterIcon from '../../../../../assets/elements/water-icon.png';
import deathIcon from '../../../../../assets/elements/death-icon.png';

import './full-card.css';

const MICROEVENT_LABELS = {
    qte: 'QTE',
    mash: 'Mash',
    pattern: 'Pattern',
    rhythm: 'Rhythm',
    quiz: 'Quiz',
    parry: 'Parry',
    route: 'Route',
    sigil: 'Sigil',
};

const STATUS_INFO = {
    burned: { label: 'Burned', buff: false },
    bleeding: { label: 'Bleeding', buff: false },
    poisoned: { label: 'Poisoned', buff: false },
    frozen: { label: 'Frozen', buff: false },
    stunned: { label: 'Stunned', buff: false },
    weakened: { label: 'Weakened', buff: false },
    invulnerable: { label: 'Invulnerable', buff: true },
    invisible: { label: 'Invisible', buff: true },
    shielded: { label: 'Shield', buff: true },
    damage_reduction: { label: 'Dmg Reduction', buff: true },
    eva_up: { label: 'EVA', buff: true },
    def_up: { label: 'DEF', buff: true },
    atk_up: { label: 'ATK', buff: true },
    agi_up: { label: 'AGI', buff: true },
    eva_down: { label: 'EVA', buff: false },
    def_down: { label: 'DEF', buff: false },
    atk_down: { label: 'ATK', buff: false },
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
        // Add cases for other elements like earth, air, etc.
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
        <div className="card-header">
            <div className="card-type">{type}</div>


            <div className='card-elements'>
                {elementArray.map((type, index) => (
                    <div className="card-elements-icon" key={index}>
                        <img src={getElementIcon(type)} className="card-elements-icon-image" />
                    </div>
                ))}
                {normalCount > 0 && (
                    <div className="card-elements-icon" style={{ backgroundColor: 'gray', textAlign: 'center', fontWeight: 'bold' }}>
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
    onActionClick,
}) => {

    return (
        <div
            className="card-container"
        >
            <div className={`card-front ${isFlipped ? 'rotateY-180' : ''}`}>
                <CardHeader type={card?.type} elements={card?.elements} />

                <div className="card-image-container">
                    <img
                        className="card-image"
                        src={card.image}
                        alt="Card Visual"
                    />
                    {card.statusEffects && card.statusEffects.length > 0 && (
                        <div className="card-status-overlay">
                            <div className="card-status-list card-status-list--image">
                                {card.statusEffects.map((s, i) => {
                                    const info = STATUS_INFO[s.type] || { label: s.type, buff: true };
                                    return (
                                        <div key={i} className={`card-status-pill${info.buff ? ' buff' : ' debuff'}`}>
                                            <span className="card-status-name">{info.label}</span>
                                            {s.value != null && s.value !== 1 && (
                                                <span className="card-status-value">
                                                    {info.buff ? '+' : '-'}{Math.abs(s.value)}
                                                </span>
                                            )}
                                            {s.duration != null && s.duration < 999 && (
                                                <span className="card-status-duration">{s.duration}t</span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                    <div className="card-name">{card.name}</div>
                </div>

                <div className="card-info-container">
                    <div className="card-description">{card.description}</div>
                    {card.passives.length > 1 && <div className="card-passives-container">
                        <div className="card-info-title">Passives</div>
                        {card.passives.map((passive, index) => (
                            <div
                                key={index}
                                className="card-passive-ability"
                            >
                                <div>
                                    <div className="ability-first-row">
                                        <div className="ability-name">{passive.name}</div>
                                        <div className="ability-effect">{passive.effect}</div>
                                    </div>
                                    <div className="ability-description">{passive.description}</div>
                                </div>
                                <div className="ability-card-right-side">
                                    {passive.type && <div className="card-elements-icon" style={{ textAlign: 'right' }}>
                                        <img src={getElementIcon(passive.type)} className="card-elements-icon-image" />
                                    </div>}
                                    {passive.limit &&
                                        <div style={{ padding: '2px 2px 0 0' }}>{passive.usesRemaining}/{passive.limit}</div>
                                    }
                                </div>
                            </div>
                        ))}
                    </div>}
                    {card.actions.length > 1 && <div className="card-actions-container">
                        <div className="card-info-title">Actions</div>
                        {card.actions.map((action, index) => (
                            <div
                                key={index}
                                className={`card-action-ability${action.usesRemaining <= 0 ? ' card-action-depleted' : ''}${onActionClick ? ' card-action-clickable' : ''}`}
                                onClick={onActionClick && action.usesRemaining > 0
                                    ? (e) => { e.stopPropagation(); onActionClick(index); }
                                    : undefined
                                }
                            >
                                <div>
                                    <div className="ability-first-row">
                                        <div className="ability-name">{action.name}</div>
                                        <div className="ability-effect">{action.actionInfo}</div>
                                        {action.microevent && (
                                            <div className={`ability-microevent-badge ability-microevent-badge--${action.microevent.type}`}>
                                                {MICROEVENT_LABELS[action.microevent.type] || action.microevent.type}
                                            </div>
                                        )}
                                    </div>
                                    <div className="ability-description">{action.description}</div>
                                </div>
                                <div className="ability-card-right-side">
                                    {action.type && <div className="card-elements-icon" style={{ textAlign: 'right' }}>
                                        <img src={getElementIcon(action.type)} className="card-elements-icon-image" />
                                    </div>}
                                    <div style={{ padding: '2px 2px 0 0' }}>{action.usesRemaining}/{action.limit}</div>
                                </div>
                            </div>
                        ))}
                    </div>}

                </div>

                <div className="card-footer">
                    <div>ATK:{card.attack}</div>
                    <div>AGI:{card.agility}</div>
                    <div className="health-circle">
                        {card.currentHealth ?? card.health}/{card.health}
                        <div className="health-text">HP</div>
                    </div>
                    <div>EVA:{card.evasion}</div>
                    <div>DEF:{card.defense}</div>
                </div>
            </div>

            <div className={`card-back ${isFlipped ? 'rotateY-0' : ''}`}>
                <img
                    src={cardBack}
                    className="card-back-image"
                />
            </div>
        </div>
    );
}

export default Card;
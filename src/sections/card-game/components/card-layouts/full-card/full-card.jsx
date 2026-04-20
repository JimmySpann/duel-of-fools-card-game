import React, { useState } from 'react';
import { FEATURES } from '../../../../../config/features';
import { useSelector } from 'react-redux';

import cardBack from '../../../../../assets/card-back.jpg';
import { getElementIcon } from '../../../utils/elementIcons';

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
    arrow: 'Arrow',
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

const CardHeader = ({ category, createdBy, elements }) => {

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

    const creatorLabel =
        category === 'dripwarts' ? 'by Acinder' :
            category === 'official v1' ? 'by Official' :
                category === 'unknown' ? 'by Unknown' :
                    createdBy ? `by ${createdBy}` : '';

    return (
        <div className="card-header">
            <div className="card-type">{creatorLabel}</div>

            {FEATURES.showElements && (
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
            )}
        </div>
    )
}

const Card = ({
    card,
    isFlipped,
    onActionClick,
}) => {
    const censorAdultCards = useSelector((s) => s.profile.censorAdultCards !== false);
    const isCensored = !!card?.adultOnly && censorAdultCards;

    return (
        <div
            className="card-container"
        >
            <div className={`card-front ${isFlipped ? 'rotateY-180' : ''}`}>
                <CardHeader category={card?.category} createdBy={card?.createdBy} elements={card?.elements} />

                <div className="card-image-container">
                    <img
                        className="card-image"
                        src={isCensored ? cardBack : card.image}
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
                    <div className="card-name">{isCensored ? 'Adults-only Card' : card.name}</div>
                    {!card.verified && (
                        <div className="card-unverified-badge">⚠ Unverified</div>
                    )}
                </div>

                <div className="card-info-container">
                    <div className="card-description">{isCensored ? 'Description hidden by content settings.' : card.description}</div>
                    {FEATURES.showPassives && card.passives.length > 1 && <div className="card-passives-container">
                        <div className="card-info-title">Passives</div>
                        {card.passives.map((passive, index) => (
                            <div
                                key={index}
                                className="card-passive-ability"
                            >
                                <div>
                                    <div className="ability-first-row">
                                        <div className="ability-name">{isCensored ? 'Hidden Passive' : passive.name}</div>
                                        <div className="ability-effect">{isCensored ? 'Hidden' : passive.effect}</div>
                                    </div>
                                    <div className="ability-description">{isCensored ? 'Text hidden by content settings.' : passive.description}</div>
                                </div>
                                <div className="ability-card-right-side">
                                    {FEATURES.showElements && passive.type && <div className="card-elements-icon" style={{ textAlign: 'right' }}>
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
                                        <div className="ability-name">{isCensored ? 'Hidden Action' : action.name}</div>
                                        <div className="ability-effect">{isCensored ? 'Hidden' : action.actionInfo}</div>
                                        {action.microevent && (
                                            <div className={`ability-microevent-badge ability-microevent-badge--${action.microevent.type}`}>
                                                {MICROEVENT_LABELS[action.microevent.type] || action.microevent.type}
                                            </div>
                                        )}
                                    </div>
                                    <div className="ability-description">{isCensored ? 'Text hidden by content settings.' : action.description}</div>
                                </div>
                                <div className="ability-card-right-side">
                                    {FEATURES.showElements && action.type && <div className="card-elements-icon" style={{ textAlign: 'right' }}>
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
                        {+(card.currentHealth ?? card.health).toFixed(1)}/{+card.health.toFixed(1)}
                        <div className="health-text">HP</div>
                    </div>
                    <div>EVA:{card.evasion}</div>
                    <div>DEF:{card.defense}</div>
                </div>
            </div>

            <div className={`card-back ${isFlipped ? 'rotateY-0' : ''}`}>
                <div className="card-back-face">
                    <img src="/img/Logo.png" className="card-back-logo" alt="Card Back" />
                </div>
            </div>
        </div>
    );
}

export default Card;
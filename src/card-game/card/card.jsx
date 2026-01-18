import React, { useState } from 'react';

import cardBack from '../../assets/card-back.jpg';
import fireIcon from '../../assets/elements/fire-icon.png';
import iceIcon from '../../assets/elements/ice-icon.png';
import earthIcon from '../../assets/elements/earth-icon.png';
import airIcon from '../../assets/elements/air-icon.png';
import electricIcon from '../../assets/elements/lightning-icon.png';
import waterIcon from '../../assets/elements/water-icon.png';
import deathIcon from '../../assets/elements/death-icon.png';

import './card.css';

const CardHeader = ({ type, elements }) => {
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
    isFlipped
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
                                <div className="ability-first-row">
                                    <div className="ability-name">{passive.name}</div>
                                    <div className="ability-effect">{passive.effect}</div>
                                </div>
                                <div className="ability-description">{passive.description}</div>
                            </div>
                        ))}
                    </div>}
                    {card.actions.length > 1 && <div className="card-actions-container">
                        <div className="card-info-title">Actions</div>
                        {card.actions.map((action, index) => (
                            <div
                                key={index}
                                className="card-action-ability"
                            >
                                <div className="ability-first-row">
                                    <div className="ability-name">{action.name}</div>
                                    <div className="ability-effect">{action.actionInfo}</div>
                                </div>
                                <div className="ability-description">{action.description}</div>
                            </div>
                        ))}
                    </div>}
                </div>

                <div className="card-footer">
                    <div>ATK:{card.attack}</div>
                    <div>AGI:{card.agility}</div>
                    <div className="health-circle">
                        {card.health}/{card.health}
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
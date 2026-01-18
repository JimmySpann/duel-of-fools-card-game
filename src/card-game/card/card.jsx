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
    name,
    type,
    elements,
    image,
    description,
    passives,
    actions,
    evasion,
    defense,
    attack,
    agility,
    health,
    isFlipped
}) => {
    return (
        <div
            className="card-container"
        >
            <div className={`card-front ${isFlipped ? 'rotateY-180' : ''}`}>
                <CardHeader type={type} elements={elements} />

                <div className="card-image-container">
                    <img
                        className="card-image"
                        src={image}
                        alt="Card Visual"
                    />
                    <div className="card-name">{name}</div>
                </div>

                <div className="card-info-container">
                    <div className="card-description">{description}</div>
                    {passives.length > 1 && <div className="card-passives-container">
                        <div className="card-info-title">Passives</div>
                        {passives.map((passive, index) => (
                            <div key={index} className="card-passive">{passive}</div>
                        ))}
                    </div>}
                    {actions.length > 1 && <div className="card-actions-container">
                        <div className="card-info-title">Actions</div>
                        {actions.map((action, index) => (
                            <div key={index} className="card-action">{action}</div>
                        ))}
                    </div>}
                </div>

                <div className="card-footer">
                    <div>ATK:{attack}</div>
                    <div>AGI:{agility}</div>
                    <div>HP:{health}/{health}</div>
                    <div>EVA:{evasion}</div>
                    <div>DEF:{defense}</div>
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
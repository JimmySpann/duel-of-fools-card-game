import React, { useState } from 'react';

import cardBack from '../../../assets/card-back.jpg';
import fireIcon from '../../../assets/elements/fire-icon.png';
import iceIcon from '../../../assets/elements/ice-icon.png';
import earthIcon from '../../../assets/elements/earth-icon.png';
import airIcon from '../../../assets/elements/air-icon.png';
import electricIcon from '../../../assets/elements/lightning-icon.png';
import waterIcon from '../../../assets/elements/water-icon.png';
import deathIcon from '../../../assets/elements/death-icon.png';

import './mini-card.css';

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
                        <div className="mini-card-attibute">DEF: {card.defense}</div>
                    </div>
                    <div className="mini-card-attribute-container">
                        <div className="mini-card-attibute">AGI: {card.agility}</div>
                        <div className="mini-card-attibute">EVA: {card.evasion}</div>
                    </div>
                    <div className='mini-card-health-container'>
                        <div className="mini-health-circle">
                            {card.health}/{card.health}
                            <div className="mini-health-text">HP</div>
                        </div>
                    </div>
                </div>

                <div className="mini-card-footer">
                </div>
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
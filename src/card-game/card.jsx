import React, { useState } from 'react';
import fireIcon from '../assets/elements/fire-icon.png';
import cardBack from '../assets/card-back.jpg';
import './card.css';
// import waterIcon from '../assets/elements/water-icon.png';
// import earthIcon from '../assets/elements/earth-icon.png';
// import airIcon from '../assets/elements/air-icon.png';

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
                    <div className="card-elements-icon">
                        <img src={fireIcon} className="card-elements-icon-image" />
                    </div>
                ))}
                {normalCount > 0 && (
                    <div className="card-elements-icon" style={{ backgroundColor: 'gray' }}>
                        {normalCount}
                    </div>
                )}
            </div>
        </div>
    )
}

const Card = ({ name, type, elements, image, description, passives, actions, evasion, defense, health }) => {
    const [isActive, setIsActive] = useState(false);

    return (
        <div
            className="card-container"
            onClick={() => setIsActive(!isActive)}
        >
            <div className={`card-front ${isActive ? 'rotateY-180' : ''}`}>
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
                    <div>Defense: {defense}</div>
                    <div>Health: {health}</div>
                    <div>Evasion: {evasion}</div>
                </div>
            </div>

            <div className={`card-back ${isActive ? 'rotateY-0' : ''}`}>
                <img
                    src={cardBack}
                    className="card-back-image"
                />
            </div>
        </div>
    );
}

export default Card;
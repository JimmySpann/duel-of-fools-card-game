import React, { useState, useEffect, useRef } from 'react';
import Card from './card.jsx';
import { cards } from '../card-game/card-data.js';
import './card-game.css'; // Assume your styles are here

const CardGame = () => {

    return (
        <div
            style={{
                justifyContent: 'center',
                alignItems: 'center',
                display: 'flex',
            }}
        >
            {cards.map((card, index) => (
                <Card
                    key={index}
                    name={card.name}
                    type={card.type}
                    image={card.image}
                    description={card.description}
                    evasion={card.evasion}
                    defense={card.defense}
                    health={card.health}
                    elements={card.elements}
                    passives={card.passives}
                    actions={card.actions}
                />
            ))}
        </div>
    );
};

export default CardGame;
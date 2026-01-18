import React, { useState, useEffect, useRef } from 'react';
import Card from './card.jsx';
import { cards } from '../card-game/card-data.js';
import './card-game.css'; // Assume your styles are here

const CardGame = () => {
    const [hoveredCardIndex, setHoveredCardIndex] = useState(null);

    return (
        <div
            className="card-game-container"
        >
            <div className="card-layout">
                {cards.map((card, index) => (
                    <div
                        className={`card-game-card ${hoveredCardIndex === index ? 'card-hover' : ''}`}
                        onMouseEnter={() => setHoveredCardIndex(index)}
                        onMouseLeave={() => setHoveredCardIndex(null)}
                        key={index}
                    >
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
                    </div>
                ))}
            </ div>
        </div >
    );
};

export default CardGame;
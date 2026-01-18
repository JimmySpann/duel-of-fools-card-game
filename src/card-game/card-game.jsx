import React, { useState, useEffect, useRef } from 'react';
import Card from './card.jsx';
import { cards } from '../card-game/card-data.js';
import './card-game.css'; // Assume your styles are here

const CardGame = () => {
    const [hoveredCardIndex, setHoveredCardIndex] = useState(null);
    const [selectedCardIndex, setSelectedCardIndex] = useState(null);
    const [flippedCards, setFlippedCards] = useState({});

    const onFlipAllCards = () => {
        const allFlipped = Object.keys(flippedCards).length === cards.length && Object.values(flippedCards).every(value => value === true);
        if (allFlipped) {
            setFlippedCards({});
        } else {
            const newFlipped = {};
            cards.forEach((_, index) => {
                newFlipped[index] = true;
            });
            setFlippedCards(newFlipped);
        }
    }

    const onCardClick = (index) => {
        if (flippedCards[index] === true) {
            setFlippedCards((prev) => ({
                ...prev,
                [index]: false,
            }));
        } else {
            document.body.style.overflow = 'hidden'
            setSelectedCardIndex(index);
        }
    }

    const flipFromButton = (index) => {
        setFlippedCards((prev) => ({
            ...prev,
            [index]: true,
        }));
        document.body.style.overflow = 'auto';
        setSelectedCardIndex(null);
    }

    const onCloseSelectedCard = () => {
        document.body.style.overflow = 'auto';
        setSelectedCardIndex(null);
    }

    return (
        <div
            className="card-game-container"
        >
            <h2 style={{ color: 'white', marginLeft: '10px' }}>
                Card Game
            </h2>
            <button
                className="selected-card-button"
                style={{ margin: '0px 0px 10px 10px' }}
                onClick={onFlipAllCards}
            >
                Flip All Cards
            </button>
            <div className="card-layout">
                {cards.map((card, index) => (
                    <div
                        className={`card-game-card ${hoveredCardIndex === index ? 'card-hover' : ''}`}
                        onMouseEnter={() => setHoveredCardIndex(index)}
                        onMouseLeave={() => setHoveredCardIndex(null)}
                        onClick={() => onCardClick(index)}
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
                            attack={card.attack}
                            agility={card.agility}
                            health={card.health}
                            elements={card.elements}
                            passives={card.passives}
                            actions={card.actions}
                            isFlipped={flippedCards[index]}
                        />
                    </div>
                ))}
            </ div>

            {selectedCardIndex !== null && (
                <div className="selected-card-container">
                    <Card
                        name={cards[selectedCardIndex].name}
                        type={cards[selectedCardIndex].type}
                        image={cards[selectedCardIndex].image}
                        description={cards[selectedCardIndex].description}
                        evasion={cards[selectedCardIndex].evasion}
                        defense={cards[selectedCardIndex].defense}
                        attack={cards[selectedCardIndex].attack}
                        agility={cards[selectedCardIndex].agility}
                        health={cards[selectedCardIndex].health}
                        elements={cards[selectedCardIndex].elements}
                        passives={cards[selectedCardIndex].passives}
                        actions={cards[selectedCardIndex].actions}
                    />
                    <div className="selected-card-button-container">
                        <button
                            className="selected-card-button"
                            onClick={() => flipFromButton(selectedCardIndex)}
                        >
                            Flip
                        </button>
                        <button
                            className="selected-card-button"
                            onClick={() => onCloseSelectedCard()}
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}
        </div >
    );
};

export default CardGame;
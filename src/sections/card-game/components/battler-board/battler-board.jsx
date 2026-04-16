import { useState } from 'react';
import MiniCard from '../card-layouts/mini-card/mini-card.jsx';
import './battler-board.css'

const CardLayout = ({ cards, onCardClick, highlight }) => {
    const [hoveredCardIndex, setHoveredCardIndex] = useState(null);
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


    return (
        <div className={`board${highlight === true ? ' board-targetable' : highlight === 'ally' ? ' board-ally-targetable' : ''}`}>
            {cards.map((card, index) => (
                <div
                    className={`card-game-card ${hoveredCardIndex === index ? 'card-hover' : ''}`}
                    onMouseEnter={() => setHoveredCardIndex(index)}
                    onMouseLeave={() => setHoveredCardIndex(null)}
                    onClick={() => onCardClick(index)}
                    key={index}
                >
                    <MiniCard
                        key={index}
                        card={card}
                        isFlipped={flippedCards[index]}
                    />
                </div>
            ))}
            {(cards.length === 0) && (
                <div className="no-battlers-card">No Battlers In Play</div>
            )}
        </ div>
    );
}

export default CardLayout;
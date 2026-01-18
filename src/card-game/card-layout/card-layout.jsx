import { useState } from 'react';
import Card from '../card/card.jsx';
import './card-layout.css'

const CardLayout = ({ cards, onCardClick, flippedCards }) => {
    const [hoveredCardIndex, setHoveredCardIndex] = useState(null);

    return (
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
                        card={card}
                        isFlipped={flippedCards[index]}
                    />
                </div>
            ))}
        </ div>
    );
}

export default CardLayout;
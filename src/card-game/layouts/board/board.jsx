import { useState } from 'react';
import Card from '../../card-layouts/full-card/full-card.jsx';
import SelectedCard from '../../selected-card/selected-card.jsx';
import './board.css'

const CardLayout = ({ cards }) => {
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

    const flipFromButton = () => {
        setFlippedCards((prev) => ({
            ...prev,
            [selectedCardIndex]: true,
        }));
        document.body.style.overflow = 'auto';
        setSelectedCardIndex(null);
    }

    const onCloseSelectedCard = () => {
        document.body.style.overflow = 'auto';
        setSelectedCardIndex(null);
    }


    return (
        <div className="board">
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
            {(cards.length === 0) && (
                <div className="no-battlers-card">No Battlers In Play</div>
            )}

            {selectedCardIndex !== null &&
                <SelectedCard
                    index={selectedCardIndex}
                    card={cards[selectedCardIndex]}
                    onFlipClick={() => flipFromButton()}
                    onCloseClick={() => onCloseSelectedCard()}
                />
            }
        </ div>
    );
}

export default CardLayout;
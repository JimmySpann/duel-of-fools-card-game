import { useState } from 'react';
import { cards } from './card-data.js';
import Header from './header/header.jsx';
import CardLayout from './card-layout/card-layout.jsx';
import PlayerHUD from './player-hud/player-hud.jsx';
import SelectedCard from './selected-card/selected-card.jsx';
import './card-game.css'; // Assume your styles are here

const CardGame = () => {
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
        <div
            className="card-game-container"
        >
            <Header onFlipAllCards={onFlipAllCards} />

            <CardLayout
                cards={cards}
                onCardClick={onCardClick}
                flippedCards={flippedCards}
            />

            <PlayerHUD
                name="Test"
                image=""
                health="8"
                maxHealth="8"
            />

            {selectedCardIndex !== null &&
                <SelectedCard
                    index={selectedCardIndex}
                    card={cards[selectedCardIndex]}
                    onFlipClick={() => flipFromButton()}
                    onCloseClick={() => onCloseSelectedCard()}
                />
            }
        </div >
    );
};

export default CardGame;
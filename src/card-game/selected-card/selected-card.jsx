import { useEffect, useState } from "react";
import Card from "../card/card";
import './selected-card.css'

const SelectedCard = ({ card, onFlipClick, onCloseClick }) => {
    const [animationTriggers, setAnimationTriggers] = useState({});

    useEffect(() => {
        handleOpenAnimation()
    }, [])

    const handleOpenAnimation = () => {
        let tick = 0;
        const interval = setInterval(() => {
            if (tick === 0) setAnimationTriggers((prev) => ({ ...prev, showCardContainer: true }));
            if (tick === 3) setAnimationTriggers((prev) => ({ ...prev, showCard: true }));
            if (tick === 10) setAnimationTriggers((prev) => ({ ...prev, showButtons: true }));
            if (tick === 15) clearInterval(interval);
            tick++;
        }, 100);
    }
    const handleCloseAnimation = () => {
        let tick = 0;
        const interval = setInterval(() => {
            if (tick === 0) setAnimationTriggers((prev) => ({ ...prev, showButtons: false }));
            if (tick === 5) setAnimationTriggers((prev) => ({ ...prev, showCard: false }));
            if (tick === 10) setAnimationTriggers((prev) => ({ ...prev, showCardContainer: false }));
            if (tick === 12) {
                onCloseClick();
                clearInterval(interval);
            }
            tick++;
        }, 100);
    }

    const onClose = () => {
        handleCloseAnimation();
    }

    const onFlip = () => {
        onFlipClick()
    }

    return (
        <div
            className={`selected-card-container ${animationTriggers.showCardContainer ? 'selected-card-container-show' : ''}`}
            onClick={() => onClose()}
        >
            <div className={`selected-card ${animationTriggers.showCard ? 'selected-card-show' : ''}`} >
                <Card
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
                />
            </div>
            <div className={`selected-card-button-container ${animationTriggers.showButtons ? 'selected-card-button-container-show' : ''}`}>
                <button
                    className="selected-card-button"
                    onClick={() => onFlip()}
                >
                    Flip
                </button>
                <button
                    className="selected-card-button"
                    onClick={() => onClose()}
                >
                    Close
                </button>
            </div>
        </div>
    );
}

export default SelectedCard;
import { useEffect, useState } from "react";
import Card from "../../components/card-layouts/full-card/full-card";
import './selected-card.css'

const SelectedCard = ({ card, onCloseClick, buttons }) => {
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

    return (
        <div
            className={`selected-card-container ${animationTriggers.showCardContainer ? 'selected-card-container-show' : ''}`}
            onClick={() => onClose()}
        >
            <div className={`selected-card ${animationTriggers.showCard ? 'selected-card-show' : ''}`} >
                <Card card={card} />
            </div>
            <div className={`selected-card-button-container ${animationTriggers.showButtons ? 'selected-card-button-container-show' : ''}`}>
                {buttons.map(({ name, onClick, disabled }, i) => (
                    <button
                        key={i}
                        className={`selected-card-button${disabled ? ' selected-card-button-disabled' : ''}`}
                        disabled={!!disabled}
                        onClick={(e) => {
                            e.stopPropagation();
                            if (disabled) return;
                            onClick === 'close' ? onClose() : onClick();
                        }}
                    >
                        {name}
                    </button>
                ))}
            </div>
        </div>
    );
}

export default SelectedCard;
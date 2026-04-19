import { useEffect, useState } from "react";
import Card from "../../components/card-layouts/full-card/full-card";
import './selected-card.css'

const SelectedCard = ({ card, onCloseClick, buttons, onActionClick }) => {
    const [animationTriggers, setAnimationTriggers] = useState({});

    useEffect(() => {
        handleOpenAnimation()
    }, [])

    const handleOpenAnimation = () => {
        setAnimationTriggers((prev) => ({ ...prev, showCardContainer: true }));
        setTimeout(() => setAnimationTriggers((prev) => ({ ...prev, showCard: true })), 300);
        setTimeout(() => setAnimationTriggers((prev) => ({ ...prev, showButtons: true })), 1000);
    };

    const handleCloseAnimation = () => {
        setAnimationTriggers((prev) => ({ ...prev, showButtons: false }));
        setTimeout(() => setAnimationTriggers((prev) => ({ ...prev, showCard: false })), 500);
        setTimeout(() => setAnimationTriggers((prev) => ({ ...prev, showCardContainer: false })), 1000);
        setTimeout(() => onCloseClick(), 1200);
    };

    const onClose = () => {
        handleCloseAnimation();
    }

    return (
        <div
            className={`selected-card-container ${animationTriggers.showCardContainer ? 'selected-card-container-show' : ''}`}
            onClick={() => onClose()}
        >
            <div className={`selected-card ${animationTriggers.showCard ? 'selected-card-show' : ''}`} >
                <Card card={card} onActionClick={onActionClick} />
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
import { useState } from 'react';
import BattlerBoard from '../../battler-board/battler-board.jsx';
import PlayerHUD from '../../player-hud/player-hud.jsx';
import SelectedCard from '../../selected-card/selected-card.jsx';


const EnemyLayout = ({ player }) => {
    const [selectedCardIndex, setSelectedCardIndex] = useState(null);

    const onCardClick = (index) => {
        document.body.style.overflow = 'hidden'
        setSelectedCardIndex(index);
    }
    const handleSelectionCardClose = () => {
        document.body.style.overflow = 'auto';
        setSelectedCardIndex(null);
    }

    return (
        <div>
            <PlayerHUD
                player={player}
            />

            <BattlerBoard
                cards={player.inPlay}
                onCardClick={onCardClick}
            />

            {selectedCardIndex !== null &&
                <SelectedCard
                    index={selectedCardIndex}
                    card={player.inPlay[selectedCardIndex]}
                    onCloseClick={handleSelectionCardClose}
                    buttons={[
                        { name: 'Close', onClick: "close" }
                    ]}
                />
            }
        </div>
    )
}

export default EnemyLayout;
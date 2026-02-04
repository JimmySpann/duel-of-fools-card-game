import { useState } from 'react';
import PlayerHUD from '../../player-hud/player-hud.jsx';
import BattlerBoard from '../../battler-board/battler-board.jsx';
import Hand from '../../hand/hand.jsx'
import SelectedCard from '../../selected-card/selected-card.jsx';



const UserLayout = ({ player }) => {
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
                isCurrentUser={true}
            />

            <BattlerBoard
                cards={player.inPlay}
                onCardClick={onCardClick}
            />

            <Hand _hand={player.hand} />

            {selectedCardIndex !== null &&
                <SelectedCard
                    index={selectedCardIndex}
                    card={player.inPlay[selectedCardIndex]}
                    onCloseClick={handleSelectionCardClose}
                    buttons={[
                        { name: 'Defend', onClick: "close" },
                        { name: 'Close', onClick: "close" },
                        { name: 'Attack', onClick: "close" }
                    ]}
                />
            }
        </div>
    )
}

export default UserLayout;
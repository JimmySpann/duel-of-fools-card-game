import { useState } from 'react';
import { useDispatch } from 'react-redux';
import BattlerBoard from '../../battler-board/battler-board.jsx';
import PlayerHUD from '../../player-hud/player-hud.jsx';
import SelectedCard from '../../selected-card/selected-card.jsx';
import { resolveOnEnemyCard, attackPlayer, resolveOnAllyCard } from '../../../database/cardGameSlice';

const EnemyLayout = ({ player, isTargetable, isAllyTargetable = false, isActiveTurn }) => {
    const dispatch = useDispatch();
    const [selectedCardIndex, setSelectedCardIndex] = useState(null);

    const hasNoBattlers = player.inPlay.filter((c) => !c.dying).length === 0;

    const onCardClick = (index) => {
        if (isAllyTargetable) {
            dispatch(resolveOnAllyCard({ targetCardIndex: index, targetPlayerId: player.id }));
        } else if (isTargetable) {
            dispatch(resolveOnEnemyCard({ targetCardIndex: index, targetPlayerId: player.id }));
        } else {
            document.body.style.overflow = 'hidden';
            setSelectedCardIndex(index);
        }
    };

    const handleSelectionCardClose = () => {
        document.body.style.overflow = 'auto';
        setSelectedCardIndex(null);
    };

    return (
        <div>
            <PlayerHUD player={player} />
            {isTargetable && hasNoBattlers ? (
                <div className="enemy-direct-attack-area">
                    <button
                        className="enemy-direct-attack-btn"
                        onClick={() => dispatch(attackPlayer({ targetPlayerId: player.id }))}
                    >
                        ⚔ Attack {player.name} Directly
                    </button>
                </div>
            ) : (
                <BattlerBoard
                    cards={player.inPlay}
                    onCardClick={onCardClick}
                    highlight={isTargetable ? true : isAllyTargetable ? 'ally' : false}
                    playerId={player.id}
                    showExhausted={isActiveTurn}
                />
            )}
            {selectedCardIndex !== null && !isTargetable && !isAllyTargetable && (
                <SelectedCard
                    card={player.inPlay[selectedCardIndex]}
                    onCloseClick={handleSelectionCardClose}
                    buttons={[{ name: 'Close', onClick: 'close' }]}
                />
            )}
        </div>
    );
};

export default EnemyLayout;
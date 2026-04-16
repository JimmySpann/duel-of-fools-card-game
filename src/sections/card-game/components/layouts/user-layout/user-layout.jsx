import { useState } from 'react';
import { useDispatch } from 'react-redux';
import PlayerHUD from '../../player-hud/player-hud.jsx';
import BattlerBoard from '../../battler-board/battler-board.jsx';
import Hand from '../../hand/hand.jsx';
import SelectedCard from '../../selected-card/selected-card.jsx';
import { selectAttacker, playCardFromHand } from '../../../database/cardGameSlice';

const UserLayout = ({ player, phase, onEndTurn, onCancelSelection }) => {
    const dispatch = useDispatch();
    const [selectedBattlerIndex, setSelectedBattlerIndex] = useState(null);
    const [selectedHandIndex, setSelectedHandIndex] = useState(null);

    const onBattlerClick = (index) => {
        if (phase === 'selectingTarget') return;
        document.body.style.overflow = 'hidden';
        setSelectedBattlerIndex(index);
    };

    const onHandCardClick = (index) => {
        if (phase !== 'main') return;
        document.body.style.overflow = 'hidden';
        setSelectedHandIndex(index);
    };

    const handleBattlerClose = () => {
        document.body.style.overflow = 'auto';
        setSelectedBattlerIndex(null);
    };

    const handleHandClose = () => {
        document.body.style.overflow = 'auto';
        setSelectedHandIndex(null);
    };

    const handleAttack = () => {
        dispatch(selectAttacker(selectedBattlerIndex));
        handleBattlerClose();
    };

    const handlePlayCard = () => {
        dispatch(playCardFromHand({ cardIndex: selectedHandIndex }));
        handleHandClose();
    };

    return (
        <div>
            <PlayerHUD player={player} isCurrentUser={true} />
            <BattlerBoard cards={player.inPlay} onCardClick={onBattlerClick} />
            <Hand _hand={player.hand} onCardClick={onHandCardClick} />
            <div className="turn-controls">
                {phase === 'selectingTarget' ? (
                    <button className="turn-btn cancel-btn" onClick={onCancelSelection}>
                        Cancel Attack
                    </button>
                ) : (
                    <button className="turn-btn end-turn-btn" onClick={onEndTurn}>
                        End Turn
                    </button>
                )}
            </div>

            {selectedBattlerIndex !== null && phase === 'main' && (
                <SelectedCard
                    card={player.inPlay[selectedBattlerIndex]}
                    onCloseClick={handleBattlerClose}
                    buttons={[
                        { name: 'Attack', onClick: handleAttack },
                        { name: 'Close', onClick: 'close' },
                    ]}
                />
            )}
            {selectedHandIndex !== null && phase === 'main' && (
                <SelectedCard
                    card={player.hand[selectedHandIndex]}
                    onCloseClick={handleHandClose}
                    buttons={[
                        { name: 'Play Card', onClick: handlePlayCard },
                        { name: 'Close', onClick: 'close' },
                    ]}
                />
            )}
        </div>
    );
};

export default UserLayout;
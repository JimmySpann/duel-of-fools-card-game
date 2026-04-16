import { useState } from 'react';
import { useDispatch } from 'react-redux';
import PlayerHUD from '../../player-hud/player-hud.jsx';
import BattlerBoard from '../../battler-board/battler-board.jsx';
import Hand from '../../hand/hand.jsx';
import SelectedCard from '../../selected-card/selected-card.jsx';
import { selectAttacker, initiateAbility, resolveOnAllyCard, playCardFromHand } from '../../../database/cardGameSlice';

const UserLayout = ({ player, phase, onEndTurn, onCancelSelection }) => {
    const dispatch = useDispatch();
    const [selectedBattlerIndex, setSelectedBattlerIndex] = useState(null);
    const [selectedHandIndex, setSelectedHandIndex] = useState(null);

    const onBattlerClick = (index) => {
        if (phase === 'selectingTarget') return;
        // In ally-targeting phase, clicking own card selects it as target
        if (phase === 'selectingAllyTarget') {
            dispatch(resolveOnAllyCard({ targetCardIndex: index }));
            return;
        }
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
        // modal closes via container click bubbling
    };

    const handleUseAbility = (abilityIndex) => {
        dispatch(initiateAbility({ casterCardIndex: selectedBattlerIndex, abilityIndex }));
        // modal closes via container click bubbling
    };

    const handlePlayCard = () => {
        dispatch(playCardFromHand({ cardIndex: selectedHandIndex }));
        handleHandClose();
    };

    // Build buttons for a selected battler card
    const buildBattlerButtons = (card) => {
        if (!card) return [];
        const abilityButtons = (card.actions || []).map((action, idx) => ({
            name: `${action.name} (${action.usesRemaining}/${action.limit})`,
            onClick: () => handleUseAbility(idx),
            disabled: action.usesRemaining <= 0,
        }));
        return [
            { name: 'Attack', onClick: handleAttack },
            ...abilityButtons,
            { name: 'Close', onClick: 'close' },
        ];
    };

    const isSelectingAlly = phase === 'selectingAllyTarget';
    const isSelectingEnemy = phase === 'selectingTarget';

    return (
        <div>
            <PlayerHUD player={player} isCurrentUser={true} />
            <BattlerBoard
                cards={player.inPlay}
                onCardClick={onBattlerClick}
                highlight={isSelectingAlly ? 'ally' : false}
            />
            <Hand _hand={player.hand} onCardClick={onHandCardClick} />
            <div className="turn-controls">
                {(isSelectingEnemy || isSelectingAlly) ? (
                    <button className="turn-btn cancel-btn" onClick={onCancelSelection}>
                        Cancel
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
                    buttons={buildBattlerButtons(player.inPlay[selectedBattlerIndex])}
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
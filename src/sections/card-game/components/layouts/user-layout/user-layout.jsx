import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import PlayerHUD from '../../player-hud/player-hud.jsx';
import BattlerBoard from '../../battler-board/battler-board.jsx';
import Hand from '../../hand/hand.jsx';
import SelectedCard from '../../selected-card/selected-card.jsx';
import { selectAttacker, initiateAbility, resolveOnAllyCard, playCardFromHand } from '../../../database/cardGameSlice';
import sounds from '../../../../../features/sound/soundManager';

const UserLayout = ({ player, phase, onEndTurn, onCancelSelection, onForfeit, disabled = false }) => {
    const dispatch = useDispatch();
    const cardPlayedThisTurn = useSelector((s) => s.cardGame.cardPlayedThisTurn);
    const [selectedBattlerIndex, setSelectedBattlerIndex] = useState(null);
    const [selectedHandIndex, setSelectedHandIndex] = useState(null);

    const onBattlerClick = (index) => {
        if (disabled) return;
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
        // Allow viewing a card even when it's not our turn; just can't play it.
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

    const handleUseAbility = (abilityIndex) => {
        sounds.ability();
        dispatch(initiateAbility({ casterCardIndex: selectedBattlerIndex, abilityIndex }));
        handleBattlerClose();
    };

    const handlePlayCard = () => {
        sounds.cardPlay();
        dispatch(playCardFromHand({ cardIndex: selectedHandIndex }));
        handleHandClose();
    };

    // Build buttons for a selected battler card (Attack + Close only)
    const buildBattlerButtons = () => {
        const currentCard = player.inPlay[selectedBattlerIndex];
        const isExhausted = !!(currentCard?.acted || currentCard?.justPlayed);
        return [
            { name: isExhausted ? (currentCard?.justPlayed ? 'Not Ready' : 'Already Acted') : 'Attack', onClick: handleAttack, disabled: isExhausted },
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
                playerId={player.id}
                showExhausted={!disabled}
            />
            <Hand _hand={player.hand} onCardClick={onHandCardClick} locked={false} dimmed={cardPlayedThisTurn || disabled} />
            <div className="turn-controls">
                {disabled ? (
                    <button className="turn-btn end-turn-btn" disabled>
                        Opponent's Turn…
                    </button>
                ) : (isSelectingEnemy || isSelectingAlly) ? (
                    <button className="turn-btn cancel-btn" onClick={onCancelSelection}>
                        Cancel
                    </button>
                ) : (
                    <>
                        <button className="turn-btn end-turn-btn" onClick={onEndTurn}>
                            End Turn
                        </button>
                        <button className="turn-btn forfeit-btn" onClick={onForfeit}>
                            Forfeit
                        </button>
                    </>
                )}
            </div>

            {selectedBattlerIndex !== null && phase === 'main' && (
                <SelectedCard
                    card={player.inPlay[selectedBattlerIndex]}
                    onCloseClick={handleBattlerClose}
                    buttons={buildBattlerButtons()}
                    onActionClick={(abilityIndex) => {
                        const currentCard = player.inPlay[selectedBattlerIndex];
                        if (currentCard?.acted || currentCard?.justPlayed) return;
                        handleUseAbility(abilityIndex);
                    }}
                />
            )}
            {selectedHandIndex !== null && phase === 'main' && (
                <SelectedCard
                    card={player.hand[selectedHandIndex]}
                    onCloseClick={handleHandClose}
                    buttons={
                        disabled || cardPlayedThisTurn
                            ? [{ name: 'Close', onClick: 'close' }]
                            : [
                                { name: 'Play Card', onClick: handlePlayCard },
                                { name: 'Close', onClick: 'close' },
                            ]
                    }
                />
            )}
        </div>
    );
};

export default UserLayout;
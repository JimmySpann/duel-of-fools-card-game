import BattlerBoard from '../../battler-board/battler-board.jsx';
import PlayerHUD from '../../player-hud/player-hud.jsx';

const EnemyLayout = ({ player }) => {
    return (
        <div>
            <PlayerHUD
                player={player}
            />

            <BattlerBoard
                cards={player.inPlay}
            />
        </div>
    )
}

export default EnemyLayout;
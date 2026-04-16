import { useSelector, useDispatch } from 'react-redux';
import { endTurn, resetGame, cancelSelection } from './database/cardGameSlice';
import Header from './components/header/header.jsx';
import EnemyLayout from './components/layouts/enemy-layout/enemy-layout.jsx';
import UserLayout from './components/layouts/user-layout/user-layout.jsx';
import TurnRecap from './components/turn-recap/turn-recap.jsx';
import './card-game.css';

const CardGame = () => {
    const dispatch = useDispatch();
    const { players, currentTurn, phase, gameOver, winner, log } = useSelector((state) => state.cardGame);

    const currentPlayer = players.find((p) => p.id === currentTurn);
    const otherPlayer = players.find((p) => p.id !== currentTurn);

    if (gameOver) {
        const winnerName = players.find((p) => p.id === winner)?.name;
        return (
            <div className="card-game-container">
                <div className="game-over-screen">
                    <h1 className="game-over-title">{winnerName} Wins!</h1>
                    <button className="game-over-btn" onClick={() => dispatch(resetGame())}>
                        Play Again
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="card-game-container">
            <Header
                currentPlayerName={currentPlayer.name}
                phase={phase}
            />
            <EnemyLayout
                player={otherPlayer}
                isTargetable={phase === 'selectingTarget'}
            />
            <UserLayout
                player={currentPlayer}
                phase={phase}
                onEndTurn={() => dispatch(endTurn())}
                onCancelSelection={() => dispatch(cancelSelection())}
            />
            <div className="battle-log">
                <div className="battle-log-title">Battle Log</div>
                <div className="battle-log-entries">
                    {log.slice(0, 8).map((entry, i) => (
                        <div key={i} className="battle-log-entry">{entry}</div>
                    ))}
                </div>
            </div>
            <TurnRecap currentPlayer={currentPlayer} players={players} />
        </div>
    );
};

export default CardGame;
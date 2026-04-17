import { useEffect, useRef, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { endTurn, resetGame, cancelSelection, setGameState } from './database/cardGameSlice';
import { getSocket } from '../../features/chat/socket';
import useNotifications from '../../features/notifications/useNotifications';
import Header from './components/header/header.jsx';
import EnemyLayout from './components/layouts/enemy-layout/enemy-layout.jsx';
import UserLayout from './components/layouts/user-layout/user-layout.jsx';
import TurnRecap from './components/turn-recap/turn-recap.jsx';
import './card-game.css';

const CardGame = () => {
    const dispatch = useDispatch();
    const { players, currentTurn, phase, gameOver, winner, log } = useSelector((state) => state.cardGame);
    const activeGameId = useSelector((s) => s.sessions.activeGameId);
    const activeSession = useSelector((s) => s.sessions.activeSession);
    const username = useSelector((s) => s.auth.username);
    const notifyTurnGlobal = useSelector((s) => s.profile.notifyTurn);

    // Per-game notification override (defaults to global setting)
    const [notifyThisGame, setNotifyThisGame] = useState(notifyTurnGlobal);

    const { notify, permission, request } = useNotifications();
    const prevTurnRef = useRef(null);

    // Determine which player slot belongs to the logged-in user
    const myPlayerId = activeSession?.players?.find((p) => p.username === username)?.slot ?? null;
    const isOnline = !!activeGameId;

    // In online mode: my board is always at the bottom regardless of turn.
    // In local (solo) mode: keep existing behaviour — current turn player at bottom.
    const myPlayer = isOnline
        ? players.find((p) => p.id === myPlayerId) ?? players[0]
        : players.find((p) => p.id === currentTurn);
    const opponentPlayer = players.find((p) => p.id !== myPlayer?.id);

    // Actions are only allowed when it is this client's turn
    const isMyTurn = !isOnline || currentTurn === myPlayerId;

    // Join the game socket room and sync state from server
    useEffect(() => {
        if (!activeGameId) return;
        const socket = getSocket();
        if (!socket) return;

        socket.emit('game:join', { gameId: activeGameId });

        const handleState = (state) => dispatch(setGameState(state));
        const handleError = ({ message }) => console.error('game:error', message);

        socket.on('game:state', handleState);
        socket.on('game:error', handleError);

        return () => {
            socket.off('game:state', handleState);
            socket.off('game:error', handleError);
        };
    }, [activeGameId, dispatch]);

    // Fire a browser notification when the turn transitions to this player
    useEffect(() => {
        if (!isOnline || !notifyThisGame) return;
        if (prevTurnRef.current === null) {
            prevTurnRef.current = currentTurn;
            return;
        }
        const justBecameMyTurn = prevTurnRef.current !== currentTurn && currentTurn === myPlayerId;
        prevTurnRef.current = currentTurn;
        if (justBecameMyTurn) {
            notify("It's your turn!", `${activeSession?.name ?? 'Card Game'} — make your move.`);
        }
    }, [currentTurn, isOnline, notifyThisGame, myPlayerId, notify, activeSession]);

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
                currentPlayerName={players.find((p) => p.id === currentTurn)?.name}
                phase={phase}
                isMyTurn={isMyTurn}
            />
            {isOnline && (
                <button
                    className={`game-notif-toggle ${notifyThisGame ? 'on' : 'off'}`}
                    title={notifyThisGame ? 'Turn notifications on' : 'Turn notifications off'}
                    onClick={async () => {
                        if (!notifyThisGame && permission !== 'granted') await request();
                        setNotifyThisGame((v) => !v);
                    }}
                >
                    🔔
                </button>
            )}
            <EnemyLayout
                player={opponentPlayer}
                isTargetable={isMyTurn && phase === 'selectingTarget'}
            />
            <UserLayout
                player={myPlayer}
                phase={isMyTurn ? phase : 'waiting'}
                onEndTurn={() => dispatch(endTurn())}
                onCancelSelection={() => dispatch(cancelSelection())}
                disabled={!isMyTurn}
            />
            <div className="battle-log">
                <div className="battle-log-title">Battle Log</div>
                <div className="battle-log-entries">
                    {log.slice(0, 8).map((entry, i) => (
                        <div key={i} className="battle-log-entry">{entry}</div>
                    ))}
                </div>
            </div>
            <TurnRecap currentPlayer={myPlayer} players={players} />
        </div>
    );
};

export default CardGame;

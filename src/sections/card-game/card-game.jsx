import { useEffect, useRef, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { endTurn, resetGame, cancelSelection, setGameState } from './database/cardGameSlice';
import { getSocket } from '../../features/chat/socket';
import { leaveSession } from '../../features/sessions/sessionsSlice';
import { logout } from '../../features/auth/authSlice';
import { markLobbyRead } from '../../features/chat/chatSlice';
import useNotifications from '../../features/notifications/useNotifications';
import LobbyChat from '../../features/chat/LobbyChat';
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
    const displayName = useSelector((s) => s.profile.displayName);
    const avatarUrl = useSelector((s) => s.profile.avatarUrl);
    const unreadLobby = useSelector((s) =>
        activeSession ? (s.chat.unreadLobby[activeSession._id] || 0) : 0
    );

    // Panel state
    const [showBrief, setShowBrief] = useState(false);
    const [showChat, setShowChat] = useState(false);

    // Per-game notification override (defaults to global setting)
    const [notifyThisGame, setNotifyThisGame] = useState(notifyTurnGlobal);

    const { notify, permission, request } = useNotifications();

    // Request browser notification permission proactively when the game loads
    useEffect(() => {
        request();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Clear unread lobby counter whenever the chat panel is opened
    useEffect(() => {
        if (showChat && activeSession) {
            dispatch(markLobbyRead(activeSession._id));
        }
    }, [showChat, activeSession, dispatch]);
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

    // Join the game socket room and sync state from server.
    // Also re-join whenever the socket reconnects (socket.io leaves all rooms on disconnect).
    useEffect(() => {
        if (!activeGameId) return;
        const socket = getSocket();
        if (!socket) return;

        const joinRoom = () => {
            socket.emit('game:join', { gameId: activeGameId });
        };

        joinRoom(); // join immediately

        const handleState = (state) => dispatch(setGameState(state));
        const handleError = ({ message }) => console.error('game:error', message);

        socket.on('game:state', handleState);
        socket.on('game:error', handleError);
        socket.on('connect', joinRoom); // re-join if the socket reconnects

        return () => {
            socket.off('game:state', handleState);
            socket.off('game:error', handleError);
            socket.off('connect', joinRoom);
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
            notify("It's your turn!", `${activeSession?.name ?? 'Card Game'} — make your move.`, undefined, 'turn');
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
                onLobbies={() => dispatch(leaveSession())}
                onSignOut={() => dispatch(logout())}
                onBriefToggle={() => { setShowBrief((v) => !v); setShowChat(false); }}
                onChatToggle={() => { setShowChat((v) => !v); setShowBrief(false); }}
                showBrief={showBrief}
                showChat={showChat}
                hasUnreadChat={unreadLobby > 0}
                displayName={displayName}
                avatarUrl={avatarUrl}
                username={username}
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

            {/* ── Brief panel ─────────────────────────────────────────── */}
            {showBrief && (
                <div className="game-panel-overlay" onClick={() => setShowBrief(false)}>
                    <div className="game-panel" onClick={(e) => e.stopPropagation()}>
                        <div className="game-panel-header">
                            <h3 className="game-panel-title">Game Brief</h3>
                            <button className="game-panel-close" onClick={() => setShowBrief(false)}>✕</button>
                        </div>

                        {activeSession && (
                            <p className="game-panel-session-name">{activeSession.name}</p>
                        )}

                        <div className="game-panel-section">
                            <h4 className="game-panel-section-title">Players</h4>
                            <div className="game-panel-players">
                                {players.map((p) => {
                                    const pct = Math.max(0, Math.round((p.health / p.maxHealth) * 100));
                                    const isCurrent = p.id === currentTurn;
                                    return (
                                        <div key={p.id} className={`game-panel-player${isCurrent ? ' current-turn' : ''}`}>
                                            <div className="game-panel-player-row">
                                                <span className="game-panel-player-name">
                                                    {isCurrent ? '▶ ' : ''}{p.name}
                                                    {p.id === myPlayerId && isOnline ? ' (You)' : ''}
                                                </span>
                                                <span className="game-panel-player-hp">{p.health} / {p.maxHealth} HP</span>
                                            </div>
                                            <div className="game-panel-hp-bar">
                                                <div
                                                    className="game-panel-hp-fill"
                                                    style={{
                                                        width: `${pct}%`,
                                                        background: pct > 50 ? '#5fc98e' : pct > 25 ? '#e2c97e' : '#e05a5a',
                                                    }}
                                                />
                                            </div>
                                            <div className="game-panel-player-stats">
                                                <span>Hand: {p.hand.length}</span>
                                                <span>In Play: {p.inPlay.length}</span>
                                                <span>Deck: {p.deck.length}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="game-panel-section">
                            <h4 className="game-panel-section-title">How to Play</h4>
                            <ul className="game-panel-rules">
                                <li>Play a card from your hand to put a battler into play.</li>
                                <li>Only one card can be played per turn.</li>
                                <li>Select a battler to <strong>Attack</strong> or use an <strong>Ability</strong>.</li>
                                <li>Battlers that just entered play are <em>Not Ready</em> — they can't act this turn.</li>
                                <li>Battlers that have already acted this turn are marked <em>Acted</em>.</li>
                                <li>Defeat all enemy battlers to win, or reduce the opponent's HP to 0.</li>
                                <li>Press <strong>End Turn</strong> to pass play to your opponent.</li>
                            </ul>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Chat panel ──────────────────────────────────────────── */}
            {showChat && activeSession && (
                <div className="game-chat-panel">
                    <div className="game-panel-header">
                        <h3 className="game-panel-title">Lobby Chat</h3>
                        <button className="game-panel-close" onClick={() => setShowChat(false)}>✕</button>
                    </div>
                    <LobbyChat sessionId={activeSession._id} isWatching={true} />
                </div>
            )}
        </div>
    );
};

export default CardGame;

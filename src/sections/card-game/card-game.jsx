import { useEffect, useMemo, useRef, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { endTurn, resetGame, cancelSelection, setGameState, forfeitCurrentPlayer } from './database/cardGameSlice';
import { getSocket } from '../../features/chat/socket';
import { leaveSession } from '../../features/sessions/sessionsSlice';
import { logout } from '../../features/auth/authSlice';
import { markLobbyRead } from '../../features/chat/chatSlice';
import useNotifications from '../../features/notifications/useNotifications';
import LobbyChat from '../../features/chat/LobbyChat';
import DMPanel from '../../features/chat/DMPanel';
import Profile from '../../features/profile/Profile';
import Header from './components/header/header.jsx';
import EnemyLayout from './components/layouts/enemy-layout/enemy-layout.jsx';
import UserLayout from './components/layouts/user-layout/user-layout.jsx';
import TurnRecap from './components/turn-recap/turn-recap.jsx';
import sounds from '../../features/sound/soundManager';
import BriefPanel from './BriefPanel';
import MicroEventController from './components/micro-events/MicroEventController';
import useBackground from '../../utils/useBackground';
import './card-game.css';

const CardGame = () => {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const bgStyle = useBackground('game');
    const { players, currentTurn, phase, gameOver, winner, log, lastHitEvents } = useSelector((state) => state.cardGame);
    const turnStartedAt = useSelector((state) => state.cardGame.turnStartedAt);
    const gameSettings = useSelector((state) => state.cardGame.settings);
    const activeGameId = useSelector((s) => s.sessions.activeGameId);
    const activeSession = useSelector((s) => s.sessions.activeSession);
    const username = useSelector((s) => s.auth.username);
    const notifyTurnGlobal = useSelector((s) => s.profile.notifyTurn);
    const displayName = useSelector((s) => s.profile.displayName);
    const avatarUrl = useSelector((s) => s.profile.avatarUrl);
    const unreadLobby = useSelector((s) =>
        activeSession ? (s.chat.unreadLobby[activeSession._id] || 0) : 0
    );
    const unreadDm = useSelector((s) => s.chat.unreadDm);
    const hasUnreadMessages = Object.values(unreadDm).some((v) => v > 0);


    // Panel state
    const [showBrief, setShowBrief] = useState(false);
    const [showChat, setShowChat] = useState(false);
    const [showProfile, setShowProfile] = useState(false);
    const [showMessages, setShowMessages] = useState(false);
    const [showForfeitConfirm, setShowForfeitConfirm] = useState(false);

    // Per-game notification override (defaults to global setting)
    const [notifyThisGame, setNotifyThisGame] = useState(notifyTurnGlobal);

    const soundVolume = useSelector((s) => s.profile.soundVolume);
    const { notify, permission, request } = useNotifications();

    // Sync sound volume from persisted profile state on mount
    useEffect(() => {
        sounds.setVolume(soundVolume ?? 0.7);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

    // Determine which player slot belongs to the logged-in user
    const myPlayerId = activeSession?.players?.find((p) => p.username === username)?.slot ?? null;
    const isOnline = !!activeGameId;
    const gamePlayers = useMemo(() => {
        if (!myPlayerId || !avatarUrl) return players;
        return players.map((p) => (p.id === myPlayerId ? { ...p, image: avatarUrl } : p));
    }, [players, myPlayerId, avatarUrl]);

    // In online mode: my board is always at the bottom regardless of turn.
    // In local (solo) mode: keep existing behaviour — current turn player at bottom.
    const myPlayer = isOnline
        ? gamePlayers.find((p) => p.id === myPlayerId) ?? gamePlayers[0]
        : gamePlayers.find((p) => p.id === currentTurn);
    // All players other than me, excluding eliminated players
    const opponents = gamePlayers.filter((p) => p.id !== myPlayer?.id && !p.eliminated);

    // In teams mode, split into teammates (same team) and enemies (different/no team)
    const myTeam = myPlayer?.team ?? null;
    const isTeamsMode = gameSettings?.teamMode === 'teams';
    const teammates = isTeamsMode && myTeam
        ? opponents.filter((p) => p.team === myTeam)
        : [];
    const enemies = opponents.filter((p) => !isTeamsMode || !myTeam || p.team !== myTeam);

    // Actions are only allowed when it is this client's turn
    const isMyTurn = !isOnline || currentTurn === myPlayerId;

    const prevTurnRef = useRef(null);
    // Track all opponents' health to detect any direct hit
    const prevOpponentHealthMapRef = useRef({});
    const gameOverSoundFiredRef = useRef(false);

    // ── Sound: combat hit events ────────────────────────────────────────────
    useEffect(() => {
        if (!lastHitEvents || lastHitEvents.length === 0) return;
        lastHitEvents.forEach((evt, i) => {
            setTimeout(() => {
                if (evt.type === 'hit') sounds.hit();
                else if (evt.type === 'miss') sounds.miss();
                else if (evt.type === 'defeat') sounds.defeat();
                else if (evt.type === 'blocked') sounds.blocked();
            }, i * 130);
        });
    }, [lastHitEvents]);

    // ── Sound: direct player hit (any opponent health decreases) ────────
    useEffect(() => {
        const prevMap = prevOpponentHealthMapRef.current;
        let hit = false;
        opponents.forEach((p) => {
            if (prevMap[p.id] !== undefined && p.health < prevMap[p.id]) hit = true;
            prevMap[p.id] = p.health;
        });
        if (hit) sounds.directHit();
    }); // runs every render — intentional shallow check

    // ── Sound: it's now my turn ─────────────────────────────────────────────
    useEffect(() => {
        if (prevTurnRef.current !== null && currentTurn === myPlayerId) {
            sounds.yourTurn();
        }
    }, [currentTurn]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Sound: game over ────────────────────────────────────────────────────
    useEffect(() => {
        if (!gameOver || gameOverSoundFiredRef.current) return;
        gameOverSoundFiredRef.current = true;
        if (winner === myPlayerId) sounds.gameWin();
        else sounds.gameLose();
    }, [gameOver]); // eslint-disable-line react-hooks/exhaustive-deps

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

        const handleState = (state) => {
            dispatch(setGameState(state));
        };
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
        // winner is a player id in FFA, or a team letter in team mode
        const winnerPlayer = gamePlayers.find((p) => p.id === winner);
        const winnerLabel = winnerPlayer
            ? winnerPlayer.id === myPlayerId ? 'You Win!' : 'You Lose!'
            : `Team ${winner} Wins!`;
        return (
            <div className="card-game-container">
                <div className="game-over-screen">
                    <h1 className="game-over-title">{winnerLabel}</h1>
                    <div className="game-over-actions">
                        <button className="game-over-btn" onClick={() => setShowBrief((v) => !v)}>
                            📋 Brief
                        </button>
                        <button
                            className="game-over-btn"
                            onClick={() => {
                                dispatch(resetGame());
                                dispatch(leaveSession());
                                navigate('/');
                            }}
                        >
                            Back
                        </button>
                    </div>
                </div>
                {showBrief && (
                    <BriefPanel
                        onClose={() => setShowBrief(false)}
                        gamePlayers={gamePlayers}
                        myPlayerId={myPlayerId}
                        isOnline={isOnline}
                    />
                )}
            </div>
        );
    }

    return (
        <div className="card-game-container" style={bgStyle}>
            <Header
                currentPlayerName={gamePlayers.find((p) => p.id === currentTurn)?.name}
                phase={phase}
                isMyTurn={isMyTurn}
                onLobbies={() => { dispatch(leaveSession()); navigate('/'); }}
                onProfileOpen={() => setShowProfile(true)}
                onSignOut={() => dispatch(logout())}
                onBriefToggle={() => { setShowBrief((v) => !v); setShowChat(false); }}
                onChatToggle={() => { setShowChat((v) => !v); setShowBrief(false); }}
                onMessagesToggle={() => { setShowMessages(true); setShowBrief(false); setShowChat(false); }}
                showBrief={showBrief}
                showChat={showChat}
                showMessages={showMessages}
                hasUnreadChat={unreadLobby > 0}
                hasUnreadMessages={hasUnreadMessages}
                displayName={displayName}
                avatarUrl={avatarUrl}
                username={username}
                turnTimeLimit={gameSettings?.turnTimeLimit ?? null}
                turnStartedAt={turnStartedAt ?? null}
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
            <div className={`opponents-area opponents-${opponents.length}`}>
                {teammates.map((tm) => (
                    <EnemyLayout
                        key={tm.id}
                        player={tm}
                        isTargetable={false}
                        isAllyTargetable={isMyTurn && phase === 'selectingAllyTarget'}
                        isActiveTurn={currentTurn === tm.id}
                    />
                ))}
                {enemies.map((opp) => (
                    <EnemyLayout
                        key={opp.id}
                        player={opp}
                        isTargetable={isMyTurn && phase === 'selectingTarget'}
                        isAllyTargetable={false}
                        isActiveTurn={currentTurn === opp.id}
                    />
                ))}
            </div>
            <UserLayout
                player={myPlayer}
                phase={isMyTurn ? phase : 'waiting'}
                onEndTurn={() => { sounds.endTurn(); dispatch(endTurn()); }}
                onCancelSelection={() => dispatch(cancelSelection())}
                onForfeit={() => setShowForfeitConfirm(true)}
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
            <TurnRecap currentPlayer={myPlayer} players={gamePlayers} />

            {showForfeitConfirm && (
                <div className="game-panel-overlay" onClick={() => setShowForfeitConfirm(false)}>
                    <div className="game-forfeit-modal" onClick={(e) => e.stopPropagation()}>
                        <h3 className="game-forfeit-title">Forfeit Match?</h3>
                        <p className="game-forfeit-message">
                            This will immediately end the game and count as a loss.
                        </p>
                        <div className="game-forfeit-actions">
                            <button className="game-forfeit-cancel" onClick={() => setShowForfeitConfirm(false)}>
                                Cancel
                            </button>
                            <button
                                className="game-forfeit-confirm"
                                onClick={() => {
                                    setShowForfeitConfirm(false);
                                    dispatch(forfeitCurrentPlayer());
                                }}
                            >
                                Forfeit
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Microevent overlay ───────────────────────────────────────────── */}
            <MicroEventController gameId={activeGameId} myPlayerId={myPlayerId} />
            {/* ── Brief panel ───────────────────────────────────────────────────── */}
            {showBrief && (
                <BriefPanel
                    onClose={() => setShowBrief(false)}
                    gamePlayers={gamePlayers}
                    myPlayerId={myPlayerId}
                    isOnline={isOnline}
                />
            )}
            {/* ── Chat panel ──────────────────────────────────────────── */}
            {activeSession && (
                <div className="game-chat-panel" style={showChat ? undefined : { display: 'none' }}>
                    <div className="game-panel-header">
                        <h3 className="game-panel-title">Lobby Chat</h3>
                        <button className="game-panel-close" onClick={() => setShowChat(false)}>✕</button>
                    </div>
                    <LobbyChat sessionId={activeSession._id} isWatching={showChat} />
                </div>
            )}

            {/* ── Profile modal ────────────────────────────────────────── */}
            {showProfile && <Profile onClose={() => setShowProfile(false)} initialTab="Options" />}

            <DMPanel open={showMessages} onOpenChange={setShowMessages} hideToggle />
        </div>
    );
};

export default CardGame;

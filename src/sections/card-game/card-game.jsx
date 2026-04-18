import { useEffect, useRef, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { endTurn, resetGame, cancelSelection, setGameState } from './database/cardGameSlice';
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
import MicroEventOverlay from './components/micro-events/MicroEventOverlay';
import './card-game.css';

const CardGame = () => {
    const dispatch = useDispatch();
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

    // Microevent state
    const [microeventContext, setMicroeventContext] = useState(null);
    const [liveInputs, setLiveInputs] = useState([]);

    // Panel state
    const [showBrief, setShowBrief] = useState(false);
    const [briefTab, setBriefTab] = useState('fullBrief');
    const [briefSearch, setBriefSearch] = useState('');
    const [showChat, setShowChat] = useState(false);
    const [showProfile, setShowProfile] = useState(false);
    const [showMessages, setShowMessages] = useState(false);

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

    // In online mode: my board is always at the bottom regardless of turn.
    // In local (solo) mode: keep existing behaviour — current turn player at bottom.
    const myPlayer = isOnline
        ? players.find((p) => p.id === myPlayerId) ?? players[0]
        : players.find((p) => p.id === currentTurn);
    // All players other than me, excluding eliminated players
    const opponents = players.filter((p) => p.id !== myPlayer?.id && !p.eliminated);

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
            // Clear overlay once the engine leaves the microevent phase
            if (state.phase !== 'microevent') {
                setMicroeventContext(null);
                setLiveInputs([]);
            }
        };
        const handleError = ({ message }) => console.error('game:error', message);
        const handleMicroeventStart = (ctx) => {
            setLiveInputs([]);
            setMicroeventContext(ctx);
        };
        const handleMicroeventInput = (inputPayload) => {
            setLiveInputs((prev) => [...prev, inputPayload]);
        };

        socket.on('game:state', handleState);
        socket.on('game:error', handleError);
        socket.on('game:microevent:start', handleMicroeventStart);
        socket.on('game:microevent:input', handleMicroeventInput);
        socket.on('connect', joinRoom); // re-join if the socket reconnects

        return () => {
            socket.off('game:state', handleState);
            socket.off('game:error', handleError);
            socket.off('game:microevent:start', handleMicroeventStart);
            socket.off('game:microevent:input', handleMicroeventInput);
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
        const winnerPlayer = players.find((p) => p.id === winner);
        const winnerLabel = winnerPlayer
            ? winnerPlayer.id === myPlayerId ? 'You Win!' : `${winnerPlayer.name} Wins!`
            : `Team ${winner} Wins!`;
        return (
            <div className="card-game-container">
                <div className="game-over-screen">
                    <h1 className="game-over-title">{winnerLabel}</h1>
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
                onProfileOpen={() => setShowProfile(true)}
                onSignOut={() => dispatch(logout())}
                onBriefToggle={() => { setShowBrief((v) => !v); setShowChat(false); }}
                onChatToggle={() => { setShowChat((v) => !v); setShowBrief(false); }}
                onMessagesToggle={() => setShowMessages((v) => !v)}
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
                {opponents.map((opp) => (
                    <EnemyLayout
                        key={opp.id}
                        player={opp}
                        isTargetable={isMyTurn && phase === 'selectingTarget'}
                        isActiveTurn={currentTurn === opp.id}
                    />
                ))}
            </div>
            <UserLayout
                player={myPlayer}
                phase={isMyTurn ? phase : 'waiting'}
                onEndTurn={() => { sounds.endTurn(); dispatch(endTurn()); }}
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

            {/* ── Microevent overlay ──────────────────────────────────────── */}
            {microeventContext && (
                <MicroEventOverlay
                    context={microeventContext}
                    liveInputs={liveInputs}
                    isSpectator={microeventContext.casterPlayerId !== myPlayerId}
                    onComplete={(result) => {
                        const socket = getSocket();
                        if (socket) socket.emit('game:microevent:result', { gameId: activeGameId, ...result });
                    }}
                    onInput={(payload) => {
                        const socket = getSocket();
                        if (socket) socket.emit('game:microevent:input', { gameId: activeGameId, ...payload });
                        setLiveInputs((prev) => [...prev, payload]);
                    }}
                />
            )}

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

                        {/* Tab switcher */}
                        <div className="game-panel-tabs">
                            <button
                                className={`game-panel-tab${briefTab === 'fullBrief' ? ' active' : ''}`}
                                onClick={() => setBriefTab('fullBrief')}
                            >
                                Full Brief
                            </button>
                            <button
                                className={`game-panel-tab${briefTab === 'rules' ? ' active' : ''}`}
                                onClick={() => setBriefTab('rules')}
                            >
                                Rules
                            </button>
                            <button
                                className={`game-panel-tab${briefTab === 'turn' ? ' active' : ''}`}
                                onClick={() => setBriefTab('turn')}
                            >
                                Turn Brief
                            </button>
                        </div>

                        {/* ── Full Brief tab ── */}
                        {briefTab === 'fullBrief' && (
                            <div className="game-panel-section">
                                <div className="game-panel-log-search-row">
                                    <input
                                        className="game-panel-log-search"
                                        type="text"
                                        placeholder="Search log…"
                                        value={briefSearch}
                                        onChange={(e) => setBriefSearch(e.target.value)}
                                        autoFocus
                                    />
                                    {briefSearch && (
                                        <button className="game-panel-log-search-clear" onClick={() => setBriefSearch('')}>✕</button>
                                    )}
                                </div>
                                <ol className="game-panel-log">
                                    {(briefSearch
                                        ? log.filter((entry) => entry.toLowerCase().includes(briefSearch.toLowerCase()))
                                        : log
                                    ).map((entry, i) => (
                                        <li key={i} className="game-panel-log-entry">{entry}</li>
                                    ))}
                                    {briefSearch && log.filter((e) => e.toLowerCase().includes(briefSearch.toLowerCase())).length === 0 && (
                                        <li className="game-panel-log-empty">No entries match "{briefSearch}"</li>
                                    )}
                                </ol>
                            </div>
                        )}

                        {/* ── Rules tab ── */}
                        {briefTab === 'rules' && (
                            <>
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
                            </>
                        )}

                        {/* ── Turn Brief tab ── */}
                        {briefTab === 'turn' && (
                            <div className="game-panel-section">
                                <ol className="game-panel-turn-brief">
                                    <li>
                                        <span className="turn-brief-step">Draw a Card</span>
                                        <p>At the start of your turn you automatically draw one card from your deck into your hand.</p>
                                    </li>
                                    <li>
                                        <span className="turn-brief-step">Play a Battler <em>(optional)</em></span>
                                        <p>Play one card from your hand to deploy a battler to the field. You may only play one card per turn. Newly deployed battlers are <em>Not Ready</em> and cannot act this turn.</p>
                                    </li>
                                    <li>
                                        <span className="turn-brief-step">Act with Your Battlers</span>
                                        <p>Select any of your ready battlers and choose <strong>Attack</strong> or an <strong>Ability</strong>. Each battler can act once per turn. Battlers marked <em>Acted</em> have already used their action.</p>
                                    </li>
                                    <li>
                                        <span className="turn-brief-step">Resolve Combat</span>
                                        <p>Attacks are resolved using <strong>ATK</strong> vs the target's <strong>DEF</strong>. Agility (<strong>AGI</strong>) and Evasion (<strong>EVA</strong>) can cause attacks to miss. Elemental strengths and weaknesses modify damage further.</p>
                                    </li>
                                    <li>
                                        <span className="turn-brief-step">End Your Turn</span>
                                        <p>Press <strong>End Turn</strong> when you're done. All your battlers' actions reset and play passes to your opponent. Battlers that were <em>Not Ready</em> become ready at the start of their controller's next turn.</p>
                                    </li>
                                    <li>
                                        <span className="turn-brief-step">Win Condition</span>
                                        <p>Defeat all enemy battlers in play, <em>or</em> reduce your opponent's HP to 0 to win the game.</p>
                                    </li>
                                </ol>
                            </div>
                        )}
                    </div>
                </div>
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

            {/* ── Messages (DM Panel) ──────────────────────────────────── */}
            {showMessages && <DMPanel anchor="header" />}
        </div>
    );
};

export default CardGame;

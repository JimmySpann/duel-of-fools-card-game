import { useState, useEffect, useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
    fetchSessions,
    createSession,
    joinSession,
    joinSessionById,
    startSession,
    pollSession,
    updateSettings,
    updateTeam,
    addCpu,
    removeCpu,
    leaveSessionLobby,
    deleteSession,
    setActiveSession,
    clearSessionError,
} from '../../features/sessions/sessionsSlice';
import { logout } from '../../features/auth/authSlice';
import { setGameState } from '../card-game/database/cardGameSlice';
import LobbyChat from '../../features/chat/LobbyChat';
import DMPanel from '../../features/chat/DMPanel';
import Profile from '../../features/profile/Profile';
import { markLobbyRead } from '../../features/chat/chatSlice';
import musicManager from '../../features/sound/musicManager';
import './sessions.css';

const POLL_INTERVAL = 3000;
const SLOTS = ['player1', 'player2', 'player3', 'player4', 'player5', 'player6'];
const TEAM_COLORS = { A: '#e74c3c', B: '#3498db', C: '#2ecc71' };

const statusLabel = (status) => {
    if (status === 'waiting') return 'Waiting';
    if (status === 'in-progress') return 'In Progress';
    return 'Finished';
};

const defaultMaxBattlers = (count) => {
    if (count <= 2) return 8;
    if (count <= 4) return 6;
    return 4;
};

// ── Lobby view ─────────────────────────────────────────────────────────────────
const Lobby = ({ session, username, onStart, onLeave, onDelete, onBack, loading, error, dispatch }) => {
    const isHost = session.host.username === username;
    const settings = session.settings || {};
    const teamMode = settings.teamMode || 'ffa';
    const cpuSlots = session.cpuSlots || [];
    const playerCount = session.players.length + cpuSlots.length;
    const unreadLobby = useSelector((s) => s.chat.unreadLobby[session._id] || 0);
    const [showChat, setShowChat] = useState(false);

    // Clear unread count when chat is opened
    useEffect(() => {
        if (showChat) dispatch(markLobbyRead(session._id));
    }, [showChat, dispatch, session._id]);

    const handleSettingChange = (field, value) => {
        dispatch(updateSettings({ sessionId: session._id, settings: { [field]: value } }));
    };

    const handleTeamChange = (slot, team) => {
        dispatch(updateTeam({ sessionId: session._id, slot, team }));
    };

    return (
        <div className="lobby-container">
            <button className="sessions-back-btn" onClick={onBack}>← Back to Sessions</button>
            <h2 className="lobby-title">{session.name}</h2>
            <p className="lobby-code-label">Invite code</p>
            <div className="lobby-code">{session.joinCode}</div>

            {/* Settings — host-only */}
            {isHost && (
                <div className="lobby-settings">
                    <h3 className="lobby-settings-title">Game Settings</h3>
                    <div className="lobby-settings-grid">
                        <label className="lobby-setting-label">
                            Starting HP
                            <input
                                className="lobby-setting-input"
                                type="number"
                                min={1}
                                max={999}
                                defaultValue={settings.startingHp ?? 20}
                                onBlur={(e) => handleSettingChange('startingHp', Number(e.target.value))}
                            />
                        </label>
                        <label className="lobby-setting-label">
                            Max In Play
                            <input
                                className="lobby-setting-input"
                                type="number"
                                min={1}
                                max={20}
                                placeholder={`Auto (${defaultMaxBattlers(playerCount)})`}
                                defaultValue={settings.maxBattlers ?? ''}
                                onBlur={(e) => {
                                    const v = e.target.value.trim();
                                    handleSettingChange('maxBattlers', v === '' ? null : Number(v));
                                }}
                            />
                        </label>
                        <label className="lobby-setting-label">
                            Deck Size
                            <input
                                className="lobby-setting-input"
                                type="number"
                                min={4}
                                max={50}
                                placeholder="All cards"
                                defaultValue={settings.deckSize ?? ''}
                                onBlur={(e) => {
                                    const v = e.target.value.trim();
                                    handleSettingChange('deckSize', v === '' ? null : Number(v));
                                }}
                            />
                        </label>
                        <label className="lobby-setting-label">
                            Mode
                            <select
                                className="lobby-setting-input"
                                value={teamMode}
                                onChange={(e) => handleSettingChange('teamMode', e.target.value)}
                            >
                                <option value="ffa">Free for All</option>
                                <option value="teams">Teams</option>
                            </select>
                        </label>
                        <label className="lobby-setting-label">
                            Turn Time Limit
                            <select
                                className="lobby-setting-input"
                                value={settings.turnTimeLimit ?? 86400}
                                onChange={(e) => handleSettingChange('turnTimeLimit', e.target.value === 'null' ? null : Number(e.target.value))}
                            >
                                <option value="null">No Limit</option>
                                <option value={3600}>1 Hour</option>
                                <option value={21600}>6 Hours</option>
                                <option value={43200}>12 Hours</option>
                                <option value={86400}>24 Hours</option>
                            </select>
                        </label>
                    </div>
                </div>
            )}

            {/* Player slots */}
            <div className="lobby-slots">
                {SLOTS.map((slot, i) => {
                    const player = session.players.find((p) => p.slot === slot);
                    const cpu = cpuSlots.find((c) => c.slot === slot);
                    const slotNum = i + 1;
                    const isCpu = !!cpu;
                    const isFilled = !!player || isCpu;
                    return (
                        <div key={slot} className={`lobby-slot ${isFilled ? (isCpu ? 'cpu' : 'filled') : 'empty'}`}>
                            <span className="lobby-slot-label">Player {slotNum}</span>
                            <span className="lobby-slot-name">
                                {isCpu ? `🤖 ${cpu.name}` : player ? player.username : 'Open'}
                            </span>
                            {isCpu && isHost && (
                                <button
                                    className="lobby-slot-remove-cpu"
                                    onClick={() => dispatch(removeCpu({ sessionId: session._id, slot }))}
                                    title="Remove CPU"
                                >✕</button>
                            )}
                            {teamMode === 'teams' && player && (
                                isHost ? (
                                    <select
                                        className="lobby-team-select"
                                        value={player.team || ''}
                                        onChange={(e) => handleTeamChange(slot, e.target.value || null)}
                                        style={{ borderColor: player.team ? TEAM_COLORS[player.team] : undefined }}
                                    >
                                        <option value="">No Team</option>
                                        <option value="A">Team A</option>
                                        <option value="B">Team B</option>
                                        <option value="C">Team C</option>
                                    </select>
                                ) : (
                                    <span
                                        className="lobby-team-badge"
                                        style={{ background: player.team ? TEAM_COLORS[player.team] : '#555' }}
                                    >
                                        {player.team ? `Team ${player.team}` : '—'}
                                    </span>
                                )
                            )}
                        </div>
                    );
                })}
            </div>

            {!isHost && (
                <div className="lobby-settings lobby-settings--readonly">
                    <span>HP: {settings.startingHp ?? 20}</span>
                    <span>Max In Play: {settings.maxBattlers ?? `Auto (${defaultMaxBattlers(playerCount)})`}</span>
                    <span>Deck: {settings.deckSize ?? 'All'}</span>
                    <span>Mode: {teamMode === 'teams' ? 'Teams' : 'Free for All'}</span>
                    <span>Turn Limit: {settings.turnTimeLimit ? (() => { const h = Math.floor(settings.turnTimeLimit / 3600); const m = Math.floor((settings.turnTimeLimit % 3600) / 60); return h > 0 ? `${h}h` : `${m}m`; })() : 'None'}</span>
                </div>
            )}

            {error && <p className="sessions-error">{error}</p>}

            {isHost ? (
                <div className="lobby-actions">
                    <button
                        className="lobby-add-cpu-btn"
                        onClick={() => dispatch(addCpu({ sessionId: session._id }))}
                        disabled={playerCount >= 6 || loading}
                        title="Add a CPU opponent"
                    >
                        🤖 Add CPU
                    </button>
                    <button
                        className="lobby-start-btn"
                        onClick={onStart}
                        disabled={playerCount < 2 || loading}
                    >
                        {loading ? 'Starting…' : playerCount < 2 ? 'Need at least 2 players…' : 'Start Game'}
                    </button>
                    <button className="lobby-delete-btn" onClick={onDelete} disabled={loading}>
                        Delete Session
                    </button>
                </div>
            ) : (
                <div className="lobby-actions">
                    <p className="lobby-waiting-msg">Waiting for the host to start the game…</p>
                    <button className="lobby-leave-btn" onClick={onLeave} disabled={loading}>
                        Leave Session
                    </button>
                </div>
            )}

            <button
                className={`lobby-chat-btn${showChat ? ' lobby-chat-btn--active' : ''}${(!showChat && unreadLobby > 0) ? ' lobby-chat-btn--unread' : ''}`}
                onClick={() => setShowChat((v) => !v)}
            >
                💬 Chat{!showChat && unreadLobby > 0 && <span className="lobby-chat-badge">{unreadLobby}</span>}
            </button>
            {showChat && <LobbyChat sessionId={session._id} isWatching={true} />}
        </div>
    );
};

// ── Turn countdown helper ──────────────────────────────────────────────────────
const useTurnCountdown = (turnStartedAt, turnTimeLimit) => {
    const [timeLeft, setTimeLeft] = useState(null);
    useEffect(() => {
        if (!turnTimeLimit || !turnStartedAt) { setTimeLeft(null); return; }
        const calc = () => turnTimeLimit * 1000 - (Date.now() - new Date(turnStartedAt).getTime());
        setTimeLeft(calc());
        const id = setInterval(() => { const r = calc(); setTimeLeft(r); if (r <= 0) clearInterval(id); }, 1000);
        return () => clearInterval(id);
    }, [turnTimeLimit, turnStartedAt]);
    return timeLeft;
};

const fmtCountdown = (ms) => {
    if (ms === null || ms <= 0) return null;
    const totalSec = Math.ceil(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
    if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
    return `${s}s`;
};

const SessionCard = ({ session, isParticipant, openSlots, isMyTurn, currentTurnName, sessionUnread, onEnter, onPreview, dispatch }) => {
    const timeLeft = useTurnCountdown(session.turnStartedAt, session.settings?.turnTimeLimit);
    const countdown = fmtCountdown(timeLeft);
    const urgent = timeLeft !== null && timeLeft > 0 && timeLeft <= 300000; // last 5 min
    return (
        <div className={`session-card ${session.status}${sessionUnread > 0 ? ' session-card--unread-chat' : ''}`}>
            <div className="session-card-info">
                <span className="session-card-name">{session.name}</span>
                <span className={`session-card-status ${session.status}`}>{statusLabel(session.status)}</span>
                {isMyTurn && <span className="session-card-your-turn">⚔ Your Turn!</span>}
                {!isMyTurn && currentTurnName && (
                    <span className="session-card-their-turn">🎲 {currentTurnName}'s Turn</span>
                )}
                {countdown && (
                    <span className={`session-card-countdown${urgent ? ' session-card-countdown--urgent' : ''}`}>
                        ⏱ {countdown}
                    </span>
                )}
                {sessionUnread > 0 && (
                    <span className="session-card-chat-badge">💬 {sessionUnread}</span>
                )}
            </div>
            <div className="session-card-players">
                {session.players.map((p) => (
                    <span key={p.slot} className="session-card-player">{p.username}</span>
                ))}
                {openSlots > 0 && session.status === 'waiting' && (
                    <span className="session-card-player empty">{openSlots} open</span>
                )}
            </div>
            {session.status === 'waiting' && (
                <div className="session-card-code">Code: <strong>{session.joinCode}</strong></div>
            )}
            <button
                className="session-card-btn"
                onClick={() => {
                    if (isParticipant || session.status !== 'waiting') {
                        onEnter(session);
                    } else {
                        onPreview(session);
                    }
                }}
            >
                {isParticipant
                    ? session.status === 'in-progress' ? 'Rejoin' : 'Open Lobby'
                    : session.status === 'waiting' ? 'Join' : 'View'}
            </button>
        </div>
    );
};

// ── Sessions list view ─────────────────────────────────────────────────────────
const Sessions = () => {
    const dispatch = useDispatch();
    const { list, activeSession, loading, error } = useSelector((s) => s.sessions);
    const { username } = useSelector((s) => s.auth);
    const { displayName, avatarUrl, friendRequests } = useSelector((s) => s.profile);
    const unreadLobby = useSelector((s) => s.chat.unreadLobby);

    const [view, setView] = useState('list'); // 'list' | 'create' | 'join' | 'preview' | 'lobby'
    const [newName, setNewName] = useState('');
    const [joinCode, setJoinCode] = useState('');
    const [previewSession, setPreviewSession] = useState(null);
    const [showProfile, setShowProfile] = useState(false);

    useEffect(() => {
        dispatch(fetchSessions());
        // Resume background music when entering the lobbies screen
        if (musicManager.getState().enabled) musicManager.play();
    }, [dispatch]);

    // Poll active session in lobby
    useEffect(() => {
        if (view !== 'lobby' || !activeSession) return;
        const id = setInterval(() => {
            dispatch(pollSession({ sessionId: activeSession._id }));
        }, POLL_INTERVAL);
        return () => clearInterval(id);
    }, [view, activeSession, dispatch]);

    const handleCreate = useCallback(
        (e) => {
            e.preventDefault();
            if (!newName.trim()) return;
            dispatch(createSession({ name: newName.trim() })).then((res) => {
                if (!res.error) setView('lobby');
            });
        },
        [dispatch, newName]
    );

    const handleJoin = useCallback(
        (e) => {
            e.preventDefault();
            if (!joinCode.trim()) return;
            dispatch(joinSession({ joinCode: joinCode.trim() })).then((res) => {
                if (!res.error) setView('lobby');
            });
        },
        [dispatch, joinCode]
    );

    const handleEnterSession = useCallback(
        (session) => {
            dispatch(setActiveSession(session));
            setView('lobby');
        },
        [dispatch]
    );

    const handleJoinDirectly = useCallback(
        (session) => {
            dispatch(joinSessionById({ sessionId: session._id })).then((res) => {
                if (!res.error) setView('lobby');
            });
        },
        [dispatch]
    );

    const handleBack = useCallback(() => {
        setView('list');
        setNewName('');
        setJoinCode('');
        setPreviewSession(null);
        dispatch(clearSessionError());
        dispatch(fetchSessions());
    }, [dispatch]);

    // ── Session preview (confirm before join) ───────────────────────────────────
    if (view === 'preview' && previewSession) {
        const ps = previewSession;
        const psSettings = ps.settings || {};
        const psPlayerCount = ps.players.length;
        return (
            <div className="sessions-backdrop">
                <div className="sessions-card">
                    <button className="sessions-back-btn" onClick={handleBack}>← Back</button>
                    <div className="sessions-card-logo-wrap"><img src="/img/Logo.png" alt="Duel of Fools" className="sessions-card-logo" /></div>
                    <h2 className="sessions-card-title">{ps.name}</h2>
                    <p className="lobby-code-label">Invite code</p>
                    <div className="lobby-code">{ps.joinCode}</div>
                    <div className="preview-settings">
                        <span>HP: {psSettings.startingHp ?? 20}</span>
                        <span>Max In Play: {psSettings.maxBattlers ?? `Auto (${defaultMaxBattlers(psPlayerCount)})`}</span>
                        <span>Deck: {psSettings.deckSize ?? 'All'}</span>
                        <span>Mode: {(psSettings.teamMode === 'teams') ? 'Teams' : 'FFA'}</span>
                        <span>Turn Limit: {psSettings.turnTimeLimit ? (() => { const h = Math.floor(psSettings.turnTimeLimit / 3600); const m = Math.floor((psSettings.turnTimeLimit % 3600) / 60); return h > 0 ? `${h}h` : `${m}m`; })() : 'None'}</span>
                    </div>
                    <div className="lobby-slots" style={{ marginTop: '1.5rem' }}>
                        {SLOTS.map((slot, i) => {
                            const player = ps.players.find((p) => p.slot === slot);
                            return (
                                <div key={slot} className={`lobby-slot ${player ? 'filled' : 'empty'}`}>
                                    <span className="lobby-slot-label">Player {i + 1}</span>
                                    <span className="lobby-slot-name">{player ? player.username : 'Open'}</span>
                                </div>
                            );
                        })}
                    </div>
                    {error && <p className="sessions-error" style={{ marginTop: '0.75rem' }}>{error}</p>}
                    <div className="preview-actions">
                        <button
                            className="sessions-submit"
                            disabled={loading}
                            onClick={() => {
                                dispatch(joinSessionById({ sessionId: ps._id })).then((res) => {
                                    if (!res.error) setView('lobby');
                                });
                            }}
                        >
                            {loading ? 'Joining…' : 'Join Session'}
                        </button>
                    </div>
                </div>
                <DMPanel />
            </div>
        );
    }

    // ── Lobby ────────────────────────────────────────────────────────────────────
    if (view === 'lobby' && activeSession) {
        return (
            <div className="sessions-backdrop">
                <Lobby
                    session={activeSession}
                    username={username}
                    loading={loading}
                    error={error}
                    onBack={handleBack}
                    onStart={() => {
                        dispatch(startSession({ sessionId: activeSession._id })).then((res) => {
                            if (res.payload?.state) dispatch(setGameState(res.payload.state));
                        });
                    }}
                    onLeave={() => {
                        dispatch(leaveSessionLobby({ sessionId: activeSession._id })).then((res) => {
                            if (!res.error) handleBack();
                        });
                    }}
                    onDelete={() => {
                        dispatch(deleteSession({ sessionId: activeSession._id })).then((res) => {
                            if (!res.error) handleBack();
                        });
                    }}
                    dispatch={dispatch}
                />
                <DMPanel />
            </div>
        );
    }

    // ── Create form ──────────────────────────────────────────────────────────────
    if (view === 'create') {
        return (
            <div className="sessions-backdrop">
                <div className="sessions-card">
                    <button className="sessions-back-btn" onClick={handleBack}>← Back</button>
                    <div className="sessions-card-logo-wrap"><img src="/img/Logo.png" alt="Duel of Fools" className="sessions-card-logo" /></div>
                    <h2 className="sessions-card-title">New Session</h2>
                    <form className="sessions-form" onSubmit={handleCreate}>
                        <label className="sessions-label">
                            Session Name
                            <input
                                className="sessions-input"
                                type="text"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                maxLength={40}
                                required
                                autoFocus
                            />
                        </label>
                        {error && <p className="sessions-error">{error}</p>}
                        <button className="sessions-submit" type="submit" disabled={loading}>
                            {loading ? 'Creating…' : 'Create Session'}
                        </button>
                    </form>
                </div>
                <DMPanel />
            </div>
        );
    }

    // ── Join form ────────────────────────────────────────────────────────────────
    if (view === 'join') {
        return (
            <div className="sessions-backdrop">
                <div className="sessions-card">
                    <button className="sessions-back-btn" onClick={handleBack}>← Back</button>
                    <div className="sessions-card-logo-wrap"><img src="/img/Logo.png" alt="Duel of Fools" className="sessions-card-logo" /></div>
                    <h2 className="sessions-card-title">Join a Session</h2>
                    <form className="sessions-form" onSubmit={handleJoin}>
                        <label className="sessions-label">
                            6-Character Code
                            <input
                                className="sessions-input sessions-input--code"
                                type="text"
                                value={joinCode}
                                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                                maxLength={6}
                                required
                                autoFocus
                                placeholder="e.g. XF92K1"
                            />
                        </label>
                        {error && <p className="sessions-error">{error}</p>}
                        <button className="sessions-submit" type="submit" disabled={loading}>
                            {loading ? 'Joining…' : 'Join Session'}
                        </button>
                    </form>
                </div>
                <DMPanel />
            </div>
        );
    }

    // ── Main list ────────────────────────────────────────────────────────────────
    return (
        <div className="sessions-backdrop">
            <div className="sessions-page">
                <header className="sessions-header">
                    <img src="/img/Logo.png" alt="Duel of Fools" className="sessions-logo" />
                    <div className="sessions-header-right">
                        <DMPanel anchor="header" />
                        <button className="sessions-profile-btn" onClick={() => setShowProfile(true)}>
                            <img
                                className="sessions-profile-avatar"
                                src={avatarUrl || `https://i.pravatar.cc/40?u=${username}`}
                                alt="avatar"
                                onError={(e) => { e.target.src = `https://i.pravatar.cc/40?u=${username}`; }}
                            />
                            <span className="sessions-username">{displayName || username}</span>
                            {friendRequests.length > 0 && (
                                <span className="sessions-profile-badge">{friendRequests.length}</span>
                            )}
                        </button>
                        <button className="sessions-logout-btn" onClick={() => dispatch(logout())}>
                            Log Out
                        </button>
                    </div>
                </header>

                <div className="sessions-actions">
                    <button className="sessions-action-btn primary" onClick={() => { dispatch(clearSessionError()); setView('create'); }}>
                        + New Session
                    </button>
                    <button className="sessions-action-btn" onClick={() => { dispatch(clearSessionError()); setView('join'); }}>
                        Join by Code
                    </button>
                </div>

                {error && <p className="sessions-error sessions-error--center">{error}</p>}

                <section className="sessions-list-section">
                    <h2 className="sessions-list-heading">Sessions</h2>
                    {loading && list.length === 0 && <p className="sessions-empty">Loading…</p>}
                    {!loading && list.length === 0 && (
                        <p className="sessions-empty">No sessions yet. Create one or join with a code!</p>
                    )}
                    <div className="sessions-list">
                        {list.map((session) => {
                            const isParticipant = session.players.some((p) => p.username === username);
                            const openSlots = 6 - session.players.length;
                            const mySlot = session.players.find((p) => p.username === username)?.slot;
                            const isMyTurn = session.status === 'in-progress' && mySlot != null && session.currentTurn === mySlot;
                            const currentTurnName = session.status === 'in-progress'
                                ? session.players.find((p) => p.slot === session.currentTurn)?.username
                                : null;
                            const sessionUnread = unreadLobby[session._id] || 0;
                            return (
                                <SessionCard
                                    key={session._id}
                                    session={session}
                                    isParticipant={isParticipant}
                                    openSlots={openSlots}
                                    isMyTurn={isMyTurn}
                                    currentTurnName={currentTurnName}
                                    sessionUnread={sessionUnread}
                                    onEnter={handleEnterSession}
                                    onPreview={(s) => { dispatch(clearSessionError()); setPreviewSession(s); setView('preview'); }}
                                    dispatch={dispatch}
                                />
                            );
                        })}
                    </div>
                </section>
            </div>
            {showProfile && <Profile onClose={() => setShowProfile(false)} />}
        </div>
    );
};

export default Sessions;


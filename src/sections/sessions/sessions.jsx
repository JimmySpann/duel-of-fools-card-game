import { useState, useEffect, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
    fetchSessions,
    createSession,
    joinSession,
    startSession,
    pollSession,
    updateSettings,
    updateTeam,
    setActiveSession,
    clearSessionError,
} from '../../features/sessions/sessionsSlice';
import { logout } from '../../features/auth/authSlice';
import LobbyChat from '../../features/chat/LobbyChat';
import DMPanel from '../../features/chat/DMPanel';
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
const Lobby = ({ session, username, onStart, onBack, loading, error, dispatch }) => {
    const isHost = session.host.username === username;
    const settings = session.settings || {};
    const teamMode = settings.teamMode || 'ffa';
    const playerCount = session.players.length;

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
                            Max Battlers
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
                    </div>
                </div>
            )}

            {/* Player slots */}
            <div className="lobby-slots">
                {SLOTS.map((slot, i) => {
                    const player = session.players.find((p) => p.slot === slot);
                    const slotNum = i + 1;
                    return (
                        <div key={slot} className={`lobby-slot ${player ? 'filled' : 'empty'}`}>
                            <span className="lobby-slot-label">Player {slotNum}</span>
                            <span className="lobby-slot-name">{player ? player.username : 'Open'}</span>
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
                    <span>Max Battlers: {settings.maxBattlers ?? `Auto (${defaultMaxBattlers(playerCount)})`}</span>
                    <span>Mode: {teamMode === 'teams' ? 'Teams' : 'Free for All'}</span>
                </div>
            )}

            {error && <p className="sessions-error">{error}</p>}

            {isHost ? (
                <button
                    className="lobby-start-btn"
                    onClick={onStart}
                    disabled={playerCount < 2 || loading}
                >
                    {loading ? 'Starting…' : playerCount < 2 ? 'Need at least 2 players…' : 'Start Game'}
                </button>
            ) : (
                <p className="lobby-waiting-msg">Waiting for the host to start the game…</p>
            )}

            <LobbyChat sessionId={session._id} />
        </div>
    );
};

// ── Sessions list view ─────────────────────────────────────────────────────────
const Sessions = () => {
    const dispatch = useDispatch();
    const { list, activeSession, loading, error } = useSelector((s) => s.sessions);
    const { username } = useSelector((s) => s.auth);

    const [view, setView] = useState('list'); // 'list' | 'create' | 'join' | 'lobby'
    const [newName, setNewName] = useState('');
    const [joinCode, setJoinCode] = useState('');

    useEffect(() => {
        dispatch(fetchSessions());
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

    const handleBack = useCallback(() => {
        setView('list');
        setNewName('');
        setJoinCode('');
        dispatch(clearSessionError());
        dispatch(fetchSessions());
    }, [dispatch]);

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
                    onStart={() => dispatch(startSession({ sessionId: activeSession._id }))}
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
                    <h1 className="sessions-title">Card Game</h1>
                    <div className="sessions-header-right">
                        <span className="sessions-username">{username}</span>
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
                            return (
                                <div key={session._id} className={`session-card ${session.status}`}>
                                    <div className="session-card-info">
                                        <span className="session-card-name">{session.name}</span>
                                        <span className={`session-card-status ${session.status}`}>{statusLabel(session.status)}</span>
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
                                        onClick={() => handleEnterSession(session)}
                                    >
                                        {isParticipant
                                            ? session.status === 'in-progress' ? 'Rejoin' : 'Open Lobby'
                                            : 'View Lobby'}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </section>
            </div>
            <DMPanel />
        </div>
    );
};

export default Sessions;


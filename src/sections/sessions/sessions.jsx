import { useState, useEffect, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
    fetchSessions,
    createSession,
    joinSession,
    startSession,
    pollSession,
    setActiveSession,
    clearSessionError,
} from '../../features/sessions/sessionsSlice';
import { logout } from '../../features/auth/authSlice';
import './sessions.css';

const POLL_INTERVAL = 3000;

const statusLabel = (status) => {
    if (status === 'waiting') return 'Waiting';
    if (status === 'in-progress') return 'In Progress';
    return 'Finished';
};

// ── Lobby view (waiting room once you've joined a session) ────────────────────
const Lobby = ({ session, username, onStart, onBack, loading, error }) => {
    const isHost = session.host.username === username;
    const p1 = session.players.find((p) => p.slot === 'player1');
    const p2 = session.players.find((p) => p.slot === 'player2');

    return (
        <div className="lobby-container">
            <button className="sessions-back-btn" onClick={onBack}>← Back to Sessions</button>
            <h2 className="lobby-title">{session.name}</h2>
            <p className="lobby-code-label">Share this code with your opponent</p>
            <div className="lobby-code">{session.joinCode}</div>

            <div className="lobby-slots">
                <div className={`lobby-slot ${p1 ? 'filled' : 'empty'}`}>
                    <span className="lobby-slot-label">Player 1</span>
                    <span className="lobby-slot-name">{p1 ? p1.username : 'Waiting…'}</span>
                </div>
                <div className={`lobby-slot ${p2 ? 'filled' : 'empty'}`}>
                    <span className="lobby-slot-label">Player 2</span>
                    <span className="lobby-slot-name">{p2 ? p2.username : 'Waiting…'}</span>
                </div>
            </div>

            {error && <p className="sessions-error">{error}</p>}

            {isHost ? (
                <button
                    className="lobby-start-btn"
                    onClick={onStart}
                    disabled={session.players.length < 2 || loading}
                >
                    {loading ? 'Starting…' : session.players.length < 2 ? 'Waiting for Player 2…' : 'Start Game'}
                </button>
            ) : (
                <p className="lobby-waiting-msg">Waiting for the host to start the game…</p>
            )}
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

    // Poll the active session while in lobby so both players see updates
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

    // ── Lobby view ───────────────────────────────────────────────────────────────
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
                />
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
                                        {session.players.length < 2 && (
                                            <span className="session-card-player empty">Open slot</span>
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
        </div>
    );
};

export default Sessions;

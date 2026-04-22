import { useState, useEffect, useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { authHeader } from '../../utils/api';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    fetchSessions,
    createSession,
    updateSessionVisibility,
    joinSession,
    joinSessionById,
    startSession,
    updateSettings,
    updateTeam,
    addCpu,
    removeCpu,
    setCpuDeck,
    setCpuSkill,
    setCpuTeam,
    leaveSession,
    leaveSessionLobby,
    deleteSession,
    submitDeck,
    setActiveSession,
    clearSessionError,
} from '../../features/sessions/sessionsSlice';
import { logout } from '../../features/auth/authSlice';
import { setGameState } from '../card-game/database/cardGameSlice';
import { TEAM_CONFIG } from '../../shared/teamConfig';
import LobbyChat from '../../features/chat/LobbyChat';
import DMPanel from '../../features/chat/DMPanel';
import Profile from '../../features/profile/Profile';
import GalleryModal from './GalleryModal';
import DeckBuilderModal from './DeckBuilderModal';
import CustomCardModal from './CustomCardModal';
import RulesModal from '../shared/rules/RulesModal';
import Header from '../card-game/components/header/header.jsx';
import { markLobbyRead } from '../../features/chat/chatSlice';
import { getSocket } from '../../features/chat/socket';
import './sessions.css';
import Welcome from './Welcome.jsx';

const POLL_INTERVAL = 3000;
const SLOTS = ['player1', 'player2', 'player3', 'player4', 'player5', 'player6'];
const CPU_SKILL_LABELS = ['', 'Easy', 'Normal', 'Hard', 'Very Hard', 'Insane'];

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

const inviteLinkFromCode = (joinCode) => `${window.location.origin}/?join=${encodeURIComponent(joinCode || '')}`;

// ── Lobby view ─────────────────────────────────────────────────────────────────
export const Lobby = ({ session, username, onStart, onLeave, onDelete, onBack, loading, error, dispatch }) => {
    const isHost = session.host.username === username;
    const isPublic = session.isPublic !== false;
    const settings = session.settings || {};
    const teamMode = settings.teamMode || 'ffa';
    const cpuSlots = session.cpuSlots || [];
    const playerCount = session.players.length + cpuSlots.length;
    const inviteLink = inviteLinkFromCode(session.joinCode);
    const unreadLobby = useSelector((s) => s.chat.unreadLobby[session._id] || 0);
    const unreadDm = useSelector((s) => s.chat.unreadDm);
    const { displayName, avatarUrl } = useSelector((s) => s.profile);
    const token = useSelector((s) => s.auth.token);
    const [showChat, setShowChat] = useState(false);
    const [showDeckBuilder, setShowDeckBuilder] = useState(false);
    const [deckPreset, setDeckPreset] = useState(null); // preset to auto-load when modal opens
    const [cpuDeckSlot, setCpuDeckSlot] = useState(null); // slot string when editing a CPU deck
    const [cpuDeckPreset, setCpuDeckPreset] = useState(null); // preset for cpu deck modal
    const [savedDecks, setSavedDecks] = useState([]); // [{ name, cardIds }]
    const [inviteUsername, setInviteUsername] = useState('');
    const [inviteFeedback, setInviteFeedback] = useState('');
    const [inviteFeedbackType, setInviteFeedbackType] = useState('');
    const [showProfile, setShowProfile] = useState(false);
    const [showMessages, setShowMessages] = useState(false);
    const hasUnreadMessages = Object.values(unreadDm).some((v) => v > 0);

    // My player entry (null for observers)
    const myPlayer = session.players.find((p) => p.username === username);
    const myDeckStatus = myPlayer?.deckStatus || 'preparation';

    // All human players must be 'ready' before host can start
    const allReady = session.players.every((p) => p.deckStatus === 'ready');

    // Fetch saved decks for the deck picker dropdowns
    useEffect(() => {
        if (!token) return;
        let mounted = true;
        fetch('/api/decks', { headers: authHeader(token, false) })
            .then((r) => r.json())
            .then((data) => { if (mounted && Array.isArray(data.decks)) setSavedDecks(data.decks); })
            .catch(() => { });
        return () => { mounted = false; };
    }, [token]);

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

    const handleDeckConfirm = (deck) => {
        dispatch(submitDeck({ sessionId: session._id, deck })).then((res) => {
            if (!res.error) setShowDeckBuilder(false);
        });
    };

    const handleCpuDeckConfirm = (deck) => {
        dispatch(setCpuDeck({ sessionId: session._id, slot: cpuDeckSlot, deck })).then((res) => {
            if (!res.error) { setCpuDeckSlot(null); setCpuDeckPreset(null); }
        });
    };

    // Deck picker select for the current human player
    const handleLobbyDeckSelect = (value) => {
        if (!value) return;
        if (value === '__official' || value === '__dripwarts') {
            setDeckPreset(value);
            setShowDeckBuilder(true);
        } else if (value === '__create') {
            setDeckPreset(null);
            setShowDeckBuilder(true);
        } else {
            const deck = savedDecks.find((d) => d.name === value);
            if (deck) dispatch(submitDeck({ sessionId: session._id, deck: deck.cardIds }));
        }
    };

    // Deck picker select for a CPU slot
    const handleCpuLobbyDeckSelect = (slot, value) => {
        if (!value) return;
        if (value === '__official' || value === '__dripwarts') {
            setCpuDeckPreset(value);
            setCpuDeckSlot(slot);
        } else if (value === '__create') {
            setCpuDeckPreset(null);
            setCpuDeckSlot(slot);
        } else {
            const deck = savedDecks.find((d) => d.name === value);
            if (deck) dispatch(setCpuDeck({ sessionId: session._id, slot, deck: deck.cardIds }));
        }
    };

    const setFeedback = (message, type = 'info') => {
        setInviteFeedback(message);
        setInviteFeedbackType(type);
    };

    const copyToClipboard = async (text, successMessage) => {
        try {
            await navigator.clipboard.writeText(text);
            setFeedback(successMessage, 'success');
        } catch {
            setFeedback('Clipboard unavailable in this browser context.', 'error');
        }
    };

    const handleSendInviteDm = (e) => {
        e.preventDefault();
        const toUsername = inviteUsername.trim();
        if (!toUsername) {
            setFeedback('Enter a username to send an invite.', 'error');
            return;
        }

        const socket = getSocket();
        if (!socket) {
            setFeedback('Chat socket not connected yet. Try again in a moment.', 'error');
            return;
        }

        const msg = `Join my Duel of Fools session "${session.name}"\nInvite link: ${inviteLink}\nJoin code: ${session.joinCode}`;
        socket.emit('dm:message', { toUsername, text: msg });
        setInviteUsername('');
        setFeedback(`Invite sent to ${toUsername}.`, 'success');
    };

    // Find the first empty slot index
    const firstEmptySlotIndex = SLOTS.findIndex((slot) => {
        const player = session.players.find((p) => p.slot === slot);
        const cpu = cpuSlots.find((c) => c.slot === slot);
        return !player && !cpu;
    });

    return (
        <div className="sessions-backdrop">
            <Header
                onLobbies={onBack}
                displayName={displayName}
                avatarUrl={avatarUrl}
                username={username}
                onSignOut={() => dispatch(logout())}
                onProfileOpen={() => setShowProfile(true)}
                onMessagesToggle={setShowMessages}
                hasUnreadMessages={hasUnreadMessages}
            />
            <div className="lobby-container">
                <button className="sessions-back-btn" onClick={onBack}>← Back to Sessions</button>
                <h2 className="lobby-title">{session.name}</h2>
                <p className="lobby-code-label">Invite code</p>
                <div className="lobby-code">{session.joinCode}</div>
                <div className="lobby-visibility-row">
                    <span className={`lobby-visibility-chip ${isPublic ? 'public' : 'private'}`}>
                        {isPublic ? '🌐 Public Session' : '🔒 Private Session'}
                    </span>
                    {isHost && (
                        <button
                            className="lobby-visibility-toggle-btn"
                            onClick={() => dispatch(updateSessionVisibility({ sessionId: session._id, isPublic: !isPublic }))}
                            disabled={loading || session.status !== 'waiting'}
                        >
                            Make {isPublic ? 'Private' : 'Public'}
                        </button>
                    )}
                </div>
                <div className="lobby-invite-tools">
                    <button
                        className="lobby-invite-tool-btn"
                        type="button"
                        onClick={() => copyToClipboard(inviteLink, 'Invite link copied.')}
                    >
                        🔗 Copy Invite Link
                    </button>
                    <button
                        className="lobby-invite-tool-btn"
                        type="button"
                        onClick={() => copyToClipboard(session.joinCode, 'Join code copied.')}
                    >
                        📋 Copy Join Code
                    </button>
                </div>
                <form className="lobby-invite-dm-form" onSubmit={handleSendInviteDm}>
                    <label className="lobby-invite-dm-label" htmlFor="invite-username">
                        Send invite in messages
                    </label>
                    <div className="lobby-invite-dm-row">
                        <input
                            id="invite-username"
                            className="lobby-invite-dm-input"
                            type="text"
                            placeholder="Username..."
                            value={inviteUsername}
                            onChange={(e) => setInviteUsername(e.target.value)}
                            maxLength={40}
                        />
                        <button className="lobby-invite-dm-send" type="submit">Send Invite</button>
                    </div>
                    {inviteFeedback && (
                        <p className={`lobby-invite-feedback ${inviteFeedbackType}`}>{inviteFeedback}</p>
                    )}
                </form>

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
                            <label className="lobby-setting-label">
                                Minigame Difficulty
                                <select
                                    className="lobby-setting-input"
                                    value={settings.microgameDifficulty ?? 1}
                                    onChange={(e) => handleSettingChange('microgameDifficulty', Number(e.target.value))}
                                >
                                    <option value={1}>Easy</option>
                                    <option value={2}>Normal</option>
                                    <option value={3}>Hard</option>
                                    <option value={4}>Expert</option>
                                    <option value={5}>Brutal</option>
                                </select>
                            </label>
                            <label className="lobby-setting-label">
                                Verified Cards Only
                                <select
                                    className="lobby-setting-input"
                                    value={settings.verifiedCardsOnly ? 'on' : 'off'}
                                    onChange={(e) => handleSettingChange('verifiedCardsOnly', e.target.value === 'on')}
                                >
                                    <option value="off">Any Card</option>
                                    <option value="on">Verified Only</option>
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
                        const isMe = player?.username === username;
                        const isEmpty = !isFilled;
                        return (
                            <div key={slot} className={`lobby-slot ${isFilled ? (isCpu ? 'cpu' : 'filled') : 'empty'}`}>
                                <span className="lobby-slot-label">Player {slotNum}</span>
                                <span className="lobby-slot-name">
                                    {isCpu ? `🤖 ${cpu.name}` : player ? player.username : 'Open'}
                                </span>
                                {/* Deck status badge for human players */}
                                {player && !isCpu && (
                                    <span className={`lobby-slot-status${player.deckStatus === 'ready' ? ' ready' : ' prep'}`}>
                                        {player.deckStatus === 'ready' ? '✓ Ready' : '⏳ Preparation'}
                                    </span>
                                )}
                                {/* Deck picker for the current user */}
                                {isMe && (
                                    <select
                                        className="lobby-deck-select"
                                        value=""
                                        onChange={(e) => { handleLobbyDeckSelect(e.target.value); e.target.value = ''; }}
                                        disabled={loading}
                                    >
                                        <option value="">🃏 {myDeckStatus === 'ready' ? 'Change Deck…' : 'Pick a Deck…'}</option>
                                        <optgroup label="Official Presets">
                                            <option value="__official">Official Default</option>
                                            <option value="__dripwarts">Dripwarts</option>
                                        </optgroup>
                                        {savedDecks.length > 0 && (
                                            <optgroup label="My Decks">
                                                {savedDecks.map((d) => (
                                                    <option key={d.name} value={d.name}>{d.name}</option>
                                                ))}
                                            </optgroup>
                                        )}
                                        <option value="__create">＋ Create a Deck</option>
                                    </select>
                                )}
                                {isCpu && isHost && (
                                    <div className="lobby-cpu-actions">
                                        <span className={`lobby-slot-status${cpu.selectedDeck?.length >= 3 ? ' ready' : ' prep'}`}>
                                            {cpu.selectedDeck?.length >= 3 ? `✓ ${cpu.selectedDeck.length} cards` : '⏳ Random deck'}
                                        </span>
                                        <select
                                            className="lobby-deck-select"
                                            value=""
                                            onChange={(e) => { handleCpuLobbyDeckSelect(slot, e.target.value); e.target.value = ''; }}
                                            disabled={loading}
                                        >
                                            <option value="">🃏 {cpu.selectedDeck?.length >= 3 ? 'Change Deck…' : 'Set Deck…'}</option>
                                            <optgroup label="Official Presets">
                                                <option value="__official">Official Default</option>
                                                <option value="__dripwarts">Dripwarts</option>
                                            </optgroup>
                                            {savedDecks.length > 0 && (
                                                <optgroup label="My Decks">
                                                    {savedDecks.map((d) => (
                                                        <option key={d.name} value={d.name}>{d.name}</option>
                                                    ))}
                                                </optgroup>
                                            )}
                                            <option value="__create">＋ Create a Deck</option>
                                        </select>
                                        <div className="lobby-cpu-skill">
                                            <span className="lobby-cpu-skill-label">{CPU_SKILL_LABELS[cpu.cpuSkill ?? 2]}</span>
                                            <input
                                                type="range"
                                                min="1"
                                                max="5"
                                                value={cpu.cpuSkill ?? 2}
                                                onChange={(e) => dispatch(setCpuSkill({ sessionId: session._id, slot, cpuSkill: Number(e.target.value) }))}
                                                className="lobby-cpu-skill-slider"
                                                title="CPU difficulty"
                                            />
                                        </div>
                                        <button
                                            className="lobby-slot-remove-cpu"
                                            onClick={() => dispatch(removeCpu({ sessionId: session._id, slot }))}
                                            title="Remove CPU"
                                        >✕</button>
                                        {teamMode === 'teams' && (
                                            <select
                                                className="lobby-team-select"
                                                value={cpu.team || ''}
                                                onChange={(e) => dispatch(setCpuTeam({ sessionId: session._id, slot, team: e.target.value || null }))}
                                                style={{ borderColor: cpu.team ? TEAM_CONFIG[cpu.team].color : undefined }}
                                            >
                                                <option value="">No Team</option>
                                                <option value="A">{TEAM_CONFIG.A.symbol} Team A</option>
                                                <option value="B">{TEAM_CONFIG.B.symbol} Team B</option>
                                                <option value="C">{TEAM_CONFIG.C.symbol} Team C</option>
                                            </select>
                                        )}
                                    </div>
                                )}
                                {/* Add CPU button in the first empty slot if host, not full, and not loading */}
                                {isHost && isEmpty && i === firstEmptySlotIndex && session.players.length + cpuSlots.length < 6 && !loading && (
                                    <button
                                        className="lobby-add-cpu-btn"
                                        onClick={() => dispatch(addCpu({ sessionId: session._id }))}
                                        title="Add a CPU opponent"
                                    >
                                        🤖 Add CPU
                                    </button>
                                )}
                                {teamMode === 'teams' && player && (
                                    isHost ? (
                                        <select
                                            className="lobby-team-select"
                                            value={player.team || ''}
                                            onChange={(e) => handleTeamChange(slot, e.target.value || null)}
                                            style={{ borderColor: player.team ? TEAM_CONFIG[player.team].color : undefined }}
                                        >
                                            <option value="">No Team</option>
                                            <option value="A">{TEAM_CONFIG.A.symbol} Team A</option>
                                            <option value="B">{TEAM_CONFIG.B.symbol} Team B</option>
                                            <option value="C">{TEAM_CONFIG.C.symbol} Team C</option>
                                        </select>
                                    ) : (
                                        <span
                                            className="lobby-team-badge"
                                            style={{ background: player.team ? TEAM_CONFIG[player.team].color : '#555' }}
                                        >
                                            {player.team ? `${TEAM_CONFIG[player.team].symbol} Team ${player.team}` : '—'}
                                        </span>
                                    )
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Deck reminder for players who haven't built their deck */}
                {myPlayer && myDeckStatus !== 'ready' && (
                    <div className="lobby-deck-reminder">
                        <span>🃏 Please build your deck before the game can start</span>
                        <button
                            className="lobby-deck-reminder-btn"
                            onClick={() => setShowDeckBuilder(true)}
                        >
                            Build Deck
                        </button>
                    </div>
                )}

                {!isHost && (
                    <div className="lobby-settings lobby-settings--readonly">
                        <span>HP: {settings.startingHp ?? 20}</span>
                        <span>Max In Play: {settings.maxBattlers ?? `Auto (${defaultMaxBattlers(playerCount)})`}</span>
                        <span>Deck: {settings.deckSize ?? 'All'}</span>
                        <span>Mode: {teamMode === 'teams' ? 'Teams' : 'Free for All'}</span>
                        <span>Turn Limit: {settings.turnTimeLimit ? (() => { const h = Math.floor(settings.turnTimeLimit / 3600); const m = Math.floor((settings.turnTimeLimit % 3600) / 60); return h > 0 ? `${h}h` : `${m}m`; })() : 'None'}</span>
                        <span>Minigames: {['Easy', 'Normal', 'Hard', 'Expert', 'Brutal'][(settings.microgameDifficulty ?? 1) - 1]}</span>
                        <span>Verified Cards: {settings.verifiedCardsOnly ? 'Required' : 'Any'}</span>
                    </div>
                )}

                {error && <p className="sessions-error">{error}</p>}

                {isHost ? (
                    <div className="lobby-actions">
                        <button
                            className="lobby-start-btn"
                            onClick={onStart}
                            disabled={playerCount < 2 || !allReady || loading}
                            title={!allReady ? 'Waiting for all players to build their deck' : undefined}
                        >
                            {loading ? 'Starting…' : playerCount < 2 ? 'Need at least 2 players…' : !allReady ? 'Waiting for players…' : 'Start Game'}
                        </button>
                        <button className="lobby-delete-btn" onClick={onDelete} disabled={loading}>
                            Delete Session
                        </button>
                    </div>
                ) : (
                    <div className="lobby-actions">
                        <p className="lobby-waiting-msg">
                            {myDeckStatus !== 'ready'
                                ? 'Choose your deck to get ready!'
                                : 'Waiting for the host to start the game…'}
                        </p>
                        <button className="lobby-leave-btn" onClick={onLeave} disabled={loading}>
                            Leave Session
                        </button>
                    </div>
                )}

                <button
                    className={`lobby-chat-btn${showChat ? ' lobby-chat-btn--active' : ''}${(!showChat && unreadLobby > 0) ? ' lobby-chat-btn--unread' : ''}`}
                    onClick={() => setShowChat((v) => !v)}
                >
                    💬 Lobby Chat{!showChat && unreadLobby > 0 && <span className="lobby-chat-badge">{unreadLobby}</span>}
                </button>
                {showChat && <LobbyChat sessionId={session._id} isWatching={true} />}

                {/* Deck builder modal — current player */}
                {showDeckBuilder && (
                    <DeckBuilderModal
                        onClose={() => { setShowDeckBuilder(false); setDeckPreset(null); }}
                        onConfirm={handleDeckConfirm}
                        initialDeck={deckPreset ? [] : (myPlayer?.selectedDeck || [])}
                        initialPreset={deckPreset}
                        loading={loading}
                        error={error}
                        verifiedCardsOnly={!!settings.verifiedCardsOnly}
                    />
                )}

                {/* Deck builder modal — CPU slot */}
                {cpuDeckSlot && (
                    <DeckBuilderModal
                        onClose={() => { setCpuDeckSlot(null); setCpuDeckPreset(null); }}
                        onConfirm={handleCpuDeckConfirm}
                        initialDeck={cpuDeckPreset ? [] : (cpuSlots.find((c) => c.slot === cpuDeckSlot)?.selectedDeck || [])}
                        initialPreset={cpuDeckPreset}
                        loading={loading}
                        error={error}
                        verifiedCardsOnly={!!settings.verifiedCardsOnly}
                    />
                )}

            </div>
            {showProfile && <Profile onClose={() => setShowProfile(false)} />}
            <DMPanel open={showMessages} onOpenChange={setShowMessages} hideToggle />
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
                <span className={`session-card-visibility ${(session.isPublic !== false) ? 'public' : 'private'}`}>
                    {(session.isPublic !== false) ? 'Public' : 'Private'}
                </span>
                {session.status === 'finished' && session.winner && (
                    <span className="session-card-winner">🏆 {session.winner}</span>
                )}
                {session.status === 'finished' && !session.winner && (
                    <span className="session-card-finished">Finished</span>
                )}
                {session.status !== 'finished' && isMyTurn && <span className="session-card-your-turn">⚔ Your Turn!</span>}
                {session.status !== 'finished' && !isMyTurn && currentTurnName && (
                    <span className="session-card-their-turn">🎲 {currentTurnName}'s Turn</span>
                )}
                {session.status !== 'finished' && countdown && (
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
                    : 'View'}
            </button>
        </div>
    );
};

// ── Sessions list view ─────────────────────────────────────────────────────────
const Sessions = ({ initialModal } = {}) => {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const location = useLocation();
    const { list, activeSession, loading, error } = useSelector((s) => s.sessions);
    const { username } = useSelector((s) => s.auth);
    const { displayName, avatarUrl } = useSelector((s) => s.profile);
    const unreadLobby = useSelector((s) => s.chat.unreadLobby);
    const unreadDm = useSelector((s) => s.chat.unreadDm);

    const [view, setView] = useState('list'); // 'list' | 'create' | 'join' | 'preview'
    const [lobbyTab, setLobbyTab] = useState('current');
    const [newName, setNewName] = useState('');
    const [newSessionIsPublic, setNewSessionIsPublic] = useState(true);
    const [joinCode, setJoinCode] = useState('');
    const [previewSession, setPreviewSession] = useState(null);
    const [showProfile, setShowProfile] = useState(false);
    const [showMessages, setShowMessages] = useState(false);
    const inviteJoinAttemptedRef = useRef(false);
    const preventAutoJoinNavigateRef = useRef(false);
    const hasUnreadMessages = Object.values(unreadDm).some((v) => v > 0);

    // Derive modal visibility from URL pathname
    const pathname = location.pathname;
    const showGallery = pathname === '/gallery';
    const showDeckBuilder = pathname === '/deck-builder';
    const showCustomCards = pathname === '/card-creator';
    const showRules = pathname === '/rules';

    useEffect(() => {
        dispatch(fetchSessions());
    }, [dispatch]);

    useEffect(() => {
        if (inviteJoinAttemptedRef.current || preventAutoJoinNavigateRef.current) return;
        const url = new URL(window.location.href);
        const join = (url.searchParams.get('join') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
        if (!join) return;

        inviteJoinAttemptedRef.current = true;
        url.searchParams.delete('join');
        window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);

        dispatch(clearSessionError());
        dispatch(joinSession({ joinCode: join })).then((res) => {
            if (!res.error && !preventAutoJoinNavigateRef.current) {
                navigate(`/game/${res.payload._id}`);
            }
        });
    }, [dispatch, navigate]);

    // Poll active session in lobby — handled by GamePage in App.js

    const handleCreate = useCallback(
        (e) => {
            e.preventDefault();
            if (!newName.trim()) return;
            dispatch(createSession({ name: newName.trim(), isPublic: newSessionIsPublic })).then((res) => {
                if (!res.error) navigate(`/game/${res.payload._id}`);
            });
        },
        [dispatch, newName, newSessionIsPublic, navigate]
    );

    const handleJoin = useCallback(
        (e) => {
            e.preventDefault();
            if (!joinCode.trim()) return;
            dispatch(joinSession({ joinCode: joinCode.trim() })).then((res) => {
                if (!res.error) navigate(`/game/${res.payload._id}`);
            });
        },
        [dispatch, joinCode, navigate]
    );

    const handleEnterSession = useCallback(
        (session) => {
            dispatch(setActiveSession(session));
            navigate(`/game/${session._id}`);
        },
        [dispatch, navigate]
    );

    const handleBack = useCallback(() => {
        setView('list');
        setNewName('');
        setNewSessionIsPublic(true);
        setJoinCode('');
        setPreviewSession(null);
        dispatch(clearSessionError());
        dispatch(fetchSessions());
    }, [dispatch]);

    const handleOpenCreate = useCallback(() => {
        preventAutoJoinNavigateRef.current = true;
        dispatch(leaveSession());
        dispatch(clearSessionError());
        setPreviewSession(null);
        setJoinCode('');
        setNewSessionIsPublic(true);
        setNewName(`${username}'s session`);
        setView('create');
    }, [dispatch, username]);

    const handleOpenJoin = useCallback(() => {
        preventAutoJoinNavigateRef.current = true;
        dispatch(leaveSession());
        dispatch(clearSessionError());
        setPreviewSession(null);
        setJoinCode('');
        setView('join');
    }, [dispatch]);

    const renderViewShell = useCallback((content, includeGlobalOverlays = false) => (
        <div className="sessions-backdrop">
            <Header
                onLobbies={handleBack}
                displayName={displayName}
                avatarUrl={avatarUrl}
                username={username}
                onSignOut={() => dispatch(logout())}
                onProfileOpen={() => setShowProfile(true)}
                onMessagesToggle={setShowMessages}
                hasUnreadMessages={hasUnreadMessages}
            />
            {content}
            {showProfile && <Profile onClose={() => setShowProfile(false)} />}
            {includeGlobalOverlays && showRules && <RulesModal onClose={() => navigate('/')} title="Rules Deep Dive" />}
            {includeGlobalOverlays && showGallery && <GalleryModal onClose={() => navigate('/')} />}
            {includeGlobalOverlays && showDeckBuilder && (
                <DeckBuilderModal
                    onClose={() => navigate('/')}
                    onConfirm={() => navigate('/')}
                    initialDeck={[]}
                    loading={false}
                    error={null}
                />
            )}
            {includeGlobalOverlays && showCustomCards && <CustomCardModal onClose={() => navigate('/')} />}
            <DMPanel open={showMessages} onOpenChange={setShowMessages} hideToggle />
        </div>
    ), [
        handleBack,
        displayName,
        avatarUrl,
        username,
        dispatch,
        showProfile,
        showRules,
        showGallery,
        showDeckBuilder,
        showCustomCards,
        showMessages,
        hasUnreadMessages,
        navigate,
    ]);

    const renderFormCard = useCallback((title, body, cardError = null) => (
        <div className="sessions-card">
            <button className="sessions-back-btn" onClick={handleBack}>← Back</button>
            <div className="sessions-card-logo-wrap"><img src="/img/Logo.png" alt="Duel of Fools" className="sessions-card-logo" /></div>
            <h2 className="sessions-card-title">{title}</h2>
            {body}
            {cardError}
        </div>
    ), [handleBack]);

    // ── Session preview (confirm before join) ───────────────────────────────────
    if (view === 'preview' && previewSession) {
        const ps = previewSession;
        const psSettings = ps.settings || {};
        const psPlayerCount = ps.players.length;
        return renderViewShell(
            renderFormCard(
                ps.name,
                <>
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
                            const cpu = (ps.cpuSlots || []).find((c) => c.slot === slot);
                            const isCpu = !!cpu;
                            return (
                                <div key={slot} className={`lobby-slot ${player ? 'filled' : isCpu ? 'cpu' : 'empty'}`}>
                                    <span className="lobby-slot-label">Player {i + 1}</span>
                                    <span className="lobby-slot-name">
                                        {isCpu ? `🤖 ${cpu.name}` : player ? player.username : 'Open'}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                    <div className="preview-actions">
                        <button
                            className="sessions-submit"
                            disabled={loading}
                            onClick={() => {
                                dispatch(joinSessionById({ sessionId: ps._id })).then((res) => {
                                    if (!res.error) navigate(`/game/${ps._id}`);
                                });
                            }}
                        >
                            {loading ? 'Joining…' : 'Join Session'}
                        </button>
                    </div>
                </>,
                error ? <p className="sessions-error" style={{ marginTop: '0.75rem' }}>{error}</p> : null
            )
        );
    }

    // ── Create form ──────────────────────────────────────────────────────────────
    if (view === 'create') {
        return renderViewShell(
            renderFormCard(
                'New Session',
                <form className="sessions-form" onSubmit={handleCreate}>
                    <label className="sessions-label">
                        Session Visibility
                        <select
                            className="sessions-input"
                            value={newSessionIsPublic ? 'public' : 'private'}
                            onChange={(e) => setNewSessionIsPublic(e.target.value === 'public')}
                        >
                            <option value="public">Public (listed in Sessions)</option>
                            <option value="private">Private (hidden; join by code/link)</option>
                        </select>
                    </label>
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
            )
        );
    }

    // ── Join form ────────────────────────────────────────────────────────────────
    if (view === 'join') {
        return renderViewShell(
            renderFormCard(
                'Join a Session',
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
            )
        );
    }

    // ── Main list ────────────────────────────────────────────────────────────────
    return renderViewShell(
        <div className="sessions-page">
            {/* Welcome panel at top of lobbies list */}
            {view === 'list' && <Welcome />}
            <div className="sessions-actions">
                <button className="sessions-action-btn primary" onClick={handleOpenCreate}>
                    + New Session
                </button>
                <button className="sessions-action-btn" onClick={handleOpenJoin}>
                    Join by Code
                </button>
            </div>
            <div className="sessions-secondary-actions">
                <button className="sessions-action-btn" onClick={() => navigate('/rules')}>
                    📜 Rules
                </button>
                <button className="sessions-action-btn" onClick={() => navigate('/gallery')}>
                    📖 Gallery
                </button>
                <button className="sessions-action-btn" onClick={() => navigate('/deck-builder')}>
                    🃏 Deck Builder
                </button>
                <button className="sessions-action-btn" onClick={() => navigate('/card-creator')}>
                    🧪 Create Cards
                </button>
            </div>

            {error && <p className="sessions-error sessions-error--center">{error}</p>}

            <section className="sessions-list-section">
                <div className="sessions-tabs">
                    <button
                        className={`sessions-tab${lobbyTab === 'current' ? ' active' : ''}`}
                        onClick={() => setLobbyTab('current')}
                    >
                        My Games
                    </button>
                    <button
                        className={`sessions-tab${lobbyTab === 'open' ? ' active' : ''}`}
                        onClick={() => setLobbyTab('open')}
                    >
                        Open Lobbies
                    </button>
                </div>
                {loading && list.length === 0 && <p className="sessions-empty">Loading…</p>}
                {!loading && list.filter((s) => lobbyTab === 'current'
                    ? s.players.some((p) => p.username === username)
                    : s.status === 'waiting' && !s.players.some((p) => p.username === username)
                ).length === 0 && (
                        <p className="sessions-empty">
                            {lobbyTab === 'current'
                                ? 'No active games. Create one or join with a code!'
                                : 'No open lobbies available right now.'}
                        </p>
                    )}
                <div className="sessions-list">
                    {list.filter((s) => lobbyTab === 'current'
                        ? s.players.some((p) => p.username === username)
                        : s.status === 'waiting' && !s.players.some((p) => p.username === username)
                    ).map((session) => {
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
        </div>,
        true
    );
};

export default Sessions;


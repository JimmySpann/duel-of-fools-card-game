import { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
    updateProfile,
    sendFriendRequest,
    acceptFriendRequest,
    removeFriend,
    blockUser,
    unblockUser,
    clearProfileError,
    setNotifyTurn,
    setNotifyDM,
    setNotifyLobby,
    setSoundVolume,
} from './profileSlice';
import sounds from '../sound/soundManager';
import useNotifications from '../notifications/useNotifications';
import './profile.css';

const TABS = ['Profile', 'Friends', 'Blocked', 'Options'];

const Profile = ({ onClose, initialTab = 'Profile' }) => {
    const dispatch = useDispatch();
    const { displayName, avatarUrl, friends, friendRequests, blocked, loading, error, notifyTurn, notifyDM, notifyLobby, soundVolume } = useSelector((s) => s.profile);
    const username = useSelector((s) => s.auth.username);
    const { permission, request } = useNotifications();

    const [tab, setTab] = useState(initialTab);
    const [nameInput, setNameInput] = useState(displayName);
    const [avatarInput, setAvatarInput] = useState(avatarUrl);
    const [addInput, setAddInput] = useState('');
    const [addStatus, setAddStatus] = useState(null); // { ok, msg }
    const [localVolume, setLocalVolume] = useState(soundVolume ?? 0.7);

    // Keep sound manager in sync with stored volume on mount
    useEffect(() => {
        sounds.setVolume(soundVolume ?? 0.7);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleSaveProfile = async (e) => {
        e.preventDefault();
        dispatch(clearProfileError());
        await dispatch(updateProfile({ displayName: nameInput, avatarUrl: avatarInput }));
    };

    const handleSendRequest = async (e) => {
        e.preventDefault();
        if (!addInput.trim()) return;
        setAddStatus(null);
        const res = await dispatch(sendFriendRequest({ username: addInput.trim() }));
        if (sendFriendRequest.fulfilled.match(res)) {
            const msg = res.payload.status === 'accepted' ? 'Now friends!' : 'Request sent!';
            setAddStatus({ ok: true, msg });
            setAddInput('');
        } else {
            setAddStatus({ ok: false, msg: res.payload ?? 'Failed to send request' });
        }
    };

    const imgSrc = avatarUrl || `https://i.pravatar.cc/150?u=${username}`;

    return (
        <div className="profile-overlay" onClick={onClose}>
            <div className="profile-modal" onClick={(e) => e.stopPropagation()}>
                <button className="profile-close-btn" onClick={onClose}>✕</button>

                {/* Tab bar */}
                <div className="profile-tabs">
                    {TABS.map((t) => (
                        <button
                            key={t}
                            className={`profile-tab ${tab === t ? 'active' : ''}`}
                            onClick={() => { setTab(t); dispatch(clearProfileError()); }}
                        >
                            {t}
                            {t === 'Friends' && friendRequests.length > 0 && (
                                <span className="profile-badge">{friendRequests.length}</span>
                            )}
                        </button>
                    ))}
                </div>

                {/* ── Profile Tab ── */}
                {tab === 'Profile' && (
                    <div className="profile-section">
                        <div className="profile-avatar-row">
                            <img
                                className="profile-avatar-preview"
                                src={avatarInput || imgSrc}
                                alt="avatar"
                                onError={(e) => { e.target.src = `https://i.pravatar.cc/150?u=${username}`; }}
                            />
                            <div className="profile-username-display">@{username}</div>
                        </div>
                        <form className="profile-form" onSubmit={handleSaveProfile}>
                            <label className="profile-label">
                                Display Name
                                <input
                                    className="profile-input"
                                    type="text"
                                    value={nameInput}
                                    maxLength={40}
                                    placeholder={username}
                                    onChange={(e) => setNameInput(e.target.value)}
                                />
                            </label>
                            <label className="profile-label">
                                Avatar URL
                                <input
                                    className="profile-input"
                                    type="url"
                                    value={avatarInput}
                                    maxLength={500}
                                    placeholder="https://..."
                                    onChange={(e) => setAvatarInput(e.target.value)}
                                />
                            </label>

                            {/* Notification preferences */}
                            <div className="profile-notif-section">
                                <div className="profile-subsection-title" style={{ marginBottom: '0.5rem' }}>
                                    Notifications
                                    {permission === 'denied' && (
                                        <span className="profile-notif-blocked"> (blocked by browser)</span>
                                    )}
                                </div>
                                <div className="profile-toggle-row">
                                    <span className="profile-toggle-label">
                                        Your turn
                                        <span className="profile-toggle-hint">Alert when it's your turn in a game</span>
                                    </span>
                                    <button
                                        type="button"
                                        className={`profile-toggle ${notifyTurn ? 'on' : 'off'}`}
                                        onClick={async () => {
                                            if (!notifyTurn && permission !== 'granted') await request();
                                            dispatch(setNotifyTurn(!notifyTurn));
                                        }}
                                        aria-label="Toggle turn notifications"
                                    >
                                        <span className="profile-toggle-knob" />
                                    </button>
                                </div>
                                <div className="profile-toggle-row">
                                    <span className="profile-toggle-label">
                                        Direct messages
                                        <span className="profile-toggle-hint">Alert when you receive a DM</span>
                                    </span>
                                    <button
                                        type="button"
                                        className={`profile-toggle ${notifyDM ? 'on' : 'off'}`}
                                        onClick={async () => {
                                            if (!notifyDM && permission !== 'granted') await request();
                                            dispatch(setNotifyDM(!notifyDM));
                                        }}
                                        aria-label="Toggle DM notifications"
                                    >
                                        <span className="profile-toggle-knob" />
                                    </button>
                                </div>
                                <div className="profile-toggle-row">
                                    <span className="profile-toggle-label">
                                        Lobby chat
                                        <span className="profile-toggle-hint">Alert when someone messages in a lobby</span>
                                    </span>
                                    <button
                                        type="button"
                                        className={`profile-toggle ${notifyLobby ? 'on' : 'off'}`}
                                        onClick={async () => {
                                            if (!notifyLobby && permission !== 'granted') await request();
                                            dispatch(setNotifyLobby(!notifyLobby));
                                        }}
                                        aria-label="Toggle lobby chat notifications"
                                    >
                                        <span className="profile-toggle-knob" />
                                    </button>
                                </div>
                                {permission === 'default' && (notifyTurn || notifyDM || notifyLobby) && (
                                    <button
                                        type="button"
                                        className="profile-perm-btn"
                                        onClick={request}
                                    >
                                        Enable browser notifications
                                    </button>
                                )}
                            </div>

                            {error && <p className="profile-error">{error}</p>}
                            <button className="profile-save-btn" type="submit" disabled={loading}>
                                {loading ? 'Saving…' : 'Save Changes'}
                            </button>
                        </form>
                    </div>
                )}

                {/* ── Friends Tab ── */}
                {tab === 'Friends' && (
                    <div className="profile-section">
                        {/* Add friend */}
                        <form className="profile-add-row" onSubmit={handleSendRequest}>
                            <input
                                className="profile-input"
                                type="text"
                                value={addInput}
                                onChange={(e) => setAddInput(e.target.value)}
                                placeholder="Add by username…"
                                maxLength={24}
                            />
                            <button className="profile-add-btn" type="submit" disabled={loading || !addInput.trim()}>
                                Add
                            </button>
                        </form>
                        {addStatus && (
                            <p className={addStatus.ok ? 'profile-success' : 'profile-error'}>
                                {addStatus.msg}
                            </p>
                        )}

                        {/* Incoming requests */}
                        {friendRequests.length > 0 && (
                            <div className="profile-subsection">
                                <h3 className="profile-subsection-title">Incoming Requests</h3>
                                {friendRequests.map((u) => (
                                    <div key={u} className="profile-friend-row">
                                        <img
                                            className="profile-friend-avatar"
                                            src={`https://i.pravatar.cc/40?u=${u}`}
                                            alt={u}
                                        />
                                        <span className="profile-friend-name">{u}</span>
                                        <div className="profile-friend-actions">
                                            <button
                                                className="profile-friend-btn accept"
                                                onClick={() => dispatch(acceptFriendRequest({ username: u }))}
                                                disabled={loading}
                                            >
                                                Accept
                                            </button>
                                            <button
                                                className="profile-friend-btn decline"
                                                onClick={() => dispatch(removeFriend({ username: u }))}
                                                disabled={loading}
                                            >
                                                Decline
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Friends list */}
                        <div className="profile-subsection">
                            <h3 className="profile-subsection-title">
                                Friends {friends.length > 0 && <span className="profile-count">({friends.length})</span>}
                            </h3>
                            {friends.length === 0 ? (
                                <p className="profile-empty">No friends yet. Add someone above!</p>
                            ) : (
                                friends.map((u) => (
                                    <div key={u} className="profile-friend-row">
                                        <img
                                            className="profile-friend-avatar"
                                            src={`https://i.pravatar.cc/40?u=${u}`}
                                            alt={u}
                                        />
                                        <span className="profile-friend-name">{u}</span>
                                        <div className="profile-friend-actions">
                                            <button
                                                className="profile-friend-btn remove"
                                                onClick={() => dispatch(removeFriend({ username: u }))}
                                                disabled={loading}
                                            >
                                                Remove
                                            </button>
                                            <button
                                                className="profile-friend-btn block"
                                                onClick={() => dispatch(blockUser({ username: u }))}
                                                disabled={loading}
                                            >
                                                Block
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                        {error && <p className="profile-error">{error}</p>}
                    </div>
                )}

                {/* ── Blocked Tab ── */}
                {tab === 'Blocked' && (
                    <div className="profile-section">
                        <h3 className="profile-subsection-title">Blocked Users</h3>
                        {blocked.length === 0 ? (
                            <p className="profile-empty">No blocked users.</p>
                        ) : (
                            blocked.map((u) => (
                                <div key={u} className="profile-friend-row">
                                    <img
                                        className="profile-friend-avatar"
                                        src={`https://i.pravatar.cc/40?u=${u}`}
                                        alt={u}
                                    />
                                    <span className="profile-friend-name">{u}</span>
                                    <div className="profile-friend-actions">
                                        <button
                                            className="profile-friend-btn accept"
                                            onClick={() => dispatch(unblockUser({ username: u }))}
                                            disabled={loading}
                                        >
                                            Unblock
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                        {error && <p className="profile-error">{error}</p>}
                    </div>
                )}
                {/* ── Options Tab ── */}
                {tab === 'Options' && (
                    <div className="profile-section">
                        <div className="profile-notif-section">
                            <div className="profile-subsection-title" style={{ marginBottom: '0.5rem' }}>
                                Sound
                            </div>

                            {/* Mute toggle */}
                            <div className="profile-toggle-row">
                                <span className="profile-toggle-label">
                                    Sound effects
                                    <span className="profile-toggle-hint">Plays sounds for attacks, abilities &amp; turns</span>
                                </span>
                                <button
                                    type="button"
                                    className={`profile-toggle ${localVolume > 0 ? 'on' : 'off'}`}
                                    onClick={() => {
                                        const next = localVolume > 0 ? 0 : (soundVolume > 0 ? soundVolume : 0.7);
                                        setLocalVolume(next);
                                        sounds.setVolume(next);
                                        dispatch(setSoundVolume(next));
                                    }}
                                    aria-label="Toggle sound effects"
                                >
                                    <span className="profile-toggle-knob" />
                                </button>
                            </div>

                            {/* Volume slider */}
                            <div className="profile-volume-row">
                                <span className="profile-volume-label">Volume</span>
                                <div className="profile-volume-slider-wrap">
                                    <span className="profile-volume-icon">🔇</span>
                                    <input
                                        className="profile-volume-slider"
                                        type="range"
                                        min="0"
                                        max="1"
                                        step="0.05"
                                        value={localVolume}
                                        onChange={(e) => {
                                            const v = parseFloat(e.target.value);
                                            setLocalVolume(v);
                                            sounds.setVolume(v);
                                            dispatch(setSoundVolume(v));
                                        }}
                                    />
                                    <span className="profile-volume-icon">🔊</span>
                                </div>
                                <span className="profile-volume-pct">{Math.round(localVolume * 100)}%</span>
                            </div>

                            <button
                                type="button"
                                className="profile-save-btn"
                                style={{ marginTop: '0.25rem' }}
                                onClick={() => sounds.hit()}
                            >
                                Test Sound
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Profile;

import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
    updateProfile,
    clearProfileError,
    setNotifyTurn,
    setNotifyDM,
    setNotifyLobby,
} from './profileSlice';
import useNotifications from '../notifications/useNotifications';
import FriendsPanel from './FriendsPanel';
import OptionsPanel from './OptionsPanel';
import './profile.css';

const TABS = ['Profile', 'Friends', 'Blocked', 'Options'];

const Profile = ({ onClose, initialTab = 'Profile' }) => {
    const dispatch = useDispatch();
    const { displayName, avatarUrl, friendRequests, loading, error, notifyTurn, notifyDM, notifyLobby } = useSelector((s) => s.profile);
    const username = useSelector((s) => s.auth.username);
    const { permission, request } = useNotifications();

    const [tab, setTab] = useState(initialTab);
    const [nameInput, setNameInput] = useState(displayName);
    const [avatarInput, setAvatarInput] = useState(avatarUrl);

    const handleSaveProfile = async (e) => {
        e.preventDefault();
        dispatch(clearProfileError());
        await dispatch(updateProfile({ displayName: nameInput, avatarUrl: avatarInput }));
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

                {/* ── Friends / Blocked Tabs ── */}
                {(tab === 'Friends' || tab === 'Blocked') && <FriendsPanel tab={tab} />}

                {/* ── Options Tab ── */}
                {tab === 'Options' && <OptionsPanel />}
            </div>
        </div>
    );
};

export default Profile;

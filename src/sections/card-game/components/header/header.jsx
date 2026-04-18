import { useState, useEffect } from 'react';
import './header.css'

const phaseMessage = (phase) => {
    if (phase === 'selectingTarget') return 'Select an enemy card to target';
    if (phase === 'selectingAllyTarget') return 'Select one of your cards as the target';
    return null;
};

const formatCountdown = (ms) => {
    if (ms <= 0) return '0:00';
    const totalSec = Math.ceil(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
};

const Header = ({
    currentPlayerName,
    phase,
    onLobbies,
    onBriefToggle,
    onChatToggle,
    showBrief,
    showChat,
    hasUnreadChat = false,
    displayName,
    avatarUrl,
    username,
    onSignOut,
    onProfileOpen,
    turnTimeLimit = null,
    turnStartedAt = null,
}) => {
    const [showProfileMenu, setShowProfileMenu] = useState(false);
    const [timeLeft, setTimeLeft] = useState(null);
    const msg = phaseMessage(phase);

    useEffect(() => {
        if (!turnTimeLimit || !turnStartedAt) {
            setTimeLeft(null);
            return;
        }
        const calc = () => turnTimeLimit * 1000 - (Date.now() - turnStartedAt);
        setTimeLeft(calc());
        const id = setInterval(() => {
            const remaining = calc();
            setTimeLeft(remaining);
            if (remaining <= 0) clearInterval(id);
        }, 1000);
        return () => clearInterval(id);
    }, [turnTimeLimit, turnStartedAt]);

    return (
        <div className="header-container">
            <h2 className="header-title header-title--clickable" onClick={onLobbies}>
                Duel of Fools
            </h2>
            <div className="account-buttons-container">
                <button className="account-button" onClick={onLobbies}>Lobbies</button>
                <div className="header-profile-wrap">
                    <button
                        className="header-profile-btn"
                        onClick={() => setShowProfileMenu((v) => !v)}
                    >
                        <img
                            className="header-profile-avatar"
                            src={avatarUrl || `https://i.pravatar.cc/40?u=${username}`}
                            alt="avatar"
                            onError={(e) => { e.target.src = `https://i.pravatar.cc/40?u=${username}`; }}
                        />
                        <span className="header-profile-name">{displayName || username}</span>
                        <span className="header-profile-caret">▾</span>
                    </button>
                    {showProfileMenu && (
                        <div className="header-profile-dropdown">
                            <button
                                className="header-profile-dropdown-item lobbies-mobile"
                                onClick={() => { setShowProfileMenu(false); onLobbies(); }}
                            >
                                Lobbies
                            </button>
                            <button
                                className="header-profile-dropdown-item"
                                onClick={() => { setShowProfileMenu(false); onProfileOpen?.(); }}
                            >
                                Profile
                            </button>
                            <button
                                className="header-profile-dropdown-item signout"
                                onClick={() => { setShowProfileMenu(false); onSignOut(); }}
                            >
                                Sign Out
                            </button>
                        </div>
                    )}
                </div>
            </div>
            <div className="player-container">
                <div className="player-buttons-container">
                    <button
                        className={`player-button${showBrief ? ' player-button--active' : ''}`}
                        onClick={onBriefToggle}
                    >
                        Brief
                    </button>
                    <button
                        className={`player-button${showChat ? ' player-button--active' : ''}${(!showChat && hasUnreadChat) ? ' player-button--unread' : ''}`}
                        onClick={onChatToggle}
                    >
                        Chat{!showChat && hasUnreadChat ? ' •' : ''}
                    </button>
                </div>
                <div className="player-card-container">
                    <div className="player-name-card">
                        <h2 className="player-name-title">
                            {currentPlayerName}'s Turn
                        </h2>
                        {timeLeft !== null && (
                            <p className={`turn-countdown${timeLeft <= 60000 ? ' turn-countdown--urgent' : ''}`}>
                                ⏱ {formatCountdown(timeLeft)}
                            </p>
                        )}
                        {msg && (
                            <p className={`phase-subtitle${phase === 'selectingAllyTarget' ? ' phase-subtitle-ally' : ''}`}>
                                {msg}
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Header;
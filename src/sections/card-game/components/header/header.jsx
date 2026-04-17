import { useState } from 'react';
import './header.css'

const phaseMessage = (phase) => {
    if (phase === 'selectingTarget') return 'Select an enemy card to target';
    if (phase === 'selectingAllyTarget') return 'Select one of your cards as the target';
    return null;
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
}) => {
    const [showProfileMenu, setShowProfileMenu] = useState(false);
    const msg = phaseMessage(phase);

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
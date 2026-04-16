import './header.css'

const phaseMessage = (phase) => {
    if (phase === 'selectingTarget') return 'Select an enemy card to target';
    if (phase === 'selectingAllyTarget') return 'Select one of your cards as the target';
    return null;
};

const Header = ({ currentPlayerName, phase }) => {
    const msg = phaseMessage(phase);
    return (
        <div className="header-container">
            <h2 className="header-title">
                Duel of Fools
            </h2>
            <div className="account-buttons-container">
                <button className="account-button">Switch <br /> Games</button>
                <button className="account-button">Sign <br /> Out</button>
            </div>
            <div className="player-container">
                <div className="player-buttons-container">
                    <button className="player-button">Brief</button>
                    <button className="player-button">Chat</button>
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
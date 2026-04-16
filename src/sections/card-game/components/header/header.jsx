import './header.css'

const Header = ({ currentPlayerName, phase }) => {

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
                        {phase === 'selectingTarget' && (
                            <p className="phase-subtitle">Select a target to attack</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Header;
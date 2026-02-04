import './header.css'

const Header = ({ }) => {

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
                    <button className="player-button">Hand</button>
                </div>
                <div className="player-card-container">
                    <div className="player-name-card">
                        <h2 className="player-name-title">
                            Your Turn
                        </h2>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Header;
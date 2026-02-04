import testEngine from './database/test-engine.js';
import Header from './components/header/header.jsx';
import EnemyLayout from './components/layouts/enemy-layout/enemy-layout.jsx';
import Hand from './components/hand/hand.jsx'
import './card-game.css'; // Assume your styles are here

const CardGame = () => {
    return (
        <div className="card-game-container">
            <Header />

            {testEngine.players.map(player =>
                <EnemyLayout player={player} />
            )}

            <Hand _hand={testEngine.players[0].hand} />
        </div >
    );
};

export default CardGame;
import testEngine from './database/test-engine.js';
import Header from './components/header/header.jsx';
import EnemyLayout from './components/layouts/enemy-layout/enemy-layout.jsx';
import UserLayout from './components/layouts/user-layout/user-layout.jsx';
import './card-game.css'; // Assume your styles are here

const CardGame = ({ currentUserId = 'player1' }) => {
    const enemies = testEngine.players.filter(player => player.id !== currentUserId)
    const user = testEngine.players.find(player => player.id === currentUserId)
    return (
        <div className="card-game-container">
            <Header />

            {enemies.map(enemy =>
                <EnemyLayout player={enemy} />
            )}

            <UserLayout player={user} />

        </div >
    );
};

export default CardGame;
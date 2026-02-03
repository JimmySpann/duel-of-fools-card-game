import { useEffect, useState } from 'react';
import cards from './database/cards.js';
import testEngine from './database/test-engine.js';
import Header from './header/header.jsx';
import Board from './layouts/board/board.jsx';
import PlayerHUD from './player-hud/player-hud.jsx';
import SelectedCard from './selected-card/selected-card.jsx';
import Hand from './layouts/hand/hand.jsx'
import './card-game.css'; // Assume your styles are here

const CardGame = () => {
    return (
        <div className="card-game-container">
            <Header />

            {testEngine.players.map(player => {
                return (
                    <div>
                        <PlayerHUD
                            player={player}
                        />

                        <Board
                            cards={player.inPlay}
                        />

                    </div>
                )
            })}
            <Hand _hand={testEngine.players[0].hand} />
        </div >
    );
};

export default CardGame;
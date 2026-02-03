import { useEffect, useState } from 'react';
import cards from './database/cards.js';
import testEngine from './database/test-engine.js';
import Header from './header/header.jsx';
import CardLayout from './card-layout/card-layout.jsx';
import PlayerHUD from './player-hud/player-hud.jsx';
import SelectedCard from './selected-card/selected-card.jsx';
import Hand from './hand/hand.jsx'
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

                        <CardLayout
                            cards={player.inPlay}
                        />

                    </div>
                )
            })}
            <Hand />
        </div >
    );
};

export default CardGame;
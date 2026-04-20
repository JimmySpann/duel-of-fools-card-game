import React from 'react';
import './Welcome.css';

const Welcome = () => (
    <div className="welcome-card">
        <h2 className="welcome-title">Welcome to Duel of Fools!</h2>
        <div className="welcome-desc">
            <p><strong>Duel of Fools</strong> is a fast-paced, multiplayer card battler where you build decks, battle friends or CPUs, and experiment with custom cards and wild combos. It was made for fun and as a portfolio project—so enjoy, break things, and share your feedback!</p>
        </div>
        <ul className="welcome-list">
            <li>🃏 <strong>Create</strong> a new session or <strong>join</strong> an open lobby to start playing.</li>
            <li>👥 Invite friends with your lobby code or link.</li>
            <li>🤖 Add CPU opponents for solo or practice games.</li>
            <li>🛠️ Build your deck in the Deck Builder, or try the Gallery for inspiration.</li>
            <li>❓ Check the Rules for a full guide on gameplay and abilities.</li>
        </ul>
        <div className="welcome-note">Have fun and experiment—this is a beta! Report bugs or feedback in the Discord.</div>
    </div>
);

export default Welcome;

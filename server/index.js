'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { createGame, dispatch } = require('./game/engine');
const Game = require('./models/Game');

const app = express();
const PORT = process.env.PORT || 3001;

// ── Database ──────────────────────────────────────────────────────────────────

const MONGO_URI = process.env.MONGODB_URI;
if (!MONGO_URI) {
    console.error('ERROR: MONGODB_URI is not set. Add it to server/.env');
    process.exit(1);
}

mongoose
    .connect(MONGO_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch((err) => { console.error('MongoDB connection error:', err); process.exit(1); });

// ── Middleware ────────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json());

// Serve the React production build (run `npm run build` in the root first)
const BUILD_DIR = path.join(__dirname, '..', 'build');
app.use(express.static(BUILD_DIR));

// ── API routes ────────────────────────────────────────────────────────────────

/**
 * POST /api/games
 * Body: { player1Name?, player2Name? }
 * Creates a new game and returns its id + initial state.
 */
app.post('/api/games', async (req, res) => {
    try {
        const { player1Name = 'Player 1', player2Name = 'Player 2' } = req.body;
        const gameId = uuidv4();
        const state = createGame(player1Name, player2Name);
        await Game.create({ gameId, state });
        res.status(201).json({ gameId, state });
    } catch (err) {
        console.error('POST /api/games error:', err);
        res.status(500).json({ error: 'Failed to create game' });
    }
});

/**
 * GET /api/games/:id
 * Returns the current state of a game.
 */
app.get('/api/games/:id', async (req, res) => {
    try {
        const game = await Game.findOne({ gameId: req.params.id }).lean();
        if (!game) return res.status(404).json({ error: 'Game not found' });
        res.json({ state: game.state });
    } catch (err) {
        console.error('GET /api/games/:id error:', err);
        res.status(500).json({ error: 'Failed to retrieve game' });
    }
});

/**
 * POST /api/games/:id/action
 * Body: { type: string, payload?: object }
 * Dispatches an action and returns the updated state.
 *
 * Valid action types:
 *   selectAttacker     { cardIndex }
 *   cancelSelection
 *   initiateAbility    { casterCardIndex, abilityIndex }
 *   resolveOnEnemyCard { targetCardIndex }
 *   resolveOnAllyCard  { targetCardIndex }
 *   attackPlayer
 *   playCardFromHand   { cardIndex }
 *   commitDefeats
 *   dismissRecap
 *   endTurn
 */
app.post('/api/games/:id/action', async (req, res) => {
    try {
        const game = await Game.findOne({ gameId: req.params.id });
        if (!game) return res.status(404).json({ error: 'Game not found' });

        const { type, payload = {} } = req.body;
        if (!type) return res.status(400).json({ error: 'Missing action type' });

        const { state: nextState, error } = dispatch(game.state, type, payload);
        if (error) return res.status(400).json({ error });

        game.state = nextState;
        game.markModified('state'); // required for Mixed fields
        await game.save();
        res.json({ state: nextState });
    } catch (err) {
        console.error('POST /api/games/:id/action error:', err);
        res.status(500).json({ error: 'Failed to process action' });
    }
});

/**
 * DELETE /api/games/:id
 * Removes a game from the store.
 */
app.delete('/api/games/:id', async (req, res) => {
    try {
        const result = await Game.deleteOne({ gameId: req.params.id });
        if (result.deletedCount === 0) return res.status(404).json({ error: 'Game not found' });
        res.status(204).send();
    } catch (err) {
        console.error('DELETE /api/games/:id error:', err);
        res.status(500).json({ error: 'Failed to delete game' });
    }
});

// ── Fallback — serve React for all non-API routes ─────────────────────────────
app.get('*', (req, res) => {
    res.sendFile(path.join(BUILD_DIR, 'index.html'));
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`Card Game server running on http://localhost:${PORT}`);
    console.log(`API base: http://localhost:${PORT}/api`);
});

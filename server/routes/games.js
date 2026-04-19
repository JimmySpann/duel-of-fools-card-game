'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { createGame, dispatch } = require('../game/engine');
const Game = require('../models/Game');

const router = express.Router();

/**
 * POST /api/games
 */
router.post('/', async (req, res) => {
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
 */
router.get('/:id', async (req, res) => {
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
 */
router.post('/:id/action', async (req, res) => {
    try {
        const game = await Game.findOne({ gameId: req.params.id });
        if (!game) return res.status(404).json({ error: 'Game not found' });

        const { type, payload = {} } = req.body;
        if (!type) return res.status(400).json({ error: 'Missing action type' });

        const { state: nextState, error } = dispatch(game.state, type, payload);
        if (error) return res.status(400).json({ error });

        game.state = nextState;
        game.markModified('state');
        await game.save();
        res.json({ state: nextState });
    } catch (err) {
        console.error('POST /api/games/:id/action error:', err);
        res.status(500).json({ error: 'Failed to process action' });
    }
});

/**
 * DELETE /api/games/:id
 */
router.delete('/:id', async (req, res) => {
    try {
        const result = await Game.deleteOne({ gameId: req.params.id });
        if (result.deletedCount === 0) return res.status(404).json({ error: 'Game not found' });
        res.status(204).send();
    } catch (err) {
        console.error('DELETE /api/games/:id error:', err);
        res.status(500).json({ error: 'Failed to delete game' });
    }
});

module.exports = router;

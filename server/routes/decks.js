'use strict';

const express = require('express');
const { requireAuth } = require('../helpers');
const User = require('../models/User');

const router = express.Router();

/**
 * GET /api/decks
 */
router.get('/', requireAuth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('savedDecks').lean();
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ decks: user.savedDecks || [] });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * POST /api/decks
 * Body: { name: string, cardIds: string[] }
 */
router.post('/', requireAuth, async (req, res) => {
    try {
        const { name, cardIds } = req.body;
        if (!name || typeof name !== 'string' || !name.trim()) {
            return res.status(400).json({ error: 'Deck name is required' });
        }
        if (!Array.isArray(cardIds) || cardIds.length < 1) {
            return res.status(400).json({ error: 'cardIds must be a non-empty array' });
        }
        const trimmedName = name.trim().slice(0, 40);
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        const existing = user.savedDecks.find((d) => d.name === trimmedName);
        if (existing) {
            existing.cardIds = cardIds;
        } else {
            user.savedDecks.push({ name: trimmedName, cardIds });
        }
        await user.save();
        res.json({ decks: user.savedDecks });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * DELETE /api/decks/:name
 */
router.delete('/:name', requireAuth, async (req, res) => {
    try {
        const name = decodeURIComponent(req.params.name);
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        user.savedDecks = user.savedDecks.filter((d) => d.name !== name);
        await user.save();
        res.json({ decks: user.savedDecks });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;

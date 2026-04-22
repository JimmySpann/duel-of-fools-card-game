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
 * GET /api/decks/public?search=&limit=
 * Browse other users' public decks. Must be declared before /:name.
 */
router.get('/public', requireAuth, async (req, res) => {
    try {
        const search = String(req.query.search || '').trim().toLowerCase();
        const limit = Math.min(Number(req.query.limit) || 50, 100);

        // Aggregate public decks across all users except the requester
        const users = await User.find(
            { 'savedDecks.isPublic': true, _id: { $ne: req.user.id } },
            { username: 1, savedDecks: 1 }
        ).lean();

        const results = [];
        for (const u of users) {
            for (const d of (u.savedDecks || [])) {
                if (!d.isPublic) continue;
                if (search && !d.name.toLowerCase().includes(search)) continue;
                results.push({
                    name: d.name,
                    cardIds: d.cardIds,
                    ownerUsername: u.username,
                });
                if (results.length >= limit) break;
            }
            if (results.length >= limit) break;
        }

        res.json({ decks: results });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * POST /api/decks/fork
 * Fork another user's public deck into the caller's library.
 * Body: { ownerUsername: string, deckName: string, newName?: string }
 * Must be declared before /:name.
 */
router.post('/fork', requireAuth, async (req, res) => {
    try {
        const { ownerUsername, deckName, newName } = req.body;
        if (!ownerUsername || !deckName) {
            return res.status(400).json({ error: 'ownerUsername and deckName are required' });
        }

        // Find the owner and verify the deck is public
        const owner = await User.findOne({ username: ownerUsername }).select('savedDecks').lean();
        if (!owner) return res.status(404).json({ error: 'Owner not found' });
        const sourceDeck = owner.savedDecks.find((d) => d.name === deckName && d.isPublic);
        if (!sourceDeck) return res.status(404).json({ error: 'Public deck not found' });

        // Apply to the caller's library
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ error: 'User not found' });

        // Build a unique name
        let baseName = String(newName || `${deckName} (Fork)`).trim().slice(0, 40);
        let candidate = baseName;
        let suffix = 2;
        while (user.savedDecks.some((d) => d.name === candidate)) {
            candidate = `${baseName.slice(0, 36)} ${suffix}`;
            suffix += 1;
        }

        user.savedDecks.push({ name: candidate, cardIds: sourceDeck.cardIds, isPublic: false });
        await user.save();
        res.json({ decks: user.savedDecks, forkedName: candidate });
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
 * PATCH /api/decks/:name
 * Body: { newName?: string, isPublic?: boolean }
 */
router.patch('/:name', requireAuth, async (req, res) => {
    try {
        const name = decodeURIComponent(req.params.name);
        const { newName, isPublic } = req.body;
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        const deck = user.savedDecks.find((d) => d.name === name);
        if (!deck) return res.status(404).json({ error: 'Deck not found' });

        if (typeof isPublic === 'boolean') deck.isPublic = isPublic;

        if (newName && typeof newName === 'string') {
            const trimmed = newName.trim().slice(0, 40);
            if (!trimmed) return res.status(400).json({ error: 'New name cannot be empty' });
            if (trimmed !== name && user.savedDecks.some((d) => d.name === trimmed)) {
                return res.status(409).json({ error: 'A deck with that name already exists' });
            }
            deck.name = trimmed;
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

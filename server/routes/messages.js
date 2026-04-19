'use strict';

const express = require('express');
const { requireAuth } = require('../helpers');
const Message = require('../models/Message');

const router = express.Router();

/**
 * GET /api/messages/dm/:username
 */
router.get('/dm/:username', requireAuth, async (req, res) => {
    try {
        const me = req.user.username;
        const other = req.params.username;
        const limit = Math.min(parseInt(req.query.limit) || 50, 100);

        const filter = {
            $or: [
                { fromUsername: me, toUsername: other },
                { fromUsername: other, toUsername: me },
            ],
        };
        if (req.query.before) filter.createdAt = { $lt: new Date(req.query.before) };

        const messages = await Message.find(filter)
            .sort({ createdAt: -1 })
            .limit(limit)
            .select('fromUsername toUsername text createdAt')
            .lean();

        res.json({ messages: messages.reverse() });
    } catch (err) {
        console.error('GET /api/messages/dm/:username error:', err);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

/**
 * GET /api/messages/dm-list
 */
router.get('/dm-list', requireAuth, async (req, res) => {
    try {
        const me = req.user.username;
        const threads = await Message.aggregate([
            { $match: { $or: [{ fromUsername: me }, { toUsername: me }], toUsername: { $ne: null } } },
            { $sort: { createdAt: -1 } },
            {
                $group: {
                    _id: {
                        $cond: [{ $eq: ['$fromUsername', me] }, '$toUsername', '$fromUsername'],
                    },
                    lastText: { $first: '$text' },
                    lastAt: { $first: '$createdAt' },
                },
            },
            { $sort: { lastAt: -1 } },
        ]);
        res.json({ threads });
    } catch (err) {
        console.error('GET /api/messages/dm-list error:', err);
        res.status(500).json({ error: 'Failed to fetch DM list' });
    }
});

module.exports = router;

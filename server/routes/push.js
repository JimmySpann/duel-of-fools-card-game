'use strict';

const express = require('express');
const webpush = require('web-push');
const { requireAuth } = require('../helpers');
const User = require('../models/User');

const router = express.Router();

const VAPID_PUSH_ENABLED = !!(
    process.env.VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY &&
    process.env.VAPID_SUBJECT
);

router.get('/vapid-public-key', (_req, res) => {
    if (!VAPID_PUSH_ENABLED) {
        return res.json({ enabled: false, publicKey: null });
    }
    res.json({ enabled: true, publicKey: process.env.VAPID_PUBLIC_KEY });
});

router.post('/subscribe', requireAuth, async (req, res) => {
    const { subscription } = req.body;
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
        return res.status(400).json({ error: 'Invalid subscription object' });
    }
    try {
        await User.updateOne(
            { username: req.user.username },
            { $pull: { pushSubscriptions: { endpoint: subscription.endpoint } } }
        );
        await User.updateOne(
            { username: req.user.username },
            { $push: { pushSubscriptions: subscription } }
        );
        res.json({ ok: true });
    } catch (err) {
        console.error('/api/push/subscribe error:', err);
        res.status(500).json({ error: 'Failed to save subscription' });
    }
});

router.delete('/subscribe', requireAuth, async (req, res) => {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ error: 'endpoint required' });
    try {
        await User.updateOne(
            { username: req.user.username },
            { $pull: { pushSubscriptions: { endpoint } } }
        );
        res.json({ ok: true });
    } catch (err) {
        console.error('/api/push/unsubscribe error:', err);
        res.status(500).json({ error: 'Failed to remove subscription' });
    }
});

module.exports = { router, VAPID_PUSH_ENABLED };

'use strict';

const express = require('express');
const { requireAuth, signToken } = require('../helpers');
const User = require('../models/User');

const router = express.Router();

/**
 * GET /api/auth/me
 * Validates a token and returns the user's info + profile fields.
 */
router.get('/me', requireAuth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-passwordHash').lean();
        if (!user) return res.status(401).json({ error: 'User not found' });
        res.json({
            username: user.username,
            displayName: user.displayName || '',
            avatarUrl: user.avatarUrl || '',
            censorAdultCards: user.censorAdultCards !== false,
            friends: user.friends || [],
            friendRequests: user.friendRequests || [],
            blocked: user.blocked || [],
        });
    } catch (err) {
        console.error('GET /api/auth/me error:', err);
        res.status(500).json({ error: 'Failed to fetch user' });
    }
});

/**
 * POST /api/auth/signup
 * Body: { username, password }
 */
router.post('/signup', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
        if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

        const exists = await User.findOne({ username });
        if (exists) return res.status(409).json({ error: 'Username already taken' });

        const passwordHash = await User.hashPassword(password);
        const user = await User.create({ username, passwordHash });
        const token = signToken(user);
        res.status(201).json({ token, username: user.username });
    } catch (err) {
        console.error('POST /api/auth/signup error:', err);
        res.status(500).json({ error: 'Failed to create account' });
    }
});

/**
 * POST /api/auth/login
 * Body: { username, password }
 */
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

        const user = await User.findOne({ username });
        if (!user) return res.status(401).json({ error: 'Invalid username or password' });

        const valid = await user.verifyPassword(password);
        if (!valid) return res.status(401).json({ error: 'Invalid username or password' });

        const token = signToken(user);
        res.json({ token, username: user.username });
    } catch (err) {
        console.error('POST /api/auth/login error:', err);
        res.status(500).json({ error: 'Failed to log in' });
    }
});

module.exports = router;

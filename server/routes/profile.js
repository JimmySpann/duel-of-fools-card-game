'use strict';

const express = require('express');
const { requireAuth } = require('../helpers');
const User = require('../models/User');

const router = express.Router();

const isValidUrl = (url) => {
    if (!url) return true; // empty is allowed (clears avatar)
    return /^https?:\/\/.{1,490}$/.test(url);
};

/**
 * GET /api/profile
 * Returns the authenticated user's full profile.
 */
router.get('/', requireAuth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-passwordHash').lean();
        if (!user) return res.status(404).json({ error: 'User not found' });
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
        console.error('GET /api/profile error:', err);
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

/**
 * PATCH /api/profile
 * Body: { displayName?, avatarUrl?, censorAdultCards? }
 */
router.patch('/', requireAuth, async (req, res) => {
    try {
        const { displayName, avatarUrl, censorAdultCards } = req.body;
        if (displayName !== undefined && displayName.length > 40)
            return res.status(400).json({ error: 'Display name must be 40 characters or fewer' });
        if (avatarUrl !== undefined && !isValidUrl(avatarUrl))
            return res.status(400).json({ error: 'Avatar URL must be a valid http/https URL' });
        if (censorAdultCards !== undefined && typeof censorAdultCards !== 'boolean')
            return res.status(400).json({ error: 'censorAdultCards must be a boolean' });

        const update = {};
        if (displayName !== undefined) update.displayName = displayName.trim();
        if (avatarUrl !== undefined) update.avatarUrl = avatarUrl.trim();
        if (censorAdultCards !== undefined) update.censorAdultCards = censorAdultCards;

        const user = await User.findByIdAndUpdate(req.user.id, { $set: update }, { new: true }).select('-passwordHash').lean();
        res.json({
            username: user.username,
            displayName: user.displayName || '',
            avatarUrl: user.avatarUrl || '',
            censorAdultCards: user.censorAdultCards !== false,
        });
    } catch (err) {
        console.error('PATCH /api/profile error:', err);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

/**
 * POST /api/profile/friends
 * Body: { username }
 */
router.post('/friends', requireAuth, async (req, res) => {
    try {
        const { username: targetUsername } = req.body;
        if (!targetUsername) return res.status(400).json({ error: 'Username is required' });
        if (targetUsername === req.user.username) return res.status(400).json({ error: 'Cannot add yourself' });

        const target = await User.findOne({ username: targetUsername });
        if (!target) return res.status(404).json({ error: 'User not found' });

        const me = await User.findById(req.user.id);
        if (me.blocked.includes(targetUsername) || target.blocked.includes(req.user.username))
            return res.status(403).json({ error: 'Cannot send a request to this user' });
        if (me.friends.includes(targetUsername))
            return res.status(409).json({ error: 'Already friends' });
        if (target.friendRequests.includes(req.user.username))
            return res.status(409).json({ error: 'Request already sent' });

        // If they already sent us a request, auto-accept
        if (me.friendRequests.includes(targetUsername)) {
            me.friendRequests = me.friendRequests.filter((u) => u !== targetUsername);
            me.friends.push(targetUsername);
            target.friends.push(req.user.username);
            await me.save();
            await target.save();
            return res.json({ status: 'accepted', friends: me.friends, friendRequests: me.friendRequests });
        }

        target.friendRequests.push(req.user.username);
        await target.save();
        res.json({ status: 'requested' });
    } catch (err) {
        console.error('POST /api/profile/friends error:', err);
        res.status(500).json({ error: 'Failed to send friend request' });
    }
});

/**
 * PUT /api/profile/friends/:username/accept
 */
router.put('/friends/:username/accept', requireAuth, async (req, res) => {
    try {
        const targetUsername = req.params.username;
        const me = await User.findById(req.user.id);
        if (!me.friendRequests.includes(targetUsername))
            return res.status(404).json({ error: 'No request from that user' });

        const target = await User.findOne({ username: targetUsername });

        me.friendRequests = me.friendRequests.filter((u) => u !== targetUsername);
        if (!me.friends.includes(targetUsername)) me.friends.push(targetUsername);
        if (target && !target.friends.includes(req.user.username)) {
            target.friends.push(req.user.username);
            await target.save();
        }
        await me.save();
        res.json({ friends: me.friends, friendRequests: me.friendRequests });
    } catch (err) {
        console.error('PUT /api/profile/friends/:username/accept error:', err);
        res.status(500).json({ error: 'Failed to accept request' });
    }
});

/**
 * DELETE /api/profile/friends/:username
 * Removes a friend OR declines/cancels an incoming request.
 */
router.delete('/friends/:username', requireAuth, async (req, res) => {
    try {
        const targetUsername = req.params.username;
        const me = await User.findById(req.user.id);
        me.friends = me.friends.filter((u) => u !== targetUsername);
        me.friendRequests = me.friendRequests.filter((u) => u !== targetUsername);
        await me.save();

        await User.updateOne({ username: targetUsername }, { $pull: { friends: req.user.username } });
        res.json({ friends: me.friends, friendRequests: me.friendRequests });
    } catch (err) {
        console.error('DELETE /api/profile/friends/:username error:', err);
        res.status(500).json({ error: 'Failed to remove friend' });
    }
});

/**
 * POST /api/profile/block
 * Body: { username }
 */
router.post('/block', requireAuth, async (req, res) => {
    try {
        const { username: targetUsername } = req.body;
        if (!targetUsername || targetUsername === req.user.username)
            return res.status(400).json({ error: 'Invalid username' });

        const me = await User.findById(req.user.id);
        me.friends = me.friends.filter((u) => u !== targetUsername);
        me.friendRequests = me.friendRequests.filter((u) => u !== targetUsername);
        if (!me.blocked.includes(targetUsername)) me.blocked.push(targetUsername);
        await me.save();

        await User.updateOne({ username: targetUsername }, {
            $pull: { friends: req.user.username, friendRequests: req.user.username },
        });
        res.json({ friends: me.friends, friendRequests: me.friendRequests, blocked: me.blocked });
    } catch (err) {
        console.error('POST /api/profile/block error:', err);
        res.status(500).json({ error: 'Failed to block user' });
    }
});

/**
 * DELETE /api/profile/block/:username
 */
router.delete('/block/:username', requireAuth, async (req, res) => {
    try {
        const me = await User.findById(req.user.id);
        me.blocked = me.blocked.filter((u) => u !== req.params.username);
        await me.save();
        res.json({ blocked: me.blocked });
    } catch (err) {
        console.error('DELETE /api/profile/block/:username error:', err);
        res.status(500).json({ error: 'Failed to unblock user' });
    }
});

/**
 * GET /api/profile/abilities
 * Returns the authenticated user's saved abilities.
 */
router.get('/abilities', requireAuth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('savedAbilities').lean();
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ abilities: user.savedAbilities || [] });
    } catch (err) {
        console.error('GET /api/profile/abilities error:', err);
        res.status(500).json({ error: 'Failed to fetch saved abilities' });
    }
});

/**
 * POST /api/profile/abilities
 * Body: { name, actionInfo?, description?, limit?, type?, microevent?, customConfig? }
 * Upserts a saved ability by name. Cap: 50.
 */
router.post('/abilities', requireAuth, async (req, res) => {
    try {
        const { name, actionInfo, description, limit, type, microevent, customConfig } = req.body;
        if (!name || typeof name !== 'string' || !name.trim())
            return res.status(400).json({ error: 'name is required' });

        const trimmedName = name.trim().slice(0, 60);
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const existing = user.savedAbilities.findIndex((a) => a.name === trimmedName);
        const entry = {
            name: trimmedName,
            actionInfo: String(actionInfo || '').trim().slice(0, 120),
            description: String(description || '').trim().slice(0, 300),
            limit: Math.max(1, Math.min(30, Number(limit) || 2)),
            type: String(type || '').trim().slice(0, 20),
            microevent: microevent || null,
            customConfig: customConfig || null,
            savedAt: new Date(),
        };

        if (existing !== -1) {
            user.savedAbilities[existing] = entry;
        } else {
            if (user.savedAbilities.length >= 50)
                return res.status(400).json({ error: 'Saved abilities limit reached (50)' });
            user.savedAbilities.push(entry);
        }

        await user.save();
        res.json({ abilities: user.savedAbilities });
    } catch (err) {
        console.error('POST /api/profile/abilities error:', err);
        res.status(500).json({ error: 'Failed to save ability' });
    }
});

/**
 * DELETE /api/profile/abilities/:name
 * Removes a saved ability by name.
 */
router.delete('/abilities/:name', requireAuth, async (req, res) => {
    try {
        const targetName = decodeURIComponent(req.params.name);
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        user.savedAbilities = user.savedAbilities.filter((a) => a.name !== targetName);
        await user.save();
        res.json({ abilities: user.savedAbilities });
    } catch (err) {
        console.error('DELETE /api/profile/abilities/:name error:', err);
        res.status(500).json({ error: 'Failed to remove saved ability' });
    }
});

module.exports = router;

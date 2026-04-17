'use strict';

require('dotenv').config();

const http = require('http');
const express = require('express');
const { Server: SocketIOServer } = require('socket.io');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { createGame, dispatch } = require('./game/engine');
const Game = require('./models/Game');
const User = require('./models/User');
const Session = require('./models/Session');
const Message = require('./models/Message');

const app = express();
const httpServer = http.createServer(app);
const io = new SocketIOServer(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
});
const PORT = process.env.PORT || 3001;

// ── Database ──────────────────────────────────────────────────────────────────

const MONGO_URI = process.env.MONGODB_URI;
if (!MONGO_URI) {
    console.error('ERROR: MONGODB_URI is not set. Add it to server/.env');
    process.exit(1);
}

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('ERROR: JWT_SECRET is not set. Add it to server/.env');
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

// ── Auth middleware ───────────────────────────────────────────────────────────

const requireAuth = (req, res, next) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    try {
        req.user = jwt.verify(header.slice(7), JWT_SECRET);
        next();
    } catch {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusable chars
const generateJoinCode = () =>
    Array.from({ length: 6 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');

const signToken = (user) =>
    jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });

// ── Auth routes ───────────────────────────────────────────────────────────────

/**
 * GET /api/auth/me
 * Validates a token and returns the user's info + profile fields.
 */
app.get('/api/auth/me', requireAuth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-passwordHash').lean();
        if (!user) return res.status(401).json({ error: 'User not found' });
        res.json({
            username: user.username,
            displayName: user.displayName || '',
            avatarUrl: user.avatarUrl || '',
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
app.post('/api/auth/signup', async (req, res) => {
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
app.post('/api/auth/login', async (req, res) => {
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

// ── Profile routes ────────────────────────────────────────────────────────────

const isValidUrl = (url) => {
    if (!url) return true; // empty is allowed (clears avatar)
    return /^https?:\/\/.{1,490}$/.test(url);
};

/**
 * GET /api/profile
 * Returns the authenticated user's full profile.
 */
app.get('/api/profile', requireAuth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-passwordHash').lean();
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({
            username: user.username,
            displayName: user.displayName || '',
            avatarUrl: user.avatarUrl || '',
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
 * Body: { displayName?, avatarUrl? }
 * Updates the user's display name and/or avatar URL.
 */
app.patch('/api/profile', requireAuth, async (req, res) => {
    try {
        const { displayName, avatarUrl } = req.body;
        if (displayName !== undefined && displayName.length > 40)
            return res.status(400).json({ error: 'Display name must be 40 characters or fewer' });
        if (avatarUrl !== undefined && !isValidUrl(avatarUrl))
            return res.status(400).json({ error: 'Avatar URL must be a valid http/https URL' });

        const update = {};
        if (displayName !== undefined) update.displayName = displayName.trim();
        if (avatarUrl !== undefined) update.avatarUrl = avatarUrl.trim();

        const user = await User.findByIdAndUpdate(req.user.id, { $set: update }, { new: true }).select('-passwordHash').lean();
        res.json({
            username: user.username,
            displayName: user.displayName || '',
            avatarUrl: user.avatarUrl || '',
        });
    } catch (err) {
        console.error('PATCH /api/profile error:', err);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

/**
 * POST /api/profile/friends
 * Body: { username }
 * Sends a friend request to another user.
 */
app.post('/api/profile/friends', requireAuth, async (req, res) => {
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
 * Accepts an incoming friend request.
 */
app.put('/api/profile/friends/:username/accept', requireAuth, async (req, res) => {
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
app.delete('/api/profile/friends/:username', requireAuth, async (req, res) => {
    try {
        const targetUsername = req.params.username;
        const me = await User.findById(req.user.id);
        me.friends = me.friends.filter((u) => u !== targetUsername);
        me.friendRequests = me.friendRequests.filter((u) => u !== targetUsername);
        await me.save();

        // Remove from the other user's friends list too
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
 * Blocks a user (also removes from friends/requests on both sides).
 */
app.post('/api/profile/block', requireAuth, async (req, res) => {
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
 * Unblocks a user.
 */
app.delete('/api/profile/block/:username', requireAuth, async (req, res) => {
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

// ── Session (lobby) routes ────────────────────────────────────────────────────

/**
 * GET /api/sessions
 * Returns sessions the authenticated user is part of, plus open waiting sessions.
 */
app.get('/api/sessions', requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const sessions = await Session.find({
            $or: [
                { 'players.userId': userId },
                { status: 'waiting' },
            ],
        }).sort({ updatedAt: -1 }).lean();
        res.json({ sessions });
    } catch (err) {
        console.error('GET /api/sessions error:', err);
        res.status(500).json({ error: 'Failed to fetch sessions' });
    }
});

/**
 * POST /api/sessions
 * Body: { name, settings?: { startingHp, maxBattlers, teamMode } }
 * Creates a new lobby session; the creator is automatically player1.
 */
app.post('/api/sessions', requireAuth, async (req, res) => {
    try {
        const { name, settings = {} } = req.body;
        if (!name || !name.trim()) return res.status(400).json({ error: 'Session name is required' });

        let joinCode;
        let attempts = 0;
        do {
            joinCode = generateJoinCode();
            attempts++;
        } while (attempts < 10 && (await Session.exists({ joinCode })));

        const session = await Session.create({
            name: name.trim(),
            joinCode,
            host: { userId: req.user.id, username: req.user.username },
            players: [{ userId: req.user.id, username: req.user.username, slot: 'player1', team: null }],
            settings: {
                startingHp: Number(settings.startingHp) || 20,
                maxBattlers: settings.maxBattlers ? Number(settings.maxBattlers) : null,
                teamMode: settings.teamMode === 'teams' ? 'teams' : 'ffa',
            },
        });
        res.status(201).json({ session });
    } catch (err) {
        console.error('POST /api/sessions error:', err);
        res.status(500).json({ error: 'Failed to create session' });
    }
});

/**
 * POST /api/sessions/join
 * Body: { joinCode }
 * Joins an existing waiting session by invite code.
 */
app.post('/api/sessions/join', requireAuth, async (req, res) => {
    try {
        const { joinCode } = req.body;
        if (!joinCode) return res.status(400).json({ error: 'Join code is required' });

        const session = await Session.findOne({ joinCode: joinCode.toUpperCase().trim() });
        if (!session) return res.status(404).json({ error: 'Session not found' });
        if (session.status !== 'waiting') return res.status(409).json({ error: 'Session is no longer open' });

        const alreadyIn = session.players.some((p) => String(p.userId) === req.user.id);
        if (alreadyIn) return res.json({ session }); // idempotent re-join

        const SLOTS = ['player1', 'player2', 'player3', 'player4', 'player5', 'player6'];
        const usedSlots = new Set(session.players.map((p) => p.slot));
        const nextSlot = SLOTS.find((s) => !usedSlots.has(s));
        if (!nextSlot) return res.status(409).json({ error: 'Session is full' });

        session.players.push({ userId: req.user.id, username: req.user.username, slot: nextSlot });
        await session.save();
        res.json({ session });
    } catch (err) {
        console.error('POST /api/sessions/join error:', err);
        res.status(500).json({ error: 'Failed to join session' });
    }
});

/**
 * POST /api/sessions/:id/join
 * Joins a waiting session directly by its MongoDB _id (no code required).
 */
app.post('/api/sessions/:id/join', requireAuth, async (req, res) => {
    try {
        const session = await Session.findById(req.params.id);
        if (!session) return res.status(404).json({ error: 'Session not found' });
        if (session.status !== 'waiting') return res.status(409).json({ error: 'Session is no longer open' });

        const alreadyIn = session.players.some((p) => String(p.userId) === req.user.id);
        if (alreadyIn) return res.json({ session }); // idempotent

        const SLOTS = ['player1', 'player2', 'player3', 'player4', 'player5', 'player6'];
        const usedSlots = new Set(session.players.map((p) => p.slot));
        const nextSlot = SLOTS.find((s) => !usedSlots.has(s));
        if (!nextSlot) return res.status(409).json({ error: 'Session is full' });

        session.players.push({ userId: req.user.id, username: req.user.username, slot: nextSlot });
        await session.save();
        res.json({ session });
    } catch (err) {
        console.error('POST /api/sessions/:id/join error:', err);
        res.status(500).json({ error: 'Failed to join session' });
    }
});

/**
 * GET /api/sessions/:id
 * Returns a single session by its MongoDB _id.
 */
app.get('/api/sessions/:id', requireAuth, async (req, res) => {
    try {
        const session = await Session.findById(req.params.id).lean();
        if (!session) return res.status(404).json({ error: 'Session not found' });
        res.json({ session });
    } catch (err) {
        console.error('GET /api/sessions/:id error:', err);
        res.status(500).json({ error: 'Failed to retrieve session' });
    }
});

/**
 * POST /api/sessions/:id/start
 * Host starts the game. Creates a Game document and marks session in-progress.
 */
app.post('/api/sessions/:id/start', requireAuth, async (req, res) => {
    try {
        const session = await Session.findById(req.params.id);
        if (!session) return res.status(404).json({ error: 'Session not found' });
        if (String(session.host.userId) !== req.user.id) return res.status(403).json({ error: 'Only the host can start the game' });
        if (session.status !== 'waiting') return res.status(409).json({ error: 'Session already started' });
        if (session.players.length < 2) return res.status(409).json({ error: 'Need at least 2 players to start' });

        const playerConfigs = session.players.map((p, i) => ({
            id: `player${i + 1}`,
            name: p.username,
            team: session.settings?.teamMode === 'teams' ? (p.team || null) : null,
        }));

        const settings = {
            startingHp: session.settings?.startingHp ?? 20,
            maxBattlers: session.settings?.maxBattlers ?? null,
            teamMode: session.settings?.teamMode ?? 'ffa',
        };

        const gameId = uuidv4();
        const state = createGame(playerConfigs, settings);

        await Game.create({ gameId, state });
        session.gameId = gameId;
        session.status = 'in-progress';
        session.currentTurn = state.currentTurn;
        await session.save();

        res.json({ session, gameId, state });
    } catch (err) {
        console.error('POST /api/sessions/:id/start error:', err);
        res.status(500).json({ error: 'Failed to start game' });
    }
});

/**
 * PATCH /api/sessions/:id/settings
 * Body: { startingHp?, maxBattlers?, teamMode? }
 * Host-only; updates lobby settings before game starts.
 */
app.patch('/api/sessions/:id/settings', requireAuth, async (req, res) => {
    try {
        const session = await Session.findById(req.params.id);
        if (!session) return res.status(404).json({ error: 'Session not found' });
        if (String(session.host.userId) !== req.user.id) return res.status(403).json({ error: 'Only the host can update settings' });
        if (session.status !== 'waiting') return res.status(409).json({ error: 'Cannot change settings after game starts' });

        const { startingHp, maxBattlers, teamMode } = req.body;
        if (startingHp !== undefined) session.settings.startingHp = Number(startingHp);
        if (maxBattlers !== undefined) session.settings.maxBattlers = maxBattlers === null ? null : Number(maxBattlers);
        if (teamMode !== undefined) session.settings.teamMode = teamMode === 'teams' ? 'teams' : 'ffa';
        session.markModified('settings');
        await session.save();

        res.json({ session });
    } catch (err) {
        console.error('PATCH /api/sessions/:id/settings error:', err);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

/**
 * PATCH /api/sessions/:id/players/:slot/team
 * Body: { team: 'A'|'B'|'C'|null }
 * Host-only; assigns a team to a player slot.
 */
app.patch('/api/sessions/:id/players/:slot/team', requireAuth, async (req, res) => {
    try {
        const session = await Session.findById(req.params.id);
        if (!session) return res.status(404).json({ error: 'Session not found' });
        if (String(session.host.userId) !== req.user.id) return res.status(403).json({ error: 'Only the host can assign teams' });
        if (session.status !== 'waiting') return res.status(409).json({ error: 'Cannot change teams after game starts' });

        const player = session.players.find((p) => p.slot === req.params.slot);
        if (!player) return res.status(404).json({ error: 'Player slot not found' });

        const { team } = req.body;
        if (team !== null && !['A', 'B', 'C'].includes(team)) return res.status(400).json({ error: 'Team must be A, B, C, or null' });
        player.team = team;
        session.markModified('players');
        await session.save();

        res.json({ session });
    } catch (err) {
        console.error('PATCH /api/sessions/:id/players/:slot/team error:', err);
        res.status(500).json({ error: 'Failed to update team' });
    }
});

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

// ── Chat REST endpoints ───────────────────────────────────────────────────────

/**
 * GET /api/sessions/:id/messages?before=<ISO>&limit=<n>
 * Returns up to `limit` (default 50, max 100) lobby messages, newest-first,
 * optionally paginated with `before` cursor (ISO timestamp).
 */
app.get('/api/sessions/:id/messages', requireAuth, async (req, res) => {
    try {
        const session = await Session.findById(req.params.id).lean();
        if (!session) return res.status(404).json({ error: 'Session not found' });
        const isMember = session.players.some((p) => p.username === req.user.username);
        if (!isMember) return res.status(403).json({ error: 'Not a member of this session' });

        const limit = Math.min(parseInt(req.query.limit) || 50, 100);
        const filter = { sessionId: req.params.id };
        if (req.query.before) filter.createdAt = { $lt: new Date(req.query.before) };

        const messages = await Message.find(filter)
            .sort({ createdAt: -1 })
            .limit(limit)
            .select('fromUsername text createdAt')
            .lean();

        res.json({ messages: messages.reverse() });
    } catch (err) {
        console.error('GET /api/sessions/:id/messages error:', err);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

/**
 * GET /api/messages/dm/:username?before=<ISO>&limit=<n>
 * Returns DM history between the authenticated user and :username.
 */
app.get('/api/messages/dm/:username', requireAuth, async (req, res) => {
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
 * Returns the list of unique users the authenticated user has DM'd,
 * with the latest message snippet for each thread.
 */
app.get('/api/messages/dm-list', requireAuth, async (req, res) => {
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

// ── Fallback — serve React for all non-API routes ─────────────────────────────
app.get('*', (req, res) => {
    res.sendFile(path.join(BUILD_DIR, 'index.html'));
});

// ── Socket.IO — Chat ─────────────────────────────────────────────────────────

/**
 * Authenticate socket connections via JWT in handshake auth.
 * Client must pass: { auth: { token } }
 */
io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required'));
    try {
        socket.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch {
        next(new Error('Invalid or expired token'));
    }
});

/**
 * Returns the canonical DM room name for two users (sorted alphabetically
 * so either direction produces the same room key).
 */
const dmRoom = (a, b) => {
    const [u1, u2] = [a, b].sort();
    return `dm:${u1}:${u2}`;
};

// ── Per-game action queue (prevents race conditions) ─────────────────────────
// Multiple socket messages for the same game arriving in parallel would all
// read the same old state from MongoDB, process independently, and the last
// write would silently discard earlier changes.  A per-game Promise chain
// serialises them so each action reads the result of the previous one.

const gameQueues = new Map(); // gameId → Promise

const enqueueGameAction = (gameId, fn) => {
    const prev = gameQueues.get(gameId) ?? Promise.resolve();
    const next = prev.then(fn).catch(() => { }); // keep chain alive on error
    gameQueues.set(gameId, next);
    return next;
};

io.on('connection', (socket) => {
    const { username } = socket.user;

    // ── Game (real-time actions) ──────────────────────────────────────────────

    // Join the socket room for a specific game and receive current state
    socket.on('game:join', async ({ gameId }) => {
        if (!gameId) return;
        socket.join(`game:${gameId}`);
        try {
            const game = await Game.findOne({ gameId }).lean();
            if (game) socket.emit('game:state', game.state);
        } catch (err) {
            console.error('game:join error:', err);
        }
    });

    // Dispatch a game action, persist, and broadcast updated state to all players
    socket.on('game:action', async ({ gameId, type, payload = {} }) => {
        if (!gameId || !type) return;
        enqueueGameAction(gameId, async () => {
            try {
                const game = await Game.findOne({ gameId });
                if (!game) return socket.emit('game:error', { message: 'Game not found' });

                const { state: nextState, error } = dispatch(game.state, type, payload);
                if (error) return socket.emit('game:error', { message: error });

                game.state = nextState;
                game.markModified('state');
                await game.save();

                // Keep session's currentTurn in sync so the lobby list can show "Your Turn"
                await Session.findOneAndUpdate(
                    { gameId },
                    { currentTurn: nextState.currentTurn }
                ).catch(() => { });

                io.to(`game:${gameId}`).emit('game:state', nextState);
            } catch (err) {
                console.error('game:action error:', err);
                socket.emit('game:error', { message: 'Failed to process action' });
            }
        });
    });

    // ── Lobby chat ────────────────────────────────────────────────────────────

    socket.on('lobby:join', ({ sessionId }) => {
        if (!sessionId) return;
        socket.join(`lobby:${sessionId}`);
    });

    socket.on('lobby:leave', ({ sessionId }) => {
        if (!sessionId) return;
        socket.leave(`lobby:${sessionId}`);
    });

    socket.on('lobby:message', async ({ sessionId, text }) => {
        if (!sessionId || !text?.trim()) return;
        try {
            // Verify user is actually in the session
            const session = await Session.findById(sessionId).lean();
            if (!session) return;
            const isMember = session.players.some((p) => p.username === username);
            if (!isMember) return;

            const msg = await Message.create({
                fromUsername: username,
                sessionId,
                text: text.trim().slice(0, 1000),
            });

            const payload = {
                _id: msg._id,
                fromUsername: username,
                text: msg.text,
                createdAt: msg.createdAt,
            };
            io.to(`lobby:${sessionId}`).emit('lobby:message', payload);
        } catch (err) {
            console.error('lobby:message error:', err);
        }
    });

    // ── DM chat ───────────────────────────────────────────────────────────────

    // Join your personal notification room so you receive incoming DM events
    socket.join(`user:${username}`);

    socket.on('dm:message', async ({ toUsername, text }) => {
        if (!toUsername || !text?.trim() || toUsername === username) return;
        try {
            const msg = await Message.create({
                fromUsername: username,
                toUsername,
                text: text.trim().slice(0, 1000),
            });

            const payload = {
                _id: msg._id,
                fromUsername: username,
                toUsername,
                text: msg.text,
                createdAt: msg.createdAt,
            };

            // Send to both participants' personal rooms
            io.to(`user:${username}`).emit('dm:message', payload);
            io.to(`user:${toUsername}`).emit('dm:message', payload);
        } catch (err) {
            console.error('dm:message error:', err);
        }
    });
});

// ── Start ─────────────────────────────────────────────────────────────────────
httpServer.listen(PORT, () => {
    console.log(`Card Game server running on http://localhost:${PORT}`);
    console.log(`API base: http://localhost:${PORT}/api`);
});

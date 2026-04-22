'use strict';

const express = require('express');
const { requireAuth, generateJoinCode, cloneCardForGame } = require('../helpers');
const { createGame } = require('../game/engine');
const { v4: uuidv4 } = require('uuid');
const Session = require('../models/Session');
const Card = require('../models/Card');
const User = require('../models/User');
const Game = require('../models/Game');

/**
 * Sessions router factory.
 * @param {object} gameActions - { scheduleTimer, enqueueGameAction, executeCpuTurnsIfNeeded }
 */
module.exports = (gameActions) => {
    const { scheduleTimer, enqueueGameAction, executeCpuTurnsIfNeeded } = gameActions;
    const router = express.Router();

    /**
     * GET /api/sessions
     */
    router.get('/', requireAuth, async (req, res) => {
        try {
            const userId = req.user.id;
            const sessions = await Session.find({
                $or: [
                    { 'players.userId': userId },
                    {
                        status: 'waiting',
                        $or: [
                            { isPublic: true },
                            { isPublic: { $exists: false } },
                        ],
                    },
                ],
            }).sort({ updatedAt: -1 }).lean();
            res.json({ sessions });
        } catch (err) {
            console.error('GET /api/sessions error:', err);
            res.status(500).json({ error: 'Failed to fetch sessions' });
        }
    });

    /**
     * DELETE /api/sessions/completed
     */
    router.delete('/completed', requireAuth, async (req, res) => {
        try {
            const ownedCompleted = await Session.find({
                status: 'finished',
                'host.userId': req.user.id,
            }).select('_id').lean();

            const deletedIds = ownedCompleted.map((s) => String(s._id));
            if (deletedIds.length === 0) return res.json({ deletedCount: 0, deletedIds: [] });

            await Session.deleteMany({ _id: { $in: deletedIds } });
            res.json({ deletedCount: deletedIds.length, deletedIds });
        } catch (err) {
            console.error('DELETE /api/sessions/completed error:', err);
            res.status(500).json({ error: 'Failed to clear completed sessions' });
        }
    });

    /**
     * POST /api/sessions
     */
    router.post('/', requireAuth, async (req, res) => {
        try {
            const { name, settings = {}, isPublic = true } = req.body;
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
                isPublic: isPublic !== false,
                settings: {
                    startingHp: Number(settings.startingHp) || 20,
                    maxBattlers: settings.maxBattlers ? Number(settings.maxBattlers) : null,
                    teamMode: settings.teamMode === 'teams' ? 'teams' : 'ffa',
                    allowCustomCards: settings.allowCustomCards !== false,
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
     */
    router.post('/join', requireAuth, async (req, res) => {
        try {
            const { joinCode } = req.body;
            if (!joinCode) return res.status(400).json({ error: 'Join code is required' });

            const session = await Session.findOne({ joinCode: joinCode.toUpperCase().trim() });
            if (!session) return res.status(404).json({ error: 'Session not found' });
            if (session.status !== 'waiting') return res.status(409).json({ error: 'Session is no longer open' });

            const alreadyIn = session.players.some((p) => String(p.userId) === req.user.id);
            if (alreadyIn) return res.json({ session });

            const SLOTS = ['player1', 'player2', 'player3', 'player4', 'player5', 'player6'];
            const usedSlots = new Set([
                ...session.players.map((p) => p.slot),
                ...(session.cpuSlots || []).map((c) => c.slot),
            ]);
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
     */
    router.post('/:id/join', requireAuth, async (req, res) => {
        try {
            const session = await Session.findById(req.params.id);
            if (!session) return res.status(404).json({ error: 'Session not found' });
            if (session.status !== 'waiting') return res.status(409).json({ error: 'Session is no longer open' });

            const alreadyIn = session.players.some((p) => String(p.userId) === req.user.id);
            if (alreadyIn) return res.json({ session });

            const SLOTS = ['player1', 'player2', 'player3', 'player4', 'player5', 'player6'];
            const usedSlots = new Set([
                ...session.players.map((p) => p.slot),
                ...(session.cpuSlots || []).map((c) => c.slot),
            ]);
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
     */
    router.get('/:id', requireAuth, async (req, res) => {
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
     * Host starts the game.
     */
    router.post('/:id/start', requireAuth, async (req, res) => {
        try {
            const session = await Session.findById(req.params.id);
            if (!session) return res.status(404).json({ error: 'Session not found' });
            if (String(session.host.userId) !== req.user.id) return res.status(403).json({ error: 'Only the host can start the game' });
            if (session.status !== 'waiting') return res.status(409).json({ error: 'Session already started' });
            const totalPlayers = session.players.length + (session.cpuSlots?.length || 0);
            if (totalPlayers < 2) return res.status(409).json({ error: 'Need at least 2 players (including CPUs) to start' });

            const notReady = session.players.filter((p) => p.deckStatus !== 'ready');
            if (notReady.length > 0) {
                const names = notReady.map((p) => p.username).join(', ');
                return res.status(409).json({ error: `Waiting for players to choose a deck: ${names}` });
            }

            const humanDeckIds = [...new Set(session.players.flatMap((p) => p.selectedDeck || []))];
            const cpuDeckIds = [...new Set((session.cpuSlots || []).flatMap((c) => c.selectedDeck || []))];
            const selectedIds = [...new Set([...humanDeckIds, ...cpuDeckIds])];
            const selectedDeckCards = selectedIds.length > 0
                ? await Card.find({ id: { $in: selectedIds } }).lean()
                : [];
            const cardById = new Map(selectedDeckCards.map((c) => [c.id, cloneCardForGame(c)]));

            const playerUserIds = session.players.map((p) => p.userId).filter(Boolean);
            const playerUsers = await User.find({ _id: { $in: playerUserIds } }).select('_id avatarUrl').lean();
            const avatarByUserId = new Map(playerUsers.map((u) => [String(u._id), u.avatarUrl || '']));

            const SLOT_ORDER = ['player1', 'player2', 'player3', 'player4', 'player5', 'player6'];
            const combined = [
                ...session.players.map((p) => ({
                    name: p.username,
                    team: p.team,
                    slot: p.slot,
                    isBot: false,
                    image: avatarByUserId.get(String(p.userId)) || '',
                    selectedDeck: (p.selectedDeck || []).map((id) => cardById.get(id)).filter(Boolean),
                })),
                ...(session.cpuSlots || []).map((c) => ({
                    name: c.name,
                    team: c.team ?? null,
                    slot: c.slot,
                    isBot: true,
                    cpuSkill: c.cpuSkill ?? 2,
                    selectedDeck: (c.selectedDeck || []).length >= 3
                        ? (c.selectedDeck || []).map((id) => cardById.get(id)).filter(Boolean)
                        : [],
                })),
            ].sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));

            const playerConfigs = combined.map((p, i) => ({
                id: `player${i + 1}`,
                name: p.name,
                image: p.image,
                team: session.settings?.teamMode === 'teams' ? (p.team || null) : null,
                isBot: p.isBot,
                cpuSkill: p.isBot ? (p.cpuSkill ?? 2) : undefined,
                selectedDeck: p.selectedDeck,
            }));

            const settings = {
                startingHp: session.settings?.startingHp ?? 20,
                maxBattlers: session.settings?.maxBattlers ?? null,
                deckSize: session.settings?.deckSize ?? null,
                teamMode: session.settings?.teamMode ?? 'ffa',
                turnTimeLimit: session.settings?.turnTimeLimit ?? 86400,
                microgameDifficulty: session.settings?.microgameDifficulty ?? 1,
            };

            const gameId = uuidv4();
            const state = createGame(playerConfigs, settings);

            await Game.create({ gameId, state });
            session.gameId = gameId;
            session.status = 'in-progress';
            session.currentTurn = state.currentTurn;
            session.turnStartedAt = state.turnStartedAt ? new Date(state.turnStartedAt) : null;
            await session.save();

            res.json({ session, gameId, state });

            scheduleTimer(gameId, state);

            const firstPlayer = state.players.find((p) => p.id === state.currentTurn);
            if (firstPlayer?.isBot) {
                enqueueGameAction(gameId, () => executeCpuTurnsIfNeeded(gameId));
            }
        } catch (err) {
            console.error('POST /api/sessions/:id/start error:', err);
            res.status(500).json({ error: 'Failed to start game' });
        }
    });

    /**
     * DELETE /api/sessions/:id
     */
    router.delete('/:id', requireAuth, async (req, res) => {
        try {
            const session = await Session.findById(req.params.id);
            if (!session) return res.status(404).json({ error: 'Session not found' });
            if (String(session.host.userId) !== req.user.id) return res.status(403).json({ error: 'Only the host can delete the session' });
            if (session.status === 'in-progress') return res.status(409).json({ error: 'Cannot delete a session that is in progress' });

            await Session.deleteOne({ _id: req.params.id });
            res.status(204).send();
        } catch (err) {
            console.error('DELETE /api/sessions/:id error:', err);
            res.status(500).json({ error: 'Failed to delete session' });
        }
    });

    /**
     * DELETE /api/sessions/:id/leave
     */
    router.delete('/:id/leave', requireAuth, async (req, res) => {
        try {
            const session = await Session.findById(req.params.id);
            if (!session) return res.status(404).json({ error: 'Session not found' });
            if (session.status !== 'waiting') return res.status(409).json({ error: 'Cannot leave a session that has already started' });
            if (String(session.host.userId) === req.user.id) return res.status(400).json({ error: 'Host cannot leave — delete the session instead' });

            session.players = session.players.filter((p) => String(p.userId) !== req.user.id);
            await session.save();
            res.status(204).send();
        } catch (err) {
            console.error('DELETE /api/sessions/:id/leave error:', err);
            res.status(500).json({ error: 'Failed to leave session' });
        }
    });

    /**
     * PATCH /api/sessions/:id/settings
     */
    router.patch('/:id/settings', requireAuth, async (req, res) => {
        try {
            const session = await Session.findById(req.params.id);
            if (!session) return res.status(404).json({ error: 'Session not found' });
            if (String(session.host.userId) !== req.user.id) return res.status(403).json({ error: 'Only the host can update settings' });
            if (session.status !== 'waiting') return res.status(409).json({ error: 'Cannot change settings after game starts' });

            const { startingHp, maxBattlers, deckSize, teamMode, turnTimeLimit, microgameDifficulty, allowCustomCards } = req.body;
            if (startingHp !== undefined) session.settings.startingHp = Number(startingHp);
            if (maxBattlers !== undefined) session.settings.maxBattlers = maxBattlers === null ? null : Number(maxBattlers);
            if (deckSize !== undefined) session.settings.deckSize = deckSize === null ? null : Number(deckSize);
            if (teamMode !== undefined) session.settings.teamMode = teamMode === 'teams' ? 'teams' : 'ffa';
            if (turnTimeLimit !== undefined) session.settings.turnTimeLimit = turnTimeLimit === null ? null : Math.max(60, Number(turnTimeLimit));
            if (microgameDifficulty !== undefined) session.settings.microgameDifficulty = Math.min(5, Math.max(1, Number(microgameDifficulty) || 1));
            if (allowCustomCards !== undefined) session.settings.allowCustomCards = !!allowCustomCards;
            session.markModified('settings');
            await session.save();

            res.json({ session });
        } catch (err) {
            console.error('PATCH /api/sessions/:id/settings error:', err);
            res.status(500).json({ error: 'Failed to update settings' });
        }
    });

    /**
     * PATCH /api/sessions/:id/visibility
     */
    router.patch('/:id/visibility', requireAuth, async (req, res) => {
        try {
            const session = await Session.findById(req.params.id);
            if (!session) return res.status(404).json({ error: 'Session not found' });
            if (String(session.host.userId) !== req.user.id) return res.status(403).json({ error: 'Only the host can change visibility' });
            if (session.status !== 'waiting') return res.status(409).json({ error: 'Cannot change visibility after game starts' });

            const { isPublic } = req.body;
            if (typeof isPublic !== 'boolean') return res.status(400).json({ error: 'isPublic must be a boolean' });

            session.isPublic = isPublic;
            await session.save();
            res.json({ session });
        } catch (err) {
            console.error('PATCH /api/sessions/:id/visibility error:', err);
            res.status(500).json({ error: 'Failed to update visibility' });
        }
    });

    /**
     * PATCH /api/sessions/:id/deck
     * Body: { deck: string[] }
     */
    router.patch('/:id/deck', requireAuth, async (req, res) => {
        try {
            const session = await Session.findById(req.params.id);
            if (!session) return res.status(404).json({ error: 'Session not found' });
            if (session.status !== 'waiting') return res.status(409).json({ error: 'Cannot change deck after game starts' });

            const player = session.players.find((p) => String(p.userId) === req.user.id);
            if (!player) return res.status(403).json({ error: 'You are not in this session' });

            const { deck } = req.body;
            if (!Array.isArray(deck)) return res.status(400).json({ error: 'deck must be an array of card IDs' });
            if (deck.length < 3 || deck.length > 10) return res.status(400).json({ error: 'Deck must contain 3–10 cards' });
            const dbCards = await Card.find({ id: { $in: deck } }).select('id official').lean();
            const knownIds = new Set(dbCards.map((c) => c.id));
            const unknown = deck.filter((id) => !knownIds.has(id));
            if (unknown.length > 0) return res.status(400).json({ error: `Unknown card IDs: ${unknown.join(', ')}` });

            if (session.settings?.allowCustomCards === false) {
                const officialIds = new Set(dbCards.filter((c) => c.official).map((c) => c.id));
                const disallowed = deck.filter((id) => !officialIds.has(id));
                if (disallowed.length > 0) {
                    return res.status(400).json({ error: 'Custom cards are disabled in this lobby' });
                }
            }

            const unique = [...new Set(deck)];
            if (unique.length < 3) return res.status(400).json({ error: 'Deck must contain at least 3 distinct cards' });

            player.selectedDeck = unique;
            player.deckStatus = 'ready';
            session.markModified('players');
            await session.save();

            res.json({ session });
        } catch (err) {
            console.error('PATCH /api/sessions/:id/deck error:', err);
            res.status(500).json({ error: 'Failed to update deck' });
        }
    });

    /**
     * PATCH /api/sessions/:id/players/:slot/team
     */
    router.patch('/:id/players/:slot/team', requireAuth, async (req, res) => {
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

    /**
     * POST /api/sessions/:id/cpu
     */
    router.post('/:id/cpu', requireAuth, async (req, res) => {
        try {
            const session = await Session.findById(req.params.id);
            if (!session) return res.status(404).json({ error: 'Session not found' });
            if (String(session.host.userId) !== req.user.id) return res.status(403).json({ error: 'Only the host can add CPUs' });
            if (session.status !== 'waiting') return res.status(409).json({ error: 'Cannot add CPU after game starts' });

            const SLOTS = ['player1', 'player2', 'player3', 'player4', 'player5', 'player6'];
            const usedSlots = new Set([
                ...session.players.map((p) => p.slot),
                ...(session.cpuSlots || []).map((c) => c.slot),
            ]);
            const nextSlot = SLOTS.find((s) => !usedSlots.has(s));
            if (!nextSlot) return res.status(409).json({ error: 'Session is full' });

            const cpuNumber = (session.cpuSlots?.length || 0) + 1;
            session.cpuSlots = session.cpuSlots || [];
            session.cpuSlots.push({ slot: nextSlot, name: `CPU ${cpuNumber}` });
            session.markModified('cpuSlots');
            await session.save();

            res.json({ session });
        } catch (err) {
            console.error('POST /api/sessions/:id/cpu error:', err);
            res.status(500).json({ error: 'Failed to add CPU' });
        }
    });

    /**
     * DELETE /api/sessions/:id/cpu/:slot
     */
    router.delete('/:id/cpu/:slot', requireAuth, async (req, res) => {
        try {
            const session = await Session.findById(req.params.id);
            if (!session) return res.status(404).json({ error: 'Session not found' });
            if (String(session.host.userId) !== req.user.id) return res.status(403).json({ error: 'Only the host can remove CPUs' });
            if (session.status !== 'waiting') return res.status(409).json({ error: 'Cannot remove CPU after game starts' });

            session.cpuSlots = (session.cpuSlots || []).filter((c) => c.slot !== req.params.slot);
            session.markModified('cpuSlots');
            await session.save();

            res.json({ session });
        } catch (err) {
            console.error('DELETE /api/sessions/:id/cpu/:slot error:', err);
            res.status(500).json({ error: 'Failed to remove CPU' });
        }
    });

    /**
     * PATCH /api/sessions/:id/cpu/:slot/deck
     */
    router.patch('/:id/cpu/:slot/deck', requireAuth, async (req, res) => {
        try {
            const session = await Session.findById(req.params.id);
            if (!session) return res.status(404).json({ error: 'Session not found' });
            if (String(session.host.userId) !== req.user.id) return res.status(403).json({ error: 'Only the host can set CPU decks' });
            if (session.status !== 'waiting') return res.status(409).json({ error: 'Cannot change deck after game starts' });

            const cpu = (session.cpuSlots || []).find((c) => c.slot === req.params.slot);
            if (!cpu) return res.status(404).json({ error: 'CPU slot not found' });

            const { deck } = req.body;
            if (!Array.isArray(deck)) return res.status(400).json({ error: 'deck must be an array of card IDs' });
            if (deck.length < 3 || deck.length > 10) return res.status(400).json({ error: 'Deck must contain 3–10 cards' });

            const dbCards = await Card.find({ id: { $in: deck } }).select('id official').lean();
            const knownIds = new Set(dbCards.map((c) => c.id));
            const unknown = deck.filter((id) => !knownIds.has(id));
            if (unknown.length > 0) return res.status(400).json({ error: `Unknown card IDs: ${unknown.join(', ')}` });

            if (session.settings?.allowCustomCards === false) {
                const officialIds = new Set(dbCards.filter((c) => c.official).map((c) => c.id));
                const disallowed = deck.filter((id) => !officialIds.has(id));
                if (disallowed.length > 0) return res.status(400).json({ error: 'Custom cards are disabled in this lobby' });
            }

            cpu.selectedDeck = [...new Set(deck)];
            session.markModified('cpuSlots');
            await session.save();

            res.json({ session });
        } catch (err) {
            console.error('PATCH /api/sessions/:id/cpu/:slot/deck error:', err);
            res.status(500).json({ error: 'Failed to set CPU deck' });
        }
    });

    /**
     * PATCH /api/sessions/:id/cpu/:slot/team
     */
    router.patch('/:id/cpu/:slot/team', requireAuth, async (req, res) => {
        try {
            const session = await Session.findById(req.params.id);
            if (!session) return res.status(404).json({ error: 'Session not found' });
            if (String(session.host.userId) !== req.user.id) return res.status(403).json({ error: 'Only the host can assign CPU teams' });
            if (session.status !== 'waiting') return res.status(409).json({ error: 'Cannot change teams after game starts' });

            const cpu = (session.cpuSlots || []).find((c) => c.slot === req.params.slot);
            if (!cpu) return res.status(404).json({ error: 'CPU slot not found' });

            const { team } = req.body;
            if (team !== null && !['A', 'B', 'C'].includes(team)) return res.status(400).json({ error: 'Team must be A, B, C, or null' });
            cpu.team = team;
            session.markModified('cpuSlots');
            await session.save();

            res.json({ session });
        } catch (err) {
            console.error('PATCH /api/sessions/:id/cpu/:slot/team error:', err);
            res.status(500).json({ error: 'Failed to set CPU team' });
        }
    });

    /**
     * PATCH /api/sessions/:id/cpu/:slot/skill
     */
    router.patch('/:id/cpu/:slot/skill', requireAuth, async (req, res) => {
        try {
            const session = await Session.findById(req.params.id);
            if (!session) return res.status(404).json({ error: 'Session not found' });
            if (String(session.host.userId) !== req.user.id) return res.status(403).json({ error: 'Only the host can change CPU skill' });
            if (session.status !== 'waiting') return res.status(409).json({ error: 'Cannot change CPU skill after game starts' });

            const cpu = (session.cpuSlots || []).find((c) => c.slot === req.params.slot);
            if (!cpu) return res.status(404).json({ error: 'CPU slot not found' });

            const skill = parseInt(req.body.cpuSkill, 10);
            if (!skill || skill < 1 || skill > 5) return res.status(400).json({ error: 'cpuSkill must be 1–5' });

            cpu.cpuSkill = skill;
            session.markModified('cpuSlots');
            await session.save();

            res.json({ session });
        } catch (err) {
            console.error('PATCH /api/sessions/:id/cpu/:slot/skill error:', err);
            res.status(500).json({ error: 'Failed to set CPU skill' });
        }
    });

    /**
     * GET /api/sessions/:id/messages
     */
    router.get('/:id/messages', requireAuth, async (req, res) => {
        try {
            const session = await Session.findById(req.params.id).lean();
            if (!session) return res.status(404).json({ error: 'Session not found' });
            const isMember = session.players.some((p) => p.username === req.user.username);
            if (!isMember) return res.status(403).json({ error: 'Not a member of this session' });

            const Message = require('../models/Message');
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

    return router;
};

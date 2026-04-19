'use strict';

const Session = require('../models/Session');
const Message = require('../models/Message');

/**
 * Registers all chat socket event handlers on `io`.
 *
 * @param {import('socket.io').Server} io
 */
module.exports = (io) => {
    /**
     * Returns the canonical DM room name for two users.
     */
    const dmRoom = (a, b) => {
        const [u1, u2] = [a, b].sort();
        return `dm:${u1}:${u2}`;
    };

    io.on('connection', (socket) => {
        const { username } = socket.user;

        // ── Lobby chat ────────────────────────────────────────────────────────

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

        // ── DM chat ───────────────────────────────────────────────────────────

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

                io.to(`user:${username}`).emit('dm:message', payload);
                io.to(`user:${toUsername}`).emit('dm:message', payload);
            } catch (err) {
                console.error('dm:message error:', err);
            }
        });
    });
};

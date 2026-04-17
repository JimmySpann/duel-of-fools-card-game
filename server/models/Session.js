'use strict';

const mongoose = require('mongoose');

const playerSlotSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        username: { type: String, required: true },
        slot: { type: String, enum: ['player1', 'player2'], required: true },
    },
    { _id: false }
);

const sessionSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true, maxlength: 40 },
        joinCode: { type: String, required: true, unique: true, index: true },
        host: {
            userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
            username: { type: String, required: true },
        },
        players: [playerSlotSchema],
        // 'waiting' → lobby open, 'in-progress' → game running, 'finished' → game over
        status: { type: String, enum: ['waiting', 'in-progress', 'finished'], default: 'waiting' },
        gameId: { type: String, default: null }, // UUID, set when game starts
    },
    { timestamps: true }
);

// Auto-expire finished/waiting sessions after 24 hours
sessionSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 86400 });

module.exports = mongoose.model('Session', sessionSchema);

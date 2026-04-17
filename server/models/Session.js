'use strict';

const mongoose = require('mongoose');

const VALID_SLOTS = ['player1', 'player2', 'player3', 'player4', 'player5', 'player6'];
const VALID_TEAMS = ['A', 'B', 'C', null];

const playerSlotSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        username: { type: String, required: true },
        slot: { type: String, enum: VALID_SLOTS, required: true },
        team: { type: String, enum: VALID_TEAMS, default: null },
    },
    { _id: false }
);

const cpuSlotSchema = new mongoose.Schema(
    {
        slot: { type: String, enum: VALID_SLOTS, required: true },
        name: { type: String, default: 'CPU', maxlength: 20 },
    },
    { _id: false }
);

const settingsSchema = new mongoose.Schema(
    {
        startingHp: { type: Number, default: 20, min: 1, max: 200 },
        maxBattlers: { type: Number, default: null, min: 1, max: 20 }, // null = auto-scale
        deckSize: { type: Number, default: null, min: 4, max: 50 },   // null = all cards
        teamMode: { type: String, enum: ['ffa', 'teams'], default: 'ffa' },
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
        players: { type: [playerSlotSchema], default: [] },
        cpuSlots: { type: [cpuSlotSchema], default: [] },
        settings: { type: settingsSchema, default: () => ({}) },
        // 'waiting' → lobby open, 'in-progress' → game running, 'finished' → game over
        status: { type: String, enum: ['waiting', 'in-progress', 'finished'], default: 'waiting' },
        gameId: { type: String, default: null },
        currentTurn: { type: String, default: null },
    },
    { timestamps: true }
);

// Auto-expire sessions after 24 hours of inactivity
sessionSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 86400 });

module.exports = mongoose.model('Session', sessionSchema);


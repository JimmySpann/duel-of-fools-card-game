'use strict';

const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema(
    {
        gameId: { type: String, required: true, unique: true, index: true },
        state: { type: mongoose.Schema.Types.Mixed, required: true },
    },
    {
        timestamps: true, // createdAt, updatedAt managed automatically
    }
);

// Auto-expire documents after 2 hours of inactivity (uses updatedAt)
gameSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 7200 });

module.exports = mongoose.model('Game', gameSchema);

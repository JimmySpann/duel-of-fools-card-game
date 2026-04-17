'use strict';

const mongoose = require('mongoose');

/**
 * A single chat message.
 *
 * Lobby message:  sessionId is set, toUsername is null.
 * DM message:     sessionId is null, toUsername is set.
 *   fromUsername + toUsername are stored as a sorted pair so either direction
 *   can be queried with the same compound index.
 */
const messageSchema = new mongoose.Schema(
    {
        fromUsername: { type: String, required: true, index: true },
        toUsername: { type: String, default: null, index: true },   // null → lobby
        sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', default: null, index: true },
        text: { type: String, required: true, maxlength: 1000, trim: true },
    },
    { timestamps: true }
);

// Compound index for fetching all messages in a lobby (chronological)
messageSchema.index({ sessionId: 1, createdAt: 1 });

// Compound index for a DM thread between two users (chronological)
// We always store the sorted pair so (A→B) and (B→A) share the same query.
messageSchema.index({ fromUsername: 1, toUsername: 1, createdAt: 1 });

module.exports = mongoose.model('Message', messageSchema);

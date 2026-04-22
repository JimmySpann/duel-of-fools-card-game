'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const savedAbilitySchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true, maxlength: 60 },
        actionInfo: { type: String, trim: true, maxlength: 120, default: '' },
        description: { type: String, trim: true, maxlength: 300, default: '' },
        limit: { type: Number, default: 2, min: 1, max: 30 },
        type: { type: String, trim: true, maxlength: 20, default: '' },
        microevent: { type: mongoose.Schema.Types.Mixed, default: null },
        customConfig: { type: mongoose.Schema.Types.Mixed, default: null },
        savedAt: { type: Date, default: Date.now },
    },
    { _id: false }
);

const userSchema = new mongoose.Schema(
    {
        username: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            minlength: 3,
            maxlength: 24,
            match: /^[a-zA-Z0-9_]+$/,
        },
        passwordHash: { type: String, required: true },
        displayName: { type: String, trim: true, maxlength: 40, default: '' },
        avatarUrl: { type: String, trim: true, maxlength: 500, default: '' },
        censorAdultCards: { type: Boolean, default: true },
        friends: [{ type: String }],
        friendRequests: [{ type: String }],
        blocked: [{ type: String }],
        pushSubscriptions: [{
            endpoint: { type: String, required: true },
            expirationTime: { type: mongoose.Schema.Types.Mixed, default: null },
            keys: {
                p256dh: { type: String, required: true },
                auth: { type: String, required: true },
            },
        }],
        savedDecks: [{
            name: { type: String, required: true, trim: true, maxlength: 40 },
            cardIds: [{ type: String }],
            isPublic: { type: Boolean, default: false },
        }],
        savedAbilities: { type: [savedAbilitySchema], default: [] },
    },
    { timestamps: true }
);

userSchema.methods.verifyPassword = function (plain) {
    return bcrypt.compare(plain, this.passwordHash);
};

userSchema.statics.hashPassword = function (plain) {
    return bcrypt.hash(plain, 12);
};

module.exports = mongoose.model('User', userSchema);

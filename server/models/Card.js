'use strict';

const mongoose = require('mongoose');

const abilitySchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true, maxlength: 60 },
        actionInfo: { type: String, required: true, trim: true, maxlength: 120 },
        description: { type: String, required: true, trim: true, maxlength: 300 },
        limit: { type: Number, required: true, min: 1, max: 30 },
        usesRemaining: { type: Number, required: true, min: 0, max: 30 },
        type: { type: String, trim: true, maxlength: 20, default: '' },
        microevent: { type: mongoose.Schema.Types.Mixed, default: null },
        customConfig: { type: mongoose.Schema.Types.Mixed, default: null },
    },
    { _id: false }
);

const passiveSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true, maxlength: 60 },
        effect: { type: String, required: true, trim: true, maxlength: 120 },
        description: { type: String, required: true, trim: true, maxlength: 300 },
        type: { type: String, trim: true, maxlength: 20, default: '' },
    },
    { _id: false }
);

const versionSchema = new mongoose.Schema(
    {
        editedAt: { type: Date, default: Date.now },
        editedBy: { type: String, required: true },
        snapshot: { type: mongoose.Schema.Types.Mixed, required: true },
    },
    { _id: false }
);

const cardSchema = new mongoose.Schema(
    {
        id: { type: String, required: true, unique: true, index: true },
        name: { type: String, required: true, trim: true, maxlength: 60 },
        type: { type: String, default: 'Battler' },
        image: { type: String, required: true, trim: true, maxlength: 1000 },
        description: { type: String, default: '', trim: true, maxlength: 500 },
        elements: { type: mongoose.Schema.Types.Mixed, default: {} },
        passives: { type: [passiveSchema], default: [] },
        actions: { type: [abilitySchema], default: [] },
        defense: { type: Number, required: true, min: 0, max: 20 },
        evasion: { type: Number, required: true, min: 0, max: 20 },
        health: { type: Number, required: true, min: 1, max: 30 },
        attack: { type: Number, required: true, min: 0, max: 20 },
        agility: { type: Number, required: true, min: 0, max: 20 },
        official: { type: Boolean, default: false, index: true },
        adultOnly: { type: Boolean, default: false, index: true },
        verified: { type: Boolean, default: false, index: true },
        visibility: { type: String, enum: ['public', 'private'], default: 'public' },
        createdBy: { type: String, required: true, index: true },
        category: { type: String, default: 'unknown', index: true },
        sourceCardId: { type: String, default: null },
        reports: {
            count: { type: Number, default: 0 },
            entries: {
                type: [{ reporter: String, reason: String, createdAt: { type: Date, default: Date.now } }],
                default: [],
            },
        },
        versions: { type: [versionSchema], default: [] },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Card', cardSchema);

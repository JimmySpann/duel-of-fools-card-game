'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

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

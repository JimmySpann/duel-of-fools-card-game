'use strict';

require('dotenv').config();

const http = require('http');
const https = require('https');
const express = require('express');
const { Server: SocketIOServer } = require('socket.io');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const webpush = require('web-push');
const { createGame, dispatch, computeCpuTurn, ABILITY_TARGETS, getAbilityTarget } = require('./game/engine');
const {
    MAX_CUSTOM_ABILITY_POWER,
    MAX_TOTAL_CUSTOM_ABILITY_POWER,
    estimateCustomAbilityPower,
    validateCustomAbilityPowerBudget,
    validateTotalCustomAbilityPowerBudget,
} = require('./game/customAbilityPower');
const Game = require('./models/Game');
const User = require('./models/User');
const Session = require('./models/Session');
const Message = require('./models/Message');
const Card = require('./models/Card');
const officialCards = require('./game/cards');

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

// ── Push notifications (VAPID) ────────────────────────────────────────────────
const VAPID_PUSH_ENABLED = !!(
    process.env.VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY &&
    process.env.VAPID_SUBJECT
);
if (VAPID_PUSH_ENABLED) {
    webpush.setVapidDetails(
        process.env.VAPID_SUBJECT,
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY,
    );
    console.log('Push notifications: enabled');
} else {
    console.warn('Push notifications: disabled (VAPID keys not set in .env)');
}

mongoose
    .connect(MONGO_URI)
    .then(async () => {
        console.log('Connected to MongoDB');
        await seedOfficialCards();
    })
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

const CARD_ID_PREFIX = 'cc_';
const MAX_CARD_POINTS = 48;

const cloneCardForGame = (card) => ({
    id: card.id,
    name: card.name,
    elements: card.elements || {},
    type: card.type || 'Battler',
    image: card.image,
    description: card.description || '',
    passives: (card.passives || []).map((p) => ({ ...p })),
    actions: (card.actions || []).map((a) => ({ ...a })),
    defense: Number(card.defense) || 0,
    evasion: Number(card.evasion) || 0,
    health: Number(card.health) || 1,
    attack: Number(card.attack) || 0,
    agility: Number(card.agility) || 0,
});

const serializeCardForClient = (card) => ({
    ...cloneCardForGame(card),
    official: !!card.official,
    adultOnly: !!card.adultOnly,
    visibility: card.visibility || 'public',
    createdBy: card.createdBy || 'system',
    sourceCardId: card.sourceCardId || null,
    reportCount: Number(card?.reports?.count || 0),
    versionCount: Array.isArray(card.versions) ? card.versions.length : 0,
    updatedAt: card.updatedAt,
    createdAt: card.createdAt,
});

const toVersionSnapshot = (cardLike, editedBy) => ({
    editedAt: new Date(),
    editedBy,
    snapshot: {
        name: cardLike.name,
        type: cardLike.type,
        image: cardLike.image,
        description: cardLike.description,
        elements: cardLike.elements,
        passives: cardLike.passives,
        actions: cardLike.actions,
        defense: cardLike.defense,
        evasion: cardLike.evasion,
        health: cardLike.health,
        attack: cardLike.attack,
        agility: cardLike.agility,
        adultOnly: !!cardLike.adultOnly,
    },
});

const sanitizeCardId = (value) => {
    const cleaned = String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 40);
    return cleaned || `card_${Date.now()}`;
};

const isValidImageUrl = (value) => /^https?:\/\/.{5,1000}$/i.test(String(value || ''));

const abilityCatalog = (() => {
    const byName = new Map();
    for (const c of officialCards) {
        for (const a of c.actions || []) {
            if (!a?.name || byName.has(a.name)) continue;
            byName.set(a.name, {
                name: a.name,
                actionInfo: a.actionInfo || '',
                description: a.description || '',
                limit: a.limit || 1,
                usesRemaining: a.limit || 1,
                type: a.type || '',
                microevent: a.microevent || null,
            });
        }
    }
    return byName;
})();

const buildActionsFromNames = (abilityNames = []) =>
    abilityNames
        .map((name) => abilityCatalog.get(name))
        .filter(Boolean)
        .map((a) => ({ ...a }));

const ALLOWED_TARGET_TYPES = new Set(['self', 'enemyCard', 'allyCard', 'allEnemies', 'allAllies']);
const ALLOWED_EFFECT_TYPES = new Set(['damage', 'status', 'heal', 'healSelf', 'cleanse', 'resetCooldowns', 'selfDestruct']);
const ALLOWED_STATUS_TYPES = new Set(['burned', 'frozen', 'def_up', 'def_down', 'poisoned', 'bleeding', 'shielded', 'invulnerable', 'invisible', 'focused', 'damage_reduction', 'eva_up']);
const ALLOWED_CLEANSE_DEBUFFS = ['burned', 'frozen', 'poisoned', 'bleeding', 'def_down'];
const ALLOWED_MICROEVENT_TYPES = new Set(['qte', 'mash', 'pattern', 'rhythm', 'quiz', 'parry', 'route', 'sigil', 'arrow']);
const ALLOWED_MICROEVENT_OUTCOMES = new Set(['binary', 'scaled']);

const clampNum = (value, min, max, fallback = min) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
};

const validateCustomAbility = (ability, index) => {
    const at = `Custom ability #${index + 1}`;
    const name = String(ability?.name || '').trim();
    if (!name || name.length > 60) return `${at}: name is required (1-60 chars)`;
    if (abilityCatalog.has(name)) return `${at}: name conflicts with an official ability`;

    const targetType = String(ability?.targetType || '');
    if (!ALLOWED_TARGET_TYPES.has(targetType)) return `${at}: invalid target type`;

    const limit = Number(ability?.limit);
    if (!Number.isFinite(limit) || limit < 1 || limit > 10) return `${at}: limit must be between 1 and 10`;

    const effects = Array.isArray(ability?.effects) ? ability.effects : [];
    if (effects.length < 1 || effects.length > 3) return `${at}: choose 1-3 effects`;

    for (let i = 0; i < effects.length; i += 1) {
        const e = effects[i] || {};
        const effectLabel = `${at}, effect #${i + 1}`;
        if (!ALLOWED_EFFECT_TYPES.has(e.type)) return `${effectLabel}: invalid effect type`;

        if (e.type === 'damage') {
            if (e.multiplier !== undefined) {
                const m = Number(e.multiplier);
                if (!Number.isFinite(m) || m < 0.5 || m > 3) return `${effectLabel}: multiplier must be between 0.5 and 3`;
            }
            if (e.flatBonus !== undefined) {
                const b = Number(e.flatBonus);
                if (!Number.isFinite(b) || b < -5 || b > 8) return `${effectLabel}: flatBonus must be between -5 and 8`;
            }
            if (e.defPiercing !== undefined) {
                const p = Number(e.defPiercing);
                if (!Number.isFinite(p) || p < 0 || p > 8) return `${effectLabel}: defPiercing must be between 0 and 8`;
            }
            if (e.repeat !== undefined) {
                const r = Number(e.repeat);
                if (!Number.isFinite(r) || r < 1 || r > 5) return `${effectLabel}: repeat must be between 1 and 5`;
            }
        }

        if (e.type === 'status') {
            const status = String(e.status || '');
            if (!ALLOWED_STATUS_TYPES.has(status)) return `${effectLabel}: invalid status`;
            const value = Number(e.value);
            const duration = Number(e.duration);
            if (!Number.isFinite(value) || value < 1 || value > 8) return `${effectLabel}: value must be between 1 and 8`;
            if (!Number.isFinite(duration) || duration < 1 || duration > 6) return `${effectLabel}: duration must be between 1 and 6`;
        }

        if (e.type === 'heal' || e.type === 'healSelf') {
            const amount = Number(e.amount);
            if (!Number.isFinite(amount) || amount < 1 || amount > 12) return `${effectLabel}: amount must be between 1 and 12`;
        }

        if (e.type === 'cleanse') {
            const debuffs = Array.isArray(e.debuffs) ? e.debuffs : [];
            if (debuffs.length < 1) return `${effectLabel}: choose at least one debuff`;
            if (debuffs.some((d) => !ALLOWED_CLEANSE_DEBUFFS.includes(d))) return `${effectLabel}: invalid debuff choice`;
        }
    }

    if (ability?.microevent) {
        const mType = String(ability.microevent.type || '');
        const mOutcome = String(ability.microevent.outcome || '');
        if (!ALLOWED_MICROEVENT_TYPES.has(mType)) return `${at}: invalid microevent type`;
        if (!ALLOWED_MICROEVENT_OUTCOMES.has(mOutcome)) return `${at}: invalid microevent outcome`;
    }

    const powerError = validateCustomAbilityPowerBudget({ ...ability, limit }, at);
    if (powerError) return powerError;

    return null;
};

const summarizeEffects = (effects = []) => effects
    .map((e) => {
        if (e.type === 'damage') return `Damage x${e.multiplier ?? 1}`;
        if (e.type === 'status') return `${e.status} ${e.value}/${e.duration}t`;
        if (e.type === 'heal') return `Heal ${e.amount}`;
        if (e.type === 'healSelf') return `Self-heal ${e.amount}`;
        if (e.type === 'cleanse') return `Cleanse ${e.debuffs.join(', ')}`;
        if (e.type === 'resetCooldowns') return 'Reset cooldowns';
        if (e.type === 'selfDestruct') return 'Self-destruct';
        return e.type;
    })
    .join(' | ');

const normalizeCustomAbility = (ability) => {
    const effects = (Array.isArray(ability.effects) ? ability.effects : []).map((raw) => {
        const e = raw || {};
        if (e.type === 'damage') {
            return {
                type: 'damage',
                ...(e.useBasicAttack ? { useBasicAttack: true } : {}),
                ...(e.ignoreDef ? { ignoreDef: true } : {}),
                ...(e.ignoreEvasion ? { ignoreEvasion: true } : {}),
                ...(e.lifesteal ? { lifesteal: true } : {}),
                ...(e.floor ? { floor: true } : {}),
                ...(e.round ? { round: true } : {}),
                ...(e.randomTarget ? { randomTarget: true } : {}),
                ...(e.multiplier !== undefined ? { multiplier: clampNum(e.multiplier, 0.5, 3, 1) } : {}),
                ...(e.flatBonus !== undefined ? { flatBonus: Math.round(clampNum(e.flatBonus, -5, 8, 0)) } : {}),
                ...(e.defPiercing !== undefined ? { defPiercing: Math.round(clampNum(e.defPiercing, 0, 8, 0)) } : {}),
                ...(e.repeat !== undefined ? { repeat: Math.round(clampNum(e.repeat, 1, 5, 1)) } : {}),
            };
        }
        if (e.type === 'status') {
            return {
                type: 'status',
                status: String(e.status),
                value: Math.round(clampNum(e.value, 1, 8, 1)),
                duration: Math.round(clampNum(e.duration, 1, 6, 1)),
            };
        }
        if (e.type === 'heal' || e.type === 'healSelf') {
            return {
                type: e.type,
                amount: Math.round(clampNum(e.amount, 1, 12, 1)),
            };
        }
        if (e.type === 'cleanse') {
            const deduped = [...new Set((Array.isArray(e.debuffs) ? e.debuffs : []).filter((d) => ALLOWED_CLEANSE_DEBUFFS.includes(d)))];
            return {
                type: 'cleanse',
                debuffs: deduped,
            };
        }
        if (e.type === 'resetCooldowns') return { type: 'resetCooldowns' };
        if (e.type === 'selfDestruct') return { type: 'selfDestruct' };
        return { type: e.type };
    });

    const limit = Math.round(clampNum(ability.limit, 1, 10, 1));
    const targetType = String(ability.targetType || 'enemyCard');
    const microevent = ability.microevent
        ? {
            type: String(ability.microevent.type),
            outcome: String(ability.microevent.outcome),
        }
        : null;

    return {
        name: String(ability.name).trim(),
        actionInfo: `${targetType} • Custom`,
        description: summarizeEffects(effects),
        limit,
        usesRemaining: limit,
        type: 'Custom',
        microevent,
        customConfig: {
            targetType,
            effects,
        },
    };
};

const buildActionsFromPayload = (payload = {}) => {
    const official = buildActionsFromNames(Array.isArray(payload.abilityNames) ? payload.abilityNames : []);
    const custom = (Array.isArray(payload.customAbilities) ? payload.customAbilities : []).map(normalizeCustomAbility);
    return [...official, ...custom];
};

const computeCardPointCost = ({ attack, defense, evasion, agility, health }) =>
    Number(attack || 0) + Number(defense || 0) + Number(evasion || 0) + Number(agility || 0) + Math.round(Number(health || 0) * 1.4);

const validateCustomCardPayload = (payload) => {
    const name = String(payload?.name || '').trim();
    if (!name || name.length > 60) return 'Card name is required (1-60 chars)';

    const image = String(payload?.image || '').trim();
    if (!isValidImageUrl(image)) return 'Image must be a valid http/https URL';

    const stats = {
        attack: Number(payload?.attack),
        defense: Number(payload?.defense),
        evasion: Number(payload?.evasion),
        agility: Number(payload?.agility),
        health: Number(payload?.health),
    };
    if (Object.values(stats).some((v) => !Number.isFinite(v))) return 'All stat fields are required';
    if (stats.attack < 0 || stats.attack > 20) return 'Attack must be between 0 and 20';
    if (stats.defense < 0 || stats.defense > 20) return 'Defense must be between 0 and 20';
    if (stats.evasion < 0 || stats.evasion > 20) return 'Evasion must be between 0 and 20';
    if (stats.agility < 0 || stats.agility > 20) return 'Agility must be between 0 and 20';
    if (stats.health < 1 || stats.health > 30) return 'Health must be between 1 and 30';

    if (computeCardPointCost(stats) > MAX_CARD_POINTS) {
        return `Card stat budget exceeded (max ${MAX_CARD_POINTS})`;
    }

    const abilityNames = Array.isArray(payload?.abilityNames) ? payload.abilityNames : [];
    const customAbilities = Array.isArray(payload?.customAbilities) ? payload.customAbilities : [];
    if (abilityNames.length + customAbilities.length < 1 || abilityNames.length + customAbilities.length > 3) return 'Select 1-3 abilities';
    const unknown = abilityNames.filter((n) => !abilityCatalog.has(n));
    if (unknown.length) return `Unknown abilities: ${unknown.join(', ')}`;
    const duplicateOfficial = abilityNames.some((n, i) => abilityNames.indexOf(n) !== i);
    if (duplicateOfficial) return 'Official abilities must be unique';

    const customNames = new Set();
    for (let i = 0; i < customAbilities.length; i += 1) {
        const err = validateCustomAbility(customAbilities[i], i);
        if (err) return err;
        const nm = String(customAbilities[i].name || '').trim().toLowerCase();
        if (customNames.has(nm)) return 'Custom ability names must be unique';
        customNames.add(nm);
        if (abilityNames.some((n) => n.toLowerCase() === nm)) return 'Custom ability names cannot duplicate selected official abilities';
    }

    const totalPowerError = validateTotalCustomAbilityPowerBudget(customAbilities);
    if (totalPowerError) return totalPowerError;

    const elements = payload?.elements && typeof payload.elements === 'object' ? payload.elements : {};

    return null;
};

const seedOfficialCards = async () => {
    const snapshots = officialCards.map((card) => cloneCardForGame(card));
    const officialIds = snapshots.map((c) => c.id);

    // Remove official cards that no longer exist in server/game/cards.js.
    if (officialIds.length === 0) {
        await Card.deleteMany({ official: true });
        return;
    }

    await Card.deleteMany({
        official: true,
        id: { $nin: officialIds },
    });

    // Overwrite official card gameplay data from code on each startup.
    for (const snapshot of snapshots) {
        await Card.updateOne(
            { id: snapshot.id },
            {
                $set: {
                    ...snapshot,
                    official: true,
                    adultOnly: false,
                    visibility: 'public',
                    createdBy: 'system',
                    sourceCardId: null,
                },
            },
            { upsert: true }
        );
    }
};

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
            censorAdultCards: user.censorAdultCards !== false,
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
            censorAdultCards: user.censorAdultCards !== false,
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
 * Body: { displayName?, avatarUrl?, censorAdultCards? }
 * Updates the user's display name and/or avatar URL.
 */
app.patch('/api/profile', requireAuth, async (req, res) => {
    try {
        const { displayName, avatarUrl, censorAdultCards } = req.body;
        if (displayName !== undefined && displayName.length > 40)
            return res.status(400).json({ error: 'Display name must be 40 characters or fewer' });
        if (avatarUrl !== undefined && !isValidUrl(avatarUrl))
            return res.status(400).json({ error: 'Avatar URL must be a valid http/https URL' });
        if (censorAdultCards !== undefined && typeof censorAdultCards !== 'boolean')
            return res.status(400).json({ error: 'censorAdultCards must be a boolean' });

        const update = {};
        if (displayName !== undefined) update.displayName = displayName.trim();
        if (avatarUrl !== undefined) update.avatarUrl = avatarUrl.trim();
        if (censorAdultCards !== undefined) update.censorAdultCards = censorAdultCards;

        const user = await User.findByIdAndUpdate(req.user.id, { $set: update }, { new: true }).select('-passwordHash').lean();
        res.json({
            username: user.username,
            displayName: user.displayName || '',
            avatarUrl: user.avatarUrl || '',
            censorAdultCards: user.censorAdultCards !== false,
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

// ── Card library routes ──────────────────────────────────────────────────────

/**
 * GET /api/cards
 * Query: q?, mine?
 */
app.get('/api/cards', requireAuth, async (req, res) => {
    try {
        const q = String(req.query.q || '').trim();
        const mine = req.query.mine === 'true';
        const filter = mine
            ? { createdBy: req.user.username }
            : { visibility: 'public' };

        if (q) {
            filter.$or = [
                { name: { $regex: q, $options: 'i' } },
                { id: { $regex: q, $options: 'i' } },
            ];
        }

        const cards = await Card.find(filter).sort({ official: -1, createdAt: -1 }).limit(300).lean();
        res.json({ cards: cards.map(serializeCardForClient) });
    } catch (err) {
        console.error('GET /api/cards error:', err);
        res.status(500).json({ error: 'Failed to fetch cards' });
    }
});

/**
 * GET /api/cards/ability-options
 */
app.get('/api/cards/ability-options', requireAuth, async (_req, res) => {
    try {
        const official = Array.from(abilityCatalog.values()).map((a) => ({
            name: a.name,
            actionInfo: a.actionInfo,
            description: a.description,
            type: a.type,
            limit: a.limit,
            microeventType: a.microevent?.type || null,
            microevent: a.microevent || null,
            target: ABILITY_TARGETS[a.name] || 'enemyCard',
            isCustom: false,
            createdBy: 'system',
            effectTypes: [],
            customConfig: null,
        }));

        const sourceCards = await Card.find({ visibility: 'public' }).select('createdBy actions').limit(300).lean();
        const seen = new Set();
        const customExamples = [];
        for (const card of sourceCards) {
            for (const action of card.actions || []) {
                if (!action?.customConfig?.targetType || !Array.isArray(action.customConfig.effects)) continue;
                const key = `${action.name}::${card.createdBy}`.toLowerCase();
                if (seen.has(key)) continue;
                seen.add(key);
                customExamples.push({
                    name: action.name,
                    actionInfo: action.actionInfo || `${action.customConfig.targetType} • Custom`,
                    description: action.description || 'Custom ability',
                    type: action.type || 'Custom',
                    limit: action.limit || 1,
                    microeventType: action.microevent?.type || null,
                    microevent: action.microevent || null,
                    target: action.customConfig.targetType,
                    isCustom: true,
                    createdBy: card.createdBy || 'Unknown',
                    effectTypes: action.customConfig.effects.map((e) => e.type).filter(Boolean),
                    customConfig: action.customConfig,
                });
            }
        }

        res.json({ abilities: [...official, ...customExamples] });
    } catch (err) {
        console.error('GET /api/cards/ability-options error:', err);
        res.status(500).json({ error: 'Failed to load ability options' });
    }
});

/**
 * POST /api/cards
 * Body: { name, image, description, elements, attack, defense, evasion, agility, health, abilityNames[], adultOnly? }
 */
app.post('/api/cards', requireAuth, async (req, res) => {
    try {
        const validationError = validateCustomCardPayload(req.body);
        if (validationError) return res.status(400).json({ error: validationError });

        const baseId = sanitizeCardId(req.body.name);
        let nextId = `${CARD_ID_PREFIX}${req.user.username}_${baseId}`;
        if (await Card.exists({ id: nextId })) {
            nextId = `${nextId}_${Date.now().toString(36).slice(-4)}`;
        }

        const card = await Card.create({
            id: nextId,
            name: String(req.body.name).trim(),
            type: 'Battler',
            image: String(req.body.image).trim(),
            description: String(req.body.description || '').trim(),
            elements: req.body.elements || {},
            passives: [],
            actions: buildActionsFromPayload(req.body),
            defense: Number(req.body.defense),
            evasion: Number(req.body.evasion),
            health: Number(req.body.health),
            attack: Number(req.body.attack),
            agility: Number(req.body.agility),
            official: false,
            adultOnly: !!req.body.adultOnly,
            visibility: 'public',
            createdBy: req.user.username,
            versions: [],
        });

        res.status(201).json({ card: serializeCardForClient(card.toObject()) });
    } catch (err) {
        console.error('POST /api/cards error:', err);
        res.status(500).json({ error: 'Failed to create card' });
    }
});

/**
 * POST /api/cards/:id/report
 * Body: { reason }
 */
app.post('/api/cards/:id/report', requireAuth, async (req, res) => {
    try {
        const reason = String(req.body.reason || '').trim().slice(0, 240);
        if (!reason) return res.status(400).json({ error: 'Report reason is required' });

        const card = await Card.findOne({ id: req.params.id });
        if (!card) return res.status(404).json({ error: 'Card not found' });

        const alreadyReported = (card.reports?.entries || []).some((r) => r.reporter === req.user.username);
        if (alreadyReported) return res.status(409).json({ error: 'You already reported this card' });

        card.reports = card.reports || { count: 0, entries: [] };
        card.reports.entries.push({ reporter: req.user.username, reason, createdAt: new Date() });
        card.reports.count = card.reports.entries.length;
        card.markModified('reports');
        await card.save();

        res.status(201).json({ ok: true, reports: card.reports.count });
    } catch (err) {
        console.error('POST /api/cards/:id/report error:', err);
        res.status(500).json({ error: 'Failed to report card' });
    }
});

/**
 * PATCH /api/cards/:id
 * Owner-only edit for non-official cards; creates version snapshot.
 */
app.patch('/api/cards/:id', requireAuth, async (req, res) => {
    try {
        const card = await Card.findOne({ id: req.params.id });
        if (!card) return res.status(404).json({ error: 'Card not found' });
        if (card.official) return res.status(403).json({ error: 'Official cards cannot be edited' });
        if (card.createdBy !== req.user.username) return res.status(403).json({ error: 'Only the card owner can edit this card' });

        const validationError = validateCustomCardPayload(req.body);
        if (validationError) return res.status(400).json({ error: validationError });

        card.versions = card.versions || [];
        card.versions.push(toVersionSnapshot(card.toObject(), req.user.username));

        card.name = String(req.body.name).trim();
        card.image = String(req.body.image).trim();
        card.description = String(req.body.description || '').trim();
        card.elements = req.body.elements || {};
        card.actions = buildActionsFromPayload(req.body);
        card.passives = [];
        card.defense = Number(req.body.defense);
        card.evasion = Number(req.body.evasion);
        card.health = Number(req.body.health);
        card.attack = Number(req.body.attack);
        card.agility = Number(req.body.agility);
        card.adultOnly = !!req.body.adultOnly;
        card.markModified('elements');
        card.markModified('actions');
        card.markModified('versions');
        await card.save();

        res.json({ card: serializeCardForClient(card.toObject()) });
    } catch (err) {
        console.error('PATCH /api/cards/:id error:', err);
        res.status(500).json({ error: 'Failed to update card' });
    }
});

/**
 * DELETE /api/cards/:id
 * Owner-only delete for non-official cards.
 */
app.delete('/api/cards/:id', requireAuth, async (req, res) => {
    try {
        const card = await Card.findOne({ id: req.params.id });
        if (!card) return res.status(404).json({ error: 'Card not found' });
        if (card.official) return res.status(403).json({ error: 'Official cards cannot be deleted' });
        if (card.createdBy !== req.user.username) return res.status(403).json({ error: 'Only the card owner can delete this card' });

        await Card.deleteOne({ id: req.params.id });
        res.status(204).send();
    } catch (err) {
        console.error('DELETE /api/cards/:id error:', err);
        res.status(500).json({ error: 'Failed to delete card' });
    }
});

/**
 * POST /api/cards/:id/fork
 * Clones a public/official card into an editable custom card for the caller.
 */
app.post('/api/cards/:id/fork', requireAuth, async (req, res) => {
    try {
        const source = await Card.findOne({ id: req.params.id }).lean();
        if (!source) return res.status(404).json({ error: 'Card not found' });
        if (source.visibility !== 'public') return res.status(403).json({ error: 'Card is not forkable' });

        const baseId = sanitizeCardId(`${source.name}_fork`);
        let nextId = `${CARD_ID_PREFIX}${req.user.username}_${baseId}`;
        if (await Card.exists({ id: nextId })) {
            nextId = `${nextId}_${Date.now().toString(36).slice(-4)}`;
        }

        const forkCard = await Card.create({
            ...cloneCardForGame(source),
            id: nextId,
            name: `${source.name} (Fork)`,
            official: false,
            adultOnly: !!source.adultOnly,
            visibility: 'public',
            createdBy: req.user.username,
            sourceCardId: source.id,
            versions: [toVersionSnapshot(source, req.user.username)],
        });

        res.status(201).json({ card: serializeCardForClient(forkCard.toObject()) });
    } catch (err) {
        console.error('POST /api/cards/:id/fork error:', err);
        res.status(500).json({ error: 'Failed to fork card' });
    }
});

/**
 * GET /api/cards/:id/versions
 */
app.get('/api/cards/:id/versions', requireAuth, async (req, res) => {
    try {
        const card = await Card.findOne({ id: req.params.id }).lean();
        if (!card) return res.status(404).json({ error: 'Card not found' });

        if (card.visibility !== 'public' && card.createdBy !== req.user.username) {
            return res.status(403).json({ error: 'Not allowed to view versions for this card' });
        }

        const versions = (card.versions || []).map((v, idx) => ({
            index: idx,
            editedAt: v.editedAt,
            editedBy: v.editedBy,
            snapshot: v.snapshot,
        })).reverse();
        res.json({ cardId: card.id, cardName: card.name, versions });
    } catch (err) {
        console.error('GET /api/cards/:id/versions error:', err);
        res.status(500).json({ error: 'Failed to load card versions' });
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
 * Deletes finished sessions hosted by the authenticated user.
 */
app.delete('/api/sessions/completed', requireAuth, async (req, res) => {
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
 * Body: { name, settings?: { startingHp, maxBattlers, teamMode } }
 * Creates a new lobby session; the creator is automatically player1.
 */
app.post('/api/sessions', requireAuth, async (req, res) => {
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
        const totalPlayers = session.players.length + (session.cpuSlots?.length || 0);
        if (totalPlayers < 2) return res.status(409).json({ error: 'Need at least 2 players (including CPUs) to start' });

        // Require all human players to have chosen a deck
        const notReady = session.players.filter((p) => p.deckStatus !== 'ready');
        if (notReady.length > 0) {
            const names = notReady.map((p) => p.username).join(', ');
            return res.status(409).json({ error: `Waiting for players to choose a deck: ${names}` });
        }

        const selectedIds = [...new Set(session.players.flatMap((p) => p.selectedDeck || []))];
        const selectedDeckCards = selectedIds.length > 0
            ? await Card.find({ id: { $in: selectedIds } }).lean()
            : [];
        const cardById = new Map(selectedDeckCards.map((c) => [c.id, cloneCardForGame(c)]));
        const playerUserIds = session.players.map((p) => p.userId).filter(Boolean);
        const playerUsers = await User.find({ _id: { $in: playerUserIds } }).select('_id avatarUrl').lean();
        const avatarByUserId = new Map(playerUsers.map((u) => [String(u._id), u.avatarUrl || '']));

        // Merge real players and CPU slots, ordered by slot name
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
            ...(session.cpuSlots || []).map((c) => ({ name: c.name, team: null, slot: c.slot, isBot: true, selectedDeck: [] })),
        ].sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));

        const playerConfigs = combined.map((p, i) => ({
            id: `player${i + 1}`,
            name: p.name,
            image: p.image,
            team: session.settings?.teamMode === 'teams' ? (p.team || null) : null,
            isBot: p.isBot,
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

        // Schedule turn timer if configured
        scheduleTimer(gameId, state);

        // If the first player is a CPU, auto-play after a short delay
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
 * Host-only; deletes the session entirely.
 */
app.delete('/api/sessions/:id', requireAuth, async (req, res) => {
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
 * Removes the calling user from a waiting session.
 */
app.delete('/api/sessions/:id/leave', requireAuth, async (req, res) => {
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
 * Body: { startingHp?, maxBattlers?, deckSize?, teamMode? }
 * Host-only; updates lobby settings before game starts.
 */
app.patch('/api/sessions/:id/settings', requireAuth, async (req, res) => {
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
 * Body: { isPublic: boolean }
 * Host-only; toggles session visibility while in waiting state.
 */
app.patch('/api/sessions/:id/visibility', requireAuth, async (req, res) => {
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
 * Body: { deck: string[] }  — 3-10 card IDs from the known card list.
 * Sets the calling player's selected deck and marks them as 'ready'.
 */
app.patch('/api/sessions/:id/deck', requireAuth, async (req, res) => {
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
        // Deduplicate while preserving order
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
 * POST /api/sessions/:id/cpu
 * Host-only; adds a CPU player to the next available slot.
 */
app.post('/api/sessions/:id/cpu', requireAuth, async (req, res) => {
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
 * Host-only; removes a CPU from the given slot.
 */
app.delete('/api/sessions/:id/cpu/:slot', requireAuth, async (req, res) => {
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

// ── Push notification API ─────────────────────────────────────────────────────

app.get('/api/push/vapid-public-key', (req, res) => {
    if (!VAPID_PUSH_ENABLED) {
        return res.json({ enabled: false, publicKey: null });
    }
    res.json({ enabled: true, publicKey: process.env.VAPID_PUBLIC_KEY });
});

app.post('/api/push/subscribe', requireAuth, async (req, res) => {
    const { subscription } = req.body;
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
        return res.status(400).json({ error: 'Invalid subscription object' });
    }
    try {
        // Upsert: remove any existing entry with same endpoint, then push new one
        await User.updateOne(
            { username: req.user.username },
            { $pull: { pushSubscriptions: { endpoint: subscription.endpoint } } }
        );
        await User.updateOne(
            { username: req.user.username },
            { $push: { pushSubscriptions: subscription } }
        );
        res.json({ ok: true });
    } catch (err) {
        console.error('/api/push/subscribe error:', err);
        res.status(500).json({ error: 'Failed to save subscription' });
    }
});

app.delete('/api/push/subscribe', requireAuth, async (req, res) => {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ error: 'endpoint required' });
    try {
        await User.updateOne(
            { username: req.user.username },
            { $pull: { pushSubscriptions: { endpoint } } }
        );
        res.json({ ok: true });
    } catch (err) {
        console.error('/api/push/unsubscribe error:', err);
        res.status(500).json({ error: 'Failed to remove subscription' });
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

// ── OpenTDB helper ────────────────────────────────────────────────────────────

const fetchTrivia = (params = {}) => new Promise((resolve, reject) => {
    const qs = new URLSearchParams({
        amount: String(params.amount ?? 1),
        encode: 'url3986',
        ...(params.difficulty && { difficulty: params.difficulty }),
        ...(params.category && { category: String(params.category) }),
        ...(params.questionType && { type: params.questionType }),
    }).toString();
    https.get(`https://opentdb.com/api.php?${qs}`, (res) => {
        let raw = '';
        res.on('data', (c) => { raw += c; });
        res.on('end', () => {
            try { resolve(JSON.parse(raw)); } catch (e) { reject(e); }
        });
    }).on('error', reject);
});

// ── Math problem generator ────────────────────────────────────────────────────
const generateMathProblem = (difficulty) => {
    let question, answer;
    const r = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

    if (difficulty <= 1) {
        // Simple addition / subtraction with small numbers
        const a = r(1, 20), b = r(1, 20);
        if (Math.random() < 0.5) { question = `${a} + ${b} = ?`; answer = a + b; }
        else { const big = Math.max(a, b), small = Math.min(a, b); question = `${big} - ${small} = ?`; answer = big - small; }
    } else if (difficulty === 2) {
        // Multiplication / division
        const a = r(2, 12), b = r(2, 12);
        if (Math.random() < 0.5) { question = `${a} × ${b} = ?`; answer = a * b; }
        else { const prod = a * b; question = `${prod} ÷ ${a} = ?`; answer = b; }
    } else if (difficulty === 3) {
        // Multi-step or negative numbers
        const a = r(5, 30), b = r(2, 15), c = r(1, 10);
        const ops = [
            () => { question = `${a} + ${b} - ${c} = ?`; answer = a + b - c; },
            () => { question = `${a} - ${b} + ${c} = ?`; answer = a - b + c; },
            () => { question = `${a} × ${b} + ${c} = ?`; answer = a * b + c; },
        ];
        ops[r(0, ops.length - 1)]();
    } else {
        // Percentages or harder multi-step
        const pcts = [10, 20, 25, 50];
        const pct = pcts[r(0, pcts.length - 1)];
        const base = r(2, 20) * (100 / pct); // ensures whole number result
        const ops = [
            () => { question = `${pct}% of ${base} = ?`; answer = (pct / 100) * base; },
            () => { const a = r(3, 12), b = r(3, 12); question = `(${a} + ${b}) × ${r(2, 5)} = ?`; answer = (a + b) * r(2, 5); /* recalc below */ },
        ];
        // Simpler: always percentage at high diff
        question = `${pct}% of ${base} = ?`;
        answer = Math.round((pct / 100) * base);
    }

    // Generate 3 wrong answers in the same ballpark
    const spread = Math.max(3, Math.abs(answer) * 0.3);
    const wrongs = new Set();
    while (wrongs.size < 3) {
        const candidate = answer + (Math.random() < 0.5 ? 1 : -1) * Math.floor(Math.random() * spread + 1);
        if (candidate !== answer) wrongs.add(candidate);
    }
    const choices = [String(answer), ...[...wrongs].map(String)];
    for (let i = choices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [choices[i], choices[j]] = [choices[j], choices[i]];
    }
    return { question, choices, correctIndex: choices.indexOf(String(answer)) };
};

// ── Pending microevents ───────────────────────────────────────────────────────
// gameId → { timeoutHandle }
const pendingMicroevents = new Map();

const MICROEVENT_TIMEOUT_MS = {
    qte: 4000,
    pattern: 22000,
    quiz: 28000,
    rhythm: 26000,
    mash: 6000,
    parry: 12000,
    route: 16000,
    sigil: 14000,
    arrow: 14000,
};

const TRACK_BPMS = [120, 80, 135, 95, 128]; // matches TRACKS order in musicManager.js

const triggerMicroevent = async (gameId, game, context, ability, socket) => {
    const { casterCardIndex, abilityIndex, targetCardIndex, targetPlayerId } = context;
    const me = ability.microevent;

    // Dispatch holdMicroevent → phase becomes 'microevent'
    const { state: heldState, error: holdErr } = dispatch(game.state, 'holdMicroevent', {
        casterCardIndex, abilityIndex,
        targetCardIndex: targetCardIndex ?? null,
        targetPlayerId: targetPlayerId ?? null,
    });
    if (holdErr) { socket.emit('game:error', { message: holdErr }); return; }

    game.state = heldState;
    game.markModified('state');
    await game.save();

    // Build start payload
    const casterPlayer = heldState.players.find((p) => p.id === heldState.currentTurn);
    const casterCard = casterPlayer?.inPlay[casterCardIndex];

    // ── Effective difficulty ──────────────────────────────────────────────────
    const timesUsed = (ability.limit ?? 0) - (ability.usesRemaining ?? 0);
    const globalDiff = heldState.settings?.microgameDifficulty ?? 1;
    const effectiveDifficulty = Math.min(4, (globalDiff - 1) + Math.floor(timesUsed / 2));
    // ─────────────────────────────────────────────────────────────────────────

    const startPayload = {
        type: me.type, outcome: me.outcome,
        abilityName: ability.name,
        casterName: casterCard?.name ?? '?',
        casterPlayerId: heldState.currentTurn,
        casterCardIndex, abilityIndex, targetCardIndex, targetPlayerId,
        difficulty: effectiveDifficulty,
    };

    if (me.type === 'quiz') {
        if (me.mathProblem) {
            const { question, choices, correctIndex } = generateMathProblem(effectiveDifficulty);
            startPayload.question = question;
            startPayload.choices = choices;
            startPayload.correctIndex = correctIndex;
        } else {
            try {
                const data = await fetchTrivia({
                    difficulty: me.difficulty,
                    category: me.category,
                    questionType: me.questionType,
                });
                if (data.response_code === 0 && data.results?.[0]) {
                    const q = data.results[0];
                    const decode = (s) => decodeURIComponent(s);
                    const correct = decode(q.correct_answer);
                    const choices = [correct, ...(q.incorrect_answers || []).map(decode)];
                    for (let i = choices.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [choices[i], choices[j]] = [choices[j], choices[i]];
                    }
                    startPayload.question = decode(q.question);
                    startPayload.choices = choices;
                    startPayload.correctIndex = choices.indexOf(correct);
                }
            } catch (err) {
                console.error('[Microevent] OpenTDB fetch failed:', err.message);
                // Fall through — client handles missing question gracefully
            }
        }
    }

    if (me.type === 'rhythm') {
        const currentTrackIndex = heldState._currentTrackIndex ?? 0;
        const baseBpm = TRACK_BPMS[currentTrackIndex] ?? 120;
        const baseBeats = me.beats ?? 4;
        // Softer scaling: keeps rhythm readable and fun at higher difficulties.
        const scaledBeats = baseBeats + [0, 0, 1, 1, 2][effectiveDifficulty];
        const beatIntervalMs = (60 / baseBpm) * 1000;
        const leadIn = 3000; // countdown window
        startPayload.bpm = baseBpm;
        startPayload.beats = scaledBeats;
        startPayload.beatStartTime = Date.now() + leadIn;
        startPayload.timeoutMs = leadIn + scaledBeats * beatIntervalMs + 1500;
    }

    if (me.type === 'parry') {
        const strikes = me.strikes ?? (5 + Math.min(2, effectiveDifficulty));
        const leadIn = 1300;
        const now = Date.now();
        const minGap = [900, 800, 740, 680, 620][effectiveDifficulty];
        const maxGap = [1300, 1180, 1060, 980, 900][effectiveDifficulty];
        let t = now + leadIn;
        const strikeTimes = [];
        for (let i = 0; i < strikes; i++) {
            t += Math.floor(minGap + Math.random() * (maxGap - minGap));
            strikeTimes.push(t);
        }
        startPayload.strikeTimes = strikeTimes;
        startPayload.timeoutMs = (strikeTimes[strikeTimes.length - 1] - now) + 1600;
    }

    if (me.type === 'route') {
        const len = me.routeLen ?? (effectiveDifficulty <= 1 ? 4 : effectiveDifficulty <= 3 ? 5 : 6);
        const route = [];
        const neighbors = (idx) => {
            const x = idx % 3;
            const y = Math.floor(idx / 3);
            const out = [];
            if (x > 0) out.push(idx - 1);
            if (x < 2) out.push(idx + 1);
            if (y > 0) out.push(idx - 3);
            if (y < 2) out.push(idx + 3);
            return out;
        };
        route.push(Math.floor(Math.random() * 9));
        while (route.length < len) {
            const last = route[route.length - 1];
            const options = neighbors(last).filter((n) => n !== route[route.length - 2]);
            route.push(options[Math.floor(Math.random() * options.length)]);
        }
        startPayload.route = route;
        startPayload.timeoutMs = 16000;
    }

    if (me.type === 'sigil') {
        const len = me.seqLen ?? (effectiveDifficulty <= 1 ? 4 : effectiveDifficulty <= 3 ? 5 : 6);
        startPayload.sequence = Array.from({ length: len }, () => Math.floor(Math.random() * 4));
        startPayload.timeoutMs = 14000;
    }

    if (me.type === 'pattern') {
        const seqLen = effectiveDifficulty <= 1 ? 3 : effectiveDifficulty <= 3 ? 4 : 5;
        startPayload.seed = Array.from({ length: seqLen }, () => Math.floor(Math.random() * 4));
        startPayload.seqLen = seqLen;
    }

    if (me.type === 'arrow') {
        startPayload.shots = Math.max(1, Number(me.shots ?? 3));
        startPayload.targetRadius = [0.125, 0.112, 0.098, 0.086, 0.074][effectiveDifficulty];
        startPayload.crosshairRadius = [0.14, 0.124, 0.108, 0.094, 0.082][effectiveDifficulty];
        startPayload.speed = [0.16, 0.205, 0.255, 0.315, 0.39][effectiveDifficulty];
        startPayload.centerBias = [0.62, 0.52, 0.42, 0.32, 0.24][effectiveDifficulty];
        startPayload.retargetMinMs = [520, 470, 420, 360, 320][effectiveDifficulty];
        startPayload.retargetMaxMs = [980, 900, 790, 700, 620][effectiveDifficulty];
        startPayload.timeoutMs = 14000;
    }

    // Timeout: auto-resolve failure if active player disconnects or stalls
    const timeoutMs = startPayload.timeoutMs ?? MICROEVENT_TIMEOUT_MS[me.type] ?? 10000;
    const timeoutHandle = setTimeout(() => {
        pendingMicroevents.delete(gameId);
        enqueueGameAction(gameId, async () => {
            try {
                const g = await Game.findOne({ gameId });
                if (!g || g.state.phase !== 'microevent') return;
                const { state: ns } = dispatch(g.state, 'applyAbilityWithMicroevent', {
                    microeventResult: { success: false, score: 0 },
                });
                g.state = ns; g.markModified('state'); await g.save();
                io.to(`game:${gameId}`).emit('game:microevent:timeout', {});
                io.to(`game:${gameId}`).emit('game:state', ns);
                scheduleTimer(gameId, ns);
                await executeCpuTurnsIfNeeded(gameId);
            } catch (err) { console.error('[Microevent] timeout error:', err); }
        });
    }, timeoutMs);

    pendingMicroevents.set(gameId, { timeoutHandle });

    // Broadcast held state then start event
    await Session.findOneAndUpdate(
        { gameId },
        { currentTurn: heldState.currentTurn }
    ).catch(() => { });
    io.to(`game:${gameId}`).emit('game:state', heldState);
    io.to(`game:${gameId}`).emit('game:microevent:start', startPayload);
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

// ── Push helpers ──────────────────────────────────────────────────────────────

/** True if the given username has an active socket in the game room. */
const isUserActiveInGame = (gameId, username) => {
    const room = io.sockets.adapter.rooms.get(`game:${gameId}`);
    if (!room) return false;
    for (const socketId of room) {
        const s = io.sockets.sockets.get(socketId);
        if (s?.user?.username === username) return true;
    }
    return false;
};

/** Send a push to all stored subscriptions for a user; auto-removes stale ones. */
const sendPushToUser = async (username, payload) => {
    if (!VAPID_PUSH_ENABLED) return;
    const user = await User.findOne({ username }).select('pushSubscriptions').lean();
    if (!user?.pushSubscriptions?.length) return;
    const message = JSON.stringify(payload);
    const stale = [];
    await Promise.all(user.pushSubscriptions.map(async (sub) => {
        try {
            await webpush.sendNotification(sub, message);
        } catch (err) {
            if (err.statusCode === 410 || err.statusCode === 404) stale.push(sub.endpoint);
            else console.warn('[Push] send error:', err.statusCode, String(err.body ?? '').slice(0, 80));
        }
    }));
    if (stale.length) {
        await User.updateOne(
            { username },
            { $pull: { pushSubscriptions: { endpoint: { $in: stale } } } }
        ).catch(() => { });
    }
};

/** Send "your turn" push if the player is not actively watching the game. */
const sendTurnPush = async (gameId, turnPlayerId) => {
    try {
        const session = await Session.findOne({ gameId }).lean();
        if (!session) return;
        const slot = session.players.find((p) => p.slot === turnPlayerId);
        if (!slot) return;
        const { username } = slot;
        if (isUserActiveInGame(gameId, username)) return;
        await sendPushToUser(username, {
            title: '⚔️ Your Turn!',
            body: `It's your move in ${session.name}`,
            tag: `turn-${gameId}`,
            url: `/?session=${session._id}&game=${gameId}`,
        });
    } catch (err) {
        console.error('[Push] sendTurnPush error:', err);
    }
};

/** Send a 5-minute time warning push if the player is not watching the game. */
const sendWarnPush = async (gameId, turnPlayerId) => {
    try {
        const session = await Session.findOne({ gameId }).lean();
        if (!session) return;
        const slot = session.players.find((p) => p.slot === turnPlayerId);
        if (!slot) return;
        const { username } = slot;
        if (isUserActiveInGame(gameId, username)) return;
        await sendPushToUser(username, {
            title: '⏱ Time Running Out!',
            body: `~5 minutes left in ${session.name}`,
            tag: `timer-warn-${gameId}`,
            url: `/?session=${session._id}&game=${gameId}`,
        });
    } catch (err) {
        console.error('[Push] sendWarnPush error:', err);
    }
};

// ── Turn timeout enforcement ──────────────────────────────────────────────────

const gameTimers = new Map(); // gameId → timeoutId
const warnTimers = new Map(); // gameId → timeoutId (5-min warning)

/**
 * Schedule (or reschedule) a turn-expiry timer for the current player.
 * If the game has no turnTimeLimit, or the current player is a bot, no timer is set.
 */
const scheduleTimer = (gameId, state) => {
    // Clear any existing timer for this game
    if (gameTimers.has(gameId)) {
        clearTimeout(gameTimers.get(gameId));
        gameTimers.delete(gameId);
    }
    if (warnTimers.has(gameId)) {
        clearTimeout(warnTimers.get(gameId));
        warnTimers.delete(gameId);
    }

    if (state.gameOver) return;
    const limitSec = state.settings?.turnTimeLimit;
    if (!limitSec) return;

    const player = state.players.find((p) => p.id === state.currentTurn);
    if (!player || player.isBot) return;

    const elapsed = Date.now() - (state.turnStartedAt ?? Date.now());
    const remaining = Math.max(0, limitSec * 1000 - elapsed);

    // 5-minute warning push (only if there's at least 6 minutes left so it fires before expiry)
    const WARN_MS = 5 * 60 * 1000;
    if (remaining > WARN_MS + 60_000) {
        const warnDelay = remaining - WARN_MS;
        const warnTimerId = setTimeout(() => {
            warnTimers.delete(gameId);
            sendWarnPush(gameId, state.currentTurn).catch(() => { });
        }, warnDelay);
        warnTimers.set(gameId, warnTimerId);
    }

    const timerId = setTimeout(() => {
        gameTimers.delete(gameId);
        enqueueGameAction(gameId, async () => {
            try {
                const game = await Game.findOne({ gameId });
                if (!game || game.state.gameOver) return;
                // Guard: only forfeit if it's still the same player's turn
                if (game.state.currentTurn !== state.currentTurn) return;

                const { state: nextState } = dispatch(game.state, 'forfeitCurrentPlayer', {});
                game.state = nextState;
                game.markModified('state');
                await game.save();

                await Session.findOneAndUpdate(
                    { gameId },
                    { currentTurn: nextState.currentTurn, turnStartedAt: nextState.turnStartedAt ? new Date(nextState.turnStartedAt) : null, ...(nextState.gameOver ? { status: 'finished' } : {}) }
                ).catch(() => { });

                io.to(`game:${gameId}`).emit('game:state', nextState);

                scheduleTimer(gameId, nextState);
                if (!nextState.gameOver) await executeCpuTurnsIfNeeded(gameId);
            } catch (err) {
                console.error('turn timeout error:', err);
            }
        });
    }, remaining);

    gameTimers.set(gameId, timerId);
};

/**
 * If the current turn belongs to a CPU player, compute and broadcast CPU
 * turns until a human player's turn is reached or the game ends.
 * Must be called from within an already-enqueued action (reads/writes DB).
 */
const executeCpuTurnsIfNeeded = async (gameId) => {
    let game = await Game.findOne({ gameId });
    if (!game) return;

    while (!game.state.gameOver) {
        const player = game.state.players.find((p) => p.id === game.state.currentTurn);
        if (!player?.isBot) break;

        // Brief pause so clients can see state transitions
        await new Promise((r) => setTimeout(r, 1500));

        const cpuState = computeCpuTurn(game.state);

        // Re-fetch to avoid stale writes, then update
        game = await Game.findOne({ gameId });
        if (!game) return;
        game.state = cpuState;
        game.markModified('state');
        await game.save();

        await Session.findOneAndUpdate({ gameId }, { currentTurn: cpuState.currentTurn, turnStartedAt: cpuState.turnStartedAt ? new Date(cpuState.turnStartedAt) : null }).catch(() => { });
        io.to(`game:${gameId}`).emit('game:state', cpuState);

        scheduleTimer(gameId, cpuState);

        if (cpuState.gameOver) break;
    }

    // After the CPU chain, if it's now a human player's turn, push them
    if (!game.state.gameOver) {
        const humanPlayer = game.state.players.find(
            (p) => p.id === game.state.currentTurn && !p.isBot
        );
        if (humanPlayer) {
            sendTurnPush(gameId, game.state.currentTurn).catch(() => { });
        }
    }
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

                // ── Microevent intercept ──────────────────────────────────────────
                if (type === 'initiateAbility') {
                    const { casterCardIndex, abilityIndex } = payload;
                    const cp = game.state.players.find((p) => p.id === game.state.currentTurn);
                    const ability = cp?.inPlay[casterCardIndex]?.actions[abilityIndex];
                    if (ability?.microevent && game.state.phase === 'main') {
                        const targetType = getAbilityTarget(ability);
                        const isImmediate = ['self', 'allEnemies', 'allAllies'].includes(targetType);
                        if (isImmediate) {
                            await triggerMicroevent(gameId, game,
                                { casterCardIndex, abilityIndex, targetCardIndex: null, targetPlayerId: null },
                                ability, socket);
                            return;
                        }
                        // For card-targeted abilities: fall through to dispatch normally
                        // (goes to selectingTarget phase; microevent fires on resolve)
                    }
                }

                if (type === 'resolveOnEnemyCard' || type === 'resolveOnAllyCard') {
                    const pa = game.state.pendingAction;
                    if (pa?.isAbility) {
                        const cp = game.state.players.find((p) => p.id === game.state.currentTurn);
                        const ability = cp?.inPlay[pa.casterCardIndex]?.actions[pa.abilityIndex];
                        if (ability?.microevent) {
                            const targetCardIndex = payload.targetCardIndex ?? null;
                            const targetPlayerId = payload.targetPlayerId ?? null;
                            await triggerMicroevent(gameId, game,
                                { casterCardIndex: pa.casterCardIndex, abilityIndex: pa.abilityIndex, targetCardIndex, targetPlayerId },
                                ability, socket);
                            return;
                        }
                    }
                }
                // ── Normal dispatch ───────────────────────────────────────────────

                const prevTurn = game.state.currentTurn;
                const { state: nextState, error } = dispatch(game.state, type, payload);
                if (error) return socket.emit('game:error', { message: error });

                game.state = nextState;
                game.markModified('state');
                await game.save();

                // Keep session's currentTurn in sync so the lobby list can show "Your Turn"
                await Session.findOneAndUpdate(
                    { gameId },
                    { currentTurn: nextState.currentTurn, turnStartedAt: nextState.turnStartedAt ? new Date(nextState.turnStartedAt) : null }
                ).catch(() => { });

                io.to(`game:${gameId}`).emit('game:state', nextState);

                // Reschedule turn timer on every action (handles endTurn advancing the turn)
                scheduleTimer(gameId, nextState);

                // Push notification when the turn changes to a human player
                if (!nextState.gameOver && nextState.currentTurn !== prevTurn) {
                    const nextPlayer = nextState.players.find((p) => p.id === nextState.currentTurn);
                    if (nextPlayer && !nextPlayer.isBot) {
                        sendTurnPush(gameId, nextState.currentTurn).catch(() => { });
                    }
                }

                // Auto-play CPU turns if the next active player is a bot
                await executeCpuTurnsIfNeeded(gameId);
            } catch (err) {
                console.error('game:action error:', err);
                socket.emit('game:error', { message: 'Failed to process action' });
            }
        });
    });

    // Relay live microevent inputs to all other players (spectators mirror in real-time)
    socket.on('game:microevent:input', ({ gameId, ...inputPayload }) => {
        if (!gameId) return;
        socket.to(`game:${gameId}`).emit('game:microevent:input', inputPayload);
    });

    // Active player finished the microevent — apply result and broadcast
    socket.on('game:microevent:result', async ({ gameId, success, score }) => {
        if (!gameId) return;
        const pending = pendingMicroevents.get(gameId);
        if (!pending) return;
        clearTimeout(pending.timeoutHandle);
        pendingMicroevents.delete(gameId);

        enqueueGameAction(gameId, async () => {
            try {
                const game = await Game.findOne({ gameId });
                if (!game || game.state.phase !== 'microevent') return;

                const prevTurn = game.state.currentTurn;
                const { state: nextState, error } = dispatch(game.state, 'applyAbilityWithMicroevent', {
                    microeventResult: { success: !!success, score: Math.max(0, Math.min(1, score ?? 0)) },
                });
                if (error) return socket.emit('game:error', { message: error });

                game.state = nextState;
                game.markModified('state');
                await game.save();

                await Session.findOneAndUpdate(
                    { gameId },
                    { currentTurn: nextState.currentTurn, turnStartedAt: nextState.turnStartedAt ? new Date(nextState.turnStartedAt) : null }
                ).catch(() => { });

                io.to(`game:${gameId}`).emit('game:state', nextState);
                scheduleTimer(gameId, nextState);

                if (!nextState.gameOver && nextState.currentTurn !== prevTurn) {
                    const nextPlayer = nextState.players.find((p) => p.id === nextState.currentTurn);
                    if (nextPlayer && !nextPlayer.isBot) {
                        sendTurnPush(gameId, nextState.currentTurn).catch(() => { });
                    }
                }

                await executeCpuTurnsIfNeeded(gameId);
            } catch (err) {
                console.error('game:microevent:result error:', err);
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

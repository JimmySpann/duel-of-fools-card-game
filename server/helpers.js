'use strict';

const jwt = require('jsonwebtoken');
const Card = require('./models/Card');
const officialCards = require('./game/cards');
const {
    validateCustomAbilityPowerBudget,
    validateTotalCustomAbilityPowerBudget,
} = require('./game/customAbilityPower');

// ── Auth middleware ───────────────────────────────────────────────────────────

const requireAuth = (req, res, next) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    try {
        req.user = jwt.verify(header.slice(7), process.env.JWT_SECRET);
        next();
    } catch {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
};

// ── Auth helpers ──────────────────────────────────────────────────────────────

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusable chars
const generateJoinCode = () =>
    Array.from({ length: 6 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');

const signToken = (user) =>
    jwt.sign({ id: user._id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '7d' });

// ── Card helpers ──────────────────────────────────────────────────────────────

const CARD_ID_PREFIX = 'cc_';
const MAX_CARD_POINTS = 48;
const ADMIN_USERS = new Set(['Acinder']);

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
    category: card.category || 'unknown',
    verified: !!card.verified,
});

const serializeCardForClient = (card) => ({
    ...cloneCardForGame(card),
    official: !!card.official,
    adultOnly: !!card.adultOnly,
    verified: !!card.verified,
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

// ── Ability catalog (built from official cards at startup) ───────────────────

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

// ── Custom card/ability validation ───────────────────────────────────────────

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
            const deduped = [...new Set(
                (Array.isArray(e.debuffs) ? e.debuffs : []).filter((d) => ALLOWED_CLEANSE_DEBUFFS.includes(d))
            )];
            return { type: 'cleanse', debuffs: deduped };
        }
        if (e.type === 'resetCooldowns') return { type: 'resetCooldowns' };
        if (e.type === 'selfDestruct') return { type: 'selfDestruct' };
        return { type: e.type };
    });

    const limit = Math.round(clampNum(ability.limit, 1, 10, 1));
    const targetType = String(ability.targetType || 'enemyCard');
    const microevent = ability.microevent
        ? { type: String(ability.microevent.type), outcome: String(ability.microevent.outcome) }
        : null;

    return {
        name: String(ability.name).trim(),
        actionInfo: `${targetType} • Custom`,
        description: summarizeEffects(effects),
        limit,
        usesRemaining: limit,
        type: 'Custom',
        microevent,
        customConfig: { targetType, effects },
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

    return null;
};

// ── Seed official cards on startup ────────────────────────────────────────────

const seedOfficialCards = async () => {
    const cardEntries = officialCards.map((card) => ({
        snapshot: cloneCardForGame(card),
        createdBy: card.createdBy || card.official ? 'Official' : 'Unknown',
        official: !!card.official,
    }));
    const officialIds = cardEntries.map((c) => c.snapshot.id);

    if (officialIds.length === 0) {
        await Card.deleteMany({ official: true });
        return;
    }

    await Card.deleteMany({
        official: true,
        id: { $nin: officialIds },
    });

    for (const entry of cardEntries) {
        await Card.updateOne(
            { id: entry.snapshot.id },
            {
                $set: {
                    ...entry.snapshot,
                    official: entry.official,
                    adultOnly: false,
                    visibility: 'public',
                    createdBy: entry.createdBy,
                    sourceCardId: null,
                },
            },
            { upsert: true }
        );
    }
};

module.exports = {
    requireAuth,
    generateJoinCode,
    signToken,
    CARD_ID_PREFIX,
    MAX_CARD_POINTS,
    ADMIN_USERS,
    cloneCardForGame,
    serializeCardForClient,
    toVersionSnapshot,
    sanitizeCardId,
    isValidImageUrl,
    abilityCatalog,
    buildActionsFromNames,
    ALLOWED_TARGET_TYPES,
    ALLOWED_EFFECT_TYPES,
    ALLOWED_STATUS_TYPES,
    ALLOWED_CLEANSE_DEBUFFS,
    ALLOWED_MICROEVENT_TYPES,
    ALLOWED_MICROEVENT_OUTCOMES,
    clampNum,
    validateCustomAbility,
    summarizeEffects,
    normalizeCustomAbility,
    buildActionsFromPayload,
    computeCardPointCost,
    validateCustomCardPayload,
    seedOfficialCards,
};

'use strict';

const express = require('express');
const {
    requireAuth,
    CARD_ID_PREFIX,
    ADMIN_USERS,
    abilityCatalog,
    serializeCardForClient,
    cloneCardForGame,
    toVersionSnapshot,
    sanitizeCardId,
    buildActionsFromPayload,
    validateCustomCardPayload,
} = require('../helpers');
const { ABILITY_TARGETS, ABILITY_DEFS } = require('../game/engine');
const Card = require('../models/Card');

const router = express.Router();

/**
 * GET /api/cards
 * Query: q?, mine?
 */
router.get('/', requireAuth, async (req, res) => {
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
router.get('/ability-options', requireAuth, async (_req, res) => {
    try {
        const official = Array.from(abilityCatalog.values()).map((a) => {
            const def = ABILITY_DEFS[a.name] || null;
            return {
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
                effectTypes: def ? def.effects.map((e) => e.type) : [],
                customConfig: def ? { targetType: def.targetType, effects: def.effects.map((e) => ({ ...e })) } : null,
            };
        });

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
 */
router.post('/', requireAuth, async (req, res) => {
    try {
        const validationError = validateCustomCardPayload(req.body);
        if (validationError) return res.status(400).json({ error: validationError });

        const baseId = sanitizeCardId(req.body.name);
        let nextId = `${CARD_ID_PREFIX}${req.user.username}_${baseId}`;
        if (await Card.exists({ id: nextId })) {
            nextId = `${nextId}_${Date.now().toString(36).slice(-4)}`;
        }

        const rawVisibility = String(req.body.visibility || 'public');
        const visibility = rawVisibility === 'private' ? 'private' : 'public';

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
            verified: false,
            visibility,
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
 */
router.post('/:id/report', requireAuth, async (req, res) => {
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
 * Owner-only edit; creates version snapshot.
 */
router.patch('/:id', requireAuth, async (req, res) => {
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
        if (req.body.visibility !== undefined) {
            card.visibility = req.body.visibility === 'private' ? 'private' : 'public';
        }
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
 */
router.delete('/:id', requireAuth, async (req, res) => {
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
 */
router.post('/:id/fork', requireAuth, async (req, res) => {
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
            verified: false,
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
 * PATCH /api/cards/:id/verify
 * Admin-only: toggle verified status.
 */
router.patch('/:id/verify', requireAuth, async (req, res) => {
    try {
        if (!ADMIN_USERS.has(req.user.username)) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        const card = await Card.findOne({ id: req.params.id });
        if (!card) return res.status(404).json({ error: 'Card not found' });

        card.verified = !card.verified;
        await card.save();
        res.json({ card: serializeCardForClient(card.toObject()) });
    } catch (err) {
        console.error('PATCH /api/cards/:id/verify error:', err);
        res.status(500).json({ error: 'Failed to update verification status' });
    }
});

/**
 * GET /api/cards/:id/versions
 */
router.get('/:id/versions', requireAuth, async (req, res) => {
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

module.exports = router;

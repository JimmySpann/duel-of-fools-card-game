'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    MAX_CUSTOM_ABILITY_POWER,
    MAX_TOTAL_CUSTOM_ABILITY_POWER,
    estimateCustomAbilityPower,
    validateCustomAbilityPowerBudget,
    validateTotalCustomAbilityPowerBudget,
} = require('../game/customAbilityPower');

test('estimateCustomAbilityPower returns low score for basic ability', () => {
    const score = estimateCustomAbilityPower({
        targetType: 'enemyCard',
        limit: 2,
        effects: [{ type: 'damage', multiplier: 1 }],
    });

    assert.equal(typeof score, 'number');
    assert.ok(score > 0);
    assert.ok(score < MAX_CUSTOM_ABILITY_POWER);
});

test('validateCustomAbilityPowerBudget returns message for overtuned ability', () => {
    const err = validateCustomAbilityPowerBudget({
        targetType: 'allEnemies',
        limit: 10,
        effects: [
            {
                type: 'damage',
                multiplier: 3,
                flatBonus: 8,
                defPiercing: 8,
                repeat: 5,
                ignoreDef: true,
                ignoreEvasion: true,
                lifesteal: true,
            },
            { type: 'resetCooldowns' },
            { type: 'status', status: 'invulnerable', value: 8, duration: 6 },
        ],
        microevent: { type: 'qte', outcome: 'scaled' },
    }, 'Custom ability #1');

    assert.equal(typeof err, 'string');
    assert.ok(err.includes('Custom ability #1: too powerful'));
    assert.ok(err.includes(`/${MAX_CUSTOM_ABILITY_POWER}`));
});

test('validateTotalCustomAbilityPowerBudget returns message for overtuned loadout', () => {
    const stacked = [
        {
            targetType: 'allEnemies',
            limit: 10,
            effects: [
                {
                    type: 'damage',
                    multiplier: 2.5,
                    repeat: 4,
                    ignoreDef: true,
                    lifesteal: true,
                },
                { type: 'status', status: 'damage_reduction', value: 8, duration: 6 },
            ],
            microevent: { type: 'qte', outcome: 'binary' },
        },
        {
            targetType: 'allAllies',
            limit: 10,
            effects: [
                { type: 'heal', amount: 12 },
                { type: 'resetCooldowns' },
                { type: 'status', status: 'invulnerable', value: 8, duration: 6 },
            ],
            microevent: { type: 'mash', outcome: 'scaled' },
        },
    ];

    const err = validateTotalCustomAbilityPowerBudget(stacked);
    assert.equal(typeof err, 'string');
    assert.ok(err.includes('Custom abilities are too strong in total'));
    assert.ok(err.includes(`/${MAX_TOTAL_CUSTOM_ABILITY_POWER}`));
});

test('validateTotalCustomAbilityPowerBudget passes for balanced loadout', () => {
    const err = validateTotalCustomAbilityPowerBudget([
        {
            targetType: 'enemyCard',
            limit: 2,
            effects: [{ type: 'damage', multiplier: 1.1, flatBonus: 1 }],
        },
        {
            targetType: 'self',
            limit: 2,
            effects: [{ type: 'healSelf', amount: 4 }, { type: 'cleanse', debuffs: ['burned'] }],
        },
    ]);

    assert.equal(err, null);
});

test('harder microgames reduce power more than easy ones', () => {
    const baseAbility = {
        targetType: 'enemyCard',
        limit: 3,
        effects: [{ type: 'damage', multiplier: 2.2, repeat: 2, flatBonus: 3 }],
    };

    const withoutMicrogame = estimateCustomAbilityPower(baseAbility);
    const withQte = estimateCustomAbilityPower({
        ...baseAbility,
        microevent: { type: 'qte', outcome: 'scaled' },
    });
    const withRhythm = estimateCustomAbilityPower({
        ...baseAbility,
        microevent: { type: 'rhythm', outcome: 'scaled' },
    });

    assert.ok(withQte < withoutMicrogame);
    assert.ok(withRhythm < withQte);
});

'use strict';

const MAX_CUSTOM_ABILITY_POWER = 26;
const MAX_TOTAL_CUSTOM_ABILITY_POWER = 54;

const TARGET_POWER_MULT = {
    self: 0.9,
    enemyCard: 1,
    allyCard: 1,
    allEnemies: 1.75,
    allAllies: 1.5,
};

const clampNum = (value, min, max, fallback = min) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
};

const estimateCustomAbilityPower = (ability) => {
    const targetType = String(ability?.targetType || 'enemyCard');
    const effects = Array.isArray(ability?.effects) ? ability.effects : [];
    const limit = clampNum(ability?.limit, 1, 10, 1);
    let score = 0;

    for (const raw of effects) {
        const e = raw || {};
        if (e.type === 'damage') {
            score += (clampNum(e.multiplier, 0.5, 3, 1) * 4);
            score += Math.max(0, clampNum(e.flatBonus, -5, 8, 0)) * 0.8;
            score += clampNum(e.defPiercing, 0, 8, 0) * 0.7;
            score += (clampNum(e.repeat, 1, 5, 1) - 1) * 2;
            if (e.ignoreDef) score += 2;
            if (e.ignoreEvasion) score += 2;
            if (e.lifesteal) score += 2.5;
            if (e.randomTarget) score += 0.8;
            if (e.useBasicAttack) score -= 0.6;
        }
        if (e.type === 'status') {
            const status = String(e.status || '');
            const value = clampNum(e.value, 1, 8, 1);
            const duration = clampNum(e.duration, 1, 6, 1);
            score += value * duration * 0.85;
            if (status === 'invulnerable' || status === 'invisible') score += 2;
            if (status === 'shielded' || status === 'damage_reduction') score += 1.4;
        }
        if (e.type === 'heal' || e.type === 'healSelf') {
            score += clampNum(e.amount, 1, 12, 1) * 0.8;
        }
        if (e.type === 'cleanse') {
            score += Math.max(1, (Array.isArray(e.debuffs) ? e.debuffs.length : 0)) * 1.2;
        }
        if (e.type === 'resetCooldowns') score += 7;
        if (e.type === 'selfDestruct') score -= 2.2;
    }

    score *= TARGET_POWER_MULT[targetType] ?? 1;
    score *= (0.85 + Math.min(1.2, limit / 4.5));
    if (ability?.microevent) score += 1.5;

    return Math.max(0, Number(score.toFixed(2)));
};

const validateCustomAbilityPowerBudget = (ability, label = 'Custom ability') => {
    const power = estimateCustomAbilityPower(ability);
    if (power > MAX_CUSTOM_ABILITY_POWER) {
        return `${label}: too powerful (${power}/${MAX_CUSTOM_ABILITY_POWER}). Reduce multipliers, repeats, durations, or broad targets.`;
    }
    return null;
};

const validateTotalCustomAbilityPowerBudget = (abilities = []) => {
    const totalCustomPower = abilities.reduce((sum, ability) => sum + estimateCustomAbilityPower(ability), 0);
    if (totalCustomPower > MAX_TOTAL_CUSTOM_ABILITY_POWER) {
        return `Custom abilities are too strong in total (${totalCustomPower.toFixed(2)}/${MAX_TOTAL_CUSTOM_ABILITY_POWER}).`;
    }
    return null;
};

module.exports = {
    MAX_CUSTOM_ABILITY_POWER,
    MAX_TOTAL_CUSTOM_ABILITY_POWER,
    estimateCustomAbilityPower,
    validateCustomAbilityPowerBudget,
    validateTotalCustomAbilityPowerBudget,
};

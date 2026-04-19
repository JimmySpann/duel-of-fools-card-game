'use strict';
// ── Shared game logic ─────────────────────────────────────────────────────────
// Used by both server/game/engine.js (Node/CommonJS) and
// src/sections/card-game/database/cardGameSlice.js (webpack/React).
// Exported as CommonJS so both consumers can load it.

// ── Status helpers ────────────────────────────────────────────────────────────

const addStatus = (card, type, value, duration) => {
    card.statusEffects = (card.statusEffects || []).filter((s) => s.type !== type);
    card.statusEffects.push({ type, value, duration });
};

const removeStatus = (card, type) => {
    if (!card.statusEffects) return;
    card.statusEffects = card.statusEffects.filter((s) => s.type !== type);
};

const hasStatus = (card, type) => card.statusEffects?.some((s) => s.type === type) ?? false;
const getStatus = (card, type) => card.statusEffects?.find((s) => s.type === type) ?? null;

// ── Stat helpers ──────────────────────────────────────────────────────────────

const getEffectiveDef = (card) => {
    let def = card.defense || 0;
    for (const s of card.statusEffects || []) {
        if (s.type === 'def_up') def += s.value;
        if (s.type === 'def_down') def -= s.value;
    }
    return Math.max(0, def);
};

const getEffectiveEva = (card) => {
    let eva = card.evasion || 0;
    for (const s of card.statusEffects || []) {
        if (s.type === 'eva_up') eva += s.value;
    }
    return Math.max(0, eva);
};

const getEffectiveAtk = (card) => {
    let atk = card.attack || 5;
    for (const s of card.statusEffects || []) {
        if (s.type === 'atk_up') atk += s.value;
    }
    return Math.max(0, atk);
};

// ── Team / targeting helpers ──────────────────────────────────────────────────

/** All opponents with health > 0. Falls back to simple 2-player lookup when teamMode is not set. */
const getEnemies = (state, playerId) => {
    const me = state.players.find((p) => p.id === playerId);
    if (state.settings?.teamMode === 'teams' && me?.team !== null) {
        return state.players.filter((p) => p.team !== me.team && !p.eliminated && p.health > 0);
    }
    return state.players.filter((p) => p.id !== playerId && !p.eliminated && p.health > 0);
};

/** The caster's own team (includes self). In non-team mode returns only [self]. */
const getAllies = (state, playerId) => {
    const me = state.players.find((p) => p.id === playerId);
    if (state.settings?.teamMode === 'teams' && me?.team !== null) {
        return state.players.filter((p) => p.team === me.team && !p.eliminated);
    }
    return [me];
};

// ── Event helpers ─────────────────────────────────────────────────────────────

const pushHitEvent = (state, defenderPlayerId, cardId, damage, type, cardName, healthAfter, maxHealth) => {
    state.lastHitEvents.push({ defenderPlayerId, cardId, damage, type });
    state.recapEvents.push({
        type, cardId,
        cardName: cardName ?? '?',
        damage,
        healthAfter: healthAfter ?? null,
        maxHealth: maxHealth ?? null,
        targetPlayerId: defenderPlayerId,
    });
};

const pushRecapEvent = (state, event) => {
    state.recapEvents.push(event);
};

const cleanupDefeated = (state) => {
    for (const player of state.players) {
        const dying = player.inPlay.filter((c) => c.dying);
        dying.forEach((c) => player.discardPile.push({ ...c }));
        player.inPlay = player.inPlay.filter((c) => !c.dying);
    }
};

// ── Damage / attack ───────────────────────────────────────────────────────────

const applyDamageToCard = (defenderPlayer, targetIdx, rawDamage, state) => {
    const defender = defenderPlayer.inPlay[targetIdx];
    if (!defender || defender.dying) return 0;

    if (hasStatus(defender, 'invulnerable') || hasStatus(defender, 'invisible')) {
        state.log.unshift(`${defender.name} is untouchable!`);
        pushHitEvent(state, defenderPlayer.id, defender.id, 0, 'blocked', defender.name, defender.currentHealth, defender.health);
        return 0;
    }

    let damage = rawDamage;

    const dmgReduction = getStatus(defender, 'damage_reduction');
    if (dmgReduction) {
        damage = Math.floor(damage / 2);
        state.log.unshift(`${defender.name}'s Wall halved the damage!`);
    }

    const shield = getStatus(defender, 'shielded');
    if (shield) {
        const absorbed = Math.min(shield.value, damage);
        damage -= absorbed;
        shield.value -= absorbed;
        if (shield.value <= 0) removeStatus(defender, 'shielded');
        if (absorbed > 0) state.log.unshift(`${defender.name}'s shield absorbed ${absorbed} damage!`);
    }

    defender.currentHealth = Math.max(0, defender.currentHealth - damage);
    if (defender.currentHealth <= 0) {
        pushHitEvent(state, defenderPlayer.id, defender.id, damage, 'defeat', defender.name, 0, defender.health);
        defender.dying = true;
        state.log.unshift(`${defender.name} was defeated!`);
    } else {
        pushHitEvent(state, defenderPlayer.id, defender.id, damage, 'hit', defender.name, defender.currentHealth, defender.health);
    }
    return damage;
};

const resolveBasicAttack = (attacker, defender, defenderPlayer, state) => {
    const evadeRoll = Math.floor(Math.random() * 10);
    if (evadeRoll < getEffectiveEva(defender)) {
        pushHitEvent(state, defenderPlayer.id, defender.id, 0, 'miss', defender.name, defender.currentHealth, defender.health);
        return { hit: false, damage: 0 };
    }

    let damage = Math.max(1, getEffectiveAtk(attacker) - getEffectiveDef(defender));

    const focused = getStatus(attacker, 'focused');
    if (focused) {
        damage = Math.round(damage * 2.5);
        removeStatus(attacker, 'focused');
        state.log.unshift(`${attacker.name} unleashes a focused strike!`);
    }

    return { hit: true, damage };
};

// ── Ability definitions ─────────────────────────────────────────────────────
// Each ability is a pure-data object. Add new abilities here only —
// no switch-case edits required anywhere in the codebase.
//
// targetType: 'self' | 'enemyCard' | 'allyCard' | 'allEnemies' | 'allAllies'
//
// Effect types:
//   damage        — deal damage to target(s)
//     useBasicAttack bool    use resolveBasicAttack (evasion + focused bonus)
//     multiplier   float    ATK multiplier                      (default 1)
//     flatBonus    int      added to ATK before DEF             (default 0)
//     defPiercing  int      reduce effective DEF by this amount (default 0)
//     ignoreDef    bool     bypass all DEF                      (default false)
//     ignoreEvasion bool    skip evasion roll                   (default false)
//     floor|round  bool     how to truncate ATK × multiplier
//     lifesteal    bool     heal caster for damage dealt
//     onHitStatus  object   { status, value, duration } applied on hit
//     repeat       int      number of hits
//     randomTarget bool     each hit picks a random card (e.g. Volley)
//   status        — apply a status effect;  status, value|valueFn, duration
//   heal          — restore HP to the target card;  amount
//   healSelf      — restore HP to the caster card;  amount
//   cleanse       — remove debuffs from target(s);  debuffs[]
//   resetCooldowns — restore all usesRemaining on the target card
//   selfDestruct   — remove caster from play immediately

const ABILITY_DEFS = {
    'Crack Attack': { targetType: 'enemyCard', effects: [{ type: 'damage', defPiercing: 2 }] },
    'Smoke Break': { targetType: 'self', effects: [{ type: 'status', status: 'invulnerable', value: 1, duration: 1 }] },
    'Ice Slash': { targetType: 'enemyCard', effects: [{ type: 'damage', useBasicAttack: true }] },
    'Freeze': { targetType: 'enemyCard', effects: [{ type: 'status', status: 'frozen', value: 1, duration: 1 }] },
    'Blizzard': { targetType: 'self', effects: [{ type: 'status', status: 'invulnerable', value: 1, duration: 1 }] },
    'Searing Lash': { targetType: 'enemyCard', effects: [{ type: 'damage', useBasicAttack: true, onHitStatus: { status: 'burned', value: 2, duration: 3 } }] },
    'Wall of Fire': { targetType: 'self', effects: [{ type: 'status', status: 'damage_reduction', value: 1, duration: 1 }] },
    'Supernova': { targetType: 'enemyCard', effects: [{ type: 'damage', multiplier: 3, ignoreEvasion: true, ignoreDef: true }, { type: 'selfDestruct' }] },
    'Quick Bolt': { targetType: 'enemyCard', effects: [{ type: 'damage', multiplier: 0.5, floor: true, ignoreEvasion: true, ignoreDef: true }] },
    'Thunder Dash': { targetType: 'self', effects: [{ type: 'status', status: 'eva_up', value: 4, duration: 2 }] },
    'Short Circuit': { targetType: 'enemyCard', effects: [{ type: 'status', status: 'def_down', valueFn: 'targetDef', duration: 1 }] },
    'Quake': { targetType: 'allEnemies', effects: [{ type: 'damage', flatBonus: -3, ignoreEvasion: true, ignoreDef: true }] },
    'Rock Toss': { targetType: 'enemyCard', effects: [{ type: 'damage', ignoreEvasion: true }] },
    'Fossilize': { targetType: 'self', effects: [{ type: 'healSelf', amount: 5 }, { type: 'status', status: 'def_up', value: 2, duration: 2 }] },
    'Backstab': { targetType: 'enemyCard', effects: [{ type: 'damage', multiplier: 2, ignoreEvasion: true }] },
    'Vanish': { targetType: 'self', effects: [{ type: 'status', status: 'invisible', value: 1, duration: 1 }] },
    'Soul Reap': { targetType: 'enemyCard', effects: [{ type: 'damage', useBasicAttack: true, lifesteal: true }] },
    'Healing Tide': { targetType: 'allyCard', effects: [{ type: 'heal', amount: 4 }] },
    'Bubble Shield': { targetType: 'allyCard', effects: [{ type: 'status', status: 'shielded', value: 3, duration: 999 }] },
    'Mind Wash': { targetType: 'allyCard', effects: [{ type: 'resetCooldowns' }] },
    'Scepter Smash': { targetType: 'enemyCard', effects: [{ type: 'damage', multiplier: 1.5, round: true, ignoreEvasion: true }] },
    'Fortify': { targetType: 'allAllies', effects: [{ type: 'status', status: 'def_up', value: 2, duration: 2 }] },
    'Rallying Cry': { targetType: 'allAllies', effects: [{ type: 'cleanse', debuffs: ['burned', 'frozen', 'poisoned', 'bleeding', 'def_down'] }] },
    'Gale Shot': { targetType: 'enemyCard', effects: [{ type: 'damage', useBasicAttack: true, onHitStatus: { status: 'def_down', value: 1, duration: 1 } }] },
    'Volley': { targetType: 'allEnemies', effects: [{ type: 'damage', multiplier: 0.5, floor: true, ignoreEvasion: true, ignoreDef: true, repeat: 3, randomTarget: true }] },
    'Focus': { targetType: 'self', effects: [{ type: 'status', status: 'focused', value: 1, duration: 999 }] },
    'Venom Spit': { targetType: 'enemyCard', effects: [{ type: 'status', status: 'poisoned', value: 1, duration: 3 }] },
    'Lacerate': { targetType: 'enemyCard', effects: [{ type: 'damage', useBasicAttack: true, onHitStatus: { status: 'bleeding', value: 1, duration: 2 } }] },
    'Noxious Cloud': { targetType: 'allEnemies', effects: [{ type: 'status', status: 'poisoned', value: 1, duration: 2 }] },
    // ── Dripwarts pack ───────────────────────────────────────────────────────
    'Expelli-Drip-Mus': { targetType: 'enemyCard', effects: [{ type: 'damage', multiplier: 0.7 }, { type: 'status', status: 'frozen', value: 1, duration: 1 }] },
    'Nimbus 2000 Retro': { targetType: 'self', effects: [{ type: 'status', status: 'eva_up', value: 5, duration: 2 }] },
    'Wand Flex': { targetType: 'enemyCard', effects: [{ type: 'damage', multiplier: 1.3, ignoreDef: true }] },
    'Wingardium Lev-I-O-Sa': { targetType: 'enemyCard', effects: [{ type: 'status', status: 'def_down', value: 4, duration: 2 }] },
    'Study Break': { targetType: 'self', effects: [{ type: 'healSelf', amount: 4 }, { type: 'cleanse', debuffs: ['burned', 'poisoned', 'bleeding', 'frozen', 'def_down'] }] },
    'Sectum-Sempra-Drip': { targetType: 'enemyCard', effects: [{ type: 'damage', useBasicAttack: true, onHitStatus: { status: 'bleeding', value: 3, duration: 3 } }] },
    'Potions Master': { targetType: 'self', effects: [{ type: 'status', status: 'def_up', value: 2, duration: 3 }, { type: 'status', status: 'eva_up', value: 2, duration: 2 }, { type: 'healSelf', amount: 3 }] },
    'Avada Kedavra': { targetType: 'enemyCard', effects: [{ type: 'damage', multiplier: 3.5, ignoreDef: true }] },
    'Snake Walk': { targetType: 'self', effects: [{ type: 'status', status: 'invisible', value: 1, duration: 1 }] },
    'Firework Show': { targetType: 'allEnemies', effects: [{ type: 'damage', multiplier: 0.8, ignoreEvasion: true }, { type: 'status', status: 'burned', value: 1, duration: 2 }] },
    'Points to Gryffindor': { targetType: 'allAllies', effects: [{ type: 'status', status: 'atk_up', value: 3, duration: 3 }] },
    'Umbrella Poke': { targetType: 'enemyCard', effects: [{ type: 'damage', useBasicAttack: true, defPiercing: 3 }] },
    'Release the Hounds': { targetType: 'allEnemies', effects: [{ type: 'damage', multiplier: 0.6 }, { type: 'status', status: 'bleeding', value: 1, duration: 2 }] },
    'Pop a Cap': { targetType: 'enemyCard', effects: [{ type: 'damage', multiplier: 1.2, ignoreEvasion: true }] },
    'Tactical Apparition': { targetType: 'self', effects: [{ type: 'status', status: 'invulnerable', value: 1, duration: 1 }] },
    'Mag Dump': { targetType: 'allEnemies', effects: [{ type: 'damage', multiplier: 0.4, floor: true, ignoreEvasion: true, repeat: 4, randomTarget: true }] },
    'Silver Tongue': { targetType: 'enemyCard', effects: [{ type: 'status', status: 'def_down', value: 3, duration: 3 }] },
    'Cane Strike': { targetType: 'enemyCard', effects: [{ type: 'damage', useBasicAttack: true, onHitStatus: { status: 'frozen', value: 1, duration: 1 } }] },
    'Crucial Strike': { targetType: 'enemyCard', effects: [{ type: 'damage', multiplier: 2.2, ignoreDef: true }] },
    'Dagger Toss': { targetType: 'enemyCard', effects: [{ type: 'damage', multiplier: 1.2, ignoreEvasion: true }] },
    'Slug Vomit Trap': { targetType: 'enemyCard', effects: [{ type: 'status', status: 'poisoned', value: 2, duration: 3 }, { type: 'status', status: 'frozen', value: 1, duration: 1 }] },
    'Broken Wand Blast': { targetType: 'enemyCard', effects: [{ type: 'damage', multiplier: 2.2, ignoreDef: true }] },
    // ── Vanguard Knight ──────────────────────────────────────────────────────
    'Guardian Strike': { targetType: 'enemyCard', effects: [{ type: 'damage', useBasicAttack: true }] },
    'Guard Up': { targetType: 'self', effects: [{ type: 'status', status: 'def_up', value: 2, duration: 2 }] },
};

// Derive ABILITY_TARGETS from definitions (used by initiateAbility routing)
const ABILITY_TARGETS = Object.fromEntries(
    Object.entries(ABILITY_DEFS).map(([name, def]) => [name, def.targetType])
);

const getAbilityDefinition = (ability) => {
    if (!ability) return null;
    if (ability.customConfig && ability.customConfig.targetType && Array.isArray(ability.customConfig.effects)) {
        return ability.customConfig;
    }
    return ABILITY_DEFS[ability.name] || null;
};

const getAbilityTarget = (ability) => {
    const def = getAbilityDefinition(ability);
    return def?.targetType || 'enemyCard';
};

/** Alias used by cardGameSlice.js */
const getAbilityTargetType = getAbilityTarget;

const isUntouchable = (card, state) => {
    if (hasStatus(card, 'invulnerable') || hasStatus(card, 'invisible')) {
        state.log.unshift(`${card.name} can't be targeted!`);
        return true;
    }
    return false;
};

// ── Microevent effect modification ───────────────────────────────────────────

/**
 * Returns a modified copy of `effects` based on the microevent result.
 * Binary: downgrades on failure. Scaled: scales intensity by score.
 */
const applyMicroeventModifications = (abilityName, effects, microeventResult) => {
    const { success, score } = microeventResult;
    const clone = effects.map((e) => ({
        ...e,
        ...(e.onHitStatus ? { onHitStatus: { ...e.onHitStatus } } : {}),
    }));

    switch (abilityName) {
        // ── QTE binary ────────────────────────────────────────────────────────
        case 'Supernova':
            if (!success) return clone.map((e) => e.type === 'damage' ? { ...e, multiplier: 1 } : e);
            break;
        case 'Backstab':
            if (!success) return clone.map((e) => e.type === 'damage' ? { ...e, multiplier: 1, ignoreEvasion: false } : e);
            break;
        case 'Scepter Smash':
            if (!success) return clone.map((e) => e.type === 'damage' ? { ...e, multiplier: 1, round: false } : e);
            break;
        case 'Quick Bolt':
            if (!success) return []; // miss entirely
            break;

        // ── Pattern scaled ────────────────────────────────────────────────────
        case 'Gale Shot': {
            if (score <= 0) return [];
            return clone;
        }
        case 'Volley': {
            const hits = Math.max(0, Math.round(score * 3));
            return clone.map((e) => e.type === 'damage' ? { ...e, repeat: hits } : e);
        }
        case 'Quake': {
            const bonus = Math.round(-3 + score * 3);
            return clone.map((e) => e.type === 'damage' ? { ...e, flatBonus: bonus } : e);
        }
        case 'Short Circuit': {
            if (score < 0.34) return [];
            if (score < 0.67) return clone.map((e) => e.type === 'status' ? { ...e, valueFn: undefined, value: 2 } : e);
            break; // full effect (valueFn stays)
        }

        // ── Quiz binary ───────────────────────────────────────────────────────
        case 'Fortify':
            if (!success) return clone.map((e) => e.type === 'status' ? { ...e, value: 1 } : e);
            break;
        case 'Healing Tide':
            if (!success) return clone.map((e) => e.type === 'heal' ? { ...e, amount: 2 } : e);
            break;
        case 'Mind Wash':
            if (!success) return clone.map((e) => e.type === 'resetCooldowns' ? { ...e, firstOnly: true } : e);
            break;
        case 'Fossilize':
            if (!success) return clone.filter((e) => e.type !== 'status');
            break;

        // ── Rhythm scaled ─────────────────────────────────────────────────────
        case 'Noxious Cloud': {
            const duration = Math.max(1, Math.round(score * 2));
            return clone.map((e) => e.type === 'status' ? { ...e, duration } : e);
        }
        case 'Soul Reap': {
            if (score < 0.25) return clone.map((e) => e.type === 'damage' ? { ...e, lifesteal: false } : e);
            if (score < 0.75) return clone.map((e) => e.type === 'damage' ? { ...e, lifeStealMultiplier: 0.5 } : e);
            break;
        }
        case 'Lacerate': {
            const bleedDuration = Math.max(1, Math.round(score * 2));
            return clone.map((e) =>
                e.type === 'damage' && e.onHitStatus
                    ? { ...e, onHitStatus: { ...e.onHitStatus, duration: bleedDuration } }
                    : e
            );
        }

        // ── Mash scaled ────────────────────────────────────────────────────────
        case 'Searing Lash': {
            const bonus = Math.round((score - 0.5) * 6); // -3 at 0, 0 at 0.5, +3 at 1
            return clone.map((e) => e.type === 'damage' ? { ...e, flatBonus: (e.flatBonus ?? 0) + bonus } : e);
        }
        case 'Crack Attack': {
            const bonus = Math.round((score - 0.5) * 6);
            return clone.map((e) => e.type === 'damage' ? { ...e, flatBonus: (e.flatBonus ?? 0) + bonus } : e);
        }

        default: break;
    }
    return clone;
};

// ── Ability execution ─────────────────────────────────────────────────────────

// Resolves and applies one effect descriptor to a single (caster → target) pair.
const applySingleEffect = (effect, caster, casterPlayer, casterCardIdx, target, targetPlayer, targetCardIdx, state, abilityName) => {
    switch (effect.type) {
        case 'damage': {
            let dmg;
            if (effect.useBasicAttack) {
                const result = resolveBasicAttack(caster, target, targetPlayer, state);
                if (!result.hit) { state.log.unshift(`${abilityName} missed!`); return; }
                dmg = result.damage;
            } else {
                if (!effect.ignoreEvasion) {
                    const roll = Math.floor(Math.random() * 10);
                    if (roll < getEffectiveEva(target)) {
                        pushHitEvent(state, targetPlayer.id, target.id, 0, 'miss', target.name, target.currentHealth, target.health);
                        state.log.unshift(`${abilityName} missed!`);
                        return;
                    }
                }
                const atk = getEffectiveAtk(caster);
                const mult = effect.multiplier ?? 1;
                const rawAtk = mult === 1 ? atk
                    : effect.floor ? Math.floor(atk * mult)
                        : effect.round ? Math.round(atk * mult)
                            : atk * mult;
                const base = rawAtk + (effect.flatBonus ?? 0);
                const effDef = effect.ignoreDef
                    ? 0
                    : Math.max(0, getEffectiveDef(target) - (effect.defPiercing ?? 0));
                dmg = Math.max(1, base - effDef);
            }
            const actualDmg = applyDamageToCard(targetPlayer, targetCardIdx, dmg, state);
            if (effect.onHitStatus && actualDmg > 0) {
                const live = targetPlayer.inPlay[targetCardIdx];
                if (live && !live.dying) {
                    const { status, value, duration } = effect.onHitStatus;
                    addStatus(live, status, value, duration);
                    state.log.unshift(`${target.name} is afflicted with ${status}! (${value} × ${duration} turns)`);
                }
            }
            if (effect.lifesteal && actualDmg > 0) {
                const lsMult = effect.lifeStealMultiplier ?? 1;
                const healed = Math.max(1, Math.floor(actualDmg * lsMult));
                caster.currentHealth = Math.min(caster.health, caster.currentHealth + healed);
                state.log.unshift(`${caster.name} drains ${healed} HP!`);
            }
            break;
        }
        case 'status': {
            const value = effect.valueFn === 'targetDef' ? (target.defense || 0) : effect.value;
            addStatus(target, effect.status, value, effect.duration);
            state.log.unshift(`${target.name} gains ${effect.status}!`);
            break;
        }
        case 'heal': {
            target.currentHealth = Math.min(target.health, target.currentHealth + effect.amount);
            state.log.unshift(`${target.name} is healed for ${effect.amount} HP!`);
            break;
        }
        case 'healSelf': {
            caster.currentHealth = Math.min(caster.health, caster.currentHealth + effect.amount);
            state.log.unshift(`${caster.name} restores ${effect.amount} HP!`);
            break;
        }
        case 'cleanse': {
            target.statusEffects = (target.statusEffects || []).filter((s) => !effect.debuffs.includes(s.type));
            state.log.unshift(`${target.name} is cleansed!`);
            break;
        }
        case 'resetCooldowns': {
            if (effect.firstOnly) {
                if (target.actions[0]) target.actions[0] = { ...target.actions[0], usesRemaining: target.actions[0].limit };
                state.log.unshift(`${target.name}'s first ability is partially refreshed!`);
            } else {
                target.actions = target.actions.map((a) => ({ ...a, usesRemaining: a.limit }));
                state.log.unshift(`${target.name}'s abilities are fully refreshed!`);
            }
            break;
        }
        case 'selfDestruct': {
            casterPlayer.discardPile.push({ ...caster });
            casterPlayer.inPlay.splice(casterCardIdx, 1);
            state.log.unshift(`${caster.name} self-destructs!`);
            break;
        }
    }
};

const executeAbility = (state, casterPlayerId, casterCardIdx, abilityIdx, targetCardIdx, targetPlayerId = null, microeventResult = null) => {
    const casterPlayer = state.players.find((p) => p.id === casterPlayerId);
    const resolveEnemyPlayer = () =>
        targetPlayerId
            ? state.players.find((p) => p.id === targetPlayerId)
            : getEnemies(state, casterPlayerId)[0];

    const caster = casterPlayer.inPlay[casterCardIdx];
    if (!caster) return;

    const ability = caster.actions[abilityIdx];
    if (!ability || ability.usesRemaining <= 0) {
        state.log.unshift(`${ability?.name ?? 'Ability'} has no uses left!`);
        return;
    }

    const def = getAbilityDefinition(ability);
    if (!def) {
        ability.usesRemaining -= 1;
        caster.acted = true;
        state.log.unshift(`${caster.name} uses ${ability.name}! (no effect defined)`);
        return;
    }

    ability.usesRemaining -= 1;
    caster.acted = true;
    state.log.unshift(`${caster.name} uses ${ability.name}!`);

    const { targetType } = def;
    const effects = (microeventResult && ability.microevent)
        ? applyMicroeventModifications(ability.name, def.effects, microeventResult)
        : def.effects;

    for (const effect of effects) {
        if (targetType === 'self') {
            applySingleEffect(effect, caster, casterPlayer, casterCardIdx, caster, casterPlayer, casterCardIdx, state, ability.name);

        } else if (targetType === 'enemyCard') {
            const ep = resolveEnemyPlayer();
            if (!ep) continue;
            const t = ep.inPlay[targetCardIdx];
            if (!t || isUntouchable(t, state)) continue;
            applySingleEffect(effect, caster, casterPlayer, casterCardIdx, t, ep, targetCardIdx, state, ability.name);

        } else if (targetType === 'allyCard') {
            const t = casterPlayer.inPlay[targetCardIdx];
            if (!t) continue;
            applySingleEffect(effect, caster, casterPlayer, casterCardIdx, t, casterPlayer, targetCardIdx, state, ability.name);

        } else if (targetType === 'allEnemies') {
            if (effect.type === 'damage' && effect.randomTarget) {
                const allCards = getEnemies(state, casterPlayerId).flatMap((ep) =>
                    ep.inPlay.map((_, i) => ({ ep, i }))
                );
                if (allCards.length === 0) { state.log.unshift(`No targets for ${ability.name}!`); continue; }
                const hits = effect.repeat ?? 1;
                for (let v = 0; v < hits; v++) {
                    const { ep, i } = allCards[Math.floor(Math.random() * allCards.length)];
                    if (!ep.inPlay[i] || ep.inPlay[i].dying) continue;
                    applySingleEffect(
                        { ...effect, repeat: undefined, randomTarget: false },
                        caster, casterPlayer, casterCardIdx, ep.inPlay[i], ep, i, state, ability.name
                    );
                }
            } else if (effect.type === 'damage') {
                for (const ep of getEnemies(state, casterPlayerId)) {
                    for (let i = ep.inPlay.length - 1; i >= 0; i--) {
                        if (ep.inPlay[i]?.dying) continue;
                        applySingleEffect(effect, caster, casterPlayer, casterCardIdx, ep.inPlay[i], ep, i, state, ability.name);
                    }
                }
            } else if (effect.type === 'status') {
                for (const ep of getEnemies(state, casterPlayerId)) {
                    for (const c of ep.inPlay) addStatus(c, effect.status, effect.value, effect.duration);
                }
                state.log.unshift(`${ability.name} applies ${effect.status} to all enemies!`);
            }

        } else if (targetType === 'allAllies') {
            if (effect.type === 'status') {
                for (const ally of getAllies(state, casterPlayerId)) {
                    for (const c of ally.inPlay) addStatus(c, effect.status, effect.value, effect.duration);
                }
                state.log.unshift(`${ability.name} grants ${effect.status} to all allies!`);
            } else if (effect.type === 'cleanse') {
                for (const ally of getAllies(state, casterPlayerId)) {
                    for (const c of ally.inPlay) {
                        c.statusEffects = (c.statusEffects || []).filter((s) => !effect.debuffs.includes(s.type));
                    }
                }
                state.log.unshift(`${ability.name} cleanses all allies!`);
            }
        }
    }
};

// ── DOT / status tick at turn start ──────────────────────────────────────────

const processStatusEffects = (player, state) => {
    const DOT_TYPES = ['burned', 'poisoned', 'bleeding'];
    for (let i = player.inPlay.length - 1; i >= 0; i--) {
        const card = player.inPlay[i];
        if (!card.statusEffects?.length) continue;

        // Apply DOTs
        for (const status of card.statusEffects) {
            if (DOT_TYPES.includes(status.type)) {
                card.currentHealth = Math.max(0, card.currentHealth - status.value);
                pushRecapEvent(state, { type: 'dot', cardName: card.name, targetPlayerId: player.id, damage: status.value, dotType: status.type, healthAfter: card.currentHealth, maxHealth: card.health });
                state.log.unshift(`${card.name} takes ${status.value} ${status.type} damage!`);
            }
        }
        if (card.currentHealth <= 0) {
            player.discardPile.push({ ...card });
            player.inPlay.splice(i, 1);
            pushRecapEvent(state, { type: 'dotDefeat', cardName: card.name, targetPlayerId: player.id });
            state.log.unshift(`${card.name} was defeated by status effects!`);
            continue;
        }

        // Tick durations (999 = permanent until consumed)
        card.statusEffects = card.statusEffects
            .map((s) => (s.duration === 999 ? s : { ...s, duration: s.duration - 1 }))
            .filter((s) => s.duration > 0);
    }
};

// ── Exports ───────────────────────────────────────────────────────────────────

export {
    addStatus,
    removeStatus,
    hasStatus,
    getStatus,
    getEffectiveDef,
    getEffectiveEva,
    getEffectiveAtk,
    getEnemies,
    getAllies,
    pushHitEvent,
    pushRecapEvent,
    cleanupDefeated,
    applyDamageToCard,
    resolveBasicAttack,
    ABILITY_DEFS,
    ABILITY_TARGETS,
    getAbilityDefinition,
    getAbilityTarget,
    getAbilityTargetType,
    isUntouchable,
    applyMicroeventModifications,
    applySingleEffect,
    executeAbility,
    processStatusEffects,
};

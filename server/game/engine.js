/**
 * server/game/engine.js
 *
 * Pure-JS game engine supporting 2-6 players, teams, and configurable settings.
 * All functions take and mutate a plain state object (deep-cloned before dispatch).
 */

'use strict';

const cards = require('./cards');

// ── Helpers ───────────────────────────────────────────────────────────────────

const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);

const deepClone = (obj) => JSON.parse(JSON.stringify(obj));

const AVATAR_URLS = [
    'https://i.pravatar.cc/150?img=3',
    'https://i.pravatar.cc/150?img=5',
    'https://i.pravatar.cc/150?img=8',
    'https://i.pravatar.cc/150?img=12',
    'https://i.pravatar.cc/150?img=15',
    'https://i.pravatar.cc/150?img=20',
];

/** Auto-scale max battlers based on player count unless overridden. */
const defaultMaxBattlers = (playerCount) => {
    if (playerCount <= 2) return 8;
    if (playerCount <= 4) return 6;
    return 4;
};

const buildPlayer = (id, name, image, startingHp = 20, team = null, deckSize = null) => {
    let pool = shuffle(cards).map((c) => ({
        ...c,
        currentHealth: c.health,
        statusEffects: [],
        actions: c.actions.map((a) => ({ ...a })),
        passives: c.passives.map((p) => ({ ...p })),
        acted: false,
        justPlayed: false,
    }));
    // Cap deck size if specified (minimum 4 so there are always cards to draw)
    if (deckSize !== null && deckSize > 0) pool = pool.slice(0, Math.max(4, deckSize));
    return {
        id,
        name,
        health: startingHp,
        maxHealth: startingHp,
        image,
        hand: pool.slice(0, 3),
        deck: pool.slice(3),
        discardPile: [],
        inPlay: [],
        team,
        elements: {},
        statusEffects: [],
        eliminated: false,
    };
};

/**
 * @param {Array<{id,name,image?,team?}>} playerConfigs  2–6 players
 * @param {{ startingHp?, maxBattlers?, teamMode? }} settings
 */
const createInitialState = (playerConfigs, settings = {}) => {
    const { startingHp = 20, teamMode = 'ffa' } = settings;
    const playerCount = playerConfigs.length;
    const maxBattlers = settings.maxBattlers ?? defaultMaxBattlers(playerCount);
    const deckSize = settings.deckSize ?? null;

    const players = playerConfigs.map(({ id, name, image, team }, i) =>
        buildPlayer(id, name, image ?? AVATAR_URLS[i] ?? AVATAR_URLS[0], startingHp, teamMode === 'teams' ? (team ?? null) : null, deckSize)
    );

    const turnOrder = players.map((p) => p.id);
    return {
        players,
        settings: { startingHp, maxBattlers, deckSize, teamMode },
        turnOrder,
        turnIndex: 0,
        currentTurn: turnOrder[0],
        phase: 'main',         // 'main' | 'selectingTarget' | 'selectingAllyTarget'
        pendingAction: null,
        log: [`Game started! ${players[0].name} goes first.`],
        gameOver: false,
        winner: null,          // player id (FFA) or team letter (team mode)
        lastHitEvents: [],
        recapEvents: [],
        turnSummary: [],
        cardPlayedThisTurn: false,
    };
};

// ── Team / targeting helpers ──────────────────────────────────────────────────

/** All opponents with health > 0. */
const getEnemies = (state, playerId) => {
    const me = state.players.find((p) => p.id === playerId);
    if (state.settings?.teamMode === 'teams' && me?.team !== null) {
        return state.players.filter((p) => p.team !== me.team && !p.eliminated && p.health > 0);
    }
    return state.players.filter((p) => p.id !== playerId && !p.eliminated && p.health > 0);
};

/** The caster's own team (includes self). */
const getAllies = (state, playerId) => {
    const me = state.players.find((p) => p.id === playerId);
    if (state.settings?.teamMode === 'teams' && me?.team !== null) {
        return state.players.filter((p) => p.team === me.team && !p.eliminated);
    }
    return [me];
};

/**
 * Check if the game is over. Mutates state.gameOver / state.winner.
 * Returns true if the game ended.
 */
const checkWinCondition = (state) => {
    if (state.settings?.teamMode === 'teams') {
        const aliveTeams = new Set(
            state.players.filter((p) => !p.eliminated && p.health > 0).map((p) => p.team)
        );
        if (aliveTeams.size === 1) {
            const team = [...aliveTeams][0];
            state.gameOver = true;
            state.winner = team;
            const names = state.players.filter((p) => p.team === team).map((p) => p.name).join(' & ');
            state.log.unshift(`Team ${team} wins! (${names})`);
            return true;
        }
        if (aliveTeams.size === 0) {
            state.gameOver = true;
            state.winner = null;
            state.log.unshift('Draw — all players eliminated!');
            return true;
        }
    } else {
        const alive = state.players.filter((p) => !p.eliminated && p.health > 0);
        if (alive.length === 1) {
            state.gameOver = true;
            state.winner = alive[0].id;
            state.log.unshift(`${alive[0].name} wins!`);
            return true;
        }
        if (alive.length === 0) {
            state.gameOver = true;
            state.winner = null;
            state.log.unshift('Draw — all players eliminated!');
            return true;
        }
    }
    return false;
};

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

    let damage = Math.max(1, (attacker.attack || 5) - getEffectiveDef(defender));

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
};

// Derive ABILITY_TARGETS from definitions (used by initiateAbility routing)
const ABILITY_TARGETS = Object.fromEntries(
    Object.entries(ABILITY_DEFS).map(([name, def]) => [name, def.targetType])
);

const isUntouchable = (card, state) => {
    if (hasStatus(card, 'invulnerable') || hasStatus(card, 'invisible')) {
        state.log.unshift(`${card.name} can't be targeted!`);
        return true;
    }
    return false;
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
                const atk = caster.attack || 5;
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
                caster.currentHealth = Math.min(caster.health, caster.currentHealth + actualDmg);
                state.log.unshift(`${caster.name} drains ${actualDmg} HP!`);
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
            target.actions = target.actions.map((a) => ({ ...a, usesRemaining: a.limit }));
            state.log.unshift(`${target.name}'s abilities are fully refreshed!`);
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

const executeAbility = (state, casterPlayerId, casterCardIdx, abilityIdx, targetCardIdx, targetPlayerId = null) => {
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

    const def = ABILITY_DEFS[ability.name];
    if (!def) {
        ability.usesRemaining -= 1;
        caster.acted = true;
        state.log.unshift(`${caster.name} uses ${ability.name}! (no effect defined)`);
        return;
    }

    ability.usesRemaining -= 1;
    caster.acted = true;
    state.log.unshift(`${caster.name} uses ${ability.name}!`);

    const { targetType, effects } = def;

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

    // Placeholder to preserve the old switch shape — never reached
    if (false) {
        switch (ability.name) {
            case 'Crack Attack': {
                const ep = resolveEnemyPlayer(); if (!ep) break;
                const t = ep.inPlay[targetCardIdx];
                if (!t || isUntouchable(t, state)) break;
                const evadeRoll = Math.floor(Math.random() * 10);
                if (evadeRoll >= getEffectiveEva(t)) {
                    const effectiveDef = Math.max(0, getEffectiveDef(t) - 2);
                    const dmg = Math.max(1, (caster.attack || 5) - effectiveDef);
                    applyDamageToCard(ep, targetCardIdx, dmg, state);
                    state.log.unshift(`Crack Attack ignores 2 DEF! (${dmg} dmg)`);
                } else state.log.unshift('Crack Attack missed!');
                break;
            }
            case 'Smoke Break': {
                addStatus(caster, 'invulnerable', 1, 1);
                state.log.unshift(`${caster.name} is invulnerable for 1 turn!`);
                break;
            }
            case 'Ice Slash': {
                const ep = resolveEnemyPlayer(); if (!ep) break;
                const t = ep.inPlay[targetCardIdx];
                if (!t || isUntouchable(t, state)) break;
                const { hit, damage } = resolveBasicAttack(caster, t, ep, state);
                if (hit) { applyDamageToCard(ep, targetCardIdx, damage, state); state.log.unshift(`Ice Slash deals ${damage} damage!`); }
                else state.log.unshift('Ice Slash missed!');
                break;
            }
            case 'Freeze': {
                const ep = resolveEnemyPlayer(); if (!ep) break;
                const t = ep.inPlay[targetCardIdx];
                if (!t || isUntouchable(t, state)) break;
                addStatus(t, 'frozen', 1, 1);
                state.log.unshift(`${t.name} is Frozen – cannot act next turn!`);
                break;
            }
            case 'Blizzard': {
                addStatus(caster, 'invulnerable', 1, 1);
                state.log.unshift(`${caster.name} hides in a blizzard – invulnerable 1 turn!`);
                break;
            }
            case 'Searing Lash': {
                const ep = resolveEnemyPlayer(); if (!ep) break;
                const t = ep.inPlay[targetCardIdx];
                if (!t || isUntouchable(t, state)) break;
                const { hit, damage } = resolveBasicAttack(caster, t, ep, state);
                if (hit) {
                    applyDamageToCard(ep, targetCardIdx, damage, state);
                    if (ep.inPlay[targetCardIdx]) { addStatus(ep.inPlay[targetCardIdx], 'burned', 2, 3); state.log.unshift(`${t.name} is Burned! (2 dmg/turn × 3 turns)`); }
                } else state.log.unshift('Searing Lash missed!');
                break;
            }
            case 'Wall of Fire': {
                addStatus(caster, 'damage_reduction', 1, 1);
                state.log.unshift(`${caster.name} raises a Wall of Fire – damage halved for 1 turn!`);
                break;
            }
            case 'Supernova': {
                const ep = resolveEnemyPlayer(); if (!ep) break;
                const t = ep.inPlay[targetCardIdx];
                if (!t || isUntouchable(t, state)) break;
                const dmg = (caster.attack || 5) * 3;
                applyDamageToCard(ep, targetCardIdx, dmg, state);
                state.log.unshift(`SUPERNOVA! ${t.name} takes ${dmg} damage! ${caster.name} self-destructs!`);
                casterPlayer.discardPile.push({ ...caster });
                casterPlayer.inPlay.splice(casterCardIdx, 1);
                break;
            }
            case 'Quick Bolt': {
                const ep = resolveEnemyPlayer(); if (!ep) break;
                const t = ep.inPlay[targetCardIdx];
                if (!t || isUntouchable(t, state)) break;
                const dmg = Math.max(1, Math.floor((caster.attack || 5) / 2));
                applyDamageToCard(ep, targetCardIdx, dmg, state);
                state.log.unshift(`Quick Bolt strikes for ${dmg} (ignores evasion)!`);
                break;
            }
            case 'Thunder Dash': {
                addStatus(caster, 'eva_up', 4, 2);
                state.log.unshift(`${caster.name} Thunder Dashes – EVA +4 for 2 turns!`);
                break;
            }
            case 'Short Circuit': {
                const ep = resolveEnemyPlayer(); if (!ep) break;
                const t = ep.inPlay[targetCardIdx];
                if (!t || isUntouchable(t, state)) break;
                addStatus(t, 'def_down', t.defense, 1);
                state.log.unshift(`${t.name}'s DEF reduced to 0 for 1 turn! (Short Circuit)`);
                break;
            }
            case 'Quake': {
                // AoE: hits all enemy players
                const dmg = Math.max(1, (caster.attack || 5) - 3);
                for (const ep of getEnemies(state, casterPlayerId)) {
                    for (let i = ep.inPlay.length - 1; i >= 0; i--) applyDamageToCard(ep, i, dmg, state);
                }
                state.log.unshift(`Quake shakes all enemies for ${dmg} each!`);
                break;
            }
            case 'Rock Toss': {
                const ep = resolveEnemyPlayer(); if (!ep) break;
                const t = ep.inPlay[targetCardIdx];
                if (!t || isUntouchable(t, state)) break;
                const dmg = Math.max(1, (caster.attack || 5) - getEffectiveDef(t));
                applyDamageToCard(ep, targetCardIdx, dmg, state);
                state.log.unshift(`Rock Toss deals ${dmg} (ignores evasion)!`);
                break;
            }
            case 'Fossilize': {
                caster.currentHealth = Math.min(caster.health, caster.currentHealth + 5);
                addStatus(caster, 'def_up', 2, 2);
                state.log.unshift(`${caster.name} fossilizes – +5 HP, DEF +2 for 2 turns!`);
                break;
            }
            case 'Backstab': {
                const ep = resolveEnemyPlayer(); if (!ep) break;
                const t = ep.inPlay[targetCardIdx];
                if (!t || isUntouchable(t, state)) break;
                const dmg = Math.max(1, (caster.attack || 5) * 2 - getEffectiveDef(t));
                applyDamageToCard(ep, targetCardIdx, dmg, state);
                state.log.unshift(`Backstab deals ${dmg} (2× ATK)!`);
                break;
            }
            case 'Vanish': {
                addStatus(caster, 'invisible', 1, 1);
                state.log.unshift(`${caster.name} vanishes into the shadows!`);
                break;
            }
            case 'Soul Reap': {
                const ep = resolveEnemyPlayer(); if (!ep) break;
                const t = ep.inPlay[targetCardIdx];
                if (!t || isUntouchable(t, state)) break;
                const { hit, damage } = resolveBasicAttack(caster, t, ep, state);
                if (hit) {
                    applyDamageToCard(ep, targetCardIdx, damage, state);
                    caster.currentHealth = Math.min(caster.health, caster.currentHealth + damage);
                    state.log.unshift(`Soul Reap deals ${damage} and heals ${caster.name} for ${damage}!`);
                } else state.log.unshift('Soul Reap missed!');
                break;
            }
            case 'Healing Tide': {
                const t = casterPlayer.inPlay[targetCardIdx];
                if (!t) break;
                t.currentHealth = Math.min(t.health, t.currentHealth + 4);
                state.log.unshift(`Healing Tide heals ${t.name} for 4 HP!`);
                break;
            }
            case 'Bubble Shield': {
                const t = casterPlayer.inPlay[targetCardIdx];
                if (!t) break;
                addStatus(t, 'shielded', 3, 999);
                state.log.unshift(`${t.name} gains a 3-damage shield!`);
                break;
            }
            case 'Mind Wash': {
                const t = casterPlayer.inPlay[targetCardIdx];
                if (!t) break;
                t.actions = t.actions.map((a) => ({ ...a, usesRemaining: a.limit }));
                state.log.unshift(`${t.name}'s ability cooldowns are fully reset!`);
                break;
            }
            case 'Scepter Smash': {
                const ep = resolveEnemyPlayer(); if (!ep) break;
                const t = ep.inPlay[targetCardIdx];
                if (!t || isUntouchable(t, state)) break;
                const dmg = Math.max(1, Math.round((caster.attack || 5) * 1.5) - getEffectiveDef(t));
                applyDamageToCard(ep, targetCardIdx, dmg, state);
                state.log.unshift(`Scepter Smash deals ${dmg} (1.5× ATK)!`);
                break;
            }
            case 'Fortify': {
                // AoE: buffs all allies
                for (const ally of getAllies(state, casterPlayerId)) {
                    for (const c of ally.inPlay) addStatus(c, 'def_up', 2, 2);
                }
                state.log.unshift(`Fortify grants all allies DEF +2 for 2 turns!`);
                break;
            }
            case 'Rallying Cry': {
                // AoE: cleanses all allies
                const debuffs = ['burned', 'frozen', 'poisoned', 'bleeding', 'def_down'];
                for (const ally of getAllies(state, casterPlayerId)) {
                    for (const c of ally.inPlay) {
                        c.statusEffects = (c.statusEffects || []).filter((s) => !debuffs.includes(s.type));
                    }
                }
                state.log.unshift(`Rallying Cry cleanses all debuffs from every ally!`);
                break;
            }
            case 'Gale Shot': {
                const ep = resolveEnemyPlayer(); if (!ep) break;
                const t = ep.inPlay[targetCardIdx];
                if (!t || isUntouchable(t, state)) break;
                const { hit, damage } = resolveBasicAttack(caster, t, ep, state);
                if (hit) {
                    applyDamageToCard(ep, targetCardIdx, damage, state);
                    if (ep.inPlay[targetCardIdx]) { addStatus(ep.inPlay[targetCardIdx], 'def_down', 1, 1); state.log.unshift(`Gale Shot knocks ${t.name} back – DEF -1 next turn!`); }
                } else state.log.unshift('Gale Shot missed!');
                break;
            }
            case 'Volley': {
                // AoE random: fires at random enemy cards across all enemies
                const allEnemyCards = getEnemies(state, casterPlayerId).flatMap((ep) =>
                    ep.inPlay.map((_, i) => ({ ep, i }))
                );
                if (allEnemyCards.length === 0) { state.log.unshift('No targets for Volley!'); break; }
                const volleyDmg = Math.max(1, Math.floor((caster.attack || 5) / 2));
                for (let v = 0; v < 3; v++) {
                    if (allEnemyCards.length === 0) break;
                    const { ep, i } = allEnemyCards[Math.floor(Math.random() * allEnemyCards.length)];
                    applyDamageToCard(ep, i, volleyDmg, state);
                }
                state.log.unshift(`Volley fires ${volleyDmg}-dmg arrows at 3 random targets!`);
                break;
            }
            case 'Focus': {
                addStatus(caster, 'focused', 1, 999);
                state.log.unshift(`${caster.name} focuses – next attack deals 2.5× damage!`);
                break;
            }
            case 'Venom Spit': {
                const ep = resolveEnemyPlayer(); if (!ep) break;
                const t = ep.inPlay[targetCardIdx];
                if (!t || isUntouchable(t, state)) break;
                addStatus(t, 'poisoned', 1, 3);
                state.log.unshift(`${t.name} is Poisoned! (1 dmg/turn × 3 turns)`);
                break;
            }
            case 'Lacerate': {
                const ep = resolveEnemyPlayer(); if (!ep) break;
                const t = ep.inPlay[targetCardIdx];
                if (!t || isUntouchable(t, state)) break;
                const { hit, damage } = resolveBasicAttack(caster, t, ep, state);
                if (hit) {
                    applyDamageToCard(ep, targetCardIdx, damage, state);
                    if (ep.inPlay[targetCardIdx]) { addStatus(ep.inPlay[targetCardIdx], 'bleeding', 1, 2); state.log.unshift(`${t.name} is Bleeding! (1 dmg/turn × 2 turns)`); }
                } else state.log.unshift('Lacerate missed!');
                break;
            }
            case 'Noxious Cloud': {
                // AoE: poisons all enemy cards
                for (const ep of getEnemies(state, casterPlayerId)) {
                    for (const enemy of ep.inPlay) addStatus(enemy, 'poisoned', 1, 2);
                }
                state.log.unshift(`Noxious Cloud poisons all enemies! (1 dmg/turn × 2 turns)`);
                break;
            }
            default: break;
        }
    }
};

// ── DOT tick ──────────────────────────────────────────────────────────────────

const processStatusEffects = (player, state) => {
    const DOT_TYPES = ['burned', 'poisoned', 'bleeding'];
    for (let i = player.inPlay.length - 1; i >= 0; i--) {
        const card = player.inPlay[i];
        if (!card.statusEffects?.length) continue;
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
        card.statusEffects = card.statusEffects
            .map((s) => (s.duration === 999 ? s : { ...s, duration: s.duration - 1 }))
            .filter((s) => s.duration > 0);
    }
};

// ── Action handlers ───────────────────────────────────────────────────────────

const actions = {

    selectAttacker(state, { cardIndex }) {
        if (state.phase !== 'main' || state.gameOver) return;
        const player = state.players.find((p) => p.id === state.currentTurn);
        const card = player?.inPlay[cardIndex];
        if (!card) return;
        if (hasStatus(card, 'frozen')) { state.log.unshift(`${card.name} is Frozen and cannot act!`); return; }
        if (card.acted) { state.log.unshift(`${card.name} has already acted this turn!`); return; }
        if (card.justPlayed) { state.log.unshift(`${card.name} was just played and needs a turn to prepare!`); return; }

        const enemies = getEnemies(state, state.currentTurn);
        const allEnemiesEmpty = enemies.every((e) => e.inPlay.length === 0);

        if (allEnemiesEmpty && enemies.length > 0) {
            // Direct player attacks when no enemy boards have cards
            state.lastHitEvents = [];
            card.acted = true;
            const damage = Math.max(1, card.attack || 5);
            for (const enemy of enemies) {
                enemy.health = Math.max(0, enemy.health - damage);
                pushRecapEvent(state, { type: 'directHit', cardName: card.name, targetPlayerId: enemy.id, damage, healthAfter: enemy.health, maxHealth: enemy.maxHealth });
                state.log.unshift(`${card.name} attacks ${enemy.name} directly for ${damage} damage!`);
            }
            checkWinCondition(state);
            return;
        }
        state.pendingAction = { isAbility: false, casterCardIndex: cardIndex };
        state.phase = 'selectingTarget';
    },

    cancelSelection(state) {
        state.pendingAction = null;
        state.phase = 'main';
    },

    initiateAbility(state, { casterCardIndex, abilityIndex }) {
        if (state.phase !== 'main' || state.gameOver) return;
        const player = state.players.find((p) => p.id === state.currentTurn);
        const card = player?.inPlay[casterCardIndex];
        if (!card) return;
        if (hasStatus(card, 'frozen')) { state.log.unshift(`${card.name} is Frozen and cannot act!`); return; }
        if (card.acted) { state.log.unshift(`${card.name} has already acted this turn!`); return; }
        if (card.justPlayed) { state.log.unshift(`${card.name} was just played and needs a turn to prepare!`); return; }
        const ability = card.actions[abilityIndex];
        if (!ability || ability.usesRemaining <= 0) { state.log.unshift(`${ability?.name ?? 'Ability'} has no uses left!`); return; }

        const targetType = ABILITY_TARGETS[ability.name] ?? 'enemyCard';
        const enemies = getEnemies(state, state.currentTurn);

        if (targetType === 'self' || targetType === 'allEnemies' || targetType === 'allAllies') {
            state.lastHitEvents = [];
            executeAbility(state, state.currentTurn, casterCardIndex, abilityIndex, null);
            checkWinCondition(state);
        } else if (targetType === 'enemyCard') {
            const allEnemiesEmpty = enemies.every((e) => e.inPlay.length === 0);
            if (allEnemiesEmpty && enemies.length > 0) {
                state.lastHitEvents = [];
                ability.usesRemaining -= 1;
                card.acted = true;
                const dmg = Math.max(1, card.attack || 5);
                for (const enemy of enemies) {
                    enemy.health = Math.max(0, enemy.health - dmg);
                    pushRecapEvent(state, { type: 'directHit', cardName: card.name, targetPlayerId: enemy.id, damage: dmg, healthAfter: enemy.health, maxHealth: enemy.maxHealth });
                    state.log.unshift(`${card.name} uses ${ability.name} on ${enemy.name} directly for ${dmg} damage!`);
                }
                checkWinCondition(state);
                return;
            }
            state.pendingAction = { isAbility: true, casterCardIndex, abilityIndex };
            state.phase = 'selectingTarget';
        } else if (targetType === 'allyCard') {
            state.pendingAction = { isAbility: true, casterCardIndex, abilityIndex };
            state.phase = 'selectingAllyTarget';
        }
    },

    // payload: { targetCardIndex, targetPlayerId? }
    resolveOnEnemyCard(state, { targetCardIndex, targetPlayerId }) {
        if (state.phase !== 'selectingTarget' || state.gameOver) return;
        const attackerPlayer = state.players.find((p) => p.id === state.currentTurn);
        const enemies = getEnemies(state, state.currentTurn);
        const defenderPlayer = targetPlayerId
            ? state.players.find((p) => p.id === targetPlayerId)
            : enemies[0];
        if (!defenderPlayer) { state.pendingAction = null; state.phase = 'main'; return; }
        state.lastHitEvents = [];

        if (state.pendingAction.isAbility) {
            const { casterCardIndex, abilityIndex } = state.pendingAction;
            executeAbility(state, state.currentTurn, casterCardIndex, abilityIndex, targetCardIndex, defenderPlayer.id);
        } else {
            const { casterCardIndex } = state.pendingAction;
            const attacker = attackerPlayer.inPlay[casterCardIndex];
            const defender = defenderPlayer.inPlay[targetCardIndex];
            if (!attacker || !defender || defender.dying) { state.pendingAction = null; state.phase = 'main'; return; }
            const { hit, damage } = resolveBasicAttack(attacker, defender, defenderPlayer, state);
            attacker.acted = true;
            if (hit) {
                applyDamageToCard(defenderPlayer, targetCardIndex, damage, state);
                state.log.unshift(`${attacker.name} attacks ${defender.name} for ${damage} damage!`);
            } else {
                state.log.unshift(`${attacker.name} attacked ${defender.name} but missed!`);
            }
        }
        state.pendingAction = null;
        state.phase = 'main';
        checkWinCondition(state);
    },

    resolveOnAllyCard(state, { targetCardIndex }) {
        if (state.phase !== 'selectingAllyTarget' || state.gameOver) return;
        const { casterCardIndex, abilityIndex } = state.pendingAction;
        executeAbility(state, state.currentTurn, casterCardIndex, abilityIndex, targetCardIndex);
        state.pendingAction = null;
        state.phase = 'main';
    },

    // payload: { targetPlayerId? } — direct player attack when no enemy cards
    attackPlayer(state, { targetPlayerId } = {}) {
        if (state.phase !== 'selectingTarget' || state.gameOver) return;
        const attackerPlayer = state.players.find((p) => p.id === state.currentTurn);
        const enemies = getEnemies(state, state.currentTurn);
        const targets = targetPlayerId
            ? [state.players.find((p) => p.id === targetPlayerId)]
            : enemies.filter((e) => e.inPlay.length === 0);
        if (targets.length === 0 || targets.some((t) => t?.inPlay?.length > 0)) return;
        const attacker = attackerPlayer.inPlay[state.pendingAction?.casterCardIndex];
        if (!attacker) return;
        const damage = Math.max(1, attacker.attack || 5);
        for (const defenderPlayer of targets) {
            if (!defenderPlayer) continue;
            defenderPlayer.health = Math.max(0, defenderPlayer.health - damage);
            state.log.unshift(`${attacker.name} attacks ${defenderPlayer.name} directly for ${damage} damage!`);
        }
        state.pendingAction = null;
        state.phase = 'main';
        checkWinCondition(state);
    },

    playCardFromHand(state, { cardIndex }) {
        if (state.phase !== 'main' || state.gameOver) return;
        if (state.cardPlayedThisTurn) return;
        const player = state.players.find((p) => p.id === state.currentTurn);
        if (!player || cardIndex >= player.hand.length) return;
        const maxBattlers = state.settings?.maxBattlers ?? 8;
        if (player.inPlay.length >= maxBattlers) {
            state.log.unshift(`Cannot have more than ${maxBattlers} active battlers!`);
            return;
        }
        const [card] = player.hand.splice(cardIndex, 1);
        card.justPlayed = true;
        player.inPlay.push(card);
        state.cardPlayedThisTurn = true;
        state.log.unshift(`${player.name} played ${card.name} to the board!`);
    },

    commitDefeats(state) {
        cleanupDefeated(state);
        state.lastHitEvents = [];
    },

    dismissRecap(state) {
        state.turnSummary = [];
    },

    endTurn(state) {
        if (state.gameOver) return;
        cleanupDefeated(state);
        state.lastHitEvents = [];

        // Advance turn index, skipping eliminated players
        const total = state.turnOrder.length;
        let nextIndex = (state.turnIndex + 1) % total;
        for (let i = 0; i < total; i++) {
            const candidate = state.players.find((p) => p.id === state.turnOrder[nextIndex]);
            if (candidate && !candidate.eliminated && candidate.health > 0) break;
            nextIndex = (nextIndex + 1) % total;
        }
        state.turnIndex = nextIndex;
        const nextPlayer = state.players.find((p) => p.id === state.turnOrder[nextIndex]);

        for (const c of nextPlayer.inPlay) {
            c.acted = false;
            c.justPlayed = false;
        }
        state.currentTurn = nextPlayer.id;
        state.phase = 'main';
        state.pendingAction = null;
        state.cardPlayedThisTurn = false;
        processStatusEffects(nextPlayer, state);
        state.turnSummary = [...state.recapEvents];
        state.recapEvents = [];

        // Mark eliminated if health dropped to 0 from DOTs
        if (nextPlayer.health <= 0) {
            nextPlayer.eliminated = true;
            state.log.unshift(`${nextPlayer.name} has been eliminated!`);
            if (checkWinCondition(state)) return;
        }

        if (nextPlayer.deck.length > 0) {
            const drawn = nextPlayer.deck.shift();
            nextPlayer.hand.push(drawn);
            state.log.unshift(`${nextPlayer.name} drew a card.`);
        }
        state.log.unshift(`--- ${nextPlayer.name}'s turn ---`);
    },
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Create a fresh game state.
 * @param {Array<{id,name,image?,team?}>} playerConfigs  - 2–6 players
 * @param {{ startingHp?, maxBattlers?, teamMode? }} settings
 */
const createGame = (playerConfigs, settings = {}) => createInitialState(playerConfigs, settings);

/**
 * Dispatch an action against a state snapshot.
 * @param {object} state
 * @param {string} type
 * @param {object} payload
 * @returns {{ state: object, error: string|null }}
 */
const dispatch = (state, type, payload = {}) => {
    const handler = actions[type];
    if (!handler) return { state, error: `Unknown action: ${type}` };
    const next = deepClone(state);
    handler(next, payload);
    return { state: next, error: null };
};

module.exports = { createGame, dispatch };


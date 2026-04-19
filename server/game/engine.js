/**
 * server/game/engine.js
 *
 * Pure-JS game engine supporting 2-6 players, teams, and configurable settings.
 * All functions take and mutate a plain state object (deep-cloned before dispatch).
 */

'use strict';

const cards = require('./cards');

const {
    addStatus, removeStatus, hasStatus, getStatus,
    getEffectiveDef, getEffectiveEva, getEffectiveAtk,
    getEnemies, getAllies,
    pushHitEvent, pushRecapEvent, cleanupDefeated,
    applyDamageToCard, resolveBasicAttack,
    ABILITY_DEFS, ABILITY_TARGETS, getAbilityDefinition,
    getAbilityTarget, isUntouchable, applyMicroeventModifications,
    applySingleEffect, executeAbility, processStatusEffects,
} = require('../../src/shared/gameLogic');

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

const buildPlayer = (id, name, image, startingHp = 20, team = null, deckSize = null, isBot = false, selectedDeck = []) => {
    // Use the player's chosen card list if provided, otherwise use all cards.
    // selectedDeck can be an array of card IDs or fully-hydrated card objects.
    const cardPool = (selectedDeck && selectedDeck.length >= 3)
        ? (typeof selectedDeck[0] === 'string'
            ? selectedDeck.map((cid) => cards.find((c) => c.id === cid)).filter(Boolean)
            : selectedDeck)
        : cards;
    let pool = shuffle(cardPool).map((c) => ({
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
        isBot,
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

    const players = playerConfigs.map(({ id, name, image, team, isBot, selectedDeck }, i) =>
        buildPlayer(id, name, image ?? AVATAR_URLS[i] ?? AVATAR_URLS[0], startingHp, teamMode === 'teams' ? (team ?? null) : null, deckSize, isBot ?? false, selectedDeck ?? [])
    );

    const turnOrder = players.map((p) => p.id);
    return {
        players,
        settings: { startingHp, maxBattlers, deckSize, teamMode, microgameDifficulty: settings.microgameDifficulty ?? 1 },
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
        pendingRecap: {},
        cardPlayedThisTurn: false,
        turnStartedAt: Date.now(),
    };
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

    // Sets phase to 'microevent' to hold execution until microevent resolves.
    holdMicroevent(state, { casterCardIndex, abilityIndex, targetCardIndex, targetPlayerId }) {
        state.phase = 'microevent';
        state.pendingAction = {
            isAbility: true,
            casterCardIndex,
            abilityIndex,
            targetCardIndex: targetCardIndex ?? null,
            targetPlayerId: targetPlayerId ?? null,
        };
    },

    // Called by server after microevent result is received.
    applyAbilityWithMicroevent(state, { microeventResult }) {
        if (state.phase !== 'microevent' || !state.pendingAction?.isAbility) return;
        const { casterCardIndex, abilityIndex, targetCardIndex, targetPlayerId } = state.pendingAction;

        // ── Microgame result log entry ────────────────────────────────────────
        const casterPlayer = state.players.find((p) => p.id === state.currentTurn);
        const ability = casterPlayer?.inPlay[casterCardIndex]?.actions[abilityIndex];
        if (ability?.microevent) {
            const { success, score } = microeventResult;
            const { outcome, type } = ability.microevent;
            const typeLabel = {
                qte: 'QTE',
                pattern: 'Pattern Match',
                quiz: 'Quiz',
                rhythm: 'Rhythm',
                mash: 'Mash',
                parry: 'Parry Chain',
                route: 'Mana Route',
                sigil: 'Sigil Recall',
                arrow: 'Arrow Volley',
            }[type] ?? type;
            const casterName = casterPlayer?.inPlay[casterCardIndex]?.name ?? 'Unknown';

            if (outcome === 'binary') {
                if (success) {
                    state.log.unshift(`[${typeLabel}] ${casterName} succeeded! Full effect!`);
                } else {
                    state.log.unshift(`[${typeLabel}] ${casterName} failed! Ability power reduced.`);
                }
            } else {
                // scaled
                const pct = Math.round(score * 100);
                if (pct >= 90) {
                    state.log.unshift(`[${typeLabel}] ${casterName} nailed it! ${pct}% power!`);
                } else if (pct >= 50) {
                    state.log.unshift(`[${typeLabel}] ${casterName} partial success — ${pct}% power.`);
                } else if (pct > 0) {
                    state.log.unshift(`[${typeLabel}] ${casterName} barely made it — ${pct}% power.`);
                } else {
                    state.log.unshift(`[${typeLabel}] ${casterName} failed! No effect.`);
                }
            }

            if (ability.name === 'Gale Shot' && type === 'arrow' && score <= 0) {
                state.log.unshift('Arrow missed, Gale Shot fails.');
            }
        }
        // ─────────────────────────────────────────────────────────────────────

        state.lastHitEvents = [];
        executeAbility(state, state.currentTurn, casterCardIndex, abilityIndex, targetCardIndex, targetPlayerId, microeventResult);
        checkWinCondition(state);
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

        const targetType = getAbilityTarget(ability);
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

    forfeitCurrentPlayer(state) {
        if (state.gameOver) return;
        const justActedId = state.currentTurn;
        const player = state.players.find((p) => p.id === justActedId);
        if (!player || player.eliminated) return;
        player.health = 0;
        player.eliminated = true;
        state.log.unshift(`${player.name} ran out of time and forfeited!`);
        if (checkWinCondition(state)) return;
        // Advance to next player's turn
        const total = state.turnOrder.length;
        let nextIndex = (state.turnIndex + 1) % total;
        for (let i = 0; i < total; i++) {
            const candidate = state.players.find((p) => p.id === state.turnOrder[nextIndex]);
            if (candidate && !candidate.eliminated && candidate.health > 0) break;
            nextIndex = (nextIndex + 1) % total;
        }
        state.turnIndex = nextIndex;
        const nextPlayer = state.players.find((p) => p.id === state.turnOrder[nextIndex]);
        for (const c of nextPlayer.inPlay) { c.acted = false; c.justPlayed = false; }
        state.currentTurn = nextPlayer.id;
        state.phase = 'main';
        state.pendingAction = null;
        state.cardPlayedThisTurn = false;
        state.lastHitEvents = [];
        // Accumulate this turn's events for every player who didn't just forfeit
        if (!state.pendingRecap) state.pendingRecap = {};
        for (const p of state.players) {
            if (p.id !== justActedId) {
                if (!state.pendingRecap[p.id]) state.pendingRecap[p.id] = [];
                state.pendingRecap[p.id].push(...state.recapEvents);
            }
        }
        state.turnSummary = [...(state.pendingRecap[nextPlayer.id] ?? [])];
        state.pendingRecap[nextPlayer.id] = [];
        state.recapEvents = [];
        state.log.unshift(`--- ${nextPlayer.name}'s turn ---`);
        state.turnStartedAt = Date.now();
    },

    endTurn(state) {
        if (state.gameOver) return;
        const justActedId = state.currentTurn;
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
        // Accumulate this turn's events for every player who didn't just act
        if (!state.pendingRecap) state.pendingRecap = {};
        for (const p of state.players) {
            if (p.id !== justActedId) {
                if (!state.pendingRecap[p.id]) state.pendingRecap[p.id] = [];
                state.pendingRecap[p.id].push(...state.recapEvents);
            }
        }
        // Pop accumulated events as the turnSummary for the incoming player
        state.turnSummary = [...(state.pendingRecap[nextPlayer.id] ?? [])];
        state.pendingRecap[nextPlayer.id] = [];
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
        state.turnStartedAt = Date.now();
    },
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Create a fresh game state.
 * @param {Array<{id,name,image?,team?,isBot?}>} playerConfigs  - 2–6 players
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

/**
 * Compute and execute a full CPU turn, returning the resulting state.
 * The CPU plays one card from hand (if below maxBattlers), attacks with all
 * eligible battlers targeting random enemy cards, then ends its turn.
 * @param {object} state - current game state (not mutated)
 * @returns {object} new state after CPU's turn
 */
const computeCpuTurn = (state) => {
    let s = deepClone(state);
    if (s.gameOver) return s;

    const cpuId = s.currentTurn;

    // Play one card from hand if not already played and under maxBattlers
    const getCpuPlayer = () => s.players.find((p) => p.id === cpuId);
    if (!s.cardPlayedThisTurn && getCpuPlayer().hand.length > 0) {
        const maxBattlers = s.settings?.maxBattlers ?? 8;
        if (getCpuPlayer().inPlay.length < maxBattlers) {
            const { state: ns } = dispatch(s, 'playCardFromHand', { cardIndex: 0 });
            s = ns;
        }
    }

    // Attack with each eligible card in order
    const inPlayCount = getCpuPlayer().inPlay.length;
    for (let i = 0; i < inPlayCount; i++) {
        if (s.gameOver) break;

        const card = s.players.find((p) => p.id === cpuId)?.inPlay[i];
        if (!card || card.acted || card.justPlayed) continue;

        const { state: afterSelect } = dispatch(s, 'selectAttacker', { cardIndex: i });
        s = afterSelect;
        if (s.gameOver) break;

        // If selectAttacker went to selectingTarget, pick a random enemy card
        if (s.phase === 'selectingTarget') {
            const enemies = getEnemies(s, cpuId).filter((e) => e.inPlay.filter((c) => !c.dying).length > 0);
            if (enemies.length > 0) {
                const randEnemy = enemies[Math.floor(Math.random() * enemies.length)];
                const validCards = randEnemy.inPlay.filter((c) => !c.dying);
                const target = validCards[Math.floor(Math.random() * validCards.length)];
                const targetCardIndex = randEnemy.inPlay.indexOf(target);
                const { state: afterAttack } = dispatch(s, 'resolveOnEnemyCard', {
                    targetCardIndex,
                    targetPlayerId: randEnemy.id,
                });
                s = afterAttack;
            } else {
                // Fallback: cancel (shouldn't normally happen)
                const { state: cancelled } = dispatch(s, 'cancelSelection', {});
                s = cancelled;
            }
        }
        // If phase is still 'main', selectAttacker handled the attack directly
    }

    if (!s.gameOver) {
        const { state: afterEnd } = dispatch(s, 'endTurn', {});
        s = afterEnd;
    }

    return s;
};

module.exports = { createGame, dispatch, computeCpuTurn, ABILITY_TARGETS, getAbilityTarget };


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
const battlerLabel = (player, cardName) => `${player?.name ?? 'Unknown'}'s ${cardName ?? 'Battler'}`;

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

const buildPlayer = (id, name, image, startingHp = 20, team = null, deckSize = null, isBot = false, selectedDeck = [], cpuSkill = 2) => {
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
        cpuSkill: isBot ? cpuSkill : undefined,
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

    const players = playerConfigs.map(({ id, name, image, team, isBot, cpuSkill, selectedDeck }, i) =>
        buildPlayer(id, name, image ?? AVATAR_URLS[i] ?? AVATAR_URLS[0], startingHp, teamMode === 'teams' ? (team ?? null) : null, deckSize, isBot ?? false, selectedDeck ?? [], cpuSkill ?? 2)
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
        if (hasStatus(card, 'frozen')) { state.log.unshift(`${battlerLabel(player, card.name)} is Frozen and cannot act!`); return; }
        if (card.acted) { state.log.unshift(`${battlerLabel(player, card.name)} has already acted this turn!`); return; }
        if (card.justPlayed) { state.log.unshift(`${battlerLabel(player, card.name)} was just played and needs a turn to prepare!`); return; }

        const enemies = getEnemies(state, state.currentTurn);
        const allEnemiesEmpty = enemies.every((e) => e.inPlay.length === 0);

        if (allEnemiesEmpty && enemies.length > 0) {
            // Direct player attacks when no enemy boards have cards
            state.lastHitEvents = [];
            card.acted = true;
            const damage = Math.max(1, card.attack || 5);
            for (const enemy of enemies) {
                enemy.health = Math.max(0, enemy.health - damage);
                pushRecapEvent(state, { type: 'directHit', cardName: card.name, attackerPlayerId: player.id, targetPlayerId: enemy.id, damage, healthAfter: enemy.health, maxHealth: enemy.maxHealth });
                state.log.unshift(`${battlerLabel(player, card.name)} attacks ${enemy.name} directly for ${damage} damage!`);
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
        if (hasStatus(card, 'frozen')) { state.log.unshift(`${battlerLabel(player, card.name)} is Frozen and cannot act!`); return; }
        if (card.acted) { state.log.unshift(`${battlerLabel(player, card.name)} has already acted this turn!`); return; }
        if (card.justPlayed) { state.log.unshift(`${battlerLabel(player, card.name)} was just played and needs a turn to prepare!`); return; }
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
                    pushRecapEvent(state, { type: 'directHit', cardName: card.name, attackerPlayerId: player.id, targetPlayerId: enemy.id, damage: dmg, healthAfter: enemy.health, maxHealth: enemy.maxHealth });
                    state.log.unshift(`${battlerLabel(player, card.name)} uses ${ability.name} on ${enemy.name} directly for ${dmg} damage!`);
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
                applyDamageToCard(defenderPlayer, targetCardIndex, damage, state, { attackerName: attacker.name, attackerPlayerId: attackerPlayer.id });
                state.log.unshift(`${battlerLabel(attackerPlayer, attacker.name)} attacks ${battlerLabel(defenderPlayer, defender.name)} for ${damage} damage!`);
            } else {
                state.log.unshift(`${battlerLabel(attackerPlayer, attacker.name)} attacked ${battlerLabel(defenderPlayer, defender.name)} but missed!`);
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
            state.log.unshift(`${battlerLabel(attackerPlayer, attacker.name)} attacks ${defenderPlayer.name} directly for ${damage} damage!`);
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
        state.log.unshift(`${player.name} played ${battlerLabel(player, card.name)} to the board!`);
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
 * Simulate a CPU mini-game outcome based on skill level.
 * @param {'binary'|'scaled'} outcomeType
 * @param {number} cpuSkill  1–5
 * @returns {{ success: boolean, score: number }}
 */
const cpuAutoResolve = (outcomeType, cpuSkill) => {
    const skill = Math.max(1, Math.min(5, cpuSkill ?? 2));
    // successRates[1..5] for binary outcomes
    const successRates = [0, 0.25, 0.45, 0.65, 0.80, 0.92];
    // scaled score ranges [min, max] per skill level
    const scaledRanges = [null, [0.10, 0.45], [0.30, 0.60], [0.50, 0.78], [0.65, 0.88], [0.80, 0.97]];

    if (outcomeType === 'binary') {
        const success = Math.random() < successRates[skill];
        return { success, score: success ? 1 : 0 };
    }
    // scaled
    const [lo, hi] = scaledRanges[skill];
    const score = lo + Math.random() * (hi - lo);
    return { success: score >= 0.5, score };
};

/**
 * Compute and execute a full CPU turn, returning the resulting state.
 * At skill 1–2: random ability/target selection.
 * At skill 3–5: scored ability and target selection.
 * If an ability with a microevent is triggered, returns { state, cpuMicroevent }
 * so the caller can auto-resolve the mini-game server-side.
 * @param {object} state  current game state (not mutated)
 * @returns {{ state: object, cpuMicroevent: object|null }}
 */
const computeCpuTurn = (state) => {
    let s = deepClone(state);
    if (s.gameOver) return { state: s, cpuMicroevent: null };

    const cpuId = s.currentTurn;
    const getCpu = () => s.players.find((p) => p.id === cpuId);
    const cpuSkill = getCpu()?.cpuSkill ?? 2;

    // Ability preference rates per skill level (index 1–5)
    const abilityPrefRates = [0, 0.25, 0.45, 0.65, 0.80, 0.92];
    const abilityPref = abilityPrefRates[cpuSkill] ?? 0.45;
    const useScoring = cpuSkill >= 3;

    // ── Play one card from hand ───────────────────────────────────────────────
    if (!s.cardPlayedThisTurn && getCpu().hand.length > 0) {
        const maxBattlers = s.settings?.maxBattlers ?? 8;
        if (getCpu().inPlay.length < maxBattlers) {
            let cardIndex = 0;
            if (useScoring && getCpu().hand.length > 1) {
                const enemies = getEnemies(s, cpuId).flatMap((e) => e.inPlay);
                const maxEnemyAtk = enemies.reduce((m, c) => Math.max(m, c.attack ?? 0), 0);
                const allyBelow30 = getCpu().inPlay.some((c) => c.currentHealth / c.health < 0.3);
                const scores = getCpu().hand.map((card) => {
                    let score = (card.attack ?? 0) + (card.health ?? 0);
                    if ((card.attack ?? 0) <= 4 && allyBelow30) score += 5;
                    if ((card.actions || []).some((a) => (a.limit ?? 99) === 1)) score += 4;
                    if (getCpu().inPlay.length >= 4) score -= 3;
                    if ((card.health ?? 0) <= 5 && maxEnemyAtk >= 7) score -= 2;
                    return score;
                });
                cardIndex = scores.indexOf(Math.max(...scores));
            }
            const { state: ns } = dispatch(s, 'playCardFromHand', { cardIndex });
            s = ns;
        }
    }

    // ── Act with each eligible card ───────────────────────────────────────────
    const inPlayCount = getCpu().inPlay.length;
    for (let i = 0; i < inPlayCount; i++) {
        if (s.gameOver) break;

        const card = s.players.find((p) => p.id === cpuId)?.inPlay[i];
        if (!card || card.acted || card.justPlayed || hasStatus(card, 'frozen')) continue;

        // Decide whether to use an ability this card action
        const usableAbilities = (card.actions || []).filter(
            (a) => (a.usesRemaining ?? 0) > 0
        );
        const tryAbility = usableAbilities.length > 0 && Math.random() < abilityPref;

        if (tryAbility) {
            // Pick ability
            let chosenAbilityIndex;
            if (useScoring) {
                // Score each usable ability
                const enemies = getEnemies(s, cpuId).flatMap((e) => e.inPlay.filter((c) => !c.dying));
                const allies = getCpu().inPlay;
                const scores = usableAbilities.map((ability) => {
                    const def = getAbilityDefinition(ability.name, ability.customConfig);
                    if (!def) return -Infinity;
                    let score = 0;
                    for (const eff of (def.effects || [])) {
                        if (eff.type === 'damage') {
                            const mult = eff.multiplier ?? 1;
                            const atk = getEffectiveAtk(card);
                            const target = enemies[0];
                            if (target) {
                                const defVal = eff.ignoreDef ? 0 : getEffectiveDef(target);
                                score += Math.max(1, atk * mult - defVal) * (eff.repeat ?? 1);
                            }
                        } else if (eff.type === 'status') {
                            const st = eff.status;
                            if (st === 'frozen') score += 10;
                            else if (st === 'invulnerable' || st === 'invisible') score += 8;
                            else if (st === 'shielded') score += (eff.value ?? 0) * 1.2;
                            else if (st === 'atk_up') score += (eff.value ?? 0) * 2;
                            else if (st === 'def_up' || st === 'eva_up') score += (eff.value ?? 0) * 1.5;
                            else if (st === 'def_down') score += (eff.value ?? 0) * 1.5;
                            else if (st === 'burned' || st === 'poisoned' || st === 'bleeding') {
                                score += (eff.value ?? 0) * Math.min(eff.duration ?? 1, 3) * 0.8;
                            }
                        } else if (eff.type === 'healSelf') {
                            const missing = card.health - card.currentHealth;
                            score += Math.min(eff.amount ?? 0, missing) * 1.2;
                        } else if (eff.type === 'heal') {
                            const mostHurt = allies.reduce((best, c) => (c.currentHealth < best.currentHealth ? c : best), allies[0] || card);
                            const missing = (mostHurt?.health ?? 0) - (mostHurt?.currentHealth ?? 0);
                            score += Math.min(eff.amount ?? 0, missing) * 1.2;
                        } else if (eff.type === 'cleanse') {
                            const debuffTypes = eff.debuffs || [];
                            const activeCount = allies.reduce((n, c) =>
                                n + debuffTypes.filter((d) => hasStatus(c, d)).length, 0);
                            score += activeCount * 3;
                        } else if (eff.type === 'resetCooldowns') {
                            score += 7;
                        } else if (eff.type === 'selfDestruct') {
                            score -= 5;
                        }
                    }
                    // Modifiers
                    if ((ability.usesRemaining ?? 0) === 1 && (ability.limit ?? 99) <= 2) score += 2;
                    if (card.currentHealth / card.health < 0.3) score += 3;
                    return score;
                });
                const bestScore = Math.max(...scores);
                const bestIdx = scores.indexOf(bestScore);
                chosenAbilityIndex = card.actions.indexOf(usableAbilities[bestIdx]);
            } else {
                // Random ability
                const pick = usableAbilities[Math.floor(Math.random() * usableAbilities.length)];
                chosenAbilityIndex = card.actions.indexOf(pick);
            }

            const chosenAbility = card.actions[chosenAbilityIndex];
            const def = getAbilityDefinition(chosenAbility?.name, chosenAbility?.customConfig);
            if (!def) {
                // Fallback to basic attack
                const { state: ns } = dispatch(s, 'selectAttacker', { cardIndex: i });
                s = ns;
                if (s.phase === 'selectingTarget') {
                    const enemies = getEnemies(s, cpuId).filter((e) => e.inPlay.filter((c) => !c.dying).length > 0);
                    if (enemies.length > 0) {
                        const randEnemy = enemies[Math.floor(Math.random() * enemies.length)];
                        const validCards = randEnemy.inPlay.filter((c) => !c.dying);
                        const target = validCards[Math.floor(Math.random() * validCards.length)];
                        const { state: ns2 } = dispatch(s, 'resolveOnEnemyCard', {
                            targetCardIndex: randEnemy.inPlay.indexOf(target),
                            targetPlayerId: randEnemy.id,
                        });
                        s = ns2;
                    } else {
                        const { state: ns2 } = dispatch(s, 'cancelSelection', {});
                        s = ns2;
                    }
                }
                continue;
            }

            const target = getAbilityTarget(def);
            let targetCardIndex = null;
            let targetPlayerId = null;

            if (target === ABILITY_TARGETS.ENEMY_CARD || target === ABILITY_TARGETS.ALL_ENEMIES) {
                const enemies = getEnemies(s, cpuId).filter((e) => e.inPlay.filter((c) => !c.dying && !isUntouchable(c)).length > 0);
                if (enemies.length === 0) {
                    // No valid targets — skip ability, do basic attack
                    const { state: ns } = dispatch(s, 'selectAttacker', { cardIndex: i });
                    s = ns;
                    if (s.phase === 'selectingTarget') {
                        const anyEnemies = getEnemies(s, cpuId).filter((e) => e.inPlay.filter((c) => !c.dying).length > 0);
                        if (anyEnemies.length > 0) {
                            const randEnemy = anyEnemies[Math.floor(Math.random() * anyEnemies.length)];
                            const validCards = randEnemy.inPlay.filter((c) => !c.dying);
                            const t = validCards[Math.floor(Math.random() * validCards.length)];
                            const { state: ns2 } = dispatch(s, 'resolveOnEnemyCard', {
                                targetCardIndex: randEnemy.inPlay.indexOf(t),
                                targetPlayerId: randEnemy.id,
                            });
                            s = ns2;
                        } else {
                            const { state: ns2 } = dispatch(s, 'cancelSelection', {});
                            s = ns2;
                        }
                    }
                    continue;
                }
                if (target === ABILITY_TARGETS.ENEMY_CARD) {
                    let chosenEnemy, chosenCard;
                    if (useScoring) {
                        // Score each candidate target
                        const estimatedDmg = Math.max(1, getEffectiveAtk(card) - 1);
                        let best = -Infinity;
                        for (const ep of enemies) {
                            for (const ec of ep.inPlay.filter((c) => !c.dying && !isUntouchable(c))) {
                                let score = 1;
                                if (ec.currentHealth <= estimatedDmg) score += 10;
                                if (ec.currentHealth / ec.health < 0.3) score += 5;
                                if (hasStatus(ec, 'focused')) score += 4;
                                if (hasStatus(ec, 'def_down')) score += 3;
                                if ((ec.attack ?? 0) >= 7) score += 2;
                                if (score > best) { best = score; chosenEnemy = ep; chosenCard = ec; }
                            }
                        }
                    } else {
                        chosenEnemy = enemies[Math.floor(Math.random() * enemies.length)];
                        const validCards = chosenEnemy.inPlay.filter((c) => !c.dying && !isUntouchable(c));
                        chosenCard = validCards[Math.floor(Math.random() * validCards.length)];
                    }
                    if (chosenEnemy && chosenCard) {
                        targetPlayerId = chosenEnemy.id;
                        targetCardIndex = chosenEnemy.inPlay.indexOf(chosenCard);
                    }
                }
                // allEnemies needs no target index
            } else if (target === ABILITY_TARGETS.ALLY_CARD || target === ABILITY_TARGETS.ALL_ALLIES) {
                const allies = getCpu().inPlay.filter((c) => !c.dying);
                if (target === ABILITY_TARGETS.ALLY_CARD && allies.length > 0) {
                    let chosenAlly;
                    if (useScoring) {
                        let best = -Infinity;
                        for (const ac of allies) {
                            let score = 1;
                            if (ac.currentHealth / ac.health > 0.8) score -= 4;
                            if (hasStatus(ac, 'burned') || hasStatus(ac, 'poisoned') || hasStatus(ac, 'bleeding')) score += 5;
                            if (hasStatus(ac, 'frozen')) score += 6;
                            if (ac.currentHealth / ac.health < 0.3) score += 8;
                            if (score > best) { best = score; chosenAlly = ac; }
                        }
                    } else {
                        chosenAlly = allies[Math.floor(Math.random() * allies.length)];
                    }
                    if (chosenAlly) {
                        targetPlayerId = cpuId;
                        targetCardIndex = getCpu().inPlay.indexOf(chosenAlly);
                    }
                }
            }
            // SELF target needs no index

            // If ability has a microevent, hold and return for async resolution
            if (chosenAbility.microevent) {
                const { state: heldState } = dispatch(s, 'holdMicroevent', {
                    casterCardIndex: i,
                    abilityIndex: chosenAbilityIndex,
                    targetCardIndex: targetCardIndex ?? null,
                    targetPlayerId: targetPlayerId ?? null,
                });
                return {
                    state: heldState,
                    cpuMicroevent: {
                        casterCardIndex: i,
                        abilityIndex: chosenAbilityIndex,
                        targetCardIndex: targetCardIndex ?? null,
                        targetPlayerId: targetPlayerId ?? null,
                        microevent: chosenAbility.microevent,
                        cpuSkill,
                    },
                };
            }

            // No microevent — execute ability directly
            const { state: afterAbility, error: abilityErr } = dispatch(s, 'useAbility', {
                casterCardIndex: i,
                abilityIndex: chosenAbilityIndex,
                targetCardIndex,
                targetPlayerId,
            });
            if (!abilityErr) {
                s = afterAbility;
                continue;
            }
            // Ability failed — fall through to basic attack
        }

        // Basic attack
        const { state: afterSelect } = dispatch(s, 'selectAttacker', { cardIndex: i });
        s = afterSelect;
        if (s.gameOver) break;

        if (s.phase === 'selectingTarget') {
            const enemies = getEnemies(s, cpuId).filter((e) => e.inPlay.filter((c) => !c.dying).length > 0);
            if (enemies.length > 0) {
                let chosenEnemy, chosenCard;
                if (useScoring) {
                    const estimatedDmg = Math.max(1, getEffectiveAtk(card) - 1);
                    let best = -Infinity;
                    for (const ep of enemies) {
                        for (const ec of ep.inPlay.filter((c) => !c.dying)) {
                            if (isUntouchable(ec)) continue;
                            let score = 1;
                            if (ec.currentHealth <= estimatedDmg) score += 10;
                            if (ec.currentHealth / ec.health < 0.3) score += 5;
                            if (hasStatus(ec, 'focused')) score += 4;
                            if (hasStatus(ec, 'def_down')) score += 3;
                            if ((ec.attack ?? 0) >= 7) score += 2;
                            if (getEffectiveEva(ec) >= 7) score -= 3;
                            if (score > best) { best = score; chosenEnemy = ep; chosenCard = ec; }
                        }
                    }
                    if (!chosenEnemy) {
                        chosenEnemy = enemies[Math.floor(Math.random() * enemies.length)];
                        const validCards = chosenEnemy.inPlay.filter((c) => !c.dying);
                        chosenCard = validCards[Math.floor(Math.random() * validCards.length)];
                    }
                } else {
                    chosenEnemy = enemies[Math.floor(Math.random() * enemies.length)];
                    const validCards = chosenEnemy.inPlay.filter((c) => !c.dying);
                    chosenCard = validCards[Math.floor(Math.random() * validCards.length)];
                }
                if (chosenEnemy && chosenCard) {
                    const { state: afterAttack } = dispatch(s, 'resolveOnEnemyCard', {
                        targetCardIndex: chosenEnemy.inPlay.indexOf(chosenCard),
                        targetPlayerId: chosenEnemy.id,
                    });
                    s = afterAttack;
                }
            } else {
                const { state: cancelled } = dispatch(s, 'cancelSelection', {});
                s = cancelled;
            }
        }
    }

    if (!s.gameOver) {
        const { state: afterEnd } = dispatch(s, 'endTurn', {});
        s = afterEnd;
    }

    return { state: s, cpuMicroevent: null };
};

module.exports = { createGame, dispatch, computeCpuTurn, cpuAutoResolve, ABILITY_TARGETS, getAbilityTarget };


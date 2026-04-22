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
    getEffectiveDef, getEffectiveEva, getEffectiveAtk, getEffectiveAgi,
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
const formatAmount = (amount) => {
    if (amount == null) return '0';
    const rounded = Math.round((Number(amount) || 0) * 10) / 10;
    return Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(1);
};

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
            state.players.filter((p) => !p.eliminated && p.health > 0 && p.team !== null).map((p) => p.team)
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
                state.log.unshift(`${battlerLabel(player, card.name)} attacks ${enemy.name} directly for ${formatAmount(damage)} damage!`);
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
                    state.log.unshift(`${battlerLabel(player, card.name)} uses ${ability.name} on ${enemy.name} directly for ${formatAmount(dmg)} damage!`);
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
                state.log.unshift(`${battlerLabel(attackerPlayer, attacker.name)} attacks ${battlerLabel(defenderPlayer, defender.name)} for ${formatAmount(damage)} damage!`);
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
            state.log.unshift(`${battlerLabel(attackerPlayer, attacker.name)} attacks ${defenderPlayer.name} directly for ${formatAmount(damage)} damage!`);
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
// Map skill 1–5 to a continuous 0–1 difficulty parameter.
// All CPU params are derived from t so adding new skill levels or tweaking balance
// only requires changing this table.
const SKILL_T = { 1: 0.10, 2: 0.30, 3: 0.55, 4: 0.75, 5: 1.0 };

const cpuAutoResolve = (outcomeType, cpuSkill) => {
    const skill = Math.max(1, Math.min(5, cpuSkill ?? 2));
    const t = SKILL_T[skill] ?? 0.30;
    // t-based binary success: 0.28 (Easy) → 1.0 (Insane)
    const binarySuccess = Math.min(1, 0.20 + t * 0.80);
    // t-based scaled range: lo = 0.08 + t*0.89, hi = lo + 0.12 (clamped)
    const scaledLo = 0.08 + t * 0.89;
    const scaledHi = Math.min(1.0, scaledLo + 0.12);

    if (outcomeType === 'binary') {
        const success = Math.random() < binarySuccess;
        return { success, score: success ? 1 : 0 };
    }
    // scaled
    const score = scaledLo + Math.random() * (scaledHi - scaledLo);
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

    // Derive all difficulty params from t (0–1 continuous scale)
    const t = SKILL_T[Math.max(1, Math.min(5, cpuSkill))] ?? 0.30;
    const abilityPref = 0.15 + t * 0.84;           // 0.24 … 0.99
    const useScoring = t >= 0.5;                    // skill 3+
    const lookaheadBreadth = Math.round(t * 4);     // 0, 1, 2, 3, 4
    const killShotBonus = Math.round(6 + t * 14);   // 6 … 20
    const elimBonus = Math.round(15 + t * 30);      // 15 … 45

    // ── Play one card from hand ───────────────────────────────────────────────
    if (!s.cardPlayedThisTurn && getCpu().hand.length > 0) {
        const maxBattlers = s.settings?.maxBattlers ?? 8;
        if (getCpu().inPlay.length < maxBattlers) {
            let cardIndex = 0;
            if (useScoring && getCpu().hand.length > 1) {
                const allEnemyPlayers = getEnemies(s, cpuId);
                const enemies = allEnemyPlayers.flatMap((e) => e.inPlay);
                const maxEnemyAtk = enemies.reduce((m, c) => Math.max(m, c.attack ?? 0), 0);
                const allyBelow30 = getCpu().inPlay.some((c) => c.currentHealth / c.health < 0.3);
                // Board-state modifier: scale aggression based on HP advantage
                const cpuTotalHp = getCpu().inPlay.reduce((sum, c) => sum + (c.currentHealth ?? 0), 0);
                const enemyTotalHp = enemies.reduce((sum, c) => sum + (c.currentHealth ?? 0), 0);
                const boardMod = cpuTotalHp > enemyTotalHp * 1.5 ? -5
                    : cpuTotalHp < enemyTotalHp * 0.6 ? 8 : 0;
                const scores = getCpu().hand.map((card) => {
                    let score = (card.attack ?? 0) + (card.health ?? 0) + boardMod;
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

    // Score a board state for greedy lookahead simulation.
    // Lower enemy HP + bonuses for kills/eliminations = better score.
    const evaluateBoardState = (state, initEnemyPlayerCount, initEnemyCardCount) => {
        const eps = getEnemies(state, cpuId);
        const totalEnemyHp = eps.flatMap((e) => e.inPlay.filter((c) => !c.dying))
            .reduce((sum, c) => sum + (c.currentHealth ?? 0), 0);
        const remPlayers = eps.filter((e) => e.inPlay.some((c) => !c.dying)).length;
        const remCards = eps.flatMap((e) => e.inPlay.filter((c) => !c.dying)).length;
        return -totalEnemyHp
            + 100 * (initEnemyPlayerCount - remPlayers)
            + 30 * (initEnemyCardCount - remCards);
    };

    // Execute one card's full turn action (ability or basic attack) on a state snapshot.
    // sim=true: auto-resolves microevents as perfect success (used for lookahead scoring).
    // sim=false: returns { microevent } when an ability has a microevent (suspends turn).
    const executeCardAction = (ws, cardIdx, sim) => {
        const getCpuWs = () => ws.players.find((p) => p.id === cpuId);
        const card = getCpuWs()?.inPlay[cardIdx];
        if (!card || card.acted || card.justPlayed || hasStatus(card, 'frozen')) return { state: ws, microevent: null };

        const usableAbilities = (card.actions || []).filter((a) => (a.usesRemaining ?? 0) > 0);
        // In sim mode always try the best ability; in real mode use abilityPref roll
        const tryAbility = usableAbilities.length > 0 && (sim ? true : Math.random() < abilityPref);

        if (tryAbility) {
            let chosenAbilityIndex;
            if (useScoring) {
                const enemies = getEnemies(ws, cpuId).flatMap((e) => e.inPlay.filter((c) => !c.dying));
                const allies = getCpuWs().inPlay;
                const allEnemyPlayers = getEnemies(ws, cpuId);
                const scores = usableAbilities.map((ability) => {
                    const def = getAbilityDefinition(ability.name, ability.customConfig);
                    if (!def) return -Infinity;
                    let score = 0;
                    const atk = getEffectiveAtk(card);
                    for (const eff of (def.effects || [])) {
                        if (eff.type === 'damage') {
                            const mult = eff.multiplier ?? 1;
                            const flatBonus = eff.flatBonus ?? 0;
                            const repeat = eff.repeat ?? 1;
                            if (eff.targetType === 'allEnemies') {
                                let totalDmg = 0;
                                let kills = 0;
                                for (const ep of allEnemyPlayers) {
                                    for (const ec of ep.inPlay.filter((c) => !c.dying && !isUntouchable(c))) {
                                        const defVal = eff.ignoreDef ? 0 : Math.max(0, getEffectiveDef(ec) - (eff.defPiercing ?? 0));
                                        const dmg = Math.max(1, atk * mult + flatBonus - defVal) * repeat;
                                        totalDmg += dmg;
                                        if (ec.currentHealth <= dmg) kills++;
                                    }
                                }
                                score += totalDmg;
                                score += kills * killShotBonus;
                            } else {
                                let bestDmg = 0;
                                let killShot = false;
                                let eliminatesPlayer = false;
                                for (const ep of allEnemyPlayers) {
                                    for (const ec of ep.inPlay.filter((c) => !c.dying && !isUntouchable(c))) {
                                        const defVal = eff.ignoreDef ? 0 : Math.max(0, getEffectiveDef(ec) - (eff.defPiercing ?? 0));
                                        const dmg = Math.max(1, atk * mult + flatBonus - defVal) * repeat;
                                        if (dmg > bestDmg) {
                                            bestDmg = dmg;
                                            killShot = ec.currentHealth <= dmg;
                                            eliminatesPlayer = killShot && ep.inPlay.filter((c) => !c.dying).length === 1;
                                        }
                                    }
                                }
                                score += bestDmg;
                                if (killShot) score += killShotBonus;
                                if (eliminatesPlayer) score += elimBonus;
                            }
                        } else if (eff.type === 'status') {
                            const st = eff.status;
                            const bestTarget = enemies[0];
                            const alreadyHas = bestTarget && hasStatus(bestTarget, st);
                            if (alreadyHas) score -= 4;
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
                            const healScore = Math.min(eff.amount ?? 0, missing) * 1.2;
                            const anyAllyCritical = allies.some((c) => c.currentHealth / c.health < 0.25);
                            score += healScore + (anyAllyCritical ? 15 : 0);
                        } else if (eff.type === 'heal') {
                            const mostHurt = allies.reduce((best, c) => (c.currentHealth < best.currentHealth ? c : best), allies[0] || card);
                            const missing = (mostHurt?.health ?? 0) - (mostHurt?.currentHealth ?? 0);
                            const healScore = Math.min(eff.amount ?? 0, missing) * 1.2;
                            const anyAllyCritical = allies.some((c) => c.currentHealth / c.health < 0.25);
                            score += healScore + (anyAllyCritical ? 15 : 0);
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
                    if ((ability.usesRemaining ?? 0) === 1 && (ability.limit ?? 99) <= 2) score += 2;
                    if (card.currentHealth / card.health < 0.25) {
                        const hasHealOrInvuln = (def.effects || []).some(
                            (e) => e.type === 'healSelf' || e.type === 'heal' ||
                                (e.type === 'status' && (e.status === 'invulnerable' || e.status === 'shielded'))
                        );
                        if (hasHealOrInvuln) score += 30;
                    } else if (card.currentHealth / card.health < 0.3) {
                        score += 3;
                    }
                    return score;
                });
                const bestScore = Math.max(...scores);
                const bestIdx = scores.indexOf(bestScore);
                chosenAbilityIndex = card.actions.indexOf(usableAbilities[bestIdx]);
            } else {
                const pick = usableAbilities[Math.floor(Math.random() * usableAbilities.length)];
                chosenAbilityIndex = card.actions.indexOf(pick);
            }

            const chosenAbility = card.actions[chosenAbilityIndex];
            const def = getAbilityDefinition(chosenAbility?.name, chosenAbility?.customConfig);
            if (!def) {
                // Fallback to basic attack
                const { state: ns } = dispatch(ws, 'selectAttacker', { cardIndex: cardIdx });
                ws = ns;
                if (ws.phase === 'selectingTarget') {
                    const fallbackEnemies = getEnemies(ws, cpuId).filter((e) => e.inPlay.filter((c) => !c.dying).length > 0);
                    if (fallbackEnemies.length > 0) {
                        const randEnemy = fallbackEnemies[Math.floor(Math.random() * fallbackEnemies.length)];
                        const validCards = randEnemy.inPlay.filter((c) => !c.dying);
                        const fallbackTarget = validCards[Math.floor(Math.random() * validCards.length)];
                        const { state: ns2 } = dispatch(ws, 'resolveOnEnemyCard', {
                            targetCardIndex: randEnemy.inPlay.indexOf(fallbackTarget),
                            targetPlayerId: randEnemy.id,
                        });
                        ws = ns2;
                    } else {
                        const { state: ns2 } = dispatch(ws, 'cancelSelection', {});
                        ws = ns2;
                    }
                }
                return { state: ws, microevent: null };
            }

            const abilityTarget = getAbilityTarget(def);
            let targetCardIndex = null;
            let targetPlayerId = null;

            if (abilityTarget === ABILITY_TARGETS.ENEMY_CARD || abilityTarget === ABILITY_TARGETS.ALL_ENEMIES) {
                const enemyCandidates = getEnemies(ws, cpuId).filter((e) => e.inPlay.filter((c) => !c.dying && !isUntouchable(c)).length > 0);
                if (enemyCandidates.length === 0) {
                    // No valid targets — skip ability, do basic attack
                    const { state: ns } = dispatch(ws, 'selectAttacker', { cardIndex: cardIdx });
                    ws = ns;
                    if (ws.phase === 'selectingTarget') {
                        const anyEnemies = getEnemies(ws, cpuId).filter((e) => e.inPlay.filter((c) => !c.dying).length > 0);
                        if (anyEnemies.length > 0) {
                            const randEnemy = anyEnemies[Math.floor(Math.random() * anyEnemies.length)];
                            const validCards = randEnemy.inPlay.filter((c) => !c.dying);
                            const t = validCards[Math.floor(Math.random() * validCards.length)];
                            const { state: ns2 } = dispatch(ws, 'resolveOnEnemyCard', {
                                targetCardIndex: randEnemy.inPlay.indexOf(t),
                                targetPlayerId: randEnemy.id,
                            });
                            ws = ns2;
                        } else {
                            const { state: ns2 } = dispatch(ws, 'cancelSelection', {});
                            ws = ns2;
                        }
                    }
                    return { state: ws, microevent: null };
                }
                if (abilityTarget === ABILITY_TARGETS.ENEMY_CARD) {
                    let chosenEnemy, chosenCard;
                    if (useScoring) {
                        const dmgEff = def?.effects?.find((e) => e.type === 'damage');
                        const atk = getEffectiveAtk(card);
                        let best = -Infinity;
                        for (const ep of enemyCandidates) {
                            for (const ec of ep.inPlay.filter((c) => !c.dying && !isUntouchable(c))) {
                                let estimatedDmg;
                                if (dmgEff) {
                                    const mult = dmgEff.multiplier ?? 1;
                                    const flatBonus = dmgEff.flatBonus ?? 0;
                                    const defVal = dmgEff.ignoreDef ? 0 : Math.max(0, getEffectiveDef(ec) - (dmgEff.defPiercing ?? 0));
                                    estimatedDmg = Math.max(1, atk * mult + flatBonus - defVal) * (dmgEff.repeat ?? 1);
                                } else {
                                    estimatedDmg = Math.max(1, atk - getEffectiveDef(ec));
                                }
                                const killShot = ec.currentHealth <= estimatedDmg;
                                const eliminatesPlayer = killShot && ep.inPlay.filter((c) => !c.dying).length === 1;
                                let score = 1;
                                score += estimatedDmg * 0.5;
                                if (killShot) score += killShotBonus;
                                if (eliminatesPlayer) score += elimBonus;
                                if (ec.currentHealth / ec.health < 0.3) score += 5;
                                if (hasStatus(ec, 'focused')) score += 4;
                                if (hasStatus(ec, 'def_down')) score += 3;
                                if ((ec.attack ?? 0) >= 7) score += 2;
                                if (score > best) { best = score; chosenEnemy = ep; chosenCard = ec; }
                            }
                        }
                    } else {
                        chosenEnemy = enemyCandidates[Math.floor(Math.random() * enemyCandidates.length)];
                        const validCards = chosenEnemy.inPlay.filter((c) => !c.dying && !isUntouchable(c));
                        chosenCard = validCards[Math.floor(Math.random() * validCards.length)];
                    }
                    if (chosenEnemy && chosenCard) {
                        targetPlayerId = chosenEnemy.id;
                        targetCardIndex = chosenEnemy.inPlay.indexOf(chosenCard);
                    }
                }
                // allEnemies needs no target index
            } else if (abilityTarget === ABILITY_TARGETS.ALLY_CARD || abilityTarget === ABILITY_TARGETS.ALL_ALLIES) {
                // getAllies returns [self] in FFA, all teammates in teams mode
                const allyPlayers = getAllies(s, cpuId);
                const allyCardPool = allyPlayers.flatMap((ap) =>
                    ap.inPlay.filter((c) => !c.dying).map((c) => ({ card: c, player: ap }))
                );
                if (abilityTarget === ABILITY_TARGETS.ALLY_CARD && allyCardPool.length > 0) {
                    let chosen;
                    if (useScoring) {
                        let best = -Infinity;
                        for (const { card: ac, player: ap } of allyCardPool) {
                            let score = 1;
                            if (ac.currentHealth / ac.health > 0.8) score -= 4;
                            if (hasStatus(ac, 'burned') || hasStatus(ac, 'poisoned') || hasStatus(ac, 'bleeding')) score += 5;
                            if (hasStatus(ac, 'frozen')) score += 6;
                            if (ac.currentHealth / ac.health < 0.25) score += 10;
                            else if (ac.currentHealth / ac.health < 0.3) score += 6;
                            if (score > best) { best = score; chosen = { card: ac, player: ap }; }
                        }
                    } else {
                        chosen = allyCardPool[Math.floor(Math.random() * allyCardPool.length)];
                    }
                    if (chosen) {
                        targetPlayerId = chosen.player.id;
                        targetCardIndex = chosen.player.inPlay.indexOf(chosen.card);
                    }
                }
            }
            // SELF target needs no index

            if (chosenAbility.microevent) {
                const { state: heldState } = dispatch(ws, 'holdMicroevent', {
                    casterCardIndex: cardIdx,
                    abilityIndex: chosenAbilityIndex,
                    targetCardIndex: targetCardIndex ?? null,
                    targetPlayerId: targetPlayerId ?? null,
                });
                if (sim) {
                    // Auto-resolve as perfect success during lookahead simulation
                    const { state: resolved } = dispatch(heldState, 'applyAbilityWithMicroevent', {
                        microeventResult: { success: true, score: 1.0 },
                    });
                    return { state: resolved, microevent: null };
                }
                return {
                    state: heldState,
                    microevent: {
                        casterCardIndex: cardIdx,
                        abilityIndex: chosenAbilityIndex,
                        targetCardIndex: targetCardIndex ?? null,
                        targetPlayerId: targetPlayerId ?? null,
                        microevent: chosenAbility.microevent,
                        cpuSkill,
                    },
                };
            }

            const { state: afterAbility, error: abilityErr } = dispatch(ws, 'useAbility', {
                casterCardIndex: cardIdx,
                abilityIndex: chosenAbilityIndex,
                targetCardIndex,
                targetPlayerId,
            });
            if (!abilityErr) {
                return { state: afterAbility, microevent: null };
            }
            // Ability failed — fall through to basic attack
        }

        // Basic attack
        const { state: afterSelect } = dispatch(ws, 'selectAttacker', { cardIndex: cardIdx });
        ws = afterSelect;
        if (ws.gameOver) return { state: ws, microevent: null };

        if (ws.phase === 'selectingTarget') {
            const attackEnemies = getEnemies(ws, cpuId).filter((e) => e.inPlay.filter((c) => !c.dying).length > 0);
            if (attackEnemies.length > 0) {
                let chosenEnemy, chosenCard;
                if (useScoring) {
                    const atk = getEffectiveAtk(card);
                    let best = -Infinity;
                    for (const ep of attackEnemies) {
                        for (const ec of ep.inPlay.filter((c) => !c.dying)) {
                            if (isUntouchable(ec)) continue;
                            const hitChance = Math.max(0, 50 + 15 * (getEffectiveAgi(card) - getEffectiveEva(ec)));
                            if (hitChance === 0) continue;
                            const estimatedDmg = Math.max(1, atk - getEffectiveDef(ec));
                            const killShot = ec.currentHealth <= estimatedDmg;
                            const eliminatesPlayer = killShot && ep.inPlay.filter((c) => !c.dying).length === 1;
                            let score = 1;
                            score += estimatedDmg * 0.5;
                            if (killShot) score += killShotBonus;
                            if (eliminatesPlayer) score += elimBonus;
                            if (ec.currentHealth / ec.health < 0.3) score += 5;
                            if (hasStatus(ec, 'focused')) score += 4;
                            if (hasStatus(ec, 'def_down')) score += 3;
                            if ((ec.attack ?? 0) >= 7) score += 2;
                            if (hitChance < 40) score -= 4;
                            if (score > best) { best = score; chosenEnemy = ep; chosenCard = ec; }
                        }
                    }
                    if (!chosenEnemy) {
                        chosenEnemy = attackEnemies[Math.floor(Math.random() * attackEnemies.length)];
                        const validCards = chosenEnemy.inPlay.filter((c) => !c.dying);
                        chosenCard = validCards[Math.floor(Math.random() * validCards.length)];
                    }
                } else {
                    chosenEnemy = attackEnemies[Math.floor(Math.random() * attackEnemies.length)];
                    const validCards = chosenEnemy.inPlay.filter((c) => !c.dying);
                    chosenCard = validCards[Math.floor(Math.random() * validCards.length)];
                }
                if (chosenEnemy && chosenCard) {
                    const { state: afterAttack } = dispatch(ws, 'resolveOnEnemyCard', {
                        targetCardIndex: chosenEnemy.inPlay.indexOf(chosenCard),
                        targetPlayerId: chosenEnemy.id,
                    });
                    ws = afterAttack;
                }
            } else {
                const { state: cancelled } = dispatch(ws, 'cancelSelection', {});
                ws = cancelled;
            }
        }
        return { state: ws, microevent: null };
    }; // end executeCardAction

    // ── Sort card action order: debuffers first, pure attackers last (skill 3+) ─
    const inPlayCount = getCpu().inPlay.length;
    const getComboOrder = (idx) => {
        const c = getCpu().inPlay[idx];
        if (!c || c.acted || c.justPlayed) return 99;
        const usable = (c.actions || []).filter((a) => (a.usesRemaining ?? 0) > 0);
        if (usable.length === 0) return 1; // pure attacker — act last
        const hasDebuff = usable.some((a) => {
            const d = getAbilityDefinition(a.name, a.customConfig);
            return (d?.effects || []).some((e) =>
                e.type === 'status' && ['def_down', 'atk_down', 'focused', 'frozen'].includes(e.status)
            );
        });
        return hasDebuff ? -2 : 0;
    };
    const actionOrder = Array.from({ length: inPlayCount }, (_, idx) => idx);
    if (useScoring) actionOrder.sort((a, b) => getComboOrder(a) - getComboOrder(b));

    if (lookaheadBreadth > 0) {
        // ── Greedy sequential simulation (skill 3+) ───────────────────────────
        // For each iteration: simulate each remaining card acting, pick the card
        // whose action produces the best board state, execute it for real.
        // This finds the optimal action order within a turn (e.g. debuff → attack).
        const initEnemyPlayers = getEnemies(s, cpuId);
        const initEnemyPlayerCount = initEnemyPlayers.length;
        const initEnemyCardCount = initEnemyPlayers.flatMap((e) => e.inPlay.filter((c) => !c.dying)).length;
        const remainingIndices = new Set(actionOrder);

        while (remainingIndices.size > 0 && !s.gameOver) {
            let bestSimScore = -Infinity;
            let bestCardIdx = -1;

            for (const cardIdx of remainingIndices) {
                const card = s.players.find((p) => p.id === cpuId)?.inPlay[cardIdx];
                if (!card || card.acted || card.justPlayed || hasStatus(card, 'frozen')) {
                    remainingIndices.delete(cardIdx);
                    continue;
                }
                const { state: simAfter } = executeCardAction(deepClone(s), cardIdx, true);
                const simScore = evaluateBoardState(simAfter, initEnemyPlayerCount, initEnemyCardCount);
                if (simScore > bestSimScore) {
                    bestSimScore = simScore;
                    bestCardIdx = cardIdx;
                }
            }

            if (bestCardIdx === -1) break;
            remainingIndices.delete(bestCardIdx);

            const { state: afterAction, microevent } = executeCardAction(s, bestCardIdx, false);
            s = afterAction;
            if (microevent) {
                return { state: s, cpuMicroevent: microevent };
            }
        }
    } else {
        // ── Standard combo-ordered execution (skill 1–2) ─────────────────────
        for (const i of actionOrder) {
            if (s.gameOver) break;
            const { state: afterAction, microevent } = executeCardAction(s, i, false);
            s = afterAction;
            if (microevent) {
                return { state: s, cpuMicroevent: microevent };
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


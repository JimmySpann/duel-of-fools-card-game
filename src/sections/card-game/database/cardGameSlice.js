import { createSlice } from '@reduxjs/toolkit';
import * as _gl from '../../../shared/gameLogic';
const {
  addStatus, removeStatus, hasStatus, getStatus,
  getEffectiveDef, getEffectiveEva, getEffectiveAtk,
  getEnemies, getAllies,
  pushHitEvent, pushRecapEvent, cleanupDefeated,
  applyDamageToCard, resolveBasicAttack,
  ABILITY_DEFS, ABILITY_TARGETS, getAbilityDefinition,
  getAbilityTargetType, isUntouchable,
  applySingleEffect, executeAbility, processStatusEffects,
} = _gl;

const cards = [];

const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);

const buildPlayer = (id, name, image) => {
  const pool = shuffle(cards).map((c) => ({
    ...c,
    currentHealth: c.health,
    statusEffects: [],
    actions: c.actions.map((a) => ({ ...a })),
    passives: c.passives.map((p) => ({ ...p })),
    acted: false,
    justPlayed: false,
  }));
  return {
    id,
    name,
    health: 20,
    maxHealth: 20,
    image,
    hand: pool.slice(0, 3),
    deck: pool.slice(3),
    discardPile: [],
    inPlay: [],
    elements: {},
    statusEffects: [],
  };
};

const createInitialState = () => ({
  players: [
    buildPlayer('player1', 'Player 1', 'https://i.pravatar.cc/150?img=3'),
    buildPlayer('player2', 'Player 2', 'https://i.pravatar.cc/150?img=5'),
  ],
  currentTurn: 'player1',
  // 'main' | 'selectingTarget' (enemy card) | 'selectingAllyTarget' (own card)
  phase: 'main',
  pendingAction: null, // { isAbility, casterCardIndex, abilityIndex? }
  log: ['Game started! Player 1 goes first.'],
  gameOver: false,
  winner: null,
  lastHitEvents: [], // animation events for the current action
  recapEvents: [],   // structured events accumulating this turn
  turnSummary: [],   // snapshot shown to incoming player as recap
  pendingRecap: {},  // per-player accumulator across multiple turns
  cardPlayedThisTurn: false,
});

// ── Slice ─────────────────────────────────────────────────────────────────────

export const cardGameSlice = createSlice({
  name: 'cardGame',
  initialState: createInitialState(),
  reducers: {
    selectAttacker: (state, action) => {
      if (state.phase !== 'main' || state.gameOver) return;
      const player = state.players.find((p) => p.id === state.currentTurn);
      const cardIndex = typeof action.payload === 'object' ? action.payload.cardIndex : action.payload;
      const card = player?.inPlay[cardIndex];
      if (!card) return;
      if (hasStatus(card, 'frozen')) { state.log.unshift(`${card.name} is Frozen and cannot act!`); return; }
      if (card.acted) { state.log.unshift(`${card.name} has already acted this turn!`); return; }
      if (card.justPlayed) { state.log.unshift(`${card.name} was just played and needs a turn to prepare!`); return; }
      state.pendingAction = { isAbility: false, casterCardIndex: cardIndex };
      state.phase = 'selectingTarget';
    },

    cancelSelection: (state) => {
      state.pendingAction = null;
      state.phase = 'main';
    },

    initiateAbility: (state, action) => {
      if (state.phase !== 'main' || state.gameOver) return;
      const { casterCardIndex, abilityIndex } = action.payload;
      const player = state.players.find((p) => p.id === state.currentTurn);
      const card = player?.inPlay[casterCardIndex];
      if (!card) return;
      if (hasStatus(card, 'frozen')) { state.log.unshift(`${card.name} is Frozen and cannot act!`); return; }
      if (card.acted) { state.log.unshift(`${card.name} has already acted this turn!`); return; }
      if (card.justPlayed) { state.log.unshift(`${card.name} was just played and needs a turn to prepare!`); return; }
      const ability = card.actions[abilityIndex];
      if (!ability || ability.usesRemaining <= 0) { state.log.unshift(`${ability?.name ?? 'Ability'} has no uses left!`); return; }

      const targetType = getAbilityTargetType(ability);

      if (targetType === 'self' || targetType === 'allEnemies' || targetType === 'allAllies') {
        state.lastHitEvents = [];
        executeAbility(state, state.currentTurn, casterCardIndex, abilityIndex, null, null);
      } else if (targetType === 'enemyCard') {
        state.pendingAction = { isAbility: true, casterCardIndex, abilityIndex };
        state.phase = 'selectingTarget';
      } else if (targetType === 'allyCard') {
        state.pendingAction = { isAbility: true, casterCardIndex, abilityIndex };
        state.phase = 'selectingAllyTarget';
      }
    },

    resolveOnEnemyCard: (state, action) => {
      if (state.phase !== 'selectingTarget' || state.gameOver) return;
      const { targetCardIndex, targetPlayerId } = action.payload;
      const attackerPlayer = state.players.find((p) => p.id === state.currentTurn);
      const defenderPlayer = state.players.find((p) => p.id === targetPlayerId)
        ?? state.players.find((p) => p.id !== state.currentTurn);
      state.lastHitEvents = [];

      if (state.pendingAction.isAbility) {
        const { casterCardIndex, abilityIndex } = state.pendingAction;
        executeAbility(state, state.currentTurn, casterCardIndex, abilityIndex, targetCardIndex, targetPlayerId);
      } else {
        const { casterCardIndex } = state.pendingAction;
        const attacker = attackerPlayer.inPlay[casterCardIndex];
        const defender = defenderPlayer.inPlay[targetCardIndex];
        if (!attacker || !defender || defender.dying) { state.pendingAction = null; state.phase = 'main'; return; }
        const { hit, damage } = resolveBasicAttack(attacker, defender, defenderPlayer, state);
        attacker.acted = true;
        if (hit) {
          applyDamageToCard(defenderPlayer, targetCardIndex, damage, state, { attackerName: attacker.name });
          state.log.unshift(`${attacker.name} attacks ${defender.name} for ${damage} damage!`);
        } else {
          state.log.unshift(`${attacker.name} attacked ${defender.name} but missed!`);
        }
      }
      state.pendingAction = null;
      state.phase = 'main';
    },

    resolveOnAllyCard: (state, action) => {
      if (state.phase !== 'selectingAllyTarget' || state.gameOver) return;
      const { targetCardIndex } = action.payload;
      const { casterCardIndex, abilityIndex } = state.pendingAction;
      executeAbility(state, state.currentTurn, casterCardIndex, abilityIndex, targetCardIndex);
      state.pendingAction = null;
      state.phase = 'main';
    },

    attackPlayer: (state, action) => {
      if (state.phase !== 'selectingTarget' || state.gameOver) return;
      const attackerPlayer = state.players.find((p) => p.id === state.currentTurn);
      const { targetPlayerId } = action.payload ?? {};
      const defenderPlayer = targetPlayerId
        ? state.players.find((p) => p.id === targetPlayerId)
        : state.players.find((p) => p.id !== state.currentTurn);
      if (!defenderPlayer || defenderPlayer.inPlay.some((c) => !c.dying)) return;
      const attacker = attackerPlayer.inPlay[state.pendingAction?.casterCardIndex];
      if (!attacker) return;

      attacker.acted = true;
      const damage = Math.max(1, attacker.attack || 5);
      defenderPlayer.health = Math.max(0, defenderPlayer.health - damage);
      pushRecapEvent(state, { type: 'directHit', cardName: attacker.name, targetPlayerId: defenderPlayer.id, damage, healthAfter: defenderPlayer.health, maxHealth: defenderPlayer.maxHealth });
      state.log.unshift(`${attacker.name} attacks ${defenderPlayer.name} directly for ${damage} damage!`);
      if (defenderPlayer.health <= 0) {
        defenderPlayer.eliminated = true;
        const alive = state.players.filter((p) => !p.eliminated && p.health > 0);
        if (alive.length === 1) {
          state.gameOver = true;
          state.winner = alive[0].id;
          state.log.unshift(`${alive[0].name} wins!`);
        } else if (alive.length === 0) {
          state.gameOver = true;
          state.winner = null;
          state.log.unshift('Draw — all players eliminated!');
        } else {
          state.log.unshift(`${defenderPlayer.name} has been eliminated!`);
        }
      }
      state.pendingAction = null;
      state.phase = 'main';
    },

    playCardFromHand: (state, action) => {
      if (state.phase !== 'main' || state.gameOver) return;
      if (state.cardPlayedThisTurn) return;
      const { cardIndex } = action.payload;
      const player = state.players.find((p) => p.id === state.currentTurn);
      if (!player || cardIndex >= player.hand.length) return;
      const [card] = player.hand.splice(cardIndex, 1);
      card.justPlayed = true;
      player.inPlay.push(card);
      state.cardPlayedThisTurn = true;
      state.log.unshift(`${player.name} played ${card.name} to the board!`);
    },

    commitDefeats: (state) => {
      cleanupDefeated(state);
      state.lastHitEvents = [];
    },

    dismissRecap: (state) => {
      state.turnSummary = [];
    },

    endTurn: (state) => {
      if (state.gameOver) return;
      const justActedId = state.currentTurn;
      cleanupDefeated(state);
      state.lastHitEvents = [];
      const nextPlayer = state.players.find((p) => p.id !== state.currentTurn);
      // Reset acted/justPlayed for the player who is about to take their turn
      for (const c of nextPlayer.inPlay) {
        c.acted = false;
        c.justPlayed = false;
      }
      state.cardPlayedThisTurn = false;
      state.currentTurn = nextPlayer.id;
      state.phase = 'main';
      state.pendingAction = null;
      // Process status effects at the start of the next player's turn
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
      if (nextPlayer.health <= 0) {
        const winner = state.players.find((p) => p.id !== nextPlayer.id);
        state.gameOver = true;
        state.winner = winner.id;
        state.log.unshift(`${winner.name} wins!`);
        return;
      }
      if (nextPlayer.deck.length > 0) {
        const drawn = nextPlayer.deck.shift();
        nextPlayer.hand.push(drawn);
        state.log.unshift(`${nextPlayer.name} drew a card.`);
      }
      state.log.unshift(`--- ${nextPlayer.name}'s turn ---`);
    },

    forfeitCurrentPlayer: (state) => {
      if (state.gameOver) return;
      const forfeitingPlayer = state.players.find((p) => p.id === state.currentTurn);
      if (!forfeitingPlayer) return;

      forfeitingPlayer.health = 0;
      forfeitingPlayer.eliminated = true;
      state.gameOver = true;

      const winner = state.players.find((p) => p.id !== forfeitingPlayer.id && !p.eliminated && p.health > 0)
        ?? state.players.find((p) => p.id !== forfeitingPlayer.id);
      state.winner = winner?.id ?? null;
      state.log.unshift(`${forfeitingPlayer.name} forfeited the game.`);
      if (winner) state.log.unshift(`${winner.name} wins!`);
    },

    resetGame: () => createInitialState(),

    // Replace entire state with server-driven state (online multiplayer)
    setGameState: (_state, action) => action.payload,
  },
});

export const {
  selectAttacker,
  cancelSelection,
  initiateAbility,
  resolveOnEnemyCard,
  resolveOnAllyCard,
  attackPlayer,
  playCardFromHand,
  commitDefeats,
  dismissRecap,
  endTurn,
  forfeitCurrentPlayer,
  resetGame,
  setGameState,
} = cardGameSlice.actions;

export { ABILITY_TARGETS, getAbilityTargetType };
export default cardGameSlice.reducer;

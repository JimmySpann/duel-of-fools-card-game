import { createSlice } from '@reduxjs/toolkit';
import cards from './cards';

const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);

const buildPlayer = (id, name, image) => {
  const pool = shuffle(cards).map((c) => ({ ...c, currentHealth: c.health }));
  return {
    id,
    name,
    health: 20,
    maxHealth: 20,
    image,
    hand: pool.slice(0, 3),
    deck: pool.slice(3, 7),
    discardPile: [],
    inPlay: pool.slice(7),
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
  phase: 'main', // 'main' | 'selectingTarget'
  selectedAttackerIndex: null,
  log: ['Game started! Player 1 goes first.'],
  gameOver: false,
  winner: null,
});

const resolveAttack = (attacker, defender) => {
  const evadeRoll = Math.floor(Math.random() * 10);
  if (evadeRoll < (defender.evasion || 0)) return { hit: false, damage: 0 };
  const damage = Math.max(1, (attacker.attack || 5) - (defender.defense || 0));
  return { hit: true, damage };
};

export const cardGameSlice = createSlice({
  name: 'cardGame',
  initialState: createInitialState(),
  reducers: {
    selectAttacker: (state, action) => {
      if (state.phase !== 'main' || state.gameOver) return;
      state.selectedAttackerIndex = action.payload;
      state.phase = 'selectingTarget';
    },
    cancelSelection: (state) => {
      state.selectedAttackerIndex = null;
      state.phase = 'main';
    },
    attackCard: (state, action) => {
      if (state.phase !== 'selectingTarget' || state.gameOver) return;
      const { targetCardIndex } = action.payload;
      const attackerPlayer = state.players.find((p) => p.id === state.currentTurn);
      const defenderPlayer = state.players.find((p) => p.id !== state.currentTurn);
      const attacker = attackerPlayer.inPlay[state.selectedAttackerIndex];
      const defender = defenderPlayer.inPlay[targetCardIndex];
      if (!attacker || !defender) return;

      const { hit, damage } = resolveAttack(attacker, defender);
      if (hit) {
        defender.currentHealth -= damage;
        state.log.unshift(`${attacker.name} hit ${defender.name} for ${damage} damage!`);
        if (defender.currentHealth <= 0) {
          defenderPlayer.discardPile.push({ ...defender });
          defenderPlayer.inPlay.splice(targetCardIndex, 1);
          state.log.unshift(`${defender.name} was defeated!`);
        }
      } else {
        state.log.unshift(`${attacker.name} attacked ${defender.name} but missed!`);
      }
      state.selectedAttackerIndex = null;
      state.phase = 'main';
    },
    attackPlayer: (state) => {
      if (state.phase !== 'selectingTarget' || state.gameOver) return;
      const attackerPlayer = state.players.find((p) => p.id === state.currentTurn);
      const defenderPlayer = state.players.find((p) => p.id !== state.currentTurn);
      if (defenderPlayer.inPlay.length > 0) return;
      const attacker = attackerPlayer.inPlay[state.selectedAttackerIndex];
      if (!attacker) return;

      const damage = Math.max(1, attacker.attack || 5);
      defenderPlayer.health = Math.max(0, defenderPlayer.health - damage);
      state.log.unshift(`${attacker.name} attacked ${defenderPlayer.name} directly for ${damage} damage!`);
      if (defenderPlayer.health <= 0) {
        state.gameOver = true;
        state.winner = attackerPlayer.id;
        state.log.unshift(`${attackerPlayer.name} wins!`);
      }
      state.selectedAttackerIndex = null;
      state.phase = 'main';
    },
    playCardFromHand: (state, action) => {
      if (state.phase !== 'main' || state.gameOver) return;
      const { cardIndex } = action.payload;
      const player = state.players.find((p) => p.id === state.currentTurn);
      if (!player || cardIndex >= player.hand.length) return;
      const [card] = player.hand.splice(cardIndex, 1);
      player.inPlay.push(card);
      state.log.unshift(`${player.name} played ${card.name} to the board!`);
    },
    endTurn: (state) => {
      if (state.gameOver) return;
      const nextPlayer = state.players.find((p) => p.id !== state.currentTurn);
      state.currentTurn = nextPlayer.id;
      state.phase = 'main';
      state.selectedAttackerIndex = null;
      if (nextPlayer.deck.length > 0) {
        const drawn = nextPlayer.deck.shift();
        nextPlayer.hand.push(drawn);
        state.log.unshift(`${nextPlayer.name} drew a card.`);
      }
      state.log.unshift(`--- ${nextPlayer.name}'s turn ---`);
    },
    resetGame: () => createInitialState(),
  },
});

export const { selectAttacker, cancelSelection, attackCard, attackPlayer, playCardFromHand, endTurn, resetGame } = cardGameSlice.actions;

export default cardGameSlice.reducer;

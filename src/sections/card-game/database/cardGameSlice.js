import { createSlice } from '@reduxjs/toolkit';
import cards from './cards';

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
  cardPlayedThisTurn: false,
});

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

// ── Animation event helpers ───────────────────────────────────────────────────

const pushHitEvent = (state, defenderPlayerId, cardId, damage, type, cardName, healthAfter, maxHealth) => {
  state.lastHitEvents.push({ defenderPlayerId, cardId, damage, type });
  state.recapEvents.push({ type, cardId, cardName: cardName ?? '?', damage, healthAfter: healthAfter ?? null, maxHealth: maxHealth ?? null, targetPlayerId: defenderPlayerId });
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

// ── Damage application ────────────────────────────────────────────────────────

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

// ── Basic attack resolution ───────────────────────────────────────────────────

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

// ── Ability target types ──────────────────────────────────────────────────────
// 'self' | 'enemyCard' | 'allyCard' | 'allEnemies' | 'allAllies'

const ABILITY_TARGETS = {
  'Crack Attack': 'enemyCard',
  'Smoke Break': 'self',
  'Ice Slash': 'enemyCard',
  'Freeze': 'enemyCard',
  'Blizzard': 'self',
  'Searing Lash': 'enemyCard',
  'Wall of Fire': 'self',
  'Supernova': 'enemyCard',
  'Quick Bolt': 'enemyCard',
  'Thunder Dash': 'self',
  'Short Circuit': 'enemyCard',
  'Quake': 'allEnemies',
  'Rock Toss': 'enemyCard',
  'Fossilize': 'self',
  'Backstab': 'enemyCard',
  'Vanish': 'self',
  'Soul Reap': 'enemyCard',
  'Healing Tide': 'allyCard',
  'Bubble Shield': 'allyCard',
  'Mind Wash': 'allyCard',
  'Scepter Smash': 'enemyCard',
  'Fortify': 'allAllies',
  'Rallying Cry': 'allAllies',
  'Gale Shot': 'enemyCard',
  'Volley': 'allEnemies',
  'Focus': 'self',
  'Venom Spit': 'enemyCard',
  'Lacerate': 'enemyCard',
  'Noxious Cloud': 'allEnemies',
};

// ── Ability execution ─────────────────────────────────────────────────────────

const isUntouchable = (card, state) => {
  if (hasStatus(card, 'invulnerable') || hasStatus(card, 'invisible')) {
    state.log.unshift(`${card.name} can't be targeted!`);
    return true;
  }
  return false;
};

const executeAbility = (state, casterPlayerId, casterCardIdx, abilityIdx, targetCardIdx) => {
  const casterPlayer = state.players.find((p) => p.id === casterPlayerId);
  const enemyPlayer = state.players.find((p) => p.id !== casterPlayerId);
  const caster = casterPlayer.inPlay[casterCardIdx];
  if (!caster) return;

  const ability = caster.actions[abilityIdx];
  if (!ability || ability.usesRemaining <= 0) {
    state.log.unshift(`${ability?.name ?? 'Ability'} has no uses left!`);
    return;
  }
  ability.usesRemaining -= 1;
  caster.acted = true;
  state.log.unshift(`${caster.name} uses ${ability.name}!`);

  switch (ability.name) {

    // ── Hood Nigga ────────────────────────────────────────────────────────────
    case 'Crack Attack': {
      const t = enemyPlayer.inPlay[targetCardIdx];
      if (!t || isUntouchable(t, state)) break;
      const evadeRoll = Math.floor(Math.random() * 10);
      if (evadeRoll >= getEffectiveEva(t)) {
        const effectiveDef = Math.max(0, getEffectiveDef(t) - 2);
        const dmg = Math.max(1, (caster.attack || 5) - effectiveDef);
        applyDamageToCard(enemyPlayer, targetCardIdx, dmg, state);
        state.log.unshift(`Crack Attack ignores 2 DEF! (${dmg} dmg)`);
      } else state.log.unshift('Crack Attack missed!');
      break;
    }
    case 'Smoke Break': {
      addStatus(caster, 'invulnerable', 1, 1);
      state.log.unshift(`${caster.name} is invulnerable for 1 turn!`);
      break;
    }

    // ── Cold Killa ────────────────────────────────────────────────────────────
    case 'Ice Slash': {
      const t = enemyPlayer.inPlay[targetCardIdx];
      if (!t || isUntouchable(t, state)) break;
      const { hit, damage } = resolveBasicAttack(caster, t, enemyPlayer, state);
      if (hit) { applyDamageToCard(enemyPlayer, targetCardIdx, damage, state); state.log.unshift(`Ice Slash deals ${damage} damage!`); }
      else state.log.unshift('Ice Slash missed!');
      break;
    }
    case 'Freeze': {
      const t = enemyPlayer.inPlay[targetCardIdx];
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

    // ── Pyro Warden ───────────────────────────────────────────────────────────
    case 'Searing Lash': {
      const t = enemyPlayer.inPlay[targetCardIdx];
      if (!t || isUntouchable(t, state)) break;
      const { hit, damage } = resolveBasicAttack(caster, t, enemyPlayer, state);
      if (hit) {
        applyDamageToCard(enemyPlayer, targetCardIdx, damage, state);
        if (enemyPlayer.inPlay[targetCardIdx]) {
          addStatus(enemyPlayer.inPlay[targetCardIdx], 'burned', 2, 3);
          state.log.unshift(`${t.name} is Burned! (2 dmg/turn × 3 turns)`);
        }
      } else state.log.unshift('Searing Lash missed!');
      break;
    }
    case 'Wall of Fire': {
      addStatus(caster, 'damage_reduction', 1, 1);
      state.log.unshift(`${caster.name} raises a Wall of Fire – damage halved for 1 turn!`);
      break;
    }
    case 'Supernova': {
      const t = enemyPlayer.inPlay[targetCardIdx];
      if (!t || isUntouchable(t, state)) break;
      const dmg = (caster.attack || 5) * 3;
      applyDamageToCard(enemyPlayer, targetCardIdx, dmg, state);
      state.log.unshift(`SUPERNOVA! ${t.name} takes ${dmg} damage! ${caster.name} self-destructs!`);
      casterPlayer.discardPile.push({ ...caster });
      casterPlayer.inPlay.splice(casterCardIdx, 1);
      break;
    }

    // ── Volt Stinger ──────────────────────────────────────────────────────────
    case 'Quick Bolt': {
      const t = enemyPlayer.inPlay[targetCardIdx];
      if (!t || isUntouchable(t, state)) break;
      // Ignores evasion, lower damage
      const dmg = Math.max(1, Math.floor((caster.attack || 5) / 2));
      applyDamageToCard(enemyPlayer, targetCardIdx, dmg, state);
      state.log.unshift(`Quick Bolt strikes for ${dmg} (ignores evasion)!`);
      break;
    }
    case 'Thunder Dash': {
      addStatus(caster, 'eva_up', 4, 2);
      state.log.unshift(`${caster.name} Thunder Dashes – EVA +4 for 2 turns!`);
      break;
    }
    case 'Short Circuit': {
      const t = enemyPlayer.inPlay[targetCardIdx];
      if (!t || isUntouchable(t, state)) break;
      addStatus(t, 'def_down', t.defense, 1);
      state.log.unshift(`${t.name}'s DEF reduced to 0 for 1 turn! (Short Circuit)`);
      break;
    }

    // ── Terra Titan ───────────────────────────────────────────────────────────
    case 'Quake': {
      const dmg = Math.max(1, (caster.attack || 5) - 3);
      for (let i = enemyPlayer.inPlay.length - 1; i >= 0; i--) {
        applyDamageToCard(enemyPlayer, i, dmg, state);
      }
      state.log.unshift(`Quake shakes all enemies for ${dmg} each!`);
      break;
    }
    case 'Rock Toss': {
      const t = enemyPlayer.inPlay[targetCardIdx];
      if (!t || isUntouchable(t, state)) break;
      // Ignores evasion
      const dmg = Math.max(1, (caster.attack || 5) - getEffectiveDef(t));
      applyDamageToCard(enemyPlayer, targetCardIdx, dmg, state);
      state.log.unshift(`Rock Toss deals ${dmg} (ignores evasion)!`);
      break;
    }
    case 'Fossilize': {
      caster.currentHealth = Math.min(caster.health, caster.currentHealth + 5);
      addStatus(caster, 'def_up', 2, 2);
      state.log.unshift(`${caster.name} fossilizes – +5 HP, DEF +2 for 2 turns!`);
      break;
    }

    // ── Shadow Stalker ────────────────────────────────────────────────────────
    case 'Backstab': {
      const t = enemyPlayer.inPlay[targetCardIdx];
      if (!t || isUntouchable(t, state)) break;
      const dmg = Math.max(1, (caster.attack || 5) * 2 - getEffectiveDef(t));
      applyDamageToCard(enemyPlayer, targetCardIdx, dmg, state);
      state.log.unshift(`Backstab deals ${dmg} (2× ATK)!`);
      break;
    }
    case 'Vanish': {
      addStatus(caster, 'invisible', 1, 1);
      state.log.unshift(`${caster.name} vanishes into the shadows!`);
      break;
    }
    case 'Soul Reap': {
      const t = enemyPlayer.inPlay[targetCardIdx];
      if (!t || isUntouchable(t, state)) break;
      const { hit, damage } = resolveBasicAttack(caster, t, enemyPlayer, state);
      if (hit) {
        applyDamageToCard(enemyPlayer, targetCardIdx, damage, state);
        caster.currentHealth = Math.min(caster.health, caster.currentHealth + damage);
        state.log.unshift(`Soul Reap deals ${damage} and heals ${caster.name} for ${damage}!`);
      } else state.log.unshift('Soul Reap missed!');
      break;
    }

    // ── Aquatic Sage ──────────────────────────────────────────────────────────
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

    // ── Iron Monarch ──────────────────────────────────────────────────────────
    case 'Scepter Smash': {
      const t = enemyPlayer.inPlay[targetCardIdx];
      if (!t || isUntouchable(t, state)) break;
      const dmg = Math.max(1, Math.round((caster.attack || 5) * 1.5) - getEffectiveDef(t));
      applyDamageToCard(enemyPlayer, targetCardIdx, dmg, state);
      state.log.unshift(`Scepter Smash deals ${dmg} (1.5× ATK)!`);
      break;
    }
    case 'Fortify': {
      for (const ally of casterPlayer.inPlay) {
        addStatus(ally, 'def_up', 2, 2);
      }
      state.log.unshift(`Fortify grants all allies DEF +2 for 2 turns!`);
      break;
    }
    case 'Rallying Cry': {
      const debuffs = ['burned', 'frozen', 'poisoned', 'bleeding', 'def_down'];
      for (const ally of casterPlayer.inPlay) {
        ally.statusEffects = (ally.statusEffects || []).filter((s) => !debuffs.includes(s.type));
      }
      state.log.unshift(`Rallying Cry cleanses all debuffs from every ally!`);
      break;
    }

    // ── Zephyr Archer ─────────────────────────────────────────────────────────
    case 'Gale Shot': {
      const t = enemyPlayer.inPlay[targetCardIdx];
      if (!t || isUntouchable(t, state)) break;
      const { hit, damage } = resolveBasicAttack(caster, t, enemyPlayer, state);
      if (hit) {
        applyDamageToCard(enemyPlayer, targetCardIdx, damage, state);
        if (enemyPlayer.inPlay[targetCardIdx]) {
          addStatus(enemyPlayer.inPlay[targetCardIdx], 'def_down', 1, 1);
          state.log.unshift(`Gale Shot knocks ${t.name} back – DEF -1 next turn!`);
        }
      } else state.log.unshift('Gale Shot missed!');
      break;
    }
    case 'Volley': {
      if (enemyPlayer.inPlay.length === 0) { state.log.unshift('No targets for Volley!'); break; }
      const volleyDmg = Math.max(1, Math.floor((caster.attack || 5) / 2));
      for (let v = 0; v < 3; v++) {
        if (enemyPlayer.inPlay.length === 0) break;
        const ri = Math.floor(Math.random() * enemyPlayer.inPlay.length);
        applyDamageToCard(enemyPlayer, ri, volleyDmg, state);
      }
      state.log.unshift(`Volley fires ${volleyDmg}-dmg arrows at 3 random targets!`);
      break;
    }
    case 'Focus': {
      addStatus(caster, 'focused', 1, 999);
      state.log.unshift(`${caster.name} focuses – next attack deals 2.5× damage!`);
      break;
    }

    // ── Toxic Chimera ─────────────────────────────────────────────────────────
    case 'Venom Spit': {
      const t = enemyPlayer.inPlay[targetCardIdx];
      if (!t || isUntouchable(t, state)) break;
      addStatus(t, 'poisoned', 1, 3);
      state.log.unshift(`${t.name} is Poisoned! (1 dmg/turn × 3 turns)`);
      break;
    }
    case 'Lacerate': {
      const t = enemyPlayer.inPlay[targetCardIdx];
      if (!t || isUntouchable(t, state)) break;
      const { hit, damage } = resolveBasicAttack(caster, t, enemyPlayer, state);
      if (hit) {
        applyDamageToCard(enemyPlayer, targetCardIdx, damage, state);
        if (enemyPlayer.inPlay[targetCardIdx]) {
          addStatus(enemyPlayer.inPlay[targetCardIdx], 'bleeding', 1, 2);
          state.log.unshift(`${t.name} is Bleeding! (1 dmg/turn × 2 turns)`);
        }
      } else state.log.unshift('Lacerate missed!');
      break;
    }
    case 'Noxious Cloud': {
      for (const enemy of enemyPlayer.inPlay) {
        addStatus(enemy, 'poisoned', 1, 2);
      }
      state.log.unshift(`Noxious Cloud poisons all enemies! (1 dmg/turn × 2 turns)`);
      break;
    }

    default:
      state.log.unshift(`${ability.name} has no mechanical effect yet.`);
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

// ── Slice ─────────────────────────────────────────────────────────────────────

export const cardGameSlice = createSlice({
  name: 'cardGame',
  initialState: createInitialState(),
  reducers: {
    selectAttacker: (state, action) => {
      if (state.phase !== 'main' || state.gameOver) return;
      const player = state.players.find((p) => p.id === state.currentTurn);
      const enemy = state.players.find((p) => p.id !== state.currentTurn);
      const card = player?.inPlay[action.payload];
      if (!card) return;
      if (hasStatus(card, 'frozen')) { state.log.unshift(`${card.name} is Frozen and cannot act!`); return; }
      if (card.acted) { state.log.unshift(`${card.name} has already acted this turn!`); return; }
      if (card.justPlayed) { state.log.unshift(`${card.name} was just played and needs a turn to prepare!`); return; }
      // No enemy cards — attack the player directly
      if (enemy.inPlay.length === 0) {
        state.lastHitEvents = [];
        const damage = Math.max(1, card.attack || 5);
        card.acted = true;
        enemy.health = Math.max(0, enemy.health - damage);
        pushRecapEvent(state, { type: 'directHit', cardName: card.name, targetPlayerId: enemy.id, damage, healthAfter: enemy.health, maxHealth: enemy.maxHealth });
        state.log.unshift(`${card.name} attacks ${enemy.name} directly for ${damage} damage!`);
        if (enemy.health <= 0) {
          state.gameOver = true;
          state.winner = player.id;
          state.log.unshift(`${player.name} wins!`);
        }
        return;
      }
      state.pendingAction = { isAbility: false, casterCardIndex: action.payload };
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

      const targetType = ABILITY_TARGETS[ability.name] ?? 'enemyCard';
      const enemy = state.players.find((p) => p.id !== state.currentTurn);

      if (targetType === 'self' || targetType === 'allEnemies' || targetType === 'allAllies') {
        state.lastHitEvents = [];
        executeAbility(state, state.currentTurn, casterCardIndex, abilityIndex, null);
      } else if (targetType === 'enemyCard') {
        // No enemy cards — hit the player directly instead
        if (enemy.inPlay.length === 0) {
          state.lastHitEvents = [];
          ability.usesRemaining -= 1;
          card.acted = true;
          const dmg = Math.max(1, (card.attack || 5));
          enemy.health = Math.max(0, enemy.health - dmg);
          pushRecapEvent(state, { type: 'directHit', cardName: card.name, targetPlayerId: enemy.id, damage: dmg, healthAfter: enemy.health, maxHealth: enemy.maxHealth });
          state.log.unshift(`${card.name} uses ${ability.name} on ${enemy.name} directly for ${dmg} damage!`);
          if (enemy.health <= 0) {
            state.gameOver = true;
            state.winner = player.id;
            state.log.unshift(`${player.name} wins!`);
          }
          return;
        }
        state.pendingAction = { isAbility: true, casterCardIndex, abilityIndex };
        state.phase = 'selectingTarget';
      } else if (targetType === 'allyCard') {
        state.pendingAction = { isAbility: true, casterCardIndex, abilityIndex };
        state.phase = 'selectingAllyTarget';
      }
    },

    resolveOnEnemyCard: (state, action) => {
      if (state.phase !== 'selectingTarget' || state.gameOver) return;
      const { targetCardIndex } = action.payload;
      const attackerPlayer = state.players.find((p) => p.id === state.currentTurn);
      const defenderPlayer = state.players.find((p) => p.id !== state.currentTurn);
      state.lastHitEvents = [];

      if (state.pendingAction.isAbility) {
        const { casterCardIndex, abilityIndex } = state.pendingAction;
        executeAbility(state, state.currentTurn, casterCardIndex, abilityIndex, targetCardIndex);
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
    },

    resolveOnAllyCard: (state, action) => {
      if (state.phase !== 'selectingAllyTarget' || state.gameOver) return;
      const { targetCardIndex } = action.payload;
      const { casterCardIndex, abilityIndex } = state.pendingAction;
      executeAbility(state, state.currentTurn, casterCardIndex, abilityIndex, targetCardIndex);
      state.pendingAction = null;
      state.phase = 'main';
    },

    attackPlayer: (state) => {
      if (state.phase !== 'selectingTarget' || state.gameOver) return;
      const attackerPlayer = state.players.find((p) => p.id === state.currentTurn);
      const defenderPlayer = state.players.find((p) => p.id !== state.currentTurn);
      if (defenderPlayer.inPlay.length > 0) return;
      const attacker = attackerPlayer.inPlay[state.pendingAction?.casterCardIndex];
      if (!attacker) return;

      const damage = Math.max(1, attacker.attack || 5);
      defenderPlayer.health = Math.max(0, defenderPlayer.health - damage);
      state.log.unshift(`${attacker.name} attacks ${defenderPlayer.name} directly for ${damage} damage!`);
      if (defenderPlayer.health <= 0) {
        state.gameOver = true;
        state.winner = attackerPlayer.id;
        state.log.unshift(`${attackerPlayer.name} wins!`);
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
      // Save all events (attacks + DOTs) as turnSummary for the incoming player's recap
      state.turnSummary = [...state.recapEvents];
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
  resetGame,
  setGameState,
} = cardGameSlice.actions;

export default cardGameSlice.reducer;

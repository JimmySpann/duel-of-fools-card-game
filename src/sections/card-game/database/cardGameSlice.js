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
};// ── Ability definitions ─────────────────────────────────────────────────────────
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

// ── Ability execution ─────────────────────────────────────────────────────────

const isUntouchable = (card, state) => {
  if (hasStatus(card, 'invulnerable') || hasStatus(card, 'invisible')) {
    state.log.unshift(`${card.name} can't be targeted!`);
    return true;
  }
  return false;
};

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
      const t = enemyPlayer.inPlay[targetCardIdx];
      if (!t || isUntouchable(t, state)) continue;
      applySingleEffect(effect, caster, casterPlayer, casterCardIdx, t, enemyPlayer, targetCardIdx, state, ability.name);

    } else if (targetType === 'allyCard') {
      const t = casterPlayer.inPlay[targetCardIdx];
      if (!t) continue;
      applySingleEffect(effect, caster, casterPlayer, casterCardIdx, t, casterPlayer, targetCardIdx, state, ability.name);

    } else if (targetType === 'allEnemies') {
      if (effect.type === 'damage' && effect.randomTarget) {
        if (enemyPlayer.inPlay.length === 0) { state.log.unshift(`No targets for ${ability.name}!`); continue; }
        const hits = effect.repeat ?? 1;
        for (let v = 0; v < hits; v++) {
          const i = Math.floor(Math.random() * enemyPlayer.inPlay.length);
          if (!enemyPlayer.inPlay[i] || enemyPlayer.inPlay[i].dying) continue;
          applySingleEffect(
            { ...effect, repeat: undefined, randomTarget: false },
            caster, casterPlayer, casterCardIdx, enemyPlayer.inPlay[i], enemyPlayer, i, state, ability.name
          );
        }
      } else if (effect.type === 'damage') {
        for (let i = enemyPlayer.inPlay.length - 1; i >= 0; i--) {
          if (enemyPlayer.inPlay[i]?.dying) continue;
          applySingleEffect(effect, caster, casterPlayer, casterCardIdx, enemyPlayer.inPlay[i], enemyPlayer, i, state, ability.name);
        }
      } else if (effect.type === 'status') {
        for (const c of enemyPlayer.inPlay) addStatus(c, effect.status, effect.value, effect.duration);
        state.log.unshift(`${ability.name} applies ${effect.status} to all enemies!`);
      }

    } else if (targetType === 'allAllies') {
      if (effect.type === 'status') {
        for (const c of casterPlayer.inPlay) addStatus(c, effect.status, effect.value, effect.duration);
        state.log.unshift(`${ability.name} grants ${effect.status} to all allies!`);
      } else if (effect.type === 'cleanse') {
        for (const c of casterPlayer.inPlay) {
          c.statusEffects = (c.statusEffects || []).filter((s) => !effect.debuffs.includes(s.type));
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

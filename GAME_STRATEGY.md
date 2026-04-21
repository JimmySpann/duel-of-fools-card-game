# Card Game — Strategy & CPU Design Reference

> Based on actual code as of April 2026.
> Formulas reflect `src/shared/gameLogic.js` and `server/game/engine.js` exactly.
> CPU scoring values in Section 6 are proposals — tweak before implementing.

---

## 1. Game Rules

### Turn Structure
Each turn has one active player. Their turn:

1. **Play Phase** — Play one card from hand to `inPlay` (optional). Blocked if `cardPlayedThisTurn` is set or `inPlay.length >= maxBattlers`.
2. **Action Phase** — Each card in `inPlay` may take one action unless `justPlayed = true`, `acted = true`, or `hasStatus(card, 'frozen')`.
3. **End Turn** — Next player draws 1 card (if deck not empty). `processStatusEffects` runs at the start of each player's turn (DOT ticks, duration decrements).

### Phases (state.phase)

| Phase | Description |
|---|---|
| `main` | Normal — player selects an action |
| `selectingTarget` | Waiting to pick an enemy card (or player) for attack/ability |
| `selectingAllyTarget` | Waiting to pick an ally card for a support ability |
| `microevent` | Mini-game in progress; all other input frozen |

### Win Condition
Last player (or team) with `health > 0` wins. All eliminated simultaneously → Draw.

### Direct Player Attacks
A card can attack a player directly **only when that player has no living cards in `inPlay`**. Damage = `max(1, card.attack)`.

---

## 2. Stats

| Stat | What It Does |
|---|---|
| `attack` | Base damage. Effective ATK = `attack + sum(atk_up values)` |
| `defense` | Damage reduction. Effective DEF = `defense + def_up - def_down` (floor 0) |
| `health` | Max HP. Tracked live as `currentHealth` |
| `evasion` | Reduces chance to be hit. **Hit chance = `max(0, 50 + 15 × (effectiveAGI − effectiveEVA))`**. Effective EVA = `evasion + eva_up` (floor 0). |
| `agility` | Increases chance to hit. **Hit chance = `max(0, 50 + 15 × (effectiveAGI − effectiveEVA))`**. Effective AGI = `agility + agi_up − agi_down` (floor 0). |

### Basic Attack Formula
```
if rand(0–9) < effectiveEVA(defender)  → MISS

damage = max(1, effectiveATK(attacker) - effectiveDEF(defender))

if attacker has `focused`:
  damage = round(damage × 2.5)
  focused is consumed immediately
```

### Incoming Damage Modifiers (applied in order)
1. `damage_reduction` on defender → `floor(damage / 2)`
2. `shielded` on defender → absorb up to `shield.value`; excess hits HP; shield removed at 0
3. Remainder applied to `currentHealth`

---

## 3. Status Effects

All statuses stack by **replacement** (same type overwrites). Duration `999` = permanent until consumed/cleansed.

| Status | Category | Effect |
|---|---|---|
| `frozen` | CC | Card cannot act (checked before every action); ticks down at turn start |
| `invulnerable` | Defense | Cannot be targeted or damaged (`isUntouchable = true`) |
| `invisible` | Defense | Same as invulnerable — cannot be targeted |
| `focused` | Offense | Next basic attack × 2.5; consumed on use; `duration: 999` |
| `shielded` | Defense | Absorbs `value` damage before HP; `duration: 999` |
| `damage_reduction` | Defense | All incoming damage halved (before shield) |
| `def_up` | Buff | Effective DEF + `value` |
| `def_down` | Debuff | Effective DEF − `value` (floor 0) |
| `atk_up` | Buff | Effective ATK + `value` |
| `eva_up` | Buff | Effective EVA + `value` |
| `burned` | DOT | Deals `value` damage at start of owner's turn |
| `poisoned` | DOT | Deals `value` damage at start of owner's turn |
| `bleeding` | DOT | Deals `value` damage at start of owner's turn |

**Note:** All three DOT types tick independently. A card can carry all three simultaneously.

---

## 4. Ability Effects Reference

All abilities are defined in `ABILITY_DEFS` in `gameLogic.js`. Custom cards use the same schema via `ability.customConfig`.

### Target Types

| targetType | Who is affected |
|---|---|
| `self` | Caster card only |
| `enemyCard` | One chosen enemy card |
| `allyCard` | One chosen ally card |
| `allEnemies` | All living enemy cards (or random hits with `randomTarget: true`) |
| `allAllies` | All ally cards on caster's team |

### Effect Types

#### `damage`
| Property | Default | Behavior |
|---|---|---|
| `useBasicAttack` | false | Full `resolveBasicAttack` (EVA roll + focused bonus) |
| `multiplier` | 1 | ATK × multiplier before subtracting DEF |
| `flatBonus` | 0 | Added to ATK before multiplier/DEF step |
| `defPiercing` | 0 | Reduces effective DEF by this amount |
| `ignoreDef` | false | Bypasses all DEF |
| `ignoreEvasion` | false | Skips EVA roll |
| `floor` / `round` | false | How to truncate ATK × multiplier |
| `lifesteal` | false | Heals caster for damage dealt (`lifeStealMultiplier` scales it) |
| `onHitStatus` | null | `{ status, value, duration }` applied to target if damage > 0 |
| `repeat` | 1 | Number of hits |
| `randomTarget` | false | Each hit picks a random living enemy card |

**Formula (non-`useBasicAttack`):**
```
rawAtk = ATK × multiplier  (floor/round if flagged)
base   = rawAtk + flatBonus
effDef = max(0, effectiveDEF - defPiercing)   [0 if ignoreDef]
damage = max(1, base - effDef)
```

#### `status`
Applies a status effect to the target. `valueFn: 'targetDef'` sets value = target's current defense stat (used by Short Circuit).

#### `heal`
Restores `amount` HP to the target ally card (capped at `card.health`).

#### `healSelf`
Restores `amount` HP to the caster card (capped at `card.health`).

#### `cleanse`
Removes listed debuff types from the target. Example: `debuffs: ['burned', 'frozen', 'poisoned', 'bleeding', 'def_down']`.

#### `resetCooldowns`
Restores all `usesRemaining` to `limit` on the target card. If `firstOnly: true` (microevent failure penalty), only resets the first ability.

#### `selfDestruct`
Removes the caster from `inPlay` immediately — no damage, just gone.

---

## 5. Microgames (Microevents)

### Outcomes

| Outcome | Result Shape | Behavior |
|---|---|---|
| `binary` | `{ success: bool, score: 0 or 1 }` | Full effect on success; reduced/no effect on failure |
| `scaled` | `{ success: bool, score: 0.0–1.0 }` | Effect intensity scales with score; `success = score >= 0.5` |

### Types

| Type | Style | Common Outcome |
|---|---|---|
| `qte` | Quick-time button prompt | binary |
| `pattern` | Memorise and repeat a sequence | scaled |
| `quiz` | Answer a trivia/math question | binary |
| `rhythm` | Hit beats in time | scaled |
| `mash` | Rapid button mashing | scaled |
| `parry` | Block a series of strikes | binary |
| `route` | Navigate a path | scaled |
| `sigil` | Recall a drawn symbol | binary |
| `arrow` | Aim and fire shots | scaled |

### Per-Ability Downgrade Paths (from `applyMicroeventModifications`)

| Ability | Microgame | On Fail / Low Score |
|---|---|---|
| Supernova | qte binary | ×3 damage → ×1 |
| Quick Bolt | qte binary | Miss entirely (empty effects) |
| Fortify | sigil binary | def_up value 2 → 1 |
| Healing Tide | quiz binary | heal 4 → 2 |
| Mind Wash | sigil binary | All cooldowns reset → first ability only |
| Fossilize | quiz binary | Heal stays, def_up removed |
| Volley | arrow scaled | `repeat = round(score × 3)` (0–3 hits) |
| Quake | pattern scaled | `flatBonus = round(-3 + score × 3)` |
| Short Circuit | route scaled | <0.34 no effect, <0.67 def_down = 2, ≥0.67 full (target's DEF to 0) |
| Noxious Cloud | rhythm scaled | `duration = max(1, round(score × 2))` |
| Soul Reap | rhythm scaled | <0.25 no lifesteal, <0.75 half lifesteal, ≥0.75 full |
| Lacerate | rhythm scaled | `bleed duration = max(1, round(score × 2))` |
| Searing Lash | mash scaled | `flatBonus += round((score - 0.5) × 6)` (−3 to +3) |
| Crack Attack | mash scaled | `flatBonus += round((score - 0.5) × 6)` (−3 to +3) |
| Gale Shot | arrow scaled | score ≤ 0 → miss entirely |

---

## 6. CPU AI System

Each CPU player has a `cpuSkill` value (1–5) stored on their player slot. All parameters are derived from a continuous `t` value (0–1) mapped from the skill level, so the system scales smoothly.

### 6.1 Skill Level Parameter Table

| Level | Name | t | abilityPref | killBonus | elimBonus | Mini-game binary | Lookahead breadth |
|---|---|---|---|---|---|---|---|
| 1 | Easy | 0.10 | 24% | 7 | 18 | 28% | 0 (random) |
| 2 | Normal | 0.30 | 40% | 10 | 24 | 44% | 0 (light bias) |
| 3 | Hard | 0.55 | 61% | 14 | 32 | 64% | top 2 per card |
| 4 | Very Hard | 0.75 | 78% | 17 | 38 | 80% | top 3 per card |
| 5 | Insane | 1.00 | 99% | 20 | 45 | 100% | top 4 per card |

`t` formulas:
- `abilityPref = 0.15 + t × 0.84`
- `killShotBonus = round(6 + t × 14)`
- `elimBonus = round(15 + t × 30)`
- `useScoring = t >= 0.5` (Hard+)
- `lookaheadBreadth = round(t × 4)`

### 6.2 Mini-game Performance

| Level | Binary success | Scaled score range |
|---|---|---|
| Easy (1) | 28% | 0.17 – 0.29 |
| Normal (2) | 44% | 0.35 – 0.47 |
| Hard (3) | 64% | 0.57 – 0.69 |
| Very Hard (4) | 80% | 0.75 – 0.87 |
| Insane (5) | 100% | 0.97 – 1.00 |

Derived from `t`:
- `binarySuccess = min(1, 0.20 + t × 0.80)`
- `scaledLo = 0.08 + t × 0.89`, `scaledHi = min(1.0, scaledLo + 0.12)`

Insane always wins mini-games perfectly.

### 6.3 Turn Execution Flow

**1. Card play (all skill levels)**
- Skip if a card was already played this turn, or the board is full
- Easy/Normal: play `hand[0]`
- Hard+: score each hand card (see §6.9); play the highest-scoring one, adjusted by board-state modifier

**2. Card action loop**

At **Easy/Normal** (`lookaheadBreadth = 0`): each card acts greedily and independently in index order. Ability/target selection is random at skill 1; lightly HP-biased at skill 2.

At **Hard+** (`lookaheadBreadth > 0`): **greedy sequential simulation** — cards do NOT act independently:
1. Build `remainingIndices` = all un-acted card indices, pre-sorted with debuffers first
2. For each remaining card, simulate its best action on a `deepClone` of the current state; auto-resolve any microevent as perfect success
3. Score each resulting board state with `evaluateBoardState`
4. Apply the globally best (card, action) pair to the real state; remove that card from `remainingIndices`
5. Repeat until all cards have acted

This means at Hard+ the CPU always finds the optimal **action order** within a turn — debuffing before the damage dealer swings, finishing weakened targets first, etc.

**3. End turn**

### 6.4 Multi-card Combo Ordering (Hard+)

Before the action loop, `inPlay` indices are sorted by combo priority:
- Cards with a usable debuff ability (`def_down`, `atk_down`, `focused`, `frozen`) → act **first** (priority −2)
- Pure attackers with no usable abilities → act **last** (priority +1)
- Others → middle (priority 0)

Combined with the greedy lookahead, this ensures debuffers consistently amplify damage dealers in the same turn.

### 6.5 Board Evaluation (`evaluateBoardState`)

Used during lookahead simulation to score a candidate resulting state:

```
score = −1 × totalEnemyHP
      + 100 × eliminated enemy players
      + 30  × killed enemy cards (this turn)
```

Minimising enemy HP is the base signal; eliminating players is overwhelmingly preferred; individual kill-shots are a secondary reward.

### 6.6 Enemy Card Target Scoring (Hard+)

| Condition | Score |
|---|---|
| Target is `invulnerable` or `invisible` | skipped (untouchable) |
| Base | +1 |
| Estimated damage × 0.5 | scaled |
| Kill shot (HP ≤ estimated damage) | +`killShotBonus` (14–20) |
| Kill eliminates that player | +`elimBonus` (32–45) |
| HP < 30% of max | +5 |
| Has `focused` status | +4 |
| Has `def_down` already applied | +3 |
| `attack` ≥ 7 (high threat) | +2 |
| Basic attack only: `hitChance < 40%` | −4 |
| Basic attack only: `hitChance = 0%` | skipped entirely |

Hit chance uses the live combat formula: `hitChance = 50 + 15 × (effectiveAGI − effectiveEVA)`.

### 6.7 Ally Card Target Scoring (Hard+)

| Condition | Score |
|---|---|
| HP > 80% of max | −4 |
| Base | +1 |
| Has active DOT (burned/poisoned/bleeding) | +5 |
| Has `frozen` | +6 |
| HP < 30% of max | +6 |
| HP < 25% of max | +10 |

**Defensive urgency override:** If the acting card itself is at <25% HP and has a heal or invulnerable ability, that ability receives a forced +30 to its score.

### 6.8 Ability Scoring (Hard+)

| Effect | Score |
|---|---|
| `damage` single target | `max(1, ATK×mult+flat−DEF)×repeat` against best candidate target |
| `damage` allEnemies | sum of above across all living enemy cards |
| Kill shot on any target | +`killShotBonus` |
| Kill eliminates player | +`elimBonus` |
| `status: frozen` | +10 |
| `status: invulnerable` / `invisible` | +8 |
| `status: shielded` | value × 1.2 |
| `status: atk_up` | value × 2 |
| `status: def_up` / `eva_up` | value × 1.5 |
| `status: def_down` | value × 1.5 |
| `status: burned/poisoned/bleeding` | value × min(duration, 3) × 0.8 |
| `healSelf` | min(amount, missingHP) × 1.2; +15 if any ally <25% HP |
| `heal` ally | min(amount, targetMissingHP) × 1.2; +15 if any ally <25% HP |
| `cleanse` | active matching debuffs removed × 3 |
| `resetCooldowns` | +7 |
| `selfDestruct` | −5 |
| Target already has the same status | −4 |
| Last use of a low-limit ability | +2 |
| Caster HP < 25% (with heal/invulnerable) | +30 (defensive urgency) |
| Caster HP 25–30% | +3 |

### 6.9 Hand Card Scoring (Hard+)

| Condition | Score |
|---|---|
| `attack + health` (base) | as-is |
| Support card (ATK ≤ 4) AND an ally is below 30% HP | +5 |
| Has a `limit: 1` finisher ability | +4 |
| Board already has 4+ cards in play | −3 |
| `health ≤ 5` AND max enemy ATK ≥ 7 | −2 |
| CPU HP winning by 50%+ (hold strong cards) | −5 |
| CPU HP losing by 40%+ (rush best card) | +8 |

---

## 7. Current Card Pool

| Card | ATK | DEF | HP | EVA | AGI | Category |
|---|---|---|---|---|---|---|
| Drip Potter | 7 | 5 | 10 | 7 | 8 | dripwarts |
| Hustle Granger | 6 | 6 | 9 | 5 | 6 | dripwarts |
| Lil Snape | 9 | 7 | 11 | 4 | 5 | dripwarts |
| The Voldy Don | 10 | 4 | 8 | 8 | 7 | dripwarts |
| Dumbledrip | 8 | 7 | 12 | 6 | 4 | dripwarts |
| Swagrid | 6 | 9 | 18 | 2 | 3 | dripwarts |
| Dobby the Free | 9 | 3 | 6 | 9 | 10 | dripwarts |
| Malfoy Mogul | 7 | 5 | 9 | 5 | 7 | dripwarts |
| Bellatrix Baddie | 9 | 4 | 8 | 6 | 8 | dripwarts |
| Ron Riches | 7 | 6 | 12 | 4 | 5 | dripwarts |
| Hood Nigga | 5 | 5 | 9 | 6 | 5 | unknown |
| Vanguard Knight | 6 | 7 | 11 | 5 | 5 | official v1 |
| Cold Killa | 8 | 5 | 9 | 6 | 7 | official v1 |
| Pyro Warden | 5 | 10 | 15 | 2 | 3 | official v1 |
| Volt Stinger | 7 | 3 | 6 | 9 | 10 | official v1 |
| Terra Titan | 6 | 9 | 12 | 1 | 2 | official v1 |
| Shadow Stalker | 9 | 4 | 7 | 8 | 8 | official v1 |
| Aquatic Sage | 3 | 6 | 8 | 5 | 5 | official v1 |
| Iron Monarch | 7 | 8 | 11 | 3 | 4 | official v1 |
| Zephyr Archer | 6 | 4 | 7 | 7 | 9 | official v1 |
| Toxic Chimera | 7 | 4 | 10 | 4 | 6 | official v1 |

---

*Last updated: April 2026*

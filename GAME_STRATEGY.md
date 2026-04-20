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
| `evasion` | Miss chance. Roll `rand(0–9) < effectiveEVA` → miss. Effective EVA = `evasion + eva_up` |
| `agility` | Flavor/passive use only — no direct combat formula |

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

## 6. CPU AI Scoring System (PROPOSAL — tweak before implementing)

The current engine uses a flat 60% ability preference with random ability and target selection. The goal is to replace this with a scored system across 5 skill levels.

### 6.1 Skill Levels

| Level | Name | `cpuSkill` | Ability Pref | Ability Pick | Target Pick |
|---|---|---|---|---|---|
| 1 | Easy | 1 | 25% | Random | Random |
| 2 | Normal | 2 | 45% | Random | Slight HP bias |
| 3 | Hard | 3 | 65% | Scored | Full scoring |
| 4 | Very Hard | 4 | 80% | Scored + modifiers | Full scoring |
| 5 | Insane | 5 | 92% | Scored + modifiers | Full scoring |

`cpuSkill` would live on each CPU player slot individually, not in global settings.

### 6.2 Mini-game Performance

| Skill | Binary success | Scaled score range |
|---|---|---|
| Easy (1) | 25% | 0.10 – 0.45 |
| Normal (2) | 45% | 0.30 – 0.60 |
| Hard (3) | 65% | 0.50 – 0.78 |
| Very Hard (4) | 80% | 0.65 – 0.88 |
| Insane (5) | 92% | 0.80 – 0.97 |

### 6.3 Enemy Card Target Scoring

Higher score = prefer this target.

| Condition | Score |
|---|---|
| Target is `invulnerable` or `invisible` | **−100** (never target) |
| Base | +1 |
| Kill shot (HP ≤ estimated damage) | +10 |
| HP < 30% of max | +5 |
| Has `focused` status (about to hit hard) | +4 |
| Has `def_down` already applied | +3 |
| `attack` ≥ 7 (high threat card) | +2 |
| Basic attack only: `effectiveEVA` ≥ 7 | −3 |

### 6.4 Ally Card Target Scoring

Higher score = prefer this ally for heal/buff/cleanse.

| Condition | Score |
|---|---|
| HP > 80% of max (wasteful heal) | −4 |
| Base | +1 |
| Has active DOT (burned/poisoned/bleeding) | +5 |
| Has `frozen` (cleanse urgency) | +6 |
| HP < 30% of max | +8 |

### 6.5 Ability Scoring

Base score per effect type:

| Effect | Score |
|---|---|
| `damage` standard | `max(1, effectiveATK × multiplier − effectiveDEF)` |
| `damage` with `ignoreDef` | ATK × multiplier (no DEF) |
| `damage` `allEnemies` | sum estimated damage across all living enemy cards |
| `status: frozen` | 10 |
| `status: invulnerable` / `invisible` | 8 |
| `status: focused` | net gain over basic attack |
| `status: shielded` | value × 1.2 |
| `status: damage_reduction` | estimated incoming damage × 0.5 |
| `status: def_down` | value × 1.5 |
| `status: burned` / `poisoned` / `bleeding` | value × min(duration, 3) × 0.8 |
| `status: atk_up` | value × 2 |
| `status: def_up` / `eva_up` | value × 1.5 |
| `healSelf` | min(amount, missingHP) × 1.2 |
| `heal` (ally) | min(amount, targetMissingHP) × 1.2 |
| `cleanse` | count of active debuffs removed × 3 |
| `resetCooldowns` | 7 flat |
| `selfDestruct` | −5 penalty |

Modifiers on top of base ability score:

| Condition | Modifier |
|---|---|
| Ability kills the target card | +8 |
| Ability eliminates an enemy player | +20 |
| Target already has the same status | −4 |
| `usesRemaining === 1` and `limit ≤ 2` (last use of a nuke) | +2 |
| Caster HP < 30% of max (self-preservation urgency) | +3 |

### 6.6 Hand Card Scoring (Hard+ only)

At Easy/Normal, always play `hand[0]`. At Hard+, score each card:

| Condition | Score |
|---|---|
| `attack + health` (base) | as-is |
| Support card (ATK ≤ 4) AND an ally is below 30% HP | +5 |
| Has a `limit: 1` finisher ability | +4 |
| Board already has 4+ cards in play | −3 |
| `health ≤ 5` AND max enemy ATK ≥ 7 | −2 |

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

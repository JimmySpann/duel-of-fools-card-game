// Card data — Acinder's Harry Potter custom card pack (createdBy: '69e17f88c9f0001d6a4dda7e')
// Mirrors src/sections/card-game/database/cards.js
const cards = [
    {
        id: 'dripPotter',
        name: 'Drip Potter',
        elements: { air: 3, normal: 2 },
        type: 'Battler',
        image: 'https://i.postimg.cc/pVZBrTcx/Drip-Potter.jpg',
        description: 'The Boy Who Lived... and stayed fly. His robes are designer, and his wand is gold-plated.',
        passives: [
            { name: 'Main Character Energy', effect: 'Lethal hits leave him at 1 HP', description: 'Plot armor, but make it fashion.' },
            { name: 'Hypebeast', effect: 'ATK +1 for each Drip ally', description: 'The squad keeps the energy high.' },
        ],
        actions: [
            { name: 'Expelli-Drip-Mus', actionInfo: 'Disarm & Stun', description: 'Blasts the enemy clothes off, leaving them stunned.', limit: 5, usesRemaining: 5, microevent: { type: 'qte', outcome: 'binary' } },
            { name: 'Nimbus 2000 Retro', actionInfo: 'Evasion +5', description: 'Hopping on the vintage broom for a quick getaway.', limit: 8, usesRemaining: 8, microevent: { type: 'route', outcome: 'scaled' } },
            { name: 'Wand Flex', actionInfo: 'Magic Damage', description: 'Points the gold-plated wand and lets the drip do the talking. No cap.', limit: 12, usesRemaining: 12, microevent: { type: 'arrow', outcome: 'scaled', shots: 1 } },
        ],
        defense: 5, agility: 8, attack: 7, evasion: 7, health: 10, category: 'dripwarts', verified: true,
    },
    {
        id: 'hustleGranger',
        name: 'Hustle Granger',
        elements: { earth: 3, normal: 2 },
        type: 'Battler',
        image: 'https://i.postimg.cc/pVZBrTcR/Hustle-Granger.jpg',
        description: "She didn't just read the books; she owns the publishing company.",
        passives: [
            { name: 'Know-It-All', effect: 'Reveal enemy actions', description: 'She already predicted your mid-tier fit.' },
            { name: 'Resourceful', effect: 'Action limits +2', description: 'Always has a spare designer bag full of supplies.' },
        ],
        actions: [
            { name: 'Wingardium Lev-I-O-Sa', actionInfo: 'Displace Enemy', description: "It's Levi-O-sa, not Levi-o-SA. Puts the enemy in their place.", limit: 10, usesRemaining: 10, microevent: { type: 'rhythm', outcome: 'scaled', beats: 3 } },
            { name: 'Study Break', actionInfo: 'Heal 4 HP / Cleanse', description: 'Takes a second to regroup and look over the stats.', limit: 5, usesRemaining: 5, microevent: { type: 'quiz', outcome: 'binary', difficulty: 'easy', questionType: 'multiple' } },
        ],
        defense: 6, agility: 6, attack: 6, evasion: 5, health: 9, category: 'dripwarts', verified: true,
    },
    {
        id: 'lilSnape',
        name: 'Lil Snape',
        elements: { death: 4, normal: 1 },
        type: 'Battler',
        image: 'https://i.postimg.cc/8D8XyfhM/Lil-Snap.jpg',
        description: 'The Half-Blood Prince of Luxury. His potions are served in crystal chalices.',
        passives: [
            { name: 'Cold Glare', effect: 'Enemy ATK -2', description: 'One look makes your outfit feel outdated.' },
            { name: 'Double Agent', effect: '50% chance to reflect debuffs', description: "You never know whose side his style is on." },
        ],
        actions: [
            { name: 'Sectum-Sempra-Drip', actionInfo: 'Bleed Damage', description: 'A stylish cut that leaves the enemy faded.', limit: 6, usesRemaining: 6, microevent: { type: 'parry', outcome: 'binary' } },
            { name: 'Potions Master', actionInfo: 'Random Buff', description: 'Mixes a concoction that boosts a random stat.', limit: 12, usesRemaining: 12, microevent: { type: 'sigil', outcome: 'binary' } },
        ],
        defense: 7, agility: 5, attack: 9, evasion: 4, health: 11, category: 'dripwarts', verified: true,
    },
    {
        id: 'voldyDon',
        name: 'The Voldy Don',
        elements: { death: 5 },
        type: 'Battler',
        image: 'https://i.postimg.cc/3rBZNRfk/The-Voldy-Don.jpg',
        description: 'The Dark Lord of the Underground. No nose, but he can smell a fake from a mile away.',
        passives: [
            { name: 'Horcrux Chain', effect: 'Revive with 5 HP once', description: 'His soul is split between seven diamond chains.' },
            { name: 'Fear the Drip', effect: 'Enemies cannot use Priority moves', description: 'They are too intimidated to move first.' },
        ],
        actions: [
            { name: 'Avada Kedavra', actionInfo: 'Massive DMG (Low Accuracy)', description: 'The forbidden drip. Very lethal, very rare.', limit: 1, usesRemaining: 1, microevent: { type: 'pattern', outcome: 'scaled' } },
            { name: 'Snake Walk', actionInfo: 'Invisibility 1 turn', description: 'Slithers through the shadows in style.', limit: 4, usesRemaining: 4, microevent: { type: 'sigil', outcome: 'binary' } },
        ],
        defense: 4, agility: 7, attack: 10, evasion: 8, health: 8, category: 'dripwarts', verified: true,
    },
    {
        id: 'dumbledrip',
        name: 'Dumbledrip',
        elements: { fire: 3, air: 2 },
        type: 'Battler',
        image: 'https://i.postimg.cc/bYTRrJVP/Dombledore.jpg',
        description: 'Headmaster of the Streets. His beard is braided with 24k gold wire.',
        passives: [
            { name: 'Elder Swag', effect: 'Allies Agility +2', description: 'The OG leads the way.' },
            { name: 'Phoenix Down', effect: 'Heal 2 HP on Evasion', description: 'Fawkes keeps the fit fresh.' },
        ],
        actions: [
            { name: 'Firework Show', actionInfo: 'AOE Fire Damage', description: 'A dazzling display of pyrotechnic dominance.', limit: 5, usesRemaining: 5, microevent: { type: 'pattern', outcome: 'scaled' } },
            { name: 'Points to Gryffindor', actionInfo: 'Buff ATK +3', description: 'Bias has never looked this good.', limit: 3, usesRemaining: 3, microevent: { type: 'qte', outcome: 'binary' } },
        ],
        defense: 7, agility: 4, attack: 8, evasion: 6, health: 12, category: 'dripwarts', verified: true,
    },
    {
        id: 'swagrid',
        name: 'Swagrid',
        elements: { earth: 4, normal: 1 },
        type: 'Battler',
        image: 'https://i.postimg.cc/Sq01ZYW6/Sw-agrid.jpg',
        description: 'Keeper of the Keys and the Kicks. He breeds rare designer beasts.',
        passives: [
            { name: 'Thick Fur Coat', effect: 'Physical Resistance 25%', description: 'That XXL designer coat is basically armor.' },
            { name: 'Wild Growth', effect: 'Max HP +2', description: 'Everything is bigger in the hut.' },
        ],
        actions: [
            { name: 'Umbrella Poke', actionInfo: 'Melee Damage', description: "Don't let the pink umbrella fool you.", limit: 15, usesRemaining: 15, microevent: { type: 'mash', outcome: 'scaled' } },
            { name: 'Release the Hounds', actionInfo: 'Bleed Damage', description: 'Sends out a pack of diamond-collared wolves.', limit: 5, usesRemaining: 5, microevent: { type: 'mash', outcome: 'scaled' } },
        ],
        defense: 9, agility: 3, attack: 6, evasion: 2, health: 18, category: 'dripwarts', verified: true,
    },
    {
        id: 'dobbyTheFree',
        name: 'Dobby the Free',
        elements: { air: 3, death: 2 },
        type: 'Battler',
        image: 'https://i.postimg.cc/jqXh253R/Dobby.jpg',
        description: 'Master has given Dobby a Glock... Dobby is a free elf, and he stays strapped.',
        passives: [
            { name: 'Trigger Happy', effect: 'Double Strike chance', description: "Dobby doesn't just shoot; he empties the mag." },
            { name: 'Small Target', effect: 'Evasion +5', description: 'Hard to hit a target this small and this dangerous.' },
        ],
        actions: [
            { name: 'Pop a Cap', actionInfo: 'High Priority Ranged', description: 'Dobby lets the iron fly before the enemy can blink.', limit: 15, usesRemaining: 15, microevent: { type: 'qte', outcome: 'binary' } },
            { name: 'Tactical Apparition', actionInfo: 'Invulnerable 1 turn', description: "Teleports behind the enemy. 'Nothing personal, sir.'", limit: 5, usesRemaining: 5, microevent: { type: 'sigil', outcome: 'binary' } },
            { name: 'Mag Dump', actionInfo: 'Massive AOE Damage', description: 'Spray and pray, but with elven precision.', limit: 2, usesRemaining: 2, microevent: { type: 'mash', outcome: 'scaled' } },
        ],
        defense: 3, agility: 10, attack: 9, evasion: 9, health: 6, category: 'dripwarts', verified: true,
    },
    {
        id: 'malfoyMogul',
        name: 'Malfoy Mogul',
        elements: { ice: 3, normal: 2 },
        type: 'Battler',
        image: 'https://i.postimg.cc/fZ4qHSxx/Malfoy-Mogul.jpg',
        description: 'His father will hear about this... and then buy the whole arena.',
        passives: [
            { name: 'Pureblood Pride', effect: 'Enemy DEF -1', description: 'His condescending look lowers your guard.' },
            { name: 'Old Money', effect: 'Action Limits +3', description: 'He can afford the extra turns.' },
        ],
        actions: [
            { name: 'Silver Tongue', actionInfo: 'Confusion', description: 'Insults so sharp they cause mental damage.', limit: 8, usesRemaining: 8, microevent: { type: 'rhythm', outcome: 'scaled', beats: 3 } },
            { name: 'Cane Strike', actionInfo: 'Ice Damage', description: 'A cold strike from a hidden wand.', limit: 12, usesRemaining: 12, microevent: { type: 'parry', outcome: 'binary' } },
        ],
        defense: 5, agility: 7, attack: 7, evasion: 5, health: 9, category: 'dripwarts', verified: true,
    },
    {
        id: 'bellatrixBaddie',
        name: 'Bellatrix Baddie',
        elements: { fire: 2, death: 3 },
        type: 'Battler',
        image: 'https://i.postimg.cc/2mp9HL4n/image.jpg',
        description: 'Unbalanced, unhinged, and undisputed in the dark arts of fashion.',
        passives: [
            { name: 'Chaos Theory', effect: 'Random Crit Chance', description: "She's a wild card in a corset." },
            { name: 'Dark Devotion', effect: 'ATK +2 if Voldy Don is on team', description: 'The ultimate hype-woman.' },
        ],
        actions: [
            { name: 'Crucial Strike', actionInfo: 'High Magic DMG', description: 'A painful hex delivered with a wink.', limit: 8, usesRemaining: 8, microevent: { type: 'rhythm', outcome: 'scaled', beats: 4 } },
            { name: 'Dagger Toss', actionInfo: 'Ranged Damage', description: 'She never misses a target.', limit: 10, usesRemaining: 10, microevent: { type: 'arrow', outcome: 'scaled', shots: 1 } },
        ],
        defense: 4, agility: 8, attack: 9, evasion: 6, health: 8, category: 'dripwarts', verified: true,
    },
    {
        "id": "ronRiches",
        "name": "Ron Riches",
        "elements": { "fire": 2, "normal": 3 },
        "type": "Battler",
        "image": "https://i.postimg.cc/1Px7WVpK/wesley.jpg",
        "description": "Sick of hand-me-downs, Ron hit the jackpot. Now his robes are pure silk and his pockets are never empty.",
        "passives": [
            { "name": "King Weasley", "effect": "DEF +2 if HP < 50%", "description": "He starts playing for keeps when the pressure is on." },
            { "name": "Hand-Me-Down Hype", "effect": "Steal 1 random buff on hit", "description": "What's yours is now his, and he wears it better." }
        ],
        "actions": [
            { "name": "Slug Vomit Trap", "actionInfo": "Poison + Skip Turn", "description": "A classic hex with a designer twist. Disgusting but effective.", "limit": 4, "usesRemaining": 4, "microevent": { "type": "qte", "outcome": "binary" } },
            { "name": "Broken Wand Blast", "actionInfo": "High Variance DMG", "description": "It might backfire, or it might be a crit. High risk, high drip.", "limit": 10, "usesRemaining": 10, "microevent": { "type": "mash", "outcome": "scaled" } }
        ],
        "defense": 6, "agility": 5, "attack": 7, "evasion": 4, "health": 12, "category": "dripwarts", "verified": true
    },
    {
        id: 'vanguardKnight',
        name: 'Vanguard Knight',
        elements: { normal: 3, earth: 2 },
        type: 'Battler',
        image: 'https://images.stockcake.com/public/7/1/6/7168580a-5259-4913-84e5-a60dbc3d17f2_large/medieval-knight-posing-stockcake.jpg',
        description: 'A steadfast defender who excels at holding the line and supporting allies.',
        passives: [
            { name: 'Shield Wall', effect: 'Allies DEF +1', description: 'Bolsters the defense of all allies.' },
            { name: 'Unbreakable', effect: 'Takes -1 damage from all sources', description: 'Reduces all incoming damage.' },
        ],
        actions: [
            { name: 'Guardian Strike', actionInfo: 'Physical Damage', description: 'A reliable melee attack.', limit: 10, usesRemaining: 10 },
            { name: 'Guard Up', actionInfo: 'DEF +2 (Self)', description: 'Raises own defense for 2 turns.', limit: 5, usesRemaining: 5 },
        ],
        defense: 7, agility: 5, attack: 6, evasion: 5, health: 11, category: 'official v1', verified: true, official: true,
    },
    {
        id: 'coldKilla',
        name: 'Cold Killa',
        elements: { ice: 3, normal: 2 },
        type: 'Battler',
        image: 'https://i.ytimg.com/vi/LZzxMXiR3C0/maxresdefault.jpg',
        description: 'Back from the cold, this killa brings the freeze.',
        passives: [
            { name: 'Murderous Intent', effect: 'Ignore Defense', description: 'Attacks pierce through armor.' },
            { name: 'Cold Presence', effect: 'Enemy Evasion -2', description: 'The air freezes around them.' }
        ],
        actions: [
            { name: 'Ice Slash', actionInfo: 'Ice Damage', description: 'Attacks with ice damage', limit: 12, usesRemaining: 12 },
            { name: 'Freeze', actionInfo: 'Stun for 1 turn', description: 'Freezes an enemy for 1 turn', limit: 3, usesRemaining: 3 },
            { name: 'Blizzard', actionInfo: 'Invulnerable for 1 turn', description: 'Hides within a snowstorm', limit: 5, usesRemaining: 5 }
        ],
        defense: 5, agility: 7, attack: 8, evasion: 6, health: 9, category: 'official v1', verified: true, official: true,
    },
    {
        id: 'pyroWarden',
        name: 'Pyro Warden',
        elements: { fire: 4, normal: 1 },
        type: 'Battler',
        image: 'https://wallpapercave.com/wp/wp9171441.jpg',
        description: 'A living furnace that protects the front lines.',
        passives: [
            { name: 'Thorns of Flame', effect: '2 DMG to melee attackers', description: 'Hurts to touch.', type: 'fire' },
            { name: 'Inner Heat', effect: 'Immunity: Freeze', description: 'The fire within never goes out.', type: 'fire' }
        ],
        actions: [
            { name: 'Searing Lash', actionInfo: 'Normal Attack', description: 'Attacks and applies burn', limit: 10, usesRemaining: 10, type: 'fire', microevent: { type: 'mash', outcome: 'scaled' } },
            { name: 'Wall of Fire', actionInfo: 'Damage Reduction 50%', description: 'Reduces incoming damage by 50% for 1 turn', limit: 10, usesRemaining: 10, type: 'fire' },
            { name: 'Supernova', actionInfo: 'Massive DMG / Self-Destruct', description: 'Deals massive damage but kills user', limit: 1, usesRemaining: 1, type: 'fire', microevent: { type: 'qte', outcome: 'binary' } }
        ],
        defense: 10, agility: 3, attack: 5, evasion: 2, health: 15, category: 'official v1', verified: true, official: true,
    },
    {
        id: 'voltStinger',
        name: 'Volt Stinger',
        elements: { electric: 3, air: 2 },
        type: 'Battler',
        image: 'https://media.craiyon.com/2025-10-16/ubUkGu_-QheqB70j6cy0qQ.webp',
        description: 'Faster than sound, deadlier than a lightning strike.',
        passives: [
            { name: 'Static Charge', effect: 'ATK +1 on Evade', description: 'Builds energy as it moves.' },
            { name: 'High Voltage', effect: '20% Stun Chance', description: 'Shocking results on contact.' }
        ],
        actions: [
            { name: 'Quick Bolt', actionInfo: 'Priority Strike', description: 'A low damage, high priority strike', limit: 15, usesRemaining: 15, microevent: { type: 'qte', outcome: 'binary' } },
            { name: 'Thunder Dash', actionInfo: 'Evasion +4 for 2 turns', description: 'Moves like a flash of light', limit: 5, usesRemaining: 5 },
            { name: 'Short Circuit', actionInfo: 'Enemy DEF to 0', description: 'Disables enemy armor for 1 turn', limit: 3, usesRemaining: 3, microevent: { type: 'route', outcome: 'scaled' } }
        ],
        defense: 3, agility: 10, attack: 7, evasion: 9, health: 6, category: 'official v1', verified: true, official: true,
    },
    {
        id: 'terraTitan',
        name: 'Terra Titan',
        elements: { earth: 5 },
        type: 'Battler',
        image: 'https://d220lhlugu3kfc.cloudfront.net/wp-content/uploads/2020/12/160842-01-620x.jpg?fit=620%2C349',
        description: 'An ancient mountain given consciousness.',
        passives: [
            { name: 'Unstoppable', effect: 'Displace Immune', description: 'Cannot be moved or forced out.' },
            { name: 'Hardened Crust', effect: 'Damage Taken -1', description: 'Skin as hard as bedrock.' }
        ],
        actions: [
            { name: 'Quake', actionInfo: 'AOE Damage', description: 'Deals damage to all grounded enemies', limit: 5, usesRemaining: 5, microevent: { type: 'pattern', outcome: 'scaled' } },
            { name: 'Rock Toss', actionInfo: 'Ranged Damage', description: 'A heavy ranged projectile', limit: 10, usesRemaining: 10, microevent: { type: 'route', outcome: 'scaled' } },
            { name: 'Fossilize', actionInfo: 'Heal 5 HP / DEF +2', description: 'Turns to stone to recover', limit: 3, usesRemaining: 3, microevent: { type: 'quiz', outcome: 'binary', difficulty: 'easy', questionType: 'boolean' } }
        ],
        defense: 9, agility: 2, attack: 6, evasion: 1, health: 12, category: 'official v1', verified: true, official: true,
    },
    {
        id: 'shadowStalker',
        name: 'Shadow Stalker',
        elements: { death: 4, normal: 1 },
        type: 'Battler',
        image: 'https://images.hive.blog/DQmSyuu3SzkubxfBrfgxbdXoMvd6ithQxuxEiB9zDbvC836/shadow_2.jpg',
        description: 'He waits in the corners of your vision.',
        passives: [
            { name: 'Night Veil', effect: 'Evasion +3 (Dark)', description: 'Harder to hit in the shadows.' },
            { name: 'Fear Monger', effect: 'Enemy ATK -1', description: 'Enemies tremble in his presence.' }
        ],
        actions: [
            { name: 'Backstab', actionInfo: '2x Damage from Behind', description: 'Lethal strike to the spine', limit: 8, usesRemaining: 8, microevent: { type: 'parry', outcome: 'binary' } },
            { name: 'Vanish', actionInfo: 'Invisibility for 1 turn', description: 'Becomes invisible for 1 turn', limit: 4, usesRemaining: 4 },
            { name: 'Soul Reap', actionInfo: 'Lifesteal', description: 'Heals based on damage dealt', limit: 6, usesRemaining: 6, microevent: { type: 'rhythm', outcome: 'scaled', beats: 4 } }
        ],
        defense: 4, agility: 8, attack: 9, evasion: 8, health: 7, category: 'official v1', verified: true, official: true,
    },
    {
        id: 'aquaticSage',
        name: 'Aquatic Sage',
        elements: { water: 3, normal: 2 },
        type: 'Battler',
        image: 'https://cdn1.jigidi.com/thumbs/090HXVYI/l',
        description: 'The ocean whispers its secrets to those who listen.',
        passives: [
            { name: 'Flow State', effect: 'Regen 1 HP/Turn', description: 'Constant healing through meditation.' },
            { name: 'Clarity', effect: 'Immunity: Confusion', description: 'Mind as clear as still water.' }
        ],
        actions: [
            { name: 'Healing Tide', actionInfo: 'Heal 4 HP', description: 'Heals a target ally for 4 HP', limit: 8, usesRemaining: 8, microevent: { type: 'quiz', outcome: 'binary', difficulty: 'easy', questionType: 'multiple' } },
            { name: 'Bubble Shield', actionInfo: '3 DMG Shield', description: 'Grants an ally a 3-damage shield', limit: 10, usesRemaining: 10 },
            { name: 'Mind Wash', actionInfo: 'Reset Cooldowns', description: 'Resets all cooldowns for an ally', limit: 2, usesRemaining: 2, microevent: { type: 'sigil', outcome: 'binary' } }
        ],
        defense: 6, agility: 5, attack: 3, evasion: 5, health: 8, category: 'official v1', verified: true, official: true,
    },
    {
        id: 'ironMonarch',
        name: 'Iron Monarch',
        elements: { earth: 5 },
        type: 'Battler',
        image: 'https://onemanshobby.com/cdn/shop/files/0fcf2b81d2bc511f7a63a57fbdf3666__26203_1024x1024.jpg?v=1723799979',
        description: 'The undisputed ruler of the industrial wastes.',
        passives: [
            { name: 'Commanding Aura', effect: 'Allies ATK +1', description: 'His presence inspires the troops.' },
            { name: 'Magnetic Pull', effect: 'Taunt Projectiles', description: 'Draws fire away from allies.' }
        ],
        actions: [
            { name: 'Scepter Smash', actionInfo: 'Heavy Physical', description: 'A heavy physical blow', limit: 12, usesRemaining: 12, microevent: { type: 'parry', outcome: 'binary' } },
            { name: 'Fortify', actionInfo: 'Allies DEF +2', description: 'Increases the defense of all allies', limit: 5, usesRemaining: 5, microevent: { type: 'sigil', outcome: 'binary' } },
            { name: 'Rallying Cry', actionInfo: 'Cleanse Debuffs', description: 'Removes all debuffs from the team', limit: 3, usesRemaining: 3 }
        ],
        defense: 8, agility: 4, attack: 7, evasion: 3, health: 11, category: 'official v1', verified: true, official: true,
    },
    {
        id: 'zephyrArcher',
        name: 'Zephyr Archer',
        elements: { air: 4, earth: 1 },
        type: 'Battler',
        image: 'https://media.istockphoto.com/id/1004439142/photo/fantasy-medieval-woman-hunting-in-mystery-forest.jpg?s=612x612&w=0&k=20&c=R5Xjar115K_Cg9LGfebQYMWM6GEDZg6WhucQe472SaE=',
        description: 'Her arrows are guided by the wind itself.',
        passives: [
            { name: 'Eagle Eye', effect: 'Ignore Evasion (Flying)', description: 'Never misses a bird in flight.' },
            { name: 'Tailwind', effect: 'Behind Ally Agility +2', description: 'Boosts the speed of those behind.' }
        ],
        actions: [
            { name: 'Gale Shot', actionInfo: 'Damage + Knockback', description: 'Deals damage and pushes enemy back', limit: 10, usesRemaining: 10, microevent: { type: 'arrow', outcome: 'scaled', shots: 1 } },
            { name: 'Volley', actionInfo: 'Multi-Target', description: 'Deals small damage to 3 random enemies', limit: 6, usesRemaining: 6, microevent: { type: 'arrow', outcome: 'scaled', shots: 3 } },
            { name: 'Focus', actionInfo: 'Next Attack 2.5x DMG', description: 'Concentrates for a lethal shot', limit: 4, usesRemaining: 4 }
        ],
        defense: 4, agility: 9, attack: 6, evasion: 7, health: 7, category: 'official v1', verified: true, official: true,
    },
    {
        id: 'toxicChimera',
        name: 'Toxic Chimera',
        elements: { death: 3, normal: 2 },
        type: 'Battler',
        image: 'https://static0.srcdn.com/wordpress/wp-content/uploads/2025/09/image-psd-121.jpg?w=1200&h=900&fit=crop',
        description: 'A mistake of nature that bleeds venom.',
        passives: [
            { name: 'Miasma', effect: '1 Dot Damage', description: 'Enemies touching lose 1 HP per turn.' },
            { name: 'Corrosive Blood', effect: 'Lower Enemy DEF on hit', description: 'Acids melt the weapons that strike it.' }
        ],
        actions: [
            { name: 'Venom Spit', actionInfo: 'Poison (3 turns)', description: 'Poisons the target for 3 turns', limit: 8, usesRemaining: 8 },
            { name: 'Lacerate', actionInfo: 'Bleed Damage', description: 'Deals damage and applies bleed', limit: 10, usesRemaining: 10, microevent: { type: 'rhythm', outcome: 'scaled', beats: 4 } },
            { name: 'Noxious Cloud', actionInfo: 'AOE Poison', description: 'Covers the field in toxic gas', limit: 2, usesRemaining: 2, microevent: { type: 'rhythm', outcome: 'scaled', beats: 4 } }
        ],
        defense: 4, agility: 6, attack: 7, evasion: 4, health: 10, category: 'official v1', verified: true, official: true,
    },
];

module.exports = cards;

const cards = [
    {
        id: 'hoodNigga',
        name: 'Hood Nigga',
        elements: { fire: 3, normal: 2 },
        type: 'Battler',
        image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT4i0P_aTGgvJSkN3qxz-tsscYgxAqLNAMoMA&s',
        description: 'The hood nigga will attack immediately if crack is seen. He hasnt slept is 3 days',
        passives: [
            { name: 'Flying High', effect: 'Evasion increased by 2', description: 'This nigga flying high!' },
            { name: 'Pain Immunity', effect: 'Defense +3 next turn if hit', description: 'Adrenaline masks the pain.' }
        ],
        actions: [
            { name: 'Crack Attack', actionInfo: 'High Priority Melee', description: 'Makes a bee line for enemys jugula.', limit: 10, usesRemaining: 10 },
            { name: 'Smoke Break', actionInfo: 'Invulnerable for 1 turn', description: 'Becomes unattackable for 1 turn', limit: 5, usesRemaining: 5 }
        ],
        defense: 5, evasion: 6, health: 9
    },
    {
        id: 'coldKilla',
        name: "Cold Killa",
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
        defense: 5, agility: 7, attack: 8, evasion: 6, health: 9
    },
    {
        id: 'pyroWarden',
        name: "Pyro Warden",
        elements: { fire: 4, normal: 1 },
        type: 'Battler',
        image: 'https://wallpapercave.com/wp/wp9171441.jpg',
        description: 'A living furnace that protects the front lines.',
        passives: [
            { name: 'Thorns of Flame', effect: '2 DMG to melee attackers', description: 'Hurts to touch.' },
            { name: 'Inner Heat', effect: 'Immunity: Freeze', description: 'The fire within never goes out.' }
        ],
        actions: [
            { name: 'Searing Lash', actionInfo: 'Normal Attack', description: 'Attacks and applies burn', limit: 10, usesRemaining: 10 },
            { name: 'Wall of Fire', actionInfo: 'Damage Reduction 50%', description: 'Reduces incoming damage by 50% for 1 turn', limit: 10, usesRemaining: 10 },
            { name: 'Supernova', actionInfo: 'Massive DMG / Self-Destruct', description: 'Deals massive damage but kills user', limit: 1, usesRemaining: 1 }
        ],
        defense: 10, agility: 3, attack: 5, evasion: 2, health: 15
    },
    {
        id: 'voltStinger',
        name: "Volt Stinger",
        elements: { electric: 3, air: 2 },
        type: 'Battler',
        image: 'https://media.craiyon.com/2025-10-16/ubUkGu_-QheqB70j6cy0qQ.webp',
        description: 'Faster than sound, deadlier than a lightning strike.',
        passives: [
            { name: 'Static Charge', effect: 'ATK +1 on Evade', description: 'Builds energy as it moves.' },
            { name: 'High Voltage', effect: '20% Stun Chance', description: 'Shocking results on contact.' }
        ],
        actions: [
            { name: 'Quick Bolt', actionInfo: 'Priority Strike', description: 'A low damage, high priority strike', limit: 15, usesRemaining: 15 },
            { name: 'Thunder Dash', actionInfo: 'Evasion +4 for 2 turns', description: 'Moves like a flash of light', limit: 5, usesRemaining: 5 },
            { name: 'Short Circuit', actionInfo: 'Enemy DEF to 0', description: 'Disables enemy armor for 1 turn', limit: 3, usesRemaining: 3 }
        ],
        defense: 3, agility: 10, attack: 7, evasion: 9, health: 6
    },
    {
        id: 'terraTitan',
        name: "Terra Titan",
        elements: { earth: 5 },
        type: 'Battler',
        image: 'https://d220lhlugu3kfc.cloudfront.net/wp-content/uploads/2020/12/160842-01-620x.jpg?fit=620%2C349',
        description: 'An ancient mountain given consciousness.',
        passives: [
            { name: 'Unstoppable', effect: 'Displace Immune', description: 'Cannot be moved or forced out.' },
            { name: 'Hardened Crust', effect: 'Damage Taken -1', description: 'Skin as hard as bedrock.' }
        ],
        actions: [
            { name: 'Quake', actionInfo: 'AOE Damage', description: 'Deals damage to all grounded enemies', limit: 5, usesRemaining: 5 },
            { name: 'Rock Toss', actionInfo: 'Ranged Damage', description: 'A heavy ranged projectile', limit: 10, usesRemaining: 10 },
            { name: 'Fossilize', actionInfo: 'Heal 5 HP / DEF +2', description: 'Turns to stone to recover', limit: 3, usesRemaining: 3 }
        ],
        defense: 9, agility: 2, attack: 6, evasion: 1, health: 12
    },
    {
        id: 'shadowStalker',
        name: "Shadow Stalker",
        elements: { death: 4, normal: 1 },
        type: 'Battler',
        image: 'https://images.hive.blog/DQmSyuu3SzkubxfBrfgxbdXoMvd6ithQxuxEiB9zDbvC836/shadow_2.jpg',
        description: 'He waits in the corners of your vision.',
        passives: [
            { name: 'Night Veil', effect: 'Evasion +3 (Dark)', description: 'Harder to hit in the shadows.' },
            { name: 'Fear Monger', effect: 'Enemy ATK -1', description: 'Enemies tremble in his presence.' }
        ],
        actions: [
            { name: 'Backstab', actionInfo: '2x Damage from Behind', description: 'Lethal strike to the spine', limit: 8, usesRemaining: 8 },
            { name: 'Vanish', actionInfo: 'Invisibility for 1 turn', description: 'Becomes invisible for 1 turn', limit: 4, usesRemaining: 4 },
            { name: 'Soul Reap', actionInfo: 'Lifesteal', description: 'Heals based on damage dealt', limit: 6, usesRemaining: 6 }
        ],
        defense: 4, agility: 8, attack: 9, evasion: 8, health: 7
    },
    {
        id: 'aquaticSage',
        name: "Aquatic Sage",
        elements: { water: 3, normal: 2 },
        type: 'Battler',
        image: 'https://cdn1.jigidi.com/thumbs/090HXVYI/l',
        description: 'The ocean whispers its secrets to those who listen.',
        passives: [
            { name: 'Flow State', effect: 'Regen 1 HP/Turn', description: 'Constant healing through meditation.' },
            { name: 'Clarity', effect: 'Immunity: Confusion', description: 'Mind as clear as still water.' }
        ],
        actions: [
            { name: 'Healing Tide', actionInfo: 'Heal 4 HP', description: 'Heals a target ally for 4 HP', limit: 8, usesRemaining: 8 },
            { name: 'Bubble Shield', actionInfo: '3 DMG Shield', description: 'Grants an ally a 3-damage shield', limit: 10, usesRemaining: 10 },
            { name: 'Mind Wash', actionInfo: 'Reset Cooldowns', description: 'Resets all cooldowns for an ally', limit: 2, usesRemaining: 2 }
        ],
        defense: 6, agility: 5, attack: 3, evasion: 5, health: 8
    },
    {
        id: 'ironMonarch',
        name: "Iron Monarch",
        elements: { earth: 5 },
        type: 'Battler',
        image: 'https://onemanshobby.com/cdn/shop/files/0fcf2b81d2bc511f7a63a57fbdf3666__26203_1024x1024.jpg?v=1723799979',
        description: 'The undisputed ruler of the industrial wastes.',
        passives: [
            { name: 'Commanding Aura', effect: 'Allies ATK +1', description: 'His presence inspires the troops.' },
            { name: 'Magnetic Pull', effect: 'Taunt Projectiles', description: 'Draws fire away from allies.' }
        ],
        actions: [
            { name: 'Scepter Smash', actionInfo: 'Heavy Physical', description: 'A heavy physical blow', limit: 12, usesRemaining: 12 },
            { name: 'Fortify', actionInfo: 'Allies DEF +2', description: 'Increases the defense of all allies', limit: 5, usesRemaining: 5 },
            { name: 'Rallying Cry', actionInfo: 'Cleanse Debuffs', description: 'Removes all debuffs from the team', limit: 3, usesRemaining: 3 }
        ],
        defense: 8, agility: 4, attack: 7, evasion: 3, health: 11
    },
    {
        id: 'zephyrArcher',
        name: "Zephyr Archer",
        elements: { air: 4, earth: 1 },
        type: 'Battler',
        image: 'https://media.istockphoto.com/id/1004439142/photo/fantasy-medieval-woman-hunting-in-mystery-forest.jpg?s=612x612&w=0&k=20&c=R5Xjar115K_Cg9LGfebQYMWM6GEDZg6WhucQe472SaE=',
        description: 'Her arrows are guided by the wind itself.',
        passives: [
            { name: 'Eagle Eye', effect: 'Ignore Evasion (Flying)', description: 'Never misses a bird in flight.' },
            { name: 'Tailwind', effect: 'Behind Ally Agility +2', description: 'Boosts the speed of those behind.' }
        ],
        actions: [
            { name: 'Gale Shot', actionInfo: 'Damage + Knockback', description: 'Deals damage and pushes enemy back', limit: 10, usesRemaining: 10 },
            { name: 'Volley', actionInfo: 'Multi-Target', description: 'Deals small damage to 3 random enemies', limit: 6, usesRemaining: 6 },
            { name: 'Focus', actionInfo: 'Next Attack 2.5x DMG', description: 'Concentrates for a lethal shot', limit: 4, usesRemaining: 4 }
        ],
        defense: 4, agility: 9, attack: 6, evasion: 7, health: 7
    },
    {
        id: 'toxicChimera',
        name: "Toxic Chimera",
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
            { name: 'Lacerate', actionInfo: 'Bleed Damage', description: 'Deals damage and applies bleed', limit: 10, usesRemaining: 10 },
            { name: 'Noxious Cloud', actionInfo: 'AOE Poison', description: 'Covers the field in toxic gas', limit: 2, usesRemaining: 2 }
        ],
        defense: 4, agility: 6, attack: 7, evasion: 4, health: 10
    }
];


export default cards;
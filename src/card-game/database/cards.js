const cards = [
    {
        id: 'hoodNigga',
        name: 'Hood Nigga',
        elements: {
            fire: 3,
            normal: 2
        },
        type: 'Battler',
        image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT4i0P_aTGgvJSkN3qxz-tsscYgxAqLNAMoMA&s',
        description: 'The hood nigga will attack immediately if crack is seen. He hasnt slept is 3 days',
        passives: [
            'Flying High - This nigga flying high! Evasion increased by 2',
            'Pain Immunity - if hit, defense increases by 3 next turn'
        ],
        actions: [
            'Crack Attack - Makes a bee line for enemys jugula.',
            'Smoke Break - Becomes unattackable for 1 turn'
        ],
        defense: 5,
        evasion: 6,
        health: 9
    },
    {
        id: 'coldKilla',
        name: "Cold Killa",
        elements: {
            ice: 3,
            normal: 2
        },
        type: 'Battler',
        image: 'https://i.ytimg.com/vi/LZzxMXiR3C0/maxresdefault.jpg',
        description: 'Back from the cold, this killa brings the freeze.',
        passives: [
            'Murderous Intent - ignores defense when attacking',
            'Cold Presence - lowers evasion of enemies by 2',
        ],
        actions: [
            'Ice Slash - Attacks with ice damage',
            'Freeze - Freezes an enemy for 1 turn',
            'Blizzard - Becomes unattackable for 1 turn'
        ],
        defense: 5,
        agility: 7,
        attack: 8,
        evasion: 6,
        health: 9
    },
    {
        id: 'pyroWarden',
        name: "Pyro Warden",
        elements: { fire: 4, normal: 1 },
        type: 'Battler',
        image: 'https://wallpapercave.com/wp/wp9171441.jpg',
        description: 'A living furnace that protects the front lines.',
        passives: [
            'Thorns of Flame - deals 2 damage to melee attackers',
            'Inner Heat - immune to Freeze effects',
        ],
        actions: [
            'Searing Lash - Attacks and applies burn',
            'Wall of Fire - Reduces incoming damage by 50% for 1 turn',
            'Supernova - Deals massive damage but self-destructs'
        ],
        defense: 10,
        agility: 3,
        attack: 5,
        evasion: 2,
        health: 15
    },
    {
        id: 'voltStinger',
        name: "Volt Stinger",
        elements: { electric: 3, air: 2 },
        type: 'Battler',
        image: 'https://media.craiyon.com/2025-10-16/ubUkGu_-QheqB70j6cy0qQ.webp',
        description: 'Faster than sound, deadlier than a lightning strike.',
        passives: [
            'Static Charge - gains +1 attack every time it evades',
            'High Voltage - 20% chance to stun on any hit',
        ],
        actions: [
            'Quick Bolt - A low damage, high priority strike',
            'Thunder Dash - Increases evasion by 4 for 2 turns',
            'Short Circuit - Lowers enemy defense to 0 for 1 turn'
        ],
        defense: 3,
        agility: 10,
        attack: 7,
        evasion: 9,
        health: 6
    },
    {
        id: 'terraTitan',
        name: "Terra Titan",
        elements: { earth: 5 },
        type: 'Battler',
        image: 'https://d220lhlugu3kfc.cloudfront.net/wp-content/uploads/2020/12/160842-01-620x.jpg?fit=620%2C349',
        description: 'An ancient mountain given consciousness.',
        passives: [
            'Unstoppable - cannot be moved or displaced',
            'Hardened Crust - takes 1 less damage from all sources',
        ],
        actions: [
            'Quake - Deals damage to all grounded enemies',
            'Rock Toss - A heavy ranged projectile',
            'Fossilize - Heals 5 HP and gains 2 defense'
        ],
        defense: 9,
        agility: 2,
        attack: 6,
        evasion: 1,
        health: 12
    },
    {
        id: 'shadowStalker',
        name: "Shadow Stalker",
        elements: { death: 4, normal: 1 },
        type: 'Battler',
        image: 'https://images.hive.blog/DQmSyuu3SzkubxfBrfgxbdXoMvd6ithQxuxEiB9zDbvC836/shadow_2.jpg',
        description: 'He waits in the corners of your vision.',
        passives: [
            'Night Veil - +3 evasion in dark environments',
            'Fear Monger - enemies deal 1 less damage to this card',
        ],
        actions: [
            'Backstab - Double damage if attacking from behind',
            'Vanish - Becomes invisible for 1 turn',
            'Soul Reap - Heals based on damage dealt'
        ],
        defense: 4,
        agility: 8,
        attack: 9,
        evasion: 8,
        health: 7
    },
    {
        id: 'aquaticSage',
        name: "Aquatic Sage",
        elements: { water: 3, normal: 2 },
        type: 'Battler',
        image: 'https://cdn1.jigidi.com/thumbs/090HXVYI/l',
        description: 'The ocean whispers its secrets to those who listen.',
        passives: [
            'Flow State - regenerates 1 health every turn',
            'Clarity - allies are immune to confusion',
        ],
        actions: [
            'Healing Tide - Heals a target ally for 4 HP',
            'Bubble Shield - Grants an ally a 3-damage shield',
            'Mind Wash - Resets all cooldowns for an ally'
        ],
        defense: 6,
        agility: 5,
        attack: 3,
        evasion: 5,
        health: 8
    },
    {
        id: 'ironMonarch',
        name: "Iron Monarch",
        elements: { earth: 5 },
        type: 'Battler',
        image: 'https://onemanshobby.com/cdn/shop/files/0fcf2b81d2bc511f7a63a57fbdf3666__26203_1024x1024.jpg?v=1723799979',
        description: 'The undisputed ruler of the industrial wastes.',
        passives: [
            'Commanding Aura - all allies gain +1 attack',
            'Magnetic Pull - projectiles are likely to hit the Monarch instead of allies',
        ],
        actions: [
            'Scepter Smash - A heavy physical blow',
            'Fortify - Increases the defense of all allies by 2',
            'Rallying Cry - Removes all debuffs from the team'
        ],
        defense: 8,
        agility: 4,
        attack: 7,
        evasion: 3,
        health: 11
    },
    {
        id: 'zephyrArcher',
        name: "Zephyr Archer",
        elements: { air: 4, earth: 1 },
        type: 'Battler',
        image: 'https://media.istockphoto.com/id/1004439142/photo/fantasy-medieval-woman-hunting-in-mystery-forest.jpg?s=612x612&w=0&k=20&c=R5Xjar115K_Cg9LGfebQYMWM6GEDZg6WhucQe472SaE=',
        description: 'Her arrows are guided by the wind itself.',
        passives: [
            'Eagle Eye - ignores evasion of flying enemies',
            'Tailwind - increases the agility of the ally behind her by 2',
        ],
        actions: [
            'Gale Shot - Deals damage and pushes enemy back',
            'Volley - Deals small damage to 3 random enemies',
            'Focus - Next attack deals 2.5x damage'
        ],
        defense: 4,
        agility: 9,
        attack: 6,
        evasion: 7,
        health: 7
    },
    {
        id: 'toxicChimera',
        name: "Toxic Chimera",
        elements: { death: 3, normal: 2 },
        type: 'Battler',
        image: 'https://static0.srcdn.com/wordpress/wp-content/uploads/2025/09/image-psd-121.jpg?w=1200&h=900&fit=crop',
        description: 'A mistake of nature that bleeds venom.',
        passives: [
            'Miasma - any enemy that touches the Chimera loses 1 HP per turn',
            'Corrosive Blood - lowers attacker\'s defense when hit',
        ],
        actions: [
            'Venom Spit - Poisons the target for 3 turns',
            'Lacerate - Deals damage and prevents healing',
            'Noxious Cloud - Obscures the field, lowering all accuracy'
        ],
        defense: 5,
        agility: 6,
        attack: 5,
        evasion: 4,
        health: 10
    }
];

export default cards;
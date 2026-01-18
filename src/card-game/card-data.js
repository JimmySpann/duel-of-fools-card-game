const cards = [
    {
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
];

const actions = [
    {
        id: '',
        name: 'Crack Attack',
        type: 'attack',
        value: '5',
        element: 'normal',
        description: 'Makes a bee line for enemys jugula.'
    }
]

const gameEngine = {
    players: [
        {
            id: '',
            name: '',
            health: 20,
            hand: [],
            deck: [],
            discardPile: [],
            inPlay: {
                battlers: [],
                elements: [],
                spells: []
            },
            statusEffects: []
        }
    ],
    turnOrder: [],
    currentTurn: 0,
}

const inPlayCard = {
    id: '',
    name: '',
    type: '',
    elements: {},
    image: '',
    description: '',
    passives: [],
    actions: [],
    baseEvasion: 0,
    baseDefense: 0,
    baseMaxHealth: 0,
    evasion: 0,
    defense: 0,
    maxHealth: 0,
    health: 0,
    statusEffects: []
}

const cardStatus = [
    {
        name: 'Fatigue',
        description: 'Cannot use action until next turn.',
        duration: 1,
    },
    {
        name: 'Hidden',
        description: 'Card is placed faced down.',
    },
    {
        name: 'Burned',
        description: 'Takes 2 fire damage at the start of their turn for 3 turns.',
        duration: 3,
    }
]

export { cards, actions }
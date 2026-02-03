import cards from './cards'

const randomizeArray = (array) => {
    return array.sort(() => Math.random() - 0.5);
}

const testMatch = {
    players: [
        {
            id: 'player1',
            name: 'Player 1',
            health: 20,
            maxHealth: 20,
            image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRkvhuZArGVn0gVclSuYnQfGMgzbQoVhczNFg&s',
            hand: randomizeArray([...cards]).slice(0, 5),
            deck: [],
            discardPile: [],
            inPlay: randomizeArray([...cards]).slice(0, 8),
            elements: {
                fire: 4,
                earth: 2
            },
            statusEffects: []
        },
        {
            id: 'player2',
            name: 'Player 2',
            health: 10,
            maxHealth: 20,
            image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQG_JPg5gekN_ku7sulubGGBbruuECU22Bc4Q&s',
            hand: [],
            deck: [],
            discardPile: [],
            inPlay: randomizeArray([...cards]).slice(0, 4),
            elements: {
                air: 3,
                electric: 3,
            },
            statusEffects: []
        },
        {
            id: 'player3',
            name: 'Player 3',
            health: 10,
            maxHealth: 60,
            image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQG_JPg5gekN_ku7sulubGGBbruuECU22Bc4Q&s',
            hand: [],
            deck: [],
            discardPile: [],
            inPlay: [],
            elements: {
                air: 3,
                electric: 10,
            },
            statusEffects: []
        }
    ],
    turnOrder: [],
    currentTurn: 0,
    currentUserId: 'player1'
}

export default testMatch
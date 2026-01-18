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
            image: '',
            hand: [],
            deck: [],
            discardPile: [],
            inPlay: randomizeArray([...cards]).slice(0, 8),
            elements: [],
            statusEffects: []
        },
        {
            id: 'player2',
            name: 'Player 2',
            health: 20,
            maxHealth: 20,
            image: '',
            hand: [],
            deck: [],
            discardPile: [],
            inPlay: randomizeArray([...cards]).slice(0, 8),
            elements: [],
            statusEffects: []
        }
    ],
    turnOrder: [],
    currentTurn: 0,
}

export default testMatch
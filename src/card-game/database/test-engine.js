import cards from './cards'

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
            inPlay: cards,
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
            inPlay: cards,
            elements: [],
            statusEffects: []
        }
    ],
    turnOrder: [],
    currentTurn: 0,
}

export default testMatch
import React, { useState, useEffect, useRef } from 'react';
import './hand.css';

// Constants from your original code
const SUITS = ["spades", "diamonds", "clubs", "hearts"];
const VALUES = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const A_VAL = -0.02;
const H_VAL = 5;
const K_VAL = 0.5;
const DIFF = 0.1;
const MULTI = 1.6;
const CARD_WIDTH = 200; // 2.5 * 80

const Hand = () => {
    const [deck, setDeck] = useState([]);
    const [hand, setHand] = useState([]);
    const handRef = useRef(null);

    // Initialize deck on mount
    useEffect(() => {
        const newDeck = [];
        SUITS.forEach(suit => {
            VALUES.forEach(value => {
                newDeck.push({ suit, value, id: `${suit}-${value}` });
            });
        });
        setDeck(newDeck);
    }, []);

    const addCard = () => {
        if (deck.length === 0) return;

        const newDeck = [...deck];
        const card = newDeck.shift();

        setDeck(newDeck);
        setHand(prevHand => [...prevHand, card]);
    };

    const getypos = (xpos) => {
        return A_VAL * Math.pow((xpos - H_VAL), 2) + K_VAL;
    };

    const getRotation = (xpos) => {
        // xpos ranges from 0 to 10. H_VAL is 5 (the center).
        // Cards at xpos 0 should tilt left, at xpos 10 should tilt right.
        const distanceFromCenter = xpos - H_VAL;

        // This produces a linear rotation from -8 to +8 (adjustable by multi)
        // For a more dramatic curve, you can multiply this further
        let angle = distanceFromCenter * MULTI * 2;

        return angle;
    };


    const calculateCardStyle = (index) => {
        if (!handRef.current) return {};

        const count = hand.length;
        const handWidth = handRef.current.offsetWidth;
        const cardWidth = 200;

        // Calculate spacing so cards never exceed hand width
        let spacing = cardWidth / 2;
        let totalNeeded = (count - 1) * spacing + cardWidth;

        if (totalNeeded > handWidth) {
            spacing = (handWidth - cardWidth) / (count - 1 || 1);
            totalNeeded = handWidth;
        }

        const startOffset = (handWidth - totalNeeded) / 2;
        const left = startOffset + (index * spacing);

        // xpos: 0 (left edge) to 10 (right edge) for the parabola
        const cardCenter = left + cardWidth / 2;
        const xpos = (cardCenter / handWidth) * 10;

        const ypos = getypos(xpos);
        const rot = getRotation(xpos);
        // Calculate base bottom position
        const bottomBase = (ypos / K_VAL) * (handRef.current.offsetHeight / 4);

        return {
            left: `${left}px`,
            "--bottom-base": `${bottomBase}px`,
            "--rot": `${rot}deg`,
            zIndex: index
        };
    };

    return (
        <div className="container">
            <button className="add-btn" onClick={addCard}>Add Card</button>

            <div id="hand" ref={handRef}>
                {hand.map((card, index) => {
                    const isRed = card.suit === "hearts" || card.suit === "diamonds";
                    return (
                        <div
                            key={card.id}
                            className={`card ${isRed ? 'red' : 'black'}`}
                            style={calculateCardStyle(index)}
                        >
                            <span className="value">{card.value}</span>
                            <span className="suit">{card.suit === 'spades' ? '♠' :
                                card.suit === 'hearts' ? '♥' :
                                    card.suit === 'clubs' ? '♣' : '♦'}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default Hand;
import React, { useState, useEffect, useRef } from 'react';
import './card-game.css'; // Assume your styles are here

const CARDS_DATA = [
    { id: 'polyphemus', name: 'Polyphemus', vfx: 'polyphemus-clone-vfx' },
    { id: 'andromeda', name: 'Andromeda', vfx: null },
    { id: 'cerberus', name: 'Cerberus', vfx: null },
    { id: 'nyx', name: 'Nyx', vfx: 'nyx-clone-vfx' },
    { id: 'horse', name: 'Horse', vfx: null },
];

const Hand = () => {
    const [activeCardId, setActiveCardId] = useState(null);
    const vfxRefs = useRef([]);

    // Lazy Loading VFX Logic (Intersection Observer)
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('vfx--visible');
                        observer.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.1 }
        );

        vfxRefs.current.forEach((ref) => {
            if (ref) observer.observe(ref);
        });

        return () => observer.disconnect();
    }, [activeCardId]); // Re-run if clones are mounted

    const handleCardClick = (e, id) => {
        e.stopPropagation();
        setActiveCardId(id);
    };

    const resetHand = () => {
        setActiveCardId(null);
    };

    return (
        <div className="hand-container" onClick={resetHand}>
            <main className="hand">
                {/* Original Cards */}
                {CARDS_DATA.map((card) => (
                    <section
                        key={card.id}
                        className={`hand__${card.id} card-origin ${activeCardId === card.id ? 'card--hidden' : ''}`}
                        onClick={(e) => handleCardClick(e, card.id)}
                    >
                        <article className={`hand__${card.id}__article`}></article>
                        <aside className={`hand__${card.id}__aside`}></aside>
                    </section>
                ))}

                {/* Curtain */}
                <article className={`hand__curtain ${activeCardId ? 'curtain--visible' : ''}`}></article>

                {/* Clone Cards */}
                {CARDS_DATA.map((card) => (
                    <section
                        key={`${card.id}-clone`}
                        className={`hand__${card.id}-clone card-clone ${activeCardId === card.id ? 'card--visible' : ''}`}
                    >
                        <article className={`hand__${card.id}-clone__article`}>
                            {card.vfx && (
                                <span
                                    ref={(el) => vfxRefs.current.push(el)}
                                    className={`hand__${card.id}-clone__article__span ${card.vfx}`}
                                ></span>
                            )}
                        </article>
                        <aside className={`hand__${card.id}-clone__aside`}></aside>
                    </section>
                ))}
            </main>

            <footer>
                <a target="_blank" rel="noreferrer" href="https://linktr.ee/delvignefred" aria-label="All my social media links">
                    <svg id="logo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" aria-hidden="true">
                        <circle cx="400" cy="400" r="397"></circle>
                        <path d="M607.8,166.5H340.4h-16.3c-47,0-70.5,18.4-91,59.3l-53,105.6c-12,24.7-18.1,41.9-18.1,69.7 c0,24.1,6.6,44.5,17.5,66.2l54.8,109.6c21.1,42.8,48.2,56.6,95.2,56.6h40.9c0,0,0,0,0.1,0s0,0,0.1,0h59c15.7,0,30.1-7.1,30.1-28.8 c0-21.7-14.5-28.8-30.1-28.8h-30.9V380.8h150.1c15.7,0,30.1-9.3,30.1-31c0-21.7-14.5-31-30.1-31H398.7v-91.4h209.2 c15.7,0,30.1-8.8,30.1-30.5C637.9,175.3,623.5,166.5,607.8,166.5z M340,575.9h-11.1c-25.3,0-31.3-4.4-42.2-26.7l-53-107.9 c-6.6-13.9-11.4-24.4-11.4-39.5c0-20.5,6.6-32.1,15.1-49.6l50-100.7c12.6-25.9,18.1-24.2,45.8-24.2h6.9V575.9z"></path>
                    </svg>
                </a>
            </footer>
        </div>
    );
};

export default Hand;
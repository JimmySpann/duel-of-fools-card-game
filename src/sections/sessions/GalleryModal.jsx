import { useState, useMemo } from 'react';
import cards from '../card-game/database/cards';

const ELEMENT_COLORS = {
    fire: { bg: '#7c1a00', color: '#ff7a40', border: '#b04000' },
    ice: { bg: '#002e4d', color: '#7fd7ff', border: '#1a7aab' },
    electric: { bg: '#3d3000', color: '#ffe040', border: '#9a7d00' },
    earth: { bg: '#1a2e00', color: '#82c43c', border: '#4a7a10' },
    death: { bg: '#1a0033', color: '#c084fc', border: '#6b22b8' },
    water: { bg: '#001e40', color: '#5ac8fa', border: '#1055a0' },
    air: { bg: '#1a2a30', color: '#a0d8e8', border: '#3a7a90' },
    normal: { bg: '#1e2030', color: '#aab0cc', border: '#3a4060' },
};

const MICROEVENT_LABELS = {
    qte: 'QTE',
    mash: 'Mash',
    pattern: 'Pattern',
    rhythm: 'Rhythm',
    quiz: 'Quiz',
};

const ElementChip = ({ element, value }) => {
    const style = ELEMENT_COLORS[element] || ELEMENT_COLORS.normal;
    return (
        <span className="gallery-element-chip" style={{ background: style.bg, color: style.color, borderColor: style.border }}>
            {element} {value}
        </span>
    );
};

const CardEntry = ({ card }) => {
    const [expanded, setExpanded] = useState(false);
    const hasActions = card.actions && card.actions.length > 0;
    const hasPassives = card.passives && card.passives.length > 0;

    return (
        <div className={`gallery-card${expanded ? ' expanded' : ''}`} onClick={() => setExpanded((v) => !v)}>
            <div className="gallery-card-header">
                <div className="gallery-card-img-wrap">
                    <img src={card.image} alt={card.name} className="gallery-card-img" />
                </div>
                <div className="gallery-card-info">
                    <div className="gallery-card-name">{card.name}</div>
                    <div className="gallery-card-elements">
                        {Object.entries(card.elements || {}).map(([el, val]) => (
                            <ElementChip key={el} element={el} value={val} />
                        ))}
                    </div>
                    <div className="gallery-card-stats">
                        <span className="gallery-stat"><span className="gallery-stat-label">HP</span>{card.health}</span>
                        {card.attack != null && <span className="gallery-stat"><span className="gallery-stat-label">ATK</span>{card.attack}</span>}
                        <span className="gallery-stat"><span className="gallery-stat-label">DEF</span>{card.defense}</span>
                        <span className="gallery-stat"><span className="gallery-stat-label">EVA</span>{card.evasion}</span>
                        {card.agility != null && <span className="gallery-stat"><span className="gallery-stat-label">AGI</span>{card.agility}</span>}
                    </div>
                </div>
                <span className="gallery-card-chevron">{expanded ? '▲' : '▼'}</span>
            </div>

            {expanded && (
                <div className="gallery-card-body" onClick={(e) => e.stopPropagation()}>
                    <p className="gallery-card-desc">{card.description}</p>

                    {hasPassives && (
                        <div className="gallery-section">
                            <div className="gallery-section-title">Passives</div>
                            {card.passives.map((p, i) => (
                                <div key={i} className="gallery-passive">
                                    <span className="gallery-ability-name">{p.name}</span>
                                    <span className="gallery-ability-effect">{p.effect}</span>
                                    <span className="gallery-ability-desc">{p.description}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {hasActions && (
                        <div className="gallery-section">
                            <div className="gallery-section-title">Actions</div>
                            {card.actions.map((a, i) => (
                                <div key={i} className="gallery-action">
                                    <div className="gallery-action-row">
                                        <span className="gallery-ability-name">{a.name}</span>
                                        <span className="gallery-ability-info">{a.actionInfo}</span>
                                        {a.microevent && (
                                            <span className="gallery-microevent-badge">
                                                {MICROEVENT_LABELS[a.microevent.type] || a.microevent.type}
                                            </span>
                                        )}
                                    </div>
                                    <span className="gallery-ability-desc">{a.description}</span>
                                    <span className="gallery-ability-uses">Uses: {a.limit}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

const RULES_HOW_TO_PLAY = [
    'Play a card from your hand to put a battler into play.',
    'Only one card can be played per turn.',
    'Select a battler to Attack or use an Ability.',
    'Battlers that just entered play are Not Ready — they can\'t act this turn.',
    'Battlers that have already acted this turn are marked Acted.',
    'Defeat all enemy battlers to win, or reduce the opponent\'s HP to 0.',
    'Press End Turn to pass play to your opponent.',
];

const RULES_TURN_STEPS = [
    {
        step: 'Draw a Card',
        desc: 'At the start of your turn you automatically draw one card from your deck into your hand.',
    },
    {
        step: 'Play a Battler (optional)',
        desc: 'Play one card from your hand to deploy a battler to the field. You may only play one card per turn. Newly deployed battlers are Not Ready and cannot act this turn.',
    },
    {
        step: 'Act with Your Battlers',
        desc: 'Select any of your ready battlers and choose Attack or an Ability. Each battler can act once per turn. Battlers marked Acted have already used their action.',
    },
    {
        step: 'Resolve Combat',
        desc: 'Attacks are resolved using ATK vs the target\'s DEF. Agility (AGI) and Evasion (EVA) can cause attacks to miss. Elemental strengths and weaknesses modify damage further.',
    },
    {
        step: 'End Your Turn',
        desc: 'Press End Turn when you\'re done. All your battlers\' actions reset and play passes to your opponent. Battlers that were Not Ready become ready at the start of their controller\'s next turn.',
    },
    {
        step: 'Win Condition',
        desc: 'Defeat all enemy battlers in play, or reduce your opponent\'s HP to 0 to win the game.',
    },
];

const ALL_ELEMENTS = ['fire', 'ice', 'electric', 'earth', 'death', 'water', 'air', 'normal'];

const GalleryModal = ({ onClose }) => {
    const [tab, setTab] = useState('cards');
    const [search, setSearch] = useState('');
    const [elementFilter, setElementFilter] = useState(null);

    const filtered = useMemo(() => {
        return cards.filter((c) => {
            const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase());
            const matchElement = !elementFilter || Object.keys(c.elements || {}).includes(elementFilter);
            return matchSearch && matchElement;
        });
    }, [search, elementFilter]);

    return (
        <div className="gallery-overlay" onClick={onClose}>
            <div className="gallery-modal" onClick={(e) => e.stopPropagation()}>
                <div className="gallery-header">
                    <h2 className="gallery-title">Gallery</h2>
                    <button className="gallery-close-btn" onClick={onClose}>✕</button>
                </div>

                <div className="gallery-tabs">
                    <button
                        className={`gallery-tab${tab === 'cards' ? ' active' : ''}`}
                        onClick={() => setTab('cards')}
                    >
                        Battler Cards
                    </button>
                    <button
                        className={`gallery-tab${tab === 'rules' ? ' active' : ''}`}
                        onClick={() => setTab('rules')}
                    >
                        Rules
                    </button>
                </div>

                {tab === 'cards' && (
                    <div className="gallery-cards-panel">
                        <div className="gallery-filter-row">
                            <input
                                className="gallery-search"
                                type="text"
                                placeholder="Search cards…"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                autoFocus
                            />
                            <div className="gallery-element-filters">
                                {ALL_ELEMENTS.map((el) => {
                                    const style = ELEMENT_COLORS[el];
                                    return (
                                        <button
                                            key={el}
                                            className={`gallery-element-filter-btn${elementFilter === el ? ' active' : ''}`}
                                            style={elementFilter === el ? { background: style.bg, color: style.color, borderColor: style.border } : undefined}
                                            onClick={() => setElementFilter(elementFilter === el ? null : el)}
                                        >
                                            {el}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="gallery-card-list">
                            {filtered.length === 0 && (
                                <p className="gallery-empty">No cards match your search.</p>
                            )}
                            {filtered.map((card) => (
                                <CardEntry key={card.id} card={card} />
                            ))}
                        </div>
                    </div>
                )}

                {tab === 'rules' && (
                    <div className="gallery-rules-panel">
                        <section className="gallery-rules-section">
                            <h3 className="gallery-rules-heading">How to Play</h3>
                            <ul className="gallery-rules-list">
                                {RULES_HOW_TO_PLAY.map((rule, i) => (
                                    <li key={i}>{rule}</li>
                                ))}
                            </ul>
                        </section>

                        <section className="gallery-rules-section">
                            <h3 className="gallery-rules-heading">Turn Order</h3>
                            <ol className="gallery-turn-steps">
                                {RULES_TURN_STEPS.map((item, i) => (
                                    <li key={i}>
                                        <strong>{item.step}</strong>
                                        <p>{item.desc}</p>
                                    </li>
                                ))}
                            </ol>
                        </section>

                        <section className="gallery-rules-section">
                            <h3 className="gallery-rules-heading">Microgames</h3>
                            <ul className="gallery-rules-list">
                                <li><strong>QTE (Stop the Needle):</strong> A projectile bounces back and forth — press when it's inside the target zone. Score = how centered your hit was.</li>
                                <li><strong>Mash:</strong> Press as fast as you can to fill the power meter before time runs out. Higher score = stronger effect.</li>
                                <li><strong>Pattern Match:</strong> Watch a sequence of symbols flash, then reproduce it. Correct steps score higher.</li>
                                <li><strong>Rhythm:</strong> Hit the notes as they pass through the hit zone. Accuracy determines the outcome.</li>
                                <li><strong>Quiz:</strong> Answer a trivia or math question correctly. Binary result — right or wrong.</li>
                            </ul>
                        </section>
                    </div>
                )}
            </div>
        </div>
    );
};

export default GalleryModal;

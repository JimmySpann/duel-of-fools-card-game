import { useState, useMemo } from 'react';
import cards from '../card-game/database/cards';
import Card from '../card-game/components/card-layouts/full-card/full-card';

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

const SAVED_DECKS_KEY = 'cg_saved_decks';

const loadSavedDecks = () => {
    try {
        return JSON.parse(localStorage.getItem(SAVED_DECKS_KEY) || '{}');
    } catch {
        return {};
    }
};

const saveDeck = (name, deck) => {
    const existing = loadSavedDecks();
    existing[name] = deck;
    localStorage.setItem(SAVED_DECKS_KEY, JSON.stringify(existing));
};

/**
 * DeckBuilderModal
 * Props:
 *   onConfirm(deck: string[]) — called with array of card IDs
 *   onClose()
 *   initialDeck?: string[]
 *   loading?: boolean
 *   error?: string | null
 */
const DeckBuilderModal = ({ onConfirm, onClose, initialDeck, loading, error }) => {
    const [selected, setSelected] = useState(() => new Set(initialDeck || []));
    const [savedDecks, setSavedDecks] = useState(loadSavedDecks);
    const [loadValue, setLoadValue] = useState('');
    const [saveNameInput, setSaveNameInput] = useState('');
    const [showSaveInput, setShowSaveInput] = useState(false);
    const [previewCard, setPreviewCard] = useState(null);
    const [confirmDeleteDeck, setConfirmDeleteDeck] = useState(null);

    const toggle = (id) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleSave = () => {
        const name = saveNameInput.trim();
        if (!name) return;
        saveDeck(name, [...selected]);
        setSavedDecks(loadSavedDecks());
        setSaveNameInput('');
        setShowSaveInput(false);
    };

    const handleLoad = (name) => {
        if (!name || !savedDecks[name]) return;
        setSelected(new Set(savedDecks[name]));
        setLoadValue('');
    };

    const deleteSavedDeck = (name) => {
        const existing = loadSavedDecks();
        delete existing[name];
        localStorage.setItem(SAVED_DECKS_KEY, JSON.stringify(existing));
        setSavedDecks(loadSavedDecks());
        setConfirmDeleteDeck(null);
    };

    const deckNames = Object.keys(savedDecks);
    const canConfirm = selected.size >= 3 && !loading;
    const selectedCount = selected.size;

    return (
        <div className="db-overlay" onClick={onClose}>
            <div className="db-modal" onClick={(e) => e.stopPropagation()}>
                <div className="db-header">
                    <h2 className="db-title">Build Your Deck</h2>
                    <button className="db-close-btn" onClick={onClose}>✕</button>
                </div>

                <div className="db-toolbar">
                    <span className={`db-counter${selectedCount < 3 ? ' warn' : ''}`}>
                        {selectedCount} / 10 selected · min 3
                    </span>
                    <div className="db-toolbar-right">
                        {deckNames.length > 0 && (
                            <div className="db-saved-decks-list">
                                {deckNames.map((n) => (
                                    <div key={n} className="db-saved-deck-row">
                                        <span className="db-saved-deck-name" title={n}>{n}</span>
                                        <button className="db-load-btn" onClick={() => handleLoad(n)}>Load</button>
                                        <button className="db-delete-deck-btn" onClick={() => setConfirmDeleteDeck(n)} title="Delete deck">🗑</button>
                                    </div>
                                ))}
                            </div>
                        )}
                        {showSaveInput ? (
                            <div className="db-save-row">
                                <input
                                    className="db-save-input"
                                    type="text"
                                    placeholder="Deck name…"
                                    value={saveNameInput}
                                    onChange={(e) => setSaveNameInput(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') { setShowSaveInput(false); setSaveNameInput(''); } }}
                                    autoFocus
                                    maxLength={30}
                                />
                                <button className="db-save-confirm-btn" onClick={handleSave} disabled={!saveNameInput.trim()}>Save</button>
                                <button className="db-save-cancel-btn" onClick={() => { setShowSaveInput(false); setSaveNameInput(''); }}>✕</button>
                            </div>
                        ) : (
                            <button className="db-save-btn" onClick={() => setShowSaveInput(true)} disabled={selected.size === 0}>
                                Save Deck
                            </button>
                        )}
                    </div>
                </div>

                <div className="db-card-grid">
                    {cards.map((card) => {
                        const isSelected = selected.has(card.id);
                        const primaryElement = Object.entries(card.elements || {})[0];
                        const elStyle = primaryElement ? (ELEMENT_COLORS[primaryElement[0]] || ELEMENT_COLORS.normal) : ELEMENT_COLORS.normal;
                        return (
                            <div key={card.id} className={`db-card-wrap${isSelected ? ' selected' : ''}`}>
                                <button
                                    className={`db-card${isSelected ? ' selected' : ''}`}
                                    onClick={() => toggle(card.id)}
                                    style={isSelected ? { borderColor: elStyle.border, background: elStyle.bg } : undefined}
                                >
                                    {isSelected && <span className="db-card-check">✓</span>}
                                    <img src={card.image} alt={card.name} className="db-card-img" />
                                    <div className="db-card-name">{card.name}</div>
                                    <div className="db-card-elements">
                                        {Object.entries(card.elements || {}).map(([el, val]) => {
                                            const s = ELEMENT_COLORS[el] || ELEMENT_COLORS.normal;
                                            return (
                                                <span key={el} className="db-element-chip" style={{ background: s.bg, color: s.color, borderColor: s.border }}>
                                                    {el}
                                                </span>
                                            );
                                        })}
                                    </div>
                                    <div className="db-card-stats">
                                        <span>HP {card.health}</span>
                                        <span>DEF {card.defense}</span>
                                        <span>EVA {card.evasion}</span>
                                    </div>
                                </button>
                                <button
                                    className="db-card-view-btn"
                                    onClick={(e) => { e.stopPropagation(); setPreviewCard(card); }}
                                    title="View full card"
                                >
                                    Full View
                                </button>
                            </div>
                        );
                    })}
                </div>

                {error && <p className="db-error">{error}</p>}

                <div className="db-footer">
                    <button className="db-cancel-btn" onClick={onClose}>Cancel</button>
                    <button
                        className="db-confirm-btn"
                        onClick={() => onConfirm([...selected])}
                        disabled={!canConfirm}
                        title={selectedCount < 3 ? 'Select at least 3 cards' : ''}
                    >
                        {loading ? 'Saving…' : `Confirm Deck (${selectedCount})`}
                    </button>
                </div>
            </div>

            {confirmDeleteDeck !== null && (
                <div className="fc-preview-overlay" onClick={() => setConfirmDeleteDeck(null)}>
                    <div className="db-delete-confirm-modal" onClick={(e) => e.stopPropagation()}>
                        <p className="db-delete-confirm-msg">Delete deck <strong>"{confirmDeleteDeck}"</strong>?</p>
                        <div className="db-delete-confirm-btns">
                            <button className="db-delete-confirm-yes" onClick={() => deleteSavedDeck(confirmDeleteDeck)}>Delete</button>
                            <button className="fc-preview-close-btn" onClick={() => setConfirmDeleteDeck(null)}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {previewCard && (() => {
                const isInDeck = selected.has(previewCard.id);
                return (
                    <div className="fc-preview-overlay" onClick={() => setPreviewCard(null)}>
                        <div className="fc-preview-content" onClick={(e) => e.stopPropagation()}>
                            <Card card={previewCard} isFlipped={false} onActionClick={null} />
                            <div className="fc-preview-deck-actions">
                                <button
                                    className={`fc-preview-deck-btn${isInDeck ? ' remove' : ' add'}`}
                                    onClick={() => { toggle(previewCard.id); }}
                                    disabled={!isInDeck && selected.size >= 10}
                                    title={!isInDeck && selected.size >= 10 ? 'Deck full (max 10)' : ''}
                                >
                                    {isInDeck ? '− Remove from Deck' : '+ Add to Deck'}
                                </button>
                                <button className="fc-preview-close-btn" onClick={() => setPreviewCard(null)}>Close</button>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
};

export default DeckBuilderModal;

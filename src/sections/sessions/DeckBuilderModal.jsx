import { useState, useMemo, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { authHeader } from '../../utils/api';
import Card from '../card-game/components/card-layouts/full-card/full-card';
import { FEATURES } from '../../config/features';

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

const CATEGORY_ORDER = ['official v1', 'dripwarts', 'unknown'];
const CATEGORY_LABELS = { 'official v1': 'Official V1', 'dripwarts': 'Dripwarts', 'unknown': 'Unknown' };
const CATEGORY_STYLES = {
    'official v1': { bg: '#1a2400', color: '#a3e635', border: '#4a7a10' },
    'dripwarts': { bg: '#1e0a33', color: '#c084fc', border: '#7c3aed' },
    'unknown': { bg: '#1e2030', color: '#aab0cc', border: '#3a4060' },
};

const PRESET_OPTIONS = [
    { value: '__official', label: 'Official Default' },
    { value: '__dripwarts', label: 'Dripwarts' },
];

/**
 * DeckBuilderModal
 * Props:
 *   onConfirm(deck: string[]) — called with array of card IDs
 *   onClose()
 *   initialDeck?: string[]
 *   loading?: boolean
 *   error?: string | null
 *   isSessionDeckBuilder?: boolean
 */
const DeckBuilderModal = ({ onConfirm, onClose, initialDeck, initialPreset = null, loading, error, verifiedCardsOnly = false, isSessionDeckBuilder = false }) => {
    const token = useSelector((s) => s.auth.token);
    const censorAdultCards = useSelector((s) => s.profile.censorAdultCards !== false);
    const [selected, setSelected] = useState(() => new Set(initialDeck || []));
    const [savedDecks, setSavedDecks] = useState([]); // [{ name, cardIds }]
    const [deckSelectValue, setDeckSelectValue] = useState('');
    const [saveNameInput, setSaveNameInput] = useState('');
    const [showSaveInput, setShowSaveInput] = useState(false);
    const [previewCard, setPreviewCard] = useState(null);
    const [confirmDeleteDeck, setConfirmDeleteDeck] = useState(null);
    const [deckSaving, setDeckSaving] = useState(false);
    const [cards, setCards] = useState([]);
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('all');

    // If the lobby mandates verified cards only, we can never show unverified
    useEffect(() => {
        if (verifiedCardsOnly && categoryFilter === 'unverified') {
            setCategoryFilter('all');
        }
    }, [verifiedCardsOnly, categoryFilter]);

    useEffect(() => {
        let mounted = true;
        const loadCards = async () => {
            try {
                const res = await fetch('/api/cards', {
                    headers: authHeader(token, false),
                });
                const data = await res.json();
                if (!res.ok) return;
                if (mounted && Array.isArray(data.cards) && data.cards.length > 0) {
                    setCards(data.cards);
                }
            } catch {
                // Keep static fallback cards.
            }
        };
        if (token) loadCards();
        return () => { mounted = false; };
    }, [token]);

    // Load saved decks from DB
    useEffect(() => {
        let mounted = true;
        const loadDecks = async () => {
            try {
                const res = await fetch('/api/decks', { headers: authHeader(token, false) });
                const data = await res.json();
                if (res.ok && mounted && Array.isArray(data.decks)) setSavedDecks(data.decks);
            } catch { /* ignore */ }
        };
        if (token) loadDecks();
        return () => { mounted = false; };
    }, [token]);

    const toggle = (id) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    // Preset decks derived from loaded cards
    const officialDefaultDeck = useMemo(() => cards.filter(c => c.category === 'official v1').map(c => c.id), [cards]);
    const dripwartsDeck = useMemo(() => cards.filter(c => c.category === 'dripwarts').map(c => c.id), [cards]);

    // Auto-load the preset passed from the lobby once cards are ready
    useEffect(() => {
        if (!initialPreset || cards.length === 0) return;
        if (initialPreset === '__official') {
            setSelected(new Set(officialDefaultDeck));
            setDeckSelectValue('__official');
        } else if (initialPreset === '__dripwarts') {
            setSelected(new Set(dripwartsDeck));
            setDeckSelectValue('__dripwarts');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialPreset, cards.length]);

    const handleDeckSelect = (value) => {
        setDeckSelectValue(value);
        if (value === '__official') { setSelected(new Set(officialDefaultDeck)); return; }
        if (value === '__dripwarts') { setSelected(new Set(dripwartsDeck)); return; }
        const deck = savedDecks.find((d) => d.name === value);
        if (deck) setSelected(new Set(deck.cardIds));
    };

    const handleSave = async () => {
        const name = saveNameInput.trim();
        if (!name || selected.size === 0) return;
        setDeckSaving(true);
        try {
            const res = await fetch('/api/decks', {
                method: 'POST',
                headers: authHeader(token),
                body: JSON.stringify({ name, cardIds: [...selected] }),
            });
            const data = await res.json();
            if (res.ok && Array.isArray(data.decks)) {
                setSavedDecks(data.decks);
                setDeckSelectValue(name);
            }
        } catch { /* ignore */ }
        setDeckSaving(false);
        setSaveNameInput('');
        setShowSaveInput(false);
    };

    const handleDeleteDeck = async (name) => {
        try {
            const res = await fetch(`/api/decks/${encodeURIComponent(name)}`, {
                method: 'DELETE',
                headers: authHeader(token, false),
            });
            const data = await res.json();
            if (res.ok && Array.isArray(data.decks)) {
                setSavedDecks(data.decks);
                if (deckSelectValue === name) setDeckSelectValue('');
            }
        } catch { /* ignore */ }
        setConfirmDeleteDeck(null);
    };

    const canConfirm = selected.size >= 3 && !loading;
    const selectedCount = selected.size;
    const allCardIds = useMemo(() => cards.map((card) => card.id), [cards]);

    const filteredCards = useMemo(() => {
        return cards.filter((c) => {
            const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase());
            if (categoryFilter === 'unverified' && !verifiedCardsOnly) {
                return matchSearch && !c.official && !c.verified;
            }
            const isVerified = !!c.official || !!c.verified;
            const matchCategory = categoryFilter === 'all' || (c.category || 'unknown') === categoryFilter;
            return matchSearch && isVerified && matchCategory;
        });
    }, [cards, search, categoryFilter, verifiedCardsOnly]);

    const selectedDeckIsCustom = !!savedDecks.find((d) => d.name === deckSelectValue);

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
                        <div className="db-deck-select-row">
                            <select
                                className="db-deck-select"
                                value={deckSelectValue}
                                onChange={(e) => handleDeckSelect(e.target.value)}
                            >
                                <option value="">— Load a deck —</option>
                                <optgroup label="Presets">
                                    {PRESET_OPTIONS.map((o) => (
                                        <option key={o.value} value={o.value}>{o.label}</option>
                                    ))}
                                </optgroup>
                                {savedDecks.length > 0 && (
                                    <optgroup label="My Decks">
                                        {savedDecks.map((d) => (
                                            <option key={d.name} value={d.name}>{d.name}</option>
                                        ))}
                                    </optgroup>
                                )}
                            </select>
                            {selectedDeckIsCustom && (
                                <button
                                    className="db-delete-deck-btn"
                                    onClick={() => setConfirmDeleteDeck(deckSelectValue)}
                                    title="Delete this deck"
                                >🗑</button>
                            )}
                        </div>

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
                                    maxLength={40}
                                />
                                <button className="db-save-confirm-btn" onClick={handleSave} disabled={!saveNameInput.trim() || deckSaving}>
                                    {deckSaving ? '…' : 'Save'}
                                </button>
                                <button className="db-save-cancel-btn" onClick={() => { setShowSaveInput(false); setSaveNameInput(''); }}>✕</button>
                            </div>
                        ) : (
                            <button className="db-save-btn" onClick={() => setShowSaveInput(true)} disabled={selected.size === 0}>
                                Save Deck
                            </button>
                        )}
                        <button
                            className="db-clear-all-btn"
                            onClick={() => setSelected(new Set())}
                            disabled={selectedCount === 0}
                        >
                            Clear
                        </button>
                    </div>
                </div>

                <div className="db-filter-row">
                    <input
                        className="gallery-search"
                        type="text"
                        placeholder="Search cards…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    <div className="gallery-element-filters">
                        {['all', ...CATEGORY_ORDER].map((cat) => {
                            const style = cat === 'all' ? null : CATEGORY_STYLES[cat];
                            const isActive = categoryFilter === cat;
                            return (
                                <button
                                    key={cat}
                                    className={`gallery-element-filter-btn${isActive ? ' active' : ''}`}
                                    style={isActive && style ? { background: style.bg, color: style.color, borderColor: style.border } : undefined}
                                    onClick={() => setCategoryFilter(cat)}
                                >
                                    {cat === 'all' ? 'All' : CATEGORY_LABELS[cat]}
                                </button>
                            );
                        })}
                        {!verifiedCardsOnly && (
                            <button
                                className={`gallery-element-filter-btn${categoryFilter === 'unverified' ? ' active' : ''}`}
                                onClick={() => setCategoryFilter((v) => v === 'unverified' ? 'all' : 'unverified')}
                                title="Show only unverified cards"
                            >
                                ⚠ Unverified
                            </button>
                        )}
                    </div>
                </div>

                <div className="db-card-grid">
                    {filteredCards.map((card) => {
                        const isSelected = selected.has(card.id);
                        const isCensored = !!card.adultOnly && censorAdultCards;
                        return (
                            <div key={card.id} className={`db-card-wrap${isSelected ? ' selected' : ''}`}>
                                <button
                                    className={`db-card${isSelected ? ' selected' : ''}`}
                                    onClick={() => toggle(card.id)}
                                >
                                    {isSelected && <span className="db-card-check">✓</span>}
                                    {!card.official && !card.verified && <span className="db-unverified-tag">⚠</span>}
                                    <img src={isCensored ? (cards[0]?.image || '') : card.image} alt={card.name} className="db-card-img" />
                                    <div className="db-card-name">{isCensored ? 'Adults-only Card' : card.name}</div>
                                    {FEATURES.showElements && (
                                        <div className="db-card-elements">
                                            {Object.entries(card.elements || {}).map(([el]) => {
                                                const s = ELEMENT_COLORS[el] || ELEMENT_COLORS.normal;
                                                return (
                                                    <span key={el} className="db-element-chip" style={{ background: s.bg, color: s.color, borderColor: s.border }}>
                                                        {el}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    )}
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
                    <button className="db-cancel-btn" onClick={onClose}>
                        {isSessionDeckBuilder ? 'Close' : 'Cancel'}
                    </button>
                    {!isSessionDeckBuilder && (
                        <button
                            className="db-confirm-btn"
                            onClick={() => onConfirm([...selected])}
                            disabled={!canConfirm}
                            title={selectedCount < 3 ? 'Select at least 3 cards' : ''}
                        >
                            {loading ? 'Saving…' : `Confirm Deck (${selectedCount})`}
                        </button>
                    )}
                </div>
            </div>

            {confirmDeleteDeck !== null && (
                <div className="fc-preview-overlay" onClick={() => setConfirmDeleteDeck(null)}>
                    <div className="db-delete-confirm-modal" onClick={(e) => e.stopPropagation()}>
                        <p className="db-delete-confirm-msg">Delete deck <strong>"{confirmDeleteDeck}"</strong>?</p>
                        <div className="db-delete-confirm-btns">
                            <button className="db-delete-confirm-yes" onClick={() => handleDeleteDeck(confirmDeleteDeck)}>Delete</button>
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

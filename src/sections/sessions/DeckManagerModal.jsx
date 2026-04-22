import { useState, useEffect, useCallback, useRef } from 'react';
import { authHeader } from '../../utils/api';

const PRESET_DECKS = [
    { value: '__official', label: 'Official Default', description: 'The standard set of official cards' },
    { value: '__dripwarts', label: 'Dripwarts', description: 'The Dripwarts themed card set' },
];

/**
 * DeckManagerModal
 * Props:
 *   open          {boolean}
 *   onClose       {() => void}
 *   token         {string}
 *   onLoadDeck    {(cardIds: string[], deckName: string) => void}
 *   onLoadPreset  {(presetValue: string) => void}
 */
const DeckManagerModal = ({ open, onClose, token, onLoadDeck, onLoadPreset }) => {
    const [tab, setTab] = useState('mine');           // 'mine' | 'public'
    const [myDecks, setMyDecks] = useState([]);
    const [publicDecks, setPublicDecks] = useState([]);
    const [mySearch, setMySearch] = useState('');
    const [publicSearch, setPublicSearch] = useState('');
    const [editingName, setEditingName] = useState(null);  // deck name being renamed
    const [editNameValue, setEditNameValue] = useState('');
    const [busy, setBusy] = useState(null);                // deck name currently mutating
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [feedback, setFeedback] = useState(null);        // { msg, type }
    const [publicLoading, setPublicLoading] = useState(false);
    const feedbackTimer = useRef(null);
    const publicSearchTimer = useRef(null);

    const showFeedback = useCallback((msg, type = 'success') => {
        setFeedback({ msg, type });
        clearTimeout(feedbackTimer.current);
        feedbackTimer.current = setTimeout(() => setFeedback(null), 3500);
    }, []);

    // Load my decks whenever modal opens
    useEffect(() => {
        if (!open || !token) return;
        let mounted = true;
        fetch('/api/decks', { headers: authHeader(token, false) })
            .then((r) => r.json())
            .then((d) => { if (mounted && Array.isArray(d.decks)) setMyDecks(d.decks); })
            .catch(() => { });
        return () => { mounted = false; };
    }, [open, token]);

    // Load / refresh public decks (debounced by search)
    useEffect(() => {
        if (!open || tab !== 'public') return;
        clearTimeout(publicSearchTimer.current);
        publicSearchTimer.current = setTimeout(async () => {
            setPublicLoading(true);
            try {
                const qs = publicSearch.trim() ? `?search=${encodeURIComponent(publicSearch.trim())}` : '';
                const res = await fetch(`/api/decks/public${qs}`, { headers: authHeader(token, false) });
                const data = await res.json();
                if (res.ok && Array.isArray(data.decks)) setPublicDecks(data.decks);
            } catch { /* ignore */ } finally {
                setPublicLoading(false);
            }
        }, 350);
        return () => clearTimeout(publicSearchTimer.current);
    }, [open, tab, publicSearch, token]);

    if (!open) return null;

    // ── Helpers ───────────────────────────────────────────────────────────────

    const refreshMyDecks = async () => {
        try {
            const res = await fetch('/api/decks', { headers: authHeader(token, false) });
            const data = await res.json();
            if (res.ok && Array.isArray(data.decks)) setMyDecks(data.decks);
        } catch { /* ignore */ }
    };

    const handleLoad = (deck) => {
        onLoadDeck(deck.cardIds, deck.name);
        onClose();
    };

    const handleCopy = async (deck) => {
        setBusy(deck.name);
        try {
            // Build a unique "(Copy)" name
            let base = `${deck.name} (Copy)`.slice(0, 40);
            let candidate = base;
            let n = 2;
            while (myDecks.some((d) => d.name === candidate)) {
                candidate = `${base.slice(0, 36)} ${n}`.slice(0, 40);
                n += 1;
            }
            const res = await fetch('/api/decks', {
                method: 'POST',
                headers: authHeader(token),
                body: JSON.stringify({ name: candidate, cardIds: deck.cardIds }),
            });
            const data = await res.json();
            if (res.ok && Array.isArray(data.decks)) {
                setMyDecks(data.decks);
                showFeedback(`Copied as "${candidate}"`);
            } else {
                showFeedback(data.error || 'Copy failed', 'error');
            }
        } catch { showFeedback('Copy failed', 'error'); } finally {
            setBusy(null);
        }
    };

    const handleTogglePublic = async (deck) => {
        setBusy(deck.name);
        try {
            const res = await fetch(`/api/decks/${encodeURIComponent(deck.name)}`, {
                method: 'PATCH',
                headers: authHeader(token),
                body: JSON.stringify({ isPublic: !deck.isPublic }),
            });
            const data = await res.json();
            if (res.ok && Array.isArray(data.decks)) {
                setMyDecks(data.decks);
                showFeedback(deck.isPublic ? 'Deck set to private' : 'Deck shared publicly');
            } else {
                showFeedback(data.error || 'Failed to update', 'error');
            }
        } catch { showFeedback('Failed to update', 'error'); } finally {
            setBusy(null);
        }
    };

    const handleRenameStart = (deck) => {
        setEditingName(deck.name);
        setEditNameValue(deck.name);
    };

    const handleRenameSave = async (originalName) => {
        const trimmed = editNameValue.trim();
        if (!trimmed || trimmed === originalName) { setEditingName(null); return; }
        setBusy(originalName);
        try {
            const res = await fetch(`/api/decks/${encodeURIComponent(originalName)}`, {
                method: 'PATCH',
                headers: authHeader(token),
                body: JSON.stringify({ newName: trimmed }),
            });
            const data = await res.json();
            if (res.ok && Array.isArray(data.decks)) {
                setMyDecks(data.decks);
                setEditingName(null);
                showFeedback(`Renamed to "${trimmed}"`);
            } else {
                showFeedback(data.error || 'Rename failed', 'error');
            }
        } catch { showFeedback('Rename failed', 'error'); } finally {
            setBusy(null);
        }
    };

    const handleDelete = async (name) => {
        setBusy(name);
        setConfirmDelete(null);
        try {
            const res = await fetch(`/api/decks/${encodeURIComponent(name)}`, {
                method: 'DELETE',
                headers: authHeader(token, false),
            });
            const data = await res.json();
            if (res.ok && Array.isArray(data.decks)) {
                setMyDecks(data.decks);
                showFeedback(`"${name}" deleted`);
            } else {
                showFeedback(data.error || 'Delete failed', 'error');
            }
        } catch { showFeedback('Delete failed', 'error'); } finally {
            setBusy(null);
        }
    };

    const handleFork = async (deck) => {
        setBusy(`public:${deck.name}`);
        try {
            const res = await fetch('/api/decks/fork', {
                method: 'POST',
                headers: authHeader(token),
                body: JSON.stringify({ ownerUsername: deck.ownerUsername, deckName: deck.name }),
            });
            const data = await res.json();
            if (res.ok && Array.isArray(data.decks)) {
                setMyDecks(data.decks);
                showFeedback(`Forked as "${data.forkedName}"`);
                setTab('mine');
            } else {
                showFeedback(data.error || 'Fork failed', 'error');
            }
        } catch { showFeedback('Fork failed', 'error'); } finally {
            setBusy(null);
        }
    };

    // ── Filtered lists ────────────────────────────────────────────────────────

    const filteredMine = mySearch.trim()
        ? myDecks.filter((d) => d.name.toLowerCase().includes(mySearch.trim().toLowerCase()))
        : myDecks;

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="dm-overlay" onClick={onClose}>
            <div className="dm-modal" onClick={(e) => e.stopPropagation()}>

                {/* Header */}
                <div className="dm-header">
                    <h2 className="dm-title">Deck Manager</h2>
                    <button className="dm-close-btn" onClick={onClose}>✕</button>
                </div>

                {/* Tabs */}
                <div className="dm-tabs">
                    <button
                        className={`dm-tab${tab === 'mine' ? ' active' : ''}`}
                        onClick={() => setTab('mine')}
                    >
                        My Decks ({myDecks.length})
                    </button>
                    <button
                        className={`dm-tab${tab === 'public' ? ' active' : ''}`}
                        onClick={() => setTab('public')}
                    >
                        Browse Public
                    </button>
                </div>

                {/* Feedback */}
                {feedback && (
                    <div className={`dm-feedback dm-feedback--${feedback.type}`}>{feedback.msg}</div>
                )}

                {/* ── My Decks ─────────────────────────────────────────── */}
                {tab === 'mine' && (
                    <div className="dm-body">
                        <input
                            className="dm-search"
                            type="text"
                            placeholder="Search my decks…"
                            value={mySearch}
                            onChange={(e) => setMySearch(e.target.value)}
                        />
                        {filteredMine.length === 0 && (
                            <p className="dm-empty">
                                {myDecks.length === 0
                                    ? 'No saved decks yet. Build one in the deck builder!'
                                    : 'No decks match your search.'}
                            </p>
                        )}
                        <div className="dm-deck-list">
                            {filteredMine.map((deck) => {
                                const isEditing = editingName === deck.name;
                                const isBusy = busy === deck.name;
                                return (
                                    <div
                                        key={deck.name}
                                        className={`dm-deck-row${isEditing ? ' dm-deck-row--editing' : ''}`}
                                    >
                                        <div className="dm-deck-info">
                                            {isEditing ? (
                                                <input
                                                    className="dm-rename-input"
                                                    value={editNameValue}
                                                    maxLength={40}
                                                    autoFocus
                                                    onChange={(e) => setEditNameValue(e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') handleRenameSave(deck.name);
                                                        if (e.key === 'Escape') setEditingName(null);
                                                    }}
                                                />
                                            ) : (
                                                <span className="dm-deck-name">{deck.name}</span>
                                            )}
                                            <span className="dm-deck-count">{(deck.cardIds || []).length} cards</span>
                                            {deck.isPublic && <span className="dm-public-badge">Public</span>}
                                        </div>

                                        <div className="dm-deck-actions">
                                            {isEditing ? (
                                                <>
                                                    <button
                                                        className="dm-action-btn dm-action-btn--save"
                                                        disabled={isBusy || !editNameValue.trim()}
                                                        onClick={() => handleRenameSave(deck.name)}
                                                    >
                                                        {isBusy ? '…' : 'Save'}
                                                    </button>
                                                    <button
                                                        className="dm-action-btn"
                                                        onClick={() => setEditingName(null)}
                                                    >
                                                        Cancel
                                                    </button>
                                                </>
                                            ) : (
                                                <>
                                                    <button
                                                        className="dm-action-btn dm-action-btn--primary"
                                                        disabled={isBusy}
                                                        onClick={() => handleLoad(deck)}
                                                        title="Load this deck into the builder"
                                                    >
                                                        Load
                                                    </button>
                                                    <button
                                                        className="dm-action-btn"
                                                        disabled={isBusy}
                                                        onClick={() => handleCopy(deck)}
                                                        title="Duplicate this deck"
                                                    >
                                                        {isBusy ? '…' : 'Copy'}
                                                    </button>
                                                    <button
                                                        className={`dm-action-btn${deck.isPublic ? ' dm-action-btn--shared' : ''}`}
                                                        disabled={isBusy}
                                                        onClick={() => handleTogglePublic(deck)}
                                                        title={deck.isPublic ? 'Make this deck private' : 'Share this deck publicly'}
                                                    >
                                                        {deck.isPublic ? 'Unshare' : 'Share'}
                                                    </button>
                                                    <button
                                                        className="dm-action-btn"
                                                        disabled={isBusy}
                                                        onClick={() => handleRenameStart(deck)}
                                                        title="Rename this deck"
                                                    >
                                                        Rename
                                                    </button>
                                                    <button
                                                        className="dm-action-btn dm-action-btn--danger"
                                                        disabled={isBusy}
                                                        onClick={() => setConfirmDelete(deck.name)}
                                                        title="Delete this deck"
                                                    >
                                                        Delete
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* ── Browse Public ─────────────────────────────────────── */}
                {tab === 'public' && (
                    <div className="dm-body">
                        <input
                            className="dm-search"
                            type="text"
                            placeholder="Search public decks…"
                            value={publicSearch}
                            onChange={(e) => setPublicSearch(e.target.value)}
                        />

                        {onLoadPreset && (
                            <>
                                <p className="dm-section-label">Presets</p>
                                <div className="dm-deck-list">
                                    {PRESET_DECKS.map((preset) => (
                                        <div key={preset.value} className="dm-deck-row">
                                            <div className="dm-deck-info">
                                                <span className="dm-deck-name">{preset.label}</span>
                                                <span className="dm-deck-count">{preset.description}</span>
                                            </div>
                                            <div className="dm-deck-actions">
                                                <button
                                                    className="dm-action-btn dm-action-btn--primary"
                                                    onClick={() => onLoadPreset(preset.value)}
                                                    title={`Load the ${preset.label} preset into the builder`}
                                                >
                                                    Load
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <p className="dm-section-label">Community Decks</p>
                            </>
                        )}

                        {publicLoading && <p className="dm-empty">Loading…</p>}
                        {!publicLoading && publicDecks.length === 0 && (
                            <p className="dm-empty">No public decks found. Be the first to share one!</p>
                        )}
                        <div className="dm-deck-list">
                            {publicDecks.map((deck) => {
                                const key = `${deck.ownerUsername}:${deck.name}`;
                                const isBusy = busy === `public:${deck.name}`;
                                return (
                                    <div key={key} className="dm-deck-row">
                                        <div className="dm-deck-info">
                                            <span className="dm-deck-name">{deck.name}</span>
                                            <span className="dm-deck-count">{(deck.cardIds || []).length} cards</span>
                                            <span className="dm-deck-owner">by {deck.ownerUsername}</span>
                                        </div>
                                        <div className="dm-deck-actions">
                                            <button
                                                className="dm-action-btn dm-action-btn--primary"
                                                disabled={isBusy}
                                                onClick={() => handleFork(deck)}
                                                title="Add a copy of this deck to My Decks"
                                            >
                                                {isBusy ? '…' : 'Fork'}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Confirm delete dialog */}
                {confirmDelete && (
                    <div className="dm-confirm-overlay" onClick={() => setConfirmDelete(null)}>
                        <div className="dm-confirm-box" onClick={(e) => e.stopPropagation()}>
                            <p className="dm-confirm-msg">
                                Delete <strong>"{confirmDelete}"</strong>? This cannot be undone.
                            </p>
                            <div className="dm-confirm-actions">
                                <button
                                    className="dm-action-btn dm-action-btn--danger"
                                    onClick={() => handleDelete(confirmDelete)}
                                >
                                    Delete
                                </button>
                                <button
                                    className="dm-action-btn"
                                    onClick={() => setConfirmDelete(null)}
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default DeckManagerModal;

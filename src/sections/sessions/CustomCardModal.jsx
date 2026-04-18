import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import defaultCards from '../card-game/database/cards';

const clampInt = (value, min, max) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, Math.round(n)));
};

const initialStats = {
    attack: 6,
    defense: 6,
    evasion: 6,
    agility: 6,
    health: 8,
};

const initialElements = {
    fire: 0,
    ice: 0,
    electric: 0,
    earth: 0,
    death: 0,
    water: 0,
    air: 0,
    normal: 0,
};

const computePoints = (stats) =>
    Number(stats.attack) + Number(stats.defense) + Number(stats.evasion) + Number(stats.agility) + Math.round(Number(stats.health) * 1.4);

const CustomCardModal = ({ onClose }) => {
    const token = useSelector((s) => s.auth.token);
    const username = useSelector((s) => s.auth.username);
    const censorAdultCards = useSelector((s) => s.profile.censorAdultCards !== false);

    const [cards, setCards] = useState([]);
    const [abilities, setAbilities] = useState([]);
    const [loading, setLoading] = useState(false);
    const [createLoading, setCreateLoading] = useState(false);
    const [error, setError] = useState('');
    const [query, setQuery] = useState('');
    const [editingCardId, setEditingCardId] = useState(null);
    const [versionsFor, setVersionsFor] = useState(null);
    const [versionItems, setVersionItems] = useState([]);
    const [versionLoading, setVersionLoading] = useState(false);

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [image, setImage] = useState(defaultCards[0]?.image || '');
    const [stats, setStats] = useState(initialStats);
    const [elements, setElements] = useState(initialElements);
    const [abilityNames, setAbilityNames] = useState([]);
    const [adultOnly, setAdultOnly] = useState(false);

    const maxPoints = 48;
    const usedPoints = computePoints(stats);

    const builtinImages = useMemo(
        () => [...new Set(defaultCards.map((c) => c.image).filter(Boolean))],
        []
    );

    const filteredCards = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return cards;
        return cards.filter((c) => c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q));
    }, [cards, query]);

    useEffect(() => {
        let mounted = true;
        const load = async () => {
            setLoading(true);
            setError('');
            try {
                const [cardsRes, abilitiesRes] = await Promise.all([
                    fetch('/api/cards', { headers: { Authorization: `Bearer ${token}` } }),
                    fetch('/api/cards/ability-options', { headers: { Authorization: `Bearer ${token}` } }),
                ]);

                const cardsJson = await cardsRes.json();
                const abilitiesJson = await abilitiesRes.json();

                if (!cardsRes.ok) throw new Error(cardsJson.error || 'Failed to load card library');
                if (!abilitiesRes.ok) throw new Error(abilitiesJson.error || 'Failed to load abilities');

                if (!mounted) return;
                setCards(cardsJson.cards || []);
                setAbilities(abilitiesJson.abilities || []);
            } catch (err) {
                if (mounted) setError(err.message || 'Failed to load custom card builder');
            } finally {
                if (mounted) setLoading(false);
            }
        };
        load();
        return () => { mounted = false; };
    }, [token]);

    const refreshCards = async () => {
        const res = await fetch('/api/cards', { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to refresh cards');
        setCards(data.cards || []);
    };

    const toggleAbility = (abilityName) => {
        setAbilityNames((prev) => {
            if (prev.includes(abilityName)) return prev.filter((x) => x !== abilityName);
            if (prev.length >= 3) return prev;
            return [...prev, abilityName];
        });
    };

    const updateElement = (key, value) => {
        setElements((prev) => ({ ...prev, [key]: clampInt(value, 0, 5) }));
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        setCreateLoading(true);
        setError('');
        try {
            const payload = {
                name,
                description,
                image,
                elements,
                attack: stats.attack,
                defense: stats.defense,
                evasion: stats.evasion,
                agility: stats.agility,
                health: stats.health,
                abilityNames,
                adultOnly,
            };
            const res = await fetch(editingCardId ? `/api/cards/${encodeURIComponent(editingCardId)}` : '/api/cards', {
                method: editingCardId ? 'PATCH' : 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `Failed to ${editingCardId ? 'update' : 'create'} card`);

            if (editingCardId) {
                setCards((prev) => prev.map((c) => (c.id === editingCardId ? data.card : c)));
            } else {
                setCards((prev) => [data.card, ...prev]);
            }
            setName('');
            setDescription('');
            setStats(initialStats);
            setElements(initialElements);
            setAbilityNames([]);
            setAdultOnly(false);
            setEditingCardId(null);
        } catch (err) {
            setError(err.message || 'Failed to save card');
        } finally {
            setCreateLoading(false);
        }
    };

    const startEditCard = (card) => {
        setEditingCardId(card.id);
        setName(card.name || '');
        setDescription(card.description || '');
        setImage(card.image || '');
        setStats({
            attack: Number(card.attack || 0),
            defense: Number(card.defense || 0),
            evasion: Number(card.evasion || 0),
            agility: Number(card.agility || 0),
            health: Number(card.health || 1),
        });
        setElements({ ...initialElements, ...(card.elements || {}) });
        setAbilityNames((card.actions || []).map((a) => a.name).slice(0, 3));
        setAdultOnly(!!card.adultOnly);
    };

    const cancelEdit = () => {
        setEditingCardId(null);
        setName('');
        setDescription('');
        setImage(defaultCards[0]?.image || '');
        setStats(initialStats);
        setElements(initialElements);
        setAbilityNames([]);
        setAdultOnly(false);
    };

    const handleDelete = async (cardId) => {
        const ok = window.confirm('Delete this custom card? This cannot be undone.');
        if (!ok) return;
        setError('');
        try {
            const res = await fetch(`/api/cards/${encodeURIComponent(cardId)}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to delete card');
            }
            setCards((prev) => prev.filter((c) => c.id !== cardId));
            if (editingCardId === cardId) cancelEdit();
        } catch (err) {
            setError(err.message || 'Failed to delete card');
        }
    };

    const handleFork = async (cardId) => {
        setError('');
        try {
            const res = await fetch(`/api/cards/${encodeURIComponent(cardId)}/fork`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to fork card');
            setCards((prev) => [data.card, ...prev]);
        } catch (err) {
            setError(err.message || 'Failed to fork card');
        }
    };

    const handleReport = async (cardId) => {
        const reason = window.prompt('Report reason (required):');
        if (!reason || !reason.trim()) return;
        setError('');
        try {
            const res = await fetch(`/api/cards/${encodeURIComponent(cardId)}/report`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ reason: reason.trim() }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to report card');
            await refreshCards();
        } catch (err) {
            setError(err.message || 'Failed to report card');
        }
    };

    const openVersions = async (card) => {
        setVersionLoading(true);
        setVersionsFor(card);
        setVersionItems([]);
        setError('');
        try {
            const res = await fetch(`/api/cards/${encodeURIComponent(card.id)}/versions`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to load versions');
            setVersionItems(data.versions || []);
        } catch (err) {
            setError(err.message || 'Failed to load versions');
        } finally {
            setVersionLoading(false);
        }
    };

    return (
        <div className="custom-card-overlay" onClick={onClose}>
            <div className="custom-card-modal" onClick={(e) => e.stopPropagation()}>
                <div className="custom-card-header">
                    <h2 className="custom-card-title">Custom Card Builder</h2>
                    <button className="custom-card-close" onClick={onClose}>✕</button>
                </div>

                <div className="custom-card-body">
                    <form className="custom-card-form" onSubmit={handleCreate}>
                        <label className="custom-card-label">
                            Name
                            <input className="custom-card-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />
                        </label>

                        <label className="custom-card-label">
                            Description
                            <textarea className="custom-card-textarea" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={3} />
                        </label>

                        <label className="custom-card-label">
                            Image URL
                            <input className="custom-card-input" value={image} onChange={(e) => setImage(e.target.value)} placeholder="https://..." required />
                        </label>

                        <label className="custom-card-label">
                            Built-in Art
                            <select className="custom-card-input" value={image} onChange={(e) => setImage(e.target.value)}>
                                {builtinImages.map((img, i) => (
                                    <option key={i} value={img}>{`Built-in #${i + 1}`}</option>
                                ))}
                            </select>
                        </label>

                        <div className="custom-card-stats-grid">
                            {Object.keys(initialStats).map((key) => (
                                <label key={key} className="custom-card-label">
                                    {key.toUpperCase()}
                                    <input
                                        className="custom-card-input"
                                        type="number"
                                        min={key === 'health' ? 1 : 0}
                                        max={key === 'health' ? 30 : 20}
                                        value={stats[key]}
                                        onChange={(e) => setStats((prev) => ({
                                            ...prev,
                                            [key]: clampInt(e.target.value, key === 'health' ? 1 : 0, key === 'health' ? 30 : 20),
                                        }))}
                                    />
                                </label>
                            ))}
                        </div>

                        <div className={`custom-card-points${usedPoints > maxPoints ? ' over' : ''}`}>
                            Budget: {usedPoints} / {maxPoints}
                        </div>

                        <div className="custom-card-elements-grid">
                            {Object.keys(initialElements).map((el) => (
                                <label key={el} className="custom-card-label">
                                    {el}
                                    <input
                                        className="custom-card-input"
                                        type="number"
                                        min={0}
                                        max={5}
                                        value={elements[el]}
                                        onChange={(e) => updateElement(el, e.target.value)}
                                    />
                                </label>
                            ))}
                        </div>

                        <div className="custom-card-abilities">
                            <div className="custom-card-subtitle">Abilities (pick up to 3)</div>
                            <div className="custom-card-ability-list">
                                {abilities.map((a) => (
                                    <button
                                        key={a.name}
                                        type="button"
                                        className={`custom-card-ability${abilityNames.includes(a.name) ? ' selected' : ''}`}
                                        onClick={() => toggleAbility(a.name)}
                                        title={a.description}
                                    >
                                        <span>{a.name}</span>
                                        <small>{a.actionInfo}</small>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <label className="custom-card-toggle-row">
                            <input type="checkbox" checked={adultOnly} onChange={(e) => setAdultOnly(e.target.checked)} />
                            Adults-only card
                        </label>

                        {error && <p className="custom-card-error">{error}</p>}

                        <button
                            className="custom-card-create-btn"
                            type="submit"
                            disabled={createLoading || usedPoints > maxPoints || abilityNames.length < 1}
                        >
                            {createLoading ? 'Saving…' : editingCardId ? 'Update Card' : 'Create Card'}
                        </button>
                        {editingCardId && (
                            <button className="custom-card-cancel-edit-btn" type="button" onClick={cancelEdit}>
                                Cancel Edit
                            </button>
                        )}
                    </form>

                    <div className="custom-card-library">
                        <div className="custom-card-library-head">
                            <h3>Library</h3>
                            <input
                                className="custom-card-input"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Search by name or id"
                            />
                        </div>
                        {loading ? (
                            <p className="custom-card-empty">Loading cards…</p>
                        ) : filteredCards.length === 0 ? (
                            <p className="custom-card-empty">No cards found.</p>
                        ) : (
                            <div className="custom-card-list">
                                {filteredCards.map((card) => (
                                    <div key={card.id} className="custom-card-row">
                                        <img src={card.adultOnly && censorAdultCards ? defaultCards[0]?.image : card.image} alt={card.name} className="custom-card-thumb" />
                                        <div className="custom-card-row-info">
                                            <div className="custom-card-row-name">{card.adultOnly && censorAdultCards ? 'Adults-only Card' : card.name}</div>
                                            <div className="custom-card-row-meta">
                                                {card.official ? 'Official' : `By ${card.createdBy || 'Unknown'}`}
                                                {card.adultOnly ? ' · Adults-only' : ''}
                                                {card.createdBy === username ? ' · Yours' : ''}
                                                {card.reportCount > 0 ? ` · Reports: ${card.reportCount}` : ''}
                                            </div>
                                        </div>
                                        <div className="custom-card-row-actions">
                                            <button className="custom-card-row-btn" onClick={() => openVersions(card)}>Versions</button>
                                            {!card.official && card.createdBy === username && (
                                                <>
                                                    <button className="custom-card-row-btn" onClick={() => startEditCard(card)}>Edit</button>
                                                    <button className="custom-card-row-btn danger" onClick={() => handleDelete(card.id)}>Delete</button>
                                                </>
                                            )}
                                            {card.createdBy !== username && (
                                                <button className="custom-card-row-btn" onClick={() => handleReport(card.id)}>Report</button>
                                            )}
                                            <button className="custom-card-row-btn" onClick={() => handleFork(card.id)}>Fork</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {versionsFor && (
                    <div className="custom-card-versions-overlay" onClick={() => setVersionsFor(null)}>
                        <div className="custom-card-versions-modal" onClick={(e) => e.stopPropagation()}>
                            <div className="custom-card-versions-head">
                                <h3>Versions: {versionsFor.name}</h3>
                                <button className="custom-card-close" onClick={() => setVersionsFor(null)}>✕</button>
                            </div>
                            {versionLoading ? (
                                <p className="custom-card-empty">Loading versions…</p>
                            ) : versionItems.length === 0 ? (
                                <p className="custom-card-empty">No version history yet.</p>
                            ) : (
                                <div className="custom-card-version-list">
                                    {versionItems.map((v) => (
                                        <div key={`${v.index}-${v.editedAt}`} className="custom-card-version-row">
                                            <div className="custom-card-version-time">{new Date(v.editedAt).toLocaleString()}</div>
                                            <div className="custom-card-version-meta">By {v.editedBy}</div>
                                            <div className="custom-card-version-stats">
                                                ATK {v.snapshot?.attack} · DEF {v.snapshot?.defense} · EVA {v.snapshot?.evasion} · AGI {v.snapshot?.agility} · HP {v.snapshot?.health}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CustomCardModal;

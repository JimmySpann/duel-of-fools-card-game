import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { dismissRecap } from '../../database/cardGameSlice';
import './turn-recap.css';

const EVENT_CONFIG = {
    hit: { icon: '⚔️', label: 'Attacked', className: 'recap-hit' },
    defeat: { icon: '💀', label: 'Defeated', className: 'recap-defeat' },
    miss: { icon: '💨', label: 'Missed', className: 'recap-miss' },
    blocked: { icon: '🛡️', label: 'Blocked', className: 'recap-blocked' },
    directHit: { icon: '🎯', label: 'Direct Attack', className: 'recap-direct' },
    dot: { icon: '☠️', label: 'Status Damage', className: 'recap-dot' },
    dotDefeat: { icon: '💀', label: 'Defeated by Status', className: 'recap-defeat' },
    statusApplied: { icon: '🌀', label: 'Status Applied', className: 'recap-status-applied' },
    heal: { icon: '💚', label: 'Healed', className: 'recap-heal' },
};

const DOT_LABEL = {
    burned: '🔥 Burn',
    poisoned: '🍃 Poison',
    bleeding: '🩸 Bleed',
};

const HPBar = ({ current, max }) => {
    if (current == null || max == null) return null;
    const pct = Math.max(0, Math.min(100, (current / max) * 100));
    const color = pct > 50 ? '#2ecc71' : pct > 25 ? '#f39c12' : '#e74c3c';
    return (
        <div className="recap-hp-bar-track">
            <div className="recap-hp-bar-fill" style={{ width: `${pct}%`, background: color }} />
            <span className="recap-hp-label">{+current.toFixed(1)}/{+max.toFixed(1)} HP</span>
        </div>
    );
};

const RecapEvent = ({ event, index, playerNames, currentPlayerId }) => {
    const cfg = EVENT_CONFIG[event.type] ?? { icon: '❓', label: event.type, className: '' };
    const targetName = playerNames?.[event.targetPlayerId] ?? 'Player';
    const battlerLabel = (playerId, cardName) => `${playerNames?.[playerId] ?? 'Unknown'}'s ${cardName ?? 'Battler'}`;
    const targetBattler = battlerLabel(event.targetPlayerId, event.cardName);
    const attackerBattler = event.attackerPlayerId
        ? battlerLabel(event.attackerPlayerId, event.attackerName)
        : event.attackerName;

    const buildMessage = () => {
        switch (event.type) {
            case 'hit': {
                const by = attackerBattler ? ` by ${attackerBattler}` : '';
                const via = event.abilityName ? ` using ${event.abilityName}` : '';
                return `${targetBattler} took ${event.damage} damage${by}${via}`;
            }
            case 'defeat': {
                const by = attackerBattler ? ` by ${attackerBattler}` : '';
                const via = event.abilityName ? ` using ${event.abilityName}` : '';
                return `${targetBattler} was defeated after taking ${event.damage ?? 0} damage${by}${via}`;
            }
            case 'miss': {
                const src = attackerBattler ?? event.abilityName ?? 'Attack';
                const via = attackerBattler && event.abilityName ? ` using ${event.abilityName}` : '';
                return `${src}${via} missed ${targetBattler}`;
            }
            case 'blocked':
                return `${targetBattler} was untouchable — attack blocked!`;
            case 'directHit':
                return `${event.attackerPlayerId ? battlerLabel(event.attackerPlayerId, event.cardName) : event.cardName} struck ${targetName} directly for ${event.damage} damage`;
            case 'dot': {
                const dotLabel = DOT_LABEL[event.dotType] ?? event.dotType;
                return `${targetBattler} suffered ${dotLabel} (${event.damage} damage)`;
            }
            case 'dotDefeat':
                return `${targetBattler} was defeated by status effects after taking ${event.damage ?? 0} damage`;
            case 'statusApplied': {
                const by = attackerBattler ? ` by ${attackerBattler}` : '';
                const via = event.abilityName ? ` via ${event.abilityName}` : '';
                return `${targetBattler} was afflicted with ${event.status}${by}${via}`;
            }
            case 'heal': {
                const by = attackerBattler ? ` by ${attackerBattler}` : '';
                const via = event.abilityName ? ` via ${event.abilityName}` : '';
                return `${targetBattler} healed for ${event.amount} HP${by}${via}`;
            }
            default:
                return JSON.stringify(event);
        }
    };

    const showHealth = ['hit', 'defeat', 'directHit', 'dot', 'dotDefeat', 'blocked', 'heal'].includes(event.type);

    return (
        <div
            className={`recap-event ${cfg.className}`}
            style={{ animationDelay: `${index * 0.09}s` }}
        >
            <span className="recap-event-icon">{cfg.icon}</span>
            <div className="recap-event-body">
                <span className="recap-event-msg">{buildMessage()}</span>
                {showHealth && (
                    <HPBar current={event.healthAfter} max={event.maxHealth} />
                )}
            </div>
        </div>
    );
};

const TurnRecap = ({ currentPlayer, players }) => {
    const dispatch = useDispatch();
    const turnSummary = useSelector((s) => s.cardGame.turnSummary);
    const currentTurn = useSelector((s) => s.cardGame.currentTurn);
    const [activeTab, setActiveTab] = useState('brief');
    const [search, setSearch] = useState('');

    // Only show at the start of this player's own turn
    if (!turnSummary?.length || currentTurn !== currentPlayer?.id) return null;

    const playerNames = Object.fromEntries((players ?? []).map((p) => [p.id, p.name]));
    const isOneVOne = (players ?? []).length <= 2;

    // Stats specific to the current player (damage they took)
    const myEvents = turnSummary.filter((e) => e.targetPlayerId === currentPlayer.id);
    const damageTaken = myEvents.reduce((sum, e) => sum + (e.damage || 0), 0);
    const cardsLost = myEvents.filter((e) => e.type === 'defeat' || e.type === 'dotDefeat').length;

    const filteredEvents = activeTab === 'full'
        ? turnSummary.filter((e) => {
            if (!search.trim()) return true;
            const q = search.toLowerCase();
            const name = playerNames?.[e.targetPlayerId] ?? '';
            return (
                (e.cardName ?? '').toLowerCase().includes(q) ||
                name.toLowerCase().includes(q) ||
                (e.type ?? '').toLowerCase().includes(q) ||
                (e.dotType ?? '').toLowerCase().includes(q)
            );
        })
        : myEvents;

    return (
        <div className="recap-overlay" onClick={() => dispatch(dismissRecap())}>
            <div className="recap-modal" onClick={(e) => e.stopPropagation()}>
                <div className="recap-header">
                    <h2 className="recap-title">⚔️ Turn Recap</h2>
                </div>

                <div className="recap-tabs">
                    <button
                        className={`recap-tab${activeTab === 'brief' ? ' recap-tab--active' : ''}`}
                        onClick={() => setActiveTab('brief')}
                    >
                        Brief
                    </button>
                    {!isOneVOne && (
                        <button
                            className={`recap-tab${activeTab === 'full' ? ' recap-tab--active' : ''}`}
                            onClick={() => setActiveTab('full')}
                        >
                            Full Brief
                        </button>
                    )}
                </div>

                {activeTab === 'brief' && (
                    <div className="recap-summary-row">
                        <div className="recap-stat">
                            <span className="recap-stat-value recap-stat-damage">{damageTaken}</span>
                            <span className="recap-stat-label">Damage Taken</span>
                        </div>
                        <div className="recap-stat">
                            <span className="recap-stat-value recap-stat-defeats">{cardsLost}</span>
                            <span className="recap-stat-label">Cards Lost</span>
                        </div>
                        <div className="recap-stat">
                            <span className="recap-stat-value">{+currentPlayer.health.toFixed(1)}/{+currentPlayer.maxHealth.toFixed(1)}</span>
                            <span className="recap-stat-label">Your HP</span>
                        </div>
                    </div>
                )}

                {activeTab === 'full' && (
                    <div className="recap-search-row">
                        <input
                            className="recap-search-input"
                            type="text"
                            placeholder="Search by card, player, or effect…"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                        {search && (
                            <button className="recap-search-clear" onClick={() => setSearch('')}>✕</button>
                        )}
                    </div>
                )}

                <div className="recap-events">
                    {filteredEvents.length === 0 ? (
                        <p className="recap-no-results">No events match "{search}"</p>
                    ) : (
                        filteredEvents.map((e, i) => (
                            <RecapEvent key={i} event={e} index={i} playerNames={playerNames} currentPlayerId={currentPlayer.id} />
                        ))
                    )}
                </div>

                <button className="recap-continue-btn" onClick={() => dispatch(dismissRecap())}>
                    Continue →
                </button>
            </div>
        </div>
    );
};

export default TurnRecap;

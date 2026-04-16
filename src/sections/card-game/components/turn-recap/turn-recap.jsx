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
            <span className="recap-hp-label">{current}/{max} HP</span>
        </div>
    );
};

const RecapEvent = ({ event, index, playerNames }) => {
    const cfg = EVENT_CONFIG[event.type] ?? { icon: '❓', label: event.type, className: '' };

    const buildMessage = () => {
        switch (event.type) {
            case 'hit':
                return `${event.cardName} took ${event.damage} damage`;
            case 'defeat':
                return `${event.cardName} was defeated!`;
            case 'miss':
                return `An attack missed ${event.cardName}`;
            case 'blocked':
                return `${event.cardName} was untouchable — attack blocked!`;
            case 'directHit': {
                const pName = playerNames?.[event.targetPlayerId] ?? 'Player';
                return `${event.cardName} struck ${pName} directly for ${event.damage} damage`;
            }
            case 'dot': {
                const dotLabel = DOT_LABEL[event.dotType] ?? event.dotType;
                return `${event.cardName} suffered ${dotLabel} (${event.damage} dmg)`;
            }
            case 'dotDefeat':
                return `${event.cardName} was defeated by status effects!`;
            default:
                return JSON.stringify(event);
        }
    };

    const showHealth = ['hit', 'directHit', 'dot'].includes(event.type);

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

    if (!turnSummary?.length) return null;

    // Only show events that affected the current player
    const events = turnSummary.filter((e) => e.targetPlayerId === currentPlayer.id);
    if (!events.length) {
        dispatch(dismissRecap());
        return null;
    }

    const playerNames = Object.fromEntries((players ?? []).map((p) => [p.id, p.name]));
    const totalDamage = events.reduce((sum, e) => sum + (e.damage || 0), 0);
    const defeats = events.filter((e) => e.type === 'defeat' || e.type === 'dotDefeat').length;

    return (
        <div className="recap-overlay" onClick={() => dispatch(dismissRecap())}>
            <div className="recap-modal" onClick={(e) => e.stopPropagation()}>
                <div className="recap-header">
                    <h2 className="recap-title">⚔️ Last Turn Recap</h2>
                    <p className="recap-subtitle">
                        Here's what happened to <strong>{currentPlayer.name}</strong>'s side
                    </p>
                </div>

                <div className="recap-summary-row">
                    <div className="recap-stat">
                        <span className="recap-stat-value recap-stat-damage">{totalDamage}</span>
                        <span className="recap-stat-label">Total Damage</span>
                    </div>
                    <div className="recap-stat">
                        <span className="recap-stat-value recap-stat-defeats">{defeats}</span>
                        <span className="recap-stat-label">Cards Lost</span>
                    </div>
                    <div className="recap-stat">
                        <span className="recap-stat-value">{currentPlayer.health}/{currentPlayer.maxHealth}</span>
                        <span className="recap-stat-label">Your HP</span>
                    </div>
                </div>

                <div className="recap-events">
                    {events.map((e, i) => (
                        <RecapEvent key={i} event={e} index={i} playerNames={playerNames} />
                    ))}
                </div>

                <button className="recap-continue-btn" onClick={() => dispatch(dismissRecap())}>
                    Continue →
                </button>
            </div>
        </div>
    );
};

export default TurnRecap;

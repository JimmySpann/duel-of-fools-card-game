import { useState } from 'react';
import { useSelector } from 'react-redux';
import RulesView from '../shared/rules/RulesView';
import RulesModal from '../shared/rules/RulesModal';

const BriefPanel = ({ onClose, gamePlayers, myPlayerId, isOnline }) => {
    const { log, currentTurn } = useSelector((s) => s.cardGame);
    const activeSession = useSelector((s) => s.sessions.activeSession);

    const [briefTab, setBriefTab] = useState('fullBrief');
    const [briefSearch, setBriefSearch] = useState('');
    const [showRulesModal, setShowRulesModal] = useState(false);

    const classifyLogEntry = (entry) => {
        const e = entry.toLowerCase();
        if (e.includes('---')) return 'game-panel-log-entry log-entry--turn';
        if (e.includes('wins!') || e.includes('draw')) return 'game-panel-log-entry log-entry--turn';
        if (e.includes('attacks') || e.includes('damage') || e.includes('missed') || e.includes('defeated') || e.includes('blocked') || e.includes('untouchable')) return 'game-panel-log-entry log-entry--combat';
        if (e.includes('healed') || e.includes('restores') || e.includes('drains')) return 'game-panel-log-entry log-entry--heal';
        if (e.includes('afflicted') || e.includes('gains') || e.includes('cleansed') || e.includes('refreshed') || e.includes('frozen') || e.includes('burned') || e.includes('poisoned') || e.includes('bleeding')) return 'game-panel-log-entry log-entry--status';
        return 'game-panel-log-entry';
    };

    return (
        <>
            <div className="game-panel-overlay" onClick={onClose}>
                <div className="game-panel" onClick={(e) => e.stopPropagation()}>
                    <div className="game-panel-header">
                        <h3 className="game-panel-title">Game Brief</h3>
                        <button className="game-panel-close" onClick={onClose}>✕</button>
                    </div>

                    {activeSession && (
                        <p className="game-panel-session-name">{activeSession.name}</p>
                    )}

                    {/* Tab switcher */}
                    <div className="game-panel-tabs">
                        <button
                            className={`game-panel-tab${briefTab === 'fullBrief' ? ' active' : ''}`}
                            onClick={() => setBriefTab('fullBrief')}
                        >
                            Full Brief
                        </button>
                        <button
                            className={`game-panel-tab${briefTab === 'rules' ? ' active' : ''}`}
                            onClick={() => setBriefTab('rules')}
                        >
                            Rules
                        </button>
                        <button
                            className={`game-panel-tab${briefTab === 'turn' ? ' active' : ''}`}
                            onClick={() => setBriefTab('turn')}
                        >
                            Turn Brief
                        </button>
                    </div>

                    {/* ── Full Brief tab ── */}
                    {briefTab === 'fullBrief' && (
                        <div className="game-panel-section">
                            <div className="game-panel-log-search-row">
                                <input
                                    className="game-panel-log-search"
                                    type="text"
                                    placeholder="Search log…"
                                    value={briefSearch}
                                    onChange={(e) => setBriefSearch(e.target.value)}
                                />
                                {briefSearch && (
                                    <button className="game-panel-log-search-clear" onClick={() => setBriefSearch('')}>✕</button>
                                )}
                            </div>
                            <ol className="game-panel-log">
                                {(briefSearch
                                    ? log.filter((entry) => entry.toLowerCase().includes(briefSearch.toLowerCase()))
                                    : log
                                ).map((entry, i) => (
                                    <li key={i} className={classifyLogEntry(entry)}>{entry}</li>
                                ))}
                                {briefSearch && log.filter((e) => e.toLowerCase().includes(briefSearch.toLowerCase())).length === 0 && (
                                    <li className="game-panel-log-empty">No entries match "{briefSearch}"</li>
                                )}
                            </ol>
                        </div>
                    )}

                    {/* ── Rules tab ── */}
                    {briefTab === 'rules' && (
                        <>
                            <div className="game-panel-section">
                                <h4 className="game-panel-section-title">Players</h4>
                                <div className="game-panel-players">
                                    {gamePlayers.map((p) => {
                                        const pct = Math.max(0, Math.round((p.health / p.maxHealth) * 100));
                                        const isCurrent = p.id === currentTurn;
                                        return (
                                            <div key={p.id} className={`game-panel-player${isCurrent ? ' current-turn' : ''}`}>
                                                <div className="game-panel-player-row">
                                                    <span className="game-panel-player-name">
                                                        {isCurrent ? '▶ ' : ''}{p.name}
                                                        {p.id === myPlayerId && isOnline ? ' (You)' : ''}
                                                    </span>
                                                    <span className="game-panel-player-hp">{p.health} / {p.maxHealth} HP</span>
                                                </div>
                                                <div className="game-panel-hp-bar">
                                                    <div
                                                        className="game-panel-hp-fill"
                                                        style={{
                                                            width: `${pct}%`,
                                                            background: pct > 50 ? '#5fc98e' : pct > 25 ? '#e2c97e' : '#e05a5a',
                                                        }}
                                                    />
                                                </div>
                                                <div className="game-panel-player-stats">
                                                    <span>Hand: {p.hand.length}</span>
                                                    <span>In Play: {p.inPlay.length}</span>
                                                    <span>Deck: {p.deck.length}</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="game-panel-section">
                                <h4 className="game-panel-section-title">Rules Summary</h4>
                                <RulesView
                                    mode="brief"
                                    sectionIds={['objective', 'turnFlow', 'actions', 'combat', 'status', 'directAttack', 'limits']}
                                />
                                <button className="rules-open-full-btn" onClick={() => setShowRulesModal(true)}>
                                    Open Full Rules Deep Dive
                                </button>
                            </div>
                        </>
                    )}

                    {/* ── Turn Brief tab ── */}
                    {briefTab === 'turn' && (
                        <div className="game-panel-section">
                            <ol className="game-panel-turn-brief">
                                <li>
                                    <span className="turn-brief-step">Draw a Card</span>
                                    <p>At the start of your turn you automatically draw one card from your deck into your hand.</p>
                                </li>
                                <li>
                                    <span className="turn-brief-step">Play a Battler <em>(optional)</em></span>
                                    <p>Play one card from your hand to deploy a battler to the field. You may only play one card per turn. Newly deployed battlers are <em>Not Ready</em> and cannot act this turn.</p>
                                </li>
                                <li>
                                    <span className="turn-brief-step">Act with Your Battlers</span>
                                    <p>Select any of your ready battlers and choose <strong>Attack</strong> or an <strong>Ability</strong>. Each battler can act once per turn. Battlers marked <em>Acted</em> have already used their action.</p>
                                </li>
                                <li>
                                    <span className="turn-brief-step">Resolve Combat</span>
                                    <p>Attacks are resolved using <strong>ATK</strong> vs the target's <strong>DEF</strong>. Agility (<strong>AGI</strong>) and Evasion (<strong>EVA</strong>) can cause attacks to miss. Elemental strengths and weaknesses modify damage further.</p>
                                </li>
                                <li>
                                    <span className="turn-brief-step">End Your Turn</span>
                                    <p>Press <strong>End Turn</strong> when you're done. All your battlers' actions reset and play passes to your opponent. Battlers that were <em>Not Ready</em> become ready at the start of their controller's next turn.</p>
                                </li>
                                <li>
                                    <span className="turn-brief-step">Win Condition</span>
                                    <p>Defeat all enemy battlers in play, <em>or</em> reduce your opponent's HP to 0 to win the game.</p>
                                </li>
                            </ol>
                        </div>
                    )}
                </div>
            </div>

            {showRulesModal && (
                <RulesModal
                    onClose={() => setShowRulesModal(false)}
                    title="Game Rules Deep Dive"
                />
            )}
        </>
    );
};

export default BriefPanel;

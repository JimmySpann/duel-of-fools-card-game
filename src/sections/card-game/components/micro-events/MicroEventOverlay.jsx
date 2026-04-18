import QTEEvent from './QTEEvent';
import PatternMatchEvent from './PatternMatchEvent';
import QuizEvent from './QuizEvent';
import RhythmEvent from './RhythmEvent';
import MashEvent from './MashEvent';
import ParryChainEvent from './ParryChainEvent';
import ManaRouteEvent from './ManaRouteEvent';
import SigilRecallEvent from './SigilRecallEvent';
import ArrowShotEvent from './ArrowShotEvent';
import './micro-events.css';

/**
 * Full-screen overlay that hosts the active microevent.
 *
 * Props
 *   context      {object}   payload from game:microevent:start
 *   liveInputs   {array}    inputs relayed from the active player (for spectators)
 *   isSpectator  {bool}     if true, interactive elements are disabled
 *   onComplete   {function} (result: { success, score }) — active player only
 *   onInput      {function} (payload) — active player only; relay to socket
 */
const MicroEventOverlay = ({ context, liveInputs, isSpectator, onComplete, onInput }) => {
    if (!context) return null;

    const eventProps = { context, liveInputs, isSpectator, onComplete, onInput };

    return (
        <div className="me-overlay">
            <div className="me-header">
                <div className="me-ability-name">{context.abilityName}</div>
                <div className="me-caster-name">{context.casterName}</div>
                {isSpectator && <span className="me-spectator-badge">Watching</span>}
            </div>

            {context.type === 'qte' && <QTEEvent          {...eventProps} />}
            {context.type === 'pattern' && <PatternMatchEvent  {...eventProps} />}
            {context.type === 'quiz' && <QuizEvent          {...eventProps} />}
            {context.type === 'rhythm' && <RhythmEvent        {...eventProps} />}
            {context.type === 'mash' && <MashEvent           {...eventProps} />}
            {context.type === 'parry' && <ParryChainEvent    {...eventProps} />}
            {context.type === 'route' && <ManaRouteEvent     {...eventProps} />}
            {context.type === 'sigil' && <SigilRecallEvent   {...eventProps} />}
            {context.type === 'arrow' && <ArrowShotEvent     {...eventProps} />}
        </div>
    );
};

export default MicroEventOverlay;

import { useEffect, useRef, useState } from 'react';

const COLORS = ['red', 'blue', 'green', 'yellow'];
const LABELS = ['🔴', '🔵', '🟢', '🟡'];
const SEQ_LEN = 3;

const SHOW_MS = 600;  // how long each button is lit during show phase
const GAP_MS = 300;  // gap between flashes

/**
 * Pattern Match (Simon Says) — watch the 3-step sequence, then repeat it.
 * Scaled: score = correctSteps / SEQ_LEN.
 */
const PatternMatchEvent = ({ context, isSpectator, liveInputs, onComplete, onInput }) => {
    const sequence = context.seed ?? [0, 1, 2]; // server-provided seed

    const [phase, setPhase] = useState('countdown'); // countdown | showing | input | done
    const [litIndex, setLitIndex] = useState(null);        // button index currently lit
    const [inputStep, setInputStep] = useState(0);         // how many inputs received
    const [feedbacks, setFeedbacks] = useState([]);        // 'correct'|'wrong' per input
    const [statusMsg, setStatusMsg] = useState('Watch carefully…');
    const prevSpectatorInputRef = useRef(0);

    // Spectator: mirror button presses
    useEffect(() => {
        if (!isSpectator) return;
        const presses = liveInputs.filter((i) => i.inputType === 'patternPress');
        if (presses.length > prevSpectatorInputRef.current) {
            const latest = presses[presses.length - 1];
            prevSpectatorInputRef.current = presses.length;
            setLitIndex(latest.buttonIndex);
            setTimeout(() => setLitIndex(null), 350);
        }
    }, [liveInputs, isSpectator]);

    // Show sequence, then switch to input phase
    useEffect(() => {
        let cancelled = false;
        const runShow = async () => {
            await delay(800); // lead-in
            if (cancelled) return;
            setPhase('showing');
            for (let i = 0; i < SEQ_LEN; i++) {
                if (cancelled) return;
                setLitIndex(sequence[i]);
                await delay(SHOW_MS);
                if (cancelled) return;
                setLitIndex(null);
                if (i < SEQ_LEN - 1) await delay(GAP_MS);
            }
            if (cancelled) return;
            setPhase('input');
            setStatusMsg(isSpectator ? 'Watching opponent input…' : 'Your turn! Repeat the sequence.');
        };
        runShow();
        return () => { cancelled = true; };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handlePress = (btnIndex) => {
        if (phase !== 'input' || isSpectator) return;
        onInput({ inputType: 'patternPress', buttonIndex: btnIndex });

        const correct = sequence[inputStep] === btnIndex;
        const newFeedbacks = [...feedbacks, correct ? 'correct' : 'wrong'];
        setFeedbacks(newFeedbacks);
        setLitIndex(btnIndex);
        setTimeout(() => setLitIndex(null), 250);

        if (!correct) {
            setPhase('done');
            setStatusMsg('Wrong! ✗');
            const score = inputStep / SEQ_LEN;
            setTimeout(() => onComplete({ success: score > 0, score }), 600);
            return;
        }

        const nextStep = inputStep + 1;
        setInputStep(nextStep);

        if (nextStep >= SEQ_LEN) {
            setPhase('done');
            setStatusMsg('Perfect! ✓');
            setTimeout(() => onComplete({ success: true, score: 1 }), 600);
        } else {
            setStatusMsg(`${nextStep}/${SEQ_LEN} correct…`);
        }
    };

    return (
        <div className="me-pattern-container">
            <div className="me-pattern-status">{statusMsg}</div>

            <div className="me-pattern-buttons">
                {COLORS.map((color, i) => {
                    const isLit = litIndex === i;
                    const fb = feedbacks[inputStep - 1]; // last feedback
                    const justPressed = litIndex === i && phase === 'input';
                    return (
                        <button
                            key={color}
                            data-color={color}
                            className={`me-pattern-btn${isLit ? ' lit' : ''}${justPressed && fb === 'wrong' ? ' wrong' : ''}${justPressed && fb === 'correct' ? ' correct' : ''}`}
                            disabled={phase !== 'input' || isSpectator}
                            onClick={() => handlePress(i)}
                            aria-label={color}
                        >
                            {LABELS[i]}
                        </button>
                    );
                })}
            </div>

            <div className="me-pattern-score">
                {phase === 'input' && !isSpectator && `Step ${inputStep + 1} of ${SEQ_LEN}`}
            </div>
        </div>
    );
};

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

export default PatternMatchEvent;

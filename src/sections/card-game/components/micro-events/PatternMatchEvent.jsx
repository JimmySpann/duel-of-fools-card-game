import { useEffect, useRef, useState } from 'react';

const COLORS = ['red', 'blue', 'green', 'yellow'];
const LABELS = ['🔴', '🔵', '🟢', '🟡'];

/**
 * Pattern Match (Simon Says) — watch the sequence, then repeat it.
 * Scaled: score = correctSteps / seqLen.
 *
 * context.seed       — server-provided colour sequence array
 * context.seqLen     — length of sequence (3–5, scales with difficulty)
 * context.difficulty — 0-4, controls flash speed
 */
const PatternMatchEvent = ({ context, isSpectator, liveInputs, onComplete, onInput }) => {
    const difficulty = context?.difficulty ?? 0;
    const seqLen = context?.seqLen ?? 3;
    const sequence = (context?.seed ?? [0, 1, 2]).slice(0, seqLen);

    // Speed scales with difficulty: faster show and smaller gaps at higher levels
    const SHOW_MS = [500, 420, 340, 260, 190][difficulty];
    const GAP_MS = [250, 200, 150, 110, 70][difficulty];

    const [phase, setPhase] = useState('countdown');
    const [litIndex, setLitIndex] = useState(null);
    const [inputStep, setInputStep] = useState(0);
    const [feedbacks, setFeedbacks] = useState([]);
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
            await delay(700); // lead-in
            if (cancelled) return;
            setPhase('showing');
            for (let i = 0; i < seqLen; i++) {
                if (cancelled) return;
                setLitIndex(sequence[i]);
                await delay(SHOW_MS);
                if (cancelled) return;
                setLitIndex(null);
                if (i < seqLen - 1) await delay(GAP_MS);
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
            const score = inputStep / seqLen;
            setTimeout(() => onComplete({ success: score > 0, score }), 600);
            return;
        }

        const nextStep = inputStep + 1;
        setInputStep(nextStep);

        if (nextStep >= seqLen) {
            setPhase('done');
            setStatusMsg('Perfect! ✓');
            setTimeout(() => onComplete({ success: true, score: 1 }), 600);
        } else {
            setStatusMsg(`${nextStep}/${seqLen} correct…`);
        }
    };

    return (
        <div className="me-pattern-container">
            <div className="me-pattern-status">{statusMsg}</div>

            <div className="me-pattern-buttons">
                {COLORS.map((color, i) => {
                    const isLit = litIndex === i;
                    const fb = feedbacks[inputStep - 1];
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
                {phase === 'input' && !isSpectator && `Step ${inputStep + 1} of ${seqLen}`}
                {phase === 'showing' && <span className="me-pattern-speed-hint">Speed: {['Normal', 'Normal', 'Fast', 'Faster', 'Blazing'][difficulty]}</span>}
            </div>
        </div>
    );
};

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

export default PatternMatchEvent;

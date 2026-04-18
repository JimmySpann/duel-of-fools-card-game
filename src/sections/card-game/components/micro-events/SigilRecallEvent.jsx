import { useEffect, useRef, useState } from 'react';

const SIGILS = ['△', '○', '□', '◇'];

/**
 * Sigil Recall — remember and repeat a sigil sequence.
 * Binary/Scaled depending on ability interpretation.
 */
const SigilRecallEvent = ({ context, isSpectator, liveInputs, onComplete, onInput }) => {
    const sequence = context?.sequence ?? [0, 2, 1, 3];
    const [phase, setPhase] = useState('show');
    const [activeSigil, setActiveSigil] = useState(null);
    const [input, setInput] = useState([]);
    const [status, setStatus] = useState('Memorize the sigils...');
    const prevSpectatorRef = useRef(0);

    useEffect(() => {
        let cancelled = false;
        const run = async () => {
            await delay(450);
            for (const idx of sequence) {
                if (cancelled) return;
                setActiveSigil(idx);
                await delay(360);
                if (cancelled) return;
                setActiveSigil(null);
                await delay(120);
            }
            if (cancelled) return;
            setPhase('input');
            setStatus(isSpectator ? 'Watching recall...' : 'Repeat the sequence');
        };
        run();
        return () => { cancelled = true; };
    }, [sequence, isSpectator]);

    useEffect(() => {
        if (!isSpectator || phase !== 'input') return;
        const picks = liveInputs.filter((i) => i.inputType === 'sigilPick');
        if (picks.length > prevSpectatorRef.current) {
            const last = picks[picks.length - 1];
            prevSpectatorRef.current = picks.length;
            setActiveSigil(last.sigilIndex);
            setTimeout(() => setActiveSigil(null), 170);
        }
    }, [liveInputs, isSpectator, phase]);

    const finish = (arr) => {
        let correct = 0;
        for (let i = 0; i < sequence.length; i++) {
            if (arr[i] === sequence[i]) correct += 1;
        }
        const score = correct / sequence.length;
        setPhase('done');
        onComplete({ success: score >= 0.75, score });
    };

    const handlePick = (idx) => {
        if (phase !== 'input' || isSpectator) return;
        onInput({ inputType: 'sigilPick', sigilIndex: idx, timestamp: Date.now() });
        const next = [...input, idx];
        setInput(next);
        setActiveSigil(idx);
        setTimeout(() => setActiveSigil(null), 140);

        if (next.length >= sequence.length) {
            setStatus('Checking...');
            setTimeout(() => finish(next), 220);
        } else {
            setStatus(`${next.length}/${sequence.length} entered`);
        }
    };

    return (
        <div className="me-sigil-container">
            <div className="me-sigil-status">{status}</div>
            <div className="me-sigil-row">
                {SIGILS.map((s, i) => (
                    <button
                        key={s}
                        className={`me-sigil-btn${activeSigil === i ? ' lit' : ''}`}
                        onClick={() => handlePick(i)}
                        disabled={phase !== 'input' || isSpectator}
                    >
                        {s}
                    </button>
                ))}
            </div>
            {phase === 'input' && !isSpectator && (
                <div className="me-sigil-progress">Input {input.length} / {sequence.length}</div>
            )}
        </div>
    );
};

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

export default SigilRecallEvent;

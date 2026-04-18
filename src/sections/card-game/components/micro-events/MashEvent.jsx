import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Mash Event — click/tap as fast as possible to fill a power meter.
 * Scaled: score = clicks / targetClicks, clamped 0–1.
 *
 * difficulty 0 → long timer, low target
 * difficulty 4 → short timer, high target
 */
const MashEvent = ({ context, isSpectator, liveInputs, onComplete, onInput }) => {
    const difficulty = context?.difficulty ?? 0;

    const DURATION_MS = [4000, 3500, 3200, 3000, 2800][difficulty];
    const TARGET_CLICKS = [10, 14, 18, 23, 28][difficulty];

    const [clicks, setClicks] = useState(0);
    const [timeLeft, setTimeLeft] = useState(DURATION_MS / 1000);
    const [done, setDone] = useState(false);
    const [spectatorClicks, setSpectatorClicks] = useState(0);
    const clicksRef = useRef(0);
    const doneRef = useRef(false);
    const prevSpectatorRef = useRef(0);
    const intervalRef = useRef(null);

    // Spectator: mirror clicks from liveInputs
    useEffect(() => {
        if (!isSpectator) return;
        const mashes = liveInputs.filter((i) => i.inputType === 'mash');
        if (mashes.length > prevSpectatorRef.current) {
            prevSpectatorRef.current = mashes.length;
            setSpectatorClicks(mashes.length);
        }
    }, [liveInputs, isSpectator]);

    // Countdown timer
    useEffect(() => {
        if (isSpectator) return;
        const startMs = performance.now();
        intervalRef.current = setInterval(() => {
            const elapsed = performance.now() - startMs;
            const remaining = Math.max(0, (DURATION_MS - elapsed) / 1000);
            setTimeLeft(remaining);
            if (remaining <= 0) {
                clearInterval(intervalRef.current);
                if (!doneRef.current) {
                    doneRef.current = true;
                    setDone(true);
                    const score = Math.min(1, clicksRef.current / TARGET_CLICKS);
                    onComplete({ success: score >= 0.5, score });
                }
            }
        }, 50);
        return () => clearInterval(intervalRef.current);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleMash = useCallback(() => {
        if (doneRef.current || isSpectator) return;
        clicksRef.current += 1;
        setClicks(clicksRef.current);
        onInput({ inputType: 'mash', timestamp: Date.now() });

        // Instant-complete if target reached
        if (clicksRef.current >= TARGET_CLICKS) {
            clearInterval(intervalRef.current);
            doneRef.current = true;
            setDone(true);
            onComplete({ success: true, score: 1 });
        }
    }, [isSpectator, TARGET_CLICKS, onInput, onComplete]);

    // Keyboard support
    useEffect(() => {
        const onKey = (e) => {
            if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); handleMash(); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [handleMash]);

    const displayClicks = isSpectator ? spectatorClicks : clicks;
    const displayTarget = TARGET_CLICKS;
    const meterPct = Math.min(100, (displayClicks / displayTarget) * 100);
    const meterColor = meterPct >= 100 ? '#2ecc71' : meterPct >= 50 ? '#f5a623' : '#3498db';
    const secondsLeft = Math.ceil(timeLeft);

    return (
        <div className="me-mash-container">
            <div className={`me-mash-timer${secondsLeft <= 1 && !done ? ' urgent' : ''}`}>
                {isSpectator ? '⏱' : done ? '—' : `${secondsLeft}s`}
            </div>

            <div className="me-mash-meter-wrap">
                <div
                    className="me-mash-meter-fill"
                    style={{ width: `${meterPct}%`, background: meterColor }}
                />
                <div className="me-mash-meter-label">
                    {displayClicks} / {displayTarget}
                </div>
            </div>

            <button
                className={`me-mash-btn${done ? ' done' : ''}`}
                disabled={done || isSpectator}
                onClick={handleMash}
            >
                {done
                    ? (meterPct >= 50 ? '✓ DONE!' : '✗ TOO SLOW')
                    : isSpectator
                        ? '👁 WATCHING'
                        : 'MASH! (Space)'}
            </button>

            <div className="me-mash-prompt">
                {isSpectator ? 'Watching opponent mash…' : done ? '' : `Click as fast as you can! (${TARGET_CLICKS} hits for full power)`}
            </div>
        </div>
    );
};

export default MashEvent;

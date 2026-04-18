import { useEffect, useRef, useState } from 'react';

const DURATION_MS = 1500;
const RADIUS = 72;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Quick Time Event — click the button before the ring expires.
 * Binary: success = clicked in time, failure = expired.
 */
const QTEEvent = ({ isSpectator, liveInputs, onComplete, onInput }) => {
    const [started, setStarted] = useState(false);
    const [done, setDone] = useState(false);
    const [progress, setProgress] = useState(1); // 1 → 0
    const startTimeRef = useRef(null);
    const rafRef = useRef(null);

    // Spectator: flash button when a click input arrives
    const [spectatorFlash, setSpectatorFlash] = useState(false);
    const prevInputCountRef = useRef(0);

    useEffect(() => {
        const clicks = liveInputs.filter((i) => i.inputType === 'click');
        if (clicks.length > prevInputCountRef.current) {
            prevInputCountRef.current = clicks.length;
            setSpectatorFlash(true);
            setTimeout(() => setSpectatorFlash(false), 300);
        }
    }, [liveInputs]);

    // Start countdown on mount
    useEffect(() => {
        const timeout = setTimeout(() => {
            setStarted(true);
            startTimeRef.current = performance.now();

            const tick = (now) => {
                const elapsed = now - startTimeRef.current;
                const remaining = Math.max(0, 1 - elapsed / DURATION_MS);
                setProgress(remaining);

                if (remaining <= 0) {
                    setDone(true);
                    onComplete({ success: false, score: 0 });
                } else {
                    rafRef.current = requestAnimationFrame(tick);
                }
            };
            rafRef.current = requestAnimationFrame(tick);
        }, 400); // small lead-in

        return () => {
            clearTimeout(timeout);
            cancelAnimationFrame(rafRef.current);
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleClick = () => {
        if (done || isSpectator || !started) return;
        cancelAnimationFrame(rafRef.current);
        setDone(true);
        const score = progress;
        onInput({ inputType: 'click', timestamp: Date.now() });
        onComplete({ success: true, score });
    };

    const dashOffset = CIRCUMFERENCE * (1 - progress);
    const isDanger = progress < 0.3;

    return (
        <div className="me-qte-container">
            <div className="me-qte-ring">
                <svg viewBox="0 0 180 180" width="180" height="180">
                    <circle className="me-qte-ring-track" cx="90" cy="90" r={RADIUS} />
                    <circle
                        className={`me-qte-ring-progress${isDanger ? ' danger' : ''}`}
                        cx="90" cy="90" r={RADIUS}
                        strokeDasharray={CIRCUMFERENCE}
                        strokeDashoffset={dashOffset}
                    />
                </svg>
                <button
                    className="me-qte-btn"
                    disabled={done || isSpectator || spectatorFlash}
                    onClick={handleClick}
                    style={spectatorFlash ? { transform: 'scale(1.12)', filter: 'brightness(1.6)' } : {}}
                >
                    {done ? '✓' : isSpectator ? '👁' : 'TAP!'}
                </button>
            </div>
            <div className="me-qte-prompt">
                {isSpectator ? 'Waiting for opponent…' : 'Click before time runs out!'}
            </div>
        </div>
    );
};

export default QTEEvent;

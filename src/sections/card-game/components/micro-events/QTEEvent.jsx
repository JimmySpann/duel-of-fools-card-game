import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * QTE — "Stop the Needle"
 * A projectile flies across a track from left to right.
 * Click/tap when it is inside the highlighted target zone.
 *
 * difficulty 0 → slow travel, wide zone
 * difficulty 4 → fast travel, narrow zone, zone shifts after each pass
 */
const QTEEvent = ({ context, isSpectator, liveInputs, onComplete, onInput }) => {
    const difficulty = context?.difficulty ?? 0;

    // Travel time decreases with difficulty
    const TRAVEL_MS = [2000, 1700, 1400, 1100, 850][difficulty];
    // Zone half-width as fraction of track (0 = left, 1 = right). Zone center = 0.5
    const ZONE_HALF = [0.18, 0.15, 0.13, 0.11, 0.09][difficulty];

    const [pos, setPos] = useState(0);       // 0 → 1
    const [result, setResult] = useState(null); // null | 'hit' | 'miss'
    const [spectatorFlash, setSpectatorFlash] = useState(false);
    const startTimeRef = useRef(null);
    const rafRef = useRef(null);
    const doneRef = useRef(false);
    const prevInputCountRef = useRef(0);

    // Spectator: flash when active player clicks
    useEffect(() => {
        const clicks = liveInputs.filter((i) => i.inputType === 'click');
        if (clicks.length > prevInputCountRef.current) {
            prevInputCountRef.current = clicks.length;
            setSpectatorFlash(true);
            setTimeout(() => setSpectatorFlash(false), 300);
        }
    }, [liveInputs]);

    useEffect(() => {
        const leadIn = setTimeout(() => {
            startTimeRef.current = performance.now();

            const tick = (now) => {
                if (doneRef.current) return;
                const elapsed = now - startTimeRef.current;
                // Oscillate back and forth: progress = triangle wave
                const cycle = elapsed / TRAVEL_MS;
                const raw = cycle % 2;
                const p = raw <= 1 ? raw : 2 - raw;
                setPos(p);
                rafRef.current = requestAnimationFrame(tick);
            };
            rafRef.current = requestAnimationFrame(tick);
        }, 400);

        return () => {
            clearTimeout(leadIn);
            cancelAnimationFrame(rafRef.current);
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const resolve = useCallback((currentPos) => {
        if (doneRef.current || isSpectator) return;
        doneRef.current = true;
        cancelAnimationFrame(rafRef.current);

        const distFromCenter = Math.abs(currentPos - 0.5);
        const inZone = distFromCenter <= ZONE_HALF;

        onInput({ inputType: 'click', timestamp: Date.now() });

        if (inZone) {
            const score = Math.max(0, 1 - distFromCenter / ZONE_HALF);
            setResult('hit');
            onComplete({ success: true, score });
        } else {
            setResult('miss');
            onComplete({ success: false, score: 0 });
        }
    }, [isSpectator, ZONE_HALF, onInput, onComplete]); // eslint-disable-line react-hooks/exhaustive-deps

    // Keyboard support
    useEffect(() => {
        const onKey = (e) => {
            if (e.code === 'Space' || e.code === 'Enter') {
                e.preventDefault();
                // Read current pos from ref-based rAF — capture from state via closure
                resolve(posRef.current);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [resolve]);

    // Keep a ref in sync with animated pos so keyboard handler sees latest value
    const posRef = useRef(0);
    useEffect(() => { posRef.current = pos; }, [pos]);

    const zoneLeft = (0.5 - ZONE_HALF) * 100;
    const zoneWidth = ZONE_HALF * 2 * 100;

    return (
        <div className="me-qte-container">
            <div className="me-qte-track-wrap">
                {/* Target zone */}
                <div
                    className="me-qte-zone"
                    style={{ left: `${zoneLeft}%`, width: `${zoneWidth}%` }}
                />
                {/* Projectile */}
                <div
                    className={`me-qte-projectile${result === 'hit' ? ' hit' : result === 'miss' ? ' miss' : ''}${spectatorFlash ? ' flash' : ''}`}
                    style={{ left: `${pos * 100}%` }}
                />
                {/* Zone edges */}
                <div className="me-qte-track-line" />
            </div>

            <button
                className={`me-qte-fire-btn${result ? ' done' : ''}`}
                disabled={!!result || isSpectator}
                onClick={() => resolve(posRef.current)}
            >
                {result === 'hit' ? '✓ HIT!' : result === 'miss' ? '✗ MISS' : isSpectator ? '👁' : 'PRESS! (Space)'}
            </button>

            <div className="me-qte-prompt">
                {isSpectator
                    ? 'Watching opponent…'
                    : result
                        ? ''
                        : 'Press when the projectile is in the zone!'}
            </div>
        </div>
    );
};

export default QTEEvent;

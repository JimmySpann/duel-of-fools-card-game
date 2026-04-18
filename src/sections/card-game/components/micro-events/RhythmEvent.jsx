import { useCallback, useEffect, useRef, useState } from 'react';

const LANE_HEIGHT = 300;
const HIT_ZONE_Y = 260; // px from top of lane (centre of hit zone)
const SCROLL_TIME_MS = 1600; // time a note takes to travel from top to hit zone (was 1200)

/**
 * Rhythm event — tap in time with the beat.
 * Scaled: score = hits / totalBeats.
 *
 * context.bpm           — beats per minute
 * context.beats         — number of beats to hit
 * context.beatStartTime — server epoch ms for the first beat
 * context.difficulty    — 0-4, controls hit window tolerance
 */
const RhythmEvent = ({ context, isSpectator, liveInputs, onComplete, onInput }) => {
    const { bpm = 120, beats: totalBeats = 4, beatStartTime, difficulty = 0 } = context;
    const beatIntervalMs = (60 / bpm) * 1000;

    // Hit window shrinks with difficulty
    const HIT_WINDOW_MS = Math.max(100, 180 - difficulty * 20);

    // Countdown state: show "3 2 1 GO!" before the first beat arrives at hit zone
    const [countdown, setCountdown] = useState(null); // null | 3 | 2 | 1 | 'GO!'

    // Compute beat times
    const beatTimesRef = useRef([]);
    useEffect(() => {
        const now = Date.now();
        const start = beatStartTime ?? now + 3000;
        beatTimesRef.current = Array.from({ length: totalBeats }, (_, i) =>
            start + i * beatIntervalMs
        );
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const [notes, setNotes] = useState([]);
    const [feedback, setFeedback] = useState('');
    const [done, setDone] = useState(false);
    const rafRef = useRef(null);
    const hitsRef = useRef(0);
    const notesRef = useRef([]);
    const startedRef = useRef(false);
    const prevSpectatorTaps = useRef(0);

    // Countdown ticker: runs until the first beat start time
    useEffect(() => {
        const start = beatStartTime ?? Date.now() + 3000;
        const updateCountdown = () => {
            const remaining = start - Date.now();
            if (remaining > 2500) setCountdown(3);
            else if (remaining > 1500) setCountdown(2);
            else if (remaining > 500) setCountdown(1);
            else if (remaining > -300) setCountdown('GO!');
            else setCountdown(null);
        };
        updateCountdown();
        const t = setInterval(updateCountdown, 100);
        return () => clearInterval(t);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Spectator: show tap feedback from liveInputs
    useEffect(() => {
        if (!isSpectator) return;
        const taps = liveInputs.filter((i) => i.inputType === 'rhythmTap');
        if (taps.length > prevSpectatorTaps.current) {
            prevSpectatorTaps.current = taps.length;
            setFeedback('TAP');
            setTimeout(() => setFeedback(''), 300);
        }
    }, [liveInputs, isSpectator]);

    // Initialise notes and start animation loop
    useEffect(() => {
        const now = Date.now();
        const start = beatStartTime ?? now + 3000;
        const initialNotes = Array.from({ length: totalBeats }, (_, i) => ({
            id: i,
            beatTime: start + i * beatIntervalMs,
            result: null,
        }));
        notesRef.current = initialNotes;
        setNotes([...initialNotes]);

        const tick = () => {
            const currentMs = Date.now();

            // Auto-miss any notes past window
            let changed = false;
            notesRef.current = notesRef.current.map((n) => {
                if (n.result === null && currentMs > n.beatTime + HIT_WINDOW_MS) {
                    changed = true;
                    return { ...n, result: 'miss' };
                }
                return n;
            });
            if (changed) setNotes([...notesRef.current]);

            // Check if all notes resolved
            const allDone = notesRef.current.every((n) => n.result !== null);
            if (allDone) {
                if (!startedRef.current) { rafRef.current = requestAnimationFrame(tick); return; }
                const score = hitsRef.current / totalBeats;
                setDone(true);
                onComplete({ success: hitsRef.current > 0, score });
                return;
            }

            if (currentMs >= start) startedRef.current = true;
            rafRef.current = requestAnimationFrame(tick);
        };

        rafRef.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafRef.current);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleTap = useCallback(() => {
        if (done || isSpectator) return;
        const tapTime = Date.now();
        onInput({ inputType: 'rhythmTap', timestamp: tapTime });

        // Find nearest unhit note within window
        let bestIdx = -1;
        let bestDelta = Infinity;
        notesRef.current.forEach((n, i) => {
            if (n.result !== null) return;
            const delta = Math.abs(n.beatTime - tapTime);
            if (delta <= HIT_WINDOW_MS && delta < bestDelta) {
                bestDelta = delta;
                bestIdx = i;
            }
        });

        if (bestIdx >= 0) {
            notesRef.current = notesRef.current.map((n, i) =>
                i === bestIdx ? { ...n, result: 'hit' } : n
            );
            hitsRef.current += 1;
            setFeedback('HIT!');
        } else {
            setFeedback('MISS');
        }
        setTimeout(() => setFeedback(''), 350);
        setNotes([...notesRef.current]);
    }, [done, isSpectator, HIT_WINDOW_MS, onInput]);

    // Space-bar support
    useEffect(() => {
        const onKey = (e) => { if (e.code === 'Space') { e.preventDefault(); handleTap(); } };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [handleTap]);

    // Note Y position: slides from top to HIT_ZONE_Y over SCROLL_TIME_MS
    const getNoteY = (beatTime) => {
        const now = Date.now();
        const startTime = beatTime - SCROLL_TIME_MS;
        const progress = Math.min(1, Math.max(0, (now - startTime) / SCROLL_TIME_MS));
        return -20 + progress * (HIT_ZONE_Y + 20);
    };

    return (
        <div className="me-rhythm-container">
            <div className="me-rhythm-info">BPM {bpm} · {totalBeats} beats · window ±{HIT_WINDOW_MS}ms</div>

            <div className="me-rhythm-lane">
                <div className={`me-rhythm-hit-zone${countdown === 'GO!' ? ' pulse' : ''}`} />
                {notes.map((n) => (
                    <div
                        key={n.id}
                        className={`me-rhythm-note${n.result ? ` ${n.result}` : ''}`}
                        style={{ top: getNoteY(n.beatTime) }}
                    />
                ))}
                {/* Countdown overlay inside lane */}
                {countdown !== null && (
                    <div className={`me-rhythm-countdown${countdown === 'GO!' ? ' go' : ''}`}>
                        {countdown}
                    </div>
                )}
            </div>

            <div className={`me-rhythm-feedback${feedback ? ` ${feedback === 'HIT!' ? 'hit' : 'miss'}` : ''}`}>
                {feedback}
            </div>

            <button
                className="me-rhythm-tap-btn"
                disabled={done || isSpectator}
                onClick={handleTap}
            >
                {isSpectator ? '👁 WATCHING' : 'TAP  (Space)'}
            </button>
        </div>
    );
};

export default RhythmEvent;

import { useEffect, useRef, useState } from 'react';

/**
 * Parry Chain — time taps against incoming strikes.
 * Scaled scoring with Perfect/Good windows.
 */
const ParryChainEvent = ({ context, isSpectator, liveInputs, onComplete, onInput }) => {
    const { strikeTimes = [], difficulty = 0 } = context;
    const perfectWindowMs = Math.max(70, 130 - difficulty * 12);
    const goodWindowMs = Math.max(120, 220 - difficulty * 12);
    const difficultyScale = Math.min(1, Math.max(0, difficulty / 4));
    const SAFE_OUTER_RADIUS = Math.round(62 - difficultyScale * 18);
    const SAFE_BAND_WIDTH = Math.round(28 - difficultyScale * 19);
    const SAFE_INNER_RADIUS = SAFE_OUTER_RADIUS - SAFE_BAND_WIDTH;
    const ATTACK_START_RADIUS = SAFE_OUTER_RADIUS + Math.round(30 + difficultyScale * 14);
    const ATTACK_END_RADIUS = Math.max(10, SAFE_INNER_RADIUS - Math.round(20 - difficultyScale * 4));
    const shrinkExponent = 0.78 + difficultyScale * 0.62;

    const [feedback, setFeedback] = useState('');
    const [done, setDone] = useState(false);
    const [clockMs, setClockMs] = useState(() => Date.now());
    const [scoreBoard, setScoreBoard] = useState({ perfect: 0, good: 0, miss: 0 });
    const strikesRef = useRef((strikeTimes || []).map((t, i) => ({ id: i, t, result: null })));
    const pointsRef = useRef(0);
    const prevSpectatorRef = useRef(0);
    const rafRef = useRef(null);

    useEffect(() => {
        if (!isSpectator) return;
        const taps = liveInputs.filter((i) => i.inputType === 'parryTap');
        if (taps.length > prevSpectatorRef.current) {
            prevSpectatorRef.current = taps.length;
            setFeedback('PARRY');
            setTimeout(() => setFeedback(''), 260);
        }
    }, [liveInputs, isSpectator]);

    useEffect(() => {
        const tick = () => {
            if (done) return;
            const now = Date.now();
            setClockMs(now);
            let changed = false;
            const next = strikesRef.current.map((s) => {
                if (s.result === null && now > s.t + goodWindowMs) {
                    changed = true;
                    return { ...s, result: 'miss' };
                }
                return s;
            });
            if (changed) {
                strikesRef.current = next;
                const miss = next.filter((s) => s.result === 'miss').length;
                const perfect = next.filter((s) => s.result === 'perfect').length;
                const good = next.filter((s) => s.result === 'good').length;
                setScoreBoard({ perfect, good, miss });
            }

            if (next.every((s) => s.result !== null)) {
                const total = next.length || 1;
                const score = pointsRef.current / total;
                setDone(true);
                onComplete({ success: score >= 0.5, score });
                return;
            }
            rafRef.current = requestAnimationFrame(tick);
        };

        rafRef.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafRef.current);
    }, [done, goodWindowMs, onComplete]);

    const getAttackRadius = (strikeTime, now) => {
        const start = strikeTime - goodWindowMs;
        const end = strikeTime + goodWindowMs;
        const progress = Math.min(1, Math.max(0, (now - start) / (end - start)));
        const easedProgress = Math.pow(progress, shrinkExponent);
        return ATTACK_START_RADIUS - (ATTACK_START_RADIUS - ATTACK_END_RADIUS) * easedProgress;
    };

    const handleParry = () => {
        if (done || isSpectator) return;
        const now = Date.now();
        onInput({ inputType: 'parryTap', timestamp: now });

        let bestIdx = -1;
        let bestDelta = Infinity;
        strikesRef.current.forEach((s, i) => {
            if (s.result !== null) return;
            const delta = Math.abs(s.t - now);
            if (delta <= goodWindowMs && delta < bestDelta) {
                bestDelta = delta;
                bestIdx = i;
            }
        });

        if (bestIdx >= 0) {
            const target = strikesRef.current[bestIdx];
            const attackRadius = getAttackRadius(target.t, now);
            const inSafeZone = attackRadius <= SAFE_OUTER_RADIUS && attackRadius >= SAFE_INNER_RADIUS;

            if (inSafeZone) {
                const perfect = bestDelta <= perfectWindowMs;
                const result = perfect ? 'perfect' : 'good';
                strikesRef.current = strikesRef.current.map((s, i) => (i === bestIdx ? { ...s, result } : s));
                pointsRef.current += perfect ? 1 : 0.6;
                setFeedback(perfect ? 'PERFECT' : 'GOOD');
            } else {
                setFeedback('MISS');
            }
        } else {
            setFeedback('MISS');
        }

        const miss = strikesRef.current.filter((s) => s.result === 'miss').length;
        const perf = strikesRef.current.filter((s) => s.result === 'perfect').length;
        const good = strikesRef.current.filter((s) => s.result === 'good').length;
        setScoreBoard({ perfect: perf, good, miss });
        setTimeout(() => setFeedback(''), 280);
    };

    useEffect(() => {
        const onKey = (e) => {
            if (e.code === 'Space' || e.code === 'Enter') {
                e.preventDefault();
                handleParry();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });

    const nextStrike = strikesRef.current.find((s) => s.result === null);
    const attackRadius = nextStrike ? getAttackRadius(nextStrike.t, clockMs) : ATTACK_END_RADIUS;
    const attackDiameter = attackRadius * 2;
    const safeOuterDiameter = SAFE_OUTER_RADIUS * 2;
    const safeInnerDiameter = SAFE_INNER_RADIUS * 2;
    const ringWrapDiameter = Math.max(220, (ATTACK_START_RADIUS + 18) * 2);
    const isInSafeZoneNow = attackRadius <= SAFE_OUTER_RADIUS && attackRadius >= SAFE_INNER_RADIUS;

    return (
        <div className="me-parry-container">
            <div className="me-parry-info">
                Difficulty {difficulty + 1} · tap when the attack ring is inside the safe band.
            </div>
            <div className="me-parry-ring-wrap" style={{ width: `${ringWrapDiameter}px`, height: `${ringWrapDiameter}px` }}>
                <div className="me-parry-safe-zone-outer" style={{ width: `${safeOuterDiameter}px`, height: `${safeOuterDiameter}px` }} />
                <div className="me-parry-safe-zone-inner" style={{ width: `${safeInnerDiameter}px`, height: `${safeInnerDiameter}px` }} />
                {!done && nextStrike && (
                    <div
                        className={`me-parry-attack-ring${isInSafeZoneNow ? ' in-zone' : ''}`}
                        style={{
                            width: `${attackDiameter}px`,
                            height: `${attackDiameter}px`,
                        }}
                    />
                )}
                <div className="me-parry-core">⚔</div>
            </div>
            <div className="me-rhythm-scoreboard">
                <span className="me-rhythm-stat perfect">Perfect {scoreBoard.perfect}</span>
                <span className="me-rhythm-stat good">Good {scoreBoard.good}</span>
                <span className="me-rhythm-stat miss">Miss {scoreBoard.miss}</span>
            </div>
            <div className={`me-rhythm-feedback${feedback ? ` ${feedback === 'PERFECT' ? 'hit' : feedback === 'GOOD' ? 'good' : 'miss'}` : ''}`}>
                {feedback}
            </div>
            <button className="me-parry-btn" onClick={handleParry} disabled={done || isSpectator}>
                {isSpectator ? 'WATCHING' : 'PARRY (Space)'}
            </button>
        </div>
    );
};

export default ParryChainEvent;

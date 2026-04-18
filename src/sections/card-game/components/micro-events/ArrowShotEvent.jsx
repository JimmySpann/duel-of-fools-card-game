import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Arrow Shots microevent
 * - Target moves around randomly and occasionally crosses center crosshair
 * - Player gets 3 shots and scores by shooting while target overlaps crosshair
 * - Scaled score: hits / totalShots
 */
const ArrowShotEvent = ({ context, isSpectator, liveInputs, onComplete, onInput }) => {
    const totalShots = Math.max(1, Number(context?.shots || 3));
    const speed = Math.max(0.12, Number(context?.speed || 0.25)); // arena units per second
    const targetRadius = Math.max(0.04, Number(context?.targetRadius || 0.1));
    const crosshairRadius = Math.max(0.05, Number(context?.crosshairRadius || 0.11));
    const centerBias = Math.max(0.05, Math.min(0.95, Number(context?.centerBias ?? 0.4)));
    const retargetMinMs = Math.max(200, Number(context?.retargetMinMs || 380));
    const retargetMaxMs = Math.max(retargetMinMs + 60, Number(context?.retargetMaxMs || 1000));

    const [pos, setPos] = useState({ x: 0.2, y: 0.4 });
    const [shotsFired, setShotsFired] = useState(0);
    const [hits, setHits] = useState(0);
    const [feedback, setFeedback] = useState('Time your shots when target crosses the crosshair.');
    const [done, setDone] = useState(false);
    const [spectatorFlash, setSpectatorFlash] = useState(false);

    const posRef = useRef(pos);
    const velRef = useRef({ x: speed, y: speed * 0.65 });
    const lastTsRef = useRef(null);
    const redirectAtRef = useRef(Date.now() + 500);
    const rafRef = useRef(null);
    const prevInputCountRef = useRef(0);

    const center = { x: 0.5, y: 0.5 };

    useEffect(() => {
        posRef.current = pos;
    }, [pos]);

    useEffect(() => {
        if (!isSpectator) return;
        const shots = liveInputs.filter((i) => i.inputType === 'arrowShot');
        if (shots.length > prevInputCountRef.current) {
            prevInputCountRef.current = shots.length;
            setSpectatorFlash(true);
            setTimeout(() => setSpectatorFlash(false), 180);
        }
    }, [liveInputs, isSpectator]);

    useEffect(() => {
        const retargetVelocity = () => {
            const current = posRef.current;
            const toCenterBias = Math.random() < centerBias;
            let dx;
            let dy;
            if (toCenterBias) {
                dx = center.x - current.x;
                dy = center.y - current.y;
            } else {
                const angle = Math.random() * Math.PI * 2;
                dx = Math.cos(angle);
                dy = Math.sin(angle);
            }
            const len = Math.hypot(dx, dy) || 1;
            const v = speed;
            velRef.current = { x: (dx / len) * v, y: (dy / len) * v };
        };

        retargetVelocity();

        const tick = (ts) => {
            if (done) return;
            if (lastTsRef.current == null) lastTsRef.current = ts;
            const dt = Math.min(40, ts - lastTsRef.current) / 1000;
            lastTsRef.current = ts;

            const next = {
                x: posRef.current.x + velRef.current.x * dt,
                y: posRef.current.y + velRef.current.y * dt,
            };

            const min = targetRadius;
            const max = 1 - targetRadius;

            if (next.x < min || next.x > max) {
                velRef.current.x *= -1;
                next.x = Math.max(min, Math.min(max, next.x));
            }
            if (next.y < min || next.y > max) {
                velRef.current.y *= -1;
                next.y = Math.max(min, Math.min(max, next.y));
            }

            if (Date.now() >= redirectAtRef.current) {
                retargetVelocity();
                redirectAtRef.current = Date.now() + (retargetMinMs + Math.random() * (retargetMaxMs - retargetMinMs));
            }

            posRef.current = next;
            setPos(next);
            rafRef.current = requestAnimationFrame(tick);
        };

        rafRef.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafRef.current);
    }, [done, speed, targetRadius, centerBias, retargetMinMs, retargetMaxMs]);

    const resolveIfDone = useCallback((nextShots, nextHits) => {
        if (nextShots < totalShots) return;
        setDone(true);
        const score = Math.max(0, Math.min(1, nextHits / totalShots));
        setFeedback(`Volley complete: ${nextHits}/${totalShots} hits`);
        setTimeout(() => onComplete({ success: nextHits > 0, score }), 350);
    }, [onComplete, totalShots]);

    const handleShoot = useCallback(() => {
        if (done || isSpectator || shotsFired >= totalShots) return;
        const p = posRef.current;
        const dist = Math.hypot(p.x - center.x, p.y - center.y);
        const hit = dist <= (targetRadius + crosshairRadius);

        const nextShots = shotsFired + 1;
        const nextHits = hit ? hits + 1 : hits;

        setShotsFired(nextShots);
        if (hit) {
            setHits(nextHits);
            setFeedback('Hit! Great timing.');
        } else {
            setFeedback('Miss! Wait for a cleaner crosshair pass.');
        }

        onInput({
            inputType: 'arrowShot',
            timestamp: Date.now(),
            shotIndex: nextShots - 1,
            hit,
            position: { x: p.x, y: p.y },
        });

        resolveIfDone(nextShots, nextHits);
    }, [done, isSpectator, shotsFired, totalShots, targetRadius, crosshairRadius, hits, onInput, resolveIfDone]);

    useEffect(() => {
        const onKey = (e) => {
            if (e.code === 'Space' || e.code === 'Enter') {
                e.preventDefault();
                handleShoot();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [handleShoot]);

    const targetStyle = {
        left: `${pos.x * 100}%`,
        top: `${pos.y * 100}%`,
        width: `${targetRadius * 200}%`,
        height: `${targetRadius * 200}%`,
    };

    const crosshairStyle = {
        width: `${crosshairRadius * 200}%`,
        height: `${crosshairRadius * 200}%`,
    };

    return (
        <div className="me-arrow-container">
            <div className="me-arrow-hud">
                <span>Shots: {shotsFired}/{totalShots}</span>
                <span>Hits: {hits}</span>
            </div>

            <div className="me-arrow-arena">
                <div className="me-arrow-crosshair" style={crosshairStyle} />
                <div className={`me-arrow-target${spectatorFlash ? ' flash' : ''}`} style={targetStyle} />
            </div>

            <div className="me-arrow-feedback">{isSpectator ? 'Watching shooter...' : feedback}</div>

            <button className="me-arrow-shoot-btn" disabled={done || isSpectator} onClick={handleShoot}>
                {isSpectator ? '👁 WATCHING' : `Shoot (Space) ${Math.max(0, totalShots - shotsFired)} left`}
            </button>
        </div>
    );
};

export default ArrowShotEvent;

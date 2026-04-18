import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Mana Route — repeat a highlighted node path in order.
 * Scaled: score = correctSteps / routeLength.
 */
const ManaRouteEvent = ({ context, isSpectator, liveInputs, onComplete, onInput }) => {
    const route = context?.route ?? [0, 1, 4, 7];
    const [phase, setPhase] = useState('show');
    const [litNode, setLitNode] = useState(null);
    const [inputIdx, setInputIdx] = useState(0);
    const [status, setStatus] = useState('Trace the route...');
    const [lastWrong, setLastWrong] = useState(null);
    const prevSpectatorRef = useRef(0);

    const nodeCoords = useMemo(
        () => Array.from({ length: 9 }, (_, i) => ({ id: i, x: i % 3, y: Math.floor(i / 3) })),
        []
    );

    useEffect(() => {
        let cancelled = false;
        const run = async () => {
            await delay(500);
            for (let i = 0; i < route.length; i++) {
                if (cancelled) return;
                setLitNode(route[i]);
                await delay(420);
                if (cancelled) return;
                setLitNode(null);
                await delay(120);
            }
            if (cancelled) return;
            setPhase('input');
            setStatus(isSpectator ? 'Watching route input...' : 'Your turn: repeat the route');
        };
        run();
        return () => { cancelled = true; };
    }, [route, isSpectator]);

    useEffect(() => {
        if (!isSpectator || phase !== 'input') return;
        const presses = liveInputs.filter((i) => i.inputType === 'routeNode');
        if (presses.length > prevSpectatorRef.current) {
            const last = presses[presses.length - 1];
            prevSpectatorRef.current = presses.length;
            setLitNode(last.nodeIndex);
            setTimeout(() => setLitNode(null), 180);
        }
    }, [liveInputs, isSpectator, phase]);

    const finish = (correctSteps) => {
        const score = correctSteps / route.length;
        setPhase('done');
        onComplete({ success: score >= 0.34, score });
    };

    const handleNode = (nodeIndex) => {
        if (phase !== 'input' || isSpectator) return;
        onInput({ inputType: 'routeNode', nodeIndex, timestamp: Date.now() });

        const expected = route[inputIdx];
        if (nodeIndex !== expected) {
            setLastWrong(nodeIndex);
            setStatus('Route broke!');
            setTimeout(() => finish(inputIdx), 250);
            return;
        }

        const next = inputIdx + 1;
        setInputIdx(next);
        if (next >= route.length) {
            setStatus('Route complete!');
            setTimeout(() => finish(route.length), 250);
        } else {
            setStatus(`${next}/${route.length} nodes`);
        }
    };

    return (
        <div className="me-route-container">
            <div className="me-route-status">{status}</div>
            <div className="me-route-grid">
                {nodeCoords.map((n) => {
                    const isLit = litNode === n.id;
                    const isWrong = lastWrong === n.id;
                    return (
                        <button
                            key={n.id}
                            className={`me-route-node${isLit ? ' lit' : ''}${isWrong ? ' wrong' : ''}`}
                            onClick={() => handleNode(n.id)}
                            disabled={phase !== 'input' || isSpectator}
                            aria-label={`node-${n.id}`}
                        />
                    );
                })}
            </div>
            {phase === 'input' && !isSpectator && (
                <div className="me-route-progress">Step {Math.min(inputIdx + 1, route.length)} / {route.length}</div>
            )}
        </div>
    );
};

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

export default ManaRouteEvent;

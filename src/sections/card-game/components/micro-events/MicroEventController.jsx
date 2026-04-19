import { useState, useEffect } from 'react';
import { getSocket } from '../../../../features/chat/socket';
import MicroEventOverlay from './MicroEventOverlay';

const MicroEventController = ({ gameId, myPlayerId }) => {
    const [microeventContext, setMicroeventContext] = useState(null);
    const [liveInputs, setLiveInputs] = useState([]);

    useEffect(() => {
        if (!gameId) return;
        const socket = getSocket();
        if (!socket) return;

        const handleState = (state) => {
            if (state.phase !== 'microevent') {
                setMicroeventContext(null);
                setLiveInputs([]);
            }
        };
        const handleStart = (ctx) => {
            setLiveInputs([]);
            setMicroeventContext(ctx);
        };
        const handleInput = (payload) => {
            setLiveInputs((prev) => [...prev, payload]);
        };

        socket.on('game:state', handleState);
        socket.on('game:microevent:start', handleStart);
        socket.on('game:microevent:input', handleInput);

        return () => {
            socket.off('game:state', handleState);
            socket.off('game:microevent:start', handleStart);
            socket.off('game:microevent:input', handleInput);
        };
    }, [gameId]);

    if (!microeventContext) return null;

    return (
        <MicroEventOverlay
            context={microeventContext}
            liveInputs={liveInputs}
            isSpectator={microeventContext.casterPlayerId !== myPlayerId}
            onComplete={(result) => {
                const socket = getSocket();
                if (socket) socket.emit('game:microevent:result', { gameId, ...result });
            }}
            onInput={(payload) => {
                const socket = getSocket();
                if (socket) socket.emit('game:microevent:input', { gameId, ...payload });
                setLiveInputs((prev) => [...prev, payload]);
            }}
        />
    );
};

export default MicroEventController;

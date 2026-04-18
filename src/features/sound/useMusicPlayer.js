import { useState, useEffect } from 'react';
import musicManager from './musicManager';

/**
 * React hook that subscribes to the musicManager singleton.
 * Returns current player state + bound control functions.
 */
const useMusicPlayer = () => {
    const [state, setState] = useState(musicManager.getState());

    useEffect(() => {
        const unsub = musicManager.subscribe(setState);
        return unsub;
    }, []);

    return {
        ...state,
        tracks: musicManager.TRACKS,
        toggle: () => musicManager.toggle(),
        setTrack: (i) => musicManager.setTrack(i),
        next: () => musicManager.next(),
        prev: () => musicManager.prev(),
        setVolume: (v) => musicManager.setVolume(v),
    };
};

export default useMusicPlayer;

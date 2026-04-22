import { useMemo } from 'react';
import { BACKGROUND_GROUPS, BACKGROUND_BASE } from '../config/features';

/**
 * Returns a stable random background-image style object for the given group.
 * The image is chosen once per component mount and does not change on re-render.
 *
 * Usage:
 *   const bgStyle = useBackground('auth');
 *   <div style={bgStyle}>…</div>
 *
 * To add more backgrounds: edit BACKGROUND_GROUPS in src/config/features.js.
 *
 * @param {'auth'|'sessions'|'lobby'|'game'|string} group
 * @returns {React.CSSProperties}
 */
const useBackground = (group) => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return useMemo(() => {
        const options = BACKGROUND_GROUPS[group];
        if (!options || options.length === 0) return {};
        const name = options[Math.floor(Math.random() * options.length)];
        return {
            backgroundImage: `url(${BACKGROUND_BASE}${name})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center center',
            backgroundAttachment: 'scroll',
            backgroundRepeat: 'no-repeat',
        };
    }, []); // intentionally empty — pick once on mount
};

export default useBackground;

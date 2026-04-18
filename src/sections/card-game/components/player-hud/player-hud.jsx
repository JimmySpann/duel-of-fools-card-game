import './player-hud.css';

import fireIcon from '../../../../assets/elements/fire-icon.png';
import iceIcon from '../../../../assets/elements/ice-icon.png';
import earthIcon from '../../../../assets/elements/earth-icon.png';
import airIcon from '../../../../assets/elements/air-icon.png';
import electricIcon from '../../../../assets/elements/lightning-icon.png';
import waterIcon from '../../../../assets/elements/water-icon.png';
import deathIcon from '../../../../assets/elements/death-icon.png';


const PlayerHUD = ({ player, isCurrentUser }) => {
    const fallbackAvatar = `https://i.pravatar.cc/64?u=${encodeURIComponent(player?.name || 'player')}`;

    const hpPercent = player.maxHealth > 0 ? Math.max(0, Math.min(100, (player.health / player.maxHealth) * 100)) : 0;

    const getHealthPalette = () => {
        if (hpPercent <= 0) {
            return {
                railBackground: 'rgba(0, 0, 0, 0.2)',
                railGlow: 'none',
                crestBorder: '#5d616f',
            };
        }

        const r = hpPercent - 50 > 0 ? (255 / 50) * (50 - (hpPercent - 50)) : 255;
        const g = hpPercent < 50 ? (255 / 50) * hpPercent : 255;
        const color = `${Math.floor(r)}, ${Math.floor(g)}, 0`;

        return {
            railBackground: `linear-gradient(to right, rgba(${color}, 0.95), rgba(${color}, 0.45))`,
            railGlow: `0 0 10px rgba(${color}, 0.68)`,
            crestBorder: `rgba(${color}, 0.88)`,
        };
    };

    const palette = getHealthPalette();

    const getElementIcon = (element) => {
        switch (element) {
            case 'fire':
                return fireIcon;
            case 'ice':
                return iceIcon;
            case 'earth':
                return earthIcon;
            case 'air':
                return airIcon;
            case 'electric':
                return electricIcon;
            case 'water':
                return waterIcon;
            case 'death':
                return deathIcon;
            // Add cases for other elements like earth, air, etc.
            default:
                return null;
        }
    };

    const processElements = () => {
        let elementArray = [];
        for (const [key, value] of Object.entries(player.elements ?? {})) {
            for (let i = 0; i < value; i++) {
                elementArray.push(key);
            }
        }
        let normalCount = player.elements?.['normal'] || 0;
        elementArray = elementArray.filter((el) => el !== 'normal');
        return { elementArray, normalCount };
    }
    const { elementArray, normalCount } = processElements();

    return (
        <div className='hud-container'>
            <div className="hud-elements">
                <div className='card-elements'>
                    {elementArray.map((type, index) => (
                        <div className="card-elements-icon" key={index}>
                            <img src={getElementIcon(type)} className="card-elements-icon-image" alt={`${type} element`} />
                        </div>
                    ))}
                    {normalCount > 0 && (
                        <div className="card-elements-icon" style={{ backgroundColor: 'gray', textAlign: 'center', fontWeight: 'bold' }}>
                            {normalCount}
                        </div>
                    )}
                </div>
            </div>
            <div className="hud-card">
                <img
                    className="profile-image"
                    src={player.image || fallbackAvatar}
                    alt={`${player.name} avatar`}
                    onError={(e) => { e.currentTarget.src = fallbackAvatar; }}
                />
                <div className="hud-main">
                    <div className="hud-top-row">
                        <div className="name">{player.name} {isCurrentUser ? '(You)' : ''}</div>
                        <div className="battler-count" title="Battlers in play">⚔ {player.inPlay?.length ?? 0}</div>
                    </div>

                    <div className="hud-health-crest-wrap">
                        <div className="hud-rail hud-rail-left">
                            <div
                                className="hud-rail-fill hud-rail-fill-left"
                                style={{
                                    width: `${hpPercent}%`,
                                    background: palette.railBackground,
                                    boxShadow: palette.railGlow,
                                }}
                            />
                        </div>

                        <div className="hud-crest" style={{ borderColor: palette.crestBorder, boxShadow: palette.railGlow }}>
                            <div className="hud-crest-hp">HP {player.health}/{player.maxHealth}</div>
                        </div>

                        <div className="hud-rail hud-rail-right">
                            <div
                                className="hud-rail-fill hud-rail-fill-right"
                                style={{
                                    width: `${hpPercent}%`,
                                    background: palette.railBackground,
                                    boxShadow: palette.railGlow,
                                }}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default PlayerHUD;
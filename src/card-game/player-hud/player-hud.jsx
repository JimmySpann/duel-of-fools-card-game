import './player-hud.css';
import fireIcon from '../../assets/elements/fire-icon.png';
import iceIcon from '../../assets/elements/ice-icon.png';
import earthIcon from '../../assets/elements/earth-icon.png';
import airIcon from '../../assets/elements/air-icon.png';
import electricIcon from '../../assets/elements/lightning-icon.png';
import waterIcon from '../../assets/elements/water-icon.png';
import deathIcon from '../../assets/elements/death-icon.png';

const PlayerHUD = ({ player }) => {
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
        for (const [key, value] of Object.entries(player.elements)) {
            for (let i = 0; i < value; i++) {
                elementArray.push(key);
            }
        }
        let normalCount = player.elements['normal'] || 0;
        elementArray = elementArray.filter((el) => el !== 'normal');
        return { elementArray, normalCount };
    }
    const { elementArray, normalCount } = processElements();

    return (
        <div className='hud-container'>
            <div className="hud-card">
                <div className="hud-elements">
                    <div className='card-elements'>
                        {elementArray.map((type, index) => (
                            <div className="card-elements-icon" key={index}>
                                <img src={getElementIcon(type)} className="card-elements-icon-image" />
                            </div>
                        ))}
                        {normalCount > 0 && (
                            <div className="card-elements-icon" style={{ backgroundColor: 'gray', textAlign: 'center', fontWeight: 'bold' }}>
                                {normalCount}
                            </div>
                        )}
                    </div>
                </div>
                <img className="profile-image" src={player.image} />
                <div style={{
                    width: '100%',
                    display: 'flex',
                    justifyContent: 'space-between'
                }}>
                    <div className="name">{player.name}</div>
                    <div className="health">HP {player.health}/{player.maxHealth}</div>
                </div>
            </div>
        </div>
    )
}

export default PlayerHUD;
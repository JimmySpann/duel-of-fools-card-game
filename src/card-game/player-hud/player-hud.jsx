import './player-hud.css';

const PlayerHUD = ({ name, image, health, maxHealth }) => {
    return (
        <div className='hud-container'>
            <div className="hud-card">
                <img className="profile-image" src={image} />
                <div style={{
                    width: '100%',
                    display: 'flex',
                    justifyContent: 'space-between'
                }}>
                    <div className="name">{name}</div>
                    <div className="health">HP {health}/{maxHealth}</div>
                </div>
            </div>
        </div>
    )
}

export default PlayerHUD;
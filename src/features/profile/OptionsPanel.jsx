import { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
    updateProfile,
    setSoundVolume,
    setCardDanceEnabled,
    setCardDanceIntensity,
    setCensorAdultCards,
    setCardFlipEnabled,
} from './profileSlice';
import sounds from '../sound/soundManager';
import useMusicPlayer from '../sound/useMusicPlayer';

const OptionsPanel = () => {
    const dispatch = useDispatch();
    const { soundVolume, cardDanceEnabled, cardDanceIntensity, cardFlipEnabled, censorAdultCards } = useSelector((s) => s.profile);
    const [localVolume, setLocalVolume] = useState(soundVolume ?? 0.7);
    const music = useMusicPlayer();

    // Keep sound manager in sync with stored volume on mount
    useEffect(() => {
        sounds.setVolume(soundVolume ?? 0.7);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div className="profile-section">
            {/* ── Sound Effects ── */}
            <div className="profile-notif-section">
                <div className="profile-subsection-title" style={{ marginBottom: '0.5rem' }}>
                    Sound Effects
                </div>

                <div className="profile-toggle-row">
                    <span className="profile-toggle-label">
                        Sound effects
                        <span className="profile-toggle-hint">Plays sounds for attacks, abilities &amp; turns</span>
                    </span>
                    <button
                        type="button"
                        className={`profile-toggle ${localVolume > 0 ? 'on' : 'off'}`}
                        onClick={() => {
                            const next = localVolume > 0 ? 0 : (soundVolume > 0 ? soundVolume : 0.7);
                            setLocalVolume(next);
                            sounds.setVolume(next);
                            dispatch(setSoundVolume(next));
                        }}
                        aria-label="Toggle sound effects"
                    >
                        <span className="profile-toggle-knob" />
                    </button>
                </div>

                <div className="profile-volume-row">
                    <span className="profile-volume-label">Volume</span>
                    <div className="profile-volume-slider-wrap">
                        <span className="profile-volume-icon">🔇</span>
                        <input
                            className="profile-volume-slider"
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={localVolume}
                            onChange={(e) => {
                                const v = parseFloat(e.target.value);
                                setLocalVolume(v);
                                sounds.setVolume(v);
                                dispatch(setSoundVolume(v));
                            }}
                        />
                        <span className="profile-volume-icon">🔊</span>
                    </div>
                    <span className="profile-volume-pct">{Math.round(localVolume * 100)}%</span>
                </div>

                <button
                    type="button"
                    className="profile-save-btn"
                    style={{ marginTop: '0.25rem' }}
                    onClick={() => sounds.hit()}
                >
                    Test Sound
                </button>
            </div>

            {/* ── Background Music ── */}
            <div className="profile-notif-section" style={{ marginTop: '1.25rem' }}>
                <div className="profile-subsection-title" style={{ marginBottom: '0.5rem' }}>
                    Background Music
                </div>

                <div className="profile-toggle-row">
                    <span className="profile-toggle-label">
                        Music
                        <span className="profile-toggle-hint">Background playlist during gameplay</span>
                    </span>
                    <button
                        type="button"
                        className={`profile-toggle ${music.playing ? 'on' : 'off'}`}
                        onClick={() => music.toggle()}
                        aria-label="Toggle background music"
                    >
                        <span className="profile-toggle-knob" />
                    </button>
                </div>

                <div className="profile-toggle-row">
                    <span className="profile-toggle-label">
                        Card dance
                        <span className="profile-toggle-hint">In-game board cards react to music</span>
                    </span>
                    <button
                        type="button"
                        className={`profile-toggle ${cardDanceEnabled ? 'on' : 'off'}`}
                        onClick={() => dispatch(setCardDanceEnabled(!cardDanceEnabled))}
                        aria-label="Toggle card dance"
                    >
                        <span className="profile-toggle-knob" />
                    </button>
                </div>

                <div className="profile-volume-row">
                    <span className="profile-volume-label">Card dance intensity</span>
                    <div className="profile-volume-slider-wrap">
                        <span className="profile-volume-icon">🕺</span>
                        <input
                            className="profile-volume-slider"
                            type="range"
                            min="0.1"
                            max="1.5"
                            step="0.05"
                            value={cardDanceIntensity}
                            disabled={!cardDanceEnabled}
                            onChange={(e) => dispatch(setCardDanceIntensity(parseFloat(e.target.value)))}
                        />
                        <span className="profile-volume-icon">🔥</span>
                    </div>
                    <span className="profile-volume-pct">{Math.round(cardDanceIntensity * 100)}%</span>
                </div>

                <div className="profile-toggle-row">
                    <span className="profile-toggle-label">
                        Card flipping
                        <span className="profile-toggle-hint">360° card flips during card dance</span>
                    </span>
                    <button
                        type="button"
                        className={`profile-toggle ${cardFlipEnabled ? 'on' : 'off'}`}
                        onClick={() => dispatch(setCardFlipEnabled(!cardFlipEnabled))}
                        disabled={!cardDanceEnabled}
                        aria-label="Toggle card flipping"
                    >
                        <span className="profile-toggle-knob" />
                    </button>
                </div>

                <div className="profile-volume-row">
                    <span className="profile-volume-label">Volume</span>
                    <div className="profile-volume-slider-wrap">
                        <span className="profile-volume-icon">🔇</span>
                        <input
                            className="profile-volume-slider"
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={music.volume}
                            onChange={(e) => music.setVolume(parseFloat(e.target.value))}
                        />
                        <span className="profile-volume-icon">🔊</span>
                    </div>
                    <span className="profile-volume-pct">{Math.round(music.volume * 100)}%</span>
                </div>

                <div className="music-controls">
                    <button className="music-ctrl-btn" onClick={() => music.prev()} title="Previous">⏮</button>
                    <button className="music-ctrl-btn music-ctrl-play" onClick={() => music.toggle()} title={music.playing ? 'Pause' : 'Play'}>
                        {music.playing ? '⏸' : '▶'}
                    </button>
                    <button className="music-ctrl-btn" onClick={() => music.next()} title="Next">⏭</button>
                </div>

                <div className="music-track-list">
                    {music.tracks.map((track, i) => (
                        <button
                            key={i}
                            className={`music-track-item${i === music.currentIndex ? ' active' : ''}`}
                            onClick={() => {
                                music.setTrack(i);
                                if (!music.playing) music.toggle();
                            }}
                        >
                            <span className="music-track-icon">
                                {i === music.currentIndex && music.playing ? '🎵' : '🎶'}
                            </span>
                            <span className="music-track-name">{track.name}</span>
                            {i === music.currentIndex && (
                                <span className="music-track-badge">{music.playing ? 'Now Playing' : 'Paused'}</span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            <div className="profile-notif-section" style={{ marginTop: '1.25rem' }}>
                <div className="profile-subsection-title" style={{ marginBottom: '0.5rem' }}>
                    Content
                </div>

                <div className="profile-toggle-row">
                    <span className="profile-toggle-label">
                        Censor adults-only cards
                        <span className="profile-toggle-hint">Hide adults-only card art and text in game, deck builder, and card views</span>
                    </span>
                    <button
                        type="button"
                        className={`profile-toggle ${censorAdultCards ? 'on' : 'off'}`}
                        onClick={() => {
                            const next = !censorAdultCards;
                            dispatch(setCensorAdultCards(next));
                            dispatch(updateProfile({ censorAdultCards: next }));
                        }}
                        aria-label="Toggle adults-only card censorship"
                    >
                        <span className="profile-toggle-knob" />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default OptionsPanel;

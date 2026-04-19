import { useState, useRef, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { login, signup, clearAuthError } from '../../features/auth/authSlice';
import musicManager from '../../features/sound/musicManager';
import useMusicPlayer from '../../features/sound/useMusicPlayer';
import './auth.css';

const Auth = () => {
    const dispatch = useDispatch();
    const { loading, error } = useSelector((s) => s.auth);
    const [mode, setMode] = useState('login'); // 'login' | 'signup'
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [localError, setLocalError] = useState('');
    const music = useMusicPlayer();
    const triedAutoplay = useRef(false);

    const [logoPulse, setLogoPulse] = useState(1);

    useEffect(() => {
        let raf;
        let smooth = 0;
        const tick = () => {
            const raw = musicManager.getReactiveLevel();
            smooth += (raw - smooth) * 0.2;
            const bpm = Math.max(60, musicManager.getCurrentBPM() || 120);
            const time = musicManager.getCurrentTime();
            const beatPhase = (time * bpm / 60) % 1;
            const beatPeak = Math.max(0, 1 - beatPhase * 3.5);
            const gated = Math.max(0, smooth - 0.28) / 0.72;
            setLogoPulse(1 + gated * beatPeak * 0.09);
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, []);

    // Start music on first user interaction (browsers block autoplay before that)
    const handleFirstInteraction = () => {
        if (!triedAutoplay.current) {
            triedAutoplay.current = true;
            musicManager.autoPlay();
        }
    };

    const switchMode = (m) => {
        setMode(m);
        setLocalError('');
        dispatch(clearAuthError());
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        setLocalError('');
        if (mode === 'signup') {
            if (password !== confirm) return setLocalError('Passwords do not match');
            dispatch(signup({ username, password }));
        } else {
            dispatch(login({ username, password }));
        }
    };

    const displayError = localError || error;

    return (
        <div className="auth-backdrop" onClick={handleFirstInteraction}>
            {/* Floating mute button */}
            <button
                className={`auth-music-btn ${music.playing ? 'on' : 'off'}`}
                title={music.playing ? 'Mute music' : 'Play music'}
                onClick={(e) => { e.stopPropagation(); musicManager.toggle(); }}
            >
                {music.playing ? '🎵' : '🔇'}
            </button>

            <div className="auth-card">
                <div className="auth-logo-wrap">
                    <img
                        src="/img/Logo.png"
                        alt="Duel of Fools"
                        className="auth-logo-img"
                        style={{
                            transform: `scale(${logoPulse.toFixed(4)})`,
                        }}
                    />
                </div>

                <div className="auth-tabs">
                    <button
                        className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
                        onClick={() => switchMode('login')}
                    >
                        Log In
                    </button>
                    <button
                        className={`auth-tab ${mode === 'signup' ? 'active' : ''}`}
                        onClick={() => switchMode('signup')}
                    >
                        Sign Up
                    </button>
                </div>

                <form className="auth-form" onSubmit={handleSubmit}>
                    <label className="auth-label">
                        Username
                        <input
                            className="auth-input"
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            autoComplete="username"
                            required
                        />
                    </label>

                    <label className="auth-label">
                        Password
                        <input
                            className="auth-input"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                            required
                        />
                    </label>

                    {mode === 'signup' && (
                        <label className="auth-label">
                            Confirm Password
                            <input
                                className="auth-input"
                                type="password"
                                value={confirm}
                                onChange={(e) => setConfirm(e.target.value)}
                                autoComplete="new-password"
                                required
                            />
                        </label>
                    )}

                    {displayError && <p className="auth-error">{displayError}</p>}

                    <button className="auth-submit" type="submit" disabled={loading}>
                        {loading ? 'Please wait…' : mode === 'login' ? 'Log In' : 'Create Account'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default Auth;

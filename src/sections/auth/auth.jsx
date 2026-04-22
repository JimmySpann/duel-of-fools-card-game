import { useState, useRef, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { login, signup, clearAuthError } from '../../features/auth/authSlice';
import musicManager from '../../features/sound/musicManager';
import useMusicPlayer from '../../features/sound/useMusicPlayer';
import useBackground from '../../utils/useBackground';
import './auth.css';

const Auth = ({ initialMode = 'login' }) => {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const { loading, error } = useSelector((s) => s.auth);
    const [mode, setMode] = useState(initialMode); // 'login' | 'signup'

    // Sync mode when navigating between /login and /signup
    useEffect(() => {
        setMode(initialMode);
    }, [initialMode]);
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
        setLocalError('');
        dispatch(clearAuthError());
        navigate(m === 'signup' ? '/signup' : '/login');
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        setLocalError('');
        if (mode === 'signup') {
            if (password !== confirm) return setLocalError('Passwords do not match');
            dispatch(signup({ username, password })).then((res) => {
                if (!res.error) navigate('/');
            });
        } else {
            dispatch(login({ username, password })).then((res) => {
                if (!res.error) navigate('/');
            });
        }
    };

    const displayError = localError || error;
    const bgStyle = useBackground('auth');

    return (
        <div className="auth-backdrop" style={bgStyle} onClick={handleFirstInteraction}>
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

                    {mode === 'signup' && (
                        <div className="auth-warning" style={{ color: '#e67e22', fontWeight: 500, marginBottom: 8, fontSize: '0.97em' }}>
                            Beta Notice: For your security, please use a unique password you don’t use anywhere else. This game is in beta and not intended for sensitive credentials.
                        </div>
                    )}
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

import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { login, signup, clearAuthError } from '../../features/auth/authSlice';
import './auth.css';

const Auth = () => {
    const dispatch = useDispatch();
    const { loading, error } = useSelector((s) => s.auth);
    const [mode, setMode] = useState('login'); // 'login' | 'signup'
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [localError, setLocalError] = useState('');

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
        <div className="auth-backdrop">
            <div className="auth-card">
                <div className="auth-logo-wrap">
                    <img src="/img/Logo.png" alt="Duel of Fools" className="auth-logo-img" />
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

import { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom';
import { validateToken } from './features/auth/authSlice';
import { pollSession, fetchSessionById, leaveSession, leaveSessionLobby, deleteSession, startSession } from './features/sessions/sessionsSlice';
import { clearChat } from './features/chat/chatSlice';
import { fetchProfile, resetProfile } from './features/profile/profileSlice';
import { connectSocket, disconnectSocket } from './features/chat/socket';
import { setGameState } from './sections/card-game/database/cardGameSlice';
import musicManager from './features/sound/musicManager';
import Auth from './sections/auth/auth.jsx';
import Sessions, { Lobby } from './sections/sessions/sessions.jsx';
import CardGame from './sections/card-game/card-game.jsx';
import DMPanel from './features/chat/DMPanel';
import './App.css';

const POLL_INTERVAL = 3000;

// ── PrivateRoute ──────────────────────────────────────────────────────────────
// Renders children when authenticated; redirects to /login while not validated yet returns null.
const PrivateRoute = ({ children }) => {
  const { token, validated } = useSelector((s) => s.auth);
  if (!validated) return null;
  if (!token) return <Navigate to="/login" replace />;
  return children;
};

// ── GamePage ──────────────────────────────────────────────────────────────────
// Handles /game/:id — loads the session, shows Lobby until game starts, then CardGame.
const GamePage = () => {
  const { id } = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { activeSession, activeGameId, loading } = useSelector((s) => s.sessions);
  const { username } = useSelector((s) => s.auth);

  // Load or re-load the session whenever the id changes
  useEffect(() => {
    if (!activeSession || activeSession._id !== id) {
      dispatch(fetchSessionById(id));
    }
  }, [id, dispatch]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll while in lobby (no active game)
  useEffect(() => {
    if (!activeSession || activeSession._id !== id || activeGameId) return;
    const timer = setInterval(() => {
      dispatch(pollSession({ sessionId: id }));
    }, POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [activeSession, activeGameId, id, dispatch]);

  if (activeGameId && activeSession?._id === id) {
    return <CardGame />;
  }

  if (!activeSession || activeSession._id !== id) {
    return loading ? null : <Navigate to="/" replace />;
  }

  const handleBack = () => {
    dispatch(leaveSession());
    navigate('/');
  };

  return (
    <div className="sessions-backdrop">
      <Lobby
        session={activeSession}
        username={username}
        loading={loading}
        error={null}
        onBack={handleBack}
        onStart={() => {
          dispatch(startSession({ sessionId: id })).then((res) => {
            if (res.payload?.state) dispatch(setGameState(res.payload.state));
          });
        }}
        onLeave={() => {
          dispatch(leaveSessionLobby({ sessionId: id })).then((res) => {
            if (!res.error) handleBack();
          });
        }}
        onDelete={() => {
          dispatch(deleteSession({ sessionId: id })).then((res) => {
            if (!res.error) handleBack();
          });
        }}
        dispatch={dispatch}
      />
      <DMPanel />
    </div>
  );
};

// ── App ───────────────────────────────────────────────────────────────────────
function App() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { token, validated } = useSelector((s) => s.auth);
  const { activeGameId } = useSelector((s) => s.sessions);

  // Validate any stored token on first load
  useEffect(() => {
    if (!validated) {
      dispatch(validateToken());
    }
  }, [validated, dispatch]);

  // Deep-link: ?session=ID → navigate to /game/:id
  useEffect(() => {
    if (!validated || !token) return;
    const params = new URLSearchParams(window.location.search);
    const sessionParam = params.get('session');
    if (sessionParam) {
      navigate(`/game/${sessionParam}`, { replace: true });
    }
  }, [validated, token, navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Service-worker postMessage: NAVIGATE_TO_GAME → navigate to /game/:id
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const handler = (event) => {
      if (event.data?.type !== 'NAVIGATE_TO_GAME') return;
      const url = new URL(event.data.url, window.location.origin);
      const sessionId = url.searchParams.get('session');
      if (sessionId) navigate(`/game/${sessionId}`);
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, [navigate]);

  // Connect / disconnect socket when token changes
  useEffect(() => {
    if (token) {
      connectSocket(token);
      dispatch(fetchProfile());
    } else {
      disconnectSocket();
      dispatch(clearChat());
      dispatch(resetProfile());
    }
  }, [token, dispatch]);

  // Start music on first user interaction
  useEffect(() => {
    const handler = () => {
      musicManager.autoPlay();
      document.removeEventListener('click', handler, true);
      document.removeEventListener('keydown', handler, true);
    };
    document.addEventListener('click', handler, true);
    document.addEventListener('keydown', handler, true);
    return () => {
      document.removeEventListener('click', handler, true);
      document.removeEventListener('keydown', handler, true);
    };
  }, []);

  // Re-attempt music autoplay when view changes
  useEffect(() => {
    musicManager.autoPlay();
  }, [token, activeGameId]);

  // Wait until token validation is done
  if (!validated) return null;

  return (
    <Routes>
      <Route path="/login" element={token ? <Navigate to="/" replace /> : <Auth initialMode="login" />} />
      <Route path="/signup" element={token ? <Navigate to="/" replace /> : <Auth initialMode="signup" />} />
      <Route path="/" element={<PrivateRoute><Sessions /></PrivateRoute>} />
      <Route path="/deck-builder" element={<PrivateRoute><Sessions initialModal="deck-builder" /></PrivateRoute>} />
      <Route path="/card-creator" element={<PrivateRoute><Sessions initialModal="card-creator" /></PrivateRoute>} />
      <Route path="/gallery" element={<PrivateRoute><Sessions initialModal="gallery" /></PrivateRoute>} />
      <Route path="/rules" element={<PrivateRoute><Sessions initialModal="rules" /></PrivateRoute>} />
      <Route path="/game/:id" element={<PrivateRoute><GamePage /></PrivateRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;



import { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { validateToken } from './features/auth/authSlice';
import { pollSession, fetchSessionById } from './features/sessions/sessionsSlice';
import { clearChat } from './features/chat/chatSlice';
import { fetchProfile, resetProfile } from './features/profile/profileSlice';
import { connectSocket, disconnectSocket } from './features/chat/socket';
import musicManager from './features/sound/musicManager';
import Auth from './sections/auth/auth.jsx';
import Sessions from './sections/sessions/sessions.jsx';
import CardGame from './sections/card-game/card-game.jsx';
import './App.css';

const POLL_INTERVAL = 3000;

function App() {
  const dispatch = useDispatch();
  const { token, validated } = useSelector((s) => s.auth);
  const { activeGameId, activeSession } = useSelector((s) => s.sessions);

  // Validate any stored token on first load to clear stale sessions
  useEffect(() => {
    if (!validated) {
      dispatch(validateToken());
    }
  }, [validated, dispatch]);

  // Deep-link: notification click passes ?session=X&game=Y in the URL
  useEffect(() => {
    if (!validated || !token) return;
    const params = new URLSearchParams(window.location.search);
    const sessionParam = params.get('session');
    if (sessionParam) {
      dispatch(fetchSessionById(sessionParam));
      // Clean up URL without reload
      const clean = window.location.pathname;
      window.history.replaceState(null, '', clean);
    }
  }, [validated, token, dispatch]);

  // Service-worker postMessage: handle NAVIGATE_TO_GAME when app is already open
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const handler = (event) => {
      if (event.data?.type !== 'NAVIGATE_TO_GAME') return;
      const url = new URL(event.data.url, window.location.origin);
      const sessionId = url.searchParams.get('session');
      if (sessionId) dispatch(fetchSessionById(sessionId));
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, [dispatch]);

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

  // Start music on first user interaction — covers all pages
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

  // Re-attempt when switching views (auth ↔ sessions ↔ game)
  useEffect(() => {
    musicManager.autoPlay();
  }, [token, activeGameId]);

  // While in lobby (no game yet), poll so non-host sees the game start
  useEffect(() => {
    if (!activeSession || activeGameId) return;
    const id = setInterval(() => {
      dispatch(pollSession({ sessionId: activeSession._id }));
    }, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [activeSession, activeGameId, dispatch]);

  // Wait until token validation is done before deciding what to show
  if (!validated) return null;

  if (!token) return <Auth />;
  if (!activeGameId) return <Sessions />;
  return <CardGame />;
}

export default App;



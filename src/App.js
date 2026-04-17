import { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { validateToken } from './features/auth/authSlice';
import { pollSession } from './features/sessions/sessionsSlice';
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


import { configureStore } from '@reduxjs/toolkit';
import counterReducer from '../features/counter/counterSlice';
import cardGameReducer from '../sections/card-game/database/cardGameSlice';
import authReducer from '../features/auth/authSlice';
import sessionsReducer from '../features/sessions/sessionsSlice';
import chatReducer from '../features/chat/chatSlice';
import profileReducer from '../features/profile/profileSlice';
import { getSocket } from '../features/chat/socket';

// Actions that should never be forwarded to the server (local-only)
const LOCAL_ONLY_ACTIONS = new Set(['cardGame/setGameState', 'cardGame/resetGame']);

/**
 * Middleware: when an active online game exists, intercept cardGame actions
 * and emit them via socket for the server to process authoritatively.
 * The action is ALSO applied to local state (optimistic update) so the UI
 * responds immediately. When the server broadcasts back 'game:state', the
 * setGameState reducer replaces local state with the canonical server copy.
 */
const onlineGameMiddleware = (store) => (next) => (action) => {
  const activeGameId = store.getState().sessions?.activeGameId;

  if (
    activeGameId &&
    typeof action.type === 'string' &&
    action.type.startsWith('cardGame/') &&
    !LOCAL_ONLY_ACTIONS.has(action.type)
  ) {
    const socket = getSocket();
    if (socket?.connected) {
      const type = action.type.replace('cardGame/', '');
      socket.emit('game:action', { gameId: activeGameId, type, payload: action.payload ?? {} });
      // Fall through to next(action) so local state updates optimistically.
      // The server's authoritative 'game:state' broadcast will overwrite shortly after.
    }
  }

  return next(action);
};

export const store = configureStore({
  reducer: {
    counter: counterReducer,
    cardGame: cardGameReducer,
    auth: authReducer,
    sessions: sessionsReducer,
    chat: chatReducer,
    profile: profileReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(onlineGameMiddleware),
});

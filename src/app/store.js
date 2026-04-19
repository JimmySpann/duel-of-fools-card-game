import { configureStore } from '@reduxjs/toolkit';
import cardGameReducer, { ABILITY_TARGETS, getAbilityTargetType } from '../sections/card-game/database/cardGameSlice';
import authReducer from '../features/auth/authSlice';
import sessionsReducer from '../features/sessions/sessionsSlice';
import chatReducer from '../features/chat/chatSlice';
import profileReducer from '../features/profile/profileSlice';
import { getSocket } from '../features/chat/socket';

// Actions that should never be forwarded to the server (local-only)
const LOCAL_ONLY_ACTIONS = new Set(['cardGame/setGameState', 'cardGame/resetGame']);

// Returns true if this action will be intercepted by the server to hold for a
// microevent — meaning we must NOT apply it optimistically, or the hit will
// appear on-screen before the minigame even starts.
const wouldTriggerMicroevent = (type, payload, cardGameState) => {
  const state = cardGameState;
  const cp = state.players?.find((p) => p.id === state.currentTurn);
  if (!cp) return false;

  if (type === 'resolveOnEnemyCard' || type === 'resolveOnAllyCard') {
    const pa = state.pendingAction;
    if (!pa?.isAbility) return false;
    const ability = cp.inPlay?.[pa.casterCardIndex]?.actions?.[pa.abilityIndex];
    return !!ability?.microevent;
  }

  if (type === 'initiateAbility') {
    const ability = cp.inPlay?.[payload?.casterCardIndex]?.actions?.[payload?.abilityIndex];
    if (!ability?.microevent) return false;
    // Only immediate target types are intercepted at initiateAbility time;
    // card-targeted abilities fall through to selectingTarget and are intercepted
    // later at resolveOnEnemyCard instead.
    const IMMEDIATE = new Set(['self', 'allEnemies', 'allAllies']);
    const targetType = getAbilityTargetType(ability);
    return IMMEDIATE.has(targetType);
  }

  return false;
};

/**
 * Middleware: when an active online game exists, intercept cardGame actions
 * and emit them via socket for the server to process authoritatively.
 * The action is ALSO applied to local state (optimistic update) so the UI
 * responds immediately — EXCEPT for actions the server will intercept to
 * trigger a microevent, where we skip the optimistic update to prevent hits
 * from appearing before the minigame completes.
 * When the server broadcasts back 'game:state', the setGameState reducer
 * replaces local state with the canonical server copy.
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
      // Skip the optimistic local update for actions the server will intercept
      // to hold pending a microevent — the server will broadcast the held state.
      if (wouldTriggerMicroevent(type, action.payload, store.getState().cardGame)) {
        return;
      }
    }
  }

  return next(action);
};

export const store = configureStore({
  reducer: {
    cardGame: cardGameReducer,
    auth: authReducer,
    sessions: sessionsReducer,
    chat: chatReducer,
    profile: profileReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(onlineGameMiddleware),
});

import { configureStore } from '@reduxjs/toolkit';
import counterReducer from '../features/counter/counterSlice';
import cardGameReducer from '../sections/card-game/database/cardGameSlice';
import authReducer from '../features/auth/authSlice';
import sessionsReducer from '../features/sessions/sessionsSlice';

export const store = configureStore({
  reducer: {
    counter: counterReducer,
    cardGame: cardGameReducer,
    auth: authReducer,
    sessions: sessionsReducer,
  },
});

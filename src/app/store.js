import { configureStore } from '@reduxjs/toolkit';
import counterReducer from '../features/counter/counterSlice';
import cardGameReducer from '../sections/card-game/database/cardGameSlice';

export const store = configureStore({
  reducer: {
    counter: counterReducer,
    cardGame: cardGameReducer,
  },
});

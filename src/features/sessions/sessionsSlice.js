import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

const API = '/api/sessions';

const authHeader = (token) => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
});

export const fetchSessions = createAsyncThunk('sessions/fetch', async (_, { getState, rejectWithValue }) => {
    const token = getState().auth.token;
    const res = await fetch(API, { headers: authHeader(token) });
    const data = await res.json();
    if (!res.ok) return rejectWithValue(data.error);
    return data.sessions;
});

export const createSession = createAsyncThunk('sessions/create', async ({ name }, { getState, rejectWithValue }) => {
    const token = getState().auth.token;
    const res = await fetch(API, {
        method: 'POST',
        headers: authHeader(token),
        body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (!res.ok) return rejectWithValue(data.error);
    return data.session;
});

export const joinSession = createAsyncThunk('sessions/join', async ({ joinCode }, { getState, rejectWithValue }) => {
    const token = getState().auth.token;
    const res = await fetch(`${API}/join`, {
        method: 'POST',
        headers: authHeader(token),
        body: JSON.stringify({ joinCode }),
    });
    const data = await res.json();
    if (!res.ok) return rejectWithValue(data.error);
    return data.session;
});

export const startSession = createAsyncThunk('sessions/start', async ({ sessionId }, { getState, rejectWithValue }) => {
    const token = getState().auth.token;
    const res = await fetch(`${API}/${sessionId}/start`, {
        method: 'POST',
        headers: authHeader(token),
    });
    const data = await res.json();
    if (!res.ok) return rejectWithValue(data.error);
    return data; // { session, gameId, state }
});

export const pollSession = createAsyncThunk('sessions/poll', async ({ sessionId }, { getState, rejectWithValue }) => {
    const token = getState().auth.token;
    const res = await fetch(`${API}/${sessionId}`, { headers: authHeader(token) });
    const data = await res.json();
    if (!res.ok) return rejectWithValue(data.error);
    return data.session;
});

const sessionsSlice = createSlice({
    name: 'sessions',
    initialState: {
        list: [],
        activeSession: null, // the session object the user is currently in
        activeGameId: null,  // set when game starts, triggers game view
        loading: false,
        error: null,
    },
    reducers: {
        clearSessionError(state) { state.error = null; },
        leaveSession(state) {
            state.activeSession = null;
            state.activeGameId = null;
        },
        setActiveSession(state, action) {
            state.activeSession = action.payload;
            state.activeGameId = action.payload?.gameId ?? null;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchSessions.pending, (state) => { state.loading = true; state.error = null; })
            .addCase(fetchSessions.fulfilled, (state, action) => { state.loading = false; state.list = action.payload; })
            .addCase(fetchSessions.rejected, (state, action) => { state.loading = false; state.error = action.payload; })

            .addCase(createSession.pending, (state) => { state.loading = true; state.error = null; })
            .addCase(createSession.fulfilled, (state, action) => {
                state.loading = false;
                state.list.unshift(action.payload);
                state.activeSession = action.payload;
            })
            .addCase(createSession.rejected, (state, action) => { state.loading = false; state.error = action.payload; })

            .addCase(joinSession.pending, (state) => { state.loading = true; state.error = null; })
            .addCase(joinSession.fulfilled, (state, action) => {
                state.loading = false;
                state.activeSession = action.payload;
                const idx = state.list.findIndex((s) => s._id === action.payload._id);
                if (idx >= 0) state.list[idx] = action.payload;
                else state.list.unshift(action.payload);
            })
            .addCase(joinSession.rejected, (state, action) => { state.loading = false; state.error = action.payload; })

            .addCase(startSession.pending, (state) => { state.loading = true; state.error = null; })
            .addCase(startSession.fulfilled, (state, action) => {
                state.loading = false;
                state.activeSession = action.payload.session;
                state.activeGameId = action.payload.gameId;
                const idx = state.list.findIndex((s) => s._id === action.payload.session._id);
                if (idx >= 0) state.list[idx] = action.payload.session;
            })
            .addCase(startSession.rejected, (state, action) => { state.loading = false; state.error = action.payload; })

            .addCase(pollSession.fulfilled, (state, action) => {
                state.activeSession = action.payload;
                if (action.payload.gameId) state.activeGameId = action.payload.gameId;
                const idx = state.list.findIndex((s) => s._id === action.payload._id);
                if (idx >= 0) state.list[idx] = action.payload;
            });
    },
});

export const { clearSessionError, leaveSession, setActiveSession } = sessionsSlice.actions;
export default sessionsSlice.reducer;

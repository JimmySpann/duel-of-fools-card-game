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

export const joinSessionById = createAsyncThunk('sessions/joinById', async ({ sessionId }, { getState, rejectWithValue }) => {
    const token = getState().auth.token;
    const res = await fetch(`${API}/${sessionId}/join`, {
        method: 'POST',
        headers: authHeader(token),
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

export const updateSettings = createAsyncThunk('sessions/updateSettings', async ({ sessionId, settings }, { getState, rejectWithValue }) => {
    const token = getState().auth.token;
    const res = await fetch(`${API}/${sessionId}/settings`, {
        method: 'PATCH',
        headers: authHeader(token),
        body: JSON.stringify(settings),
    });
    const data = await res.json();
    if (!res.ok) return rejectWithValue(data.error);
    return data.session;
});

export const updateTeam = createAsyncThunk('sessions/updateTeam', async ({ sessionId, slot, team }, { getState, rejectWithValue }) => {
    const token = getState().auth.token;
    const res = await fetch(`${API}/${sessionId}/players/${slot}/team`, {
        method: 'PATCH',
        headers: authHeader(token),
        body: JSON.stringify({ team }),
    });
    const data = await res.json();
    if (!res.ok) return rejectWithValue(data.error);
    return data.session;
});

export const leaveSessionLobby = createAsyncThunk('sessions/leaveLobby', async ({ sessionId }, { getState, rejectWithValue }) => {
    const token = getState().auth.token;
    const res = await fetch(`${API}/${sessionId}/leave`, {
        method: 'DELETE',
        headers: authHeader(token),
    });
    if (!res.ok) {
        const data = await res.json();
        return rejectWithValue(data.error);
    }
    return sessionId;
});

export const deleteSession = createAsyncThunk('sessions/delete', async ({ sessionId }, { getState, rejectWithValue }) => {
    const token = getState().auth.token;
    const res = await fetch(`${API}/${sessionId}`, {
        method: 'DELETE',
        headers: authHeader(token),
    });
    if (!res.ok) {
        const data = await res.json();
        return rejectWithValue(data.error);
    }
    return sessionId;
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
            })

            .addCase(updateSettings.fulfilled, (state, action) => {
                state.activeSession = action.payload;
                const idx = state.list.findIndex((s) => s._id === action.payload._id);
                if (idx >= 0) state.list[idx] = action.payload;
            })
            .addCase(updateSettings.rejected, (state, action) => { state.error = action.payload; })

            .addCase(updateTeam.fulfilled, (state, action) => {
                state.activeSession = action.payload;
                const idx = state.list.findIndex((s) => s._id === action.payload._id);
                if (idx >= 0) state.list[idx] = action.payload;
            })
            .addCase(updateTeam.rejected, (state, action) => { state.error = action.payload; })

            .addCase(joinSessionById.pending, (state) => { state.loading = true; state.error = null; })
            .addCase(joinSessionById.fulfilled, (state, action) => {
                state.loading = false;
                state.activeSession = action.payload;
                const idx = state.list.findIndex((s) => s._id === action.payload._id);
                if (idx >= 0) state.list[idx] = action.payload;
                else state.list.unshift(action.payload);
            })
            .addCase(joinSessionById.rejected, (state, action) => { state.loading = false; state.error = action.payload; })

            .addCase(leaveSessionLobby.pending, (state) => { state.loading = true; state.error = null; })
            .addCase(leaveSessionLobby.fulfilled, (state, action) => {
                state.loading = false;
                state.activeSession = null;
                state.list = state.list.filter((s) => s._id !== action.payload);
            })
            .addCase(leaveSessionLobby.rejected, (state, action) => { state.loading = false; state.error = action.payload; })

            .addCase(deleteSession.pending, (state) => { state.loading = true; state.error = null; })
            .addCase(deleteSession.fulfilled, (state, action) => {
                state.loading = false;
                state.activeSession = null;
                state.list = state.list.filter((s) => s._id !== action.payload);
            })
            .addCase(deleteSession.rejected, (state, action) => { state.loading = false; state.error = action.payload; });
    },
});

export const { clearSessionError, leaveSession, setActiveSession } = sessionsSlice.actions; export default sessionsSlice.reducer;

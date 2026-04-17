import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

const authHeader = (token) => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
});

// ── Thunks ────────────────────────────────────────────────────────────────────

export const fetchLobbyHistory = createAsyncThunk(
    'chat/fetchLobbyHistory',
    async ({ sessionId }, { getState, rejectWithValue }) => {
        const token = getState().auth.token;
        const res = await fetch(`/api/sessions/${sessionId}/messages`, { headers: authHeader(token) });
        const data = await res.json();
        if (!res.ok) return rejectWithValue(data.error);
        return { sessionId, messages: data.messages };
    }
);

export const fetchDmHistory = createAsyncThunk(
    'chat/fetchDmHistory',
    async ({ username }, { getState, rejectWithValue }) => {
        const token = getState().auth.token;
        const res = await fetch(`/api/messages/dm/${encodeURIComponent(username)}`, { headers: authHeader(token) });
        const data = await res.json();
        if (!res.ok) return rejectWithValue(data.error);
        return { username, messages: data.messages };
    }
);

export const fetchDmList = createAsyncThunk(
    'chat/fetchDmList',
    async (_, { getState, rejectWithValue }) => {
        const token = getState().auth.token;
        const res = await fetch('/api/messages/dm-list', { headers: authHeader(token) });
        const data = await res.json();
        if (!res.ok) return rejectWithValue(data.error);
        return data.threads;
    }
);

// ── Slice ─────────────────────────────────────────────────────────────────────

const chatSlice = createSlice({
    name: 'chat',
    initialState: {
        // Lobby messages keyed by sessionId
        lobby: {},        // { [sessionId]: Message[] }

        // DM threads keyed by the other user's username
        dms: {},          // { [username]: Message[] }

        // DM conversation list (from /api/messages/dm-list)
        dmList: [],       // [{ _id: username, lastText, lastAt }]

        // Which DM thread is open (username | null)
        activeDm: null,

        // Unread DM counts keyed by username
        unreadDm: {},     // { [username]: number }
    },
    reducers: {
        // Called by the Socket.IO listener when a lobby message arrives
        receiveLobbyMessage(state, action) {
            const { sessionId, message } = action.payload;
            if (!state.lobby[sessionId]) state.lobby[sessionId] = [];
            state.lobby[sessionId].push(message);
        },

        // Called by the Socket.IO listener when a DM arrives
        receiveDmMessage(state, action) {
            const { myUsername, message } = action.payload;
            const other = message.fromUsername === myUsername
                ? message.toUsername
                : message.fromUsername;

            if (!state.dms[other]) state.dms[other] = [];
            state.dms[other].push(message);

            // Update / insert dm-list entry
            const idx = state.dmList.findIndex((t) => t._id === other);
            if (idx >= 0) {
                state.dmList[idx].lastText = message.text;
                state.dmList[idx].lastAt = message.createdAt;
            } else {
                state.dmList.unshift({ _id: other, lastText: message.text, lastAt: message.createdAt });
            }

            // Increment unread count unless this thread is currently open
            if (state.activeDm !== other && message.fromUsername !== myUsername) {
                state.unreadDm[other] = (state.unreadDm[other] || 0) + 1;
            }
        },

        openDm(state, action) {
            state.activeDm = action.payload; // username
            if (action.payload) delete state.unreadDm[action.payload];
        },

        closeDm(state) {
            state.activeDm = null;
        },

        clearChat(state) {
            state.lobby = {};
            state.dms = {};
            state.dmList = [];
            state.activeDm = null;
            state.unreadDm = {};
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchLobbyHistory.fulfilled, (state, action) => {
                const { sessionId, messages } = action.payload;
                state.lobby[sessionId] = messages;
            })
            .addCase(fetchDmHistory.fulfilled, (state, action) => {
                const { username, messages } = action.payload;
                state.dms[username] = messages;
            })
            .addCase(fetchDmList.fulfilled, (state, action) => {
                state.dmList = action.payload;
            });
    },
});

export const {
    receiveLobbyMessage,
    receiveDmMessage,
    openDm,
    closeDm,
    clearChat,
} = chatSlice.actions;

export default chatSlice.reducer;

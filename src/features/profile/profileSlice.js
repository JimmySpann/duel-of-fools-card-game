import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

const API = '/api/profile';

const authHeader = (token) => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
});

export const fetchProfile = createAsyncThunk('profile/fetch', async (_, { getState, rejectWithValue }) => {
    const token = getState().auth.token;
    const res = await fetch(API, { headers: authHeader(token) });
    const data = await res.json();
    if (!res.ok) return rejectWithValue(data.error);
    return data;
});

export const updateProfile = createAsyncThunk('profile/update', async (fields, { getState, rejectWithValue }) => {
    const token = getState().auth.token;
    const res = await fetch(API, {
        method: 'PATCH',
        headers: authHeader(token),
        body: JSON.stringify(fields),
    });
    const data = await res.json();
    if (!res.ok) return rejectWithValue(data.error);
    return data;
});

export const sendFriendRequest = createAsyncThunk('profile/sendRequest', async ({ username }, { getState, rejectWithValue }) => {
    const token = getState().auth.token;
    const res = await fetch(`${API}/friends`, {
        method: 'POST',
        headers: authHeader(token),
        body: JSON.stringify({ username }),
    });
    const data = await res.json();
    if (!res.ok) return rejectWithValue(data.error);
    return data;
});

export const acceptFriendRequest = createAsyncThunk('profile/acceptRequest', async ({ username }, { getState, rejectWithValue }) => {
    const token = getState().auth.token;
    const res = await fetch(`${API}/friends/${encodeURIComponent(username)}/accept`, {
        method: 'PUT',
        headers: authHeader(token),
    });
    const data = await res.json();
    if (!res.ok) return rejectWithValue(data.error);
    return data;
});

export const removeFriend = createAsyncThunk('profile/removeFriend', async ({ username }, { getState, rejectWithValue }) => {
    const token = getState().auth.token;
    const res = await fetch(`${API}/friends/${encodeURIComponent(username)}`, {
        method: 'DELETE',
        headers: authHeader(token),
    });
    const data = await res.json();
    if (!res.ok) return rejectWithValue(data.error);
    return data;
});

export const blockUser = createAsyncThunk('profile/block', async ({ username }, { getState, rejectWithValue }) => {
    const token = getState().auth.token;
    const res = await fetch(`${API}/block`, {
        method: 'POST',
        headers: authHeader(token),
        body: JSON.stringify({ username }),
    });
    const data = await res.json();
    if (!res.ok) return rejectWithValue(data.error);
    return data;
});

export const unblockUser = createAsyncThunk('profile/unblock', async ({ username }, { getState, rejectWithValue }) => {
    const token = getState().auth.token;
    const res = await fetch(`${API}/block/${encodeURIComponent(username)}`, {
        method: 'DELETE',
        headers: authHeader(token),
    });
    const data = await res.json();
    if (!res.ok) return rejectWithValue(data.error);
    return data;
});

// Read notification prefs from localStorage so they survive page reloads
const loadNotifPrefs = () => {
    try {
        return {
            notifyTurn: localStorage.getItem('cg_notifyTurn') !== 'false',
            notifyDM: localStorage.getItem('cg_notifyDM') !== 'false',
        };
    } catch {
        return { notifyTurn: true, notifyDM: true };
    }
};

const profileSlice = createSlice({
    name: 'profile',
    initialState: {
        displayName: '',
        avatarUrl: '',
        friends: [],
        friendRequests: [],
        blocked: [],
        loading: false,
        error: null,
        ...loadNotifPrefs(),
    },
    reducers: {
        clearProfileError(state) { state.error = null; },
        setNotifyTurn(state, action) {
            state.notifyTurn = action.payload;
            try { localStorage.setItem('cg_notifyTurn', action.payload); } catch { }
        },
        setNotifyDM(state, action) {
            state.notifyDM = action.payload;
            try { localStorage.setItem('cg_notifyDM', action.payload); } catch { }
        },
        resetProfile(state) {
            state.displayName = '';
            state.avatarUrl = '';
            state.friends = [];
            state.friendRequests = [];
            state.blocked = [];
            state.error = null;
            // keep notification prefs across logout
        },
    },
    extraReducers: (builder) => {
        const pending = (state) => { state.loading = true; state.error = null; };
        const rejected = (state, action) => { state.loading = false; state.error = action.payload ?? 'Something went wrong'; };

        builder
            .addCase(fetchProfile.pending, pending)
            .addCase(fetchProfile.fulfilled, (state, action) => {
                state.loading = false;
                Object.assign(state, action.payload);
            })
            .addCase(fetchProfile.rejected, rejected)

            .addCase(updateProfile.pending, pending)
            .addCase(updateProfile.fulfilled, (state, action) => {
                state.loading = false;
                if (action.payload.displayName !== undefined) state.displayName = action.payload.displayName;
                if (action.payload.avatarUrl !== undefined) state.avatarUrl = action.payload.avatarUrl;
            })
            .addCase(updateProfile.rejected, rejected)

            .addCase(sendFriendRequest.pending, pending)
            .addCase(sendFriendRequest.fulfilled, (state, action) => {
                state.loading = false;
                // If auto-accepted (they had already sent us one), update friends + requests
                if (action.payload.status === 'accepted') {
                    state.friends = action.payload.friends;
                    state.friendRequests = action.payload.friendRequests;
                }
            })
            .addCase(sendFriendRequest.rejected, rejected)

            .addCase(acceptFriendRequest.pending, pending)
            .addCase(acceptFriendRequest.fulfilled, (state, action) => {
                state.loading = false;
                state.friends = action.payload.friends;
                state.friendRequests = action.payload.friendRequests;
            })
            .addCase(acceptFriendRequest.rejected, rejected)

            .addCase(removeFriend.pending, pending)
            .addCase(removeFriend.fulfilled, (state, action) => {
                state.loading = false;
                state.friends = action.payload.friends;
                state.friendRequests = action.payload.friendRequests;
            })
            .addCase(removeFriend.rejected, rejected)

            .addCase(blockUser.pending, pending)
            .addCase(blockUser.fulfilled, (state, action) => {
                state.loading = false;
                state.friends = action.payload.friends;
                state.friendRequests = action.payload.friendRequests;
                state.blocked = action.payload.blocked;
            })
            .addCase(blockUser.rejected, rejected)

            .addCase(unblockUser.pending, pending)
            .addCase(unblockUser.fulfilled, (state, action) => {
                state.loading = false;
                state.blocked = action.payload.blocked;
            })
            .addCase(unblockUser.rejected, rejected);
    },
});

export const { clearProfileError, resetProfile, setNotifyTurn, setNotifyDM } = profileSlice.actions;
export default profileSlice.reducer;

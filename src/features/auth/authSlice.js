import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

const API = '/api/auth';

const stored = (() => {
    try {
        const token = localStorage.getItem('cg_token');
        const username = localStorage.getItem('cg_username');
        return token && username ? { token, username } : null;
    } catch {
        return null;
    }
})();

export const signup = createAsyncThunk('auth/signup', async ({ username, password }, { rejectWithValue }) => {
    const res = await fetch(`${API}/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) return rejectWithValue(data.error);
    return data;
});

export const login = createAsyncThunk('auth/login', async ({ username, password }, { rejectWithValue }) => {
    const res = await fetch(`${API}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) return rejectWithValue(data.error);
    return data;
});

export const validateToken = createAsyncThunk('auth/validateToken', async (_, { getState, rejectWithValue }) => {
    const token = getState().auth.token;
    if (!token) return rejectWithValue('no token');
    const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return rejectWithValue('invalid');
    const data = await res.json();
    return data; // { username }
});

const authSlice = createSlice({
    name: 'auth',
    initialState: {
        token: stored?.token ?? null,
        username: stored?.username ?? null,
        loading: false,
        error: null,
        validated: !stored, // if no stored token, nothing to validate
    },
    reducers: {
        logout(state) {
            state.token = null;
            state.username = null;
            state.validated = true;
            localStorage.removeItem('cg_token');
            localStorage.removeItem('cg_username');
        },
        clearAuthError(state) {
            state.error = null;
        },
    },
    extraReducers: (builder) => {
        const pending = (state) => { state.loading = true; state.error = null; };
        const fulfilled = (state, action) => {
            state.loading = false;
            state.token = action.payload.token;
            state.username = action.payload.username;
            state.validated = true;
            localStorage.setItem('cg_token', action.payload.token);
            localStorage.setItem('cg_username', action.payload.username);
        };
        const rejected = (state, action) => { state.loading = false; state.error = action.payload; };
        builder
            .addCase(signup.pending, pending)
            .addCase(signup.fulfilled, fulfilled)
            .addCase(signup.rejected, rejected)
            .addCase(login.pending, pending)
            .addCase(login.fulfilled, fulfilled)
            .addCase(login.rejected, rejected)
            .addCase(validateToken.fulfilled, (state, action) => {
                // Token is valid — keep it, just mark validated
                state.validated = true;
                state.username = action.payload.username;
            })
            .addCase(validateToken.rejected, (state) => {
                // Token is stale/invalid — clear everything and show Auth
                state.token = null;
                state.username = null;
                state.validated = true;
                localStorage.removeItem('cg_token');
                localStorage.removeItem('cg_username');
            });
    },
});

export const { logout, clearAuthError } = authSlice.actions;
export default authSlice.reducer;

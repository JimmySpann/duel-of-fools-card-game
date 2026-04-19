'use strict';

require('dotenv').config();

const http = require('http');
const express = require('express');
const { Server: SocketIOServer } = require('socket.io');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const webpush = require('web-push');

const { seedOfficialCards } = require('./helpers');
const { router: pushRouter, VAPID_PUSH_ENABLED } = require('./routes/push');

const app = express();
const httpServer = http.createServer(app);
const io = new SocketIOServer(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
});
const PORT = process.env.PORT || 3001;

// -- Validation ----------------------------------------------------------------

const MONGO_URI = process.env.MONGODB_URI;
if (!MONGO_URI) {
    console.error('ERROR: MONGODB_URI is not set. Add it to server/.env');
    process.exit(1);
}

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('ERROR: JWT_SECRET is not set. Add it to server/.env');
    process.exit(1);
}

// -- Push notifications (VAPID) ------------------------------------------------

if (VAPID_PUSH_ENABLED) {
    webpush.setVapidDetails(
        process.env.VAPID_SUBJECT,
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY,
    );
    console.log('Push notifications: enabled');
} else {
    console.warn('Push notifications: disabled (VAPID keys not set in .env)');
}

// -- Database ------------------------------------------------------------------

mongoose
    .connect(MONGO_URI)
    .then(async () => {
        console.log('Connected to MongoDB');
        await seedOfficialCards();
    })
    .catch((err) => { console.error('MongoDB connection error:', err); process.exit(1); });

// -- Middleware ----------------------------------------------------------------

app.use(cors());
app.use(express.json());

const BUILD_DIR = path.join(__dirname, '..', 'build');
app.use(express.static(BUILD_DIR));

// -- Socket.IO auth middleware -------------------------------------------------

io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required'));
    try {
        socket.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch {
        next(new Error('Invalid or expired token'));
    }
});

// -- Game action helpers -------------------------------------------------------

const gameActions = require('./gameActions')(io);

// -- Routes --------------------------------------------------------------------

app.use('/api/auth', require('./routes/auth'));
app.use('/api/profile', require('./routes/profile'));
app.use('/api/cards', require('./routes/cards'));
app.use('/api/decks', require('./routes/decks'));
app.use('/api/sessions', require('./routes/sessions')(gameActions));
app.use('/api/games', require('./routes/games'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/push', pushRouter);

// Fallback — serve React for all non-API routes
app.get('*', (req, res) => {
    res.sendFile(path.join(BUILD_DIR, 'index.html'));
});

// -- Sockets -------------------------------------------------------------------

require('./sockets/gameSocket')(io, gameActions);
require('./sockets/chatSocket')(io);

// -- Start ---------------------------------------------------------------------

httpServer.listen(PORT, () => {
    console.log(`Card Game server running on http://localhost:${PORT}`);
    console.log(`API base: http://localhost:${PORT}/api`);
});
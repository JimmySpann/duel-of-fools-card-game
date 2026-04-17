/**
 * Singleton Socket.IO client.
 * Call connect(token) once after login; call disconnect() on logout.
 *
 * In production the frontend is served by the Express server itself, so we
 * connect to the same origin (omit URL → Socket.IO defaults to page origin).
 * In development the React dev-server runs on :3000 while the API runs on
 * :3001, so we need the explicit localhost address.
 */
import { io } from 'socket.io-client';

const SERVER_URL =
    process.env.NODE_ENV === 'production'
        ? undefined               // same origin as the page → works for any host/IP
        : 'http://localhost:3001'; // dev: React :3000 → Express :3001

let socket = null;

export const connectSocket = (token) => {
    if (socket?.connected) return socket;
    socket = io(SERVER_URL, {
        auth: { token },
        transports: ['websocket', 'polling'],
    });
    return socket;
};

export const disconnectSocket = () => {
    if (socket) {
        socket.disconnect();
        socket = null;
    }
};

export const getSocket = () => socket;

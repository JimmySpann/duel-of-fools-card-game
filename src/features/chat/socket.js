/**
 * Singleton Socket.IO client.
 * Call connect(token) once after login; call disconnect() on logout.
 */
import { io } from 'socket.io-client';

let socket = null;

export const connectSocket = (token) => {
    if (socket?.connected) return socket;
    socket = io('http://localhost:3001', {
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

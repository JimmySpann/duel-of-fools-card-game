import { useState, useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchLobbyHistory, receiveLobbyMessage } from '../../features/chat/chatSlice';
import { getSocket } from '../../features/chat/socket';
import './chat.css';

/**
 * Lobby chat panel — embedded in the lobby view.
 * Props:
 *   sessionId  — MongoDB _id of the session
 */
const LobbyChat = ({ sessionId }) => {
    const dispatch = useDispatch();
    const messages = useSelector((s) => s.chat.lobby[sessionId] || []);
    const myUsername = useSelector((s) => s.auth.username);

    const [text, setText] = useState('');
    const bottomRef = useRef(null);

    // Fetch history and join socket room
    useEffect(() => {
        if (!sessionId) return;
        dispatch(fetchLobbyHistory({ sessionId }));

        const socket = getSocket();
        if (!socket) return;
        socket.emit('lobby:join', { sessionId });

        const handler = (msg) => {
            dispatch(receiveLobbyMessage({ sessionId, message: msg }));
        };
        socket.on('lobby:message', handler);

        return () => {
            socket.off('lobby:message', handler);
            socket.emit('lobby:leave', { sessionId });
        };
    }, [sessionId, dispatch]);

    // Auto-scroll to bottom
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = (e) => {
        e.preventDefault();
        const trimmed = text.trim();
        if (!trimmed) return;
        const socket = getSocket();
        socket?.emit('lobby:message', { sessionId, text: trimmed });
        setText('');
    };

    return (
        <div className="chat-panel">
            <div className="chat-header">Lobby Chat</div>
            <div className="chat-messages">
                {messages.length === 0 && (
                    <p className="chat-empty">No messages yet. Say hello!</p>
                )}
                {messages.map((m) => (
                    <div
                        key={m._id}
                        className={`chat-msg ${m.fromUsername === myUsername ? 'mine' : 'theirs'}`}
                    >
                        <span className="chat-msg-author">{m.fromUsername}</span>
                        <span className="chat-msg-text">{m.text}</span>
                        <span className="chat-msg-time">
                            {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    </div>
                ))}
                <div ref={bottomRef} />
            </div>
            <form className="chat-input-row" onSubmit={handleSend}>
                <input
                    className="chat-input"
                    type="text"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Type a message…"
                    maxLength={1000}
                />
                <button className="chat-send-btn" type="submit" disabled={!text.trim()}>
                    Send
                </button>
            </form>
        </div>
    );
};

export default LobbyChat;

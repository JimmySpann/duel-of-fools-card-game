import { useState, useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
    fetchDmHistory,
    fetchDmList,
    receiveDmMessage,
    openDm,
    closeDm,
} from '../../features/chat/chatSlice';
import { getSocket } from '../../features/chat/socket';
import useNotifications from '../notifications/useNotifications';
import './chat.css';

/**
 * DMPanel — floating DM inbox + conversation window.
 * Rendered once at the sessions-page level; listens globally for incoming DMs.
 */
const DMPanel = () => {
    const dispatch = useDispatch();
    const myUsername = useSelector((s) => s.auth.username);
    const dmList = useSelector((s) => s.chat.dmList);
    const notifyDM = useSelector((s) => s.profile.notifyDM);
    const { notify } = useNotifications();
    const activeDm = useSelector((s) => s.chat.activeDm);
    const messages = useSelector((s) => s.chat.dms[activeDm] || []);
    const unreadDm = useSelector((s) => s.chat.unreadDm);

    const [open, setOpen] = useState(false);
    const [newRecipient, setNewRecipient] = useState('');
    const [text, setText] = useState('');
    const bottomRef = useRef(null);

    const totalUnread = Object.values(unreadDm).reduce((a, b) => a + b, 0);

    // Fetch DM list on mount and register socket listener
    useEffect(() => {
        dispatch(fetchDmList());

        const socket = getSocket();
        if (!socket) return;

        const handler = (msg) => {
            dispatch(receiveDmMessage({ myUsername, message: msg }));
            // Notify if: message is from someone else AND DM notifications are enabled
            if (notifyDM && msg.fromUsername !== myUsername) {
                notify(`💬 ${msg.fromUsername}`, msg.text.slice(0, 80));
            }
        };
        socket.on('dm:message', handler);
        return () => socket.off('dm:message', handler);
    }, [dispatch, myUsername, notifyDM, notify]);

    // Fetch history when opening a thread
    useEffect(() => {
        if (activeDm) dispatch(fetchDmHistory({ username: activeDm }));
    }, [activeDm, dispatch]);

    // Auto-scroll
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleOpenThread = (username) => {
        dispatch(openDm(username));
        setNewRecipient('');
    };

    const handleNewDm = (e) => {
        e.preventDefault();
        const u = newRecipient.trim();
        if (!u || u === myUsername) return;
        dispatch(openDm(u));
        setNewRecipient('');
    };

    const handleSend = (e) => {
        e.preventDefault();
        const trimmed = text.trim();
        if (!trimmed || !activeDm) return;
        const socket = getSocket();
        socket?.emit('dm:message', { toUsername: activeDm, text: trimmed });
        setText('');
    };

    return (
        <div className="dm-container">
            {/* Toggle button */}
            <button
                className={`dm-toggle-btn ${totalUnread > 0 ? 'has-unread' : ''}`}
                onClick={() => setOpen((v) => !v)}
            >
                💬 Messages{totalUnread > 0 && <span className="dm-badge">{totalUnread}</span>}
            </button>

            {open && (
                <div className="dm-panel">
                    {activeDm ? (
                        /* ── Active conversation ── */
                        <div className="dm-conversation">
                            <div className="dm-conv-header">
                                <button className="dm-back-btn" onClick={() => dispatch(closeDm())}>←</button>
                                <span className="dm-conv-title">{activeDm}</span>
                            </div>
                            <div className="chat-messages">
                                {messages.length === 0 && (
                                    <p className="chat-empty">Start the conversation!</p>
                                )}
                                {messages.map((m) => (
                                    <div
                                        key={m._id}
                                        className={`chat-msg ${m.fromUsername === myUsername ? 'mine' : 'theirs'}`}
                                    >
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
                                    placeholder={`Message ${activeDm}…`}
                                    maxLength={1000}
                                    autoFocus
                                />
                                <button className="chat-send-btn" type="submit" disabled={!text.trim()}>
                                    Send
                                </button>
                            </form>
                        </div>
                    ) : (
                        /* ── Inbox / thread list ── */
                        <div className="dm-inbox">
                            <div className="dm-inbox-header">Direct Messages</div>

                            {/* Start a new DM */}
                            <form className="dm-new-form" onSubmit={handleNewDm}>
                                <input
                                    className="chat-input"
                                    type="text"
                                    value={newRecipient}
                                    onChange={(e) => setNewRecipient(e.target.value)}
                                    placeholder="Username…"
                                    maxLength={40}
                                />
                                <button className="chat-send-btn" type="submit">+</button>
                            </form>

                            {/* Thread list */}
                            {dmList.length === 0 && (
                                <p className="chat-empty">No conversations yet.</p>
                            )}
                            <div className="dm-thread-list">
                                {dmList.map((thread) => (
                                    <button
                                        key={thread._id}
                                        className="dm-thread-item"
                                        onClick={() => handleOpenThread(thread._id)}
                                    >
                                        <span className="dm-thread-name">
                                            {thread._id}
                                            {unreadDm[thread._id] > 0 && (
                                                <span className="dm-badge">{unreadDm[thread._id]}</span>
                                            )}
                                        </span>
                                        <span className="dm-thread-preview">{thread.lastText}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default DMPanel;

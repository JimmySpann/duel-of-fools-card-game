import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
    sendFriendRequest,
    acceptFriendRequest,
    removeFriend,
    blockUser,
    unblockUser,
} from './profileSlice';

const FriendsPanel = ({ tab }) => {
    const dispatch = useDispatch();
    const { friends, friendRequests, blocked, loading, error } = useSelector((s) => s.profile);
    const [addInput, setAddInput] = useState('');
    const [addStatus, setAddStatus] = useState(null);

    const handleSendRequest = async (e) => {
        e.preventDefault();
        if (!addInput.trim()) return;
        setAddStatus(null);
        const res = await dispatch(sendFriendRequest({ username: addInput.trim() }));
        if (sendFriendRequest.fulfilled.match(res)) {
            const msg = res.payload.status === 'accepted' ? 'Now friends!' : 'Request sent!';
            setAddStatus({ ok: true, msg });
            setAddInput('');
        } else {
            setAddStatus({ ok: false, msg: res.payload ?? 'Failed to send request' });
        }
    };

    if (tab === 'Friends') return (
        <div className="profile-section">
            <form className="profile-add-row" onSubmit={handleSendRequest}>
                <input
                    className="profile-input"
                    type="text"
                    value={addInput}
                    onChange={(e) => setAddInput(e.target.value)}
                    placeholder="Add by username…"
                    maxLength={24}
                />
                <button className="profile-add-btn" type="submit" disabled={loading || !addInput.trim()}>
                    Add
                </button>
            </form>
            {addStatus && (
                <p className={addStatus.ok ? 'profile-success' : 'profile-error'}>
                    {addStatus.msg}
                </p>
            )}

            {friendRequests.length > 0 && (
                <div className="profile-subsection">
                    <h3 className="profile-subsection-title">Incoming Requests</h3>
                    {friendRequests.map((u) => (
                        <div key={u} className="profile-friend-row">
                            <img
                                className="profile-friend-avatar"
                                src={`https://i.pravatar.cc/40?u=${u}`}
                                alt={u}
                            />
                            <span className="profile-friend-name">{u}</span>
                            <div className="profile-friend-actions">
                                <button
                                    className="profile-friend-btn accept"
                                    onClick={() => dispatch(acceptFriendRequest({ username: u }))}
                                    disabled={loading}
                                >
                                    Accept
                                </button>
                                <button
                                    className="profile-friend-btn decline"
                                    onClick={() => dispatch(removeFriend({ username: u }))}
                                    disabled={loading}
                                >
                                    Decline
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div className="profile-subsection">
                <h3 className="profile-subsection-title">
                    Friends {friends.length > 0 && <span className="profile-count">({friends.length})</span>}
                </h3>
                {friends.length === 0 ? (
                    <p className="profile-empty">No friends yet. Add someone above!</p>
                ) : (
                    friends.map((u) => (
                        <div key={u} className="profile-friend-row">
                            <img
                                className="profile-friend-avatar"
                                src={`https://i.pravatar.cc/40?u=${u}`}
                                alt={u}
                            />
                            <span className="profile-friend-name">{u}</span>
                            <div className="profile-friend-actions">
                                <button
                                    className="profile-friend-btn remove"
                                    onClick={() => dispatch(removeFriend({ username: u }))}
                                    disabled={loading}
                                >
                                    Remove
                                </button>
                                <button
                                    className="profile-friend-btn block"
                                    onClick={() => dispatch(blockUser({ username: u }))}
                                    disabled={loading}
                                >
                                    Block
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
            {error && <p className="profile-error">{error}</p>}
        </div>
    );

    if (tab === 'Blocked') return (
        <div className="profile-section">
            <h3 className="profile-subsection-title">Blocked Users</h3>
            {blocked.length === 0 ? (
                <p className="profile-empty">No blocked users.</p>
            ) : (
                blocked.map((u) => (
                    <div key={u} className="profile-friend-row">
                        <img
                            className="profile-friend-avatar"
                            src={`https://i.pravatar.cc/40?u=${u}`}
                            alt={u}
                        />
                        <span className="profile-friend-name">{u}</span>
                        <div className="profile-friend-actions">
                            <button
                                className="profile-friend-btn accept"
                                onClick={() => dispatch(unblockUser({ username: u }))}
                                disabled={loading}
                            >
                                Unblock
                            </button>
                        </div>
                    </div>
                ))
            )}
            {error && <p className="profile-error">{error}</p>}
        </div>
    );

    return null;
};

export default FriendsPanel;

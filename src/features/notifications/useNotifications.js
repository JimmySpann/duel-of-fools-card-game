/**
 * useNotifications
 *
 * Thin wrapper around the browser Notification API.
 *
 * Returns:
 *   permission  – 'default' | 'granted' | 'denied'
 *   request()   – asks the user for permission; resolves to the new status
 *   notify(title, body, icon?) – fires a notification if permission is granted.
 *                                Skips silently when permission is denied.
 */
import { useState, useCallback } from 'react';

const supported = typeof window !== 'undefined' && 'Notification' in window;

const useNotifications = () => {
    const [permission, setPermission] = useState(
        supported ? Notification.permission : 'denied'
    );

    const request = useCallback(async () => {
        if (!supported) return 'denied';
        if (Notification.permission === 'granted') return 'granted';
        const result = await Notification.requestPermission();
        setPermission(result);
        return result;
    }, []);

    const notify = useCallback((title, body, icon) => {
        if (!supported || Notification.permission !== 'granted') return;
        try {
            const n = new Notification(title, { body, icon: icon ?? '/icons/icon-192x192.png' });
            // Auto-close after 6 seconds
            setTimeout(() => n.close(), 6000);
        } catch {
            // Notifications may be blocked at OS level
        }
    }, []);

    return { permission, request, notify };
};

export default useNotifications;

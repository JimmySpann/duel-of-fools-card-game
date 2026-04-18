import { useState, useCallback, useRef } from 'react';
import { ensurePushSubscription } from './pushManager';

const supported = typeof window !== 'undefined' && 'Notification' in window;

/** Play a short notification beep via Web Audio API (no external files needed). */
const playBeep = (type = 'turn') => {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        if (type === 'turn') {
            // Two-tone ascending chime
            osc.frequency.setValueAtTime(520, ctx.currentTime);
            osc.frequency.setValueAtTime(780, ctx.currentTime + 0.12);
            gain.gain.setValueAtTime(0.25, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.5);
        } else {
            // Single soft ping for DMs
            osc.frequency.setValueAtTime(660, ctx.currentTime);
            gain.gain.setValueAtTime(0.18, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.35);
        }
        osc.onended = () => ctx.close();
    } catch {
        // Web Audio not available
    }
};

const useNotifications = () => {
    const [permission, setPermission] = useState(() => {
        if (!supported) return 'denied';
        if (Notification.permission === 'granted') {
            // Ensure push subscription is active on load (non-blocking)
            ensurePushSubscription();
        }
        return Notification.permission;
    });
    // Track whether we've already auto-requested so we don't spam the prompt
    const askedRef = useRef(false);

    const request = useCallback(async () => {
        if (!supported) return 'denied';
        if (Notification.permission === 'granted') return 'granted';
        if (askedRef.current) return Notification.permission;
        askedRef.current = true;
        const result = await Notification.requestPermission();
        setPermission(result);
        if (result === 'granted') {
            ensurePushSubscription();
        }
        return result;
    }, []);

    /** Fire a visual browser notification + audio beep.
     *  @param {string} title
     *  @param {string} body
     *  @param {string} [icon]
     *  @param {'turn'|'dm'} [sound='turn']
     */
    const notify = useCallback((title, body, icon, sound = 'turn') => {
        // Always play the audio cue (works even when the page is focused)
        playBeep(sound);

        // Browser push notification (only when permission is granted)
        if (!supported || Notification.permission !== 'granted') return;
        try {
            const n = new Notification(title, { body, icon: icon ?? '/icons/icon-192x192.png' });
            setTimeout(() => n.close(), 6000);
        } catch {
            // Notifications may be blocked at OS level
        }
    }, []);

    return { permission, request, notify };
};

export default useNotifications;

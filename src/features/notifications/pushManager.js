let _swReg = null;

/** Register the service worker. Call once at app startup. */
export const registerServiceWorker = async () => {
    if (!('serviceWorker' in navigator)) {
        console.log('[Push] serviceWorker not supported in this browser');
        return null;
    }
    try {
        console.log('[Push] registering service worker...');
        _swReg = await navigator.serviceWorker.register('/service-worker.js');
        await navigator.serviceWorker.ready;
        console.log('[Push] service worker ready');
        return _swReg;
    } catch (err) {
        console.warn('[Push] SW registration failed:', err);
        return null;
    }
};

const urlBase64ToUint8Array = (b64) => {
    const padding = '='.repeat((4 - (b64.length % 4)) % 4);
    const base64 = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = window.atob(base64);
    return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
};

/**
 * Subscribe this device to push notifications and send the subscription to
 * the server. Safe to call multiple times — no-ops if already subscribed.
 */
export const ensurePushSubscription = async () => {
    if (!('PushManager' in window)) {
        console.log('[Push] PushManager not supported in this browser');
        return;
    }
    const token = localStorage.getItem('cg_token');
    if (!token) {
        console.log('[Push] no auth token; skipping push subscription');
        return;
    }
    try {
        console.log('[Push] fetching VAPID public key...');
        const keyRes = await fetch('/api/push/vapid-public-key');
        if (!keyRes.ok) {
            console.log('[Push] vapid key request failed with status:', keyRes.status);
            return; // server unavailable or push endpoint not reachable
        }
        const { enabled, publicKey } = await keyRes.json();
        if (!enabled || !publicKey) {
            console.log('[Push] push disabled or key missing on server');
            return;
        }
        console.log('[Push] VAPID key received; ensuring subscription...');

        const reg = _swReg ?? (await navigator.serviceWorker.ready);
        let sub = await reg.pushManager.getSubscription();
        if (sub) {
            console.log('[Push] existing push subscription found');
        }
        if (!sub) {
            console.log('[Push] creating new push subscription...');
            sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(publicKey),
            });
            console.log('[Push] new push subscription created');
        }
        console.log('[Push] sending subscription to server...');
        await fetch('/api/push/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ subscription: sub.toJSON() }),
        });
        console.log('[Push] subscription sync complete');
    } catch (err) {
        console.warn('[Push] subscribe failed:', err);
    }
};

/** Unsubscribe this device and remove the subscription from the server. */
export const removePushSubscription = async () => {
    if (!('serviceWorker' in navigator)) {
        console.log('[Push] serviceWorker not supported; cannot unsubscribe');
        return;
    }
    const token = localStorage.getItem('cg_token');
    try {
        console.log('[Push] loading current subscription for removal...');
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (!sub) {
            console.log('[Push] no existing subscription to remove');
            return;
        }
        console.log('[Push] removing subscription from server...');
        await fetch('/api/push/subscribe', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
        console.log('[Push] local subscription removed');
    } catch (err) {
        console.warn('[Push] unsubscribe failed:', err);
    }
};

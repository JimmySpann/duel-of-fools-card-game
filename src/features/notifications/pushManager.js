let _swReg = null;

/** Register the service worker. Call once at app startup. */
export const registerServiceWorker = async () => {
    if (!('serviceWorker' in navigator)) return null;
    try {
        _swReg = await navigator.serviceWorker.register('/service-worker.js');
        await navigator.serviceWorker.ready;
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
    if (!('PushManager' in window)) return;
    const token = localStorage.getItem('cg_token');
    if (!token) return;
    try {
        const keyRes = await fetch('/api/push/vapid-public-key');
        if (!keyRes.ok) return; // push not configured on server
        const { publicKey } = await keyRes.json();

        const reg = _swReg ?? (await navigator.serviceWorker.ready);
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
            sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(publicKey),
            });
        }
        await fetch('/api/push/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ subscription: sub.toJSON() }),
        });
    } catch (err) {
        console.warn('[Push] subscribe failed:', err);
    }
};

/** Unsubscribe this device and remove the subscription from the server. */
export const removePushSubscription = async () => {
    if (!('serviceWorker' in navigator)) return;
    const token = localStorage.getItem('cg_token');
    try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (!sub) return;
        await fetch('/api/push/subscribe', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
    } catch (err) {
        console.warn('[Push] unsubscribe failed:', err);
    }
};

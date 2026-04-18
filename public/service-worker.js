/* ── Duel of Fools Service Worker ─────────────────────────────────────────── */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

/* ── Push handler ────────────────────────────────────────────────────────── */
self.addEventListener('push', (event) => {
    const data = event.data?.json() ?? {};
    event.waitUntil(
        self.registration.showNotification(data.title ?? 'Duel of Fools', {
            body: data.body ?? '',
            icon: '/icons/icon-192x192.png',
            badge: '/icons/icon-192x192.png',
            tag: data.tag ?? 'dof',
            renotify: !!data.tag,
            data: { url: data.url ?? '/' },
        })
    );
});

/* ── Notification click ──────────────────────────────────────────────────── */
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const targetUrl = event.notification.data?.url ?? '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
            // If app is already open, focus it and send a message to navigate
            for (const c of list) {
                if (c.url.startsWith(self.location.origin)) {
                    c.postMessage({ type: 'NAVIGATE_TO_GAME', url: targetUrl });
                    return c.focus();
                }
            }
            // Otherwise open fresh at the game URL
            if (clients.openWindow) return clients.openWindow(targetUrl);
        })
    );
});

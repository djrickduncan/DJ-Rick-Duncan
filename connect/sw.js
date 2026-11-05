/* Follow-Up service worker: offline app shell + daily "follow-ups due" reminder. */
const CACHE = 'followup-v1';
const SHELL = ['./', './index.html', './app.css', './app.js', './vendor/qrcode.js', './vendor/jsQR.js',
  './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Network first (so updates arrive), fall back to cache when offline.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('./index.html')))
  );
});

// --- reminders -------------------------------------------------------------
function openDb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('followup', 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('contacts')) d.createObjectStore('contacts', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
function req(store, mode, fn) {
  return openDb().then((d) => new Promise((resolve, reject) => {
    const t = d.transaction(store, mode); const q = fn(t.objectStore(store));
    t.oncomplete = () => resolve(q && q.result); t.onerror = () => reject(t.error);
  }));
}
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());

async function checkDue() {
  const todayStr = ymd(new Date());
  const last = await req('kv', 'readonly', (s) => s.get('lastNotified'));
  if (last === todayStr) return;
  const all = (await req('contacts', 'readonly', (s) => s.getAll())) || [];
  const due = all.filter((c) => c.followUp && c.status !== 'done' && c.followUp <= todayStr)
    .sort((a, b) => a.followUp.localeCompare(b.followUp));
  if (self.navigator && 'setAppBadge' in self.navigator) {
    try { due.length ? await self.navigator.setAppBadge(due.length) : await self.navigator.clearAppBadge(); } catch (e) { /* ignore */ }
  }
  if (!due.length) return;
  const names = due.slice(0, 3).map((c) => c.name || 'someone').join(', ') + (due.length > 3 ? ' +' + (due.length - 3) + ' more' : '');
  await self.registration.showNotification(due.length === 1 ? 'Follow up with ' + names : due.length + ' people to follow up', {
    body: due.length === 1 ? (due[0].note || (due[0].event ? 'Met at ' + due[0].event : 'Tap to write a message')) : names,
    icon: 'icon-192.png', badge: 'icon-192.png', tag: 'followups-due', data: { url: './?view=due' }
  });
  await req('kv', 'readwrite', (s) => s.put(todayStr, 'lastNotified'));
}

self.addEventListener('periodicsync', (e) => { if (e.tag === 'followups-due') e.waitUntil(checkDue()); });

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if (c.url.startsWith(self.registration.scope) && 'focus' in c) { c.navigate(url).catch(() => {}); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});

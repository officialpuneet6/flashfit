/* A service worker has no window, so it cannot use shared/runtime/flashfit-app-identity.js.
 * It is registered per app at that app's root instead, so its own registration
 * scope identifies the app and every landing page resolves relative to it. */
const LEGACY_FOLDER_BY_ROLE = {
  admin: "admin-panel",
  shopkeeper: "shopfit",
  delivery_partner: "delevery_patner",
  user: "flashfitshop"
};

// Landing page per role, relative to the app root this worker is scoped to.
const ROLE_PAGES = {
  admin: "index.html",
  shopkeeper: "shopkeeper-panel.html",
  delivery_partner: "delivery-panel.html",
  user: "my-orders.html"
};

function normalizeRole(role) {
  const r = String(role || "").toLowerCase();
  if (["seller", "shop", "shopkeeper"].includes(r)) return "shopkeeper";
  if (["rider", "delivery", "delivery_partner", "delivery-partner"].includes(r)) return "delivery_partner";
  if (r === "admin") return "admin";
  return "user";
}

// Resolve against the worker's own scope, which is the app root on every domain.
function scopedUrl(page) {
  try {
    return new URL(page, self.registration.scope).href;
  } catch (_) {
    return page;
  }
}

function roleUrl(role) {
  return scopedUrl(ROLE_PAGES[normalizeRole(role)] || "index.html");
}

// A payload URL naming another app's legacy folder must not be opened for this recipient.
function pointsAtOtherApp(url, role) {
  const value = String(url || "").toLowerCase();
  const own = LEGACY_FOLDER_BY_ROLE[normalizeRole(role)];
  return Object.keys(LEGACY_FOLDER_BY_ROLE).some((key) => {
    const folder = LEGACY_FOLDER_BY_ROLE[key];
    return folder !== own && value.includes(folder);
  });
}

function safeActionUrl(data = {}) {
  const role = normalizeRole(data.role);
  const url = String(data.url || "");
  if (!url) return roleUrl(role);
  if (pointsAtOtherApp(url, role)) return roleUrl(role);
  return url;
}

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_) {
    payload = { title: "FlashFit", body: event.data ? event.data.text() : "New notification" };
  }

  const title = payload.title || "FlashFit";
  const options = {
    body: payload.body || "New update from FlashFit",
    icon: payload.icon || "50x100logo.png",
    badge: payload.badge || "favicon-32x32.png",
    tag: payload.tag || payload.notification_id || "flashfit-update",
    data: payload.data || {},
    requireInteraction: payload.priority === "high",
    renotify: true,
    silent: false,
    vibrate: payload.priority === "high" ? [120, 80, 120] : [80]
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = safeActionUrl(event.notification.data || {});

  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((client) => client.url.includes(url));
    if (existing) {
      await existing.focus();
      return;
    }
    await clients.openWindow(url);
  })());
});

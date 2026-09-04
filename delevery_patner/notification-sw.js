const ROLE_URLS = {
  admin: "/admin-panel/index.html",
  shopkeeper: "/shopfit/index.html",
  delivery_partner: "/delevery_patner/delivery-panel.html",
  user: "/flashfitshop/my-orders.html"
};

function normalizeRole(role) {
  const r = String(role || "").toLowerCase();
  if (["seller", "shop", "shopkeeper"].includes(r)) return "shopkeeper";
  if (["rider", "delivery", "delivery_partner", "delivery-partner"].includes(r)) return "delivery_partner";
  if (r === "admin") return "admin";
  return "user";
}

function safeActionUrl(data = {}) {
  const role = normalizeRole(data.role);
  const url = String(data.url || "");
  if (!url) return ROLE_URLS[role] || "/flashfitshop/index.html";
  if (role !== "admin" && /admin-panel/i.test(url)) return ROLE_URLS[role];
  if (role !== "shopkeeper" && /shopfit/i.test(url)) return ROLE_URLS[role];
  if (role !== "delivery_partner" && /delevery_patner/i.test(url)) return ROLE_URLS[role];
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
    icon: payload.icon || "/flashfitshop/50x100logo.png",
    badge: payload.badge || "/flashfitshop/favicon-32x32.png",
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

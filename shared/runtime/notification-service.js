(function () {
  const CONFIG = window.FLASHFIT_NOTIFICATION_CONFIG || {};
  const DEVICE_KEY = "flashfitDeviceId";
  const LOCAL_HISTORY_KEY = "flashfit_notification_history";
  const CHANNEL_KEY = "flashfit-notifications";

  const EVENT_COPY = {
    new_order: ["New Order", "A new order has been placed."],
    order_accepted: ["Order Accepted", "Order has been accepted."],
    order_cancelled: ["Order Cancelled", "Order has been cancelled."],
    order_delivered: ["Order Delivered", "Order has been delivered."],
    return_request: ["Return Request", "A customer has requested a return."],
    return_completed: ["Return Completed", "Return has been completed."],
    new_user_registration: ["New User Registration", "A new customer joined FlashFit."],
    new_shopkeeper_registration: ["New Shopkeeper Registration", "A new shopkeeper has registered."],
    new_delivery_partner_registration: ["New Delivery Partner Registration", "A new delivery partner has registered."],
    shop_approval_request: ["Shop Approval Request", "A shop is waiting for admin approval."],
    delivery_partner_approval_request: ["Delivery Partner Approval Request", "A delivery partner is waiting for approval."],
    payment_success: ["Payment Success", "Payment was completed successfully."],
    payment_failure: ["Payment Failure", "Payment failed or needs attention."],
    refund_initiated: ["Refund Initiated", "Refund has been initiated."],
    refund_completed: ["Refund Completed", "Refund has been completed."],
    customer_complaint: ["Customer Complaint", "A customer complaint needs review."],
    shop_complaint: ["Shop Complaint", "A shop complaint needs review."],
    delivery_issue: ["Delivery Issue", "A delivery issue needs attention."],
    system_error: ["System Error", "A platform error was reported."],
    low_stock_alert: ["Low Stock Alert", "A product is running low on stock."],
    high_priority: ["High Priority Alert", "A high-priority event needs attention."],
    new_delivery_assigned: ["New Delivery Assigned", "A new delivery has been assigned."],
    pickup_reminder: ["Pickup Reminder", "Pickup is pending for an assigned order."],
    return_pickup: ["Return Pickup", "Return pickup has been assigned."],
    delivery_completed: ["Delivery Completed", "Delivery has been completed."],
    delivery_cancelled: ["Delivery Cancelled", "Delivery has been cancelled."],
    offer: ["FlashFit Offer", "A new offer is available."],
    order_update: ["Order Update", "Your order status has changed."],
    delivery_update: ["Delivery Update", "Your delivery status has changed."],
    refund_update: ["Refund Update", "Your refund status has changed."],
    return_update: ["Return Update", "Your return status has changed."]
  };

  // Cross-app URLs resolve through the shared identity module so they stay correct
  // on the per-domain builds and on the legacy single-host layout.
  const IDENTITY = window.flashfitApp || null;

  const LEGACY_ROLE_URLS = {
    admin: "/admin-panel/index.html",
    shopkeeper: "/shopfit/index.html",
    delivery_partner: "/delevery_patner/delivery-panel.html",
    user: "/flashfitshop/my-orders.html"
  };

  function defaultRoleUrl(role) {
    const normalized = normalizeRole(role);
    if (IDENTITY) return IDENTITY.roleUrl(normalized);
    return LEGACY_ROLE_URLS[normalized] || LEGACY_ROLE_URLS.user;
  }

  // True when the URL belongs to a different app than the recipient's role.
  function pointsAtOtherApp(url, role) {
    if (IDENTITY) return IDENTITY.isForeignRoleUrl(url, role);
    const normalized = normalizeRole(role);
    if (normalized !== "admin" && /admin-panel/i.test(url)) return true;
    if (normalized !== "shopkeeper" && /shopfit/i.test(url)) return true;
    if (normalized !== "delivery_partner" && /delevery_patner/i.test(url)) return true;
    return false;
  }

  function roleUrl(role, options = {}) {
    const normalized = normalizeRole(role);
    if (options.urlByRole && options.urlByRole[normalized]) return options.urlByRole[normalized];
    if (options.urls && options.urls[normalized]) return options.urls[normalized];
    const explicitUrlRole = options.urlRole || options.targetRole;
    if (options.url && explicitUrlRole && normalized === normalizeRole(explicitUrlRole)) {
      return options.url;
    }
    if (options.url && !pointsAtOtherApp(options.url, normalized)) return options.url;
    return defaultRoleUrl(normalized);
  }

  function safeActionUrl(row = {}) {
    const role = normalizeRole(row.role || state.role);
    const url = String(row.action_url || "");
    if (!url) return defaultRoleUrl(role);
    if (pointsAtOtherApp(url, role)) return defaultRoleUrl(role);
    return url;
  }

  let client = null;
  let channel = null;
  let channelName = "";
  let soundUnlocked = false;
  let notificationAudio = null;
  let state = {
    role: "user",
    recipientId: "",
    userId: null,
    notifications: [],
    unreadCount: 0
  };

  function makeId() {
    return "ff-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function getDeviceId() {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = makeId();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  }

  function getClient() {
    if (client) return client;
    if (window.flashfitDB && window.flashfitDB.getSupabaseClient) {
      client = window.flashfitDB.getSupabaseClient();
      if (client) return client;
    }
    if (window.supabase && window.supabase.createClient && CONFIG.supabaseUrl && CONFIG.supabaseKey) {
      client = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);
    }
    return client;
  }

  function getAudio() {
    if (notificationAudio) return notificationAudio;
    notificationAudio = document.getElementById("notifSound");
    if (!notificationAudio) {
      notificationAudio = new Audio(CONFIG.soundUrl || "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3");
      notificationAudio.preload = "auto";
      notificationAudio.volume = 1;
    }
    return notificationAudio;
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function unlockSound() {
    if (soundUnlocked) return true;
    try {
      const audio = getAudio();
      audio.muted = true;
      audio.currentTime = 0;
      await audio.play();
      audio.pause();
      audio.currentTime = 0;
      audio.muted = false;
      soundUnlocked = true;
      localStorage.setItem("flashfit_notification_sound_unlocked", "true");
      return true;
    } catch (error) {
      return false;
    }
  }

  function wireSoundUnlock() {
    const handler = () => unlockSound();
    window.addEventListener("pointerdown", handler, { once: true, passive: true });
    window.addEventListener("keydown", handler, { once: true });
  }

  async function playNotificationSound(row = {}) {
    try {
      const audio = getAudio();
      audio.muted = false;
      audio.volume = CONFIG.loudSound === false ? 0.85 : 1;
      const repeats = row.priority === "high"
        ? Number(CONFIG.highPrioritySoundRepeats || 3)
        : Number(CONFIG.normalSoundRepeats || 1);
      for (let i = 0; i < Math.max(1, repeats); i += 1) {
        audio.currentTime = 0;
        await audio.play();
        if (i < repeats - 1) await wait(950);
      }
    } catch (error) {
      console.warn("Notification sound blocked until user clicks the page once.", error?.message || error);
    }
  }

  function autoRequestPermission(identity) {
    if (CONFIG.autoRequestPermission === false) return;
    if (!("Notification" in window)) return;
    if (Notification.permission !== "default") return;
    window.setTimeout(() => {
      enablePush(identity.role, identity.recipientId).catch((error) => {
        console.warn("Auto notification permission request failed:", error?.message || error);
      });
    }, 800);
  }

  function pickText(type, customTitle, customBody) {
    const defaults = EVENT_COPY[type] || EVENT_COPY.high_priority;
    return {
      title: customTitle || defaults[0],
      body: customBody || defaults[1]
    };
  }

  function normalizeRole(role) {
    const r = String(role || "").toLowerCase();
    if (["seller", "shop", "shopkeeper"].includes(r)) return "shopkeeper";
    if (["rider", "delivery", "delivery_partner", "delivery-partner"].includes(r)) return "delivery_partner";
    if (r === "admin") return "admin";
    return "user";
  }

  function currentIdentity(explicitRole, explicitRecipientId) {
    const savedShop = safeJson(localStorage.getItem("flashfitShopSession") || localStorage.getItem("flashfit_shop_session") || localStorage.getItem("flashfit_active_shop"));
    const riderSession = safeJson(localStorage.getItem("flashfit_rider_session"));
    const adminRole = localStorage.getItem("flashfit_role") === "admin";
    const userId = localStorage.getItem("flashfit_user_id") || getDeviceId();
    const path = location.pathname.toLowerCase();

    let role = normalizeRole(explicitRole);
    let recipientId = explicitRecipientId || "";

    if (!explicitRole) {
      // Prefer the build-injected app identity: the legacy folder names below do
      // not appear in the path once each app is served from its own domain.
      if (IDENTITY) role = IDENTITY.role;
      else if (path.includes("admin-panel")) role = "admin";
      else if (path.includes("shopfit")) role = "shopkeeper";
      else if (path.includes("delevery_patner")) role = "delivery_partner";
      else if (path.includes("flashfitshop")) role = "user";
      else role = "user";
    }

    if (!recipientId) {
      if (role === "admin") recipientId = "admin";
      else if (role === "shopkeeper") recipientId = String(savedShop?.id || savedShop?.shop_id || "shopkeeper");
      else if (role === "delivery_partner") recipientId = String(riderSession?.partner_id || riderSession?.id || "delivery_partner");
      else recipientId = userId;
    }

    return { role, recipientId, userId };
  }

  function safeJson(raw) {
    try {
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
  }

  async function registerServiceWorker() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
    const swUrl = new URL("/notification-sw.js?v=20260805-role-fix", location.origin).toString();
    const registration = await navigator.serviceWorker.register(swUrl, { scope: "/" });
    registration.update().catch(() => {});
    return registration;
  }

  async function requestPushPermission() {
    if (!("Notification" in window)) return "unsupported";
    if (Notification.permission === "granted") return "granted";
    if (Notification.permission === "denied") return "denied";
    return Notification.requestPermission();
  }

  async function enablePush(role, recipientId) {
    const identity = currentIdentity(role, recipientId);
    state = { ...state, ...identity };

    const permission = await requestPushPermission();
    if (permission !== "granted") return { ok: false, error: `Notification permission ${permission}.` };

    const registration = await registerServiceWorker();
    if (!registration) return { ok: false, error: "Service worker or Push API is not available." };

    if (!CONFIG.vapidPublicKey || CONFIG.vapidPublicKey.includes("REPLACE")) {
      return { ok: false, error: "VAPID public key is missing." };
    }

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(CONFIG.vapidPublicKey)
      });
    }

    await savePushSubscription(subscription, identity);
    renderLauncher();
    return { ok: true, subscription };
  }

  async function savePushSubscription(subscription, identity) {
    const db = getClient();
    const payload = {
      role: identity.role,
      recipient_id: String(identity.recipientId),
      user_id: identity.userId || null,
      device_id: getDeviceId(),
      endpoint: subscription.endpoint,
      subscription: subscription.toJSON(),
      user_agent: navigator.userAgent,
      active: true,
      updated_at: new Date().toISOString()
    };

    if (db) {
      const { error } = await db.from("push_subscriptions").upsert(payload, { onConflict: "endpoint" });
      if (!error) return true;
      console.warn("Push subscription DB save failed:", error.message);
    }
    localStorage.setItem("flashfit_push_subscription", JSON.stringify(payload));
    return false;
  }

  async function create(type, options = {}) {
    const db = getClient();
    const priority = options.priority || (["system_error", "payment_failure", "delivery_issue", "high_priority"].includes(type) ? "high" : "normal");
    const text = pickText(type, options.title, options.body);
    const recipients = buildRecipients(type, options);
    const now = new Date().toISOString();

    const rows = recipients.map((recipient) => ({
      event_type: type,
      title: text.title,
      body: text.body,
      priority,
      role: recipient.role,
      recipient_id: String(recipient.recipientId),
      actor_role: options.actorRole || state.role || null,
      actor_id: options.actorId ? String(options.actorId) : null,
      order_id: options.orderId || null,
      order_number: options.orderNumber || null,
      entity_type: options.entityType || null,
      entity_id: options.entityId ? String(options.entityId) : null,
      action_url: roleUrl(recipient.role, options),
      metadata: options.metadata || {},
      read_at: null,
      created_at: now
    }));

    let inserted = rows;
    if (db) {
      const { data, error } = await db.from("platform_notifications").insert(rows).select("*");
      if (!error && data) {
        inserted = data;
        triggerPush(data).catch((err) => console.warn("Push trigger failed:", err));
      } else if (error) {
        console.warn("Notification DB insert failed:", error.message);
        cacheLocal(rows);
      }
    } else {
      cacheLocal(rows);
    }

    inserted.forEach((row) => {
      if (row.role === state.role && String(row.recipient_id) === String(state.recipientId)) {
        playNotificationSound(row);
        showBrowserNotification(row);
      }
    });
    return inserted;
  }

  function buildRecipients(type, options) {
    const recipients = [{ role: "admin", recipientId: "admin" }];
    const add = (role, recipientId) => {
      if (!role || !recipientId) return;
      const item = { role: normalizeRole(role), recipientId: String(recipientId) };
      if (!recipients.some((r) => r.role === item.role && String(r.recipientId) === item.recipientId)) recipients.push(item);
    };

    (options.recipients || []).forEach((r) => add(r.role, r.recipientId || r.id));
    if (options.shopId) add("shopkeeper", options.shopId);
    if (options.deliveryPartnerId) add("delivery_partner", options.deliveryPartnerId);
    if (options.userId) add("user", options.userId);

    if (["offer", "order_update", "delivery_update", "refund_update", "return_update"].includes(type) && !options.userId) {
      add("user", getDeviceId());
    }
    return recipients;
  }

  async function triggerPush(notifications) {
    if (!CONFIG.edgeFunctionUrl) return;
    await fetch(CONFIG.edgeFunctionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${CONFIG.supabaseKey || ""}`
      },
      body: JSON.stringify({ notifications })
    });
  }

  function cacheLocal(rows) {
    const current = safeJson(localStorage.getItem(LOCAL_HISTORY_KEY)) || [];
    localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify([...rows, ...current].slice(0, 100)));
  }

  async function loadHistory(limit = 40) {
    const db = getClient();
    if (db) {
      const { data, error } = await db
        .from("platform_notifications")
        .select("*")
        .eq("role", state.role)
        .eq("recipient_id", String(state.recipientId))
        .order("created_at", { ascending: false })
        .limit(limit);
      if (!error && data) {
        state.notifications = data;
        state.unreadCount = data.filter((row) => !row.read_at).length;
        renderLauncher();
        renderPanel();
        return data;
      }
      if (error) console.warn("Notification history load failed:", error.message);
    }

    const local = (safeJson(localStorage.getItem(LOCAL_HISTORY_KEY)) || [])
      .filter((row) => row.role === state.role && String(row.recipient_id) === String(state.recipientId));
    state.notifications = local;
    state.unreadCount = local.filter((row) => !row.read_at).length;
    renderLauncher();
    renderPanel();
    return local;
  }

  async function markRead(id) {
    const db = getClient();
    const now = new Date().toISOString();
    state.notifications = state.notifications.map((row) => String(row.id) === String(id) ? { ...row, read_at: now } : row);
    state.unreadCount = state.notifications.filter((row) => !row.read_at).length;
    renderLauncher();
    renderPanel();
    if (db && id) await db.from("platform_notifications").update({ read_at: now }).eq("id", id);
  }

  async function markAllRead() {
    const db = getClient();
    const now = new Date().toISOString();
    state.notifications = state.notifications.map((row) => ({ ...row, read_at: row.read_at || now }));
    state.unreadCount = 0;
    renderLauncher();
    renderPanel();
    if (db) {
      await db
        .from("platform_notifications")
        .update({ read_at: now })
        .eq("role", state.role)
        .eq("recipient_id", String(state.recipientId))
        .is("read_at", null);
    }
  }

  function subscribeRealtime() {
    const db = getClient();
    if (!db) return null;
    const nextChannelName = `${CHANNEL_KEY}-${state.role}-${state.recipientId}`;
    if (channel && channelName === nextChannelName) return channel;
    if (channel) {
      try {
        db.removeChannel(channel);
      } catch (_) {}
      channel = null;
      channelName = "";
    }

    const nextChannel = db.channel(nextChannelName);
    nextChannel.on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "platform_notifications",
        filter: `role=eq.${state.role}`
      }, (payload) => {
        const row = payload.new;
        if (String(row.recipient_id) !== String(state.recipientId)) return;
        state.notifications = [row, ...state.notifications].slice(0, 80);
        state.unreadCount += row.read_at ? 0 : 1;
        renderLauncher();
        renderPanel();
        playNotificationSound(row);
        showBrowserNotification(row);
      });
    channel = nextChannel.subscribe();
    channelName = nextChannelName;
    return channel;
  }

  function showBrowserNotification(row) {
    if (!("Notification" in window) || Notification.permission !== "granted" || document.hidden) return;
    try {
      new Notification(row.title || "FlashFit", {
        body: row.body || "",
        icon: CONFIG.icon,
        tag: row.id || row.event_type,
        data: { url: safeActionUrl(row) }
      });
    } catch (_) {}
  }

  function injectStyles() {
    if (document.getElementById("flashfit-notification-styles")) return;
    const style = document.createElement("style");
    style.id = "flashfit-notification-styles";
    style.textContent = `
      .ff-notify-launcher{position:fixed;right:18px;bottom:90px;z-index:9999;width:52px;height:52px;border:0;border-radius:18px;background:#111827;color:#fff;box-shadow:0 18px 45px rgba(15,23,42,.28);display:flex;align-items:center;justify-content:center;cursor:pointer}
      .ff-notify-launcher span{position:absolute;right:-5px;top:-5px;min-width:22px;height:22px;padding:0 6px;border-radius:999px;background:#DFF24B;color:#0D0D0D;font:800 12px/22px Arial;text-align:center}
      .ff-notify-panel{position:fixed;right:18px;bottom:152px;z-index:9999;width:min(380px,calc(100vw - 28px));max-height:min(620px,calc(100vh - 180px));background:#fff;color:#101827;border:1px solid #e5e7eb;border-radius:18px;box-shadow:0 26px 70px rgba(15,23,42,.25);overflow:hidden;display:none}
      .ff-notify-panel.open{display:flex;flex-direction:column}
      .ff-notify-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 16px;border-bottom:1px solid #edf0f5}
      .ff-notify-head strong{font:800 16px/1.1 Arial}
      .ff-notify-actions{display:flex;gap:8px}
      .ff-notify-actions button,.ff-notify-permission{border:1px solid #e5e7eb;background:#fff;border-radius:10px;padding:8px 10px;font:800 12px Arial;cursor:pointer}
      .ff-notify-list{overflow:auto;padding:8px;display:flex;flex-direction:column;gap:8px}
      .ff-notify-item{border:1px solid #edf0f5;border-radius:14px;padding:11px;background:#f8fafc;cursor:pointer}
      .ff-notify-item.unread{background:#fff7ed;border-color:#fed7aa}
      .ff-notify-item.high{border-left:5px solid #ef4444}
      .ff-notify-item h4{margin:0 0 5px;font:800 13px/1.2 Arial;color:#111827}
      .ff-notify-item p{margin:0 0 7px;font:500 12px/1.35 Arial;color:#4b5563}
      .ff-notify-item small{font:700 10px/1 Arial;color:#8a94a6;text-transform:uppercase}
      .ff-notify-empty{padding:28px 16px;text-align:center;color:#6b7280;font:700 13px Arial}
      @media (max-width:640px){.ff-notify-launcher{right:14px;bottom:74px}.ff-notify-panel{right:10px;bottom:132px}}
    `;
    document.head.appendChild(style);
  }

  function renderLauncher() {
    injectStyles();
    let launcher = document.getElementById("ffNotifyLauncher");
    if (!launcher) {
      launcher = document.createElement("button");
      launcher.id = "ffNotifyLauncher";
      launcher.className = "ff-notify-launcher";
      launcher.type = "button";
      launcher.setAttribute("aria-label", "Notifications");
      launcher.innerHTML = "&#128276;<span hidden>0</span>";
      launcher.addEventListener("click", () => {
        renderPanel();
        document.getElementById("ffNotifyPanel")?.classList.toggle("open");
      });
      document.body.appendChild(launcher);
    }
    const badge = launcher.querySelector("span");
    if (badge) {
      badge.hidden = !state.unreadCount;
      badge.textContent = state.unreadCount > 99 ? "99+" : String(state.unreadCount);
    }
  }

  function renderPanel() {
    injectStyles();
    let panel = document.getElementById("ffNotifyPanel");
    if (!panel) {
      panel = document.createElement("aside");
      panel.id = "ffNotifyPanel";
      panel.className = "ff-notify-panel";
      document.body.appendChild(panel);
    }

    const permissionButton = Notification.permission === "granted"
      ? ""
      : `<button class="ff-notify-permission" type="button" data-ff-enable-push>Enable Push</button>`;
    const soundButton = soundUnlocked
      ? ""
      : `<button class="ff-notify-permission" type="button" data-ff-enable-sound>Enable Sound</button>`;

    const rows = state.notifications.length
      ? state.notifications.map((row) => `
        <article class="ff-notify-item ${row.read_at ? "" : "unread"} ${row.priority === "high" ? "high" : ""}" data-ff-notification-id="${row.id || ""}" data-ff-url="${safeActionUrl(row)}">
          <h4>${escapeHtml(row.title || "FlashFit")}</h4>
          <p>${escapeHtml(row.body || "")}</p>
          <small>${escapeHtml(row.event_type || "update")} • ${formatTime(row.created_at)}</small>
        </article>
      `).join("")
      : `<div class="ff-notify-empty">No notifications yet.</div>`;

    panel.innerHTML = `
      <div class="ff-notify-head">
        <strong>Notifications</strong>
        <div class="ff-notify-actions">
          ${soundButton}
          ${permissionButton}
          <button type="button" data-ff-mark-all>Read all</button>
          <button type="button" data-ff-close>Close</button>
        </div>
      </div>
      <div class="ff-notify-list">${rows}</div>
    `;

    panel.querySelector("[data-ff-close]")?.addEventListener("click", () => panel.classList.remove("open"));
    panel.querySelector("[data-ff-mark-all]")?.addEventListener("click", markAllRead);
    panel.querySelector("[data-ff-enable-push]")?.addEventListener("click", () => enablePush(state.role, state.recipientId));
    panel.querySelector("[data-ff-enable-sound]")?.addEventListener("click", async () => {
      await unlockSound();
      await playNotificationSound({ priority: "normal" });
      renderPanel();
    });
    panel.querySelectorAll("[data-ff-notification-id]").forEach((item) => {
      item.addEventListener("click", async () => {
        const id = item.getAttribute("data-ff-notification-id");
        const url = item.getAttribute("data-ff-url");
        if (id) await markRead(id);
        if (url) location.href = url;
      });
    });
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    }[char]));
  }

  function formatTime(value) {
    if (!value) return "now";
    try {
      return new Date(value).toLocaleString();
    } catch (_) {
      return "now";
    }
  }

  async function init(options = {}) {
    const identity = currentIdentity(options.role, options.recipientId);
    state = { ...state, ...identity };
    renderLauncher();
    renderPanel();
    wireSoundUnlock();
    await loadHistory();
    subscribeRealtime();
    if (options.autoEnablePush) enablePush(identity.role, identity.recipientId).catch(() => {});
    else autoRequestPermission(identity);
    return state;
  }

  window.flashfitNotifications = {
    init,
    create,
    enablePush,
    loadHistory,
    markRead,
    markAllRead,
    playSound: playNotificationSound,
    unlockSound,
    getState: () => ({ ...state })
  };

  document.addEventListener("DOMContentLoaded", () => {
    init().catch((err) => console.warn("FlashFit notification init failed:", err));
  });
})();

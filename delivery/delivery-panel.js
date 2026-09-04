const RIDER_SESSION_KEY = "flashfit_rider_session";
const DELIVERY_BASE_PAY = 40;

let client = null;
let currentPartner = null;
let activeTab = "new";
let html5QrCode = null;
let ordersChannel = null;
let partnerChannel = null;
let locationWatchId = null;
let securityFlags = {};
let state = {
  orders: [],
  earningsLogs: [],
  selectedOrder: null,
  lastLocation: null
};

const $ = (id) => document.getElementById(id);

function money(value) {
  return `Rs ${Math.round(Number(value || 0))}`;
}

function clean(value) {
  return String(value || "").replace(/<|>/g, "").trim();
}

function statusText(value) {
  return clean(value || "pending").replace(/_/g, " ");
}

function isDelivered(order) {
  return String(order.order_status || "").toLowerCase() === "delivered";
}

function isActiveOrder(order) {
  const s = String(order.order_status || "").toLowerCase();
  return ["accepted", "assigned", "packed", "out_for_delivery"].includes(s);
}

function hasActiveDelivery() {
  return state.orders.some(isActiveOrder);
}

function isNewOrder(order) {
  const s = String(order.order_status || "").toLowerCase();
  return ["pending", "accepted", "assigned"].includes(s);
}

function getOrderRef(order) {
  return order.order_number || order.id || "-";
}

function getOrderPay(order) {
  return Number(order.rider_earning || order.delivery_partner_earning || order.delivery_charge || DELIVERY_BASE_PAY || 0);
}

function getPaymentStatus(order) {
  return String(order.payment_status || "pending").toLowerCase();
}

function getPaymentMode(order) {
  return String(order.payment_mode || order.payment_reference || "").toLowerCase();
}

function isCodOrPendingPayment(order) {
  const status = getPaymentStatus(order);
  const mode = getPaymentMode(order);
  return mode.includes("cod") || ["pending", "failed", "payment_pending"].includes(status);
}

function isPaymentReceivedFromCustomer(order) {
  return (isCodOrPendingPayment(order) && ["paid", "success"].includes(getPaymentStatus(order)))
    || (!isCodOrPendingPayment(order) && ["paid", "success"].includes(getPaymentStatus(order)));
}

function isPaymentHandedToShopkeeper(order) {
  return state.earningsLogs.some((row) => {
    const status = String(row.status || row.type || "").toLowerCase();
    return status === "payment_to_shopkeeper"
      && String(row.order_number || "") === String(order.order_number || "");
  }) || localStorage.getItem(`ff_payment_to_shopkeeper_${order.id}`) === "true";
}

function paymentLabel(order) {
  const status = getPaymentStatus(order);
  if (isPaymentHandedToShopkeeper(order)) return "Payment to shopkeeper";
  if (isCodOrPendingPayment(order) && ["paid", "success"].includes(status)) return "Payment received from customer";
  if (status === "paid" || status === "success") return "Paid online";
  if (getPaymentMode(order).includes("cod")) return "COD collect";
  return statusText(status || "pending");
}

function platformBreakdown(order) {
  const total = Number(order.total || order.amount || order.customer_price || 0);
  const platform = Number(order.commission_amount || order.platform_earning || 0);
  const gateway = Number(order.gateway_fee || order.gateway_amount || 0);
  const delivery = Number(order.delivery_fee || order.delivery_charge || 0);
  const shopPay = Math.max(0, total - platform - gateway - delivery);
  return { total, platform, gateway, delivery, shopPay };
}

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

function showMsg(text, isError = false) {
  const el = $("riderMessage");
  if (!el) return;
  el.textContent = text;
  el.className = `rider-message ${isError ? "error" : "success"}`;
}

function getSession() {
  try {
    return JSON.parse(localStorage.getItem(RIDER_SESSION_KEY) || "null");
  } catch (_error) {
    return null;
  }
}

function saveSession(partner) {
  localStorage.setItem(RIDER_SESSION_KEY, JSON.stringify({ partner_id: partner.id, login_time: Date.now() }));
}

async function loginPartner() {
  const btn = $("btnConnect");
  const mobile = clean($("loginMobile")?.value);
  const password = clean($("loginPass")?.value);
  if (!mobile || !password) return alert("Please enter Mobile Number & Password.");
  if (!/^[6-9]\d{9}$/.test(mobile)) return alert("Please enter a valid 10 digit mobile number.");

  btn.disabled = true;
  btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Signing In...';
  try {
    const { data, error } = await client
      .from("delivery_partners")
      .select("*")
      .eq("phone", mobile)
      .eq("partner_password", password)
      .eq("active", true)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Invalid Mobile Number or Password");
    saveSession(data);
    window.location.href = "delivery-panel.html";
  } catch (error) {
    btn.disabled = false;
    btn.innerHTML = 'Sign In <i class="fa-solid fa-arrow-right"></i>';
    alert(error.message);
  }
}

async function loadPartner() {
  const session = getSession();
  if (!session) {
    location.href = "index.html";
    return null;
  }
  const { data, error } = await client
    .from("delivery_partners")
    .select("*")
    .eq("id", session.partner_id)
    .eq("active", true)
    .maybeSingle();
  if (error || !data) {
    localStorage.removeItem(RIDER_SESSION_KEY);
    location.href = "index.html";
    return null;
  }
  currentPartner = data;
  return data;
}

async function safeSelect(table, buildQuery) {
  try {
    const query = buildQuery(client.from(table));
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.warn(`[Delivery Panel] ${table}:`, error.message);
    return [];
  }
}

async function loadOrders() {
  if (!currentPartner) return;
  state.orders = await safeSelect("seller_orders", (q) => q
    .select("*")
    .eq("delivery_partner_id", currentPartner.id)
    .order("created_at", { ascending: false })
    .limit(200));
}

async function loadEarningsLogs() {
  if (!currentPartner) return;
  let rows = await safeSelect("delivery_earnings_logs", (q) => q
    .select("*")
    .eq("partner_id", currentPartner.id)
    .order("created_at", { ascending: false })
    .limit(200));
  if (!rows.length) {
    rows = await safeSelect("delivery_earnings_logs", (q) => q
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200));
    rows = rows.filter((row) => String(row.partner_id || row.delivery_partner_id || row.rider_id || "") === String(currentPartner.id));
  }
  state.earningsLogs = rows;
}

async function refreshAll() {
  await Promise.all([loadOrders(), loadEarningsLogs()]);
  if (!hasActiveDelivery()) stopLocationTracking();
  else if (currentPartner?.on_duty) startLocationTracking();
  renderDashboard();
}

function updatePartnerUI() {
  setText("partnerName", currentPartner.full_name || currentPartner.name || "Delivery Partner");
  const duty = $("dutySwitch");
  if (duty) duty.checked = !!currentPartner.on_duty;
  const badge = $("dutyStatus");
  if (badge) {
    badge.textContent = currentPartner.on_duty ? "Online" : "Offline";
    badge.className = currentPartner.on_duty ? "status-badge online" : "status-badge";
  }
}

function renderDashboard() {
  updatePartnerUI();
  const todayKey = new Date().toISOString().slice(0, 10);
  const weekStart = Date.now() - (6 * 24 * 60 * 60 * 1000);
  const delivered = state.orders.filter(isDelivered);
  const todayDelivered = delivered.filter((order) => String(order.delivered_at || order.updated_at || order.created_at || "").startsWith(todayKey));
  const weeklyDelivered = delivered.filter((order) => new Date(order.delivered_at || order.updated_at || order.created_at || 0).getTime() >= weekStart);
  const codOrders = state.orders.filter(isCodOrPendingPayment);
  const codCollected = codOrders
    .filter(isPaymentReceivedFromCustomer)
    .reduce((sum, order) => sum + Number(order.total || order.amount || order.customer_price || 0), 0);
  const deliveredFallback = delivered.reduce((sum, order) => sum + getOrderPay(order), 0);
  const adminPaidTotal = state.earningsLogs
    .filter((row) => ["admin_paid_partner", "partner_payout_paid"].includes(String(row.type || row.status || "").toLowerCase()))
    .reduce((sum, row) => sum + Number(row.amount || row.earning_amount || row.delivery_fee || 0), 0);
  const todayPay = todayDelivered.reduce((sum, order) => sum + getOrderPay(order), 0);
  const weeklyPay = weeklyDelivered.reduce((sum, order) => sum + getOrderPay(order), 0);
  const todayCod = todayDelivered
    .filter(isCodOrPendingPayment)
    .reduce((sum, order) => sum + Number(order.total || order.amount || order.customer_price || 0), 0);
  const wallet = Math.max(Number(currentPartner.wallet_balance || 0), adminPaidTotal);

  setText("walletBalance", money(wallet));
  setText("todayEarnings", money(todayPay));
  setText("todayOrders", String(todayDelivered.length));
  setText("metricTodayEarnings", money(todayPay));
  setText("metricTodayOrders", `${todayDelivered.length} deliveries`);
  setText("metricWeeklyEarnings", money(weeklyPay));
  setText("metricCodCollected", money(codCollected));
  setText("metricDeliveryCharges", money(deliveredFallback));
  setText("totalDeliveries", String(delivered.length));
  setText("settledAmount", money(adminPaidTotal));
  setText("pendingSettlement", money(Math.max(deliveredFallback - adminPaidTotal, 0)));
  setText("settlementTodayCod", money(todayCod));
  setText("settlementTodayDelivery", money(todayPay));
  setText("settlementCompletedCount", String(state.earningsLogs.filter((row) => ["admin_paid_partner", "partner_payout_paid", "delivery_fee"].includes(String(row.type || row.status || "").toLowerCase())).length));
  setText("settlementWalletBalance", money(wallet));
  setText("lastSyncText", `Synced ${new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`);

  renderTasks();
  renderHistory();
  renderTrackingCard();
}

function filteredOrders() {
  if (activeTab === "history") return state.orders.filter(isDelivered);
  if (activeTab === "active") return state.orders.filter(isActiveOrder);
  return state.orders.filter((order) => isNewOrder(order) && !isDelivered(order));
}

function renderTasks() {
  const area = $("taskArea");
  if (!area) return;
  const rows = filteredOrders();
  if (!rows.length) {
    area.innerHTML = `<div class="empty-state"><i class="fa-solid fa-box-open"></i><strong>No ${activeTab} tasks</strong><p>Assigned deliveries will appear here automatically.</p></div>`;
    return;
  }
  area.innerHTML = rows.map((order) => orderCard(order)).join("");
}

function orderCard(order) {
  const ref = getOrderRef(order);
  const status = String(order.order_status || "pending").toLowerCase();
  const phone = order.customer_phone || order.mobile || order.phone || "-";
  const address = order.customer_address || order.address || order.delivery_address || "Address not available";
  const pricing = platformBreakdown(order);
  const needsCollection = isCodOrPendingPayment(order) && !isPaymentReceivedFromCustomer(order);
  const canHandToShop = isDelivered(order) && isPaymentReceivedFromCustomer(order) && !isPaymentHandedToShopkeeper(order) && isCodOrPendingPayment(order);
  const customerName = clean(order.customer_name || order.user_name || "customer");
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  return `
    <article class="task-card">
      <div class="task-top">
        <div>
          <span class="task-label">Order ${clean(ref)}</span>
          <h3>${clean(order.customer_name || order.user_name || "Customer")}</h3>
        </div>
        <span class="order-status ${status}">${statusText(status)}</span>
      </div>
      ${codStepper(order)}
      <div class="task-grid">
        <div><span>Phone</span><strong>${clean(phone)}</strong></div>
        <div><span>COD Amount</span><strong>${money(pricing.total)}</strong></div>
        <div><span>Delivery Charge</span><strong>${money(getOrderPay(order))}</strong></div>
        <div><span>Payment</span><strong>${clean(paymentLabel(order))}</strong></div>
      </div>
      <div class="fee-strip">
        <span>Shop settlement: <strong>${money(pricing.shopPay)}</strong></span>
        <span>Platform: ${money(pricing.platform)}</span>
        <span>Gateway: ${money(pricing.gateway)}</span>
        <span>Delivery Charge: ${money(getOrderPay(order))}</span>
      </div>
      <p class="task-address"><i class="fa-solid fa-location-dot"></i>${clean(address)}</p>
      ${status === "out_for_delivery" ? `
        <div class="otp-row">
          <input data-otp-for="${order.id}" type="tel" inputmode="numeric" maxlength="6" placeholder="Enter customer OTP" />
          <small>Customer se OTP lekar hi delivery complete karein.</small>
        </div>
      ` : ""}
      <div class="task-actions">
        ${status === "assigned" || status === "pending" ? `<button data-status-order="${order.id}" data-status-value="accepted">Accept Delivery</button>` : ""}
        ${status === "accepted" ? `<button data-status-order="${order.id}" data-status-value="out_for_delivery">Start Delivery</button>` : ""}
        <a class="action-link secondary" target="_blank" rel="noopener" href="${mapsUrl}"><i class="fa-solid fa-map-location-dot"></i> Open Maps</a>
        ${phone !== "-" ? `<a class="action-link ghost" href="tel:${clean(phone)}"><i class="fa-solid fa-phone"></i> Call Customer</a>` : ""}
        ${status === "out_for_delivery" && !order.delivery_otp ? `<button data-status-order="${order.id}" data-status-value="out_for_delivery">Generate OTP</button>` : ""}
        ${needsCollection ? `<button data-payment-order="${order.id}" data-payment-value="payment_received_from_customer" class="success">Cash Collected</button>` : ""}
        ${status === "out_for_delivery" ? `<button data-status-order="${order.id}" data-status-value="delivered" class="success">Complete</button>` : ""}
        ${canHandToShop ? `<button data-payment-order="${order.id}" data-payment-value="payment_to_shopkeeper" class="success">Payment to shopkeeper</button>` : ""}
        ${!isDelivered(order) ? `<button data-status-order="${order.id}" data-status-value="cancelled" class="danger">Failed</button>` : ""}
        <button data-focus-order="${order.id}" class="ghost">Track</button>
      </div>
    </article>
  `;
}

function stepClass(condition, failed = false) {
  if (failed) return "failed";
  return condition ? "completed" : "pending";
}

function stepBadge(condition, failed = false) {
  if (failed) return "Failed";
  return condition ? "Completed" : "Pending";
}

function codStepper(order) {
  const status = String(order.order_status || "pending").toLowerCase();
  const failed = status === "cancelled" || status === "failed";
  const cashCollected = isPaymentReceivedFromCustomer(order);
  const delivered = isDelivered(order);
  const handedToShop = isPaymentHandedToShopkeeper(order);
  const outForDelivery = status === "out_for_delivery" || delivered;
  const steps = [
    ["Accept Delivery", ["accepted", "out_for_delivery", "delivered"].includes(status), failed],
    ["Start Delivery", outForDelivery, failed],
    ["Cash Collected", cashCollected, failed],
    ["Go To Shopkeeper", delivered || handedToShop, failed],
    ["Receive Settlement OTP", handedToShop, false],
    ["Delivery Charge Received", delivered, false],
    ["Settlement Completed", delivered || handedToShop, failed]
  ];
  if (!isCodOrPendingPayment(order)) {
    steps[2][0] = "Payment Confirmed";
    steps[2][1] = true;
  }
  if (outForDelivery && !cashCollected && isCodOrPendingPayment(order)) steps[2][1] = false;
  return `
    <div class="cod-stepper">
      ${steps.map(([label, done, isFailed], index) => `
        <div class="cod-step ${stepClass(done, isFailed)}">
          <span>${index + 1}</span>
          <p>${label}</p>
          <em>${stepBadge(done, isFailed)}</em>
        </div>
      `).join("")}
    </div>
  `;
}

function renderHistory() {
  const list = $("settlementHistory");
  if (!list) return;
  const rows = state.earningsLogs.slice(0, 20);
  if (!rows.length) {
    list.innerHTML = `<div class="empty-state compact"><strong>No settlement logs yet</strong><p>Delivered orders will create payout history where DB permissions allow.</p></div>`;
    return;
  }
  list.innerHTML = rows.map((row) => `
    <div class="history-row">
      <div><strong>${money(row.amount || row.earning_amount || row.delivery_fee || 0)}</strong><span>${clean(historyLabel(row))}</span></div>
      <small>${new Date(row.created_at || Date.now()).toLocaleString("en-IN")}</small>
    </div>
  `).join("");
}

function historyLabel(row) {
  const type = String(row.type || row.status || "").toLowerCase();
  if (type === "admin_paid_partner" || type === "partner_payout_paid") return `Admin paid rider - ${row.order_number || "bulk payout"}`;
  if (type === "delivery_fee") return `Delivery earning pending admin payout - ${row.order_number || "order"}`;
  if (type === "payment_to_shopkeeper") return `COD handed to shopkeeper - ${row.order_number || "order"}`;
  return row.order_number || row.order_id || "Settlement";
}

function renderTrackingCard() {
  const box = $("trackingResult");
  if (!box) return;
  const loc = state.lastLocation || currentPartner;
  const lat = Number(loc.current_lat || loc.latitude || loc.lat);
  const lng = Number(loc.current_lng || loc.longitude || loc.lng);
  const hasLocation = Number.isFinite(lat) && Number.isFinite(lng) && lat && lng;
  box.innerHTML = `
    <div class="track-result-row">
      <span>Partner</span><strong>${clean(currentPartner.full_name || currentPartner.phone)}</strong>
    </div>
    <div class="track-result-row">
      <span>Last location</span><strong>${hasLocation ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : "GPS not saved yet"}</strong>
    </div>
    ${hasLocation ? `<a class="map-link prominent" target="_blank" rel="noopener" href="https://www.google.com/maps?q=${lat},${lng}"><i class="fa-solid fa-map-location-dot"></i> Open Google Maps</a>` : `<p class="hint-line">Turn duty online and allow location permission.</p>`}
  `;
}

async function setDuty(online) {
  currentPartner.on_duty = online;
  updatePartnerUI();
  const payload = { on_duty: online };
  const { error } = await client.from("delivery_partners").update(payload).eq("id", currentPartner.id);
  if (error) showMsg(error.message, true);
  // On-duty availability alone must not initiate continuous location tracking.
  if (online && hasActiveDelivery()) startLocationTracking();
  else stopLocationTracking();
}

function startLocationTracking() {
  if (!navigator.geolocation || locationWatchId) return;
  if (!hasActiveDelivery()) return;
  locationWatchId = navigator.geolocation.watchPosition(async (position) => {
    const activeOrder = state.orders.find(isActiveOrder);
    if (!activeOrder) return stopLocationTracking();
    const coords = {
      current_lat: position.coords.latitude,
      current_lng: position.coords.longitude,
      location_updated_at: new Date().toISOString()
    };
    state.lastLocation = coords;
    renderTrackingCard();
    try {
      await client.rpc(securityFlags.secure_gps_v1 ? "record_partner_location_v2" : "record_partner_location", {
        p_order_id: activeOrder.id,
        p_latitude: coords.current_lat,
        p_longitude: coords.current_lng,
        p_accuracy_meters: position.coords.accuracy || null
      });
    } catch (_error) {
      // Older deployments may not have the additive migration yet.
    }
    let { error } = await client.from("delivery_partners").update(coords).eq("id", currentPartner.id);
    if (error && /current_lat|current_lng|location_updated_at/i.test(error.message || "")) {
      await client.from("delivery_partners").update({
        latitude: coords.current_lat,
        longitude: coords.current_lng
      }).eq("id", currentPartner.id);
    }
  }, () => {
    showMsg("Location permission needed for live tracking.", true);
  }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 });
}

function stopLocationTracking() {
  if (locationWatchId && navigator.geolocation) navigator.geolocation.clearWatch(locationWatchId);
  locationWatchId = null;
}

async function updateOrderStatus(orderId, nextStatus, enteredOtp = "") {
  const now = new Date().toISOString();
  const currentOrder = state.orders.find((row) => String(row.id) === String(orderId)) || state.selectedOrder || {};
  if (nextStatus === "delivered") {
    const expectedOtp = clean(currentOrder.delivery_otp);
    const givenOtp = clean(enteredOtp);
    if (!expectedOtp) {
      return showMsg("Delivery OTP not generated yet. Start Delivery first.", true);
    }
    if (!givenOtp || givenOtp !== expectedOtp) {
      return showMsg("Wrong OTP. Customer se correct OTP lekar enter karein.", true);
    }
    if (isCodOrPendingPayment(currentOrder) && !isPaymentReceivedFromCustomer(currentOrder)) {
      return showMsg("COD/Pending payment pehle customer se receive mark karein.", true);
    }
  }

  const payload = { order_status: nextStatus };
  if (nextStatus === "out_for_delivery") {
    payload.out_for_delivery_at = now;
    payload.delivery_partner_status = "on_the_way";
    if (!currentOrder.delivery_otp) {
      payload.delivery_otp = Math.floor(1000 + Math.random() * 9000).toString();
    }
  }
  if (nextStatus === "delivered") {
    payload.delivered_at = now;
    payload.delivery_partner_status = "delivered";
    if (!isCodOrPendingPayment(currentOrder)) payload.payment_status = "paid";
  }
  if (nextStatus === "cancelled") {
    payload.delivery_partner_status = "failed";
  }

  let { error } = await client.from("seller_orders").update(payload).eq("id", orderId);
  if (error && /delivery_partner_status|out_for_delivery_at|delivered_at|payment_status|delivery_otp/i.test(error.message || "")) {
    const fallback = { order_status: nextStatus };
    error = (await client.from("seller_orders").update(fallback).eq("id", orderId)).error;
  }
  if (error) return showMsg(error.message, true);

  if (window.flashfitNotifications) {
    const eventMap = {
      out_for_delivery: "delivery_update",
      delivered: "order_delivered",
      cancelled: "delivery_cancelled"
    };
    const eventType = eventMap[nextStatus] || "delivery_update";
    await window.flashfitNotifications.create(eventType, {
      title: `Delivery ${statusText(nextStatus)}: ${getOrderRef(currentOrder)}`,
      body: `${currentPartner.full_name || "Delivery partner"} updated order ${getOrderRef(currentOrder)} to ${statusText(nextStatus)}.`,
      priority: nextStatus === "cancelled" ? "high" : "normal",
      shopId: currentOrder.shop_id || null,
      deliveryPartnerId: currentPartner.id,
      userId: currentOrder.user_id || null,
      orderId,
      orderNumber: currentOrder.order_number || null,
      entityType: "seller_orders",
      entityId: orderId,
      metadata: { status: nextStatus }
    });
  }

  if (nextStatus === "delivered") await createSettlement(orderId);
  showMsg(`Order marked ${statusText(nextStatus)}.`);
  await refreshAll();
}

async function updatePaymentStatus(orderId, nextStatus) {
  const order = state.orders.find((row) => String(row.id) === String(orderId)) || state.selectedOrder || {};
  const now = new Date().toISOString();
  if (nextStatus === "payment_received_from_customer") {
    let { error } = await client.from("seller_orders").update({
      payment_status: "paid",
      payment_received_at: now
    }).eq("id", orderId);
    if (error && /payment_received_at/i.test(error.message || "")) {
      error = (await client.from("seller_orders").update({ payment_status: "paid" }).eq("id", orderId)).error;
    }
    if (error) return showMsg(error.message, true);
    if (window.flashfitNotifications) {
      await window.flashfitNotifications.create("payment_success", {
        title: `Payment Received ${getOrderRef(order)}`,
        body: `Payment received from ${clean(order.customer_name || order.user_name || "customer")} for order ${getOrderRef(order)}.`,
        shopId: order.shop_id || null,
        deliveryPartnerId: currentPartner.id,
        userId: order.user_id || null,
        orderId,
        orderNumber: order.order_number || null,
        entityType: "seller_orders",
        entityId: orderId,
        metadata: { source: "delivery_partner_cod_collection" }
      });
    }
    showMsg("Payment received from customer.");
    await refreshAll();
    return;
  }

  if (nextStatus === "payment_to_shopkeeper") {
    await markPaymentToShopkeeper(order);
    if (window.flashfitNotifications) {
      await window.flashfitNotifications.create("payment_success", {
        title: `Payment To Shopkeeper ${getOrderRef(order)}`,
        body: `COD payment for order ${getOrderRef(order)} was handed to shopkeeper.`,
        shopId: order.shop_id || null,
        deliveryPartnerId: currentPartner.id,
        userId: order.user_id || null,
        orderId,
        orderNumber: order.order_number || null,
        entityType: "delivery_earnings_logs",
        entityId: orderId,
        metadata: { source: "payment_to_shopkeeper" }
      });
    }
    showMsg("Payment to shopkeeper marked.");
    await refreshAll();
    return;
  }
}

async function markPaymentToShopkeeper(order) {
  if (!order || !order.id) return;
  if (isPaymentHandedToShopkeeper(order)) return;
  const amount = Number(order.shop_payout || order.shop_price || 0);
  const payload = {
    partner_id: currentPartner.id,
    order_number: order.order_number || null,
    amount,
    type: "payment_to_shopkeeper",
    created_at: new Date().toISOString()
  };
  const { error } = await client.from("delivery_earnings_logs").insert(payload);
  if (error) {
    console.warn("[Delivery Panel] payment handover log:", error.message);
    localStorage.setItem(`ff_payment_to_shopkeeper_${order.id}`, "true");
  }
}

async function createSettlement(orderId) {
  const order = state.orders.find((row) => String(row.id) === String(orderId)) || {};
  const alreadySettled = state.earningsLogs.some((row) => {
    return String(row.type || "") === "delivery_fee"
      && order.order_number
      && String(row.order_number || "") === String(order.order_number);
  });
  if (alreadySettled) return;
  const amount = getOrderPay(order);
  const payload = {
    partner_id: currentPartner.id,
    order_number: order.order_number || null,
    amount,
    type: "delivery_fee",
    created_at: new Date().toISOString()
  };
  await client.from("delivery_earnings_logs").insert(payload);
}

function parseOrderInput(value) {
  const text = clean(value);
  if (!text) return "";
  try {
    const url = new URL(text);
    return url.searchParams.get("id") || url.searchParams.get("order") || url.searchParams.get("order_number") || text;
  } catch (_error) {
    return text.replace(/^order[:#-]*/i, "").trim();
  }
}

async function findOrderByRef(rawValue) {
  const ref = parseOrderInput(rawValue);
  if (!ref) throw new Error("Enter order ID or scan QR first.");
  const local = state.orders.find((row) => [row.id, row.order_number].some((value) => String(value || "") === ref));
  if (local) return local;

  let { data, error } = await client.from("seller_orders").select("*").eq("order_number", ref).maybeSingle();
  if (!data && !error && /^\d+$/.test(ref)) {
    const byId = await client.from("seller_orders").select("*").eq("id", Number(ref)).maybeSingle();
    data = byId.data;
    error = byId.error;
  }
  if (error) throw error;
  if (!data) throw new Error("Order not found.");
  if (data.delivery_partner_id && String(data.delivery_partner_id) !== String(currentPartner.id)) {
    throw new Error("This order is assigned to another delivery partner.");
  }
  return data;
}

async function lookupManualOrder(value) {
  try {
    const order = await findOrderByRef(value);
    state.selectedOrder = order;
    renderLookupResult(order);
    showMsg("Order loaded.");
  } catch (error) {
    showMsg(error.message, true);
  }
}

function renderLookupResult(order) {
  const box = $("manualOrderResult");
  if (!box) return;
  const assignedToMe = String(order.delivery_partner_id || "") === String(currentPartner.id);
  const unassigned = !order.delivery_partner_id;
  box.innerHTML = `
    ${unassigned ? `<button class="assign-me-btn" data-assign-order="${order.id}"><i class="fa-solid fa-user-check"></i> Assign to me</button>` : ""}
    ${!assignedToMe && !unassigned ? `<div class="empty-state compact error"><strong>This order is assigned to another partner.</strong></div>` : orderCard(order)}
  `;
}

async function assignOrderToMe(orderId) {
  const payload = {
    delivery_partner_id: currentPartner.id,
    delivery_partner_status: "assigned",
    partner_assigned_at: new Date().toISOString()
  };
  let { error } = await client.from("seller_orders").update(payload).eq("id", orderId);
  if (error && /delivery_partner_status|partner_assigned_at/i.test(error.message || "")) {
    error = (await client.from("seller_orders").update({ delivery_partner_id: currentPartner.id }).eq("id", orderId)).error;
  }
  if (error) return showMsg(error.message, true);
  showMsg("Order assigned to you.");
  
  if (window.flashfitNotifications) {
    await window.flashfitNotifications.create("new_delivery_assigned", {
      title: `Order Picked Up`,
      body: `${currentPartner.full_name || "A delivery partner"} assigned themselves to order #${orderId}.`,
      deliveryPartnerId: currentPartner.id,
      orderId: orderId,
      entityType: "seller_orders",
      entityId: orderId
    });
  }
  
  await refreshAll();
}

async function searchTracking(value) {
  const ref = clean(value);
  if (!ref) return showMsg("Enter order number, partner ID, or mobile number.", true);
  const box = $("trackingLookupResult");
  if (box) box.innerHTML = `<div class="empty-state compact"><strong>Searching...</strong></div>`;
  try {
    let result = null;
    const byOrder = await client.from("seller_orders").select("*").eq("order_number", ref).maybeSingle();
    if (byOrder.data) result = { type: "order", order: byOrder.data };
    if (!result && /^\d+$/.test(ref)) {
      const byPartner = await client.from("delivery_partners").select("*").eq("id", Number(ref)).maybeSingle();
      if (byPartner.data) result = { type: "partner", partner: byPartner.data };
    }
    if (!result && /^[6-9]\d{9}$/.test(ref)) {
      const byMobile = await client.from("delivery_partners").select("*").eq("phone", ref).maybeSingle();
      if (byMobile.data) result = { type: "partner", partner: byMobile.data };
    }
    if (!result) throw new Error("No tracking data found.");
    renderTrackingLookup(result);
  } catch (error) {
    if (box) box.innerHTML = `<div class="empty-state compact error"><strong>${clean(error.message)}</strong></div>`;
  }
}

async function renderTrackingLookup(result) {
  const box = $("trackingLookupResult");
  if (!box) return;
  let partner = result.partner || null;
  if (result.order && result.order.delivery_partner_id) {
    const { data } = await client.from("delivery_partners").select("*").eq("id", result.order.delivery_partner_id).maybeSingle();
    partner = data;
  }
  const order = result.order;
  const lat = Number(partner?.current_lat || partner?.latitude || partner?.lat);
  const lng = Number(partner?.current_lng || partner?.longitude || partner?.lng);
  const hasLocation = Number.isFinite(lat) && Number.isFinite(lng) && lat && lng;
  box.innerHTML = `
    <div class="tracking-card">
      ${order ? `<p><span>Order</span><strong>${clean(getOrderRef(order))} - ${statusText(order.order_status)}</strong></p>` : ""}
      <p><span>Partner</span><strong>${clean(partner?.full_name || partner?.phone || "Not assigned")}</strong></p>
      <p><span>Mobile</span><strong>${clean(partner?.phone || "-")}</strong></p>
      <p><span>Location</span><strong>${hasLocation ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : "Not available"}</strong></p>
      ${hasLocation ? `<a class="map-link" target="_blank" rel="noopener" href="https://www.google.com/maps?q=${lat},${lng}">Open map</a>` : ""}
    </div>
  `;
}

function startScanner() {
  const overlay = $("scannerOverlay");
  if (!overlay || !window.Html5Qrcode) return showMsg("QR scanner library not loaded.", true);
  overlay.style.display = "block";
  html5QrCode = new Html5Qrcode("qr-reader");
  html5QrCode.start({ facingMode: "environment" }, { fps: 12, qrbox: 250 }, async (text) => {
    $("scanSound")?.play?.();
    await stopScanner();
    const input = $("manualOrderInput");
    if (input) input.value = parseOrderInput(text);
    await lookupManualOrder(text);
  }).catch((error) => showMsg(error.message, true));
}

async function stopScanner() {
  const overlay = $("scannerOverlay");
  if (html5QrCode) {
    try { await html5QrCode.stop(); } catch (_error) { }
  }
  html5QrCode = null;
  if (overlay) overlay.style.display = "none";
}

function wirePanelEvents() {
  $("btnLogout")?.addEventListener("click", () => {
    localStorage.removeItem(RIDER_SESSION_KEY);
    stopLocationTracking();
    location.href = "index.html";
  });
  $("dutySwitch")?.addEventListener("change", (event) => setDuty(event.target.checked));
  document.querySelectorAll(".tab-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      document.querySelectorAll(".tab-pill").forEach((item) => item.classList.remove("active"));
      pill.classList.add("active");
      activeTab = pill.dataset.tab || "new";
      renderTasks();
    });
  });
  $("btnStartScan")?.addEventListener("click", startScanner);
  $("btnStopScan")?.addEventListener("click", stopScanner);
  $("manualOrderBtn")?.addEventListener("click", () => lookupManualOrder($("manualOrderInput")?.value));
  $("trackingSearchBtn")?.addEventListener("click", () => searchTracking($("trackingSearchInput")?.value));
  $("btnHistory")?.addEventListener("click", () => $("settlementPanel")?.scrollIntoView({ behavior: "smooth", block: "start" }));

  document.body.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.statusOrder) {
      const card = button.closest(".task-card");
      const otp = card?.querySelector(`[data-otp-for="${button.dataset.statusOrder}"]`)?.value || "";
      return updateOrderStatus(button.dataset.statusOrder, button.dataset.statusValue, otp);
    }
    if (button.dataset.paymentOrder) return updatePaymentStatus(button.dataset.paymentOrder, button.dataset.paymentValue);
    if (button.dataset.focusOrder) {
      const order = state.orders.find((row) => String(row.id) === String(button.dataset.focusOrder));
      if (order) {
        await renderTrackingLookup({ type: "order", order });
        $("trackingPanel")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
    if (button.dataset.assignOrder) return assignOrderToMe(button.dataset.assignOrder);
  });
}

function subscribeRealtime() {
  ordersChannel = client
    .channel(`rider-orders-${currentPartner.id}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "seller_orders", filter: `delivery_partner_id=eq.${currentPartner.id}` }, async () => {
      $("notifSound")?.play?.();
      await refreshAll();
    })
    .subscribe();
  partnerChannel = client
    .channel(`rider-self-${currentPartner.id}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "delivery_partners", filter: `id=eq.${currentPartner.id}` }, async () => {
      const partner = await loadPartner();
      if (partner) await refreshAll();
    })
    .subscribe();
}

async function init() {
  client = window.flashfitDB?.getSupabaseClient?.();
  if (!client) return alert("Supabase client not loaded.");

  const isLoginPage = window.location.pathname.includes("index.html") || window.location.pathname.endsWith("/");
  const isPanelPage = window.location.pathname.includes("delivery-panel.html");

  if (isLoginPage) {
    $("btnConnect")?.addEventListener("click", loginPartner);
    $("togglePass")?.addEventListener("click", () => {
      const input = $("loginPass");
      if (!input) return;
      input.type = input.type === "password" ? "text" : "password";
      $("togglePass").classList.toggle("fa-eye-slash");
    });
    return;
  }

  if (isPanelPage) {
    const partner = await loadPartner();
    if (!partner) return;
    securityFlags = await window.flashfitDB?.getSecurityFeatureFlags?.() || {};
    wirePanelEvents();
    await refreshAll();
    subscribeRealtime();
    if (currentPartner.on_duty && hasActiveDelivery()) startLocationTracking();
  }
}

document.addEventListener("DOMContentLoaded", init);

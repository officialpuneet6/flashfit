(function () {
  const SHOP_SESSION_KEYS = ["flashfitShopSession", "flashfit_active_shop", "flashfit_shop_session"];
  const RIDER_SESSION_KEY = "flashfit_rider_session";
  const DEVICE_KEY = "flashfitDeviceId";
  const MONEY = (value) => `Rs ${Math.round(Number(value || 0)).toLocaleString("en-IN")}`;
  const nowIso = () => new Date().toISOString();

  let db = null;
  let mode = "";
  let activeShop = null;
  let activePartner = null;

  function getDb() {
    if (db) return db;
    if (window.flashfitDB && window.flashfitDB.getSupabaseClient) db = window.flashfitDB.getSupabaseClient();
    if (!db && window.supabase && typeof window.supabase.from === "function") db = window.supabase;
    if (!db && window.supabase && typeof window.supabase.createClient === "function" && window.FLASHFIT_NOTIFICATION_CONFIG) {
      db = window.supabase.createClient(
        window.FLASHFIT_NOTIFICATION_CONFIG.supabaseUrl,
        window.FLASHFIT_NOTIFICATION_CONFIG.supabaseKey
      );
    }
    return db;
  }

  function safeJson(raw) {
    try { return raw ? JSON.parse(raw) : null; } catch (_) { return null; }
  }

  function getDeviceId() {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = `ff-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  }

  function getShopSession() {
    for (const key of SHOP_SESSION_KEYS) {
      const data = safeJson(localStorage.getItem(key));
      if (data && (data.id || data.shop_id)) return data;
    }
    return null;
  }

  function getRiderSession() {
    return safeJson(localStorage.getItem(RIDER_SESSION_KEY));
  }

  function clean(value) {
    return String(value || "").replace(/<|>/g, "").trim();
  }

  function isCod(order) {
    const mode = String(order.payment_mode || order.payment_reference || "").toLowerCase();
    return mode.includes("cod");
  }

  function deliveryCharge(order) {
    return Number(order.delivery_charge || order.delivery_fee || order.rider_earning || order.delivery_partner_earning || 40);
  }

  function commission(order) {
    return Number(order.commission_amount || order.platform_earning || Math.round(Number(order.total || 0) * 0.05));
  }

  function shopKeeps(order) {
    return Math.max(0, Number(order.total || 0) - deliveryCharge(order) - commission(order));
  }

  function setMessage(target, message, isError = false) {
    const el = typeof target === "string" ? document.getElementById(target) : target;
    if (!el) return;
    el.textContent = message;
    el.className = `ffx-msg ${isError ? "error" : "success"}`;
  }

  function injectStyles() {
    if (document.getElementById("ffxBusinessStyles")) return;
    const style = document.createElement("style");
    style.id = "ffxBusinessStyles";
    style.textContent = `
      .ffx-card{background:#fff;border:1px solid #e7edf5;border-radius:16px;padding:16px;margin:14px 0;box-shadow:0 12px 36px rgba(15,23,42,.08);color:#111827}
      .ffx-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}
      .ffx-head h3{margin:0;font:800 18px/1.1 Outfit,Arial,sans-serif}
      .ffx-head p{margin:4px 0 0;color:#64748b;font:600 12px/1.4 Outfit,Arial,sans-serif}
      .ffx-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px}
      .ffx-tile{border:1px solid #edf2f7;background:#f8fafc;border-radius:12px;padding:12px}
      .ffx-tile span{display:block;color:#64748b;font:700 11px/1.2 Outfit,Arial;text-transform:uppercase}
      .ffx-tile strong{display:block;margin-top:5px;font:900 20px/1 Outfit,Arial;color:#111827}
      .ffx-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
      .ffx-row input,.ffx-row select{min-height:42px;border:1px solid #dbe4ef;border-radius:10px;padding:0 12px;font:700 13px Outfit,Arial;flex:1;min-width:180px}
      .ffx-btn{border:0;border-radius:10px;min-height:42px;padding:0 14px;font:900 12px Outfit,Arial;cursor:pointer;background:#ff6b00;color:#fff}
      .ffx-btn.secondary{background:#111827}.ffx-btn.ghost{background:#fff;color:#111827;border:1px solid #dbe4ef}.ffx-btn.danger{background:#dc2626}
      .ffx-msg{margin:10px 0 0;font:800 12px Outfit,Arial}.ffx-msg.error{color:#dc2626}.ffx-msg.success{color:#15803d}
      .ffx-table{width:100%;border-collapse:collapse;margin-top:12px;font:700 12px Outfit,Arial}.ffx-table th,.ffx-table td{padding:9px;border-bottom:1px solid #edf2f7;text-align:left}.ffx-table th{color:#64748b;text-transform:uppercase;font-size:10px}
      .ffx-shop-closed-note{margin:8px 0 0;color:#b45309;background:#fff7ed;border:1px solid #fed7aa;border-radius:9px;padding:7px 9px;font:800 11px Outfit,Arial}
      @media(max-width:640px){.ffx-head{align-items:flex-start;flex-direction:column}.ffx-row input,.ffx-row select,.ffx-btn{width:100%;min-width:0}}
    `;
    document.head.appendChild(style);
  }

  async function audit(action, payload = {}) {
    const client = getDb();
    const row = {
      action,
      role: mode || "system",
      user_label: activeShop?.shop_login_id || activePartner?.phone || localStorage.getItem("flashfit_role") || "guest",
      order_id: payload.order_id || null,
      order_number: payload.order_number || null,
      status: payload.status || "recorded",
      payload,
      device: navigator.userAgent,
      created_at: nowIso()
    };
    if (!client) return;
    await client.from("flashfit_audit_logs").insert(row).then(async ({ error }) => {
      if (error) {
        await client.from("admin_activity_logs").insert({
          admin_username: row.user_label,
          action,
          entity_type: payload.entity_type || "business_extension",
          entity_id: String(payload.order_id || payload.order_number || ""),
          payload: row
        });
      }
    });
  }

  async function notify(type, options) {
    if (!window.flashfitNotifications) return;
    try { await window.flashfitNotifications.create(type, options); } catch (_) {}
  }

  async function loadOrderByRef(ref, filters = {}) {
    const client = getDb();
    if (!client || !ref) return null;
    let query = client.from("seller_orders").select("*");
    const numeric = /^\d+$/.test(String(ref));
    query = numeric ? query.or(`id.eq.${Number(ref)},order_number.eq.${ref}`) : query.eq("order_number", ref);
    if (filters.shopId) query = query.eq("shop_id", filters.shopId);
    if (filters.partnerId) query = query.eq("delivery_partner_id", filters.partnerId);
    const { data } = await query.limit(1);
    return data && data[0] ? data[0] : null;
  }

  async function upsertWallet(shopId) {
    const client = getDb();
    const { data } = await client.from("shop_wallets").select("*").eq("shop_id", shopId).maybeSingle();
    if (data) return data;
    const payload = { shop_id: shopId, pending_commission: 0, paid_commission: 0, cod_collection: 0, online_collection: 0, wallet_balance: 0, updated_at: nowIso() };
    const { data: inserted } = await client.from("shop_wallets").insert(payload).select("*").maybeSingle();
    return inserted || payload;
  }

  async function addWalletTxn(payload) {
    const client = getDb();
    await client.from("wallet_transactions").insert({ ...payload, created_at: nowIso() });
  }

  async function updateShopOpenState(isOpen) {
    const client = getDb();
    if (!client || !activeShop) return;
    let { error } = await client.from("shops").update({ is_open: isOpen, shop_open: isOpen, updated_at: nowIso() }).eq("id", activeShop.id);
    if (error && String(error.message || "").toLowerCase().includes("updated_at")) {
      ({ error } = await client.from("shops").update({ is_open: isOpen, shop_open: isOpen }).eq("id", activeShop.id));
    }
    if (error) return setMessage("ffxShopStatusMsg", error.message, true);
    activeShop = { ...activeShop, is_open: isOpen, shop_open: isOpen };
    localStorage.setItem("flashfitShopSession", JSON.stringify(activeShop));
    setMessage("ffxShopStatusMsg", isOpen ? "Shop is open. Orders will dispatch normally." : "Shop is closed. Customers can place pre-orders.");
    await audit("shop_open_close", { shop_id: activeShop.id, status: isOpen ? "open" : "closed" });
    await notify(isOpen ? "shop_opened" : "shop_closed", {
      title: `${activeShop.shop_name || "Shop"} ${isOpen ? "Opened" : "Closed"}`,
      body: isOpen ? "Shop is open for dispatch." : "Shop is closed; pre-orders remain enabled.",
      shopId: activeShop.id,
      entityType: "shops",
      entityId: activeShop.id,
      metadata: { is_open: isOpen }
    });
    renderShopStatusCard();
  }

  async function renderShopStatusCard() {
    const host = document.querySelector(".workspace .topbar") || document.querySelector(".topbar");
    if (!host || !activeShop) return;
    let card = document.getElementById("ffxShopStatusCard");
    if (!card) {
      card = document.createElement("section");
      card.id = "ffxShopStatusCard";
      card.className = "ffx-card";
      host.insertAdjacentElement("afterend", card);
    }
    const isOpen = activeShop.is_open !== false && activeShop.shop_open !== false;
    card.innerHTML = `
      <div class="ffx-head">
        <div><h3>Shop Open / Close</h3><p>Closed shop still accepts pre-orders. Customers see delivery after shop opens.</p></div>
        <strong>${isOpen ? "OPEN" : "CLOSED"}</strong>
      </div>
      <div class="ffx-row">
        <button class="ffx-btn" id="ffxShopOpenBtn" type="button">Shop Open</button>
        <button class="ffx-btn danger" id="ffxShopCloseBtn" type="button">Shop Close</button>
      </div>
      <p id="ffxShopStatusMsg" class="ffx-msg"></p>
    `;
    document.getElementById("ffxShopOpenBtn").onclick = () => updateShopOpenState(true);
    document.getElementById("ffxShopCloseBtn").onclick = () => updateShopOpenState(false);
  }

  async function renderShopWallet() {
    const host = document.querySelector('[data-tab="earnings"] .table-card') || document.querySelector('[data-tab="dashboard"]');
    if (!host || !activeShop || !getDb()) return;
    const wallet = await upsertWallet(activeShop.id);
    const { data: txns } = await getDb()
      .from("wallet_transactions")
      .select("*")
      .eq("shop_id", activeShop.id)
      .order("created_at", { ascending: false })
      .limit(12);
    let card = document.getElementById("ffxShopWalletCard");
    if (!card) {
      card = document.createElement("section");
      card.id = "ffxShopWalletCard";
      card.className = "ffx-card";
      host.insertAdjacentElement("beforebegin", card);
    }
    card.innerHTML = `
      <div class="ffx-head">
        <div><h3>Shopkeeper Wallet</h3><p>COD commission is collected weekly by FlashFit.</p></div>
        <button class="ffx-btn secondary" id="ffxPayCommissionBtn" type="button">Pay FlashFit Commission</button>
      </div>
      <div class="ffx-grid">
        <div class="ffx-tile"><span>Pending Commission</span><strong>${MONEY(wallet.pending_commission)}</strong></div>
        <div class="ffx-tile"><span>Paid Commission</span><strong>${MONEY(wallet.paid_commission)}</strong></div>
        <div class="ffx-tile"><span>COD Collection</span><strong>${MONEY(wallet.cod_collection)}</strong></div>
        <div class="ffx-tile"><span>Wallet Balance</span><strong>${MONEY(wallet.wallet_balance)}</strong></div>
      </div>
      <div class="ffx-row" style="margin-top:12px">
        <input id="ffxCodOrderInput" placeholder="Order ID / Order Number for Receive COD Cash" />
        <button class="ffx-btn" id="ffxReceiveCodBtn" type="button">Receive COD Cash</button>
        <button class="ffx-btn ghost" id="ffxDownloadStatementBtn" type="button">Download Statement</button>
      </div>
      <p id="ffxWalletMsg" class="ffx-msg"></p>
      <table class="ffx-table"><thead><tr><th>Date</th><th>Order</th><th>Type</th><th>Amount</th><th>Status</th></tr></thead><tbody>
        ${(txns || []).map((row) => `<tr><td>${new Date(row.created_at).toLocaleString()}</td><td>${row.order_number || "-"}</td><td>${row.transaction_type || "-"}</td><td>${MONEY(row.amount)}</td><td>${row.status || "-"}</td></tr>`).join("") || `<tr><td colspan="5">No wallet transactions yet.</td></tr>`}
      </tbody></table>
    `;
    document.getElementById("ffxReceiveCodBtn").onclick = receiveCodCash;
    document.getElementById("ffxPayCommissionBtn").onclick = payWeeklyCommission;
    document.getElementById("ffxDownloadStatementBtn").onclick = () => downloadStatement(txns || [], wallet);
  }

  async function receiveCodCash() {
    const ref = clean(document.getElementById("ffxCodOrderInput")?.value);
    const order = await loadOrderByRef(ref, { shopId: activeShop.id });
    if (!order) return setMessage("ffxWalletMsg", "Order not found for this shop.", true);
    if (!isCod(order)) return setMessage("ffxWalletMsg", "This is not a COD order.", true);
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const payload = {
      order_id: order.id,
      order_number: order.order_number,
      customer_id: order.user_id || null,
      shop_id: order.shop_id,
      delivery_partner_id: order.delivery_partner_id || null,
      settlement_otp: otp,
      cod_amount: Number(order.total || 0),
      delivery_charge: deliveryCharge(order),
      flashfit_commission: commission(order),
      shopkeeper_keeps: shopKeeps(order),
      settlement_status: "otp_generated",
      audit_log: { generated_by: "shopkeeper", shop_name: activeShop.shop_name },
      created_at: nowIso(),
      updated_at: nowIso()
    };
    const { error } = await getDb().from("cod_cash_settlements").upsert(payload, { onConflict: "order_id" });
    if (error) return setMessage("ffxWalletMsg", error.message, true);
    setMessage("ffxWalletMsg", `Settlement OTP: ${otp}. Show this only after cash is counted and rider receives delivery charge.`);
    await audit("cod_settlement_otp_generated", { ...payload, status: "otp_generated" });
    await notify("high_priority", {
      title: `COD OTP Generated ${order.order_number}`,
      body: `${activeShop.shop_name || "Shopkeeper"} generated settlement OTP for COD cash.`,
      shopId: activeShop.id,
      deliveryPartnerId: order.delivery_partner_id || null,
      orderId: order.id,
      orderNumber: order.order_number,
      entityType: "cod_cash_settlements",
      entityId: order.id
    });
  }

  async function payWeeklyCommission() {
    const wallet = await upsertWallet(activeShop.id);
    const amount = Number(wallet.pending_commission || 0);
    if (amount <= 0) return setMessage("ffxWalletMsg", "No pending FlashFit commission.");
    if (!confirm(`Pay ${MONEY(amount)} FlashFit commission?`)) return;
    const next = {
      pending_commission: 0,
      paid_commission: Number(wallet.paid_commission || 0) + amount,
      last_settlement_date: nowIso(),
      updated_at: nowIso()
    };
    const { error } = await getDb().from("shop_wallets").update(next).eq("shop_id", activeShop.id);
    if (error) return setMessage("ffxWalletMsg", error.message, true);
    await getDb().from("shop_weekly_settlements").insert({
      shop_id: activeShop.id,
      amount_paid: amount,
      pending_amount: 0,
      settlement_status: "paid",
      paid_at: nowIso(),
      created_at: nowIso()
    });
    await addWalletTxn({ shop_id: activeShop.id, amount, transaction_type: "flashfit_commission_paid", status: "paid" });
    await audit("weekly_commission_paid", { shop_id: activeShop.id, amount, status: "paid" });
    await notify("payment_success", {
      title: `Weekly Commission Paid ${MONEY(amount)}`,
      body: `${activeShop.shop_name || "Shop"} paid pending FlashFit commission.`,
      shopId: activeShop.id,
      entityType: "shop_weekly_settlements",
      entityId: activeShop.id
    });
    setMessage("ffxWalletMsg", "Weekly commission paid. Pending commission is now zero.");
    renderShopWallet();
  }

  function downloadStatement(txns, wallet) {
    const rows = [["Date", "Order", "Type", "Amount", "Status"], ...txns.map((row) => [
      row.created_at, row.order_number || "", row.transaction_type || "", row.amount || 0, row.status || ""
    ])];
    rows.unshift(["Pending Commission", wallet.pending_commission || 0, "Paid Commission", wallet.paid_commission || 0, "COD Collection", wallet.cod_collection || 0]);
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `flashfit-wallet-${activeShop.id}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function renderRiderCodPanel() {
    const host = document.querySelector(".content-area");
    if (!host || !activePartner || !getDb()) return;
    const today = new Date().toISOString().slice(0, 10);
    const { data: settlements } = await getDb()
      .from("cod_cash_settlements")
      .select("*")
      .eq("delivery_partner_id", activePartner.id)
      .order("created_at", { ascending: false })
      .limit(20);
    const rows = settlements || [];
    const completed = rows.filter((row) => row.settlement_status === "completed");
    const todayRows = completed.filter((row) => String(row.settlement_time || row.updated_at || row.created_at).startsWith(today));
    let card = document.getElementById("ffxRiderCodCard");
    if (!card) {
      card = document.createElement("section");
      card.id = "ffxRiderCodCard";
      card.className = "ffx-card";
      host.insertAdjacentElement("afterbegin", card);
    }
    card.innerHTML = `
      <div class="ffx-head"><div><h3>COD Cash Flow</h3><p>Customer to rider, rider to shopkeeper, OTP settlement.</p></div></div>
      <div class="ffx-grid">
        <div class="ffx-tile"><span>Today's Earnings</span><strong>${MONEY(todayRows.reduce((s, r) => s + Number(r.delivery_charge || 0), 0))}</strong></div>
        <div class="ffx-tile"><span>Weekly Earnings</span><strong>${MONEY(completed.reduce((s, r) => s + Number(r.delivery_charge || 0), 0))}</strong></div>
        <div class="ffx-tile"><span>COD Cash Collected</span><strong>${MONEY(rows.reduce((s, r) => s + Number(r.cod_amount || 0), 0))}</strong></div>
        <div class="ffx-tile"><span>Delivery Charges Received</span><strong>${MONEY(completed.reduce((s, r) => s + Number(r.delivery_charge || 0), 0))}</strong></div>
      </div>
      <div class="ffx-row" style="margin-top:12px">
        <input id="ffxRiderOrderInput" placeholder="Order ID / Order Number" />
        <button class="ffx-btn" id="ffxCashCollectedBtn" type="button">Cash Collected</button>
      </div>
      <div class="ffx-row" style="margin-top:8px">
        <input id="ffxSettlementOrderInput" placeholder="Order ID / Order Number" />
        <input id="ffxSettlementOtpInput" placeholder="Shopkeeper OTP" />
        <button class="ffx-btn secondary" id="ffxVerifySettlementBtn" type="button">Verify Settlement OTP</button>
      </div>
      <p id="ffxRiderCodMsg" class="ffx-msg"></p>
      <table class="ffx-table"><thead><tr><th>Date</th><th>Order</th><th>COD</th><th>Delivery</th><th>Status</th></tr></thead><tbody>
        ${rows.map((row) => `<tr><td>${new Date(row.created_at).toLocaleString()}</td><td>${row.order_number || "-"}</td><td>${MONEY(row.cod_amount)}</td><td>${MONEY(row.delivery_charge)}</td><td>${row.settlement_status || "-"}</td></tr>`).join("") || `<tr><td colspan="5">No COD settlements yet.</td></tr>`}
      </tbody></table>
    `;
    document.getElementById("ffxCashCollectedBtn").onclick = riderCashCollected;
    document.getElementById("ffxVerifySettlementBtn").onclick = riderVerifyOtp;
  }

  async function riderCashCollected() {
    const ref = clean(document.getElementById("ffxRiderOrderInput")?.value);
    const order = await loadOrderByRef(ref, { partnerId: activePartner.id });
    if (!order) return setMessage("ffxRiderCodMsg", "Order not found for this rider.", true);
    if (!isCod(order)) return setMessage("ffxRiderCodMsg", "This is not a COD order.", true);
    const payload = {
      order_id: order.id,
      order_number: order.order_number,
      customer_id: order.user_id || null,
      shop_id: order.shop_id,
      delivery_partner_id: activePartner.id,
      cod_amount: Number(order.total || 0),
      delivery_charge: deliveryCharge(order),
      flashfit_commission: commission(order),
      shopkeeper_keeps: shopKeeps(order),
      settlement_status: "cash_collected",
      audit_log: { collected_by: activePartner.full_name || activePartner.phone },
      created_at: nowIso(),
      updated_at: nowIso()
    };
    const { error } = await getDb().from("cod_cash_settlements").upsert(payload, { onConflict: "order_id" });
    if (error) return setMessage("ffxRiderCodMsg", error.message, true);
    await getDb().from("seller_orders").update({ payment_status: "paid", payment_received_at: nowIso() }).eq("id", order.id);
    await audit("cod_cash_collected", { ...payload, status: "cash_collected" });
    await notify("payment_success", {
      title: `COD Cash Collected ${order.order_number}`,
      body: `Delivery partner collected ${MONEY(order.total)} from customer.`,
      shopId: order.shop_id,
      deliveryPartnerId: activePartner.id,
      userId: order.user_id || null,
      orderId: order.id,
      orderNumber: order.order_number,
      entityType: "cod_cash_settlements",
      entityId: order.id
    });
    setMessage("ffxRiderCodMsg", "Cash collected recorded. Visit shopkeeper for OTP settlement.");
    renderRiderCodPanel();
  }

  async function riderVerifyOtp() {
    const ref = clean(document.getElementById("ffxSettlementOrderInput")?.value);
    const otp = clean(document.getElementById("ffxSettlementOtpInput")?.value);
    if (!ref || !otp) return setMessage("ffxRiderCodMsg", "Enter order and shopkeeper OTP.", true);
    const order = await loadOrderByRef(ref, { partnerId: activePartner.id });
    if (!order) return setMessage("ffxRiderCodMsg", "Order not found for this rider.", true);
    const { data: settlement } = await getDb().from("cod_cash_settlements").select("*").eq("order_id", order.id).maybeSingle();
    if (!settlement || settlement.settlement_otp !== otp || settlement.settlement_status === "completed") {
      await audit("cod_settlement_failed", { order_id: order.id, order_number: order.order_number, status: "failed" });
      return setMessage("ffxRiderCodMsg", "Settlement failed. Wrong or expired OTP.", true);
    }
    const completedPayload = {
      settlement_status: "completed",
      settlement_time: nowIso(),
      updated_at: nowIso(),
      audit_log: { ...(settlement.audit_log || {}), verified_by: activePartner.full_name || activePartner.phone }
    };
    const { error } = await getDb().from("cod_cash_settlements").update(completedPayload).eq("id", settlement.id);
    if (error) return setMessage("ffxRiderCodMsg", error.message, true);
    await finalizeSettlement(order, settlement);
    setMessage("ffxRiderCodMsg", "Settlement completed. Delivery charge added to wallet.");
    renderRiderCodPanel();
  }

  async function finalizeSettlement(order, settlement) {
    const client = getDb();
    const dCharge = Number(settlement.delivery_charge || deliveryCharge(order));
    const ffCommission = Number(settlement.flashfit_commission || commission(order));
    const wallet = await upsertWallet(order.shop_id);
    await client.from("shop_wallets").update({
      pending_commission: Number(wallet.pending_commission || 0) + ffCommission,
      cod_collection: Number(wallet.cod_collection || 0) + Number(settlement.cod_amount || order.total || 0),
      wallet_balance: Number(wallet.wallet_balance || 0) + Number(settlement.cod_amount || order.total || 0) - dCharge,
      updated_at: nowIso()
    }).eq("shop_id", order.shop_id);
    const { data: rider } = await client.from("delivery_partners").select("wallet_balance,total_earnings").eq("id", activePartner.id).maybeSingle();
    await client.from("delivery_partners").update({
      wallet_balance: Number(rider?.wallet_balance || 0) + dCharge,
      total_earnings: Number(rider?.total_earnings || 0) + dCharge
    }).eq("id", activePartner.id);
    await addWalletTxn({ shop_id: order.shop_id, partner_id: activePartner.id, order_id: order.id, order_number: order.order_number, amount: ffCommission, transaction_type: "pending_flashfit_commission", status: "pending" });
    await addWalletTxn({ shop_id: order.shop_id, partner_id: activePartner.id, order_id: order.id, order_number: order.order_number, amount: dCharge, transaction_type: "delivery_charge_paid_hand_to_hand", status: "payment_received" });
    await audit("cod_settlement_completed", { order_id: order.id, order_number: order.order_number, shop_id: order.shop_id, delivery_partner_id: activePartner.id, cod_amount: settlement.cod_amount, delivery_charge: dCharge, flashfit_commission: ffCommission, status: "completed" });
    await notify("payment_success", {
      title: `COD Settlement Completed ${order.order_number}`,
      body: `Delivery charge ${MONEY(dCharge)} received. Pending FlashFit commission ${MONEY(ffCommission)} added to shop wallet.`,
      shopId: order.shop_id,
      deliveryPartnerId: activePartner.id,
      userId: order.user_id || null,
      orderId: order.id,
      orderNumber: order.order_number,
      entityType: "cod_cash_settlements",
      entityId: settlement.id
    });
  }

  async function annotateClosedShops() {
    const cards = [...document.querySelectorAll(".product-card[data-shop-id]")];
    if (!cards.length || !getDb()) return;
    const ids = [...new Set(cards.map((card) => Number(card.dataset.shopId || 0)).filter(Boolean))];
    if (!ids.length) return;
    const { data, error } = await getDb().from("shops").select("id,is_open,shop_open").in("id", ids);
    if (error) return;
    const map = new Map((data || []).map((shop) => [Number(shop.id), shop]));
    cards.forEach((card) => {
      const shop = map.get(Number(card.dataset.shopId || 0));
      const closed = shop && (shop.is_open === false || shop.shop_open === false);
      let note = card.querySelector(".ffx-shop-closed-note");
      if (closed && !note) {
        note = document.createElement("p");
        note.className = "ffx-shop-closed-note";
        note.textContent = "Delivery after shop opens.";
        card.appendChild(note);
      } else if (!closed && note) {
        note.remove();
      }
    });
  }

  async function renderAdminSettlementMonitor() {
    const host = document.querySelector("#admin-view") || document.querySelector("main");
    if (!host || !getDb()) return;
    const [{ data: wallets }, { data: settlements }, { data: lowStock }] = await Promise.all([
      getDb().from("shop_wallets").select("*").order("updated_at", { ascending: false }).limit(50),
      getDb().from("cod_cash_settlements").select("*").order("created_at", { ascending: false }).limit(50),
      getDb().from("shopkeeper_products").select("id,shop_id,title,stock_qty").lte("stock_qty", 5).limit(50)
    ]);
    const walletRows = wallets || [];
    const settlementRows = settlements || [];
    const pendingCommission = walletRows.reduce((sum, row) => sum + Number(row.pending_commission || 0), 0);
    const paidCommission = walletRows.reduce((sum, row) => sum + Number(row.paid_commission || 0), 0);
    const completed = settlementRows.filter((row) => row.settlement_status === "completed");
    const failed = settlementRows.filter((row) => row.settlement_status === "failed");
    let card = document.getElementById("ffxAdminSettlementCard");
    if (!card) {
      card = document.createElement("section");
      card.id = "ffxAdminSettlementCard";
      card.className = "ffx-card";
      host.insertAdjacentElement("afterbegin", card);
    }
    card.innerHTML = `
      <div class="ffx-head">
        <div><h3>Settlement Management</h3><p>COD OTP settlements, wallet monitoring, pending commission, and low stock.</p></div>
        <button class="ffx-btn ghost" id="ffxAdminSettlementRefresh" type="button">Refresh</button>
      </div>
      <div class="ffx-grid">
        <div class="ffx-tile"><span>Pending Commission</span><strong>${MONEY(pendingCommission)}</strong></div>
        <div class="ffx-tile"><span>Paid Commission</span><strong>${MONEY(paidCommission)}</strong></div>
        <div class="ffx-tile"><span>Completed COD Settlements</span><strong>${completed.length}</strong></div>
        <div class="ffx-tile"><span>Settlement Failed</span><strong>${failed.length}</strong></div>
        <div class="ffx-tile"><span>Low Stock Items</span><strong>${(lowStock || []).length}</strong></div>
      </div>
      <table class="ffx-table"><thead><tr><th>Date</th><th>Order</th><th>Shop</th><th>Partner</th><th>COD</th><th>Commission</th><th>Status</th></tr></thead><tbody>
        ${settlementRows.slice(0, 10).map((row) => `<tr><td>${new Date(row.created_at).toLocaleString()}</td><td>${row.order_number || row.order_id || "-"}</td><td>${row.shop_id || "-"}</td><td>${row.delivery_partner_id || "-"}</td><td>${MONEY(row.cod_amount)}</td><td>${MONEY(row.flashfit_commission)}</td><td>${row.settlement_status || "-"}</td></tr>`).join("") || `<tr><td colspan="7">No COD settlements yet.</td></tr>`}
      </tbody></table>
    `;
    document.getElementById("ffxAdminSettlementRefresh").onclick = renderAdminSettlementMonitor;
  }

  function initMode() {
    const path = location.pathname.toLowerCase();
    activeShop = getShopSession();
    activePartner = null;
    if (path.includes("delevery_patner")) mode = "delivery_partner";
    else if (path.includes("shopfit")) mode = "shopkeeper";
    else if (path.includes("admin-panel")) mode = "admin";
    else mode = "user";
  }

  async function init() {
    injectStyles();
    initMode();
    getDb();
    if (mode === "shopkeeper") {
      activeShop = getShopSession();
      if (!activeShop) return;
      renderShopStatusCard();
      setTimeout(() => renderShopWallet(), 50);
    } else if (mode === "delivery_partner") {
      const session = getRiderSession();
      if (!session || !getDb()) return;
      const { data } = await getDb().from("delivery_partners").select("*").eq("id", session.partner_id || session.id).maybeSingle();
      activePartner = data || session;
      setTimeout(() => renderRiderCodPanel(), 50);
    } else if (mode === "user") {
      let annotateTimer = null;
      const scheduleAnnotate = () => {
        clearTimeout(annotateTimer);
        annotateTimer = setTimeout(() => annotateClosedShops(), 250);
      };
      scheduleAnnotate();
      const observer = new MutationObserver(scheduleAnnotate);
      observer.observe(document.body, { childList: true, subtree: true });
    } else if (mode === "admin") {
      setTimeout(() => renderAdminSettlementMonitor(), 50);
    }
  }

  window.flashfitBusiness = { init, renderShopWallet, renderRiderCodPanel, annotateClosedShops, renderAdminSettlementMonitor };
  window.addEventListener("DOMContentLoaded", () => setTimeout(init, 150));
})();

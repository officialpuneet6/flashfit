(function () {
  const SUPABASE_URL = "https://ydbmdiywsalkkxrqzjtx.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_udYL-2aM5WhzB5tu_gb4sA_RHnQC8Au";
  const DEVICE_KEY = "flashfitDeviceId";

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
    if (!window.supabase || !window.supabase.createClient) return null;
    return window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  }

  const supabaseClient = getClient();

  function sanitizeInput(value) {
    return (value || "").toString().replace(/<|>/g, "").trim();
  }

  async function getCurrentUser() {
    if (!supabaseClient) return null;
    const { data } = await supabaseClient.auth.getUser();
    return data && data.user ? data.user : null;
  }

  async function signUp(email, password, meta) {
    if (!supabaseClient) return { ok: false, error: "Supabase not initialized" };
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: meta || {}
      }
    });
    return { ok: !error, data, error: error ? error.message : null };
  }

  async function signIn(email, password) {
    if (!supabaseClient) return { ok: false, error: "Supabase not initialized" };
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });
    return { ok: !error, data, error: error ? error.message : null };
  }

  async function signOut() {
    if (!supabaseClient) return { ok: false, error: "Supabase not initialized" };
    const { error } = await supabaseClient.auth.signOut();
    return { ok: !error, error: error ? error.message : null };
  }

  function onAuthChange(callback) {
    if (!supabaseClient) return null;
    return supabaseClient.auth.onAuthStateChange((_event, session) => {
      callback(session && session.user ? session.user : null);
    });
  }

  async function fetchServiceablePincodes() {
    const client = supabaseClient;
    if (!client) return [];
    const { data, error } = await client
      .from("serviceable_pincodes")
      .select("pincode")
      .eq("active", true);
    if (error || !data) return [];
    return data.map((row) => row.pincode).filter(Boolean);
  }

  async function saveDefaultPincode(pincode) {
    const client = supabaseClient;
    if (!client) return false;
    const deviceId = getDeviceId();
    const user = await getCurrentUser();
    const { error } = await client
      .from("user_profiles")
      .upsert({
        user_id: user ? user.id : null,
        device_id: deviceId,
        default_pincode: pincode,
        updated_at: new Date().toISOString()
      }, { onConflict: user ? "user_id" : "device_id" });
    return !error;
  }

  async function loadDefaultPincode() {
    const client = supabaseClient;
    if (!client) return null;
    const deviceId = getDeviceId();
    const user = await getCurrentUser();
    let query = client.from("user_profiles").select("default_pincode");
    query = user ? query.eq("user_id", user.id) : query.eq("device_id", deviceId);
    const { data, error } = await query.maybeSingle();
    if (error || !data) return null;
    return data.default_pincode || null;
  }

  async function saveUserProfile(payload) {
    const client = supabaseClient;
    if (!client) return false;
    const deviceId = getDeviceId();
    const user = await getCurrentUser();
    const { error } = await client
      .from("user_profiles")
      .upsert({
        user_id: user ? user.id : null,
        device_id: deviceId,
        full_name: sanitizeInput(payload.fullName) || null,
        email: sanitizeInput(payload.email) || null,
        mobile: sanitizeInput(payload.mobile) || null,
        default_pincode: sanitizeInput(payload.defaultPincode) || null,
        updated_at: new Date().toISOString()
      }, { onConflict: user ? "user_id" : "device_id" });
    return !error;
  }

  async function loadUserProfile() {
    const client = supabaseClient;
    if (!client) return null;
    const deviceId = getDeviceId();
    const user = await getCurrentUser();
    let query = client
      .from("user_profiles")
      .select("full_name,email,mobile,default_pincode");
    query = user ? query.eq("user_id", user.id) : query.eq("device_id", deviceId);
    const { data, error } = await query.maybeSingle();
    if (error || !data) return null;
    return {
      fullName: data.full_name || "",
      email: data.email || "",
      mobile: data.mobile || "",
      defaultPincode: data.default_pincode || ""
    };
  }

  async function saveAddress(payload) {
    const client = supabaseClient;
    if (!client) return false;
    const deviceId = getDeviceId();
    const user = await getCurrentUser();
    const { error } = await client
      .from("user_addresses")
      .upsert({
        user_id: user ? user.id : null,
        device_id: deviceId,
        full_name: sanitizeInput(payload.fullName),
        mobile: sanitizeInput(payload.mobile),
        house_no: sanitizeInput(payload.houseNo),
        street: sanitizeInput(payload.street),
        landmark: sanitizeInput(payload.landmark),
        city: sanitizeInput(payload.city),
        state: sanitizeInput(payload.state),
        pincode: sanitizeInput(payload.pincode),
        updated_at: new Date().toISOString()
      }, { onConflict: user ? "user_id" : "device_id" });
    return !error;
  }

  async function loadAddress() {
    const client = supabaseClient;
    if (!client) return null;
    const deviceId = getDeviceId();
    const user = await getCurrentUser();
    let query = client.from("user_addresses").select("*");
    query = user ? query.eq("user_id", user.id) : query.eq("device_id", deviceId);
    const { data, error } = await query.maybeSingle();
    if (error || !data) return null;
    return {
      fullName: data.full_name || "",
      mobile: data.mobile || "",
      houseNo: data.house_no || "",
      street: data.street || "",
      landmark: data.landmark || "",
      city: data.city || "",
      state: data.state || "",
      pincode: data.pincode || ""
    };
  }

  async function saveCart(items) {
    const client = supabaseClient;
    if (!client) return false;
    const deviceId = getDeviceId();
    const user = await getCurrentUser();

    let delQuery = client.from("user_carts").delete();
    delQuery = user ? delQuery.eq("user_id", user.id) : delQuery.eq("device_id", deviceId);
    const { error: delError } = await delQuery;
    if (delError) return false;

    if (!items.length) return true;

    const rows = items.map((item) => ({
      user_id: user ? user.id : null,
      device_id: deviceId,
      item_id: item.id,
      title: item.size ? `${item.title} [Size: ${item.size}]` : item.title,
      price: item.price,
      image_url: item.image,
      qty: item.qty,
      updated_at: new Date().toISOString()
    }));

    const { error } = await client.from("user_carts").insert(rows);
    return !error;
  }

  async function loadCart() {
    const client = supabaseClient;
    if (!client) return [];
    const deviceId = getDeviceId();
    const user = await getCurrentUser();
    let query = client.from("user_carts").select("*");
    query = user ? query.eq("user_id", user.id) : query.eq("device_id", deviceId);
    const { data, error } = await query;
    if (error || !data) return [];
    return data.map((item) => ({
      id: item.item_id,
      title: (item.title || "").replace(/\s*\[Size:\s*[^\]]+\]\s*$/i, ""),
      price: Number(item.price) || 0,
      image: item.image_url,
      qty: Number(item.qty) || 1,
      size: ((item.title || "").match(/\[Size:\s*([^\]]+)\]/i) || [])[1] || ""
    }));
  }

  async function saveInterests(interests) {
    const client = supabaseClient;
    if (!client) return false;
    const user = await getCurrentUser();
    if (!user) return false;

    const { error: delError } = await client
      .from("user_interests")
      .delete()
      .eq("user_id", user.id);
    if (delError) return false;

    if (!interests.length) return true;
    const rows = interests.map((interest) => ({ user_id: user.id, interest }));
    const { error } = await client.from("user_interests").insert(rows);
    return !error;
  }

  async function loadInterests() {
    const client = supabaseClient;
    if (!client) return [];
    const user = await getCurrentUser();
    if (!user) return [];
    const { data, error } = await client
      .from("user_interests")
      .select("interest")
      .eq("user_id", user.id);
    if (error || !data) return [];
    return data.map((row) => row.interest).filter(Boolean);
  }

  async function loadOrders() {
    const client = supabaseClient;
    if (!client) return [];
    const user = await getCurrentUser();
    if (!user) return [];
    const { data, error } = await client
      .from("user_orders")
      .select("order_number,status,total,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error || !data) return [];
    return data;
  }

  async function loadSiteSettings() {
    const client = supabaseClient;
    if (!client) return {};
    const { data, error } = await client.from("site_settings").select("key,value");
    if (error || !data) return {};
    return data.reduce((acc, row) => {
      if (row && row.key) acc[row.key] = row.value || "";
      return acc;
    }, {});
  }

  async function saveSiteSettings(settingsMap) {
    const client = supabaseClient;
    if (!client) return { ok: false, error: "Supabase not initialized" };
    const rows = Object.entries(settingsMap || {})
      .filter(([key]) => !!key)
      .map(([key, value]) => ({
        key,
        value: value === null || value === undefined ? "" : String(value),
        updated_at: new Date().toISOString()
      }));
    if (!rows.length) return { ok: false, error: "No settings to save" };
    const { error } = await client.from("site_settings").upsert(rows, { onConflict: "key" });
    return { ok: !error, error: error ? error.message : null };
  }

  async function applySiteSettings() {
    const settings = await loadSiteSettings();
    document.querySelectorAll("[data-site-setting]").forEach((el) => {
      const key = el.dataset.siteSetting;
      const value = settings[key];
      if (value === undefined || value === null || value === "") return;

      const mode = el.dataset.settingMode || "text";
      if (mode === "text") {
        el.textContent = value;
      } else if (mode === "html") {
        el.innerHTML = value;
      } else if (mode === "mailto") {
        el.href = `mailto:${value}`;
        el.textContent = value;
      } else if (mode === "tel") {
        const telValue = settings["support_phone_tel"] || value.replace(/\s+/g, "");
        el.href = `tel:${telValue}`;
        el.textContent = value;
      } else if (mode === "src") {
        el.src = value;
      }
    });
  }

  async function findNearestShopByPincode(pincode) {
    const client = supabaseClient;
    if (!client || !pincode) return null;
    const pin = sanitizeInput(pincode);
    const { data, error } = await client
      .from("shops")
      .select("id,shop_name,pincode,address,status,created_at")
      .eq("status", "active")
      .eq("pincode", pin);
      
    if (error || !data || data.length === 0) return null;
    
    // 1. Smart Shop Selection Algorithm
    // Score = Distance + Preparation Time + Rating + Availability
    // We simulate rating and prep time dynamically based on ID if not in DB
    const scoredShops = data.map(shop => {
      let score = 0;
      const rating = 3.5 + ((shop.id % 15) / 10); // Simulated 3.5 to 4.9
      const prepTime = 5 + (shop.id % 10); // Simulated 5 to 14 mins
      
      score += (rating * 10); // High rating -> boost
      score -= prepTime;      // Fast packing -> high priority
      
      return { ...shop, smartScore: score };
    });
    
    scoredShops.sort((a, b) => b.smartScore - a.smartScore);
    return scoredShops[0];
  }

  async function listShopsByPincode(pincode) {
    const client = supabaseClient;
    if (!client || !pincode) return [];
    const pin = sanitizeInput(pincode);
    const { data, error } = await client
      .from("shops")
      .select("id,shop_name,pincode,address,status,created_at")
      .eq("status", "active")
      .eq("pincode", pin)
      .order("created_at", { ascending: true });
    if (error || !data) return [];
    return data;
  }

  async function addProductReview(payload) {
    const client = supabaseClient;
    if (!client) return { ok: false, error: "Supabase not initialized" };
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: "Please login to submit review" };
    const deviceId = getDeviceId();

    let shopId = payload.shopId || null;
    if (!shopId && payload.productId) {
      const { data: product } = await client
        .from("shopkeeper_products")
        .select("shop_id")
        .eq("id", payload.productId)
        .maybeSingle();
      if (product && product.shop_id) shopId = product.shop_id;
      if (!product) return { ok: false, error: "Product ID not found." };
    }

    const { error } = await client.from("product_reviews").insert({
      product_id: payload.productId,
      shop_id: shopId,
      user_id: user.id,
      device_id: deviceId,
      rating: payload.rating,
      review_text: sanitizeInput(payload.reviewText) || null
    });
    return { ok: !error, error: error ? error.message : null };
  }

  async function loadMyProductReviews() {
    const client = supabaseClient;
    if (!client) return [];
    const user = await getCurrentUser();
    if (!user) return [];
    const { data, error } = await client
      .from("product_reviews")
      .select("id,product_id,shop_id,rating,review_text,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error || !data) return [];
    return data;
  }

  async function loadShopProductReviews(shopId) {
    const client = supabaseClient;
    if (!client || !shopId) return [];
    const { data, error } = await client
      .from("product_reviews")
      .select("id,product_id,shop_id,user_id,rating,review_text,created_at")
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false });
    if (error || !data) return [];
    return data;
  }

  // Delivery mode is decided by the database, never by a client-side pincode list.
  async function getDeliveryQuote(pincode, items) {
    const client = supabaseClient;
    if (!client || !/^\d{6}$/.test(String(pincode || "").trim())) return null;
    const quoteItems = (items || []).map((item) => ({
      product_id: Number(item.productId || String(item.id || "").split("::")[0]),
      quantity: Number(item.qty || 1)
    })).filter((item) => Number.isFinite(item.product_id) && item.product_id > 0);
    if (!quoteItems.length) return null;
    const { data, error } = await client.rpc("get_delivery_quote", {
      p_customer_pincode: String(pincode).trim(),
      p_items: quoteItems
    });
    return error ? null : data;
  }

  async function getSecurityFeatureFlags() {
    const client = supabaseClient;
    if (!client) return {};
    const { data, error } = await client.rpc("get_security_feature_flags");
    return error || !data ? {} : data;
  }

  async function createSecureCheckout(items, delivery, paymentMethod, idempotencyKey) {
    const client = supabaseClient;
    if (!client) throw new Error("Checkout is unavailable");
    const { data, error } = await client.rpc("create_secure_checkout", {
      p_items: (items || []).map((item) => ({
        product_id: Number(item.productId || String(item.id || "").split("::")[0]),
        quantity: Number(item.qty || 1),
        variant_id: item.variantId || item.size || null
      })),
      p_delivery: delivery,
      p_payment_method: paymentMethod,
      p_idempotency_key: idempotencyKey
    });
    if (error) throw new Error("Unable to create your order. Please try again.");
    return data;
  }

  async function createSecurePayuRequest(paymentIntentId) {
    const client = supabaseClient;
    if (!client) throw new Error("Payment is unavailable");
    const { data, error } = await client.functions.invoke("payu-create-request", {
      body: { paymentIntentId }
    });
    if (error || !data?.fields) throw new Error("Unable to start secure payment.");
    return data.fields;
  }

  async function getSecurePaymentStatus(paymentIntentId) {
    const client = supabaseClient;
    if (!client) return null;
    const { data, error } = await client.rpc("get_secure_payment_status", { p_intent_id: paymentIntentId });
    return error ? null : data;
  }

  function subscribeOrderUpdates(onChange) {
    if (!supabaseClient || !onChange) return null;
    return supabaseClient
      .channel("orders-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "seller_orders" }, onChange)
      .subscribe();
  }

  function subscribeStockUpdates(onChange) {
    if (!supabaseClient || !onChange) return null;
    return supabaseClient
      .channel("stock-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "shopkeeper_products" }, onChange)
      .subscribe();
  }

  function subscribeReviewUpdates(onChange) {
    if (!supabaseClient || !onChange) return null;
    return supabaseClient
      .channel("reviews-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "product_reviews" }, onChange)
      .subscribe();
  }

  function subscribeDeliveryPartnerUpdates(onChange) {
    if (!supabaseClient || !onChange) return null;
    return supabaseClient
      .channel("delivery-partners-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "delivery_partners" }, onChange)
      .subscribe();
  }

  function subscribeLogUpdates(onChange) {
    if (!supabaseClient || !onChange) return null;
    return supabaseClient
      .channel("logs-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_activity_logs" }, onChange)
      .subscribe();
  }

  window.flashfitDB = {
    getSupabaseClient: () => supabaseClient,
    getCurrentUser,
    signUp,
    signIn,
    signOut,
    onAuthChange,
    getDeviceId,
    saveUserProfile,
    loadUserProfile,
    fetchServiceablePincodes,
    saveDefaultPincode,
    loadDefaultPincode,
    saveAddress,
    loadAddress,
    saveCart,
    loadCart,
    saveInterests,
    loadInterests,
    loadOrders,
    loadSiteSettings,
    saveSiteSettings,
    applySiteSettings,
    addProductReview,
    loadMyProductReviews,
    loadShopProductReviews,
    getDeliveryQuote,
    getSecurityFeatureFlags,
    createSecureCheckout,
    createSecurePayuRequest,
    getSecurePaymentStatus,
    subscribeOrderUpdates,
    subscribeStockUpdates,
    subscribeReviewUpdates,
    subscribeDeliveryPartnerUpdates,
    subscribeLogUpdates,
    findNearestShopByPincode,
    listShopsByPincode
  };
})();

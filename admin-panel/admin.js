/**
 * FlashFit Portal Standalone Script
 * Features: Unified Admin and Seller Panel, Supabase Database sync, realtime updates, A6 Shipping Label printing, dynamic formulas.
 */

const SUPABASE_URL = "https://ydbmdiywsalkkxrqzjtx.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_udYL-2aM5WhzB5tu_gb4sA_RHnQC8Au";

// Initialize Supabase Client
var supabase = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY) : null;

// Application State
let panelRole = "guest"; // guest | admin | seller
let activeShop = null; // Shop Profile object for active seller
let themeMode = "light";

// Global Site Settings defaults (overwritten by db)
let siteSettings = {
  commission_pct: 10,
  gateway_pct: 4,
  delivery_charge: 90,
  support_email: "flashfithelp@gmail.com",
  support_phone_display: "+91 96252 50352",
  support_hours: "9:00 AM - 9:00 PM IST",
  hero_image: "https://images.unsplash.com/photo-1441986300917-64674bd600d8",
  site_announcement: "Flash sale is active across all regional hubs! Portal online.",
};

// Data Store (Synced periodically and on actions)
let dbData = {
  orders: [],
  shops: [],
  riders: [],
  products: [],
  serviceAreas: [],
  logs: [],
  reviews: []
};

// Start application
window.addEventListener("DOMContentLoaded", () => {
  initApp();
  setupEventListeners();
});

// App Initialization
async function initApp() {
  // Load Theme
  const savedTheme = localStorage.getItem("flashfit_theme") || "light";
  themeMode = savedTheme;
  document.documentElement.classList.toggle("dark", savedTheme === "dark");

  // Load Saved Auth Roles
  const savedRole = localStorage.getItem("flashfit_role");
  const savedShop = localStorage.getItem("flashfit_active_shop");

  if (savedRole === "admin") {
    panelRole = "admin";
  } else if (savedRole === "seller" && savedShop) {
    try {
      panelRole = "seller";
      activeShop = JSON.parse(savedShop);
    } catch (_) {
      localStorage.removeItem("flashfit_role");
      localStorage.removeItem("flashfit_active_shop");
    }
  }

  // Fetch Global configurations from DB
  await loadGlobalSettings();

  // Show corresponding panels
  routeViews();

  // Load appropriate data
  if (panelRole === "admin") {
    await loadAdminData();
  } else if (panelRole === "seller" && activeShop) {
    await loadSellerData();
  }

  // Init Lucide Icons globally
  lucide.createIcons();
}

// Render dynamic sections based on active view state
function routeViews() {
  const guestView = document.getElementById("guest-view");
  const adminView = document.getElementById("admin-view");
  const sellerView = document.getElementById("seller-view");
  const roleSelectorContainer = document.getElementById("role-selector-container");
  const roleSelector = document.getElementById("panel-role-selector");

  // Hide all by default
  guestView.classList.add("hidden");
  adminView.classList.add("hidden");
  sellerView.classList.add("hidden");
  roleSelectorContainer.classList.add("hidden");

  if (panelRole === "guest") {
    guestView.classList.remove("hidden");
  } else {
    roleSelectorContainer.classList.remove("hidden");
    roleSelector.value = panelRole;

    if (panelRole === "admin") {
      adminView.classList.remove("hidden");
    } else if (panelRole === "seller" && activeShop) {
      sellerView.classList.remove("hidden");
      populateSellerHeader();
    }
  }
}

// Setup core actions event bindings
function setupEventListeners() {
  // Theme Switching
  document.getElementById("theme-toggle-btn").addEventListener("click", () => {
    themeMode = themeMode === "light" ? "dark" : "light";
    localStorage.setItem("flashfit_theme", themeMode);
    document.documentElement.classList.toggle("dark", themeMode === "dark");
  });

  // Login Form switcher tabs
  const tabAdmin = document.getElementById("tab-btn-admin");
  const tabSeller = document.getElementById("tab-btn-seller");
  const formAdmin = document.getElementById("admin-login-form");
  const formSeller = document.getElementById("seller-login-form");

  tabAdmin.addEventListener("click", () => {
    tabAdmin.className = "flex-1 py-2 text-xs font-bold rounded-lg transition-all bg-white dark:bg-slate-900 text-brand-500 shadow-sm cursor-pointer";
    tabSeller.className = "flex-1 py-2 text-xs font-bold rounded-lg transition-all text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 cursor-pointer";
    formAdmin.classList.remove("hidden");
    formSeller.classList.add("hidden");
  });

  tabSeller.addEventListener("click", () => {
    tabSeller.className = "flex-1 py-2 text-xs font-bold rounded-lg transition-all bg-white dark:bg-slate-900 text-brand-500 shadow-sm cursor-pointer";
    tabAdmin.className = "flex-1 py-2 text-xs font-bold rounded-lg transition-all text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 cursor-pointer";
    formSeller.classList.remove("hidden");
    formAdmin.classList.add("hidden");
  });

  // Guest view Demo Signins
  document.getElementById("demo-admin-btn").addEventListener("click", () => {
    panelRole = "admin";
    localStorage.setItem("flashfit_role", "admin");
    showToast("Logged in as Demo Administrator (Database Sandbox Mode)");
    logLoginActivity("demo_admin", "admin", "success", { mode: "demo_sandbox" });
    routeViews();
    loadAdminData();
  });

  document.getElementById("demo-seller-btn").addEventListener("click", async () => {
    // Find active shop or use fallback
    let demoShop = {
      id: 1,
      shop_name: "FlashFit Demo Hub Narela",
      owner_name: "Puneet Gupta",
      mobile: "+91 96252 50352",
      pincode: "110001",
      address: "Shop No 1, Main Market Road, Narela, New Delhi",
      status: "active",
      shop_login_id: "demo_seller",
      wallet_balance: 14500,
      created_at: new Date().toISOString()
    };

    if (supabase) {
      const { data } = await supabase.from("shops").select("*").eq("status", "active").limit(1);
      if (data && data.length > 0) demoShop = data[0];
    }

    panelRole = "seller";
    activeShop = demoShop;
    localStorage.setItem("flashfit_role", "seller");
    localStorage.setItem("flashfit_active_shop", JSON.stringify(demoShop));
    showToast(`Logged in as Seller: ${demoShop.shop_name}`);
    logLoginActivity(demoShop.owner_name || "demo_seller", "seller", "success", { mode: "demo_sandbox", shop_name: demoShop.shop_name, shop_id: demoShop.id });
    routeViews();
    loadSellerData();
  });

  // Login forms submissions
  formAdmin.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("admin-email").value;
    const password = document.getElementById("admin-password").value;

    if (supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        showToast(error.message, true);
      } else if (data?.user) {
        panelRole = "admin";
        localStorage.setItem("flashfit_role", "admin");
        showToast("Welcome back, Operational Admin!");
        logLoginActivity(email, "admin", "success", { method: "email_password" });
        routeViews();
        loadAdminData();
      }
    } else {
      showToast("Offline mode. Use demo login button for sandbox.", true);
    }
  });

  formSeller.addEventListener("submit", async (e) => {
    e.preventDefault();
    const loginId = document.getElementById("seller-login-id").value;
    const pass = document.getElementById("seller-password").value;

    if (supabase) {
      const { data, error } = await supabase
        .from("shops")
        .select("*")
        .eq("shop_login_id", loginId)
        .eq("shop_password", pass)
        .eq("status", "active")
        .maybeSingle();

      if (error) {
        showToast(error.message, true);
      } else if (data) {
        panelRole = "seller";
        activeShop = data;
        localStorage.setItem("flashfit_role", "seller");
        localStorage.setItem("flashfit_active_shop", JSON.stringify(data));
        showToast(`Welcome back, ${data.shop_name}!`);
        logLoginActivity(data.owner_name || loginId, "seller", "success", { shop_name: data.shop_name, shop_id: data.id, method: "login_id" });
        routeViews();
        loadSellerData();
      } else {
        showToast("Invalid credentials or store is not activated yet.", true);
      }
    } else {
      showToast("Offline mode. Use demo login button for sandbox.", true);
    }
  });

  // Logout action
  document.getElementById("logout-btn").addEventListener("click", () => {
    panelRole = "guest";
    activeShop = null;
    localStorage.removeItem("flashfit_role");
    localStorage.removeItem("flashfit_active_shop");
    showToast("Signed out successfully.");
    routeViews();
  });

  // Role selector toggle dropdown
  document.getElementById("panel-role-selector").addEventListener("change", (e) => {
    const selected = e.target.value;
    if (selected === "seller" && !activeShop) {
      showToast("Sign in as seller or load demo seller portal.", true);
      document.getElementById("panel-role-selector").value = panelRole;
      return;
    }
    panelRole = selected;
    localStorage.setItem("flashfit_role", panelRole);
    routeViews();
    if (panelRole === "admin") loadAdminData();
    else if (panelRole === "seller") loadSellerData();
  });

  // ADMIN VIEW: TAB CHANGING
  document.querySelectorAll(".admin-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      // Toggle active design styles
      document.querySelectorAll(".admin-tab-btn").forEach((b) => {
        b.className = "admin-tab-btn px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer";
      });
      btn.className = "admin-tab-btn px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all bg-brand-500 text-white shadow-md cursor-pointer";

      // Hide all windows safely
      document.querySelectorAll(".admin-tab-window").forEach((w) => {
        w.classList.add("hidden");
        w.classList.remove("block");
      });
      const activeWindowId = `admin-panel-${btn.dataset.adminTab}`;
      const activeWin = document.getElementById(activeWindowId);
      if (activeWin) {
        activeWin.classList.remove("hidden");
        activeWin.classList.add("block");
      }

      // If reports tab is selected, trigger reports display
      if (btn.dataset.adminTab === "reports") {
        switchActiveReport("activity");
      }
    });
  });

  // SELLER VIEW: TAB CHANGING
  document.querySelectorAll(".seller-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".seller-tab-btn").forEach((b) => {
        b.className = "seller-tab-btn px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer";
      });
      btn.className = "seller-tab-btn px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all bg-brand-500 text-white shadow-md cursor-pointer";

      document.querySelectorAll(".seller-tab-window").forEach((w) => {
        w.classList.replace("block", "hidden");
      });
      const activeWindowId = `seller-panel-${btn.dataset.sellerTab}`;
      document.getElementById(activeWindowId).classList.replace("hidden", "block");
    });
  });

  // ADMIN ACTION: ADD SERVICE AREA (PINCODE)
  document.getElementById("add-pincode-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const pin = document.getElementById("pincode-input").value.trim();
    const charge = Number(document.getElementById("pincode-charge").value) || 90;

    if (!/^\d{6}$/.test(pin)) {
      showToast("Please enter a valid 6-digit postal code.", true);
      return;
    }

    if (supabase) {
      const { error } = await supabase
        .from("serviceable_pincodes")
        .upsert({ pincode: pin, active: true, delivery_charge: charge });

      if (error) {
        showToast(error.message, true);
      } else {
        showToast(`Regional Coverage ${pin} registered successfully.`);
        document.getElementById("pincode-input").value = "";
        await logAdminActivity("upsert_serviceable_pincode", "serviceable_pincodes", pin);
        loadAdminData();
      }
    } else {
      showToast("Sandbox active. Offline upsert successful.");
    }
  });

  // ADMIN ACTION: ONBOARD / EDIT RIDER
  document.getElementById("onboard-rider-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const editId = document.getElementById("rider-edit-id").value;
    const name = document.getElementById("rider-name").value;
    const phone = document.getElementById("rider-phone").value;
    const pincode = document.getElementById("rider-pincode").value;
    const vehicle = document.getElementById("rider-vehicle").value;
    const password = document.getElementById("rider-password").value;

    const payload = {
      full_name: name,
      phone: phone,
      service_pincode: pincode,
      vehicle_no: vehicle
    };
    
    if (password) {
      payload.partner_password = password;
    }

    if (supabase) {
      let error;
      if (editId) {
        const { error: err } = await supabase.from("delivery_partners").update(payload).eq("id", Number(editId));
        error = err;
      } else {
        payload.active = true;
        payload.on_duty = false;
        if (!payload.partner_password) payload.partner_password = "temp1234";
        const { error: err } = await supabase.from("delivery_partners").insert(payload);
        error = err;
      }

      if (error) {
        showToast(error.message, true);
      } else {
        showToast(editId ? `Courier Rider ${name} updated successfully.` : `Courier Rider ${name} successfully integrated to base hub.`);
        resetRiderForm();
        await logAdminActivity(editId ? "edit_rider" : "onboard_rider", "delivery_partners", editId || phone);
        loadAdminData();
      }
    } else {
      if (editId) {
        const rider = dbData.riders.find(r => r.id === Number(editId));
        if (rider) {
          rider.full_name = name;
          rider.phone = phone;
          rider.service_pincode = pincode;
          rider.vehicle_no = vehicle;
          if (password) rider.partner_password = password;
        }
        showToast("Sandbox edit complete.");
      } else {
        dbData.riders.unshift({
          id: Date.now(),
          full_name: name,
          phone: phone,
          service_pincode: pincode,
          vehicle_no: vehicle,
          active: true,
          on_duty: false
        });
        showToast("Sandbox active. Onboarded offline.");
      }
      resetRiderForm();
      loadAdminData();
    }
  });

  // ADMIN ACTION: SAVE DYNAMIC GLOBAL SITE SETTINGS
  document.getElementById("global-settings-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const comm = Number(document.getElementById("setting-commission").value);
    const gate = Number(document.getElementById("setting-gateway").value);
    const del = Number(document.getElementById("setting-delivery").value);
    const email = document.getElementById("setting-email").value;
    const phone = document.getElementById("setting-phone").value;
    const announcement = document.getElementById("setting-announcement").value;

    const payload = [
      { key: "commission_pct", value: String(comm) },
      { key: "gateway_pct", value: String(gate) },
      { key: "delivery_charge", value: String(del) },
      { key: "support_email", value: email },
      { key: "support_phone_display", value: phone },
      { key: "site_announcement", value: announcement }
    ];

    if (supabase) {
      const { error } = await supabase.from("site_settings").upsert(payload);
      if (error) {
        showToast(error.message, true);
      } else {
        showToast("Platform core dynamic formulas committed successfully.");
        await logAdminActivity("save_settings", "site_settings", "global_config");
        await loadGlobalSettings();
        populateGlobalSettingsForm();
      }
    } else {
      showToast("Sandbox offline. Values simulated.");
    }
  });

  // SELLER ACTION: PRICE SANDBOX FORM FORMULA TRIGGER
  document.getElementById("sandbox-price-input").addEventListener("input", (e) => {
    calculateAndRenderSandbox(Number(e.target.value) || 0);
  });

  // SELLER ACTION: POPULATE DRAFT ATTR FROM TEXT DRAFT AREA
  document.getElementById("import-listing-btn").addEventListener("click", () => {
    const importStr = document.getElementById("import-listing-text").value;
    try {
      const obj = JSON.parse(importStr);
      if (obj.title) document.getElementById("prod-title").value = obj.title;
      if (obj.category) document.getElementById("prod-category").value = obj.category;
      if (obj.price || obj.shop_price) {
        const p = obj.price || obj.shop_price;
        document.getElementById("prod-price").value = p;
        calculateFormCostProfit(p);
      }
      if (obj.stock || obj.stock_qty) document.getElementById("prod-stock").value = obj.stock || obj.stock_qty;
      if (obj.color) document.getElementById("prod-color").value = obj.color;
      if (obj.fabric) document.getElementById("prod-fabric").value = obj.fabric;
      if (obj.description) document.getElementById("prod-desc").value = obj.description;
      if (obj.image_url) document.getElementById("prod-image").value = obj.image_url;
      showToast("Attributes loaded successfully!");
    } catch (_) {
      showToast("Please paste valid structured JSON objects.", true);
    }
  });

  // Sync profit margins inside Seller Create Product form
  const pPrice = document.getElementById("prod-price");
  const pCost = document.getElementById("prod-cost");
  const pProfit = document.getElementById("prod-profit");

  pPrice.addEventListener("input", () => {
    const priceNum = Number(pPrice.value) || 0;
    const costNum = Number(pCost.value) || 0;
    pProfit.value = String(Math.max(0, priceNum - costNum));
  });

  pCost.addEventListener("input", () => {
    const costNum = Number(pCost.value) || 0;
    const profitNum = Number(pProfit.value) || 0;
    pPrice.value = String(costNum + profitNum);
  });

  pProfit.addEventListener("input", () => {
    const costNum = Number(pCost.value) || 0;
    const profitNum = Number(pProfit.value) || 0;
    pPrice.value = String(costNum + profitNum);
  });

  // SELLER ACTION: NEW PRODUCT SUBMIT
  document.getElementById("add-product-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!activeShop) return;

    const title = document.getElementById("prod-title").value;
    const category = document.getElementById("prod-category").value;
    const basePrice = Number(pPrice.value);
    const qty = Number(document.getElementById("prod-stock").value);
    const fabric = document.getElementById("prod-fabric").value || "Premium Cotton";
    const color = document.getElementById("prod-color").value || "Standard Theme";
    const image = document.getElementById("prod-image").value || "https://images.unsplash.com/photo-1544005313-94ddf0286df2";
    const desc = document.getElementById("prod-desc").value || "Premium brand wear";

    const commissionAmt = Math.round((basePrice * siteSettings.commission_pct) / 100);
    const gatewayAmt = Math.round((basePrice * siteSettings.gateway_pct) / 100);
    const customerAmt = basePrice + commissionAmt + gatewayAmt + siteSettings.delivery_charge;

    const payload = {
      shop_id: activeShop.id,
      title: title,
      category: category,
      shop_price: basePrice,
      commission_pct: siteSettings.commission_pct,
      commission_amount: commissionAmt,
      delivery_fee: siteSettings.delivery_charge,
      customer_price: customerAmt,
      price: customerAmt,
      stock_qty: qty,
      color: color,
      sizes: "S,M,L,XL",
      fabric: fabric,
      description: desc,
      image_url: image,
      submitted_by: activeShop.shop_login_id,
      status: "pending"
    };

    if (supabase) {
      const { error } = await supabase.from("shopkeeper_products").insert(payload);
      if (error) {
        showToast(error.message, true);
      } else {
        showToast("Product sent to Admin for review. Activation expected in 2 hours.");
        document.getElementById("add-product-form").reset();
        loadSellerData();
      }
    } else {
      showToast("Offline mock catalog added successfully.");
    }
  });

  // SELLER ACTION: QUICK METRICS FORM SUBMIT
  document.getElementById("quick-update-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const pid = Number(document.getElementById("quick-prod-id").value);
    const priceNum = Number(document.getElementById("quick-prod-price").value);
    const stockQty = Number(document.getElementById("quick-prod-stock").value);

    const commissionAmt = Math.round((priceNum * siteSettings.commission_pct) / 100);
    const gatewayAmt = Math.round((priceNum * siteSettings.gateway_pct) / 100);
    const customerAmt = priceNum + commissionAmt + gatewayAmt + siteSettings.delivery_charge;

    if (supabase) {
      const { error } = await supabase
        .from("shopkeeper_products")
        .update({
          shop_price: priceNum,
          commission_pct: siteSettings.commission_pct,
          commission_amount: commissionAmt,
          delivery_fee: siteSettings.delivery_charge,
          customer_price: customerAmt,
          price: customerAmt,
          stock_qty: stockQty,
          updated_at: new Date().toISOString()
        })
        .eq("id", pid)
        .eq("shop_id", activeShop.id);

      if (error) {
        showToast(error.message, true);
      } else {
        showToast("Pricing and inventory stock units adjusted successfully.");
        document.getElementById("quick-update-form").reset();
        loadSellerData();
      }
    } else {
      showToast("Sandbox inventory update successful.");
    }
  });

  // SELLER ORDER FILTER NAVIGATION
  document.querySelectorAll("[data-seller-order-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-seller-order-filter]").forEach((b) => {
        b.className = "seller-order-filter-btn px-3 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 cursor-pointer";
      });
      btn.className = "seller-order-filter-btn px-3 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 shadow-sm cursor-pointer";
      renderSellerOrdersTable(btn.dataset.sellerOrderFilter);
    });
  });

  // ADMIN ORDER SEARCH
  document.getElementById("admin-orders-search").addEventListener("input", (e) => {
    renderAdminOrdersTable(e.target.value);
  });

  // ADMIN PRODUCT SEARCH & STATUS FILTER
  const adminProdSearch = document.getElementById("admin-product-search");
  if (adminProdSearch) {
    adminProdSearch.addEventListener("input", () => {
      renderProductsTable();
    });
  }

  const adminProdFilter = document.getElementById("admin-product-status-filter");
  if (adminProdFilter) {
    adminProdFilter.addEventListener("change", () => {
      renderProductsTable();
    });
  }

  // SELLER ORDER SEARCH
  document.getElementById("seller-orders-search").addEventListener("input", (e) => {
    const val = e.target.value.toLowerCase();
    const activeFilter = document.querySelector(".seller-order-filter-btn.bg-white").dataset.sellerOrderFilter;
    renderSellerOrdersTable(activeFilter, val);
  });

  // ADMIN ACTION: REGISTER / EDIT SELLER HUB SHOP
  document.getElementById("add-shop-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const editId = document.getElementById("shop-edit-id").value;
    const name = document.getElementById("shop-name").value;
    const owner = document.getElementById("shop-owner").value;
    const mobile = document.getElementById("shop-mobile").value;
    const pincode = document.getElementById("shop-pincode").value;
    const address = document.getElementById("shop-address").value;
    const loginId = document.getElementById("shop-login-id").value;
    const password = document.getElementById("shop-password").value;

    const payload = {
      shop_name: name,
      owner_name: owner,
      mobile: mobile,
      pincode: pincode,
      address: address,
      shop_login_id: loginId
    };

    if (password) {
      payload.shop_password = password;
    }

    if (supabase) {
      let error;
      if (editId) {
        const { error: err } = await supabase.from("shops").update(payload).eq("id", Number(editId));
        error = err;
      } else {
        payload.status = "active";
        payload.is_visible = true;
        payload.wallet_balance = 0;
        if (!payload.shop_password) payload.shop_password = "pass1234";
        const { error: err } = await supabase.from("shops").insert(payload);
        error = err;
      }

      if (error) {
        showToast(error.message, true);
      } else {
        showToast(editId ? `Seller Hub ${name} updated successfully.` : `Seller Hub ${name} registered & activated successfully.`);
        resetShopForm();
        await logAdminActivity(editId ? "edit_shop" : "register_shop", "shops", editId || loginId);
        if (!editId && window.flashfitNotifications) {
          window.flashfitNotifications.create("new_shopkeeper_registration", {
            shopId: payload.id || loginId,
            entityType: "shops",
            entityId: loginId,
            body: `A new seller hub "${name}" has been registered.`
          });
        }
        loadAdminData();
      }
    } else {
      if (editId) {
        const s = dbData.shops.find(x => x.id === Number(editId));
        if (s) {
          s.shop_name = name;
          s.owner_name = owner;
          s.mobile = mobile;
          s.pincode = pincode;
          s.address = address;
          s.shop_login_id = loginId;
          if (password) s.shop_password = password;
        }
        showToast("Sandbox edit complete.");
      } else {
        dbData.shops.unshift({
          id: Date.now(),
          shop_name: name,
          owner_name: owner,
          mobile: mobile,
          pincode: pincode,
          address: address,
          shop_login_id: loginId,
          shop_password: password || "pass1234",
          status: "active",
          is_visible: true,
          wallet_balance: 0,
          created_at: new Date().toISOString()
        });
        showToast("Sandbox active. Registered offline.");
      }
      resetShopForm();
      loadAdminData();
    }
  });

  // ADMIN ACTION: CREATE / EDIT PRODUCT ON BEHALF OF HUBS
  document.getElementById("admin-add-product-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const editId = document.getElementById("admin-prod-edit-id").value;
    const shopId = Number(document.getElementById("admin-prod-shop-id").value);
    const title = document.getElementById("admin-prod-title").value;
    const category = document.getElementById("admin-prod-category").value;
    const basePrice = Number(document.getElementById("admin-prod-price").value);
    const markup = Number(document.getElementById("admin-prod-markup").value) || 15;
    const qty = Number(document.getElementById("admin-prod-stock").value);
    const color = document.getElementById("admin-prod-color").value || "Standard Theme";
    const fabric = document.getElementById("admin-prod-fabric").value || "Premium Cotton";
    const image = document.getElementById("admin-prod-image").value || "https://images.unsplash.com/photo-1544005313-94ddf0286df2";
    const desc = document.getElementById("admin-prod-desc").value || "Premium brand wear";

    // Final consumer calculated values
    const commissionAmt = Math.round((basePrice * markup) / 100);
    const gatewayAmt = Math.round((basePrice * siteSettings.gateway_pct) / 100);
    const customerAmt = basePrice + commissionAmt + gatewayAmt + siteSettings.delivery_charge;

    const payload = {
      shop_id: shopId,
      title: title,
      category: category,
      shop_price: basePrice,
      commission_pct: markup,
      commission_amount: commissionAmt,
      delivery_fee: siteSettings.delivery_charge,
      customer_price: customerAmt,
      price: customerAmt,
      stock_qty: qty,
      color: color,
      sizes: "S,M,L,XL",
      fabric: fabric,
      description: desc,
      image_url: image
    };

    if (supabase) {
      let error;
      if (editId) {
        const { error: err } = await supabase.from("shopkeeper_products").update(payload).eq("id", Number(editId));
        error = err;
      } else {
        payload.status = "approved";
        payload.submitted_by = "admin_workspace";
        const { error: err } = await supabase.from("shopkeeper_products").insert(payload);
        error = err;
      }

      if (error) {
        showToast(error.message, true);
      } else {
        showToast(editId ? `Product ${title} updated successfully.` : `Product ${title} published to live catalog.`);
        resetAdminProductForm();
        await logAdminActivity(editId ? "edit_product" : "create_product", "shopkeeper_products", editId || title);
        loadAdminData();
      }
    } else {
      if (editId) {
        const p = dbData.products.find(x => x.id === Number(editId));
        if (p) {
          p.shop_id = shopId;
          p.title = title;
          p.category = category;
          p.shop_price = basePrice;
          p.commission_pct = markup;
          p.commission_amount = commissionAmt;
          p.customer_price = customerAmt;
          p.price = customerAmt;
          p.stock_qty = qty;
          p.color = color;
          p.fabric = fabric;
          p.image_url = image;
          p.description = desc;
        }
        showToast("Sandbox product edit complete.");
      } else {
        dbData.products.unshift({
          id: Date.now(),
          ...payload,
          status: "approved",
          submitted_by: "admin_workspace",
          created_at: new Date().toISOString()
        });
        showToast("Sandbox product added to catalog successfully.");
      }
      resetAdminProductForm();
      loadAdminData();
    }
  });
}

// Populate cost fields helpers
function calculateFormCostProfit(basePrice) {
  const pPrice = document.getElementById("prod-price");
  const pCost = document.getElementById("prod-cost");
  const pProfit = document.getElementById("prod-profit");

  const bp = Number(basePrice) || 0;
  pCost.value = String(Math.round(bp * 0.7));
  pProfit.value = String(Math.round(bp * 0.3));
}

// Dynamic Settings Loader
async function loadGlobalSettings() {
  if (supabase) {
    try {
      const { data } = await supabase.from("site_settings").select("key,value");
      if (data && data.length > 0) {
        data.forEach((row) => {
          if (row.key === "commission_pct") siteSettings.commission_pct = Number(row.value);
          else if (row.key === "gateway_pct") siteSettings.gateway_pct = Number(row.value);
          else if (row.key === "delivery_charge") siteSettings.delivery_charge = Number(row.value);
          else if (row.key === "support_email") siteSettings.support_email = row.value;
          else if (row.key === "support_phone_display") siteSettings.support_phone_display = row.value;
          else if (row.key === "site_announcement") siteSettings.site_announcement = row.value;
        });
      }
    } catch (_) {}
  }

  // Bind site configuration parameters
  document.getElementById("announcement-text").innerText = siteSettings.site_announcement;
  if (!siteSettings.site_announcement) document.getElementById("announcement-banner").style.display = "none";
  else document.getElementById("announcement-banner").style.display = "flex";

  // Bind footer variables
  document.getElementById("footer-support-email").innerText = siteSettings.support_email;
  document.getElementById("footer-support-email").href = `mailto:${siteSettings.support_email}`;
  document.getElementById("footer-support-phone").innerText = siteSettings.support_phone_display;
}

// Fetch Admin Database Lists
async function loadAdminData() {
  if (!supabase) return;

  const loader = document.getElementById("admin-loading");
  loader.classList.remove("hidden");

  try {
    const [
      { data: oData },
      { data: sData },
      { data: rData },
      { data: pData },
      { data: saData },
      { data: lData },
      { data: revData }
    ] = await Promise.all([
      supabase.from("seller_orders").select("*").order("created_at", { ascending: false }),
      supabase.from("shops").select("*").order("created_at", { ascending: false }),
      supabase.from("delivery_partners").select("*").order("id", { ascending: false }),
      supabase.from("shopkeeper_products").select("*").order("id", { ascending: false }),
      supabase.from("serviceable_pincodes").select("*").order("pincode", { ascending: true }),
      supabase.from("admin_activity_logs").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("product_reviews").select("*").order("created_at", { ascending: false })
    ]);

    dbData.orders = oData || [];
    dbData.shops = sData || [];
    dbData.riders = rData || [];
    dbData.products = pData || [];
    dbData.serviceAreas = saData || [];
    dbData.logs = lData || [];
    dbData.reviews = revData || [];

    // Render components
    renderAdminStats();
    renderLogsTable();
    renderPincodesTable();
    renderRidersTable();
    renderShopsTable();
    renderProductsTable();
    renderAdminOrdersTable();
    populateGlobalSettingsForm();

    // If on reports tab, update current report state
    const reportsTab = document.querySelector('[data-admin-tab="reports"]');
    const reportsTabActive = reportsTab && reportsTab.classList.contains("bg-brand-500");
    if (reportsTabActive) {
      const activeReportBtn = document.querySelector(".report-tab-btn.bg-brand-500");
      if (activeReportBtn) {
        const reportId = activeReportBtn.id.replace("rep-tab-", "");
        renderReportData(reportId);
      }
    }

  } catch (err) {
    showToast(err.message, true);
  } finally {
    loader.classList.add("hidden");
  }
}

// Dynamic Admin Header statistics
function renderAdminStats() {
  const gmv = dbData.orders.reduce((sum, o) => sum + Number(o.total || 0), 0);
  const totalEarnings = dbData.orders.reduce((sum, o) => {
    const total = Number(o.total || 0);
    const platform = o.commission_amount || (total * (siteSettings.commission_pct / 100));
    const gateway = total * (siteSettings.gateway_pct / 100);
    return sum + (platform + gateway);
  }, 0);

  document.getElementById("admin-stat-gmv").innerText = formatRs(gmv);
  document.getElementById("admin-stat-gmv-sub").innerText = `${dbData.orders.length} Global Sales Orders`;
  document.getElementById("admin-stat-earnings").innerText = formatRs(totalEarnings);
  document.getElementById("admin-stat-sellers").innerText = dbData.shops.filter(s => s.status === 'active').length;
  document.getElementById("admin-stat-sellers-sub").innerText = `${dbData.shops.filter(s => s.status === 'pending').length} pending review`;
  document.getElementById("admin-stat-products").innerText = dbData.products.filter(p => p.status === 'pending').length;
}

// Load Seller Workspace Data lists
async function loadSellerData() {
  if (!supabase || !activeShop) return;

  const loader = document.getElementById("seller-loading");
  loader.classList.remove("hidden");

  try {
    const [
      { data: oData },
      { data: pData },
      { data: revData }
    ] = await Promise.all([
      supabase.from("seller_orders").select("*").eq("shop_id", activeShop.id).order("created_at", { ascending: false }),
      supabase.from("shopkeeper_products").select("*").eq("shop_id", activeShop.id).order("id", { ascending: false }),
      supabase.from("product_reviews").select("*").eq("shop_id", activeShop.id).order("created_at", { ascending: false })
    ]);

    dbData.orders = oData || [];
    dbData.products = pData || [];
    dbData.reviews = revData || [];

    // Render components
    renderSellerStats();
    calculateAndRenderSandbox(500);
    renderSellerReviews();
    renderSellerProductsTable();
    renderSellerOrdersTable("all");

  } catch (err) {
    showToast(err.message, true);
  } finally {
    loader.classList.add("hidden");
  }
}

// Populate seller header block
function populateSellerHeader() {
  if (!activeShop) return;
  document.getElementById("seller-profile-name").innerText = activeShop.shop_name;
  document.getElementById("seller-profile-address").innerText = activeShop.address;
  document.getElementById("seller-profile-meta").innerText = `Owner: ${activeShop.owner_name} • Pincode: ${activeShop.pincode}`;
}

// Populate seller statistics
function renderSellerStats() {
  const gmv = dbData.orders.reduce((sum, o) => sum + Number(o.total || 0), 0);
  const delivered = dbData.orders.filter(o => o.order_status === "delivered");
  
  // Calculate Net payout earnings
  const payout = delivered.reduce((sum, o) => {
    const total = Number(o.total || 0);
    const commission = o.commission_amount || (total * (siteSettings.commission_pct / 100));
    const gateway = total * (siteSettings.gateway_pct / 100);
    const shipping = o.delivery_charge || siteSettings.delivery_charge;
    return sum + Math.max(0, total - (commission + gateway + shipping));
  }, 0);

  document.getElementById("seller-stat-payouts").innerText = formatRs(payout);
  document.getElementById("seller-stat-payouts-sub").innerText = `${delivered.length} Completed Settlements`;
  document.getElementById("seller-stat-gmv").innerText = formatRs(gmv);
  document.getElementById("seller-stat-products").innerText = dbData.products.filter(p => p.status === 'active' || p.status === 'approved').length;
  document.getElementById("seller-stat-products-sub").innerText = `${dbData.products.filter(p => p.status === 'pending').length} pending review`;
  document.getElementById("seller-stat-orders").innerText = dbData.orders.filter(o => o.order_status === 'pending' || o.order_status === 'accepted' || o.order_status === 'packed').length;
}

// ----------------------------------------------------
// DYNAMIC TABLE RENDERING (ADMIN)
// ----------------------------------------------------

function renderLogsTable() {
  const container = document.getElementById("admin-logs-container");
  container.innerHTML = "";

  if (dbData.logs.length === 0) {
    container.innerHTML = `<span class="text-xs text-slate-400 py-3 text-center">No system operations logged yet.</span>`;
    return;
  }

  dbData.logs.forEach((log) => {
    const div = document.createElement("div");
    div.className = "p-3 bg-slate-50 dark:bg-slate-950 border border-slate-150 dark:border-slate-800 rounded-xl text-xs flex flex-col gap-1";
    div.innerHTML = `
      <div class="flex items-center justify-between">
        <span class="font-bold text-indigo-600 dark:text-indigo-400 font-mono">${log.action.toUpperCase()}</span>
        <small class="text-slate-400">${new Date(log.created_at).toLocaleTimeString()}</small>
      </div>
      <p class="text-slate-600 dark:text-slate-400">Target entity: ${log.entity_type} (#${log.entity_id})</p>
    `;
    container.appendChild(div);
  });
}

function renderPincodesTable() {
  const tbody = document.getElementById("pincodes-table-body");
  tbody.innerHTML = "";

  if (dbData.serviceAreas.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center py-6 text-slate-400 text-xs">No active regional coverage registered.</td></tr>`;
    return;
  }

  dbData.serviceAreas.forEach((item) => {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-slate-50/50 dark:hover:bg-slate-800/30";
    tr.innerHTML = `
      <td class="px-5 py-3 whitespace-nowrap font-bold font-mono text-slate-900 dark:text-slate-100">${item.pincode}</td>
      <td class="px-5 py-3 whitespace-nowrap font-semibold text-slate-700 dark:text-slate-300">₹${item.delivery_charge || 90}</td>
      <td class="px-5 py-3 whitespace-nowrap">
        <span class="px-2 py-0.5 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 rounded-full text-xs font-bold uppercase">Active Coverage</span>
      </td>
      <td class="px-5 py-3 whitespace-nowrap text-center">
        <button class="text-rose-500 hover:text-rose-700 font-bold p-1 transition-colors cursor-pointer" onclick="deleteServiceArea('${item.pincode}')">
          <i data-lucide="trash-2" class="w-4 h-4"></i>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
  lucide.createIcons();
}

function renderRidersTable() {
  const tbody = document.getElementById("riders-table-body");
  tbody.innerHTML = "";

  // Update drivers count in the UI
  const ridersCountEl = document.getElementById("admin-riders-count");
  if (ridersCountEl) {
    ridersCountEl.innerText = `${dbData.riders.length} Drivers Onboarded`;
  }

  if (dbData.riders.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-6 text-slate-400 text-xs">No riders onboarded.</td></tr>`;
    return;
  }

  dbData.riders.forEach((rider) => {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-slate-50/50 dark:hover:bg-slate-800/30";
    tr.innerHTML = `
      <td class="px-5 py-3 whitespace-nowrap font-bold text-slate-900 dark:text-slate-100">${rider.full_name}</td>
      <td class="px-5 py-3 whitespace-nowrap text-slate-500">${rider.phone}</td>
      <td class="px-5 py-3 whitespace-nowrap font-semibold">${rider.service_pincode}</td>
      <td class="px-5 py-3 whitespace-nowrap font-mono text-xs text-slate-600">${rider.vehicle_no || 'NA'}</td>
      <td class="px-5 py-3 whitespace-nowrap">
        <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${rider.on_duty ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20' : 'bg-slate-100 text-slate-600 dark:bg-slate-800'}">
          ${rider.on_duty ? 'On Duty' : 'Off Duty'}
        </span>
      </td>
      <td class="px-5 py-3 whitespace-nowrap text-center">
        <div class="flex items-center justify-center gap-1.5">
          <button class="bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 text-xs font-bold px-2 py-1 rounded-lg cursor-pointer" onclick="toggleRiderDuty(${rider.id}, ${!rider.on_duty})">
            Switch Shift
          </button>
          <button class="bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold px-2 py-1 rounded-lg cursor-pointer" onclick="editRider(${rider.id})">
            Edit
          </button>
          <button class="bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-xs font-bold px-2 py-1 rounded-lg cursor-pointer" onclick="deleteRider(${rider.id})">
            Delete
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderShopsTable() {
  const tbody = document.getElementById("shops-table-body");
  tbody.innerHTML = "";

  const shopsCountEl = document.getElementById("admin-shops-count");
  if (shopsCountEl) {
    shopsCountEl.innerText = String(dbData.shops.length);
  }

  // Also dynamically populate the Select Target Seller Hub dropdown inside Catalog Add Product form!
  const prodShopSelect = document.getElementById("admin-prod-shop-id");
  if (prodShopSelect) {
    prodShopSelect.innerHTML = dbData.shops.map(shop => 
      `<option value="${shop.id}">${shop.shop_name} (${shop.pincode})</option>`
    ).join("");
  }

  if (dbData.shops.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-6 text-slate-400 text-xs">No shops registered.</td></tr>`;
    return;
  }

  dbData.shops.forEach((shop) => {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-slate-50/50 dark:hover:bg-slate-800/30";

    const statusBadge = shop.status === 'active' 
      ? `<span class="px-2 py-0.5 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 rounded-full text-[10px] font-bold uppercase">Active</span>`
      : `<span class="px-2 py-0.5 bg-amber-50 text-amber-700 dark:bg-amber-950/20 rounded-full text-[10px] font-bold uppercase">Pending</span>`;

    // Advanced dynamic admin verification/actions
    const actionVerify = shop.status === 'active'
      ? `<button class="text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 px-1.5 py-0.5 rounded text-xs font-bold cursor-pointer" onclick="updateShopStatus(${shop.id}, 'suspended')">Suspend</button>`
      : `<button class="text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 px-1.5 py-0.5 rounded text-xs font-bold mr-1 cursor-pointer" onclick="updateShopStatus(${shop.id}, 'active')">Approve Hub</button>
         <button class="text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 px-1.5 py-0.5 rounded text-xs font-bold cursor-pointer" onclick="updateShopStatus(${shop.id}, 'rejected')">Reject</button>`;

    tr.innerHTML = `
      <td class="px-4 py-3 whitespace-nowrap font-bold text-slate-900 dark:text-slate-100">
        ${shop.shop_name}
        <br><small class="text-slate-400 font-normal block max-w-xs truncate" title="${shop.address}">${shop.address}</small>
      </td>
      <td class="px-4 py-3 whitespace-nowrap">
        <span class="font-semibold text-slate-700 dark:text-slate-300">${shop.owner_name}</span>
        <br><span class="text-slate-400 text-xs font-mono">${shop.mobile}</span>
      </td>
      <td class="px-4 py-3 whitespace-nowrap font-mono font-bold">${shop.pincode}</td>
      <td class="px-4 py-3 whitespace-nowrap font-mono text-xs text-brand-600 font-bold">${shop.shop_login_id}</td>
      <td class="px-4 py-3 whitespace-nowrap">${statusBadge}</td>
      <td class="px-4 py-3 whitespace-nowrap text-center">
        <div class="flex items-center justify-center gap-1.5">
          ${actionVerify}
          <div class="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-1"></div>
          <button class="bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold px-2 py-1 rounded-lg cursor-pointer" onclick="editShop(${shop.id})">
            Edit
          </button>
          <button class="bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-xs font-bold px-2 py-1 rounded-lg cursor-pointer" onclick="deleteShop(${shop.id})">
            Delete
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderProductsTable() {
  const tbody = document.getElementById("products-table-body");
  tbody.innerHTML = "";

  const filterEl = document.getElementById("admin-product-status-filter");
  const filterVal = filterEl ? filterEl.value : "all";
  
  const searchEl = document.getElementById("admin-product-search");
  const searchVal = searchEl ? searchEl.value.toLowerCase() : "";

  let list = dbData.products;

  // Status Filter
  if (filterVal === "pending") {
    list = list.filter(p => p.status === "pending");
  } else if (filterVal === "approved") {
    list = list.filter(p => p.status === "approved" || p.status === "active");
  } else if (filterVal === "rejected") {
    list = list.filter(p => p.status === "rejected");
  }

  // Search Filter
  if (searchVal) {
    list = list.filter(p => 
      p.title.toLowerCase().includes(searchVal) || 
      p.category.toLowerCase().includes(searchVal) ||
      String(p.id).includes(searchVal)
    );
  }

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-slate-400 text-xs">No matching products found.</td></tr>`;
    return;
  }

  list.forEach((prod) => {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-slate-50/50 dark:hover:bg-slate-800/30";

    const isApproved = prod.status === 'approved' || prod.status === 'active';
    const statusBadge = isApproved
      ? `<span class="px-2 py-0.5 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 rounded-full text-[10px] font-bold uppercase">Approved</span>`
      : (prod.status === "rejected" ? `<span class="px-2 py-0.5 bg-rose-50 text-rose-700 dark:bg-rose-950/20 rounded-full text-[10px] font-bold uppercase">Rejected</span>` : `<span class="px-2 py-0.5 bg-amber-50 text-amber-700 dark:bg-amber-950/20 rounded-full text-[10px] font-bold uppercase">Pending QA</span>`);

    // Hub shop details
    const shop = dbData.shops.find(s => s.id === prod.shop_id);
    const shopDisplay = shop ? `${shop.shop_name}<br><span class="text-slate-400 text-[10px]">Pincode: ${shop.pincode}</span>` : `Hub Shop #${prod.shop_id}`;

    const qaActions = prod.status === 'pending'
      ? `<button class="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-lg mr-1 cursor-pointer" onclick="updateProductStatus(${prod.id}, 'approved')">Approve</button>
         <button class="bg-rose-50 hover:bg-rose-100 text-rose-700 text-[10px] font-bold px-2 py-0.5 rounded-lg cursor-pointer" onclick="updateProductStatus(${prod.id}, 'rejected')">Reject</button>`
      : `<span class="text-slate-400 text-xs">Reviewed</span>`;

    tr.innerHTML = `
      <td class="px-4 py-3 whitespace-nowrap">
        <div class="flex items-center gap-2">
          <img src="${prod.image_url || 'https://images.unsplash.com/photo-1544005313-94ddf0286df2'}" class="w-8 h-8 rounded-lg object-cover bg-slate-100" referrerPolicy="no-referrer">
          <div>
            <strong class="text-slate-800 dark:text-slate-100 block max-w-[150px] truncate" title="${prod.title}">${prod.title}</strong>
            <span class="text-slate-400 text-[10px] font-mono">ID: #${prod.id}</span>
          </div>
        </div>
      </td>
      <td class="px-4 py-3 whitespace-nowrap text-slate-500">${prod.category}</td>
      <td class="px-4 py-3 whitespace-nowrap font-semibold">${formatRs(prod.shop_price)}</td>
      <td class="px-4 py-3 whitespace-nowrap font-bold text-brand-600">${formatRs(prod.customer_price || prod.price)}</td>
      <td class="px-4 py-3 whitespace-nowrap font-semibold">${prod.stock_qty} pcs</td>
      <td class="px-4 py-3 whitespace-nowrap text-xs text-slate-600">${shopDisplay}</td>
      <td class="px-4 py-3 whitespace-nowrap">${statusBadge}</td>
      <td class="px-4 py-3 whitespace-nowrap text-center">
        <div class="flex items-center justify-center gap-1">
          <div class="flex flex-col gap-1">
            ${qaActions}
          </div>
          <div class="h-6 w-px bg-slate-200 dark:bg-slate-800 mx-1.5"></div>
          <button class="bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold px-2 py-1 rounded-lg cursor-pointer" onclick="editAdminProduct(${prod.id})">
            Edit
          </button>
          <button class="bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-xs font-bold px-2 py-1 rounded-lg cursor-pointer" onclick="deleteAdminProduct(${prod.id})">
            Delete
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderAdminOrdersTable(searchFilter = "") {
  const tbody = document.getElementById("orders-table-body");
  tbody.innerHTML = "";

  let list = dbData.orders;
  if (searchFilter) {
    list = list.filter(o => 
      String(o.order_number).toLowerCase().includes(searchFilter.toLowerCase()) || 
      String(o.customer_name).toLowerCase().includes(searchFilter.toLowerCase())
    );
  }

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-slate-400 text-xs">No matching orders found.</td></tr>`;
    return;
  }

  list.forEach((order) => {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-slate-50/50 dark:hover:bg-slate-800/30";

    const payBadge = order.payment_status === "paid"
      ? `<span class="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-bold uppercase">Paid</span>`
      : `<span class="px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full text-[10px] font-bold uppercase">Pending</span>`;

    const riderName = order.delivery_partner_id 
      ? `ID #${order.delivery_partner_id}` 
      : `<button class="text-xs bg-brand-50 hover:bg-brand-100 text-brand-600 font-bold px-2 py-1 rounded-lg cursor-pointer" onclick="adminAssignRider(${order.id})">Assign Rider</button>`;

    tr.innerHTML = `
      <td class="px-5 py-3 whitespace-nowrap font-bold font-mono text-xs text-indigo-600">${order.order_number}</td>
      <td class="px-5 py-3 whitespace-nowrap font-semibold">${order.customer_name}<br><small class="text-slate-400 font-normal">${order.customer_mobile}</small></td>
      <td class="px-5 py-3 whitespace-nowrap text-slate-600">${order.product_title} (Qty ${order.qty})</td>
      <td class="px-5 py-3 whitespace-nowrap font-bold text-slate-900 dark:text-slate-100">${formatRs(order.total)}</td>
      <td class="px-5 py-3 whitespace-nowrap"><span class="text-xs font-bold uppercase text-brand-500">${order.order_status.toUpperCase()}</span></td>
      <td class="px-5 py-3 whitespace-nowrap">${payBadge}</td>
      <td class="px-5 py-3 whitespace-nowrap">${riderName}</td>
      <td class="px-5 py-3 whitespace-nowrap text-center">
        <select class="bg-slate-50 border border-slate-200 rounded-lg text-xs p-1 focus:outline-none" onchange="updateOrderStatus(${order.id}, this.value)">
          <option value="">Status...</option>
          <option value="accepted">Accept</option>
          <option value="packed">Packed</option>
          <option value="out_for_delivery">Shipped</option>
          <option value="delivered">Delivered</option>
          <option value="cancelled">Cancel</option>
        </select>
        <button class="ml-2 text-xs text-indigo-600 hover:underline font-bold" onclick="adminMarkOrderPaid(${order.id})">Paid</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function populateGlobalSettingsForm() {
  document.getElementById("setting-commission").value = siteSettings.commission_pct;
  document.getElementById("setting-gateway").value = siteSettings.gateway_pct;
  document.getElementById("setting-delivery").value = siteSettings.delivery_charge;
  document.getElementById("setting-email").value = siteSettings.support_email;
  document.getElementById("setting-phone").value = siteSettings.support_phone_display;
  document.getElementById("setting-announcement").value = siteSettings.site_announcement || "";
}

// ----------------------------------------------------
// DYNAMIC TABLES RENDERING (SELLER)
// ----------------------------------------------------

function calculateAndRenderSandbox(price) {
  const comm = Math.round((price * siteSettings.commission_pct) / 100);
  const gate = Math.round((price * siteSettings.gateway_pct) / 100);
  const buyerPrice = price + comm + gate + siteSettings.delivery_charge;

  document.getElementById("sandbox-formula-metrics").innerText = `Commission ${siteSettings.commission_pct}% • Gateway ${siteSettings.gateway_pct}% • Shipping ₹${siteSettings.delivery_charge}`;
  document.getElementById("sandbox-gateway-fee").innerText = formatRs(gate);
  document.getElementById("sandbox-commission-fee").innerText = formatRs(comm);
  document.getElementById("sandbox-shipping-fee").innerText = formatRs(siteSettings.delivery_charge);
  document.getElementById("sandbox-buyer-price").innerText = formatRs(buyerPrice);
  document.getElementById("sandbox-seller-payout").innerText = formatRs(price);
}

function renderSellerReviews() {
  const container = document.getElementById("seller-reviews-container");
  container.innerHTML = "";

  if (dbData.reviews.length === 0) {
    container.innerHTML = `<span class="text-xs text-slate-400 py-3 text-center">No customer reviews published yet.</span>`;
    return;
  }

  dbData.reviews.forEach((rev) => {
    const div = document.createElement("div");
    div.className = "p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-150 dark:border-slate-800 rounded-xl text-xs flex flex-col gap-1.5";
    div.innerHTML = `
      <div class="flex items-center justify-between">
        <span class="font-bold text-brand-500">Rating: ${rev.rating}/5</span>
        <small class="text-slate-400">${new Date(rev.created_at).toLocaleDateString()}</small>
      </div>
      <p class="text-slate-600 dark:text-slate-400 italic">"${rev.review_text}"</p>
      <small class="text-slate-400 font-semibold font-mono">Product ID #${rev.product_id}</small>
    `;
    container.appendChild(div);
  });
}

function renderSellerProductsTable() {
  const tbody = document.getElementById("seller-products-table-body");
  tbody.innerHTML = "";

  if (dbData.products.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-slate-400 text-xs">No products in your catalog.</td></tr>`;
    return;
  }

  dbData.products.forEach((prod) => {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-slate-50/50 dark:hover:bg-slate-800/30";

    const statusBadge = prod.status === "approved" || prod.status === "active"
      ? `<span class="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full text-xs font-bold uppercase">Approved</span>`
      : `<span class="px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full text-xs font-bold uppercase">Pending</span>`;

    tr.innerHTML = `
      <td class="px-5 py-3 whitespace-nowrap font-semibold font-mono text-slate-400">#${prod.id}</td>
      <td class="px-5 py-3 whitespace-nowrap font-bold text-slate-900 dark:text-slate-100">${prod.title}</td>
      <td class="px-5 py-3 whitespace-nowrap text-slate-500">${prod.category}</td>
      <td class="px-5 py-3 whitespace-nowrap font-semibold">${formatRs(prod.shop_price)}</td>
      <td class="px-5 py-3 whitespace-nowrap font-bold text-brand-600">${formatRs(prod.customer_price || prod.price)}</td>
      <td class="px-5 py-3 whitespace-nowrap font-bold text-slate-700 dark:text-slate-300">${prod.stock_qty}</td>
      <td class="px-5 py-3 whitespace-nowrap">${statusBadge}</td>
      <td class="px-5 py-3 whitespace-nowrap text-center">
        <button class="bg-indigo-50 hover:bg-indigo-100 text-indigo-600 text-xs font-bold px-3 py-1 rounded-lg flex items-center gap-1 mx-auto" onclick="bumpProductVisibility(${prod.id})">
          <i data-lucide="rocket" class="w-3.5 h-3.5"></i> Push Live
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
  lucide.createIcons();
}

function renderSellerOrdersTable(filter = "all", searchQuery = "") {
  const tbody = document.getElementById("seller-orders-table-body");
  tbody.innerHTML = "";

  let list = dbData.orders;

  // Status Filtering
  if (filter === "pending") {
    list = list.filter(o => o.order_status === "pending");
  } else if (filter === "ready") {
    list = list.filter(o => o.order_status === "accepted" || o.order_status === "packed");
  } else if (filter === "shipped") {
    list = list.filter(o => o.order_status === "out_for_delivery");
  }

  // Search Filter
  if (searchQuery) {
    list = list.filter(o => 
      String(o.order_number).toLowerCase().includes(searchQuery) ||
      String(o.customer_name).toLowerCase().includes(searchQuery) ||
      String(o.customer_mobile).toLowerCase().includes(searchQuery)
    );
  }

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-slate-400 text-xs">No current orders matching filters.</td></tr>`;
    return;
  }

  list.forEach((order) => {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-slate-50/50 dark:hover:bg-slate-800/30";

    const payBadge = order.payment_status === "paid"
      ? `<span class="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-bold uppercase">Paid</span>`
      : `<span class="px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full text-[10px] font-bold uppercase">Pending</span>`;

    const courierInfo = order.delivery_partner_id 
      ? `<span class="text-xs font-semibold text-slate-600">ID #${order.delivery_partner_id} (${order.delivery_partner_status || 'Assigned'})</span>` 
      : `<button class="text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-bold px-2 py-1 rounded-lg cursor-pointer" onclick="sellerProximityAssign(${order.id})">Auto Courier Match</button>`;

    tr.innerHTML = `
      <td class="px-5 py-3 whitespace-nowrap font-bold font-mono text-xs text-indigo-600">${order.order_number}</td>
      <td class="px-5 py-3 whitespace-nowrap font-semibold">${order.customer_name}<br><small class="text-slate-400 font-normal">${order.customer_mobile}</small></td>
      <td class="px-5 py-3 whitespace-nowrap text-slate-500">${order.product_title}</td>
      <td class="px-5 py-3 whitespace-nowrap font-bold text-slate-900 dark:text-slate-100">${formatRs(order.total)}</td>
      <td class="px-5 py-3 whitespace-nowrap"><span class="text-xs font-bold uppercase text-brand-500">${order.order_status.toUpperCase()}</span></td>
      <td class="px-5 py-3 whitespace-nowrap">${payBadge}</td>
      <td class="px-5 py-3 whitespace-nowrap">${courierInfo}</td>
      <td class="px-5 py-3 whitespace-nowrap text-center">
        <button class="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3 py-1 rounded-lg mr-2 cursor-pointer" onclick="printCargoShippingLabel(${order.id})">Print Label</button>
        <button class="bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold px-3 py-1 rounded-lg cursor-pointer" onclick="sellerNextOrderStatus(${order.id}, '${order.order_status}')">Next Stage</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// ----------------------------------------------------
// CORE ACTIONS DISPATCHERS
// ----------------------------------------------------

// ADMIN METHODS
async function deleteServiceArea(pincode) {
  if (!confirm(`Are you sure you want to remove coverage for pincode ${pincode}?`)) return;
  if (supabase) {
    const { error } = await supabase.from("serviceable_pincodes").delete().eq("pincode", pincode);
    if (error) {
      showToast(error.message, true);
    } else {
      showToast(`Pincode ${pincode} removed successfully.`);
      await logAdminActivity("delete_serviceable_pincode", "serviceable_pincodes", pincode);
      loadAdminData();
    }
  }
}

async function toggleRiderDuty(riderId, currentDuty) {
  if (supabase) {
    const { error } = await supabase.from("delivery_partners").update({ on_duty: currentDuty }).eq("id", riderId);
    if (error) {
      showToast(error.message, true);
    } else {
      showToast(`Rider duty changed successfully.`);
      loadAdminData();
    }
  }
}

async function updateShopStatus(shopId, status) {
  if (supabase) {
    const { error } = await supabase.from("shops").update({ status: status }).eq("id", shopId);
    if (error) {
      showToast(error.message, true);
    } else {
      showToast(`Shop Verification Status Updated: ${status}`);
      await logAdminActivity("update_shop_status", "shops", String(shopId), { status });
      loadAdminData();
    }
  }
}

async function updateProductStatus(prodId, status) {
  if (supabase) {
    const { error } = await supabase.from("shopkeeper_products").update({ status: status }).eq("id", prodId);
    if (error) {
      showToast(error.message, true);
    } else {
      showToast(`Product quality state verified: ${status}`);
      await logAdminActivity("update_product_status", "shopkeeper_products", String(prodId), { status });
      loadAdminData();
    }
  }
}

async function updateOrderStatus(orderId, status) {
  if (!status) return;
  if (supabase) {
    const { error } = await supabase.from("seller_orders").update({ order_status: status }).eq("id", orderId);
    if (error) {
      showToast(error.message, true);
    } else {
      showToast(`Order status transitioned to: ${status}`);
      await logAdminActivity("update_order_status", "seller_orders", String(orderId), { status });
      loadAdminData();
    }
  }
}

async function adminMarkOrderPaid(orderId) {
  if (supabase) {
    const { error } = await supabase.from("seller_orders").update({ payment_status: "paid", payment_received_at: new Date().toISOString() }).eq("id", orderId);
    if (error) {
      showToast(error.message, true);
    } else {
      showToast("Order transaction paid.");
      loadAdminData();
    }
  }
}

async function adminAssignRider(orderId) {
  if (supabase) {
    const { data: available } = await supabase.from("delivery_partners").select("*").eq("active", true).eq("on_duty", true);
    if (!available || available.length === 0) {
      showToast("No dispatch riders are currently on-duty.", true);
      return;
    }
    const target = available[0];
    const { error } = await supabase.from("seller_orders").update({
      delivery_partner_id: target.id,
      delivery_partner_status: "assigned",
      partner_updated_at: new Date().toISOString(),
      order_status: "accepted"
    }).eq("id", orderId);

    if (error) {
      showToast(error.message, true);
    } else {
      showToast(`Assigned courier rider: ${target.full_name}`);
      loadAdminData();
    }
  }
}

// EDIT / DELETE RIDER FUNCTIONS
function editRider(riderId) {
  const rider = dbData.riders.find(r => r.id === riderId);
  if (!rider) return;

  document.getElementById("rider-edit-id").value = rider.id;
  document.getElementById("rider-name").value = rider.full_name;
  document.getElementById("rider-phone").value = rider.phone;
  document.getElementById("rider-pincode").value = rider.service_pincode;
  document.getElementById("rider-vehicle").value = rider.vehicle_no || "";
  document.getElementById("rider-password").value = rider.partner_password || "";

  // Visual cues
  document.getElementById("rider-submit-btn-text").innerText = "Update Driver";
  const cancelBtn = document.getElementById("rider-cancel-btn");
  if (cancelBtn) cancelBtn.classList.remove("hidden");
}

function resetRiderForm() {
  document.getElementById("onboard-rider-form").reset();
  document.getElementById("rider-edit-id").value = "";
  document.getElementById("rider-submit-btn-text").innerText = "Onboard Rider";
  const cancelBtn = document.getElementById("rider-cancel-btn");
  if (cancelBtn) cancelBtn.classList.add("hidden");
}

async function deleteRider(riderId) {
  if (!confirm("Are you sure you want to permanently remove this delivery partner?")) return;

  if (supabase) {
    const { error } = await supabase.from("delivery_partners").delete().eq("id", riderId);
    if (error) {
      showToast(error.message, true);
    } else {
      showToast("Delivery partner removed from database.");
      await logAdminActivity("delete_rider", "delivery_partners", String(riderId));
      loadAdminData();
    }
  } else {
    dbData.riders = dbData.riders.filter(r => r.id !== riderId);
    showToast("Sandbox rider deleted.");
    loadAdminData();
  }
}

// EDIT / DELETE SHOP FUNCTIONS
function editShop(shopId) {
  const shop = dbData.shops.find(s => s.id === shopId);
  if (!shop) return;

  document.getElementById("shop-edit-id").value = shop.id;
  document.getElementById("shop-name").value = shop.shop_name;
  document.getElementById("shop-owner").value = shop.owner_name;
  document.getElementById("shop-mobile").value = shop.mobile;
  document.getElementById("shop-pincode").value = shop.pincode;
  document.getElementById("shop-address").value = shop.address;
  document.getElementById("shop-login-id").value = shop.shop_login_id;
  document.getElementById("shop-password").value = shop.shop_password || "";

  // Visual cues
  document.getElementById("shop-submit-btn-text").innerText = "Update Seller Hub";
  const cancelBtn = document.getElementById("shop-cancel-btn");
  if (cancelBtn) cancelBtn.classList.remove("hidden");
}

function resetShopForm() {
  document.getElementById("add-shop-form").reset();
  document.getElementById("shop-edit-id").value = "";
  document.getElementById("shop-submit-btn-text").innerText = "Register Hub";
  const cancelBtn = document.getElementById("shop-cancel-btn");
  if (cancelBtn) cancelBtn.classList.add("hidden");
}

async function deleteShop(shopId) {
  if (!confirm("Removing a Seller Hub is irreversible and will hide all associated catalog entries. Proceed?")) return;

  if (supabase) {
    const { error } = await supabase.from("shops").delete().eq("id", shopId);
    if (error) {
      showToast(error.message, true);
    } else {
      showToast("Seller Hub permanently deleted from network.");
      await logAdminActivity("delete_shop", "shops", String(shopId));
      loadAdminData();
    }
  } else {
    dbData.shops = dbData.shops.filter(s => s.id !== shopId);
    showToast("Sandbox shop deleted.");
    loadAdminData();
  }
}

// EDIT / DELETE ADMIN CATALOG PRODUCT FUNCTIONS
function editAdminProduct(prodId) {
  const prod = dbData.products.find(p => p.id === prodId);
  if (!prod) return;

  document.getElementById("admin-prod-edit-id").value = prod.id;
  document.getElementById("admin-prod-shop-id").value = prod.shop_id;
  document.getElementById("admin-prod-title").value = prod.title;
  document.getElementById("admin-prod-category").value = prod.category;
  document.getElementById("admin-prod-price").value = prod.shop_price;
  document.getElementById("admin-prod-markup").value = prod.commission_pct || 15;
  document.getElementById("admin-prod-stock").value = prod.stock_qty;
  document.getElementById("admin-prod-color").value = prod.color || "";
  document.getElementById("admin-prod-fabric").value = prod.fabric || "";
  document.getElementById("admin-prod-image").value = prod.image_url || "";
  document.getElementById("admin-prod-desc").value = prod.description || "";

  // Visual cues
  document.getElementById("admin-prod-submit-btn-text").innerText = "Update Product";
  const cancelBtn = document.getElementById("admin-prod-cancel-btn");
  if (cancelBtn) cancelBtn.classList.remove("hidden");
}

function resetAdminProductForm() {
  document.getElementById("admin-add-product-form").reset();
  document.getElementById("admin-prod-edit-id").value = "";
  document.getElementById("admin-prod-submit-btn-text").innerText = "Publish Product";
  const cancelBtn = document.getElementById("admin-prod-cancel-btn");
  if (cancelBtn) cancelBtn.classList.add("hidden");
}

async function deleteAdminProduct(prodId) {
  if (!confirm("Are you sure you want to permanently delete this product from the master catalog?")) return;

  if (supabase) {
    const { error } = await supabase.from("shopkeeper_products").delete().eq("id", prodId);
    if (error) {
      showToast(error.message, true);
    } else {
      showToast("Product deleted from catalog.");
      await logAdminActivity("delete_product", "shopkeeper_products", String(prodId));
      loadAdminData();
    }
  } else {
    dbData.products = dbData.products.filter(p => p.id !== prodId);
    showToast("Sandbox product deleted.");
    loadAdminData();
  }
}

// Bind admin CRUD utilities to window scope
window.editRider = editRider;
window.deleteRider = deleteRider;
window.resetRiderForm = resetRiderForm;
window.editShop = editShop;
window.deleteShop = deleteShop;
window.resetShopForm = resetShopForm;
window.editAdminProduct = editAdminProduct;
window.deleteAdminProduct = deleteAdminProduct;
window.resetAdminProductForm = resetAdminProductForm;

// SELLER METHODS
async function bumpProductVisibility(prodId) {
  if (supabase) {
    const { error } = await supabase.from("shopkeeper_products").update({ updated_at: new Date().toISOString() }).eq("id", prodId);
    if (error) {
      showToast(error.message, true);
    } else {
      showToast("Product listing visibility bumped higher on marketplace!");
      loadSellerData();
    }
  }
}

async function sellerProximityAssign(orderId) {
  if (supabase) {
    const { data: riders } = await supabase.from("delivery_partners").select("*").eq("active", true).eq("on_duty", true);
    if (!riders || riders.length === 0) {
      showToast("Proximity dispatch error: No riders currently on duty in regional hub.", true);
      return;
    }
    // Match base hub pincode
    let courier = riders.find(r => r.service_pincode === activeShop.pincode) || riders[0];
    const { error } = await supabase.from("seller_orders").update({
      delivery_partner_id: courier.id,
      delivery_partner_status: "assigned",
      partner_updated_at: new Date().toISOString()
    }).eq("id", orderId);

    if (error) {
      showToast(error.message, true);
    } else {
      showToast(`Matched regional hub dispatch courier: ${courier.full_name}`);
      loadSellerData();
    }
  }
}

async function sellerNextOrderStatus(orderId, currentStatus) {
  let next = "accepted";
  if (currentStatus === "pending") next = "accepted";
  else if (currentStatus === "accepted") next = "packed";
  else if (currentStatus === "packed") next = "out_for_delivery";
  else if (currentStatus === "out_for_delivery") next = "delivered";

  if (supabase) {
    const payload = { order_status: next };
    if (next === "accepted") {
      payload.accepted_at = new Date().toISOString();
      payload.delivery_otp = String(Math.floor(1000 + Math.random() * 9000));
    } else if (next === "packed") {
      payload.packed_at = new Date().toISOString();
    }

    const { error } = await supabase.from("seller_orders").update(payload).eq("id", orderId);
    if (error) {
      showToast(error.message, true);
    } else {
      showToast(`Order lifecycle changed to ${next}`);
      loadSellerData();
    }
  }
}

// PRINT SHIPPED CARGO A6 LABELS
function printCargoShippingLabel(orderId) {
  const order = dbData.orders.find(o => o.id === orderId);
  if (!order) return;

  // Hydrate invisible HTML template values
  document.getElementById("lbl-payment-mode").innerText = order.payment_mode || "COD";
  document.getElementById("lbl-customer-pincode").innerText = activeShop.pincode;
  document.getElementById("lbl-order-number").innerText = order.order_number;
  document.getElementById("lbl-customer-name").innerText = order.customer_name;
  document.getElementById("lbl-customer-address").innerText = order.customer_address;
  document.getElementById("lbl-customer-mobile").innerText = order.customer_mobile;
  document.getElementById("lbl-shop-name").innerText = activeShop.shop_name;
  document.getElementById("lbl-shop-address").innerText = activeShop.address;
  document.getElementById("lbl-order-total").innerText = formatRs(order.total);

  setTimeout(() => {
    const printContents = document.getElementById("a6-shipping-label").outerHTML;
    const win = window.open("", "_blank", "width=600,height=800");
    win.document.open();
    win.document.write(`
      <html>
        <head>
          <title>A6 Cargo Waybill Label - ${order.order_number}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;700;900&family=JetBrains+Mono&display=swap');
            body { font-family: 'Outfit', sans-serif; margin: 0; padding: 20px; background: #fff; color: #000; }
            .shipping-label { border: 4px solid #000; padding: 15px; width: 100%; max-width: 400px; margin: 0 auto; box-sizing: border-box; }
            .header { display: flex; justify-content: space-between; border-bottom: 3px solid #000; padding-bottom: 10px; margin-bottom: 10px; }
            .logo { font-size: 24px; font-weight: 900; text-transform: uppercase; letter-spacing: -0.5px; }
            .pay-badge { font-weight: 800; font-size: 16px; border: 3px solid #000; padding: 2px 8px; text-transform: uppercase; }
            .pincode { font-size: 32px; font-weight: 800; font-family: 'JetBrains Mono', monospace; text-align: center; border: 3px solid #000; padding: 5px; margin: 10px 0; }
            .field { margin-bottom: 8px; font-size: 13px; }
            .field label { font-weight: 700; text-transform: uppercase; font-size: 10px; color: #444; display: block; }
            .field strong { font-size: 14px; }
            .footer { border-top: 3px solid #000; padding-top: 10px; margin-top: 15px; display: flex; justify-content: space-between; align-items: center; }
            .qr-box img { width: 80px; height: 80px; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          ${printContents}
        </body>
      </html>
    `);
    win.document.close();
  }, 100);
}

// Log admin action tracking
async function logAdminActivity(action, entityType, entityId, payload = {}) {
  if (supabase) {
    try {
      await supabase.from("admin_activity_logs").insert({
        admin_username: "local_live_server",
        action,
        entity_type: entityType,
        entity_id: entityId,
        payload
      });
    } catch (_) {}
  }
}

// ----------------------------------------------------
// UTILITY HELPERS
// ----------------------------------------------------

function formatRs(value) {
  const num = typeof value === "string" ? Number(value) : value;
  return `₹${Math.round(num || 0).toLocaleString("en-IN")}`;
}

function showToast(message, isError = false) {
  const bubble = document.getElementById("toast-bubble");
  const msgText = document.getElementById("toast-message");

  msgText.innerText = message;
  bubble.className = `fixed bottom-6 right-6 px-5 py-3 rounded-2xl text-white text-xs font-bold shadow-2xl z-50 flex items-center gap-2 max-w-sm transition-all duration-300 ${
    isError ? "bg-red-500" : "bg-slate-900 dark:bg-slate-800"
  }`;
  
  bubble.classList.remove("hidden");
  setTimeout(() => {
    bubble.classList.add("hidden");
  }, 4000);
}

// ----------------------------------------------------
// SECURITY LOGIN & OPERATIONS LOGGING HELPERS
// ----------------------------------------------------

async function logLoginActivity(username, role, status, payload = {}) {
  const userAgent = navigator.userAgent;
  const newLog = {
    admin_username: username,
    action: "login",
    entity_type: "session",
    entity_id: role,
    payload: {
      status: status,
      user_agent: userAgent,
      logged_at: new Date().toISOString(),
      ...payload
    }
  };

  if (supabase) {
    try {
      await supabase.from("admin_activity_logs").insert(newLog);
    } catch (e) {
      console.error("Database logging failed:", e);
    }
  }

  // Fallback / in-memory list insert
  const simulatedLog = {
    id: Date.now() + Math.random(),
    admin_username: username,
    action: "login",
    entity_type: "session",
    entity_id: role,
    payload: {
      status: status,
      user_agent: userAgent,
      logged_at: new Date().toISOString(),
      ...payload
    },
    created_at: new Date().toISOString()
  };
  dbData.logs.unshift(simulatedLog);
}

// ----------------------------------------------------
// LIVE SYSTEM REPORTS & AUDITING CONTROL
// ----------------------------------------------------

function switchActiveReport(reportId) {
  // Update tabs visual active states
  document.querySelectorAll(".report-tab-btn").forEach((btn) => {
    btn.className = "report-tab-btn px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-all";
  });
  
  const activeBtn = document.getElementById(`rep-tab-${reportId}`);
  if (activeBtn) {
    activeBtn.className = "report-tab-btn px-3 py-1.5 rounded-lg text-xs font-bold bg-brand-500 text-white shadow-sm cursor-pointer transition-all";
  }

  // Hide all sub report views
  document.querySelectorAll(".report-window").forEach((win) => {
    win.classList.add("hidden");
    win.classList.remove("block");
  });

  const activeWin = document.getElementById(`report-window-${reportId}`);
  if (activeWin) {
    activeWin.classList.remove("hidden");
    activeWin.classList.add("block");
  }

  // Render report details
  renderReportData(reportId);
}

async function refreshReportData() {
  const loader = document.getElementById("admin-loading");
  if (loader) loader.classList.remove("hidden");
  
  await loadAdminData();
  
  if (loader) loader.classList.add("hidden");
  
  const activeReportBtn = document.querySelector(".report-tab-btn.bg-brand-500");
  if (activeReportBtn) {
    const reportId = activeReportBtn.id.replace("rep-tab-", "");
    renderReportData(reportId);
  }
}

function renderReportData(reportId) {
  if (reportId === "activity") {
    populateActivityReport();
  } else if (reportId === "delivery") {
    populateDeliveryReport();
  } else if (reportId === "logins") {
    populateLoginsReport();
  } else if (reportId === "sales") {
    populateSalesReport();
  } else if (reportId === "visibility") {
    populateVisibilityReport();
  }
}

function populateActivityReport() {
  const tbody = document.getElementById("report-activity-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  // Strictly filter out "login" events for operation audit logs
  const workLogs = dbData.logs.filter(log => log.action !== "login");

  if (workLogs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-6 text-slate-400 text-xs">No administrative operations recorded yet.</td></tr>`;
    return;
  }

  workLogs.forEach((log) => {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-slate-50/50 dark:hover:bg-slate-800/30";
    
    const formattedDate = new Date(log.created_at).toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short"
    });

    const payloadString = log.payload ? JSON.stringify(log.payload) : "{}";

    tr.innerHTML = `
      <td class="px-4 py-3 whitespace-nowrap text-slate-500 font-mono text-[11px]">${formattedDate}</td>
      <td class="px-4 py-3 whitespace-nowrap font-bold text-indigo-600 dark:text-indigo-400 font-mono">${log.admin_username}</td>
      <td class="px-4 py-3 whitespace-nowrap font-bold text-slate-800 dark:text-slate-100 uppercase text-[10px]"><span class="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg">${log.action}</span></td>
      <td class="px-4 py-3 whitespace-nowrap text-slate-600 font-mono text-[11px]">${log.entity_type}</td>
      <td class="px-4 py-3 whitespace-nowrap text-slate-700 font-mono font-bold">#${log.entity_id || 'NA'}</td>
      <td class="px-4 py-3 text-slate-500 font-mono text-[10px] truncate max-w-xs" title="${payloadString}">${payloadString}</td>
    `;
    tbody.appendChild(tr);
  });
}

function populateDeliveryReport() {
  const tbody = document.getElementById("report-delivery-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  // Filter orders with couriers, in-transit or delivered
  const deliveryOrders = dbData.orders.filter(o => o.delivery_partner_id || o.order_status === "out_for_delivery" || o.order_status === "delivered");

  if (deliveryOrders.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-6 text-slate-400 text-xs">No active rider deliveries registered.</td></tr>`;
    return;
  }

  deliveryOrders.forEach((order) => {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-slate-50/50 dark:hover:bg-slate-800/30";
    
    const rider = dbData.riders.find(r => r.id === order.delivery_partner_id);
    const riderName = rider ? `${rider.full_name} (ID #${rider.id})` : `Rider ID #${order.delivery_partner_id || 'Unassigned'}`;
    
    const shop = dbData.shops.find(s => s.id === order.shop_id);
    const shopDetails = shop ? `${shop.shop_name} (${shop.pincode})` : `Hub Shop #${order.shop_id}`;

    const formattedDate = order.partner_updated_at || order.delivered_at || order.created_at;
    const dateStr = formattedDate ? new Date(formattedDate).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) + " (" + new Date(formattedDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) + ")" : "N/A";

    let statusColor = "bg-amber-50 text-amber-700";
    if (order.order_status === "delivered") statusColor = "bg-emerald-50 text-emerald-700";
    else if (order.order_status === "out_for_delivery") statusColor = "bg-indigo-50 text-indigo-700";

    tr.innerHTML = `
      <td class="px-4 py-3 whitespace-nowrap font-bold text-slate-800 dark:text-slate-200">${riderName}</td>
      <td class="px-4 py-3 whitespace-nowrap font-mono font-bold text-brand-500">${order.order_number}</td>
      <td class="px-4 py-3 text-slate-600 font-semibold max-w-[150px] truncate" title="${shopDetails}">${shopDetails}</td>
      <td class="px-4 py-3 text-slate-600 max-w-[200px] truncate" title="${order.customer_address}">
        <strong>${order.customer_name}</strong><br>
        <span class="text-slate-400 text-[11px]">${order.customer_address}</span>
      </td>
      <td class="px-4 py-3 whitespace-nowrap">
        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${statusColor}">${order.order_status.toUpperCase()}</span>
      </td>
      <td class="px-4 py-3 whitespace-nowrap font-mono font-bold text-emerald-600">${order.delivery_otp || 'N/A'}</td>
      <td class="px-4 py-3 whitespace-nowrap text-slate-400 text-[11px] font-mono">${dateStr}</td>
    `;
    tbody.appendChild(tr);
  });
}

function populateLoginsReport() {
  const tbody = document.getElementById("report-logins-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  const loginLogs = dbData.logs.filter(log => log.action === "login");

  if (loginLogs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center py-6 text-slate-400 text-xs">No logins recorded in session history.</td></tr>`;
    return;
  }

  loginLogs.forEach((log) => {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-slate-50/50 dark:hover:bg-slate-800/30";

    const formattedDate = new Date(log.created_at).toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "medium"
    });

    const role = log.entity_id ? log.entity_id.toUpperCase() : "UNKNOWN";
    let roleColor = "bg-slate-100 text-slate-700";
    if (role === "ADMIN") roleColor = "bg-red-50 text-red-700 dark:bg-red-950/20";
    else if (role === "SELLER") roleColor = "bg-brand-50 text-brand-700 dark:bg-brand-950/20";

    const details = log.payload || {};
    const shopName = details.shop_name ? ` • ${details.shop_name}` : "";
    const userAgent = details.user_agent || "N/A";

    tr.innerHTML = `
      <td class="px-4 py-3 whitespace-nowrap text-slate-500 text-[11px]">${formattedDate}</td>
      <td class="px-4 py-3 whitespace-nowrap font-bold text-slate-800 dark:text-slate-100">${log.admin_username}${shopName}</td>
      <td class="px-4 py-3 whitespace-nowrap">
        <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold tracking-wider ${roleColor}">${role}</span>
      </td>
      <td class="px-4 py-3 text-slate-500 text-[11px] max-w-xs truncate" title="${userAgent}">${userAgent}</td>
      <td class="px-4 py-3 whitespace-nowrap text-emerald-600 font-bold uppercase text-[10px]">AUTHORIZED OK</td>
    `;
    tbody.appendChild(tr);
  });
}

function populateSalesReport() {
  const tbody = document.getElementById("report-sales-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  const salesOrders = dbData.orders;

  if (salesOrders.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-slate-400 text-xs">No sales orders generated yet.</td></tr>`;
    const totalQtyEl = document.getElementById("sales-stat-total-qty");
    const totalRevEl = document.getElementById("sales-stat-total-rev");
    const avgBasketEl = document.getElementById("sales-stat-avg-basket");
    const topCatEl = document.getElementById("sales-stat-top-cat");
    if (totalQtyEl) totalQtyEl.innerText = "0 Pcs";
    if (totalRevEl) totalRevEl.innerText = "₹0";
    if (avgBasketEl) avgBasketEl.innerText = "₹0";
    if (topCatEl) topCatEl.innerText = "N/A";
    return;
  }

  let totalQty = 0;
  let totalRevenue = 0;
  const categoriesMap = {};

  salesOrders.forEach((order) => {
    totalQty += Number(order.qty || 1);
    totalRevenue += Number(order.total || 0);

    const prod = dbData.products.find(p => p.title === order.product_title);
    const cat = prod ? prod.category : "Jeans & Denims";
    categoriesMap[cat] = (categoriesMap[cat] || 0) + Number(order.qty || 1);
  });

  const avgBasket = totalRevenue / salesOrders.length;
  
  let topCat = "Jeans & Denims";
  let topCatQty = 0;
  for (const [c, q] of Object.entries(categoriesMap)) {
    if (q > topCatQty) {
      topCatQty = q;
      topCat = c;
    }
  }

  const totalQtyEl = document.getElementById("sales-stat-total-qty");
  const totalRevEl = document.getElementById("sales-stat-total-rev");
  const avgBasketEl = document.getElementById("sales-stat-avg-basket");
  const topCatEl = document.getElementById("sales-stat-top-cat");
  if (totalQtyEl) totalQtyEl.innerText = `${totalQty} Pcs`;
  if (totalRevEl) totalRevEl.innerText = formatRs(totalRevenue);
  if (avgBasketEl) avgBasketEl.innerText = formatRs(avgBasket);
  if (topCatEl) topCatEl.innerText = topCat;

  salesOrders.forEach((order) => {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-slate-50/50 dark:hover:bg-slate-800/30";

    const prod = dbData.products.find(p => p.title === order.product_title);
    const cat = prod ? prod.category : "Jeans & Denims";
    
    const shop = dbData.shops.find(s => s.id === order.shop_id);
    const shopName = shop ? shop.shop_name : `Hub Shop #${order.shop_id}`;
    const pincode = shop ? shop.pincode : order.customer_pincode || "110001";

    const formattedDate = new Date(order.created_at).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });

    tr.innerHTML = `
      <td class="px-4 py-3 whitespace-nowrap text-slate-500 font-mono text-[11px]">${formattedDate}</td>
      <td class="px-4 py-3 whitespace-nowrap font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
        <i data-lucide="shirt" class="w-3.5 h-3.5 text-violet-500"></i> ${order.product_title}
      </td>
      <td class="px-4 py-3 whitespace-nowrap"><span class="px-2 py-0.5 bg-violet-50 dark:bg-violet-950/20 text-violet-700 dark:text-violet-400 rounded-full text-[10px] font-bold">${cat}</span></td>
      <td class="px-4 py-3 whitespace-nowrap text-slate-600 font-semibold">${shopName}</td>
      <td class="px-4 py-3 whitespace-nowrap font-mono font-bold text-slate-500">${pincode}</td>
      <td class="px-4 py-3 whitespace-nowrap text-center font-bold text-slate-800 dark:text-slate-200">${order.qty || 1}</td>
      <td class="px-4 py-3 whitespace-nowrap font-bold text-emerald-500">${formatRs(order.total)}</td>
      <td class="px-4 py-3 text-slate-500 text-[11px] max-w-xs truncate" title="${order.customer_address}">${order.customer_address}</td>
    `;
    tbody.appendChild(tr);
  });
  lucide.createIcons();
}

function populateVisibilityReport() {
  const shopsBody = document.getElementById("report-shops-visibility-body");
  if (!shopsBody) return;
  shopsBody.innerHTML = "";

  if (dbData.shops.length === 0) {
    shopsBody.innerHTML = `<tr><td colspan="6" class="text-center py-6 text-slate-400 text-xs">No shops registered.</td></tr>`;
  } else {
    dbData.shops.forEach((shop) => {
      const tr = document.createElement("tr");
      tr.className = "hover:bg-slate-50/50 dark:hover:bg-slate-800/30";

      // Shop is visible if 'is_visible' is true, or if 'is_visible' is undefined and status is active
      const isVisible = shop.is_visible !== undefined ? shop.is_visible : (shop.status === "active");

      const statusBadge = isVisible
        ? `<span class="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-bold uppercase">● Online & Open</span>`
        : `<span class="px-2.5 py-0.5 bg-rose-50 text-rose-700 rounded-full text-[10px] font-bold uppercase">○ Offline & Closed</span>`;

      const hours = shop.working_hours || "09:00 AM - 09:00 PM";

      tr.innerHTML = `
        <td class="px-4 py-3 whitespace-nowrap">
          <strong class="text-slate-800 dark:text-slate-100">${shop.shop_name}</strong><br>
          <span class="text-slate-400 text-[11px]">${shop.address}</span>
        </td>
        <td class="px-4 py-3 whitespace-nowrap">
          <span class="text-slate-700">${shop.owner_name}</span><br>
          <span class="text-slate-400 text-[11px] font-mono">${shop.mobile}</span>
        </td>
        <td class="px-4 py-3 whitespace-nowrap font-mono font-bold text-slate-500">${shop.pincode}</td>
        <td class="px-4 py-3 whitespace-nowrap text-slate-600 font-mono text-[11px]">${hours}</td>
        <td class="px-4 py-3 whitespace-nowrap">${statusBadge}</td>
        <td class="px-4 py-3 whitespace-nowrap text-center">
          <label class="relative inline-flex items-center cursor-pointer justify-center">
            <input type="checkbox" class="sr-only peer" ${isVisible ? 'checked' : ''} onchange="toggleShopVisibility(${shop.id}, this.checked)">
            <div class="w-9 h-5 bg-slate-200 peer-focus:outline-none dark:bg-slate-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
          </label>
        </td>
      `;
      shopsBody.appendChild(tr);
    });
  }

  const ridersBody = document.getElementById("report-riders-visibility-body");
  if (!ridersBody) return;
  ridersBody.innerHTML = "";

  if (dbData.riders.length === 0) {
    ridersBody.innerHTML = `<tr><td colspan="6" class="text-center py-6 text-slate-400 text-xs">No delivery partners onboarded.</td></tr>`;
  } else {
    dbData.riders.forEach((rider) => {
      const tr = document.createElement("tr");
      tr.className = "hover:bg-slate-50/50 dark:hover:bg-slate-800/30";

      const isOnDuty = rider.on_duty;
      const statusBadge = isOnDuty
        ? `<span class="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-bold uppercase">● On Duty</span>`
        : `<span class="px-2.5 py-0.5 bg-slate-100 text-slate-600 dark:bg-slate-800 rounded-full text-[10px] font-bold uppercase">○ Off Duty (Shift Closed)</span>`;

      tr.innerHTML = `
        <td class="px-4 py-3 whitespace-nowrap font-bold text-slate-800 dark:text-slate-100">${rider.full_name}</td>
        <td class="px-4 py-3 whitespace-nowrap font-mono text-slate-500">${rider.phone}</td>
        <td class="px-4 py-3 whitespace-nowrap font-mono text-[11px] text-slate-600">${rider.vehicle_no || 'NA'}</td>
        <td class="px-4 py-3 whitespace-nowrap font-mono font-bold text-slate-500">${rider.service_pincode}</td>
        <td class="px-4 py-3 whitespace-nowrap">${statusBadge}</td>
        <td class="px-4 py-3 whitespace-nowrap text-center">
          <label class="relative inline-flex items-center cursor-pointer justify-center">
            <input type="checkbox" class="sr-only peer" ${isOnDuty ? 'checked' : ''} onchange="toggleRiderVisibility(${rider.id}, this.checked)">
            <div class="w-9 h-5 bg-slate-200 peer-focus:outline-none dark:bg-slate-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
          </label>
        </td>
      `;
      ridersBody.appendChild(tr);
    });
  }
}

async function toggleShopVisibility(shopId, isVisible) {
  if (supabase) {
    try {
      const { error } = await supabase.from("shops").update({ 
        is_visible: isVisible,
        status: isVisible ? "active" : "inactive" 
      }).eq("id", shopId);
      
      if (error) {
        // Fallback for custom schema
        const { error: err2 } = await supabase.from("shops").update({ 
          status: isVisible ? "active" : "inactive" 
        }).eq("id", shopId);
        
        if (err2) {
          showToast(err2.message, true);
          return;
        }
      }
      
      showToast(`Shop visibility set to: ${isVisible ? "OPEN & VISIBLE" : "CLOSED & INVISIBLE"}`);
      await logAdminActivity("toggle_shop_visibility", "shops", String(shopId), { is_visible: isVisible });
      await loadAdminData();
    } catch (e) {
      showToast(e.message, true);
    }
  } else {
    const shop = dbData.shops.find(s => s.id === shopId);
    if (shop) {
      shop.is_visible = isVisible;
      shop.status = isVisible ? "active" : "inactive";
      showToast(`[Sandbox] Shop visibility set to: ${isVisible ? "OPEN" : "CLOSED"}`);
      await loadAdminData();
    }
  }
}

async function toggleRiderVisibility(riderId, onDuty) {
  if (supabase) {
    const { error } = await supabase.from("delivery_partners").update({ on_duty: onDuty }).eq("id", riderId);
    if (error) {
      showToast(error.message, true);
    } else {
      showToast(`Rider duty shifted to: ${onDuty ? "ON SHIFT" : "OFF SHIFT (Hours Over)"}`);
      await logAdminActivity("toggle_rider_duty", "delivery_partners", String(riderId), { on_duty: onDuty });
      await loadAdminData();
    }
  } else {
    const rider = dbData.riders.find(r => r.id === riderId);
    if (rider) {
      rider.on_duty = onDuty;
      showToast(`[Sandbox] Rider shift set to: ${onDuty ? "ON SHIFT" : "OFF SHIFT"}`);
      await loadAdminData();
    }
  }
}

// Expose functions globally for dynamic elements inline clicks
window.switchActiveReport = switchActiveReport;
window.refreshReportData = refreshReportData;
window.toggleShopVisibility = toggleShopVisibility;
window.toggleRiderVisibility = toggleRiderVisibility;

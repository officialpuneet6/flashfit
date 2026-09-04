(function () {
  const SUPABASE_URL = "https://ydbmdiywsalkkxrqzjtx.supabase.co";
  const SUPABASE_KEY = "sb_publishable_udYL-2aM5WhzB5tu_gb4sA_RHnQC8Au";
  const MONEY = (value) => `Rs ${Math.round(Number(value || 0)).toLocaleString("en-IN")}`;

  let db = null;
  let visibilityProducts = [];
  let categoryRows = [];
  let shopRows = [];
  let applyingCatalogRules = false;
  let catalogTimer = null;

  function getDb() {
    if (db) return db;
    if (window.flashfitDB?.getSupabaseClient) db = window.flashfitDB.getSupabaseClient();
    if (!db && window.supabase?.from) db = window.supabase;
    if (!db && typeof window.supabase?.createClient === "function") db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    if (!db && window.FLASHFIT_NOTIFICATION_CONFIG && typeof window.supabase?.createClient === "function") {
      db = window.supabase.createClient(
        window.FLASHFIT_NOTIFICATION_CONFIG.supabaseUrl,
        window.FLASHFIT_NOTIFICATION_CONFIG.supabaseKey
      );
    }
    return db;
  }

  function clean(value) {
    return String(value ?? "").replace(/[<>]/g, "").trim();
  }

  function bool(value) {
    return value === true || value === "true";
  }

  function num(value, fallback = 999) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function nowMs() {
    return Date.now();
  }

  function isWithinSchedule(row) {
    const from = row.visible_from ? new Date(row.visible_from).getTime() : null;
    const until = row.visible_until ? new Date(row.visible_until).getTime() : null;
    const now = nowMs();
    if (from && from > now) return false;
    if (until && until < now) return false;
    return true;
  }

  function productBadge(row) {
    if (bool(row.is_featured)) return "FEATURED";
    if (bool(row.is_trending)) return "TRENDING";
    if (bool(row.is_new_arrival)) return "NEW";
    if (bool(row.is_best_seller)) return "BEST SELLER";
    if (bool(row.is_recommended)) return "RECOMMENDED";
    return "";
  }

  function productRank(row, shopPriority = 999, searchActive = false) {
    return [
      bool(row.is_featured) ? 0 : 1,
      bool(row.is_trending) ? 0 : 1,
      bool(row.is_new_arrival) ? 0 : 1,
      bool(row.is_best_seller) ? 0 : 1,
      bool(row.is_recommended) ? 0 : 1,
      searchActive ? num(row.search_priority) : 999,
      num(row.visibility_priority),
      num(row.visibility_sort_order),
      num(shopPriority),
      -num(row.id, 0)
    ];
  }

  function compareRank(a, b, shops, searchActive) {
    const ar = productRank(a, shops.get(Number(a.shop_id)) ?? 999, searchActive);
    const br = productRank(b, shops.get(Number(b.shop_id)) ?? 999, searchActive);
    for (let i = 0; i < ar.length; i += 1) {
      if (ar[i] !== br[i]) return ar[i] - br[i];
    }
    return 0;
  }

  function toast(message, isError = false) {
    if (typeof window.showToast === "function") return window.showToast(message, isError);
    const el = document.getElementById("ffVisibilityToast") || document.createElement("div");
    el.id = "ffVisibilityToast";
    el.textContent = message;
    el.style.cssText = `position:fixed;right:18px;bottom:18px;z-index:99999;padding:12px 14px;border-radius:12px;color:#fff;font:800 12px Inter,Arial;background:${isError ? "#dc2626" : "#16a34a"};box-shadow:0 16px 40px rgba(0,0,0,.22)`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }

  async function updateProduct(id, payload) {
    const client = getDb();
    if (!client) return toast("Supabase not ready.", true);
    const { error } = await client.from("shopkeeper_products").update(payload).eq("id", id);
    if (error) return toast(error.message, true);
    const row = visibilityProducts.find((item) => Number(item.id) === Number(id));
    if (row) Object.assign(row, payload);
    toast("Product visibility saved.");
    renderVisibilityTable();
    renderHomepageSections();
  }

  async function saveSortOrder() {
    const client = getDb();
    const rows = [...document.querySelectorAll("[data-ff-prod-row]")];
    const updates = rows.map((row, index) => ({
      id: Number(row.dataset.ffProdRow),
      visibility_sort_order: index + 1
    }));
    for (const item of updates) {
      await client.from("shopkeeper_products").update({ visibility_sort_order: item.visibility_sort_order }).eq("id", item.id);
      const product = visibilityProducts.find((row) => Number(row.id) === item.id);
      if (product) product.visibility_sort_order = item.visibility_sort_order;
    }
    toast("Drag order saved.");
    renderVisibilityTable();
    renderHomepageSections();
  }

  async function saveCategoryOrder() {
    const client = getDb();
    const rows = [...document.querySelectorAll("[data-ff-cat-row]")];
    for (const [index, row] of rows.entries()) {
      await client
        .from("product_category_priorities")
        .upsert({
          slug: row.dataset.ffCatRow,
          label: row.dataset.ffCatLabel || row.dataset.ffCatRow,
          sort_order: index + 1,
          is_visible: row.querySelector("[data-ff-cat-visible]")?.checked !== false,
          updated_at: new Date().toISOString()
        }, { onConflict: "slug" });
    }
    toast("Category order saved.");
    await loadVisibilityData();
  }

  async function updateShopPriority(shopId, value) {
    const client = getDb();
    const { error } = await client.from("shops").update({ visibility_priority: num(value) }).eq("id", shopId);
    if (error) return toast(error.message, true);
    const shop = shopRows.find((row) => Number(row.id) === Number(shopId));
    if (shop) shop.visibility_priority = num(value);
    toast("Shop priority saved.");
  }

  async function loadVisibilityData() {
    const client = getDb();
    if (!client) return;
    const [productsResult, catsResult, shopsResult] = await Promise.all([
      client.from("shopkeeper_products").select("*").order("visibility_sort_order", { ascending: true }).order("id", { ascending: false }).limit(500),
      client.from("product_category_priorities").select("*").order("sort_order", { ascending: true }),
      client.from("shops").select("id,shop_name,visibility_priority,pincode,status").order("visibility_priority", { ascending: true }).limit(200)
    ]);
    if (productsResult.error) {
      toast(`${productsResult.error.message}. Run database-product-visibility.sql first.`, true);
      return;
    }
    visibilityProducts = productsResult.data || [];
    categoryRows = catsResult.data || [];
    shopRows = shopsResult.data || [];
    renderVisibilityTable();
    renderHomepageSections();
    renderCategoryTable();
    renderShopPriorityTable();
  }

  function injectAdminTab() {
    if (!location.pathname.toLowerCase().includes("admin-panel")) return;
    if (document.getElementById("ffVisibilityTabBtn")) return;
    const nav = document.querySelector("#admin-view [class*='border-b']");
    const adminView = document.getElementById("admin-view");
    if (!nav || !adminView) return;

    const btn = document.createElement("button");
    btn.id = "ffVisibilityTabBtn";
    btn.type = "button";
    btn.dataset.adminTab = "visibility";
    btn.className = "admin-tab-btn px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer";
    btn.innerHTML = '<span>Visibility</span>';
    nav.appendChild(btn);

    const panel = document.createElement("div");
    panel.id = "admin-panel-visibility";
    panel.className = "admin-tab-window hidden flex flex-col gap-5";
    panel.innerHTML = `
      <section class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        <div class="p-5 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h3 class="text-lg font-black font-display">Product Visibility & Ranking</h3>
            <p class="text-xs text-slate-500">Manual admin order wins over automatic ranking. Drag rows to save display order.</p>
          </div>
          <div class="flex flex-wrap gap-2">
            <input id="ffVisibilitySearch" type="search" placeholder="Search product..." class="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs focus:outline-none">
            <button id="ffVisibilityRefresh" class="bg-brand-500 text-white text-xs font-bold px-4 py-2 rounded-xl">Refresh</button>
          </div>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-50 dark:bg-slate-950 text-slate-400 uppercase">
              <tr>
                <th class="px-4 py-3">Sort</th>
                <th class="px-4 py-3">Product</th>
                <th class="px-4 py-3">Visibility</th>
                <th class="px-4 py-3">Priority</th>
                <th class="px-4 py-3">Flags</th>
                <th class="px-4 py-3">Schedule</th>
                <th class="px-4 py-3">Save</th>
              </tr>
            </thead>
            <tbody id="ffVisibilityTbody" class="divide-y divide-slate-100 dark:divide-slate-800"></tbody>
          </table>
        </div>
      </section>
      <section class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        <div class="p-5 border-b border-slate-100 dark:border-slate-800">
          <h3 class="font-black font-display">Homepage Sections</h3>
          <p class="text-xs text-slate-500">Drag products inside each section to control the customer homepage order.</p>
        </div>
        <div id="ffHomepageSections" class="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3"></div>
      </section>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <section class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
          <div class="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div><h3 class="font-black font-display">Category Priority</h3><p class="text-xs text-slate-500">Drag categories to set storefront order.</p></div>
            <button id="ffSaveCategoryOrder" class="bg-brand-500 text-white text-xs font-bold px-4 py-2 rounded-xl">Save</button>
          </div>
          <div id="ffCategoryPriorityList" class="p-4 grid gap-2"></div>
        </section>
        <section class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
          <div class="p-5 border-b border-slate-100 dark:border-slate-800">
            <h3 class="font-black font-display">Shop Priority</h3>
            <p class="text-xs text-slate-500">Lower number means products from that shop rank earlier when product order is equal.</p>
          </div>
          <div id="ffShopPriorityList" class="p-4 grid gap-2"></div>
        </section>
      </div>
    `;
    adminView.appendChild(panel);

    btn.addEventListener("click", () => {
      document.querySelectorAll(".admin-tab-btn").forEach((item) => {
        item.className = "admin-tab-btn px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer";
      });
      btn.className = "admin-tab-btn px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all bg-brand-500 text-white shadow-md cursor-pointer";
      document.querySelectorAll(".admin-tab-window").forEach((item) => {
        item.classList.add("hidden");
        item.classList.remove("block", "grid", "flex");
      });
      panel.classList.remove("hidden");
      panel.classList.add("flex");
      loadVisibilityData();
    });
    panel.querySelector("#ffVisibilityRefresh").addEventListener("click", loadVisibilityData);
    panel.querySelector("#ffVisibilitySearch").addEventListener("input", renderVisibilityTable);
    panel.querySelector("#ffSaveCategoryOrder").addEventListener("click", saveCategoryOrder);
  }

  function renderVisibilityTable() {
    const tbody = document.getElementById("ffVisibilityTbody");
    if (!tbody) return;
    const term = clean(document.getElementById("ffVisibilitySearch")?.value).toLowerCase();
    const shops = new Map(shopRows.map((shop) => [Number(shop.id), shop]));
    const rows = visibilityProducts
      .filter((row) => !term || [row.title, row.category, row.id].join(" ").toLowerCase().includes(term))
      .sort((a, b) => compareRank(a, b, new Map(shopRows.map((shop) => [Number(shop.id), num(shop.visibility_priority)])), false));

    tbody.innerHTML = rows.map((row, index) => {
      const shop = shops.get(Number(row.shop_id));
      return `
        <tr draggable="true" data-ff-prod-row="${row.id}" class="hover:bg-slate-50 dark:hover:bg-slate-950/60">
          <td class="px-4 py-3 align-top"><span class="cursor-grab text-slate-400">☰</span><div class="text-[10px] text-slate-400 mt-1">#${index + 1}</div></td>
          <td class="px-4 py-3 align-top min-w-[220px]">
            <div class="font-bold text-slate-800 dark:text-slate-100">${clean(row.title || "Untitled")}</div>
            <div class="text-slate-400 mt-1">ID #${row.id} • ${clean(row.category || "-")} • ${clean(shop?.shop_name || `Shop ${row.shop_id || "-"}`)}</div>
            <div class="text-brand-500 font-bold mt-1">${MONEY(row.customer_price || row.price || 0)}</div>
          </td>
          <td class="px-4 py-3 align-top">
            <label class="inline-flex items-center gap-2 font-bold"><input type="checkbox" data-ff-visible ${row.is_visible !== false ? "checked" : ""}> Show</label>
          </td>
          <td class="px-4 py-3 align-top">
            <div class="grid gap-2 min-w-[110px]">
              <input data-ff-priority type="number" min="1" value="${num(row.visibility_priority)}" class="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2 py-1">
              <input data-ff-search-priority type="number" min="1" value="${num(row.search_priority)}" class="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2 py-1" title="Search priority">
            </div>
          </td>
          <td class="px-4 py-3 align-top min-w-[170px]">
            ${flagInput("featured", row.is_featured, "Featured")}
            ${flagInput("trending", row.is_trending, "Trending")}
            ${flagInput("new", row.is_new_arrival, "New Arrival")}
            ${flagInput("best", row.is_best_seller, "Best Seller")}
            ${flagInput("recommended", row.is_recommended, "Recommended")}
          </td>
          <td class="px-4 py-3 align-top min-w-[180px]">
            <input data-ff-from type="datetime-local" value="${datetimeLocal(row.visible_from)}" class="mb-2 w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2 py-1">
            <input data-ff-until type="datetime-local" value="${datetimeLocal(row.visible_until)}" class="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2 py-1">
          </td>
          <td class="px-4 py-3 align-top">
            <button data-ff-save-product="${row.id}" class="bg-brand-500 hover:bg-brand-600 text-white font-bold px-3 py-2 rounded-lg">Save</button>
          </td>
        </tr>
      `;
    }).join("") || `<tr><td colspan="7" class="px-4 py-8 text-center text-slate-400">No products found.</td></tr>`;

    wireProductRows();
  }

  function flagInput(key, checked, label) {
    return `<label class="flex items-center gap-2 mb-1"><input type="checkbox" data-ff-flag="${key}" ${checked ? "checked" : ""}><span>${label}</span></label>`;
  }

  function sectionConfig() {
    return [
      { key: "is_featured", title: "Featured" },
      { key: "is_trending", title: "Trending" },
      { key: "is_recommended", title: "Recommended" },
      { key: "is_new_arrival", title: "New Arrival" },
      { key: "is_best_seller", title: "Best Seller" }
    ];
  }

  function renderHomepageSections() {
    const shell = document.getElementById("ffHomepageSections");
    if (!shell) return;
    shell.innerHTML = sectionConfig().map((section) => {
      const products = visibilityProducts
        .filter((row) => row[section.key])
        .sort((a, b) => num(a.visibility_sort_order) - num(b.visibility_sort_order));
      return `
        <div class="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3">
          <div class="flex items-center justify-between gap-2 mb-3">
            <strong class="text-sm">${section.title}</strong>
            <span class="text-[10px] font-black text-slate-400">${products.length}</span>
          </div>
          <div data-ff-section-list="${section.key}" class="grid gap-2 min-h-[52px]">
            ${products.map((row) => `
              <div draggable="true" data-ff-section-product="${row.id}" class="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-2 cursor-grab">
                <strong class="block truncate text-xs">${clean(row.title || "Untitled")}</strong>
                <small class="text-slate-400">#${row.id} - ${clean(row.category || "-")}</small>
              </div>
            `).join("") || `<div class="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 px-3 py-4 text-center text-xs text-slate-400">No products selected</div>`}
          </div>
        </div>
      `;
    }).join("");
    wireHomepageSections();
  }

  function wireHomepageSections() {
    let dragged = null;
    document.querySelectorAll("[data-ff-section-product]").forEach((item) => {
      item.addEventListener("dragstart", () => {
        dragged = item;
        item.classList.add("opacity-50");
      });
      item.addEventListener("dragend", async () => {
        item.classList.remove("opacity-50");
        await saveHomepageSectionOrder(item.closest("[data-ff-section-list]"));
        dragged = null;
      });
    });
    document.querySelectorAll("[data-ff-section-list]").forEach((list) => {
      list.addEventListener("dragover", (event) => {
        event.preventDefault();
        if (!dragged || dragged.parentElement !== list) return;
        const target = event.target.closest("[data-ff-section-product]");
        if (!target || target === dragged) return;
        const box = target.getBoundingClientRect();
        list.insertBefore(dragged, event.clientY > box.top + box.height / 2 ? target.nextSibling : target);
      });
    });
  }

  async function saveHomepageSectionOrder(list) {
    const client = getDb();
    if (!client || !list) return;
    const rows = [...list.querySelectorAll("[data-ff-section-product]")];
    for (const [index, item] of rows.entries()) {
      const id = Number(item.dataset.ffSectionProduct);
      const value = index + 1;
      await client.from("shopkeeper_products").update({ visibility_sort_order: value }).eq("id", id);
      const product = visibilityProducts.find((row) => Number(row.id) === id);
      if (product) product.visibility_sort_order = value;
    }
    toast(`${list.dataset.ffSectionList.replace("is_", "").replace("_", " ")} order saved.`);
    renderVisibilityTable();
  }

  function datetimeLocal(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
  }

  function fromDatetimeLocal(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  function wireProductRows() {
    let dragged = null;
    document.querySelectorAll("[data-ff-prod-row]").forEach((row) => {
      row.addEventListener("dragstart", () => {
        dragged = row;
        row.classList.add("opacity-50");
      });
      row.addEventListener("dragend", () => {
        row.classList.remove("opacity-50");
        dragged = null;
        saveSortOrder();
      });
      row.addEventListener("dragover", (event) => {
        event.preventDefault();
        if (!dragged || dragged === row) return;
        const tbody = row.parentNode;
        const box = row.getBoundingClientRect();
        const after = event.clientY > box.top + box.height / 2;
        tbody.insertBefore(dragged, after ? row.nextSibling : row);
      });
    });

    document.querySelectorAll("[data-ff-save-product]").forEach((button) => {
      button.addEventListener("click", () => {
        const row = button.closest("[data-ff-prod-row]");
        const flags = {};
        row.querySelectorAll("[data-ff-flag]").forEach((input) => {
          const key = input.dataset.ffFlag;
          if (key === "featured") flags.is_featured = input.checked;
          if (key === "trending") flags.is_trending = input.checked;
          if (key === "new") flags.is_new_arrival = input.checked;
          if (key === "best") flags.is_best_seller = input.checked;
          if (key === "recommended") flags.is_recommended = input.checked;
        });
        updateProduct(button.dataset.ffSaveProduct, {
          is_visible: row.querySelector("[data-ff-visible]").checked,
          visibility_priority: num(row.querySelector("[data-ff-priority]").value),
          search_priority: num(row.querySelector("[data-ff-search-priority]").value),
          visible_from: fromDatetimeLocal(row.querySelector("[data-ff-from]").value),
          visible_until: fromDatetimeLocal(row.querySelector("[data-ff-until]").value),
          ...flags
        });
      });
    });
  }

  function renderCategoryTable() {
    const list = document.getElementById("ffCategoryPriorityList");
    if (!list) return;
    const fallback = [
      ["all", "All"], ["women", "Women"], ["men", "Men"], ["kurtis", "Kurtis"], ["tops", "Tops"],
      ["t-shirts", "T-Shirts"], ["jeans", "Jeans"], ["dresses", "Dresses"], ["kids", "Kids"],
      ["unisex", "Unisex"], ["new-arrivals", "New Arrivals"], ["under-499", "Under Rs 499"]
    ].map(([slug, label], index) => ({ slug, label, sort_order: index + 1, is_visible: true }));
    const rows = categoryRows.length ? categoryRows : fallback;
    list.innerHTML = rows.map((row) => `
      <div draggable="true" data-ff-cat-row="${clean(row.slug)}" data-ff-cat-label="${clean(row.label)}" class="ff-cat-row flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2">
        <div class="flex items-center gap-3 min-w-0"><span class="cursor-grab text-slate-400">☰</span><strong class="truncate">${clean(row.label)}</strong><small class="text-slate-400">${clean(row.slug)}</small></div>
        <label class="text-xs font-bold flex items-center gap-2"><input data-ff-cat-visible type="checkbox" ${row.is_visible !== false ? "checked" : ""}> Show</label>
      </div>
    `).join("");

    let dragged = null;
    list.querySelectorAll("[data-ff-cat-row]").forEach((row) => {
      row.addEventListener("dragstart", () => {
        dragged = row;
        row.classList.add("opacity-50");
      });
      row.addEventListener("dragend", () => {
        row.classList.remove("opacity-50");
        dragged = null;
      });
      row.addEventListener("dragover", (event) => {
        event.preventDefault();
        if (!dragged || dragged === row) return;
        const box = row.getBoundingClientRect();
        list.insertBefore(dragged, event.clientY > box.top + box.height / 2 ? row.nextSibling : row);
      });
    });
  }

  function renderShopPriorityTable() {
    const list = document.getElementById("ffShopPriorityList");
    if (!list) return;
    list.innerHTML = shopRows.map((shop) => `
      <div class="flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2">
        <div class="min-w-0"><strong class="block truncate">${clean(shop.shop_name || `Shop ${shop.id}`)}</strong><small class="text-slate-400">${clean(shop.pincode || "-")} • ${clean(shop.status || "-")}</small></div>
        <input data-ff-shop-priority="${shop.id}" type="number" min="1" value="${num(shop.visibility_priority)}" class="w-24 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-1 text-xs font-bold">
      </div>
    `).join("") || `<div class="text-sm text-slate-400">No shops found.</div>`;
    list.querySelectorAll("[data-ff-shop-priority]").forEach((input) => {
      input.addEventListener("change", () => updateShopPriority(input.dataset.ffShopPriority, input.value));
    });
  }

  async function fetchCatalogRules(productIds) {
    const client = getDb();
    if (!client || !productIds.length) return { products: new Map(), shops: new Map(), cats: [] };
    const { data: products, error } = await client
      .from("shopkeeper_products")
      .select("id,shop_id,is_visible,visibility_priority,visibility_sort_order,is_featured,is_trending,is_new_arrival,is_best_seller,is_recommended,search_priority,visible_from,visible_until")
      .in("id", productIds);
    if (error) return { products: new Map(), shops: new Map(), cats: [] };
    const shopIds = [...new Set((products || []).map((row) => Number(row.shop_id)).filter(Boolean))];
    const [{ data: shops }, { data: cats }] = await Promise.all([
      shopIds.length ? client.from("shops").select("id,visibility_priority").in("id", shopIds) : Promise.resolve({ data: [] }),
      client.from("product_category_priorities").select("*").order("sort_order", { ascending: true })
    ]);
    return {
      products: new Map((products || []).map((row) => [String(row.id), row])),
      shops: new Map((shops || []).map((row) => [Number(row.id), num(row.visibility_priority)])),
      cats: cats || []
    };
  }

  function scheduleCatalogApply() {
    if (applyingCatalogRules) return;
    clearTimeout(catalogTimer);
    catalogTimer = setTimeout(applyCatalogRules, 250);
  }

  async function applyCatalogRules() {
    const grid = document.querySelector(".products-grid");
    const cards = [...document.querySelectorAll(".product-card[data-id]")];
    if (!grid || !cards.length || applyingCatalogRules) {
      applyCategoryOrder();
      return;
    }
    applyingCatalogRules = true;
    try {
      const ids = cards.map((card) => card.dataset.id).filter(Boolean);
      const rules = await fetchCatalogRules(ids);
      const searchActive = !!clean(document.getElementById("searchInput")?.value);
      const visibleCards = [];

      cards.forEach((card) => {
        const row = rules.products.get(String(card.dataset.id));
        const hidden = row && (row.is_visible === false || !isWithinSchedule(row));
        card.classList.toggle("is-hidden", !!hidden);
        if (row) {
          const badge = productBadge(row);
          if (badge) {
            const ribbon = card.querySelector(".sale-ribbon");
            if (ribbon) ribbon.textContent = badge;
          }
        }
        if (!hidden) visibleCards.push(card);
      });

      visibleCards.sort((a, b) => {
        const ar = rules.products.get(String(a.dataset.id)) || {};
        const br = rules.products.get(String(b.dataset.id)) || {};
        return compareRank(ar, br, rules.shops, searchActive);
      });
      visibleCards.forEach((card) => grid.appendChild(card));
      applyCategoryOrder(rules.cats);
    } finally {
      applyingCatalogRules = false;
    }
  }

  async function applyProductDetailVisibility() {
    if (!location.pathname.toLowerCase().includes("product.html")) return;
    const id = new URLSearchParams(location.search).get("id");
    const client = getDb();
    if (!id || !client) return;
    const { data, error } = await client
      .from("shopkeeper_products")
      .select("id,is_visible,visible_from,visible_until")
      .eq("id", id)
      .maybeSingle();
    if (error || !data || (data.is_visible !== false && isWithinSchedule(data))) return;
    const main = document.querySelector("main") || document.body;
    main.innerHTML = `
      <section style="min-height:55vh;display:grid;place-items:center;padding:32px;">
        <div style="max-width:520px;text-align:center;border:1px solid #e5e7eb;border-radius:18px;padding:28px;background:#fff;">
          <h1 style="font-size:28px;margin:0 0 10px;color:#111827;">Product unavailable</h1>
          <p style="margin:0 0 18px;color:#64748b;">This product is currently hidden or outside its visibility schedule.</p>
          <a href="products.html" style="display:inline-flex;align-items:center;justify-content:center;height:44px;padding:0 18px;border-radius:999px;background:#ff5a00;color:#fff;font-weight:800;text-decoration:none;">Browse products</a>
        </div>
      </section>
    `;
  }

  async function applyCategoryOrder(knownRows = null) {
    const rows = knownRows || categoryRows;
    if (!rows || !rows.length) return;
    const order = new Map(rows.map((row) => [String(row.slug), row]));
    document.querySelectorAll(".category-strip").forEach((strip) => {
      const buttons = [...strip.querySelectorAll("[data-filter]")];
      buttons.sort((a, b) => num(order.get(a.dataset.filter)?.sort_order) - num(order.get(b.dataset.filter)?.sort_order));
      buttons.forEach((btn) => {
        const rule = order.get(btn.dataset.filter);
        btn.style.display = rule?.is_visible === false ? "none" : "";
        strip.appendChild(btn);
      });
    });
    document.querySelectorAll(".pick-card[data-category]").forEach((card) => {
      const rule = order.get(card.dataset.category);
      card.style.display = rule?.is_visible === false ? "none" : "";
      if (card.parentElement && rule) card.style.order = String(num(rule.sort_order));
    });
  }

  function initCustomerVisibility() {
    if (!location.pathname.toLowerCase().includes("flashfitshop")) return;
    const observer = new MutationObserver(scheduleCatalogApply);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("input", (event) => {
      if (event.target && event.target.id === "searchInput") scheduleCatalogApply();
    });
    scheduleCatalogApply();
    applyProductDetailVisibility();
  }

  function init() {
    injectAdminTab();
    initCustomerVisibility();
    if (location.pathname.toLowerCase().includes("admin-panel")) {
      const observer = new MutationObserver(injectAdminTab);
      observer.observe(document.body, { childList: true, subtree: true });
      [250, 750, 1500, 3000].forEach((delay) => setTimeout(injectAdminTab, delay));
    }
  }

  window.flashfitVisibility = {
    init,
    loadVisibilityData,
    applyCatalogRules
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();


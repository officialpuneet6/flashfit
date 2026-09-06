const modal = document.getElementById("pincodeModal");
const pincodeInput = document.getElementById("pincodeInput");
const checkBtn = document.getElementById("checkPincodeBtn");
const useLocationBtn = document.getElementById("useLocationBtn");
const modalMessage = document.getElementById("modalMessage");
const deliveryPill = document.getElementById("deliveryPill");
const searchInput = document.getElementById("searchInput");
const searchSuggest = document.getElementById("searchSuggest");
const pincodeTopBtn = document.getElementById("pincodeTopBtn");
const pincodeTopMenu = document.getElementById("pincodeTopMenu");
const changePincodeBtn = document.getElementById("changePincodeBtn");
const currentPincodeText = document.getElementById("currentPincodeText");
const nearestShopLabel = document.getElementById("nearestShopLabel");
const shopNowBtn = document.getElementById("shopNowBtn");
const bestSellersSection = document.getElementById("bestSellersSection");
const quickPicksSection = document.getElementById("quickPicksSection");
const categoryStrip = document.querySelector(".category-strip");
const businessDetailsSection = document.querySelector(".business-details");
const promiseBannerSection = document.querySelector(".promise-banner");
const complianceGridSection = document.querySelector(".compliance-grid");
const filterButtons = document.querySelectorAll(".filter-btn");
const productsGrid = document.querySelector(".products-grid");
const pickCards = document.querySelectorAll(".pick-card");
const emptyState = document.getElementById("emptyState");
const recommendationNote = document.getElementById("recommendationNote");
const serviceStatusBanner = document.getElementById("serviceStatusBanner");
const quickPanel = document.getElementById("quickPanel");
const quickPanelTitle = document.getElementById("quickPanelTitle");
const quickPanelBody = document.getElementById("quickPanelBody");
const profileBtn = document.getElementById("profileBtn");
const modeToggleBtn = document.getElementById("modeToggleBtn");
const cartBtn = document.getElementById("cartBtn");
const cartCount = document.getElementById("cartCount");
const menuBtn = document.getElementById("menuBtn");
const loginReminder = document.getElementById("loginReminder");
const loginNowBtn = document.getElementById("loginNowBtn");
const maybeLaterBtn = document.getElementById("maybeLaterBtn");
const loginPushModal = document.getElementById("loginPushModal");
const modalLoginBtn = document.getElementById("modalLoginBtn");
const modalGuestBtn = document.getElementById("modalGuestBtn");
const aiToggleBtn = document.getElementById("aiToggleBtn");
const aiPanel = document.getElementById("aiPanel");
const aiCloseBtn = document.getElementById("aiCloseBtn");
const aiMessages = document.getElementById("aiMessages");
const aiForm = document.getElementById("aiForm");
const aiInput = document.getElementById("aiInput");
const aiChips = document.querySelectorAll(".ai-chip");
const pageLoader = document.getElementById("pageLoader");
const pageLoaderText = document.getElementById("pageLoaderText");
const pageQuery = new URLSearchParams(window.location.search);

let SERVICEABLE_PINCODES = new Set();

let activeFilter = "all";
const CART_KEY = "flashfitCart";
const NEAREST_SHOP_ID_KEY = "flashfitNearestShopId";
const NEAREST_SHOP_NAME_KEY = "flashfitNearestShopName";
let currentUser = null;
let reminderInterval = null;
let modalInterval = null;
let hasShownScrollPrompt = false;
let autoLocationAttempted = false;
let catalogLocked = false;
let searchDebounceTimer = null;

const SEARCH_RECOMMENDED = [
  "Women",
  "Men",
  "Unisex",
  "Kurtis",
  "Tops",
  "T-Shirts",
  "Jeans",
  "Dresses",
  "Kids",
  "Clothing Sets",
  "New Arrivals",
  "Under Rs 499"
];
// FEATURED_PRODUCTS is read live from window.FLASHFIT_FEATURED_PRODUCTS to support async loading
let aiInitialized = false;
const USER_BEHAVIOR_KEY = "flashfitUserBehavior";
let lastSearchRecorded = "";
let loaderHidden = false;
const THEME_KEY = "flashfitThemeMode";

function setLoaderMessage(message) {
  if (pageLoaderText && message) {
    pageLoaderText.textContent = message;
  }
}

function hidePageLoader() {
  if (!pageLoader || loaderHidden) return;
  loaderHidden = true;
  pageLoader.classList.add("is-hidden");
}

function getProductCards() {
  return [...document.querySelectorAll(".product-card")];
}

function productUniqueKey(row) {
  const id = String(row?.id || "").trim();
  if (id) return `id:${id}`;
  return [
    row?.shop_id || "",
    row?.title || "",
    row?.category || "",
    row?.customer_price || row?.price || ""
  ].join("|").toLowerCase().trim();
}

function uniqueProducts(rows) {
  const seen = new Set();
  return (rows || []).filter((row) => {
    const key = productUniqueKey(row);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeProductCards(scope = document) {
  const seen = new Set();
  scope.querySelectorAll(".product-card[data-id]").forEach((card) => {
    const key = card.dataset.id ? `id:${card.dataset.id}` : `${card.dataset.shopId || ""}|${card.dataset.title || ""}`.toLowerCase();
    if (seen.has(key)) {
      card.remove();
      return;
    }
    seen.add(key);
  });
}

function formatRs(value) {
  return `Rs ${Number(value || 0)}`;
}

function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasSearchToken(text, token) {
  const cleanText = ` ${normalizeSearchText(text)} `;
  const cleanToken = normalizeSearchText(token);
  if (!cleanToken) return false;
  if (cleanToken.length <= 3) return cleanText.includes(` ${cleanToken} `);
  return cleanText.includes(cleanToken);
}

function productSearchText(row = {}) {
  return normalizeSearchText([
    row.title,
    row.category,
    row.description,
    row.color,
    row.sizes,
    row.fabric,
    row.print_pattern,
    row.fit_type,
    row.sleeve_type,
    row.neck_type,
    row.occasion,
    row.care_instructions,
    row.size_chart,
    Number(row.customer_price || row.price || 0) <= 499 ? "under 499 budget low price" : "",
    inferGenderText(row)
  ].filter(Boolean).join(" "));
}

function inferGenderText(source = {}) {
  const text = normalizeSearchText([source.title, source.category, source.description].filter(Boolean).join(" "));
  const womenWords = ["women", "woman", "ladies", "girl", "girls", "kurti", "kurtis", "saree", "sarees", "dress", "dresses", "dupatta", "palazzo"];
  const menWords = ["men", "man", "boys", "boy", "shirt", "shirts", "trouser", "trousers", "mens"];
  const kidsWords = ["kids", "kid", "child", "children", "baby"];
  if (kidsWords.some((word) => text.includes(word))) return "kids children baby";
  if (womenWords.some((word) => text.includes(word))) return "women ladies female";
  if (menWords.some((word) => text.includes(word))) return "men male boys";
  return "unisex";
}

function applyThemeMode(mode) {
  const isNight = mode === "night";
  document.body.classList.toggle("theme-night", isNight);
  if (modeToggleBtn) {
    modeToggleBtn.setAttribute("aria-pressed", isNight ? "true" : "false");
    modeToggleBtn.innerHTML = isNight
      ? '<i class="fa-solid fa-sun"></i><span class="nav-btn-label">Light</span>'
      : '<i class="fa-solid fa-moon"></i><span class="nav-btn-label">Night</span>';
  }
}

function initializeThemeMode() {
  const savedMode = localStorage.getItem(THEME_KEY) || "light";
  applyThemeMode(savedMode);
}

function buildProductsPageUrl(options = {}) {
  const params = new URLSearchParams();
  if (options.filter) params.set("filter", options.filter);
  if (options.query) params.set("q", options.query);
  const query = params.toString();
  return `products.html${query ? `?${query}` : ""}`;
}

function openProductsExperience(options = {}) {
  const { filter = "", query = "", smooth = true } = options;

  if (query && searchInput) {
    searchInput.value = query;
  }

  if (filter && filterButtons.length) {
    const btn = [...filterButtons].find((item) => item.dataset.filter === filter);
    if (btn) {
      activeFilter = filter;
      filterButtons.forEach((item) => item.classList.remove("active"));
      btn.classList.add("active");
      applyFilters();
      personalizeProducts();
    }
  }

  if (bestSellersSection) {
    bestSellersSection.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
    return;
  }

  window.location.href = buildProductsPageUrl({ filter, query });
}

function getCartSummary() {
  const items = getCart();
  const totalQty = items.reduce((sum, item) => sum + Number(item.qty || 0), 0);
  const subtotal = items.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.qty || 0)), 0);
  return { items, totalQty, subtotal };
}

function getCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY)) || [];
  } catch (_) {
    return [];
  }
}

function getBehaviorProfile() {
  try {
    return JSON.parse(localStorage.getItem(USER_BEHAVIOR_KEY)) || { categories: {}, cartCategories: {}, searchTerms: [] };
  } catch (_) {
    return { categories: {}, cartCategories: {}, searchTerms: [] };
  }
}

function saveBehaviorProfile(data) {
  localStorage.setItem(USER_BEHAVIOR_KEY, JSON.stringify(data));
}

function recordBehavior(type, value) {
  if (!value) return;
  const key = value.toLowerCase();
  const profile = getBehaviorProfile();
  if (type === "category") {
    profile.categories[key] = (profile.categories[key] || 0) + 1;
  }
  if (type === "cart") {
    profile.cartCategories[key] = (profile.cartCategories[key] || 0) + 1;
  }
  if (type === "search") {
    const existing = profile.searchTerms.filter((x) => x !== key);
    profile.searchTerms = [key, ...existing].slice(0, 8);
  }
  saveBehaviorProfile(profile);
}

function getTopBehaviorCategories() {
  const profile = getBehaviorProfile();
  const merged = {};
  Object.keys(profile.categories || {}).forEach((k) => { merged[k] = (merged[k] || 0) + profile.categories[k]; });
  Object.keys(profile.cartCategories || {}).forEach((k) => { merged[k] = (merged[k] || 0) + profile.cartCategories[k] * 2; });
  return Object.entries(merged)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([k]) => k);
}

function setCart(cartItems) {
  localStorage.setItem(CART_KEY, JSON.stringify(cartItems));
  if (window.flashfitDB && window.flashfitDB.saveCart) {
    window.flashfitDB.saveCart(cartItems);
  }
}

function updateCartCount() {
  const totalQty = getCart().reduce((sum, item) => sum + item.qty, 0);
  if (cartCount) cartCount.textContent = String(totalQty);
}

function addToCart(productCard) {
  const cartItems = getCart();
  const id = productCard.dataset.id;
  const title = productCard.dataset.title;
  const price = Number(productCard.dataset.price);
  const image = productCard.dataset.image;
  const shopId = Number(productCard.dataset.shopId || 0) || null;
  const existing = cartItems.find((item) => item.id === id);
  const primaryCategory = (productCard.dataset.category || "").split(" ")[0] || "";

  if (existing) {
    existing.qty += 1;
  } else {
    cartItems.push({ id, title, price, image, qty: 1, shopId });
  }

  setCart(cartItems);
  updateCartCount();
  if (primaryCategory) recordBehavior("cart", primaryCategory);
  personalizeProducts();
  showPanel("Cart Updated", `${title} added to cart.`);
}

function updateAddToCartState() {
  document.querySelectorAll(".add-cart-btn").forEach((button) => {
    if (button.disabled) {
      button.textContent = "Out of Stock";
      button.classList.remove("login-required");
      return;
    }
    button.textContent = "Add to Cart";
    button.classList.remove("login-required");
  });
}

function showLoginReminder() {
  if (loginReminder && !currentUser) {
    loginReminder.classList.add("show");
  }
}

function hideLoginReminder() {
  if (loginReminder) {
    loginReminder.classList.remove("show");
  }
}

function openLoginPushModal() {
  if (!currentUser && loginPushModal) {
    loginPushModal.classList.add("show");
  }
}

function closeLoginPushModal() {
  if (loginPushModal) {
    loginPushModal.classList.remove("show");
  }
}

function stopReminderLoop() {
  if (reminderInterval) {
    clearInterval(reminderInterval);
    reminderInterval = null;
  }
}

function stopModalLoop() {
  if (modalInterval) {
    clearInterval(modalInterval);
    modalInterval = null;
  }
}

function startReminderLoop() {
  stopReminderLoop();
}

function startModalLoop() {
  stopModalLoop();
}

async function refreshAuthState() {
  if (window.flashfitDB && window.flashfitDB.getCurrentUser) {
    currentUser = await window.flashfitDB.getCurrentUser();
  } else {
    currentUser = null;
  }
  updateAddToCartState();
  if (currentUser) {
    hideLoginReminder();
    closeLoginPushModal();
    stopReminderLoop();
    stopModalLoop();
  }
}

function showDeliveryMessage(pincode) {
  deliveryPill.textContent = `Delivery available in 45-50 min | Pincode: ${pincode}`;
  deliveryPill.classList.add("show");
}

function updateTopPincode(pincode) {
  if (!currentPincodeText) return;
  currentPincodeText.textContent = pincode ? `Pincode: ${pincode}` : "Set Pincode";
}

function updateNearestShopLabel(name, pincode) {
  if (!nearestShopLabel) return;
  if (name) {
    nearestShopLabel.textContent = `Nearest shop: ${name}`;
    return;
  }
  if (pincode) {
    nearestShopLabel.textContent = "Nearest shop: Not available in this pincode";
    return;
  }
  nearestShopLabel.textContent = "Nearest shop: Detecting...";
}

async function resolveNearestShop(pincode) {
  const pin = (pincode || "").trim();
  if (!pin || !window.flashfitDB || !window.flashfitDB.findNearestShopByPincode) {
    localStorage.removeItem(NEAREST_SHOP_ID_KEY);
    localStorage.removeItem(NEAREST_SHOP_NAME_KEY);
    updateNearestShopLabel("", "");
    return null;
  }

  const shop = await window.flashfitDB.findNearestShopByPincode(pin);
  if (shop && shop.id) {
    localStorage.setItem(NEAREST_SHOP_ID_KEY, String(shop.id));
    localStorage.setItem(NEAREST_SHOP_NAME_KEY, shop.shop_name || "");
    updateNearestShopLabel(shop.shop_name || "Nearest Shop", pin);
    return shop;
  }

  localStorage.removeItem(NEAREST_SHOP_ID_KEY);
  localStorage.removeItem(NEAREST_SHOP_NAME_KEY);
  updateNearestShopLabel("", pin);
  return null;
}

function closeModal() {
  modal.classList.add("modal-hidden");
}

function openPincodeModal() {
  modal.classList.remove("modal-hidden");
}

function setError(message) {
  modalMessage.style.color = "#d13c2f";
  modalMessage.textContent = message;
}

function setSuccess(message) {
  modalMessage.style.color = "#137b2b";
  modalMessage.textContent = message;
}

async function detectPincodeFromCoordinates(latitude, longitude) {
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return "";

  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&zoom=18&addressdetails=1`;
  const response = await fetch(url, {
    headers: {
      "Accept": "application/json"
    }
  });
  if (!response.ok) {
    throw new Error("Reverse geocoding failed");
  }
  const payload = await response.json();
  const postcode = payload && payload.address && payload.address.postcode
    ? String(payload.address.postcode).replace(/\D/g, "").slice(0, 6)
    : "";
  return validatePincode(postcode) ? postcode : "";
}

async function applyDetectedPincode(pincode, sourceLabel) {
  if (!validatePincode(pincode)) {
    setError("Unable to detect a valid 6-digit pincode.");
    return false;
  }

  pincodeInput.value = pincode;
  localStorage.setItem("flashfitPincode", pincode);
  if (window.flashfitDB && window.flashfitDB.saveDefaultPincode) {
    window.flashfitDB.saveDefaultPincode(pincode);
  }

  if (SERVICEABLE_PINCODES.has(pincode)) {
    setCatalogAvailability(true, "");
    setSuccess(`${sourceLabel} detected. Delivery available in 45-50 min.`);
    showDeliveryMessage(pincode);
    updateTopPincode(pincode);
    await resolveNearestShop(pincode);
    await loadLiveProducts();
    setTimeout(closeModal, 350);
    return true;
  }

  localStorage.removeItem(NEAREST_SHOP_ID_KEY);
  localStorage.removeItem(NEAREST_SHOP_NAME_KEY);
  setCatalogAvailability(false, `Service is not active on ${pincode}.`);
  updateTopPincode(pincode);
  updateNearestShopLabel("", pincode);
  setError(`Service is not active on ${pincode}.`);
  return false;
}

function validatePincode(value) {
  return /^\d{6}$/.test(value);
}

function matchesFilter(cardCategory, filter) {
  if (filter === "all") return true;
  if (filter === "under-499") {
    const price = Number(cardCategory.dataset.price || "9999");
    return price <= 499;
  }
  const category = normalizeSearchText(cardCategory.dataset.category || "");
  const searchText = normalizeSearchText(cardCategory.dataset.search || cardCategory.textContent || "");
  const normalizedFilter = normalizeSearchText(filter);
  const filterMap = {
    women: ["women", "ladies", "female", "kurti", "kurtis", "saree", "dress", "dresses", "dupatta"],
    men: ["men", "male", "mens", "shirt", "shirts", "trouser", "boys"],
    kids: ["kids", "kid", "children", "child", "baby"],
    unisex: ["unisex"]
  };
  if (filterMap[filter]) {
    return filterMap[filter].some((token) => hasSearchToken(searchText, token) || hasSearchToken(category, token));
  }
  return category.includes(normalizedFilter) || searchText.includes(normalizedFilter);
}

function matchesSearch(card, term) {
  if (!term) return true;
  const query = normalizeSearchText(term);
  if (!query) return true;
  const searchable = normalizeSearchText([
    card.dataset.search,
    card.dataset.title,
    card.dataset.category,
    card.textContent,
    card.dataset.price ? `rs ${card.dataset.price} ${Number(card.dataset.price) <= 499 ? "under 499" : ""}` : ""
  ].join(" "));
  return query.split(" ").every((token) => hasSearchToken(searchable, token));
}

function showPanel(title, body) {
  quickPanelTitle.textContent = title;
  quickPanelBody.innerHTML = body;
  quickPanel.classList.add("show");
}

function setCatalogAvailability(isAvailable, message) {
  catalogLocked = !isAvailable;
  if (categoryStrip) categoryStrip.style.display = isAvailable ? "" : "none";
  if (quickPicksSection) quickPicksSection.style.display = isAvailable ? "" : "none";
  if (bestSellersSection) bestSellersSection.style.display = isAvailable ? "" : "none";
  if (businessDetailsSection) businessDetailsSection.style.display = isAvailable ? "" : "none";
  if (promiseBannerSection) promiseBannerSection.style.display = isAvailable ? "" : "none";
  if (complianceGridSection) complianceGridSection.style.display = isAvailable ? "" : "none";
  if (serviceStatusBanner) {
    serviceStatusBanner.textContent = message || "";
    serviceStatusBanner.classList.toggle("show", !!message);
  }
  if (!isAvailable && productsGrid) {
    productsGrid.innerHTML = "";
  }
  if (emptyState && !isAvailable && message) {
    emptyState.textContent = message;
    emptyState.classList.add("show");
  }
}

function applyFilters() {
  if (catalogLocked) return;
  const searchTerm = searchInput.value.trim();
  if (searchTerm.length >= 3 && searchTerm.toLowerCase() !== lastSearchRecorded) {
    lastSearchRecorded = searchTerm.toLowerCase();
    recordBehavior("search", lastSearchRecorded);
  }
  let visibleProducts = 0;

  getProductCards().forEach((card) => {
    const visible = matchesFilter(card, activeFilter) && matchesSearch(card, searchTerm);
    card.classList.toggle("is-hidden", !visible);
    if (visible) visibleProducts += 1;
  });

  pickCards.forEach((card) => {
    const isActive = activeFilter !== "all" && card.dataset.category === activeFilter;
    card.classList.toggle("is-active", isActive);
  });

  if (emptyState) {
    emptyState.classList.toggle("show", visibleProducts === 0);
    if (visibleProducts === 0 && searchTerm) {
      emptyState.textContent = `No products match “${searchTerm}”. Try another search or category.`;
    }
  }
}

async function getInterestKeywords() {
  const interestSet = new Set();
  const topCats = getTopBehaviorCategories();
  topCats.forEach((c) => interestSet.add(c));

  if (currentUser && window.flashfitDB && window.flashfitDB.loadInterests) {
    const dbInterests = await window.flashfitDB.loadInterests();
    (dbInterests || []).forEach((item) => {
      const token = (item || "").toLowerCase();
      if (token.includes("kurti")) interestSet.add("kurtis");
      else if (token.includes("top")) interestSet.add("tops");
      else if (token.includes("shirt")) interestSet.add("t-shirts");
      else if (token.includes("jean")) interestSet.add("jeans");
      else if (token.includes("dress")) interestSet.add("dresses");
      else if (token.includes("arrival")) interestSet.add("new-arrivals");
    });
  }
  return [...interestSet];
}

async function personalizeProducts() {
  const grid = document.querySelector(".products-grid");
  if (!grid) return;
  const cards = getProductCards();
  const interestKeys = await getInterestKeywords();
  const behavior = getBehaviorProfile();
  const recentTerms = behavior.searchTerms || [];

  const scored = cards.map((card, index) => {
    const categories = (card.dataset.category || "").toLowerCase();
    const title = (card.dataset.title || "").toLowerCase();
    const price = Number(card.dataset.price || 0);
    let score = 0;

    interestKeys.forEach((k) => {
      if (categories.includes(k)) score += 5;
    });
    recentTerms.forEach((term) => {
      if (title.includes(term) || categories.includes(term)) score += 2;
    });
    if (price <= 1200) score += 1;

    return { card, score, index };
  });

  scored.sort((a, b) => (b.score - a.score) || (a.index - b.index));
  scored.forEach((item) => grid.appendChild(item.card));

  cards.forEach((card) => {
    const badge = card.querySelector(".reco-badge");
    if (badge) badge.remove();
  });

  const topReco = scored.filter((x) => x.score > 0).slice(0, 3);
  topReco.forEach((item) => {
    const badge = document.createElement("span");
    badge.className = "reco-badge";
    badge.textContent = "Recommended";
    item.card.appendChild(badge);
  });

  if (recommendationNote) {
    if (topReco.length) {
      const topInterest = interestKeys[0] ? interestKeys[0].replace("-", " ") : "your behavior";
      recommendationNote.textContent = `Auto suggestions active: more similar products based on ${topInterest}.`;
    } else {
      recommendationNote.textContent = "Browse products to unlock more personalized recommendations.";
    }
  }
}

function hideSearchSuggestions() {
  if (searchSuggest) {
    searchSuggest.classList.remove("show");
    searchSuggest.innerHTML = "";
  }
}

function showSearchSuggestions() {
  if (!searchSuggest) return;
  const term = (searchInput.value || "").trim().toLowerCase();
  if (!term) {
    hideSearchSuggestions();
    return;
  }

  const categoryList = SEARCH_RECOMMENDED
    .filter((item) => item.toLowerCase().includes(term))
    .slice(0, 3);

  const productCards = getProductCards();
  const productList = [];
  productCards.forEach(card => {
    const title = (card.dataset.title || "").trim();
    const searchable = normalizeSearchText([card.dataset.search, title, card.dataset.category].join(" "));
    if (searchable.includes(normalizeSearchText(term)) && !productList.some((item) => item.title === title)) {
      productList.push({ title, id: card.dataset.id || "" });
    }
  });

  const finalProducts = productList.slice(0, 5);
  const combinedList = [...categoryList.map((title) => ({ title, id: "" })), ...finalProducts];

  if (!combinedList.length) {
    hideSearchSuggestions();
    return;
  }

  searchSuggest.innerHTML = combinedList
    .map((item) => `<button type="button" data-value="${item.title}" data-product-id="${item.id}"><i class="fa-solid fa-magnifying-glass" style="margin-right:8px; opacity:0.6; font-size:0.9em;"></i>${item.title}</button>`)
    .join("");
  searchSuggest.classList.add("show");
}

function aiAddMessage(role, text) {
  if (!aiMessages) return;
  const el = document.createElement("div");
  el.className = `ai-msg ${role}`;
  el.textContent = text;
  aiMessages.appendChild(el);
  aiMessages.scrollTop = aiMessages.scrollHeight;
}

function aiSetCategory(category) {
  const btn = [...filterButtons].find((x) => x.dataset.filter === category);
  if (btn) btn.click();
}

function aiRecommendProducts(maxPrice, category) {
  const matched = getProductCards().filter((card) => {
    const price = Number(card.dataset.price || 0);
    const inPrice = maxPrice ? price <= maxPrice : true;
    const inCategory = category ? card.dataset.category.includes(category) : true;
    return inPrice && inCategory;
  });
  if (!matched.length) return "No products matched right now. Try: Kurtis or Tops.";
  const titles = matched.slice(0, 3).map((x) => x.dataset.title).join(", ");
  return `Top picks for you: ${titles}.`;
}

function getCatalogRecommendations(rawQuery, limit = 3) {
  const query = (rawQuery || "").toLowerCase().trim();
  const behavior = getBehaviorProfile();
  const topCategories = getTopBehaviorCategories();
  return getProductCards()
    .map((card, index) => {
      const title = (card.dataset.title || "").toLowerCase();
      const category = (card.dataset.category || "").toLowerCase();
      const price = Number(card.dataset.price || 0);
      let score = 0;
      if (!query) score += 1;
      if (query && title.includes(query)) score += 8;
      if (query && category.includes(query)) score += 6;
      topCategories.forEach((item) => {
        if (category.includes(item)) score += 4;
      });
      (behavior.searchTerms || []).forEach((term) => {
        if (title.includes(term) || category.includes(term)) score += 3;
      });
      if (price <= 999) score += 1;
      return { title: card.dataset.title || "Product", score, index };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => (b.score - a.score) || (a.index - b.index))
    .slice(0, limit);
}

function encodeFallbackImages(row) {
  return [row.image_url, row.image, row.image_url_2, row.image_url_3, row.image_url_4]
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index)
    .join("|");
}

function applyImageFallbacks(scope = document) {
  scope.querySelectorAll("img[data-fallback-images]").forEach((img) => {
    if (img.dataset.fallbackBound === "true") return;
    img.dataset.fallbackBound = "true";
    img.addEventListener("error", () => {
      const candidates = (img.dataset.fallbackImages || "")
        .split("|")
        .map((item) => item.trim())
        .filter(Boolean);
      const current = img.currentSrc || img.src || "";
      const next = candidates.find((item) => item !== current);
      if (!next) return;
      img.dataset.fallbackImages = candidates.filter((item) => item !== next).join("|");
      img.src = next;
    });
  });
}

// Client-side preferences influence display order only; prices and delivery
// claims remain server-authoritative.
const INTERESTS_KEY = "flashfitUserInterests";
function trackProductView(productId, category) {
  if (!category) return;
  const cat = category.toLowerCase();
  let interests = {};
  try {
    interests = JSON.parse(localStorage.getItem(INTERESTS_KEY)) || {};
  } catch (_) { interests = {}; }
  
  interests[cat] = (interests[cat] || 0) + 1;
  localStorage.setItem(INTERESTS_KEY, JSON.stringify(interests));
}

function getUserInterestBoost(category) {
  if (!category) return 0;
  try {
    const interests = JSON.parse(localStorage.getItem(INTERESTS_KEY)) || {};
    const count = interests[category.toLowerCase()] || 0;
    // Boost score by 2 points per view, capped at 10
    return Math.min(count * 2, 10);
  } catch (_) { return 0; }
}

function productCardTemplate(row, options = {}) {
  const basePrice = Number(row.customer_price || row.price || 0);
  const customerPrice = basePrice;
  // Only show an MRP when it is actually supplied by the catalog.
  const oldPrice = [row.mrp, row.old_price, row.list_price]
    .map(Number)
    .find((value) => Number.isFinite(value) && value > customerPrice);
  const stockQty = row.stock_qty === undefined || row.stock_qty === null ? 1 : Number(row.stock_qty);
  const outOfStock = stockQty <= 0;
  const imageUrl = row.image_url || row.image || "";
  const fallbackImages = encodeFallbackImages(row);
  const badge = options.badge || "LIVE";
  
  return `
      <article class="product-card" data-id="${row.id}" data-shop-id="${row.shop_id || ""}" data-category="${(row.category || "").toLowerCase()}" data-title="${row.title || ""}" data-price="${customerPrice}" data-image="${imageUrl}" data-search="${productSearchText(row)}">
        <span class="sale-ribbon">${badge}</span>
        <img src="${imageUrl}" alt="${row.title || "Product"}" loading="lazy" decoding="async" data-fallback-images="${fallbackImages}" />
        <h4>${row.title || "Untitled Product"}</h4>
        <p class="product-meta">${row.category || "Live catalog item"}</p>
        <p class="price">${oldPrice ? `<span class="old">Rs ${oldPrice}</span>` : ""} <span class="new">Rs ${customerPrice}</span></p>
        <p class="rating"><i class="fa-solid fa-location-dot"></i> Delivery availability checked by pincode</p>
        <p class="payment-note"><i class="fa-solid fa-money-bill-wave"></i> Payment options available</p>
        <button class="add-cart-btn ${outOfStock ? "login-required" : ""}" type="button" ${outOfStock ? "disabled" : ""}>${outOfStock ? "Out of Stock" : "Add to Cart"}</button>
      </article>
    `;
}

function renderFeaturedProducts() {
  if (!productsGrid) return;
  // Always read live from window so async-loaded featured products work correctly
  const featured = uniqueProducts(window.FLASHFIT_FEATURED_PRODUCTS || []);
  productsGrid.innerHTML = featured.map((row) => productCardTemplate(row, { badge: row.is_gold_badge ? "⭐ GOLD" : "LIVE" })).join("");
  applyImageFallbacks(productsGrid);
  dedupeProductCards(productsGrid);
  if (emptyState) {
    emptyState.classList.toggle("show", !featured.length);
    emptyState.textContent = "No products are available at the moment. Please check back shortly.";
  }
  updateAddToCartState();
}
// Expose so featured-products.js can trigger re-render after async load
window.renderFeaturedProducts = renderFeaturedProducts;

async function loadLiveProducts() {
  if (!productsGrid) return;
  const activePincode = (localStorage.getItem("flashfitPincode") || "").trim();
  if (!activePincode || !SERVICEABLE_PINCODES.has(activePincode)) {
    productsGrid.innerHTML = "";
    return;
  }
  if (!window.flashfitDB || !window.flashfitDB.getSupabaseClient) {
    renderFeaturedProducts();
    return;
  }
  const client = window.flashfitDB.getSupabaseClient();
  if (!client) {
    renderFeaturedProducts();
    return;
  }

  let query = client
    .from("shopkeeper_products")
    .select("id,shop_id,title,category,customer_price,shop_price,commission_amount,delivery_fee,image_url,image_url_2,image_url_3,image_url_4,description,color,sizes,fabric,print_pattern,fit_type,sleeve_type,neck_type,occasion,care_instructions,size_chart,stock_qty,status")
    .eq("status", "approved");

  if (activePincode && window.flashfitDB.listShopsByPincode) {
    const nearbyShops = await window.flashfitDB.listShopsByPincode(activePincode);
    const nearbyShopIds = (nearbyShops || []).map((shop) => Number(shop.id)).filter((id) => !!id);
    if (nearbyShopIds.length) {
      query = query.in("shop_id", nearbyShopIds);
    } else {
      productsGrid.innerHTML = "";
      if (emptyState) {
        emptyState.classList.add("show");
        emptyState.textContent = `No active shops are currently available for pincode ${activePincode}.`;
      }
      return;
    }
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) {
    console.warn("[FlashFit] Live catalog load failed:", error);
    renderFeaturedProducts();
    if (emptyState) emptyState.textContent = "We could not refresh the catalog. Please try again shortly.";
    return;
  }

  const rows = uniqueProducts(data || []);
  
  // Personalization affects display order only; catalog prices remain real.
  const rankedRows = rows.map(row => {
    let score = 0;
    if (row.stock_qty > 0 && row.stock_qty < 5) score += 5; // Fast selling urgency
    score += getUserInterestBoost(row.category);
    return { ...row, rankScore: score };
  }).sort((a, b) => b.rankScore - a.rankScore);

  const displayRows = rankedRows;
  productsGrid.innerHTML = displayRows.map((row) => productCardTemplate(row, {
    badge: row.rankScore > 5 ? "TRENDING" : "LIVE"
  })).join("");
  applyImageFallbacks(productsGrid);
  dedupeProductCards(productsGrid);

  if (emptyState) {
    emptyState.classList.toggle("show", !rows.length);
    emptyState.textContent = !rows.length
      ? `No products are currently available for pincode ${activePincode}.`
      : "No products are available at the moment. Please check back shortly.";
  }
  updateAddToCartState();
}

function aiHandleQuery(rawText) {
  const text = (rawText || "").trim();
  if (!text) return;
  aiAddMessage("user", text);
  const q = text.toLowerCase();

  if (q.includes("hello") || q.includes("hi")) {
    const recommendations = getCatalogRecommendations("", 3);
    if (recommendations.length) {
      aiAddMessage("bot", `Hi! Based on your activity, try: ${recommendations.map((item) => item.title).join(", ")}.`);
    } else {
      aiAddMessage("bot", "Hi! I can help with products, categories, cart, delivery, pricing, and checkout steps.");
    }
    return;
  }

  if (q.includes("recommend")) {
    const recommendations = getCatalogRecommendations("", 3);
    if (!recommendations.length) {
      aiAddMessage("bot", "Set your pincode and browse a few products to enable personalized recommendations.");
      return;
    }
    aiAddMessage("bot", `Recommended for you: ${recommendations.map((item) => item.title).join(", ")}.`);
    return;
  }

  if (q.includes("kurti")) {
    aiSetCategory("kurtis");
    aiAddMessage("bot", aiRecommendProducts(null, "kurtis"));
    return;
  }

  if (q.includes("tops") || q.includes("t-shirt")) {
    aiSetCategory("tops");
    aiAddMessage("bot", aiRecommendProducts(null, "tops"));
    return;
  }

  if (q.includes("jeans")) {
    aiSetCategory("jeans");
    aiAddMessage("bot", aiRecommendProducts(null, "jeans"));
    return;
  }

  if (q.includes("under") || q.includes("budget") || q.includes("cheap")) {
    if (q.includes("499")) {
      aiSetCategory("under-499");
      aiAddMessage("bot", "Showing budget picks under Rs 499.");
      return;
    }
    if (q.includes("1000")) {
      aiAddMessage("bot", aiRecommendProducts(1000, null));
      return;
    }
  }

  if (q.includes("delivery") || q.includes("pincode")) {
    const activePincode = (localStorage.getItem("flashfitPincode") || "").trim();
    if (!activePincode) {
      aiAddMessage("bot", "Set your pincode first. Catalog unlocks only on active service areas.");
    } else if (SERVICEABLE_PINCODES.has(activePincode)) {
      aiAddMessage("bot", `Service is active on ${activePincode}.`);
    } else {
      aiAddMessage("bot", `Service is not active on ${activePincode}.`);
    }
    return;
  }

  if (q.includes("cart")) {
    const totalQty = getCart().reduce((sum, item) => sum + item.qty, 0);
    aiAddMessage("bot", `Your cart has ${totalQty} item(s). Open cart from top-right icon.`);
    return;
  }

  if (q.includes("login") || q.includes("signup")) {
    aiAddMessage("bot", "Account login and signup are live. Open Profile to continue.");
    return;
  }

  if (q.includes("order")) {
    aiAddMessage("bot", "Open Profile or My Orders to check payment and delivery status.");
    return;
  }

  if (q.includes("shop now") || q.includes("buy")) {
    openProductsExperience({ smooth: true });
    aiAddMessage("bot", "Opening the product collection. Select an item and I can guide you further.");
    return;
  }

  aiAddMessage("bot", "I can help with: Kurtis/Tops/Jeans, budget picks, cart help, delivery, pricing, and checkout.");
}

function checkPincode() {
  const pincode = pincodeInput.value.trim();

  if (!validatePincode(pincode)) {
    setError("Please enter a valid 6-digit pincode.");
    return;
  }

  if (SERVICEABLE_PINCODES.has(pincode)) {
    setCatalogAvailability(true, "");
    localStorage.setItem("flashfitPincode", pincode);
    if (window.flashfitDB && window.flashfitDB.saveDefaultPincode) {
      window.flashfitDB.saveDefaultPincode(pincode);
    }
    setSuccess("Delivery available in 45-50 min");
    alert("Delivery available in 45-50 min");
    showDeliveryMessage(pincode);
    updateTopPincode(pincode);
    resolveNearestShop(pincode).then(() => loadLiveProducts());
    setTimeout(closeModal, 350);
    return;
  }

  localStorage.removeItem(NEAREST_SHOP_ID_KEY);
  localStorage.removeItem(NEAREST_SHOP_NAME_KEY);
  updateNearestShopLabel("", pincode);
  setCatalogAvailability(false, `Service is not active on ${pincode}.`);
  setError(`Service is not active on ${pincode}.`);
}

function useMyLocation() {
  if (!navigator.geolocation) {
    setError("Geolocation is not supported on this device.");
    return;
  }

  setSuccess("Detecting your location...");
  navigator.geolocation.getCurrentPosition(
    async (position) => {
      try {
        const pincode = await detectPincodeFromCoordinates(
          position.coords.latitude,
          position.coords.longitude
        );
        if (!pincode) {
          setError("Location found, but pincode could not be detected. Please enter it manually.");
          return;
        }
        await applyDetectedPincode(pincode, "Location");
      } catch (_) {
        setError("Location found, but pincode lookup failed. Please enter it manually.");
      }
    },
    () => {
      setError("Unable to fetch location. Please enter pincode manually.");
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

function tryAutoDetectLocation() {
  if (autoLocationAttempted || !navigator.geolocation || localStorage.getItem("flashfitPincode")) return;
  autoLocationAttempted = true;
  navigator.geolocation.getCurrentPosition(
    async (position) => {
      try {
        const pincode = await detectPincodeFromCoordinates(
          position.coords.latitude,
          position.coords.longitude
        );
        if (!pincode) return;
        await applyDetectedPincode(pincode, "Auto location");
      } catch (_) {
        // Silent fail so the user can still enter the pincode manually.
      }
    },
    () => {
      // Silent fail on auto-attempt.
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
  );
}

async function initPincodeFlow() {
  if (window.flashfitDB && window.flashfitDB.fetchServiceablePincodes) {
    const dbPincodes = await window.flashfitDB.fetchServiceablePincodes();
    if (dbPincodes.length) {
      SERVICEABLE_PINCODES.clear();
      dbPincodes.forEach((pin) => SERVICEABLE_PINCODES.add(pin));
    }
  }

  let savedPincode = localStorage.getItem("flashfitPincode");
  if (!savedPincode && window.flashfitDB && window.flashfitDB.loadDefaultPincode) {
    savedPincode = await window.flashfitDB.loadDefaultPincode();
    if (savedPincode) localStorage.setItem("flashfitPincode", savedPincode);
  }

  if (savedPincode && SERVICEABLE_PINCODES.has(savedPincode)) {
    setCatalogAvailability(true, "");
    closeModal();
    showDeliveryMessage(savedPincode);
    updateTopPincode(savedPincode);
    await resolveNearestShop(savedPincode);
  } else {
    openPincodeModal();
    updateTopPincode("");
    updateNearestShopLabel("", "");
    if (savedPincode) {
      setCatalogAvailability(false, `Service is not active on ${savedPincode}.`);
    } else {
      setCatalogAvailability(false, "Enter your pincode to browse this catalog.");
    }
    tryAutoDetectLocation();
  }
}

async function hydrateCartFromDB() {
  if (!window.flashfitDB || !window.flashfitDB.loadCart) return;
  const dbCart = await window.flashfitDB.loadCart();
  if (!dbCart.length) return;
  const localCart = getCart();
  if (!localCart.length) {
    localStorage.setItem(CART_KEY, JSON.stringify(dbCart));
  }
}

checkBtn.addEventListener("click", checkPincode);
useLocationBtn.addEventListener("click", useMyLocation);
pincodeInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") checkPincode();
});

if (searchInput) {
  searchInput.addEventListener("input", () => {
    window.clearTimeout(searchDebounceTimer);
    searchDebounceTimer = window.setTimeout(() => {
      showSearchSuggestions();
      applyFilters();
    }, 120);
  });
  searchInput.addEventListener("focus", showSearchSuggestions);
  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      applyFilters();
      hideSearchSuggestions();
      openProductsExperience({ query: searchInput.value.trim(), smooth: true });
      const mobileSearchToggle = document.getElementById("mobileSearchToggle");
      if (mobileSearchToggle) mobileSearchToggle.checked = false;
      searchInput.blur();
    }
  });
}

if (filterButtons) {
  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      activeFilter = button.dataset.filter;
      if (activeFilter && activeFilter !== "all") recordBehavior("category", activeFilter);
      filterButtons.forEach((btn) => btn.classList.remove("active"));
      button.classList.add("active");
      applyFilters();
      personalizeProducts();
    });
  });
}

if (shopNowBtn) {
  shopNowBtn.addEventListener("click", () => {
    openProductsExperience({ smooth: true });
  });
}

if (profileBtn) {
  profileBtn.addEventListener("click", () => {
    if (currentUser) {
      window.location.href = "profile.html";
    } else {
      window.location.href = "auth.html?next=profile";
    }
  });
}

if (modeToggleBtn) {
  modeToggleBtn.addEventListener("click", () => {
    const nextMode = document.body.classList.contains("theme-night") ? "light" : "night";
    localStorage.setItem(THEME_KEY, nextMode);
    applyThemeMode(nextMode);
  });
}

if (cartBtn) {
  cartBtn.addEventListener("click", () => {
    const summary = getCartSummary();
    showPanel("My Cart", `
      <div class="panel-cart-summary">
        <div class="panel-cart-kpi">
          <article>
            <span>Items</span>
            <strong>${summary.totalQty}</strong>
          </article>
          <article>
            <span>Subtotal</span>
            <strong>${formatRs(summary.subtotal)}</strong>
          </article>
        </div>
        <p class="panel-cart-note">${summary.totalQty ? "Review your cart, confirm address, and continue to checkout." : "Your cart is empty right now. Add products from the homepage to continue."}</p>
        <div class="quick-panel-actions">
          <a class="panel-primary" href="cart.html">Open Cart</a>
          <a href="products.html">Continue Shopping</a>
        </div>
      </div>
    `);
  });
}

if (menuBtn) {
  menuBtn.addEventListener("click", () => {
    showPanel("FlashFit Menu", `
      <ul class="panel-links">
        <li><a href="index.html">Home</a></li>
        <li><a href="products.html">Products</a></li>
        <li><a href="profile.html">My Profile</a></li>
        <li><a href="my-orders.html">My Orders</a></li>
        <li><a href="cart.html">My Cart</a></li>
        <li class="divider"></li>
        <li><a href="about-us.html">About Us</a></li>
        <li><a href="contact-us.html">Contact Us</a></li>
        <li><a href="return-refund-policy.html">Returns Policy</a></li>
      </ul>
    `);
  });
}

document.addEventListener("click", (event) => {
  if (quickPanel) {
    const clickInsidePanel = quickPanel.contains(event.target);
    const clickOnIcon = event.target.closest("#profileBtn, #cartBtn, #menuBtn");
    if (!clickInsidePanel && !clickOnIcon) {
      quickPanel.classList.remove("show");
    }
  }
});

if (searchSuggest) {
  searchSuggest.addEventListener("click", (event) => {
    const btn = event.target.closest("button[data-value]");
    if (!btn) return;
    searchInput.value = btn.dataset.value;
    if (btn.dataset.productId) {
      window.location.href = `product.html?id=${encodeURIComponent(btn.dataset.productId)}`;
      return;
    }
    applyFilters();
    hideSearchSuggestions();
    openProductsExperience({ query: searchInput.value.trim(), smooth: true });
    const mobileSearchToggle = document.getElementById("mobileSearchToggle");
    if (mobileSearchToggle) mobileSearchToggle.checked = false;
  });
}

document.addEventListener("click", (event) => {
  const inSearch = event.target.closest(".search-wrap");
  if (!inSearch) hideSearchSuggestions();
});

if (pincodeTopBtn && pincodeTopMenu) {
  pincodeTopBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    pincodeTopMenu.classList.toggle("show");
  });
}

if (changePincodeBtn) {
  changePincodeBtn.addEventListener("click", () => {
    if (pincodeTopMenu) pincodeTopMenu.classList.remove("show");
    const saved = localStorage.getItem("flashfitPincode");
    pincodeInput.value = saved || "";
    openPincodeModal();
  });
}

document.addEventListener("click", () => {
  if (pincodeTopMenu) pincodeTopMenu.classList.remove("show");
});

if (productsGrid) {
  productsGrid.addEventListener("click", (e) => {
    const card = e.target.closest(".product-card");
    if (!card) return;

    if (e.target.classList.contains("add-cart-btn")) {
      addToCart(card);
      return;
    }

    const id = card.dataset.id;
    if (id) {
      window.location.href = `product.html?id=${id}`;
    }
  });
}

if (pickCards) {
  pickCards.forEach((card) => {
    card.addEventListener("click", () => {
      const filter = card.dataset.category;
      const btn = [...filterButtons].find((b) => b.dataset.filter === filter);
      if (btn) btn.click();
      openProductsExperience({ filter, smooth: true });
    });
  });
}

if (aiToggleBtn && aiPanel) {
  aiToggleBtn.addEventListener("click", () => {
    aiPanel.classList.toggle("show");
    if (!aiInitialized && aiPanel.classList.contains("show")) {
      aiInitialized = true;
      aiAddMessage("bot", "Hi! I’m FlashFit AI. Ask me: 'show kurtis under 1000' or 'cart help'.");
    }
  });
}

if (aiCloseBtn && aiPanel) {
  aiCloseBtn.addEventListener("click", () => {
    aiPanel.classList.remove("show");
  });
}

if (aiForm) {
  aiForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const val = aiInput.value.trim();
    if (val) {
      aiHandleQuery(val);
      aiInput.value = "";
    }
  });
}

aiChips.forEach((chip) => {
  chip.addEventListener("click", () => {
    aiHandleQuery(chip.dataset.aiQuery || "");
  });
});

if (window.flashfitDB && window.flashfitDB.onAuthChange) {
  window.flashfitDB.onAuthChange(async () => {
    await refreshAuthState();
    if (window.flashfitDB.applySiteSettings) await window.flashfitDB.applySiteSettings();
    updateCartCount();
    await personalizeProducts();
  });
}

async function init() {
  try {
    initializeThemeMode();
    setLoaderMessage("Checking your account and loading homepage settings.");
    await refreshAuthState();
    if (window.flashfitDB && window.flashfitDB.applySiteSettings) {
      await window.flashfitDB.applySiteSettings();
    }

    setLoaderMessage("Checking delivery availability and preparing your catalog.");
    await initPincodeFlow();
    await hydrateCartFromDB();
    updateCartCount();

    setLoaderMessage("Loading featured products and personalizing your feed.");
    renderFeaturedProducts();
    await loadLiveProducts();
    const requestedFilter = (pageQuery.get("filter") || "").trim().toLowerCase();
    const requestedQuery = (pageQuery.get("q") || "").trim();
    if (requestedQuery && searchInput) {
      searchInput.value = requestedQuery;
    }
    if (requestedFilter && filterButtons.length) {
      const requestedButton = [...filterButtons].find((button) => button.dataset.filter === requestedFilter);
      if (requestedButton) {
        activeFilter = requestedFilter;
        filterButtons.forEach((button) => button.classList.remove("active"));
        requestedButton.classList.add("active");
      }
    }
    applyFilters();
    await personalizeProducts();
    startReminderLoop();
    startModalLoop();
  } finally {
    window.setTimeout(hidePageLoader, 280);
  }
}

init();

window.addEventListener("load", () => {
  window.setTimeout(hidePageLoader, 900);
});

window.setTimeout(hidePageLoader, 5000);

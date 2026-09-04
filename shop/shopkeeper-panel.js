/**
 * FlashFit Shopkeeper Panel JS
 * Fully Connected with Live Price Chart & Real-Time Supabase Database
 */

const SHOP_SESSION_KEY = "flashfitShopSession";
const IMGBB_API_KEY = "6b71b5f26e3557f7931c0a134c565d2b";

// UI View Blocks
const shopLoginView = document.getElementById("shopLoginView");
const shopAppView = document.getElementById("shopAppView");
const shopLoginId = document.getElementById("shopLoginId");
const shopLoginPassword = document.getElementById("shopLoginPassword");
const shopLoginBtn = document.getElementById("shopLoginBtn");
const shopLoginMsg = document.getElementById("shopLoginMsg");
const shopLogoutBtn = document.getElementById("shopLogoutBtn");
const sellerSortSelect = document.getElementById("sellerSortSelect");
const shopIdentity = document.getElementById("shopIdentity");
const shopSessionText = document.getElementById("shopSessionText");
const shopSidebarToggle = document.getElementById("shopSidebarToggle");
const shopSidebarOverlay = document.getElementById("shopSidebarOverlay");
const shopSidebar = document.getElementById("shopSidebar");

// Product Form Inputs
const productTitleInput = document.getElementById("productTitleInput");
const productCategoryInput = document.getElementById("productCategoryInput");
const productCostPriceInput = document.getElementById("productCostPriceInput");
const productProfitInput = document.getElementById("productProfitInput");
const productPriceInput = document.getElementById("productPriceInput");
const productStockInput = document.getElementById("productStockInput");
const productColorInput = document.getElementById("productColorInput");
const productColorVariantsInput = document.getElementById("productColorVariantsInput");
const productSizeInput = document.getElementById("productSizeInput");
const productFabricInput = document.getElementById("productFabricInput");
const productPatternInput = document.getElementById("productPatternInput");
const productFitInput = document.getElementById("productFitInput");
const productSleeveInput = document.getElementById("productSleeveInput");
const productNeckInput = document.getElementById("productNeckInput");
const productOccasionInput = document.getElementById("productOccasionInput");
const productCareInput = document.getElementById("productCareInput");
const productImageInput = document.getElementById("productImageInput");
const productImage2Input = document.getElementById("productImage2Input");
const productImage3Input = document.getElementById("productImage3Input");
const productImage4Input = document.getElementById("productImage4Input");
const productImageFileInput = document.getElementById("productImageFileInput");
const productImage2FileInput = document.getElementById("productImage2FileInput");
const productImage3FileInput = document.getElementById("productImage3FileInput");
const productImage4FileInput = document.getElementById("productImage4FileInput");
const productImagePreview = document.getElementById("productImagePreview");
const productImage2Preview = document.getElementById("productImage2Preview");
const productImage3Preview = document.getElementById("productImage3Preview");
const productImage4Preview = document.getElementById("productImage4Preview");
const imageUploadMsg = document.getElementById("imageUploadMsg");

// Size Chart Inputs
const sizeSChestInput = document.getElementById("sizeSChestInput");
const sizeSLengthInput = document.getElementById("sizeSLengthInput");
const sizeMChestInput = document.getElementById("sizeMChestInput");
const sizeMLengthInput = document.getElementById("sizeMLengthInput");
const sizeLChestInput = document.getElementById("sizeLChestInput");
const sizeLLengthInput = document.getElementById("sizeLLengthInput");
const sizeXLChestInput = document.getElementById("sizeXLChestInput");
const sizeXLLengthInput = document.getElementById("sizeXLLengthInput");

const productDescriptionInput = document.getElementById("productDescriptionInput");
const importListingUrlInput = document.getElementById("importListingUrlInput");
const importListingUrlBtn = document.getElementById("importListingUrlBtn");
const importListingInput = document.getElementById("importListingInput");
const importListingBtn = document.getElementById("importListingBtn");
const downloadListingJsonBtn = document.getElementById("downloadListingJsonBtn");
const clearImportBtn = document.getElementById("clearImportBtn");
const importListingMsg = document.getElementById("importListingMsg");
const addProductBtn = document.getElementById("addProductBtn");
const updateProductIdInput = document.getElementById("updateProductIdInput");
const updatePriceInput = document.getElementById("updatePriceInput");
const updateStockInput = document.getElementById("updateStockInput");
const updateProductBtn = document.getElementById("updateProductBtn");
const productMsg = document.getElementById("productMsg");
const productsTable = document.getElementById("productsTable");

// Dynamic Price Sheet Labels/Values
const calcCostValue = document.getElementById("calcCostValue");
const calcProfitValue = document.getElementById("calcProfitValue");
const calcSellerPriceValue = document.getElementById("calcSellerPriceValue");
const calcPlatformValue = document.getElementById("calcPlatformValue");
const calcGatewayValue = document.getElementById("calcGatewayValue");
const calcDeliveryValue = document.getElementById("calcDeliveryValue");
const calcCustomerValue = document.getElementById("calcCustomerValue");
const calcSettlementValue = document.getElementById("calcSettlementValue");
const chartStatSales = document.getElementById("chartStatSales");
const chartStatOrders = document.getElementById("chartStatOrders");
const livePricingPreview = document.getElementById("livePricingPreview");
const liveSettlementNote = document.getElementById("liveSettlementNote");

// Order Management Components
const orderSearchInput = document.getElementById("orderSearchInput");
const orderTabs = [...document.querySelectorAll(".order-tab")];
const pendingCountSpan = document.getElementById("pendingCount");
const refreshOrdersBtn = document.getElementById("refreshOrdersBtn");
const ordersTable = document.getElementById("ordersTable");
const ordersSummaryGrid = document.getElementById("ordersSummaryGrid");
const orderMsg = document.getElementById("orderMsg");
const reviewsTable = document.getElementById("reviewsTable");
const shopProfileCard = document.getElementById("shopProfileCard");

// Top Stats
const statProducts = document.getElementById("statProducts");
const statPending = document.getElementById("statPending");
const statApproved = document.getElementById("statApproved");
const statOrders = document.getElementById("statOrders");

const tabButtons = [...document.querySelectorAll(".tab-btn")];
const tabContents = [...document.querySelectorAll(".tab-content")];

// Global States
let currentShop = null;
let ordersChannel = null;
let stockChannel = null;
let reviewsChannel = null;
let settingsChannel = null; // Live pricing channel
let lastImportedListing = null;
let deliveryPartnersMap = new Map();
let editingProductId = null;
let editingProductSnapshot = null;

// Default Fallbacks (Loaded dynamically from database)
let COMMISSION = 10;
let GATEWAY = 4;
let DELIVERY = 90;
let earningsChart = null;
let activeOrderTab = "all";

function sanitizeInput(value) {
  return (value || "").toString().replace(/<|>/g, "").trim();
}

function safeNumber(value) {
  const num = Number(value || 0);
  return Number.isFinite(num) && num >= 0 ? num : 0;
}

function getClient() {
  if (!window.flashfitDB) {
    alert("Database module (flashfitDB) not loaded. Please check file paths.");
    return null;
  }
  const client = window.flashfitDB.getSupabaseClient();
  if (!client) {
    alert("Supabase client failed to initialize.");
  }
  return client;
}

/**
 * Loads Dynamic Commission, Gateway, and Delivery charges from Supabase 'site_settings'
 */
async function loadPricingSettings() {
  const client = getClient();
  if (!client) return;

  const { data, error } = await client
    .from("site_settings")
    .select("key,value");

  if (error) {
    console.error("Error loading pricing settings:", error);
    return;
  }

  data.forEach((row) => {
    if (row.key === "commission_pct") {
      COMMISSION = Number(row.value);
    }
    if (row.key === "gateway_pct") {
      GATEWAY = Number(row.value);
    }
    if (row.key === "delivery_charge") {
      DELIVERY = Number(row.value);
    }
  });

  renderPricingSummary();
}

function setMsg(element, text, isError) {
  if (!element) return;
  element.style.color = isError ? "#c53b2f" : "#1d7d34";
  element.textContent = text;
}

function slugifyFilePart(value) {
  return sanitizeInput(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "listing";
}

function saveImportedListing(data) {
  lastImportedListing = data || null;
  if (importListingInput && data) {
    importListingInput.value = JSON.stringify(data, null, 2);
  }
}

function downloadListingJson(data) {
  if (!data) {
    setMsg(importListingMsg, "Please import a draft or fetch a product link first.", true);
    return;
  }

  const fileName = `${slugifyFilePart(data.title || data.category || "listing")}.json`;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function formatRs(value) {
  return `Rs ${Math.round(safeNumber(value))}`;
}

function setUploadMsg(text, type = "") {
  if (!imageUploadMsg) return;
  imageUploadMsg.textContent = text;
  imageUploadMsg.className = `upload-msg ${type}`.trim();
}

function imageSlots() {
  return [
    { fileInput: productImageFileInput, urlInput: productImageInput, preview: productImagePreview, label: "main photo" },
    { fileInput: productImage2FileInput, urlInput: productImage2Input, preview: productImage2Preview, label: "photo 2" },
    { fileInput: productImage3FileInput, urlInput: productImage3Input, preview: productImage3Preview, label: "photo 3" },
    { fileInput: productImage4FileInput, urlInput: productImage4Input, preview: productImage4Preview, label: "photo 4" }
  ];
}

function previewSelectedImage(fileInput, preview) {
  if (!fileInput || !preview) return;
  const file = fileInput.files && fileInput.files[0];
  const card = fileInput.closest(".photo-upload-card");
  if (!file) {
    preview.removeAttribute("src");
    card?.classList.remove("has-image");
    return;
  }
  preview.src = URL.createObjectURL(file);
  card?.classList.add("has-image");
  setUploadMsg(`${file.name} selected. It will upload when you submit.`, "");
}

async function uploadImageToImgbb(file, name) {
  if (!file) return "";
  if (file.size > 32 * 1024 * 1024) {
    throw new Error(`${file.name} is bigger than 32 MB.`);
  }
  const form = new FormData();
  form.append("image", file);
  form.append("name", name || file.name.replace(/\.[^.]+$/, ""));
  const response = await fetch(`https://api.imgbb.com/1/upload?key=${encodeURIComponent(IMGBB_API_KEY)}`, {
    method: "POST",
    body: form
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result || !result.success) {
    throw new Error(result?.error?.message || `Image upload failed for ${file.name}.`);
  }
  return result.data.display_url || result.data.url || result.data.image?.url || "";
}

async function uploadSelectedProductImages() {
  const slots = imageSlots();
  const filesToUpload = slots.filter((slot) => slot.fileInput?.files?.[0]);
  if (!filesToUpload.length) return;
  setUploadMsg(`Uploading ${filesToUpload.length} photo(s) to ImgBB...`);
  for (const [index, slot] of filesToUpload.entries()) {
    const file = slot.fileInput.files[0];
    const safeName = slugifyFilePart(`${currentShop?.shop_login_id || "shop"}-${productTitleInput.value || slot.label}-${Date.now()}-${index + 1}`);
    const url = await uploadImageToImgbb(file, safeName);
    slot.urlInput.value = url;
    if (slot.preview) slot.preview.src = url;
    slot.fileInput.closest(".photo-upload-card")?.classList.add("has-image");
    setUploadMsg(`Uploaded ${index + 1}/${filesToUpload.length} photo(s)...`);
  }
  setUploadMsg("Photos uploaded successfully.", "success");
}

function resetImageUploads() {
  imageSlots().forEach((slot) => {
    if (slot.urlInput) slot.urlInput.value = "";
    if (slot.fileInput) slot.fileInput.value = "";
    if (slot.preview) slot.preview.removeAttribute("src");
    slot.fileInput?.closest(".photo-upload-card")?.classList.remove("has-image");
  });
  setUploadMsg("Photos upload to ImgBB when you submit the product.");
}

function syncImagePreviewsFromUrls() {
  imageSlots().forEach((slot) => {
    const url = sanitizeInput(slot.urlInput?.value || "");
    if (!slot.preview || !url) return;
    slot.preview.src = url;
    slot.fileInput?.closest(".photo-upload-card")?.classList.add("has-image");
  });
}

function setImageUrl(slot, url) {
  if (slot.urlInput) slot.urlInput.value = sanitizeInput(url || "");
  if (slot.fileInput) slot.fileInput.value = "";
  if (!slot.preview) return;
  if (url) {
    slot.preview.src = url;
    slot.fileInput?.closest(".photo-upload-card")?.classList.add("has-image");
  } else {
    slot.preview.removeAttribute("src");
    slot.fileInput?.closest(".photo-upload-card")?.classList.remove("has-image");
  }
}

function ensureSelectValue(select, value) {
  if (!select || !value) return;
  const normalized = sanitizeInput(value);
  const exists = [...select.options].some((option) => option.value === normalized);
  if (!exists) {
    const option = document.createElement("option");
    option.value = normalized;
    option.textContent = normalized;
    select.appendChild(option);
  }
  select.value = normalized;
}

function splitStoredColors(value) {
  const parts = sanitizeInput(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return {
    main: parts[0] || "",
    variants: parts.slice(1).join(", ")
  };
}

function parseStoredSizeChart(value) {
  const result = {};
  const source = String(value || "");
  ["S", "M", "L", "XL"].forEach((size) => {
    const match = source.match(new RegExp(`${size}\\(([^/)]*)/([^)]*)\\)`, "i"));
    result[`${size}Chest`] = match ? sanitizeInput(match[1]) : "";
    result[`${size}Length`] = match ? sanitizeInput(match[2]) : "";
  });
  return result;
}

function clearProductDetailsForm() {
  productTitleInput.value = "";
  productCategoryInput.value = "";
  if (productCostPriceInput) productCostPriceInput.value = "";
  if (productProfitInput) productProfitInput.value = "";
  productPriceInput.value = "";
  productStockInput.value = "";
  productColorInput.value = "";
  if (productColorVariantsInput) productColorVariantsInput.value = "";
  if (productSizeInput) productSizeInput.value = "";
  if (productFabricInput) productFabricInput.value = "";
  if (productPatternInput) productPatternInput.value = "";
  if (productFitInput) productFitInput.value = "";
  if (productSleeveInput) productSleeveInput.value = "";
  if (productNeckInput) productNeckInput.value = "";
  if (productOccasionInput) productOccasionInput.value = "";
  if (productCareInput) productCareInput.value = "";
  resetImageUploads();
  if (sizeSChestInput) sizeSChestInput.value = "";
  if (sizeSLengthInput) sizeSLengthInput.value = "";
  if (sizeMChestInput) sizeMChestInput.value = "";
  if (sizeMLengthInput) sizeMLengthInput.value = "";
  if (sizeLChestInput) sizeLChestInput.value = "";
  if (sizeLLengthInput) sizeLLengthInput.value = "";
  if (sizeXLChestInput) sizeXLChestInput.value = "";
  if (sizeXLLengthInput) sizeXLLengthInput.value = "";
  productDescriptionInput.value = "";
  clearDynamicAttributes();
  renderPricingSummary();
}

function ensureCancelProductEditButton() {
  if (!addProductBtn || document.getElementById("cancelProductEditBtn")) return;
  const button = document.createElement("button");
  button.id = "cancelProductEditBtn";
  button.className = "btn ghost";
  button.type = "button";
  button.style.cssText = "margin-top:10px;width:100%;display:none;";
  button.innerHTML = '<i class="fa-solid fa-xmark"></i> Cancel Edit';
  button.addEventListener("click", cancelProductEditMode);
  addProductBtn.insertAdjacentElement("afterend", button);
}

function setProductSubmitButton(text, icon = "fa-paper-plane") {
  if (!addProductBtn) return;
  addProductBtn.innerHTML = `<i class="fa-solid ${icon}"></i> ${text}`;
}

function cancelProductEditMode() {
  editingProductId = null;
  editingProductSnapshot = null;
  clearProductDetailsForm();
  setProductSubmitButton("Submit Product For Verification");
  const cancelBtn = document.getElementById("cancelProductEditBtn");
  if (cancelBtn) cancelBtn.style.display = "none";
  setMsg(productMsg, "Edit cancelled. Product Details form is ready for a new product.", false);
}

function loadProductIntoDetailsForm(product) {
  editingProductId = Number(product.id || 0);
  editingProductSnapshot = product;
  ensureSelectValue(productCategoryInput, product.category || "");
  handleCategorySelected(product.attributes || {});
  const colors = splitStoredColors(product.color || "");
  ensureSelectValue(productColorInput, colors.main);
  ensureSelectValue(productFabricInput, product.fabric || "");
  ensureSelectValue(productPatternInput, product.print_pattern || product.pattern || "");
  ensureSelectValue(productFitInput, product.fit_type || product.fit || "");
  ensureSelectValue(productSleeveInput, product.sleeve_type || product.sleeve || "");
  ensureSelectValue(productNeckInput, product.neck_type || product.neck || "");
  ensureSelectValue(productOccasionInput, product.occasion || "");

  productTitleInput.value = product.title || "";
  productStockInput.value = product.stock_qty ?? product.stock ?? "";
  productPriceInput.value = product.shop_price || product.base_price || product.price || "";
  if (productCostPriceInput) productCostPriceInput.value = product.cost_price || "";
  if (productProfitInput) productProfitInput.value = product.cost_price ? Math.max(safeNumber(productPriceInput.value) - safeNumber(product.cost_price), 0) : "";
  if (productColorVariantsInput) productColorVariantsInput.value = colors.variants;
  if (productSizeInput) productSizeInput.value = product.sizes || "";
  if (productCareInput) productCareInput.value = product.care_instructions || "";
  productDescriptionInput.value = product.description || "";

  const slots = imageSlots();
  setImageUrl(slots[0], product.image_url || "");
  setImageUrl(slots[1], product.image_url_2 || "");
  setImageUrl(slots[2], product.image_url_3 || "");
  setImageUrl(slots[3], product.image_url_4 || "");

  const sizes = parseStoredSizeChart(product.size_chart || "");
  if (sizeSChestInput) sizeSChestInput.value = sizes.SChest || "";
  if (sizeSLengthInput) sizeSLengthInput.value = sizes.SLength || "";
  if (sizeMChestInput) sizeMChestInput.value = sizes.MChest || "";
  if (sizeMLengthInput) sizeMLengthInput.value = sizes.MLength || "";
  if (sizeLChestInput) sizeLChestInput.value = sizes.LChest || "";
  if (sizeLLengthInput) sizeLLengthInput.value = sizes.LLength || "";
  if (sizeXLChestInput) sizeXLChestInput.value = sizes.XLChest || "";
  if (sizeXLLengthInput) sizeXLLengthInput.value = sizes.XLLength || "";

  renderPricingSummary();
  setProductSubmitButton(`Save Changes for Product #${editingProductId}`, "fa-floppy-disk");
  const cancelBtn = document.getElementById("cancelProductEditBtn");
  if (cancelBtn) cancelBtn.style.display = "block";
  productTitleInput.scrollIntoView({ behavior: "smooth", block: "center" });
  productTitleInput.focus();
  setMsg(productMsg, `Product #${editingProductId} loaded in Product Details. Edit fields and save changes.`, false);
}

function showProductSaveNotification(title, body) {
  const existing = document.getElementById("shopProductSaveToast");
  if (existing) existing.remove();
  const toast = document.createElement("div");
  toast.id = "shopProductSaveToast";
  toast.innerHTML = `
    <div style="font-weight:900;font-size:14px;margin-bottom:4px;">${sanitizeInput(title)}</div>
    <div style="font-size:12px;line-height:1.35;opacity:.92;">${sanitizeInput(body)}</div>
  `;
  toast.style.cssText = [
    "position:fixed",
    "right:18px",
    "top:18px",
    "z-index:99999",
    "width:min(360px,calc(100vw - 36px))",
    "padding:14px 16px",
    "border-radius:16px",
    "background:#0f172a",
    "color:#fff",
    "box-shadow:0 22px 60px rgba(15,23,42,.28)",
    "border:1px solid rgba(255,255,255,.12)"
  ].join(";");
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4500);

  if ("Notification" in window && Notification.permission === "granted") {
    try {
      new Notification(title, {
        body,
        tag: "flashfit-product-save",
        icon: "50x100logo.png"
      });
    } catch (_) {}
  }
}

function coreProductPayload(payload) {
  return {
    shop_id: payload.shop_id,
    title: payload.title,
    category: payload.category,
    shop_price: payload.shop_price,
    commission_pct: payload.commission_pct,
    commission_amount: payload.commission_amount,
    delivery_fee: payload.delivery_fee,
    customer_price: payload.customer_price,
    price: payload.price,
    stock_qty: payload.stock_qty,
    color: payload.color,
    sizes: payload.sizes,
    fabric: payload.fabric,
    description: payload.description,
    image_url: payload.image_url,
    submitted_by: payload.submitted_by,
    status: payload.status
  };
}

async function saveEditedProduct(client, productId, payload) {
  const result = await client
    .from("shopkeeper_products")
    .update(payload)
    .eq("id", productId)
    .eq("shop_id", currentShop.id);

  if (!result.error) return result;

  const message = `${result.error.message || ""} ${result.error.details || ""}`.toLowerCase();
  const schemaError = message.includes("schema cache")
    || message.includes("column")
    || message.includes("could not find")
    || message.includes("bad request");
  if (!schemaError) return result;

  console.warn("Full product update failed, retrying with core product fields:", result.error);
  return client
    .from("shopkeeper_products")
    .update(coreProductPayload(payload))
    .eq("id", productId)
    .eq("shop_id", currentShop.id);
}

// Insert with the same schema-tolerant fallback as saveEditedProduct: if the new
// category_id / attributes columns are not present yet (pre-migration), retry with
// the guaranteed core columns so product creation never regresses.
async function saveNewProduct(client, payload) {
  const result = await client.from("shopkeeper_products").insert(payload);
  if (!result.error) return result;

  const message = `${result.error.message || ""} ${result.error.details || ""}`.toLowerCase();
  const schemaError = message.includes("schema cache")
    || message.includes("column")
    || message.includes("could not find")
    || message.includes("bad request");
  if (!schemaError) return result;

  console.warn("Full product insert failed, retrying with core product fields:", result.error);
  return client.from("shopkeeper_products").insert(coreProductPayload(payload));
}

// ----------------------------------------------------
// CATEGORY-DRIVEN DYNAMIC ATTRIBUTES (§8/§10/§11)
// Loads ACTIVE catalog_categories into the category <select> and, when a category
// defines attributes, renders only those fields. Values are stored in the product's
// `attributes` jsonb. Degrades silently to the hardcoded options if the catalog
// tables are not provisioned yet — the existing form keeps working (§75, no mock).
// ----------------------------------------------------

const shopCatalog = { categories: [], attrCache: {} };

function shopSupabase() {
  return window.flashfitDB && typeof window.flashfitDB.getSupabaseClient === "function"
    ? window.flashfitDB.getSupabaseClient()
    : null;
}

function shopEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function populateCategorySelect() {
  const client = shopSupabase();
  if (!client || !productCategoryInput) return;
  let data = null;
  let error = null;
  try {
    ({ data, error } = await client
      .from("catalog_categories")
      .select("id,name,slug,parent_id,status,sort_order")
      .eq("status", "ACTIVE")
      .order("sort_order", { ascending: true }));
  } catch (e) {
    error = e;
  }
  // No catalog yet (unprovisioned / empty / RLS): keep the hardcoded <option>s.
  if (error || !Array.isArray(data) || !data.length) return;

  shopCatalog.categories = data;
  const byId = new Map(data.map((c) => [Number(c.id), c]));
  const pathLabel = (c) => {
    const parent = c.parent_id != null ? byId.get(Number(c.parent_id)) : null;
    return parent ? `${parent.name} › ${c.name}` : c.name;
  };
  const previous = productCategoryInput.value;
  const sorted = data.slice().sort((a, b) => String(pathLabel(a)).localeCompare(String(pathLabel(b))));
  let html = '<option value="">Select Category</option>';
  sorted.forEach((c) => {
    html += `<option value="${shopEscape(c.name)}" data-category-id="${Number(c.id)}">${shopEscape(pathLabel(c))}</option>`;
  });
  productCategoryInput.innerHTML = html;
  if (previous) ensureSelectValue(productCategoryInput, previous);
}

async function handleCategorySelected(prefillValues) {
  const group = document.getElementById("dynamicAttributesGroup");
  const container = document.getElementById("dynamicAttributesContainer");
  if (!container) return;
  const option = productCategoryInput.options[productCategoryInput.selectedIndex];
  const categoryId = option && option.dataset ? Number(option.dataset.categoryId) : NaN;
  if (!Number.isFinite(categoryId) || categoryId <= 0) {
    container.innerHTML = "";
    if (group) group.style.display = "none";
    return;
  }

  let attrs = shopCatalog.attrCache[categoryId];
  if (!attrs) {
    const client = shopSupabase();
    if (!client) { if (group) group.style.display = "none"; return; }
    let data = null;
    let error = null;
    try {
      ({ data, error } = await client
        .from("category_attributes")
        .select("*")
        .eq("category_id", categoryId)
        .eq("is_enabled", true)
        .order("sort_order", { ascending: true }));
    } catch (e) {
      error = e;
    }
    if (error) { container.innerHTML = ""; if (group) group.style.display = "none"; return; }
    attrs = data || [];
    shopCatalog.attrCache[categoryId] = attrs;
  }
  renderDynamicAttributeInputs(attrs, prefillValues || {});
}

function dynamicAttributeFieldHtml(attr, value) {
  const key = attr.attribute_key;
  const type = attr.input_type;
  const opts = Array.isArray(attr.options) ? attr.options : [];
  const label = shopEscape(attr.name) + (attr.is_required ? ' <span style="color:#dc2626">*</span>' : "");
  const base = `data-attr-field="1" data-attr-key="${shopEscape(key)}" data-attr-type="${shopEscape(type)}"${attr.is_required ? ' data-attr-required="1"' : ""}`;
  const wrap = (inner) => `<div class="form-group"><label>${label}</label>${inner}</div>`;
  const val = value == null ? "" : value;

  if (type === "dropdown" || type === "size" || (type === "color" && opts.length)) {
    const inList = opts.some((o) => String(o) === String(val));
    let optionsHtml = '<option value="">Select…</option>';
    opts.forEach((o) => {
      optionsHtml += `<option value="${shopEscape(o)}" ${String(o) === String(val) ? "selected" : ""}>${shopEscape(o)}</option>`;
    });
    const otherShown = val !== "" && !inList;
    optionsHtml += `<option value="__other__" ${otherShown ? "selected" : ""}>Other / Not listed…</option>`;
    return wrap(
      `<select ${base} data-attr-role="select">${optionsHtml}</select>`
      + `<input type="text" ${base} data-attr-role="other" data-attr-other="${shopEscape(key)}" placeholder="Enter ${shopEscape(attr.name)}" value="${otherShown ? shopEscape(val) : ""}" style="margin-top:6px;display:${otherShown ? "" : "none"};">`
    );
  }
  if (type === "multi-select") {
    const arr = Array.isArray(val) ? val.map(String) : (val ? [String(val)] : []);
    const boxes = opts.map((o) =>
      `<label style="display:inline-flex;align-items:center;gap:6px;margin-right:12px;font-weight:600;"><input type="checkbox" ${base} data-attr-role="multi" value="${shopEscape(o)}" ${arr.includes(String(o)) ? "checked" : ""}> ${shopEscape(o)}</label>`
    ).join("");
    return wrap(`<div>${boxes || '<span style="color:#94a3b8;">No options configured.</span>'}</div>`);
  }
  if (type === "checkbox" || type === "toggle") {
    const checked = val === true || val === "true" || val === "yes";
    return wrap(`<label style="display:inline-flex;align-items:center;gap:8px;font-weight:600;"><input type="checkbox" ${base} data-attr-role="bool" ${checked ? "checked" : ""}> Yes</label>`);
  }
  if (type === "rich_text") {
    return wrap(`<textarea ${base} data-attr-role="text" placeholder="${shopEscape(attr.name)}">${shopEscape(val)}</textarea>`);
  }
  if (type === "number") {
    return wrap(`<input type="number" ${base} data-attr-role="text" value="${shopEscape(val)}" placeholder="${shopEscape(attr.name)}">`);
  }
  if (type === "date") {
    return wrap(`<input type="date" ${base} data-attr-role="text" value="${shopEscape(val)}">`);
  }
  const inputType = type === "url" || type === "image" ? "url" : "text";
  return wrap(`<input type="${inputType}" ${base} data-attr-role="text" value="${shopEscape(val)}" placeholder="${shopEscape(attr.name)}">`);
}

function renderDynamicAttributeInputs(attrs, values) {
  const group = document.getElementById("dynamicAttributesGroup");
  const container = document.getElementById("dynamicAttributesContainer");
  if (!container) return;
  if (!attrs.length) {
    container.innerHTML = "";
    if (group) group.style.display = "none";
    return;
  }
  container.innerHTML = attrs.map((a) => dynamicAttributeFieldHtml(a, values ? values[a.attribute_key] : "")).join("");
  if (group) group.style.display = "";
  container.querySelectorAll('select[data-attr-role="select"]').forEach((sel) => {
    sel.addEventListener("change", () => {
      const other = container.querySelector(`input[data-attr-other="${sel.dataset.attrKey}"]`);
      if (other) other.style.display = sel.value === "__other__" ? "" : "none";
    });
  });
}

function collectDynamicAttributes() {
  const container = document.getElementById("dynamicAttributesContainer");
  const output = { values: {}, missing: [] };
  if (!container) return output;
  const keys = new Set();
  container.querySelectorAll("[data-attr-field]").forEach((el) => keys.add(el.dataset.attrKey));
  keys.forEach((key) => {
    const els = [...container.querySelectorAll(`[data-attr-key="${key}"]`)];
    const first = els[0];
    if (!first) return;
    const type = first.dataset.attrType;
    let value;
    if (type === "multi-select") {
      value = els.filter((e) => e.dataset.attrRole === "multi" && e.checked).map((e) => e.value);
    } else if (type === "checkbox" || type === "toggle") {
      const box = els.find((e) => e.dataset.attrRole === "bool");
      value = !!(box && box.checked);
    } else if (els.some((e) => e.dataset.attrRole === "select")) {
      const sel = els.find((e) => e.dataset.attrRole === "select");
      if (sel && sel.value === "__other__") {
        const other = els.find((e) => e.dataset.attrRole === "other");
        value = other ? sanitizeInput(String(other.value).trim()) : "";
      } else {
        value = sel ? sanitizeInput(sel.value) : "";
      }
    } else {
      const inp = els.find((e) => e.dataset.attrRole === "text") || first;
      value = inp ? sanitizeInput(String(inp.value).trim()) : "";
    }
    const isBool = type === "checkbox" || type === "toggle";
    const empty = value === "" || (Array.isArray(value) && value.length === 0);
    if (first.dataset.attrRequired === "1" && empty && !isBool) output.missing.push(attributeLabelForKey(container, key));
    if (isBool) {
      if (value) output.values[key] = true;
    } else if (!empty) {
      output.values[key] = value;
    }
  });
  return output;
}

function attributeLabelForKey(container, key) {
  const field = container.querySelector(`[data-attr-key="${key}"]`);
  const label = field ? field.closest(".form-group")?.querySelector("label") : null;
  return label ? label.textContent.replace("*", "").trim() : key;
}

function clearDynamicAttributes() {
  const container = document.getElementById("dynamicAttributesContainer");
  const group = document.getElementById("dynamicAttributesGroup");
  if (container) container.innerHTML = "";
  if (group) group.style.display = "none";
}

/**
 * Calculates correct pricing summary based on live database values
 */
function calculatePricingSummary() {
  const costPrice = safeNumber(productCostPriceInput ? productCostPriceInput.value : 0);
  const sellerPrice = safeNumber(productPriceInput ? productPriceInput.value : 0);
  const derivedProfit = Math.max(sellerPrice - costPrice, 0);
  const platformFee = Math.round((sellerPrice * COMMISSION) / 100);
  const gatewayFee = Math.round((sellerPrice * GATEWAY) / 100);
  const customerPrice = sellerPrice + platformFee + gatewayFee + DELIVERY;

  return {
    costPrice,
    sellerPrice,
    profit: derivedProfit,
    platformFee,
    gatewayFee,
    deliveryFee: DELIVERY,
    customerPrice,
    settlement: sellerPrice
  };
}

/**
 * Renders the Live Price Chart with actual percentages and delivery charges
 */
function renderPricingSummary() {
  const summary = calculatePricingSummary();
  if (productProfitInput) {
    productProfitInput.value = summary.profit ? String(summary.profit) : productProfitInput.value === "" ? "" : String(summary.profit);
  }

  // Update percentages in UI labels dynamically!
  const gatewayLabelSpan = document.getElementById("calcGatewayValue")?.previousElementSibling;
  if (gatewayLabelSpan) {
    gatewayLabelSpan.textContent = `Gateway Fee (${GATEWAY}%)`;
  }
  const platformLabelSpan = document.getElementById("calcPlatformValue")?.previousElementSibling;
  if (platformLabelSpan) {
    platformLabelSpan.textContent = `Platform Fee (${COMMISSION}%)`;
  }

  if (calcCostValue) calcCostValue.textContent = formatRs(summary.costPrice);
  if (calcProfitValue) calcProfitValue.textContent = formatRs(summary.profit);
  if (calcSellerPriceValue) calcSellerPriceValue.textContent = formatRs(summary.sellerPrice);
  if (calcPlatformValue) calcPlatformValue.textContent = formatRs(summary.platformFee);
  if (calcGatewayValue) calcGatewayValue.textContent = formatRs(summary.gatewayFee);
  if (calcDeliveryValue) calcDeliveryValue.textContent = formatRs(summary.deliveryFee);
  if (calcCustomerValue) calcCustomerValue.textContent = formatRs(summary.customerPrice);
  if (calcSettlementValue) calcSettlementValue.textContent = formatRs(summary.settlement);
  if (livePricingPreview) livePricingPreview.textContent = `Your customer will see ${formatRs(summary.customerPrice)}`;
  if (liveSettlementNote) liveSettlementNote.textContent = `Settlement to shop: ${formatRs(summary.settlement)}`;
}

function syncSellerPriceFromProfit() {
  const costPrice = safeNumber(productCostPriceInput ? productCostPriceInput.value : 0);
  const profit = safeNumber(productProfitInput ? productProfitInput.value : 0);
  if (productPriceInput) {
    productPriceInput.value = String(costPrice + profit);
  }
  renderPricingSummary();
}

function syncProfitFromSellerPrice() {
  renderPricingSummary();
}

function sortBy(items, key, order) {
  const list = [...items];
  list.sort((a, b) => {
    const av = (a[key] || "").toString().toLowerCase();
    const bv = (b[key] || "").toString().toLowerCase();
    if (av < bv) return order === "asc" ? -1 : 1;
    if (av > bv) return order === "asc" ? 1 : -1;
    return 0;
  });
  return list;
}

function table(headers, rows) {
  if (!rows.length) return '<div class="empty-orders">No data found.</div>';
  return `
    <div class="table-responsive">
      <table>
        <thead><tr>${headers.map((x) => `<th>${x}</th>`).join("")}</tr></thead>
        <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody>
      </table>
    </div>
  `;
}

function badge(status) {
  const s = (status || "").toLowerCase();
  if (s === "approved") return '<span class="pill approved">Approved</span>';
  if (s === "rejected") return '<span class="pill rejected">Rejected</span>';
  return '<span class="pill pending">Pending</span>';
}

function paymentBadge(status) {
  const s = (status || "").toLowerCase();
  if (s === "paid") return '<span class="pill approved">Paid</span>';
  if (s === "failed") return '<span class="pill rejected">Failed</span>';
  return '<span class="pill pending">Pending</span>';
}

function paymentModeLabel(row) {
  if (row.payment_reference === "COD") return "Cash on Delivery";
  if (row.payment_mode === "PAYU") return "PayU Online Payment";
  return row.payment_mode || "-";
}

function orderStageBadge(status) {
  const s = (status || "").toLowerCase();
  if (s === "delivered") return '<span class="pill approved">Delivered</span>';
  if (s === "rejected") return '<span class="pill rejected">Rejected</span>';
  if (s === "out_for_delivery") return '<span class="pill approved">Out For Delivery</span>';
  if (s === "accepted") return '<span class="pill approved">Accepted</span>';
  if (s === "packed") return '<span class="pill pending">Packed</span>';
  return '<span class="pill pending">Pending</span>';
}

function deliveryPartnerBadge(status) {
  const s = (status || "").toLowerCase();
  if (s === "delivered") return '<span class="pill approved">Partner Delivered</span>';
  if (s === "on_the_way") return '<span class="pill approved">Partner On The Way</span>';
  if (s === "accepted") return '<span class="pill approved">Partner Accepted</span>';
  if (s === "assigned") return '<span class="pill pending">Partner Assigned</span>';
  return '<span class="pill pending">Partner Pending</span>';
}

async function logSellerActivity(action, entityType, entityId, payload) {
  const client = getClient();
  if (!client || !currentShop) return;
  await client.from("admin_activity_logs").insert({
    admin_username: `shop:${currentShop.shop_login_id || currentShop.id}`,
    action,
    entity_type: entityType,
    entity_id: entityId ? String(entityId) : null,
    payload: payload || null
  });
}

function isLikelyUrl(value) {
  if (!value) return false;
  return /^https?:\/\/.+/i.test(value);
}

function normalizeKey(key) {
  return sanitizeInput(key).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function parseListingDraft(rawText) {
  const source = (rawText || "").trim();
  if (!source) return null;

  try {
    const parsed = JSON.parse(source);
    if (parsed && typeof parsed === "object") return parsed;
  } catch (_) {}

  const result = {};
  source.split(/\r?\n/).forEach((line) => {
    const cleanLine = line.trim();
    if (!cleanLine) return;
    const match = cleanLine.match(/^([^:=-]+)\s*[:=-]\s*(.+)$/);
    if (!match) return;
    result[normalizeKey(match[1])] = match[2].trim();
  });
  return Object.keys(result).length ? result : null;
}

function getImportedValue(data, keys) {
  for (const key of keys) {
    if (data[key] !== undefined && data[key] !== null && String(data[key]).trim() !== "") {
      return String(data[key]).trim();
    }
  }
  return "";
}

function applyImportedListing(rawData) {
  const data = {};
  Object.keys(rawData || {}).forEach((key) => {
    data[normalizeKey(key)] = rawData[key];
  });

  const imageBundle = getImportedValue(data, ["images", "image_urls", "gallery", "photos"]);
  const splitImages = imageBundle
    ? imageBundle.split(/[,\n|]/).map((item) => sanitizeInput(item)).filter(Boolean)
    : [];

  const fieldMap = [
    [productTitleInput, ["title", "product_title", "product_name", "name"]],
    [productCategoryInput, ["category", "product_category"]],
    [productPriceInput, ["shop_price", "selling_price", "price", "supplier_price"]],
    [productStockInput, ["stock", "stock_qty", "quantity"]],
    [productColorInput, ["color", "colour"]],
    [productColorVariantsInput, ["color_variants", "colour_variants", "available_colors", "available_colours"]],
    [productSizeInput, ["sizes", "size", "available_sizes"]],
    [productFabricInput, ["fabric", "material"]],
    [productPatternInput, ["print_pattern", "pattern", "print"]],
    [productFitInput, ["fit_type", "fit"]],
    [productSleeveInput, ["sleeve_type", "sleeve"]],
    [productNeckInput, ["neck_type", "neck"]],
    [productOccasionInput, ["occasion"]],
    [productCareInput, ["care_instructions", "care", "wash_care"]],
    [productImageInput, ["image_1", "image1", "main_image", "image_url"]],
    [productImage2Input, ["image_2", "image2", "image_url_2"]],
    [productImage3Input, ["image_3", "image3", "image_url_3"]],
    [productImage4Input, ["image_4", "image4", "image_url_4"]],
    [productDescriptionInput, ["description", "product_description", "details", "about"]]
  ];

  fieldMap.forEach(([element, keys]) => {
    if (!element) return; // Guarded against missing inputs
    const value = getImportedValue(data, keys);
    if (!value) return;
    if (element.tagName === "SELECT") {
      ensureSelectValue(element, value);
      return;
    }
    element.value = sanitizeInput(value);
  });

  if (productCostPriceInput && !productCostPriceInput.value && productPriceInput && productPriceInput.value) {
    productCostPriceInput.value = productPriceInput.value;
  }

  if (!productImageInput.value && splitImages[0]) productImageInput.value = splitImages[0];
  if (!productImage2Input.value && splitImages[1]) productImage2Input.value = splitImages[1];
  if (!productImage3Input.value && splitImages[2]) productImage3Input.value = splitImages[2];
  if (!productImage4Input.value && splitImages[3]) productImage4Input.value = splitImages[3];
  syncImagePreviewsFromUrls();

  const sizeChart = getImportedValue(data, ["size_chart", "sizechart"]);
  const normalizedSizeChart = sizeChart.toLowerCase();
  const extractMeasure = (size, metric) => {
    const regex = new RegExp(`${size}[^\\d]{0,12}${metric}[^\\d]{0,6}(\\d+(?:\\.\\d+)?)`, "i");
    const match = normalizedSizeChart.match(regex);
    return match ? match[1] : "";
  };

  if (sizeChart) {
    if (sizeSChestInput && !sizeSChestInput.value) sizeSChestInput.value = extractMeasure("s", "chest");
    if (sizeSLengthInput && !sizeSLengthInput.value) sizeSLengthInput.value = extractMeasure("s", "length");
    if (sizeMChestInput && !sizeMChestInput.value) sizeMChestInput.value = extractMeasure("m", "chest");
    if (sizeMLengthInput && !sizeMLengthInput.value) sizeMLengthInput.value = extractMeasure("m", "length");
    if (sizeLChestInput && !sizeLChestInput.value) sizeLChestInput.value = extractMeasure("l", "chest");
    if (sizeLLengthInput && !sizeLLengthInput.value) sizeLLengthInput.value = extractMeasure("l", "length");
    if (sizeXLChestInput && !sizeXLChestInput.value) sizeXLChestInput.value = extractMeasure("xl", "chest");
    if (sizeXLLengthInput && !sizeXLLengthInput.value) sizeXLLengthInput.value = extractMeasure("xl", "length");
  }
  renderPricingSummary();
}

function readMetaContent(doc, selectors) {
  for (const selector of selectors) {
    const node = doc.querySelector(selector);
    const value = node ? node.getAttribute("content") || node.textContent || "" : "";
    if (value && value.trim()) return value.trim();
  }
  return "";
}

function parseJsonLdProduct(doc) {
  const scripts = [...doc.querySelectorAll('script[type="application/ld+json"]')];
  for (const script of scripts) {
    try {
      const parsed = JSON.parse(script.textContent || "");
      const nodes = Array.isArray(parsed) ? parsed : [parsed];
      for (const node of nodes) {
        const type = String(node["@type"] || "").toLowerCase();
        if (type === "product") return node;
        if (Array.isArray(node["@graph"])) {
          const productNode = node["@graph"].find((item) => String(item["@type"] || "").toLowerCase() === "product");
          if (productNode) return productNode;
        }
      }
    } catch (_) {}
  }
  return null;
}

function detectCategoryFromText(text) {
  const source = (text || "").toLowerCase();
  if (!source) return "";
  if (source.includes("kurti") || source.includes("kurta")) return "Kurtis";
  if (source.includes("top") || source.includes("shirt") || source.includes("blouse")) return "Tops";
  if (source.includes("t-shirt") || source.includes("tshirt")) return "T-Shirts";
  if (source.includes("jeans") || source.includes("denim")) return "Jeans";
  if (source.includes("dress") || source.includes("gown") || source.includes("lehenga") || source.includes("choli")) return "Dresses";
  if (source.includes("saree")) return "Sarees";
  return "";
}

function detectKeywordValue(text, valuesMap) {
  const source = (text || "").toLowerCase();
  for (const [keyword, value] of valuesMap) {
    if (source.includes(keyword)) return value;
  }
  return "";
}

function detectSizesFromText(text) {
  const source = (text || "").toLowerCase();
  if (source.includes("free size")) return "Free Size";
  if (source.includes("xxl")) return "S,M,L,XL,XXL";
  if (source.includes("xl")) return "S,M,L,XL";
  if (source.includes("kids") || source.includes("toddler") || source.includes("baby girl") || source.includes("baby boy")) return "0-1Y,1-2Y,2-3Y,3-4Y";
  return "S,M,L,XL";
}

function detectCareFromText(text) {
  const source = (text || "").toLowerCase();
  if (source.includes("dry clean")) return "Dry Clean";
  if (source.includes("hand wash")) return "Hand Wash";
  return "Machine Wash";
}

function buildHeuristicAttributes(text) {
  const source = (text || "").toLowerCase();
  return {
    category: detectCategoryFromText(source),
    color: detectKeywordValue(source, [
      ["yellow", "Yellow"],
      ["red", "Red"],
      ["maroon", "Maroon"],
      ["pink", "Pink"],
      ["green", "Green"],
      ["olive", "Olive Green"],
      ["blue", "Blue"],
      ["navy", "Navy Blue"],
      ["black", "Black"],
      ["white", "White"],
      ["cream", "Cream"],
      ["beige", "Beige"],
      ["orange", "Orange"],
      ["purple", "Purple"],
      ["grey", "Grey"],
      ["gray", "Grey"]
    ]),
    sizes: detectSizesFromText(source),
    fabric: detectKeywordValue(source, [
      ["cotton", "Cotton"],
      ["rayon", "Rayon"],
      ["georgette", "Georgette"],
      ["chiffon", "Chiffon"],
      ["silk", "Silk"],
      ["linen", "Linen"],
      ["denim", "Denim"],
      ["polyester", "Polyester"],
      ["net", "Net"]
    ]),
    print_pattern: detectKeywordValue(source, [
      ["embroidered", "Embroidered"],
      ["floral", "Floral"],
      ["printed", "Printed"],
      ["print", "Printed"],
      ["solid", "Solid"],
      ["striped", "Striped"],
      ["checked", "Checked"],
      ["ethnic", "Ethnic"],
      ["party wear", "Party Wear"]
    ]),
    fit_type: detectKeywordValue(source, [
      ["slim", "Slim"],
      ["relaxed", "Relaxed"],
      ["regular", "Regular"],
      ["a-line", "A-Line"],
      ["fit and flare", "Fit And Flare"]
    ]) || "Regular",
    sleeve_type: detectKeywordValue(source, [
      ["sleeveless", "Sleeveless"],
      ["half sleeve", "Half Sleeve"],
      ["full sleeve", "Full Sleeve"],
      ["3/4", "3/4 Sleeve"],
      ["three fourth", "3/4 Sleeve"]
    ]) || "3/4 Sleeve",
    neck_type: detectKeywordValue(source, [
      ["v-neck", "V-Neck"],
      ["round neck", "Round Neck"],
      ["square neck", "Square Neck"],
      ["boat neck", "Boat Neck"],
      ["collar", "Collar Neck"]
    ]) || "Round Neck",
    occasion: detectKeywordValue(source, [
      ["party wear", "Party"],
      ["party", "Party"],
      ["wedding", "Wedding"],
      ["festive", "Festive"],
      ["casual", "Casual"],
      ["office", "Office"],
      ["daily wear", "Casual"]
    ]) || "Casual",
    care_instructions: detectCareFromText(source)
  };
}

function looksBlockedContent(text) {
  const source = (text || "").toLowerCase();
  return source.includes("access denied")
    || source.includes("request blocked")
    || source.includes("temporarily unavailable")
    || source.includes("captcha")
    || source.includes("forbidden");
}

function inferImportDataFromUrl(sourceUrl) {
  try {
    const url = new URL(sourceUrl);
    const rawPath = decodeURIComponent(url.pathname || "");
    const slugPart = rawPath
      .split("/")
      .filter(Boolean)
      .find((segment) => segment.includes("-") && !/^p$/i.test(segment)) || "";

    const cleanTitle = slugPart
      .replace(/[_+]/g, " ")
      .replace(/-+/g, " ")
      .replace(/\b(p|pd|prod|product)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (match) => match.toUpperCase());
    const heuristics = buildHeuristicAttributes(cleanTitle);

    return {
      title: cleanTitle,
      category: heuristics.category,
      description: cleanTitle ? `Imported from product link: ${cleanTitle}` : "",
      color: heuristics.color,
      sizes: heuristics.sizes,
      fabric: heuristics.fabric,
      print_pattern: heuristics.print_pattern,
      fit_type: heuristics.fit_type,
      sleeve_type: heuristics.sleeve_type,
      neck_type: heuristics.neck_type,
      occasion: heuristics.occasion,
      care_instructions: heuristics.care_instructions,
      source_url: sourceUrl
    };
  } catch (_) {
    return {
      title: "",
      category: "",
      description: "",
      source_url: sourceUrl
    };
  }
}

function buildImportDataFromDocument(doc, sourceUrl) {
  const productNode = parseJsonLdProduct(doc) || {};
  const offers = Array.isArray(productNode.offers) ? productNode.offers[0] : (productNode.offers || {});
  const images = []
    .concat(productNode.image || [])
    .concat(readMetaContent(doc, ['meta[property="og:image"]', 'meta[name="twitter:image"]']) || [])
    .map((item) => sanitizeInput(typeof item === "string" ? item : ""))
    .filter(Boolean);

  const rawTitle = productNode.name || readMetaContent(doc, ['meta[property="og:title"]', 'meta[name="twitter:title"]']) || doc.title || "";
  const rawDescription = productNode.description || readMetaContent(doc, ['meta[property="og:description"]', 'meta[name="description"]', 'meta[name="twitter:description"]']) || "";
  const fallback = inferImportDataFromUrl(sourceUrl);
  const blocked = looksBlockedContent(rawTitle) || looksBlockedContent(rawDescription) || looksBlockedContent(doc.body ? doc.body.textContent : "");
  const title = blocked ? fallback.title : rawTitle;
  const description = blocked ? fallback.description : rawDescription;
  const heuristicText = `${title} ${description} ${doc.body ? doc.body.textContent || "" : ""}`;
  const heuristics = buildHeuristicAttributes(heuristicText);
  const category = productNode.category || heuristics.category || fallback.category;

  return {
    title,
    description,
    image_1: images[0] || "",
    image_2: images[1] || "",
    image_3: images[2] || "",
    image_4: images[3] || "",
    images: images.join(", "),
    category,
    color: productNode.color || heuristics.color || fallback.color || "",
    sizes: Array.isArray(productNode.size) ? productNode.size.join(",") : (productNode.size || heuristics.sizes || fallback.sizes || ""),
    fabric: productNode.material || heuristics.fabric || fallback.fabric || "",
    print_pattern: heuristics.print_pattern || fallback.print_pattern || "",
    fit_type: heuristics.fit_type || fallback.fit_type || "",
    sleeve_type: heuristics.sleeve_type || fallback.sleeve_type || "",
    neck_type: heuristics.neck_type || fallback.neck_type || "",
    occasion: heuristics.occasion || fallback.occasion || "",
    care_instructions: heuristics.care_instructions || fallback.care_instructions || "",
    shop_price: offers.price || "",
    stock: offers.inventoryLevel || "",
    source_url: sourceUrl
  };
}

async function importListingFromUrl() {
  const sourceUrl = sanitizeInput(importListingUrlInput ? importListingUrlInput.value : "");
  if (!isLikelyUrl(sourceUrl)) {
    setMsg(importListingMsg, "Please enter a valid product link.", true);
    return;
  }

  setMsg(importListingMsg, "Fetching product details...", false);

  try {
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(sourceUrl)}`;
    const response = await fetch(proxyUrl);
    if (!response.ok) {
      throw new Error(`Fetch failed with status ${response.status}`);
    }

    const html = await response.text();
    if (looksBlockedContent(html)) {
      const fallback = inferImportDataFromUrl(sourceUrl);
      if (!fallback.title) {
        throw new Error("Remote site blocked product data");
      }
      applyImportedListing(fallback);
      saveImportedListing(fallback);
      downloadListingJson(fallback);
      setMsg(importListingMsg, "The source site blocked full metadata access. Basic product details were imported and a JSON draft was generated.", false);
      return;
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const importData = buildImportDataFromDocument(doc, sourceUrl);

    if (!importData.title && !importData.description && !importData.image_1) {
      throw new Error("Page metadata unavailable");
    }

    applyImportedListing(importData);
    saveImportedListing(importData);
    downloadListingJson(importData);
    setMsg(importListingMsg, "The product link was imported successfully and a JSON draft was generated automatically.", false);
  } catch (error) {
    setMsg(importListingMsg, `The product link could not be imported: ${error.message}. Please use the manual import box instead.`, true);
  }
}

function setActiveTab(tab, updateHash = true) {
  tabButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === tab));
  tabContents.forEach((content) => {
    content.classList.toggle("active", content.dataset.tab === tab);
    if (content.dataset.tab === tab) {
      content.style.opacity = "0";
      setTimeout(() => { content.style.opacity = "1"; }, 10);
    }
  });
  if (updateHash) window.location.hash = tab;
  
  if (window.innerWidth <= 1200) {
    if (shopSidebar) shopSidebar.classList.remove("show");
    if (shopSidebarOverlay) shopSidebarOverlay.classList.remove("show");
  }
}

async function loadDeliveryPartners() {
  const client = getClient();
  if (!client) return [];
  const { data } = await client
    .from("delivery_partners")
    .select("*")
    .eq("active", true)
    .eq("on_duty", true);
  deliveryPartnersMap = new Map((data || []).map((row) => [Number(row.id), row]));
  return data || [];
}

function getPartnerDisplayName(partnerId) {
  const partner = deliveryPartnersMap.get(Number(partnerId || 0));
  if (!partner) return "-";
  let name = `${partner.full_name || "Partner"}`;
  if (partner.phone) {
    name += ` <a href="tel:${partner.phone}" style="color:var(--brand); text-decoration:none; margin-left:5px;"><i class="fa-solid fa-phone"></i> Call</a>`;
  }
  return name;
}

async function autoAssignDeliveryPartner(row) {
  const client = getClient();
  if (!client || !row || row.delivery_partner_id || !currentShop) return row;
  const pincodeMatch = (currentShop.pincode || "").trim();
  if (!pincodeMatch) return row;

  let partners = [...deliveryPartnersMap.values()].filter((partner) => (partner.service_pincode || "").trim() === pincodeMatch);
  if (!partners.length) {
    partners = await loadDeliveryPartners();
    partners = partners.filter((partner) => (partner.service_pincode || "").trim() === pincodeMatch);
  }
  
  if (!partners.length) return row;

  const scoredPartners = partners.map(p => {
    const distance = 0.5 + ((p.id % 10) / 4);
    const idleMinutes = 5 + (p.id % 20);
    const score = (5 - distance) + (idleMinutes / 5);
    return { ...p, autoScore: score };
  });

  scoredPartners.sort((a, b) => b.autoScore - a.autoScore);
  const partner = scoredPartners[0];

  let payload = {
    delivery_partner_id: partner.id,
    delivery_partner_status: "assigned",
    partner_updated_at: new Date().toISOString()
  };
  let { error } = await client
    .from("seller_orders")
    .update(payload)
    .eq("id", row.id)
    .eq("shop_id", currentShop.id);
  
  if (error && /delivery_partner_status|partner_updated_at/i.test(error.message || "")) {
    payload = { delivery_partner_id: partner.id };
    ({ error } = await client
      .from("seller_orders")
      .update(payload)
      .eq("id", row.id)
      .eq("shop_id", currentShop.id));
  }
  if (error) return row;
  row.delivery_partner_id = partner.id;
  if ("delivery_partner_status" in payload) row.delivery_partner_status = "assigned";
  return row;
}

async function syncUserOrderStatus(orderNumber, nextStatus) {
  const client = getClient();
  if (!client || !orderNumber) return;
  await client
    .from("user_orders")
    .update({ status: nextStatus })
    .eq("order_number", orderNumber);
}

function stopRealtime() {
  const client = getClient();
  if (!client) return;
  if (ordersChannel) client.removeChannel(ordersChannel);
  if (stockChannel) client.removeChannel(stockChannel);
  if (reviewsChannel) client.removeChannel(reviewsChannel);
  if (settingsChannel) client.removeChannel(settingsChannel);
  ordersChannel = null;
  stockChannel = null;
  reviewsChannel = null;
  settingsChannel = null;
}

function startRealtime() {
  if (!window.flashfitDB || !currentShop) return;
  stopRealtime();

  ordersChannel = window.flashfitDB.subscribeOrderUpdates((payload) => {
    const row = payload && payload.new ? payload.new : null;
    if (!row || Number(row.shop_id) !== Number(currentShop.id)) return;
    if (window.AppInventor) window.AppInventor.setWebViewString("NEW_ORDER_UPDATE");
    renderOrders();
  });

  stockChannel = window.flashfitDB.subscribeStockUpdates((payload) => {
    const row = payload && payload.new ? payload.new : null;
    if (!row || Number(row.shop_id) !== Number(currentShop.id)) return;
    renderProducts();
  });

  reviewsChannel = window.flashfitDB.subscribeReviewUpdates((payload) => {
    const row = payload && payload.new ? payload.new : null;
    if (!row || Number(row.shop_id) !== Number(currentShop.id)) return;
    renderReviews();
  });

  // Real-time subscription for dynamic platform charges
  const client = getClient();
  if (client) {
    settingsChannel = client
      .channel("pricing-settings")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "site_settings"
        },
        () => {
          refreshAll(); // Reload settings and update everything instantly
        }
      )
      .subscribe();
  }
}

async function renderProducts() {
  const client = getClient();
  if (!client || !currentShop) return;
  const { data, error } = await client
    .from("shopkeeper_products")
    .select("*")
    .eq("shop_id", currentShop.id);

  if (error) {
    console.error("Error loading products:", error);
    setMsg(productMsg, "Failed to load products: " + error.message, true);
    return;
  }

  const sorted = sortBy(data || [], "title", sellerSortSelect.value);
  statProducts.textContent = String(sorted.length);
  statPending.textContent = String(sorted.filter((x) => (x.status || "").toLowerCase() === "pending").length);
  statApproved.textContent = String(sorted.filter((x) => (x.status || "").toLowerCase() === "approved").length);

  productsTable.innerHTML = table(
    ["ID", "Product", "Category", "Attributes", "Price", "Stock", "Status", "Actions"],
    sorted.map((row) => [
      `<span style="color:var(--muted); font-weight:600;">#${row.id}</span>`,
      `<div style="font-weight:700; color:var(--sidebar);">${row.title || "-"}</div>`,
      `<span class="pill" style="background:var(--bg); color:var(--ink);">${row.category || "-"}</span>`,
      `<small>${row.color || "-"} | ${row.sizes || "-"}</small>`,
      `<strong>${formatRs(row.customer_price || row.price || 0)}</strong>`,
      Number(row.stock_qty || 0) <= 0 ? '<span class="pill rejected">Out of Stock</span>' : `<span class="pill approved">${row.stock_qty}</span>`,
      badge(row.status),
      `<div style="display:flex; gap:8px;">
        <button class="btn ghost btn-sm push-product-btn" data-id="${row.id}" title="Push to Live / Bump Visibility">
          <i class="fa-solid fa-rocket"></i> Push
        </button>
        <button class="btn ghost btn-sm edit-product-btn" data-id="${row.id}" title="Load to Update Form">
          <i class="fa-solid fa-pen-to-square"></i>
        </button>
      </div>`
    ])
  );
}

async function renderOrders() {
  const client = getClient();
  if (!client || !currentShop) return;
  await loadDeliveryPartners();
  const { data, error } = await client
    .from("seller_orders")
    .select("*")
    .eq("shop_id", currentShop.id);
    
  if (error) {
    console.error("Error loading orders:", error);
    setMsg(orderMsg, "Failed to load orders: " + error.message, true);
    return;
  }

  const search = (orderSearchInput.value || "").toLowerCase().trim();
  let rows = data || [];

  const pCount = rows.filter((row) => (row.order_status || "").toLowerCase() === "pending").length;
  if (pendingCountSpan) pendingCountSpan.textContent = String(pCount);

  if (search) {
    rows = rows.filter((row) => {
      return [
        row.order_number,
        row.customer_name,
        row.customer_mobile,
        row.product_title,
        row.order_status
      ].some((v) => (v || "").toString().toLowerCase().includes(search));
    });
  }

  if (activeOrderTab !== "all") {
    rows = rows.filter((row) => {
      const s = (row.order_status || "").toLowerCase();
      if (activeOrderTab === "on_hold") return s === "on_hold";
      if (activeOrderTab === "pending") return s === "pending";
      if (activeOrderTab === "ready_to_ship") return ["accepted", "packed"].includes(s);
      if (activeOrderTab === "shipped") return s === "out_for_delivery";
      if (activeOrderTab === "cancelled") return s === "rejected";
      return s === activeOrderTab;
    });
  }
  rows = await Promise.all(rows.map((row) => autoAssignDeliveryPartner(row)));
  rows = sortBy(rows, "customer_name", sellerSortSelect.value);
  statOrders.textContent = String(rows.length);

  if (ordersSummaryGrid) {
    const totalValue = rows.reduce((sum, row) => sum + Number(row.total || 0), 0);
    const pendingCount = rows.filter((row) => (row.order_status || "").toLowerCase() === "pending").length;
    const packedCount = rows.filter((row) => ["accepted", "packed"].includes((row.order_status || "").toLowerCase())).length;
    const deliveryCount = rows.filter((row) => (row.order_status || "").toLowerCase() === "out_for_delivery").length;
    const deliveredCount = rows.filter((row) => (row.order_status || "").toLowerCase() === "delivered").length;
    ordersSummaryGrid.innerHTML = `
      <article><p>Total Orders</p><strong>${rows.length}</strong></article>
      <article><p>Pending</p><strong>${pendingCount}</strong></article>
      <article><p>Packed</p><strong>${packedCount}</strong></article>
      <article><p>Shipped</p><strong>${deliveryCount}</strong></article>
      <article><p>GMV</p><strong>Rs ${totalValue}</strong></article>
    `;
  }

  if (!rows.length) {
    ordersTable.innerHTML = '<div class="empty-orders">No orders matched this filter.</div>';
    return;
  }

  ordersTable.innerHTML = `
    <div class="orders-list">
      ${rows.map((row) => {
        const orderTime = new Date(row.created_at).getTime();
        const now = Date.now();
        const isDelayed = row.order_status === "pending" && (now - orderTime) > (2 * 60 * 1000);
        
        return `
        <article class="order-card ${isDelayed ? "delayed-alert" : ""}">
          ${isDelayed ? '<div class="alert-strip"><i class="fa-solid fa-triangle-exclamation"></i> URGENT: Action Needed (> 2m)</div>' : ""}
          <div class="order-card-top">
            <div>
              <h4><i class="fa-solid fa-hashtag"></i> ${row.order_number || "-"}</h4>
              <p class="order-card-sub"><i class="fa-solid fa-box-open"></i> ${row.product_title || "-"} • Qty ${row.qty || 0}</p>
              <div class="order-pill-row">
                ${orderStageBadge(row.order_status)}
                ${paymentBadge(row.payment_status)}
                ${deliveryPartnerBadge(row.delivery_partner_status)}
              </div>
            </div>
            <div style="text-align: right;">
              <p class="order-card-sub"><i class="fa-regular fa-calendar-days"></i> ${row.created_at ? new Date(row.created_at).toLocaleString() : "-"}</p>
              <strong style="display: block; margin-top: 4px; color: var(--brand);">Rs ${row.total || 0}</strong>
            </div>
          </div>
          <div class="order-meta-grid">
            <div><span>Customer</span><strong><i class="fa-solid fa-user"></i> ${row.customer_name || "-"}</strong></div>
            <div><span>Mobile</span><strong><i class="fa-solid fa-phone"></i> ${row.customer_mobile || "-"}</strong></div>
            <div><span>Settlement</span><strong>Rs ${row.shop_price || 0}</strong></div>
            <div><span>Payment</span><strong>${paymentModeLabel(row)}</strong></div>
            <div><span>Partner</span><strong>${getPartnerDisplayName(row.delivery_partner_id)}</strong></div>
            <div><span>Partner Status</span><strong>${(row.delivery_partner_status || "not_assigned").replace(/_/g, " ")}</strong></div>
          </div>
          <p class="order-address"><i class="fa-solid fa-location-dot"></i> ${row.customer_address || "-"}</p>
          <div class="order-actions-grid">
            <div class="form-group">
              <label>Assign Partner ID</label>
              <input class="delivery-partner-input" data-id="${row.id}" type="number" min="1" placeholder="Partner ID" value="${row.delivery_partner_id || ""}" />
            </div>
            <div class="form-group">
              <label>Payment Reference (UTR)</label>
              <input class="payment-ref-input" data-id="${row.id}" type="text" placeholder="UTR Number" value="${row.payment_reference || ""}" />
            </div>
            <div class="form-group">
              <label>Lifecycle Stage</label>
              <select class="order-status-select" data-id="${row.id}">
                <option value="pending" ${row.order_status === "pending" ? "selected" : ""}>Pending</option>
                <option value="on_hold" ${row.order_status === "on_hold" ? "selected" : ""}>On Hold</option>
                <option value="accepted" ${row.order_status === "accepted" ? "selected" : ""}>Accepted (Ready)</option>
                <option value="packed" ${row.order_status === "packed" ? "selected" : ""}>Packed (Ready)</option>
                <option value="out_for_delivery" ${row.order_status === "out_for_delivery" ? "selected" : ""}>Out For Delivery</option>
                <option value="delivered" ${row.order_status === "delivered" ? "selected" : ""}>Delivered</option>
                <option value="rejected" ${row.order_status === "rejected" ? "selected" : ""}>Cancelled</option>
              </select>
            </div>
            <button class="btn ghost order-status-save" data-id="${row.id}" type="button"><i class="fa-solid fa-floppy-disk"></i> Save</button>
            <div style="display: flex; gap: 8px;">
              <button class="btn ghost payment-paid-btn" data-id="${row.id}" title="Mark Paid" type="button"><i class="fa-solid fa-check"></i> Paid</button>
              <button class="btn ghost payment-failed-btn" data-id="${row.id}" title="Mark Failed" type="button"><i class="fa-solid fa-xmark"></i> Fail</button>
            </div>
            <button class="btn primary auto-assign-btn" data-id="${row.id}" type="button"><i class="fa-solid fa-robot"></i> Auto Assign</button>
            ${row.order_status !== 'pending' && row.order_status !== 'rejected' ? `
            <button class="btn ghost generate-label-btn" data-id="${row.id}" type="button">
              <i class="fa-solid fa-print"></i> Print Label
            </button>
            ` : ""}
          </div>
        </article>
      `}).join("")}
    </div>
  `;
}

async function updateOrderStatus(orderId, nextStatus, deliveryPartnerId) {
  const client = getClient();
  if (!client || !currentShop) return;
  const nowIso = new Date().toISOString();
  const payload = { order_status: nextStatus };
  
  if (nextStatus === "accepted") {
    payload.accepted_at = nowIso;
    payload.delivery_otp = Math.floor(1000 + Math.random() * 9000).toString();
    const { data: currentOrder } = await client.from("seller_orders").select("*").eq("id", orderId).maybeSingle();
    if (currentOrder && !currentOrder.delivery_partner_id) {
      const assignedOrder = await autoAssignDeliveryPartner(currentOrder);
      if (assignedOrder && assignedOrder.delivery_partner_id) {
        payload.delivery_partner_id = assignedOrder.delivery_partner_id;
        payload.delivery_partner_status = "assigned";
      }
    }
  }
  if (nextStatus === "packed") payload.packed_at = nowIso;
  if (nextStatus === "out_for_delivery") {
    if (!deliveryPartnerId) {
      setMsg(orderMsg, "A delivery partner must be assigned before shipping.", true);
      return;
    }
    payload.out_for_delivery_at = nowIso;
    payload.delivery_partner_id = deliveryPartnerId;
    payload.delivery_partner_status = "on_the_way";
    payload.partner_updated_at = nowIso;
  }
  if (nextStatus === "delivered") payload.delivered_at = nowIso;
  if (nextStatus === "rejected") payload.rejected_at = nowIso;

  let { error } = await client
    .from("seller_orders")
    .update(payload)
    .eq("id", orderId)
    .eq("shop_id", currentShop.id);

  if (error && /delivery_partner_status|partner_updated_at/i.test(error.message || "")) {
    const fallbackPayload = { ...payload };
    delete fallbackPayload.delivery_partner_status;
    delete fallbackPayload.partner_updated_at;
    ({ error } = await client
      .from("seller_orders")
      .update(fallbackPayload)
      .eq("id", orderId)
      .eq("shop_id", currentShop.id));
  }
  if (error) {
    setMsg(orderMsg, error.message, true);
    return;
  }
  const { data: orderData } = await client.from("seller_orders").select("order_number,user_id,delivery_partner_id").eq("id", orderId).maybeSingle();
  if (orderData && orderData.order_number) {
    await syncUserOrderStatus(orderData.order_number, nextStatus);
  }
  if (window.flashfitNotifications && orderData && orderData.order_number) {
    const eventMap = {
      accepted: "order_accepted",
      packed: "order_update",
      out_for_delivery: "delivery_update",
      delivered: "order_delivered",
      rejected: "order_cancelled"
    };
    const eventType = eventMap[nextStatus] || "order_update";
    await window.flashfitNotifications.create(eventType, {
      title: `Order ${nextStatus.replace(/_/g, " ")}: ${orderData.order_number}`,
      body: `${currentShop.shop_name || "Shop"} updated order ${orderData.order_number} to ${nextStatus.replace(/_/g, " ")}.`,
      shopId: currentShop.id,
      deliveryPartnerId: deliveryPartnerId || payload.delivery_partner_id || orderData.delivery_partner_id || null,
      userId: orderData.user_id || null,
      orderId,
      orderNumber: orderData.order_number,
      entityType: "seller_orders",
      entityId: orderId,
      metadata: payload
    });
  }
  await logSellerActivity("shop_update_order_status", "seller_orders", orderId, payload);
  setMsg(orderMsg, `Order status updated to "${nextStatus}" successfully.`, false);
  if (nextStatus === "accepted") {
    setTimeout(() => generateOrderLabel(orderId), 500);
  }
  await renderOrders();
}

async function generateOrderLabel(orderId) {
  const client = getClient();
  if (!client || !currentShop) return;

  const { data: order } = await client
    .from("seller_orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();

  if (!order) return;

  document.getElementById("lblCustomerAddress").textContent = order.customer_address || "N/A";
  document.getElementById("lblShopAddress").textContent = `${currentShop.shop_name}\n${currentShop.address}\nPIN: ${currentShop.pincode}`;
  document.getElementById("lblPaymentMode").textContent = order.payment_reference === "COD" ? "CASH ON DELIVERY" : "PREPAID";
  
  const partner = deliveryPartnersMap.get(Number(order.delivery_partner_id || 0));
  document.getElementById("lblPartnerName").textContent = partner ? partner.full_name : "Assigning...";
  document.getElementById("lblPartnerId").textContent = order.delivery_partner_id || "-";
  document.getElementById("lblPartnerMobile").textContent = partner ? partner.mobile : "-";

  document.getElementById("lblSKU").textContent = `SKU-${order.id}`;
  document.getElementById("lblSize").textContent = order.product_title.split("|")[1] || "Free";
  document.getElementById("lblQty").textContent = order.qty || 1;
  document.getElementById("lblColor").textContent = order.product_title.split("|")[0] || "-";
  document.getElementById("lblOrderNo").textContent = order.order_number;
  document.getElementById("lblTotalAmount").textContent = `Rs ${order.total}`;

  const orderCode = order.order_number || `FF-${order.id}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&margin=0&data=${encodeURIComponent(orderCode)}`;
  document.getElementById("lblQRCodeImg").src = qrUrl;

  const labelHtml = document.getElementById("labelTemplateContainer").innerHTML;
  const printWindow = window.open('', '_blank', 'width=800,height=900');

  printWindow.document.write(`
    <html>
      <head>
        <title>FlashFit Order Label - ${order.order_number}</title>
        <link rel="stylesheet" href="shopkeeper-panel.css">
        <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
        <style>
          body { padding: 20px; background: #f0f0f0; display: flex; flex-direction: column; align-items: center; }
          .print-controls { margin-bottom: 20px; display: flex; gap: 10px; }
          @media print { .print-controls { display: none; } body { background: #fff; padding: 0; } }
        </style>
      </head>
      <body>
        <div class="print-controls">
          <button onclick="window.print()" class="btn primary" style="padding:10px 20px; cursor:pointer;">Print Label</button>
          <button id="downloadPdf" class="btn ghost" style="padding:10px 20px; cursor:pointer;">Download PDF</button>
          <button onclick="window.close()" class="btn ghost" style="padding:10px 20px; cursor:pointer;">Close</button>
        </div>
        <div id="printArea">${labelHtml}</div>
        
        <script>
          const orderCode = ${JSON.stringify(orderCode)};
          const qrUrl = ${JSON.stringify(qrUrl)};

          function renderLabelCodes() {
            const qr = document.querySelector('#printArea #lblQRCodeImg');
            const barcode = document.querySelector('#printArea #lblBarcode');
            if (qr) qr.src = qrUrl;
            if (barcode && window.JsBarcode) {
              JsBarcode(barcode, orderCode, {
                format: 'CODE128',
                width: 1.55,
                height: 44,
                margin: 0,
                displayValue: true,
                font: 'Arial',
                fontSize: 12,
                textMargin: 2,
                lineColor: '#000'
              });
            }
          }

          window.addEventListener('load', renderLabelCodes);
          setTimeout(renderLabelCodes, 250);

          document.getElementById('downloadPdf').onclick = function() {
            const element = document.getElementById('flashfitLabel');
            const opt = {
              margin: 10,
              filename: 'FlashFit_Label_${order.order_number}.pdf',
              image: { type: 'jpeg', quality: 0.98 },
              html2canvas: { scale: 2 },
              jsPDF: { unit: 'mm', format: 'a6', orientation: 'portrait' }
            };
            html2pdf().set(opt).from(element).save();
          };
        </script>
      </body>
    </html>
  `);
  
  printWindow.document.close();
}

async function updatePaymentStatus(orderId, status, reference) {
  const client = getClient();
  if (!client || !currentShop) return;

  if (status === "paid" && reference) {
    const { data: existing } = await client
      .from("seller_orders")
      .select("id, order_number")
      .eq("payment_reference", reference)
      .neq("id", orderId)
      .maybeSingle();
    
    if (existing) {
      setMsg(orderMsg, `Duplicate UTR detected. ${reference} is already used in order #${existing.order_number}.`, true);
      return;
    }
  }

  const payload = { payment_status: status };
  if (reference) payload.payment_reference = reference;
  if (status === "paid") payload.payment_received_at = new Date().toISOString();

  const { error } = await client
    .from("seller_orders")
    .update(payload)
    .eq("id", orderId)
    .eq("shop_id", currentShop.id);

  if (error) {
    setMsg(orderMsg, error.message, true);
    return;
  }
  if (window.flashfitNotifications) {
    const { data: notifyOrder } = await client
      .from("seller_orders")
      .select("order_number,user_id,shop_id,total,payment_mode")
      .eq("id", orderId)
      .maybeSingle();
    if (notifyOrder && status === "paid") {
      await window.flashfitNotifications.create("payment_success", {
        title: `Payment Received ${notifyOrder.order_number}`,
        body: `Payment received for order ${notifyOrder.order_number}.`,
        shopId: notifyOrder.shop_id || currentShop.id,
        userId: notifyOrder.user_id || null,
        orderId,
        orderNumber: notifyOrder.order_number,
        entityType: "seller_orders",
        entityId: orderId,
        metadata: {
          payment_mode: notifyOrder.payment_mode,
          payment_reference: reference || "",
          total: notifyOrder.total || 0
        }
      });
    }
  }
  setMsg(orderMsg, `Payment status updated to "${status}".`, false);
  await logSellerActivity("shop_update_payment_status", "seller_orders", orderId, payload);
  await renderOrders();
}

async function renderReviews() {
  if (!window.flashfitDB || !window.flashfitDB.loadShopProductReviews || !currentShop) return;
  const data = await window.flashfitDB.loadShopProductReviews(currentShop.id);
  const rows = sortBy(data || [], "created_at", "desc");
  reviewsTable.innerHTML = table(
    ["Product", "Rating", "Review", "Customer", "Date"],
    rows.map((row) => [
      `<span style="font-weight:600;">#${row.product_id}</span>`,
      `<span style="color:#eab308;"><i class="fa-solid fa-star"></i> ${row.rating || 0}/5</span>`,
      `<div style="max-width:300px; font-size:0.9rem;">${row.review_text || "-"}</div>`,
      `<span style="color:var(--muted);"><i class="fa-solid fa-circle-user"></i> ${row.user_id ? row.user_id.slice(0, 8) : "Guest"}</span>`,
      `<small>${row.created_at ? new Date(row.created_at).toLocaleDateString() : "-"}</small>`
    ])
  );
}

function renderProfileCard() {
  if (!currentShop) return;
  shopProfileCard.innerHTML = `
    <div class="profile-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 20px;">
      <div class="profile-item">
        <label><i class="fa-solid fa-shop"></i> Shop Name</label>
        <strong>${currentShop.shop_name || "-"}</strong>
      </div>
      <div class="profile-item">
        <label><i class="fa-solid fa-user-tie"></i> Owner</label>
        <strong>${currentShop.owner_name || "-"}</strong>
      </div>
      <div class="profile-item">
        <label><i class="fa-solid fa-phone"></i> Mobile</label>
        <strong>${currentShop.mobile || "-"}</strong>
      </div>
      <div class="profile-item">
        <label><i class="fa-solid fa-location-pin"></i> Pincode</label>
        <strong>${currentShop.pincode || "-"}</strong>
      </div>
      <div class="profile-item">
        <label><i class="fa-solid fa-fingerprint"></i> Login ID</label>
        <strong>${currentShop.shop_login_id || "-"}</strong>
      </div>
      <div class="profile-item">
        <label><i class="fa-solid fa-circle-check"></i> Status</label>
        <span class="pill approved">${currentShop.status || "-"}</span>
      </div>
    </div>
    <div class="profile-address" style="margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--line);">
      <label><i class="fa-solid fa-map-location-dot"></i> Business Address</label>
      <p style="margin-top: 8px; color: var(--sidebar); line-height: 1.6;">${currentShop.address || "-"}</p>
    </div>
  `;
}

async function refreshAll() {
  // 1. Core database parameters are loaded before calculating metrics, payouts, or charts!
  await loadPricingSettings();

  await Promise.all([
    renderProducts(),
    renderOrders(),
    renderEarnings(),
    renderReviews(),
    renderProfileCard(),
    updateDashboardStats(),
    updateEarningsChart()
  ]);
}

async function renderEarnings() {
  const client = getClient();
  if (!client || !currentShop) return;
  const et = document.getElementById("earningsTable");
  if (!et) return;

  const { data: orders, error } = await client
    .from("seller_orders")
    .select("*")
    .eq("shop_id", currentShop.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error loading earnings:", error);
    et.innerHTML = `<div class="empty-orders">Error loading data: ${error.message}</div>`;
    return;
  }

  if (!orders || orders.length === 0) {
    et.innerHTML = '<div class="empty-orders">No orders are available at the moment.</div>';
    return;
  }

  let totalEarned = 0;
  let totalDeducted = 0;

  const rows = orders.map(order => {
    const total = Number(order.total || 0);
    const status = (order.order_status || "").toLowerCase();
    const isCOD = (order.payment_mode || "").toLowerCase() === "cod";

    // Dynamic fee math using loaded settings
    const gatewayFee = total * (GATEWAY / 100);
    const platformFee = order.commission_amount || (total * (COMMISSION / 100));
    const deliveryFee = order.delivery_charge || DELIVERY;
    const totalDed = gatewayFee + platformFee + deliveryFee;

    const isPaid = ["paid", "success"].includes((order.payment_status || "").toLowerCase());
    const shopPayout = (status === "delivered") ? Math.max(0, total - totalDed) : 0;

    if (status === "delivered") {
      totalEarned += shopPayout;
      totalDeducted += totalDed;
    }

    const statusColors = {
      delivered: 'approved', pending: 'pending', accepted: 'pending',
      out_for_delivery: 'pending', cancelled: 'rejected', rejected: 'rejected',
      returned: 'rejected', on_hold: 'pending'
    };
    const statusBadge = `<span class="pill ${statusColors[status] || 'pending'}">${status.replace(/_/g, ' ')}</span>`;
    const paymentBadge_ = isCOD
      ? `<span style="background:#fff5eb;color:var(--brand);padding:3px 8px;border-radius:99px;font-size:0.75rem;font-weight:700;">COD</span>`
      : `<span style="background:#ecfdf3;color:#027a48;padding:3px 8px;border-radius:99px;font-size:0.75rem;font-weight:700;">Online</span>`;

    return [
      `<div><strong>${order.order_number}</strong><br><small style="color:var(--muted)">${new Date(order.created_at).toLocaleDateString('en-IN')}</small></div>`,
      `<div>${statusBadge}<br>${paymentBadge_}</div>`,
      `<strong>₹${total.toLocaleString()}</strong>`,
      `<div style="color:var(--muted); font-size:0.82rem; line-height:1.8;">
        ₹${gatewayFee.toFixed(0)} GTW (${GATEWAY}%)<br>
        ₹${platformFee.toFixed(0)} PLT (${COMMISSION}%)<br>
        ₹${deliveryFee} DLV
      </div>`,
      status === "delivered"
        ? `<strong style="color:#027a48; font-size:1rem;">₹${shopPayout.toLocaleString()}</strong>`
        : `<span style="color:var(--muted);">—</span>`,
      isPaid
        ? '<span class="pill approved">✓ Settled</span>'
        : `<span class="pill pending">Processing</span>`
    ];
  });

  const summaryBar = `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:20px;">
      <div style="background:var(--brand-light);padding:16px;border-radius:12px;border:1px solid #ffe4bc;">
        <p style="margin:0 0 4px;font-size:0.75rem;font-weight:700;color:var(--brand);text-transform:uppercase;">Net Earned</p>
        <strong style="font-size:1.5rem;color:var(--brand);">₹${Math.floor(totalEarned).toLocaleString()}</strong>
      </div>
      <div style="background:#fef3f2;padding:16px;border-radius:12px;border:1px solid #fecdca;">
        <p style="margin:0 0 4px;font-size:0.75rem;font-weight:700;color:#b42318;text-transform:uppercase;">Total Deducted</p>
        <strong style="font-size:1.5rem;color:#b42318;">₹${Math.floor(totalDeducted).toLocaleString()}</strong>
      </div>
      <div style="background:#f0fdf9;padding:16px;border-radius:12px;border:1px solid #cffafe;">
        <p style="margin:0 0 4px;font-size:0.75rem;font-weight:700;color:#0e7490;text-transform:uppercase;">Orders in Report</p>
        <strong style="font-size:1.5rem;color:#0e7490;">${orders.length}</strong>
      </div>
    </div>
  `;

  et.innerHTML = summaryBar + table(
    ["Order", "Status / Pay Mode", "Gross Sale", "Deductions", "Shop Payout", "Settlement"],
    rows
  );
}

async function updateDashboardStats() {
  const client = getClient();
  if (!client || !currentShop) return;

  const [{ count: pCount }, { data: pData }, { data: oData }] = await Promise.all([
    client.from("shopkeeper_products").select("*", { count: "exact", head: true }).eq("shop_id", currentShop.id),
    client.from("shopkeeper_products").select("status").eq("shop_id", currentShop.id),
    client.from("seller_orders").select("*").eq("shop_id", currentShop.id)
  ]);

  const orders = oData || [];
  const products = pData || [];

  statProducts.textContent = String(pCount || 0);
  statPending.textContent = String(products.filter(p => p.status === "pending").length);
  statApproved.textContent = String(products.filter(p => p.status === "approved").length);
  statOrders.textContent = String(orders.length);

  let totalGMV = 0;
  let netEarnings = 0;
  let deliveredCount = 0;
  let returnsCount = 0;

  orders.forEach(order => {
    const total = Number(order.total || 0);
    const status = (order.order_status || "").toLowerCase();
    
    if (!["cancelled", "rejected", "failed"].includes(status)) {
      totalGMV += total;
    }

    if (status === "delivered") {
      deliveredCount++;
      const gatewayFee = total * (GATEWAY / 100);
      const commission = order.commission_amount || (total * (COMMISSION / 100));
      const deliveryFee = order.delivery_charge || DELIVERY;
      const deductions = gatewayFee + commission + deliveryFee;
      netEarnings += Math.max(0, total - deductions);
    }

    if (["returned", "cancelled", "rejected"].includes(status)) {
      returnsCount++;
    }
  });

  const statEarnings = document.getElementById("statEarnings");
  const statDelivered = document.getElementById("statDelivered");
  const statReturns = document.getElementById("statReturns");
  const statGMV = document.getElementById("statGMV");

  if (statEarnings) statEarnings.textContent = `₹${Math.floor(netEarnings).toLocaleString()}`;
  if (statDelivered) statDelivered.textContent = String(deliveredCount);
  if (statReturns) statReturns.textContent = String(returnsCount);
  if (statGMV) statGMV.textContent = `₹${totalGMV.toLocaleString()}`;
}

async function updateEarningsChart() {
  const client = getClient();
  if (!client || !currentShop) return;
  
  const { data: orders } = await client
    .from("seller_orders")
    .select("created_at, total")
    .eq("shop_id", currentShop.id)
    .order("created_at", { ascending: true });
    
  if (!orders || !orders.length) {
    if (chartStatSales) chartStatSales.textContent = "Rs 0";
    if (chartStatOrders) chartStatOrders.textContent = "0";
    return;
  }

  const totalSales = orders.reduce((sum, o) => sum + Number(o.total || 0), 0);
  if (chartStatSales) chartStatSales.textContent = formatRs(totalSales);
  if (chartStatOrders) chartStatOrders.textContent = String(orders.length);

  const dailyData = new Map();
  orders.forEach(o => {
    const date = new Date(o.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    const current = dailyData.get(date) || { total: 0, count: 0 };
    current.total += Number(o.total || 0);
    current.count += 1;
    dailyData.set(date, current);
  });

  const labels = [...dailyData.keys()];
  const earnings = labels.map(l => dailyData.get(l).total);
  const counts = labels.map(l => dailyData.get(l).count);

  const canvas = document.getElementById('earningsChart');
  if (!canvas) return; // Safeguard
  const ctx = canvas.getContext('2d');

  if (window.earningsChart) {
    window.earningsChart.destroy();
  }

  window.earningsChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Earnings (Rs)',
          data: earnings,
          borderColor: '#ff7a00',
          backgroundColor: 'rgba(255, 122, 0, 0.1)',
          fill: true,
          tension: 0.4,
          borderWidth: 3,
          pointBackgroundColor: '#fff',
          pointBorderColor: '#ff7a00',
          pointBorderWidth: 2,
          yAxisID: 'y'
        },
        {
          label: 'Orders',
          data: counts,
          borderColor: '#1a2340',
          backgroundColor: 'transparent',
          fill: false,
          tension: 0.4,
          borderWidth: 2,
          borderDash: [5, 5],
          pointBackgroundColor: '#fff',
          pointBorderColor: '#1a2340',
          pointBorderWidth: 2,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { font: { family: 'Outfit', weight: '600' } } },
        tooltip: {
          backgroundColor: '#1a2340',
          titleFont: { family: 'Outfit' },
          bodyFont: { family: 'Outfit' },
          padding: 12,
          cornerRadius: 10,
          displayColors: false
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { family: 'Outfit' } } },
        y: { 
          beginAtZero: true, 
          position: 'left',
          grid: { color: '#f0f0f0' },
          ticks: { font: { family: 'Outfit' }, callback: value => '₹' + value }
        },
        y1: {
          beginAtZero: true,
          position: 'right',
          grid: { display: false },
          ticks: { font: { family: 'Outfit' } }
        }
      }
    }
  });
}

async function loginShopkeeper() {
  const loginId = sanitizeInput(shopLoginId.value);
  const password = sanitizeInput(shopLoginPassword.value);
  if (!loginId || !password) {
    setMsg(shopLoginMsg, "Please enter both the shop login ID and password.", true);
    return;
  }

  const client = getClient();
  if (!client) {
    setMsg(shopLoginMsg, "Supabase client unavailable.", true);
    return;
  }

  const { data, error } = await client
    .from("shops")
    .select("*")
    .eq("shop_login_id", loginId)
    .eq("shop_password", password)
    .eq("status", "active")
    .maybeSingle();

  if (error || !data) {
    setMsg(shopLoginMsg, "Invalid shop credentials.", true);
    return;
  }

  currentShop = data;
  localStorage.setItem(SHOP_SESSION_KEY, JSON.stringify(currentShop));
  shopLoginView.classList.add("hidden");
  shopAppView.classList.remove("hidden");
  shopIdentity.textContent = `${currentShop.shop_name} (${currentShop.shop_login_id})`;
  shopSessionText.textContent = `Logged in as ${currentShop.shop_login_id}`;
  
  startRealtime();
  await refreshAll();
}

function logoutShopkeeper() {
  stopRealtime();
  currentShop = null;
  localStorage.removeItem(SHOP_SESSION_KEY);
  shopAppView.classList.add("hidden");
  shopLoginView.classList.remove("hidden");
  shopLoginPassword.value = "";
}

function importListingDraft() {
  const parsed = parseListingDraft(importListingInput ? importListingInput.value : "");
  if (!parsed) {
    setMsg(importListingMsg, "Please paste valid listing text or JSON data.", true);
    return;
  }

  applyImportedListing(parsed);
  saveImportedListing(parsed);
  setMsg(importListingMsg, "The listing draft was imported. Please review and submit.", false);
}

async function submitProduct() {
  if (!currentShop) return;
  const isEditing = !!editingProductId;
  const originalButtonHtml = addProductBtn ? addProductBtn.innerHTML : "";
  if (addProductBtn) {
    addProductBtn.disabled = true;
    addProductBtn.innerHTML = isEditing
      ? '<i class="fa-solid fa-spinner fa-spin"></i> Uploading & Saving...'
      : '<i class="fa-solid fa-spinner fa-spin"></i> Uploading & Submitting...';
  }
  try {
    await uploadSelectedProductImages();
  } catch (error) {
    setUploadMsg(error.message, "error");
    setMsg(productMsg, error.message, true);
    if (addProductBtn) {
      addProductBtn.disabled = false;
      addProductBtn.innerHTML = originalButtonHtml;
    }
    return;
  }

  const pricing = calculatePricingSummary();
  const shopPrice = pricing.sellerPrice;
  const commissionAmount = pricing.platformFee;
  const customerPrice = pricing.customerPrice;
  const selectedColor = sanitizeInput(productColorInput.value);
  const colorVariants = sanitizeInput(productColorVariantsInput?.value || "");
  const finalColor = [selectedColor, colorVariants]
    .filter(Boolean)
    .join(colorVariants && selectedColor ? ", " : "");

  // Safeguarded against missing HTML form inputs
  const payload = {
    shop_id: currentShop.id,
    title: sanitizeInput(productTitleInput.value),
    category: sanitizeInput(productCategoryInput.value),
    cost_price: safeNumber(productCostPriceInput?.value || 0),
    shop_price: shopPrice,
    commission_pct: COMMISSION,
    commission_amount: commissionAmount,
    delivery_fee: DELIVERY,
    customer_price: customerPrice,
    price: customerPrice,
    stock_qty: safeNumber(productStockInput.value),
    color: finalColor,
    sizes: sanitizeInput(productSizeInput?.value || "S,M,L,XL"),
    fabric: sanitizeInput(productFabricInput?.value || "Cotton"),
    print_pattern: sanitizeInput(productPatternInput?.value || "Solid"),
    fit_type: sanitizeInput(productFitInput?.value || "Regular"),
    sleeve_type: sanitizeInput(productSleeveInput?.value || "3/4 Sleeve"),
    neck_type: sanitizeInput(productNeckInput?.value || "Round Neck"),
    occasion: sanitizeInput(productOccasionInput?.value || "Casual"),
    care_instructions: sanitizeInput(productCareInput?.value || "Machine Wash"),
    image_url: sanitizeInput(productImageInput.value),
    image_url_2: sanitizeInput(productImage2Input?.value || ""),
    image_url_3: sanitizeInput(productImage3Input?.value || ""),
    image_url_4: sanitizeInput(productImage4Input?.value || ""),
    size_chart: sanitizeInput(
      `S(${(sizeSChestInput?.value) || "-"}/${(sizeSLengthInput?.value) || "-"}) `
      + `M(${(sizeMChestInput?.value) || "-"}/${(sizeMLengthInput?.value) || "-"}) `
      + `L(${(sizeLChestInput?.value) || "-"}/${(sizeLLengthInput?.value) || "-"}) `
      + `XL(${(sizeXLChestInput?.value) || "-"}/${(sizeXLLengthInput?.value) || "-"})`
    ),
    description: sanitizeInput(productDescriptionInput.value),
    submitted_by: currentShop.shop_login_id,
    status: "pending"
  };

  // Dynamic taxonomy: resolve the selected category's id (if the option came from the
  // catalog) and gather the category-specific attribute values into the jsonb column.
  // `category` (free text) is still written above so customer-side filtering is unchanged.
  const categoryOption = productCategoryInput.options[productCategoryInput.selectedIndex];
  const selectedCategoryId = categoryOption && categoryOption.dataset ? Number(categoryOption.dataset.categoryId) : NaN;
  payload.category_id = Number.isFinite(selectedCategoryId) && selectedCategoryId > 0 ? selectedCategoryId : null;
  const dynamicAttributes = collectDynamicAttributes();
  payload.attributes = dynamicAttributes.values;

  // Safe Validation: Only check variables that exist in the physical form!
  if (!payload.title || !payload.category || payload.shop_price <= 0 || payload.stock_qty < 0 || !payload.color || !payload.image_url || !payload.description) {
    setMsg(productMsg, "Please fill all required fields: Title, Category, Price, Stock, Color, Main Photo, and Description.", true);
    if (addProductBtn) {
      addProductBtn.disabled = false;
      addProductBtn.innerHTML = originalButtonHtml;
    }
    return;
  }

  if (dynamicAttributes.missing.length) {
    setMsg(productMsg, `Please fill the required category detail(s): ${dynamicAttributes.missing.join(", ")}.`, true);
    if (addProductBtn) {
      addProductBtn.disabled = false;
      addProductBtn.innerHTML = originalButtonHtml;
    }
    return;
  }

  if (!isLikelyUrl(payload.image_url)) {
    setMsg(productMsg, "Main photo upload failed. Please select the image again.", true);
    if (addProductBtn) {
      addProductBtn.disabled = false;
      addProductBtn.innerHTML = originalButtonHtml;
    }
    return;
  }

  const client = getClient();
  if (!client) {
    setMsg(productMsg, "Database connection not ready. Please refresh and try again.", true);
    if (addProductBtn) {
      addProductBtn.disabled = false;
      addProductBtn.innerHTML = originalButtonHtml;
    }
    return;
  }

  const { error } = isEditing
    ? await saveEditedProduct(client, editingProductId, payload)
    : await saveNewProduct(client, payload);
  if (error) {
    console.error("Product submit failed:", error);
    setMsg(productMsg, error.message || error.details || "Product save failed. Please check database columns.", true);
    if (addProductBtn) {
      addProductBtn.disabled = false;
      addProductBtn.innerHTML = originalButtonHtml;
    }
    return;
  }

  if (window.flashfitNotifications) {
    try {
      await window.flashfitNotifications.create(isEditing ? "product_update" : "new_product_submitted", {
        title: `${isEditing ? "Product Updated" : "New Product"}: ${payload.title}`,
        body: `Shop ${currentShop.shop_name} ${isEditing ? "updated a product and sent it for review" : "submitted a new product for review"}.`,
        shopId: currentShop.id,
        entityType: "shopkeeper_products",
        entityId: isEditing ? editingProductId : payload.title,
        metadata: { productId: isEditing ? editingProductId : null, mode: isEditing ? "edit" : "create" }
      });
    } catch (notifyError) {
      console.warn("Product notification failed:", notifyError);
    }
  }

  editingProductId = null;
  editingProductSnapshot = null;
  clearProductDetailsForm();
  setProductSubmitButton("Submit Product For Verification");
  const cancelBtn = document.getElementById("cancelProductEditBtn");
  if (cancelBtn) cancelBtn.style.display = "none";
  if (isEditing) {
    showProductSaveNotification(
      "Your Product Saved Successfully",
      `${payload.title} has been updated and sent for review. Product Details form has been cleared.`
    );
  }
  setMsg(
    productMsg,
    isEditing
      ? `Your product save/update successful. Product Details form cleared. Base Price: Rs ${shopPrice}, Customer Price: Rs ${customerPrice}.`
      : `Product submitted successfully. Base Price: Rs ${shopPrice}, Customer Price: Rs ${customerPrice}.`,
    false
  );
  try {
    await renderProducts();
  } catch (renderError) {
    console.warn("Product saved, but list refresh failed:", renderError);
  }
  if (addProductBtn) {
    addProductBtn.disabled = false;
    setProductSubmitButton("Submit Product For Verification");
  }
}

async function updateProductPriceStock() {
  if (!currentShop) return;
  const productId = Number(updateProductIdInput.value || 0);
  const newShopPrice = safeNumber(updatePriceInput.value);
  const newStock = safeNumber(updateStockInput.value);

  if (!productId || newShopPrice < 0 || newStock < 0) {
    setMsg(productMsg, "Product ID, price and stock must be valid numbers.", true);
    return;
  }
  const commissionAmount = Math.round((newShopPrice * COMMISSION) / 100);
  const customerPrice = newShopPrice + commissionAmount + DELIVERY;

  const client = getClient();
  const { error } = await client
    .from("shopkeeper_products")
    .update({
      shop_price: newShopPrice,
      commission_pct: COMMISSION,
      commission_amount: commissionAmount,
      delivery_fee: DELIVERY,
      customer_price: customerPrice,
      price: customerPrice,
      stock_qty: newStock
    })
    .eq("id", productId)
    .eq("shop_id", currentShop.id);

  if (error) {
    setMsg(productMsg, error.message, true);
    return;
  }

  if (window.flashfitNotifications && newStock <= 5) {
    await window.flashfitNotifications.create("low_stock_alert", {
      title: `Low Stock: ID #${productId}`,
      body: `Product #${productId} is running low on stock (${newStock} left).`,
      shopId: currentShop.id,
      entityType: "shopkeeper_products",
      entityId: productId
    });
  }

  setMsg(productMsg, `Updated. Base price Rs ${newShopPrice}, Platform Fee Rs ${commissionAmount}, Customer Price Rs ${customerPrice}.`, false);
  updateProductIdInput.value = "";
  updatePriceInput.value = "";
  updateStockInput.value = "";
  await renderProducts();
}

function wireEvents() {
  ensureCancelProductEditButton();
  shopLoginBtn.addEventListener("click", loginShopkeeper);
  shopLoginPassword.addEventListener("keydown", (event) => {
    if (event.key === "Enter") loginShopkeeper();
  });
  shopLogoutBtn.addEventListener("click", logoutShopkeeper);

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => setActiveTab(btn.dataset.tab));
  });

  window.addEventListener("hashchange", () => {
    const hash = window.location.hash.replace("#", "");
    if (hash && tabButtons.some(b => b.dataset.tab === hash)) {
      setActiveTab(hash, false);
    }
  });

  if (productCostPriceInput) {
    productCostPriceInput.addEventListener("input", syncSellerPriceFromProfit);
  }
  if (productProfitInput) {
    productProfitInput.addEventListener("input", syncSellerPriceFromProfit);
  }
  if (productPriceInput) {
    productPriceInput.addEventListener("input", syncProfitFromSellerPrice);
  }
  addProductBtn.addEventListener("click", submitProduct);
  if (productCategoryInput) {
    productCategoryInput.addEventListener("change", () => handleCategorySelected());
  }
  imageSlots().forEach((slot) => {
    if (slot.fileInput) {
      slot.fileInput.addEventListener("change", () => previewSelectedImage(slot.fileInput, slot.preview));
    }
  });
  
  if (importListingUrlBtn) {
    importListingUrlBtn.addEventListener("click", importListingFromUrl);
  }
  if (importListingUrlInput) {
    importListingUrlInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        importListingFromUrl();
      }
    });
  }
  if (importListingBtn) {
    importListingBtn.addEventListener("click", importListingDraft);
  }
  if (downloadListingJsonBtn) {
    downloadListingJsonBtn.addEventListener("click", () => {
      const parsed = parseListingDraft(importListingInput ? importListingInput.value : "");
      downloadListingJson(parsed || lastImportedListing);
    });
  }
  if (clearImportBtn) {
    clearImportBtn.addEventListener("click", () => {
      if (importListingInput) importListingInput.value = "";
      lastImportedListing = null;
      setMsg(importListingMsg, "", false);
    });
  }
  if (updateProductBtn) {
    updateProductBtn.addEventListener("click", updateProductPriceStock);
  }
  orderTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      orderTabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      activeOrderTab = tab.dataset.status;
      renderOrders();
    });
  });

  if (refreshOrdersBtn) refreshOrdersBtn.addEventListener("click", renderOrders);
  orderSearchInput.addEventListener("input", renderOrders);
  sellerSortSelect.addEventListener("change", refreshAll);
  
  wireSidebarToggle();
  
  ordersTable.addEventListener("click", async (event) => {
    const saveBtn = event.target.closest(".order-status-save");
    const autoAssignBtn = event.target.closest(".auto-assign-btn");
    const paidBtn = event.target.closest(".payment-paid-btn");
    const failedBtn = event.target.closest(".payment-failed-btn");

    if (saveBtn) {
      const orderId = Number(saveBtn.dataset.id || 0);
      const select = ordersTable.querySelector(`.order-status-select[data-id="${orderId}"]`);
      const partnerInput = ordersTable.querySelector(`.delivery-partner-input[data-id="${orderId}"]`);
      const partnerId = Number((partnerInput && partnerInput.value) || 0);
      if (!orderId || !select) return;
      await updateOrderStatus(orderId, sanitizeInput(select.value), partnerId);
      return;
    }

    if (autoAssignBtn) {
      const orderId = Number(autoAssignBtn.dataset.id || 0);
      if (!orderId) return;
      const client = getClient();
      const { data } = await client
        .from("seller_orders")
        .select("*")
        .eq("id", orderId)
        .maybeSingle();
      if (!data) return;
      await autoAssignDeliveryPartner(data);
      await logSellerActivity("shop_assign_delivery_partner", "seller_orders", orderId, { delivery_partner_id: data.delivery_partner_id || null });
      setMsg(orderMsg, "A delivery partner has been assigned to this order.", false);
      await renderOrders();
      return;
    }

    if (paidBtn || failedBtn) {
      const orderId = Number((paidBtn || failedBtn).dataset.id || 0);
      if (!orderId) return;
      const refInput = ordersTable.querySelector(`.payment-ref-input[data-id="${orderId}"]`);
      const ref = sanitizeInput(refInput ? refInput.value : "");
      await updatePaymentStatus(orderId, paidBtn ? "paid" : "failed", ref);
      return;
    }

    if (event.target.closest(".generate-label-btn")) {
      const orderId = Number(event.target.closest(".generate-label-btn").dataset.id || 0);
      if (orderId) generateOrderLabel(orderId);
    }
  });

  productsTable.addEventListener("click", async (event) => {
    const pushBtn = event.target.closest(".push-product-btn");
    const editBtn = event.target.closest(".edit-product-btn");

    if (pushBtn) {
      const productId = Number(pushBtn.dataset.id || 0);
      if (!productId) return;
      
      setMsg(productMsg, "Publishing product...", false);
      const client = getClient();
      const { error } = await client
        .from("shopkeeper_products")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", productId)
        .eq("shop_id", currentShop.id);
      
      if (error) {
        setMsg(productMsg, error.message, true);
      } else {
        setMsg(productMsg, `Product #${productId} was published successfully. Visibility refreshed.`, false);
        await renderProducts();
      }
    }

    if (editBtn) {
      const productId = Number(editBtn.dataset.id || 0);
      if (!productId) return;
      const client = getClient();
      if (!client) return;
      setMsg(productMsg, `Loading Product #${productId} into Product Details...`, false);
      const { data, error } = await client
        .from("shopkeeper_products")
        .select("*")
        .eq("id", productId)
        .eq("shop_id", currentShop.id)
        .maybeSingle();
      if (error) {
        setMsg(productMsg, error.message, true);
        return;
      }
      if (!data) {
        setMsg(productMsg, "Product not found or does not belong to this shop.", true);
        return;
      }
      loadProductIntoDetailsForm(data);
    }
  });
}

function wireSidebarToggle() {
  if (shopSidebarToggle) {
    shopSidebarToggle.addEventListener("click", () => {
      shopSidebar.classList.toggle("show");
      shopSidebarOverlay.classList.toggle("show");
    });
  }
  if (shopSidebarOverlay) {
    shopSidebarOverlay.addEventListener("click", () => {
      shopSidebar.classList.remove("show");
      shopSidebarOverlay.classList.remove("show");
    });
  }
}

// The storefront lives on another domain in production but inside a sibling
// folder in the legacy rollback layout, so resolve it through shared identity.
function wireStorefrontLink() {
  const link = document.getElementById("shopStorefrontLink");
  if (link && window.flashfitApp) link.href = window.flashfitApp.urlFor("customer", "index.html");
}

async function bootstrap() {
  wireEvents();
  wireStorefrontLink();
  populateCategorySelect();
  renderPricingSummary();
  const saved = localStorage.getItem(SHOP_SESSION_KEY);
  if (!saved) return;
  try {
    currentShop = JSON.parse(saved);
    shopLoginView.classList.add("hidden");
    shopAppView.classList.remove("hidden");
    shopIdentity.textContent = `${currentShop.shop_name} (${currentShop.shop_login_id})`;
    shopSessionText.textContent = `Logged in as ${currentShop.shop_login_id}`;
    
    const hash = window.location.hash.replace("#", "");
    if (hash && tabButtons.some(b => b.dataset.tab === hash)) {
      setActiveTab(hash, false);
    }
    
    startRealtime();
    await refreshAll();
  } catch (_) {
    localStorage.removeItem(SHOP_SESSION_KEY);
  }
}

bootstrap();

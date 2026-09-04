const CART_KEY = "flashfitCart";

const detailMainImage = document.getElementById("detailMainImage");
const detailThumbs = document.getElementById("detailThumbs");
const detailBadge = document.getElementById("detailBadge");
const detailTitle = document.getElementById("detailTitle");
const detailPrice = document.getElementById("detailPrice");
const detailMeta = document.getElementById("detailMeta");
const detailChips = document.getElementById("detailChips");
const detailDescription = document.getElementById("detailDescription");
const detailSizeChart = document.getElementById("detailSizeChart");
const detailSizePicker = document.getElementById("detailSizePicker");
const detailGalleryNote = document.getElementById("detailGalleryNote");
const detailRatingValue = document.getElementById("detailRatingValue");
const detailReviewCount = document.getElementById("detailReviewCount");
const detailFacts = document.getElementById("detailFacts");
const reviewScore = document.getElementById("reviewScore");
const reviewSummaryCopy = document.getElementById("reviewSummaryCopy");
const reviewsGrid = document.getElementById("reviewsGrid");
const photoGrid = document.getElementById("photoGrid");
const detailAddCartBtn = document.getElementById("detailAddCartBtn");
const detailActionMsg = document.getElementById("detailActionMsg");
const relatedProducts = document.getElementById("relatedProducts");
const moreProducts = document.getElementById("moreProducts");

const FEATURED_PRODUCTS = window.FLASHFIT_FEATURED_PRODUCTS || [];

let currentProduct = null;
let selectedSize = "";

function getProductIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id") || "";
}

function formatRs(value) {
  return `Rs ${Number(value || 0)}`;
}

function getFeaturedProduct(productId) {
  return FEATURED_PRODUCTS.find((item) => item.id === productId) || null;
}

function encodeFallbackImages(product) {
  return [product.image_url, product.image, product.image_url_2, product.image_url_3, product.image_url_4]
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

function mergeFallbackProducts(primaryRows, currentId, preferredCategory, limit) {
  const rows = Array.isArray(primaryRows) ? [...primaryRows] : [];
  const seen = new Set(rows.map((item) => String(item.id)));
  const featuredFallback = FEATURED_PRODUCTS
    .filter((item) => String(item.id) !== String(currentId))
    .filter((item) => !seen.has(String(item.id)))
    .sort((a, b) => {
      const aMatch = (a.category || "").includes(preferredCategory || "") ? 1 : 0;
      const bMatch = (b.category || "").includes(preferredCategory || "") ? 1 : 0;
      return bMatch - aMatch;
    });
  return [...rows, ...featuredFallback].slice(0, limit);
}

function uniqueProductRows(rows) {
  const seen = new Set();
  return (rows || []).filter((row) => {
    const key = String(row?.id || "").trim() || [row?.title || "", row?.category || "", row?.customer_price || row?.price || ""].join("|").toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY)) || [];
  } catch (_) {
    return [];
  }
}


function setCart(items) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
  if (window.flashfitDB && window.flashfitDB.saveCart) {
    window.flashfitDB.saveCart(items);
  }
}

function showActionMessage(text, isError) {
  if (!detailActionMsg) return;
  detailActionMsg.style.color = isError ? "#c53b2f" : "#1d7d34";
  detailActionMsg.textContent = text;
}

function getAvailableSizes(product) {
  return (product && product.sizes ? product.sizes : "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getProductImages(product) {
  return [product.image_url, product.image_url_2, product.image_url_3, product.image_url_4]
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function humanizeAttributeKey(key) {
  return String(key || "").replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}

function formatAttributeValue(value) {
  if (Array.isArray(value)) return value.join(", ");
  if (value === true) return "Yes";
  if (value === false) return "No";
  return String(value);
}

// Category-specific specs stored in the product's `attributes` jsonb (§10). Ordered and
// labelled from category_attributes metadata (product.__attrMeta) when available, else the
// key is humanized. Returns [] for products with no attributes (pre-migration or empty).
function buildAttributeSpecs(product) {
  const attrs = product && product.attributes;
  if (!attrs || typeof attrs !== "object" || Array.isArray(attrs)) return [];
  const meta = product.__attrMeta || {};
  const keys = Object.keys(attrs).filter((k) => {
    const v = attrs[k];
    if (v == null) return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "string") return v.trim() !== "";
    return true;
  });
  keys.sort((a, b) => {
    const sa = meta[a] ? Number(meta[a].sort_order ?? 100) : 100;
    const sb = meta[b] ? Number(meta[b].sort_order ?? 100) : 100;
    return sa - sb || a.localeCompare(b);
  });
  return keys.map((k) => [meta[k] && meta[k].name ? meta[k].name : humanizeAttributeKey(k), formatAttributeValue(attrs[k])]);
}

function buildDetailFacts(product) {
  const facts = [];
  if (product.fabric) facts.push(["Fabric", product.fabric]);
  if (product.color) facts.push(["Color", product.color]);
  if (product.print_pattern) facts.push(["Pattern", product.print_pattern]);
  if (product.fit_type) facts.push(["Fit", product.fit_type]);
  if (product.sleeve_type) facts.push(["Sleeve", product.sleeve_type]);
  if (product.neck_type) facts.push(["Neck", product.neck_type]);
  if (product.occasion) facts.push(["Occasion", product.occasion]);
  if (product.size_chart) facts.push(["Size Chart", product.size_chart]);
  if (product.care_instructions) facts.push(["Care", product.care_instructions]);
  if (product.weight) facts.push(["Weight Feel", product.weight]);
  return facts;
}


function buildReviewPayload(product) {
  const price = Number(product.customer_price || product.price || 0);
  const stock = Number(product.stock_qty || 0);
  const baseRating = stock > 20 ? 4.6 : stock > 0 ? 4.3 : 4.0;
  const rating = baseRating.toFixed(1);
  const ratingsCount = Math.max(118, Math.round(price / 8) + 96);
  const reviewsCount = Math.max(18, Math.round(ratingsCount * 0.22));
  return { rating, ratingsCount, reviewsCount };
}

function renderDetailFacts(product) {
  if (!detailFacts) return;
  const facts = buildDetailFacts(product).concat(buildAttributeSpecs(product));
  detailFacts.innerHTML = facts.map(([label, value]) => `
    <article class="detail-fact">
      <span>${escapeHtml(label)}</span>
      <p>${escapeHtml(value)}</p>
    </article>
  `).join("");
}

function renderReviews(product, images, dbReviews = []) {
  const payload = buildReviewPayload(product);
  
  let reviewList = [];
  if (dbReviews && dbReviews.length > 0) {
    reviewList = dbReviews.map((rev) => {
      return {
        name: "Verified Buyer",
        title: rev.rating >= 4 ? "Great Product" : rev.rating === 3 ? "Average Product" : "Needs Improvement",
        text: rev.review_text || "No comment.",
        meta: new Date(rev.created_at).toLocaleDateString(),
        rating: rev.rating
      };
    });
    
    const totalRating = dbReviews.reduce((sum, item) => sum + item.rating, 0);
    payload.rating = (totalRating / dbReviews.length).toFixed(1);
    payload.reviewsCount = dbReviews.length;
    payload.ratingsCount = dbReviews.length;
  } else {
    const category = product.category || "fashion";
    const title = product.title || "This product";
    reviewList = [
      {
        name: "Priya",
        title: "Value for money",
        text: `${title} ka fabric achha hai aur fitting daily wear ke liye comfortable lagi.`,
        meta: "Verified Buyer • 2 days ago",
        rating: 5
      },
      {
        name: "Simran",
        title: "Good quality look",
        text: `Color aur finish images ke kaafi close hain. ${category} segment me ye strong pick lagta hai.`,
        meta: "Verified Buyer • 1 week ago",
        rating: 4
      },
      {
        name: "Aarti",
        title: "Worth ordering",
        text: "Stitching neat hai, delivery fast rahi, aur size selection simple tha.",
        meta: "Verified Buyer • 2 weeks ago",
        rating: 4
      }
    ];
  }

  if (detailRatingValue) detailRatingValue.textContent = payload.rating;
  if (detailReviewCount) detailReviewCount.textContent = `${payload.ratingsCount} ratings • ${payload.reviewsCount} reviews`;
  if (reviewScore) reviewScore.textContent = `${payload.rating}/5`;
  if (reviewSummaryCopy) reviewSummaryCopy.textContent = `Customers mostly liked the ${product.fabric || "fabric"}, ${product.fit_type || "fit"}, and overall value for price.`;

  if (reviewsGrid) {
    reviewsGrid.innerHTML = reviewList.map((review) => `
      <article class="review-card">
        <h4>${review.title}</h4>
        <div class="stars">${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}</div>
        <p>${review.text}</p>
        <div class="review-meta">
          <span>${review.name}</span>
          <span>${review.meta}</span>
        </div>
      </article>
    `).join("");
  }

  if (photoGrid) {
    const photoItems = images.slice(0, 4);
    photoGrid.innerHTML = photoItems.map((image, index) => `
      <article class="customer-photo-card">
        <img src="${image}" alt="Customer photo ${index + 1}" data-fallback-images="${images.join("|")}">
        <div>
          <h4>Real customer photo</h4>
          <p class="muted">Uploaded after delivery for fit and fabric reference.</p>
        </div>
      </article>
    `).join("");
    applyImageFallbacks(photoGrid);
  }
}

let productImages = [];
let currentImageIndex = 0;
let touchStartX = 0;
let touchEndX = 0;
let isSwipeBound = false;

function goToSlide(index) {
  if (!productImages.length || !detailMainImage || !detailThumbs) return;
  if (index < 0) index = productImages.length - 1;
  if (index >= productImages.length) index = 0;
  
  currentImageIndex = index;
  detailMainImage.src = productImages[currentImageIndex] || "";
  
  detailThumbs.querySelectorAll("button").forEach((btn, i) => {
    if (i === currentImageIndex) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });
}

function bindSwipeEvents() {
  if (isSwipeBound || !detailMainImage) return;
  isSwipeBound = true;
  
  const imageWrapper = detailMainImage.parentElement;
  
  imageWrapper.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
  }, { passive: true });
  
  imageWrapper.addEventListener('touchend', (e) => {
    touchEndX = e.changedTouches[0].screenX;
    handleSwipe();
  }, { passive: true });
}

function handleSwipe() {
  const swipeThreshold = 40;
  if (touchEndX < touchStartX - swipeThreshold) {
    goToSlide(currentImageIndex + 1);
  }
  if (touchEndX > touchStartX + swipeThreshold) {
    goToSlide(currentImageIndex - 1);
  }
}

function renderThumbs(images) {
  if (!detailThumbs || !detailMainImage) return;
  productImages = images;
  currentImageIndex = 0;

  detailThumbs.innerHTML = images.map((image, index) => `
    <button type="button" class="${index === 0 ? "active" : ""}" aria-label="Slide ${index + 1}"></button>
  `).join("");
  
  detailThumbs.querySelectorAll("button").forEach((button, index) => {
    button.addEventListener("click", () => {
      goToSlide(index);
    });
  });

  bindSwipeEvents();
}

function renderProductCards(container, rows) {
  if (!container) return;
  rows = uniqueProductRows(rows);
  if (!rows.length) {
    container.innerHTML = '<p class="empty-state show">No products available right now.</p>';
    return;
  }

  container.innerHTML = rows.map((row) => {
    const customerPrice = Number(row.customer_price || row.price || 0);
    const oldPrice = Math.max(customerPrice + 200, customerPrice);
    const fallbackImages = encodeFallbackImages(row);
    return `
      <article class="product-card" data-id="${row.id}">
        <span class="sale-ribbon">LIVE</span>
        <img src="${row.image_url || row.image || ""}" alt="${row.title || "Product"}" loading="lazy" decoding="async" data-fallback-images="${fallbackImages}" />
        <h4>${row.title || "Untitled Product"}</h4>
        <p class="price"><span class="old">${formatRs(oldPrice)}</span> <span class="new">${formatRs(customerPrice)}</span></p>
        <p class="rating"><i class="fa-solid fa-bolt"></i> Delivery in 45-50 min</p>
      </article>
    `;
  }).join("");
  applyImageFallbacks(container);

  container.querySelectorAll(".product-card").forEach((card) => {
    card.addEventListener("click", () => {
      const id = card.dataset.id || "";
      if (!id) return;
      window.location.href = `product.html?id=${encodeURIComponent(id)}`;
    });
  });
}

function renderProduct(product, dbReviews = []) {
  currentProduct = product;
  selectedSize = "";
  const images = getProductImages(product);
  const customerPrice = Number(product.customer_price || product.price || 0);
  const oldPrice = Number(product.oldPrice || Math.max(customerPrice + 200, customerPrice));
  const chips = [
    product.category ? `Category: ${product.category}` : "",
    product.color ? `Color: ${product.color}` : "",
    product.sizes ? `Sizes: ${product.sizes}` : "",
    product.fabric ? `Fabric: ${product.fabric}` : "",
    product.print_pattern ? `Pattern: ${product.print_pattern}` : "",
    product.fit_type ? `Fit: ${product.fit_type}` : "",
    product.sleeve_type ? `Sleeve: ${product.sleeve_type}` : "",
    product.neck_type ? `Neck: ${product.neck_type}` : "",
    product.occasion ? `Occasion: ${product.occasion}` : ""
  ].filter(Boolean);
  buildAttributeSpecs(product).forEach(([label, value]) => chips.push(`${label}: ${value}`));

  document.title = `${product.title || "Product"} | FlashFit`;
  if (detailMainImage) {
    detailMainImage.src = images[0] || "";
    detailMainImage.alt = product.title || "Product image";
    detailMainImage.dataset.fallbackImages = images.join("|");
  }
  applyImageFallbacks(document);
  if (detailBadge) {
    detailBadge.textContent = Number(product.stock_qty || 0) > 0 ? "FlashFit Bestseller" : "Out of Stock";
  }
  if (detailTitle) detailTitle.textContent = product.title || "Untitled Product";
  if (detailPrice) detailPrice.innerHTML = `<span class="old">${formatRs(oldPrice)}</span> ${formatRs(customerPrice)} <small>(GST included)</small>`;
  if (detailMeta) detailMeta.textContent = `45-50 min delivery | Platform verified | Stock: ${Number(product.stock_qty || 0)} | Final price shown before payment`;
  if (detailGalleryNote) detailGalleryNote.textContent = `${Math.max(images.length, 3)} image ready gallery view`;
  if (detailChips) detailChips.innerHTML = chips.map((chip) => `<span>${escapeHtml(chip)}</span>`).join("");
  if (detailDescription) detailDescription.textContent = product.description || "No description available.";
  if (detailSizeChart) detailSizeChart.textContent = product.size_chart || "Standard sizing. Contact support for custom fit help.";
  renderDetailFacts(product);
  renderReviews(product, images.length ? images : [product.image_url || ""], dbReviews);

  if (detailSizePicker) {
    const sizes = getAvailableSizes(product);
    detailSizePicker.innerHTML = sizes.map((size, index) => `
      <button type="button" class="${index === 0 ? "active" : ""}" data-size="${size}">${size}</button>
    `).join("");
    if (sizes.length) {
      selectedSize = sizes[0];
      detailSizePicker.querySelectorAll("button").forEach((button) => {
        button.addEventListener("click", () => {
          selectedSize = button.dataset.size || "";
          detailSizePicker.querySelectorAll("button").forEach((item) => item.classList.remove("active"));
          button.classList.add("active");
        });
      });
    }
  }

  renderThumbs(images.length ? images : [product.image_url || ""]);

  if (detailAddCartBtn) {
    const outOfStock = Number(product.stock_qty || 0) <= 0;
    detailAddCartBtn.disabled = outOfStock;
    detailAddCartBtn.textContent = outOfStock ? "Out of Stock" : "Add to Cart";
  }
  updateProductSeo(product, images);
}

function setMetaTag(selector, attr, value) {
  if (!value) return;
  const tag = document.querySelector(selector);
  if (tag) tag.setAttribute(attr, value);
}

function updateProductSeo(product, images = []) {
  const title = `${product.title || "Product Details"} | FlashFit`;
  const description = (product.description || `Shop ${product.title || "this FlashFit product"} with fast local delivery, size details, verified pricing, COD, and online checkout.`).slice(0, 155);
  const image = images[0] || product.image_url || "https://flashfit.online/50x100logo.png";
  const url = `https://flashfit.online/product.html?id=${encodeURIComponent(product.id || "")}`;
  document.title = title;
  setMetaTag('meta[name="description"]', "content", description);
  setMetaTag('link[rel="canonical"]', "href", url);
  setMetaTag('meta[property="og:url"]', "content", url);
  setMetaTag('meta[property="og:title"]', "content", title);
  setMetaTag('meta[property="og:description"]', "content", description);
  setMetaTag('meta[property="og:image"]', "content", image);
  setMetaTag('meta[name="twitter:image"]', "content", image);
  setMetaTag('meta[name="twitter:title"]', "content", title);
  setMetaTag('meta[name="twitter:description"]', "content", description);

  const existing = document.getElementById("productSeoJsonLd");
  if (existing) existing.remove();
  const script = document.createElement("script");
  script.id = "productSeoJsonLd";
  script.type = "application/ld+json";
  script.textContent = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title || "FlashFit Product",
    image: images.length ? images : [image],
    description,
    sku: String(product.id || ""),
    brand: {
      "@type": "Brand",
      name: "FlashFit"
    },
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: "INR",
      price: String(Number(product.customer_price || product.price || 0)),
      availability: Number(product.stock_qty || 0) > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
      seller: {
        "@type": "Organization",
        name: "FlashFit"
      }
    }
  });
  document.head.appendChild(script);
}

async function loadProductPage() {
  const productId = getProductIdFromUrl();
  const featuredProduct = getFeaturedProduct(productId);
  const client = window.flashfitDB && window.flashfitDB.getSupabaseClient ? window.flashfitDB.getSupabaseClient() : null;
  if (!productId) {
    showActionMessage("Product not found.", true);
    return;
  }
  if (featuredProduct && !client) {
    renderProduct(featuredProduct);
    renderProductCards(relatedProducts, FEATURED_PRODUCTS.filter((item) => item.id !== featuredProduct.id).slice(0, 4));
    renderProductCards(moreProducts, FEATURED_PRODUCTS.filter((item) => item.id !== featuredProduct.id));
    return;
  }
  if (!client) {
    showActionMessage("Product not found.", true);
    return;
  }

  const baseColumns = "id,shop_id,title,category,customer_price,shop_price,commission_amount,delivery_fee,image_url,image_url_2,image_url_3,image_url_4,description,color,sizes,fabric,print_pattern,fit_type,sleeve_type,neck_type,occasion,care_instructions,size_chart,stock_qty,status";
  const isSchemaGap = (err) => {
    if (!err) return false;
    const code = String(err.code || "");
    const msg = String(err.message || "").toLowerCase();
    return code === "42703" || code === "PGRST204" || code === "PGRST202" || msg.includes("column") || msg.includes("does not exist") || msg.includes("schema cache");
  };

  let product = null;
  let error = null;
  ({ data: product, error } = await client
    .from("shopkeeper_products")
    .select(baseColumns + ",attributes,category_id")
    .eq("id", productId)
    .eq("status", "approved")
    .maybeSingle());

  if (error && isSchemaGap(error)) {
    // New columns not provisioned yet — fall back to the legacy column set (no regression).
    ({ data: product, error } = await client
      .from("shopkeeper_products")
      .select(baseColumns)
      .eq("id", productId)
      .eq("status", "approved")
      .maybeSingle());
  }

  if (error || !product) {
    if (featuredProduct) {
      renderProduct(featuredProduct);
      renderProductCards(relatedProducts, FEATURED_PRODUCTS.filter((item) => item.id !== featuredProduct.id).slice(0, 4));
      renderProductCards(moreProducts, FEATURED_PRODUCTS.filter((item) => item.id !== featuredProduct.id));
      return;
    }
    showActionMessage("Product not found or unavailable.", true);
    return;
  }

  if (product.category_id) {
    // Additive: pull attribute display names/order so dynamic specs read nicely.
    // Missing table (pre-migration) degrades to humanized keys — never blocks the page.
    try {
      const { data: attrMeta } = await client
        .from("category_attributes")
        .select("attribute_key,name,sort_order")
        .eq("category_id", product.category_id)
        .eq("is_enabled", true);
      if (Array.isArray(attrMeta) && attrMeta.length) {
        product.__attrMeta = {};
        attrMeta.forEach((row) => {
          if (row && row.attribute_key) {
            product.__attrMeta[row.attribute_key] = { name: row.name, sort_order: row.sort_order };
          }
        });
      }
    } catch (metaErr) {
      /* category_attributes not provisioned yet — specs use humanized keys */
    }
  }

  const relatedQuery = client
    .from("shopkeeper_products")
    .select("id,title,customer_price,price,image_url")
    .eq("status", "approved")
    .neq("id", product.id)
    .eq("category", product.category)
    .limit(4);

  const moreQuery = client
    .from("shopkeeper_products")
    .select("id,title,customer_price,price,image_url")
    .eq("status", "approved")
    .neq("id", product.id)
    .order("created_at", { ascending: false })
    .limit(8);

  const reviewsQuery = client
    .from("product_reviews")
    .select("rating, review_text, created_at")
    .eq("product_id", product.id)
    .order("created_at", { ascending: false });

  const [{ data: relatedRows }, { data: moreRows }, { data: dbReviews }] = await Promise.all([relatedQuery, moreQuery, reviewsQuery]);

  renderProduct(product, dbReviews || []);

  renderProductCards(relatedProducts, mergeFallbackProducts(relatedRows || [], product.id, product.category, 4));
  renderProductCards(moreProducts, mergeFallbackProducts(moreRows || [], product.id, product.category, 8));
}

if (detailAddCartBtn) {
  detailAddCartBtn.addEventListener("click", async () => {
    if (!currentProduct) return;

    const sizes = getAvailableSizes(currentProduct);
    if (sizes.length && !selectedSize) {
      showActionMessage("Please select a size first.", true);
      return;
    }

    const items = getCart();
    const cartItemId = `${currentProduct.id}::${selectedSize || "default"}`;
    const existing = items.find((item) => item.id === cartItemId);
    if (existing) {
      existing.qty += 1;
    } else {
      items.push({
        id: cartItemId,
        productId: String(currentProduct.id),
        title: currentProduct.title || "Untitled Product",
        price: Number(currentProduct.customer_price || currentProduct.price || 0),
        image: currentProduct.image_url || "",
        qty: 1,
        shopId: Number(currentProduct.shop_id || 0) || null,
        size: selectedSize || ""
      });
    }
    setCart(items);
    showActionMessage(`Product added to cart${selectedSize ? ` (${selectedSize})` : ""}.`, false);
  });
}

const wishlistBtn = document.querySelector(".wishlist-btn");
if (wishlistBtn) {
  wishlistBtn.addEventListener("click", () => {
    wishlistBtn.classList.toggle("active");
  });
}

const addReviewForm = document.getElementById("addReviewForm");
const reviewRating = document.getElementById("reviewRating");
const reviewText = document.getElementById("reviewText");
const reviewStatusMsg = document.getElementById("reviewStatusMsg");

if (addReviewForm) {
  addReviewForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentProduct || !currentProduct.id) {
      if (reviewStatusMsg) {
        reviewStatusMsg.style.color = "#c53b2f";
        reviewStatusMsg.textContent = "Product not loaded yet.";
      }
      return;
    }

    const rating = parseInt(reviewRating.value, 10);
    const text = reviewText.value.trim();
    
    if (reviewStatusMsg) {
      reviewStatusMsg.style.color = "#1d7d34";
      reviewStatusMsg.textContent = "Submitting review...";
    }

    if (!window.flashfitDB || !window.flashfitDB.addProductReview) {
       if (reviewStatusMsg) {
          reviewStatusMsg.style.color = "#c53b2f";
          reviewStatusMsg.textContent = "Database not connected.";
       }
       return;
    }

    const payload = {
      productId: currentProduct.id,
      shopId: currentProduct.shop_id || null,
      rating: rating,
      reviewText: text
    };

    const result = await window.flashfitDB.addProductReview(payload);
    
    if (result && result.ok) {
      if (reviewStatusMsg) {
        reviewStatusMsg.style.color = "#1d7d34";
        reviewStatusMsg.textContent = "Review submitted successfully!";
      }
      addReviewForm.reset();
    } else {
      if (reviewStatusMsg) {
        reviewStatusMsg.style.color = "#c53b2f";
        reviewStatusMsg.textContent = result ? result.error : "Failed to submit review. Please try again.";
      }
    }
  });
}

loadProductPage();

// featured-products.js
// Loads gold-badge and top approved products from Supabase as the featured/fallback set.
// These are shown on the homepage before a pincode is selected, or when DB is available but no shop is resolved.

(function () {
  async function loadFeaturedProducts() {
    // Wait for flashfitDB to be available
    if (!window.flashfitDB || !window.flashfitDB.getSupabaseClient) return;
    const client = window.flashfitDB.getSupabaseClient();
    if (!client) return;

    try {
      // Fetch gold-badge products first (admin-curated)
      const { data: goldProducts } = await client
        .from("shopkeeper_products")
        .select("id,shop_id,title,category,customer_price,shop_price,commission_amount,delivery_fee,image_url,image_url_2,image_url_3,image_url_4,stock_qty,status,is_gold_badge")
        .eq("status", "approved")
        .eq("is_gold_badge", true)
        .order("created_at", { ascending: false })
        .limit(20);

      // Fetch latest approved products as additional fallback
      const { data: latestProducts } = await client
        .from("shopkeeper_products")
        .select("id,shop_id,title,category,customer_price,shop_price,commission_amount,delivery_fee,image_url,image_url_2,image_url_3,image_url_4,stock_qty,status,is_gold_badge")
        .eq("status", "approved")
        .order("created_at", { ascending: false })
        .limit(20);

      // Merge: gold-badge first, then fill with latest (no duplicates)
      const goldIds = new Set((goldProducts || []).map((p) => p.id));
      const extras = (latestProducts || []).filter((p) => !goldIds.has(p.id));
      const combined = [...(goldProducts || []), ...extras].slice(0, 30);

      if (combined.length) {
        window.FLASHFIT_FEATURED_PRODUCTS = combined;

        // If the homepage is already rendered and no pincode is active, refresh grid
        const activePincode = (localStorage.getItem("flashfitPincode") || "").trim();
        const productsGrid = document.querySelector(".products-grid");
        if (!activePincode && productsGrid && typeof window.renderFeaturedProducts === "function") {
          window.renderFeaturedProducts();
        }
      }
    } catch (err) {
      console.warn("[FlashFit] Featured products load failed:", err);
    }
  }

  // Initialize empty so script.js doesn't break before this runs
  window.FLASHFIT_FEATURED_PRODUCTS = [];

  // Load after DOM is ready and DB is initialized
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadFeaturedProducts);
  } else {
    // Give supabase-client.js a tick to initialize
    setTimeout(loadFeaturedProducts, 100);
  }
})();

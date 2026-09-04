/* FlashFit shared app identity.
 *
 * The four apps used to identify themselves by looking for a legacy folder name
 * in location.pathname ("flashfitshop", "shopfit", "admin-panel",
 * "delevery_patner"). Those names do not exist once each app is deployed at its
 * own domain root, so every app silently resolved to the customer role.
 *
 * Resolution order (first match wins):
 *   1. window.__FLASHFIT_PUBLIC_CONFIG__.app  - injected by scripts/build-app.mjs
 *   2. hostname prefix                        - shop./delivery./admin.
 *   3. legacy path folder name                - keeps the rollback copies working
 *   4. "customer"
 *
 * Exposes window.flashfitApp. Presentation/routing only: it never grants
 * privilege. Server-side authorization is unchanged and remains authoritative.
 */
(function () {
  var APPS = ["customer", "shop", "delivery", "admin"];

  var ROLE_BY_APP = {
    customer: "user",
    shop: "shopkeeper",
    delivery: "delivery_partner",
    admin: "admin"
  };

  var APP_BY_ROLE = {
    user: "customer",
    shopkeeper: "shop",
    delivery_partner: "delivery",
    admin: "admin"
  };

  // Public production domains. Also declared in scripts/build-app.mjs.
  var DOMAIN_BY_APP = {
    customer: "flashfit.online",
    shop: "shop.flashfit.online",
    delivery: "delivery.flashfit.online",
    admin: "admin.flashfit.online"
  };

  // Landing page within each app, relative to that app's root.
  var HOME_BY_APP = {
    customer: "index.html",
    shop: "shopkeeper-panel.html",
    delivery: "delivery-panel.html",
    admin: "index.html"
  };

  // Where a notification for each role should land, relative to that app's root.
  var INBOX_BY_APP = {
    customer: "my-orders.html",
    shop: "shopkeeper-panel.html",
    delivery: "delivery-panel.html",
    admin: "index.html"
  };

  // Legacy folder -> app. Retained so the rollback copies keep working.
  var LEGACY_FOLDER_BY_APP = {
    customer: "flashfitshop",
    shop: "shopfit",
    delivery: "delevery_patner",
    admin: "admin-panel"
  };

  function fromPublicConfig() {
    try {
      var config = window.__FLASHFIT_PUBLIC_CONFIG__;
      var app = config && String(config.app || "").toLowerCase();
      return APPS.indexOf(app) >= 0 ? app : "";
    } catch (_) {
      return "";
    }
  }

  function fromHostname(hostname) {
    var host = String(hostname || "").toLowerCase();
    if (host.indexOf("shop.") === 0) return "shop";
    if (host.indexOf("delivery.") === 0) return "delivery";
    if (host.indexOf("admin.") === 0) return "admin";
    return "";
  }

  function fromLegacyPath(pathname) {
    var path = String(pathname || "").toLowerCase();
    // delevery_patner is checked first: it is the most specific spelling.
    if (path.indexOf("delevery_patner") >= 0) return "delivery";
    if (path.indexOf("admin-panel") >= 0) return "admin";
    if (path.indexOf("shopfit") >= 0) return "shop";
    if (path.indexOf("flashfitshop") >= 0) return "customer";
    return "";
  }

  var location = window.location || {};
  var hostname = location.hostname || "";
  var pathname = location.pathname || "";

  var resolvedApp =
    fromPublicConfig() ||
    fromHostname(hostname) ||
    fromLegacyPath(pathname) ||
    "customer";

  var legacyApp = fromLegacyPath(pathname);
  var isLegacyLayout = legacyApp !== "";

  function normalizeRole(role) {
    var value = String(role || "").toLowerCase();
    if (value === "seller" || value === "shop" || value === "shopkeeper") return "shopkeeper";
    if (value === "rider" || value === "delivery" || value === "delivery_partner" || value === "delivery-partner") {
      return "delivery_partner";
    }
    if (value === "admin") return "admin";
    return "user";
  }

  function appForRole(role) {
    return APP_BY_ROLE[normalizeRole(role)] || "customer";
  }

  // True when the four apps are served from their own production domains, which
  // is the only case where cross-app absolute URLs are correct.
  function usesProductionDomains() {
    return /(^|\.)flashfit\.online$/i.test(hostname);
  }

  /* Resolve a page within a target app to a URL usable from the current app.
   * - same app                 -> relative path
   * - legacy single-host build -> /<legacy-folder>/<page>
   * - otherwise                -> absolute URL on the target app's own domain
   *
   * A cross-app link must never be relative outside the legacy layout: each app
   * is deployed alone, so the other app's pages do not exist in this bundle and
   * a relative link would 404. That means cross-app links from localhost or a
   * Netlify preview point at the real domain, which is deliberate.
   */
  function urlFor(targetApp, page) {
    var app = APPS.indexOf(targetApp) >= 0 ? targetApp : "customer";
    var file = page || HOME_BY_APP[app] || "index.html";
    if (app === resolvedApp) return file;
    if (isLegacyLayout) return "/" + LEGACY_FOLDER_BY_APP[app] + "/" + file;
    return "https://" + DOMAIN_BY_APP[app] + "/" + file;
  }

  window.flashfitApp = {
    APPS: APPS.slice(),
    app: resolvedApp,
    role: ROLE_BY_APP[resolvedApp] || "user",
    hostname: hostname,
    domain: DOMAIN_BY_APP[resolvedApp] || "",
    isLegacyLayout: isLegacyLayout,
    usesProductionDomains: usesProductionDomains,
    normalizeRole: normalizeRole,
    appForRole: appForRole,
    is: function (name) {
      return resolvedApp === String(name || "").toLowerCase();
    },
    // Landing page for an app (defaults to the current app).
    homeUrl: function (targetApp) {
      var app = targetApp || resolvedApp;
      return urlFor(app, HOME_BY_APP[app]);
    },
    // Where a notification for this role should open.
    roleUrl: function (role) {
      var app = appForRole(role);
      return urlFor(app, INBOX_BY_APP[app]);
    },
    urlFor: urlFor,
    // Notification icons live at each app root.
    iconUrl: function () {
      return "50x100logo.png";
    },
    // True when a URL points into a different app than the given role, i.e. the
    // recipient must not be sent there.
    isForeignRoleUrl: function (url, role) {
      var value = String(url || "").toLowerCase();
      if (!value) return false;
      var target = appForRole(role);
      return APPS.some(function (app) {
        if (app === target) return false;
        var folder = LEGACY_FOLDER_BY_APP[app];
        var domain = DOMAIN_BY_APP[app];
        if (folder && value.indexOf(folder) >= 0) return true;
        // Match the subdomain only, so "flashfit.online" does not match "shop.flashfit.online".
        return domain.indexOf(".") > 0 && value.indexOf("//" + domain) >= 0;
      });
    }
  };
})();

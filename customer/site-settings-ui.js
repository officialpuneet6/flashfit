(function () {
  function normalizeAssetValue(value) {
    const raw = (value || "").toString().trim();
    if (!raw) return "";
    if (/^(https?:|data:|blob:)/i.test(raw)) return raw;

    const normalized = raw.replace(/\\/g, "/").replace(/^\.\/+/, "");
    if (/^[a-z]:\//i.test(normalized) || normalized.startsWith("file://")) {
      return "";
    }
    if (normalized.startsWith("../user site/")) {
      return normalized.slice("../user site/".length);
    }
    if (normalized.startsWith("user site/")) {
      return normalized.slice("user site/".length);
    }
    return normalized;
  }

  function bindImageFallback(el) {
    if (!(el instanceof HTMLImageElement) || el.dataset.fallbackBound === "true") return;
    el.dataset.fallbackBound = "true";
    if (!el.dataset.defaultSrc) {
      el.dataset.defaultSrc = el.getAttribute("src") || "";
    }
    el.addEventListener("error", () => {
      const fallbackSrc = el.dataset.defaultSrc || "";
      if (fallbackSrc && el.getAttribute("src") !== fallbackSrc) {
        el.setAttribute("src", fallbackSrc);
      }
    });
  }

  function getImageFallbackSrc(el) {
    if (!(el instanceof HTMLImageElement)) return "";
    return el.dataset.defaultSrc || el.getAttribute("src") || "";
  }

  async function applySiteSettings() {
    if (!window.flashfitDB || !window.flashfitDB.loadSiteSettings) return;
    const settings = await window.flashfitDB.loadSiteSettings();
    if (!settings || typeof settings !== "object") return;

    const phoneDisplay = settings.support_phone_display || "";
    const phoneDial = settings.support_phone_tel || phoneDisplay;

    document.querySelectorAll("[data-site-setting]").forEach((el) => {
      const key = el.getAttribute("data-site-setting");
      if (!key) return;
      const explicitMode = el.getAttribute("data-setting-mode");
      const inferredMode = explicitMode || (el instanceof HTMLImageElement ? "src" : "text");
      if (inferredMode === "src") {
        bindImageFallback(el);
      }
      if (!(key in settings)) return;
      const value = settings[key] ?? "";

      const mode = inferredMode;
      if (mode === "mailto") {
        el.textContent = value;
        if (value) {
          el.setAttribute("href", "mailto:" + value);
        } else {
          el.removeAttribute("href");
        }
        return;
      }

      if (mode === "tel") {
        const display = key === "support_phone_tel" ? phoneDisplay : value;
        el.textContent = display || value;
        const dial = key === "support_phone_display" ? phoneDial : value;
        if (dial) {
          el.setAttribute("href", "tel:" + dial);
        } else {
          el.removeAttribute("href");
        }
        return;
      }

      if (mode === "href") {
        if (value) {
          el.setAttribute("href", value);
        } else {
          el.removeAttribute("href");
        }
        return;
      }

      if (mode === "src") {
        const assetValue = normalizeAssetValue(value);
        if (assetValue) {
          el.setAttribute("src", assetValue);
          if (key === "hero_image") {
            console.log("[FlashFit] hero_image setting applied", {
              rawValue: value,
              normalizedValue: assetValue,
              finalSrc: el.getAttribute("src")
            });
          }
        } else {
          const fallbackSrc = getImageFallbackSrc(el);
          if (fallbackSrc) {
            el.setAttribute("src", fallbackSrc);
            if (key === "hero_image") {
              console.log("[FlashFit] hero_image fallback applied", {
                rawValue: value,
                fallbackSrc
              });
            }
          } else {
            el.removeAttribute("src");
          }
        }
        return;
      }

      if (mode === "style-var") {
        const target = el.getAttribute("data-setting-target");
        if (target) {
          el.style.setProperty(target, value);
        }
        return;
      }
      
      if (mode === "html") {
        el.innerHTML = value;
        return;
      }

      el.textContent = value;
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applySiteSettings);
  } else {
    applySiteSettings();
  }
})();

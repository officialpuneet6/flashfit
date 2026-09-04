/* Public configuration consumer. It deliberately reads only a small allowlist
 * of presentation settings and never writes configuration or executes content. */
(function () {
  const COLOR = /^#[0-9a-f]{6}$/i;
  const KEYS = {
    theme_primary: "--ff-primary",
    theme_secondary: "--ff-primary-strong",
    theme_background: "--ff-bg",
    theme_text: "--ff-text",
    theme_muted: "--ff-muted",
    theme_border: "--ff-border",
    theme_surface: "--ff-surface"
  };

  function applyTheme(settings) {
    if (!settings || typeof settings !== "object") return;
    const style = document.documentElement.style;
    Object.entries(KEYS).forEach(([settingKey, variable]) => {
      const value = String(settings[settingKey] || "").trim();
      if (COLOR.test(value)) style.setProperty(variable, value);
    });
  }

  async function loadTheme() {
    try {
      if (!window.flashfitDB || typeof window.flashfitDB.loadSiteSettings !== "function") return;
      applyTheme(await window.flashfitDB.loadSiteSettings());
    } catch (_) {
      // Public UI configuration is optional. Keep the compiled FlashFit theme.
    }
  }

  window.addEventListener("load", loadTheme, { once: true });
})();

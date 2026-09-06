(function () {
  // The canonical public config is written by build-app.mjs as
  // flashfit-public-config.js and injected as the first <script> in <head>.
  // Read from it when available so all runtime modules share a single source.
  var _cfg = window.__FLASHFIT_PUBLIC_CONFIG__ || {};
  var _url = _cfg.supabaseUrl || "";
  var _key = _cfg.supabasePublishableKey || "";
  window.FLASHFIT_NOTIFICATION_CONFIG = {
    supabaseUrl: _url,
    supabaseKey: _key,
    vapidPublicKey: "BAzy1vCIVwdmqQld334R-XkAk_dzvJWB2xVJYHkEOP8CdFhrw3wygYY25gdHkD0Ro_69CMsmvNBDdLySASVon4A",
    edgeFunctionUrl: _url + "/functions/v1/send-web-push",
    icon: "50x100logo.png",
    badge: "favicon-32x32.png",
    soundUrl: "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3",
    autoRequestPermission: true,
    loudSound: true,
    normalSoundRepeats: 1,
    highPrioritySoundRepeats: 3
  };
})();

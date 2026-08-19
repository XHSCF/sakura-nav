(function () {
  "use strict";

  window.addEventListener("load", () => {
    Promise.resolve(window.SAKURA_DATA_READY).finally(() => {
      window.requestAnimationFrame(() => {
        if (document.documentElement.dataset.appReady === "true") return;
        document.querySelectorAll("[data-app-fallback]").forEach((node) => { node.hidden = false; });
      });
    });
  }, { once: true });
})();

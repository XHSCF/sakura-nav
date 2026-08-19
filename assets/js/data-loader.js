(function () {
  "use strict";

  const fallback = window.SAKURA_DATA;
  const timeout = 4500;

  window.SAKURA_DATA_READY = (async () => {
    if (!fallback) return null;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch("./api/public/data", {
        headers: { Accept: "application/json" },
        credentials: "same-origin",
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`Navigation API returned ${response.status}`);
      const payload = await response.json();
      const remote = payload?.data;
      if (!Array.isArray(remote?.categories) || !remote.categories.length || !Array.isArray(remote?.sites) || !remote.sites.length) {
        throw new Error("Navigation API returned incomplete data");
      }
      window.SAKURA_DATA = Object.freeze({
        categories: remote.categories,
        sites: remote.sites,
        hiddenSection: remote.hiddenSection || fallback.hiddenSection,
        source: "database"
      });
      return window.SAKURA_DATA;
    } catch (error) {
      console.info("SAKURA navigation is using the bundled data snapshot.", error instanceof Error ? error.message : String(error));
      return fallback;
    } finally {
      window.clearTimeout(timer);
    }
  })();
})();

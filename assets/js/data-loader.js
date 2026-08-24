(function () {
  "use strict";

  const bundled = window.SAKURA_DATA;
  const timeout = 2000;

  function safeBundledData(source) {
    if (!source) return null;
    const hidden = source.hiddenSection || {};
    return Object.freeze({
      categories: Array.isArray(source.categories) ? source.categories : [],
      sites: Array.isArray(source.sites) ? source.sites : [],
      hiddenSection: Object.freeze({
        id: hidden.id || "new-world",
        name: hidden.name || "新世界",
        icon: hidden.icon || "fa-door-open",
        welcome: hidden.welcome || "欢迎踏入新世界的大门",
        enabled: false
      }),
      announcement: null,
      source: "snapshot"
    });
  }

  const fallback = safeBundledData(bundled);
  window.SAKURA_DATA = fallback;

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
      if (!Array.isArray(remote?.categories) || !Array.isArray(remote?.sites)) {
        throw new Error("Navigation API returned incomplete data");
      }
      window.SAKURA_DATA = Object.freeze({
        categories: remote.categories,
        sites: remote.sites,
        hiddenSection: remote.hiddenSection && typeof remote.hiddenSection === "object" ? remote.hiddenSection : fallback.hiddenSection,
        announcement: remote.announcement && typeof remote.announcement.text === "string" ? { text: remote.announcement.text } : null,
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

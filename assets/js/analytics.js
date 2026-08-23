(function () {
  "use strict";

  const storageKey = "sakura-anonymous-visitor";
  const endpoint = "/api/public/visit";
  const idPattern = /^[A-Za-z0-9_-]{16,96}$/;

  function createVisitorId() {
    if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function visitorId() {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved && idPattern.test(saved)) return saved;
      const generated = createVisitorId();
      localStorage.setItem(storageKey, generated);
      return generated;
    } catch (_) {
      return createVisitorId();
    }
  }

  function referrerHost() {
    if (!document.referrer) return "";
    try {
      const referrer = new URL(document.referrer);
      return referrer.origin === location.origin ? "" : referrer.hostname.slice(0, 255);
    } catch (_) {
      return "";
    }
  }

  function reportVisit() {
    if (navigator.globalPrivacyControl === true || navigator.doNotTrack === "1") return;
    const body = JSON.stringify({
      visitorId: visitorId(),
      path: location.pathname,
      referrerHost: referrerHost()
    });
    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      credentials: "same-origin",
      keepalive: true
    }).catch(() => { /* Analytics must never interrupt the public page. */ });
  }

  if (document.readyState === "complete") window.setTimeout(reportVisit, 0);
  else window.addEventListener("load", reportVisit, { once: true });
})();

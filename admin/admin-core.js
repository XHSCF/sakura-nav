(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SAKURA_ADMIN_CORE = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const genericNameIds = new Set(["app", "online", "official", "site", "web"]);

  function slugify(value) {
    return String(value || "").normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 58);
  }

  function idFromUrl(value) {
    try {
      return slugify(new URL(value).hostname.replace(/^www\./, "").split(".").slice(0, -1).join("-"));
    } catch (_) {
      return "";
    }
  }

  function preferredSiteId(name, url) {
    const nameId = slugify(name);
    const urlId = idFromUrl(url);
    if (!nameId) return urlId;
    const weakAlphabeticId = /^[a-z]{1,3}$/.test(nameId) || genericNameIds.has(nameId);
    return weakAlphabeticId && urlId ? urlId : nameId;
  }

  return Object.freeze({ slugify, idFromUrl, preferredSiteId });
});

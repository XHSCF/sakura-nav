(function (root, factory) {
  "use strict";

  const api = Object.freeze(factory());
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SAKURA_CORE = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function normalize(value) {
    return String(value || "").toLocaleLowerCase("zh-CN").trim().replace(/\s+/g, " ");
  }

  function queryTerms(value) {
    return normalize(value).split(" ").filter(Boolean);
  }

  function normalizeThemeMode(value) {
    return value === "light" || value === "dark" ? value : "auto";
  }

  function resolveTheme(mode, systemDark) {
    const validMode = normalizeThemeMode(mode);
    return validMode === "auto" ? (systemDark ? "dark" : "light") : validMode;
  }

  function nextThemeMode(mode) {
    const validMode = normalizeThemeMode(mode);
    if (validMode === "auto") return "light";
    return validMode === "light" ? "dark" : "auto";
  }

  function sanitizeIdList(value, validIds) {
    if (!Array.isArray(value)) return [];
    return Array.from(new Set(value.filter((id) => typeof id === "string" && validIds.has(id))));
  }

  function cleanRecentVisits(value, validIds, limit) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    const cleaned = [];
    value.forEach((entry) => {
      if (!entry || typeof entry.id !== "string" || !validIds.has(entry.id) || seen.has(entry.id)) return;
      const visitedAt = Number(entry.visitedAt);
      cleaned.push({ id: entry.id, visitedAt: Number.isFinite(visitedAt) ? visitedAt : 0 });
      seen.add(entry.id);
    });
    return cleaned.slice(0, Number.isInteger(limit) && limit > 0 ? limit : 12);
  }

  function siteMatchesTerms(site, categoryName, terms) {
    const searchable = normalize([
      site.name,
      site.description,
      site.url,
      categoryName,
      ...(Array.isArray(site.keywords) ? site.keywords : [])
    ].join(" "));
    return terms.every((term) => searchable.includes(term));
  }

  return {
    normalize,
    queryTerms,
    normalizeThemeMode,
    resolveTheme,
    nextThemeMode,
    sanitizeIdList,
    cleanRecentVisits,
    siteMatchesTerms
  };
});

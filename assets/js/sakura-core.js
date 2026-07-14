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

  function highlightSegments(value, terms) {
    const text = String(value || "");
    const needles = Array.from(new Set(
      (Array.isArray(terms) ? terms : [])
        .map((term) => normalize(term))
        .filter(Boolean)
    )).sort((left, right) => right.length - left.length);
    if (!text || !needles.length) return [{ text, match: false }];

    const searchable = text.toLocaleLowerCase("zh-CN");
    const segments = [];
    let cursor = 0;
    while (cursor < text.length) {
      let matchIndex = -1;
      let matchTerm = "";
      needles.forEach((term) => {
        const index = searchable.indexOf(term, cursor);
        if (index >= 0 && (matchIndex < 0 || index < matchIndex || (index === matchIndex && term.length > matchTerm.length))) {
          matchIndex = index;
          matchTerm = term;
        }
      });
      if (matchIndex < 0) {
        segments.push({ text: text.slice(cursor), match: false });
        break;
      }
      if (matchIndex > cursor) segments.push({ text: text.slice(cursor, matchIndex), match: false });
      segments.push({ text: text.slice(matchIndex, matchIndex + matchTerm.length), match: true });
      cursor = matchIndex + matchTerm.length;
    }
    return segments;
  }

  function isNewSite(addedAt, today, days) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(addedAt || ""))) return false;
    const timestamp = Date.parse(`${addedAt}T00:00:00Z`);
    const current = today instanceof Date ? today.getTime() : Number(today);
    const windowDays = Number.isInteger(days) && days >= 0 ? days : 14;
    if (!Number.isFinite(timestamp) || !Number.isFinite(current)) return false;
    const age = Math.floor((current - timestamp) / 86400000);
    return age >= 0 && age <= windowDays;
  }

  function latestAddedDate(sites) {
    return (Array.isArray(sites) ? sites : []).reduce((latest, site) => {
      const value = String(site?.addedAt || "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return latest;
      const timestamp = Date.parse(`${value}T00:00:00Z`);
      if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) return latest;
      return !latest || value > latest ? value : latest;
    }, "");
  }

  function moveVisibleItem(values, visibleValues, item, direction) {
    const items = Array.isArray(values) ? values.slice() : [];
    const visibleItems = Array.isArray(visibleValues) ? visibleValues : items;
    const index = visibleItems.indexOf(item);
    const offset = direction < 0 ? -1 : 1;
    const targetItem = visibleItems[index + offset];
    const itemIndex = items.indexOf(item);
    const targetIndex = items.indexOf(targetItem);
    if (index < 0 || itemIndex < 0 || targetIndex < 0) return items;
    [items[itemIndex], items[targetIndex]] = [items[targetIndex], items[itemIndex]];
    return items;
  }

  return {
    normalize,
    queryTerms,
    normalizeThemeMode,
    resolveTheme,
    nextThemeMode,
    sanitizeIdList,
    cleanRecentVisits,
    siteMatchesTerms,
    highlightSegments,
    isNewSite,
    latestAddedDate,
    moveVisibleItem
  };
});

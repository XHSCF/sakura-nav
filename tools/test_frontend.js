"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const core = require("../assets/js/sakura-core.js");

const repositoryRoot = path.resolve(__dirname, "..");

test("theme mode follows the expected three-state cycle", () => {
  assert.equal(core.normalizeThemeMode(null), "auto");
  assert.equal(core.resolveTheme("auto", false), "light");
  assert.equal(core.resolveTheme("auto", true), "dark");
  assert.equal(core.nextThemeMode("auto"), "light");
  assert.equal(core.nextThemeMode("light"), "dark");
  assert.equal(core.nextThemeMode("dark"), "auto");
});

test("theme initialization applies saved and system preferences before paint", () => {
  const source = fs.readFileSync(path.join(repositoryRoot, "assets/js/theme-init.js"), "utf8");
  function initialize(saved, systemDark) {
    const dataset = {};
    vm.runInNewContext(source, {
      document: { documentElement: { dataset } },
      window: {
        localStorage: { getItem: () => saved },
        matchMedia: () => ({ matches: systemDark })
      }
    });
    return dataset;
  }

  assert.deepEqual(initialize(null, true), { themeMode: "auto", theme: "dark" });
  assert.deepEqual(initialize("light", true), { themeMode: "light", theme: "light" });
  assert.deepEqual(initialize("dark", false), { themeMode: "dark", theme: "dark" });
});

test("application guard reveals fallback only when initialization is incomplete", () => {
  const source = fs.readFileSync(path.join(repositoryRoot, "assets/js/app-guard.js"), "utf8");
  function fallbackHidden(appReady) {
    const fallback = { hidden: true };
    let onLoad;
    const documentElement = { dataset: appReady ? { appReady: "true" } : {} };
    vm.runInNewContext(source, {
      document: {
        documentElement,
        querySelectorAll: () => [fallback]
      },
      window: {
        addEventListener: (_event, callback) => { onLoad = callback; },
        requestAnimationFrame: (callback) => callback()
      }
    });
    onLoad();
    return fallback.hidden;
  }

  assert.equal(fallbackHidden(true), true);
  assert.equal(fallbackHidden(false), false);
});

test("multi-keyword search normalizes whitespace and matches all terms", () => {
  const site = {
    name: "qBittorrent",
    description: "开源、无广告的跨平台 BitTorrent 客户端。",
    url: "https://www.qbittorrent.org/",
    keywords: ["BT下载", "磁力链接"]
  };
  const terms = core.queryTerms("  开源   bt下载 ");
  assert.deepEqual(terms, ["开源", "bt下载"]);
  assert.equal(core.siteMatchesTerms(site, "软件专区", terms), true);
  assert.equal(core.siteMatchesTerms(site, "软件专区", ["开源", "字幕"]), false);
});

test("hidden section passphrase requires an exact normalized match", () => {
  assert.equal(core.matchesPassphrase("开门", "开门"), true);
  assert.equal(core.matchesPassphrase("  开门  ", "开门"), true);
  assert.equal(core.matchesPassphrase("开门啦", "开门"), false);
  assert.equal(core.matchesPassphrase("门", "开门"), false);
  assert.equal(core.matchesPassphrase("", "开门"), false);
  assert.equal(core.matchesPassphrase("开门", ""), false);
});

test("search highlighting returns safe text segments for matching terms", () => {
  assert.deepEqual(core.highlightSegments("M3U8 在线播放器", ["m3u8", "播放"]), [
    { text: "M3U8", match: true },
    { text: " 在线", match: false },
    { text: "播放", match: true },
    { text: "器", match: false }
  ]);
  assert.deepEqual(core.highlightSegments("<script>", ["script"]), [
    { text: "<", match: false },
    { text: "script", match: true },
    { text: ">", match: false }
  ]);
});

test("browser data and core scripts expose the expected globals", () => {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(repositoryRoot, "assets/js/sakura-core.js"), "utf8"), context);
  vm.runInNewContext(fs.readFileSync(path.join(repositoryRoot, "assets/js/sites-data.js"), "utf8"), context);
  assert.equal(typeof context.SAKURA_CORE.siteMatchesTerms, "function");
  assert.ok(context.window.SAKURA_DATA.sites.some((site) => site.id === "qbittorrent"));
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.window.SAKURA_DATA.hiddenSection)),
    {
      id: "new-world",
      name: "新世界",
      icon: "fa-door-open",
      passphrase: "开门",
      welcome: "欢迎踏入新世界的大门",
      sites: [
        {
          id: "jable",
          name: "Jable",
          url: "https://jable.tv/",
          description: "日本18+。",
          keywords: ["Jable", "jable", "日本", "18+"]
        },
        {
          id: "51chigua",
          name: "51吃瓜网",
          url: "https://zuzpayj.cc/",
          description: "全网更新最快最全的吃瓜网。",
          keywords: ["51吃瓜网", "51吃瓜", "zuzpayj", "吃瓜网"]
        }
      ]
    }
  );
});

test("homepage keeps the four fixed views and retires curated flags", () => {
  const homepage = fs.readFileSync(path.join(repositoryRoot, "index.html"), "utf8");
  const stylesheet = fs.readFileSync(path.join(repositoryRoot, "assets/css/sakura.css"), "utf8");
  const siteData = fs.readFileSync(path.join(repositoryRoot, "assets/js/sites-data.js"), "utf8");
  const viewIds = Array.from(homepage.matchAll(/data-view="([^"]+)"/g), (match) => match[1]);

  assert.deepEqual(viewIds, ["all", "recent", "favorites", "history"]);
  assert.doesNotMatch(siteData, /\b(?:featured|popular)\s*:/);
  assert.match(stylesheet, /\.view-switcher\s*\{[^}]*overflow:\s*hidden;/s);
  assert.match(stylesheet, /@media \(max-width: 768px\)[\s\S]*?\.view-switcher\s*\{[^}]*grid-template-columns:\s*repeat\(4,/);
});

test("restoring all sites does not focus the search input", () => {
  const application = fs.readFileSync(path.join(repositoryRoot, "assets/js/sakura-app.js"), "utf8");
  const handlerStart = application.indexOf('resetFilters?.addEventListener("click"');
  const handlerEnd = application.indexOf("\n\n    if (search) {", handlerStart);
  const resetHandler = application.slice(handlerStart, handlerEnd);

  assert.notEqual(handlerStart, -1);
  assert.notEqual(handlerEnd, -1);
  assert.match(resetHandler, /render\(\);\s*scheduleResultScroll\(\);/);
  assert.doesNotMatch(resetHandler, /search\?*\.focus\(/);
});

test("stored favorites keep only unique IDs that still exist", () => {
  const validIds = new Set(["anime1", "qbittorrent"]);
  assert.deepEqual(
    core.sanitizeIdList(["anime1", "missing", "anime1", 123, "qbittorrent"], validIds),
    ["anime1", "qbittorrent"]
  );
  assert.deepEqual(core.sanitizeIdList({ favorites: [] }, validIds), []);
});

test("recent visits discard stale and duplicate entries and enforce the limit", () => {
  const validIds = new Set(["one", "two", "three"]);
  const visits = core.cleanRecentVisits([
    { id: "one", visitedAt: 20 },
    { id: "missing", visitedAt: 10 },
    { id: "one", visitedAt: 5 },
    { id: "two", visitedAt: "invalid" },
    { id: "three", visitedAt: 1 }
  ], validIds, 2);
  assert.deepEqual(visits, [
    { id: "one", visitedAt: 20 },
    { id: "two", visitedAt: 0 }
  ]);
});

test("new-site dates and favorite ordering respect their boundaries", () => {
  const today = Date.parse("2026-07-14T12:00:00Z");
  assert.equal(core.isNewSite("2026-07-14", today, 14), true);
  assert.equal(core.isNewSite("2026-07-01", today, 14), true);
  assert.equal(core.isNewSite("2026-06-30", today, 14), false);
  assert.equal(core.isNewSite("2026-07-15", today, 14), false);
  assert.deepEqual(core.moveVisibleItem(["one", "hidden", "two"], ["one", "two"], "two", -1), ["two", "hidden", "one"]);
  assert.deepEqual(core.moveVisibleItem(["one", "two", "three"], ["one", "two", "three"], "three", 1), ["one", "two", "three"]);
});

test("latest collection date ignores missing and invalid values", () => {
  assert.equal(core.latestAddedDate([
    { addedAt: "2026-07-12" },
    { addedAt: "2026-07-14" },
    { addedAt: "2026-02-30" },
    {},
    { addedAt: "not-a-date" }
  ]), "2026-07-14");
  assert.equal(core.latestAddedDate(null), "");
});

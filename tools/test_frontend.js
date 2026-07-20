"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const core = require("../assets/js/sakura-core.js");

const repositoryRoot = path.resolve(__dirname, "..");

test("public pages use the current brand without exposing repository details", () => {
  const publicPages = ["index.html", "about/index.html", "404.html"];

  publicPages.forEach((relativePath) => {
    const source = fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
    assert.match(source, /SAKURA导航/);
    assert.doesNotMatch(source, /SAKURA手记/);
    assert.doesNotMatch(source, /github\.com\/XHSCF\/sakura-nav|GitHub 仓库|Cloudflare 自动部署/);
    assert.doesNotMatch(source, /assets\/images\/og-sakura\.png/);
    assert.match(source, /<meta name="twitter:card" content="summary">/);
    assert.match(source, /<meta (?:property="og:image"|name="twitter:image") content="https:\/\/skrto\.top\/assets\/images\/icons\/pwa-512\.png">/);
  });

  const manifest = JSON.parse(fs.readFileSync(path.join(repositoryRoot, "manifest.webmanifest"), "utf8"));
  assert.equal(manifest.name, "SAKURA导航");
  assert.equal(manifest.short_name, "SAKURA导航");
});

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
  assert.equal(core.siteMatchesTerms(site, "PC专区", terms), true);
  assert.equal(core.siteMatchesTerms(site, "PC专区", ["开源", "字幕"]), false);
});

test("single-button and dual-button cards expose complete searchable actions", () => {
  const site = {
    name: "次元城动漫",
    description: "资源丰富的日漫追番软件，解锁会员免广告。",
    url: "https://pan.quark.cn/s/example",
    urlLabel: "夸克",
    secondaryUrl: "https://example.lanzouq.com/example",
    secondaryUrlLabel: "蓝奏云",
    keywords: ["日漫", "追番软件"]
  };

  assert.deepEqual(core.siteActions(site), [
    { label: "夸克", url: "https://pan.quark.cn/s/example" },
    { label: "蓝奏云", url: "https://example.lanzouq.com/example" }
  ]);
  assert.equal(core.hasDualLinks(site), true);
  const singleUrlSite = {
    name: "单链接示例",
    url: "https://example.com/download",
    urlLabel: "下载"
  };
  assert.deepEqual(core.siteActions(singleUrlSite), [
    { label: "下载", url: "https://example.com/download" },
    { label: "暂无", url: "./404.html" }
  ]);
  assert.equal(core.siteMatchesTerms(singleUrlSite, "安卓专区", ["暂无"]), true);
  const singleButtonSite = { name: "普通网站", url: "https://example.com/" };
  assert.deepEqual(core.siteActions(singleButtonSite), [
    { label: "点击进入", url: "https://example.com/" }
  ]);
  assert.equal(core.hasDualLinks(singleButtonSite), false);
  assert.equal(core.siteMatchesTerms(singleButtonSite, "在线工具", ["点击进入"]), true);
  assert.equal(core.siteMatchesTerms(site, "安卓专区", ["夸克"]), true);
  assert.equal(core.siteMatchesTerms(site, "安卓专区", ["lanzouq"]), true);
  assert.equal(core.siteMatchesTerms(site, "安卓专区", ["蓝奏云"]), true);
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
  const data = JSON.parse(JSON.stringify(context.window.SAKURA_DATA));
  assert.ok(Array.isArray(data.categories));
  assert.ok(Array.isArray(data.sites));
  assert.ok(data.categories.length > 0);
  assert.ok(data.sites.length > 0);
  data.sites.forEach((site) => {
    assert.ok([1, 2].includes(core.siteActions(site).length));
  });

  const { sites: hiddenSites, ...hiddenMeta } = data.hiddenSection;
  assert.deepEqual(hiddenMeta, {
    id: "new-world",
    name: "新世界",
    icon: "fa-door-open",
    passphrase: "开门",
    welcome: "欢迎踏入新世界的大门"
  });
  assert.ok(Array.isArray(hiddenSites));

  const normalIds = new Set(data.sites.map((site) => site.id));
  const hiddenIds = new Set();
  const hiddenUrls = new Set();
  hiddenSites.forEach((site) => {
    const requiredFields = ["description", "id", "keywords", "name", "url"];
    const actionFields = ["urlLabel", "secondaryUrl", "secondaryUrlLabel"];
    const allowedFields = new Set([...requiredFields, ...actionFields]);
    requiredFields.forEach((field) => assert.ok(Object.hasOwn(site, field)));
    assert.ok(Object.keys(site).every((field) => allowedFields.has(field)));
    const presentActionFields = actionFields.filter((field) => Object.hasOwn(site, field));
    const hasUrlLabel = presentActionFields.includes("urlLabel");
    const secondaryFieldCount = presentActionFields.filter((field) => field !== "urlLabel").length;
    assert.ok(secondaryFieldCount === 0 || secondaryFieldCount === 2);
    if (secondaryFieldCount) assert.equal(hasUrlLabel, true);
    assert.equal(core.hasDualLinks(site), hasUrlLabel);
    assert.ok([1, 2].includes(core.siteActions(site).length));
    assert.match(site.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(site.name.trim());
    assert.ok(site.description.trim());
    assert.ok(["http:", "https:"].includes(new URL(site.url).protocol));
    assert.ok(Array.isArray(site.keywords));
    assert.ok(site.keywords.length > 0);
    assert.ok(site.keywords.every((keyword) => typeof keyword === "string" && keyword.trim()));
    assert.equal(normalIds.has(site.id), false);
    assert.equal(hiddenIds.has(site.id), false);
    assert.equal(hiddenUrls.has(site.url), false);
    if (site.secondaryUrl) {
      assert.ok(["http:", "https:"].includes(new URL(site.secondaryUrl).protocol));
      assert.equal(hiddenUrls.has(site.secondaryUrl), false);
      hiddenUrls.add(site.secondaryUrl);
    }
    hiddenIds.add(site.id);
    hiddenUrls.add(site.url);
  });
});

test("all normal and hidden cards render actions with the expected visit behavior", () => {
  const application = fs.readFileSync(path.join(repositoryRoot, "assets/js/sakura-app.js"), "utf8");
  const stylesheet = fs.readFileSync(path.join(repositoryRoot, "assets/css/sakura.css"), "utf8");

  assert.match(application, /const cardActions = core\.siteActions\(site\)/);
  assert.match(application, /const cardBody = document\.createElement\("div"\)/);
  assert.doesNotMatch(application, /cardBody\.href\s*=/);
  assert.match(application, /article\.classList\.toggle\("has-single-action", cardActions\.length === 1\)/);
  assert.match(application, /if \(hasCardActions\) \{\s*const actions = document\.createElement\("div"\)/);
  assert.match(application, /if \(!hiddenCard\) actionLink\.addEventListener\("click", \(\) => trackVisit\(site\.id\)\)/);
  assert.match(application, /if \(!hiddenCard\) \{\s*const category = document\.createElement\("span"\)/);
  assert.match(application, /if \(meta\.childElementCount\) copy\.appendChild\(meta\)/);
  assert.match(stylesheet, /\.site-card-link\s*\{[^}]*min-height:\s*156px;/s);
  assert.match(stylesheet, /@media \(max-width:\s*470px\)[\s\S]*?\.site-card-link\s*\{[^}]*min-height:\s*150px;/);
  assert.match(stylesheet, /\.site-card-copy\s*\{[^}]*flex:\s*1 1 0;/s);
  assert.match(stylesheet, /\.site-card-actions\s*\{[^}]*width:\s*min\(100%, 224px\);[^}]*gap:\s*8px;[^}]*margin:\s*10px auto 0;/s);
  assert.match(stylesheet, /\.site-card\.has-single-action \.site-card-actions\s*\{[^}]*width:\s*min\(100%, 108px\);/s);
  assert.match(stylesheet, /\.site-card-action\s*\{[^}]*min-height:\s*36px;[^}]*border-radius:\s*999px;[^}]*font-size:\s*12px;/s);
  assert.match(stylesheet, /\.site-card-action\s*\{[^}]*border:\s*1px solid color-mix\(in srgb, var\(--primary\) 18%, var\(--line\)\);[^}]*background:\s*color-mix\(in srgb, var\(--primary\) 14%, var\(--surface\)\);/s);
  assert.match(stylesheet, /\.favorite-button\s*\{[^}]*border:\s*1px solid transparent;[^}]*border-radius:\s*50%;[^}]*box-shadow:\s*none;/s);
  assert.match(stylesheet, /\.favorite-button\.is-active,\s*\.favorite-button\[aria-pressed="true"\]\s*\{[^}]*border-color:\s*transparent;[^}]*color:\s*var\(--primary-strong\);[^}]*background:\s*color-mix\(in srgb, var\(--primary\) 15%, var\(--surface-solid\)\);[^}]*box-shadow:\s*none;/s);
  assert.doesNotMatch(stylesheet, /--favorite-foreground/);
  assert.match(stylesheet, /\.site-card-link:hover\s*\{[^}]*transform:\s*none;/s);
  assert.match(stylesheet, /\.site-card-link:active\s*\{[^}]*transform:\s*none;/s);
  assert.match(stylesheet, /@media \(max-width:\s*768px\)[\s\S]*?\.site-card-actions\s*\{[^}]*width:\s*min\(100%, 240px\);[\s\S]*?\.site-card\.has-single-action \.site-card-actions\s*\{[^}]*width:\s*min\(100%, 112px\);[\s\S]*?\.site-card-action\s*\{[^}]*min-height:\s*38px;/);
  assert.match(stylesheet, /@media \(max-width:\s*470px\)[\s\S]*?\.site-card-actions\s*\{[^}]*width:\s*min\(100%, 264px\);[\s\S]*?\.site-card\.has-single-action \.site-card-actions\s*\{[^}]*width:\s*min\(100%, 120px\);[\s\S]*?\.site-card-action\s*\{[^}]*min-height:\s*40px;[^}]*font-size:\s*13px;/);
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
  const application = fs.readFileSync(path.join(repositoryRoot, "assets/js/sakura-app.js"), "utf8").replace(/\r\n?/g, "\n");
  const handlerStart = application.indexOf('resetFilters?.addEventListener("click"');
  const handlerEnd = application.indexOf("\n\n    if (search) {", handlerStart);
  const resetHandler = application.slice(handlerStart, handlerEnd);

  assert.notEqual(handlerStart, -1);
  assert.notEqual(handlerEnd, -1);
  assert.match(resetHandler, /render\(\);\s*scheduleResultScroll\(\);/);
  assert.doesNotMatch(resetHandler, /search\?*\.focus\(/);
});

test("favorite rerenders preserve focus and keyboard selection focuses card actions", () => {
  const application = fs.readFileSync(path.join(repositoryRoot, "assets/js/sakura-app.js"), "utf8");

  assert.match(application, /function scheduleFavoriteFocus\([\s\S]*?preventScroll:\s*true/);
  assert.match(application, /render\(\);\s*scheduleFavoriteFocus\(siteId, true\);/);
  assert.match(application, /announceUtility\(`已选择 \$\{siteName\}，按 Enter 选择操作按钮`\)/);
  assert.match(application, /const firstAction = card\?\.querySelector\("\.site-card-action"\)/);
  assert.match(application, /firstAction\.focus\(\)/);
  assert.doesNotMatch(application, /card\?\.querySelector\("\.site-card-link"\)\?\.click\(\)/);
});

test("the configured Android dual-link card renders only its two action links", () => {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(repositoryRoot, "assets/js/sites-data.js"), "utf8"), context);
  const data = JSON.parse(JSON.stringify(context.window.SAKURA_DATA));
  const site = data.sites.find((entry) => entry.id === "ciyuancheng-anime");
  const application = fs.readFileSync(path.join(repositoryRoot, "assets/js/sakura-app.js"), "utf8");

  assert.deepEqual(site, {
    id: "ciyuancheng-anime",
    name: "次元城动漫",
    url: "https://pan.quark.cn/s/a7d060249bb7",
    urlLabel: "夸克网盘",
    secondaryUrl: "https://qiuyw.lanzouq.com/isrrM3spg3lc",
    secondaryUrlLabel: "蓝奏云",
    description: "资源丰富的日漫追番软件，解锁会员免广告。",
    category: "android",
    keywords: ["次元城动漫", "次元城", "日漫", "追番软件", "安卓软件", "夸克", "蓝奏云"],
    addedAt: "2026-07-19"
  });
  assert.match(application, /const cardBody = document\.createElement\("div"\)/);
  assert.match(application, /cardActions\.forEach\(\(action\) =>/);
  assert.match(application, /actionLink\.addEventListener\("click", \(\) => trackVisit\(site\.id\)\)/);

  const healthCheck = fs.readFileSync(path.join(repositoryRoot, "tools/check_links.py"), "utf8");
  assert.match(healthCheck, /if re\.search\(r'\\burlLabel\\s\*:', block\):\s+continue/);
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

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
    assert.match(source, /<meta name="theme-color" content="#f7f8fa">/);
    assert.match(source, /<meta (?:property="og:image"|name="twitter:image") content="https:\/\/skrto\.top\/assets\/images\/icons\/pwa-512\.png">/);
    assert.match(source, /data-color-theme-control/);
    assert.match(source, /data-color-theme-toggle/);
    assert.match(source, /data-color-theme-panel/);
  });

  const manifest = JSON.parse(fs.readFileSync(path.join(repositoryRoot, "manifest.webmanifest"), "utf8"));
  assert.equal(manifest.name, "SAKURA导航");
  assert.equal(manifest.short_name, "SAKURA导航");
  assert.equal(manifest.background_color, "#f7f8fa");
  assert.equal(manifest.theme_color, "#f7f8fa");
});

test("theme mode follows the expected three-state cycle", () => {
  assert.equal(core.normalizeThemeMode(null), "auto");
  assert.equal(core.resolveTheme("auto", false), "light");
  assert.equal(core.resolveTheme("auto", true), "dark");
  assert.equal(core.nextThemeMode("auto"), "light");
  assert.equal(core.nextThemeMode("light"), "dark");
  assert.equal(core.nextThemeMode("dark"), "auto");
});

test("color themes include every requested palette and default to Miku green", () => {
  assert.deepEqual(
    core.colorThemes.map((theme) => [theme.id, theme.name, theme.color]),
    [
      ["miku", "初音绿", "#39C5BB"],
      ["purple", "经典紫", "#7565D9"],
      ["ocean", "海洋蓝", "#2484E4"],
      ["apple", "苹果绿", "#34C759"],
      ["sakura", "樱花粉", "#E784A6"],
      ["amber", "琥珀橙", "#E89A2E"],
      ["black-gold", "黑金色", "#C49A45"],
      ["teal", "青绿色", "#089E98"]
    ]
  );
  assert.equal(core.normalizeColorTheme(null), "miku");
  assert.equal(core.normalizeColorTheme("unknown"), "miku");
  assert.equal(core.normalizeColorTheme("purple"), "purple");
});

test("theme initialization applies saved and system preferences before paint", () => {
  const source = fs.readFileSync(path.join(repositoryRoot, "assets/js/theme-init.js"), "utf8");
  function initialize(savedMode, savedColorTheme, systemDark) {
    const dataset = {};
    vm.runInNewContext(source, {
      document: { documentElement: { dataset } },
      window: {
        localStorage: {
          getItem: (key) => key === "sakura-theme" ? savedMode : savedColorTheme
        },
        matchMedia: () => ({ matches: systemDark })
      }
    });
    return dataset;
  }

  assert.deepEqual(initialize(null, null, true), { themeMode: "auto", theme: "dark", colorTheme: "miku" });
  assert.deepEqual(initialize("light", "purple", true), { themeMode: "light", theme: "light", colorTheme: "purple" });
  assert.deepEqual(initialize("dark", "invalid", false), { themeMode: "dark", theme: "dark", colorTheme: "miku" });
});

test("application guard waits for navigation data before revealing an initialization fallback", async () => {
  const source = fs.readFileSync(path.join(repositoryRoot, "assets/js/app-guard.js"), "utf8");
  async function fallbackHidden(appReady) {
    const fallback = { hidden: true };
    let onLoad;
    const documentElement = { dataset: appReady ? { appReady: "true" } : {} };
    vm.runInNewContext(source, {
      document: {
        documentElement,
        querySelectorAll: () => [fallback]
      },
      window: {
        SAKURA_DATA_READY: Promise.resolve(),
        addEventListener: (_event, callback) => { onLoad = callback; },
        requestAnimationFrame: (callback) => callback()
      }
    });
    onLoad();
    await new Promise((resolve) => setImmediate(resolve));
    return fallback.hidden;
  }

  assert.equal(await fallbackHidden(true), true);
  assert.equal(await fallbackHidden(false), false);
});

test("database loader accepts legitimate empty data and sanitizes bundled hidden fallback data", async () => {
  const source = fs.readFileSync(path.join(repositoryRoot, "assets/js/data-loader.js"), "utf8");
  const bundled = {
    categories: [{ id: "tools", name: "在线工具", icon: "fa-tools" }],
    sites: [{ id: "example", name: "示例", url: "https://example.com/", category: "tools" }],
    hiddenSection: {
      id: "new-world",
      name: "新世界",
      icon: "fa-door-open",
      passphrase: "secret",
      welcome: "欢迎",
      sites: [{ id: "hidden", url: "https://hidden.example/" }]
    }
  };

  async function loadWith(fetch) {
    const window = {
      SAKURA_DATA: bundled,
      setTimeout,
      clearTimeout
    };
    vm.runInNewContext(source, { window, fetch, AbortController, Object, console: { info() {} } });
    return JSON.parse(JSON.stringify(await window.SAKURA_DATA_READY));
  }

  const remote = await loadWith(async () => new Response(JSON.stringify({
    data: {
      categories: [],
      sites: [],
      hiddenSection: { id: "new-world", name: "新世界", icon: "fa-door-open", welcome: "欢迎", unlockHash: "a".repeat(64) },
      announcement: { text: "临时公告" }
    }
  }), { status: 200, headers: { "Content-Type": "application/json" } }));
  assert.equal(remote.source, "database");
  assert.deepEqual(remote.categories, []);
  assert.deepEqual(remote.sites, []);
  assert.deepEqual(remote.announcement, { text: "临时公告" });

  const fallback = await loadWith(async () => { throw new Error("database offline"); });
  assert.equal(fallback.source, "snapshot");
  assert.equal(fallback.sites.length, 1);
  assert.equal(fallback.hiddenSection.enabled, false);
  assert.equal(Object.hasOwn(fallback.hiddenSection, "passphrase"), false);
  assert.equal(Object.hasOwn(fallback.hiddenSection, "sites"), false);
  assert.equal(fallback.announcement, null);
  assert.match(source, /const timeout = 2000/);
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
  assert.deepEqual(data.categories.find((category) => category.id === "software"), {
    id: "software",
    name: "PC专区",
    icon: "fa-desktop"
  });
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
  assert.match(application, /if \(!hiddenCard\) actionLink\.addEventListener\("click", \(\) => \{ trackVisit\(site\.id\); reportSiteClick\(site\.id\); \}\)/);
  assert.match(application, /if \(!hiddenCard\) \{\s*const category = document\.createElement\("span"\)/);
  assert.match(application, /if \(meta\.childElementCount\) copy\.appendChild\(meta\)/);
  assert.match(stylesheet, /\.site-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);/s);
  assert.match(stylesheet, /\.site-card-link\s*\{[^}]*min-height:\s*136px;[^}]*align-items:\s*center;[^}]*padding:\s*16px;/s);
  assert.match(stylesheet, /\.site-card-link\s*\{[^}]*border:\s*1px solid var\(--card-border\);[^}]*background:\s*var\(--card-bg\);[^}]*box-shadow:\s*var\(--card-shadow\);/s);
  assert.doesNotMatch(stylesheet, /\.site-card-link\s*\{[^}]*transition:\s*background-color/s);
  assert.doesNotMatch(stylesheet, /\.site-card-link\s*\{[^}]*box-shadow:\s*0 1px 0/s);
  assert.match(stylesheet, /@media \(max-width:\s*470px\)[\s\S]*?\.site-card-link\s*\{[^}]*min-height:\s*136px;/);
  assert.match(stylesheet, /\.site-card-copy\s*\{[^}]*display:\s*flex;[^}]*flex:\s*1 1 0;[^}]*justify-content:\s*center;[^}]*flex-direction:\s*column;[^}]*padding-right:\s*100px;/s);
  assert.match(stylesheet, /\.site-card-actions\s*\{[^}]*position:\s*absolute;[^}]*top:\s*50%;[^}]*right:\s*16px;[^}]*width:\s*92px;[^}]*flex-direction:\s*column;[^}]*gap:\s*7px;[^}]*transform:\s*translateY\(-50%\);/s);
  assert.match(stylesheet, /\.site-card-action\s*\{[^}]*min-height:\s*36px;[^}]*border-radius:\s*999px;[^}]*font-size:\s*12px;/s);
  assert.match(stylesheet, /\.site-icon\s*\{[^}]*flex:\s*0 0 64px;[^}]*width:\s*64px;[^}]*height:\s*64px;[^}]*border-radius:\s*var\(--apple-corner-icon\);/s);
  assert.match(stylesheet, /\.site-icon i\s*\{[^}]*font-size:\s*28px;/s);
  assert.match(stylesheet, /\.site-card-title\s*\{[^}]*display:\s*-webkit-box;[^}]*font-size:\s*18px;[^}]*font-weight:\s*760;[^}]*-webkit-line-clamp:\s*2;/s);
  assert.match(stylesheet, /\.site-card-description\s*\{[^}]*min-height:\s*2\.84em;[^}]*color:\s*color-mix\(in srgb, var\(--text\) 76%, var\(--muted\)\);[^}]*font-size:\s*15px;[^}]*font-weight:\s*480;[^}]*-webkit-line-clamp:\s*2;/s);
  assert.match(stylesheet, /@media \(hover:\s*hover\) and \(pointer:\s*fine\)\s*\{[\s\S]*?\.site-card-link:hover \.site-icon\s*\{[^}]*translate3d\(0, -2px, 0\) rotate\(-4deg\) scale\(1\.07\);/);
  assert.match(stylesheet, /\.site-card-link\.is-icon-pressed \.site-icon,[\s\S]*?\.site-card-link:active \.site-icon\s*\{[^}]*translate3d\(0, -1px, 0\) rotate\(-4deg\) scale\(1\.07\);[^}]*transition-duration:\s*120ms;/s);
  assert.match(application, /function pressCardIcon\(event\)[\s\S]*event\.target\.closest\?\.\("\.site-card-link"\)[\s\S]*cardBody\.classList\.add\("is-icon-pressed"\)/);
  assert.match(application, /document\.addEventListener\("pointerdown", pressCardIcon\);[\s\S]*document\.addEventListener\("pointerup", clearPressedCardIcon\);[\s\S]*document\.addEventListener\("pointercancel", clearPressedCardIcon\);/);
  assert.match(application, /document\.addEventListener\("touchstart", pressCardIcon, \{ passive: true \}\);[\s\S]*document\.addEventListener\("touchend", clearPressedCardIcon, \{ passive: true \}\);[\s\S]*document\.addEventListener\("touchcancel", clearPressedCardIcon, \{ passive: true \}\);/);
  assert.match(stylesheet, /\.site-card-action\s*\{[^}]*border:\s*1px solid var\(--layer-border\);[^}]*color:\s*var\(--primary-strong\);[^}]*background:\s*var\(--control-bg\);[^}]*box-shadow:\s*none;/s);
  assert.doesNotMatch(stylesheet, /\.site-card-action\s*\{[^}]*box-shadow:[^}]*inset 0 [1-9]px 0/s);
  assert.match(stylesheet, /@media \(hover:\s*hover\) and \(pointer:\s*fine\)\s*\{[\s\S]*?\.site-card-action:hover\s*\{[^}]*background:\s*var\(--control-bg-hover\);[^}]*box-shadow:\s*none;[^}]*transform:\s*none;/s);
  assert.doesNotMatch(stylesheet, /\.site-card-action:hover\s*,\s*\.site-card-action:focus-visible/);
  assert.doesNotMatch(stylesheet, /\.site-card-link:hover\s*\{[^}]*background:/s);
  assert.match(stylesheet, /\.site-card-link:active\s*\{[^}]*transform:\s*none;/s);
  assert.match(stylesheet, /@media \(max-width:\s*768px\)[\s\S]*?\.site-card-actions\s*\{[^}]*right:\s*14px;[^}]*width:\s*88px;[\s\S]*?\.site-card-copy\s*\{[^}]*padding-right:\s*94px;[\s\S]*?\.site-card-title\s*\{[^}]*font-size:\s*17px;[\s\S]*?\.site-card-description\s*\{[^}]*font-size:\s*14px;[\s\S]*?\.site-icon\s*\{[^}]*flex-basis:\s*60px;[^}]*width:\s*60px;[^}]*height:\s*60px;/);
  assert.match(stylesheet, /@media \(max-width:\s*470px\)[\s\S]*?\.site-card-link\s*\{[^}]*gap:\s*10px;[^}]*padding:\s*12px;[\s\S]*?\.site-card-actions\s*\{[^}]*width:\s*76px;[\s\S]*?\.site-card-copy\s*\{[^}]*padding-right:\s*84px;[\s\S]*?\.site-icon\s*\{[^}]*flex-basis:\s*52px;/);
  assert.match(stylesheet, /@media \(max-width:\s*350px\)[\s\S]*?\.site-card-actions\s*\{[^}]*width:\s*70px;[\s\S]*?\.site-card-copy\s*\{[^}]*padding-right:\s*78px;[\s\S]*?\.site-icon\s*\{[^}]*flex-basis:\s*48px;/);
  assert.doesNotMatch(application, /sakura-favorites|favorite-button|favorite-order|scheduleFavoriteFocus|toggleFavorite|moveFavorite/);
  assert.doesNotMatch(stylesheet, /favorite-button|favorite-order|has-order-controls|--favorite-foreground/);
});

test("maintenance states, private click counting and temporary announcements are progressively rendered", () => {
  const homepage = fs.readFileSync(path.join(repositoryRoot, "index.html"), "utf8");
  const application = fs.readFileSync(path.join(repositoryRoot, "assets/js/sakura-app.js"), "utf8");
  const stylesheet = fs.readFileSync(path.join(repositoryRoot, "assets/css/sakura.css"), "utf8");
  assert.match(homepage, /data-site-announcement[^>]*hidden>[\s\S]*data-site-announcement-text/);
  assert.match(application, /data\.announcement\?\.text[\s\S]*siteAnnouncement\.hidden = false/);
  assert.match(application, /function reportSiteClick\(siteId\)[\s\S]*"\.\/api\/public\/click"[\s\S]*keepalive: true[\s\S]*JSON\.stringify\(\{ siteId \}\)/);
  assert.doesNotMatch(application, /reportSiteClick\([^)]*,/);
  assert.match(application, /site\.maintenanceStatus === "review" \? "待复查" : "临时失效"/);
  assert.match(application, /document\.createElement\(site\.maintenanceStatus === "unavailable" \? "span" : "a"\)/);
  assert.match(application, /actionLink\.setAttribute\("aria-disabled", "true"\)/);
  assert.match(stylesheet, /\.site-announcement\s*\{[^}]*width:\s*fit-content;[^}]*max-width:\s*min\(100%, 920px\);/s);
  assert.match(stylesheet, /\.site-card-action\.is-disabled,[\s\S]*cursor:\s*not-allowed;/);
  assert.match(stylesheet, /\.site-card-maintenance\.is-review[\s\S]*\.site-card-maintenance\.is-unavailable/);
});

test("navigation controls use lightweight Liquid Glass with accessible fallbacks", () => {
  const stylesheet = fs.readFileSync(path.join(repositoryRoot, "assets/css/sakura.css"), "utf8");

  assert.match(stylesheet, /:root\s*\{[^}]*--glass-bg:\s*rgba\(255, 255, 255, 0\.58\);[^}]*--glass-border:[^}]*--glass-shadow:/s);
  assert.match(stylesheet, /:root\[data-theme="dark"\]\s*\{[^}]*--glass-bg:\s*rgba\(33, 36, 49, 0\.6\);[^}]*--glass-border:[^}]*--glass-shadow:/s);
  assert.match(stylesheet, /:root\s*\{[^}]*--layer-border:\s*rgba\(37, 35, 56, 0\.14\);[^}]*--card-bg:\s*#ffffff;[^}]*--card-border:\s*rgba\(37, 35, 56, 0\.06\);[^}]*--card-shadow:\s*0 8px 24px rgba\(37, 35, 56, 0\.06\);[^}]*--control-bg:/s);
  assert.match(stylesheet, /:root\[data-theme="dark"\]\s*\{[^}]*--card-bg:\s*#2c2c2e;[^}]*--card-border:\s*rgba\(255, 255, 255, 0\.04\);[^}]*--card-shadow:\s*none;/s);
  assert.match(stylesheet, /\.site-header\s*\{[^}]*border-bottom:\s*1px solid var\(--layer-border\);[^}]*background:\s*linear-gradient\([^}]*var\(--glass-bg\);[^}]*box-shadow:\s*inset 0 1px 0 var\(--glass-highlight\);[^}]*backdrop-filter:\s*blur\(22px\) saturate\(155%\);/s);
  assert.match(stylesheet, /\.site-nav\s*\{[^}]*color-mix\(in srgb, var\(--surface-solid\) 94%, var\(--glass-bg-strong\)\);/s);
  assert.match(stylesheet, /\.nav-link\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--surface-solid\) 90%, var\(--glass-bg-strong\)\);/s);
  assert.match(stylesheet, /\.icon-button\s*\{[^}]*border:\s*1px solid var\(--layer-border\);[^}]*background:\s*linear-gradient\([^}]*var\(--control-bg\);[^}]*box-shadow:\s*inset 0 0 0 1px color-mix\(in srgb, var\(--glass-highlight\) 48%, transparent\)/s);
  assert.match(stylesheet, /\.icon-button:hover\s*\{[^}]*background:\s*linear-gradient\([^}]*var\(--control-bg-hover\);[^}]*box-shadow:\s*inset[^}]*transform:\s*none;/s);
  assert.match(stylesheet, /\.category-bar\s*\{[^}]*border:\s*1px solid var\(--layer-border\);[^}]*backdrop-filter:\s*blur\(18px\) saturate\(150%\);/s);
  assert.match(stylesheet, /@media \(max-width:\s*768px\)[\s\S]*?\.site-header,[\s\S]*?\.category-bar\s*\{[^}]*backdrop-filter:\s*blur\(14px\) saturate\(135%\);/);
  assert.match(stylesheet, /@supports not \(\(backdrop-filter:\s*blur\(1px\)\) or \(-webkit-backdrop-filter:\s*blur\(1px\)\)\)[\s\S]*?background:\s*var\(--glass-bg-fallback\);/);
  assert.match(stylesheet, /@media \(prefers-reduced-transparency:\s*reduce\)[\s\S]*?backdrop-filter:\s*none;/);
});

test("public styles keep a complete Android baseline without modern color mixing", () => {
  const stylesheet = fs.readFileSync(path.join(repositoryRoot, "assets/css/sakura.css"), "utf8");
  const fallbackStart = stylesheet.indexOf("@supports not (color: color-mix(in srgb, #000 50%, #fff))");
  const reducedTransparencyStart = stylesheet.indexOf("@media (prefers-reduced-transparency: reduce)", fallbackStart);
  const fallback = stylesheet.slice(fallbackStart, reducedTransparencyStart);

  assert.match(stylesheet, /html\s*\{[^}]*-webkit-text-size-adjust:\s*100%;[^}]*text-size-adjust:\s*100%;/s);
  assert.match(stylesheet, /:root\s*\{[^}]*--muted:\s*#6d697d;[^}]*--primary-strong:\s*#14756f;/s);
  assert.notEqual(fallbackStart, -1);
  assert.notEqual(reducedTransparencyStart, -1);
  assert.match(fallback, /body\s*\{[^}]*background:\s*var\(--bg\);/s);
  assert.match(fallback, /\.site-header,[\s\S]*?\.icon-button\s*\{[^}]*background:\s*var\(--glass-bg-fallback\);/s);
  assert.match(fallback, /\.segmented-indicator\s*\{[^}]*border-color:\s*transparent;[^}]*background:\s*var\(--surface-soft\);[^}]*box-shadow:\s*none;/s);
  assert.match(fallback, /\.site-card-action\s*\{[^}]*border-color:\s*var\(--layer-border\);[^}]*background:\s*var\(--control-bg\);[^}]*box-shadow:\s*none;/s);
  assert.match(fallback, /\.site-card-link\s*\{[^}]*border-color:\s*var\(--card-border\);[^}]*background:\s*var\(--card-bg\);[^}]*box-shadow:\s*var\(--card-shadow\);/s);
  assert.match(fallback, /\.site-card-description,[\s\S]*?\.category-bar \.filter-chip\s*\{[^}]*color:\s*var\(--muted\);/s);
  assert.match(fallback, /--category-icon-bg:\s*var\(--surface-soft\);[^}]*--category-icon-border:\s*var\(--layer-border\);/s);
});

test("content cards reveal once on scroll with accessible motion fallbacks", () => {
  const application = fs.readFileSync(path.join(repositoryRoot, "assets/js/sakura-app.js"), "utf8");
  const stylesheet = fs.readFileSync(path.join(repositoryRoot, "assets/css/sakura.css"), "utf8");

  assert.match(application, /const revealedContentKeys = new Set\(\);/);
  assert.match(application, /function markContentReveal\(element, key, delay = 0\)/);
  assert.match(application, /function refreshContentReveals\(\)[\s\S]*contentRevealObserver\?\.disconnect\(\);/);
  assert.match(application, /typeof window\.IntersectionObserver !== "function"/);
  assert.match(application, /function isContentTargetInitiallyVisible\(target\)[\s\S]*target\.getBoundingClientRect\(\)[\s\S]*window\.innerHeight \* 0\.96[\s\S]*visibleHeight >= rect\.height \* 0\.08/);
  assert.match(application, /function revealContentTarget\(target, immediate = false\)[\s\S]*is-content-reveal-immediate[\s\S]*requestAnimationFrame/);
  assert.match(application, /const initiallyVisibleTargets = targets\.filter\(isContentTargetInitiallyVisible\);[\s\S]*revealContentTarget\(target, true\)/);
  assert.match(application, /new IntersectionObserver\([\s\S]*observer\.unobserve\(target\);[\s\S]*revealContentTarget\(target\)/);
  assert.match(application, /threshold: 0\.08, rootMargin: "0px 0px -4% 0px"/);
  assert.match(application, /`card:\$\{hiddenCard \? "hidden" : "normal"\}:\$\{site\.id\}`/);
  assert.match(application, /markContentReveal\(heading, `heading:\$\{category\.id\}`\)/);
  assert.match(stylesheet, /\.content-reveal\s*\{[^}]*opacity:\s*0;[^}]*transform:\s*translate3d\(0, 16px, 0\);[^}]*620ms cubic-bezier\(0\.22, 1, 0\.36, 1\)/s);
  assert.match(stylesheet, /\.content-reveal\.is-content-revealed\s*\{[^}]*opacity:\s*1;[^}]*transform:\s*none;/s);
  assert.match(stylesheet, /\.content-reveal\.is-content-reveal-immediate\s*\{[^}]*transition:\s*none;/s);
  assert.match(stylesheet, /@media \(min-width: 769px\) and \(hover: hover\) and \(pointer: fine\)[\s\S]*?\.content-reveal\s*\{[^}]*filter:\s*blur\(1\.5px\);/);
  assert.match(stylesheet, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.content-reveal,[\s\S]*?opacity:\s*1;[\s\S]*?transition:\s*none;/);
  assert.doesNotMatch(stylesheet, /site-card-enter|\.site-card:nth-child\([^)]*\)[^{]*\{[^}]*animation-delay/s);
});

test("cards and square controls use responsive Apple-style continuous corners", () => {
  const stylesheet = fs.readFileSync(path.join(repositoryRoot, "assets/css/sakura.css"), "utf8");

  assert.match(stylesheet, /:root\s*\{[^}]*--apple-corner-card:\s*24px;[^}]*--apple-corner-panel:\s*24px;[^}]*--apple-corner-control:\s*14px;[^}]*--apple-corner-icon:\s*18px;/s);
  assert.match(stylesheet, /\.site-card-link\s*\{[^}]*border-radius:\s*var\(--apple-corner-card\);/s);
  assert.match(stylesheet, /\.icon-button\s*\{[^}]*border-radius:\s*var\(--apple-corner-control\);/s);
  assert.match(stylesheet, /@media \(max-width:\s*768px\)\s*\{[\s\S]*?:root\s*\{[^}]*--apple-corner-card:\s*22px;[^}]*--apple-corner-panel:\s*22px;[^}]*--apple-corner-control:\s*13px;[^}]*--apple-corner-icon:\s*17px;/);
  assert.match(stylesheet, /@supports \(corner-shape:\s*squircle\)\s*\{[\s\S]*?\.icon-button:not\(\.back-to-top\),[\s\S]*?\.site-card-link,[\s\S]*?\.site-icon,[\s\S]*?\.prose-card,[\s\S]*?\.button\s*\{\s*corner-shape:\s*squircle;/);
  assert.match(stylesheet, /\.site-card-action\s*\{[^}]*border-radius:\s*999px;/s);
  assert.match(stylesheet, /\.category-bar\s*\{[^}]*border-radius:\s*999px;/s);
});

test("page background uses solid neutral colors without ambient gradients", () => {
  const stylesheet = fs.readFileSync(path.join(repositoryRoot, "assets/css/sakura.css"), "utf8");
  const bodyBlock = stylesheet.match(/\nbody\s*\{([\s\S]*?)\n\}/)?.[1] || "";

  assert.match(stylesheet, /:root\s*\{[^}]*--bg:\s*#f7f8fa;/s);
  assert.match(stylesheet, /:root\[data-theme="dark"\]\s*\{[^}]*--bg:\s*#0d0f14;/s);
  assert.match(stylesheet, /html\s*\{[^}]*background:\s*var\(--bg\);/s);
  assert.match(bodyBlock, /background:\s*var\(--bg\);/s);
  assert.doesNotMatch(stylesheet, /--page-ambient-|\.admin-atmosphere/);
  assert.doesNotMatch(bodyBlock, /gradient\(/);
});

test("segmented controls use one sliding indicator without bounce", () => {
  const stylesheet = fs.readFileSync(path.join(repositoryRoot, "assets/css/sakura.css"), "utf8");
  const application = fs.readFileSync(path.join(repositoryRoot, "assets/js/sakura-app.js"), "utf8");

  assert.doesNotMatch(stylesheet, /\.hero::before\s*\{/);
  assert.match(stylesheet, /\.category-bar\s*\{[^}]*box-shadow:\s*var\(--neutral-lift\), inset 0 0 0 1px color-mix\(in srgb, var\(--glass-highlight\) 48%, transparent\);/s);
  assert.doesNotMatch(stylesheet, /\.category-bar\s*\{[^}]*0 8px 24px/s);
  assert.match(stylesheet, /\.filter-chip-count,\s*\.group-count\s*\{[^}]*min-width:\s*22px;[^}]*height:\s*22px;[^}]*font-variant-numeric:\s*tabular-nums;/s);
  assert.match(stylesheet, /\.filter-chip-count\s*\{[^}]*margin-left:\s*6px;/s);
  assert.match(stylesheet, /\.group-count\s*\{[^}]*min-width:\s*24px;[^}]*margin-left:\s*-4px;/s);
  assert.match(stylesheet, /\.category-bar \.filter-chip\s*\{[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/s);
  assert.match(stylesheet, /\.segmented-indicator\s*\{[^}]*width:\s*var\(--segmented-indicator-width, 0px\);[^}]*transform:\s*translate3d\(var\(--segmented-indicator-x, 0px\), 0, 0\);[^}]*width 240ms[^}]*transform 240ms/s);
  assert.match(stylesheet, /\.segmented-indicator\s*\{[^}]*border:\s*1px solid color-mix\(in srgb, var\(--primary\) 10%, transparent\);[^}]*background:\s*color-mix\(in srgb, var\(--primary\) 10%, var\(--surface-solid\)\);[^}]*box-shadow:\s*none;/s);
  assert.match(stylesheet, /\.category-bar \.filter-chip\.is-active,[\s\S]*?\.category-bar \.filter-chip\[aria-pressed="true"\]\s*\{[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/s);
  assert.match(stylesheet, /\.site-card-action\s*\{[^}]*box-shadow:\s*none;/s);
  assert.match(stylesheet, /\.site-card-action:focus-visible\s*\{[^}]*box-shadow:\s*none;[^}]*outline:\s*3px solid color-mix\(in srgb, var\(--primary\) 24%, transparent\);/s);
  assert.match(application, /function ensureSegmentedIndicator\(container\)[\s\S]*container\.prepend\(indicator\)/);
  assert.match(application, /indicator\.style\.setProperty\("--segmented-indicator-x", `\$\{active\.offsetLeft\}px`\)/);
  assert.match(application, /const shouldAnimate = animate && !reducedMotion/);
  assert.doesNotMatch(stylesheet, /is-bouncing|segmented-control-bounce/);
  assert.doesNotMatch(application, /is-bouncing|animationend/);
});

test("homepage moves recent visits into navigation and removes obsolete views", () => {
  const homepage = fs.readFileSync(path.join(repositoryRoot, "index.html"), "utf8");
  const aboutPage = fs.readFileSync(path.join(repositoryRoot, "about/index.html"), "utf8");
  const stylesheet = fs.readFileSync(path.join(repositoryRoot, "assets/css/sakura.css"), "utf8");
  const application = fs.readFileSync(path.join(repositoryRoot, "assets/js/sakura-app.js"), "utf8");
  const siteData = fs.readFileSync(path.join(repositoryRoot, "assets/js/sites-data.js"), "utf8");

  assert.match(homepage, /href="\.\/\?view=history" data-history-nav[^>]*>[\s\S]*?最近访问<\/a>/);
  assert.match(aboutPage, /href="\.\.\/\?view=history"[^>]*>[\s\S]*?最近访问<\/a>/);
  assert.match(homepage, /data-return-home hidden>[\s\S]*?返回首页<\/span>/);
  assert.match(homepage, /data-clear-recent hidden>[\s\S]*?清空最近访问<\/span>/);
  assert.doesNotMatch(homepage, /data-view-switcher|data-view=|>\s*全部站点\s*<|>\s*最近收录\s*</);
  assert.doesNotMatch(stylesheet, /view-switcher|site-card-date/);
  assert.match(application, /state\.view = view === "history" \? "history" : "all";/);
  assert.match(application, /function updateViewNavigation\(\)[\s\S]*historyNavLink\.setAttribute\("aria-current", "page"\)/);
  assert.match(application, /function navigateToPrimaryView\(nextView, historyMode = "push"\)[\s\S]*updateUrlState\(routeChanged \? historyMode : "replace"\);[\s\S]*scheduleResultScroll\(\);/);
  assert.match(application, /historyNavLink\?\.addEventListener\("click",[\s\S]*handlePrimaryNavigation\(event, "history"\)/);
  assert.match(application, /returnHome\?\.addEventListener\("click", \(\) => navigateToPrimaryView\("all"\)\)/);
  assert.match(application, /window\.history\.pushState\([\s\S]*window\.addEventListener\("popstate"/);
  assert.match(stylesheet, /\.utility-button\[hidden\]\s*\{[^}]*display:\s*none;/s);
  assert.match(application, /state\.view === "history" && sites\.length[\s\S]*name: "最近访问"/);
  assert.doesNotMatch(application, /viewSwitcher|viewIndicator|validViews|state\.view === "recent"|formatAddedDate|site-card-date/);
  assert.doesNotMatch(siteData, /\b(?:featured|popular)\s*:/);
});

test("search and categories use a compact Telegram-style hierarchy", () => {
  const homepage = fs.readFileSync(path.join(repositoryRoot, "index.html"), "utf8");
  const stylesheet = fs.readFileSync(path.join(repositoryRoot, "assets/css/sakura.css"), "utf8");
  const application = fs.readFileSync(path.join(repositoryRoot, "assets/js/sakura-app.js"), "utf8");
  const searchIndex = homepage.indexOf("data-search-form");
  const categoryIndex = homepage.indexOf("data-category-bar");
  const summaryIndex = homepage.indexOf("data-search-result");

  assert.ok(searchIndex !== -1 && categoryIndex > searchIndex && summaryIndex > categoryIndex);
  assert.doesNotMatch(homepage, /search-meta|支持名称、描述、分类、缩写与多关键词搜索/);
  assert.match(homepage, /class="container category-summary"[\s\S]*data-search-result/);
  assert.match(homepage, /<h2 id="collection-title">网站分类<\/h2>/);
  assert.match(stylesheet, /\.search-wrap\s*\{[^}]*max-width:\s*1040px;/s);
  assert.match(stylesheet, /\.search-input\s*\{[^}]*height:\s*56px;[^}]*border:\s*1px solid var\(--layer-border\);[^}]*background:\s*var\(--control-bg\);[^}]*box-shadow:\s*var\(--neutral-lift\), inset 0 0 0 1px/s);
  assert.match(stylesheet, /\.category-slider\s*\{[^}]*width:\s*min\(100%, 1040px\);/s);
  assert.match(stylesheet, /\.category-bar\s*\{[^}]*width:\s*100%;[^}]*min-height:\s*46px;[^}]*padding:\s*2px;/s);
  assert.match(stylesheet, /\.category-bar \.filter-chip\s*\{[^}]*font-size:\s*14px;[^}]*font-weight:\s*720;/s);
  assert.match(stylesheet, /\.category-bar \.filter-chip-count\s*\{[^}]*font-size:\s*12px;/s);
  assert.match(stylesheet, /@media \(min-width:\s*1024px\)\s*\{\s*\.category-bar\s*\{[^}]*overflow-x:\s*hidden;[^}]*\}\s*\.category-bar \.filter-chip\s*\{[^}]*flex:\s*1 1 0;[^}]*min-width:\s*0;[^}]*padding-inline:\s*6px;/s);
  assert.match(stylesheet, /\.category-bar\s*\{\s*--segmented-indicator-inset:\s*3px;/s);
  assert.match(stylesheet, /\.category-summary\s*\{[^}]*margin:\s*7px auto 14px;[^}]*text-align:\s*center;/s);
  assert.match(application, /const categorySummary = result\?\.closest\("\.category-summary"\);/);
  assert.match(application, /function activeResultTarget\(\)\s*\{[\s\S]*?if \(state\.view === "history" && contentUtilities\) return contentUtilities;[\s\S]*?if \(categorySummary\) return categorySummary;[\s\S]*?if \(accessNotice\) return accessNotice;/s);
  assert.match(application, /const visualGap = 10;[\s\S]*?visibleStickyHeight\(siteHeader\) \+ visibleStickyHeight\(categoryShell\) \+ visualGap;/s);
  assert.match(application, /createButton\("全部站点",\s*"all",\s*"category",\s*data\.sites\.length\)/);
  assert.match(application, /countDescription\.className = "sr-only";[\s\S]*countDescription\.textContent = " 个网站";[\s\S]*countLabel\.appendChild\(countDescription\)/);
  assert.doesNotMatch(application, /setAttribute\("aria-label", `\$\{label\}，\$\{count\} 个网站`\)/);
  assert.doesNotMatch(homepage, /data-category-scroll|category-scroll-button/);
  assert.doesNotMatch(stylesheet, /category-scroll-button/);
  assert.doesNotMatch(application, /categoryScroll|scrollCategories|updateCategoryScrollControls|scheduleCategoryScrollControls/);
});

test("the public access notice stays compact and responds to available width", () => {
  const homepage = fs.readFileSync(path.join(repositoryRoot, "index.html"), "utf8");
  const stylesheet = fs.readFileSync(path.join(repositoryRoot, "assets/css/sakura.css"), "utf8");

  assert.match(homepage, /class="access-notice access-notice--compact"[^>]*data-access-notice>[\s\S]*?class="fas fa-info-circle access-notice-icon"[\s\S]*?class="access-notice-copy"[\s\S]*?class="access-notice-item">部分站点可能受网络环境或失效影响，可尝试使用代理访问；本站仅提供导航，请勿轻信第三方广告，并自行判断内容风险。<\/span>/);
  assert.equal((homepage.match(/access-notice-icon/g) || []).length, 1);
  assert.equal((homepage.match(/access-notice-item/g) || []).length, 1);
  assert.match(stylesheet, /\.category-summary\s*\{[^}]*margin:\s*7px auto 14px;/s);
  assert.match(stylesheet, /\.access-notice--compact\s*\{[^}]*width:\s*fit-content;[^}]*max-width:\s*min\(100%, 920px\);[^}]*margin-bottom:\s*8px;[^}]*padding:\s*9px 14px;[^}]*font-size:\s*13px;/s);
  assert.match(stylesheet, /\.access-notice--compact \.access-notice-copy\s*\{[^}]*flex:\s*0 1 auto;[^}]*gap:\s*0;/s);
  assert.match(stylesheet, /\.content-utilities\s*\{[^}]*margin:\s*0 auto 18px;/s);
  assert.match(stylesheet, /@media \(min-width:\s*769px\)[\s\S]*?\.access-notice--compact \.access-notice-copy\s*\{[^}]*flex-flow:\s*row wrap;[^}]*gap:\s*0;/s);
  assert.match(stylesheet, /@media \(min-width:\s*1024px\)[\s\S]*?\.access-notice--compact \.access-notice-item\s*\{[^}]*white-space:\s*nowrap;/s);
  assert.match(stylesheet, /@media \(max-width:\s*768px\)[\s\S]*?\.content-section \.access-notice\s*\{[^}]*font-size:\s*12px;[^}]*line-height:\s*1\.55;/s);
});

test("public pages share a compact non-repeating footer", () => {
  const homepage = fs.readFileSync(path.join(repositoryRoot, "index.html"), "utf8");
  const aboutPage = fs.readFileSync(path.join(repositoryRoot, "about/index.html"), "utf8");
  const stylesheet = fs.readFileSync(path.join(repositoryRoot, "assets/css/sakura.css"), "utf8");
  const application = fs.readFileSync(path.join(repositoryRoot, "assets/js/sakura-app.js"), "utf8");

  [homepage, aboutPage].forEach((page) => {
    assert.match(page, /<footer class="site-footer">[\s\S]*?个人维护的轻量导航，无广告、无第三方统计。[\s\S]*?data-runtime-days>[\s\S]*?data-data-updated[\s\S]*?data-current-year/);
    assert.doesNotMatch(page, /footer-project-links|>skrto\.top<|>www\.skrto\.top<|纯静态 · 无广告 · 无第三方统计脚本/);
  });
  assert.match(application, /node\.textContent = `已运行 \$\{runtimeDays\} 天`/);
  assert.match(application, /value\.textContent = `数据更新于 \$\{year\}年\$\{Number\(month\)\}月\$\{Number\(day\)\}日`/);
  assert.match(stylesheet, /\.footer-compact\s*\{[^}]*max-width:\s*760px;/s);
  assert.match(stylesheet, /\.site-runtime\s*\{[^}]*min-height:\s*30px;[^}]*padding:\s*6px 10px;[^}]*border-radius:\s*999px;/s);
  assert.match(stylesheet, /\.footer-bottom\s*\{[^}]*width:\s*min\(100%, 640px\);[^}]*margin-top:\s*14px;[^}]*padding-top:\s*12px;/s);
  assert.match(stylesheet, /\.back-to-top\s*\{[^}]*--scroll-progress:\s*0deg;[^}]*width:\s*44px;[^}]*height:\s*44px;[^}]*padding:\s*2px;[^}]*overflow:\s*hidden;[^}]*border-radius:\s*50%;[^}]*conic-gradient\(from -90deg, var\(--primary\) var\(--scroll-progress\), var\(--progress-track\) 0\);[^}]*box-shadow:\s*none;/s);
  assert.match(stylesheet, /\.back-to-top::before\s*\{[^}]*inset:\s*2px;[^}]*border:\s*1px solid var\(--layer-border\);[^}]*border-radius:\s*50%;[^}]*background:\s*var\(--control-bg\);/s);
  assert.match(application, /const scrollableHeight = Math\.max\(pageHeight - window\.innerHeight, 0\);[\s\S]*backToTop\.style\.setProperty\("--scroll-progress", `\$\{progress \* 360\}deg`\);[\s\S]*scrollableHeight > 0 && window\.scrollY > 520/);
  assert.match(application, /const scheduleBackToTopUpdate = \(\) => \{[\s\S]*window\.requestAnimationFrame\(updateBackToTop\);/);
  assert.match(application, /window\.addEventListener\("scroll", scheduleBackToTopUpdate, \{ passive: true \}\);/);
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

test("keyboard selection focuses card actions without opening the card", () => {
  const application = fs.readFileSync(path.join(repositoryRoot, "assets/js/sakura-app.js"), "utf8");

  assert.match(application, /announceUtility\(`已选择 \$\{siteName\}，按 Enter 选择操作按钮`\)/);
  assert.match(application, /const firstAction = card\?\.querySelector\("\.site-card-action:not\(\.is-disabled\)"\)/);
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
    description: "日漫追番软件，解锁会员免广告。",
    category: "android",
    keywords: ["次元城动漫", "次元城", "日漫", "追番软件", "安卓软件", "夸克", "蓝奏云"],
    addedAt: "2026-07-19"
  });
  assert.match(application, /const cardBody = document\.createElement\("div"\)/);
  assert.match(application, /cardActions\.forEach\(\(action\) =>/);
  assert.match(application, /actionLink\.addEventListener\("click", \(\) => \{ trackVisit\(site\.id\); reportSiteClick\(site\.id\); \}\)/);

  const healthCheck = fs.readFileSync(path.join(repositoryRoot, "tools/check_links.py"), "utf8");
  assert.match(healthCheck, /if re\.search\(r'\\burlLabel\\s\*:', block\):\s+continue/);
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

test("new-site dates respect their boundaries", () => {
  const today = Date.parse("2026-07-14T12:00:00Z");
  assert.equal(core.isNewSite("2026-07-14", today, 14), true);
  assert.equal(core.isNewSite("2026-07-01", today, 14), true);
  assert.equal(core.isNewSite("2026-06-30", today, 14), false);
  assert.equal(core.isNewSite("2026-07-15", today, 14), false);
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

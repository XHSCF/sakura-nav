"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");
const { DatabaseSync } = require("node:sqlite");

const root = path.resolve(__dirname, "..");
const workerPromise = import(pathToFileURL(path.join(root, "worker/index.mjs")));

class TestD1Statement {
  constructor(database, sql, values = []) {
    this.database = database;
    this.sql = sql;
    this.values = values;
  }

  bind(...values) { return new TestD1Statement(this.database, this.sql, values); }
  async all() { return { success: true, results: this.database.prepare(this.sql).all(...this.values) }; }
  async first(column) {
    const row = this.database.prepare(this.sql).get(...this.values) || null;
    return column && row ? row[column] : row;
  }
  async run() { return this.runSync(); }
  runSync() {
    if (/^\s*(?:SELECT|WITH|PRAGMA|EXPLAIN)\b/i.test(this.sql)) {
      return { success: true, results: this.database.prepare(this.sql).all(...this.values) };
    }
    const result = this.database.prepare(this.sql).run(...this.values);
    return { success: true, meta: { changes: Number(result.changes) } };
  }
}

class TestD1Database {
  constructor() {
    this.database = new DatabaseSync(":memory:");
    this.database.exec("PRAGMA foreign_keys = ON");
    for (const migration of fs.readdirSync(path.join(root, "migrations")).filter((name) => name.endsWith(".sql")).sort()) {
      this.database.exec(fs.readFileSync(path.join(root, "migrations", migration), "utf8"));
    }
  }

  prepare(sql) { return new TestD1Statement(this.database, sql); }
  async batch(statements) {
    this.database.exec("BEGIN");
    try {
      const results = statements.map((statement) => statement.runSync());
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

function request(pathname, { method = "GET", body, cookie, csrf, revision, userAgent, ip, cf, origin = "https://example.com" } = {}) {
  const headers = { Accept: "application/json" };
  if (origin) headers.Origin = origin;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (cookie) headers.Cookie = cookie;
  if (csrf) headers["X-Sakura-CSRF"] = csrf;
  if (revision !== undefined) headers["X-Sakura-Revision"] = String(revision);
  if (userAgent) headers["User-Agent"] = userAgent;
  if (ip) headers["CF-Connecting-IP"] = ip;
  const result = new Request(`https://example.com${pathname}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  if (cf) Object.defineProperty(result, "cf", { configurable: true, value: cf });
  return result;
}

test("worker validates public single-button and hidden dual-button cards", async () => {
  const { validateSitePayload } = await workerPromise;
  const categories = new Set(["tools"]);
  const single = validateSitePayload({
    id: "example-tool",
    name: "示例工具",
    description: "用于测试后台卡片。",
    category: "tools",
    url: "https://example.com/",
    keywords: ["示例", "工具"],
    addedAt: "2026-08-19",
    status: "published"
  }, categories);
  assert.equal(single.urlLabel, null);
  assert.equal(single.category, "tools");
  assert.equal(single.isHidden, false);

  const hidden = validateSitePayload({
    id: "hidden-download",
    name: "隐藏下载",
    description: "隐藏板块测试卡片。",
    isHidden: true,
    url: "https://example.com/one",
    urlLabel: "网盘一",
    secondaryUrl: "https://example.com/two",
    secondaryUrlLabel: "网盘二",
    keywords: "隐藏, 下载"
  }, categories);
  assert.equal(hidden.category, null);
  assert.equal(hidden.addedAt, null);
  assert.deepEqual(hidden.keywords, ["隐藏", "下载"]);
  const privateCard = validateSitePayload({ ...hidden, id: "private-card", hiddenCollectionId: "private-collection", privateType: "app" }, categories, new Set(["new-world", "private-collection"]));
  assert.equal(privateCard.privateType, "app");
  assert.equal(validateSitePayload({ ...hidden, id: "private-other", hiddenCollectionId: "private-collection" }, categories, new Set(["new-world", "private-collection"])).privateType, "other");
  assert.throws(() => validateSitePayload({ ...single, privateType: "website" }, categories), /只有私人收藏/);
  assert.throws(() => validateSitePayload({ ...hidden, id: "bad-new-world", privateType: "other" }, categories), /只有私人收藏/);
});

test("worker rejects invalid IDs, categories and incomplete dual-button data", async () => {
  const { validateCategoryPayload, validateSitePayload } = await workerPromise;
  assert.throws(() => validateCategoryPayload({ id: "Bad ID", name: "错误", icon: "fa-link" }), /分类 ID/);
  assert.throws(() => validateCategoryPayload({ id: "valid", name: "错误", icon: "fab fa-apple" }), /fa-\*/);
  assert.throws(() => validateSitePayload({
    id: "bad-site", name: "错误", description: "错误卡片。", category: "missing", url: "https://example.com/"
  }, new Set(["tools"])), /有效的所属分类/);
  assert.throws(() => validateSitePayload({
    id: "bad-dual", name: "错误", description: "错误卡片。", category: "tools", url: "https://example.com/", urlLabel: "网盘一", secondaryUrl: "https://example.com/two"
  }, new Set(["tools"])), /同时填写/);
  assert.throws(() => validateSitePayload({
    id: "bad-date", name: "错误日期", description: "日期不存在。", category: "tools", url: "https://example.com/", addedAt: "2026-02-30"
  }, new Set(["tools"])), /有效的 YYYY-MM-DD/);
  assert.throws(() => validateSitePayload({
    id: "bad-status", name: "错误状态", description: "状态不可用。", category: "tools", url: "https://example.com/", status: "pending"
  }, new Set(["tools"])), /发布状态/);
});

test("worker secret comparison and operational hashes behave safely", async () => {
  const { secureEqual, sha256Hex } = await workerPromise;
  assert.equal(await secureEqual("same-value", "same-value"), true);
  assert.equal(await secureEqual("same-value", "different"), false);
  assert.match(await sha256Hex("开门"), /^[a-f0-9]{64}$/);
});

test("worker validates anonymous visit data and derives coarse client details", async () => {
  const { analyticsStartTimestamp, classifyClient, validateVisitPayload } = await workerPromise;
  assert.deepEqual(validateVisitPayload({ visitorId: "anonymous-visitor-1234", path: "/about/?from=test", referrerHost: "Search.Example" }), {
    visitorId: "anonymous-visitor-1234",
    path: "/about/",
    referrerHost: "search.example"
  });
  assert.throws(() => validateVisitPayload({ visitorId: "short", path: "/" }), /匿名访客编号/);
  assert.throws(() => validateVisitPayload({ visitorId: "anonymous-visitor-1234", path: "/admin/" }), /不参与访问统计/);
  assert.deepEqual(classifyClient("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1"), {
    deviceType: "mobile", browser: "Safari", operatingSystem: "iOS / iPadOS"
  });
  assert.deepEqual(classifyClient("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0 Safari/537.36"), {
    deviceType: "desktop", browser: "Chrome", operatingSystem: "Windows"
  });
  assert.equal(analyticsStartTimestamp(1, Date.UTC(2026, 7, 23, 10, 30)), "2026-08-22 16:00:00");
  assert.equal(analyticsStartTimestamp(7, Date.UTC(2026, 7, 23, 10, 30)), "2026-08-16 16:00:00");
});

test("Cloudflare configuration binds static assets and D1 without hardcoded secrets", () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, "wrangler.jsonc"), "utf8"));
  assert.equal(config.main, "worker/index.mjs");
  assert.equal(config.assets.binding, "ASSETS");
  assert.equal(config.d1_databases[0].binding, "DB");
  assert.ok(config.compatibility_flags.includes("nodejs_compat"));
  assert.ok(config.triggers.crons.length > 0);
  const worker = fs.readFileSync(path.join(root, "worker/index.mjs"), "utf8");
  assert.match(worker, /env\.ADMIN_USERNAME/);
  assert.match(worker, /env\.ADMIN_PASSWORD/);
  assert.match(worker, /env\.ADMIN_SESSION_SECRET/);
  assert.doesNotMatch(worker, /replace-with-a-strong-password/);
  const assetIgnore = fs.readFileSync(path.join(root, ".assetsignore"), "utf8");
  assert.match(assetIgnore, /^\.d1-backups\/$/m);
  const workflow = fs.readFileSync(path.join(root, ".github", "workflows", "site-validation.yml"), "utf8");
  assert.match(workflow, /python tools\/validate_migrations\.py/);
});

test("admin page is script-src self compatible and exposes required management flows", () => {
  const html = fs.readFileSync(path.join(root, "admin/index.html"), "utf8");
  const application = fs.readFileSync(path.join(root, "admin/admin.js"), "utf8");
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i);
  ["data-login-form", "data-add-site", "data-add-category", "data-hidden-settings-form", "data-export", "data-import", "data-analytics-content", "data-analytics-locations"].forEach((token) => assert.match(html, new RegExp(token)));
  assert.match(html, /data-session-loading/);
  assert.match(html, /class="login-page" data-login-page hidden/);
  ["/api/admin/login", "/api/admin/sites", "/api/admin/categories", "/api/admin/hidden-settings", "/api/admin/analytics", "/api/admin/export", "/api/admin/import"].forEach((endpoint) => assert.ok(application.includes(endpoint)));
  assert.match(html, /name="passphrase" type="password"/);
  ["卡片管理", "分类管理", "访问统计", "修改记录", "设置与备份", "查看前台", "退出后台"].forEach((label) => assert.ok(html.includes(`aria-label="${label}"`)));
  const sidebarOrder = Array.from(html.matchAll(/class="sidebar-tab[^"]*"[^>]*data-tab="([^"]+)"/g), (match) => match[1]);
  assert.deepEqual(sidebarOrder, ["sites", "categories", "analytics", "history", "settings"]);
  assert.match(application, /function localDateValue\(/);
  assert.match(application, /confirmDialog\.returnValue = ""/);
  ["data-unsaved-indicator", "data-preview-fit-status"].forEach((token) => assert.match(html, new RegExp(token)));
  assert.match(html, /class="date-control"><input name="addedAt" type="date">/);
  assert.match(html, /class="radio-options">/);
  assert.match(application, /sessionLoading\.hidden = true/);
  assert.match(application, /await loadData\(\);\s*showApp\(\);/);
  ["function formSnapshot(", "function requestDialogClose(", "function schedulePreviewFitCheck(", 'window.addEventListener("beforeunload"'].forEach((token) => assert.ok(application.includes(token)));
  assert.match(application, /headers\["X-Sakura-Revision"\]/);
  assert.match(application, /exportBackup\("导入前的当前数据已自动备份。"\)/);
});

test("frontend loads database data with a bundled snapshot fallback", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const loader = fs.readFileSync(path.join(root, "assets/js/data-loader.js"), "utf8");
  assert.ok(html.indexOf("sites-data.js") < html.indexOf("data-loader.js"));
  assert.ok(html.indexOf("data-loader.js") < html.indexOf("sakura-app.js"));
  assert.match(loader, /fetch\("\.\/api\/public\/data"/);
  assert.match(loader, /return fallback/);
  const analytics = fs.readFileSync(path.join(root, "assets", "js", "analytics.js"), "utf8");
  assert.ok(html.indexOf("sakura-app.js") < html.indexOf("analytics.js"));
  assert.match(analytics, /\/api\/public\/visit/);
  assert.match(analytics, /navigator\.globalPrivacyControl/);
  assert.doesNotMatch(analytics, /CF-Connecting-IP|User-Agent/);
});

test("worker login, CRUD, public data and hidden unlock work against migrated D1 data", async () => {
  const module = await workerPromise;
  const env = {
    DB: new TestD1Database(),
    ASSETS: { fetch: async () => new Response("asset") },
    ADMIN_USERNAME: "admin",
    ADMIN_PASSWORD: "correct horse battery staple",
    ADMIN_SESSION_SECRET: "a-test-session-secret-that-is-longer-than-32-characters",
    PUBLIC_VISIT_LIMIT_PER_MINUTE: "30"
  };

  const loginResponse = await module.default.fetch(request("/api/admin/login", {
    method: "POST",
    body: { username: "admin", password: "correct horse battery staple" }
  }), env);
  assert.equal(loginResponse.status, 200);
  const login = await loginResponse.json();
  const cookie = loginResponse.headers.get("Set-Cookie").split(";", 1)[0];
  assert.match(cookie, /^sakura_admin_session=/);
  assert.match(login.csrf, /^[A-Za-z0-9_-]+$/);

  const dataResponse = await module.default.fetch(request("/api/admin/data", { cookie }), env);
  assert.equal(dataResponse.status, 200);
  const initialData = (await dataResponse.json()).data;
  assert.ok(initialData.categories.length > 0);
  assert.ok(initialData.sites.length > 0);
  assert.equal(initialData.revision, 4);
  assert.equal(initialData.systemStatus.schemaVersion, 9);
  assert.equal(initialData.systemStatus.contentRevision, 4);
  assert.deepEqual(new Set(initialData.hiddenCollections.map((collection) => collection.id)), new Set(["new-world", "private-collection"]));
  assert.equal(initialData.hiddenCollections.find((collection) => collection.id === "private-collection").enabled, false);
  assert.equal(initialData.systemStatus.siteCount, initialData.sites.length);
  assert.equal(initialData.systemStatus.categoryCount, initialData.categories.length);
  assert.equal(initialData.systemStatus.siteLimit, 500);
  assert.equal(initialData.systemStatus.categoryLimit, 50);

  const duplicateCategoryBackup = {
    version: 3,
    categories: initialData.categories.map((category, index) => ({
      ...category,
      name: index === 1 ? initialData.categories[0].name : category.name
    })),
    sites: initialData.sites,
    hiddenCollections: initialData.hiddenCollections,
    announcement: initialData.announcement
  };
  const duplicateCategoryResponse = await module.default.fetch(request("/api/admin/import", {
    method: "POST", body: duplicateCategoryBackup, cookie, csrf: login.csrf
  }), env);
  assert.equal(duplicateCategoryResponse.status, 400);
  assert.match((await duplicateCategoryResponse.json()).error, /重复的分类名称/);

  const invalidHiddenIconResponse = await module.default.fetch(request("/api/admin/import", {
    method: "POST",
    body: {
      version: 3,
      categories: initialData.categories,
      sites: initialData.sites,
      hiddenCollections: initialData.hiddenCollections.map((collection) => collection.id === "new-world" ? { ...collection, icon: "fab fa-apple" } : collection),
      announcement: initialData.announcement
    },
    cookie,
    csrf: login.csrf
  }), env);
  assert.equal(invalidHiddenIconResponse.status, 400);
  assert.match((await invalidHiddenIconResponse.json()).error, /fa-\*/);

  const newSite = {
    id: "admin-test-site",
    name: "后台测试卡片",
    description: "验证后台添加和删除流程。",
    category: "tools",
    isHidden: false,
    url: "https://example.test/admin-card",
    keywords: ["后台", "测试"],
    addedAt: "2026-08-19",
    sortOrder: 999,
    status: "published"
  };
  const invalidSiteRouteResponse = await module.default.fetch(request("/api/admin/sites-extra", { method: "POST", body: newSite, cookie, csrf: login.csrf }), env);
  assert.equal(invalidSiteRouteResponse.status, 404);
  const invalidCategoryRouteResponse = await module.default.fetch(request("/api/admin/categories-extra", {
    method: "POST", body: { id: "invalid-route", name: "伪接口分类", icon: "fa-link" }, cookie, csrf: login.csrf
  }), env);
  assert.equal(invalidCategoryRouteResponse.status, 404);
  const createResponse = await module.default.fetch(request("/api/admin/sites", { method: "POST", body: newSite, cookie, csrf: login.csrf, revision: initialData.revision }), env);
  assert.equal(createResponse.status, 201);
  assert.equal((await createResponse.clone().json()).revision, initialData.revision + 1);

  const staleSite = { ...newSite, id: "stale-admin-site", name: "过期标签页卡片", url: "https://example.test/stale-card" };
  const staleResponse = await module.default.fetch(request("/api/admin/sites", {
    method: "POST", body: staleSite, cookie, csrf: login.csrf, revision: initialData.revision
  }), env);
  assert.equal(staleResponse.status, 409);
  assert.equal((await staleResponse.json()).code, "CONTENT_CONFLICT");

  const currentAdminData = (await (await module.default.fetch(request("/api/admin/data", { cookie }), env)).json()).data;
  assert.equal(currentAdminData.revision, initialData.revision + 1);
  assert.ok(!currentAdminData.sites.some((site) => site.id === staleSite.id));

  const missingRevisionResponse = await module.default.fetch(request("/api/admin/sites", {
    method: "POST",
    body: { ...newSite, id: "missing-revision-site", name: "缺少版本卡片", url: "https://example.test/missing-revision" },
    cookie,
    csrf: login.csrf
  }), env);
  assert.equal(missingRevisionResponse.status, 428);
  assert.equal((await missingRevisionResponse.json()).code, "CONTENT_REVISION_REQUIRED");

  const newWorld = currentAdminData.hiddenCollections.find((collection) => collection.id === "new-world");
  const hiddenSettingsResponse = await module.default.fetch(request("/api/admin/hidden-collections/new-world", {
    method: "PUT",
    body: newWorld,
    cookie,
    csrf: login.csrf,
    revision: currentAdminData.revision
  }), env);
  assert.equal(hiddenSettingsResponse.status, 200);
  assert.equal((await hiddenSettingsResponse.json()).revision, initialData.revision + 2);

  const categoryIds = [...currentAdminData.categories].sort((left, right) => left.sortOrder - right.sortOrder).map((category) => category.id);
  const reorderResponse = await module.default.fetch(request("/api/admin/reorder", {
    method: "POST",
    body: { entity: "categories", ids: categoryIds },
    cookie,
    csrf: login.csrf,
    revision: initialData.revision + 2
  }), env);
  assert.equal(reorderResponse.status, 200);
  assert.equal((await reorderResponse.json()).revision, initialData.revision + 3);

  const exportedBackupResponse = await module.default.fetch(request("/api/admin/export", { cookie }), env);
  assert.equal(exportedBackupResponse.status, 200);
  const exportedBackup = await exportedBackupResponse.json();
  const importResponse = await module.default.fetch(request("/api/admin/import", {
    method: "POST", body: exportedBackup, cookie, csrf: login.csrf, revision: initialData.revision + 3
  }), env);
  assert.equal(importResponse.status, 200);
  assert.equal((await importResponse.json()).revision, initialData.revision + 4);

  const publicResponse = await module.default.fetch(request("/api/public/data"), env);
  assert.equal(publicResponse.status, 200);
  const publicData = (await publicResponse.json()).data;
  assert.ok(publicData.sites.some((site) => site.id === newSite.id));
  assert.equal(publicData.hiddenSection, undefined);
  assert.equal(publicData.hiddenCollections, undefined);

  const invalidUnlock = await module.default.fetch(request("/api/public/hidden", { method: "POST", body: { passphrase: "开 门" } }), env);
  assert.equal(invalidUnlock.status, 403);
  const validUnlock = await module.default.fetch(request("/api/public/hidden", { method: "POST", body: { passphrase: " 开门 " } }), env);
  assert.equal(validUnlock.status, 200);
  assert.ok((await validUnlock.json()).data.sites.length > 0);

  const firstVisit = {
    method: "POST",
    body: { visitorId: "anonymous-visitor-one", path: "/", referrerHost: "search.example" },
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
    cf: { country: "CN", region: "广东省", city: "深圳市" }
  };
  assert.equal((await module.default.fetch(request("/api/public/visit", firstVisit), env)).status, 204);
  assert.equal((await module.default.fetch(request("/api/public/visit", firstVisit), env)).status, 204);
  assert.equal((await module.default.fetch(request("/api/public/visit", {
    method: "POST",
    body: { visitorId: "anonymous-visitor-two", path: "/about/", referrerHost: "" },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0 Safari/537.36",
    cf: { country: "US", region: "California", city: "San Francisco" }
  }), env)).status, 204);
  assert.equal((await module.default.fetch(request("/api/public/visit", {
    method: "POST",
    body: { visitorId: "anonymous-search-robot", path: "/", referrerHost: "search.example" },
    userAgent: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    cf: { country: "US", region: "California", city: "Mountain View" }
  }), env)).status, 204);
  const invalidVisit = await module.default.fetch(request("/api/public/visit", {
    method: "POST", body: { visitorId: "anonymous-visitor-three", path: "/admin/" }
  }), env);
  assert.equal(invalidVisit.status, 400);
  const missingOriginVisit = await module.default.fetch(request("/api/public/visit", {
    method: "POST", body: { visitorId: "anonymous-without-origin", path: "/" }, origin: null
  }), env);
  assert.equal(missingOriginVisit.status, 403);
  const missingOriginUnlock = await module.default.fetch(request("/api/public/hidden", {
    method: "POST", body: { passphrase: "开门" }, origin: null
  }), env);
  assert.equal(missingOriginUnlock.status, 403);

  for (let index = 0; index < 35; index += 1) {
    const cappedVisit = await module.default.fetch(request("/api/public/visit", {
      method: "POST",
      body: { visitorId: `capped-anonymous-visitor-${String(index).padStart(2, "0")}`, path: "/" },
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0 Safari/537.36"
    }), env);
    assert.equal(cappedVisit.status, 204);
  }

  const analyticsResponse = await module.default.fetch(request("/api/admin/analytics?days=7", { cookie }), env);
  assert.equal(analyticsResponse.status, 200);
  const analytics = (await analyticsResponse.json()).data;
  assert.equal(Number(analytics.summary.page_views), 30);
  assert.equal(Number(analytics.summary.visitors), 30);
  assert.equal(Number(analytics.summary.countries), 2);
  assert.ok(analytics.locations.some((location) => location.country_code === "CN" && location.region === "广东省"));
  assert.deepEqual(new Set(analytics.devices.map((device) => device.label)), new Set(["mobile", "desktop"]));
  assert.equal(analytics.recent.some((visit) => Object.hasOwn(visit, "visitor_hash")), false);

  const disableAnalytics = await module.default.fetch(request("/api/admin/analytics/settings", {
    method: "PUT", body: { enabled: false }, cookie, csrf: login.csrf
  }), env);
  assert.equal(disableAnalytics.status, 200);
  assert.equal((await module.default.fetch(request("/api/public/visit", {
    method: "POST",
    body: { visitorId: "anonymous-visitor-four", path: "/" },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0 Safari/537.36"
  }), env)).status, 204);
  const analyticsAfterDisable = (await (await module.default.fetch(request("/api/admin/analytics?days=7", { cookie }), env)).json()).data;
  assert.equal(analyticsAfterDisable.enabled, false);
  assert.equal(Number(analyticsAfterDisable.summary.page_views), 30);

  const clearAnalytics = await module.default.fetch(request("/api/admin/analytics", { method: "DELETE", cookie, csrf: login.csrf }), env);
  assert.equal(clearAnalytics.status, 200);
  assert.equal((await clearAnalytics.json()).deleted, 30);
  const analyticsAfterClear = (await (await module.default.fetch(request("/api/admin/analytics?days=7", { cookie }), env)).json()).data;
  assert.equal(Number(analyticsAfterClear.summary.page_views), 0);

  const deleteResponse = await module.default.fetch(request(`/api/admin/sites/${newSite.id}`, {
    method: "DELETE", cookie, csrf: login.csrf, revision: initialData.revision + 4
  }), env);
  assert.equal(deleteResponse.status, 200);
  const publicAfterDelete = (await (await module.default.fetch(request("/api/public/data"), env)).json()).data;
  assert.ok(!publicAfterDelete.sites.some((site) => site.id === newSite.id));

  const afterDelete = (await (await module.default.fetch(request("/api/admin/data", { cookie }), env)).json()).data;
  const privateCollection = afterDelete.hiddenCollections.find((collection) => collection.id === "private-collection");
  const enablePrivate = await module.default.fetch(request("/api/admin/hidden-collections/private-collection", {
    method: "PUT",
    body: { ...privateCollection, passphrase: "我的收藏", enabled: true },
    cookie,
    csrf: login.csrf,
    revision: afterDelete.revision
  }), env);
  assert.equal(enablePrivate.status, 200);
  const enabledRevision = (await enablePrivate.json()).revision;
  const privateSite = {
    id: "private-test-site",
    name: "私人测试卡片",
    description: "只允许私人收藏解锁后读取。",
    isHidden: true,
    hiddenCollectionId: "private-collection",
    privateType: "app",
    url: "https://example.test/private",
    keywords: ["私人"],
    sortOrder: 0,
    status: "published"
  };
  const createPrivate = await module.default.fetch(request("/api/admin/sites", {
    method: "POST", body: privateSite, cookie, csrf: login.csrf, revision: enabledRevision
  }), env);
  assert.equal(createPrivate.status, 201);
  assert.equal((await (await module.default.fetch(request("/api/public/data"), env)).json()).data.sites.some((site) => site.id === privateSite.id), false);
  const privateUnlock = await module.default.fetch(request("/api/public/hidden", { method: "POST", body: { passphrase: "我的收藏" } }), env);
  assert.equal(privateUnlock.status, 200);
  const privatePayload = (await privateUnlock.json()).data;
  assert.equal(privatePayload.id, "private-collection");
  assert.deepEqual(privatePayload.sites.map((site) => site.id), [privateSite.id]);
  assert.equal(privatePayload.sites[0].privateType, "app");
  assert.equal(privatePayload.passphrase, undefined);
  const privateBackup = await module.default.fetch(request("/api/admin/export", { cookie }), env);
  assert.equal(privateBackup.status, 200);
  assert.equal((await privateBackup.json()).sites.find((site) => site.id === privateSite.id).privateType, "app");
  const newWorldUnlock = await module.default.fetch(request("/api/public/hidden", { method: "POST", body: { passphrase: "开门" } }), env);
  assert.equal((await newWorldUnlock.json()).data.sites.some((site) => site.id === privateSite.id), false);

  const latest = (await (await module.default.fetch(request("/api/admin/data", { cookie }), env)).json()).data;
  const duplicatePassphrase = await module.default.fetch(request("/api/admin/hidden-collections/private-collection", {
    method: "PUT",
    body: { ...latest.hiddenCollections.find((collection) => collection.id === "private-collection"), passphrase: "开门", enabled: true },
    cookie,
    csrf: login.csrf,
    revision: latest.revision
  }), env);
  assert.equal(duplicatePassphrase.status, 409);
  assert.equal((await duplicatePassphrase.json()).code, "DUPLICATE_PASSPHRASE");

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const wrongUnlock = await module.default.fetch(request("/api/public/hidden", {
      method: "POST", body: { passphrase: `错误暗号-${attempt}` }, ip: "203.0.113.8"
    }), env);
    assert.equal(wrongUnlock.status, 403);
  }
  const limitedUnlock = await module.default.fetch(request("/api/public/hidden", {
    method: "POST", body: { passphrase: "仍然错误" }, ip: "203.0.113.8"
  }), env);
  assert.equal(limitedUnlock.status, 429);
  assert.equal((await limitedUnlock.json()).code, "TOO_MANY_ATTEMPTS");
});

test("fifth-round history, maintenance, batch, click analytics and announcement flows are atomic", async () => {
  const module = await workerPromise;
  const env = {
    DB: new TestD1Database(),
    ASSETS: { fetch: async () => new Response("asset") },
    ADMIN_USERNAME: "admin",
    ADMIN_PASSWORD: "correct horse battery staple",
    ADMIN_SESSION_SECRET: "a-test-session-secret-that-is-longer-than-32-characters",
    PUBLIC_CLICK_LIMIT_PER_MINUTE: "60"
  };
  const loginResponse = await module.default.fetch(request("/api/admin/login", {
    method: "POST", body: { username: "admin", password: "correct horse battery staple" }
  }), env);
  const login = await loginResponse.json();
  const cookie = loginResponse.headers.get("Set-Cookie").split(";", 1)[0];
  const initial = (await (await module.default.fetch(request("/api/admin/data", { cookie }), env)).json()).data;
  const originalPassphrase = initial.hiddenCollections.find((collection) => collection.id === "new-world").passphrase;
  const batchSites = [
    {
      id: "batch-review", name: "批量待复查", description: "用于测试批量添加。", category: "tools",
      url: "https://example.test/batch-review", addedAt: "2026-08-25", status: "published", maintenanceStatus: "review"
    },
    {
      id: "batch-unavailable", name: "批量临时失效", description: "用于测试维护状态。", category: "tools",
      url: "https://example.test/batch-unavailable", addedAt: "2026-08-25", status: "published", maintenanceStatus: "unavailable"
    }
  ];
  const batchResponse = await module.default.fetch(request("/api/admin/sites/batch", {
    method: "POST", body: { sites: batchSites }, cookie, csrf: login.csrf, revision: initial.revision
  }), env);
  assert.equal(batchResponse.status, 201);
  assert.equal((await batchResponse.json()).created, 2);

  const duplicateBatch = await module.default.fetch(request("/api/admin/sites/batch", {
    method: "POST",
    body: { sites: [{ ...batchSites[0], id: "batch-third", name: "另一张卡片" }] },
    cookie,
    csrf: login.csrf,
    revision: initial.revision + 1
  }), env);
  assert.equal(duplicateBatch.status, 409);
  assert.equal(await env.DB.prepare("SELECT COUNT(*) AS count FROM sites WHERE id='batch-third'").first("count"), 0);

  let publicData = (await (await module.default.fetch(request("/api/public/data"), env)).json()).data;
  assert.equal(publicData.sites.find((site) => site.id === "batch-review").maintenanceStatus, "review");
  assert.equal(publicData.sites.find((site) => site.id === "batch-unavailable").maintenanceStatus, "unavailable");
  assert.equal(publicData.announcement, null);

  assert.equal((await module.default.fetch(request("/api/public/click", { method: "POST", body: { siteId: "batch-review" } }), env)).status, 204);
  assert.equal((await module.default.fetch(request("/api/public/click", { method: "POST", body: { siteId: "batch-unavailable" } }), env)).status, 204);
  const analytics = (await (await module.default.fetch(request("/api/admin/analytics?days=7", { cookie }), env)).json()).data;
  assert.equal(analytics.clickAnalytics.total, 1);
  assert.equal(analytics.clickAnalytics.top[0].site_id, "batch-review");
  assert.equal(await env.DB.prepare("SELECT COALESCE(SUM(clicks), 0) AS clicks FROM site_click_daily WHERE site_id='batch-unavailable'").first("clicks"), 0);

  const announcementResponse = await module.default.fetch(request("/api/admin/announcement", {
    method: "PUT",
    body: { text: "今晚进行短时维护。", enabled: true, startsAt: "", endsAt: "" },
    cookie,
    csrf: login.csrf,
    revision: initial.revision + 1
  }), env);
  assert.equal(announcementResponse.status, 200);
  publicData = (await (await module.default.fetch(request("/api/public/data"), env)).json()).data;
  assert.deepEqual(publicData.announcement, { text: "今晚进行短时维护。" });

  const expiredAnnouncementResponse = await module.default.fetch(request("/api/admin/announcement", {
    method: "PUT",
    body: { text: "已经结束的公告。", enabled: true, startsAt: "2019-01-01T00:00:00.000Z", endsAt: "2020-01-01T00:00:00.000Z" },
    cookie,
    csrf: login.csrf,
    revision: initial.revision + 2
  }), env);
  assert.equal(expiredAnnouncementResponse.status, 200);
  publicData = (await (await module.default.fetch(request("/api/public/data"), env)).json()).data;
  assert.equal(publicData.announcement, null);

  const versionsResponse = await module.default.fetch(request("/api/admin/versions", { cookie }), env);
  assert.equal(versionsResponse.status, 200);
  const versions = (await versionsResponse.json()).data.versions;
  assert.ok(versions.some((version) => version.summary.includes("批量添加")));
  const originalVersion = versions.find((version) => Number(version.revision) === initial.revision);
  assert.ok(originalVersion);
  const storedSnapshots = await env.DB.prepare("SELECT snapshot_json FROM content_versions").all();
  assert.equal(storedSnapshots.results.some((row) => row.snapshot_json.includes(originalPassphrase)), false);

  const restoreResponse = await module.default.fetch(request(`/api/admin/versions/${originalVersion.id}/restore`, {
    method: "POST", body: {}, cookie, csrf: login.csrf, revision: initial.revision + 3
  }), env);
  assert.equal(restoreResponse.status, 200);
  const restoredAdmin = (await (await module.default.fetch(request("/api/admin/data", { cookie }), env)).json()).data;
  assert.equal(restoredAdmin.hiddenCollections.find((collection) => collection.id === "new-world").passphrase, originalPassphrase);
  assert.ok(!restoredAdmin.sites.some((site) => site.id === "batch-review"));
  assert.equal(restoredAdmin.announcement.enabled, false);
});

test("scheduled maintenance removes expired operational rows without touching recent records", async () => {
  const module = await workerPromise;
  const env = { DB: new TestD1Database() };
  await env.DB.prepare("INSERT INTO visitor_events(visitor_hash, path, device_type, browser, operating_system, minute_bucket, occurred_at) VALUES (?, '/', 'desktop', 'Chrome', 'Windows', '2020-01-01T00:00', '2020-01-01 00:00:00')")
    .bind("a".repeat(64)).run();
  await env.DB.prepare("INSERT INTO audit_logs(action, entity_type, entity_id, details_json, created_at) VALUES ('update', 'site', 'expired', '{}', '2020-01-01 00:00:00')").run();
  await env.DB.prepare("INSERT INTO audit_logs(action, entity_type, entity_id, details_json) VALUES ('update', 'site', 'recent', '{}')").run();
  await env.DB.prepare("INSERT INTO login_attempts(key, attempts, window_started) VALUES ('expired-login', 5, 1)").run();

  await module.default.scheduled({}, env, {});

  assert.equal(await env.DB.prepare("SELECT COUNT(*) AS count FROM visitor_events WHERE occurred_at='2020-01-01 00:00:00'").first("count"), 0);
  assert.equal(await env.DB.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE entity_id='expired'").first("count"), 0);
  assert.equal(await env.DB.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE entity_id='recent'").first("count"), 1);
  assert.equal(await env.DB.prepare("SELECT COUNT(*) AS count FROM login_attempts WHERE key='expired-login'").first("count"), 0);
  assert.match(await env.DB.prepare("SELECT value FROM settings WHERE key='maintenance_last_run_at'").first("value"), /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(JSON.parse(await env.DB.prepare("SELECT value FROM settings WHERE key='maintenance_last_result'").first("value")), {
    visitorEvents: 1,
    auditLogs: 1,
    loginAttempts: 1,
    siteClicks: 0,
    clickMinutes: 0,
    contentVersions: 0
  });
});

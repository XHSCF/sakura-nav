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

function request(pathname, { method = "GET", body, cookie, csrf } = {}) {
  const headers = { Accept: "application/json", Origin: "https://example.com" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (cookie) headers.Cookie = cookie;
  if (csrf) headers["X-Sakura-CSRF"] = csrf;
  return new Request(`https://example.com${pathname}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
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

test("worker secret comparison and hidden unlock hash normalize safely", async () => {
  const { secureEqual, sha256Hex } = await workerPromise;
  assert.equal(await secureEqual("same-value", "same-value"), true);
  assert.equal(await secureEqual("same-value", "different"), false);
  assert.match(await sha256Hex("开门"), /^[a-f0-9]{64}$/);
});

test("Cloudflare configuration binds static assets and D1 without hardcoded secrets", () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, "wrangler.jsonc"), "utf8"));
  assert.equal(config.main, "worker/index.mjs");
  assert.equal(config.assets.binding, "ASSETS");
  assert.equal(config.d1_databases[0].binding, "DB");
  assert.ok(config.compatibility_flags.includes("nodejs_compat"));
  const worker = fs.readFileSync(path.join(root, "worker/index.mjs"), "utf8");
  assert.match(worker, /env\.ADMIN_USERNAME/);
  assert.match(worker, /env\.ADMIN_PASSWORD/);
  assert.match(worker, /env\.ADMIN_SESSION_SECRET/);
  assert.doesNotMatch(worker, /replace-with-a-strong-password/);
});

test("admin page is script-src self compatible and exposes required management flows", () => {
  const html = fs.readFileSync(path.join(root, "admin/index.html"), "utf8");
  const application = fs.readFileSync(path.join(root, "admin/admin.js"), "utf8");
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i);
  ["data-login-form", "data-add-site", "data-add-category", "data-hidden-settings-form", "data-export", "data-import"].forEach((token) => assert.match(html, new RegExp(token)));
  ["/api/admin/login", "/api/admin/sites", "/api/admin/categories", "/api/admin/hidden-settings", "/api/admin/export", "/api/admin/import"].forEach((endpoint) => assert.ok(application.includes(endpoint)));
  assert.match(html, /name="passphrase" type="password"/);
  ["卡片管理", "分类管理", "设置与备份", "修改记录", "查看前台", "退出后台"].forEach((label) => assert.ok(html.includes(`aria-label="${label}"`)));
  assert.match(application, /function localDateValue\(/);
  assert.match(application, /confirmDialog\.returnValue = ""/);
  ["data-unsaved-indicator", "data-preview-fit-status"].forEach((token) => assert.match(html, new RegExp(token)));
  assert.match(html, /class="date-control"><input name="addedAt" type="date">/);
  assert.match(html, /class="radio-options">/);
  ["function formSnapshot(", "function requestDialogClose(", "function schedulePreviewFitCheck(", 'window.addEventListener("beforeunload"'].forEach((token) => assert.ok(application.includes(token)));
});

test("frontend loads database data with a bundled snapshot fallback", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const loader = fs.readFileSync(path.join(root, "assets/js/data-loader.js"), "utf8");
  assert.ok(html.indexOf("sites-data.js") < html.indexOf("data-loader.js"));
  assert.ok(html.indexOf("data-loader.js") < html.indexOf("sakura-app.js"));
  assert.match(loader, /fetch\("\.\/api\/public\/data"/);
  assert.match(loader, /return fallback/);
});

test("worker login, CRUD, public data and hidden unlock work against migrated D1 data", async () => {
  const module = await workerPromise;
  const env = {
    DB: new TestD1Database(),
    ASSETS: { fetch: async () => new Response("asset") },
    ADMIN_USERNAME: "admin",
    ADMIN_PASSWORD: "correct horse battery staple",
    ADMIN_SESSION_SECRET: "a-test-session-secret-that-is-longer-than-32-characters"
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

  const duplicateCategoryBackup = {
    version: 1,
    categories: initialData.categories.map((category, index) => ({
      ...category,
      name: index === 1 ? initialData.categories[0].name : category.name
    })),
    sites: initialData.sites,
    hiddenSection: initialData.hiddenSection
  };
  const duplicateCategoryResponse = await module.default.fetch(request("/api/admin/import", {
    method: "POST", body: duplicateCategoryBackup, cookie, csrf: login.csrf
  }), env);
  assert.equal(duplicateCategoryResponse.status, 400);
  assert.match((await duplicateCategoryResponse.json()).error, /重复的分类名称/);

  const invalidHiddenIconResponse = await module.default.fetch(request("/api/admin/import", {
    method: "POST",
    body: {
      version: 1,
      categories: initialData.categories,
      sites: initialData.sites,
      hiddenSection: { ...initialData.hiddenSection, icon: "fab fa-apple" }
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
  const createResponse = await module.default.fetch(request("/api/admin/sites", { method: "POST", body: newSite, cookie, csrf: login.csrf }), env);
  assert.equal(createResponse.status, 201);

  const publicResponse = await module.default.fetch(request("/api/public/data"), env);
  assert.equal(publicResponse.status, 200);
  const publicData = (await publicResponse.json()).data;
  assert.ok(publicData.sites.some((site) => site.id === newSite.id));
  assert.equal(publicData.hiddenSection.passphrase, undefined);
  assert.match(publicData.hiddenSection.unlockHash, /^[a-f0-9]{64}$/);

  const invalidUnlock = await module.default.fetch(request("/api/public/hidden", { method: "POST", body: { passphrase: "开 门" } }), env);
  assert.equal(invalidUnlock.status, 403);
  const validUnlock = await module.default.fetch(request("/api/public/hidden", { method: "POST", body: { passphrase: " 开门 " } }), env);
  assert.equal(validUnlock.status, 200);
  assert.ok((await validUnlock.json()).data.sites.length > 0);

  const deleteResponse = await module.default.fetch(request(`/api/admin/sites/${newSite.id}`, { method: "DELETE", cookie, csrf: login.csrf }), env);
  assert.equal(deleteResponse.status, 200);
  const publicAfterDelete = (await (await module.default.fetch(request("/api/public/data"), env)).json()).data;
  assert.ok(!publicAfterDelete.sites.some((site) => site.id === newSite.id));
});

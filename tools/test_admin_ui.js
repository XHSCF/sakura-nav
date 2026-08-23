"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const adminCore = require(path.join(root, "admin", "admin-core.js"));

test("admin ID generation prefers a distinctive domain over weak alphabetic fragments", () => {
  assert.equal(adminCore.preferredSiteId("发现TV", "https://faxiantv.cc/"), "faxiantv");
  assert.equal(adminCore.preferredSiteId("A站", "https://www.acfun.cn/"), "acfun");
  assert.equal(adminCore.preferredSiteId("应用App", "https://useful-tool.example/"), "useful-tool");
});

test("admin ID generation keeps meaningful name IDs and numeric brands", () => {
  assert.equal(adminCore.preferredSiteId("Sign.LC", "https://www.sign.lc/"), "sign-lc");
  assert.equal(adminCore.preferredSiteId("91抖阴", "https://pan.baidu.com/example"), "91");
  assert.equal(adminCore.preferredSiteId("", "https://decrypt.34306.lol/"), "decrypt-34306");
});

test("card editor keeps clear sections and a single explicit scroll region", () => {
  const html = fs.readFileSync(path.join(root, "admin", "index.html"), "utf8");
  const css = fs.readFileSync(path.join(root, "admin", "admin.css"), "utf8");
  assert.match(html, /class="form-section"/);
  assert.match(html, /class="wide-field radio-field" role="group"/);
  assert.doesNotMatch(html, /<fieldset class="wide-field radio-field"/);
  assert.match(css, /html\.has-open-dialog, body\.has-open-dialog/);
  assert.match(css, /\.admin-dialog, \.confirm-dialog[^}]*overflow: visible;/s);
});

test("admin analytics UI exposes responsive privacy, location and history views", () => {
  const html = fs.readFileSync(path.join(root, "admin", "index.html"), "utf8");
  const css = fs.readFileSync(path.join(root, "admin", "admin.css"), "utf8");
  const application = fs.readFileSync(path.join(root, "admin", "admin.js"), "utf8");
  ["data-tab=\"analytics\"", "data-analytics-enabled", "data-analytics-locations", "data-analytics-recent"].forEach((token) => assert.ok(html.includes(token)));
  assert.ok(html.indexOf('data-tab="categories"') < html.indexOf('data-tab="analytics"'));
  assert.ok(html.indexOf('data-tab="analytics"') < html.indexOf('data-tab="settings"'));
  assert.match(application, /function loadAnalytics\(/);
  assert.match(application, /function locationText\(/);
  assert.match(application, /\/api\/admin\/analytics/);
  assert.match(css, /\.analytics-dashboard-grid/);
  assert.match(css, /@media \(max-width: 680px\)[\s\S]*\.analytics-dashboard-grid \{ grid-template-columns: 1fr;/);
});

test("admin styles remain usable without color-mix or backdrop-filter", () => {
  const css = fs.readFileSync(path.join(root, "admin", "admin.css"), "utf8");
  const fallbackStart = css.indexOf("@supports not (color: color-mix(in srgb, #000 50%, #fff))");
  const fallback = css.slice(fallbackStart);

  assert.match(css, /html\s*\{[^}]*-webkit-text-size-adjust:\s*100%;[^}]*text-size-adjust:\s*100%;/s);
  assert.match(css, /@supports not \(\(backdrop-filter: blur\(1px\)\) or \(-webkit-backdrop-filter: blur\(1px\)\)\)[\s\S]*?background:\s*var\(--surface-solid\);/);
  assert.notEqual(fallbackStart, -1);
  assert.match(fallback, /\.admin-header,[\s\S]*?\.color-theme-panel\s*\{[^}]*background:\s*var\(--surface-solid\);/s);
  assert.match(fallback, /\.primary-button\s*\{[^}]*border-color:\s*var\(--primary\);[^}]*background:\s*var\(--primary\);/s);
  assert.match(fallback, /\.analytics-trend-bar,[\s\S]*?\.analytics-breakdown-fill\s*\{[^}]*background:\s*var\(--primary\);/s);
  assert.match(fallback, /button:focus-visible,[\s\S]*?a:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--primary\);/s);
});

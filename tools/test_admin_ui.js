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
  assert.match(css, /\.preview-copy strong \{[^}]*display: -webkit-box;[^}]*-webkit-line-clamp: 2;/s);
  assert.match(css, /@media \(max-width: 380px\)[\s\S]*?\.admin-card-preview \{ grid-template-columns: 48px minmax\(0, 1fr\) 70px;/);
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

test("fifth-round admin UI exposes history restore, maintenance, batch, clicks and announcements", () => {
  const html = fs.readFileSync(path.join(root, "admin", "index.html"), "utf8");
  const css = fs.readFileSync(path.join(root, "admin", "admin.css"), "utf8");
  const application = fs.readFileSync(path.join(root, "admin", "admin.js"), "utf8");
  [
    "data-batch-add", "data-batch-dialog", "data-site-maintenance-filter", "name=\"maintenanceStatus\"",
    "data-click-analytics-enabled", "data-click-top", "data-click-unvisited", "data-announcement-form",
    "data-announcement-preview", "data-version-list", "data-versions-refresh"
  ].forEach((token) => assert.ok(html.includes(token), token));
  assert.match(application, /function parseBatchInput\(/);
  assert.match(application, /api\("\/api\/admin\/sites\/batch"/);
  assert.match(application, /\[siteDialog, batchDialog, categoryDialog, confirmDialog\]\.some/);
  assert.match(application, /function saveAnnouncement\(/);
  assert.match(application, /api\("\/api\/admin\/announcement"/);
  assert.match(application, /function restoreVersion\(/);
  assert.match(application, /\/api\/admin\/versions\/\$\{version\.id\}\/restore/);
  assert.match(application, /\/api\/admin\/click-analytics/);
  assert.match(css, /\.version-item\s*\{[^}]*grid-template-columns:/s);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.version-item\s*\{[^}]*grid-template-columns:/s);
  assert.match(css, /\.batch-preview-table\s*\{[^}]*min-width:\s*620px;/s);
  assert.match(css, /\.announcement-preview\s*\{[^}]*background:/s);
});

test("expired admin sessions preserve non-sensitive unsaved form drafts in the current tab", () => {
  const application = fs.readFileSync(path.join(root, "admin", "admin.js"), "utf8");
  assert.match(application, /const sessionDraftKey = "sakura-admin-session-draft-v1"/);
  assert.match(application, /function captureSessionDraft\(/);
  assert.match(application, /function restoreSessionDraft\(/);
  assert.match(application, /window\.sessionStorage\.setItem\(sessionDraftKey/);
  assert.match(application, /window\.sessionStorage\.removeItem\(sessionDraftKey/);
  assert.match(application, /function formDraftValues\(form, includePasswords = false\)[\s\S]*?\(!includePasswords && field\.type === "password"\)/);
  assert.match(application, /draft\.site = \{ editingId: state\.editingSiteId, values: formDraftValues\(siteForm\) \}/);
  assert.match(application, /response\.status === 401[\s\S]*?captureSessionDraft\(\)[\s\S]*?showLogin\(/);
  assert.match(application, /await loadData\(\);\s*showApp\(\);\s*const restored = restoreSessionDraft\(\);/);
  assert.match(application, /passphraseOmitted[\s\S]*?elements\.passphrase\.value = ""/);
});

test("admin API requests time out with clear network recovery messages", () => {
  const application = fs.readFileSync(path.join(root, "admin", "admin.js"), "utf8");
  assert.match(application, /const adminRequestTimeout = 18000/);
  assert.match(application, /const controller = new AbortController\(\);[\s\S]*window\.setTimeout\(\(\) => controller\.abort\(\), adminRequestTimeout\)/);
  assert.match(application, /fetch\(path, \{[\s\S]*signal: controller\.signal[\s\S]*\}\)/);
  assert.match(application, /error\?\.name === "AbortError"[\s\S]*后台响应超时，请检查网络后重试。[\s\S]*REQUEST_TIMEOUT/);
  assert.match(application, /error instanceof TypeError[\s\S]*无法连接后台，请检查网络后重试。[\s\S]*NETWORK_ERROR/);
  assert.match(application, /finally \{\s*window\.clearTimeout\(timeoutTimer\);\s*\}/);
  assert.match(application, /visibleInitializationErrors = new Set\(\["ADMIN_NOT_CONFIGURED", "REQUEST_TIMEOUT", "NETWORK_ERROR"\]\)/);
});

test("admin content writes carry a revision and import first downloads a current backup", () => {
  const html = fs.readFileSync(path.join(root, "admin", "index.html"), "utf8");
  const application = fs.readFileSync(path.join(root, "admin", "admin.js"), "utf8");
  assert.match(application, /headers\["X-Sakura-Revision"\] = String\(state\.data\.revision\)/);
  assert.match(application, /confirmAction\("导入备份"[\s\S]*?await exportBackup\("导入前的当前数据已自动备份。"\)[\s\S]*?api\("\/api\/admin\/import"/);
  assert.match(application, /return false;[\s\S]*?async function importBackup/);
  assert.match(application, /function captureConflictDraft\(/);
  assert.match(application, /function restoreConflictDraft\(/);
  assert.match(application, /async function handleContentConflict\(/);
  assert.match(application, /最新内容已加载，当前输入仍保留/);
  assert.match(html, /暂时下架（保存为草稿）/);
  assert.match(html, /data-system-database/);
  assert.match(html, /data-system-maintenance/);
});

test("admin styles remain usable without color-mix or backdrop-filter", () => {
  const css = fs.readFileSync(path.join(root, "admin", "admin.css"), "utf8");
  const fallbackStart = css.indexOf("@supports not (color: color-mix(in srgb, #000 50%, #fff))");
  const fallback = css.slice(fallbackStart);

  assert.match(css, /html\s*\{[^}]*-webkit-text-size-adjust:\s*100%;[^}]*text-size-adjust:\s*100%;/s);
  assert.match(css, /:root\s*\{[^}]*--primary:\s*#007aff;[^}]*--primary-strong:\s*#0066cc;[^}]*--accent-foreground:\s*#003b73;/s);
  assert.match(css, /:root\s*\{[^}]*--bg:\s*#f7f8fa;/s);
  assert.match(css, /:root\[data-theme="dark"\]\s*\{[^}]*--bg:\s*#0d0f14;/s);
  assert.match(css, /\.color-theme-panel\s*\{[^}]*background:\s*var\(--popup-bg\);[^}]*backdrop-filter:\s*blur\(24px\) saturate\(120%\);/s);
  assert.doesNotMatch(css, /\.admin-atmosphere|radial-gradient\(circle at 12% 8%/);
  assert.match(css, /@supports not \(\(backdrop-filter: blur\(1px\)\) or \(-webkit-backdrop-filter: blur\(1px\)\)\)[\s\S]*?background:\s*var\(--surface-solid\);/);
  assert.notEqual(fallbackStart, -1);
  assert.match(fallback, /\.admin-header,[\s\S]*?\.color-theme-panel\s*\{[^}]*background:\s*var\(--surface-solid\);/s);
  assert.match(css, /\.primary-button, \.secondary-button, \.danger-button, \.table-action, \.icon-close\s*\{[^}]*border:\s*0;[^}]*box-shadow:\s*none;[^}]*transform:\s*none;/s);
  assert.match(fallback, /\.primary-button\s*\{[^}]*color:\s*var\(--primary-strong\);[^}]*background:\s*var\(--surface-soft\);[^}]*box-shadow:\s*none;/s);
  assert.doesNotMatch(css, /\.primary-button\s*\{[^}]*linear-gradient|\.primary-button\s*\{[^}]*0 0 12px|(?:primary-button|secondary-button|danger-button|table-action):hover[^}]*translateY/s);
  assert.match(fallback, /\.analytics-trend-bar,[\s\S]*?\.analytics-breakdown-fill\s*\{[^}]*background:\s*var\(--primary\);/s);
  assert.match(fallback, /button:focus-visible,[\s\S]*?a:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--primary\);/s);
});

test("admin login card uses a compact neutral panel and flat theme controls", () => {
  const css = fs.readFileSync(path.join(root, "admin", "admin.css"), "utf8");
  const application = fs.readFileSync(path.join(root, "admin", "admin.js"), "utf8");
  assert.match(css, /\.login-card\s*\{[^}]*width:\s*min\(420px, 100%\);[^}]*padding:\s*30px;[^}]*background:\s*var\(--login-surface\);[^}]*box-shadow:\s*var\(--login-shadow\);/s);
  assert.match(css, /\.login-form \.primary-button\s*\{[^}]*border:\s*0;[^}]*background:\s*color-mix\(in srgb, var\(--primary\) 13%, var\(--login-surface\)\);[^}]*box-shadow:\s*none;[^}]*transform:\s*none;/s);
  assert.match(css, /@media \(max-width: 680px\)[\s\S]*?\.login-page\s*\{[^}]*padding:\s*16px;[\s\S]*?\.login-card\s*\{[^}]*padding:\s*24px 20px;/s);
  assert.match(application, /function showLogin\(message = "", tone = "error"\)[\s\S]*loginError\.dataset\.tone = tone;/);
  assert.match(application, /showLogin\("已安全退出后台。", "status"\)/);
});

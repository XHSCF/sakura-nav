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

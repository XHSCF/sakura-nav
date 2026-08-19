"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const dataPath = path.join(root, "assets/js/sites-data.js");
const outputPath = path.join(root, "migrations/0002_seed_navigation_data.sql");
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(dataPath, "utf8"), context);
const data = JSON.parse(JSON.stringify(context.window.SAKURA_DATA));

function sql(value) {
  if (value === null || value === undefined || value === "") return "NULL";
  if (typeof value === "number") return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
}

const lines = [
  "PRAGMA foreign_keys = ON;",
  "",
  "-- Generated from assets/js/sites-data.js by tools/generate_d1_seed.js.",
  "DELETE FROM sites;",
  "DELETE FROM categories;",
  ""
];

data.categories.forEach((category, index) => {
  lines.push(`INSERT INTO categories(id, name, icon, sort_order, is_visible) VALUES (${sql(category.id)}, ${sql(category.name)}, ${sql(category.icon)}, ${index}, 1);`);
});

lines.push("");
const categoryPositions = new Map();
data.sites.forEach((site) => {
  const position = categoryPositions.get(site.category) || 0;
  categoryPositions.set(site.category, position + 1);
  lines.push(`INSERT INTO sites(id, name, description, category_id, is_hidden, primary_url, primary_label, secondary_url, secondary_label, keywords_json, added_at, sort_order, status) VALUES (${[
    site.id, site.name, site.description, site.category, 0, site.url, site.urlLabel, site.secondaryUrl,
    site.secondaryUrlLabel, JSON.stringify(site.keywords || []), site.addedAt, position, "published"
  ].map(sql).join(", ")});`);
});

lines.push("");
(data.hiddenSection?.sites || []).forEach((site, index) => {
  lines.push(`INSERT INTO sites(id, name, description, category_id, is_hidden, primary_url, primary_label, secondary_url, secondary_label, keywords_json, added_at, sort_order, status) VALUES (${[
    site.id, site.name, site.description, null, 1, site.url, site.urlLabel, site.secondaryUrl,
    site.secondaryUrlLabel, JSON.stringify(site.keywords || []), null, index, "published"
  ].map(sql).join(", ")});`);
});

const hiddenSettings = {
  hidden_id: data.hiddenSection?.id || "new-world",
  hidden_name: data.hiddenSection?.name || "新世界",
  hidden_icon: data.hiddenSection?.icon || "fa-door-open",
  hidden_passphrase: data.hiddenSection?.passphrase || "开门",
  hidden_welcome: data.hiddenSection?.welcome || "欢迎踏入新世界的大门",
  hidden_enabled: "1"
};
lines.push("");
Object.entries(hiddenSettings).forEach(([key, value]) => {
  lines.push(`INSERT INTO settings(key, value, updated_at) VALUES (${sql(key)}, ${sql(value)}, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP;`);
});
lines.push("");
lines.push(`INSERT INTO audit_logs(action, entity_type, entity_id, details_json) VALUES ('seed', 'navigation', 'all', ${sql(JSON.stringify({ categories: data.categories.length, sites: data.sites.length, hiddenSites: data.hiddenSection?.sites?.length || 0 }))});`);
lines.push("");

fs.writeFileSync(outputPath, lines.join("\n"), "utf8");
console.log(`Generated ${path.relative(root, outputPath)} with ${data.categories.length} categories, ${data.sites.length} public sites and ${data.hiddenSection?.sites?.length || 0} hidden sites.`);

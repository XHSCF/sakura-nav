const SESSION_COOKIE = "sakura_admin_session";
const SESSION_SECONDS = 8 * 60 * 60;
const LOGIN_WINDOW_SECONDS = 15 * 60;
const LOGIN_MAX_ATTEMPTS = 5;
const MAX_JSON_BYTES = 256 * 1024;
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ICON_PATTERN = /^fa-[a-z0-9-]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SITE_STATUSES = new Set(["draft", "published"]);
const ANALYTICS_RANGES = new Set([1, 7, 30, 90]);
const ANALYTICS_RETENTION_DAYS = 90;
const AUDIT_RETENTION_DAYS = 180;
const CONTENT_REVISION_HEADER = "X-Sakura-Revision";
const DATABASE_SCHEMA_VERSION = 6;
const MAX_SITE_COUNT = 500;
const MAX_CATEGORY_COUNT = 50;
const VISITOR_ID_PATTERN = /^[A-Za-z0-9_-]{16,96}$/;
const DEFAULT_PUBLIC_VISIT_LIMIT_PER_MINUTE = 240;
const encoder = new TextEncoder();

function apiHeaders(extra = {}) {
  return {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    ...extra
  };
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), { status, headers: apiHeaders(extraHeaders) });
}

function errorResponse(message, status = 400, code = "BAD_REQUEST") {
  return json({ ok: false, error: message, code }, status);
}

function noContent() {
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

function cleanText(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizeSecret(value) {
  return cleanText(value).toLocaleLowerCase("zh-CN");
}

function bytesToBase64Url(bytes) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function sha256Bytes(value) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(String(value))));
}

export async function sha256Hex(value) {
  const bytes = await sha256Bytes(value);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function secureEqual(left, right) {
  const [leftHash, rightHash] = await Promise.all([sha256Bytes(left), sha256Bytes(right)]);
  if (typeof crypto.subtle.timingSafeEqual === "function") {
    return crypto.subtle.timingSafeEqual(leftHash, rightHash);
  }
  let difference = 0;
  for (let index = 0; index < leftHash.length; index += 1) difference |= leftHash[index] ^ rightHash[index];
  return difference === 0;
}

async function readJson(request, maximumBytes = MAX_JSON_BYTES) {
  const declaredLength = Number(request.headers.get("Content-Length") || 0);
  if (declaredLength > maximumBytes) throw new ApiError("提交内容过大。", 413, "PAYLOAD_TOO_LARGE");
  const text = await request.text();
  if (encoder.encode(text).byteLength > maximumBytes) throw new ApiError("提交内容过大。", 413, "PAYLOAD_TOO_LARGE");
  try {
    return text ? JSON.parse(text) : {};
  } catch (_) {
    throw new ApiError("提交内容不是有效的 JSON。", 400, "INVALID_JSON");
  }
}

class ApiError extends Error {
  constructor(message, status = 400, code = "BAD_REQUEST") {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

function requireString(value, label, maximumLength) {
  const result = cleanText(value);
  if (!result) throw new ApiError(`请填写${label}。`);
  if (result.length > maximumLength) throw new ApiError(`${label}不能超过 ${maximumLength} 个字符。`);
  return result;
}

function optionalString(value, maximumLength) {
  const result = cleanText(value);
  if (!result) return null;
  if (result.length > maximumLength) throw new ApiError(`内容不能超过 ${maximumLength} 个字符。`);
  return result;
}

function validateId(value, label = "ID") {
  const id = requireString(value, label, 64).toLowerCase();
  if (!ID_PATTERN.test(id)) throw new ApiError(`${label}只能使用英文小写字母、数字和连字符。`);
  return id;
}

function validateUrl(value, label, optional = false) {
  const text = cleanText(value);
  if (!text && optional) return null;
  if (!text) throw new ApiError(`请填写${label}。`);
  if (text.length > 2048) throw new ApiError(`${label}过长。`);
  let parsed;
  try {
    parsed = new URL(text);
  } catch (_) {
    throw new ApiError(`${label}格式不正确。`);
  }
  if (!new Set(["http:", "https:"]).has(parsed.protocol)) throw new ApiError(`${label}必须以 http:// 或 https:// 开头。`);
  return text;
}

function validateDate(value, hidden) {
  const text = cleanText(value);
  if (hidden || !text) return null;
  const date = new Date(`${text}T00:00:00Z`);
  if (!DATE_PATTERN.test(text) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
    throw new ApiError("收录日期必须是有效的 YYYY-MM-DD 日期。");
  }
  return text;
}

function validateKeywords(value) {
  const source = Array.isArray(value) ? value : String(value ?? "").split(/[,，\n]/);
  const keywords = Array.from(new Set(source.map((item) => cleanText(item)).filter(Boolean)));
  if (keywords.length > 24) throw new ApiError("关键词最多填写 24 个。");
  if (keywords.some((keyword) => keyword.length > 40)) throw new ApiError("单个关键词不能超过 40 个字符。");
  return keywords;
}

function validateVisitPath(value) {
  const path = String(value ?? "").trim().split(/[?#]/, 1)[0];
  if (!path || path.length > 160 || !/^\/(?!\/)/.test(path) || /[\u0000-\u001f\u007f]/.test(path)) {
    throw new ApiError("访问页面格式不正确。", 400, "INVALID_VISIT");
  }
  if (path === "/admin" || path.startsWith("/admin/") || path.startsWith("/api/")) {
    throw new ApiError("该页面不参与访问统计。", 400, "INVALID_VISIT");
  }
  return path;
}

function validateReferrerHost(value) {
  const text = cleanText(value).toLowerCase();
  if (!text) return null;
  if (text.length > 255) throw new ApiError("访问来源格式不正确。", 400, "INVALID_VISIT");
  try {
    const hostname = new URL(`https://${text}`).hostname.toLowerCase();
    if (!hostname || hostname.length > 255) throw new Error("invalid hostname");
    return hostname;
  } catch (_) {
    throw new ApiError("访问来源格式不正确。", 400, "INVALID_VISIT");
  }
}

export function validateVisitPayload(payload) {
  const visitorId = cleanText(payload?.visitorId);
  if (!VISITOR_ID_PATTERN.test(visitorId)) throw new ApiError("匿名访客编号格式不正确。", 400, "INVALID_VISIT");
  return {
    visitorId,
    path: validateVisitPath(payload?.path),
    referrerHost: validateReferrerHost(payload?.referrerHost)
  };
}

export function classifyClient(userAgent, mobileHint = "") {
  const agent = String(userAgent || "");
  const tablet = /iPad|Tablet|PlayBook|Silk|Kindle|Android(?!.*Mobile)/i.test(agent);
  const mobile = mobileHint === "?1" || /Mobi|iPhone|iPod|Android/i.test(agent);
  const deviceType = tablet ? "tablet" : mobile ? "mobile" : agent ? "desktop" : "other";

  let browser = "其他浏览器";
  if (/MicroMessenger/i.test(agent)) browser = "微信内置浏览器";
  else if (/EdgA|EdgiOS|Edg\//i.test(agent)) browser = "Microsoft Edge";
  else if (/OPR\/|Opera/i.test(agent)) browser = "Opera";
  else if (/SamsungBrowser/i.test(agent)) browser = "Samsung Internet";
  else if (/CriOS|Chrome\//i.test(agent)) browser = "Chrome";
  else if (/FxiOS|Firefox\//i.test(agent)) browser = "Firefox";
  else if (/Safari\//i.test(agent)) browser = "Safari";

  let operatingSystem = "其他系统";
  if (/iPad|iPhone|iPod/i.test(agent)) operatingSystem = "iOS / iPadOS";
  else if (/Android/i.test(agent)) operatingSystem = "Android";
  else if (/Windows NT/i.test(agent)) operatingSystem = "Windows";
  else if (/CrOS/i.test(agent)) operatingSystem = "ChromeOS";
  else if (/Mac OS X|Macintosh/i.test(agent)) operatingSystem = "macOS";
  else if (/Linux/i.test(agent)) operatingSystem = "Linux";

  return { deviceType, browser, operatingSystem };
}

function isLikelyBot(userAgent) {
  return !userAgent || /bot\b|crawler|spider|slurp|bingpreview|headlesschrome|lighthouse|pagespeed|facebookexternalhit|telegrambot|whatsapp/i.test(userAgent);
}

function geographyFromRequest(request) {
  const cf = request.cf || {};
  const country = cleanText(cf.country).toUpperCase();
  return {
    countryCode: /^[A-Z]{2}$/.test(country) ? country : null,
    region: optionalString(cf.region || cf.regionCode, 80),
    city: optionalString(cf.city, 80)
  };
}

async function recordVisit(request, env, visit) {
  const userAgent = request.headers.get("User-Agent") || "";
  if (isLikelyBot(userAgent)) return;
  const visitorHash = await sha256Hex(`sakura-anonymous-visitor|${visit.visitorId}`);
  const client = classifyClient(userAgent, request.headers.get("Sec-CH-UA-Mobile"));
  const geography = geographyFromRequest(request);
  const minuteBucket = new Date().toISOString().slice(0, 16);
  const configuredLimit = Number(env.PUBLIC_VISIT_LIMIT_PER_MINUTE);
  const visitLimit = Number.isInteger(configuredLimit) && configuredLimit >= 30 && configuredLimit <= 3000
    ? configuredLimit
    : DEFAULT_PUBLIC_VISIT_LIMIT_PER_MINUTE;
  await env.DB.prepare("INSERT OR IGNORE INTO visitor_events(visitor_hash, path, referrer_host, device_type, browser, operating_system, country_code, region, city, minute_bucket) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE COALESCE((SELECT value FROM settings WHERE key='analytics_enabled'), '1')='1' AND (SELECT COUNT(*) FROM visitor_events WHERE minute_bucket=?)<?")
    .bind(visitorHash, visit.path, visit.referrerHost, client.deviceType, client.browser, client.operatingSystem, geography.countryCode, geography.region, geography.city, minuteBucket, minuteBucket, visitLimit).run();
}

function sqliteTimestamp(value) {
  return new Date(value).toISOString().slice(0, 19).replace("T", " ");
}

export function analyticsStartTimestamp(days, now = Date.now()) {
  const shifted = new Date(now + 8 * 60 * 60 * 1000);
  const start = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate() - (days - 1)) - 8 * 60 * 60 * 1000;
  return sqliteTimestamp(start);
}

function analyticsRows(result) {
  return result?.results || [];
}

async function analyticsData(env, requestedDays) {
  const days = ANALYTICS_RANGES.has(Number(requestedDays)) ? Number(requestedDays) : 7;
  const start = analyticsStartTimestamp(days);
  const results = await env.DB.batch([
    env.DB.prepare("SELECT key, value FROM settings WHERE key IN ('analytics_enabled', 'analytics_retention_days')"),
    env.DB.prepare("SELECT COUNT(*) AS page_views, COUNT(DISTINCT visitor_hash) AS visitors, COUNT(DISTINCT path) AS pages, COUNT(DISTINCT CASE WHEN country_code IS NOT NULL THEN country_code END) AS countries FROM visitor_events WHERE occurred_at>=?").bind(start),
    env.DB.prepare("SELECT strftime('%Y-%m-%d', occurred_at, '+8 hours') AS day, COUNT(*) AS page_views, COUNT(DISTINCT visitor_hash) AS visitors FROM visitor_events WHERE occurred_at>=? GROUP BY day ORDER BY day").bind(start),
    env.DB.prepare("SELECT device_type AS label, COUNT(*) AS page_views FROM visitor_events WHERE occurred_at>=? GROUP BY device_type ORDER BY page_views DESC").bind(start),
    env.DB.prepare("SELECT browser AS label, COUNT(*) AS page_views FROM visitor_events WHERE occurred_at>=? GROUP BY browser ORDER BY page_views DESC LIMIT 8").bind(start),
    env.DB.prepare("SELECT operating_system AS label, COUNT(*) AS page_views FROM visitor_events WHERE occurred_at>=? GROUP BY operating_system ORDER BY page_views DESC LIMIT 8").bind(start),
    env.DB.prepare("SELECT path AS label, COUNT(*) AS page_views, COUNT(DISTINCT visitor_hash) AS visitors FROM visitor_events WHERE occurred_at>=? GROUP BY path ORDER BY page_views DESC LIMIT 12").bind(start),
    env.DB.prepare("SELECT COALESCE(referrer_host, '') AS label, COUNT(*) AS page_views FROM visitor_events WHERE occurred_at>=? GROUP BY referrer_host ORDER BY page_views DESC LIMIT 12").bind(start),
    env.DB.prepare("SELECT country_code, region, city, COUNT(*) AS page_views, COUNT(DISTINCT visitor_hash) AS visitors FROM visitor_events WHERE occurred_at>=? GROUP BY country_code, region, city ORDER BY page_views DESC LIMIT 50").bind(start),
    env.DB.prepare("SELECT id, path, referrer_host, device_type, browser, operating_system, country_code, region, city, occurred_at FROM visitor_events WHERE occurred_at>=? ORDER BY id DESC LIMIT 50").bind(start)
  ]);
  const settings = Object.fromEntries(analyticsRows(results[0]).map((row) => [row.key, row.value]));
  return {
    days,
    enabled: settings.analytics_enabled !== "0",
    retentionDays: Number(settings.analytics_retention_days) || ANALYTICS_RETENTION_DAYS,
    summary: analyticsRows(results[1])[0] || { page_views: 0, visitors: 0, pages: 0, countries: 0 },
    daily: analyticsRows(results[2]),
    devices: analyticsRows(results[3]),
    browsers: analyticsRows(results[4]),
    operatingSystems: analyticsRows(results[5]),
    pages: analyticsRows(results[6]),
    sources: analyticsRows(results[7]),
    locations: analyticsRows(results[8]),
    recent: analyticsRows(results[9])
  };
}

async function deleteExpiredOperationalData(env) {
  const result = await env.DB.prepare("SELECT key, value FROM settings WHERE key IN ('analytics_retention_days', 'audit_retention_days')").all();
  const settings = Object.fromEntries((result.results || []).map((row) => [row.key, row.value]));
  const configuredAnalytics = Number(settings.analytics_retention_days);
  const configuredAudit = Number(settings.audit_retention_days);
  const analyticsDays = Number.isInteger(configuredAnalytics) && configuredAnalytics >= 30 && configuredAnalytics <= 365
    ? configuredAnalytics
    : ANALYTICS_RETENTION_DAYS;
  const auditDays = Number.isInteger(configuredAudit) && configuredAudit >= 30 && configuredAudit <= 730
    ? configuredAudit
    : AUDIT_RETENTION_DAYS;
  const cleanupResults = await env.DB.batch([
    env.DB.prepare("DELETE FROM visitor_events WHERE occurred_at<?").bind(sqliteTimestamp(Date.now() - analyticsDays * 24 * 60 * 60 * 1000)),
    env.DB.prepare("DELETE FROM audit_logs WHERE created_at<?").bind(sqliteTimestamp(Date.now() - auditDays * 24 * 60 * 60 * 1000)),
    env.DB.prepare("DELETE FROM login_attempts WHERE window_started<?").bind(Math.floor(Date.now() / 1000) - LOGIN_WINDOW_SECONDS)
  ]);
  const completedAt = new Date().toISOString();
  const summary = {
    visitorEvents: Number(cleanupResults[0]?.meta?.changes || 0),
    auditLogs: Number(cleanupResults[1]?.meta?.changes || 0),
    loginAttempts: Number(cleanupResults[2]?.meta?.changes || 0)
  };
  await env.DB.batch([
    env.DB.prepare("INSERT INTO settings(key, value, updated_at) VALUES ('maintenance_last_run_at', ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP").bind(completedAt),
    env.DB.prepare("INSERT INTO settings(key, value, updated_at) VALUES ('maintenance_last_result', ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP").bind(JSON.stringify(summary))
  ]);
  return { completedAt, ...summary };
}

export function validateCategoryPayload(payload) {
  const id = validateId(payload?.id, "分类 ID");
  const icon = requireString(payload?.icon, "分类图标", 64);
  if (!ICON_PATTERN.test(icon)) throw new ApiError("分类图标必须使用 fa-* 格式。");
  return {
    id,
    name: requireString(payload?.name, "分类名称", 30),
    icon,
    sortOrder: Number.isInteger(Number(payload?.sortOrder)) ? Number(payload.sortOrder) : 0,
    isVisible: payload?.isVisible !== false
  };
}

export function validateSitePayload(payload, categoryIds = new Set()) {
  const hidden = payload?.isHidden === true;
  const category = hidden ? null : validateId(payload?.category, "所属分类");
  if (!hidden && !categoryIds.has(category)) throw new ApiError("请选择有效的所属分类。");
  const urlLabel = optionalString(payload?.urlLabel, 20);
  const secondaryUrl = validateUrl(payload?.secondaryUrl, "第二个按钮链接", true);
  const secondaryUrlLabel = optionalString(payload?.secondaryUrlLabel, 20);
  if ((secondaryUrl && !secondaryUrlLabel) || (!secondaryUrl && secondaryUrlLabel)) {
    throw new ApiError("第二个按钮的名称和链接必须同时填写。 ");
  }
  if (secondaryUrl && !urlLabel) throw new ApiError("双按钮卡片必须填写第一个按钮名称。");
  const url = validateUrl(payload?.url, "第一个按钮链接");
  if (secondaryUrl === url) throw new ApiError("两个按钮不能使用相同链接。");
  if (secondaryUrlLabel && secondaryUrlLabel === urlLabel) throw new ApiError("两个按钮不能使用相同名称。");
  const status = payload?.status ?? "published";
  if (!SITE_STATUSES.has(status)) throw new ApiError("发布状态不正确。");
  return {
    id: validateId(payload?.id, "卡片 ID"),
    name: requireString(payload?.name, "卡片名称", 60),
    description: requireString(payload?.description, "卡片描述", 100),
    category,
    isHidden: hidden,
    url,
    urlLabel,
    secondaryUrl,
    secondaryUrlLabel,
    keywords: validateKeywords(payload?.keywords),
    addedAt: validateDate(payload?.addedAt, hidden),
    sortOrder: Number.isInteger(Number(payload?.sortOrder)) ? Number(payload.sortOrder) : 0,
    status
  };
}

function rowToSite(row) {
  let keywords = [];
  try { keywords = JSON.parse(row.keywords_json || "[]"); } catch (_) { keywords = []; }
  const site = {
    id: row.id,
    name: row.name,
    url: row.primary_url,
    description: row.description,
    keywords: Array.isArray(keywords) ? keywords : []
  };
  if (!row.is_hidden) site.category = row.category_id;
  if (row.primary_label) site.urlLabel = row.primary_label;
  if (row.secondary_url && row.secondary_label) {
    site.secondaryUrl = row.secondary_url;
    site.secondaryUrlLabel = row.secondary_label;
  }
  if (!row.is_hidden && row.added_at) site.addedAt = row.added_at;
  return site;
}

async function listCategories(env, includeHidden = false) {
  const where = includeHidden ? "" : "WHERE is_visible = 1";
  const result = await env.DB.prepare(`SELECT id, name, icon, sort_order, is_visible FROM categories ${where} ORDER BY sort_order, rowid`).all();
  return (result.results || []).map((row) => ({
    id: row.id,
    name: row.name,
    icon: row.icon,
    sortOrder: row.sort_order,
    isVisible: Boolean(row.is_visible)
  }));
}

async function listSites(env, { admin = false, hidden = null } = {}) {
  const clauses = [];
  const values = [];
  if (!admin) clauses.push("s.status = 'published'");
  if (hidden !== null) {
    clauses.push("s.is_hidden = ?");
    values.push(hidden ? 1 : 0);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const result = await env.DB.prepare(`SELECT s.* FROM sites s LEFT JOIN categories c ON c.id=s.category_id ${where} ORDER BY s.is_hidden, COALESCE(c.sort_order, 9999), s.sort_order, s.rowid`).bind(...values).all();
  return (result.results || []).map((row) => ({
    ...rowToSite(row),
    isHidden: Boolean(row.is_hidden),
    sortOrder: row.sort_order,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

async function readSettings(env) {
  const result = await env.DB.prepare("SELECT key, value FROM settings").all();
  return Object.fromEntries((result.results || []).map((row) => [row.key, row.value]));
}

function expectedContentRevision(request) {
  const value = request.headers.get(CONTENT_REVISION_HEADER);
  if (!/^\d+$/.test(value || "")) {
    throw new ApiError("后台版本已更新，请刷新页面后再保存。", 428, "CONTENT_REVISION_REQUIRED");
  }
  const revision = Number(value);
  if (!Number.isSafeInteger(revision)) throw new ApiError("内容版本号无效。", 400, "INVALID_CONTENT_REVISION");
  return revision;
}

async function currentContentRevision(env) {
  const value = await env.DB.prepare("SELECT value FROM settings WHERE key='content_revision'").first("value");
  const revision = Number(value);
  if (value === null || value === undefined || !Number.isSafeInteger(revision) || revision < 0) {
    throw new ApiError("数据库维护尚未完成，请先应用最新 migration。", 503, "DATABASE_MIGRATION_REQUIRED");
  }
  return revision;
}

function auditStatement(env, action, entityType, entityId, details = {}) {
  return env.DB.prepare("INSERT INTO audit_logs(action, entity_type, entity_id, details_json) VALUES (?, ?, ?, ?)")
    .bind(action, entityType, entityId, JSON.stringify(details));
}

function contentConflict() {
  return new ApiError("内容已在另一个标签页或设备中更新。当前修改仍保留，请重新打开后台数据后再保存。", 409, "CONTENT_CONFLICT");
}

async function runContentMutation(request, env, statements) {
  const expected = expectedContentRevision(request);
  if (await currentContentRevision(env) !== expected) throw contentConflict();
  const guard = env.DB.prepare("INSERT OR REPLACE INTO content_revision_guard(id, valid) VALUES (1, COALESCE((SELECT CASE WHEN CAST(value AS INTEGER)=? THEN 1 ELSE 0 END FROM settings WHERE key='content_revision'), 0))")
    .bind(expected);
  const bump = env.DB.prepare("UPDATE settings SET value=CAST(value AS INTEGER)+1, updated_at=CURRENT_TIMESTAMP WHERE key='content_revision'");
  try {
    await env.DB.batch([guard, ...statements, bump]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/content_revision_(?:must_match|guard)/i.test(message)) throw contentConflict();
    throw error;
  }
  return expected + 1;
}

function hiddenSettingsForAdmin(settings) {
  return {
    id: settings.hidden_id || "new-world",
    name: settings.hidden_name || "新世界",
    icon: settings.hidden_icon || "fa-door-open",
    passphrase: settings.hidden_passphrase || "",
    welcome: settings.hidden_welcome || "欢迎踏入新世界的大门",
    enabled: settings.hidden_enabled !== "0"
  };
}

async function hiddenSettingsForPublic(settings) {
  const adminSettings = hiddenSettingsForAdmin(settings);
  return {
    id: adminSettings.id,
    name: adminSettings.name,
    icon: adminSettings.icon,
    welcome: adminSettings.welcome,
    enabled: adminSettings.enabled,
    unlockHash: adminSettings.passphrase ? await sha256Hex(normalizeSecret(adminSettings.passphrase)) : ""
  };
}

async function publicData(env) {
  const [categories, sites, settings] = await Promise.all([
    listCategories(env),
    listSites(env, { hidden: false }),
    readSettings(env)
  ]);
  const visibleIds = new Set(categories.map((category) => category.id));
  return {
    categories: categories.map(({ sortOrder, isVisible, ...category }) => category),
    sites: sites.filter((site) => visibleIds.has(site.category)).map(({ isHidden, sortOrder, status, createdAt, updatedAt, ...site }) => site),
    hiddenSection: await hiddenSettingsForPublic(settings),
    source: "database"
  };
}

async function insertAudit(env, action, entityType, entityId, details = {}) {
  await auditStatement(env, action, entityType, entityId, details).run();
}

async function ensureSiteUnique(env, site, excludedId = "") {
  const urls = [site.url, site.secondaryUrl].filter(Boolean);
  const placeholders = urls.map(() => "?").join(", ");
  const urlClause = urls.length
    ? `(primary_url IN (${placeholders}) OR secondary_url IN (${placeholders}))`
    : "0";
  const row = await env.DB.prepare(`SELECT id, name FROM sites WHERE id<>? AND (id=? OR lower(name)=lower(?) OR ${urlClause}) LIMIT 1`)
    .bind(excludedId, site.id, site.name, ...urls, ...urls).first();
  if (row) throw new ApiError(`名称或链接与现有卡片“${row.name}”重复。`, 409, "DUPLICATE_SITE");
}

async function ensureCategoryUnique(env, category, excludedId = "") {
  const row = await env.DB.prepare("SELECT id, name FROM categories WHERE id<>? AND (id=? OR lower(name)=lower(?)) LIMIT 1")
    .bind(excludedId, category.id, category.name).first();
  if (row) throw new ApiError(`已经存在同名分类“${row.name}”。`, 409, "DUPLICATE_CATEGORY");
}

function siteStatement(env, site, update = false, originalId = site.id) {
  const values = [
    site.name, site.description, site.category, site.isHidden ? 1 : 0, site.url, site.urlLabel,
    site.secondaryUrl, site.secondaryUrlLabel, JSON.stringify(site.keywords), site.addedAt,
    site.sortOrder, site.status
  ];
  if (update) {
    return env.DB.prepare("UPDATE sites SET name=?, description=?, category_id=?, is_hidden=?, primary_url=?, primary_label=?, secondary_url=?, secondary_label=?, keywords_json=?, added_at=?, sort_order=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
      .bind(...values, originalId);
  }
  return env.DB.prepare("INSERT INTO sites(id, name, description, category_id, is_hidden, primary_url, primary_label, secondary_url, secondary_label, keywords_json, added_at, sort_order, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(site.id, ...values);
}

function parseCookies(request) {
  return Object.fromEntries(String(request.headers.get("Cookie") || "").split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
    const index = part.indexOf("=");
    return index < 0 ? [part, ""] : [part.slice(0, index), part.slice(index + 1)];
  }));
}

async function hmac(secret, value) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

async function createSessionToken(env, username) {
  const csrfBytes = new Uint8Array(24);
  crypto.getRandomValues(csrfBytes);
  const payload = bytesToBase64Url(encoder.encode(JSON.stringify({
    username,
    csrf: bytesToBase64Url(csrfBytes),
    expiresAt: Math.floor(Date.now() / 1000) + SESSION_SECONDS
  })));
  const signature = bytesToBase64Url(await hmac(env.ADMIN_SESSION_SECRET, payload));
  return `${payload}.${signature}`;
}

async function verifySession(env, request) {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token || !env.ADMIN_SESSION_SECRET) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;
  const expected = bytesToBase64Url(await hmac(env.ADMIN_SESSION_SECRET, payload));
  if (!(await secureEqual(signature, expected))) return null;
  try {
    const decoded = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload)));
    if (!decoded.username || !decoded.csrf || Number(decoded.expiresAt) <= Date.now() / 1000) return null;
    return decoded;
  } catch (_) {
    return null;
  }
}

function cookieHeader(request, token, maximumAge = SESSION_SECONDS) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maximumAge}${secure}`;
}

function requireSameOrigin(request, required = false) {
  const origin = request.headers.get("Origin");
  if (required && !origin) throw new ApiError("请求来源无效。", 403, "INVALID_ORIGIN");
  if (origin && origin !== new URL(request.url).origin) throw new ApiError("请求来源无效。", 403, "INVALID_ORIGIN");
}

async function requireAdmin(env, request, requireCsrf = false) {
  const session = await verifySession(env, request);
  if (!session) throw new ApiError("请先登录管理后台。", 401, "UNAUTHORIZED");
  if (requireCsrf) {
    requireSameOrigin(request);
    if (!(await secureEqual(request.headers.get("X-Sakura-CSRF") || "", session.csrf))) {
      throw new ApiError("页面验证已失效，请刷新后重试。", 403, "INVALID_CSRF");
    }
  }
  return session;
}

async function loginKey(request) {
  const address = request.headers.get("CF-Connecting-IP") || "local";
  return sha256Hex(`sakura-admin-login|${address}`);
}

async function checkLoginLimit(env, key) {
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare("SELECT attempts, window_started FROM login_attempts WHERE key=?").bind(key).first();
  return Boolean(row && now - Number(row.window_started) < LOGIN_WINDOW_SECONDS && Number(row.attempts) >= LOGIN_MAX_ATTEMPTS);
}

async function recordLoginFailure(env, key) {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare("INSERT INTO login_attempts(key, attempts, window_started) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN ?-window_started>=? THEN 1 ELSE attempts+1 END, window_started=CASE WHEN ?-window_started>=? THEN ? ELSE window_started END")
    .bind(key, now, now, LOGIN_WINDOW_SECONDS, now, LOGIN_WINDOW_SECONDS, now).run();
}

async function handleLogin(request, env) {
  requireSameOrigin(request);
  if (!env.ADMIN_USERNAME || !env.ADMIN_PASSWORD || !env.ADMIN_SESSION_SECRET || env.ADMIN_PASSWORD.length < 12 || env.ADMIN_SESSION_SECRET.length < 32) {
    return errorResponse("后台密钥尚未配置，请先在 Cloudflare 中设置。", 503, "ADMIN_NOT_CONFIGURED");
  }
  const payload = await readJson(request, 4096);
  const username = cleanText(payload.username);
  const password = String(payload.password || "");
  const key = await loginKey(request);
  if (await checkLoginLimit(env, key)) return errorResponse("尝试次数过多，请 15 分钟后再试。", 429, "TOO_MANY_ATTEMPTS");
  const [validUsername, validPassword] = await Promise.all([
    secureEqual(username, env.ADMIN_USERNAME),
    secureEqual(password, env.ADMIN_PASSWORD)
  ]);
  if (!validUsername || !validPassword) {
    await recordLoginFailure(env, key);
    return errorResponse("账号或密码不正确。", 401, "INVALID_CREDENTIALS");
  }
  await env.DB.prepare("DELETE FROM login_attempts WHERE key=?").bind(key).run();
  const token = await createSessionToken(env, env.ADMIN_USERNAME);
  const session = await verifySession(env, new Request(request.url, { headers: { Cookie: `${SESSION_COOKIE}=${token}` } }));
  return json({ ok: true, user: env.ADMIN_USERNAME, csrf: session.csrf }, 200, { "Set-Cookie": cookieHeader(request, token) });
}

async function adminData(env) {
  const [categories, sites, settings, auditResult] = await Promise.all([
    listCategories(env, true),
    listSites(env, { admin: true }),
    readSettings(env),
    env.DB.prepare("SELECT id, action, entity_type, entity_id, details_json, created_at FROM audit_logs ORDER BY id DESC LIMIT 100").all()
  ]);
  const revision = Number(settings.content_revision);
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new ApiError("数据库维护尚未完成，请先应用最新 migration。", 503, "DATABASE_MIGRATION_REQUIRED");
  }
  let maintenanceResult = null;
  try {
    const parsed = JSON.parse(settings.maintenance_last_result || "null");
    if (parsed && typeof parsed === "object") {
      maintenanceResult = {
        visitorEvents: Number(parsed.visitorEvents) || 0,
        auditLogs: Number(parsed.auditLogs) || 0,
        loginAttempts: Number(parsed.loginAttempts) || 0
      };
    }
  } catch (_) {
    maintenanceResult = null;
  }
  const configuredAnalyticsRetention = Number(settings.analytics_retention_days);
  const configuredAuditRetention = Number(settings.audit_retention_days);
  return {
    categories,
    sites,
    hiddenSection: hiddenSettingsForAdmin(settings),
    revision,
    systemStatus: {
      schemaVersion: DATABASE_SCHEMA_VERSION,
      contentRevision: revision,
      siteCount: sites.length,
      siteLimit: MAX_SITE_COUNT,
      categoryCount: categories.length,
      categoryLimit: MAX_CATEGORY_COUNT,
      analyticsRetentionDays: Number.isInteger(configuredAnalyticsRetention) ? configuredAnalyticsRetention : ANALYTICS_RETENTION_DAYS,
      auditRetentionDays: Number.isInteger(configuredAuditRetention) ? configuredAuditRetention : AUDIT_RETENTION_DAYS,
      lastMaintenanceAt: settings.maintenance_last_run_at || null,
      lastMaintenanceResult: maintenanceResult
    },
    auditLogs: (auditResult.results || []).map((row) => ({
      id: row.id,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      details: (() => { try { return JSON.parse(row.details_json); } catch (_) { return {}; } })(),
      createdAt: row.created_at
    }))
  };
}

async function handleSiteMutation(request, env, pathname) {
  await requireAdmin(env, request, true);
  const match = pathname.match(/^\/api\/admin\/sites(?:\/([a-z0-9-]+))?$/);
  const routeId = match?.[1] || null;
  if (request.method === "POST" && !routeId) {
    const payload = await readJson(request);
    const count = Number(await env.DB.prepare("SELECT COUNT(*) AS count FROM sites").first("count"));
    if (count >= MAX_SITE_COUNT) throw new ApiError(`卡片数量已达到 ${MAX_SITE_COUNT} 张上限。`, 409, "SITE_LIMIT_REACHED");
    const categoryIds = new Set((await listCategories(env, true)).map((category) => category.id));
    const site = validateSitePayload(payload, categoryIds);
    await ensureSiteUnique(env, site);
    const revision = await runContentMutation(request, env, [
      siteStatement(env, site),
      auditStatement(env, "create", "site", site.id, { name: site.name })
    ]);
    return json({ ok: true, site, revision }, 201);
  }
  if (request.method === "PUT" && routeId) {
    const existing = await env.DB.prepare("SELECT id FROM sites WHERE id=?").bind(routeId).first();
    if (!existing) throw new ApiError("没有找到这张卡片。", 404, "NOT_FOUND");
    const payload = { ...(await readJson(request)), id: routeId };
    const categoryIds = new Set((await listCategories(env, true)).map((category) => category.id));
    const site = validateSitePayload(payload, categoryIds);
    await ensureSiteUnique(env, site, routeId);
    const revision = await runContentMutation(request, env, [
      siteStatement(env, site, true, routeId),
      auditStatement(env, "update", "site", routeId, { name: site.name })
    ]);
    return json({ ok: true, site, revision });
  }
  if (request.method === "DELETE" && routeId) {
    const existing = await env.DB.prepare("SELECT name FROM sites WHERE id=?").bind(routeId).first();
    if (!existing) throw new ApiError("没有找到这张卡片。", 404, "NOT_FOUND");
    const revision = await runContentMutation(request, env, [
      env.DB.prepare("DELETE FROM sites WHERE id=?").bind(routeId),
      auditStatement(env, "delete", "site", routeId, { name: existing.name })
    ]);
    return json({ ok: true, revision });
  }
  return errorResponse("不支持的卡片操作。", 405, "METHOD_NOT_ALLOWED");
}

async function handleCategoryMutation(request, env, pathname) {
  await requireAdmin(env, request, true);
  const match = pathname.match(/^\/api\/admin\/categories(?:\/([a-z0-9-]+))?$/);
  const routeId = match?.[1] || null;
  if (request.method === "POST" && !routeId) {
    const category = validateCategoryPayload(await readJson(request));
    const count = Number(await env.DB.prepare("SELECT COUNT(*) AS count FROM categories").first("count"));
    if (count >= MAX_CATEGORY_COUNT) throw new ApiError(`分类数量已达到 ${MAX_CATEGORY_COUNT} 个上限。`, 409, "CATEGORY_LIMIT_REACHED");
    await ensureCategoryUnique(env, category);
    const revision = await runContentMutation(request, env, [
      env.DB.prepare("INSERT INTO categories(id, name, icon, sort_order, is_visible) VALUES (?, ?, ?, ?, ?)")
        .bind(category.id, category.name, category.icon, category.sortOrder, category.isVisible ? 1 : 0),
      auditStatement(env, "create", "category", category.id, { name: category.name })
    ]);
    return json({ ok: true, category, revision }, 201);
  }
  if (request.method === "PUT" && routeId) {
    const existing = await env.DB.prepare("SELECT id FROM categories WHERE id=?").bind(routeId).first();
    if (!existing) throw new ApiError("没有找到这个分类。", 404, "NOT_FOUND");
    const category = validateCategoryPayload({ ...(await readJson(request)), id: routeId });
    await ensureCategoryUnique(env, category, routeId);
    const revision = await runContentMutation(request, env, [
      env.DB.prepare("UPDATE categories SET name=?, icon=?, sort_order=?, is_visible=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
        .bind(category.name, category.icon, category.sortOrder, category.isVisible ? 1 : 0, routeId),
      auditStatement(env, "update", "category", routeId, { name: category.name })
    ]);
    return json({ ok: true, category, revision });
  }
  if (request.method === "DELETE" && routeId) {
    const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM sites WHERE category_id=?").bind(routeId).first("count");
    if (Number(count) > 0) throw new ApiError("该分类中仍有卡片，请先移动或删除这些卡片。", 409, "CATEGORY_NOT_EMPTY");
    const existing = await env.DB.prepare("SELECT id FROM categories WHERE id=?").bind(routeId).first();
    if (!existing) throw new ApiError("没有找到这个分类。", 404, "NOT_FOUND");
    const revision = await runContentMutation(request, env, [
      env.DB.prepare("DELETE FROM categories WHERE id=?").bind(routeId),
      auditStatement(env, "delete", "category", routeId)
    ]);
    return json({ ok: true, revision });
  }
  return errorResponse("不支持的分类操作。", 405, "METHOD_NOT_ALLOWED");
}

async function handleHiddenSettings(request, env) {
  await requireAdmin(env, request, true);
  const payload = await readJson(request, 16 * 1024);
  const settings = {
    hidden_id: validateId(payload.id || "new-world", "隐藏板块 ID"),
    hidden_name: requireString(payload.name, "隐藏板块名称", 30),
    hidden_icon: requireString(payload.icon, "隐藏板块图标", 64),
    hidden_passphrase: requireString(payload.passphrase, "入口口令", 64),
    hidden_welcome: requireString(payload.welcome, "欢迎词", 80),
    hidden_enabled: payload.enabled === false ? "0" : "1"
  };
  if (!ICON_PATTERN.test(settings.hidden_icon)) throw new ApiError("隐藏板块图标必须使用 fa-* 格式。");
  const statements = Object.entries(settings).map(([key, value]) => env.DB.prepare("INSERT INTO settings(key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP").bind(key, value));
  const revision = await runContentMutation(request, env, [
    ...statements,
    auditStatement(env, "update", "settings", "hidden-section", { name: settings.hidden_name })
  ]);
  return json({ ok: true, revision });
}

async function handleReorder(request, env) {
  await requireAdmin(env, request, true);
  const payload = await readJson(request, 32 * 1024);
  const entity = payload?.entity;
  const ids = Array.isArray(payload?.ids) ? payload.ids.map((id) => validateId(id)) : [];
  if (!new Set(["sites", "categories"]).has(entity) || !ids.length || ids.length > 500 || new Set(ids).size !== ids.length) {
    throw new ApiError("排序内容不正确。 ");
  }
  const table = entity === "sites" ? "sites" : "categories";
  const existing = await env.DB.prepare(`SELECT id FROM ${table} WHERE id IN (${ids.map(() => "?").join(",")})`).bind(...ids).all();
  if ((existing.results || []).length !== ids.length) throw new ApiError("排序内容包含不存在的项目。", 404, "NOT_FOUND");
  const revision = await runContentMutation(request, env, [
    ...ids.map((id, index) => env.DB.prepare(`UPDATE ${table} SET sort_order=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(index, id)),
    auditStatement(env, "reorder", entity === "sites" ? "site" : "category", "multiple", { count: ids.length })
  ]);
  return json({ ok: true, revision });
}

function backupFromAdminData(data) {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    categories: data.categories,
    sites: data.sites.map(({ createdAt, updatedAt, ...site }) => site),
    hiddenSection: data.hiddenSection
  };
}

async function handleImport(request, env) {
  await requireAdmin(env, request, true);
  const payload = await readJson(request, 1024 * 1024);
  if (payload?.version !== 1 || !Array.isArray(payload.categories) || !Array.isArray(payload.sites)) throw new ApiError("备份文件格式不正确。 ");
  if (payload.categories.length > MAX_CATEGORY_COUNT || payload.sites.length > MAX_SITE_COUNT) throw new ApiError("备份中的数据量超过限制。 ");
  const categories = payload.categories.map(validateCategoryPayload);
  const categoryIds = new Set(categories.map((category) => category.id));
  if (categoryIds.size !== categories.length) throw new ApiError("备份中存在重复的分类 ID。 ");
  if (new Set(categories.map((category) => category.name.toLocaleLowerCase("zh-CN"))).size !== categories.length) {
    throw new ApiError("备份中存在重复的分类名称。 ");
  }
  const sites = payload.sites.map((site) => validateSitePayload(site, categoryIds));
  if (new Set(sites.map((site) => site.id)).size !== sites.length) throw new ApiError("备份中存在重复的卡片 ID。 ");
  if (new Set(sites.map((site) => site.name.toLocaleLowerCase("zh-CN"))).size !== sites.length) throw new ApiError("备份中存在重复的卡片名称。 ");
  const importedUrls = sites.flatMap((site) => [site.url, site.secondaryUrl].filter(Boolean));
  if (new Set(importedUrls).size !== importedUrls.length) throw new ApiError("备份中存在重复的卡片链接。 ");
  const hidden = payload.hiddenSection || {};
  const hiddenSettings = {
    hidden_id: validateId(hidden.id || "new-world", "隐藏板块 ID"),
    hidden_name: requireString(hidden.name, "隐藏板块名称", 30),
    hidden_icon: requireString(hidden.icon, "隐藏板块图标", 64),
    hidden_passphrase: requireString(hidden.passphrase, "入口口令", 64),
    hidden_welcome: requireString(hidden.welcome, "欢迎词", 80),
    hidden_enabled: hidden.enabled === false ? "0" : "1"
  };
  if (!ICON_PATTERN.test(hiddenSettings.hidden_icon)) throw new ApiError("隐藏板块图标必须使用 fa-* 格式。");
  const statements = [
    env.DB.prepare("DELETE FROM sites"),
    env.DB.prepare("DELETE FROM categories"),
    ...categories.map((category) => env.DB.prepare("INSERT INTO categories(id, name, icon, sort_order, is_visible) VALUES (?, ?, ?, ?, ?)").bind(category.id, category.name, category.icon, category.sortOrder, category.isVisible ? 1 : 0)),
    ...sites.map((site) => siteStatement(env, site)),
    ...Object.entries(hiddenSettings).map(([key, value]) => env.DB.prepare("INSERT INTO settings(key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP").bind(key, value)),
    env.DB.prepare("INSERT INTO audit_logs(action, entity_type, entity_id, details_json) VALUES ('import', 'backup', 'all', ?)").bind(JSON.stringify({ categories: categories.length, sites: sites.length }))
  ];
  const revision = await runContentMutation(request, env, statements);
  return json({ ok: true, categories: categories.length, sites: sites.length, revision });
}

async function handlePublic(request, env, pathname, ctx) {
  if (request.method === "GET" && pathname === "/api/public/data") return json({ ok: true, data: await publicData(env) });
  if (request.method === "POST" && pathname === "/api/public/visit") {
    requireSameOrigin(request, true);
    const visit = validateVisitPayload(await readJson(request, 4096));
    const task = recordVisit(request, env, visit);
    if (typeof ctx?.waitUntil === "function") {
      ctx.waitUntil(task.catch((error) => {
        console.error(JSON.stringify({ message: "anonymous visit write failed", error: error instanceof Error ? error.message : String(error) }));
      }));
      return noContent();
    }
    await task;
    return noContent();
  }
  if (request.method === "POST" && pathname === "/api/public/hidden") {
    requireSameOrigin(request, true);
    const settings = hiddenSettingsForAdmin(await readSettings(env));
    if (!settings.enabled) return errorResponse("隐藏板块当前未开放。", 404, "NOT_FOUND");
    const payload = await readJson(request, 2048);
    if (!(await secureEqual(normalizeSecret(payload.passphrase), normalizeSecret(settings.passphrase)))) {
      return errorResponse("入口口令不正确。", 403, "INVALID_PASSPHRASE");
    }
    const sites = (await listSites(env, { hidden: true })).map(({ isHidden, sortOrder, status, createdAt, updatedAt, ...site }) => site);
    return json({ ok: true, data: { id: settings.id, name: settings.name, icon: settings.icon, welcome: settings.welcome, sites } });
  }
  return errorResponse("接口不存在。", 404, "NOT_FOUND");
}

async function handleAnalyticsSettings(request, env) {
  await requireAdmin(env, request, true);
  const payload = await readJson(request, 4096);
  if (typeof payload?.enabled !== "boolean") throw new ApiError("统计开关状态不正确。", 400, "INVALID_ANALYTICS_SETTINGS");
  await env.DB.prepare("INSERT INTO settings(key, value, updated_at) VALUES ('analytics_enabled', ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP")
    .bind(payload.enabled ? "1" : "0").run();
  await insertAudit(env, "update", "analytics", "tracking", { enabled: payload.enabled });
  return json({ ok: true, enabled: payload.enabled });
}

async function clearAnalytics(request, env) {
  await requireAdmin(env, request, true);
  const result = await env.DB.prepare("DELETE FROM visitor_events").run();
  await insertAudit(env, "clear", "analytics", "visitor-events", { count: Number(result.meta?.changes || 0) });
  return json({ ok: true, deleted: Number(result.meta?.changes || 0) });
}

async function handleAdmin(request, env, pathname) {
  if (request.method === "POST" && pathname === "/api/admin/login") return handleLogin(request, env);
  if (request.method === "POST" && pathname === "/api/admin/logout") {
    await requireAdmin(env, request, true);
    return json({ ok: true }, 200, { "Set-Cookie": cookieHeader(request, "", 0) });
  }
  if (request.method === "GET" && pathname === "/api/admin/session") {
    const session = await requireAdmin(env, request);
    return json({ ok: true, user: session.username, csrf: session.csrf });
  }
  if (request.method === "GET" && pathname === "/api/admin/data") {
    await requireAdmin(env, request);
    return json({ ok: true, data: await adminData(env) });
  }
  if (request.method === "GET" && pathname === "/api/admin/analytics") {
    await requireAdmin(env, request);
    return json({ ok: true, data: await analyticsData(env, new URL(request.url).searchParams.get("days")) });
  }
  if (request.method === "PUT" && pathname === "/api/admin/analytics/settings") return handleAnalyticsSettings(request, env);
  if (request.method === "DELETE" && pathname === "/api/admin/analytics") return clearAnalytics(request, env);
  if (request.method === "GET" && pathname === "/api/admin/export") {
    await requireAdmin(env, request);
    const backup = backupFromAdminData(await adminData(env));
    return json(backup, 200, { "Content-Disposition": `attachment; filename="sakura-nav-backup-${new Date().toISOString().slice(0, 10)}.json"` });
  }
  if (request.method === "POST" && pathname === "/api/admin/import") return handleImport(request, env);
  if (request.method === "POST" && pathname === "/api/admin/reorder") return handleReorder(request, env);
  if (request.method === "PUT" && pathname === "/api/admin/hidden-settings") return handleHiddenSettings(request, env);
  if (/^\/api\/admin\/sites(?:\/[a-z0-9-]+)?$/.test(pathname)) return handleSiteMutation(request, env, pathname);
  if (/^\/api\/admin\/categories(?:\/[a-z0-9-]+)?$/.test(pathname)) return handleCategoryMutation(request, env, pathname);
  return errorResponse("接口不存在。", 404, "NOT_FOUND");
}

async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);
  if (url.pathname === "/admin") return Response.redirect(`${url.origin}/admin/`, 308);
  if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
  if (!env.DB) return errorResponse("数据库尚未绑定。", 503, "DATABASE_NOT_CONFIGURED");
  if (url.pathname.startsWith("/api/public/")) return handlePublic(request, env, url.pathname, ctx);
  if (url.pathname.startsWith("/api/admin/")) return handleAdmin(request, env, url.pathname);
  return errorResponse("接口不存在。", 404, "NOT_FOUND");
}

export default {
  async fetch(request, env, ctx) {
    try {
      return await handleRequest(request, env, ctx);
    } catch (error) {
      if (error instanceof ApiError) return errorResponse(error.message, error.status, error.code);
      const message = error instanceof Error ? error.message : String(error);
      console.error(JSON.stringify({ message: "request failed", error: message, path: new URL(request.url).pathname }));
      return errorResponse("服务器暂时无法处理请求。", 500, "INTERNAL_ERROR");
    }
  },
  async scheduled(_controller, env, ctx) {
    const task = deleteExpiredOperationalData(env).catch((error) => {
      console.error(JSON.stringify({ message: "operational data cleanup failed", error: error instanceof Error ? error.message : String(error) }));
    });
    if (typeof ctx?.waitUntil === "function") ctx.waitUntil(task);
    else await task;
  }
};

#!/usr/bin/env python3
"""Validate SAKURA's public site and Cloudflare configuration without third-party packages."""

from __future__ import annotations

import json
import re
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import parse_qsl, urlparse, urlsplit
from xml.etree import ElementTree


ROOT = Path(__file__).resolve().parents[1]
TODAY_IN_CHINA = (datetime.now(timezone.utc) + timedelta(hours=8)).date()
MAIN_PAGES = ("index.html", "about/index.html", "404.html")
REQUIRED_FILES = (
    *MAIN_PAGES,
    "assets/css/sakura.css",
    "assets/js/sites-data.js",
    "assets/js/data-loader.js",
    "assets/js/analytics.js",
    "assets/js/app-guard.js",
    "assets/js/sakura-core.js",
    "assets/js/sakura-app.js",
    "assets/js/theme-init.js",
    "sakura-icon.png",
    "assets/images/icons/sakura-icon.png",
    "assets/images/icons/favicon-16.png",
    "assets/images/icons/favicon-32.png",
    "assets/images/icons/favicon-48.png",
    "assets/images/favicon.png",
    "assets/images/icons/apple-touch-icon.png",
    "assets/images/icons/pwa-192.png",
    "assets/images/icons/pwa-512.png",
    "manifest.webmanifest",
    "robots.txt",
    "sitemap.xml",
    "_headers",
    "wrangler.jsonc",
    "worker/index.mjs",
    "admin/index.html",
    "admin/admin.css",
    "admin/admin.js",
    "migrations/0001_admin_schema.sql",
    "migrations/0002_seed_navigation_data.sql",
    ".github/workflows/site-validation.yml",
    "tools/test_frontend.js",
)
LOCAL_REF_RE = re.compile(r"(?:src|href)\s*=\s*[\"']([^\"']+)[\"']", re.I)
SITE_RE = re.compile(r"\{(?=[^{}]*\bid:\s*\")[^{}]*\burl:\s*\"[^{}]+?\bcategory:\s*\"[^{}]+?\}")
CATEGORY_RE = re.compile(
    r"\{(?=[^{}]*\bid:\s*\"[a-z0-9-]+\")(?=[^{}]*\bname:\s*\"[^\"]+\")[^{}]*\}"
)
REMOTE_FAVICON_RE = re.compile(
    r"google\.com/s2/favicons|gstatic\.com|https?://[^\s\"']*favicon", re.I
)


def field(block: str, name: str) -> str:
    match = re.search(rf"\b{re.escape(name)}:\s*\"([^\"]*)\"", block)
    return match.group(1).strip() if match else ""


def normalized_url_key(value: str) -> str:
    parsed = urlsplit(value)
    host = (parsed.hostname or "").lower()
    if host.startswith("www."):
        host = host[4:]
    port = parsed.port
    if port and not ((parsed.scheme == "http" and port == 80) or (parsed.scheme == "https" and port == 443)):
        host = f"{host}:{port}"
    path = re.sub(r"/{2,}", "/", parsed.path or "/")
    if path != "/":
        path = path.rstrip("/")
    tracking = {"fbclid", "gclid", "mc_cid", "mc_eid"}
    query = tuple(sorted(
        (key, value)
        for key, value in parse_qsl(parsed.query, keep_blank_values=True)
        if not key.lower().startswith("utm_") and key.lower() not in tracking
    ))
    return repr((host, path, query))


def validate() -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []

    for relative in REQUIRED_FILES:
        if not (ROOT / relative).is_file():
            errors.append(f"缺少必要文件：{relative}")

    legacy_logo_dir = ROOT / "assets/images/logos"
    if legacy_logo_dir.exists() and any(legacy_logo_dir.rglob("*")):
        errors.append("旧图标目录 assets/images/logos 仍包含文件")
    if (ROOT / "commit.html").exists():
        errors.append("已停用的 commit.html 仍然存在")

    for relative in MAIN_PAGES:
        page = ROOT / relative
        if not page.is_file():
            continue
        html = page.read_text(encoding="utf-8")
        if not re.search(r'<html\s+[^>]*lang="zh-CN"', html, re.I):
            errors.append(f"{relative} 缺少正确的 lang 属性")
        prefix = "/" if relative == "404.html" else ("../" if relative.startswith("about/") else "./")
        expected_refs = (
            f'{prefix}assets/images/icons/sakura-icon.png',
            f'{prefix}assets/images/icons/favicon-16.png',
            f'{prefix}assets/images/icons/favicon-32.png',
            f'{prefix}assets/images/icons/favicon-48.png',
            f'{prefix}assets/images/favicon.png',
            f'{prefix}assets/images/icons/apple-touch-icon.png',
            f'{prefix}manifest.webmanifest',
        )
        for reference in expected_refs:
            if reference not in html:
                errors.append(f"{relative} 缺少统一图标引用：{reference}")
        if "commit.html" in html or "#friends" in html:
            errors.append(f"{relative} 仍包含已删除功能的链接")
        if relative in {"index.html", "about/index.html"}:
            if "data-runtime-days" not in html:
                errors.append(f"{relative} 缺少网站运行天数")
            if "data-data-updated" not in html:
                errors.append(f"{relative} 缺少导航数据更新日期")
        if re.search(r"<script\b(?![^>]*\bsrc=)[^>]*>[\s\S]*?</script>", html, re.I):
            errors.append(f"{relative} 包含会被 CSP 拦截的内联脚本")
        if re.search(r"\son[a-z]+\s*=", html, re.I):
            errors.append(f"{relative} 包含会被 CSP 拦截的内联事件处理器")
        if re.search(r"\sstyle\s*=", html, re.I):
            errors.append(f"{relative} 包含未审核的内联 style 属性")
        for reference in LOCAL_REF_RE.findall(html):
            if reference.startswith(("http://", "https://", "#", "mailto:", "tel:", "javascript:", "data:")):
                continue
            clean = reference.split("#", 1)[0].split("?", 1)[0]
            if not clean:
                continue
            target = (ROOT / clean.lstrip("/")).resolve() if clean.startswith("/") else (page.parent / clean).resolve()
            if clean.endswith("/"):
                target /= "index.html"
            if not target.exists():
                errors.append(f"{relative} 引用了不存在的本地资源：{reference}")
        for tag in re.findall(r"<(?:script|img|link)\b[^>]+>", html, re.I):
            if re.search(r'(?:src|href)=["\']http://', tag, re.I):
                errors.append(f"{relative} 存在可能导致 Mixed Content 的资源：{tag[:100]}")
        if relative in {"index.html", "about/index.html"} and "analytics.js" not in html:
            errors.append(f"{relative} 缺少匿名访问统计脚本")
        if relative == "404.html" and "analytics.js" in html:
            errors.append("404.html 不应记录访问，避免把机器人探测计入统计")

    index_path = ROOT / "index.html"
    index_html = ""
    if index_path.is_file():
        index_html = index_path.read_text(encoding="utf-8")
        homepage_features = {
            "三档主题按钮": "data-theme-toggle",
            "当前板块链接复制按钮": "复制当前板块链接",
            "无结果重置按钮": "data-reset-filters",
            "脚本异常提示": "data-app-fallback",
            "无脚本提示": "<noscript>",
            "新世界隐藏板块": "data-hidden-section",
            "新世界退出按钮": "data-hidden-section-exit",
            "新世界欢迎词": "欢迎踏入新世界的大门",
        }
        for label, token in homepage_features.items():
            if token not in index_html:
                errors.append(f"index.html 缺少{label}")

    app_path = ROOT / "assets/js/sakura-app.js"
    if app_path.is_file():
        app_text = app_path.read_text(encoding="utf-8")
        app_features = {
            "三档主题逻辑": "preferredThemeMode",
            "共享纯逻辑模块": "window.SAKURA_CORE",
            "当前板块复制反馈": "当前板块链接已复制",
            "搜索高亮逻辑": "appendHighlightedText",
            "匹配板块统计": "matchedCategories",
            "应用就绪状态": 'dataset.appReady = "true"',
            "导航数据更新日期": "latestAddedDate",
            "隐藏板块入口逻辑": "enterHiddenSection",
            "隐藏板块退出逻辑": "exitHiddenSection",
        }
        for label, token in app_features.items():
            if token not in app_text:
                errors.append(f"sakura-app.js 缺少{label}")

    analytics_path = ROOT / "assets/js/analytics.js"
    if analytics_path.is_file():
        analytics_text = analytics_path.read_text(encoding="utf-8")
        analytics_features = {
            "匿名访问接口": "/api/public/visit",
            "匿名访客本地编号": "sakura-anonymous-visitor",
            "页面加载后异步上报": 'window.addEventListener("load"',
            "隐私控制退出": "navigator.globalPrivacyControl",
            "忽略站内来源": "referrer.origin === location.origin",
            "不阻塞页面请求": "keepalive: true",
        }
        for label, token in analytics_features.items():
            if token not in analytics_text:
                errors.append(f"analytics.js 缺少{label}")
        if re.search(r"CF-Connecting-IP|latitude|longitude|userAgent\s*:", analytics_text):
            errors.append("analytics.js 不得采集原始 IP、经纬度或完整 User-Agent")
        removed_tools = (
            "data-export-favorites",
            "data-import-favorites",
            "exportFavoriteData",
            "importFavoriteData",
            "data-view=\"favorites\"",
            "sakura-favorites",
            "favorite-button",
            "favorite-order",
            "issues/new?template=invalid-link.yml",
        )
        for token in removed_tools:
            if token in index_html or token in app_text:
                errors.append(f"仍包含已移除的页面工具：{token}")

    validation_workflow = ROOT / ".github/workflows/site-validation.yml"
    if validation_workflow.is_file():
        workflow_text = validation_workflow.read_text(encoding="utf-8")
        for token in ("push:", "pull_request:", "workflow_dispatch:", "node --test tools/test_frontend.js", "node --test tools/test_worker.js", "python tools/validate_site.py", "python tools/validate_admin.py"):
            if token not in workflow_text:
                errors.append(f"site-validation.yml 缺少配置：{token}")

    headers_path = ROOT / "_headers"
    if headers_path.is_file():
        headers_text = headers_path.read_text(encoding="utf-8")
        if "Content-Security-Policy-Report-Only:" in headers_text:
            errors.append("CSP 仍处于 Report-Only 模式")
        required_csp = (
            "Content-Security-Policy:",
            "default-src 'self'",
            "script-src 'self'",
            "script-src-attr 'none'",
            "style-src-elem 'self'",
            "style-src-attr 'unsafe-inline'",
            "object-src 'none'",
            "frame-ancestors 'none'",
        )
        for token in required_csp:
            if token not in headers_text:
                errors.append(f"_headers 缺少正式 CSP 配置：{token}")
        cache_rules = (
            "/index.html",
            "/assets/js/*",
            "/assets/css/*",
            "/assets/images/*",
            "/assets/fontawesome-5.15.4/*",
            "/admin/*",
            "/api/*",
            "max-age=0, must-revalidate",
            "no-store",
            "max-age=604800",
            "max-age=2592000",
        )
        for token in cache_rules:
            if token not in headers_text:
                errors.append(f"_headers 缺少分层缓存配置：{token}")

    data_path = ROOT / "assets/js/sites-data.js"
    if data_path.is_file():
        data_text = data_path.read_text(encoding="utf-8")
        category_section = data_text.split("sites: [", 1)[0]
        if re.search(r"\bfriends\s*:", data_text):
            errors.append("sites-data.js 仍包含友情链接数据")
        categories = CATEGORY_RE.findall(category_section)
        category_ids: set[str] = set()
        category_names: list[str] = []
        for block in categories:
            category_id = field(block, "id")
            category_name = field(block, "name")
            category_icon = field(block, "icon")
            category_ids.add(category_id)
            category_names.append(category_name.casefold())
            if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", category_id):
                errors.append(f"分类 id 格式无效：{category_id or '空值'}")
            if not category_icon:
                errors.append(f"分类 {category_id or '未知'} 缺少 icon 字段")
            elif not re.fullmatch(r"fa-[a-z0-9-]+", category_icon):
                errors.append(f"分类 {category_id} 的 icon 不是合法 Font Awesome 类名：{category_icon}")
            if category_id == "ios" and category_icon != "fa-mobile-alt":
                errors.append("iOS专区分类必须使用通用手机图标 fa-mobile-alt")
        if len(category_ids) != len(categories):
            errors.append("分类 id 存在重复")
        duplicate_category_names = sorted({name for name in category_names if category_names.count(name) > 1})
        if duplicate_category_names:
            errors.append(f"分类名称重复：{', '.join(duplicate_category_names)}")
        sites = SITE_RE.findall(data_text)
        ids: list[str] = []
        urls: list[str] = []
        normalized_urls: list[str] = []
        names: list[str] = []
        for block in sites:
            values = {name: field(block, name) for name in ("id", "name", "url", "description", "category")}
            for name, value in values.items():
                if not value:
                    identity = values.get("id") or values.get("name") or "未知"
                    errors.append(f"网站数据必填字段为空：{identity} / {name}")
            site_id = values["id"]
            ids.append(site_id)
            urls.append(values["url"])
            names.append(values["name"].casefold())
            if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", site_id):
                errors.append(f"网站 id 格式无效：{site_id or '空值'}")
            try:
                parsed_url = urlsplit(values["url"])
                if parsed_url.scheme not in {"http", "https"} or not parsed_url.hostname:
                    errors.append(f"网站 {site_id} 的 URL 必须是完整 HTTP(S) 地址：{values['url']}")
                elif parsed_url.username or parsed_url.password:
                    errors.append(f"网站 {site_id} 的 URL 不得包含认证信息")
                normalized_urls.append(normalized_url_key(values["url"]))
            except ValueError:
                errors.append(f"网站 {site_id} 的 URL 无法解析：{values['url']}")
            dual_values = {name: field(block, name) for name in ("urlLabel", "secondaryUrl", "secondaryUrlLabel")}
            has_url_label = bool(re.search(r"\burlLabel\s*:", block))
            secondary_fields = {"secondaryUrl", "secondaryUrlLabel"}
            secondary_fields_present = {
                name for name in secondary_fields
                if re.search(rf"\b{re.escape(name)}\s*:", block)
            }
            if not has_url_label and secondary_fields_present:
                errors.append(f"双按钮网站 {site_id} 缺少字段：urlLabel")
            elif has_url_label:
                if not dual_values["urlLabel"]:
                    errors.append(f"双按钮网站 {site_id} 的 urlLabel 不能为空字符串")
                if secondary_fields_present and secondary_fields_present != secondary_fields:
                    missing = sorted(secondary_fields - secondary_fields_present)
                    errors.append(f"双按钮网站 {site_id} 缺少字段：{', '.join(missing)}")
                elif secondary_fields_present:
                    for name in secondary_fields:
                        if not dual_values[name]:
                            errors.append(f"双按钮网站 {site_id} 的 {name} 不能为空字符串")
                secondary_url = dual_values["secondaryUrl"]
                primary_normalized = ""
                secondary_normalized = ""
                if secondary_fields_present == secondary_fields:
                    try:
                        parsed_secondary_url = urlsplit(secondary_url)
                        if parsed_secondary_url.scheme not in {"http", "https"} or not parsed_secondary_url.hostname:
                            errors.append(f"双按钮网站 {site_id} 的 secondaryUrl 必须是完整 HTTP(S) 地址：{secondary_url}")
                        elif parsed_secondary_url.username or parsed_secondary_url.password:
                            errors.append(f"双按钮网站 {site_id} 的 secondaryUrl 不得包含认证信息")
                        urls.append(secondary_url)
                        secondary_normalized = normalized_url_key(secondary_url)
                        normalized_urls.append(secondary_normalized)
                    except ValueError:
                        errors.append(f"双按钮网站 {site_id} 的 secondaryUrl 无法解析：{secondary_url}")
                    try:
                        primary_normalized = normalized_url_key(values["url"])
                    except ValueError:
                        pass
                    if primary_normalized and primary_normalized == secondary_normalized:
                        errors.append(f"双按钮网站 {site_id} 的两个 URL 不得相同")
                    if dual_values["urlLabel"].casefold() == dual_values["secondaryUrlLabel"].casefold():
                        errors.append(f"双按钮网站 {site_id} 的两个按钮名称不得相同")
            if re.search(r"\bicon\s*:", block):
                errors.append(f"网站 {site_id} 不应包含 icon 字段")
            if re.search(r"\brecent\s*:", block):
                errors.append(f"网站 {site_id} 仍使用已停用的 recent 字段")
            added_at = re.search(r'\baddedAt\s*:\s*"([^"]*)"', block)
            if re.search(r"\baddedAt\s*:", block) and not added_at:
                errors.append(f"网站 {site_id} 的 addedAt 必须为 YYYY-MM-DD 字符串")
            elif added_at:
                value = added_at.group(1)
                try:
                    parsed_date = date.fromisoformat(value)
                    if parsed_date.isoformat() != value:
                        raise ValueError
                    if parsed_date > TODAY_IN_CHINA:
                        errors.append(f"网站 {site_id} 的 addedAt 不能晚于今天：{value}")
                except ValueError:
                    errors.append(f"网站 {site_id} 的 addedAt 不是合法 YYYY-MM-DD 日期：{value}")
            for retired_flag in ("featured", "popular"):
                if re.search(rf"\b{retired_flag}\s*:", block):
                    errors.append(f"网站 {site_id} 仍使用已停用的 {retired_flag} 字段")
            keywords_match = re.search(r"\bkeywords\s*:\s*(\[[^\]]*\])", block)
            if not keywords_match:
                errors.append(f"网站 {site_id} 的 keywords 必须为字符串数组")
            else:
                try:
                    keywords = json.loads(keywords_match.group(1))
                    if not isinstance(keywords, list) or not keywords or not all(isinstance(keyword, str) and keyword.strip() for keyword in keywords):
                        raise ValueError
                    normalized_keywords = [keyword.strip() for keyword in keywords]
                    if len(normalized_keywords) != len(set(normalized_keywords)):
                        errors.append(f"网站 {site_id} 的 keywords 存在重复")
                except (json.JSONDecodeError, ValueError):
                    errors.append(f"网站 {site_id} 的 keywords 必须为字符串数组")
            if values["category"] not in category_ids:
                errors.append(f"网站 {site_id} 引用了不存在的分类：{values['category']}")
            if values["url"].startswith("http://"):
                warnings.append(f"网站 {site_id} 仍使用未验证 HTTPS 的导航地址：{values['url']}")

        if re.search(r"\b(?:hiddenSection|hiddenCollections|passphrase)\s*:", data_text):
            errors.append("sites-data.js 不得包含隐藏收藏元数据、暗号或隐藏卡片")

        duplicates = sorted({site_id for site_id in ids if ids.count(site_id) > 1})
        if duplicates:
            errors.append(f"网站 id 重复：{', '.join(duplicates)}")
        duplicate_urls = sorted({url for url in urls if urls.count(url) > 1})
        if duplicate_urls:
            errors.append(f"网站 URL 重复：{', '.join(duplicate_urls)}")
        duplicate_normalized_urls = sorted({url for url in normalized_urls if normalized_urls.count(url) > 1})
        if duplicate_normalized_urls:
            errors.append("网站 URL 规范化后仍存在重复地址")
        duplicate_names = sorted({name for name in names if names.count(name) > 1})
        if duplicate_names:
            errors.append(f"网站名称重复：{', '.join(duplicate_names)}")
        if re.search(r"待添加|TODO|placeholder", data_text, re.I):
            errors.append("网站数据中仍有占位内容")

    app_path = ROOT / "assets/js/sakura-app.js"
    if app_path.is_file():
        app_text = app_path.read_text(encoding="utf-8")
        if "site.icon" in app_text:
            errors.append("sakura-app.js 仍依赖 site.icon")
        card_match = re.search(
            r"function\s+createSiteCard\b[\s\S]*?(?=\n\s*function\s+resetKeyboardSelection\b)",
            app_text,
        )
        if not card_match:
            errors.append("sakura-app.js 缺少网站卡片渲染函数")
        else:
            card_text = card_match.group(0)
            if not re.search(r"categoryMap\.get\(\s*site\.category\s*\)", card_text):
                errors.append("网站卡片未从所属分类读取图标")
            if not re.search(r"\?\.icon\s*\|\|\s*[\"']fa-link[\"']", card_text):
                errors.append("网站卡片缺少本地 fa-link 回退图标")
            if not re.search(r"createElement\(\s*[\"']span[\"']\s*\)", card_text):
                errors.append("网站卡片图标未使用本地容器渲染")
            if re.search(r"createElement\(\s*[\"']img[\"']\s*\)", card_text):
                errors.append("网站卡片仍固定创建图片图标")
        if re.search(r"\bsiteIconPath\b", app_text):
            errors.append("sakura-app.js 仍固定依赖樱花卡片图标")
        if re.search(r"data-friends|data\.friends|setupSubmissionForm|data-submission", app_text):
            errors.append("sakura-app.js 仍包含已删除的提交或友情链接逻辑")
        if "Date.UTC(2026, 6, 12)" not in app_text:
            errors.append("sakura-app.js 缺少 2026-07-12 运行起始日期")

    wrangler_path = ROOT / "wrangler.jsonc"
    if wrangler_path.is_file():
        try:
            wrangler = json.loads(wrangler_path.read_text(encoding="utf-8"))
            assets = wrangler.get("assets")
            if not isinstance(assets, dict):
                errors.append("wrangler.jsonc 缺少 assets 配置")
            else:
                if assets.get("directory") != ".":
                    errors.append("wrangler assets.directory 必须保持为 .")
                if assets.get("not_found_handling") != "404-page":
                    errors.append("wrangler assets.not_found_handling 必须为 404-page")
                if assets.get("binding") != "ASSETS":
                    errors.append("wrangler assets.binding 必须为 ASSETS")
            flags = wrangler.get("compatibility_flags", [])
            if not isinstance(flags, list):
                errors.append("wrangler compatibility_flags 必须为数组")
            elif "nodejs_compat" not in set(map(str, flags)):
                errors.append("Worker 必须启用 nodejs_compat")
            observability = wrangler.get("observability")
            if not isinstance(observability, dict) or observability.get("enabled") is not True:
                errors.append("wrangler.jsonc 必须启用 observability")
            if wrangler.get("main") != "worker/index.mjs":
                errors.append("wrangler Worker main 必须为 worker/index.mjs")
            databases = wrangler.get("d1_databases")
            if not isinstance(databases, list) or not any(
                isinstance(database, dict)
                and database.get("binding") == "DB"
                and database.get("database_name") == "sakura-nav-db"
                and database.get("migrations_dir") == "migrations"
                for database in databases
            ):
                errors.append("wrangler.jsonc 缺少 sakura-nav-db 的 DB 绑定")
        except (json.JSONDecodeError, TypeError) as exc:
            errors.append(f"wrangler.jsonc 无效：{exc}")

    privacy_files = ("index.html", "about/index.html", "README.md", "README-en.md")
    obsolete_privacy_phrases = (
        "无统计追踪",
        "统计追踪脚本",
        "广告和统计追踪",
        "no ads, analytics",
        "no advertising or analytics",
    )
    for relative in privacy_files:
        path = ROOT / relative
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8").lower()
        for phrase in obsolete_privacy_phrases:
            if phrase.lower() in text:
                errors.append(f"{relative} 仍包含不准确的隐私表述：{phrase}")

    for path in ROOT.rglob("*"):
        if not path.is_file() or ".git" in path.parts or "tools" in path.parts or "fontawesome-5.15.4" in path.parts:
            continue
        if path.suffix.lower() not in {".html", ".md", ".js", ".css", ".txt", ".xml", ".webmanifest"}:
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        relative = path.relative_to(ROOT)
        removed_feature_pattern = (
            r"commit\.html|网站提交|友情链接|FRIEND LINKS|data-friends|data\.friends|"
            r"\bfriends\s*:|setupSubmissionForm|data-submission|submission-output|friend-(?:grid|link|icon)"
        )
        if re.search(removed_feature_pattern, text, re.I):
            errors.append(f"仍有已删除的提交或友情链接内容：{relative}")
        if REMOTE_FAVICON_RE.search(text):
            errors.append(f"仍有远程 favicon 依赖：{relative}")
        if re.search(r"assets/images/logos/", text, re.I):
            errors.append(f"仍有旧图标目录引用：{relative}")
        if re.search(r"GitHub Pages|Settings\s*(?:→|->)\s*Pages", text, re.I):
            errors.append(f"仍有失效的 GitHub Pages 说明：{relative}")

    manifest_path = ROOT / "manifest.webmanifest"
    if manifest_path.is_file():
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            expected_manifest_icons = {
                "/assets/images/icons/pwa-192.png",
                "/assets/images/icons/pwa-512.png",
            }
            actual_manifest_icons = {str(icon.get("src", "")) for icon in manifest.get("icons", [])}
            if not expected_manifest_icons.issubset(actual_manifest_icons):
                errors.append("manifest 缺少统一的 192 或 512 像素 PWA 图标")
            for icon in manifest.get("icons", []):
                src = str(icon.get("src", "")).lstrip("/")
                if not src or not (ROOT / src).is_file():
                    errors.append(f"manifest 图标不存在：{src or '空路径'}")
        except (json.JSONDecodeError, TypeError) as exc:
            errors.append(f"manifest.webmanifest 无效：{exc}")

    sitemap_path = ROOT / "sitemap.xml"
    if sitemap_path.is_file():
        try:
            tree = ElementTree.parse(sitemap_path)
            namespace = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
            locations = [node.text or "" for node in tree.findall("s:url/s:loc", namespace)]
            expected = {"https://skrto.top/", "https://skrto.top/about/"}
            missing = expected.difference(locations)
            if missing:
                errors.append(f"sitemap 缺少页面：{', '.join(sorted(missing))}")
            unexpected = {"https://skrto.top/commit.html"}.intersection(locations)
            if unexpected:
                errors.append("sitemap 仍包含已删除的 commit.html")
            for location in locations:
                parsed = urlparse(location)
                relative = parsed.path.lstrip("/")
                local = ROOT / (relative or "index.html")
                if parsed.path.endswith("/") and relative:
                    local /= "index.html"
                if not local.is_file():
                    errors.append(f"sitemap 页面不存在：{location}")
        except ElementTree.ParseError as exc:
            errors.append(f"sitemap.xml 无效：{exc}")

    return errors, warnings


def main() -> int:
    errors, warnings = validate()
    for warning in warnings:
        print(f"WARNING: {warning}")
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        print(f"验证失败：{len(errors)} 个错误，{len(warnings)} 个提示。")
        return 1
    print(f"验证通过：0 个错误，{len(warnings)} 个提示。")
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""Validate SAKURA's static site without third-party packages."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse
from xml.etree import ElementTree


ROOT = Path(__file__).resolve().parents[1]
MAIN_PAGES = ("index.html", "about/index.html", "404.html")
REQUIRED_FILES = (
    *MAIN_PAGES,
    "assets/css/sakura.css",
    "assets/js/sites-data.js",
    "assets/js/sakura-app.js",
    "assets/images/icons/sakura-mark.svg",
    "assets/images/favicon.png",
    "assets/images/og-sakura.png",
    "assets/images/icons/apple-touch-icon.png",
    "assets/images/icons/pwa-192.png",
    "assets/images/icons/pwa-512.png",
    "manifest.webmanifest",
    "robots.txt",
    "sitemap.xml",
    "_headers",
    "wrangler.jsonc",
)
LOCAL_REF_RE = re.compile(r"(?:src|href)\s*=\s*[\"']([^\"']+)[\"']", re.I)
SITE_RE = re.compile(r"\{(?=[^{}]*\bid:\s*\")[^{}]*\burl:\s*\"[^{}]+?\bcategory:\s*\"[^{}]+?\}")
REMOTE_FAVICON_RE = re.compile(
    r"google\.com/s2/favicons|gstatic\.com|https?://[^\s\"']*favicon", re.I
)


def field(block: str, name: str) -> str:
    match = re.search(rf"\b{re.escape(name)}:\s*\"([^\"]*)\"", block)
    return match.group(1).strip() if match else ""


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
            f'{prefix}assets/images/icons/sakura-mark.svg',
            f'{prefix}assets/images/favicon.png',
            f'{prefix}assets/images/icons/apple-touch-icon.png',
            f'{prefix}manifest.webmanifest',
        )
        for reference in expected_refs:
            if reference not in html:
                errors.append(f"{relative} 缺少统一图标引用：{reference}")
        if "commit.html" in html or "#friends" in html:
            errors.append(f"{relative} 仍包含已删除功能的链接")
        if relative in {"index.html", "about/index.html"} and "data-runtime-days" not in html:
            errors.append(f"{relative} 缺少网站运行天数")
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

    data_path = ROOT / "assets/js/sites-data.js"
    if data_path.is_file():
        data_text = data_path.read_text(encoding="utf-8")
        category_section = data_text.split("sites: [", 1)[0]
        if re.search(r"\bfriends\s*:", data_text):
            errors.append("sites-data.js 仍包含友情链接数据")
        category_ids = set(re.findall(r'\bid:\s*"([a-z0-9-]+)"', category_section))
        sites = SITE_RE.findall(data_text)
        ids: list[str] = []
        urls: list[str] = []
        for block in sites:
            values = {name: field(block, name) for name in ("id", "name", "url", "description", "category")}
            for name, value in values.items():
                if not value:
                    identity = values.get("id") or values.get("name") or "未知"
                    errors.append(f"网站数据必填字段为空：{identity} / {name}")
            site_id = values["id"]
            ids.append(site_id)
            urls.append(values["url"])
            if re.search(r"\bicon\s*:", block):
                errors.append(f"网站 {site_id} 不应包含 icon 字段")
            if values["category"] not in category_ids:
                errors.append(f"网站 {site_id} 引用了不存在的分类：{values['category']}")
            if values["url"].startswith("http://"):
                warnings.append(f"网站 {site_id} 仍使用未验证 HTTPS 的导航地址：{values['url']}")

        duplicates = sorted({site_id for site_id in ids if ids.count(site_id) > 1})
        if duplicates:
            errors.append(f"网站 id 重复：{', '.join(duplicates)}")
        duplicate_urls = sorted({url for url in urls if urls.count(url) > 1})
        if duplicate_urls:
            errors.append(f"网站 URL 重复：{', '.join(duplicate_urls)}")
        if re.search(r"待添加|TODO|placeholder", data_text, re.I):
            errors.append("网站数据中仍有占位内容")

    app_path = ROOT / "assets/js/sakura-app.js"
    if app_path.is_file():
        app_text = app_path.read_text(encoding="utf-8")
        if "site.icon" in app_text:
            errors.append("sakura-app.js 仍依赖 site.icon")
        if 'assets/images/icons/sakura-mark.svg' not in app_text:
            errors.append("sakura-app.js 未引用统一樱花图标")
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
            flags = wrangler.get("compatibility_flags", [])
            if not isinstance(flags, list):
                errors.append("wrangler compatibility_flags 必须为数组")
            elif {"nodejs_compat", "nodejs_compat_v2"}.intersection(map(str, flags)):
                errors.append("纯静态站点不应启用 Node.js compatibility flag")
            if "observability" in wrangler:
                errors.append("wrangler.jsonc 不应包含 observability 配置")
            if "main" in wrangler:
                errors.append("纯静态站点不应配置 Worker main 入口")
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

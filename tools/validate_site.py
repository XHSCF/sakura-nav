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
MAIN_PAGES = ("index.html", "about/index.html", "commit.html", "404.html")
REQUIRED_FILES = (
    *MAIN_PAGES,
    "assets/css/sakura.css",
    "assets/js/sites-data.js",
    "assets/js/sakura-app.js",
    "assets/images/favicon.png",
    "assets/images/og-sakura.png",
    "assets/images/icons/apple-touch-icon.png",
    "assets/images/icons/pwa-192.png",
    "assets/images/icons/pwa-512.png",
    "manifest.webmanifest",
    "robots.txt",
    "sitemap.xml",
    "_headers",
)
LOCAL_REF_RE = re.compile(r"(?:src|href)\s*=\s*[\"']([^\"']+)[\"']", re.I)
SITE_RE = re.compile(r"\{(?=[^{}]*\bid:\s*\")[^{}]*\burl:\s*\"[^{}]+?\bcategory:\s*\"[^{}]+?\}")


def field(block: str, name: str) -> str:
    match = re.search(rf"\b{re.escape(name)}:\s*\"([^\"]*)\"", block)
    return match.group(1).strip() if match else ""


def validate() -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []

    for relative in REQUIRED_FILES:
        if not (ROOT / relative).is_file():
            errors.append(f"缺少必要文件：{relative}")

    for relative in MAIN_PAGES:
        page = ROOT / relative
        if not page.is_file():
            continue
        html = page.read_text(encoding="utf-8")
        if not re.search(r'<html\s+[^>]*lang="zh-CN"', html, re.I):
            errors.append(f"{relative} 缺少正确的 lang 属性")
        for reference in LOCAL_REF_RE.findall(html):
            if reference.startswith(("http://", "https://", "#", "mailto:", "tel:", "javascript:", "data:")):
                continue
            clean = reference.split("#", 1)[0].split("?", 1)[0]
            if not clean:
                continue
            target = (page.parent / clean).resolve()
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
        category_ids = set(re.findall(r'\bid:\s*"([a-z0-9-]+)"', category_section))
        sites = SITE_RE.findall(data_text)
        ids: list[str] = []
        urls: list[str] = []
        for block in sites:
            values = {name: field(block, name) for name in ("id", "name", "url", "description", "icon", "category")}
            for name, value in values.items():
                if not value:
                    errors.append(f"网站数据必填字段为空：{values.get('id') or values.get('name') or '未知'} / {name}")
            site_id = values["id"]
            ids.append(site_id)
            urls.append(values["url"])
            if values["category"] not in category_ids:
                errors.append(f"网站 {site_id} 引用了不存在的分类：{values['category']}")
            icon = values["icon"]
            if icon.startswith("http://"):
                errors.append(f"网站 {site_id} 使用 HTTP 图片，可能造成 Mixed Content：{icon}")
            elif icon and not icon.startswith(("https://", "data:")) and not (ROOT / icon).is_file():
                errors.append(f"网站 {site_id} 的本地图标不存在：{icon}")
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

    for path in ROOT.rglob("*"):
        if not path.is_file() or ".git" in path.parts or "tools" in path.parts:
            continue
        if path.suffix.lower() not in {".html", ".md", ".js", ".txt", ".xml"}:
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        if re.search(r"GitHub Pages|Settings\s*(?:→|->)\s*Pages", text, re.I):
            errors.append(f"仍有失效的 GitHub Pages 说明：{path.relative_to(ROOT)}")

    manifest_path = ROOT / "manifest.webmanifest"
    if manifest_path.is_file():
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
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
            expected = {"https://skrto.top/", "https://skrto.top/about/", "https://skrto.top/commit.html"}
            missing = expected.difference(locations)
            if missing:
                errors.append(f"sitemap 缺少页面：{', '.join(sorted(missing))}")
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

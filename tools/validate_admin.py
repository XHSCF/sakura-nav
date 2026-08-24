#!/usr/bin/env python3
"""Validate the D1 schema, seed data, and backend asset structure locally."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    errors: list[str] = []
    migrations = sorted((ROOT / "migrations").glob("*.sql"))
    if not migrations:
        errors.append("没有找到 D1 migration 文件")

    connection = sqlite3.connect(":memory:")
    connection.execute("PRAGMA foreign_keys = ON")
    for migration in migrations:
        try:
            connection.executescript(migration.read_text(encoding="utf-8"))
        except sqlite3.Error as error:
            errors.append(f"Migration {migration.name} 执行失败：{error}")
            break

    if not errors:
        required_tables = {"categories", "sites", "settings", "audit_logs", "login_attempts", "visitor_events"}
        tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        missing = sorted(required_tables - tables)
        if missing:
            errors.append(f"D1 缺少数据表：{', '.join(missing)}")

        category_count = connection.execute("SELECT COUNT(*) FROM categories").fetchone()[0]
        public_count = connection.execute("SELECT COUNT(*) FROM sites WHERE is_hidden=0").fetchone()[0]
        hidden_count = connection.execute("SELECT COUNT(*) FROM sites WHERE is_hidden=1").fetchone()[0]
        if category_count <= 0 or public_count <= 0 or hidden_count <= 0:
            errors.append("D1 种子数据缺少分类、公开卡片或隐藏卡片")

        software_category = connection.execute(
            "SELECT name, icon FROM categories WHERE id = 'software'"
        ).fetchone()
        if software_category != ("PC专区", "fa-desktop"):
            errors.append("D1 的 PC专区必须保留 software ID 并使用 fa-desktop 图标")

        duplicate_ids = connection.execute("SELECT id FROM sites GROUP BY id HAVING COUNT(*)>1").fetchall()
        duplicate_names = connection.execute("SELECT lower(name) FROM sites GROUP BY lower(name) HAVING COUNT(*)>1").fetchall()
        if duplicate_ids:
            errors.append("D1 种子数据存在重复卡片 ID")
        if duplicate_names:
            errors.append("D1 种子数据存在重复卡片名称")

        foreign_key_errors = connection.execute("PRAGMA foreign_key_check").fetchall()
        if foreign_key_errors:
            errors.append("D1 种子数据存在无效分类引用")

        required_settings = {"hidden_id", "hidden_name", "hidden_icon", "hidden_passphrase", "hidden_welcome", "hidden_enabled", "analytics_enabled", "analytics_retention_days"}
        settings = {row[0] for row in connection.execute("SELECT key FROM settings")}
        if required_settings - settings:
            errors.append("D1 缺少新世界或访问统计设置")

        visitor_columns = {row[1] for row in connection.execute("PRAGMA table_info(visitor_events)")}
        required_visitor_columns = {"visitor_hash", "path", "referrer_host", "device_type", "browser", "operating_system", "country_code", "region", "city", "minute_bucket", "occurred_at"}
        if required_visitor_columns - visitor_columns:
            errors.append("D1 访问统计表缺少匿名访问字段")
        if {"ip", "ip_address", "user_agent"} & visitor_columns:
            errors.append("D1 访问统计表不得保存原始 IP 或完整 User-Agent")

        for row in connection.execute("SELECT keywords_json FROM sites"):
            try:
                value = json.loads(row[0])
                if not isinstance(value, list):
                    raise ValueError
            except (json.JSONDecodeError, ValueError, TypeError):
                errors.append("D1 卡片关键词不是有效数组")
                break

    required_files = [
        "worker/index.mjs",
        "admin/index.html",
        "admin/admin.css",
        "admin/admin-core.js",
        "admin/admin.js",
        "assets/js/analytics.js",
        "assets/js/data-loader.js",
        ".dev.vars.example",
        ".assetsignore",
    ]
    for relative in required_files:
        if not (ROOT / relative).is_file():
            errors.append(f"缺少后台文件：{relative}")

    admin_css_path = ROOT / "admin/admin.css"
    if admin_css_path.is_file():
        admin_css = admin_css_path.read_text(encoding="utf-8")
        dialog_layout_rules = {
            "弹窗纵向布局": ".dialog-card { display: flex;",
            "动态视口高度": "calc(100dvh - 30px)",
            "表单控件宽度约束": "min-width: 0; max-width: 100%;",
            "表单滚动区可收缩": ".dialog-scroll { min-height: 0;",
            "禁止横向滚动": "overflow-x: hidden;",
            "表单滚动区触摸滚动": "touch-action: pan-y;",
            "移动端底部安全区": "env(safe-area-inset-bottom)",
            "日期控件宽度外壳": ".date-control { display: block; width: 100%; min-width: 0; max-width: 100%; overflow: hidden;",
            "日期控件内部宽度约束": '.admin-form .date-control input[type="date"]',
            "弹窗细窄滚动条": "scrollbar-width: thin;",
            "背景页面滚动锁定": "body:has(.admin-dialog[open])",
            "显式背景滚动锁定": "html.has-open-dialog, body.has-open-dialog",
            "弹窗只保留内部滚动": ".admin-dialog, .confirm-dialog { max-width: none; overflow: visible;",
        }
        for label, rule in dialog_layout_rules.items():
            if rule not in admin_css:
                errors.append(f"后台卡片编辑弹窗缺少{label}")

    admin_html_path = ROOT / "admin/index.html"
    admin_js_path = ROOT / "admin/admin.js"
    if admin_html_path.is_file() and admin_js_path.is_file():
        admin_html = admin_html_path.read_text(encoding="utf-8")
        admin_js = admin_js_path.read_text(encoding="utf-8")
        interaction_rules = {
            "会话验证加载态": "data-session-loading" in admin_html and 'data-login-page hidden' in admin_html,
            "明暗模式切换": "data-theme-toggle" in admin_html and "function applyAdminTheme(" in admin_js,
            "八套配色选择": "data-color-theme-panel" in admin_html and "themeCore.colorThemes.map" in admin_js,
            "前后台主题设置同步": 'const themeKey = "sakura-theme"' in admin_js and 'const colorThemeKey = "sakura-color-theme"' in admin_js,
            "卡片编辑器内容分区": admin_html.count('class="form-section"') >= 4 and "site-basic-heading" in admin_html,
            "卡片位置标题独立间距": 'class="wide-field radio-field" role="group"' in admin_html and '<fieldset class="wide-field radio-field"' not in admin_html,
            "短ID优先使用网址域名": "adminCore?.preferredSiteId" in admin_js,
            "访问统计管理页面": "data-analytics-content" in admin_html and "function loadAnalytics(" in admin_js,
            "国家与大致地区展示": "data-analytics-locations" in admin_html and "function locationText(" in admin_js,
            "访问统计开关与清空": "data-analytics-enabled" in admin_html and "function clearAnalytics(" in admin_js,
            "弹窗关闭后恢复背景滚动": 'addEventListener("close", syncDialogScrollLock)' in admin_js,
            "未保存状态提示": "data-unsaved-indicator" in admin_html and "function formSnapshot(" in admin_js,
            "关闭弹窗前确认": "function requestDialogClose(" in admin_js,
            "离开页面前确认": 'window.addEventListener("beforeunload"' in admin_js,
            "卡片显示完整性提示": "data-preview-fit-status" in admin_html and "function schedulePreviewFitCheck(" in admin_js,
            "验证完成后再显示后台": "sessionLoading.hidden = true" in admin_js and "await loadData();\n      showApp();" in admin_js,
        }
        for label, present in interaction_rules.items():
            if not present:
                errors.append(f"后台缺少{label}")

    worker_path = ROOT / "worker/index.mjs"
    analytics_path = ROOT / "assets/js/analytics.js"
    if worker_path.is_file() and analytics_path.is_file():
        worker = worker_path.read_text(encoding="utf-8")
        analytics = analytics_path.read_text(encoding="utf-8")
        analytics_rules = {
            "前台匿名访问接口": "/api/public/visit" in worker and "/api/public/visit" in analytics,
            "访问统计后台接口": "/api/admin/analytics" in worker,
            "匿名访客哈希": "sakura-anonymous-visitor|" in worker and "visitor_hash" in worker,
            "Cloudflare 大致位置": "request.cf" in worker and all(field in worker for field in ("countryCode", "region", "city")),
            "不保存原始 IP": "CF-Connecting-IP" not in analytics and "user_agent" not in worker,
            "隐私偏好退出": "navigator.globalPrivacyControl" in analytics and "navigator.doNotTrack" in analytics,
            "过滤常见机器人": "isLikelyBot" in worker,
            "访问记录自动清理": "async scheduled(" in worker and "deleteExpiredVisits" in worker,
        }
        for label, present in analytics_rules.items():
            if not present:
                errors.append(f"访问统计缺少{label}")

    wrangler_path = ROOT / "wrangler.jsonc"
    if wrangler_path.is_file():
        try:
            wrangler = json.loads(wrangler_path.read_text(encoding="utf-8"))
            if not wrangler.get("triggers", {}).get("crons"):
                errors.append("Cloudflare 配置缺少访问记录定时清理触发器")
        except json.JSONDecodeError as error:
            errors.append(f"wrangler.jsonc 不是有效 JSON：{error}")

    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        print(f"后台验证失败：{len(errors)} 个错误。")
        return 1

    print(f"后台验证通过：{category_count} 个分类，{public_count} 张公开卡片，{hidden_count} 张隐藏卡片。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

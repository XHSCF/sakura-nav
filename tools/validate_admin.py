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
        required_tables = {"categories", "sites", "settings", "audit_logs", "login_attempts"}
        tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        missing = sorted(required_tables - tables)
        if missing:
            errors.append(f"D1 缺少数据表：{', '.join(missing)}")

        category_count = connection.execute("SELECT COUNT(*) FROM categories").fetchone()[0]
        public_count = connection.execute("SELECT COUNT(*) FROM sites WHERE is_hidden=0").fetchone()[0]
        hidden_count = connection.execute("SELECT COUNT(*) FROM sites WHERE is_hidden=1").fetchone()[0]
        if category_count <= 0 or public_count <= 0 or hidden_count <= 0:
            errors.append("D1 种子数据缺少分类、公开卡片或隐藏卡片")

        duplicate_ids = connection.execute("SELECT id FROM sites GROUP BY id HAVING COUNT(*)>1").fetchall()
        duplicate_names = connection.execute("SELECT lower(name) FROM sites GROUP BY lower(name) HAVING COUNT(*)>1").fetchall()
        if duplicate_ids:
            errors.append("D1 种子数据存在重复卡片 ID")
        if duplicate_names:
            errors.append("D1 种子数据存在重复卡片名称")

        foreign_key_errors = connection.execute("PRAGMA foreign_key_check").fetchall()
        if foreign_key_errors:
            errors.append("D1 种子数据存在无效分类引用")

        required_settings = {"hidden_id", "hidden_name", "hidden_icon", "hidden_passphrase", "hidden_welcome", "hidden_enabled"}
        settings = {row[0] for row in connection.execute("SELECT key FROM settings")}
        if required_settings - settings:
            errors.append("D1 缺少新世界设置")

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

    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        print(f"后台验证失败：{len(errors)} 个错误。")
        return 1

    print(f"后台验证通过：{category_count} 个分类，{public_count} 张公开卡片，{hidden_count} 张隐藏卡片。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

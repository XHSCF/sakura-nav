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
        "admin/admin.js",
        "assets/js/data-loader.js",
        ".dev.vars.example",
        ".assetsignore",
    ]
    for relative in required_files:
        if not (ROOT / relative).is_file():
            errors.append(f"缺少后台文件：{relative}")

    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        print(f"后台验证失败：{len(errors)} 个错误。")
        return 1

    print(f"后台验证通过：{category_count} 个分类，{public_count} 张公开卡片，{hidden_count} 张隐藏卡片。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

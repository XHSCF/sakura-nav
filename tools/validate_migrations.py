#!/usr/bin/env python3
"""Validate immutable D1 migrations and production-safe incremental behavior."""

from __future__ import annotations

import hashlib
import json
import re
import sqlite3
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "migrations"
CHECKSUMS = MIGRATIONS / "checksums.json"
DESTRUCTIVE_CONTENT = re.compile(
    r"\b(?:DELETE\s+FROM|DROP\s+TABLE(?:\s+IF\s+EXISTS)?)\s+[\"'`\[]?(?:sites|categories)\b",
    re.IGNORECASE,
)
CONTENT_CHANGE = re.compile(
    r"\b(?:INSERT\s+(?:OR\s+\w+\s+)?INTO|UPDATE)\s+[\"'`\[]?(?:sites|categories)\b|\bhidden_(?:id|name|icon|passphrase|welcome|enabled)\b",
    re.IGNORECASE,
)


def sql_without_comments(sql: str) -> str:
    return re.sub(r"/\*.*?\*/|--[^\r\n]*", " ", sql, flags=re.DOTALL)


def apply(connection: sqlite3.Connection, migration: Path) -> None:
    connection.executescript(migration.read_text(encoding="utf-8"))


def main() -> int:
    errors: list[str] = []
    migrations = sorted(MIGRATIONS.glob("[0-9][0-9][0-9][0-9]_*.sql"))
    expected_numbers = list(range(1, len(migrations) + 1))
    actual_numbers = [int(path.name[:4]) for path in migrations]
    if actual_numbers != expected_numbers:
        errors.append(f"Migration 编号必须从 0001 连续递增，当前为：{actual_numbers}")

    try:
        checksums = json.loads(CHECKSUMS.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        checksums = {}
        errors.append(f"无法读取 migration 校验清单：{error}")

    migration_names = {path.name for path in migrations}
    if set(checksums) != migration_names:
        missing = sorted(migration_names - set(checksums))
        extra = sorted(set(checksums) - migration_names)
        errors.append(f"Migration 校验清单不完整（缺少：{missing or '无'}；多余：{extra or '无'}）")
    for migration in migrations:
        digest = hashlib.sha256(migration.read_bytes()).hexdigest()
        if checksums.get(migration.name) != digest:
            errors.append(f"历史 migration 已改变或校验值未登记：{migration.name}")
        sql = sql_without_comments(migration.read_text(encoding="utf-8"))
        number = int(migration.name[:4])
        if number > 2 and DESTRUCTIVE_CONTENT.search(sql):
            errors.append(f"增量 migration 不得删除或移除生产卡片/分类表：{migration.name}")
        if number > 6 and CONTENT_CHANGE.search(sql) and "content_revision" not in sql:
            errors.append(f"内容 migration 必须递增 content_revision：{migration.name}")

    fresh = sqlite3.connect(":memory:")
    fresh.execute("PRAGMA foreign_keys = ON")
    try:
        for migration in migrations:
            apply(fresh, migration)
        foreign_key_errors = fresh.execute("PRAGMA foreign_key_check").fetchall()
        if foreign_key_errors:
            errors.append("全新数据库执行全部 migration 后存在无效外键")
    except sqlite3.Error as error:
        errors.append(f"全新数据库 migration 执行失败：{error}")
    finally:
        fresh.close()

    production = sqlite3.connect(":memory:")
    production.execute("PRAGMA foreign_keys = ON")
    try:
        for migration in migrations[:2]:
            apply(production, migration)
        production.execute(
            "INSERT INTO categories(id, name, icon, sort_order, is_visible) VALUES ('custom-category', '后台自定义分类', 'fa-link', 999, 1)"
        )
        production.execute(
            "INSERT INTO sites(id, name, description, category_id, is_hidden, primary_url, keywords_json, sort_order, status) "
            "VALUES ('custom-production-card', '后台自定义卡片', '不得被增量 migration 删除。', 'custom-category', 0, "
            "'https://example.test/custom', '[]', 0, 'published')"
        )
        production.commit()
        for migration in migrations[2:]:
            apply(production, migration)
        custom = production.execute(
            "SELECT name, primary_url FROM sites WHERE id='custom-production-card'"
        ).fetchone()
        if custom != ("后台自定义卡片", "https://example.test/custom"):
            errors.append("增量 migration 覆盖或删除了后台自定义卡片")
        required_settings = dict(
            production.execute(
                "SELECT key, value FROM settings WHERE key IN ('content_revision', 'audit_retention_days')"
            )
        )
        if required_settings != {"audit_retention_days": "180", "content_revision": "0"}:
            errors.append("安全维护 migration 缺少内容版本或修改记录保留期")

        production.execute("BEGIN")
        production.execute(
            "INSERT OR REPLACE INTO content_revision_guard(id, valid) VALUES "
            "(1, COALESCE((SELECT CASE WHEN CAST(value AS INTEGER)=? THEN 1 ELSE 0 END FROM settings WHERE key='content_revision'), 0))",
            (0,),
        )
        production.execute("UPDATE sites SET description='版本 1' WHERE id='custom-production-card'")
        production.execute(
            "UPDATE settings SET value=CAST(value AS INTEGER)+1 WHERE key='content_revision'"
        )
        production.commit()
        try:
            production.execute("BEGIN")
            production.execute(
                "INSERT OR REPLACE INTO content_revision_guard(id, valid) VALUES "
                "(1, COALESCE((SELECT CASE WHEN CAST(value AS INTEGER)=? THEN 1 ELSE 0 END FROM settings WHERE key='content_revision'), 0))",
                (0,),
            )
            production.execute("UPDATE sites SET description='错误覆盖' WHERE id='custom-production-card'")
            production.commit()
            errors.append("过期内容版本没有触发数据库约束")
        except sqlite3.IntegrityError:
            production.rollback()
        description = production.execute(
            "SELECT description FROM sites WHERE id='custom-production-card'"
        ).fetchone()[0]
        if description != "版本 1":
            errors.append("冲突事务错误地覆盖了后台自定义卡片")
    except sqlite3.Error as error:
        production.rollback()
        errors.append(f"生产增量 migration 模拟失败：{error}")
    finally:
        production.close()

    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        print(f"Migration 验证失败：{len(errors)} 个错误。")
        return 1
    print(f"Migration 验证通过：{len(migrations)} 个文件，增量数据与版本冲突保护正常。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

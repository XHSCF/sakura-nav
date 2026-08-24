# D1 安全维护与恢复

这套流程用于 `sakura-nav-db` 的日常检查、备份、增量 migration 和紧急恢复。它不会自动补记历史 migration，也不会在发现生产卡片可能被初始化 migration 覆盖时继续执行。

## 最常用的操作

在仓库根目录打开 PowerShell。

只查看状态，不修改数据库：

```powershell
powershell -ExecutionPolicy Bypass -File tools\maintain_d1.ps1 -Action Status
```

单独导出完整 SQL 备份：

```powershell
powershell -ExecutionPolicy Bypass -File tools\maintain_d1.ps1 -Action Backup
```

安全执行尚未应用的 migration：

```powershell
powershell -ExecutionPolicy Bypass -File tools\maintain_d1.ps1 -Action Migrate
```

`Migrate` 会依次完成：读取远程 migration 与卡片数量、列出待执行文件、检查初始化风险、为非空数据库自动导出完整 SQL 备份、要求输入 `APPLY`、执行 migration、再次确认没有遗漏。备份只保存在本机 `.d1-backups/`，该目录已被 Git 忽略，里面可能含隐藏卡片与口令，禁止上传、截图或发送给别人。

如果数据库已有卡片，但 `0001` 或 `0002` 显示待执行，脚本会拒绝继续。这通常代表历史 migration 登记缺失，应先人工核查 `d1_migrations`；不要运行初始化文件，也不要让脚本自动补记。

## 后台 JSON 备份

后台“设置与备份”中的导出适合日常内容恢复。选择导入文件并确认后，浏览器会先自动下载当前数据库的 JSON 备份；如果下载失败，导入会取消。JSON 备份不包含访问统计与修改记录。

后台导入会替换分类、卡片和新世界设置，因此仍应确认下载文件已保存后再继续。多标签页同时编辑时，旧页面保存会收到冲突提示，当前表单不会被静默清空。

## 紧急 SQL 恢复

只有后台 JSON 无法恢复或数据库结构损坏时才使用 SQL 恢复：

```powershell
powershell -ExecutionPolicy Bypass -File tools\maintain_d1.ps1 -Action Restore -BackupFile ".d1-backups\sakura-nav-db-日期时间.sql"
```

脚本会先再次备份当前远程数据库，再要求输入 `RESTORE`，然后执行指定 SQL。完成后立即检查 `/admin/` 中的分类、卡片、新世界设置和前台数据。恢复失败时保留刚生成的恢复前备份，不要反复执行同一文件。

## 新增 migration 的维护要求

1. 只新增下一个连续编号的 `.sql`，不得改写已经登记的历史文件。
2. 增量 migration 不得包含 `DELETE FROM sites`、`DELETE FROM categories` 或删除这两张表的语句。
3. 如果 migration 会修改卡片、分类或新世界设置，末尾必须递增 `content_revision`，让已经打开的旧后台页面失效。
4. 把新文件的 SHA-256 登记到 `migrations/checksums.json`。
5. 本地运行：

```powershell
python tools\validate_migrations.py
python tools\validate_admin.py
```

6. 先通过 `maintain_d1.ps1 -Action Migrate` 自动备份并应用兼容的增量 migration，再部署依赖新结构的 Worker。Git 推送和 Cloudflare 自动部署本身不会替你升级 D1。

## 数据保留

- 匿名访问记录默认保留 90 天。
- 后台修改记录默认保留 180 天，页面只读取最近 100 条。
- 后台最多维护 500 张卡片和 50 个分类，单独新增与备份导入使用相同上限。
- Cloudflare Cron 每天同时清理过期访问记录、修改记录和失效的登录限速记录；卡片、分类、设置和备份不受清理任务影响。

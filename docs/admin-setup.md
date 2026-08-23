# SAKURA 管理后台部署说明

管理后台使用 Cloudflare Worker、D1 数据库和 Workers Secrets，不需要购买传统服务器。生产环境中的真实账号、密码和会话密钥不得写入仓库。

## 部署前准备

需要在 Cloudflare 项目中提供以下资源：

- D1 数据库绑定：`DB`
- 静态资源绑定：`ASSETS`（由 `wrangler.jsonc` 配置）
- Secret：`ADMIN_USERNAME`
- Secret：`ADMIN_PASSWORD`
- Secret：`ADMIN_SESSION_SECRET`

`ADMIN_PASSWORD` 至少使用 12 个字符；`ADMIN_SESSION_SECRET` 应使用至少 32 个随机字符，且不要与管理员密码相同。

## 首次部署

在仓库目录运行当前最新版 Wrangler。不要把账号、密码或会话密钥直接写在命令参数、配置文件或 Git 提交中。

```bash
npx wrangler@latest d1 create sakura-nav-db
npx wrangler@latest d1 migrations apply sakura-nav-db --remote
npx wrangler@latest secret put ADMIN_USERNAME
npx wrangler@latest secret put ADMIN_PASSWORD
npx wrangler@latest secret put ADMIN_SESSION_SECRET
npx wrangler@latest deploy
```

如果 `d1 create` 返回数据库 ID，而当前 Wrangler 没有自动把资源写回配置，请将该 ID 填入 `wrangler.jsonc` 对应 D1 项的 `database_id`，再应用 migration。不要填写其他账号的数据库 ID。

通过 Cloudflare Git 集成部署时，也可以在 Cloudflare Dashboard 中创建 D1 数据库并将其绑定为 `DB`，然后在 Worker 的 Variables and Secrets 页面设置三个 Secret。D1 migration 仍必须在首次启用后台前应用一次。

以后仓库新增 migration 时，Git 自动部署不会代替数据库升级。推送新版代码前后，需要再运行一次以下命令；Wrangler 只会应用尚未执行的新 migration：

```bash
npx wrangler@latest d1 migrations apply sakura-nav-db --remote
```

## 本地开发

复制 `.dev.vars.example` 为 `.dev.vars`，仅在未被 Git 跟踪的 `.dev.vars` 中填写本地测试值：

```bash
npx wrangler@latest d1 migrations apply sakura-nav-db --local
npx wrangler@latest dev
```

本地后台地址通常为 `http://localhost:8787/admin/`。`.dev.vars` 已被 `.gitignore` 排除，任何真实密钥都不得提交。

## 后台功能

- `/admin/`：管理员登录与内容管理
- 卡片：新增、编辑、复制、删除、排序、搜索、分类筛选、草稿和发布
- 卡片类型：单按钮、双按钮、普通分类和新世界
- 分类：新增、编辑、显示/隐藏、排序以及空分类删除
- 新世界：名称、图标、口令、欢迎词和启用状态
- 备份：导出或导入完整 JSON 数据
- 修改记录：保留最近的后台操作日志
- 访问统计：按今天、近 7 天、近 30 天或近 90 天查看匿名访客、访问次数、页面、来源、设备、浏览器、系统，以及 Cloudflare 提供的国家、省/州和城市
- 统计控制：可以暂停记录或二次确认后清空全部访问记录；Cloudflare Cron 每天自动删除超过 90 天的数据

访问统计不会保存原始 IP、完整 User-Agent、经纬度、搜索内容或隐藏口令，也不会混入站内跳转来源和常见机器人。前台仅保存一个随机匿名编号，Worker 入库前会将其哈希；启用 Global Privacy Control 或 Do Not Track 的浏览器不会上报访问。访问统计不包含在内容 JSON 备份中，清空后无法从内容备份恢复。

## 数据与回退

- 生产前台优先读取 `/api/public/data` 中的 D1 数据。
- API、数据库或网络暂时不可用时，前台自动使用 `assets/js/sites-data.js` 的随仓库快照，避免公开页面变空。
- `migrations/0002_seed_navigation_data.sql` 由 `tools/generate_d1_seed.js` 从当前快照生成，只用于首次初始化。
- migration 一旦应用到生产环境就不得改写；以后的结构变化应新增 migration，生产内容优先通过后台修改。
- 后台导出的 JSON 是生产数据备份，应妥善保管。备份中可能包含隐藏板块内容和入口口令，不应公开上传。

## 验证

```bash
node --test tools/test_worker.js
python tools/validate_admin.py
python tools/validate_site.py
```

部署前还应执行 `npx wrangler@latest deploy --dry-run`。完成远程 D1 和 Secret 配置后，再登录 `/admin/` 验证添加草稿、预览、发布、删除与备份恢复流程。

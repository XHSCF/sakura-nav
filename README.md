# SAKURA导航

一个个人维护的轻量网址导航与网络收藏站，用于整理常用网站、动漫影视、资源下载、实用工具、iOS 以及其他网络内容。

- 主域名：[https://skrto.top](https://skrto.top)
- 备用域名：[https://www.skrto.top](https://www.skrto.top)
- 仓库：`XHSCF/sakura-nav`
- 部署：GitHub `main` → Cloudflare 自动部署 → `skrto.top` / `www.skrto.top`
- 英文说明：[README-en.md](README-en.md)

## 项目特点

- 原生 HTML、CSS 和 JavaScript 前台，无前端框架
- Cloudflare Worker + D1 中文管理后台，可管理卡片、分类、新世界、草稿、备份和隐私友好的匿名访问统计
- 前台优先读取 D1，API 不可用时自动回退到 `assets/js/sites-data.js`
- 搜索支持名称、描述、URL、分类、keywords、英文缩写和多关键词，并在结果中安全高亮命中词、显示涉及板块数
- 分类与最近收录、最近访问可以组合筛选
- 分类按钮显示站点数量；最近收录显示收录日期，收录 14 天内的网站带有 `NEW` 标记
- 最近访问只保存在当前浏览器，最多记录 12 个不同网站
- 无结果时可一键恢复全部站点；脚本加载失败或禁用 JavaScript 时会显示明确提示
- 主题支持跟随系统、浅色和深色三档，手动选择后会记住设置
- 手机、平板和桌面响应式布局
- 页脚按本地日期显示从 2026-07-12 开始的网站运行天数
- 页脚自动读取网站条目中最新的 `addedAt`，显示“导航数据更新于”日期
- 轻量 PWA 主屏信息，不注册 Service Worker，不做激进页面缓存
- 无广告、无第三方统计脚本、无外部字体或核心 CDN 依赖

## 技术与目录

```text
sakura-nav/
├── index.html                       # 首页
├── about/index.html                 # 关于页面
├── 404.html                         # 自定义 404 页面
├── manifest.webmanifest             # PWA 主屏信息
├── sakura-icon.png                  # 透明樱花品牌图标母版
├── robots.txt                       # 搜索引擎抓取规则
├── sitemap.xml                      # 主要页面地图
├── _headers                         # Cloudflare 静态安全响应头
├── wrangler.jsonc                   # Cloudflare Worker、静态资源与 D1 配置
├── admin/                           # 中文管理后台
├── worker/index.mjs                 # API、鉴权与 D1 业务逻辑
├── migrations/                      # D1 数据库结构与初始数据
├── README.md / README-en.md          # 中英文说明
├── assets/
│   ├── css/sakura.css               # 全站样式
│   ├── js/sites-data.js             # 分类与网站数据
│   ├── js/data-loader.js             # D1 数据优先与静态快照回退
│   ├── js/analytics.js               # 匿名访问上报（尊重 GPC 与 DNT）
│   ├── js/theme-init.js              # 首屏主题初始化
│   ├── js/app-guard.js                # 脚本加载失败时的无依赖反馈
│   ├── js/sakura-core.js              # 可测试的搜索、主题和本地数据纯逻辑
│   ├── js/sakura-app.js              # 搜索、筛选、最近访问、主题和全局界面逻辑
│   ├── images/                       # 樱花品牌图标、favicon、分享图和 PWA 图标
│   └── fontawesome-5.15.4/           # 本地图标字体及许可证
├── .github/workflows/                # 自动验证与手动链接检查
├── tools/test_frontend.js             # Node.js 原生前端回归测试
├── tools/test_worker.js               # Worker、鉴权与 API 回归测试
├── tools/validate_admin.py            # D1 migration 与后台结构验证
└── tools/validate_site.py             # 无第三方依赖的站点检查工具
```

根目录不再包含 `CNAME`。Cloudflare 的自定义域名与 DNS 绑定在 Cloudflare 控制台中管理，不由 GitHub 仓库文件控制。

## 网站数据

生产分类和网站保存在 Cloudflare D1，并通过 `/admin/` 管理。以下文件是 API 不可用时的公开页面快照：

```text
assets/js/sites-data.js
```

每个网站必须拥有稳定且唯一的 `id`。`id` 用于保存最近访问记录，不能使用数组序号，也不应随意修改。

```js
{
  id: "example",
  name: "网站名称",
  url: "https://example.com/",
  description: "一句简短描述",
  category: "tools",
  keywords: ["缩写", "别名", "用途"],
  addedAt: "2026-07-13"
}
```

可选字段：

- `addedAt`：收录日期，使用合法的 `YYYY-MM-DD`；“最近收录”按日期倒序显示最多 12 条
- `urlLabel`：填写后把单按钮卡片改为双按钮卡片，`url` 是第一个按钮地址；如果同时填写 `secondaryUrl` 和 `secondaryUrlLabel`，它们构成第二个按钮，否则第二个按钮自动显示“暂无”并指向站内 `404.html`

网站只有单按钮和双按钮两种卡片。没有 `urlLabel` 的网站自动显示一个“点击进入”按钮，按钮使用 `url`；所有卡片主体均不可点击，只能通过卡片内按钮打开链接。普通网站按钮点击会记录最近访问，隐藏板块按钮不会写入最近访问。

旧的 `featured` 与 `popular` 视图已经停用，网站数据不再使用这两个字段。

新增网站不需要、也不允许填写 `icon` 字段。每个网站卡片自动继承所属分类的本地 Font Awesome 图标，同一分类下的卡片使用相同图标；网站不会请求 Google favicon、目标网站 favicon 或其他远程图标服务。

唯一品牌图标母版：

```text
sakura-icon.png
```

母版使用透明背景并保留安全留白；顶部与页脚使用 `assets/images/icons/sakura-icon.png`，浏览器使用 16/32/48/64 PNG favicon，Apple Touch Icon、PWA 192/512 图标与分享资源也从同一母版导出。修改品牌图标时，只替换母版并重新导出这些兼容资源，不要在网站数据中恢复独立图标字段。

## 浏览器本地数据

网站不会上传主题偏好或访问记录：

- `sakura-theme`：手动选择的浅色或深色主题；不存在时代表跟随系统
- `sakura-recent-visits`：最多 12 条不同网站的 ID 与访问时间

损坏或过期的最近访问数据会被安全忽略；网站从数据文件删除后，对应的无效记录也会被自动过滤。搜索和筛选条件只写入当前地址栏，不写入 localStorage，正常筛选操作不会发起额外网络请求；刷新或打开带参数的网址时，查询参数会随正常页面请求发送给托管服务。

## 本地预览与验证

在仓库根目录运行：

```bash
python tools/validate_site.py
node --test tools/test_frontend.js
python -m http.server 8000
```

然后访问 `http://localhost:8000`。验证脚本不需要第三方 Python 包，会检查主要页面、静态资源、网站 ID、分类、图标、日期、字段、URL 规范化重复、CSP 兼容性、Mixed Content、缓存规则和 sitemap；Node.js 原生测试覆盖主题切换、搜索匹配、安全高亮、`NEW` 标记边界、卡片交互和最近访问清理。

## 自动站点验证

`.github/workflows/site-validation.yml` 会在 `main` 推送、面向 `main` 的 Pull Request 以及手动触发时运行 Python 与 JavaScript 语法检查、前端回归测试和 `tools/validate_site.py`。该工作流只读取仓库，不修改网站数据，也不替代下面的人工链接健康检查。

## 链接健康检查

链接检查工作流位于：

```text
.github/workflows/link-health.yml
```

该工作流只支持手动运行，不会定时自动执行。在 GitHub 网页中依次选择：

```text
仓库
→ Actions
→ Navigation link health report
→ Run workflow
→ 选择 main
→ Run workflow
```

运行完成后，可在 Summary 中直接查看报告，也可在 Artifacts 中下载 `navigation-link-health-report`；Artifact 保存 30 天。

本地运行：

```bash
python tools/check_links.py
python tools/check_links.py --output link-health-report.md
```

报告不会自动删除网站、替换网址、提交修改或创建 Pull Request。403、TLS、Cloudflare 验证、超时等结果都需要人工确认。

## Cloudflare 自动部署

当前仓库通过 Cloudflare Workers & Pages 的 Git 集成发布。`wrangler.jsonc` 同时配置静态资源、`worker/index.mjs` 和 D1 数据库绑定；首次启用后台前还要应用 D1 migration 并设置管理员 Secrets，完整步骤见 [docs/admin-setup.md](docs/admin-setup.md)。

部署链路：

```text
GitHub main 分支
→ Cloudflare 自动构建和部署
→ https://skrto.top / https://www.skrto.top
```

正常发布：

1. 在本地完成修改并运行 `python tools/validate_site.py`、`python tools/validate_admin.py` 和 Node 回归测试。
2. 提交并推送到 GitHub `main`。
3. Cloudflare 自动收到推送并开始生产部署。

查看状态：打开 Cloudflare Dashboard → `Workers & Pages` → 选择连接 `XHSCF/sakura-nav` 的项目 → `Deployments`。构建日志、当前生产版本和回滚入口都在这里。

需要在不改文件的情况下重新部署时，可推送一个空提交：

```bash
git commit --allow-empty -m "Trigger Cloudflare production deployment"
git push origin main
```

自定义域名、DNS 记录、`skrto.top` 与 `www.skrto.top` 的绑定均在 Cloudflare 控制台管理，不在本仓库中管理。不要为了普通代码发布修改 Cloudflare DNS。

`_headers` 同时适用于 Cloudflare Pages 和 Workers Static Assets，为静态响应添加 `nosniff`、严格来源策略、权限策略、防嵌入响应头和正式生效的 CSP。脚本、样式、字体和图片默认只允许本站本地资源；仅为脚本动态计算滚动偏移保留受限的 `style-src-attr` 支持。

缓存采用分层策略：HTML、CSS 和 JavaScript 每次重新验证，manifest 缓存 1 小时，图片缓存 7 天，本地图标字体缓存 30 天。当前资源文件名没有内容哈希，因此不使用 `immutable` 或一年强缓存，避免部署后长期命中旧版脚本和样式。

## PWA、SEO 与缓存

- `manifest.webmanifest` 提供 iPhone、iPad 和 Android 主屏信息。
- PWA 图标由仓库现有 SAKURA 樱花标志导出。
- Open Graph 与 Twitter Card 使用由品牌母版导出的 512×512 方形图标，并声明为适配方形资源的 `summary` 卡片。
- `robots.txt` 与 `sitemap.xml` 使用主域名 `https://skrto.top/`。
- 项目故意不注册 Service Worker，避免代码更新后长期显示旧页面。
- 桌面端精确指针设备使用轻量卡片入场动画，`prefers-reduced-motion: reduce` 下自动关闭。

## 内容与隐私说明

SAKURA导航只提供外部网站入口，不托管第三方内容。链接状态、内容和服务条款由对应网站负责。本站为个人维护项目，不含广告和第三方统计脚本，不使用 Cookie，也不会上传最近访问记录。

第三方图标和字体仍受各自许可证约束，Font Awesome 许可证保存在仓库中。

## 常见问题

### 修改数据后搜索不到

先运行验证脚本，确认 `id` 唯一、分类存在、字段和逗号完整。然后通过本地 HTTP 服务检查浏览器控制台。

### 推送后网站没有更新

先到 Cloudflare 的 `Deployments` 检查生产部署是否成功；必要时推送空提交重新触发。不要通过添加 Service Worker 或修改 DNS 来解决普通缓存问题。

### 如何修改全站品牌图标

替换根目录的 `sakura-icon.png`，再从该透明 PNG 母版重新导出页面品牌图、16/32/48/64 favicon、180/192/512 平台图标和分享图，最后运行验证脚本。不要为单个网站下载或填写独立图标。

# SAKURA手记

一个个人维护的轻量网址导航与网络收藏站，用于整理常用网站、动漫影视、资源下载、实用工具、iOS 以及其他网络内容。

- 主域名：[https://skrto.top](https://skrto.top)
- 备用域名：[https://www.skrto.top](https://www.skrto.top)
- 仓库：`XHSCF/sakura-nav`
- 部署：GitHub `main` → Cloudflare 自动部署 → `skrto.top` / `www.skrto.top`
- 英文说明：[README-en.md](README-en.md)

## 项目特点

- 纯静态 HTML、CSS 和原生 JavaScript，无框架、无构建步骤
- 无后端、数据库、账号系统或服务端接口
- 分类与网站集中保存在 `assets/js/sites-data.js`
- 搜索支持名称、描述、URL、分类、keywords、英文缩写和多关键词
- 分类与站长推荐、最近收录、热门网站、我的常用、最近访问可以组合筛选
- 我的常用和最近访问只保存在当前浏览器的 `localStorage`
- 默认跟随系统主题，手动选择后会记住设置
- 手机、平板和桌面响应式布局
- 页脚按本地日期显示从 2026-07-12 开始的网站运行天数
- 轻量 PWA 主屏信息，不注册 Service Worker，不做激进页面缓存
- 无广告、无第三方统计脚本、无外部字体或核心 CDN 依赖

## 技术与目录

```text
sakura-nav/
├── index.html                       # 首页
├── about/index.html                 # 关于页面
├── 404.html                         # 自定义 404 页面
├── manifest.webmanifest             # PWA 主屏信息
├── robots.txt                       # 搜索引擎抓取规则
├── sitemap.xml                      # 主要页面地图
├── _headers                         # Cloudflare 静态安全响应头
├── wrangler.jsonc                   # Cloudflare Workers 静态资源配置
├── README.md / README-en.md          # 中英文说明
├── assets/
│   ├── css/sakura.css               # 全站样式
│   ├── js/sites-data.js             # 分类与网站数据
│   ├── js/sakura-app.js              # 搜索、筛选、收藏、主题和全局界面逻辑
│   ├── images/                       # 统一樱花图标、favicon、分享图和 PWA 图标
│   └── fontawesome-5.15.4/           # 本地图标字体及许可证
└── tools/validate_site.py            # 无第三方依赖的站点检查工具
```

根目录不再包含 `CNAME`。Cloudflare 的自定义域名与 DNS 绑定在 Cloudflare 控制台中管理，不由 GitHub 仓库文件控制。

## 网站数据

分类和网站统一位于：

```text
assets/js/sites-data.js
```

每个网站必须拥有稳定且唯一的 `id`。`id` 用于保存用户的收藏和最近访问记录，不能使用数组序号，也不应在没有迁移方案时随意修改。

```js
{
  id: "example",
  name: "网站名称",
  url: "https://example.com/",
  description: "一句简短描述",
  category: "tools",
  keywords: ["缩写", "别名", "用途"],
  featured: true,
  addedAt: "2026-07-13"
}
```

可选标记：

- `featured`：站长推荐
- `addedAt`：收录日期，使用合法的 `YYYY-MM-DD`；“最近收录”按日期倒序显示最多 12 条
- `popular`：人工整理的热门视图，不代表真实流量排名

新增网站不需要、也不允许填写 `icon` 字段。所有网站卡片自动使用统一的本地樱花图标，不会请求 Google favicon、目标网站 favicon 或其他远程图标服务。

唯一品牌矢量源文件：

```text
assets/images/icons/sakura-mark.svg
```

浏览器 SVG favicon 和页面品牌标志直接引用该文件；`favicon.png`、`apple-touch-icon.png`、`pwa-192.png` 与 `pwa-512.png` 均从它本地导出。修改品牌图标时，只需替换这个 SVG，并重新导出上述兼容资源，不要在网站数据中恢复独立图标字段。

## 浏览器本地数据

网站不会上传收藏或访问记录：

- `sakura-theme`：浅色/深色主题
- `sakura-favorites`：用户收藏的网站 ID 数组
- `sakura-recent-visits`：最多 12 条不同网站的 ID 与访问时间

损坏或过期的数据会被安全忽略；网站从数据文件删除后，对应的无效记录也会被自动过滤。搜索条件只会写入当前页面网址，不会上传或写入 localStorage。

## 本地预览与验证

在仓库根目录运行：

```bash
python tools/validate_site.py
python -m http.server 8000
```

然后访问 `http://localhost:8000`。验证脚本不需要安装第三方 Python 包，会检查主要页面、静态资源、网站 ID、分类、图标、占位内容、旧部署说明、Mixed Content 和 sitemap。

## Cloudflare 自动部署

当前仓库通过 Cloudflare Workers & Pages 的 Git 集成发布静态内容。`wrangler.jsonc` 将仓库根目录配置为静态资源目录；项目没有 Pages Functions、Worker 业务源码或构建依赖。

部署链路：

```text
GitHub main 分支
→ Cloudflare 自动构建和部署
→ https://skrto.top / https://www.skrto.top
```

正常发布：

1. 在本地完成修改并运行 `python tools/validate_site.py`。
2. 提交并推送到 GitHub `main`。
3. Cloudflare 自动收到推送并开始生产部署。

查看状态：打开 Cloudflare Dashboard → `Workers & Pages` → 选择连接 `XHSCF/sakura-nav` 的项目 → `Deployments`。构建日志、当前生产版本和回滚入口都在这里。

需要在不改文件的情况下重新部署时，可推送一个空提交：

```bash
git commit --allow-empty -m "Trigger Cloudflare production deployment"
git push origin main
```

自定义域名、DNS 记录、`skrto.top` 与 `www.skrto.top` 的绑定均在 Cloudflare 控制台管理，不在本仓库中管理。不要为了普通代码发布修改 Cloudflare DNS。

`_headers` 同时适用于 Cloudflare Pages 和 Workers Static Assets，为静态响应添加 `nosniff`、严格来源策略、权限策略和防嵌入响应头。项目没有启用严格 CSP，以避免误拦截现有站点图标和脚本。

## PWA、SEO 与缓存

- `manifest.webmanifest` 提供 iPhone、iPad 和 Android 主屏信息。
- PWA 图标由仓库现有 SAKURA 樱花标志导出。
- `assets/images/og-sakura.png` 是 1200×630 分享图。
- `robots.txt` 与 `sitemap.xml` 使用主域名 `https://skrto.top/`。
- 项目故意不注册 Service Worker，避免代码更新后长期显示旧页面。

## 内容与隐私说明

SAKURA手记只提供外部网站入口，不托管第三方内容。链接状态、内容和服务条款由对应网站负责。本站为个人维护项目，不含广告和第三方统计脚本，不使用 Cookie，也不会上传本地收藏或最近访问。

第三方图标和字体仍受各自许可证约束，Font Awesome 许可证保存在仓库中。

## 常见问题

### 修改数据后搜索不到

先运行验证脚本，确认 `id` 唯一、分类存在、字段和逗号完整。然后通过本地 HTTP 服务检查浏览器控制台。

### 推送后网站没有更新

先到 Cloudflare 的 `Deployments` 检查生产部署是否成功；必要时推送空提交重新触发。不要通过添加 Service Worker 或修改 DNS 来解决普通缓存问题。

### 如何修改全站品牌图标

替换 `assets/images/icons/sakura-mark.svg`，再从该 SVG 重新导出 favicon 和 180/192/512 PNG，最后运行验证脚本。不要为单个网站下载或填写独立图标。

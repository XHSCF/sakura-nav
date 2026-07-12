# SAKURA手记

一个个人维护的轻量网址导航站，用于整理常用网站、动漫影视、资源下载、实用工具、iOS 以及其他网络内容。

- 在线地址：[https://skrto.top](https://skrto.top)
- 仓库：`XHSCF/sakura-nav`
- 部署方式：GitHub Pages
- 英文说明：[README-en.md](README-en.md)

## 项目特点

- 纯静态 HTML、CSS、JavaScript，不需要构建或后端
- 网站数据集中管理，新增网站不必修改页面结构
- 网站名称、描述、URL 和分类即时搜索
- 分类筛选可与搜索组合使用
- 常用推荐、最近收录和热门网站视图
- 默认跟随系统主题，手动选择后保存在 `localStorage`
- 手机、平板和电脑响应式布局
- 键盘快捷键、焦点样式和减少动画支持
- 无广告、无统计追踪、无外部 API 核心依赖

## 页面截图

仓库暂未维护固定截图。请直接访问 [skrto.top](https://skrto.top) 查看当前版本，避免文档截图与线上界面不同步。

## 技术栈

- HTML5
- CSS3
- 原生 JavaScript
- Font Awesome 5.15.4（本地资源）
- GitHub Pages

项目没有 `package.json`、Node.js 依赖或构建步骤。

## 目录结构

```text
sakura-nav/
├── index.html                    # 首页骨架
├── commit.html                   # 网站收录建议页面
├── 404.html                      # GitHub Pages 404 页面
├── CNAME                         # 自定义域名，保持 skrto.top
├── README.md                     # 中文项目说明
├── README-en.md                  # 英文项目说明
├── about/
│   └── index.html                # 关于页面
└── assets/
    ├── css/
    │   └── sakura.css            # 全站共享样式
    ├── js/
    │   ├── sites-data.js         # 分类、网站与友情链接数据
    │   └── sakura-app.js         # 搜索、筛选、主题与表单逻辑
    ├── images/
    │   └── logos/                # 网站图标与默认图标
    └── fontawesome-5.15.4/       # 本地图标库及其许可证
```

仓库只保留当前网站实际引用的图标、字体和页面资源；旧模板依赖、未引用图标、开发源文件及宣传素材均未迁移。

## 网站数据存放位置

分类、网站和友情链接统一保存在：

```text
assets/js/sites-data.js
```

数据通过 `window.SAKURA_DATA` 提供给首页，保持 GitHub Pages 和普通本地静态服务器兼容，不需要额外请求 JSON 文件。

## 新增一个网站

打开 `assets/js/sites-data.js`，在 `sites` 数组中增加一项：

```js
{
  name: "网站名称",
  url: "https://example.com/",
  description: "一句简短描述",
  icon: "assets/images/logos/example.png",
  category: "tools"
}
```

可选标记：

- `featured: true`：显示在“常用推荐”
- `recent: true`：显示在“最近收录”
- `popular: true`：显示在“热门网站”

这些视图是人工整理标签，不代表访问量统计或公开排行。

## 修改分类

分类也位于 `assets/js/sites-data.js` 的 `categories` 数组：

```js
{ id: "tools", name: "工具相关", icon: "fa-tools" }
```

注意：

1. `id` 应使用简短、稳定的英文标识。
2. 网站的 `category` 必须与分类 `id` 完全一致。
3. `icon` 使用 Font Awesome 5 的图标类名。

## 更换网站图标

1. 将图标放入 `assets/images/logos/`。
2. 推荐使用正方形 PNG、WebP 或 SVG。
3. 修改网站条目的 `icon` 路径。
4. 图标加载失败时，页面自动回退到 `assets/images/logos/sakura-default.svg`。

也可以使用远程 favicon，但本地图标通常更稳定、更利于控制加载体验。

## 本地预览

项目应通过 HTTP 静态服务器预览，不建议直接双击 HTML：

```bash
# Python 3
python -m http.server 8000

# 然后访问
# http://localhost:8000
```

如果已安装其他静态服务器，也可以直接把仓库根目录作为站点目录。

## GitHub Pages 部署

1. 将修改提交并推送到 `main`。
2. 打开仓库 `Settings → Pages`。
3. 选择从分支部署。
4. 分支选择 `main`，目录选择 `/ (root)`。
5. 等待 Pages 发布完成。

本项目没有构建输出目录，GitHub Pages 直接发布仓库中的静态文件。

## CNAME 与自定义域名

根目录的 `CNAME` 内容必须保持：

```text
skrto.top
```

不要删除、改名或在部署脚本中覆盖此文件，否则 GitHub Pages 的自定义域名可能失效。修改 DNS 前请先确认当前域名解析和 Pages 设置。

## 深色模式

- 初次访问默认跟随操作系统主题。
- 点击导航栏主题按钮后，选择写入浏览器 `localStorage`。
- 使用的键名为 `sakura-theme`，值为 `light` 或 `dark`。
- 本站不使用主题 Cookie。

## 网站提交页面

`commit.html` 是诚实的静态建议整理工具：

- 在浏览器中校验网站名称、URL、分类和描述
- 生成可以复制的 GitHub Issue 文本
- 不自动发送、不上传、不保存表单内容
- 不要求填写邮箱或联系方式

## 常见问题

### 修改数据后首页没有变化

确认语法没有遗漏逗号或引号，然后使用 `Ctrl + F5` 强制刷新。GitHub Pages 发布可能需要等待数分钟。

### 网站图标显示为默认图标

远程 favicon 可能禁止跨站加载或已经失效。将图标下载到 `assets/images/logos/` 并改用本地路径即可。

### 搜索不到某个网站

搜索范围包括网站名称、描述、URL 和分类。确认网站条目位于 `sites` 数组，并且分类 ID 存在。

### 直接双击 index.html 是否可用

主要页面可以打开，但建议使用本地 HTTP 服务器，以获得与 GitHub Pages 更一致的路径和安全行为。

## 更新说明

### 2026-07

- 完成 SAKURA手记全站现代化重构
- 将导航数据迁移到独立 JavaScript 文件
- 重写首页搜索、分类、推荐视图和主题逻辑
- 统一 about、404 与网站提交页面设计
- 清理旧模板品牌和无关第三方运行脚本
- 更新 SEO、无障碍支持和中英文文档

## 学习和使用声明

本项目用于个人学习、整理与日常使用。本站只提供外部网站入口，不存储第三方网站内容，也不对外部网站的可用性、安全性或内容负责。使用任何外部资源时，请遵守对应网站的服务条款及所在地法律法规。

仓库中的第三方资源继续遵循各自许可证。Font Awesome 的许可证文件保留在 `assets/fontawesome-5.15.4/LICENSE.txt`。

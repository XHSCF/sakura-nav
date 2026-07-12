# SAKURA Notes

SAKURA Notes is a lightweight personal start page for frequently used websites, video and anime resources, downloads, utilities, iOS links, and other web content.

- Primary domain: [https://skrto.top](https://skrto.top)
- Alternate domain: [https://www.skrto.top](https://www.skrto.top)
- Repository: `XHSCF/sakura-nav`
- Deployment: GitHub `main` → automatic Cloudflare deployment → both domains
- Chinese documentation: [README.md](README.md)

## Features

- Fully static HTML, CSS, and vanilla JavaScript
- No backend, database, account system, build step, or package dependency
- Centralized categories and websites in `assets/js/sites-data.js`
- Search by name, description, URL, category, keywords, abbreviations, and multiple terms
- Combined category and curated-view filters
- Browser-only favorites and recent visits with defensive localStorage parsing
- System-aware light/dark theme and responsive mobile, tablet, and desktop layouts
- Local-date runtime counter starting on July 12, 2026
- Lightweight install metadata without a Service Worker or aggressive page cache
- No ads, analytics, online fonts, or required third-party CDN

## Core structure

```text
index.html                         Home page
about/index.html                   About page
404.html                           Custom error page
manifest.webmanifest               PWA install metadata
robots.txt                         Crawler rules
sitemap.xml                        Canonical public pages
_headers                           Cloudflare static security headers
wrangler.jsonc                     Cloudflare Workers static-assets configuration
assets/css/sakura.css              Shared design system
assets/js/sites-data.js            Categories and websites
assets/js/sakura-app.js             Search, filters, favorites, visits, theme, and global UI logic
assets/images/                      Unified SAKURA mark, favicons, social image, and PWA icons
tools/validate_site.py              Dependency-free repository validator
```

There is no root `CNAME` file. Custom domains and DNS bindings are managed in the Cloudflare dashboard, not in this Git repository.

## Website data

Every site in `assets/js/sites-data.js` has a stable unique `id`. Favorites and recent visits use this ID, so do not replace it with an array index or change it casually. A new entry only needs `id`, `name`, `url`, `description`, `category`, `keywords`, and optional curated flags:

```js
{
  id: "example",
  name: "Example",
  url: "https://example.com/",
  description: "A short description",
  category: "tools",
  keywords: ["example"]
}
```

Optional flags include `featured`, `recent`, and `popular`. These labels are manually curated and do not represent measured traffic statistics.

Do not add an `icon` field and do not use Google favicon, destination-site favicons, or any remote icon service. Every website card automatically uses the single local vector source:

```text
assets/images/icons/sakura-mark.svg
```

The SVG favicon and brand marks reference this file directly. `favicon.png`, `apple-touch-icon.png`, `pwa-192.png`, and `pwa-512.png` are locally derived from it. To change the brand icon, replace the SVG and re-export those PNG resources; do not restore per-site icons.

## Browser-only data

- `sakura-theme`: saved theme
- `sakura-favorites`: favorite site IDs
- `sakura-recent-visits`: up to 12 unique site IDs and timestamps

Malformed, stale, or unavailable localStorage data is ignored safely. Search queries are not stored, and no local data is uploaded.

## Local preview and validation

Run from the repository root:

```bash
python tools/validate_site.py
python -m http.server 8000
```

Open `http://localhost:8000`. The validator checks pages, local references, IDs, categories, icons, placeholders, obsolete deployment wording, mixed content, and sitemap targets without third-party packages.

## Cloudflare deployment

This repository is connected through Cloudflare Workers & Pages Git integration. `wrangler.jsonc` configures the repository root as the static-assets directory; there are no Pages Functions, application Worker source files, or build dependencies.

```text
GitHub main
→ automatic Cloudflare build and production deployment
→ https://skrto.top and https://www.skrto.top
```

Pushing to `main` starts a deployment automatically. To inspect it, open Cloudflare Dashboard → `Workers & Pages` → the project connected to `XHSCF/sakura-nav` → `Deployments`.

Trigger a fresh deployment without changing files:

```bash
git commit --allow-empty -m "Trigger Cloudflare production deployment"
git push origin main
```

Custom domains, DNS records, and host bindings live in Cloudflare, not in the repository. Routine releases must not change DNS.

The root `_headers` file is supported by both Cloudflare Pages and Workers Static Assets. It adds MIME sniffing protection, a strict referrer policy, a browser permissions policy, and frame protection. A strict CSP is intentionally not enabled yet.

## PWA and SEO

The manifest and local icons improve iPhone, iPad, and Android home-screen use. No Service Worker is registered, preventing stale application-shell caching. The repository also includes a 1200×630 Open Graph image, `robots.txt`, and `sitemap.xml` using the primary canonical host.

## Privacy and content notice

SAKURA Notes only links to external websites and does not host their content. Each destination is responsible for its availability, content, and terms. This personal project has no advertising or analytics, uses no cookies, and does not transmit favorites or visit history.

Third-party assets remain subject to their licenses, including the Font Awesome license stored in the repository.

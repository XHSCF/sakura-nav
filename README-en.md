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
- Search by name, description, URL, category, keywords, abbreviations, and multiple terms, with safe match highlighting and a matched-category count
- Combined category filters with recent entries, favorites, and recent visits
- Category buttons show site totals; the recent view shows collection dates, and sites added in the last 14 days receive a `NEW` badge
- Browser-only favorites and recent visits, with manual ordering in the favorites view
- One-click recovery from empty results plus explicit feedback when JavaScript is disabled or application scripts fail to load
- Three theme modes: system, light, and dark, plus responsive mobile, tablet, and desktop layouts
- Local-date runtime counter starting on July 12, 2026
- The footer derives its navigation-data update date from the newest valid site `addedAt` value
- Lightweight install metadata without a Service Worker or aggressive page cache
- No ads, third-party analytics scripts, online fonts, or required third-party CDN

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
assets/js/theme-init.js            Initial theme selection before first paint
assets/js/app-guard.js              Dependency-free script-load failure feedback
assets/js/sakura-core.js            Testable search, theme, and local-data helpers
assets/js/sakura-app.js             Search, filters, favorites, visits, theme, and global UI logic
assets/images/                      SAKURA brand mark, favicons, social image, and PWA icons
.github/workflows/                 Automated validation and manual link checks
tools/test_frontend.js              Dependency-free Node.js frontend regression tests
tools/validate_site.py              Dependency-free repository validator
```

There is no root `CNAME` file. Custom domains and DNS bindings are managed in the Cloudflare dashboard, not in this Git repository.

## Website data

Every site in `assets/js/sites-data.js` has a stable unique `id`. Favorites and recent visits use this ID, so do not replace it with an array index or change it casually. A new entry only needs `id`, `name`, `url`, `description`, `category`, `keywords`, and an optional `addedAt` date:

```js
{
  id: "example",
  name: "Example",
  url: "https://example.com/",
  description: "A short description",
  category: "tools",
  keywords: ["example"],
  addedAt: "2026-07-13"
}
```

`addedAt` is an optional valid `YYYY-MM-DD` collection date. The recent view sorts dated entries from newest to oldest and shows at most 12. The former `featured` and `popular` views are retired, so website data no longer uses those fields.

Do not add an `icon` field to website data. Each card automatically inherits the local Font Awesome icon of its category, so cards in the same category share one icon. The site does not request Google favicon, destination-site favicons, or any other remote icon service.

The SAKURA brand continues to use the single local vector source:

```text
assets/images/icons/sakura-mark.svg
```

The SVG favicon plus the header and footer brand marks reference this file directly. `favicon.png`, `apple-touch-icon.png`, `pwa-192.png`, `pwa-512.png`, and social assets remain part of the SAKURA brand system. To change the brand icon, replace the SVG and re-export those resources; do not restore per-site icons.

## Browser-only data

- `sakura-theme`: an explicit light or dark choice; an absent key means system mode
- `sakura-favorites`: favorite site IDs in their manually selected display order
- `sakura-recent-visits`: up to 12 unique site IDs and timestamps

Reordering favorites reuses the existing ID array and creates no additional storage key. Malformed, stale, or unavailable localStorage data is ignored safely. Search and filter state is written only to the current address bar, not to localStorage, and ordinary filter changes make no additional network request. When a parameterized URL is refreshed or opened, its query string is sent to the hosting service as part of the normal page request.

## Local preview and validation

Run from the repository root:

```bash
python tools/validate_site.py
node --test tools/test_frontend.js
python -m http.server 8000
```

Open `http://localhost:8000`. The validator checks pages, local references, IDs, categories, icons, dates, fields, normalized URL duplicates, CSP compatibility, mixed content, cache rules, and sitemap targets without third-party packages. The native Node.js suite covers theme cycling, search matching, safe highlighting, `NEW` badge boundaries, favorites cleanup and ordering, and recent-visit cleanup.

## Automated site validation

`.github/workflows/site-validation.yml` runs Python and JavaScript syntax checks, frontend regression tests, and `tools/validate_site.py` on pushes to `main`, Pull Requests targeting `main`, and manual dispatches. It has read-only repository permissions and does not replace the manual link-health workflow below.

## Link health checks

The manual-only workflow is stored at:

```text
.github/workflows/link-health.yml
```

It has no scheduled trigger. To run it on GitHub, open:

```text
Repository
→ Actions
→ Navigation link health report
→ Run workflow
→ select main
→ Run workflow
```

After completion, read the report in the job Summary or download the `navigation-link-health-report` artifact. Artifacts are retained for 30 days.

Run the same report locally with:

```bash
python tools/check_links.py
python tools/check_links.py --output link-health-report.md
```

The report never deletes sites, replaces URLs, commits changes, or opens a Pull Request. Results involving 403 responses, TLS errors, Cloudflare challenges, or timeouts require manual review.

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

The root `_headers` file is supported by both Cloudflare Pages and Workers Static Assets. It adds MIME sniffing protection, a strict referrer policy, a browser permissions policy, frame protection, and an enforced CSP. Scripts, styles, fonts, and images default to local resources; narrowly scoped `style-src-attr` support remains for the dynamically calculated scroll offset.

Caching is layered by resource type: HTML, CSS, and JavaScript revalidate on every visit; the manifest caches for one hour; images cache for seven days; and local icon fonts cache for 30 days. Asset filenames are not content-hashed, so the project deliberately avoids `immutable` or one-year caching that could keep outdated scripts or styles after a deployment.

## PWA and SEO

The manifest and local icons improve iPhone, iPad, and Android home-screen use. No Service Worker is registered, preventing stale application-shell caching. The repository also includes a 1200×630 Open Graph image, `robots.txt`, and `sitemap.xml` using the primary canonical host. Desktop fine-pointer devices receive a light card-entry animation, while `prefers-reduced-motion: reduce` disables it.

## Privacy and content notice

SAKURA Notes only links to external websites and does not host their content. Each destination is responsible for its availability, content, and terms. This personal project has no advertising or third-party analytics scripts, uses no cookies, and does not transmit favorites or visit history.

Third-party assets remain subject to their licenses, including the Font Awesome license stored in the repository.

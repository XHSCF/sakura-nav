# SAKURA Notes

SAKURA Notes is a lightweight personal start page for organizing frequently used websites, anime and video resources, downloads, utilities, iOS links, and other web content.

- Live site: [https://skrto.top](https://skrto.top)
- Repository: `XHSCF/sakura-nav`
- Hosting: GitHub Pages
- Chinese documentation: [README.md](README.md)

## Features

- Fully static HTML, CSS, and vanilla JavaScript
- Centralized navigation data in `assets/js/sites-data.js`
- Instant search across names, descriptions, URLs, and categories
- Category filters that work together with search
- Curated, recently added, and popular views based on explicit data flags
- System-aware light and dark themes with a saved preference
- Responsive layouts for mobile, tablet, and desktop
- Keyboard access, visible focus states, and reduced-motion support
- No ads, analytics, build system, backend, or required external API

## Core structure

```text
index.html                      Home page
about/index.html                About page
commit.html                     Static website suggestion helper
404.html                        Custom error page
CNAME                           Custom domain: skrto.top
assets/css/sakura.css           Shared design system
assets/js/sites-data.js         Categories, websites, and friend links
assets/js/sakura-app.js         Search, filters, theme, menu, and form logic
assets/images/logos/            Website icons and fallback icon
```

## Add a website

Edit the `sites` array in `assets/js/sites-data.js`:

```js
{
  name: "Example",
  url: "https://example.com/",
  description: "A short description",
  icon: "assets/images/logos/example.png",
  category: "tools"
}
```

Optional flags are `featured`, `recent`, and `popular`. They are manually curated labels and do not represent traffic statistics.

## Add or edit a category

Edit the `categories` array in `assets/js/sites-data.js`. A site's `category` value must match an existing category `id`.

## Local preview

Serve the repository root over HTTP:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## GitHub Pages

Publish the `main` branch from the repository root. The project has no build output. Keep the root `CNAME` file unchanged so the custom domain remains `skrto.top`.

## Theme behavior

The initial theme follows the operating system. A manual choice is saved to `localStorage` under `sakura-theme`; no theme cookie is used.

## Website suggestions

`commit.html` validates input locally and produces text that can be copied into a GitHub Issue. It does not upload, transmit, or store form data.

## Notice

This is a personal learning and organization project. It links to external websites but does not host their content. Third-party assets remain subject to their respective licenses, including the Font Awesome license stored in the repository.

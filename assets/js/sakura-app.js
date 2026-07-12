(function () {
  "use strict";

  const root = document.documentElement;
  const themeKey = "sakura-theme";
  const favoritesKey = "sakura-favorites";
  const recentVisitsKey = "sakura-recent-visits";
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function readTextStorage(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  }

  function writeTextStorage(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (_) {
      return false;
    }
  }

  function readJsonStorage(key, fallback) {
    const raw = readTextStorage(key);
    if (!raw) return fallback;
    try {
      return JSON.parse(raw);
    } catch (_) {
      return fallback;
    }
  }

  function writeJsonStorage(key, value) {
    return writeTextStorage(key, JSON.stringify(value));
  }

  function preferredTheme() {
    const saved = readTextStorage(themeKey);
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function applyTheme(theme, persist) {
    root.dataset.theme = theme;
    if (persist) writeTextStorage(themeKey, theme);

    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
      const isDark = theme === "dark";
      button.setAttribute("aria-label", isDark ? "切换到浅色模式" : "切换到深色模式");
      button.setAttribute("title", isDark ? "浅色模式" : "深色模式");
      const icon = button.querySelector("i");
      if (icon) icon.className = isDark ? "fas fa-sun" : "fas fa-moon";
    });

    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.content = theme === "dark" ? "#171a24" : "#f6f5fa";
  }

  function setupGlobalUI() {
    applyTheme(preferredTheme(), false);

    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
      button.addEventListener("click", () => {
        applyTheme(root.dataset.theme === "dark" ? "light" : "dark", true);
      });
    });

    const menuButton = document.querySelector("[data-menu-toggle]");
    const nav = document.querySelector("[data-site-nav]");

    function closeMenu() {
      if (!menuButton || !nav) return;
      nav.classList.remove("is-open");
      menuButton.setAttribute("aria-expanded", "false");
      document.body.classList.remove("menu-open");
    }

    if (menuButton && nav) {
      menuButton.addEventListener("click", () => {
        const open = !nav.classList.contains("is-open");
        nav.classList.toggle("is-open", open);
        menuButton.setAttribute("aria-expanded", String(open));
        document.body.classList.toggle("menu-open", open);
      });

      nav.addEventListener("click", (event) => {
        if (event.target.closest("a")) closeMenu();
      });

      document.addEventListener("click", (event) => {
        if (!nav.contains(event.target) && !menuButton.contains(event.target)) closeMenu();
      });

      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeMenu();
      });

      window.addEventListener("resize", () => {
        if (window.innerWidth > 760) closeMenu();
      });
    }

    const backToTop = document.querySelector("[data-back-to-top]");
    if (backToTop) {
      const updateBackToTop = () => backToTop.classList.toggle("is-visible", window.scrollY > 520);
      window.addEventListener("scroll", updateBackToTop, { passive: true });
      updateBackToTop();
      backToTop.addEventListener("click", () => {
        window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
      });
    }

    document.querySelectorAll("[data-current-year]").forEach((node) => {
      node.textContent = String(new Date().getFullYear());
    });

    const today = new Date();
    const startDay = Date.UTC(2026, 6, 12);
    const todayDay = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    const elapsed = Math.floor((todayDay - startDay) / 86400000) + 1;
    const runtimeDays = Number.isFinite(elapsed) ? Math.max(1, elapsed) : 1;
    document.querySelectorAll("[data-runtime-days]").forEach((node) => {
      node.textContent = `本站已运行 ${runtimeDays} 天`;
    });
  }

  function normalize(value) {
    return String(value || "").toLocaleLowerCase("zh-CN").trim().replace(/\s+/g, " ");
  }

  function queryTerms(value) {
    return normalize(value).split(" ").filter(Boolean);
  }

  function setupHome() {
    const data = window.SAKURA_DATA;
    const gridRoot = document.querySelector("[data-site-groups]");
    if (!data || !gridRoot) return;

    const search = document.querySelector("[data-site-search]");
    const clear = document.querySelector("[data-search-clear]");
    const result = document.querySelector("[data-search-result]");
    const empty = document.querySelector("[data-empty-state]");
    const emptyTitle = document.querySelector("[data-empty-title]");
    const emptyMessage = document.querySelector("[data-empty-message]");
    const categoryBar = document.querySelector("[data-category-bar]");
    const categoryShell = categoryBar?.closest(".category-shell");
    const viewSwitcher = document.querySelector("[data-view-switcher]");
    const clearRecent = document.querySelector("[data-clear-recent]");
    const siteHeader = document.querySelector(".site-header");
    const siteIconPath = "assets/images/icons/sakura-mark.svg";
    const categoryMap = new Map(data.categories.map((category) => [category.id, category]));
    const siteMap = new Map(data.sites.map((site) => [site.id, site]));
    const validIds = new Set(siteMap.keys());
    const state = { terms: [], category: "all", view: "all" };
    let scrollRequestToken = 0;
    empty?.setAttribute("data-result-scroll-target", "empty");

    const storedFavorites = readJsonStorage(favoritesKey, []);
    const favorites = new Set(
      (Array.isArray(storedFavorites) ? storedFavorites : [])
        .filter((id) => typeof id === "string" && validIds.has(id))
    );

    function cleanRecentVisits(value) {
      if (!Array.isArray(value)) return [];
      const seen = new Set();
      const cleaned = [];
      value.forEach((entry) => {
        if (!entry || typeof entry.id !== "string" || !validIds.has(entry.id) || seen.has(entry.id)) return;
        const visitedAt = Number(entry.visitedAt);
        cleaned.push({ id: entry.id, visitedAt: Number.isFinite(visitedAt) ? visitedAt : 0 });
        seen.add(entry.id);
      });
      return cleaned.slice(0, 12);
    }

    let recentVisits = cleanRecentVisits(readJsonStorage(recentVisitsKey, []));
    writeJsonStorage(favoritesKey, Array.from(favorites));
    writeJsonStorage(recentVisitsKey, recentVisits);

    function createButton(label, value, type) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "filter-chip";
      button.textContent = label;
      button.dataset[type] = value;
      button.setAttribute("aria-pressed", String(value === "all"));
      return button;
    }

    function updatePressed(container, key, activeValue) {
      container.querySelectorAll(`[data-${key}]`).forEach((button) => {
        const active = button.dataset[key] === activeValue;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
      });
    }

    function trackVisit(siteId) {
      recentVisits = [
        { id: siteId, visitedAt: Date.now() },
        ...recentVisits.filter((entry) => entry.id !== siteId)
      ].slice(0, 12);
      writeJsonStorage(recentVisitsKey, recentVisits);
    }

    function updateFavoriteButton(button, site) {
      const active = favorites.has(site.id);
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
      button.setAttribute("aria-label", active ? `取消收藏 ${site.name}` : `收藏 ${site.name}`);
      button.setAttribute("title", active ? "取消收藏" : "添加到我的常用");
    }

    function toggleFavorite(site, button) {
      if (favorites.has(site.id)) favorites.delete(site.id);
      else favorites.add(site.id);
      writeJsonStorage(favoritesKey, Array.from(favorites));
      if (state.view === "favorites") render();
      else updateFavoriteButton(button, site);
    }

    function matchesView(site) {
      if (state.view === "featured") return Boolean(site.featured);
      if (state.view === "recent") return Boolean(site.recent);
      if (state.view === "popular") return Boolean(site.popular);
      if (state.view === "favorites") return favorites.has(site.id);
      if (state.view === "history") return recentVisits.some((entry) => entry.id === site.id);
      return true;
    }

    function filteredSites() {
      const sites = data.sites.filter((site) => {
        const category = categoryMap.get(site.category);
        const searchable = normalize([
          site.name,
          site.description,
          site.url,
          category ? category.name : "",
          ...(Array.isArray(site.keywords) ? site.keywords : [])
        ].join(" "));
        const matchesQuery = state.terms.every((term) => searchable.includes(term));
        const matchesCategory = state.category === "all" || site.category === state.category;
        return matchesQuery && matchesCategory && matchesView(site);
      });

      if (state.view === "history") {
        const order = new Map(recentVisits.map((entry, index) => [entry.id, index]));
        sites.sort((a, b) => order.get(a.id) - order.get(b.id));
      }
      return sites;
    }

    function createSiteCard(site) {
      const article = document.createElement("article");
      article.className = "site-card";
      article.dataset.siteId = site.id;

      const link = document.createElement("a");
      link.className = "site-card-link";
      link.href = site.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.setAttribute("aria-label", `打开 ${site.name}`);
      link.addEventListener("click", () => trackVisit(site.id));

      const image = document.createElement("img");
      image.className = "site-icon";
      image.src = siteIconPath;
      image.alt = "";
      image.width = 48;
      image.height = 48;
      image.loading = "lazy";
      image.decoding = "async";

      const copy = document.createElement("div");
      copy.className = "site-card-copy";
      const title = document.createElement("strong");
      title.className = "site-card-title";
      title.textContent = site.name;
      const description = document.createElement("p");
      description.className = "site-card-description";
      description.textContent = site.description;
      const category = document.createElement("span");
      category.className = "site-card-category";
      category.textContent = categoryMap.get(site.category)?.name || site.category;

      const favoriteButton = document.createElement("button");
      favoriteButton.type = "button";
      favoriteButton.className = "favorite-button";
      favoriteButton.innerHTML = '<i class="fas fa-star" aria-hidden="true"></i>';
      updateFavoriteButton(favoriteButton, site);
      favoriteButton.addEventListener("click", () => toggleFavorite(site, favoriteButton));

      copy.append(title, description, category);
      link.append(image, copy);
      article.append(link, favoriteButton);
      return article;
    }

    function createGroup(category, sites) {
      const section = document.createElement("section");
      section.className = "site-group";
      section.id = `category-${category.id}`;
      const heading = document.createElement("h3");
      heading.className = "group-heading";
      heading.dataset.resultScrollTarget = category.id;
      const icon = document.createElement("i");
      icon.className = `fas ${category.icon}`;
      icon.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.textContent = category.name;
      const count = document.createElement("span");
      count.className = "group-count";
      count.textContent = String(sites.length);
      const grid = document.createElement("div");
      grid.className = "site-grid";
      sites.forEach((site) => grid.appendChild(createSiteCard(site)));
      heading.append(icon, label, count);
      section.append(heading, grid);
      return section;
    }

    function updateEmptyState(siteCount) {
      if (!empty) return;
      empty.classList.toggle("is-visible", siteCount === 0);
      if (siteCount !== 0) return;
      if (state.view === "favorites" && !state.terms.length && state.category === "all") {
        if (emptyTitle) emptyTitle.textContent = "还没有添加我的常用";
        if (emptyMessage) emptyMessage.textContent = "点击网站卡片右上角的星标，即可在这里快速找到它。";
      } else if (state.view === "history" && !state.terms.length && state.category === "all") {
        if (emptyTitle) emptyTitle.textContent = "还没有最近访问记录";
        if (emptyMessage) emptyMessage.textContent = "打开一个网站后，它会安全地保存在当前浏览器中。";
      } else {
        if (emptyTitle) emptyTitle.textContent = "没有找到匹配的网站";
        if (emptyMessage) emptyMessage.textContent = "试试更短的关键词，或切换到“全部”分类。";
      }
    }

    function render() {
      scrollRequestToken += 1;
      const sites = filteredSites();
      const fragment = document.createDocumentFragment();
      gridRoot.replaceChildren();

      if (state.view === "history" && sites.length) {
        fragment.appendChild(createGroup({ id: "history", name: "最近访问", icon: "fa-history" }, sites));
      } else {
        data.categories.forEach((category) => {
          const categorySites = sites.filter((site) => site.category === category.id);
          if (categorySites.length) fragment.appendChild(createGroup(category, categorySites));
        });
      }

      gridRoot.appendChild(fragment);
      updateEmptyState(sites.length);
      if (clearRecent) clearRecent.hidden = !(state.view === "history" && recentVisits.length > 0);
      if (result) {
        result.textContent = state.terms.length || state.category !== "all" || state.view !== "all"
          ? `找到 ${sites.length} / ${data.sites.length} 个站点`
          : `${data.sites.length} 个站点 · ${data.categories.length} 个分类`;
      }
    }

    function visibleStickyHeight(element) {
      if (!element) return 0;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      if (style.display === "none" || style.visibility === "hidden" || rect.height <= 0) return 0;
      return style.position === "sticky" || style.position === "fixed" ? rect.height : 0;
    }

    function activeResultTarget() {
      if (empty?.classList.contains("is-visible")) return empty;
      const headings = Array.from(gridRoot.querySelectorAll("[data-result-scroll-target]"));
      if (state.category !== "all") {
        return headings.find((heading) => heading.dataset.resultScrollTarget === state.category) || headings[0] || null;
      }
      return headings[0] || null;
    }

    function centerCategoryButton(button) {
      if (!categoryBar || !button || !window.matchMedia("(max-width: 768px)").matches) return;
      const maxScrollLeft = Math.max(0, categoryBar.scrollWidth - categoryBar.clientWidth);
      const targetLeft = button.offsetLeft - (categoryBar.clientWidth - button.offsetWidth) / 2;
      const nextLeft = Math.min(maxScrollLeft, Math.max(0, targetLeft));
      categoryBar.scrollTo({
        left: nextLeft,
        behavior: reducedMotion ? "auto" : "smooth"
      });
    }

    function centerViewButton(button) {
      if (!viewSwitcher || !button || !window.matchMedia("(max-width: 768px)").matches) return;
      const maxScrollLeft = Math.max(0, viewSwitcher.scrollWidth - viewSwitcher.clientWidth);
      const targetLeft = button.offsetLeft - (viewSwitcher.clientWidth - button.offsetWidth) / 2;
      const nextLeft = Math.min(maxScrollLeft, Math.max(0, targetLeft));
      viewSwitcher.scrollTo({
        left: nextLeft,
        behavior: reducedMotion ? "auto" : "smooth"
      });
    }

    function scheduleResultScroll() {
      const token = ++scrollRequestToken;
      window.scrollTo({ top: window.scrollY, behavior: "auto" });
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (token !== scrollRequestToken) return;
          const target = activeResultTarget();
          if (!target) return;
          const visualGap = window.matchMedia("(max-width: 768px)").matches ? 18 : 22;
          const offset = visibleStickyHeight(siteHeader) + visibleStickyHeight(categoryShell) + visualGap;
          root.style.setProperty("--result-scroll-offset", `${offset}px`);
          const targetTop = window.scrollY + target.getBoundingClientRect().top - offset;
          window.scrollTo({
            top: Math.max(0, targetTop),
            behavior: reducedMotion ? "auto" : "smooth"
          });
        });
      });
    }

    if (categoryBar) {
      categoryBar.appendChild(createButton("全部", "all", "category"));
      data.categories.forEach((category) => categoryBar.appendChild(createButton(category.name, category.id, "category")));
      categoryBar.addEventListener("click", (event) => {
        const button = event.target.closest("[data-category]");
        if (!button) return;
        state.category = button.dataset.category;
        updatePressed(categoryBar, "category", state.category);
        render();
        centerCategoryButton(button);
        scheduleResultScroll();
      });
    }

    viewSwitcher?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-view]");
      if (!button) return;
      state.view = button.dataset.view;
      updatePressed(viewSwitcher, "view", state.view);
      render();
      centerViewButton(button);
      scheduleResultScroll();
    });

    clearRecent?.addEventListener("click", () => {
      recentVisits = [];
      writeJsonStorage(recentVisitsKey, recentVisits);
      render();
    });

    if (search) {
      search.addEventListener("input", () => {
        state.terms = queryTerms(search.value);
        clear?.classList.toggle("is-visible", Boolean(state.terms.length));
        const shortcut = document.querySelector(".search-shortcut");
        if (shortcut) shortcut.hidden = Boolean(state.terms.length);
        render();
      });

      clear?.addEventListener("click", () => {
        search.value = "";
        state.terms = [];
        clear.classList.remove("is-visible");
        const shortcut = document.querySelector(".search-shortcut");
        if (shortcut) shortcut.hidden = false;
        render();
        search.focus();
      });

      document.addEventListener("keydown", (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
          event.preventDefault();
          search.focus();
          search.select();
        }
        if (event.key === "Escape" && (document.activeElement === search || search.value)) {
          search.value = "";
          state.terms = [];
          clear?.classList.remove("is-visible");
          const shortcut = document.querySelector(".search-shortcut");
          if (shortcut) shortcut.hidden = false;
          render();
          search.blur();
        }
      });
    }

    render();
  }

  document.addEventListener("DOMContentLoaded", () => {
    setupGlobalUI();
    setupHome();
  });
})();

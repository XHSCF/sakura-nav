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
      menuButton.setAttribute("aria-label", "打开导航菜单");
      document.body.classList.remove("menu-open");
    }

    if (menuButton && nav) {
      menuButton.addEventListener("click", () => {
        const open = !nav.classList.contains("is-open");
        nav.classList.toggle("is-open", open);
        menuButton.setAttribute("aria-expanded", String(open));
        menuButton.setAttribute("aria-label", open ? "关闭导航菜单" : "打开导航菜单");
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
        if (window.innerWidth > 768) closeMenu();
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
    const searchForm = document.querySelector("[data-search-form]");
    const clear = document.querySelector("[data-search-clear]");
    const result = document.querySelector("[data-search-result]");
    const empty = document.querySelector("[data-empty-state]");
    const emptyTitle = document.querySelector("[data-empty-title]");
    const emptyMessage = document.querySelector("[data-empty-message]");
    const categoryBar = document.querySelector("[data-category-bar]");
    const categoryShell = categoryBar?.closest(".category-shell");
    const categoryScrollLeft = document.querySelector("[data-category-scroll=\"left\"]");
    const categoryScrollRight = document.querySelector("[data-category-scroll=\"right\"]");
    const viewSwitcher = document.querySelector("[data-view-switcher]");
    const clearRecent = document.querySelector("[data-clear-recent]");
    const contentSection = gridRoot.closest(".content-section");
    const shortcut = document.querySelector(".search-shortcut");
    const siteHeader = document.querySelector(".site-header");
    const accessNotice = document.querySelector("[data-access-notice]");
    const copyView = document.querySelector("[data-copy-view]");
    const copyViewLabel = document.querySelector("[data-copy-view-label]");
    const copyStatus = document.querySelector("[data-copy-status]");
    const categoryMap = new Map(data.categories.map((category) => [category.id, category]));
    const categoryAliases = new Map([["ppt", "software"]]);
    const siteMap = new Map(data.sites.map((site) => [site.id, site]));
    const validIds = new Set(siteMap.keys());
    const validViews = new Set(Array.from(viewSwitcher?.querySelectorAll("[data-view]") || [], (button) => button.dataset.view));
    const state = { terms: [], category: "all", view: "all" };
    let scrollRequestToken = 0;
    let categoryControlFrame = 0;
    let selectedCardIndex = -1;
    let copyResetTimer = 0;
    empty?.setAttribute("data-result-scroll-target", "empty");

    const platform = navigator.userAgentData?.platform || navigator.platform || navigator.userAgent;
    if (shortcut) shortcut.textContent = /Mac|iPhone|iPad|iPod/i.test(platform) ? "⌘ K" : "Ctrl K";

    function restoreUrlState() {
      const params = new URLSearchParams(window.location.search);
      const query = params.get("q") || "";
      const requestedCategory = params.get("category") || "all";
      const category = categoryAliases.get(requestedCategory) || requestedCategory;
      const view = params.get("view") || "all";
      if (search) search.value = query;
      state.terms = queryTerms(query);
      state.category = category === "all" || categoryMap.has(category) ? category : "all";
      state.view = validViews.has(view) ? view : "all";
    }

    function updateUrlState() {
      const url = new URL(window.location.href);
      const query = search?.value.trim() || "";
      if (query) url.searchParams.set("q", query);
      else url.searchParams.delete("q");
      if (state.category !== "all") url.searchParams.set("category", state.category);
      else url.searchParams.delete("category");
      if (state.view !== "all") url.searchParams.set("view", state.view);
      else url.searchParams.delete("view");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }

    restoreUrlState();

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
      if (state.view === "recent") return Boolean(site.addedAt);
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
      } else if (state.view === "recent") {
        sites.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
        return sites.slice(0, 12);
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
      link.setAttribute("aria-label", `在新标签页打开 ${site.name}`);
      link.addEventListener("click", () => trackVisit(site.id));

      const siteCategory = categoryMap.get(site.category);
      const iconBox = document.createElement("span");
      iconBox.className = "site-icon";
      iconBox.setAttribute("aria-hidden", "true");
      const icon = document.createElement("i");
      icon.className = `fas ${siteCategory?.icon || "fa-link"}`;
      iconBox.appendChild(icon);

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
      category.textContent = siteCategory?.name || site.category;

      const favoriteButton = document.createElement("button");
      favoriteButton.type = "button";
      favoriteButton.className = "favorite-button";
      favoriteButton.innerHTML = '<i class="fas fa-star" aria-hidden="true"></i>';
      updateFavoriteButton(favoriteButton, site);
      favoriteButton.addEventListener("click", () => toggleFavorite(site, favoriteButton));

      copy.append(title, description, category);
      link.append(iconBox, copy);
      article.append(link, favoriteButton);
      return article;
    }

    function resetKeyboardSelection() {
      selectedCardIndex = -1;
      gridRoot.querySelectorAll(".site-card.is-keyboard-selected").forEach((card) => {
        card.classList.remove("is-keyboard-selected");
      });
    }

    function moveKeyboardSelection(direction) {
      const cards = Array.from(gridRoot.querySelectorAll(".site-card"));
      if (!cards.length) return;
      cards.forEach((card) => card.classList.remove("is-keyboard-selected"));
      selectedCardIndex = selectedCardIndex < 0
        ? (direction > 0 ? 0 : cards.length - 1)
        : (selectedCardIndex + direction + cards.length) % cards.length;
      const card = cards[selectedCardIndex];
      card.classList.add("is-keyboard-selected");
      card.scrollIntoView({ block: "nearest", behavior: reducedMotion ? "auto" : "smooth" });
    }

    function openKeyboardSelection() {
      const cards = Array.from(gridRoot.querySelectorAll(".site-card"));
      const card = cards[selectedCardIndex];
      card?.querySelector(".site-card-link")?.click();
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
      resetKeyboardSelection();
      const sites = filteredSites();
      const fragment = document.createDocumentFragment();
      gridRoot.replaceChildren();
      gridRoot.classList.toggle("hide-card-categories", state.view === "all" && !state.terms.length);

      if ((state.view === "history" || state.view === "recent") && sites.length) {
        const group = state.view === "history"
          ? { id: "history", name: "最近访问", icon: "fa-history" }
          : { id: "recent", name: "最近收录", icon: "fa-clock" };
        fragment.appendChild(createGroup(group, sites));
      } else {
        data.categories.forEach((category) => {
          const categorySites = sites.filter((site) => site.category === category.id);
          if (categorySites.length) fragment.appendChild(createGroup(category, categorySites));
        });
      }

      gridRoot.appendChild(fragment);
      updateEmptyState(sites.length);
      const showClearRecent = state.view === "history" && recentVisits.length > 0;
      if (clearRecent) clearRecent.hidden = !showClearRecent;
      contentSection?.classList.toggle("has-history-action", showClearRecent);
      if (result) {
        result.textContent = state.terms.length || state.category !== "all" || state.view !== "all"
          ? `找到 ${sites.length} / ${data.sites.length} 个站点`
          : `${data.sites.length} 个站点 · ${data.categories.length} 个分类`;
      }
      scheduleCategoryScrollControls();
    }

    function visibleStickyHeight(element) {
      if (!element) return 0;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      if (style.display === "none" || style.visibility === "hidden" || rect.height <= 0) return 0;
      return style.position === "sticky" || style.position === "fixed" ? rect.height : 0;
    }

    function activeResultTarget() {
      if (accessNotice) return accessNotice;
      if (empty?.classList.contains("is-visible")) return empty;
      const headings = Array.from(gridRoot.querySelectorAll("[data-result-scroll-target]"));
      if (state.category !== "all") {
        return headings.find((heading) => heading.dataset.resultScrollTarget === state.category) || headings[0] || null;
      }
      return headings[0] || null;
    }

    function centerCategoryButton(button) {
      if (!categoryBar || !button || !window.matchMedia("(max-width: 768px), (hover: none) and (pointer: coarse)").matches) return;
      const maxScrollLeft = Math.max(0, categoryBar.scrollWidth - categoryBar.clientWidth);
      const targetLeft = button.offsetLeft - (categoryBar.clientWidth - button.offsetWidth) / 2;
      const nextLeft = Math.min(maxScrollLeft, Math.max(0, targetLeft));
      categoryBar.scrollTo({
        left: nextLeft,
        behavior: reducedMotion ? "auto" : "smooth"
      });
    }

    function centerViewButton(button) {
      if (!viewSwitcher || !button || !window.matchMedia("(max-width: 768px), (hover: none) and (pointer: coarse)").matches) return;
      const maxScrollLeft = Math.max(0, viewSwitcher.scrollWidth - viewSwitcher.clientWidth);
      const targetLeft = button.offsetLeft - (viewSwitcher.clientWidth - button.offsetWidth) / 2;
      const nextLeft = Math.min(maxScrollLeft, Math.max(0, targetLeft));
      viewSwitcher.scrollTo({
        left: nextLeft,
        behavior: reducedMotion ? "auto" : "smooth"
      });
    }

    function updateCategoryScrollControls() {
      if (!categoryBar || !categoryScrollLeft || !categoryScrollRight) return;
      if (!window.matchMedia("(min-width: 769px) and (hover: hover) and (pointer: fine)").matches) {
        categoryScrollLeft.hidden = true;
        categoryScrollRight.hidden = true;
        return;
      }
      const maxScrollLeft = Math.max(0, categoryBar.scrollWidth - categoryBar.clientWidth);
      const hasOverflow = maxScrollLeft > 1;
      const atStart = categoryBar.scrollLeft <= 1;
      const atEnd = categoryBar.scrollLeft >= maxScrollLeft - 1;
      categoryScrollLeft.hidden = !hasOverflow || atStart;
      categoryScrollRight.hidden = !hasOverflow || atEnd;
      categoryScrollLeft.disabled = !hasOverflow || atStart;
      categoryScrollRight.disabled = !hasOverflow || atEnd;
    }

    function scheduleCategoryScrollControls() {
      window.cancelAnimationFrame(categoryControlFrame);
      categoryControlFrame = window.requestAnimationFrame(() => {
        updateCategoryScrollControls();
        window.requestAnimationFrame(updateCategoryScrollControls);
      });
    }

    function scrollCategories(direction) {
      if (!categoryBar || !window.matchMedia("(min-width: 769px) and (hover: hover) and (pointer: fine)").matches) return;
      categoryBar.scrollBy({
        left: direction * categoryBar.clientWidth * 0.7,
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

    function fallbackCopyText(value) {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.className = "copy-fallback-input";
      textarea.setAttribute("readonly", "");
      document.body.appendChild(textarea);
      textarea.select();
      try {
        return document.execCommand("copy");
      } finally {
        textarea.remove();
      }
    }

    async function copyCurrentView() {
      let copied = false;
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(window.location.href);
          copied = true;
        } else {
          copied = fallbackCopyText(window.location.href);
        }
      } catch (_) {
        try {
          copied = fallbackCopyText(window.location.href);
        } catch (_) {}
      }

      const message = copied ? "当前视图链接已复制" : "复制失败，请手动复制地址栏链接";
      if (copyViewLabel) copyViewLabel.textContent = copied ? "已复制当前视图" : "复制失败";
      if (copyStatus) copyStatus.textContent = message;
      window.clearTimeout(copyResetTimer);
      copyResetTimer = window.setTimeout(() => {
        if (copyViewLabel) copyViewLabel.textContent = "复制当前视图链接";
        if (copyStatus) copyStatus.textContent = "";
      }, 1800);
    }

    if (categoryBar) {
      categoryBar.appendChild(createButton("全部", "all", "category"));
      data.categories.forEach((category) => categoryBar.appendChild(createButton(category.name, category.id, "category")));
      categoryBar.addEventListener("click", (event) => {
        const button = event.target.closest("[data-category]");
        if (!button) return;
        state.category = button.dataset.category;
        updatePressed(categoryBar, "category", state.category);
        updateUrlState();
        render();
        centerCategoryButton(button);
        scheduleResultScroll();
      });
      categoryBar.addEventListener("scroll", updateCategoryScrollControls, { passive: true });
      categoryScrollLeft?.addEventListener("click", () => scrollCategories(-1));
      categoryScrollRight?.addEventListener("click", () => scrollCategories(1));
      window.addEventListener("resize", scheduleCategoryScrollControls);
      if (window.ResizeObserver) new ResizeObserver(scheduleCategoryScrollControls).observe(categoryBar);
      document.fonts?.ready.then(scheduleCategoryScrollControls);
    }

    viewSwitcher?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-view]");
      if (!button) return;
      state.view = button.dataset.view;
      updatePressed(viewSwitcher, "view", state.view);
      updateUrlState();
      render();
      centerViewButton(button);
      scheduleResultScroll();
    });

    clearRecent?.addEventListener("click", () => {
      recentVisits = [];
      writeJsonStorage(recentVisitsKey, recentVisits);
      render();
    });

    searchForm?.addEventListener("submit", (event) => event.preventDefault());
    copyView?.addEventListener("click", copyCurrentView);

    if (search) {
      search.addEventListener("input", () => {
        state.terms = queryTerms(search.value);
        clear?.classList.toggle("is-visible", Boolean(state.terms.length));
        if (shortcut) shortcut.hidden = Boolean(state.terms.length);
        updateUrlState();
        render();
      });

      search.addEventListener("keydown", (event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          moveKeyboardSelection(event.key === "ArrowDown" ? 1 : -1);
        } else if (event.key === "Enter" && selectedCardIndex >= 0) {
          event.preventDefault();
          openKeyboardSelection();
        }
      });

      clear?.addEventListener("click", () => {
        search.value = "";
        state.terms = [];
        clear.classList.remove("is-visible");
        if (shortcut) shortcut.hidden = false;
        updateUrlState();
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
          if (shortcut) shortcut.hidden = false;
          updateUrlState();
          render();
          search.blur();
        }
      });
    }

    updatePressed(categoryBar, "category", state.category);
    updatePressed(viewSwitcher, "view", state.view);
    clear?.classList.toggle("is-visible", Boolean(state.terms.length));
    if (shortcut) shortcut.hidden = Boolean(state.terms.length);
    updateUrlState();
    render();
  }

  document.addEventListener("DOMContentLoaded", () => {
    setupGlobalUI();
    setupHome();
  });
})();

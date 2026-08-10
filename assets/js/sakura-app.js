(function () {
  "use strict";

  const core = window.SAKURA_CORE;
  if (!core) return;

  const root = document.documentElement;
  const themeKey = "sakura-theme";
  const colorThemeKey = "sakura-color-theme";
  const recentVisitsKey = "sakura-recent-visits";
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const systemDarkMode = window.matchMedia("(prefers-color-scheme: dark)");

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

  function removeTextStorage(key) {
    try {
      window.localStorage.removeItem(key);
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

  function preferredThemeMode() {
    return core.normalizeThemeMode(readTextStorage(themeKey));
  }

  function preferredColorTheme() {
    return core.normalizeColorTheme(readTextStorage(colorThemeKey));
  }

  function applyColorTheme(themeId, persist) {
    const validThemeId = core.normalizeColorTheme(themeId);
    const selectedTheme = core.colorThemes.find((theme) => theme.id === validThemeId);
    root.dataset.colorTheme = validThemeId;

    if (persist) {
      if (validThemeId === "miku") removeTextStorage(colorThemeKey);
      else writeTextStorage(colorThemeKey, validThemeId);
    }

    document.querySelectorAll("[data-color-theme-toggle]").forEach((button) => {
      button.setAttribute("aria-label", `当前配色：${selectedTheme.name}；点击选择其他配色`);
      button.setAttribute("title", `配色：${selectedTheme.name}`);
    });

    document.querySelectorAll("[data-color-theme-option]").forEach((button) => {
      const selected = button.dataset.colorThemeOption === validThemeId;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-checked", String(selected));
      const check = button.querySelector("i");
      if (check) check.hidden = !selected;
    });
  }

  function applyTheme(mode, persist) {
    const validMode = core.normalizeThemeMode(mode);
    const theme = core.resolveTheme(validMode, systemDarkMode.matches);
    root.dataset.theme = theme;
    root.dataset.themeMode = validMode;
    if (persist) {
      if (validMode === "auto") removeTextStorage(themeKey);
      else writeTextStorage(themeKey, validMode);
    }

    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
      const modes = {
        auto: { current: "跟随系统", next: "浅色模式", icon: "fas fa-adjust" },
        light: { current: "浅色模式", next: "深色模式", icon: "fas fa-sun" },
        dark: { current: "深色模式", next: "跟随系统", icon: "fas fa-moon" }
      };
      const state = modes[validMode];
      button.setAttribute("aria-label", `当前主题：${state.current}；点击切换到${state.next}`);
      button.setAttribute("title", `主题：${state.current}`);
      const icon = button.querySelector("i");
      if (icon) icon.className = state.icon;
    });

    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.content = theme === "dark" ? "#171a24" : "#f6f5fa";
  }

  function setupGlobalUI() {
    applyTheme(preferredThemeMode(), false);
    applyColorTheme(preferredColorTheme(), false);

    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
      button.addEventListener("click", () => {
        applyTheme(core.nextThemeMode(root.dataset.themeMode), true);
      });
    });

    const syncSystemTheme = () => {
      if (root.dataset.themeMode === "auto") applyTheme("auto", false);
    };
    if (systemDarkMode.addEventListener) systemDarkMode.addEventListener("change", syncSystemTheme);
    else systemDarkMode.addListener?.(syncSystemTheme);

    document.querySelectorAll("[data-color-theme-control]").forEach((control) => {
      const toggle = control.querySelector("[data-color-theme-toggle]");
      const panel = control.querySelector("[data-color-theme-panel]");
      if (!toggle || !panel) return;

      const options = core.colorThemes.map((theme) => {
        const button = document.createElement("button");
        button.className = "color-theme-option";
        button.type = "button";
        button.dataset.colorThemeOption = theme.id;
        button.setAttribute("role", "radio");
        button.setAttribute("aria-checked", "false");
        button.innerHTML = `<span class="color-theme-swatch" style="--swatch: ${theme.color}" aria-hidden="true"></span><span>${theme.name}</span><i class="fas fa-check" aria-hidden="true" hidden></i>`;
        button.addEventListener("click", () => {
          applyColorTheme(theme.id, true);
          closeColorThemePanel();
          toggle.focus();
        });
        return button;
      });
      panel.replaceChildren(...options);
      applyColorTheme(root.dataset.colorTheme, false);

      function closeColorThemePanel() {
        panel.hidden = true;
        toggle.setAttribute("aria-expanded", "false");
      }

      toggle.addEventListener("click", () => {
        const open = panel.hidden;
        panel.hidden = !open;
        toggle.setAttribute("aria-expanded", String(open));
        if (open) panel.querySelector('[aria-checked="true"]')?.focus();
      });

      panel.addEventListener("keydown", (event) => {
        if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"].includes(event.key)) return;
        const buttons = Array.from(panel.querySelectorAll("[data-color-theme-option]"));
        const currentIndex = Math.max(0, buttons.indexOf(document.activeElement));
        let nextIndex = currentIndex;
        if (event.key === "Home") nextIndex = 0;
        else if (event.key === "End") nextIndex = buttons.length - 1;
        else if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (currentIndex + 1) % buttons.length;
        else nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
        event.preventDefault();
        const nextButton = buttons[nextIndex];
        nextButton.focus();
        applyColorTheme(nextButton.dataset.colorThemeOption, true);
      });

      document.addEventListener("click", (event) => {
        if (!control.contains(event.target)) closeColorThemePanel();
      });

      control.addEventListener("keydown", (event) => {
        if (event.key !== "Escape" || panel.hidden) return;
        closeColorThemePanel();
        toggle.focus();
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

    const latestDate = core.latestAddedDate(window.SAKURA_DATA?.sites);
    document.querySelectorAll("[data-data-updated]").forEach((item) => {
      if (!latestDate) {
        item.hidden = true;
        return;
      }
      const [, year, month, day] = latestDate.match(/^(\d{4})-(\d{2})-(\d{2})$/) || [];
      const value = item.querySelector("[data-data-updated-value]");
      if (value) value.textContent = `导航数据更新于 ${year}年${Number(month)}月${Number(day)}日`;
      item.hidden = false;
    });
  }

  function setupHome() {
    const gridRoot = document.querySelector("[data-site-groups]");
    if (!gridRoot) return true;
    const data = window.SAKURA_DATA;
    if (!data) return false;

    const search = document.querySelector("[data-site-search]");
    const searchForm = document.querySelector("[data-search-form]");
    const clear = document.querySelector("[data-search-clear]");
    const result = document.querySelector("[data-search-result]");
    const empty = document.querySelector("[data-empty-state]");
    const emptyTitle = document.querySelector("[data-empty-title]");
    const emptyMessage = document.querySelector("[data-empty-message]");
    const resetFilters = document.querySelector("[data-reset-filters]");
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
    const utilityStatus = document.querySelector("[data-utility-status]");
    const hiddenConfig = data.hiddenSection;
    const hiddenPanel = document.querySelector("[data-hidden-section]");
    const hiddenSitesRoot = document.querySelector("[data-hidden-section-sites]");
    const hiddenEmpty = document.querySelector("[data-hidden-section-empty]");
    const hiddenExit = document.querySelector("[data-hidden-section-exit]");
    const hiddenName = document.querySelector("[data-hidden-section-name]");
    const hiddenWelcome = document.querySelector("[data-hidden-section-welcome]");
    const hiddenCount = document.querySelector("[data-hidden-section-count]");
    const categoryMap = new Map(data.categories.map((category) => [category.id, category]));
    const categoryAliases = new Map([["ppt", "software"]]);
    const siteMap = new Map(data.sites.map((site) => [site.id, site]));
    const validIds = new Set(siteMap.keys());
    const validViews = new Set(Array.from(viewSwitcher?.querySelectorAll("[data-view]") || [], (button) => button.dataset.view));
    const state = { terms: [], category: "all", view: "all", hidden: false };
    let scrollRequestToken = 0;
    let hiddenTransitionToken = 0;
    let normalScrollY = 0;
    let categoryControlFrame = 0;
    let selectedCardIndex = -1;
    let utilityResetTimer = 0;
    const now = new Date();
    const currentDay = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const normalSearchPlaceholder = search?.getAttribute("placeholder") || "";
    empty?.setAttribute("data-result-scroll-target", "empty");

    const platform = navigator.userAgentData?.platform || navigator.platform || navigator.userAgent;
    if (shortcut) shortcut.textContent = /Mac|iPhone|iPad|iPod/i.test(platform) ? "⌘ K" : "Ctrl K";

    function restoreUrlState() {
      const params = new URLSearchParams(window.location.search);
      const requestedQuery = params.get("q") || "";
      const query = core.matchesPassphrase(requestedQuery, hiddenConfig?.passphrase) ? "" : requestedQuery;
      const requestedCategory = params.get("category") || "all";
      const category = categoryAliases.get(requestedCategory) || requestedCategory;
      const view = params.get("view") || "all";
      if (search) search.value = query;
      state.terms = core.queryTerms(query);
      state.category = category === "all" || categoryMap.has(category) ? category : "all";
      state.view = validViews.has(view) ? view : "all";
    }

    function updateUrlState() {
      const url = new URL(window.location.href);
      const query = state.hidden ? "" : (search?.value.trim() || "");
      if (query) url.searchParams.set("q", query);
      else url.searchParams.delete("q");
      if (state.category !== "all") url.searchParams.set("category", state.category);
      else url.searchParams.delete("category");
      if (state.view !== "all") url.searchParams.set("view", state.view);
      else url.searchParams.delete("view");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }

    restoreUrlState();

    let recentVisits = core.cleanRecentVisits(readJsonStorage(recentVisitsKey, []), validIds, 12);
    writeJsonStorage(recentVisitsKey, recentVisits);

    function createButton(label, value, type, count) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "filter-chip";
      const buttonLabel = document.createElement("span");
      buttonLabel.textContent = label;
      button.appendChild(buttonLabel);
      if (Number.isInteger(count)) {
        const countLabel = document.createElement("span");
        countLabel.className = "filter-chip-count";
        countLabel.textContent = String(count);
        button.appendChild(countLabel);
        button.setAttribute("aria-label", `${label}，${count} 个网站`);
      }
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

    function matchesView(site) {
      if (state.view === "recent") return Boolean(site.addedAt);
      if (state.view === "history") return recentVisits.some((entry) => entry.id === site.id);
      return true;
    }

    function filteredSites() {
      const sites = data.sites.filter((site) => {
        const category = categoryMap.get(site.category);
        const matchesQuery = core.siteMatchesTerms(site, category ? category.name : "", state.terms);
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

    function appendHighlightedText(node, value) {
      core.highlightSegments(value, state.terms).forEach((segment) => {
        if (!segment.match) {
          node.appendChild(document.createTextNode(segment.text));
          return;
        }
        const mark = document.createElement("mark");
        mark.className = "search-mark";
        mark.textContent = segment.text;
        node.appendChild(mark);
      });
    }

    function formatAddedDate(value) {
      const [, month, day] = String(value).split("-");
      return `${Number(month)}月${Number(day)}日`;
    }

    function createSiteCard(site, options = {}) {
      const hiddenCard = options.hidden === true;
      const cardActions = core.siteActions(site);
      const hasCardActions = cardActions.length > 0;
      const dualLinkCard = cardActions.length === 2;
      const article = document.createElement("article");
      article.className = "site-card";
      article.dataset.siteId = site.id;
      article.classList.toggle("has-card-actions", hasCardActions);
      article.classList.toggle("has-single-action", cardActions.length === 1);
      article.classList.toggle("has-dual-links", dualLinkCard);

      const cardBody = document.createElement("div");
      cardBody.className = "site-card-link";

      const siteCategory = options.category || categoryMap.get(site.category);
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
      appendHighlightedText(title, site.name);
      const description = document.createElement("p");
      description.className = "site-card-description";
      appendHighlightedText(description, site.description);
      const meta = document.createElement("span");
      meta.className = "site-card-meta";
      if (!hiddenCard) {
        const category = document.createElement("span");
        category.className = "site-card-category";
        category.textContent = siteCategory?.name || site.category;
        meta.appendChild(category);
      }
      if (!hiddenCard && core.isNewSite(site.addedAt, currentDay, 14)) {
        const newBadge = document.createElement("span");
        newBadge.className = "site-card-new";
        newBadge.textContent = "NEW";
        newBadge.setAttribute("aria-label", "最近收录");
        meta.appendChild(newBadge);
      }
      if (!hiddenCard && state.view === "recent" && site.addedAt) {
        const addedDate = document.createElement("time");
        addedDate.className = "site-card-date";
        addedDate.dateTime = site.addedAt;
        addedDate.textContent = `收录于 ${formatAddedDate(site.addedAt)}`;
        meta.appendChild(addedDate);
      }

      copy.append(title, description);
      if (meta.childElementCount) copy.appendChild(meta);
      if (hasCardActions) {
        const actions = document.createElement("div");
        actions.className = "site-card-actions";
        cardActions.forEach((action) => {
          const actionLink = document.createElement("a");
          actionLink.className = "site-card-action";
          actionLink.href = action.url;
          actionLink.target = "_blank";
          actionLink.rel = "noopener noreferrer";
          actionLink.textContent = action.label;
          actionLink.setAttribute("aria-label", `通过${action.label}打开 ${site.name}`);
          if (!hiddenCard) actionLink.addEventListener("click", () => trackVisit(site.id));
          actions.appendChild(actionLink);
        });
        copy.appendChild(actions);
      }
      cardBody.append(iconBox, copy);
      article.appendChild(cardBody);
      return article;
    }

    function resetKeyboardSelection() {
      selectedCardIndex = -1;
      document.querySelectorAll(".site-card.is-keyboard-selected").forEach((card) => {
        card.classList.remove("is-keyboard-selected");
      });
    }

    function activeCardRoot() {
      return state.hidden ? hiddenSitesRoot : gridRoot;
    }

    function moveKeyboardSelection(direction) {
      const cards = Array.from(activeCardRoot()?.querySelectorAll(".site-card") || []);
      if (!cards.length) return;
      cards.forEach((card) => card.classList.remove("is-keyboard-selected"));
      selectedCardIndex = selectedCardIndex < 0
        ? (direction > 0 ? 0 : cards.length - 1)
        : (selectedCardIndex + direction + cards.length) % cards.length;
      const card = cards[selectedCardIndex];
      card.classList.add("is-keyboard-selected");
      card.scrollIntoView({ block: "nearest", behavior: reducedMotion ? "auto" : "smooth" });
      const siteName = card.querySelector(".site-card-title")?.textContent?.trim();
      if (siteName) {
        announceUtility(`已选择 ${siteName}，按 Enter 选择操作按钮`);
      }
    }

    function openKeyboardSelection() {
      const cards = Array.from(activeCardRoot()?.querySelectorAll(".site-card") || []);
      const card = cards[selectedCardIndex];
      const firstAction = card?.querySelector(".site-card-action");
      if (firstAction) {
        firstAction.focus();
        announceUtility(`已聚焦 ${firstAction.textContent} 按钮，按 Enter 打开`);
      }
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
      if (state.view === "history" && !state.terms.length && state.category === "all") {
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
        const groups = {
          history: { id: "history", name: "最近访问", icon: "fa-history" },
          recent: { id: "recent", name: "最近收录", icon: "fa-clock" }
        };
        const group = groups[state.view];
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
        const matchedCategories = new Set(sites.map((site) => site.category)).size;
        result.textContent = state.terms.length || state.category !== "all" || state.view !== "all"
          ? `找到 ${sites.length} / ${data.sites.length} 个站点 · 涉及 ${matchedCategories} 个板块`
          : `${data.sites.length} 个站点 · ${data.categories.length} 个分类`;
      }
      scheduleCategoryScrollControls();
    }

    function renderHiddenSection() {
      if (!hiddenConfig || !hiddenSitesRoot) return;
      const sites = Array.isArray(hiddenConfig.sites) ? hiddenConfig.sites : [];
      const fragment = document.createDocumentFragment();
      sites.forEach((site) => {
        fragment.appendChild(createSiteCard(site, { hidden: true, category: hiddenConfig }));
      });
      hiddenSitesRoot.replaceChildren(fragment);
      if (hiddenEmpty) hiddenEmpty.hidden = sites.length > 0;
      if (hiddenCount) hiddenCount.textContent = String(sites.length);
      if (hiddenName) hiddenName.textContent = hiddenConfig.name;
      if (hiddenWelcome) hiddenWelcome.textContent = hiddenConfig.welcome;
      document.querySelectorAll("[data-hidden-section-icon]").forEach((icon) => {
        icon.className = `fas ${hiddenConfig.icon || "fa-door-open"}`;
      });
    }

    function enterHiddenSection() {
      if (!hiddenConfig || !hiddenPanel || state.hidden) return;
      normalScrollY = window.scrollY;
      state.hidden = true;
      state.terms = [];
      hiddenTransitionToken += 1;
      scrollRequestToken += 1;
      resetKeyboardSelection();
      if (search) {
        search.value = "";
        search.readOnly = true;
        search.placeholder = `已进入${hiddenConfig.name}`;
      }
      clear?.classList.remove("is-visible");
      if (shortcut) shortcut.hidden = true;
      root.classList.add("is-hidden-world");
      hiddenPanel.hidden = false;
      renderHiddenSection();
      updateUrlState();

      const token = hiddenTransitionToken;
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (!state.hidden || token !== hiddenTransitionToken) return;
          const offset = visibleStickyHeight(siteHeader) + 18;
          const top = window.scrollY + hiddenPanel.getBoundingClientRect().top - offset;
          window.scrollTo({ top: Math.max(0, top), behavior: reducedMotion ? "auto" : "smooth" });
          hiddenExit?.focus({ preventScroll: true });
        });
      });
    }

    function exitHiddenSection() {
      if (!state.hidden) return;
      state.hidden = false;
      state.terms = [];
      hiddenTransitionToken += 1;
      root.classList.remove("is-hidden-world");
      hiddenPanel.hidden = true;
      if (search) {
        search.value = "";
        search.readOnly = false;
        search.placeholder = normalSearchPlaceholder;
      }
      clear?.classList.remove("is-visible");
      if (shortcut) shortcut.hidden = false;
      updateUrlState();
      render();

      const token = hiddenTransitionToken;
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (state.hidden || token !== hiddenTransitionToken) return;
          window.scrollTo({ top: Math.max(0, normalScrollY), behavior: reducedMotion ? "auto" : "smooth" });
          viewSwitcher?.querySelector(`[data-view="${state.view}"]`)?.focus({ preventScroll: true });
        });
      });
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

      const message = copied ? "当前板块链接已复制" : "复制失败，请手动复制地址栏链接";
      if (copyViewLabel) copyViewLabel.textContent = copied ? "已复制当前板块" : "复制失败";
      announceUtility(message);
      window.setTimeout(() => {
        if (copyViewLabel) copyViewLabel.textContent = "复制当前板块链接";
      }, 1800);
    }

    function announceUtility(message) {
      if (!utilityStatus) return;
      utilityStatus.textContent = message;
      window.clearTimeout(utilityResetTimer);
      utilityResetTimer = window.setTimeout(() => {
        utilityStatus.textContent = "";
      }, 3200);
    }

    if (categoryBar) {
      categoryBar.appendChild(createButton("全部", "all", "category", data.sites.length));
      data.categories.forEach((category) => {
        const count = data.sites.filter((site) => site.category === category.id).length;
        categoryBar.appendChild(createButton(category.name, category.id, "category", count));
      });
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
      scheduleResultScroll();
    });

    clearRecent?.addEventListener("click", () => {
      recentVisits = [];
      writeJsonStorage(recentVisitsKey, recentVisits);
      render();
    });

    searchForm?.addEventListener("submit", (event) => event.preventDefault());
    hiddenExit?.addEventListener("click", exitHiddenSection);
    copyView?.addEventListener("click", copyCurrentView);
    resetFilters?.addEventListener("click", () => {
      if (search) search.value = "";
      state.terms = [];
      state.category = "all";
      state.view = "all";
      clear?.classList.remove("is-visible");
      if (shortcut) shortcut.hidden = false;
      updatePressed(categoryBar, "category", state.category);
      updatePressed(viewSwitcher, "view", state.view);
      updateUrlState();
      render();
      scheduleResultScroll();
    });

    if (search) {
      search.addEventListener("input", () => {
        if (core.matchesPassphrase(search.value, hiddenConfig?.passphrase)) {
          enterHiddenSection();
          return;
        }
        if (state.hidden) return;
        state.terms = core.queryTerms(search.value);
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
        if (state.hidden) {
          exitHiddenSection();
          return;
        }
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
          if (state.hidden) hiddenExit?.focus();
          else {
            search.focus();
            search.select();
          }
        }
        if (event.key === "Escape" && state.hidden) {
          event.preventDefault();
          exitHiddenSection();
        } else if (event.key === "Escape" && (document.activeElement === search || search.value)) {
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
    renderHiddenSection();
    return true;
  }

  document.addEventListener("DOMContentLoaded", () => {
    setupGlobalUI();
    if (setupHome()) {
      root.dataset.appReady = "true";
      document.querySelectorAll("[data-app-fallback]").forEach((node) => { node.hidden = true; });
    }
  });
})();

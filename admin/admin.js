(function () {
  "use strict";

  const state = {
    csrf: "",
    user: "",
    data: { categories: [], sites: [], hiddenCollections: [], auditLogs: [], revision: 0 },
    analytics: null,
    analyticsLoading: false,
    versions: [],
    versionsLoading: false,
    batchSites: [],
    editingSiteId: null,
    editingCategoryId: null,
    idTouched: false,
    toastTimer: 0
  };

  const loginPage = document.querySelector("[data-login-page]");
  const sessionLoading = document.querySelector("[data-session-loading]");
  const app = document.querySelector("[data-admin-app]");
  const loginForm = document.querySelector("[data-login-form]");
  const loginError = document.querySelector("[data-login-error]");
  const siteDialog = document.querySelector("[data-site-dialog]");
  const siteForm = document.querySelector("[data-site-form]");
  const categoryDialog = document.querySelector("[data-category-dialog]");
  const categoryForm = document.querySelector("[data-category-form]");
  const batchDialog = document.querySelector("[data-batch-dialog]");
  const batchForm = document.querySelector("[data-batch-form]");
  const confirmDialog = document.querySelector("[data-confirm-dialog]");
  const hiddenSettingsForms = Array.from(document.querySelectorAll("[data-hidden-settings-form]"));
  const announcementForm = document.querySelector("[data-announcement-form]");
  const toast = document.querySelector("[data-toast]");
  const trackedForms = [siteForm, categoryForm, batchForm, ...hiddenSettingsForms, announcementForm].filter(Boolean);
  const formBaselines = new WeakMap();
  const dialogClosePending = new WeakSet();
  let previewMeasureFrame = 0;

  const root = document.documentElement;
  const themeCore = window.SAKURA_CORE;
  const adminCore = window.SAKURA_ADMIN_CORE;
  const themeKey = "sakura-theme";
  const colorThemeKey = "sakura-color-theme";
  const sessionDraftKey = "sakura-admin-session-draft-v1";
  const sessionDraftMaximumAge = 24 * 60 * 60 * 1000;
  const adminRequestTimeout = 18000;
  const systemDarkMode = window.matchMedia("(prefers-color-scheme: dark)");
  const numberFormatter = new Intl.NumberFormat("zh-CN");
  let countryFormatter = null;
  try { countryFormatter = new Intl.DisplayNames(["zh-CN"], { type: "region" }); } catch (_) { countryFormatter = null; }
  const defaultPrivateTypes = [
    { id: "all", name: "全部", icon: "fa-layer-group" },
    { id: "app", name: "已购应用", icon: "fa-mobile-alt" },
    { id: "website", name: "私人网站", icon: "fa-globe" },
    { id: "resource", name: "备用资源", icon: "fa-archive" },
    { id: "other", name: "未分类", icon: "fa-tags" }
  ];
  const appStoreRegionNames = { cn: "国区", us: "美区" };

  function createElement(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function icon(className) {
    const node = createElement("i", `fas ${className || "fa-link"}`);
    node.setAttribute("aria-hidden", "true");
    return node;
  }

  function readTextStorage(key) {
    try { return window.localStorage.getItem(key); } catch (_) { return null; }
  }

  function writeTextStorage(key, value) {
    try { window.localStorage.setItem(key, value); } catch (_) { /* Theme still applies for this page. */ }
  }

  function removeTextStorage(key) {
    try { window.localStorage.removeItem(key); } catch (_) { /* Theme still applies for this page. */ }
  }

  function applyAdminTheme(mode, persist) {
    if (!themeCore) return;
    const validMode = themeCore.normalizeThemeMode(mode);
    const theme = themeCore.resolveTheme(validMode, systemDarkMode.matches);
    root.dataset.themeMode = validMode;
    root.dataset.theme = theme;
    if (persist) {
      if (validMode === "auto") removeTextStorage(themeKey);
      else writeTextStorage(themeKey, validMode);
    }

    const modes = {
      auto: { current: "跟随系统", next: "浅色模式", icon: "fas fa-adjust" },
      light: { current: "浅色模式", next: "深色模式", icon: "fas fa-sun" },
      dark: { current: "深色模式", next: "跟随系统", icon: "fas fa-moon" }
    };
    const current = modes[validMode];
    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
      button.setAttribute("aria-label", `当前主题：${current.current}；点击切换到${current.next}`);
      button.setAttribute("title", `主题：${current.current}`);
      const buttonIcon = button.querySelector("i");
      if (buttonIcon) buttonIcon.className = current.icon;
    });
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.content = theme === "dark" ? "#0d0f14" : "#f7f8fa";
  }

  function applyAdminColorTheme(themeId, persist) {
    if (!themeCore) return;
    const validThemeId = themeCore.normalizeColorTheme(themeId);
    const selectedTheme = themeCore.colorThemes.find((theme) => theme.id === validThemeId);
    root.dataset.colorTheme = validThemeId;
    if (persist) {
      if (validThemeId === "default") removeTextStorage(colorThemeKey);
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

  function setupAdminThemeControls() {
    if (!themeCore) return;
    applyAdminTheme(themeCore.normalizeThemeMode(readTextStorage(themeKey)), false);
    applyAdminColorTheme(themeCore.normalizeColorTheme(readTextStorage(colorThemeKey)), false);

    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
      button.addEventListener("click", () => applyAdminTheme(themeCore.nextThemeMode(root.dataset.themeMode), true));
    });

    const syncSystemTheme = () => {
      if (root.dataset.themeMode === "auto") applyAdminTheme("auto", false);
    };
    if (systemDarkMode.addEventListener) systemDarkMode.addEventListener("change", syncSystemTheme);
    else systemDarkMode.addListener?.(syncSystemTheme);

    document.querySelectorAll("[data-color-theme-control]").forEach((control) => {
      const toggle = control.querySelector("[data-color-theme-toggle]");
      const panel = control.querySelector("[data-color-theme-panel]");
      if (!toggle || !panel) return;

      const options = themeCore.colorThemes.map((theme) => {
        const button = createElement("button", "color-theme-option");
        button.type = "button";
        button.dataset.colorThemeOption = theme.id;
        button.setAttribute("role", "radio");
        button.setAttribute("aria-checked", "false");
        const swatch = createElement("span", "color-theme-swatch");
        swatch.style.setProperty("--swatch", theme.color);
        swatch.setAttribute("aria-hidden", "true");
        const label = createElement("span", "", theme.name);
        const check = icon("fa-check");
        check.hidden = true;
        button.append(swatch, label, check);
        button.addEventListener("click", () => {
          applyAdminColorTheme(theme.id, true);
          closePanel();
          toggle.focus();
        });
        return button;
      });
      panel.replaceChildren(...options);
      applyAdminColorTheme(root.dataset.colorTheme, false);

      function closePanel() {
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
        applyAdminColorTheme(nextButton.dataset.colorThemeOption, true);
      });

      document.addEventListener("click", (event) => {
        if (!control.contains(event.target)) closePanel();
      });
      control.addEventListener("keydown", (event) => {
        if (event.key !== "Escape" || panel.hidden) return;
        closePanel();
        toggle.focus();
      });
    });
  }

  function actionButton(iconName, label, handler, danger = false) {
    const button = createElement("button", `table-action${danger ? " danger-action" : ""}`);
    button.type = "button";
    button.title = label;
    button.setAttribute("aria-label", label);
    button.appendChild(icon(iconName));
    button.addEventListener("click", handler);
    return button;
  }

  function showToast(message, isError = false) {
    window.clearTimeout(state.toastTimer);
    toast.textContent = message;
    toast.classList.toggle("is-error", isError);
    toast.hidden = false;
    state.toastTimer = window.setTimeout(() => { toast.hidden = true; }, 3600);
  }

  function setFormBusy(form, busy) {
    const button = form?.querySelector("button[type='submit']");
    if (!button) return;
    button.disabled = busy;
    button.setAttribute("aria-busy", String(busy));
  }

  function formSnapshot(form) {
    const values = [];
    Array.from(form.elements).forEach((field) => {
      if (!field.name || field.disabled || ["button", "submit"].includes(field.type)) return;
      if (["checkbox", "radio"].includes(field.type) && !field.checked) return;
      values.push([field.name, field.value]);
    });
    return JSON.stringify(values);
  }

  function isFormDirty(form) {
    return formBaselines.has(form) && formBaselines.get(form) !== formSnapshot(form);
  }

  function updateUnsavedIndicator(form) {
    const indicator = form.querySelector("[data-unsaved-indicator]");
    if (indicator) indicator.hidden = !isFormDirty(form);
  }

  function setFormBaseline(form) {
    formBaselines.set(form, formSnapshot(form));
    updateUnsavedIndicator(form);
  }

  function hasUnsavedChanges() {
    return trackedForms.some((form) => isFormDirty(form));
  }

  function formFieldChanged(form, name) {
    try {
      const baseline = new Map(JSON.parse(formBaselines.get(form) || "[]"));
      return baseline.get(name) !== form.elements[name]?.value;
    } catch (_) {
      return false;
    }
  }

  function formDraftValues(form, includePasswords = false) {
    const values = {};
    Array.from(form.elements).forEach((field) => {
      if (!field.name || ["button", "submit", "file"].includes(field.type) || (!includePasswords && field.type === "password")) return;
      if (field.type === "radio") {
        if (field.checked) values[field.name] = field.value;
        return;
      }
      values[field.name] = field.type === "checkbox" ? field.checked : field.value;
    });
    return values;
  }

  function applyFormDraft(form, values) {
    if (!form || !values || typeof values !== "object") return;
    Object.entries(values).forEach(([name, value]) => {
      const fields = Array.from(form.elements).filter((field) => field.name === name);
      fields.forEach((field) => {
        if (field.type === "radio") field.checked = field.value === value;
        else if (field.type === "checkbox") field.checked = Boolean(value);
        else field.value = String(value ?? "");
      });
    });
  }

  function clearSessionDraft() {
    try { window.sessionStorage.removeItem(sessionDraftKey); } catch (_) { /* The current page still keeps its form state. */ }
  }

  function captureSessionDraft() {
    const draft = { version: 1, savedAt: Date.now() };
    if (siteDialog?.open && isFormDirty(siteForm)) {
      draft.site = { editingId: state.editingSiteId, values: formDraftValues(siteForm) };
    }
    if (categoryDialog?.open && isFormDirty(categoryForm)) {
      draft.category = { editingId: state.editingCategoryId, values: formDraftValues(categoryForm) };
    }
    if (batchDialog?.open && isFormDirty(batchForm)) draft.batch = { values: formDraftValues(batchForm) };
    draft.hiddenCollections = hiddenSettingsForms.filter((form) => isFormDirty(form)).map((form) => ({
      id: form.dataset.collectionId,
      values: formDraftValues(form),
      passphraseOmitted: formFieldChanged(form, "passphrase")
    }));
    if (isFormDirty(announcementForm)) draft.announcement = { values: formDraftValues(announcementForm) };
    if (!draft.site && !draft.category && !draft.batch && !draft.hiddenCollections.length && !draft.announcement) return false;
    try {
      window.sessionStorage.setItem(sessionDraftKey, JSON.stringify(draft));
      return true;
    } catch (_) {
      return false;
    }
  }

  function readSessionDraft() {
    try {
      const draft = JSON.parse(window.sessionStorage.getItem(sessionDraftKey) || "null");
      if (!draft || draft.version !== 1 || !Number.isFinite(draft.savedAt) || Date.now() - draft.savedAt > sessionDraftMaximumAge) {
        clearSessionDraft();
        return null;
      }
      return draft;
    } catch (_) {
      clearSessionDraft();
      return null;
    }
  }

  function restoreSessionDraft() {
    const draft = readSessionDraft();
    if (!draft) return null;
    let restored = false;
    (draft.hiddenCollections || []).forEach((item) => {
      const form = hiddenSettingsForms.find((candidate) => candidate.dataset.collectionId === item.id);
      if (!form || !item.values) return;
      applyFormDraft(form, item.values);
      if (item.passphraseOmitted) form.elements.passphrase.value = "";
      updatePrivateTypePreviews(form);
      updateUnsavedIndicator(form);
      restored = true;
    });
    if (draft.announcement?.values) {
      applyFormDraft(announcementForm, draft.announcement.values);
      renderAnnouncementPreview();
      updateUnsavedIndicator(announcementForm);
      restored = true;
    }
    if (draft.site?.values) {
      const existing = draft.site.editingId ? state.data.sites.find((site) => site.id === draft.site.editingId) : null;
      openSiteDialog(existing || null);
      if (draft.site.editingId && !existing) state.editingSiteId = null;
      applyFormDraft(siteForm, draft.site.values);
      updateSiteFormVisibility();
      updateCardPreview();
      updateUnsavedIndicator(siteForm);
      restored = true;
    } else if (draft.category?.values) {
      const existing = draft.category.editingId ? categoryById(draft.category.editingId) : null;
      openCategoryDialog(existing || null);
      if (draft.category.editingId && !existing) state.editingCategoryId = null;
      applyFormDraft(categoryForm, draft.category.values);
      updateUnsavedIndicator(categoryForm);
      restored = true;
    } else if (draft.batch?.values) {
      openBatchDialog();
      applyFormDraft(batchForm, draft.batch.values);
      parseBatchInput();
      updateUnsavedIndicator(batchForm);
      restored = true;
    }
    clearSessionDraft();
    return restored ? { passphraseOmitted: Boolean((draft.hiddenCollections || []).some((item) => item.passphraseOmitted)) } : null;
  }

  function syncDialogScrollLock() {
    const hasOpenDialog = [siteDialog, batchDialog, categoryDialog, confirmDialog].some((dialog) => Boolean(dialog?.open));
    root.classList.toggle("has-open-dialog", hasOpenDialog);
    document.body.classList.toggle("has-open-dialog", hasOpenDialog);
  }

  async function requestDialogClose(dialog) {
    const form = dialog?.querySelector("form");
    if (!form || !isFormDirty(form)) {
      dialog?.close();
      return;
    }
    if (dialogClosePending.has(dialog)) return;
    dialogClosePending.add(dialog);
    const discard = await confirmAction("放弃未保存修改", "当前修改还没有保存，确定关闭吗？");
    dialogClosePending.delete(dialog);
    if (!discard) return;
    setFormBaseline(form);
    dialog.close();
  }

  async function api(path, options = {}) {
    const method = options.method || "GET";
    const headers = { Accept: "application/json", ...(options.headers || {}) };
    if (method !== "GET" && method !== "HEAD" && state.csrf) headers["X-Sakura-CSRF"] = state.csrf;
    const contentMutation = method !== "GET" && method !== "HEAD" && (
      /^\/api\/admin\/(?:sites|categories)(?:\/|$)/.test(path)
      || /^\/api\/admin\/hidden-collections\/[a-z0-9-]+$/.test(path)
      || /^\/api\/admin\/versions\/\d+\/restore$/.test(path)
      || new Set(["/api/admin/reorder", "/api/admin/hidden-settings", "/api/admin/announcement", "/api/admin/import"]).has(path)
    );
    if (contentMutation && Number.isSafeInteger(state.data.revision)) {
      headers["X-Sakura-Revision"] = String(state.data.revision);
    }
    if (options.body && !(options.body instanceof FormData) && typeof options.body !== "string") {
      headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(options.body);
    }
    const controller = new AbortController();
    const timeoutTimer = window.setTimeout(() => controller.abort(), adminRequestTimeout);
    try {
      const response = await fetch(path, { ...options, method, headers, credentials: "same-origin", signal: controller.signal });
      const type = response.headers.get("Content-Type") || "";
      const payload = type.includes("application/json") ? await response.json() : null;
      if (!response.ok) {
        if (response.status === 401 && path !== "/api/admin/login") {
          const preserved = captureSessionDraft();
          showLogin(preserved ? "登录已失效。重新登录后会恢复未保存的内容。" : "");
        }
        const error = new Error(payload?.error || `请求失败（${response.status}）`);
        error.code = payload?.code;
        error.status = response.status;
        throw error;
      }
      return { payload, response };
    } catch (error) {
      if (error?.name === "AbortError") {
        const timeoutError = new Error("后台响应超时，请检查网络后重试。");
        timeoutError.code = "REQUEST_TIMEOUT";
        throw timeoutError;
      }
      if (error instanceof TypeError) {
        const networkError = new Error("无法连接后台，请检查网络后重试。");
        networkError.code = "NETWORK_ERROR";
        throw networkError;
      }
      throw error;
    } finally {
      window.clearTimeout(timeoutTimer);
    }
  }

  function captureConflictDraft(type) {
    if (type === "site") return { type, editingId: state.editingSiteId, values: formDraftValues(siteForm, true) };
    if (type === "category") return { type, editingId: state.editingCategoryId, values: formDraftValues(categoryForm, true) };
    if (type?.startsWith("settings:")) {
      const collectionId = type.slice("settings:".length);
      const form = hiddenSettingsForms.find((candidate) => candidate.dataset.collectionId === collectionId);
      return form ? { type: "settings", collectionId, values: formDraftValues(form, true) } : null;
    }
    if (type === "announcement") return { type, values: formDraftValues(announcementForm, true) };
    if (type === "batch") return { type, values: formDraftValues(batchForm, true) };
    return null;
  }

  function restoreConflictDraft(draft) {
    if (!draft) return false;
    if (draft.type === "site") {
      const existing = draft.editingId ? state.data.sites.find((site) => site.id === draft.editingId) : null;
      if (siteDialog.open) {
        setFormBaseline(siteForm);
        siteDialog.close();
      }
      openSiteDialog(existing || null);
      if (draft.editingId && !existing) state.editingSiteId = null;
      applyFormDraft(siteForm, draft.values);
      updateSiteFormVisibility();
      updateCardPreview();
      updateUnsavedIndicator(siteForm);
      return Boolean(draft.editingId && !existing);
    }
    if (draft.type === "category") {
      const existing = draft.editingId ? categoryById(draft.editingId) : null;
      if (categoryDialog.open) {
        setFormBaseline(categoryForm);
        categoryDialog.close();
      }
      openCategoryDialog(existing || null);
      if (draft.editingId && !existing) state.editingCategoryId = null;
      applyFormDraft(categoryForm, draft.values);
      updateUnsavedIndicator(categoryForm);
      return Boolean(draft.editingId && !existing);
    }
    if (draft.type === "announcement") {
      applyFormDraft(announcementForm, draft.values);
      renderAnnouncementPreview();
      updateUnsavedIndicator(announcementForm);
      return false;
    }
    if (draft.type === "batch") {
      openBatchDialog();
      applyFormDraft(batchForm, draft.values);
      parseBatchInput();
      updateUnsavedIndicator(batchForm);
      return false;
    }
    const settingsForm = hiddenSettingsForms.find((form) => form.dataset.collectionId === draft.collectionId);
    applyFormDraft(settingsForm, draft.values);
    if (settingsForm) updateUnsavedIndicator(settingsForm);
    return false;
  }

  async function handleContentConflict(error, draftType = null) {
    if (error?.code !== "CONTENT_CONFLICT") return false;
    const draft = captureConflictDraft(draftType);
    if (draft) {
      const reload = await confirmAction("检测到其他页面的更新", "当前输入不会丢失。是否重新加载数据库中的最新内容，再继续检查和保存？");
      if (!reload) {
        showToast("当前输入仍保留；重新保存前需要先加载最新内容。", true);
        return true;
      }
    }
    try {
      await loadData();
      const originalMissing = restoreConflictDraft(draft);
      showToast(originalMissing ? "最新内容已加载；原项目已被删除，当前输入已转为新增项目。" : draft ? "最新内容已加载，当前输入仍保留，请检查后重新保存。" : "内容已更新，请重新执行刚才的操作。", false);
    } catch (reloadError) {
      showToast(`加载最新内容失败：${reloadError.message}`, true);
    }
    return true;
  }

  function showLogin(message = "", tone = "error") {
    trackedForms.forEach((form) => setFormBaseline(form));
    [siteDialog, categoryDialog, confirmDialog].forEach((dialog) => {
      if (dialog?.open) {
        dialog.returnValue = "";
        dialog.close();
      }
    });
    state.csrf = "";
    state.user = "";
    sessionLoading.hidden = true;
    app.hidden = true;
    loginPage.hidden = false;
    loginError.hidden = !message;
    loginError.textContent = message;
    loginError.dataset.tone = tone;
    loginForm?.querySelector("[name='username']")?.focus();
  }

  function showApp() {
    sessionLoading.hidden = true;
    loginPage.hidden = true;
    app.hidden = false;
    document.querySelector("[data-current-user]").textContent = state.user;
  }

  function categoryById(id) {
    return state.data.categories.find((category) => category.id === id);
  }

  function hiddenCollectionById(id) {
    return state.data.hiddenCollections.find((collection) => collection.id === id);
  }

  function privateTypeDefinitions() {
    const configured = hiddenCollectionById("private-collection")?.privateTypes;
    return defaultPrivateTypes.map((fallback) => {
      const value = Array.isArray(configured) ? configured.find((item) => item?.id === fallback.id) : null;
      return value?.name && value?.icon ? { id: fallback.id, name: value.name, icon: value.icon } : { ...fallback };
    });
  }

  function privateTypeDefinition(id) {
    const definitions = privateTypeDefinitions();
    return definitions.find((item) => item.id === id) || definitions.find((item) => item.id === "other");
  }

  function privateTypeName(id) {
    return privateTypeDefinition(id)?.name || "未分类";
  }

  function categoryLabel(site) {
    return site.isHidden ? hiddenCollectionById(site.hiddenCollectionId)?.name || "隐藏收藏" : categoryById(site.category)?.name || site.category || "未分类";
  }

  function categoryIcon(site) {
    if (site.hiddenCollectionId === "private-collection") return privateTypeDefinition(site.privateType || "other")?.icon || "fa-tags";
    return site.isHidden ? hiddenCollectionById(site.hiddenCollectionId)?.icon || "fa-lock" : categoryById(site.category)?.icon || "fa-link";
  }

  function renderStats() {
    const publicSites = state.data.sites.filter((site) => !site.isHidden);
    const hiddenSites = state.data.sites.filter((site) => site.isHidden);
    document.querySelector("[data-stat-public]").textContent = String(publicSites.length);
    document.querySelector("[data-stat-hidden]").textContent = String(hiddenSites.length);
    document.querySelector("[data-stat-categories]").textContent = String(state.data.categories.length);
    document.querySelector("[data-stat-drafts]").textContent = String(state.data.sites.filter((site) => site.status === "draft").length);
  }

  function refreshCategoryControls() {
    const filter = document.querySelector("[data-site-category-filter]");
    const currentFilter = filter.value || "all";
    filter.replaceChildren(new Option("全部分类", "all"));
    state.data.categories.forEach((category) => filter.appendChild(new Option(category.name, category.id)));
    if (Array.from(filter.options).some((option) => option.value === currentFilter)) filter.value = currentFilter;

    const visibilityFilter = document.querySelector("[data-site-visibility-filter]");
    const currentVisibility = visibilityFilter.value || "all";
    visibilityFilter.replaceChildren(new Option("全部位置", "all"), new Option("仅普通分类", "public"));
    state.data.hiddenCollections.forEach((collection) => visibilityFilter.appendChild(new Option(`仅${collection.name}`, collection.id)));
    if (Array.from(visibilityFilter.options).some((option) => option.value === currentVisibility)) visibilityFilter.value = currentVisibility;

    const privateDefinitions = privateTypeDefinitions();
    const privateFilter = document.querySelector("[data-site-private-type-filter]");
    const currentPrivateFilter = privateFilter.value || "all";
    privateFilter.replaceChildren(...privateDefinitions.map((item) => new Option(item.id === "all" ? `全部${hiddenCollectionById("private-collection")?.name || "私人收藏"}类型` : item.name, item.id)));
    if (Array.from(privateFilter.options).some((option) => option.value === currentPrivateFilter)) privateFilter.value = currentPrivateFilter;

    const privateTypeSelect = siteForm.elements.privateType;
    const currentPrivateType = privateTypeSelect.value;
    privateTypeSelect.replaceChildren(...privateDefinitions.filter((item) => item.id !== "all").map((item) => {
      const option = new Option(item.id === "other" ? `${item.name}（旧数据）` : item.name, item.id);
      option.disabled = item.id === "other";
      return option;
    }));
    if (Array.from(privateTypeSelect.options).some((option) => option.value === currentPrivateType)) privateTypeSelect.value = currentPrivateType;
    Array.from(siteForm.elements.location).forEach((control) => {
      if (control.value === "public") return;
      const label = control.closest("label")?.querySelector("span");
      if (label) label.textContent = hiddenCollectionById(control.value)?.name || "隐藏收藏";
    });

    const select = siteForm.elements.category;
    const currentValue = select.value;
    select.replaceChildren(...state.data.categories.map((category) => new Option(category.name, category.id)));
    if (Array.from(select.options).some((option) => option.value === currentValue)) select.value = currentValue;
  }

  function filteredSites() {
    const query = document.querySelector("[data-site-search]").value.trim().toLocaleLowerCase("zh-CN");
    const category = document.querySelector("[data-site-category-filter]").value;
    const visibility = document.querySelector("[data-site-visibility-filter]").value;
    const status = document.querySelector("[data-site-status-filter]").value;
    const maintenance = document.querySelector("[data-site-maintenance-filter]").value;
    const privateType = document.querySelector("[data-site-private-type-filter]").value;
    const appStoreRegion = document.querySelector("[data-site-region-filter]").value;
    return state.data.sites.filter((site) => {
      const searchable = [site.id, site.name, site.description, site.url, site.urlLabel, site.secondaryUrl, site.secondaryUrlLabel, site.privateType, privateTypeName(site.privateType), site.appStoreRegion, appStoreRegionNames[site.appStoreRegion], ...(site.keywords || [])].join(" ").toLocaleLowerCase("zh-CN");
      return (!query || searchable.includes(query))
        && (category === "all" || site.category === category)
        && (visibility === "all" || (visibility === "public" ? !site.isHidden : site.hiddenCollectionId === visibility))
        && (privateType === "all" || site.privateType === privateType)
        && (appStoreRegion === "all" || (appStoreRegion === "unset" ? site.privateType === "app" && !site.appStoreRegion : site.appStoreRegion === appStoreRegion))
        && (status === "all" || site.status === status)
        && (maintenance === "all" || (site.maintenanceStatus || "normal") === maintenance);
    });
  }

  function renderSites() {
    const sites = filteredSites();
    const body = document.querySelector("[data-sites-table]");
    const empty = document.querySelector("[data-sites-empty]");
    body.replaceChildren();
    document.querySelector("[data-site-result-count]").textContent = `${sites.length} 张卡片`;
    empty.hidden = sites.length > 0;
    sites.forEach((site) => {
      const row = document.createElement("tr");
      const siteCell = document.createElement("td");
      const siteWrap = createElement("div", "site-cell");
      const iconWrap = createElement("span", "site-cell-icon");
      iconWrap.appendChild(icon(categoryIcon(site)));
      const copy = createElement("div", "site-cell-copy");
      copy.append(createElement("strong", "", site.name), createElement("span", "", `${site.id} · ${site.url}`));
      siteWrap.append(iconWrap, copy);
      siteCell.appendChild(siteWrap);

      const categoryCell = document.createElement("td");
      categoryCell.dataset.label = "分类";
      categoryCell.appendChild(createElement("span", "table-badge", categoryLabel(site)));

      const typeCell = document.createElement("td");
      typeCell.dataset.label = "类型";
      const typeLabel = site.hiddenCollectionId === "private-collection" ? `${privateTypeName(site.privateType)} · ${site.urlLabel ? "双按钮" : "单按钮"}` : site.urlLabel ? "双按钮" : "单按钮";
      typeCell.appendChild(createElement("span", "table-badge", typeLabel));

      const statusCell = document.createElement("td");
      statusCell.dataset.label = "状态";
      statusCell.appendChild(createElement("span", `table-badge ${site.status === "draft" ? "is-draft" : "is-published"}`, site.status === "draft" ? "草稿" : "已发布"));
      if ((site.maintenanceStatus || "normal") !== "normal") {
        statusCell.appendChild(createElement("span", `table-badge maintenance-badge is-${site.maintenanceStatus}`, site.maintenanceStatus === "review" ? "待复查" : "临时失效"));
      }
      if (site.hiddenCollectionId === "private-collection") {
        if (site.privateType === "app") statusCell.appendChild(createElement("span", "table-badge private-metadata-badge", appStoreRegionNames[site.appStoreRegion] || "地区未设置"));
      }

      const actionCell = document.createElement("td");
      const actions = createElement("div", "row-actions");
      actions.append(
        actionButton("fa-arrow-up", "向前移动", () => moveSite(site, -1)),
        actionButton("fa-arrow-down", "向后移动", () => moveSite(site, 1)),
        actionButton("fa-copy", "复制卡片", () => openSiteDialog(site, true)),
        actionButton("fa-edit", "编辑卡片", () => openSiteDialog(site)),
        actionButton("fa-trash-alt", "删除卡片", () => deleteSite(site), true)
      );
      actionCell.appendChild(actions);
      row.append(siteCell, categoryCell, typeCell, statusCell, actionCell);
      body.appendChild(row);
    });
  }

  function renderCategories() {
    const list = document.querySelector("[data-category-list]");
    list.replaceChildren();
    [...state.data.categories].sort((left, right) => left.sortOrder - right.sortOrder).forEach((category) => {
      const item = createElement("article", "category-admin-item");
      const iconWrap = createElement("span", "category-admin-icon");
      iconWrap.appendChild(icon(category.icon));
      const copy = createElement("div", "category-admin-copy");
      copy.append(createElement("strong", "", category.name), createElement("span", "", `${category.id} · ${category.icon}${category.isVisible ? "" : " · 已隐藏"}`));
      const count = createElement("span", "category-count", `${state.data.sites.filter((site) => !site.isHidden && site.category === category.id).length} 张卡片`);
      const actions = createElement("div", "row-actions");
      actions.append(
        actionButton("fa-arrow-up", "向前移动", () => moveCategory(category, -1)),
        actionButton("fa-arrow-down", "向后移动", () => moveCategory(category, 1)),
        actionButton("fa-edit", "编辑分类", () => openCategoryDialog(category)),
        actionButton("fa-trash-alt", "删除分类", () => deleteCategory(category), true)
      );
      item.append(iconWrap, copy, count, actions);
      list.appendChild(item);
    });
  }

  function auditDescription(log) {
    const actions = { create: "新增", "batch-create": "批量新增", update: "修改", delete: "删除", clear: "清空", import: "导入", restore: "恢复", seed: "初始化" };
    const types = { site: "卡片", category: "分类", settings: "设置", announcement: "公告", analytics: "访问统计", backup: "备份", navigation: "导航数据", "content-version": "历史版本" };
    const name = log.details?.name ? `“${log.details.name}”` : log.entityId;
    return `${actions[log.action] || log.action}${types[log.entityType] || log.entityType} ${name}`;
  }

  function renderAudit() {
    const list = document.querySelector("[data-audit-list]");
    const empty = document.querySelector("[data-audit-empty]");
    list.replaceChildren();
    empty.hidden = state.data.auditLogs.length > 0;
    state.data.auditLogs.forEach((log) => {
      const item = createElement("article", "audit-item");
      const iconWrap = createElement("span", "audit-icon");
      iconWrap.appendChild(icon(log.action === "delete" ? "fa-trash-alt" : log.action === "create" ? "fa-plus" : log.action === "import" ? "fa-upload" : "fa-edit"));
      const copy = createElement("div", "audit-copy");
      copy.append(createElement("strong", "", auditDescription(log)), createElement("span", "", `${log.entityType} · ${log.entityId}`));
      const time = createElement("time", "audit-time", formatDateTime(log.createdAt));
      item.append(iconWrap, copy, time);
      list.appendChild(item);
    });
  }

  function renderVersions() {
    const list = document.querySelector("[data-version-list]");
    const empty = document.querySelector("[data-version-empty]");
    list.replaceChildren();
    empty.hidden = state.versions.length > 0;
    state.versions.forEach((version) => {
      const item = createElement("article", "version-item");
      const iconWrap = createElement("span", "version-icon");
      iconWrap.appendChild(icon("fa-code-branch"));
      const copy = createElement("div", "version-copy");
      copy.append(
        createElement("strong", "", version.summary || `修订 ${version.revision}`),
        createElement("span", "", `修订 #${formattedNumber(version.revision)} · ${formattedNumber(version.siteCount)} 张卡片 · ${formattedNumber(version.categoryCount)} 个分类 · ${formatDateTime(version.createdAt)}`)
      );
      const restore = createElement("button", "secondary-button version-restore-button");
      restore.type = "button";
      restore.append(icon("fa-undo-alt"), createElement("span", "", "恢复此版本"));
      restore.addEventListener("click", () => restoreVersion(version));
      item.append(iconWrap, copy, restore);
      list.appendChild(item);
    });
  }

  async function loadVersions() {
    if (state.versionsLoading) return;
    state.versionsLoading = true;
    const refresh = document.querySelector("[data-versions-refresh]");
    refresh.disabled = true;
    try {
      const { payload } = await api("/api/admin/versions");
      state.versions = payload.data?.versions || [];
      renderVersions();
    } catch (error) {
      showToast(error.message, true);
    } finally {
      state.versionsLoading = false;
      refresh.disabled = false;
    }
  }

  async function restoreVersion(version) {
    if (!(await confirmAction("恢复历史版本", `确定恢复“${version.summary}”吗？当前内容会先自动保存为一个新历史版本，入口口令不会被历史版本改变。`))) return;
    try {
      await api(`/api/admin/versions/${version.id}/restore`, { method: "POST", body: {} });
      await Promise.all([loadData(), loadVersions()]);
      showToast(`已恢复修订 #${version.revision} 的内容。`);
    } catch (error) { if (!(await handleContentConflict(error))) showToast(error.message, true); }
  }

  function formattedNumber(value) {
    return numberFormatter.format(Number(value) || 0);
  }

  function countryName(code) {
    const normalized = String(code || "").toUpperCase();
    if (!normalized) return "未知国家或地区";
    try { return countryFormatter?.of(normalized) || normalized; } catch (_) { return normalized; }
  }

  function pageLabel(path) {
    const labels = { "/": "首页", "/index.html": "首页", "/about": "关于", "/about/": "关于" };
    return labels[path] || path || "未知页面";
  }

  function deviceLabel(type) {
    return { mobile: "手机", tablet: "平板", desktop: "电脑", other: "其他设备" }[type] || "其他设备";
  }

  function locationText(row) {
    const details = [row.region, row.city].filter(Boolean).filter((value, index, values) => values.indexOf(value) === index);
    return details.length ? `${countryName(row.country_code)} · ${details.join(" · ")}` : countryName(row.country_code);
  }

  function renderBreakdown(selector, rows, labelForRow = (row) => row.label || "未知") {
    const container = document.querySelector(selector);
    container.replaceChildren();
    const values = (rows || []).slice(0, 12);
    if (!values.length) {
      container.appendChild(createElement("div", "analytics-empty-copy", "当前范围暂无数据"));
      return;
    }
    const maximum = Math.max(...values.map((row) => Number(row.page_views) || 0), 1);
    values.forEach((row) => {
      const count = Number(row.page_views) || 0;
      const item = createElement("div", "analytics-breakdown-row");
      const label = createElement("span", "analytics-breakdown-label", labelForRow(row));
      label.title = label.textContent;
      const track = createElement("span", "analytics-breakdown-track");
      const fill = createElement("span", "analytics-breakdown-fill");
      fill.style.width = `${Math.max(2, count / maximum * 100)}%`;
      track.appendChild(fill);
      item.append(label, track, createElement("span", "analytics-breakdown-value", formattedNumber(count)));
      container.appendChild(item);
    });
  }

  function analyticsDateKeys(days) {
    const current = new Date(Date.now() + 8 * 60 * 60 * 1000);
    return Array.from({ length: days }, (_, index) => {
      const date = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate() - (days - 1 - index)));
      return date.toISOString().slice(0, 10);
    });
  }

  function renderAnalyticsTrend(data) {
    const container = document.querySelector("[data-analytics-trend]");
    container.replaceChildren();
    const values = new Map((data.daily || []).map((row) => [row.day, row]));
    const days = analyticsDateKeys(data.days || 7).map((day) => ({ day, ...(values.get(day) || { page_views: 0, visitors: 0 }) }));
    const maximum = Math.max(...days.map((row) => Number(row.page_views) || 0), 1);
    const labelStep = days.length <= 7 ? 1 : days.length <= 30 ? 5 : 15;
    container.style.minWidth = days.length > 30 ? `${days.length * 16}px` : "100%";
    days.forEach((row, index) => {
      const pageViews = Number(row.page_views) || 0;
      const visitors = Number(row.visitors) || 0;
      const column = createElement("div", "analytics-trend-column");
      column.title = `${row.day}：${formattedNumber(pageViews)} 次访问，${formattedNumber(visitors)} 位访客`;
      const wrap = createElement("div", "analytics-trend-bar-wrap");
      const bar = createElement("span", "analytics-trend-bar");
      bar.style.height = `${Math.max(2, pageViews / maximum * 100)}%`;
      wrap.appendChild(bar);
      const showLabel = index === 0 || index === days.length - 1 || index % labelStep === 0;
      column.append(wrap, createElement("span", "analytics-trend-label", showLabel ? row.day.slice(5) : ""));
      container.appendChild(column);
    });
  }

  function renderAnalyticsLocations(rows) {
    const container = document.querySelector("[data-analytics-locations]");
    container.replaceChildren();
    if (!rows?.length) {
      container.appendChild(createElement("div", "analytics-empty-copy", "当前范围暂无位置数据"));
      return;
    }
    rows.forEach((row) => {
      const item = createElement("div", "analytics-location-row");
      const copy = createElement("div", "analytics-location-copy");
      copy.append(createElement("strong", "", locationText(row)), createElement("span", "", `${formattedNumber(row.visitors)} 位匿名访客`));
      item.append(copy, createElement("span", "analytics-location-count", `${formattedNumber(row.page_views)} 次`));
      container.appendChild(item);
    });
  }

  function renderAnalyticsRecent(rows) {
    const body = document.querySelector("[data-analytics-recent]");
    const empty = document.querySelector("[data-analytics-recent-empty]");
    body.replaceChildren();
    empty.hidden = Boolean(rows?.length);
    (rows || []).forEach((row) => {
      const tableRow = document.createElement("tr");
      const timeCell = document.createElement("td");
      timeCell.dataset.label = "访问";
      const visitCopy = createElement("div", "analytics-visit-copy");
      visitCopy.append(createElement("strong", "", pageLabel(row.path)), createElement("span", "", formatDateTime(row.occurred_at)));
      timeCell.appendChild(visitCopy);
      const locationCell = createElement("td", "", locationText(row));
      locationCell.dataset.label = "地区";
      const deviceCell = createElement("td", "", `${deviceLabel(row.device_type)} · ${row.browser} · ${row.operating_system}`);
      deviceCell.dataset.label = "设备";
      const sourceCell = createElement("td", "", row.referrer_host || "直接访问");
      sourceCell.dataset.label = "来源";
      tableRow.append(timeCell, locationCell, deviceCell, sourceCell);
      body.appendChild(tableRow);
    });
  }

  function renderAnalytics() {
    const data = state.analytics;
    if (!data) return;
    const summary = data.summary || {};
    document.querySelector("[data-analytics-page-views]").textContent = formattedNumber(summary.page_views);
    document.querySelector("[data-analytics-visitors]").textContent = formattedNumber(summary.visitors);
    document.querySelector("[data-analytics-pages]").textContent = formattedNumber(summary.pages);
    document.querySelector("[data-analytics-countries]").textContent = formattedNumber(summary.countries);
    const enabled = document.querySelector("[data-analytics-enabled]");
    enabled.checked = data.enabled !== false;
    document.querySelector("[data-analytics-status-text]").textContent = data.enabled === false ? "匿名统计已暂停" : "匿名统计已启用";
    const clickData = data.clickAnalytics || {};
    document.querySelector("[data-click-total]").textContent = formattedNumber(clickData.total);
    document.querySelector("[data-click-analytics-enabled]").checked = clickData.enabled !== false;
    document.querySelector("[data-click-analytics-status]").textContent = clickData.enabled === false ? "卡片点击统计已暂停" : "卡片点击统计已启用";
    renderAnalyticsTrend(data);
    renderBreakdown("[data-analytics-devices]", data.devices, (row) => deviceLabel(row.label));
    renderBreakdown("[data-analytics-browsers]", data.browsers);
    renderBreakdown("[data-analytics-systems]", data.operatingSystems);
    renderBreakdown("[data-analytics-pages-list]", data.pages, (row) => pageLabel(row.label));
    renderBreakdown("[data-analytics-sources]", data.sources, (row) => row.label || "直接访问");
    renderBreakdown("[data-click-top]", (clickData.top || []).map((row) => ({ ...row, page_views: row.clicks })), (row) => row.name || row.site_id);
    renderBreakdown("[data-click-unvisited]", (clickData.unvisited || []).map((row) => ({ ...row, page_views: 0 })), (row) => row.name || row.site_id);
    renderAnalyticsLocations(data.locations);
    renderAnalyticsRecent(data.recent);
    document.querySelector("[data-analytics-loading]").hidden = true;
    document.querySelector("[data-analytics-error]").hidden = true;
    document.querySelector("[data-analytics-content]").hidden = false;
  }

  async function loadAnalytics() {
    if (state.analyticsLoading) return;
    state.analyticsLoading = true;
    const refresh = document.querySelector("[data-analytics-refresh]");
    refresh.disabled = true;
    document.querySelector("[data-analytics-error]").hidden = true;
    if (!state.analytics) document.querySelector("[data-analytics-loading]").hidden = false;
    try {
      const days = Number(document.querySelector("[data-analytics-range]").value) || 7;
      const { payload } = await api(`/api/admin/analytics?days=${days}`);
      state.analytics = payload.data;
      renderAnalytics();
    } catch (error) {
      document.querySelector("[data-analytics-loading]").hidden = true;
      document.querySelector("[data-analytics-content]").hidden = true;
      document.querySelector("[data-analytics-error]").hidden = false;
      document.querySelector("[data-analytics-error-message]").textContent = error.message;
    } finally {
      state.analyticsLoading = false;
      refresh.disabled = false;
    }
  }

  async function saveAnalyticsEnabled(event) {
    const control = event.currentTarget;
    const enabled = control.checked;
    control.disabled = true;
    try {
      await api("/api/admin/analytics/settings", { method: "PUT", body: { enabled } });
      if (state.analytics) state.analytics.enabled = enabled;
      document.querySelector("[data-analytics-status-text]").textContent = enabled ? "匿名统计已启用" : "匿名统计已暂停";
      showToast(enabled ? "已开始记录新的匿名访问。" : "已暂停记录新的匿名访问。");
      await loadData();
    } catch (error) {
      control.checked = !enabled;
      showToast(error.message, true);
    } finally {
      control.disabled = false;
    }
  }

  async function clearAnalytics() {
    if (!(await confirmAction("清空访问记录", "这会永久删除全部匿名访问统计，且无法恢复。确定继续吗？"))) return;
    const button = document.querySelector("[data-analytics-clear]");
    button.disabled = true;
    try {
      const { payload } = await api("/api/admin/analytics", { method: "DELETE" });
      state.analytics = null;
      showToast(`已清空 ${formattedNumber(payload.deleted)} 条访问记录。`);
      await Promise.all([loadAnalytics(), loadData()]);
    } catch (error) {
      showToast(error.message, true);
    } finally {
      button.disabled = false;
    }
  }

  async function saveClickAnalyticsEnabled(event) {
    const control = event.currentTarget;
    const enabled = control.checked;
    control.disabled = true;
    try {
      await api("/api/admin/click-analytics/settings", { method: "PUT", body: { enabled } });
      if (state.analytics?.clickAnalytics) state.analytics.clickAnalytics.enabled = enabled;
      document.querySelector("[data-click-analytics-status]").textContent = enabled ? "卡片点击统计已启用" : "卡片点击统计已暂停";
      showToast(enabled ? "已开始记录新的卡片点击。" : "已暂停记录新的卡片点击。");
      await loadData();
    } catch (error) {
      control.checked = !enabled;
      showToast(error.message, true);
    } finally {
      control.disabled = false;
    }
  }

  async function clearClickAnalytics() {
    if (!(await confirmAction("清空点击统计", "这会永久删除全部卡片点击次数，且不会影响页面访问统计。确定继续吗？"))) return;
    const button = document.querySelector("[data-click-analytics-clear]");
    button.disabled = true;
    try {
      const { payload } = await api("/api/admin/click-analytics", { method: "DELETE" });
      state.analytics = null;
      showToast(`已清空 ${formattedNumber(payload.deleted)} 条卡片日期统计。`);
      await Promise.all([loadAnalytics(), loadData()]);
    } catch (error) {
      showToast(error.message, true);
    } finally {
      button.disabled = false;
    }
  }

  function privateTypesFromForm(form) {
    return defaultPrivateTypes.map((fallback) => ({
      id: fallback.id,
      name: form.elements[`privateTypeName_${fallback.id}`]?.value || fallback.name,
      icon: form.elements[`privateTypeIcon_${fallback.id}`]?.value || fallback.icon
    }));
  }

  function updatePrivateTypePreviews(form) {
    if (form?.dataset.collectionId !== "private-collection") return;
    privateTypesFromForm(form).forEach((item) => {
      const preview = form.querySelector(`[data-private-type-setting="${item.id}"] [data-private-type-icon-preview]`);
      const safeIcon = /^fa-[a-z0-9-]+$/.test(item.icon) ? item.icon : "fa-link";
      if (preview) preview.className = `fas ${safeIcon}`;
    });
  }

  function renderSettings() {
    hiddenSettingsForms.forEach((form) => {
      const settings = hiddenCollectionById(form.dataset.collectionId) || {};
      form.elements.name.value = settings.name || "";
      form.elements.icon.value = settings.icon || (form.dataset.collectionId === "private-collection" ? "fa-lock" : "fa-door-open");
      form.elements.eyebrow.value = settings.eyebrow || (form.dataset.collectionId === "private-collection" ? "PRIVATE COLLECTION" : "SECRET COLLECTION");
      form.elements.passphrase.value = settings.passphrase || "";
      form.elements.welcome.value = settings.welcome || "";
      form.elements.enabled.checked = settings.enabled === true;
      if (form.dataset.collectionId === "private-collection") {
        const configured = Array.isArray(settings.privateTypes) ? settings.privateTypes : [];
        defaultPrivateTypes.forEach((fallback) => {
          const value = configured.find((item) => item?.id === fallback.id) || fallback;
          form.elements[`privateTypeName_${fallback.id}`].value = value.name;
          form.elements[`privateTypeIcon_${fallback.id}`].value = value.icon;
        });
        updatePrivateTypePreviews(form);
      }
      setFormBaseline(form);
    });

    const announcement = state.data.announcement || {};
    announcementForm.elements.text.value = announcement.text || "";
    announcementForm.elements.enabled.checked = announcement.enabled === true;
    announcementForm.elements.startsAt.value = dateTimeLocalValue(announcement.startsAt);
    announcementForm.elements.endsAt.value = dateTimeLocalValue(announcement.endsAt);
    renderAnnouncementPreview();
    setFormBaseline(announcementForm);

    const system = state.data.systemStatus || {};
    const maintenance = system.lastMaintenanceResult;
    const maintenanceText = system.lastMaintenanceAt
      ? `${formatDateTime(system.lastMaintenanceAt)} · 清理访问 ${formattedNumber(maintenance?.visitorEvents)}、点击 ${formattedNumber(maintenance?.siteClicks)}、记录 ${formattedNumber(maintenance?.auditLogs)}、版本 ${formattedNumber(maintenance?.contentVersions)}`
      : "尚未记录；系统每天北京时间 11:17 自动执行";
    document.querySelector("[data-system-database]").textContent = `D1 数据库：已连接 · 数据结构 v${system.schemaVersion || "?"}`;
    document.querySelector("[data-system-revision]").textContent = `内容修订：#${formattedNumber(system.contentRevision)}`;
    document.querySelector("[data-system-capacity]").textContent = `内容容量：${formattedNumber(system.siteCount)} / ${formattedNumber(system.siteLimit)} 张卡片 · ${formattedNumber(system.categoryCount)} / ${formattedNumber(system.categoryLimit)} 个分类`;
    document.querySelector("[data-system-retention]").textContent = `自动清理：访问 ${formattedNumber(system.analyticsRetentionDays)} 天 · 点击 ${formattedNumber(system.clickAnalyticsRetentionDays)} 天 · 修改记录 ${formattedNumber(system.auditRetentionDays)} 天`;
    document.querySelector("[data-system-maintenance]").textContent = `最近维护：${maintenanceText}`;
  }

  function renderAll() {
    renderStats();
    refreshCategoryControls();
    renderSites();
    renderCategories();
    renderSettings();
    renderAudit();
  }

  function formatDateTime(value) {
    if (!value) return "";
    const date = new Date(String(value).includes("T") ? value : `${value.replace(" ", "T")}Z`);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(date);
  }

  function localDateValue(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function dateTimeLocalValue(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
    return shifted.toISOString().slice(0, 16);
  }

  function dateTimeIsoValue(value) {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  }

  async function loadData() {
    const { payload } = await api("/api/admin/data");
    state.data = payload.data;
    renderAll();
  }

  async function selectTab(tabId) {
    const currentTab = document.querySelector("[data-tab].is-active")?.dataset.tab;
    if (currentTab === "settings" && tabId !== "settings" && (hiddenSettingsForms.some((form) => isFormDirty(form)) || isFormDirty(announcementForm))) {
      if (!(await confirmAction("放弃未保存修改", "设置页面还有内容没有保存，确定离开吗？"))) return;
      renderSettings();
    }
    document.querySelectorAll("[data-tab]").forEach((button) => button.classList.toggle("is-active", button.dataset.tab === tabId));
    document.querySelectorAll("[data-panel]").forEach((panel) => { panel.hidden = panel.dataset.panel !== tabId; });
    document.querySelector("[data-add-site]").hidden = tabId !== "sites";
    document.querySelector("[data-batch-add]").hidden = tabId !== "sites";
    document.querySelector("[data-content-stats]").hidden = tabId === "analytics";
    const copy = {
      sites: ["SAKURA 控制台", "内容管理", "修改并发布后，前台会直接读取数据库中的最新内容。"],
      analytics: ["匿名访问数据", "访问统计", "查看访问趋势、设备、来源、地区与卡片点击。"],
      categories: ["分类结构", "分类管理", "维护前台分类名称、图标、显示状态和排列顺序。"],
      settings: ["数据与安全", "设置与备份", "管理临时公告、隐藏收藏入口、数据库备份和部署状态。"],
      history: ["版本与审计", "修改记录", "查看、恢复历史内容版本和最近的后台操作。"]
    }[tabId] || ["SAKURA 控制台", "内容管理", "管理网站内容。"];
    document.querySelector("[data-dashboard-eyebrow]").textContent = copy[0];
    document.querySelector("[data-dashboard-title]").textContent = copy[1];
    document.querySelector("[data-dashboard-description]").textContent = copy[2];
    if (tabId === "analytics") await loadAnalytics();
    if (tabId === "history") await loadVersions();
  }

  function nextUniqueId(base, ignoredId = null) {
    const seed = base || "site";
    let id = seed;
    let suffix = 2;
    const used = new Set(state.data.sites.filter((site) => site.id !== ignoredId).map((site) => site.id));
    while (used.has(id)) { id = `${seed}-${suffix}`; suffix += 1; }
    return id;
  }

  function openSiteDialog(site = null, duplicate = false) {
    siteForm.reset();
    state.editingSiteId = site && !duplicate ? site.id : null;
    state.idTouched = Boolean(site && !duplicate);
    document.querySelector("[data-site-dialog-title]").textContent = duplicate ? "复制卡片" : site ? "编辑卡片" : "添加卡片";
    const fields = siteForm.elements;
    fields.id.disabled = Boolean(site && !duplicate);
    const idHelp = siteForm.querySelector("[data-id-help]");
    if (idHelp) idHelp.textContent = site && !duplicate ? "卡片 ID 创建后保持不变，不能修改。" : "根据名称或网址自动生成，可在保存前修改。";
    fields.status.value = site?.status || "published";
    fields.maintenanceStatus.value = site?.maintenanceStatus || "normal";
    fields.location.value = site?.isHidden ? site.hiddenCollectionId || "new-world" : "public";
    fields.privateType.value = site?.privateType || "app";
    fields.appStoreRegion.value = site?.appStoreRegion || "";
    fields.cardType.value = site?.urlLabel ? "dual" : "single";
    fields.addedAt.value = site?.addedAt || localDateValue();
    if (site) {
      fields.name.value = duplicate ? `${site.name} 副本` : site.name;
      fields.id.value = duplicate ? nextUniqueId(`${site.id}-copy`) : site.id;
      fields.description.value = site.description;
      fields.category.value = site.category || state.data.categories[0]?.id || "";
      fields.url.value = site.url;
      fields.urlLabel.value = site.urlLabel || "";
      fields.secondaryUrl.value = site.secondaryUrl || "";
      fields.secondaryUrlLabel.value = site.secondaryUrlLabel || "";
      fields.keywords.value = (site.keywords || []).join(", ");
    } else {
      fields.category.value = state.data.categories[0]?.id || "";
    }
    updateSiteFormVisibility();
    siteForm.querySelector(".dialog-scroll").scrollTop = 0;
    siteDialog.showModal();
    syncDialogScrollLock();
    setFormBaseline(siteForm);
    updateCardPreview();
    window.setTimeout(() => fields.name.focus(), 0);
  }

  function updateSiteFormVisibility() {
    const fields = siteForm.elements;
    const hidden = fields.location.value !== "public";
    const dual = fields.cardType.value === "dual";
    const privateCollection = fields.location.value === "private-collection";
    document.querySelector("[data-category-field]").hidden = hidden;
    document.querySelector("[data-added-field]").hidden = hidden;
    document.querySelector("[data-private-type-field]").hidden = !privateCollection;
    document.querySelector("[data-private-region-field]").hidden = !privateCollection || fields.privateType.value !== "app";
    document.querySelector("[data-dual-fields]").hidden = !dual;
    fields.category.required = !hidden;
    fields.privateType.required = privateCollection;
    fields.urlLabel.required = dual;
    if (!dual) {
      fields.urlLabel.value = "";
      fields.secondaryUrl.value = "";
      fields.secondaryUrlLabel.value = "";
    }
    if (!privateCollection) {
      fields.appStoreRegion.value = "";
    } else if (fields.privateType.value !== "app") {
      fields.appStoreRegion.value = "";
    }
  }

  function updateCardPreview() {
    const fields = siteForm.elements;
    const preview = document.querySelector("[data-card-preview]");
    const hidden = fields.location.value !== "public";
    const hiddenCollection = hidden ? hiddenCollectionById(fields.location.value) : null;
    const category = hidden ? null : categoryById(fields.category.value);
    document.querySelector("[data-preview-icon]").className = `fas ${hidden ? hiddenCollection?.icon || "fa-lock" : category?.icon || "fa-link"}`;
    document.querySelector("[data-preview-name]").textContent = fields.name.value.trim() || "卡片名称";
    document.querySelector("[data-preview-description]").textContent = fields.description.value.trim() || "卡片描述会显示在这里。";
    const privateDetails = fields.location.value === "private-collection"
      ? [fields.privateType.value === "app" ? appStoreRegionNames[fields.appStoreRegion.value] || "地区未设置" : null].filter(Boolean)
      : [];
    document.querySelector("[data-preview-category]").textContent = hidden ? [hiddenCollection?.name || "隐藏收藏", ...privateDetails].join(" · ") : category?.name || "所属分类";
    document.querySelector("[data-description-count]").textContent = String(fields.description.value.length);
    preview?.classList.toggle("is-unavailable", fields.maintenanceStatus.value === "unavailable");
    const actions = document.querySelector("[data-preview-actions]");
    actions.replaceChildren();
    if (fields.cardType.value === "dual") {
      actions.append(createElement("span", "", fields.urlLabel.value.trim() || "按钮一"), createElement("span", "", fields.secondaryUrl.value.trim() && fields.secondaryUrlLabel.value.trim() ? fields.secondaryUrlLabel.value.trim() : "暂无"));
    } else {
      actions.appendChild(createElement("span", "", "点击进入"));
    }
    schedulePreviewFitCheck();
  }

  function schedulePreviewFitCheck() {
    window.cancelAnimationFrame(previewMeasureFrame);
    previewMeasureFrame = window.requestAnimationFrame(() => {
      const preview = document.querySelector("[data-card-preview]");
      const name = document.querySelector("[data-preview-name]");
      const description = document.querySelector("[data-preview-description]");
      const status = document.querySelector("[data-preview-fit-status]");
      if (!siteDialog.open || !preview || !name || !description || !status) return;
      const fields = siteForm.elements;
      const nameClipped = Boolean(fields.name.value.trim()) && (name.scrollWidth > name.clientWidth + 1 || name.scrollHeight > name.clientHeight + 1);
      const descriptionClipped = Boolean(fields.description.value.trim()) && description.scrollHeight > description.clientHeight + 1;
      const message = nameClipped && descriptionClipped ? "名称和描述可能被截断" : nameClipped ? "名称可能被截断" : descriptionClipped ? "描述可能被截断" : "预计完整显示";
      status.textContent = message;
      status.classList.toggle("is-warning", nameClipped || descriptionClipped);
      preview.classList.toggle("has-overflow-warning", nameClipped || descriptionClipped);
    });
  }

  function sitePayloadFromForm() {
    const fields = siteForm.elements;
    const dual = fields.cardType.value === "dual";
    const hidden = fields.location.value !== "public";
    const secondaryUrl = dual ? fields.secondaryUrl.value.trim() : "";
    return {
      id: state.editingSiteId || fields.id.value,
      name: fields.name.value,
      description: fields.description.value,
      category: hidden ? null : fields.category.value,
      isHidden: hidden,
      hiddenCollectionId: hidden ? fields.location.value : null,
      privateType: fields.location.value === "private-collection" ? fields.privateType.value : null,
      appStoreRegion: fields.location.value === "private-collection" && fields.privateType.value === "app" ? fields.appStoreRegion.value || null : null,
      url: fields.url.value,
      urlLabel: dual ? fields.urlLabel.value : null,
      secondaryUrl: secondaryUrl || null,
      secondaryUrlLabel: secondaryUrl ? fields.secondaryUrlLabel.value : null,
      keywords: fields.keywords.value.split(/[,，\n]/).map((value) => value.trim()).filter(Boolean),
      addedAt: hidden ? null : fields.addedAt.value,
      sortOrder: state.editingSiteId ? state.data.sites.find((site) => site.id === state.editingSiteId)?.sortOrder || 0 : 9999,
      status: fields.status.value,
      maintenanceStatus: fields.maintenanceStatus.value
    };
  }

  async function saveSite(event) {
    event.preventDefault();
    const payload = sitePayloadFromForm();
    setFormBusy(siteForm, true);
    try {
      await api(state.editingSiteId ? `/api/admin/sites/${encodeURIComponent(state.editingSiteId)}` : "/api/admin/sites", { method: state.editingSiteId ? "PUT" : "POST", body: payload });
      setFormBaseline(siteForm);
      siteDialog.close();
      await loadData();
      showToast(state.editingSiteId ? "卡片已保存。" : "卡片已添加。 ");
    } catch (error) {
      if (!(await handleContentConflict(error, "site"))) showToast(error.message, true);
    } finally {
      setFormBusy(siteForm, false);
    }
  }

  async function deleteSite(site) {
    if (!(await confirmAction("删除卡片", `确定删除“${site.name}”吗？删除后可以通过之前导出的备份恢复。`))) return;
    try {
      await api(`/api/admin/sites/${encodeURIComponent(site.id)}`, { method: "DELETE" });
      await loadData();
      showToast("卡片已删除。 ");
    } catch (error) { if (!(await handleContentConflict(error))) showToast(error.message, true); }
  }

  async function moveSite(site, direction) {
    const group = state.data.sites.filter((item) => item.isHidden === site.isHidden && (site.isHidden ? item.hiddenCollectionId === site.hiddenCollectionId : item.category === site.category)).sort((left, right) => left.sortOrder - right.sortOrder);
    const index = group.findIndex((item) => item.id === site.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= group.length) return;
    [group[index], group[target]] = [group[target], group[index]];
    try {
      await api("/api/admin/reorder", { method: "POST", body: { entity: "sites", ids: group.map((item) => item.id) } });
      await loadData();
    } catch (error) { if (!(await handleContentConflict(error))) showToast(error.message, true); }
  }

  function openBatchDialog() {
    batchForm.reset();
    state.batchSites = [];
    document.querySelector("[data-batch-summary]").textContent = "尚未解析";
    document.querySelector("[data-batch-submit]").disabled = true;
    const preview = document.querySelector("[data-batch-preview]");
    preview.replaceChildren();
    const empty = createElement("div", "panel-empty compact-empty");
    empty.append(icon("fa-layer-group"), createElement("strong", "", "等待解析卡片数据"));
    preview.appendChild(empty);
    batchDialog.showModal();
    syncDialogScrollLock();
    setFormBaseline(batchForm);
    window.setTimeout(() => batchForm.elements.json.focus(), 0);
  }

  function parseBatchInput() {
    let rows;
    try { rows = JSON.parse(batchForm.elements.json.value); } catch (_) {
      state.batchSites = [];
      document.querySelector("[data-batch-summary]").textContent = "JSON 格式不正确";
      document.querySelector("[data-batch-submit]").disabled = true;
      showToast("批量数据不是有效的 JSON。", true);
      return false;
    }
    try {
      if (!Array.isArray(rows) || !rows.length) throw new Error("请提供至少一张卡片组成的 JSON 数组。");
      if (rows.length > 50) throw new Error("每次最多批量添加 50 张卡片。");
      const categoryIds = new Set(state.data.categories.map((category) => category.id));
      const knownIds = new Set(state.data.sites.map((site) => site.id));
      const knownNames = new Set(state.data.sites.map((site) => site.name.toLocaleLowerCase("zh-CN")));
      const knownUrls = new Set(state.data.sites.flatMap((site) => [site.url, site.secondaryUrl].filter(Boolean)));
      rows.forEach((row, index) => {
        const number = index + 1;
        if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error(`第 ${number} 条必须是卡片对象。`);
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(row.id || ""))) throw new Error(`第 ${number} 条卡片 ID 不正确。`);
        if (!String(row.name || "").trim() || !String(row.description || "").trim()) throw new Error(`第 ${number} 条缺少名称或描述。`);
        if (!row.isHidden && !categoryIds.has(row.category)) throw new Error(`第 ${number} 条所属分类不存在。`);
        if (row.isHidden && !hiddenCollectionById(row.hiddenCollectionId || "new-world")) throw new Error(`第 ${number} 条隐藏收藏不存在。`);
        const privateType = row.hiddenCollectionId === "private-collection" ? row.privateType || "other" : null;
        if (row.hiddenCollectionId === "private-collection" && !new Set(["app", "website", "resource"]).has(privateType)) throw new Error(`第 ${number} 条新私人卡片必须选择已购应用、私人网站或备用资源。`);
        if (row.hiddenCollectionId !== "private-collection" && row.privateType != null) throw new Error(`第 ${number} 条只有私人收藏可设置私人类型。`);
        if (row.hiddenCollectionId !== "private-collection" && row.appStoreRegion != null) throw new Error(`第 ${number} 条只有私人收藏应用可设置 App Store 地区。`);
        if (row.appStoreRegion != null && (row.privateType !== "app" || !new Set(["cn", "us"]).has(row.appStoreRegion))) throw new Error(`第 ${number} 条 App Store 地区不正确。`);
        const urls = [row.url, row.secondaryUrl].filter(Boolean);
        urls.forEach((value) => {
          let parsed;
          try { parsed = new URL(value); } catch (_) { throw new Error(`第 ${number} 条链接格式不正确。`); }
          if (!new Set(["http:", "https:"]).has(parsed.protocol)) throw new Error(`第 ${number} 条链接必须使用 HTTP(S)。`);
        });
        if ((row.secondaryUrl && !row.secondaryUrlLabel) || (!row.secondaryUrl && row.secondaryUrlLabel)) throw new Error(`第 ${number} 条第二按钮名称和链接必须同时填写。`);
        const nameKey = String(row.name).trim().toLocaleLowerCase("zh-CN");
        if (knownIds.has(row.id) || knownNames.has(nameKey)) throw new Error(`第 ${number} 条 ID 或名称与现有卡片重复。`);
        if (urls.some((url) => knownUrls.has(url))) throw new Error(`第 ${number} 条链接与现有卡片重复。`);
        knownIds.add(row.id);
        knownNames.add(nameKey);
        urls.forEach((url) => knownUrls.add(url));
      });
    } catch (error) {
      state.batchSites = [];
      document.querySelector("[data-batch-summary]").textContent = error.message;
      document.querySelector("[data-batch-submit]").disabled = true;
      showToast(error.message, true);
      return false;
    }
    state.batchSites = rows;
    document.querySelector("[data-batch-summary]").textContent = `已解析 ${rows.length} 张卡片`;
    document.querySelector("[data-batch-submit]").disabled = false;
    const preview = document.querySelector("[data-batch-preview]");
    const tableWrap = createElement("div", "table-wrap");
    const table = createElement("table", "data-table batch-preview-table");
    const head = document.createElement("thead");
    head.innerHTML = "<tr><th>卡片</th><th>位置 / 分类</th><th>按钮</th><th>状态</th></tr>";
    const body = document.createElement("tbody");
    rows.forEach((site) => {
      const row = document.createElement("tr");
      const card = document.createElement("td");
      const copy = createElement("div", "site-cell-copy");
      copy.append(createElement("strong", "", site.name), createElement("span", "", site.id));
      card.appendChild(copy);
      const privateDetails = site.hiddenCollectionId === "private-collection" ? [privateTypeName(site.privateType), site.privateType === "app" ? appStoreRegionNames[site.appStoreRegion] || "地区未设置" : null].filter(Boolean) : [];
      const categoryText = site.isHidden ? [hiddenCollectionById(site.hiddenCollectionId || "new-world")?.name || "隐藏收藏", ...privateDetails].join(" · ") : categoryById(site.category)?.name || site.category;
      const category = createElement("td", "", categoryText);
      category.dataset.label = "位置";
      const buttons = createElement("td", "", site.secondaryUrl ? "双按钮" : "单按钮");
      buttons.dataset.label = "按钮";
      const status = createElement("td", "", `${site.status === "draft" ? "草稿" : "发布"} · ${{ review: "待复查", unavailable: "临时失效" }[site.maintenanceStatus] || "正常"}`);
      status.dataset.label = "状态";
      row.append(card, category, buttons, status);
      body.appendChild(row);
    });
    table.append(head, body);
    tableWrap.appendChild(table);
    preview.replaceChildren(tableWrap);
    return true;
  }

  async function saveBatchSites(event) {
    event.preventDefault();
    if (!parseBatchInput()) return;
    setFormBusy(batchForm, true);
    try {
      const { payload } = await api("/api/admin/sites/batch", { method: "POST", body: { sites: state.batchSites } });
      setFormBaseline(batchForm);
      batchDialog.close();
      await loadData();
      showToast(`已批量添加 ${payload.created} 张卡片。`);
    } catch (error) { if (!(await handleContentConflict(error, "batch"))) showToast(error.message, true); }
    finally { setFormBusy(batchForm, false); }
  }

  function nextCategoryId(base) {
    const seed = base || "category";
    const used = new Set(state.data.categories.map((category) => category.id));
    let id = seed;
    let suffix = 2;
    while (used.has(id)) { id = `${seed}-${suffix}`; suffix += 1; }
    return id;
  }

  function openCategoryDialog(category = null) {
    categoryForm.reset();
    state.editingCategoryId = category?.id || null;
    document.querySelector("[data-category-dialog-title]").textContent = category ? "编辑分类" : "添加分类";
    const fields = categoryForm.elements;
    fields.id.disabled = Boolean(category);
    if (category) {
      fields.id.value = category.id;
      fields.name.value = category.name;
      fields.icon.value = category.icon;
      fields.isVisible.checked = category.isVisible;
    } else {
      fields.icon.value = "fa-link";
      fields.isVisible.checked = true;
    }
    categoryForm.querySelector(".dialog-scroll").scrollTop = 0;
    categoryDialog.showModal();
    syncDialogScrollLock();
    setFormBaseline(categoryForm);
    window.setTimeout(() => fields.name.focus(), 0);
  }

  async function saveCategory(event) {
    event.preventDefault();
    const fields = categoryForm.elements;
    const payload = {
      id: state.editingCategoryId || fields.id.value,
      name: fields.name.value,
      icon: fields.icon.value,
      isVisible: fields.isVisible.checked,
      sortOrder: state.editingCategoryId ? categoryById(state.editingCategoryId)?.sortOrder || 0 : 9999
    };
    setFormBusy(categoryForm, true);
    try {
      await api(state.editingCategoryId ? `/api/admin/categories/${encodeURIComponent(state.editingCategoryId)}` : "/api/admin/categories", { method: state.editingCategoryId ? "PUT" : "POST", body: payload });
      setFormBaseline(categoryForm);
      categoryDialog.close();
      await loadData();
      showToast(state.editingCategoryId ? "分类已保存。" : "分类已添加。 ");
    } catch (error) { if (!(await handleContentConflict(error, "category"))) showToast(error.message, true); }
    finally { setFormBusy(categoryForm, false); }
  }

  async function deleteCategory(category) {
    const count = state.data.sites.filter((site) => !site.isHidden && site.category === category.id).length;
    if (count) {
      showToast(`“${category.name}”中还有 ${count} 张卡片，请先移动或删除。`, true);
      return;
    }
    if (!(await confirmAction("删除分类", `确定删除空分类“${category.name}”吗？`))) return;
    try {
      await api(`/api/admin/categories/${encodeURIComponent(category.id)}`, { method: "DELETE" });
      await loadData();
      showToast("分类已删除。 ");
    } catch (error) { if (!(await handleContentConflict(error))) showToast(error.message, true); }
  }

  async function moveCategory(category, direction) {
    const categories = [...state.data.categories].sort((left, right) => left.sortOrder - right.sortOrder);
    const index = categories.findIndex((item) => item.id === category.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= categories.length) return;
    [categories[index], categories[target]] = [categories[target], categories[index]];
    try {
      await api("/api/admin/reorder", { method: "POST", body: { entity: "categories", ids: categories.map((item) => item.id) } });
      await loadData();
    } catch (error) { if (!(await handleContentConflict(error))) showToast(error.message, true); }
  }

  function confirmAction(title, message) {
    if (confirmDialog.open) return Promise.resolve(false);
    document.querySelector("[data-confirm-title]").textContent = title;
    document.querySelector("[data-confirm-message]").textContent = message;
    confirmDialog.returnValue = "";
    confirmDialog.showModal();
    syncDialogScrollLock();
    return new Promise((resolve) => {
      confirmDialog.addEventListener("close", () => resolve(confirmDialog.returnValue === "confirm"), { once: true });
    });
  }

  async function saveHiddenSettings(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const collectionId = form.dataset.collectionId;
    const existing = hiddenCollectionById(collectionId);
    setFormBusy(form, true);
    try {
      await api(`/api/admin/hidden-collections/${encodeURIComponent(collectionId)}`, { method: "PUT", body: {
        id: collectionId,
        name: form.elements.name.value,
        icon: form.elements.icon.value,
        eyebrow: form.elements.eyebrow.value,
        passphrase: form.elements.passphrase.value,
        welcome: form.elements.welcome.value,
        privateTypes: collectionId === "private-collection" ? privateTypesFromForm(form) : undefined,
        enabled: form.elements.enabled.checked,
        sortOrder: existing?.sortOrder || 0
      } });
      await loadData();
      showToast(`${existing?.name || "隐藏收藏"}设置已保存。`);
    } catch (error) { if (!(await handleContentConflict(error, `settings:${collectionId}`))) showToast(error.message, true); }
    finally { setFormBusy(form, false); }
  }

  function renderAnnouncementPreview() {
    const text = announcementForm.elements.text.value.trim();
    document.querySelector("[data-announcement-count]").textContent = String(announcementForm.elements.text.value.length);
    const preview = document.querySelector("[data-announcement-preview]");
    preview.querySelector("span").textContent = text || "公告预览会显示在这里。";
    preview.classList.toggle("is-empty", !text);
  }

  async function saveAnnouncement(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const startsAt = dateTimeIsoValue(form.elements.startsAt.value);
    const endsAt = dateTimeIsoValue(form.elements.endsAt.value);
    if (form.elements.startsAt.value && !startsAt) { showToast("公告开始时间不正确。", true); return; }
    if (form.elements.endsAt.value && !endsAt) { showToast("公告结束时间不正确。", true); return; }
    setFormBusy(form, true);
    try {
      await api("/api/admin/announcement", { method: "PUT", body: {
        text: form.elements.text.value,
        enabled: form.elements.enabled.checked,
        startsAt,
        endsAt
      } });
      await loadData();
      showToast(form.elements.enabled.checked ? "临时公告已保存并启用。" : "临时公告已保存，当前未启用。");
    } catch (error) { if (!(await handleContentConflict(error, "announcement"))) showToast(error.message, true); }
    finally { setFormBusy(form, false); }
  }

  async function exportBackup(successMessage = "备份已导出。 ") {
    try {
      const response = await fetch("/api/admin/export", { credentials: "same-origin", headers: { Accept: "application/json" } });
      if (response.status === 401) {
        const preserved = captureSessionDraft();
        showLogin(preserved ? "登录已失效。重新登录后会恢复未保存的内容。" : "登录已失效，请重新登录。");
      }
      if (!response.ok) throw new Error("导出备份失败。 ");
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `sakura-nav-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
      link.hidden = true;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      showToast(successMessage);
      return true;
    } catch (error) {
      showToast(error.message, true);
      return false;
    }
  }

  async function importBackup(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 1024 * 1024) { showToast("备份文件不能超过 1 MB。", true); return; }
    let backup;
    try { backup = JSON.parse(await file.text()); } catch (_) { showToast("选择的文件不是有效 JSON。", true); return; }
    if (!(await confirmAction("导入备份", "系统会先下载当前数据备份，再替换全部分类、卡片、隐藏收藏设置和备份内的公告。确定继续吗？"))) return;
    if (!(await exportBackup("导入前的当前数据已自动备份。"))) {
      showToast("当前数据未能备份，已取消导入。", true);
      return;
    }
    try {
      const { payload } = await api("/api/admin/import", { method: "POST", body: backup });
      await loadData();
      showToast(`已导入 ${payload.categories} 个分类和 ${payload.sites} 张卡片。`);
    } catch (error) { if (!(await handleContentConflict(error))) showToast(error.message, true); }
  }

  loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    loginError.hidden = true;
    const button = loginForm.querySelector("button[type='submit']");
    button.disabled = true;
    try {
      const { payload } = await api("/api/admin/login", { method: "POST", body: {
        username: loginForm.elements.username.value,
        password: loginForm.elements.password.value
      } });
      state.csrf = payload.csrf;
      state.user = payload.user;
      loginForm.elements.password.value = "";
      await loadData();
      showApp();
      const restored = restoreSessionDraft();
      if (restored) showToast(restored.passphraseOmitted ? "未保存内容已恢复；为安全起见，新的入口口令需要重新填写。" : "未保存内容已恢复，请确认后继续保存。");
    } catch (error) {
      showLogin(error.message);
    } finally {
      button.disabled = false;
    }
  });

  document.querySelector("[data-logout]")?.addEventListener("click", async () => {
    if (hasUnsavedChanges() && !(await confirmAction("放弃未保存修改", "退出后台会丢失尚未保存的修改，确定退出吗？"))) return;
    try { await api("/api/admin/logout", { method: "POST" }); } catch (_) { /* Cookie is cleared by re-login if needed. */ }
    clearSessionDraft();
    showLogin("已安全退出后台。", "status");
  });
  setupAdminThemeControls();
  document.querySelectorAll("[data-tab]").forEach((button) => button.addEventListener("click", () => selectTab(button.dataset.tab)));
  document.querySelector("[data-add-site]")?.addEventListener("click", () => openSiteDialog());
  document.querySelector("[data-batch-add]")?.addEventListener("click", openBatchDialog);
  document.querySelector("[data-add-category]")?.addEventListener("click", () => openCategoryDialog());
  document.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => requestDialogClose(button.closest("dialog"))));
  ["data-site-search", "data-site-category-filter", "data-site-visibility-filter", "data-site-private-type-filter", "data-site-region-filter", "data-site-status-filter", "data-site-maintenance-filter"].forEach((attribute) => {
    const control = document.querySelector(`[${attribute}]`);
    control?.addEventListener(control.matches("input") ? "input" : "change", renderSites);
  });
  document.querySelector("[data-site-visibility-filter]")?.addEventListener("change", (event) => {
    const filters = [document.querySelector("[data-site-private-type-filter]"), document.querySelector("[data-site-region-filter]")];
    filters.forEach((filter) => {
      filter.hidden = event.target.value !== "private-collection";
      if (filter.hidden) filter.value = "all";
    });
    renderSites();
  });
  siteForm?.addEventListener("submit", saveSite);
  batchForm?.addEventListener("submit", saveBatchSites);
  document.querySelector("[data-batch-parse]")?.addEventListener("click", parseBatchInput);
  categoryForm?.addEventListener("submit", saveCategory);
  hiddenSettingsForms.forEach((form) => {
    form.addEventListener("submit", saveHiddenSettings);
    if (form.dataset.collectionId === "private-collection") form.addEventListener("input", () => updatePrivateTypePreviews(form));
  });
  announcementForm?.addEventListener("submit", saveAnnouncement);
  announcementForm?.addEventListener("input", renderAnnouncementPreview);
  document.querySelector("[data-export]")?.addEventListener("click", () => exportBackup());
  document.querySelector("[data-import]")?.addEventListener("change", importBackup);
  document.querySelector("[data-analytics-range]")?.addEventListener("change", loadAnalytics);
  document.querySelector("[data-analytics-refresh]")?.addEventListener("click", loadAnalytics);
  document.querySelector("[data-analytics-enabled]")?.addEventListener("change", saveAnalyticsEnabled);
  document.querySelector("[data-analytics-clear]")?.addEventListener("click", clearAnalytics);
  document.querySelector("[data-click-analytics-enabled]")?.addEventListener("change", saveClickAnalyticsEnabled);
  document.querySelector("[data-click-analytics-clear]")?.addEventListener("click", clearClickAnalytics);
  document.querySelector("[data-versions-refresh]")?.addEventListener("click", loadVersions);

  siteForm?.addEventListener("input", (event) => {
    const fields = siteForm.elements;
    if (event.target === fields.id) {
      state.idTouched = true;
      const idHelp = siteForm.querySelector("[data-id-help]");
      if (idHelp) idHelp.textContent = "已手动修改，创建后将保持不变。";
    }
    if (!state.editingSiteId && !state.idTouched && (event.target === fields.name || event.target === fields.url)) {
      const generated = adminCore?.preferredSiteId(fields.name.value, fields.url.value) || "";
      fields.id.value = nextUniqueId(generated);
      const idHelp = siteForm.querySelector("[data-id-help]");
      if (idHelp) idHelp.textContent = generated ? "已自动生成，可在保存前修改；创建后保持不变。" : "填写名称和网址后将自动生成。";
    }
    if ([fields.cardType, ...siteForm.elements.location].includes(event.target)) updateSiteFormVisibility();
    if (event.target === fields.secondaryUrl && !fields.secondaryUrl.value) fields.secondaryUrlLabel.value = "";
    updateCardPreview();
  });
  siteForm?.addEventListener("change", () => { updateSiteFormVisibility(); updateCardPreview(); });
  categoryForm?.elements.name.addEventListener("input", () => {
    if (state.editingCategoryId || categoryForm.elements.id.value) return;
    categoryForm.elements.id.value = nextCategoryId(adminCore?.slugify(categoryForm.elements.name.value) || "");
  });

  trackedForms.forEach((form) => {
    ["input", "change"].forEach((eventName) => form.addEventListener(eventName, () => updateUnsavedIndicator(form)));
  });

  [siteDialog, batchDialog, categoryDialog].forEach((dialog) => dialog?.addEventListener("click", (event) => {
    if (event.target === dialog) requestDialogClose(dialog);
  }));
  [siteDialog, batchDialog, categoryDialog].forEach((dialog) => dialog?.addEventListener("cancel", (event) => {
    event.preventDefault();
    requestDialogClose(dialog);
  }));
  [siteDialog, batchDialog, categoryDialog, confirmDialog].forEach((dialog) => dialog?.addEventListener("close", syncDialogScrollLock));
  window.addEventListener("resize", schedulePreviewFitCheck);
  window.addEventListener("beforeunload", (event) => {
    if (!hasUnsavedChanges()) return;
    event.preventDefault();
    event.returnValue = "";
  });

  (async () => {
    try {
      const { payload } = await api("/api/admin/session");
      state.csrf = payload.csrf;
      state.user = payload.user;
      await loadData();
      showApp();
      const restored = restoreSessionDraft();
      if (restored) showToast(restored.passphraseOmitted ? "未保存内容已恢复；为安全起见，新的入口口令需要重新填写。" : "未保存内容已恢复，请确认后继续保存。");
    } catch (error) {
      const visibleInitializationErrors = new Set(["ADMIN_NOT_CONFIGURED", "REQUEST_TIMEOUT", "NETWORK_ERROR"]);
      showLogin(visibleInitializationErrors.has(error.code) ? error.message : "");
    }
  })();
})();

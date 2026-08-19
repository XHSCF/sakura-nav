(function () {
  "use strict";

  const state = {
    csrf: "",
    user: "",
    data: { categories: [], sites: [], hiddenSection: {}, auditLogs: [] },
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
  const confirmDialog = document.querySelector("[data-confirm-dialog]");
  const hiddenSettingsForm = document.querySelector("[data-hidden-settings-form]");
  const toast = document.querySelector("[data-toast]");
  const trackedForms = [siteForm, categoryForm, hiddenSettingsForm].filter(Boolean);
  const formBaselines = new WeakMap();
  const dialogClosePending = new WeakSet();
  let previewMeasureFrame = 0;

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
    if (options.body && !(options.body instanceof FormData) && typeof options.body !== "string") {
      headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(options.body);
    }
    const response = await fetch(path, { ...options, method, headers, credentials: "same-origin" });
    const type = response.headers.get("Content-Type") || "";
    const payload = type.includes("application/json") ? await response.json() : null;
    if (!response.ok) {
      if (response.status === 401 && path !== "/api/admin/login") showLogin();
      const error = new Error(payload?.error || `请求失败（${response.status}）`);
      error.code = payload?.code;
      error.status = response.status;
      throw error;
    }
    return { payload, response };
  }

  function showLogin(message = "") {
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

  function categoryLabel(site) {
    return site.isHidden ? state.data.hiddenSection.name || "新世界" : categoryById(site.category)?.name || site.category || "未分类";
  }

  function categoryIcon(site) {
    return site.isHidden ? state.data.hiddenSection.icon || "fa-door-open" : categoryById(site.category)?.icon || "fa-link";
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
    return state.data.sites.filter((site) => {
      const searchable = [site.id, site.name, site.description, site.url, site.urlLabel, site.secondaryUrl, site.secondaryUrlLabel, ...(site.keywords || [])].join(" ").toLocaleLowerCase("zh-CN");
      return (!query || searchable.includes(query))
        && (category === "all" || site.category === category)
        && (visibility === "all" || (visibility === "hidden") === Boolean(site.isHidden))
        && (status === "all" || site.status === status);
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
      typeCell.appendChild(createElement("span", "table-badge", site.urlLabel ? "双按钮" : "单按钮"));

      const statusCell = document.createElement("td");
      statusCell.dataset.label = "状态";
      statusCell.appendChild(createElement("span", `table-badge ${site.status === "draft" ? "is-draft" : "is-published"}`, site.status === "draft" ? "草稿" : "已发布"));

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
    const actions = { create: "新增", update: "修改", delete: "删除", import: "导入", seed: "初始化" };
    const types = { site: "卡片", category: "分类", settings: "设置", backup: "备份", navigation: "导航数据" };
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

  function renderSettings() {
    const form = hiddenSettingsForm;
    const settings = state.data.hiddenSection;
    form.elements.name.value = settings.name || "";
    form.elements.icon.value = settings.icon || "fa-door-open";
    form.elements.passphrase.value = settings.passphrase || "";
    form.elements.welcome.value = settings.welcome || "";
    form.elements.enabled.checked = settings.enabled !== false;
    setFormBaseline(form);
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

  async function loadData() {
    const { payload } = await api("/api/admin/data");
    state.data = payload.data;
    renderAll();
  }

  async function selectTab(tabId) {
    const currentTab = document.querySelector("[data-tab].is-active")?.dataset.tab;
    if (currentTab === "settings" && tabId !== "settings" && isFormDirty(hiddenSettingsForm)) {
      if (!(await confirmAction("放弃未保存修改", "新世界设置还没有保存，确定离开这个页面吗？"))) return;
      renderSettings();
    }
    document.querySelectorAll("[data-tab]").forEach((button) => button.classList.toggle("is-active", button.dataset.tab === tabId));
    document.querySelectorAll("[data-panel]").forEach((panel) => { panel.hidden = panel.dataset.panel !== tabId; });
    document.querySelector("[data-add-site]").hidden = tabId !== "sites";
  }

  function slugify(value) {
    return String(value || "").normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 58);
  }

  function idFromUrl(value) {
    try {
      return slugify(new URL(value).hostname.replace(/^www\./, "").split(".").slice(0, -1).join("-"));
    } catch (_) {
      return "";
    }
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
    fields.status.value = site?.status || "published";
    fields.location.value = site?.isHidden ? "hidden" : "public";
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
    setFormBaseline(siteForm);
    updateCardPreview();
    window.setTimeout(() => fields.name.focus(), 0);
  }

  function updateSiteFormVisibility() {
    const fields = siteForm.elements;
    const hidden = fields.location.value === "hidden";
    const dual = fields.cardType.value === "dual";
    document.querySelector("[data-category-field]").hidden = hidden;
    document.querySelector("[data-added-field]").hidden = hidden;
    document.querySelector("[data-dual-fields]").hidden = !dual;
    fields.category.required = !hidden;
    fields.urlLabel.required = dual;
    if (!dual) {
      fields.urlLabel.value = "";
      fields.secondaryUrl.value = "";
      fields.secondaryUrlLabel.value = "";
    }
  }

  function updateCardPreview() {
    const fields = siteForm.elements;
    const hidden = fields.location.value === "hidden";
    const category = hidden ? null : categoryById(fields.category.value);
    document.querySelector("[data-preview-icon]").className = `fas ${hidden ? state.data.hiddenSection.icon || "fa-door-open" : category?.icon || "fa-link"}`;
    document.querySelector("[data-preview-name]").textContent = fields.name.value.trim() || "卡片名称";
    document.querySelector("[data-preview-description]").textContent = fields.description.value.trim() || "卡片描述会显示在这里。";
    document.querySelector("[data-preview-category]").textContent = hidden ? state.data.hiddenSection.name || "新世界" : category?.name || "所属分类";
    document.querySelector("[data-description-count]").textContent = String(fields.description.value.length);
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
    const hidden = fields.location.value === "hidden";
    const secondaryUrl = dual ? fields.secondaryUrl.value.trim() : "";
    return {
      id: state.editingSiteId || fields.id.value,
      name: fields.name.value,
      description: fields.description.value,
      category: hidden ? null : fields.category.value,
      isHidden: hidden,
      url: fields.url.value,
      urlLabel: dual ? fields.urlLabel.value : null,
      secondaryUrl: secondaryUrl || null,
      secondaryUrlLabel: secondaryUrl ? fields.secondaryUrlLabel.value : null,
      keywords: fields.keywords.value.split(/[,，\n]/).map((value) => value.trim()).filter(Boolean),
      addedAt: hidden ? null : fields.addedAt.value,
      sortOrder: state.editingSiteId ? state.data.sites.find((site) => site.id === state.editingSiteId)?.sortOrder || 0 : 9999,
      status: fields.status.value
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
      showToast(error.message, true);
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
    } catch (error) { showToast(error.message, true); }
  }

  async function moveSite(site, direction) {
    const group = state.data.sites.filter((item) => item.isHidden === site.isHidden && (site.isHidden || item.category === site.category)).sort((left, right) => left.sortOrder - right.sortOrder);
    const index = group.findIndex((item) => item.id === site.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= group.length) return;
    [group[index], group[target]] = [group[target], group[index]];
    try {
      await api("/api/admin/reorder", { method: "POST", body: { entity: "sites", ids: group.map((item) => item.id) } });
      await loadData();
    } catch (error) { showToast(error.message, true); }
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
    } catch (error) { showToast(error.message, true); }
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
    } catch (error) { showToast(error.message, true); }
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
    } catch (error) { showToast(error.message, true); }
  }

  function confirmAction(title, message) {
    if (confirmDialog.open) return Promise.resolve(false);
    document.querySelector("[data-confirm-title]").textContent = title;
    document.querySelector("[data-confirm-message]").textContent = message;
    confirmDialog.returnValue = "";
    confirmDialog.showModal();
    return new Promise((resolve) => {
      confirmDialog.addEventListener("close", () => resolve(confirmDialog.returnValue === "confirm"), { once: true });
    });
  }

  async function saveHiddenSettings(event) {
    event.preventDefault();
    const form = event.currentTarget;
    setFormBusy(form, true);
    try {
      await api("/api/admin/hidden-settings", { method: "PUT", body: {
        id: state.data.hiddenSection.id || "new-world",
        name: form.elements.name.value,
        icon: form.elements.icon.value,
        passphrase: form.elements.passphrase.value,
        welcome: form.elements.welcome.value,
        enabled: form.elements.enabled.checked
      } });
      await loadData();
      showToast("新世界设置已保存。 ");
    } catch (error) { showToast(error.message, true); }
    finally { setFormBusy(form, false); }
  }

  async function exportBackup() {
    try {
      const response = await fetch("/api/admin/export", { credentials: "same-origin", headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("导出备份失败。 ");
      const blob = await response.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `sakura-nav-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.hidden = true;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      showToast("备份已导出。 ");
    } catch (error) { showToast(error.message, true); }
  }

  async function importBackup(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 1024 * 1024) { showToast("备份文件不能超过 1 MB。", true); return; }
    let backup;
    try { backup = JSON.parse(await file.text()); } catch (_) { showToast("选择的文件不是有效 JSON。", true); return; }
    if (!(await confirmAction("导入备份", "导入会替换数据库中的全部分类、卡片和新世界设置。确定继续吗？"))) return;
    try {
      const { payload } = await api("/api/admin/import", { method: "POST", body: backup });
      await loadData();
      showToast(`已导入 ${payload.categories} 个分类和 ${payload.sites} 张卡片。`);
    } catch (error) { showToast(error.message, true); }
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
    } catch (error) {
      showLogin(error.message);
    } finally {
      button.disabled = false;
    }
  });

  document.querySelector("[data-logout]")?.addEventListener("click", async () => {
    if (hasUnsavedChanges() && !(await confirmAction("放弃未保存修改", "退出后台会丢失尚未保存的修改，确定退出吗？"))) return;
    try { await api("/api/admin/logout", { method: "POST" }); } catch (_) { /* Cookie is cleared by re-login if needed. */ }
    showLogin("已安全退出后台。 ");
  });
  document.querySelectorAll("[data-tab]").forEach((button) => button.addEventListener("click", () => selectTab(button.dataset.tab)));
  document.querySelector("[data-add-site]")?.addEventListener("click", () => openSiteDialog());
  document.querySelector("[data-add-category]")?.addEventListener("click", () => openCategoryDialog());
  document.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => requestDialogClose(button.closest("dialog"))));
  ["data-site-search", "data-site-category-filter", "data-site-visibility-filter", "data-site-status-filter"].forEach((attribute) => {
    const control = document.querySelector(`[${attribute}]`);
    control?.addEventListener(control.matches("input") ? "input" : "change", renderSites);
  });
  siteForm?.addEventListener("submit", saveSite);
  categoryForm?.addEventListener("submit", saveCategory);
  hiddenSettingsForm?.addEventListener("submit", saveHiddenSettings);
  document.querySelector("[data-export]")?.addEventListener("click", exportBackup);
  document.querySelector("[data-import]")?.addEventListener("change", importBackup);

  siteForm?.addEventListener("input", (event) => {
    const fields = siteForm.elements;
    if (event.target === fields.id) state.idTouched = true;
    if (!state.editingSiteId && !state.idTouched && (event.target === fields.name || event.target === fields.url)) {
      const generated = slugify(fields.name.value) || idFromUrl(fields.url.value);
      fields.id.value = nextUniqueId(generated);
    }
    if ([fields.cardType, ...siteForm.elements.location].includes(event.target)) updateSiteFormVisibility();
    if (event.target === fields.secondaryUrl && !fields.secondaryUrl.value) fields.secondaryUrlLabel.value = "";
    updateCardPreview();
  });
  siteForm?.addEventListener("change", () => { updateSiteFormVisibility(); updateCardPreview(); });
  categoryForm?.elements.name.addEventListener("input", () => {
    if (state.editingCategoryId || categoryForm.elements.id.value) return;
    categoryForm.elements.id.value = nextCategoryId(slugify(categoryForm.elements.name.value));
  });

  trackedForms.forEach((form) => {
    ["input", "change"].forEach((eventName) => form.addEventListener(eventName, () => updateUnsavedIndicator(form)));
  });

  [siteDialog, categoryDialog].forEach((dialog) => dialog?.addEventListener("click", (event) => {
    if (event.target === dialog) requestDialogClose(dialog);
  }));
  [siteDialog, categoryDialog].forEach((dialog) => dialog?.addEventListener("cancel", (event) => {
    event.preventDefault();
    requestDialogClose(dialog);
  }));
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
    } catch (error) {
      showLogin(error.code === "ADMIN_NOT_CONFIGURED" ? error.message : "");
    }
  })();
})();

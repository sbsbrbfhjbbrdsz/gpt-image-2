// 左侧素材栏：暂存画廊图片并快速加入当前生图输入。
(() => {
  const STORAGE_KEY = "image-tool-sidebar-assets";
  const CATEGORY_KEY = `${STORAGE_KEY}-categories`;
  const ACTIVE_CATEGORY_KEY = `${STORAGE_KEY}-active-category`;
  const LOCAL_DB_NAME = "image-tool-sidebar-local-assets";
  const LOCAL_STORE_NAME = "assets";
  const MAX_ASSETS = 80;
  const ALL_CATEGORY = "all";
  const UNCATEGORIZED_CATEGORY = "uncategorized";
  const state = {
    root: null,
    toggle: null,
    list: null,
    categoryPanel: null,
    gallery: null,
    modal: null,
    nav: null,
    assets: [],
    categories: [],
    activeCategoryId: ALL_CATEGORY,
    frame: 0,
    dragDepth: 0,
  };

  function init() {
    state.gallery = document.querySelector("#imageGallery");
    state.modal = document.querySelector("#imageModal");
    state.nav = document.querySelector("#modalGroupNav");
    if (!state.gallery) return;
    state.categories = readCategories();
    state.activeCategoryId = readActiveCategory();
    state.assets = readAssets();
    createSidebar();
    bindModalButton();
    renderCategories();
    renderAssets();
    void loadLocalAssets();
  }

  function createSidebar() {
    const collapsed = readCollapsed();
    const root = document.createElement("aside");
    root.id = "assetSidebar";
    root.className = "asset-sidebar";
    root.setAttribute("aria-label", "素材栏");
    root.setAttribute("aria-hidden", collapsed ? "true" : "false");
    root.classList.toggle("is-collapsed", collapsed);
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "asset-sidebar-toggle";
    toggle.textContent = "素材";
    toggle.setAttribute("aria-controls", root.id);
    toggle.setAttribute("aria-expanded", String(!collapsed));
    toggle.classList.toggle("is-open", !collapsed);
    toggle.addEventListener("click", () => setCollapsed(!root.classList.contains("is-collapsed")));
    const head = document.createElement("div");
    head.className = "asset-sidebar-head";
    const title = document.createElement("strong");
    title.textContent = "素材";
    const actions = document.createElement("div");
    actions.className = "asset-sidebar-actions";
    const local = document.createElement("label");
    local.className = "asset-local-button";
    local.textContent = "添加本地";
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.addEventListener("change", handleLocalFiles);
    local.append(input);
    state.list = document.createElement("div");
    state.list.className = "asset-sidebar-list";
    actions.append(local);
    head.append(title, actions);
    state.categoryPanel = document.createElement("div");
    state.categoryPanel.className = "asset-category-panel";
    state.categoryPanel.addEventListener("contextmenu", handleCategoryContextMenu);
    root.append(head, state.list);
    root.insertBefore(state.categoryPanel, state.list);
    bindLocalDrop(root);
    document.body.append(toggle, root);
    state.root = root;
    state.toggle = toggle;
  }

  function bindLocalDrop(root) {
    root.addEventListener("dragenter", (event) => {
      if (!canHandleAssetDrop(event)) return;
      event.preventDefault();
      event.stopPropagation();
      hideFullscreenDropOverlay();
      state.dragDepth += 1;
      root.classList.add("is-drag-over");
    });
    root.addEventListener("dragover", (event) => {
      if (!canHandleAssetDrop(event)) return;
      event.preventDefault();
      event.stopPropagation();
      hideFullscreenDropOverlay();
      event.dataTransfer.dropEffect = "copy";
      root.classList.add("is-drag-over");
    });
    root.addEventListener("dragleave", (event) => {
      if (!canHandleAssetDrop(event)) return;
      event.preventDefault();
      event.stopPropagation();
      state.dragDepth = Math.max(0, state.dragDepth - 1);
      if (state.dragDepth === 0) root.classList.remove("is-drag-over");
    });
    root.addEventListener("drop", (event) => {
      if (!canHandleAssetDrop(event)) return;
      event.preventDefault();
      event.stopPropagation();
      hideFullscreenDropOverlay();
      state.dragDepth = 0;
      root.classList.remove("is-drag-over");
      void addLocalFiles(event.dataTransfer.files);
    });
  }

  function bindModalButton() {
    if (!state.modal || !state.nav) return;
    state.gallery.addEventListener("click", scheduleModalSync, true);
    document.addEventListener("modal-nav-updated", scheduleModalSync);
    new MutationObserver(scheduleModalSync).observe(state.modal, { attributes: true, attributeFilter: ["hidden"], childList: true, subtree: true });
    scheduleModalSync();
  }

  function scheduleModalSync() {
    window.cancelAnimationFrame(state.frame);
    state.frame = window.requestAnimationFrame(syncModalButton);
  }

  function syncModalButton() {
    const data = readCurrentImageData();
    ensureModalButton();
    const button = state.nav && state.nav.querySelector(".asset-add-button");
    if (data && state.modal && !state.modal.hidden) state.nav.hidden = false;
    if (button) updateModalButton(button, data);
  }

  function ensureModalButton() {
    if (!state.nav || state.nav.querySelector(".asset-add-button")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "asset-add-button";
    button.textContent = "加入素材";
    button.addEventListener("click", addCurrentImage);
    state.nav.insertBefore(button, state.nav.firstChild);
  }

  function addCurrentImage() {
    const data = readCurrentImageData();
    if (!data) return;
    const button = state.nav && state.nav.querySelector(".asset-add-button");
    if (state.assets.some((item) => item.source === data.source)) {
      if (button) updateModalButton(button, data);
      writeStatus("这张图已经在素材栏。");
      return;
    }
    addAssets([data]);
    renderAssets();
    if (button) updateModalButton(button, data);
    writeStatus("已加入素材栏。");
  }

  function updateModalButton(button, data) {
    const added = Boolean(data && state.assets.some((item) => item.source === data.source));
    button.hidden = !data || state.modal.hidden;
    button.textContent = added ? "已加入" : "加入素材";
    button.title = added ? "这张图已在素材栏" : "加入素材栏";
    button.setAttribute("aria-label", button.title);
  }

  async function handleLocalFiles(event) {
    const files = event.target.files;
    event.target.value = "";
    await addLocalFiles(files);
  }

  async function addLocalFiles(fileList) {
    const files = Array.from(fileList || []).filter(isImageFile);
    if (!files.length) return;
    const existing = new Set(state.assets.map((item) => item.signature || item.source));
    const assets = files.reduce((items, file) => {
      const signature = createFileSignature(file);
      if (existing.has(signature)) return items;
      existing.add(signature);
      items.push(createLocalAsset(file, signature));
      return items;
    }, []);
    if (!assets.length) {
      setCollapsed(false);
      writeStatus("本地素材已存在。");
      return;
    }
    const stored = await Promise.allSettled(assets.map(storeLocalAsset));
    addAssets(assets);
    renderAssets();
    setCollapsed(false);
    const failed = stored.filter((item) => item.status === "rejected").length;
    writeStatus(failed ? `已加入 ${assets.length} 张本地素材，部分仅本次页面有效。` : `已加入 ${assets.length} 张本地素材。`, failed > 0);
  }

  function canHandleAssetDrop(event) {
    return state.root && !state.root.classList.contains("is-collapsed") && hasFileDrag(event.dataTransfer);
  }

  function hasFileDrag(dataTransfer) {
    if (!dataTransfer) return false;
    const items = Array.from(dataTransfer.items || []);
    return items.some((item) => item.kind === "file") || Array.from(dataTransfer.types || []).includes("Files");
  }

  function hideFullscreenDropOverlay() {
    const overlay = document.querySelector("#dropOverlay");
    if (!overlay) return;
    overlay.hidden = true;
    overlay.querySelectorAll(".active").forEach((item) => item.classList.remove("active"));
  }

  function addAssets(assets) {
    state.assets = [...assets, ...state.assets];
    const overflow = state.assets.slice(MAX_ASSETS);
    state.assets = state.assets.slice(0, MAX_ASSETS);
    overflow.forEach(disposeAsset);
    saveAssets();
  }

  function renderCategories() {
    if (!state.categoryPanel) return;
    state.categoryPanel.innerHTML = "";
    const list = document.createElement("div");
    list.className = "asset-category-list";
    list.append(createCategoryChip(ALL_CATEGORY, "全部"), createCategoryChip(UNCATEGORIZED_CATEGORY, "未分类"));
    state.categories.forEach((category) => list.append(createCategoryChip(category.id, category.name)));
    state.categoryPanel.append(list);
  }

  function createCategoryChip(id, name) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "asset-category-chip";
    button.dataset.categoryId = id;
    button.classList.toggle("active", state.activeCategoryId === id);
    button.textContent = name;
    button.addEventListener("click", () => setActiveCategory(id));
    return button;
  }

  function handleCategoryContextMenu(event) {
    event.preventDefault();
    event.stopPropagation();
    const chip = event.target.closest(".asset-category-chip");
    const categoryId = chip && chip.dataset.categoryId;
    if (isRealCategoryId(categoryId)) {
      openCategoryMenu(event, categoryId);
      return;
    }
    if (!chip) openCategoryCreateMenu(event);
  }

  function addCategory() {
    const name = normalizeCategoryName(window.prompt("输入素材分类名称", ""));
    if (!name) return;
    if (state.categories.some((category) => category.name === name)) {
      writeStatus(`素材分类已存在：${name}`, true);
      return;
    }
    const category = { id: createCategoryId(), name };
    state.categories = [...state.categories, category];
    saveCategories();
    setActiveCategory(category.id);
  }

  function openCategoryCreateMenu(event) {
    closeCategoryMenu();
    const menu = createMenu(event, "asset-category-menu category-menu");
    const create = document.createElement("button");
    create.type = "button";
    create.textContent = "新建分类";
    create.addEventListener("click", () => {
      closeCategoryMenu();
      addCategory();
    });
    menu.append(create);
    document.body.append(menu);
    bindMenuAutoClose(closeCategoryMenu);
  }

  function openCategoryMenu(event, categoryId) {
    closeCategoryMenu();
    const menu = createMenu(event, "asset-category-menu category-menu");
    const rename = document.createElement("button");
    rename.type = "button";
    rename.textContent = "重命名";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "danger";
    remove.textContent = "删除";
    rename.addEventListener("click", () => {
      closeCategoryMenu();
      renameCategory(categoryId);
    });
    remove.addEventListener("click", () => {
      closeCategoryMenu();
      deleteCategory(categoryId);
    });
    menu.append(rename, remove);
    document.body.append(menu);
    bindMenuAutoClose(closeCategoryMenu);
  }

  function closeCategoryMenu() {
    document.querySelectorAll(".asset-category-menu").forEach((menu) => menu.remove());
  }

  function createMenu(event, className) {
    const menu = document.createElement("div");
    menu.className = className;
    menu.style.left = `${event.clientX}px`;
    menu.style.top = `${event.clientY}px`;
    return menu;
  }

  function bindMenuAutoClose(close) {
    window.setTimeout(() => {
      document.addEventListener("click", close, { once: true });
      document.addEventListener("contextmenu", close, { once: true });
    });
  }

  function renameCategory(categoryId) {
    const category = state.categories.find((item) => item.id === categoryId);
    if (!category) return;
    const name = normalizeCategoryName(window.prompt("输入新的素材分类名称", category.name));
    if (!name || name === category.name) return;
    if (state.categories.some((item) => item.id !== category.id && item.name === name)) {
      writeStatus(`素材分类已存在：${name}`, true);
      return;
    }
    state.categories = state.categories.map((item) => item.id === category.id ? { ...item, name } : item);
    saveCategories();
    renderCategories();
    renderAssets();
  }

  function deleteCategory(categoryId) {
    const category = state.categories.find((item) => item.id === categoryId);
    if (!category || !window.confirm(`删除素材分类「${category.name}」？素材不会被删除。`)) return;
    state.categories = state.categories.filter((item) => item.id !== category.id);
    const affected = [];
    state.assets.forEach((asset) => {
      if (asset.categoryId !== category.id) return;
      asset.categoryId = "";
      affected.push(asset);
    });
    saveCategories();
    saveAssets();
    affected.filter((asset) => asset.local).forEach((asset) => {
      storeLocalAsset(asset).catch(() => {});
    });
    setActiveCategory(state.activeCategoryId === category.id ? ALL_CATEGORY : state.activeCategoryId);
  }

  function setActiveCategory(id) {
    state.activeCategoryId = normalizeActiveCategory(id);
    localStorage.setItem(ACTIVE_CATEGORY_KEY, state.activeCategoryId);
    renderCategories();
    renderAssets();
  }

  function renderAssets() {
    if (!state.list) return;
    const assets = getVisibleAssets();
    state.list.innerHTML = "";
    if (!assets.length) {
      const empty = document.createElement("p");
      empty.className = "asset-sidebar-empty";
      empty.textContent = state.assets.length ? "当前分类暂无素材" : "暂无素材";
      state.list.append(empty);
      return;
    }
    assets.forEach((asset) => state.list.append(createAssetItem(asset)));
  }

  function createAssetItem(asset) {
    const item = document.createElement("article");
    item.className = "asset-sidebar-item";
    item.addEventListener("contextmenu", (event) => openAssetMenu(event, asset));
    const thumb = document.createElement("div");
    thumb.className = "asset-thumb";
    const img = document.createElement("img");
    img.alt = asset.name || "素材图片";
    img.loading = "lazy";
    img.decoding = "async";
    img.src = asset.source;
    const badge = createAssetCategoryBadge(asset);
    thumb.append(img);
    if (badge) thumb.append(badge);
    item.append(thumb);
    return item;
  }

  function getVisibleAssets() {
    if (state.activeCategoryId === ALL_CATEGORY) return state.assets;
    if (state.activeCategoryId === UNCATEGORIZED_CATEGORY) return state.assets.filter((asset) => !asset.categoryId);
    return state.assets.filter((asset) => asset.categoryId === state.activeCategoryId);
  }

  function createAssetCategoryBadge(asset) {
    const category = state.categories.find((item) => item.id === asset.categoryId);
    if (!category) return null;
    const badge = document.createElement("span");
    badge.className = "asset-category-badge";
    badge.textContent = category.name;
    return badge;
  }

  function openAssetMenu(event, asset) {
    event.preventDefault();
    event.stopPropagation();
    closeAssetMenu();
    const menu = createMenu(event, "asset-menu category-menu");
    const use = document.createElement("button");
    use.type = "button";
    use.textContent = "使用";
    const assign = document.createElement("button");
    assign.type = "button";
    assign.textContent = "添加进分类";
    const branch = document.createElement("div");
    branch.className = "asset-menu-branch";
    const submenu = document.createElement("div");
    submenu.className = "asset-menu-submenu category-menu";
    submenu.append(createAssetCategoryAction(asset, "", "未分类"));
    state.categories.forEach((category) => {
      submenu.append(createAssetCategoryAction(asset, category.id, category.name));
    });
    branch.append(assign, submenu);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "danger";
    remove.textContent = "删除";
    use.addEventListener("click", () => {
      closeAssetMenu();
      void useAsset(asset);
    });
    remove.addEventListener("click", () => {
      closeAssetMenu();
      removeAsset(asset.id);
    });
    menu.append(use, branch, remove);
    document.body.append(menu);
    bindMenuAutoClose(closeAssetMenu);
  }

  function createAssetCategoryAction(asset, categoryId, text) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    if ((asset.categoryId || "") === categoryId) button.disabled = true;
    button.addEventListener("click", () => {
      closeAssetMenu();
      void setAssetCategory(asset.id, categoryId);
    });
    return button;
  }

  async function setAssetCategory(assetId, categoryId) {
    const asset = state.assets.find((item) => item.id === assetId);
    if (!asset) return;
    asset.categoryId = isRealCategoryId(categoryId) ? categoryId : "";
    saveAssets();
    if (asset.local) {
      try {
        await storeLocalAsset(asset);
      } catch {
        writeStatus("素材分类已修改，但本地缓存更新失败。", true);
      }
    }
    renderAssets();
  }

  function closeAssetMenu() {
    document.querySelectorAll(".asset-menu").forEach((menu) => menu.remove());
  }

  function getAssignableCategoryId() {
    return isRealCategoryId(state.activeCategoryId) ? state.activeCategoryId : "";
  }

  function isRealCategoryId(id) {
    return state.categories.some((category) => category.id === id);
  }

  function normalizeActiveCategory(id) {
    if (id === ALL_CATEGORY || id === UNCATEGORIZED_CATEGORY || isRealCategoryId(id)) return id;
    return ALL_CATEGORY;
  }

  function normalizeCategoryName(name) {
    return String(name || "").trim().slice(0, 24);
  }

  function createCategoryId() {
    return `asset-category-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  async function useAsset(asset) {
    try {
      const target = readTargetInput();
      if (!target.input) {
        writeStatus("当前模式不能直接使用素材，已切到图生图。");
        document.querySelector('.tab-button[data-tab="image"]')?.click();
        target.input = document.querySelector("#imageImages");
      }
      const file = await createFile(asset);
      appendInputFile(target.input, file);
      writeStatus(`已加入${target.label || "参考图"}。`);
    } catch (error) {
      writeStatus(`使用素材失败：${formatError(error)}`, true);
    }
  }

  function readTargetInput() {
    const mode = document.querySelector(".tab-button.active")?.dataset.tab || "";
    if (mode === "edit") return { input: document.querySelector("#editImages"), label: "精修图原图" };
    if (mode === "responses") return { input: document.querySelector("#responsesImages"), label: "流式参考图" };
    if (mode === "image") return { input: document.querySelector("#imageImages"), label: "图生图参考图" };
    return { input: null, label: "" };
  }

  async function loadLocalAssets() {
    try {
      const records = await readStoredLocalAssets();
      if (!records.length) return;
      const existing = new Set(state.assets.map((item) => item.id));
      const assets = records
        .filter((record) => record && record.blob && !existing.has(record.id))
        .sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0))
        .slice(0, MAX_ASSETS)
        .map((record) => ({
          id: record.id,
          source: URL.createObjectURL(record.blob),
          format: record.format || normalizeFormat("", record.blob.type),
          name: record.name || record.fileName || "local-asset",
          fileName: record.fileName || record.name || "local-asset.png",
          signature: record.signature || "",
          categoryId: isRealCategoryId(record.categoryId) ? record.categoryId : "",
          addedAt: record.addedAt || Date.now(),
          local: true,
          blob: record.blob,
        }));
      if (!assets.length) return;
      const merged = [...state.assets, ...assets].sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
      state.assets = merged.slice(0, MAX_ASSETS);
      merged.slice(MAX_ASSETS).forEach(disposeAsset);
      renderAssets();
    } catch {
      // 本地素材缓存不可用时，远程素材仍然可以正常使用。
    }
  }

  async function createFile(asset) {
    if (asset.blob) {
      const ext = normalizeFormat(asset.format, asset.blob.type);
      return new File([asset.blob], asset.fileName || `${asset.name || "asset"}.${ext}`, { type: asset.blob.type || `image/${ext}` });
    }
    const response = await fetch(asset.source);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    const ext = normalizeFormat(asset.format, blob.type);
    return new File([blob], `${asset.name || "asset"}.${ext}`, { type: blob.type || `image/${ext}` });
  }

  function isImageFile(file) {
    return Boolean(file && (String(file.type || "").startsWith("image/") || /\.(png|jpe?g|webp|gif|avif)$/i.test(file.name)));
  }

  function createLocalAsset(file, signature) {
    const format = normalizeFormat("", file.type);
    const id = `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return {
      id,
      source: URL.createObjectURL(file),
      format,
      name: file.name.replace(/\.[^.]+$/, "") || "local-asset",
      fileName: file.name || `local-asset.${format}`,
      signature,
      categoryId: getAssignableCategoryId(),
      addedAt: Date.now(),
      local: true,
      blob: file,
    };
  }

  function createFileSignature(file) {
    return `${file.name}:${file.size}:${file.lastModified}`;
  }

  function appendInputFile(input, file) {
    const transfer = new DataTransfer();
    const seen = new Set();
    [...Array.from(input.files || []), file].forEach((item) => {
      const key = `${item.name}:${item.size}:${item.lastModified}`;
      if (seen.has(key)) return;
      seen.add(key);
      transfer.items.add(item);
    });
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function removeAsset(id) {
    const removed = state.assets.find((item) => item.id === id);
    state.assets = state.assets.filter((item) => item.id !== id);
    disposeAsset(removed);
    saveAssets();
    renderAssets();
  }

  function disposeAsset(asset) {
    if (!asset) return;
    if (asset.local) {
      deleteStoredLocalAsset(asset.id).catch(() => {});
    }
    if (String(asset.source || "").startsWith("blob:")) {
      URL.revokeObjectURL(asset.source);
    }
  }

  function readCurrentImageData() {
    const item = state.gallery && state.gallery.querySelector(".gallery-item.active");
    const viewItem = window.ImageToolBatch?.getActiveChild?.(item) || item;
    const data = viewItem && viewItem.galleryData || {};
    const source = data.imageUrl || data.dataUrl || "";
    if (!source) return null;
    return {
      id: data.id || `${source.length}-${Date.now()}`,
      source,
      format: data.format || "png",
      name: `asset-${data.number || Date.now()}`,
      categoryId: getAssignableCategoryId(),
      addedAt: Date.now(),
    };
  }

  function setCollapsed(collapsed) {
    state.root.classList.toggle("is-collapsed", collapsed);
    state.root.setAttribute("aria-hidden", collapsed ? "true" : "false");
    if (state.toggle) {
      state.toggle.classList.toggle("is-open", !collapsed);
      state.toggle.setAttribute("aria-expanded", String(!collapsed));
    }
    localStorage.setItem(`${STORAGE_KEY}-collapsed`, collapsed ? "1" : "0");
  }

  function readCollapsed() {
    const value = localStorage.getItem(`${STORAGE_KEY}-collapsed`);
    return value === null ? true : value === "1";
  }

  function readCategories() {
    try {
      const raw = localStorage.getItem(CATEGORY_KEY);
      const items = raw ? JSON.parse(raw) : [];
      const seen = new Set();
      return (Array.isArray(items) ? items : []).map((category) => {
        const id = String(category && category.id || "").trim();
        const name = normalizeCategoryName(category && category.name);
        return id && name ? { id, name } : null;
      }).filter((category) => {
        if (!category || seen.has(category.id)) return false;
        seen.add(category.id);
        return true;
      }).slice(0, 40);
    } catch {
      localStorage.removeItem(CATEGORY_KEY);
      return [];
    }
  }

  function saveCategories() {
    localStorage.setItem(CATEGORY_KEY, JSON.stringify(state.categories));
  }

  function readActiveCategory() {
    return normalizeActiveCategory(localStorage.getItem(ACTIVE_CATEGORY_KEY) || ALL_CATEGORY);
  }

  function readAssets() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const items = raw ? JSON.parse(raw) : [];
      return Array.isArray(items) ? items
        .filter((item) => item && item.source && !String(item.source).startsWith("blob:"))
        .map((item) => ({ ...item, categoryId: isRealCategoryId(item.categoryId) ? item.categoryId : "" }))
        .slice(0, MAX_ASSETS) : [];
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      return [];
    }
  }

  function saveAssets() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.assets.filter((item) => !item.local && !String(item.source || "").startsWith("data:") && !String(item.source || "").startsWith("blob:"))));
  }

  function openLocalAssetDb() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error("indexeddb_unavailable"));
        return;
      }
      const request = indexedDB.open(LOCAL_DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(LOCAL_STORE_NAME)) {
          db.createObjectStore(LOCAL_STORE_NAME, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("indexeddb_open_failed"));
    });
  }

  async function readStoredLocalAssets() {
    const db = await openLocalAssetDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(LOCAL_STORE_NAME, "readonly");
      const request = transaction.objectStore(LOCAL_STORE_NAME).getAll();
      request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
      request.onerror = () => reject(request.error || new Error("indexeddb_read_failed"));
      transaction.oncomplete = () => db.close();
      transaction.onerror = () => reject(transaction.error || new Error("indexeddb_read_failed"));
    });
  }

  async function storeLocalAsset(asset) {
    const db = await openLocalAssetDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(LOCAL_STORE_NAME, "readwrite");
      const request = transaction.objectStore(LOCAL_STORE_NAME).put({
        id: asset.id,
        name: asset.name,
        fileName: asset.fileName,
        format: asset.format,
        signature: asset.signature,
        categoryId: asset.categoryId || "",
        addedAt: asset.addedAt,
        blob: asset.blob,
      });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error("indexeddb_write_failed"));
      transaction.oncomplete = () => db.close();
      transaction.onerror = () => reject(transaction.error || new Error("indexeddb_write_failed"));
    });
  }

  async function deleteStoredLocalAsset(id) {
    const db = await openLocalAssetDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(LOCAL_STORE_NAME, "readwrite");
      const request = transaction.objectStore(LOCAL_STORE_NAME).delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error("indexeddb_delete_failed"));
      transaction.oncomplete = () => db.close();
      transaction.onerror = () => reject(transaction.error || new Error("indexeddb_delete_failed"));
    });
  }

  function normalizeFormat(format, mime) {
    const value = String(format || "").toLowerCase();
    if (value === "jpeg" || value === "jpg") return "jpg";
    if (value === "webp" || String(mime || "").includes("webp")) return "webp";
    if (String(mime || "").includes("jpeg")) return "jpg";
    return "png";
  }

  function writeStatus(message, isError = false) {
    const log = document.querySelector("#statusLog");
    if (!log) return;
    const time = new Date().toLocaleTimeString("zh-CN", { hour12: false });
    const line = `[${time}] ${message}`;
    log.textContent = log.textContent.trim() === "就绪" ? line : `${log.textContent}\n${line}`;
    log.classList.toggle("error-text", isError);
    log.scrollTop = log.scrollHeight;
  }

  function formatError(error) {
    return error && error.message ? error.message : String(error || "unknown_error");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();

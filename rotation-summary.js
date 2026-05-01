// 首页输入面板上方的轮询站点摘要。
(() => {
  const STORAGE_KEY = window.ImageToolConfig && window.ImageToolConfig.CONFIG_STORAGE_KEY || "vibeapi-image-tool-config";
  const CONFIG_PATH = "/api/config";
  let cachedConfig = null;
  let renderTimer = 0;

  ensureRoot();
  patchStorage();
  patchFetch();
  init();

  function init() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => {
        bindEvents();
        scheduleRender();
      }, { once: true });
      return;
    }
    bindEvents();
    scheduleRender();
  }

  function bindEvents() {
    document.addEventListener("change", (event) => {
      if (isConfigControl(event.target)) {
        scheduleRender();
      }
    }, true);
    document.addEventListener("click", (event) => {
      const chip = event.target && event.target.closest(".rotation-site-chip");
      if (chip && chip.dataset.siteId) {
        void toggleSite(chip.dataset.siteId);
        return;
      }
      if (event.target && event.target.closest("#addSite, #deleteSite, #saveKey, #siteList")) {
        scheduleRender();
      }
    }, true);
    window.addEventListener("storage", (event) => {
      if (event.key === STORAGE_KEY) {
        try {
          scheduleRender(event.newValue ? JSON.parse(event.newValue) : null);
        } catch {
          scheduleRender();
        }
      }
    });
  }

  function isConfigControl(target) {
    return Boolean(target && target.closest && target.closest(".rotation-mode-toggle, #siteRotationEnabled, #siteConcurrency, #siteName"));
  }

  function scheduleRender(config) {
    if (arguments.length > 0) {
      cachedConfig = config;
    }
    window.clearTimeout(renderTimer);
    renderTimer = window.setTimeout(() => {
      void render();
    }, 0);
  }

  async function render() {
    const root = ensureRoot();
    if (!root) {
      return;
    }
    const config = await readConfig();
    const sites = Array.isArray(config && config.sites) ? config.sites : [];
    const rotationEnabled = Boolean(config && config.rotation && config.rotation.enabled);
    const list = root.querySelector("#rotationSiteList") || root.querySelector(".rotation-site-list");
    root.hidden = !rotationEnabled;
    root.classList.toggle("rotation-summary-active", rotationEnabled);
    if (!list) {
      return;
    }
    list.hidden = !rotationEnabled;
    renderSiteList(list, sites);
  }

  function ensureRoot() {
    const panel = document.querySelector(".form-panel");
    if (!panel) {
      return null;
    }
    let root = document.querySelector("#rotationSummary");
    if (!root) {
      root = document.createElement("div");
      root.id = "rotationSummary";
      root.className = "rotation-summary";
      root.setAttribute("aria-live", "polite");
      const list = document.createElement("span");
      list.id = "rotationSiteList";
      list.className = "rotation-site-list";
      list.hidden = true;
      root.append(list);
      panel.prepend(root);
    }
    return root;
  }

  function renderSiteList(list, sites) {
    list.replaceChildren();
    if (!sites.length) {
      const empty = document.createElement("em");
      empty.className = "rotation-summary-empty";
      empty.textContent = "无站点";
      list.append(empty);
      return;
    }
    sites.forEach((site) => {
      list.append(createSiteChip(site));
    });
  }

  function createSiteChip(site) {
    const active = site && site.rotationEnabled === true;
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = active ? "rotation-site-chip active" : "rotation-site-chip";
    chip.dataset.siteId = String(site && site.id || "");
    chip.setAttribute("aria-pressed", String(active));
    chip.title = readSiteName(site);
    const name = document.createElement("span");
    name.className = "rotation-site-name";
    name.textContent = readSiteName(site);
    chip.append(name);
    return chip;
  }

  async function toggleSite(siteId) {
    const app = window.ImageToolApp;
    if (app && typeof app.updateRotationConfig === "function") {
      const nextConfig = app.updateRotationConfig((config) => toggleSiteInConfig(config, siteId));
      scheduleRender(nextConfig);
      return;
    }
    const config = await readConfig();
    toggleSiteInConfig(config, siteId);
    await saveConfig(config);
    scheduleRender(config);
  }

  function toggleSiteInConfig(config, siteId) {
    const sites = Array.isArray(config && config.sites) ? config.sites : [];
    const site = sites.find((item) => String(item && item.id || "") === String(siteId || ""));
    if (site) {
      site.rotationEnabled = site.rotationEnabled !== true;
    }
  }

  async function readConfig() {
    const appConfig = window.ImageToolApp && typeof window.ImageToolApp.getConfig === "function"
      ? window.ImageToolApp.getConfig()
      : null;
    if (appConfig) {
      cachedConfig = appConfig;
      return appConfig;
    }
    if (cachedConfig) {
      return cachedConfig;
    }
    const apiConfig = await readApiConfig();
    if (window.location.protocol !== "file:") {
      cachedConfig = apiConfig;
      return apiConfig;
    }
    const storageConfig = readStorageConfig();
    cachedConfig = storageConfig;
    return storageConfig;
  }

  function readStorageConfig() {
    try {
      const raw = window.localStorage && window.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  async function readApiConfig() {
    if (window.location.protocol === "file:") {
      return null;
    }
    try {
      const response = await fetch(`${window.location.origin}${CONFIG_PATH}`, { cache: "no-store" });
      return response.ok ? response.json() : null;
    } catch {
      return null;
    }
  }

  async function saveConfig(config) {
    if (!config) {
      return;
    }
    const text = JSON.stringify(config);
    try {
      window.localStorage.setItem(STORAGE_KEY, text);
    } catch {
      // Ignore storage failures; the server write can still succeed.
    }
    if (window.location.protocol === "file:") {
      return;
    }
    try {
      await fetch(`${window.location.origin}${CONFIG_PATH}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: text,
      });
    } catch {
      // The main app will keep using the in-memory config for this session.
    }
  }

  function patchStorage() {
    const proto = window.Storage && window.Storage.prototype;
    if (!proto || proto.__rotationSummaryPatched) {
      return;
    }
    const nativeSetItem = proto.setItem;
    proto.setItem = function patchedSetItem(key, value) {
      const result = nativeSetItem.apply(this, arguments);
      if (key === STORAGE_KEY) {
        try {
          scheduleRender(JSON.parse(String(value)));
        } catch {
          scheduleRender();
        }
      }
      return result;
    };
    proto.__rotationSummaryPatched = true;
  }

  function patchFetch() {
    if (!window.fetch || window.fetch.__rotationSummaryPatched) {
      return;
    }
    const nativeFetch = window.fetch.bind(window);
    const patchedFetch = async (...args) => {
      const response = await nativeFetch(...args);
      syncFromConfigResponse(args, response);
      return response;
    };
    patchedFetch.__rotationSummaryPatched = true;
    window.fetch = patchedFetch;
  }

  function syncFromConfigResponse(args, response) {
    const method = readRequestMethod(args);
    if (!isConfigRequest(args[0]) || !response) {
      return;
    }
    if (method === "GET" && response.ok) {
      response.clone().json().then((config) => scheduleRender(config)).catch(() => scheduleRender());
      return;
    }
    if (method !== "GET") {
      scheduleRender();
    }
  }

  function isConfigRequest(input) {
    const url = typeof input === "string" ? input : input && input.url;
    if (!url) {
      return false;
    }
    try {
      return new URL(url, window.location.href).pathname === CONFIG_PATH;
    } catch {
      return String(url).includes(CONFIG_PATH);
    }
  }

  function readRequestMethod(args) {
    const input = args[0];
    const options = args[1] || {};
    return String(options.method || input && input.method || "GET").toUpperCase();
  }

  function readSiteName(site) {
    return String(site && site.name || "未命名站点").trim() || "未命名站点";
  }

  function clampConcurrency(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(10, Math.max(1, Math.round(number))) : 1;
  }
})();

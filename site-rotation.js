(() => {
  function normalizeRotation(rotation = {}) {
    return {
      enabled: rotation && rotation.enabled === true,
      cursor: Math.max(0, Math.round(Number(rotation && rotation.cursor) || 0)),
    };
  }

  function createContext({
    config,
    mode,
    quantity,
    activeSite,
    activeModel,
    activeKey,
    activeBaseUrl,
    activeUseProxy,
    activeConcurrency,
    activeApiMode,
    activeTasks,
    taskQueue,
  }) {
    const rotation = normalizeRotation(config && config.rotation);
    if (!rotation.enabled) {
      return createSingleSiteContext(activeSite, activeModel, activeKey, activeBaseUrl, activeUseProxy, activeConcurrency, activeApiMode, mode);
    }
    const result = findCapableSites(config, mode, quantity);
    if (!result.sites.length) {
      return { ok: false, message: result.message };
    }
    return { ok: true, rotation: true, pendingRotation: true, mode, quantity };
  }

  function resolveContext({ config, context, activeTasks }) {
    if (!context || !context.pendingRotation) {
      return context;
    }
    const result = selectRotationSite(config, context.mode, context.quantity, activeTasks);
    if (!result.site) {
      return { ok: false, message: result.message };
    }
    const siteIndex = config.sites.findIndex((site) => site.id === result.site.id);
    config.rotation = { ...normalizeRotation(config.rotation), cursor: siteIndex < 0 ? normalizeRotation(config.rotation).cursor : siteIndex + 1 };
    return createSiteContext(result.site, result.model, true, context.mode);
  }

  function hasAvailableContext({ config, context, activeTasks }) {
    if (!context || !context.pendingRotation) {
      return countSiteTasks(context && context.siteId, activeTasks) < clampConcurrency(context && context.concurrency);
    }
    return Boolean(selectRotationSite(config, context.mode, context.quantity, activeTasks).site);
  }

  function createSingleSiteContext(site, model, key, baseUrl, useProxy, concurrency, apiMode, mode) {
    if (!key) {
      return { ok: false, message: "请输入 API Key。" };
    }
    if (!model) {
      return { ok: false, message: "请选择或手动输入模型。" };
    }
    return createSiteContext({
      ...site,
      apiKey: key,
      baseUrl,
      useProxy,
      concurrency,
    }, model, false, mode, apiMode);
  }

  function createSiteContext(site, model, rotation, mode, apiMode = "") {
    return {
      ok: true,
      rotation,
      siteId: String(site.id || ""),
      siteName: String(site.name || "未命名站点"),
      key: String(site.apiKey || ""),
      baseUrl: trimBaseUrl(site.baseUrl),
      useProxy: site.useProxy === true,
      concurrency: clampConcurrency(site.concurrency),
      endpoints: { ...(site.endpoints || {}) },
      model,
      apiMode: readSiteApiMode(site, mode, apiMode),
      toolChoice: readResponsesToolChoice(site),
    };
  }

  function findCapableSites(config, mode, quantity) {
    const participants = (Array.isArray(config && config.sites) ? config.sites : []).filter((site) => site && site.rotationEnabled === true);
    if (!participants.length) {
      return { sites: [], message: "轮询模式没有启用任何参与站点。" };
    }
    const enoughConcurrency = participants.filter((site) => clampConcurrency(site.concurrency) >= quantity);
    if (!enoughConcurrency.length) {
      const max = Math.max(...participants.map((site) => clampConcurrency(site.concurrency)));
      return { sites: [], message: `当前生成数量 ${quantity} 超过所有参与站点并发，最高并发只有 ${max}。请降低生成数量或提高站点并发。` };
    }
    const capable = enoughConcurrency
      .map((site) => ({ site, model: readSiteModel(site, mode) }))
      .filter(({ site, model }) => {
        return model && site.apiKey && trimBaseUrl(site.baseUrl);
      });
    if (!capable.length) {
      return { sites: [], message: `有站点并发支持数量 ${quantity}，但缺少模型、API Key 或 API 地址。请检查参与轮询站点配置。` };
    }
    return { sites: capable, message: "" };
  }

  function selectRotationSite(config, mode, quantity, activeTasks) {
    const result = findCapableSites(config, mode, quantity);
    const ordered = rotateList(result.sites, normalizeRotation(config && config.rotation).cursor);
    const available = ordered.find(({ site }) => countSiteTasks(site.id, activeTasks) < clampConcurrency(site.concurrency));
    return available || { message: result.message || "轮询站点都在生成中，等待空闲站点。" };
  }

  function readSiteModel(site, mode) {
    const models = site && site.selectedModels || {};
    return String(models[mode] || site && site.selectedModel || "").trim();
  }

  function readSiteApiMode(site, mode, fallback = "") {
    if (mode === "responses") {
      return "responses-stream";
    }
    const modes = site && site.apiModes || {};
    return normalizeApiMode(modes[mode] || fallback);
  }

  function normalizeApiMode(value) {
    return value === "responses" || value === "responses-stream" ? "responses-stream" : "image";
  }

  function readResponsesToolChoice(site) {
    const value = site && site.responsesToolChoice;
    if (value === "auto" || value === "required") {
      return value;
    }
    return { type: "image_generation" };
  }

  function rotateList(items, cursor) {
    if (!items.length) {
      return items;
    }
    const start = cursor % items.length;
    return [...items.slice(start), ...items.slice(0, start)];
  }

  function countSiteTasks(siteId, activeTasks) {
    const key = String(siteId || "");
    return [...activeTasks].filter((task) => task && task.siteContext && task.siteContext.siteId === key).length;
  }

  function trimBaseUrl(value) {
    return String(value || "").trim().replace(/\/+$/, "");
  }

  function clampConcurrency(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(10, Math.max(1, Math.round(number))) : 1;
  }

  window.ImageToolRotation = { normalizeRotation, createContext, resolveContext, hasAvailableContext };
})();

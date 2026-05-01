(() => {
  function createParent({ gallery, data, total, onSelect, prepend = true }) {
    const item = document.createElement("article");
    item.className = "gallery-item gallery-group-item task-item";
    item.tabIndex = 0;
    item.setAttribute("role", "button");
    item.setAttribute("aria-expanded", "false");
    item.dataset.signature = data.batchId;
    item.galleryData = {
      ...data,
      isBatch: true,
      batchItems: [],
      batchIndex: 0,
      batchTotal: total,
      batchDone: 0,
    };
    const placeholder = document.createElement("div");
    placeholder.className = "task-placeholder";
    const badge = document.createElement("span");
    badge.className = "gallery-badge";
    const caption = document.createElement("span");
    caption.className = "gallery-meta";
    const count = document.createElement("span");
    count.className = "gallery-group-count";
    item.append(placeholder, badge, caption, count);
    item.addEventListener("click", () => onSelect(item));
    item.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onSelect(item);
      }
    });
    gallery[prepend ? "prepend" : "append"](item);
    syncParent(item);
    return item;
  }

  function createChild(parent, data) {
    const child = document.createElement("article");
    child.className = "gallery-item task-item";
    child.dataset.signature = data.batchItemId || data.id || "";
    child.batchParent = parent;
    child.galleryData = {
      ...data,
      batchId: parent.galleryData.batchId,
      batchIndex: parent.galleryData.batchItems.length,
      batchTotal: parent.galleryData.batchTotal,
      categoryIds: Array.isArray(data.categoryIds) ? data.categoryIds : [],
    };
    const placeholder = document.createElement("div");
    placeholder.className = "task-placeholder";
    const badge = document.createElement("span");
    badge.className = "gallery-badge";
    const caption = document.createElement("span");
    caption.className = "gallery-meta";
    child.append(placeholder, badge, caption);
    parent.galleryData.batchItems.push(child);
    syncParent(parent);
    return child;
  }

  function syncFromChild(child) {
    if (child && child.batchParent) {
      syncParent(child.batchParent);
    }
  }

  function syncParent(parent) {
    const data = parent && parent.galleryData;
    if (!data || !data.isBatch) {
      return;
    }
    const items = data.batchItems || [];
    const active = getActiveChild(parent) || items.find((item) => item.galleryData && item.galleryData.taskStatus === "running") || items[0];
    const cover = hasImage(active) ? active : items.find(hasImage)
      || active
      || items[0];
    const coverData = cover && cover.galleryData || data;
    const done = items.filter(isDoneChild).length;
    const failed = items.filter((item) => item.galleryData && item.galleryData.taskStatus === "failed").length;
    const processed = done + failed;
    const running = items.some((item) => item.galleryData && ["queued", "running"].includes(item.galleryData.taskStatus));
    const runningNow = items.some((item) => item.galleryData && item.galleryData.taskStatus === "running");
    const totalDurationMs = items.reduce((sum, item) => sum + (Number(item.galleryData && item.galleryData.durationMs) || 0), 0);
    const categoryIds = Array.isArray(data.categoryIds) ? data.categoryIds : [];
    Object.assign(data, {
      ...coverData,
      isBatch: true,
      batchItems: items,
      batchTotal: data.batchTotal,
      batchIndex: Math.min(data.batchIndex || 0, Math.max(0, items.length - 1)),
      coverIndex: normalizeIndex(data.coverIndex ?? data.batchIndex, items.length),
      batchDone: done,
      categoryIds,
      durationMs: Math.round(totalDurationMs),
      durationText: formatDuration(totalDurationMs),
      taskStatus: running ? "running" : items.length > 0 && failed === items.length ? "failed" : items.length > 0 && processed >= items.length ? "done" : "queued",
    });
    renderParent(parent, coverData, { done, failed, runningNow, totalDurationMs });
  }

  function isDoneChild(item) {
    const data = item && item.galleryData;
    if (!data) {
      return false;
    }
    return data.taskStatus === "done" || (!data.taskStatus && (data.dataUrl || data.imageUrl));
  }

  function renderParent(parent, coverData, progress) {
    let image = parent.querySelector("img");
    const placeholder = parent.querySelector(".task-placeholder");
    if (coverData.dataUrl) {
      if (!image) {
        image = document.createElement("img");
        image.loading = "lazy";
        image.decoding = "async";
        parent.insertBefore(image, parent.firstChild);
      }
      window.ImageToolLazy?.setImageSource(image, coverData.dataUrl, parent) || (image.src = coverData.dataUrl);
      if (placeholder) {
        placeholder.remove();
      }
      parent.classList.remove("task-item");
    } else if (placeholder) {
      placeholder.textContent = progress.failed ? "失败" : progress.runningNow ? "生成中" : "排队中";
    }
    const badge = parent.querySelector(".gallery-badge");
    if (badge) {
      badge.textContent = [coverData.mode || "生成", coverData.actualSize || coverData.requestedSize || "尺寸读取中"].filter(Boolean).join(" · ");
    }
    const caption = parent.querySelector(".gallery-meta");
    if (caption) {
      caption.textContent = parent.galleryData.durationText || (progress.failed ? `失败 ${progress.failed}` : "");
    }
    const count = parent.querySelector(".gallery-group-count");
    if (count) {
      count.hidden = Number(parent.galleryData.batchTotal) <= 1;
      count.textContent = formatGroupProgress(parent.galleryData, progress);
    }
  }

  function formatGroupProgress(data, progress) {
    const total = Number(data && data.batchTotal) || (data && data.batchItems && data.batchItems.length) || 0;
    if (total <= 0) {
      return "";
    }
    const processed = (Number(progress && progress.done) || 0) + (Number(progress && progress.failed) || 0);
    return `${Math.min(total, processed)}/${total}`;
  }

  function formatDuration(durationMs) {
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      return "";
    }
    return `${Math.max(1, Math.round(durationMs / 1000))}s`;
  }

  function getActiveChild(parent) {
    const data = parent && parent.galleryData;
    if (!data || !data.isBatch) {
      return null;
    }
    return data.batchItems[data.batchIndex || 0] || null;
  }

  function showRelative(parent, delta) {
    const data = parent && parent.galleryData;
    if (!data || !data.isBatch || !data.batchItems.length) {
      return;
    }
    const total = data.batchItems.length;
    data.batchIndex = (data.batchIndex + delta + total) % total;
    data.coverIndex = data.batchIndex;
    syncParent(parent);
  }

  function renderNav(container, parent, onChange) {
    if (!container) {
      return;
    }
    const data = parent && parent.galleryData;
    if (!data || !data.isBatch || data.batchTotal <= 1) {
      container.hidden = true;
      container.innerHTML = "";
      return;
    }
    container.hidden = false;
    container.innerHTML = "";
    const prev = document.createElement("button");
    const next = document.createElement("button");
    const remove = document.createElement("button");
    const text = document.createElement("span");
    prev.type = "button";
    next.type = "button";
    remove.type = "button";
    prev.className = "modal-nav-button prev";
    next.className = "modal-nav-button next";
    remove.className = "modal-nav-button delete";
    prev.textContent = "‹";
    next.textContent = "›";
    remove.textContent = "删除";
    prev.setAttribute("aria-label", "上一张");
    next.setAttribute("aria-label", "下一张");
    remove.setAttribute("aria-label", "删除当前图片");
    prev.title = "上一张";
    next.title = "下一张";
    remove.title = "删除当前图片";
    text.textContent = `${(data.batchIndex || 0) + 1}/${data.batchTotal}`;
    remove.hidden = !canDeleteActiveChild(parent);
    prev.addEventListener("click", () => {
      showRelative(parent, -1);
      void persistCover(parent);
      onChange();
    });
    next.addEventListener("click", () => {
      showRelative(parent, 1);
      void persistCover(parent);
      onChange();
    });
    remove.addEventListener("click", () => {
      void deleteActiveChild(parent, onChange);
    });
    container.append(prev, text, next, remove);
  }

  function hasImage(item) {
    const data = item && item.galleryData;
    return Boolean(data && (data.dataUrl || data.imageUrl));
  }

  function canDeleteActiveChild(parent) {
    const data = parent && parent.galleryData;
    const child = getActiveChild(parent);
    const childData = child && child.galleryData || {};
    if (!data || !data.isBatch || data.batchItems.length <= 1 || childData.taskStatus === "queued" || childData.taskStatus === "running") {
      return false;
    }
    if (childData.taskStatus === "failed") {
      return true;
    }
    return Boolean(childData.id && childData.persisted && !childData.saving && !childData.updating);
  }

  async function deleteActiveChild(parent, onChange) {
    if (!canDeleteActiveChild(parent)) {
      return;
    }
    const child = getActiveChild(parent);
    const data = child.galleryData || {};
    try {
      if (data.id) {
        const response = await fetch(`${window.location.origin}/api/gallery`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: [data.id] }),
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
      }
      removeChild(parent, child);
      await persistGroupOrder(parent);
      writeStatus("已删除当前图片。");
      if (typeof onChange === "function") {
        onChange();
      }
    } catch (error) {
      writeStatus(`删除当前图片失败：${formatError(error)}`, true);
    }
  }

  function removeChild(parent, child) {
    const data = parent.galleryData;
    const oldIndex = data.batchItems.indexOf(child);
    data.batchItems = data.batchItems.filter((item) => item !== child);
    data.batchTotal = data.batchItems.length;
    data.batchIndex = Math.min(Math.max(0, oldIndex), Math.max(0, data.batchItems.length - 1));
    data.coverIndex = data.batchIndex;
    child.remove();
    data.batchItems.forEach((item, index) => {
      item.galleryData = { ...item.galleryData, batchIndex: index, batchTotal: data.batchTotal, coverIndex: data.coverIndex };
    });
    syncParent(parent);
    if (window.ImageToolApp && typeof window.ImageToolApp.handleGalleryItemsDeleted === "function") {
      window.ImageToolApp.handleGalleryItemsDeleted([child]);
    }
  }

  async function persistGroupOrder(parent) {
    const items = parent.galleryData && parent.galleryData.batchItems || [];
    const groupData = parent.galleryData || {};
    const coverIndex = normalizeIndex(groupData.coverIndex ?? groupData.batchIndex, items.length);
    await Promise.all(items.map((item, index) => {
      const data = item.galleryData || {};
      if (!data.id || !data.persisted) {
        return Promise.resolve();
      }
      return patchStoredItem(data.id, {
        ...data,
        batchIndex: index,
        batchTotal: items.length,
        coverIndex,
      });
    }));
  }

  async function persistCover(parent) {
    const items = parent.galleryData && parent.galleryData.batchItems || [];
    if (!items.length) {
      return;
    }
    const coverIndex = normalizeIndex(parent.galleryData.coverIndex ?? parent.galleryData.batchIndex, items.length);
    await Promise.all(items.map((item) => {
      const data = item.galleryData || {};
      if (!data.id || !data.persisted || data.saving || data.updating) {
        return Promise.resolve();
      }
      data.coverIndex = coverIndex;
      return patchStoredItem(data.id, { ...data, coverIndex });
    })).catch((error) => {
      writeStatus(`保存封面失败：${formatError(error)}`, true);
    });
  }

  async function patchStoredItem(id, metadata) {
    const response = await fetch(`${window.location.origin}/api/gallery`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, metadata }),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
  }

  function writeStatus(message, isError = false) {
    const log = document.querySelector("#statusLog");
    if (!log) {
      return;
    }
    const time = new Date().toLocaleTimeString("zh-CN", { hour12: false });
    const line = `[${time}] ${message}`;
    log.textContent = log.textContent.trim() === "就绪" ? line : `${log.textContent}\n${line}`;
    log.classList.toggle("error-text", isError);
    log.scrollTop = log.scrollHeight;
  }

  function formatError(error) {
    return error && error.message ? error.message : String(error || "unknown_error");
  }

  function createSavedGroup({ gallery, items, onSelect }) {
    const sorted = [...items].sort((a, b) => Number(a.batchIndex) - Number(b.batchIndex));
    const first = sorted[0];
    const total = Math.max(Number(first.batchTotal) || 0, sorted.length);
    const parent = createParent({
      gallery,
      data: { ...first, dataUrl: first.imageUrl, persisted: false, saving: false, batchId: first.batchId },
      total,
      onSelect,
      prepend: false,
    });
    buildSavedGroupItems(sorted, total).forEach((item) => {
      const hasImage = Boolean(item.imageUrl);
      const child = createChild(parent, { ...item, dataUrl: item.imageUrl, persisted: hasImage, saving: false, taskStatus: item.taskStatus || (hasImage ? "done" : "failed") });
      child.classList.toggle("task-item", !item.imageUrl);
    });
    parent.galleryData.batchIndex = readSavedCoverIndex(sorted, total);
    parent.galleryData.coverIndex = parent.galleryData.batchIndex;
    syncParent(parent);
    return parent;
  }

  function readSavedCoverIndex(items, total) {
    const found = items.find((item) => Number.isFinite(Number(item.coverIndex)));
    return normalizeIndex(found && found.coverIndex, total);
  }

  function normalizeIndex(value, total) {
    const size = Math.max(0, Number(total) || 0);
    if (size <= 0) {
      return 0;
    }
    const index = Math.round(Number(value) || 0);
    return Math.min(Math.max(0, index), size - 1);
  }

  function buildSavedGroupItems(items, total) {
    const byIndex = new Map(items.map((item) => [Number(item.batchIndex) || 0, item]));
    const fallback = items[0] || {};
    const list = [];
    for (let index = 0; index < total; index += 1) {
      list.push(byIndex.get(index) || createMissingSavedItem(fallback, index, total));
    }
    return list;
  }

  function createMissingSavedItem(fallback, index, total) {
    return {
      ...fallback,
      id: "",
      fileName: "",
      imageUrl: "",
      dataUrl: "",
      actualSize: "失败",
      sizeNote: "失败",
      taskStatus: "failed",
      errorText: "这张图片没有保存记录，可能生成失败或已被清理。",
      batchIndex: index,
      batchTotal: total,
      coverIndex: Number(fallback.coverIndex) || 0,
      durationMs: 0,
      durationText: "",
      logs: [],
      savedAt: "",
    };
  }

  function renderSavedGallery({ gallery, items, onSelect, onItem }) {
    const batches = new Map();
    const orderedEntries = [];
    (Array.isArray(items) ? items : []).forEach((item) => {
      if (!item || !item.imageUrl) {
        return;
      }
      if (item.batchId && Number(item.batchTotal) > 1) {
        const list = batches.get(item.batchId) || [];
        if (!list.length) {
          orderedEntries.push({ type: "batch", id: item.batchId });
        }
        list.push(item);
        batches.set(item.batchId, list);
        return;
      }
      orderedEntries.push({ type: "item", item });
    });
    orderedEntries.forEach((entry) => {
      if (entry.type === "batch") {
        const list = batches.get(entry.id);
        if (list && list.length) {
          createSavedGroup({ gallery, items: list, onSelect });
        }
        return;
      }
      onItem(entry.item);
    });
  }

  window.ImageToolBatch = { createParent, createChild, createSavedGroup, renderSavedGallery, syncFromChild, syncParent, getActiveChild, renderNav };
})();

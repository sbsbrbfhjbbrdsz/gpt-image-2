(() => {
  const SELECTABLE = ".gallery-item:not([hidden]):not(.filtered-out)";
  const state = {
    startX: 0,
    startY: 0,
    pointerId: 0,
    dragging: false,
    selecting: false,
    suppressClick: false,
    selected: new Set(),
    box: null,
    bar: null,
    count: null,
    positionFrame: 0,
  };
  let panelObserver = null;
  let resizeObserver = null;

  function init() {
    const gallery = document.querySelector("#imageGallery");
    if (!gallery) {
      return;
    }
    gallery.addEventListener("click", toggleSelectedItemClick, true);
    gallery.addEventListener("click", suppressSelectionClick, true);
    gallery.addEventListener("dragstart", (event) => event.preventDefault());
    document.addEventListener("pointerdown", startSelection);
    document.addEventListener("keydown", handleKeydown);
    ensureActionBar();
  }

  function startSelection(event) {
    if (event.button !== 0 || shouldIgnoreTarget(event.target)) {
      return;
    }
    state.startX = event.clientX;
    state.startY = event.clientY;
    state.pointerId = event.pointerId;
    state.dragging = true;
    document.addEventListener("pointermove", moveSelection);
    document.addEventListener("pointerup", endSelection, { once: true });
  }

  function moveSelection(event) {
    if (!state.dragging || event.pointerId !== state.pointerId) {
      return;
    }
    const distance = Math.hypot(event.clientX - state.startX, event.clientY - state.startY);
    if (!state.selecting && distance < 6) {
      return;
    }
    event.preventDefault();
    if (!state.selecting) {
      state.selecting = true;
      state.suppressClick = true;
      hideActionBar();
      document.body.classList.add("gallery-box-selecting");
      state.box = document.createElement("div");
      state.box.className = "gallery-selection-box";
      document.body.append(state.box);
    }
    updateSelectionBox(event.clientX, event.clientY);
    updateSelectedItems();
  }

  function endSelection(event) {
    document.removeEventListener("pointermove", moveSelection);
    state.dragging = false;
    if (state.box) {
      state.box.remove();
      state.box = null;
    }
    document.body.classList.remove("gallery-box-selecting");
    if (state.selecting) {
      state.selecting = false;
      if (state.selected.size) {
        showActionBar();
      } else {
        hideActionBar();
      }
      window.setTimeout(() => {
        state.suppressClick = false;
      }, 0);
    }
  }

  function updateSelectionBox(clientX, clientY) {
    const left = Math.min(state.startX, clientX);
    const top = Math.min(state.startY, clientY);
    const width = Math.abs(clientX - state.startX);
    const height = Math.abs(clientY - state.startY);
    Object.assign(state.box.style, {
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${height}px`,
    });
  }

  function updateSelectedItems() {
    const rect = state.box.getBoundingClientRect();
    document.querySelectorAll(SELECTABLE).forEach((item) => {
      if (!isSelectableItem(item)) {
        markSelected(item, false);
        return;
      }
      if (intersects(rect, item.getBoundingClientRect())) {
        markSelected(item, true);
      }
    });
    updateActionCount();
  }

  function markSelected(item, selected) {
    item.classList.toggle("delete-selected", selected);
    if (selected) {
      state.selected.add(item);
      return;
    }
    state.selected.delete(item);
  }

  function clearSelection() {
    state.selected.forEach((item) => item.classList.remove("delete-selected"));
    state.selected.clear();
    hideActionBar();
  }

  function toggleSelectedItemClick(event) {
    const item = event.target && event.target.closest(".gallery-item");
    if (!item || state.selected.size === 0 || state.selecting || state.suppressClick) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!isSelectableItem(item)) {
      return;
    }
    markSelected(item, !state.selected.has(item));
    if (state.selected.size) {
      showActionBar();
    } else {
      clearSelection();
    }
  }

  function ensureActionBar() {
    if (state.bar) {
      return;
    }
    const bar = document.createElement("div");
    bar.className = "gallery-delete-bar";
    bar.hidden = true;
    const count = document.createElement("span");
    count.className = "gallery-delete-count";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "danger";
    remove.textContent = "删除";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "ghost";
    cancel.textContent = "取消";
    remove.addEventListener("click", () => {
      void deleteSelectedItems();
    });
    cancel.addEventListener("click", clearSelection);
    bar.append(count, remove, cancel);
    document.body.append(bar);
    state.bar = bar;
    state.count = count;
  }

  function showActionBar() {
    ensureActionBar();
    updateActionCount();
    state.bar.hidden = false;
    positionActionBar();
    observePositionSources();
    schedulePosition();
  }

  function hideActionBar() {
    if (state.bar) {
      state.bar.hidden = true;
    }
    disconnectPositionSources();
  }

  function updateActionCount() {
    if (state.count) {
      state.count.textContent = `已选 ${state.selected.size} 张`;
    }
    schedulePosition();
  }

  function positionActionBar() {
    if (!state.bar || state.bar.hidden) {
      return;
    }
    const gap = 8;
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
    const barRect = state.bar.getBoundingClientRect();
    const anchorRect = readActionAnchorRect();
    const fallbackTop = viewportHeight - barRect.height - 20;
    let left = (viewportWidth - barRect.width) / 2;
    let top = fallbackTop;
    if (anchorRect) {
      left = anchorRect.left + (anchorRect.width - barRect.width) / 2;
      top = anchorRect.top - barRect.height - gap;
    }
    const protectedRect = readProtectedPanelRect();
    if (protectedRect) {
      top = Math.min(top, protectedRect.top - barRect.height - gap);
    }
    state.bar.style.left = `${clamp(left, gap, viewportWidth - barRect.width - gap)}px`;
    state.bar.style.top = `${clamp(top, gap, viewportHeight - barRect.height - gap)}px`;
  }

  function schedulePosition() {
    if (!state.bar || state.bar.hidden) {
      return;
    }
    window.cancelAnimationFrame(state.positionFrame);
    state.positionFrame = window.requestAnimationFrame(positionActionBar);
  }

  function observePositionSources() {
    if (panelObserver) {
      return;
    }
    panelObserver = new MutationObserver(schedulePosition);
    panelObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "hidden"],
    });
    window.addEventListener("resize", schedulePosition);
    window.addEventListener("scroll", schedulePosition, true);
    if ("ResizeObserver" in window) {
      resizeObserver = new ResizeObserver(schedulePosition);
      [state.bar, document.querySelector("#rotationSummary"), document.querySelector(".form-panel"), document.querySelector("#imageGallery")]
        .filter(Boolean)
        .forEach((element) => resizeObserver.observe(element));
    }
  }

  function disconnectPositionSources() {
    window.cancelAnimationFrame(state.positionFrame);
    if (panelObserver) {
      panelObserver.disconnect();
      panelObserver = null;
    }
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    window.removeEventListener("resize", schedulePosition);
    window.removeEventListener("scroll", schedulePosition, true);
  }

  function readActionAnchorRect() {
    const rotation = document.querySelector("#rotationSummary");
    if (isVisible(rotation)) {
      return rotation.getBoundingClientRect();
    }
    return readProtectedPanelRect() || readSelectedItemsRect() || readGalleryRect();
  }

  function readProtectedPanelRect() {
    const rotation = document.querySelector("#rotationSummary");
    if (isVisible(rotation)) {
      return rotation.getBoundingClientRect();
    }
    const panel = document.querySelector(".form-panel");
    return isVisible(panel) ? panel.getBoundingClientRect() : null;
  }

  function readGalleryRect() {
    const gallery = document.querySelector("#imageGallery");
    return isVisible(gallery) ? gallery.getBoundingClientRect() : null;
  }

  function readSelectedItemsRect() {
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
    const rects = Array.from(state.selected)
      .filter((item) => item && item.isConnected)
      .map((item) => item.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0 && rect.left < viewportWidth && rect.top < viewportHeight);
    if (!rects.length) {
      return null;
    }
    const left = Math.min(...rects.map((rect) => rect.left));
    const right = Math.max(...rects.map((rect) => rect.right));
    const top = Math.min(...rects.map((rect) => rect.top));
    const bottom = Math.max(...rects.map((rect) => rect.bottom));
    return {
      left,
      right,
      top,
      bottom,
      width: right - left,
      height: bottom - top,
    };
  }

  function isVisible(element) {
    if (!element || element.hidden) {
      return false;
    }
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), Math.max(min, max));
  }

  async function deleteSelectedItems() {
    const items = Array.from(state.selected).filter((item) => item.isConnected);
    if (!items.length) {
      clearSelection();
      return;
    }
    const ids = items.flatMap(readGalleryIds).filter(Boolean);
    try {
      if (ids.length) {
        const response = await fetch(`${window.location.origin}/api/gallery`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids }),
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
      }
      removeItems(items);
      writeStatus(`已删除 ${items.length} 张图片。`);
    } catch (error) {
      writeStatus(`删除失败：${formatError(error)}。如果刚更新过工具，请重启本地服务。`, true);
    }
  }

  function removeItems(items) {
    const modal = document.querySelector("#imageModal");
    const activeDeleted = items.some((item) => item.classList.contains("active"));
    items.forEach((item) => item.remove());
    if (window.ImageToolApp && typeof window.ImageToolApp.handleGalleryItemsDeleted === "function") {
      window.ImageToolApp.handleGalleryItemsDeleted(items);
    }
    clearSelection();
    if (modal && activeDeleted) {
      modal.hidden = true;
    }
    const resultMeta = document.querySelector("#resultMeta");
    if (resultMeta) {
      resultMeta.textContent = `已删除 ${items.length} 张图片`;
    }
  }

  function readGalleryIds(item) {
    const data = item && item.galleryData || {};
    const ids = data.id ? [data.id] : [];
    if (Array.isArray(data.batchItems)) {
      data.batchItems.forEach((child) => {
        if (child.galleryData && child.galleryData.id) {
          ids.push(child.galleryData.id);
        }
      });
    }
    return ids;
  }

  function handleKeydown(event) {
    if (event.key === "Escape" && state.selected.size) {
      clearSelection();
    }
  }

  function suppressSelectionClick(event) {
    if (!state.suppressClick) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function shouldIgnoreTarget(target) {
    const blocked = "button, input, textarea, select, a, .form-panel, .topbar, .site-panel, .image-modal, .image-zoom-overlay, .gallery-delete-bar, .custom-select-menu, .size-picker, .drop-overlay";
    return Boolean(target && target.closest(blocked));
  }

  function isSelectableItem(item) {
    const data = item.galleryData || {};
    if (data.saving || data.updating) {
      return false;
    }
    return data.taskStatus !== "queued" && data.taskStatus !== "running";
  }

  function intersects(a, b) {
    return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();

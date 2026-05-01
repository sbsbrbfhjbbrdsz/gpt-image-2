(() => {
  const ACTIVE = new Set(["queued", "running"]);
  const ITEM_SELECTOR = ".gallery-item";
  const STALL_MS = 120000;
  let gallery = null;
  let observer = null;
  let pendingFrame = 0;
  const pendingItems = new Set();

  function init() {
    gallery = document.querySelector("#imageGallery");
    if (!gallery) {
      return;
    }
    gallery.addEventListener("click", handleStopClick, true);
    observer = new MutationObserver(scheduleFromMutations);
    observer.observe(gallery, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["class"] });
    window.setInterval(syncActiveItems, 3000);
    syncAll();
  }

  function handleStopClick(event) {
    const button = event.target.closest(".task-stop-button");
    if (!button) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    const item = button.closest(".gallery-item");
    if (window.ImageToolApp && typeof window.ImageToolApp.cancelGalleryTask === "function") {
      window.ImageToolApp.cancelGalleryTask(item);
    }
  }

  function syncAll() {
    if (!gallery) {
      return;
    }
    gallery.querySelectorAll(ITEM_SELECTOR).forEach(syncItem);
  }

  function syncActiveItems() {
    if (!gallery) {
      return;
    }
    gallery.querySelectorAll(".task-item").forEach(syncItem);
  }

  function scheduleFromMutations(mutations) {
    mutations.forEach((mutation) => {
      scheduleNodeItem(mutation.target, false);
      mutation.addedNodes.forEach((node) => scheduleNodeItem(node, true));
    });
  }

  function scheduleNodeItem(node, includeDescendants) {
    const element = node && (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement);
    if (!element || element === gallery) {
      return;
    }
    const item = element.matches(ITEM_SELECTOR) ? element : element.closest(ITEM_SELECTOR);
    if (item) {
      scheduleItem(item);
      return;
    }
    if (includeDescendants && element.querySelectorAll) {
      element.querySelectorAll(ITEM_SELECTOR).forEach(scheduleItem);
    }
  }

  function scheduleItem(item) {
    if (!item || !item.isConnected) {
      return;
    }
    pendingItems.add(item);
    if (pendingFrame) {
      return;
    }
    pendingFrame = window.requestAnimationFrame(flushPendingItems);
  }

  function flushPendingItems() {
    pendingFrame = 0;
    const items = Array.from(pendingItems);
    pendingItems.clear();
    items.forEach((item) => {
      if (item.isConnected) {
        syncItem(item);
      }
    });
  }

  function syncItem(item) {
    const data = item.galleryData || {};
    const active = ACTIVE.has(data.taskStatus);
    const stalled = active && isStalled(data);
    toggleControl(item, ".task-stop-button", active, createStopButton);
    toggleControl(item, ".task-stalled-label", stalled, createStalledLabel);
    const showSite = active || data.taskStatus === "failed";
    syncSiteLabel(item, showSite ? data.siteName : "");
  }

  function toggleControl(item, selector, show, create) {
    const found = item.querySelector(selector);
    if (show && !found) {
      item.append(create());
      return;
    }
    if (!show && found) {
      found.remove();
    }
  }

  function createStopButton() {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "task-stop-button";
    button.textContent = "停止";
    button.title = "停止此任务";
    button.setAttribute("aria-label", "停止此任务");
    return button;
  }

  function createStalledLabel() {
    const label = document.createElement("div");
    label.className = "task-stalled-label";
    label.textContent = "疑似停止";
    label.setAttribute("aria-hidden", "true");
    return label;
  }

  function syncSiteLabel(item, siteName) {
    const text = String(siteName || "").trim();
    let label = item.querySelector(".task-site-label");
    if (!text) {
      if (label) {
        label.remove();
      }
      return;
    }
    if (!label) {
      label = document.createElement("div");
      label.className = "task-site-label";
      item.append(label);
    }
    label.textContent = text;
  }

  function isStalled(data) {
    return data.taskStatus === "running" && Number(data.lastProgressAt) > 0 && Date.now() - Number(data.lastProgressAt) > STALL_MS;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();

// 图片详情单图删除按钮。
(() => {
  const state = { nav: null, modal: null, gallery: null, observer: null, frame: 0 };

  function init() {
    state.nav = document.querySelector("#modalGroupNav");
    state.modal = document.querySelector("#imageModal");
    state.gallery = document.querySelector("#imageGallery");
    if (!state.nav || !state.modal || !state.gallery) return;
    state.nav.addEventListener("click", handleClick);
    state.gallery.addEventListener("click", scheduleSync, true);
    state.gallery.addEventListener("keydown", scheduleSync, true);
    state.observer = new MutationObserver(sync);
    state.observer.observe(state.modal, { attributes: true, attributeFilter: ["hidden"] });
    sync();
  }

  function scheduleSync() {
    window.cancelAnimationFrame(state.frame);
    state.frame = window.requestAnimationFrame(sync);
  }

  function sync() {
    const item = getSingleActiveItem();
    if (!item || !canDelete(item)) {
      if (state.nav && !isBatchModal()) {
        state.nav.hidden = true;
        state.nav.innerHTML = "";
      }
      return;
    }
    if (isBatchModal()) return;
    state.nav.hidden = false;
    state.nav.innerHTML = "";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "modal-nav-button delete single-delete";
    button.textContent = "删除";
    button.title = "删除当前图片";
    button.setAttribute("aria-label", "删除当前图片");
    state.nav.append(button);
    document.dispatchEvent(new CustomEvent("modal-nav-updated"));
  }

  function handleClick(event) {
    const button = event.target.closest(".modal-nav-button.single-delete");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    void deleteActiveItem();
  }

  async function deleteActiveItem() {
    const item = getSingleActiveItem();
    if (!canDelete(item)) return;
    const data = item.galleryData || {};
    try {
      if (data.id) {
        const response = await fetch(`${window.location.origin}/api/gallery`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: [data.id] }),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
      }
      item.remove();
      window.ImageToolApp?.handleGalleryItemsDeleted?.([item]);
      window.ImageToolApp?.closeGalleryModal?.();
      writeStatus("已删除当前图片。");
    } catch (error) {
      writeStatus(`删除当前图片失败：${formatError(error)}`, true);
    }
  }

  function getSingleActiveItem() {
    const item = state.gallery && state.gallery.querySelector(".gallery-item.active");
    return item && item.galleryData && !item.galleryData.isBatch ? item : null;
  }

  function canDelete(item) {
    const data = item && item.galleryData || {};
    if (!data || data.taskStatus === "queued" || data.taskStatus === "running") return false;
    return data.taskStatus === "failed" || Boolean(data.id && data.persisted && !data.saving && !data.updating);
  }

  function isBatchModal() {
    const item = state.gallery && state.gallery.querySelector(".gallery-item.active");
    return Boolean(item && item.galleryData && item.galleryData.isBatch);
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

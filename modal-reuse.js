// 图片详情：把当前图片继续用于图生图或精修。
(() => {
  const state = { modal: null, gallery: null, nav: null, frame: 0 };

  function init() {
    state.modal = document.querySelector("#imageModal");
    state.gallery = document.querySelector("#imageGallery");
    state.nav = document.querySelector("#modalGroupNav");
    if (!state.modal || !state.gallery || !state.nav) return;
    state.gallery.addEventListener("click", scheduleSync, true);
    document.addEventListener("modal-nav-updated", scheduleSync);
    new MutationObserver(scheduleSync).observe(state.modal, { attributes: true, attributeFilter: ["hidden"], childList: true, subtree: true });
    syncButtons();
  }

  function createButton(mode, text) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "modal-reuse-button ghost";
    button.dataset.reuseMode = mode;
    button.textContent = text;
    button.addEventListener("click", () => { void reuseCurrentImage(mode); });
    return button;
  }

  function scheduleSync() {
    window.cancelAnimationFrame(state.frame);
    state.frame = window.requestAnimationFrame(syncButtons);
  }

  function syncButtons() {
    const data = readCurrentImageData();
    ensureButtons();
    if (data) state.nav.hidden = false;
    state.nav.querySelectorAll(".modal-reuse-button").forEach((button) => {
      button.hidden = state.modal.hidden || !data;
    });
    const actions = state.nav.querySelector(".modal-reuse-actions");
    if (actions) actions.hidden = state.modal.hidden || !data;
  }

  function ensureButtons() {
    if (state.nav.querySelector(".modal-reuse-actions")) return;
    const actions = document.createElement("div");
    actions.className = "modal-reuse-actions";
    actions.append(createButton("image", "继续生图"), createButton("edit", "继续优化"));
    const remove = state.nav.querySelector(".delete");
    state.nav.insertBefore(actions, remove || null);
  }

  async function reuseCurrentImage(mode) {
    const data = readCurrentImageData();
    if (!data) return;
    try {
      const file = await createFileFromImage(data);
      const input = document.querySelector(mode === "edit" ? "#editImages" : "#imageImages");
      if (!input) return;
      setInputFile(input, file);
      document.querySelector(`.tab-button[data-tab="${mode}"]`)?.click();
      window.ImageToolApp?.closeGalleryModal?.();
      writeStatus(mode === "edit" ? "已添加到精修图原图。" : "已添加到图生图参考图。");
    } catch (error) {
      writeStatus(`添加当前图片失败：${formatError(error)}`, true);
    }
  }

  function readCurrentImageData() {
    const item = state.gallery && state.gallery.querySelector(".gallery-item.active");
    const viewItem = window.ImageToolBatch?.getActiveChild?.(item) || item;
    const data = viewItem && viewItem.galleryData || {};
    const source = data.dataUrl || data.imageUrl || "";
    return source ? { source, format: data.format || "png", number: data.number || Date.now() } : null;
  }

  async function createFileFromImage(data) {
    const response = await fetch(data.source);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    const format = normalizeFormat(data.format, blob.type);
    return new File([blob], `gallery-${data.number}.${format}`, { type: blob.type || `image/${format}` });
  }

  function setInputFile(input, file) {
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function normalizeFormat(format, mime) {
    const value = String(format || "").toLowerCase();
    if (value === "jpeg" || value === "jpg") return "jpg";
    if (value === "webp") return "webp";
    if (String(mime || "").includes("webp")) return "webp";
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

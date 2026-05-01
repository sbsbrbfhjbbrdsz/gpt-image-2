(() => {
  const START_DELAY = 280;
  const LOAD_TIMEOUT = 20000;
  const LOAD_AHEAD = 520;
  const state = {
    queue: [],
    queued: new Set(),
    active: new Set(),
    pending: new Set(),
    pendingObserver: null,
    pendingFrame: 0,
    taskBusy: false,
    timer: 0,
    lastStart: 0,
  };

  function init() {
    const gallery = document.querySelector("#imageGallery");
    if (!gallery) {
      return;
    }
    gallery.addEventListener("pointerdown", loadEventImage, true);
    gallery.addEventListener("focusin", loadEventImage, true);
    window.addEventListener("scroll", schedulePendingScan, { passive: true });
    window.addEventListener("resize", schedulePendingScan);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", resumeLoading);
    window.addEventListener("pageshow", resumeLoading);
  }

  function setImageSource(image, source, item = null, options = {}) {
    if (!image || !source) {
      return false;
    }
    const galleryItem = item || image.closest(".gallery-item");
    const current = image.getAttribute("src") || "";
    if (current === source || image.dataset.lazySrc === source) {
      return true;
    }
    image.loading = "eager";
    image.decoding = "async";
    image.fetchPriority = "low";
    if (shouldLoadImmediately(source, galleryItem, options)) {
      assignImmediateSource(image, source);
      return true;
    }
    if (galleryItem) {
      galleryItem.classList.add("gallery-lazy-pending");
      galleryItem.classList.remove("gallery-lazy-enter");
    }
    image.dataset.lazySrc = source;
    image.dataset.lazyState = "waiting";
    image.removeAttribute("src");
    queueOrWatch(image);
    return true;
  }

  function loadEventImage(event) {
    const item = event.target && event.target.closest(".gallery-item");
    const image = item && item.querySelector("img[data-lazy-src]");
    loadNow(image);
  }

  function loadNow(image) {
    if (!image || !image.dataset.lazySrc) {
      return;
    }
    queueOrWatch(image, true);
  }

  function shouldLoadImmediately(source, item, options) {
    return Boolean(options.immediate)
      || source.startsWith("data:")
      || source.startsWith("blob:")
      || Boolean(item && item.classList && item.classList.contains("active"));
  }

  function queueOrWatch(image, urgent = false) {
    if (!image || !image.dataset.lazySrc) {
      return;
    }
    if (isPageHidden() || state.taskBusy || !isLoadCandidate(image)) {
      watchPending(image);
      return;
    }
    if (!urgent) {
      watchPending(image);
      return;
    }
    enqueue(image, urgent);
  }

  function enqueue(image, urgent = false) {
    if (isPageHidden() || state.taskBusy) {
      watchPending(image);
      return;
    }
    if (!state.queued.has(image)) {
      state.pending.delete(image);
      state.queued.add(image);
      if (urgent) {
        state.queue.unshift(image);
      } else {
        state.queue.push(image);
      }
    }
    scheduleDrain(urgent);
  }

  function scheduleDrain(urgent = false) {
    if (isPageHidden() || state.taskBusy || state.active.size > 0 || state.queue.length === 0) {
      return;
    }
    if (state.timer) {
      return;
    }
    const elapsed = performance.now() - state.lastStart;
    const delay = urgent ? 0 : Math.max(0, START_DELAY - elapsed);
    state.timer = window.setTimeout(drainQueue, delay);
  }

  function drainQueue() {
    state.timer = 0;
    if (isPageHidden() || state.taskBusy || state.active.size > 0) {
      return;
    }
    sortQueueByDocumentOrder();
    while (state.queue.length) {
      const image = state.queue.shift();
      state.queued.delete(image);
      if (isLoadCandidate(image)) {
        startLoad(image);
        break;
      }
      watchPending(image);
    }
    if (state.queue.length) {
      scheduleDrain();
    }
  }

  function sortQueueByDocumentOrder() {
    state.queue.sort((left, right) => compareImageOrder(left, right));
  }

  function compareImageOrder(left, right) {
    const leftItem = left && left.closest && left.closest(".gallery-item");
    const rightItem = right && right.closest && right.closest(".gallery-item");
    if (!leftItem || !rightItem || leftItem === rightItem) {
      return 0;
    }
    const position = leftItem.compareDocumentPosition(rightItem);
    if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
      return -1;
    }
    if (position & Node.DOCUMENT_POSITION_PRECEDING) {
      return 1;
    }
    return 0;
  }

  function startLoad(image) {
    if (isPageHidden() || state.taskBusy || state.active.size > 0) {
      watchPending(image);
      return;
    }
    const source = image.dataset.lazySrc;
    if (!source) {
      return;
    }
    const item = image.closest(".gallery-item");
    if (item) {
      item.classList.add("gallery-lazy-loading");
    }
    state.active.add(image);
    state.lastStart = performance.now();
    const token = preloadSource(image, source);
    window.setTimeout(schedulePendingScan, START_DELAY);
    window.setTimeout(() => revealImage(image, source, token), LOAD_TIMEOUT);
  }

  function preloadSource(image, source) {
    const controller = "AbortController" in window ? new AbortController() : null;
    const token = { controller, objectUrl: "", source, done: false };
    image.__imageToolLazy = token;
    image.dataset.lazyState = "loading";
    fetch(source, { cache: "force-cache", signal: controller && controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.blob();
      })
      .then((blob) => {
        token.objectUrl = URL.createObjectURL(blob);
        revealImage(image, source, token, token.objectUrl);
      })
      .catch((error) => {
        if (error && error.name === "AbortError") {
          return;
        }
        revealImage(image, source, token, source);
      });
    return token;
  }

  function assignImmediateSource(image, source) {
    const item = image.closest(".gallery-item");
    state.queued.delete(image);
    state.active.delete(image);
    state.pending.delete(image);
    state.queue = state.queue.filter((queuedImage) => queuedImage !== image);
    delete image.dataset.lazySrc;
    image.dataset.lazyState = "loaded";
    image.loading = "eager";
    if (item) {
      item.classList.remove("gallery-lazy-pending", "gallery-lazy-loading");
    }
    image.src = source;
    schedulePendingScan();
  }

  function revealImage(image, source, token = null, displaySource = source) {
    if (!image || !image.isConnected || image.dataset.lazySrc !== source) {
      return;
    }
    if (isPageHidden()) {
      if (token) {
        token.displaySource = displaySource;
        token.ready = true;
      }
      return;
    }
    const activeToken = image.__imageToolLazy;
    if (token && token !== activeToken || activeToken && activeToken.source !== source) {
      return;
    }
    if (activeToken) {
      activeToken.done = true;
      if (activeToken.controller) {
        activeToken.controller.abort();
      }
      delete image.__imageToolLazy;
    }
    state.pending.delete(image);
    image.loading = "eager";
    const item = image.closest(".gallery-item");
    let finished = false;
    const finish = (imageLoaded) => {
      if (finished) {
        return;
      }
      finished = true;
      state.active.delete(image);
      if (image.dataset.lazySrc === source) {
        delete image.dataset.lazySrc;
      }
      image.dataset.lazyState = imageLoaded ? "loaded" : "error";
      if (token && token.objectUrl) {
        URL.revokeObjectURL(token.objectUrl);
      }
      if (item) {
        item.classList.remove("gallery-lazy-pending", "gallery-lazy-loading");
        item.classList.add("gallery-lazy-enter");
        window.setTimeout(() => item.classList.remove("gallery-lazy-enter"), 650);
      }
      scheduleDrain();
      schedulePendingScan();
    };
    image.addEventListener("load", () => finish(true), { once: true });
    image.addEventListener("error", () => finish(false), { once: true });
    window.setTimeout(() => finish(false), LOAD_TIMEOUT);
    image.src = displaySource || source;
  }

  function watchPending(image) {
    if (!image || !image.dataset.lazySrc) {
      return;
    }
    state.pending.add(image);
    if (!state.taskBusy) {
      schedulePendingScan();
    }
  }

  function setTaskBusy(busy) {
    const next = Boolean(busy);
    if (state.taskBusy === next) {
      return;
    }
    state.taskBusy = next;
    if (next) {
      window.clearTimeout(state.timer);
      state.timer = 0;
      if (state.pendingFrame) {
        window.cancelAnimationFrame(state.pendingFrame);
        state.pendingFrame = 0;
      }
      if (state.pendingObserver) {
        state.pendingObserver.disconnect();
        state.pendingObserver = null;
      }
      return;
    }
    scheduleDrain();
    schedulePendingScan();
  }

  function ensurePendingObserver() {
    if (state.pendingObserver || state.taskBusy || !("MutationObserver" in window)) {
      return;
    }
    const gallery = document.querySelector("#imageGallery");
    if (!gallery) {
      return;
    }
    state.pendingObserver = new MutationObserver(schedulePendingScan);
    state.pendingObserver.observe(gallery, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "hidden"],
    });
  }

  function schedulePendingScan() {
    if (isPageHidden() || state.taskBusy) {
      return;
    }
    ensurePendingObserver();
    if (state.pendingFrame) {
      return;
    }
    state.pendingFrame = window.requestAnimationFrame(scanPending);
  }

  function scanPending() {
    state.pendingFrame = 0;
    if (isPageHidden() || state.taskBusy) {
      return;
    }
    Array.from(state.pending).forEach((image) => {
      if (!image || !image.dataset.lazySrc) {
        state.pending.delete(image);
      }
    });
    if (shouldLoadMore()) {
      enqueueNextPending();
    }
    if (!state.pending.size && state.pendingObserver) {
      state.pendingObserver.disconnect();
      state.pendingObserver = null;
    }
  }

  function enqueueNextPending() {
    const next = Array.from(state.pending)
      .filter(isLoadCandidate)
      .sort(compareImageOrder)[0];
    if (next) {
      enqueue(next);
    }
  }

  function shouldLoadMore() {
    if (isPageHidden() || state.taskBusy || state.active.size > 0 || !state.pending.size || state.queue.length) {
      return false;
    }
    const gallery = document.querySelector("#imageGallery");
    if (!gallery) {
      return true;
    }
    const rect = gallery.getBoundingClientRect();
    const viewportHeight = document.documentElement.clientHeight || window.innerHeight || 0;
    return rect.bottom <= viewportHeight + LOAD_AHEAD;
  }

  function isLoadCandidate(image) {
    if (!image || !image.isConnected || !image.dataset.lazySrc) {
      return false;
    }
    const item = image.closest(".gallery-item");
    return !item || (!item.hidden && !item.classList.contains("filtered-out"));
  }

  function handleVisibilityChange() {
    if (isPageHidden()) {
      pauseLoading();
      return;
    }
    resumeLoading();
  }

  function pauseLoading() {
    window.clearTimeout(state.timer);
    state.timer = 0;
    if (state.pendingFrame) {
      window.cancelAnimationFrame(state.pendingFrame);
      state.pendingFrame = 0;
    }
    if (state.pendingObserver) {
      state.pendingObserver.disconnect();
      state.pendingObserver = null;
    }
    state.queue.forEach((image) => state.pending.add(image));
    state.queue = [];
    state.queued.clear();
  }

  function resumeLoading() {
    if (isPageHidden()) {
      return;
    }
    revealReadyImages();
    state.lastStart = 0;
    schedulePendingScan();
    scheduleDrain();
  }

  function isPageHidden() {
    return document.visibilityState === "hidden";
  }

  function revealReadyImages() {
    Array.from(state.active).forEach((image) => {
      const token = image && image.__imageToolLazy;
      if (token && token.ready && image.dataset.lazySrc === token.source) {
        revealImage(image, token.source, token, token.displaySource || token.objectUrl || token.source);
      }
    });
  }

  window.ImageToolLazy = { setImageSource, loadNow, setTaskBusy };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();

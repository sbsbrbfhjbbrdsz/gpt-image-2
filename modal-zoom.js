(() => {
  const MIN_SCALE = 1;
  const MAX_SCALE = 6;
  const WHEEL_STEP = 0.18;
  const state = {
    overlay: null,
    image: null,
    source: null,
    scale: 1,
    x: 0,
    y: 0,
    dragging: false,
    pointerId: 0,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
    moved: false,
    suppressBackdropClick: false,
  };

  function init() {
    state.source = document.querySelector("#modalImage");
    if (!state.source) {
      return;
    }
    createOverlay();
    state.source.addEventListener("click", openFromSource);
    window.addEventListener("keydown", handleKeydown, true);
  }

  function createOverlay() {
    const overlay = document.createElement("div");
    overlay.className = "image-zoom-overlay";
    overlay.hidden = true;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "图片放大查看");
    overlay.tabIndex = -1;

    const image = document.createElement("img");
    image.className = "image-zoom-image";
    image.alt = "放大图片";
    image.draggable = false;

    overlay.append(image);
    document.body.append(overlay);

    overlay.addEventListener("click", (event) => {
      if (state.suppressBackdropClick) {
        state.suppressBackdropClick = false;
        return;
      }
      if (event.target === overlay) {
        closeZoom();
      }
    });
    overlay.addEventListener("wheel", handleWheel, { passive: false });
    overlay.addEventListener("pointerdown", startDrag);
    window.addEventListener("pointermove", moveDrag);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    image.addEventListener("dblclick", toggleZoom);
    image.addEventListener("click", (event) => event.stopPropagation());

    state.overlay = overlay;
    state.image = image;
  }

  function openFromSource(event) {
    const src = state.source.currentSrc || state.source.src;
    if (!src || state.source.hidden || state.source.offsetParent === null) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    openZoom(src);
  }

  function openZoom(src) {
    resetTransform();
    state.image.src = src;
    state.overlay.hidden = false;
    document.body.classList.add("image-zoom-open");
    state.overlay.focus({ preventScroll: true });
  }

  function closeZoom() {
    if (!state.overlay || state.overlay.hidden) {
      return;
    }
    state.overlay.hidden = true;
    state.image.removeAttribute("src");
    document.body.classList.remove("image-zoom-open");
  }

  function handleKeydown(event) {
    if (event.key === "Escape" && state.overlay && !state.overlay.hidden) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      closeZoom();
    }
  }

  function handleWheel(event) {
    if (state.overlay.hidden) {
      return;
    }
    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : -1;
    setScale(state.scale + direction * WHEEL_STEP);
  }

  function toggleZoom(event) {
    event.preventDefault();
    if (state.scale > 1) {
      resetTransform();
      return;
    }
    setScale(2.5);
  }

  function setScale(value) {
    state.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
    if (state.scale === MIN_SCALE) {
      state.x = 0;
      state.y = 0;
    }
    applyTransform();
  }

  function resetTransform() {
    state.scale = 1;
    state.x = 0;
    state.y = 0;
    applyTransform();
  }

  function startDrag(event) {
    event.stopPropagation();
    if (state.scale <= 1) {
      return;
    }
    event.preventDefault();
    state.dragging = true;
    state.pointerId = event.pointerId;
    state.startX = event.clientX;
    state.startY = event.clientY;
    state.originX = state.x;
    state.originY = state.y;
    state.moved = false;
    state.overlay.classList.add("dragging");
    state.overlay.setPointerCapture(event.pointerId);
  }

  function moveDrag(event) {
    if (!state.dragging || event.pointerId !== state.pointerId) {
      return;
    }
    event.stopPropagation();
    state.x = state.originX + event.clientX - state.startX;
    state.y = state.originY + event.clientY - state.startY;
    state.moved = state.moved || Math.hypot(event.clientX - state.startX, event.clientY - state.startY) > 3;
    applyTransform();
  }

  function endDrag(event) {
    if (!state.dragging || event.pointerId !== state.pointerId) {
      return;
    }
    event.stopPropagation();
    state.suppressBackdropClick = state.moved;
    state.dragging = false;
    state.overlay.classList.remove("dragging");
    try {
      state.overlay.releasePointerCapture(event.pointerId);
    } catch {
      // The pointer may already be released when the browser cancels dragging.
    }
  }

  function applyTransform() {
    if (!state.image) {
      return;
    }
    state.image.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.scale})`;
    state.image.classList.toggle("zoomed", state.scale > 1);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();

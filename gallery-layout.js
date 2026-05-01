(() => {
  const ITEM_SELECTOR = ".gallery-item";
  const LAYOUT_IGNORE_SELECTOR = ".task-stop-button, .task-stalled-label, .task-site-label";
  const MIN_COLUMN_WIDTH = 164;
  const GAP = 12;
  let gallery = null;
  let resizeObserver = null;
  let mutationObserver = null;
  let scheduled = false;

  function init() {
    gallery = document.querySelector("#imageGallery");
    if (!gallery) {
      return;
    }
    gallery.classList.add("masonry-ready");
    resizeObserver = new ResizeObserver(scheduleLayout);
    resizeObserver.observe(gallery);
    mutationObserver = new MutationObserver(scheduleFromMutations);
    mutationObserver.observe(gallery, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "hidden", "src"],
    });
    gallery.addEventListener("load", scheduleLayout, true);
    window.addEventListener("resize", scheduleLayout);
    scheduleLayout();
  }

  function scheduleLayout() {
    if (scheduled) {
      return;
    }
    scheduled = true;
    window.requestAnimationFrame(() => {
      scheduled = false;
      layoutGallery();
    });
  }

  function scheduleFromMutations(mutations) {
    if (mutations.some(shouldLayoutForMutation)) {
      scheduleLayout();
    }
  }

  function shouldLayoutForMutation(mutation) {
    if (mutation.type === "attributes") {
      return !isIgnoredLayoutNode(mutation.target);
    }
    if (mutation.type !== "childList") {
      return true;
    }
    const nodes = [...mutation.addedNodes, ...mutation.removedNodes]
      .filter((node) => node.nodeType === Node.ELEMENT_NODE);
    return nodes.length === 0 || nodes.some((node) => !isIgnoredLayoutNode(node));
  }

  function isIgnoredLayoutNode(node) {
    return node && node.nodeType === Node.ELEMENT_NODE && node.matches(LAYOUT_IGNORE_SELECTOR);
  }

  function layoutGallery() {
    if (!gallery) {
      return;
    }
    const width = gallery.clientWidth;
    if (!width) {
      return;
    }
    const columns = Math.max(1, Math.floor((width + GAP) / (MIN_COLUMN_WIDTH + GAP)));
    const columnWidth = Math.floor((width - GAP * (columns - 1)) / columns);
    const heights = Array(columns).fill(0);
    const visibleItems = getVisibleItems();

    if (!visibleItems.length) {
      gallery.style.height = "";
      return;
    }

    visibleItems.forEach((item, index) => {
      reserveItemSize(item);
      const column = index < columns ? index : findShortestColumn(heights);
      item.style.position = "absolute";
      item.style.width = `${columnWidth}px`;
      item.style.left = `${column * (columnWidth + GAP)}px`;
      item.style.top = `${heights[column]}px`;
      const height = Math.ceil(item.getBoundingClientRect().height);
      heights[column] += height + GAP;
    });

    gallery.style.height = `${Math.max(...heights) - GAP}px`;
  }

  function getVisibleItems() {
    return Array.from(gallery.querySelectorAll(ITEM_SELECTOR)).filter((item) => {
      if (item.hidden || item.classList.contains("filtered-out") || item.classList.contains("gallery-lazy-pending")) {
        resetItemLayout(item);
        return false;
      }
      return true;
    });
  }

  function resetItemLayout(item) {
    item.style.position = "";
    item.style.width = "";
    item.style.left = "";
    item.style.top = "";
  }

  function findShortestColumn(heights) {
    let index = 0;
    for (let i = 1; i < heights.length; i += 1) {
      if (heights[i] < heights[index]) {
        index = i;
      }
    }
    return index;
  }

  function reserveItemSize(item) {
    const image = item.querySelector("img");
    if (!image) {
      return;
    }
    const data = item.galleryData || {};
    const size = parseSize(data.actualSize) || parseSize(data.requestedSize) || readNaturalSize(image);
    if (!size) {
      return;
    }
    image.style.aspectRatio = `${size.width} / ${size.height}`;
  }

  function readNaturalSize(image) {
    return image.naturalWidth && image.naturalHeight ? { width: image.naturalWidth, height: image.naturalHeight } : null;
  }

  function parseSize(value) {
    const match = String(value || "").match(/^(\d{2,5})x(\d{2,5})$/i);
    if (!match) {
      return null;
    }
    const width = Number(match[1]);
    const height = Number(match[2]);
    return Number.isFinite(width) && Number.isFinite(height) ? { width, height } : null;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();

// 画廊筛选相关的小工具，避免继续膨胀主交互文件。
(() => {
  function buildCategoryFilterOptions(categories, galleryEl) {
    const usedIds = new Set();
    let hasUncategorized = false;
    if (galleryEl) {
      galleryEl.querySelectorAll(".gallery-item").forEach((item) => {
        const data = item.galleryData;
        if (!data || item.classList.contains("task-item") || data.taskStatus === "failed") {
          return;
        }
        const ids = normalizeIds(data.categoryIds);
        if (ids.length === 0) {
          hasUncategorized = true;
          return;
        }
        ids.forEach((id) => usedIds.add(id));
      });
    }
    const options = [["all", "分类"]];
    if (hasUncategorized) {
      options.push(["uncategorized", "未分类"]);
    }
    normalizeCategories(categories).forEach((category) => {
      if (usedIds.has(category.id)) {
        options.push([category.id, category.name]);
      }
    });
    return options;
  }
  function renderCategoryFilterChips(container, options, selectedValue, onSelect) {
    if (!container) {
      return;
    }
    container.innerHTML = "";
    (Array.isArray(options) ? options : []).filter(([value]) => value !== "all" && value !== "uncategorized").forEach(([value, label]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "gallery-filter-chip";
      button.classList.toggle("active", value === selectedValue);
      button.textContent = label;
      button.addEventListener("click", () => onSelect(value === selectedValue ? "all" : value));
      container.append(button);
    });
  }
  function normalizeIds(ids) {
    return (Array.isArray(ids) ? ids : []).map((id) => String(id || "").trim()).filter(Boolean);
  }
  function normalizeCategories(categories) {
    return (Array.isArray(categories) ? categories : []).filter((category) => category && category.id && category.name);
  }
  function matchesGalleryFilter(data, filters) {
    const filter = filters || {};
    return matchesCategoryFilter(data, filter.category)
      && matchesResolutionFilter(data, filter.resolution)
      && matchesRatioFilter(data, filter.ratio);
  }
  function syncItemFilterState(item, filters, galleryEl) {
    if (!item || !item.galleryData || !galleryEl) {
      return;
    }
    const matched = matchesGalleryFilter(item.galleryData, filters);
    item.hidden = !matched;
    item.classList.toggle("filtered-out", !matched);
    if (matched) {
      galleryEl.classList.remove("filtered-empty");
      return;
    }
    if (!galleryEl.querySelector(".gallery-item:not(.filtered-out):not([hidden])")) {
      galleryEl.classList.add("filtered-empty");
    }
  }
  function matchesCategoryFilter(data, filter) {
    const value = filter || "all";
    if (value === "all") {
      return true;
    }
    const categoryIds = normalizeIds(data && data.categoryIds);
    if (value === "uncategorized") {
      return categoryIds.length === 0;
    }
    return categoryIds.includes(value);
  }
  function matchesResolutionFilter(data, filter) {
    const value = filter || "all";
    if (value === "all") {
      return true;
    }
    const size = parseSize(data && data.actualSize);
    return Boolean(size) && classifyResolution(size) === value.replace(/^level:/, "");
  }
  function matchesRatioFilter(data, filter) {
    const value = filter || "all";
    if (value === "all") {
      return true;
    }
    const size = parseSize(data && data.actualSize);
    return Boolean(size) && classifyRatio(size) === value.replace(/^ratio:/, "");
  }
  function classifyResolution(size) {
    const longEdge = Math.max(size.width, size.height);
    if (longEdge >= 3000) {
      return "4K";
    }
    if (longEdge >= 1900) {
      return "2K";
    }
    if (longEdge >= 900) {
      return "1K";
    }
    return "small";
  }
  function classifyRatio(size) {
    const ratio = simplifyRatio(size.width, size.height);
    const supported = new Set(["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "21:9", "9:21"]);
    return supported.has(ratio) ? ratio : "other";
  }
  function simplifyRatio(width, height) {
    const divisor = gcd(width, height);
    return `${Math.round(width / divisor)}:${Math.round(height / divisor)}`;
  }
  function gcd(left, right) {
    let a = Math.abs(Math.round(left));
    let b = Math.abs(Math.round(right));
    while (b) {
      const next = a % b;
      a = b;
      b = next;
    }
    return a || 1;
  }
  function parseSize(size) {
    const match = String(size || "").match(/^(\d{2,5})x(\d{2,5})$/i);
    if (!match) {
      return null;
    }
    const width = Number(match[1]);
    const height = Number(match[2]);
    return Number.isFinite(width) && Number.isFinite(height) ? { width, height } : null;
  }
  window.ImageToolGallery = { buildCategoryFilterOptions, renderCategoryFilterChips, matchesGalleryFilter, syncItemFilterState };
})();

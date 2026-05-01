(() => {
  const SELECTOR = ".form-panel select:not(.size-select)";
  const instances = new Map();
  let openInstance = null;
  let pollTimer = null;

  function init() {
    document.querySelectorAll(SELECTOR).forEach(enhanceSelect);
    document.addEventListener("click", (event) => {
      if (openInstance && !openInstance.root.contains(event.target) && !openInstance.menu.contains(event.target)) {
        closeSelect(openInstance);
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && openInstance) {
        closeSelect(openInstance);
        openInstance.button.focus();
      }
    });
    document.addEventListener("change", (event) => {
      if (event.target && event.target.tagName === "SELECT") {
        window.requestAnimationFrame(() => refreshAll(true));
      }
    }, true);
    document.addEventListener("click", handleSizeTriggerClick, true);
    window.addEventListener("resize", positionOpenSelect);
    window.addEventListener("scroll", positionOpenSelect, true);
    startPolling();
  }

  function enhanceSelect(select) {
    if (!select || instances.has(select)) {
      return;
    }

    const root = document.createElement("div");
    root.className = "custom-select";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "custom-select-button";
    button.setAttribute("aria-haspopup", "listbox");
    button.setAttribute("aria-expanded", "false");

    const value = document.createElement("span");
    value.className = "custom-select-value";
    button.append(value);

    const menu = document.createElement("div");
    menu.className = "custom-select-menu";
    menu.setAttribute("role", "listbox");
    menu.hidden = true;

    root.append(button);
    document.body.append(menu);
    select.insertAdjacentElement("beforebegin", root);
    select.classList.add("custom-select-native");

    const instance = {
      select,
      root,
      button,
      value,
      menu,
      lastValue: "",
      lastDisabled: null,
      lastOptionSignature: "",
      observer: null,
    };
    instances.set(select, instance);

    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleSelect(instance);
    });
    button.addEventListener("keydown", (event) => handleButtonKeydown(event, instance));
    menu.addEventListener("click", (event) => {
      event.stopPropagation();
    });
    select.addEventListener("change", () => refreshSelect(instance, true));

    instance.observer = new MutationObserver(() => {
      renderOptions(instance);
      refreshSelect(instance, true);
    });
    instance.observer.observe(select, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["disabled", "label", "selected", "value"],
    });

    renderOptions(instance);
    refreshSelect(instance, true);
  }

  function renderOptions(instance) {
    const { select, menu } = instance;
    const signature = Array.from(select.options).map((option) => {
      return [option.value, option.textContent, option.disabled].join("\u0001");
    }).join("\u0002");
    if (signature === instance.lastOptionSignature) {
      return;
    }
    instance.lastOptionSignature = signature;
    menu.innerHTML = "";
    Array.from(select.options).forEach((option) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "custom-select-option";
      item.setAttribute("role", "option");
      item.dataset.value = option.value;
      item.textContent = option.textContent || option.value;
      item.disabled = option.disabled;
      item.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (item.disabled) {
          return;
        }
        select.value = option.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        refreshSelect(instance, true);
        closeSelect(instance);
        if (instance.root.offsetParent !== null) {
          instance.button.focus();
        }
      });
      menu.append(item);
    });
  }

  function refreshSelect(instance, force = false) {
    const { select, root, button, value, menu } = instance;
    const selected = select.selectedOptions && select.selectedOptions[0];
    const label = selected ? selected.textContent || selected.value : select.value || "";
    const disabled = select.disabled;
    if (!force && instance.lastValue === select.value && instance.lastDisabled === disabled) {
      return;
    }
    instance.lastValue = select.value;
    instance.lastDisabled = disabled;
    value.textContent = label;
    button.title = label;
    button.disabled = disabled;
    root.classList.toggle("disabled", disabled);
    Array.from(menu.children).forEach((item) => {
      const active = item.dataset.value === select.value;
      item.classList.toggle("active", active);
      item.setAttribute("aria-selected", String(active));
    });
  }

  function toggleSelect(instance) {
    if (instance.select.disabled) {
      return;
    }
    if (openInstance === instance) {
      closeSelect(instance);
      return;
    }
    if (openInstance) {
      closeSelect(openInstance);
    }
    closeSizePickerPanel();
    renderOptions(instance);
    refreshSelect(instance, true);
    openSelect(instance);
  }

  function openSelect(instance) {
    instance.menu.hidden = false;
    instance.root.classList.add("open");
    instance.button.setAttribute("aria-expanded", "true");
    openInstance = instance;
    positionSelectMenu(instance);
  }

  function closeSelect(instance) {
    instance.menu.hidden = true;
    instance.root.classList.remove("open");
    instance.button.setAttribute("aria-expanded", "false");
    if (openInstance === instance) {
      openInstance = null;
    }
  }

  function positionOpenSelect() {
    if (openInstance) {
      positionSelectMenu(openInstance);
    }
  }

  function positionSelectMenu(instance) {
    if (!instance || instance.menu.hidden) {
      return;
    }
    const rect = instance.button.getBoundingClientRect();
    const width = Math.max(64, rect.width);
    const menu = instance.menu;
    menu.style.width = `${width}px`;
    menu.style.left = `${Math.min(window.innerWidth - width - 8, Math.max(8, rect.left))}px`;
    const menuRect = menu.getBoundingClientRect();
    const above = rect.top - menuRect.height - 5;
    const below = rect.bottom + 5;
    const top = above >= 8 ? above : Math.min(window.innerHeight - menuRect.height - 8, below);
    menu.style.top = `${Math.max(8, top)}px`;
  }

  function handleButtonKeydown(event, instance) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleSelect(instance);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      stepSelection(instance, event.key === "ArrowDown" ? 1 : -1);
    }
  }

  function stepSelection(instance, direction) {
    const options = Array.from(instance.select.options).filter((option) => !option.disabled);
    if (!options.length) {
      return;
    }
    const current = Math.max(0, options.findIndex((option) => option.value === instance.select.value));
    const next = options[(current + direction + options.length) % options.length];
    instance.select.value = next.value;
    instance.select.dispatchEvent(new Event("change", { bubbles: true }));
    refreshSelect(instance, true);
  }

  function startPolling() {
    if (pollTimer) {
      return;
    }
    pollTimer = window.setInterval(() => {
      if (document.hidden) {
        return;
      }
      refreshAll();
    }, 500);
  }

  function refreshAll(force = false) {
    instances.forEach((instance) => {
      renderOptions(instance);
      refreshSelect(instance, force);
    });
  }

  function handleSizeTriggerClick(event) {
    const trigger = event.target && event.target.closest(".size-trigger");
    const panel = document.querySelector("#sizePicker");
    if (!trigger) {
      return;
    }
    if (openInstance) {
      closeSelect(openInstance);
    }
    if (!panel || panel.hidden) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    closeSizePickerPanel();
  }

  function closeSizePickerPanel() {
    const panel = document.querySelector("#sizePicker");
    if (panel) {
      panel.hidden = true;
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();

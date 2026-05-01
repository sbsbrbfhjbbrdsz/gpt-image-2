(function () {
  "use strict";

  const storageKey = "vibeapi.imagesDimmed";
  const className = "images-dimmed";

  function readStoredState() {
    try {
      return localStorage.getItem(storageKey) === "1";
    } catch (error) {
      return false;
    }
  }

  function saveState(enabled) {
    try {
      localStorage.setItem(storageKey, enabled ? "1" : "0");
    } catch (error) {
      // Ignore storage failures; the shortcut should still work for this page load.
    }
  }

  function applyState(enabled) {
    document.body.classList.toggle(className, enabled);
    saveState(enabled);
  }

  function isDimShortcut(event) {
    return event.altKey
      && !event.ctrlKey
      && !event.metaKey
      && !event.repeat
      && (event.code === "Backquote" || event.key === "`" || event.key === "~");
  }

  function toggleDimmed() {
    applyState(!document.body.classList.contains(className));
  }

  applyState(readStoredState());

  window.addEventListener("keydown", (event) => {
    if (!isDimShortcut(event)) {
      return;
    }

    event.preventDefault();
    toggleDimmed();
  });
})();

// 图片详情提示词复制按钮。
(() => {
  const TARGET_LABELS = new Set(["提示词", "优化后"]);
  let details = null;
  let resetTimer = 0;

  function init() {
    details = document.querySelector("#modalDetails");
    if (!details) return;
    new MutationObserver(syncCopyButtons).observe(details, { childList: true, subtree: true });
    syncCopyButtons();
  }

  function syncCopyButtons() {
    details.querySelectorAll(".modal-detail-row.prompt-detail").forEach((row) => {
      const label = row.querySelector("span");
      const text = row.querySelector("p");
      const labelText = readLabelText(label);
      if (!label || !text || !TARGET_LABELS.has(labelText) || label.querySelector(".modal-copy-button")) return;
      label.classList.add("modal-copy-title");
      const button = createCopyButton(text, labelText);
      label.append(button);
    });
  }

  function readLabelText(label) {
    return String(label && label.firstChild && label.firstChild.textContent || label && label.textContent || "").trim();
  }

  function createCopyButton(textElement, labelText) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "modal-copy-button";
    button.title = `复制${labelText}`;
    button.setAttribute("aria-label", `复制${labelText}`);
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="10" height="10" rx="2"></rect><path d="M5 15V7a2 2 0 0 1 2-2h8"></path></svg>';
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void copyText(textElement.textContent || "", button);
    });
    return button;
  }

  async function copyText(text, button) {
    const value = String(text || "").trim();
    if (!value || value === "未记录" || value === "无") return;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
      } else {
        fallbackCopy(value);
      }
      markCopied(button);
    } catch {
      fallbackCopy(value);
      markCopied(button);
    }
  }

  function fallbackCopy(value) {
    const input = document.createElement("textarea");
    input.value = value;
    input.setAttribute("readonly", "");
    input.className = "clipboard-fallback";
    document.body.append(input);
    input.select();
    document.execCommand("copy");
    input.remove();
  }

  function markCopied(button) {
    window.clearTimeout(resetTimer);
    button.classList.add("copied");
    button.title = "已复制";
    resetTimer = window.setTimeout(() => {
      button.classList.remove("copied");
      button.title = button.getAttribute("aria-label") || "复制";
    }, 900);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();

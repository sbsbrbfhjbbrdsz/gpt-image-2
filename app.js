// 图片生成网页的交互逻辑：调用 VibeAPI 生成、编辑和流式生成图片。
(() => {
  const { DEFAULT_SETTINGS, CONFIG_STORAGE_KEY, MODE_NAMES, SIZE_RULES, SIZE_LEVELS, SIZE_RATIOS, SIZE_MATRIX, LEGACY_SIZE_OPTIONS, DEFAULT_PARAMETERS } = window.ImageToolConfig;
  const state = {
    activeController: null,
    activeTask: null,
    activeControllers: new Set(),
    activeTasks: new Set(),
    taskQueue: [],
    queueDelayTimer: null,
    taskSerial: 0,
    activeMode: "generate",
    lastImageUrl: "",
    previewUrls: new Map(),
    gallerySignatures: new Set(),
    galleryCount: 0,
    currentTaskItems: [],
    currentTaskItem: null,
    currentTaskMode: "generate",
    currentTaskPrompt: "",
    currentTaskModel: "",
    currentTaskQuality: "auto",
    currentTaskModeration: "auto",
    currentTaskStartedAt: 0,
    currentRevisedPrompt: "",
    sizePickerGroup: null,
    sizePickerLevel: "4K",
    sizePickerRatio: "16:9",
    detectedModels: [],
    modelsReady: false,
    modelLibraryNotice: null,
    config: null,
    logLineCount: 0,
    lastSizeSignature: "",
    galleryFilter: {
      category: "all",
      resolution: "all",
      ratio: "all",
    },
    preferredModels: {
      generate: DEFAULT_SETTINGS.imageModel,
      image: DEFAULT_SETTINGS.imageModel,
      edit: DEFAULT_SETTINGS.imageModel,
      responses: DEFAULT_SETTINGS.imageModel,
    },
  };
  const el = {
    sitePanelToggle: document.querySelector("#sitePanelToggle"),
    sitePanel: document.querySelector("#sitePanel"),
    siteList: document.querySelector("#siteList"),
    siteName: document.querySelector("#siteName"),
    addSite: document.querySelector("#addSite"),
    deleteSite: document.querySelector("#deleteSite"),
    baseUrl: document.querySelector("#baseUrl"),
    apiKey: document.querySelector("#apiKey"),
    useProxy: document.querySelector("#useProxy"),
    responsesToolChoice: document.querySelector("#responsesToolChoice"),
    rotationToggles: document.querySelectorAll(".rotation-mode-toggle"),
    siteRotationEnabled: document.querySelector("#siteRotationEnabled"),
    saveKey: document.querySelector("#saveKey"),
    fetchModels: document.querySelector("#fetchModels"),
    siteConcurrency: document.querySelector("#siteConcurrency"),
    modelLibraryDetails: document.querySelector("#modelLibraryDetails"),
    modelLibrary: document.querySelector("#modelLibrary"),
    modelOptions: document.querySelector("#modelOptions"),
    tabs: document.querySelectorAll(".tab-button"),
    modeSelects: document.querySelectorAll(".mode-select"),
    panels: document.querySelectorAll(".tab-panel"),
    downloadImage: document.querySelector("#downloadImage"),
    resultMeta: document.querySelector("#resultMeta"),
    imageGallery: document.querySelector("#imageGallery"),
    galleryCategoryFilter: document.querySelector("#galleryCategoryFilter"),
    galleryCategoryChips: document.querySelector("#galleryCategoryChips"),
    galleryResolutionFilter: document.querySelector("#galleryResolutionFilter"),
    galleryRatioFilter: document.querySelector("#galleryRatioFilter"),
    clearGallery: document.querySelector("#clearGallery"),
    statusLog: document.querySelector("#statusLog"),
    dropOverlay: document.querySelector("#dropOverlay"),
    dropOriginal: document.querySelector("#dropOriginal"),
    dropMask: document.querySelector("#dropMask"),
    imageModal: document.querySelector("#imageModal"),
    modalPanel: document.querySelector(".modal-panel"),
    modalTitle: document.querySelector("#modalTitle"),
    modalSubtitle: document.querySelector("#modalSubtitle"),
    modalImage: document.querySelector("#modalImage"),
    modalFailure: document.querySelector("#modalFailure"),
    modalGroupNav: document.querySelector("#modalGroupNav"),
    modalCategories: document.querySelector("#modalCategories"),
    modalDetails: document.querySelector("#modalDetails"),
    modalDuration: document.querySelector("#modalDuration"),
    modalTime: document.querySelector("#modalTime"),
    modalDownload: document.querySelector("#modalDownload"),
    modalClose: document.querySelector("#modalClose"),
    sizePicker: null,
    sizePickerLevels: null,
    sizePickerRatios: null,
    sizePickerCustom: null,
    sizePickerOutput: null,
    generateForm: document.querySelector("#generateForm"),
    imageForm: document.querySelector("#imageForm"),
    editForm: document.querySelector("#editForm"),
    responsesForm: document.querySelector("#responsesForm"),
    generateButton: document.querySelector("#generateButton"),
    imageButton: document.querySelector("#imageButton"),
    editButton: document.querySelector("#editButton"),
    responsesButton: document.querySelector("#responsesButton"),
    imageImages: document.querySelector("#imageImages"),
    editImages: document.querySelector("#editImages"),
    editMask: document.querySelector("#editMask"),
    responsesImages: document.querySelector("#responsesImages"),
    imageImagePreview: document.querySelector("#imageImagePreview"),
    editImagePreview: document.querySelector("#editImagePreview"),
    editMaskPreview: document.querySelector("#editMaskPreview"),
    responsesImagePreview: document.querySelector("#responsesImagePreview"),
  };
  const groups = {
    generate: {
      form: el.generateForm,
      button: el.generateButton,
      prompt: document.querySelector("#generatePrompt"),
      model: document.querySelector("#generateModel"),
      api: document.querySelector("#generateApi"),
      size: document.querySelector("#generateSize"),
      quality: document.querySelector("#generateQuality"),
      format: document.querySelector("#generateFormat"),
      moderation: document.querySelector("#generateModeration"),
      compression: document.querySelector("#generateCompression"),
      quantity: document.querySelector("#generateQuantity"),
    },
    image: {
      form: el.imageForm,
      button: el.imageButton,
      prompt: document.querySelector("#imagePrompt"),
      model: document.querySelector("#imageModel"),
      api: document.querySelector("#imageApi"),
      size: document.querySelector("#imageSize"),
      quality: document.querySelector("#imageQuality"),
      format: document.querySelector("#imageFormat"),
      moderation: document.querySelector("#imageModeration"),
      compression: document.querySelector("#imageCompression"),
      quantity: document.querySelector("#imageQuantity"),
    },
    edit: {
      form: el.editForm,
      button: el.editButton,
      prompt: document.querySelector("#editPrompt"),
      model: document.querySelector("#editModel"),
      api: document.querySelector("#editApi"),
      size: document.querySelector("#editSize"),
      quality: document.querySelector("#editQuality"),
      format: document.querySelector("#editFormat"),
      moderation: document.querySelector("#editModeration"),
      compression: document.querySelector("#editCompression"),
      quantity: document.querySelector("#editQuantity"),
    },
    responses: {
      form: el.responsesForm,
      button: el.responsesButton,
      prompt: document.querySelector("#responsesPrompt"),
      model: document.querySelector("#responsesModel"),
      action: document.querySelector("#responsesAction"),
      size: document.querySelector("#responsesSize"),
      quality: document.querySelector("#responsesQuality"),
      format: document.querySelector("#responsesFormat"),
      moderation: document.querySelector("#responsesModeration"),
      compression: document.querySelector("#responsesCompression"),
      quantity: document.querySelector("#responsesQuantity"),
    },
  };
  const { normalizeErrorPayload, formatError, explainFailure } = window.ImageToolErrors.createErrorHelpers({ shouldUseProxy });
  async function init() {
    populateSizePresets();
    await loadSettings();
    bindKeyControls();
    bindSettingsInvalidation();
    bindTabs();
    bindForms();
    bindModelControls();
    bindCompressionControls();
    bindPreview(el.imageImages, el.imageImagePreview);
    bindPreview(el.editImages, el.editImagePreview);
    bindPreview(el.editMask, el.editMaskPreview);
    bindPreview(el.responsesImages, el.responsesImagePreview);
    bindFullscreenDrop();
    bindGallery();
    bindGalleryModal();
    renderGalleryFilters();
    updateAllCompressionStates();
    await loadGallery();
  }
  function bindKeyControls() {
    el.sitePanelToggle.addEventListener("click", () => {
      el.sitePanel.hidden = !el.sitePanel.hidden;
    });
    el.siteList.addEventListener("click", (event) => {
      const button = event.target.closest(".site-option");
      if (!button || button.dataset.siteId === state.config.activeSiteId) {
        return;
      }
      persistActiveSiteFromInputs({ saveParameters: !isRotationMode() });
      state.config.activeSiteId = button.dataset.siteId;
      saveConfig();
      applyActiveSiteToInputs();
      setLog(`已切换到站点：${getActiveSite().name}`);
    });
    el.addSite.addEventListener("click", () => {
      persistActiveSiteFromInputs({ saveParameters: !isRotationMode() });
      const site = createDefaultSite(`站点 ${state.config.sites.length + 1}`);
      state.config.sites.push(site);
      state.config.activeSiteId = site.id;
      saveConfig();
      applyActiveSiteToInputs();
      setLog("已添加新站点，请填写地址和 API Key 后保存。");
    });
    el.deleteSite.addEventListener("click", () => {
      if (state.config.sites.length <= 1) {
        resetSettings();
        setLog("至少保留一个站点，已重置当前站点。");
        return;
      }
      const oldSite = getActiveSite();
      state.config.sites = state.config.sites.filter((site) => site.id !== oldSite.id);
      state.config.activeSiteId = state.config.sites[0].id;
      saveConfig();
      applyActiveSiteToInputs();
      setLog(`已删除站点：${oldSite.name}`);
    });
    el.apiKey.addEventListener("focus", () => { el.apiKey.type = "text"; });
    el.apiKey.addEventListener("blur", () => { el.apiKey.type = "password"; });
    if (el.siteConcurrency) {
      el.siteConcurrency.addEventListener("change", () => {
        el.siteConcurrency.value = readConcurrencyLimit();
        persistActiveSiteFromInputs({ saveParameters: !isRotationMode() });
        saveConfig();
        processTaskQueue();
      });
    }
    if (el.responsesToolChoice) {
      el.responsesToolChoice.addEventListener("change", () => {
        el.responsesToolChoice.value = normalizeResponsesToolChoice(el.responsesToolChoice.value);
        persistActiveSiteFromInputs({ saveParameters: !isRotationMode() });
        saveConfig();
      });
    }
    el.rotationToggles.forEach((toggle) => {
      toggle.addEventListener("change", () => {
        setRotationToggleState(toggle.checked);
        persistActiveSiteFromInputs({ saveParameters: false });
        if (toggle.checked) applyParameterSettings(DEFAULT_PARAMETERS);
        saveConfig();
        applyActiveSiteToInputs();
      });
    });
    if (el.siteRotationEnabled) {
      el.siteRotationEnabled.addEventListener("change", () => {
        persistActiveSiteFromInputs({ saveParameters: false });
        saveConfig();
      });
    }
    el.saveKey.addEventListener("click", () => {
      if (!readBaseUrl()) {
        setLog("请输入站点/API 地址后再保存。", true);
        return;
      }
      saveSettings();
      setLog("站点已保存。模型列表不会自动请求，需要时请手动点击“获取模型”。");
    });
    el.fetchModels.addEventListener("click", () => {
      void fetchModels();
    });
    if (el.modelLibraryDetails) {
      el.modelLibraryDetails.addEventListener("toggle", () => {
        if (!state.config || state.applyingUi) {
          return;
        }
        state.config.ui = normalizeUiSettings({
          ...(state.config.ui || {}),
          modelLibraryOpen: el.modelLibraryDetails.open,
        });
        saveConfig();
      });
    }
  }
  function bindSettingsInvalidation() {
    [
      el.baseUrl,
      el.apiKey,
      el.useProxy,
    ].filter(Boolean).forEach((input) => {
      input.addEventListener("change", () => {
        renderModelOptions([]);
      });
    });
  }
  function populateSizePresets() {
    Object.values(groups).forEach((group) => {
      const current = group.size.value || "auto";
      group.size.innerHTML = "";
      collectSizeOptions().forEach(([value, label]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        group.size.append(option);
      });
      group.size.classList.add("size-select");
      ensureSizeButton(group);
      setSizeValue(group, canSetControlValue(group.size, current) ? current : "auto", { sync: false });
    });
    createSizePicker();
  }
  function collectSizeOptions() {
    const options = new Map([["auto", "auto"]]);
    SIZE_LEVELS.forEach((level) => {
      SIZE_RATIOS.forEach((ratio) => {
        const value = SIZE_MATRIX[level] && SIZE_MATRIX[level][ratio];
        if (value && isValidOutputSize(value)) {
          options.set(value, `${level} ${ratio} · ${value}`);
        }
      });
    });
    LEGACY_SIZE_OPTIONS.forEach((value) => {
      if (isValidOutputSize(value) && !options.has(value)) {
        options.set(value, value);
      }
    });
    return Array.from(options.entries());
  }
  function ensureSizeButton(group) {
    if (group.sizeButton) {
      return;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "size-trigger";
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openSizePicker(group, button);
    });
    group.sizeButton = button;
    group.size.insertAdjacentElement("beforebegin", button);
  }
  function createSizePicker() {
    if (el.sizePicker) {
      return;
    }
    const panel = document.createElement("div");
    panel.id = "sizePicker";
    panel.className = "size-picker";
    panel.hidden = true;
    const levelTitle = document.createElement("div");
    levelTitle.className = "size-picker-label";
    levelTitle.textContent = "基准分辨率";
    const levels = document.createElement("div");
    levels.className = "size-picker-options size-picker-levels";
    const ratioTitle = document.createElement("div");
    ratioTitle.className = "size-picker-label";
    ratioTitle.textContent = "图像比例";
    const ratios = document.createElement("div");
    ratios.className = "size-picker-options size-picker-ratios";
    const custom = document.createElement("input");
    custom.className = "size-picker-custom";
    custom.type = "text";
    custom.placeholder = "自定义尺寸，例如 3000x2000";
    custom.spellcheck = false;
    custom.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        applyCustomSize();
      }
    });
    custom.addEventListener("change", applyCustomSize);
    const output = document.createElement("div");
    output.className = "size-picker-output";
    const outputLabel = document.createElement("span");
    outputLabel.textContent = "将使用";
    const outputValue = document.createElement("strong");
    output.append(outputLabel, outputValue);
    panel.append(levelTitle, levels, ratioTitle, ratios, custom, output);
    document.body.append(panel);
    el.sizePicker = panel;
    el.sizePickerLevels = levels;
    el.sizePickerRatios = ratios;
    el.sizePickerCustom = custom;
    el.sizePickerOutput = outputValue;
    panel.addEventListener("click", (event) => {
      event.stopPropagation();
    });
    document.addEventListener("click", (event) => {
      if (panel.hidden || panel.contains(event.target) || event.target.classList.contains("size-trigger")) {
        return;
      }
      closeSizePicker();
    });
    window.addEventListener("resize", positionSizePicker);
  }
  function openSizePicker(group, button) {
    state.sizePickerGroup = group;
    const selection = readSizeSelection(group.size.value);
    state.sizePickerLevel = selection.level || state.sizePickerLevel || "4K";
    state.sizePickerRatio = selection.ratio || state.sizePickerRatio || "16:9";
    el.sizePicker.dataset.anchorId = button.id || "";
    renderSizePicker();
    el.sizePicker.hidden = false;
    positionSizePicker();
  }
  function closeSizePicker() {
    if (el.sizePicker) {
      el.sizePicker.hidden = true;
    }
  }
  function renderSizePicker() {
    el.sizePickerLevels.innerHTML = "";
    const currentValue = state.sizePickerGroup && state.sizePickerGroup.size.value || "auto";
    const currentSelection = readSizeSelection(currentValue);
    const hasPresetSelection = Boolean(currentSelection.level && currentSelection.ratio);
    const autoButton = createSizePickerButton("auto", currentValue === "auto");
    autoButton.addEventListener("click", () => {
      setSizeAcrossGroups("auto");
      saveParameterSettings();
      renderSizePicker();
    });
    el.sizePickerLevels.append(autoButton);
    SIZE_LEVELS.forEach((level) => {
      const button = createSizePickerButton(level, hasPresetSelection && state.sizePickerLevel === level);
      button.addEventListener("click", () => {
        state.sizePickerLevel = level;
        applyPickedSize();
      });
      el.sizePickerLevels.append(button);
    });
    el.sizePickerRatios.innerHTML = "";
    SIZE_RATIOS.forEach((ratio) => {
      const button = createSizePickerButton(ratio, hasPresetSelection && state.sizePickerRatio === ratio);
      button.addEventListener("click", () => {
        state.sizePickerRatio = ratio;
        applyPickedSize();
      });
      el.sizePickerRatios.append(button);
    });
    const value = currentValue === "auto" || !currentSelection.level ? currentValue : getPickedSizeValue();
    el.sizePickerCustom.value = "";
    el.sizePickerOutput.textContent = value;
  }
  function createSizePickerButton(text, active) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "size-choice";
    button.classList.toggle("active", active);
    button.textContent = text;
    return button;
  }
  function applyPickedSize() {
    const value = getPickedSizeValue();
    if (state.sizePickerGroup && value) {
      setSizeAcrossGroups(value);
      saveParameterSettings();
    }
    renderSizePicker();
    positionSizePicker();
  }
  function applyCustomSize() {
    const value = normalizeCustomSize(el.sizePickerCustom.value);
    if (!state.sizePickerGroup) {
      return;
    }
    if (!value) {
      el.sizePickerOutput.textContent = "尺寸不符合文档";
      return;
    }
    addSizeOptionToAll(value, value);
    setSizeAcrossGroups(value);
    saveParameterSettings();
    el.sizePickerOutput.textContent = value;
    positionSizePicker();
  }
  function getPickedSizeValue() {
    return SIZE_MATRIX[state.sizePickerLevel] && SIZE_MATRIX[state.sizePickerLevel][state.sizePickerRatio] || "auto";
  }
  function setSizeAcrossGroups(value) {
    addSizeOptionToAll(value, formatSizeLabel(value));
    Object.values(groups).forEach((group) => {
      setSizeValue(group, value, { sync: false });
    });
  }
  function setSizeValue(group, value) {
    if (!group || !group.size) {
      return;
    }
    const nextValue = normalizeSizeSetting(value);
    if (!canSetControlValue(group.size, nextValue)) {
      addSizeOption(group.size, nextValue, nextValue);
    }
    group.size.value = nextValue;
    updateSizeButton(group);
  }
  function updateSizeButton(group) {
    if (!group.sizeButton) {
      return;
    }
    const value = group.size.value || "auto";
    group.sizeButton.textContent = formatSizeLabel(value);
    group.sizeButton.title = value;
  }
  function addSizeOptionToAll(value, label) {
    Object.values(groups).forEach((group) => addSizeOption(group.size, value, label));
  }
  function addSizeOption(select, value, label) {
    if (!select || canSetControlValue(select, value)) {
      return;
    }
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.append(option);
  }
  function formatSizeLabel(value) {
    if (!value || value === "auto") {
      return "auto";
    }
    const selection = readSizeSelection(value);
    return selection.level && selection.ratio ? `${selection.level} ${selection.ratio}` : value;
  }
  function readSizeSelection(value) {
    for (const level of SIZE_LEVELS) {
      for (const ratio of SIZE_RATIOS) {
        if (SIZE_MATRIX[level] && SIZE_MATRIX[level][ratio] === value) {
          return { level, ratio };
        }
      }
    }
    return { level: "", ratio: "" };
  }
  function normalizeCustomSize(value) {
    const match = String(value || "").trim().toLowerCase().match(/^(\d{2,5})\s*[x*]\s*(\d{2,5})$/);
    if (!match) {
      return "";
    }
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (width < 64 || height < 64) {
      return "";
    }
    const size = `${width}x${height}`;
    return isValidOutputSize(size) ? size : "";
  }
  function normalizeSizeSetting(value) {
    const size = String(value || "auto").trim().toLowerCase();
    return isValidOutputSize(size) ? size : "auto";
  }
  function isValidOutputSize(value) {
    if (value === "auto") {
      return true;
    }
    const size = parseSize(value);
    if (!size || size.width <= 0 || size.height <= 0) {
      return false;
    }
    const longEdge = Math.max(size.width, size.height);
    const shortEdge = Math.min(size.width, size.height);
    const pixels = size.width * size.height;
    return size.width % SIZE_RULES.step === 0
      && size.height % SIZE_RULES.step === 0
      && longEdge <= SIZE_RULES.maxEdge
      && longEdge / shortEdge <= SIZE_RULES.maxRatio
      && pixels >= SIZE_RULES.minPixels
      && pixels <= SIZE_RULES.maxPixels;
  }
  function positionSizePicker() {
    if (!el.sizePicker || el.sizePicker.hidden || !state.sizePickerGroup || !state.sizePickerGroup.sizeButton) {
      return;
    }
    const rect = state.sizePickerGroup.sizeButton.getBoundingClientRect();
    const panel = el.sizePicker;
    const width = Math.min(420, window.innerWidth - 20);
    panel.style.width = `${width}px`;
    const panelRect = panel.getBoundingClientRect();
    const left = Math.min(window.innerWidth - width - 10, Math.max(10, rect.left + rect.width / 2 - width / 2));
    const top = rect.top - panelRect.height - 8 > 10 ? rect.top - panelRect.height - 8 : rect.bottom + 8;
    panel.style.left = `${left}px`;
    panel.style.top = `${Math.max(10, top)}px`;
  }
  function bindTabs() {
    el.tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        switchMode(tab.dataset.tab);
      });
    });
    el.modeSelects.forEach((select) => {
      select.value = state.activeMode;
      select.addEventListener("change", () => {
        switchMode(select.value);
      });
    });
  }
  function switchMode(next) {
    if (!MODE_NAMES.includes(next)) {
      return;
    }
    state.activeMode = next;
    el.tabs.forEach((item) => {
      const active = item.dataset.tab === next;
      item.classList.toggle("active", active);
      item.setAttribute("aria-selected", String(active));
    });
    el.modeSelects.forEach((select) => {
      select.value = next;
    });
    el.panels.forEach((panel) => {
      panel.classList.toggle("active", panel.dataset.panel === next);
    });
  }
  function bindForms() {
    groups.generate.form.addEventListener("submit", (event) => {
      event.preventDefault();
      void runGenerate();
    });
    groups.image.form.addEventListener("submit", (event) => {
      event.preventDefault();
      void runImage();
    });
    groups.edit.form.addEventListener("submit", (event) => {
      event.preventDefault();
      void runEdit();
    });
    groups.responses.form.addEventListener("submit", (event) => {
      event.preventDefault();
      void runResponses();
    });
  }
  function bindModelControls() {
    Object.values(groups).forEach((group) => {
      group.model.addEventListener("input", () => {
        syncModelInputs(group.model.value, group.model);
        saveSelectedModels();
      });
    });
    groups.generate.api.addEventListener("change", () => {
      syncImageApiMode(groups.generate.api.value);
      saveEndpointChoices();
      saveSelectedModels();
      saveParameterSettings();
    });
    groups.image.api.addEventListener("change", () => {
      syncImageApiMode(groups.image.api.value);
      saveEndpointChoices();
      saveSelectedModels();
      saveParameterSettings();
    });
    groups.edit.api.addEventListener("change", () => {
      syncImageApiMode(groups.edit.api.value);
      saveEndpointChoices();
      saveSelectedModels();
      saveParameterSettings();
    });
  }
  function bindCompressionControls() {
    Object.values(groups).forEach((group) => {
      ["size", "quality", "moderation"].forEach((field) => {
        group[field].addEventListener("change", () => {
          syncGroupControl(field, group[field].value);
          saveParameterSettings();
        });
      });
      group.compression.addEventListener("input", () => {
        group.compression.value = clampCompressionValue(group.compression.value);
        syncGroupControl("compression", group.compression.value);
        saveParameterSettings();
      });
      group.quantity.addEventListener("input", () => {
        group.quantity.value = clampQuantityValue(group.quantity.value);
        saveParameterSettings();
      });
      group.format.addEventListener("change", () => {
        syncGroupControl("format", group.format.value);
        updateAllCompressionStates();
        saveParameterSettings();
      });
    });
    groups.responses.action.addEventListener("change", saveParameterSettings);
  }
  function bindPreview(input, container) {
    input.addEventListener("change", () => {
      renderPreviews(input.files, container);
    });
  }
  function bindFullscreenDrop() {
    if (!el.dropOverlay) {
      return;
    }
    window.addEventListener("dragenter", (event) => {
      if (!hasFileDrag(event.dataTransfer)) {
        return;
      }
      event.preventDefault();
      showFullscreenDrop();
    });
    window.addEventListener("dragover", (event) => {
      if (!hasFileDrag(event.dataTransfer)) {
        return;
      }
      event.preventDefault();
      showFullscreenDrop();
      updateFullscreenDropHover(event);
    });
    window.addEventListener("dragleave", (event) => {
      if (event.clientX > 0 && event.clientY > 0 && event.clientX < window.innerWidth && event.clientY < window.innerHeight) {
        return;
      }
      hideFullscreenDrop();
    });
    window.addEventListener("drop", (event) => {
      if (!hasFileDrag(event.dataTransfer)) {
        return;
      }
      event.preventDefault();
      const target = getFullscreenDropTarget(event);
      hideFullscreenDrop();
      if (!target) {
        setLog("当前模式不支持上传附件，请切换到图生图、精修图或流式。", true);
        return;
      }
      const files = selectImageFiles(event.dataTransfer.files, target.input);
      if (!files.length) {
        setLog(target.input.accept === "image/png" ? "蒙版只接受 PNG 图片。" : "请拖入图片文件。", true);
        return;
      }
      if (writeFilesToInput(target.input, files)) {
        setLog(`已添加${target.label}：${files.length} 张`);
      } else {
        setLog("当前浏览器不允许直接写入拖拽文件，请用上传按钮选择图片。", true);
      }
    });
  }
  function showFullscreenDrop() {
    const targets = getFullscreenDropTargets();
    if (!targets) {
      return;
    }
    el.dropOverlay.hidden = false;
    el.dropOverlay.classList.toggle("single", !targets.mask);
    el.dropOverlay.classList.toggle("split", Boolean(targets.mask));
    el.dropOriginal.hidden = !targets.original;
    el.dropMask.hidden = !targets.mask;
  }
  function hideFullscreenDrop() {
    el.dropOverlay.hidden = true;
    el.dropOriginal.classList.remove("active");
    el.dropMask.classList.remove("active");
  }
  function updateFullscreenDropHover(event) {
    const target = getFullscreenDropTarget(event);
    el.dropOriginal.classList.toggle("active", target && target.name === "original");
    el.dropMask.classList.toggle("active", target && target.name === "mask");
  }
  function getFullscreenDropTarget(event) {
    const targets = getFullscreenDropTargets();
    if (!targets) {
      return null;
    }
    if (!targets.mask) {
      return targets.original;
    }
    return event.clientX > window.innerWidth / 2 ? targets.mask : targets.original;
  }
  function getFullscreenDropTargets() {
    if (state.activeMode === "image") {
      return {
        original: { name: "original", label: "原图", input: el.imageImages, container: el.imageImagePreview },
      };
    }
    if (state.activeMode === "edit") {
      return {
        original: { name: "original", label: "原图", input: el.editImages, container: el.editImagePreview },
        mask: { name: "mask", label: "蒙版", input: el.editMask, container: el.editMaskPreview },
      };
    }
    if (state.activeMode === "responses") {
      return {
        original: { name: "original", label: "原图", input: el.responsesImages, container: el.responsesImagePreview },
      };
    }
    return null;
  }
  function hasFileDrag(dataTransfer) {
    if (!dataTransfer) {
      return false;
    }
    const items = Array.from(dataTransfer.items || []);
    if (items.some((item) => item.kind === "file")) {
      return true;
    }
    return Array.from(dataTransfer.types || []).includes("Files");
  }
  function selectImageFiles(fileList, input) {
    const pngOnly = input.accept && input.accept.toLowerCase().includes("image/png");
    const files = Array.from(fileList || []).filter((file) => {
      const isImage = file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|avif)$/i.test(file.name);
      if (!isImage) {
        return false;
      }
      return !pngOnly || file.type === "image/png" || /\.png$/i.test(file.name);
    });
    return input.multiple ? files : files.slice(0, 1);
  }
  function writeFilesToInput(input, files) {
    try {
      const transfer = new DataTransfer();
      const merged = input.multiple ? [...Array.from(input.files || []), ...files] : files;
      const seen = new Set();
      merged.forEach((file) => {
        const key = `${file.name}:${file.size}:${file.lastModified}`;
        if (seen.has(key)) {
          return;
        }
        seen.add(key);
        transfer.items.add(file);
      });
      input.files = transfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    } catch (error) {
      return false;
    }
  }
  function bindGallery() {
    if (!el.imageGallery) {
      return;
    }
    if (el.galleryCategoryFilter) {
      el.galleryCategoryFilter.addEventListener("change", () => {
        state.galleryFilter.category = el.galleryCategoryFilter.value || "all";
        saveGalleryFilterSettings();
        applyGalleryFilters();
      });
    }
    if (el.galleryResolutionFilter) {
      el.galleryResolutionFilter.addEventListener("change", () => {
        state.galleryFilter.resolution = el.galleryResolutionFilter.value || "all";
        saveGalleryFilterSettings();
        applyGalleryFilters();
      });
    }
    if (el.galleryRatioFilter) {
      el.galleryRatioFilter.addEventListener("change", () => {
        state.galleryFilter.ratio = el.galleryRatioFilter.value || "all";
        saveGalleryFilterSettings();
        applyGalleryFilters();
      });
    }
    if (!el.clearGallery) {
      return;
    }
    el.clearGallery.addEventListener("click", async () => {
      el.imageGallery.innerHTML = "";
      state.gallerySignatures.clear();
      state.galleryCount = 0;
      state.currentTaskItems = [];
      renderGalleryFilters();
      applyGalleryFilters();
      if (el.downloadImage) {
        el.downloadImage.href = "#";
        el.downloadImage.classList.add("disabled");
        el.downloadImage.setAttribute("aria-disabled", "true");
      }
      el.resultMeta.textContent = "等待提交任务";
      if (canUseConfigApi()) {
        try {
          await fetch(`${window.location.origin}/api/gallery`, { method: "DELETE" });
        } catch (error) {
          appendLog(`清空长期画廊失败: ${formatError(error)}`, true);
        }
      }
    });
  }
  function bindGalleryModal() {
    if (!el.imageModal) {
      return;
    }
    el.modalClose.addEventListener("click", closeGalleryModal);
    if (el.modalDuration) {
      el.modalDuration.addEventListener("click", toggleModalLogView);
    }
    if (el.modalDetails) {
      el.modalDetails.addEventListener("contextmenu", (event) => {
        if (event.target.closest(".category-chip")) {
          return;
        }
        const row = event.target.closest(".modal-detail-row");
        if (row && row !== el.modalCategories) {
          return;
        }
        const item = getActiveGalleryItem();
        if (!item || !item.galleryData || item.galleryData.taskStatus === "failed") {
          return;
        }
        event.preventDefault();
        createGalleryCategoryFromPrompt();
      });
    }
    el.imageModal.addEventListener("click", (event) => {
      if (event.target === el.imageModal) {
        closeGalleryModal();
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !el.imageModal.hidden) {
        closeGalleryModal();
      }
    });
  }
  function updateAllCompressionStates() {
    Object.values(groups).forEach(updateCompressionState);
  }
  function updateCompressionState(group) {
    const enabled = group.format.value === "jpeg" || group.format.value === "webp";
    group.compression.disabled = !enabled;
    group.compression.value = clampCompressionValue(group.compression.value);
  }
  function syncGroupControl(field, value) {
    Object.values(groups).forEach((group) => {
      const control = group[field];
      if (!control || !canSetControlValue(control, value)) {
        return;
      }
      if (field === "size") {
        setSizeValue(group, value);
      } else {
        control.value = value;
      }
    });
  }
  function syncImageApiMode(value) {
    [groups.generate, groups.image, groups.edit].forEach((group) => {
      group.api.value = value;
    });
  }
  function canSetControlValue(control, value) {
    if (control.tagName !== "SELECT") {
      return true;
    }
    return Array.from(control.options).some((option) => option.value === value);
  }
  function clampCompressionValue(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return 0;
    }
    return Math.min(100, Math.max(0, Math.round(number)));
  }
  function clampConcurrencyValue(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return DEFAULT_SETTINGS.concurrency;
    }
    return Math.min(10, Math.max(1, Math.round(number)));
  }
  function clampQuantityValue(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(1, Math.round(number)) : 1;
  }
  async function runGenerate() {
    const context = requireTaskContext("generate", groups.generate);
    const prompt = groups.generate.prompt.value.trim();
    if (!context || !prompt) {
      if (!prompt) setLog("请输入提示词。", true);
      return;
    }
    const options = getImageOptions(groups.generate);
    if (!context.pendingRotation && !isResponsesApiMode(context.apiMode) && !isImageApiModel(context.model)) {
      showBlockingMessage(formatImageApiModelWarning(context.model));
      return;
    }
    const readInput = createResponsesInputReader(prompt, []);
    await withTask(groups.generate, "正在生成图片...", async (signal, task) => {
      const taskContext = task.siteContext;
      if (isResponsesApiMode(taskContext.apiMode)) {
        await requestResponsesStream(taskContext.key, createResponsesBody(taskContext, "generate", options, await readInput()), signal, buildEndpointUrl("responses", taskContext), taskContext.useProxy, task);
        return;
      }
      assertImageApiAllowed(taskContext.model);
      const payload = await requestJson(buildEndpointUrl("generation", taskContext), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${taskContext.key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: taskContext.model, prompt, ...options }),
        signal,
      }, taskContext.useProxy, task);
      const image = readImageBase64(payload, task);
      showImage(image, options.output_format, `Image API · ${options.size || "auto"} · ${options.quality || "auto"}`, options.size, true, task);
      appendLog("生成完成。", false, task);
    }, context);
  }
  async function runImage() {
    const context = requireTaskContext("image", groups.image);
    const prompt = groups.image.prompt.value.trim();
    const files = Array.from(el.imageImages.files || []);
    if (!context || !prompt || files.length === 0) {
      if (context) setLog(files.length === 0 ? "请至少选择一张参考图片。" : "请输入图生图提示词。", true);
      return;
    }
    await queueImageEditTask(groups.image, context, prompt, files, null, `图生图 · ${files.length} 张参考图`, "图生图完成。");
  }
  async function runEdit() {
    const context = requireTaskContext("edit", groups.edit);
    const prompt = groups.edit.prompt.value.trim();
    const files = Array.from(el.editImages.files || []);
    if (!context || !prompt || files.length === 0) {
      if (context) setLog(files.length === 0 ? "请至少选择一张参考/原始图片。" : "请输入编辑提示词。", true);
      return;
    }
    const mask = el.editMask.files && el.editMask.files[0];
    if (mask && !context.pendingRotation && isResponsesApiMode(context.apiMode)) {
      setLog("Responses API 模式不支持蒙版上传；需要蒙版时请选择 Image API 编辑端点。", true);
      return;
    }
    await queueImageEditTask(groups.edit, context, prompt, files, mask || null, `Image API 编辑 · ${files.length} 张输入图`, "编辑完成。");
  }
  async function runResponses() {
    const context = requireTaskContext("responses", groups.responses);
    const prompt = groups.responses.prompt.value.trim();
    if (!context || !prompt) {
      if (!prompt) setLog("请输入输入内容。", true);
      return;
    }
    const imageFiles = Array.from(el.responsesImages.files || []);
    const options = getImageOptions(groups.responses);
    const action = groups.responses.action.value;
    const readInput = createResponsesInputReader(prompt, imageFiles);
    await withTask(groups.responses, "正在连接 Responses 流式接口...", async (signal, task) => {
      const taskContext = task.siteContext;
      await requestResponsesStream(taskContext.key, createResponsesBody(taskContext, action, options, await readInput(), { partial_images: 1 }), signal, buildEndpointUrl("responses", taskContext), taskContext.useProxy, task);
    }, context);
  }
  async function queueImageEditTask(group, context, prompt, files, mask, meta, doneText) {
    const options = getImageOptions(group);
    if (!context.pendingRotation && !isResponsesApiMode(context.apiMode) && !isImageApiModel(context.model)) {
      showBlockingMessage(formatImageApiModelWarning(context.model));
      return;
    }
    const readInput = createResponsesInputReader(prompt, files);
    await withTask(group, `正在执行${getModeLabel(getGroupMode(group))}...`, async (signal, task) => {
      const taskContext = task.siteContext;
      if (isResponsesApiMode(taskContext.apiMode)) {
        if (mask) throw new Error("Responses API 模式不支持蒙版上传；需要蒙版时请选择 Image API 编辑端点。");
        await requestResponsesStream(taskContext.key, createResponsesBody(taskContext, "edit", options, await readInput()), signal, buildEndpointUrl("responses", taskContext), taskContext.useProxy, task);
        return;
      }
      assertImageApiAllowed(taskContext.model);
      const data = new FormData();
      data.append("model", taskContext.model);
      data.append("prompt", prompt);
      appendOptions(data, options);
      files.forEach((file) => data.append("image[]", file, file.name));
      if (mask) data.append("mask", mask, mask.name);
      const payload = await requestJson(buildEndpointUrl("edit", taskContext), { method: "POST", headers: { Authorization: `Bearer ${taskContext.key}` }, body: data, signal }, taskContext.useProxy, task);
      const image = readImageBase64(payload, task);
      showImage(image, options.output_format, meta, options.size, true, task);
      appendLog(doneText, false, task);
    }, context);
  }
  function createResponsesInputReader(prompt, files) {
    let promise = null;
    return () => promise || (promise = buildResponsesInput(prompt, files));
  }
  function createResponsesBody(context, action, options, input, toolOptions = {}) {
    return { model: context.model, stream: true, tool_choice: context.toolChoice, tools: [{ type: "image_generation", action, ...toolOptions, ...options }], input };
  }
  function assertImageApiAllowed(model) {
    if (isImageApiModel(model)) return;
    const error = new Error(formatImageApiModelWarning(model));
    error.imageApiModelBlocked = true;
    throw error;
  }
  function showBlockingMessage(message) {
    setLog(message, true);
    window.alert(message);
  }
  async function fetchModels(options = {}) {
    const silent = Boolean(options.silent);
    const key = requireApiKey();
    if (!key) {
      setModelLibraryNotice("请先填写 API Key 后再获取模型。", true);
      setLog("请输入 API Key 后再获取模型。", true);
      return;
    }
    persistActiveSiteFromInputs({ saveParameters: !isRotationMode() });
    saveConfig();
    renderSiteOptions();
    setModelLibraryNotice("正在获取模型...", false);
    const headers = {};
    headers.Authorization = `Bearer ${key}`;
    el.fetchModels.disabled = true;
    if (!silent) {
      setLog("正在获取模型列表...");
    }
    try {
      const payload = await requestJson(buildEndpointUrl("models"), {
        method: "GET",
        headers,
      });
      const models = readModelsFromPayload(payload);
      if (models.length === 0) {
        throw new Error("模型端点返回成功，但没有识别到模型 id。");
      }
      renderModelOptions(models);
      const site = getActiveSite();
      site.models = [...state.detectedModels];
      clearModelLibraryNotice();
      saveSelectedModels();
      saveConfig();
      if (silent) {
        appendLog(`已获取 ${models.length} 个模型。`);
      } else {
        appendLog(`已获取 ${models.length} 个模型，可选择或手动输入。`);
      }
    } catch (error) {
      const site = getActiveSite();
      renderModelOptions(site.models || []);
      setModelLibraryNotice(`获取失败：${formatModelNoticeError(error)}`, true);
      if (!silent) {
        appendLog(formatError(error), true);
      }
    } finally {
      el.fetchModels.disabled = false;
    }
  }
  function requireApiKey() {
    return el.apiKey.value.trim();
  }
  function setModelLibraryNotice(text, isError = false) {
    const site = getActiveSite();
    state.modelLibraryNotice = {
      siteId: site.id,
      text,
      isError,
    };
    if (el.modelLibraryDetails) {
      el.modelLibraryDetails.open = true;
    }
    renderModelLibrary();
  }
  function clearModelLibraryNotice() {
    state.modelLibraryNotice = null;
  }
  function getActiveModelLibraryNotice() {
    const site = getActiveSite();
    const notice = state.modelLibraryNotice;
    return notice && notice.siteId === site.id ? notice : null;
  }
  function formatModelNoticeError(error) {
    const text = formatError(error).replace(/\s+/g, " ").trim();
    return text.length > 120 ? `${text.slice(0, 120)}...` : text;
  }
  function requireTaskContext(mode, group) {
    persistActiveSiteFromInputs({ saveParameters: !isRotationMode() });
    const result = window.ImageToolRotation.createContext({ config: state.config, mode, quantity: readTaskQuantity(group), activeSite: getActiveSite(), activeModel: readModelValue(group, ""), activeKey: requireApiKey(), activeBaseUrl: readBaseUrl(), activeUseProxy: shouldUseProxy(), activeConcurrency: readConcurrencyLimit(), activeApiMode: group.api ? group.api.value : "responses-stream", activeTasks: state.activeTasks, taskQueue: state.taskQueue });
    if (!result.ok) {
      setLog(result.message, true); window.alert(result.message);
      return null;
    }
    if (result.rotation) saveConfig();
    return result;
  }
  function shouldUseProxy() {
    return el.useProxy.checked;
  }
  function readConcurrencyLimit() {
    const value = el.siteConcurrency ? el.siteConcurrency.value : getActiveSite().concurrency;
    return clampConcurrencyValue(value);
  }
  function getImageOptions(group) {
    const options = {
      size: group.size.value,
      quality: group.quality.value,
      output_format: group.format.value,
      moderation: group.moderation.value,
    };
    if (group.format.value === "jpeg" || group.format.value === "webp") {
      options.output_compression = Number(group.compression.value);
    }
    return options;
  }
  function readModelValue(group, fallback) {
    return group.model.value.trim() || fallback;
  }
  function readModelsFromPayload(payload) {
    const source = Array.isArray(payload) ? payload : payload && payload.data;
    if (!Array.isArray(source)) {
      return [];
    }
    const ids = source
      .map((item) => (typeof item === "string" ? item : item && item.id))
      .filter((id) => typeof id === "string" && id.trim())
      .map((id) => id.trim());
    return Array.from(new Set(ids)).sort((a, b) => a.localeCompare(b));
  }
  function renderModelOptions(models) {
    state.detectedModels = Array.from(new Set(models)).sort((a, b) => a.localeCompare(b));
    state.modelsReady = state.detectedModels.length > 0;
    fillModelOptions(state.detectedModels);
    applyPreferredModelsToInputs();
  }
  function fillModelOptions(models) {
    el.modelOptions.innerHTML = "";
    const options = Array.from(new Set([
      ...models,
      getUnifiedPreferredModel(),
      DEFAULT_SETTINGS.imageModel,
      DEFAULT_SETTINGS.responsesModel,
    ].filter(Boolean))).sort((a, b) => a.localeCompare(b));
    options.forEach((model) => {
      const option = document.createElement("option");
      option.value = model;
      el.modelOptions.append(option);
    });
  }
  function syncPreferredModelsFromInputs() {
    state.preferredModels = createSelectedModels(readUnifiedModelFromInputs());
  }
  function applyPreferredModelsToInputs() {
    syncModelInputs(getUnifiedPreferredModel());
  }
  function syncModelInputs(model, source = null) {
    Object.values(groups).forEach((group) => {
      if (group.model && group.model !== source) {
        group.model.value = model;
      }
    });
  }
  function readUnifiedModelFromInputs() {
    const activeModel = groups[state.activeMode] && groups[state.activeMode].model.value.trim();
    if (activeModel) {
      return activeModel;
    }
    const inputModel = Object.values(groups)
      .map((group) => group.model.value.trim())
      .find(Boolean);
    return inputModel || getUnifiedPreferredModel() || DEFAULT_SETTINGS.imageModel;
  }
  function getUnifiedPreferredModel() {
    return normalizeSelectedModel({ selectedModels: state.preferredModels });
  }
  function isImageApiModel(model) {
    const value = String(model || "").trim().toLowerCase();
    return /^gpt-image-\d/.test(value) || /^image-\d/.test(value) || /(^|[-_/])image-\d/.test(value);
  }
  function formatImageApiModelWarning(model) {
    const name = String(model || "").trim() || "当前模型";
    return `${name} 不能使用 Image API 接口。Image API 只建议用于 gpt-image-2 / image-2 这类图片模型；gpt-5.5 等模型请把“调用接口”切换为 Responses API 工具端点。`;
  }
  function isResponsesApiMode(value) {
    return value === "responses" || value === "responses-stream";
  }
  function appendOptions(data, options) {
    Object.entries(options).forEach(([key, value]) => value !== undefined && value !== "" && data.append(key, String(value)));
  }
  async function withTask(group, startMessage, handler, siteContext = null) {
    const count = readTaskQuantity(group);
    const batch = count > 1 ? { id: `batch-${Date.now()}-${++state.taskSerial}`, total: count, parent: null } : null;
    for (let index = 0; index < count; index += 1) state.taskQueue.push(createQueuedTask(group, startMessage, handler, batch, index, siteContext));
    const siteText = siteContext && siteContext.siteName ? ` · ${siteContext.siteName}` : "";
    (el.statusLog.textContent.trim() === "就绪" ? setLog : appendLog)(`任务已加入队列：${getModeLabel(getGroupMode(group))}${siteText} · 数量 ${count} · 排队 ${state.taskQueue.length} 个`);
    syncGalleryLazyState();
    processTaskQueue();
  }
  function readTaskQuantity(group) { return clampQuantityValue(group.quantity && group.quantity.value); }
  function createQueuedTask(group, startMessage, handler, batch = null, batchIndex = 0, siteContext = null) {
    const mode = getGroupMode(group);
    const model = siteContext && siteContext.model || (group.model ? group.model.value.trim() : "");
    const task = { id: `task-${Date.now()}-${++state.taskSerial}`, label: `${getModeLabel(mode)} · ${group.size ? group.size.value : "auto"}`, group, handler, startMessage, mode, prompt: group.prompt ? group.prompt.value.trim() : "", model, siteContext, quality: group.quality ? group.quality.value : "auto", moderation: group.moderation ? group.moderation.value : "auto", format: group.format ? group.format.value : "png", requestedSize: group.size ? group.size.value : "auto", logs: [], startedAt: 0, timer: null, item: null, batch, batchIndex };
    task.item = addTaskGalleryItem(task);
    return task;
  }
  function processTaskQueue(maxStart = Infinity) {
    if (state.queueDelayTimer || state.taskQueue.length === 0) return;
    let started = 0;
    while (state.taskQueue.length > 0 && started < maxStart) {
      const index = state.taskQueue.findIndex(canStartQueuedTask);
      if (index < 0) break;
      void runQueuedTask(state.taskQueue.splice(index, 1)[0]);
      started += 1;
    }
  }
  function syncGalleryLazyState() {
    if (window.ImageToolLazy && typeof window.ImageToolLazy.setTaskBusy === "function") {
      window.ImageToolLazy.setTaskBusy(false);
    }
  }
  function canStartQueuedTask(task, index) {
    if (task && task.siteContext && task.siteContext.pendingRotation) {
      return window.ImageToolRotation.hasAvailableContext({ config: state.config, context: task.siteContext, activeTasks: state.activeTasks });
    }
    const siteId = readTaskSiteId(task);
    return Array.from(state.activeTasks).filter((item) => readTaskSiteId(item) === siteId).length < readTaskConcurrency(task)
      && !state.taskQueue.slice(0, index).some((item) => readTaskSiteId(item) === siteId);
  }
  function readTaskSiteId(task) { return task && task.siteContext && task.siteContext.siteId || state.config.activeSiteId || "site"; }
  function readTaskConcurrency(task) { return clampConcurrencyValue(task && task.siteContext && task.siteContext.concurrency || readConcurrencyLimit()); }
  async function runQueuedTask(task) {
    const resolvedContext = window.ImageToolRotation.resolveContext({ config: state.config, context: task.siteContext, activeTasks: state.activeTasks });
    if (!resolvedContext || !resolvedContext.ok) {
      const message = resolvedContext && resolvedContext.message || "没有可用的轮询站点。";
      appendLog(message, true, task);
      updateGalleryItemData(task.item, { taskStatus: "failed", actualSize: "失败", sizeNote: "失败", errorText: message });
      scheduleQueueProcess();
      return;
    }
    task.siteContext = resolvedContext;
    task.model = resolvedContext.model;
    if (resolvedContext.rotation) saveConfig();
    updateGalleryItemData(task.item, { siteName: resolvedContext.siteName, model: resolvedContext.model });
    const controller = new AbortController();
    task.controller = controller;
    state.activeTasks.add(task);
    state.activeControllers.add(controller);
    syncGalleryLazyState();
    state.activeTask = task;
    state.activeController = controller;
    state.currentTaskMode = task.mode;
    state.currentTaskPrompt = task.prompt;
    state.currentTaskModel = task.model;
    state.currentTaskQuality = task.quality;
    state.currentTaskModeration = task.moderation;
    state.currentTaskItems = [task.item];
    state.currentTaskItem = task.item;
    state.currentRevisedPrompt = "";
    state.currentTaskStartedAt = performance.now();
    task.startedAt = state.currentTaskStartedAt;
    setBusy(task.group, true);
    clearResultText();
    appendLog(task.startMessage, false, task);
    updateGalleryItemData(task.item, { taskStatus: "running", actualSize: "生成中", sizeNote: "生成中", lastProgressAt: Date.now() });
    task.timer = window.setInterval(() => updateTaskDuration(task), 1000);
    try {
      await task.handler(controller.signal, task);
      updateGalleryItemData(task.item, { taskStatus: "done" });
    } catch (error) {
      const message = error.name === "AbortError" ? "任务已取消。" : explainFailure(formatError(error));
      appendLog(message, true, task);
      if (error && error.imageApiModelBlocked) window.alert(message);
      updateGalleryItemData(task.item, { taskStatus: "failed", actualSize: "失败", sizeNote: "失败", errorText: message });
    } finally {
      if (task.timer) window.clearInterval(task.timer);
      updateTaskDuration(task);
      if (task.item && task.item.galleryData && task.item.galleryData.persisted) scheduleStoredGalleryUpdate(task.item);
      state.activeTasks.delete(task);
      state.activeControllers.delete(controller);
      setBusy(task.group, false);
      if (state.activeController === controller) {
        state.activeController = null;
      }
      if (state.activeTask === task) {
        state.activeTask = Array.from(state.activeTasks).at(-1) || null;
      }
      state.currentTaskItem = null;
      syncGalleryLazyState();
      scheduleQueueProcess();
    }
  }
  function scheduleQueueProcess() {
    if (state.queueDelayTimer || state.taskQueue.length === 0 || !state.taskQueue.some(canStartQueuedTask)) return;
    appendLog("等待 3s 后执行下一个任务。");
    state.queueDelayTimer = window.setTimeout(() => { state.queueDelayTimer = null; processTaskQueue(); scheduleQueueProcess(); }, 3000);
  }
  function updateTaskDuration(task) {
    if (!task || !task.startedAt || !task.item) return;
    const durationMs = Math.max(0, performance.now() - task.startedAt);
    const durationText = formatDuration(durationMs);
    updateGalleryItemData(task.item, { durationMs: Math.round(durationMs), durationText });
  }
  function setBusy(group, busy) {
    Object.values(groups).forEach((item) => {
      item.button.disabled = false;
    });
  }
  function getGroupMode(group) {
    const found = Object.entries(groups).find(([, item]) => item === group);
    return found ? found[0] : state.activeMode;
  }
  const { requestJson, requestResponsesStream, readImageBase64, buildResponsesInput } = window.ImageToolApi.createApi({ state, groups, appendLog, appendStatusLog, showImage, updateGalleryItemData, shouldUseProxy, normalizeErrorPayload });
  async function loadGallery() {
    if (!canUseConfigApi() || !el.imageGallery) {
      return;
    }
    try {
      const response = await fetch(`${window.location.origin}/api/gallery`, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = await response.json();
      const items = Array.isArray(payload && payload.items) ? payload.items : [];
      window.ImageToolBatch.renderSavedGallery({
        gallery: el.imageGallery,
        items,
        onSelect: selectGalleryItem,
        onItem: (item) => {
          if (!item.imageUrl) return;
          addGalleryItem(item.imageUrl, item.format, item.meta, item.requestedSize, item, {
            prepend: false,
            select: false,
          });
        },
      });
      if (items.length > 0) {
        el.resultMeta.textContent = `已加载 ${items.length} 张长期画廊图片`;
      }
      renderGalleryFilters();
      applyGalleryFilters();
    } catch (error) {
      appendLog(`加载长期画廊失败: ${formatError(error)}`, true);
    }
  }
  function showImage(base64, format, meta, requestedSize = "auto", shouldPersist = true, task = null) {
    const mime = format === "jpeg" ? "image/jpeg" : format === "webp" ? "image/webp" : "image/png";
    const dataUrl = `data:${mime};base64,${base64}`;
    if (state.lastImageUrl && state.lastImageUrl.startsWith("blob:")) {
      URL.revokeObjectURL(state.lastImageUrl);
    }
    state.lastImageUrl = dataUrl;
    const targetItem = task && task.item || state.currentTaskItem;
    const item = targetItem
      ? updateTaskGalleryImage(targetItem, dataUrl, format, meta, requestedSize)
      : addGalleryItem(dataUrl, format, meta, requestedSize);
    const probe = new Image();
    probe.addEventListener("load", () => {
      const actualSize = `${probe.naturalWidth}x${probe.naturalHeight}`;
      const requested = requestedSize || "auto";
      const mismatch = isSizeMismatch(requested, actualSize);
      const sizeNote = mismatch ? "接口改尺寸" : "尺寸匹配";
      const sizeSignature = `${requested}|${actualSize}|${mismatch}`;
      el.resultMeta.textContent = `${meta} · 请求 ${requested} · 实际 ${actualSize}${mismatch ? " · 接口改尺寸" : ""}`;
      const lastSizeSignature = task ? task.lastSizeSignature : state.lastSizeSignature;
      if (lastSizeSignature !== sizeSignature) {
        if (task) {
          task.lastSizeSignature = sizeSignature;
        } else {
          state.lastSizeSignature = sizeSignature;
        }
        appendLog(`图片尺寸: 请求 ${requested} · 实际 ${actualSize} · ${sizeNote}${mismatch ? "\n建议: 这是上游返回尺寸，不是前端传参丢失；可换 Image 接口，或用实际支持的尺寸后再放大。" : ""}`, false, task);
      }
      if (item) {
        updateGalleryItemData(item, { actualSize, sizeNote });
        if (shouldPersist) {
          void persistGalleryItem(item, dataUrl);
        }
      }
    }, { once: true });
    probe.src = dataUrl;
    if (el.downloadImage) {
      el.downloadImage.href = dataUrl;
      el.downloadImage.download = `vibeapi-${Date.now()}.${format === "jpeg" ? "jpg" : format}`;
      el.downloadImage.classList.remove("disabled");
      el.downloadImage.setAttribute("aria-disabled", "false");
    }
    el.resultMeta.textContent = `${meta} · 正在读取尺寸`;
  }
  function addTaskGalleryItem(task) {
    if (!el.imageGallery) {
      return null;
    }
    if (task.batch && window.ImageToolBatch) {
      if (!task.batch.parent) {
        const parentNumber = state.galleryCount + 1;
        state.galleryCount = parentNumber;
        const parentData = { ...createTaskGalleryData(task, parentNumber), batchId: task.batch.id };
        task.batch.parent = window.ImageToolBatch.createParent({ gallery: el.imageGallery, data: parentData, total: task.batch.total, onSelect: selectGalleryItem });
      }
      const child = window.ImageToolBatch.createChild(task.batch.parent, { ...createTaskGalleryData(task, task.batch.parent.galleryData.number), batchItemId: task.id, batchIndex: task.batchIndex });
      window.ImageToolGallery.syncItemFilterState(task.batch.parent, state.galleryFilter, el.imageGallery);
      return child;
    }
    const number = state.galleryCount + 1;
    state.galleryCount = number;
    const item = document.createElement("article");
    item.className = "gallery-item task-item";
    item.tabIndex = 0;
    item.setAttribute("role", "button");
    item.setAttribute("aria-expanded", "false");
    item.dataset.signature = task.id;
    item.galleryData = createTaskGalleryData(task, number);
    const placeholder = document.createElement("div");
    placeholder.className = "task-placeholder";
    placeholder.textContent = "排队中";
    const badge = document.createElement("span");
    badge.className = "gallery-badge";
    const caption = document.createElement("span");
    caption.className = "gallery-meta";
    item.append(placeholder, badge, caption);
    item.addEventListener("click", () => selectGalleryItem(item));
    item.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectGalleryItem(item);
      }
    });
    el.imageGallery.prepend(item);
    renderGalleryItemChrome(item);
    window.ImageToolGallery.syncItemFilterState(item, state.galleryFilter, el.imageGallery);
    return item;
  }
  function createTaskGalleryData(task, number) {
    return {
      id: "",
      number,
      dataUrl: "",
      imageUrl: "",
      persisted: false,
      saving: false,
      format: task.format,
      meta: task.startMessage,
      requestedSize: task.requestedSize,
      actualSize: "排队中",
      sizeNote: "排队中",
      mode: getModeLabel(task.mode),
      model: task.model,
      siteName: task.siteContext && task.siteContext.siteName || "",
      quality: task.quality,
      moderation: task.moderation,
      prompt: task.prompt,
      revisedPrompt: "",
      durationMs: 0,
      durationText: "",
      time: formatDateTime(),
      savedAt: "",
      taskStatus: "queued",
      errorText: "",
      categoryIds: [],
      logs: task.logs,
    };
  }
  function updateTaskGalleryImage(item, dataUrl, format, meta, requestedSize) {
    if (!item || !item.galleryData) {
      return null;
    }
    item.classList.remove("task-item");
    item.galleryData = {
      ...item.galleryData,
      dataUrl,
      format: format || item.galleryData.format,
      meta,
      requestedSize: requestedSize || "auto",
      actualSize: "读取中",
      sizeNote: "读取中",
    };
    const old = item.querySelector(".task-placeholder");
    let image = item.querySelector("img");
    if (!image) {
      image = document.createElement("img");
      image.alt = `画廊图片 ${item.galleryData.time}`;
      image.loading = "lazy";
      image.decoding = "async";
      item.insertBefore(image, item.firstChild);
    }
    window.ImageToolLazy?.setImageSource(image, dataUrl, item) || (image.src = dataUrl);
    if (old) {
      old.remove();
    }
    renderGalleryItemChrome(item);
    if (window.ImageToolBatch) window.ImageToolBatch.syncFromChild(item);
    return item;
  }
  function addGalleryItem(dataUrl, format, meta, requestedSize, savedData = null, options = {}) {
    if (!el.imageGallery) {
      return null;
    }
    const signature = savedData && savedData.id ? savedData.id : createImageSignature(dataUrl);
    if (state.gallerySignatures.has(signature)) {
      const existing = Array.from(el.imageGallery.children).find((node) => node.dataset.signature === signature);
      if (existing) {
        updateGalleryItemData(existing, { meta, requestedSize: requestedSize || "auto" });
        if (options.select !== false) {
          selectGalleryItem(existing);
        }
      }
      return existing || null;
    }
    state.gallerySignatures.add(signature);
    const number = Number(savedData && savedData.number) || state.galleryCount + 1;
    state.galleryCount = Math.max(state.galleryCount, number);
    const item = document.createElement("article");
    item.className = "gallery-item";
    item.tabIndex = 0;
    item.setAttribute("role", "button");
    item.setAttribute("aria-expanded", "false");
    item.dataset.signature = signature;
    item.title = meta;
    item.galleryData = {
      id: savedData && savedData.id || "",
      number,
      dataUrl,
      imageUrl: savedData && savedData.imageUrl || "",
      persisted: Boolean(savedData && savedData.id),
      saving: false,
      format: savedData && savedData.format || format || "png",
      meta: savedData && savedData.meta || meta,
      requestedSize: savedData && savedData.requestedSize || requestedSize || "auto",
      actualSize: savedData && savedData.actualSize || "读取中",
      sizeNote: savedData && savedData.sizeNote || "读取中",
      mode: savedData && savedData.mode || getModeLabel(state.currentTaskMode || state.activeMode),
      model: savedData && savedData.model || state.currentTaskModel || "",
      siteName: savedData && savedData.siteName || "",
      quality: savedData && savedData.quality || state.currentTaskQuality || "auto",
      moderation: savedData && savedData.moderation || state.currentTaskModeration || "auto",
      prompt: savedData && savedData.prompt || state.currentTaskPrompt || "",
      revisedPrompt: savedData && savedData.revisedPrompt || state.currentRevisedPrompt || "",
      durationMs: Number(savedData && savedData.durationMs) || 0,
      durationText: savedData && savedData.durationText || formatDuration(Number(savedData && savedData.durationMs) || 0),
      time: savedData && savedData.time || formatDateTime(),
      savedAt: savedData && savedData.savedAt || "",
      categoryIds: normalizeGalleryCategoryIds(savedData && savedData.categoryIds),
      logs: Array.isArray(savedData && savedData.logs) ? savedData.logs : [],
    };
    const image = document.createElement("img");
    image.alt = `画廊图片 ${item.galleryData.time}`;
    image.loading = "lazy";
    image.decoding = "async";
    window.ImageToolLazy?.setImageSource(image, dataUrl, item) || (image.src = dataUrl);
    const badge = document.createElement("span");
    badge.className = "gallery-badge";
    badge.textContent = formatGalleryBadge(item.galleryData);
    const caption = document.createElement("span");
    caption.className = "gallery-meta";
    caption.textContent = item.galleryData.durationText || "";
    item.append(image, badge, caption);
    item.addEventListener("click", () => {
      selectGalleryItem(item);
    });
    item.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectGalleryItem(item);
      }
    });
    if (options.prepend === false) {
      el.imageGallery.append(item);
    } else {
      el.imageGallery.prepend(item);
    }
    if (!savedData) {
      state.currentTaskItems.push(item);
    }
    if (options.select !== false) {
      selectGalleryItem(item);
    }
    trimGallery();
    renderGalleryFilters();
    applyGalleryFilters();
    return item;
  }
  function selectGalleryItem(item) {
    const data = item.galleryData;
    markGalleryItem(item);
    item.setAttribute("aria-expanded", "true");
    if (el.downloadImage) {
      el.downloadImage.href = data.dataUrl;
      el.downloadImage.download = `vibeapi-gallery-${Date.now()}.${data.format === "jpeg" ? "jpg" : data.format || "png"}`;
      el.downloadImage.classList.remove("disabled");
      el.downloadImage.setAttribute("aria-disabled", "false");
    }
    el.resultMeta.textContent = `已选 · ${data.mode} · ${data.actualSize}`;
    openGalleryModal(item);
  }
  function markGalleryItem(item) {
    el.imageGallery.querySelectorAll(".gallery-item.active").forEach((node) => {
      node.classList.remove("active");
      node.setAttribute("aria-expanded", "false");
    });
    item.classList.add("active");
  }
  function updateGalleryItemData(item, patch) {
    if (!item || !item.galleryData) {
      return;
    }
    item.galleryData = { ...item.galleryData, ...patch };
    renderGalleryItemChrome(item);
    if ("actualSize" in patch || "categoryIds" in patch) {
      window.ImageToolGallery.syncItemFilterState(item, state.galleryFilter, el.imageGallery);
    }
    if ("categoryIds" in patch) {
      renderGalleryFilters();
    }
    if (item.classList.contains("active")) {
      el.resultMeta.textContent = `已选 · ${item.galleryData.mode} · ${item.galleryData.actualSize}`;
      if (el.imageModal && !el.imageModal.hidden) {
        renderGalleryModal(item);
      }
    }
    if (item.galleryData.persisted) {
      scheduleStoredGalleryUpdate(item);
    }
    if (window.ImageToolBatch) window.ImageToolBatch.syncFromChild(item);
    const parent = item.batchParent;
    if (parent && parent.classList.contains("active") && el.imageModal && !el.imageModal.hidden) {
      renderGalleryModal(parent);
    }
  }
  function renderGalleryItemChrome(item) {
    if (!item || !item.galleryData) {
      return;
    }
    const badge = item.querySelector(".gallery-badge");
    if (badge) {
      badge.textContent = formatGalleryBadge(item.galleryData);
    }
    const caption = item.querySelector(".gallery-meta");
    if (caption) {
      caption.textContent = item.galleryData.durationText || "";
    }
    const placeholder = item.querySelector(".task-placeholder");
    if (placeholder) {
      placeholder.textContent = item.galleryData.taskStatus === "failed" ? "失败" : item.galleryData.actualSize || "排队中";
    }
  }
  function formatGalleryBadge(data) {
    return [data.mode || "生成", data.actualSize || data.requestedSize || "尺寸读取中"].filter(Boolean).join(" · ");
  }
  function renderGalleryFilters() {
    if (!state.config) {
      return;
    }
    if (el.galleryCategoryFilter) {
      const options = window.ImageToolGallery.buildCategoryFilterOptions(getGalleryCategories(), el.imageGallery);
      setSelectOptions(el.galleryCategoryFilter, options, state.galleryFilter.category);
      state.galleryFilter.category = el.galleryCategoryFilter.value || "all";
      window.ImageToolGallery.renderCategoryFilterChips(el.galleryCategoryChips, options, state.galleryFilter.category, (value) => {
        state.galleryFilter.category = value;
        el.galleryCategoryFilter.value = value;
        saveGalleryFilterSettings();
        applyGalleryFilters();
        renderGalleryFilters();
      });
    }
    if (el.galleryResolutionFilter) {
      const options = [
        ["all", "清晰度"],
        ["small", "小图"],
        ["level:1K", "1K"],
        ["level:2K", "2K"],
        ["level:4K", "4K"],
      ];
      setSelectOptions(el.galleryResolutionFilter, options, state.galleryFilter.resolution);
      state.galleryFilter.resolution = el.galleryResolutionFilter.value || "all";
    }
    if (el.galleryRatioFilter) {
      const options = [
        ["all", "比例"],
        ["ratio:1:1", "1:1"],
        ["ratio:16:9", "16:9"],
        ["ratio:9:16", "9:16"],
        ["ratio:4:3", "4:3"],
        ["ratio:3:4", "3:4"],
        ["ratio:3:2", "3:2"],
        ["ratio:2:3", "2:3"],
        ["ratio:21:9", "21:9"],
        ["ratio:9:21", "9:21"],
      ];
      setSelectOptions(el.galleryRatioFilter, options, state.galleryFilter.ratio);
      state.galleryFilter.ratio = el.galleryRatioFilter.value || "all";
    }
  }
  function setSelectOptions(select, options, value) {
    const previous = value || select.value || "all";
    select.innerHTML = "";
    options.forEach(([optionValue, label]) => {
      const option = document.createElement("option");
      option.value = optionValue;
      option.textContent = label;
      select.append(option);
    });
    select.value = options.some(([optionValue]) => optionValue === previous) ? previous : "all";
  }
  function applyGalleryFilters() {
    if (!el.imageGallery) {
      return;
    }
    let total = 0;
    let visible = 0;
    el.imageGallery.querySelectorAll(".gallery-item").forEach((item) => {
      if (!item.galleryData) {
        return;
      }
      total += 1;
      const matched = window.ImageToolGallery.matchesGalleryFilter(item.galleryData, state.galleryFilter);
      item.hidden = !matched;
      item.classList.toggle("filtered-out", !matched);
      if (matched) {
        visible += 1;
      }
    });
    el.imageGallery.classList.toggle("filtered-empty", total > 0 && visible === 0);
  }
  function renderModalCategories(item) {
    if (!el.modalCategories || !item || !item.galleryData) {
      return;
    }
    const data = item.galleryData;
    if (data.taskStatus === "failed") {
      el.modalCategories.hidden = true;
      el.modalCategories.innerHTML = "";
      return;
    }
    if (el.modalCategories.parentElement !== el.modalDetails) {
      el.modalDetails.append(el.modalCategories);
    }
    el.modalCategories.hidden = false;
    el.modalCategories.innerHTML = "";
    const chips = document.createElement("div");
    chips.className = "category-chip-list";
    const categories = getGalleryCategories();
    if (categories.length) {
      categories.forEach((category) => chips.append(createCategoryChip(item, category)));
    } else {
      const empty = document.createElement("em");
      empty.textContent = "还没有分类 · 右键空白区域创建分类";
      chips.append(empty);
    }
    el.modalCategories.oncontextmenu = (event) => {
      if (event.target.closest(".category-chip")) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      createGalleryCategoryFromPrompt();
    };
    el.modalCategories.append(chips);
  }
  function createCategoryChip(item, category) {
    const data = item.galleryData;
    const active = normalizeGalleryCategoryIds(data.categoryIds).includes(category.id);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "category-chip";
    button.classList.toggle("active", active);
    button.textContent = category.name;
    button.addEventListener("click", () => toggleGalleryCategory(item, category.id));
    button.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openCategoryContextMenu(event, item, category);
    });
    return button;
  }
  function createGalleryCategoryFromPrompt() {
    const name = window.prompt("输入新分类名称", "");
    addGalleryCategory(name);
  }
  function openCategoryContextMenu(event, item, category) {
    closeCategoryContextMenu();
    const menu = document.createElement("div");
    menu.className = "category-menu";
    menu.setAttribute("role", "menu");
    const rename = document.createElement("button");
    rename.type = "button";
    rename.textContent = "改名";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "删除";
    remove.className = "danger";
    rename.addEventListener("click", () => {
      closeCategoryContextMenu();
      renameGalleryCategory(category.id);
    });
    remove.addEventListener("click", () => {
      closeCategoryContextMenu();
      deleteGalleryCategory(category.id, item);
    });
    menu.append(rename, remove);
    document.body.append(menu);
    const left = Math.min(event.clientX, window.innerWidth - menu.offsetWidth - 8);
    const top = Math.min(event.clientY, window.innerHeight - menu.offsetHeight - 8);
    menu.style.left = `${Math.max(8, left)}px`;
    menu.style.top = `${Math.max(8, top)}px`;
    setTimeout(() => document.addEventListener("click", closeCategoryContextMenu, { once: true }), 0);
    window.addEventListener("resize", closeCategoryContextMenu, { once: true });
  }
  function closeCategoryContextMenu() {
    document.querySelectorAll(".category-menu").forEach((menu) => menu.remove());
  }
  function renameGalleryCategory(categoryId) {
    if (!state.config) {
      return;
    }
    const categories = getGalleryCategories();
    const category = categories.find((item) => item.id === categoryId);
    if (!category) {
      return;
    }
    const nextName = window.prompt("输入新的分类名称", category.name);
    const name = String(nextName || "").trim().slice(0, 24);
    if (!name || name === category.name) {
      return;
    }
    if (categories.some((item) => item.id !== categoryId && item.name === name)) {
      appendLog(`分类已存在：${name}`, true);
      return;
    }
    state.config.galleryCategories = categories.map((item) => item.id === categoryId ? { ...item, name } : item);
    saveConfig();
    renderGalleryFilters();
    renderActiveGalleryModal();
  }
  function deleteGalleryCategory(categoryId, item = null) {
    if (!state.config) {
      return;
    }
    const categories = getGalleryCategories();
    const category = categories.find((entry) => entry.id === categoryId);
    if (!category) {
      return;
    }
    state.config.galleryCategories = categories.filter((entry) => entry.id !== categoryId);
    saveConfig();
    removeCategoryFromGalleryItems(categoryId);
    renderGalleryFilters();
    applyGalleryFilters();
    if (item && item.galleryData) {
      renderGalleryModal(item);
    } else {
      renderActiveGalleryModal();
    }
  }
  function removeCategoryFromGalleryItems(categoryId) {
    if (!el.imageGallery) {
      return;
    }
    el.imageGallery.querySelectorAll(".gallery-item").forEach((item) => {
      if (!item.galleryData) {
        return;
      }
      const ids = normalizeGalleryCategoryIds(item.galleryData.categoryIds);
      if (!ids.includes(categoryId)) {
        return;
      }
      updateGalleryItemData(item, { categoryIds: ids.filter((id) => id !== categoryId) });
    });
  }
  function renderActiveGalleryModal() {
    if (!el.imageGallery || !el.imageModal || el.imageModal.hidden) {
      return;
    }
    const active = el.imageGallery.querySelector(".gallery-item.active");
    if (active && active.galleryData) {
      renderGalleryModal(active);
    }
  }
  function toggleGalleryCategory(item, categoryId) {
    if (!item || !item.galleryData) {
      return;
    }
    const ids = new Set(normalizeGalleryCategoryIds(item.galleryData.categoryIds));
    if (ids.has(categoryId)) {
      ids.delete(categoryId);
    } else {
      ids.add(categoryId);
    }
    updateGalleryItemData(item, { categoryIds: Array.from(ids) });
  }
  function addGalleryCategory(name, item = null) {
    const categoryName = String(name || "").trim().slice(0, 24);
    if (!categoryName || !state.config) {
      return;
    }
    const categories = getGalleryCategories();
    const existing = categories.find((category) => category.name === categoryName);
    const category = existing || { id: createGalleryCategoryId(), name: categoryName };
    if (!existing) {
      state.config.galleryCategories = [...categories, category];
      saveConfig();
      renderGalleryFilters();
    }
    if (item && item.galleryData) {
      const ids = new Set(normalizeGalleryCategoryIds(item.galleryData.categoryIds));
      ids.add(category.id);
      updateGalleryItemData(item, { categoryIds: Array.from(ids) });
    } else {
      renderActiveGalleryModal();
    }
  }
  function getGalleryCategories() {
    return normalizeGalleryCategories(state.config && state.config.galleryCategories);
  }
  function normalizeGalleryCategories(categories = []) {
    const seen = new Set();
    return (Array.isArray(categories) ? categories : []).map((category) => {
      const id = String(category && category.id || "").trim();
      const name = String(category && category.name || "").trim().slice(0, 24);
      return id && name ? { id, name } : null;
    }).filter((category) => {
      if (!category || seen.has(category.id)) {
        return false;
      }
      seen.add(category.id);
      return true;
    });
  }
  function normalizeGalleryCategoryIds(ids = []) {
    const seen = new Set();
    return (Array.isArray(ids) ? ids : []).map((id) => String(id || "").trim()).filter((id) => {
      if (!id || seen.has(id)) {
        return false;
      }
      seen.add(id);
      return true;
    });
  }
  function createGalleryCategoryId() {
    return `cat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  }
  function saveGalleryFilterSettings() {
    if (!state.config) {
      return;
    }
    state.config.ui = normalizeUiSettings({
      ...(state.config.ui || {}),
      galleryFilters: { ...state.galleryFilter },
    });
    saveConfig();
  }
  async function persistGalleryItem(item, dataUrl) {
    if (!canUseConfigApi() || !item || !item.galleryData || item.galleryData.persisted || item.galleryData.saving) {
      return;
    }
    item.galleryData.saving = true;
    try {
      const response = await fetch(`${window.location.origin}/api/gallery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataUrl,
          metadata: serializeGalleryData(item.galleryData),
        }),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = await response.json();
      if (payload && payload.item) {
        const localData = item.galleryData;
        item.galleryData = {
          ...payload.item,
          ...localData,
          id: payload.item.id || localData.id,
          imageUrl: payload.item.imageUrl || localData.imageUrl,
          dataUrl: payload.item.imageUrl || localData.dataUrl,
          savedAt: payload.item.savedAt || localData.savedAt,
          persisted: true,
          saving: false,
        };
        const image = item.querySelector("img");
        if (image && payload.item.imageUrl) {
          image.src = payload.item.imageUrl;
        }
        if (window.ImageToolBatch) window.ImageToolBatch.syncFromChild(item);
        if (item.classList.contains("active") && el.imageModal && !el.imageModal.hidden) {
          renderGalleryModal(item);
        }
        scheduleStoredGalleryUpdate(item);
      } else {
        item.galleryData.saving = false;
      }
    } catch (error) {
      item.galleryData.saving = false;
      appendLog(`保存长期画廊失败: ${formatError(error)}`, true);
    }
  }
  async function updateStoredGalleryItem(item) {
    const data = item && item.galleryData;
    if (!canUseConfigApi() || !data || !data.id || data.saving) {
      return;
    }
    if (data.updating) {
      data.pendingUpdate = true;
      return;
    }
    data.updating = true;
    try {
      const response = await fetch(`${window.location.origin}/api/gallery`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: data.id,
          metadata: serializeGalleryData(data),
        }),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      appendLog(`更新长期画廊失败: ${formatError(error)}`, true);
    } finally {
      data.updating = false;
      if (data.pendingUpdate) {
        data.pendingUpdate = false;
        scheduleStoredGalleryUpdate(item);
      }
    }
  }
  function scheduleStoredGalleryUpdate(item) {
    const data = item && item.galleryData;
    if (!canUseConfigApi() || !data || !data.persisted || !data.id) {
      return;
    }
    if (data.saving) {
      data.pendingUpdate = true;
      return;
    }
    if (data.updateTimer) {
      window.clearTimeout(data.updateTimer);
    }
    data.updateTimer = window.setTimeout(() => {
      data.updateTimer = null;
      void updateStoredGalleryItem(item);
    }, 600);
  }
  function serializeGalleryData(data) {
    return {
      number: data.number,
      format: data.format,
      meta: data.meta,
      requestedSize: data.requestedSize,
      actualSize: data.actualSize,
      sizeNote: data.sizeNote,
      mode: data.mode,
      model: data.model,
      siteName: data.siteName || "",
      quality: data.quality,
      moderation: data.moderation,
      prompt: data.prompt,
      revisedPrompt: data.revisedPrompt,
      durationMs: data.durationMs,
      durationText: data.durationText,
      batchId: data.batchId || "",
      batchIndex: Number(data.batchIndex) || 0,
      batchTotal: Number(data.batchTotal) || 0,
      time: data.time,
      categoryIds: normalizeGalleryCategoryIds(data.categoryIds),
      logs: compactStoredLogs(data.logs),
    };
  }
  function compactStoredLogs(logs) {
    if (!Array.isArray(logs)) {
      return [];
    }
    return logs
      .map(String)
      .filter((line) => /失败|错误|HTTP|request-id|完成|取消|停止|原因|建议/i.test(line))
      .slice(-80);
  }
  function openGalleryModal(item) {
    if (!el.imageModal) return;
    renderGalleryModal(item);
    el.imageModal.hidden = false;
    document.body.classList.add("modal-open");
  }
  function closeGalleryModal() {
    if (el.imageModal) el.imageModal.hidden = true;
    document.body.classList.remove("modal-open");
  }
  function toggleModalLogView() {
    const item = getActiveGalleryItem();
    const viewItem = window.ImageToolBatch && window.ImageToolBatch.getActiveChild(item) || item;
    if (!viewItem || !viewItem.galleryData) return;
    const logs = Array.isArray(viewItem.galleryData.logs) ? viewItem.galleryData.logs : [];
    if (logs.length === 0) return;
    viewItem.galleryData.modalView = viewItem.galleryData.modalView === "log" ? "" : "log";
    renderGalleryModal(item);
  }
  function getActiveGalleryItem() {
    return el.imageGallery ? el.imageGallery.querySelector(".gallery-item.active") : null;
  }
  function renderGalleryModal(item) {
    const viewItem = window.ImageToolBatch && window.ImageToolBatch.getActiveChild(item) || item;
    const data = viewItem.galleryData;
    if (window.ImageToolBatch) {
      window.ImageToolBatch.renderNav(el.modalGroupNav, item, () => renderGalleryModal(item));
    }
    el.modalTitle.textContent = `图片 #${data.number}`;
    el.modalSubtitle.textContent = `${data.mode} · ${data.actualSize || "尺寸读取中"}`;
    const failed = data.taskStatus === "failed";
    const showLog = data.modalView === "log";
    const logs = Array.isArray(data.logs) ? data.logs : [];
    if (showLog) {
      el.modalImage.removeAttribute("src");
      if (el.modalFailure) {
        el.modalFailure.hidden = false; el.modalFailure.classList.add("log-mode");
        renderLogPanel(el.modalFailure, data);
      }
    } else if (failed) {
      el.modalImage.removeAttribute("src");
      if (el.modalFailure) {
        el.modalFailure.hidden = false; el.modalFailure.classList.remove("log-mode");
        renderFailurePanel(el.modalFailure, data);
      }
    } else if (data.dataUrl) {
      el.modalImage.src = data.dataUrl;
      if (el.modalFailure) {
        el.modalFailure.hidden = true; el.modalFailure.classList.remove("log-mode");
      }
    } else {
      el.modalImage.removeAttribute("src");
      if (el.modalFailure) {
        el.modalFailure.hidden = true; el.modalFailure.classList.remove("log-mode");
      }
    }
    el.modalDownload.href = data.dataUrl;
    el.modalDownload.download = `vibeapi-gallery-${Date.now()}.${data.format === "jpeg" ? "jpg" : data.format || "png"}`;
    if (el.modalTime) el.modalTime.textContent = [data.mode, data.time].filter(Boolean).join("·");
    if (el.modalDuration) {
      el.modalDuration.textContent = data.durationText || "";
      el.modalDuration.classList.toggle("clickable", logs.length > 0);
      el.modalDuration.title = logs.length > 0 ? (showLog ? "点击返回" : "点击查看日志") : "";
    }
    el.modalDetails.innerHTML = "";
    [
      ["提示词", data.prompt || "未记录", "wide prompt-detail"],
      ["优化后", data.revisedPrompt || "无", "wide prompt-detail"],
      ["尺寸", `请求 ${data.requestedSize || "auto"} · 实际 ${data.actualSize || "读取中"}`, "wide size-detail"],
      ["格式", data.format, "tile"],
      ["质量", data.quality || "未记录", "tile"],
      ["审核", data.moderation || "未记录", "tile"],
      ["模型", data.model || "未记录", "tile"],
    ].filter(Boolean).forEach(([label, value, variant]) => {
      const row = document.createElement("div");
      row.className = `modal-detail-row ${variant || ""}`.trim();
      const key = document.createElement("span");
      key.textContent = label;
      const text = document.createElement("p");
      text.textContent = value;
      row.append(key, text);
      el.modalDetails.append(row);
    });
    renderModalCategories(item);
  }
  function renderFailurePanel(container, data) {
    const reason = explainFailure(data.errorText || "生成失败，未记录具体原因。");
    container.innerHTML = "";
    const title = document.createElement("strong");
    title.textContent = data.taskStatus === "failed" ? "生成失败" : "任务状态";
    const message = document.createElement("pre");
    message.textContent = reason;
    const meta = document.createElement("span");
    meta.textContent = [data.durationText, data.model].filter(Boolean).join(" · ");
    container.append(title, message, meta);
  }
  function renderLogPanel(container, data) {
    container.innerHTML = "";
    const title = document.createElement("strong");
    title.textContent = "任务日志";
    const message = document.createElement("pre");
    message.textContent = (Array.isArray(data.logs) && data.logs.length ? data.logs : ["未记录日志"]).join("\n");
    const meta = document.createElement("span");
    meta.textContent = [data.durationText, data.model].filter(Boolean).join(" · ");
    container.append(title, message, meta);
  }
  function trimGallery() {}
  function createImageSignature(dataUrl) {
    return `${dataUrl.length}:${dataUrl.slice(0, 96)}:${dataUrl.slice(-96)}`;
  }
  function getModeLabel(mode) {
    const labels = {
      generate: "文生图",
      image: "图生图",
      edit: "精修图",
      responses: "流式",
    };
    return labels[mode] || "生成";
  }
  function formatDateTime() {
    return new Date().toLocaleString("zh-CN", { hour12: false });
  }
  function formatDuration(durationMs) {
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      return "";
    }
    const seconds = durationMs / 1000;
    return `${Math.max(1, Math.round(seconds))}s`;
  }
  function isSizeMismatch(requestedSize, actualSize) {
    if (!requestedSize || requestedSize === "auto") {
      return false;
    }
    const requested = parseSize(requestedSize);
    const actual = parseSize(actualSize);
    if (!requested || !actual) {
      return false;
    }
    return requested.width !== actual.width || requested.height !== actual.height;
  }
  function parseSize(size) {
    const match = String(size).match(/^(\d+)x(\d+)$/);
    if (!match) {
      return null;
    }
    return {
      width: Number(match[1]),
      height: Number(match[2]),
    };
  }
  function clearResultText() {
    state.lastSizeSignature = "";
  }
  function renderPreviews(fileList, container) {
    const key = container.id;
    const oldUrls = state.previewUrls.get(key) || [];
    oldUrls.forEach((url) => URL.revokeObjectURL(url));
    const urls = [];
    container.innerHTML = "";
    Array.from(fileList || []).forEach((file) => {
      const url = URL.createObjectURL(file);
      urls.push(url);
      const item = document.createElement("div");
      item.className = "preview-item";
      const image = document.createElement("img");
      image.alt = file.name;
      image.src = url;
      const name = document.createElement("div");
      name.className = "preview-name";
      name.textContent = file.name;
      item.append(image, name);
      container.append(item);
    });
    state.previewUrls.set(key, urls);
  }
  function setLog(message, isError = false, task = null) {
    state.logLineCount = 0;
    const entry = formatLogEntry(message);
    appendActiveTaskLog(entry, task);
    el.statusLog.textContent = entry;
    el.statusLog.classList.toggle("error-text", isError);
    el.statusLog.scrollTop = el.statusLog.scrollHeight;
  }
  function saveSelectedModels() {
    syncPreferredModelsFromInputs();
    const site = getActiveSite();
    site.selectedModel = getUnifiedPreferredModel();
    site.selectedModels = { ...state.preferredModels };
    saveConfig();
    renderModelLibrary();
  }
  function saveEndpointChoices() {
    const site = getActiveSite();
    site.apiModes = {
      generate: groups.generate.api.value || DEFAULT_SETTINGS.generateApi,
      image: groups.image.api.value || DEFAULT_SETTINGS.imageApi,
      edit: groups.edit.api.value || DEFAULT_SETTINGS.editApi,
    };
    saveConfig();
  }
  function appendLog(message, isError = false, task = null) {
    const entry = formatLogEntry(message);
    appendActiveTaskLog(entry, task);
    appendStatusEntry(entry, isError);
  }
  function appendStatusLog(message, isError = false) {
    appendStatusEntry(formatLogEntry(message), isError);
  }
  function appendStatusEntry(entry, isError = false) {
    el.statusLog.classList.toggle("error-text", isError);
    el.statusLog.textContent = `${el.statusLog.textContent}\n${entry}`.trim();
    trimLogLines();
    el.statusLog.scrollTop = el.statusLog.scrollHeight;
  }
  function appendActiveTaskLog(entry, task = null) {
    if (!task || !task.item || !task.item.galleryData) {
      return;
    }
    task.logs.push(entry);
    task.item.galleryData.logs = task.logs.slice(-700);
    if (task.item.classList.contains("active") && el.imageModal && !el.imageModal.hidden) {
      renderGalleryModal(task.item);
    }
  }
  function formatLogEntry(message) {
    state.logLineCount += 1;
    const time = new Date().toLocaleTimeString("zh-CN", { hour12: false });
    const lines = String(message).split(/\r?\n/);
    const [first, ...rest] = lines;
    return [`[${time}] ${first}`, ...rest.map((line) => `  ${line}`)].join("\n");
  }
  function trimLogLines() {
    const lines = el.statusLog.textContent.split("\n");
    if (lines.length > 700) {
      el.statusLog.textContent = lines.slice(-700).join("\n");
    }
  }
  async function loadSettings() {
    state.config = await loadConfig();
    applyActiveSiteToInputs();
    applyUiSettings();
  }
  function saveSettings() {
    persistActiveSiteFromInputs({ saveParameters: !isRotationMode() });
    saveEndpointChoices();
    saveSelectedModels();
    saveConfig();
    renderSiteOptions();
    renderModelLibrary();
  }
  function resetSettings() {
    const oldSite = getActiveSite();
    const nextSite = createDefaultSite(oldSite.name || DEFAULT_SETTINGS.siteName);
    nextSite.id = oldSite.id;
    const index = state.config.sites.findIndex((site) => site.id === oldSite.id);
    state.config.sites[index] = nextSite;
    state.config.activeSiteId = nextSite.id;
    saveConfig();
    applyActiveSiteToInputs();
  }
  async function loadConfig() {
    if (canUseConfigApi()) {
      try {
        const response = await fetch(`${window.location.origin}/api/config`, { cache: "no-store" });
        if (response.ok) {
          const data = await response.json();
          const config = normalizeConfig(data);
          localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
          return config;
        }
      } catch {
        // Fall back to browser storage when the local server is unavailable.
      }
    }
    try {
      const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
      if (raw) {
        return normalizeConfig(JSON.parse(raw));
      }
    } catch {
      localStorage.removeItem(CONFIG_STORAGE_KEY);
    }
    const site = createDefaultSite(DEFAULT_SETTINGS.siteName);
    return { version: 1, activeSiteId: site.id, sites: [site], rotation: window.ImageToolRotation.normalizeRotation(), ui: normalizeUiSettings({ modelLibraryOpen: true }), galleryCategories: [] };
  }
  function saveConfig() {
    const text = JSON.stringify(state.config);
    localStorage.setItem(CONFIG_STORAGE_KEY, text);
    if (!canUseConfigApi()) {
      return;
    }
    fetch(`${window.location.origin}/api/config`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: text,
    }).catch(() => {
      setLog("站点配置已保存到浏览器，但写入 sites.config.json 失败。", true);
    });
  }
  function canUseConfigApi() {
    return window.location.protocol !== "file:";
  }
  function normalizeUiSettings(ui = {}) {
    const filters = ui.galleryFilters || {};
    const modelLibraryOpen = ui.modelLibraryOpen === true;
    return {
      modelLibraryOpen,
      galleryFilters: {
        category: typeof filters.category === "string" ? filters.category : "all",
        resolution: typeof filters.resolution === "string" ? filters.resolution : "all",
        ratio: typeof filters.ratio === "string" ? filters.ratio : "all",
      },
    };
  }
  function normalizeParameterSettings(parameters = {}) {
    const normalized = {};
    MODE_NAMES.forEach((mode) => {
      normalized[mode] = {
        ...DEFAULT_PARAMETERS[mode],
        ...(parameters[mode] || {}),
      };
      normalized[mode].size = normalizeSizeSetting(normalized[mode].size);
      normalized[mode].compression = String(clampCompressionValue(normalized[mode].compression));
      normalized[mode].quantity = String(clampQuantityValue(normalized[mode].quantity));
    });
    return normalized;
  }
  function normalizeConfig(config) {
    const isFirstRun = !config || typeof config !== "object";
    const sites = Array.isArray(config && config.sites) && config.sites.length > 0
      ? config.sites.map(normalizeSite)
      : [createDefaultSite(DEFAULT_SETTINGS.siteName)];
    const requestedActiveSiteId = config && config.activeSiteId;
    const activeSiteId = sites.some((site) => site.id === requestedActiveSiteId)
      ? requestedActiveSiteId
      : sites[0].id;
    return {
      version: 1,
      activeSiteId,
      sites,
      rotation: window.ImageToolRotation.normalizeRotation(config && config.rotation),
      ui: normalizeUiSettings({
        ...(config && config.ui || {}),
        modelLibraryOpen: isFirstRun ? true : config && config.ui && config.ui.modelLibraryOpen,
      }),
      galleryCategories: normalizeGalleryCategories(config && config.galleryCategories),
    };
  }
  function normalizeSite(site) {
    site = site || {};
    const fallback = createDefaultSite(DEFAULT_SETTINGS.siteName);
    const apiModes = {
      ...fallback.apiModes,
      ...(site.apiModes || {}),
    };
    const selectedModel = normalizeSelectedModel(site);
    return {
      ...fallback,
      ...site,
      id: site.id || fallback.id,
      name: site.name || DEFAULT_SETTINGS.siteName,
      endpoints: { ...fallback.endpoints },
      apiModes: {
        generate: normalizeApiMode(apiModes.generate),
        image: normalizeApiMode(apiModes.image),
        edit: normalizeApiMode(apiModes.edit),
      },
      selectedModel,
      selectedModels: createSelectedModels(selectedModel),
      parameters: normalizeParameterSettings(site.parameters || fallback.parameters),
      models: Array.isArray(site.models) ? site.models : [],
      concurrency: clampConcurrencyValue(site.concurrency || fallback.concurrency),
      responsesToolChoice: normalizeResponsesToolChoice(site.responsesToolChoice || fallback.responsesToolChoice),
      rotationEnabled: site.rotationEnabled === true,
    };
  }
  function createDefaultSite(name) {
    return {
      id: `site-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      baseUrl: DEFAULT_SETTINGS.baseUrl,
      apiKey: "",
      useProxy: DEFAULT_SETTINGS.useProxy,
      concurrency: DEFAULT_SETTINGS.concurrency,
      responsesToolChoice: DEFAULT_SETTINGS.responsesToolChoice,
      rotationEnabled: false,
      endpoints: {
        generation: DEFAULT_SETTINGS.generationEndpoint,
        edit: DEFAULT_SETTINGS.editEndpoint,
        responses: DEFAULT_SETTINGS.responsesEndpoint,
        models: DEFAULT_SETTINGS.modelsEndpoint,
      },
      apiModes: {
        generate: DEFAULT_SETTINGS.generateApi,
        image: DEFAULT_SETTINGS.imageApi,
        edit: DEFAULT_SETTINGS.editApi,
      },
      selectedModel: DEFAULT_SETTINGS.imageModel,
      selectedModels: createSelectedModels(DEFAULT_SETTINGS.imageModel),
      parameters: normalizeParameterSettings(DEFAULT_PARAMETERS),
      models: [],
    };
  }
  function getActiveSite() {
    return state.config.sites.find((site) => site.id === state.config.activeSiteId) || state.config.sites[0];
  }
  function createSelectedModels(model) {
    return {
      generate: model,
      image: model,
      edit: model,
      responses: model,
    };
  }
  function normalizeSelectedModel(site) {
    const direct = typeof site.selectedModel === "string" ? site.selectedModel.trim() : "";
    if (direct) {
      return direct;
    }
    const legacy = site.selectedModels || {};
    const legacyValues = MODE_NAMES
      .map((mode) => typeof legacy[mode] === "string" ? legacy[mode].trim() : "")
      .filter(Boolean);
    const custom = legacyValues.find((model) => model !== DEFAULT_SETTINGS.imageModel && model !== DEFAULT_SETTINGS.responsesModel);
    return custom || legacy.generate || legacy.image || legacy.edit || DEFAULT_SETTINGS.imageModel;
  }
  function normalizeApiMode(value) {
    return isResponsesApiMode(value) ? "responses-stream" : "image";
  }
  function normalizeResponsesToolChoice(value) {
    return value === "auto" || value === "required" ? value : "image_generation";
  }
  function renderSiteOptions() {
    el.siteList.innerHTML = "";
    state.config.sites.forEach((site) => {
      const option = document.createElement("button");
      const active = site.id === state.config.activeSiteId;
      option.type = "button";
      option.className = active ? "site-option active" : "site-option";
      option.dataset.siteId = site.id;
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", String(active));
      const name = document.createElement("span");
      name.className = "site-option-name";
      name.textContent = site.name || "未命名站点";
      option.append(name);
      el.siteList.append(option);
    });
    el.deleteSite.disabled = state.config.sites.length <= 1;
  }
  function renderModelLibrary() {
    if (!el.modelLibrary) {
      return;
    }
    el.modelLibrary.innerHTML = "";
    const site = getActiveSite();
    const card = document.createElement("section");
    card.className = "model-library-card active";
    const title = document.createElement("div");
    title.className = "model-library-title";
    const count = document.createElement("span");
    const models = Array.isArray(site.models) ? site.models : [];
    const notice = getActiveModelLibraryNotice();
    count.textContent = models.length ? `${models.length} 个` : "未保存";
    title.append(count);
    const list = document.createElement("div");
    list.className = "model-chip-list";
    if (notice) {
      const noticeEl = document.createElement("span");
      noticeEl.className = notice.isError ? "model-library-notice error-text" : "model-library-notice";
      noticeEl.textContent = notice.text;
      list.append(noticeEl);
    }
    if (models.length) {
      const activeModel = getUnifiedPreferredModel();
      models.forEach((model) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = model === activeModel ? "model-chip active" : "model-chip";
        chip.textContent = model;
        chip.title = "点击填入所有模式模型";
        chip.setAttribute("aria-pressed", String(model === activeModel));
        chip.addEventListener("click", () => {
          syncModelInputs(model);
          saveSelectedModels();
        });
        list.append(chip);
      });
    } else if (!notice) {
      const empty = document.createElement("span");
      empty.className = "model-library-empty";
      empty.textContent = "当前站点还没有保存模型。可手动输入，或点击“获取模型”。";
      list.append(empty);
    }
    card.append(title, list);
    el.modelLibrary.append(card);
  }
  function applyActiveSiteToInputs() {
    const site = getActiveSite();
    const rotationMode = Boolean(state.config.rotation && state.config.rotation.enabled);
    state.config.activeSiteId = site.id;
    renderSiteOptions();
    el.siteName.value = site.name;
    el.baseUrl.value = site.baseUrl;
    el.apiKey.value = site.apiKey;
    el.useProxy.checked = Boolean(site.useProxy);
    if (el.siteConcurrency) {
      el.siteConcurrency.value = clampConcurrencyValue(site.concurrency);
    }
    if (el.responsesToolChoice) el.responsesToolChoice.value = normalizeResponsesToolChoice(site.responsesToolChoice);
    setRotationToggleState(rotationMode);
    if (el.siteRotationEnabled) el.siteRotationEnabled.checked = site.rotationEnabled === true;
    groups.generate.api.value = normalizeApiMode(site.apiModes.generate);
    groups.image.api.value = normalizeApiMode(site.apiModes.image);
    groups.edit.api.value = normalizeApiMode(site.apiModes.edit);
    state.preferredModels = createSelectedModels(normalizeSelectedModel(site));
    renderModelOptions(site.models || []);
    if (!rotationMode) applyParameterSettings(site.parameters);
    renderModelLibrary();
  }
  function persistActiveSiteFromInputs(options = {}) {
    const saveParameters = options.saveParameters !== false;
    const site = getActiveSite();
    site.name = el.siteName.value.trim() || DEFAULT_SETTINGS.siteName;
    site.baseUrl = readBaseUrl();
    site.apiKey = el.apiKey.value.trim();
    site.useProxy = shouldUseProxy();
    site.concurrency = readConcurrencyLimit();
    site.responsesToolChoice = el.responsesToolChoice ? normalizeResponsesToolChoice(el.responsesToolChoice.value) : DEFAULT_SETTINGS.responsesToolChoice;
    site.rotationEnabled = el.siteRotationEnabled ? el.siteRotationEnabled.checked : site.rotationEnabled === true;
    state.config.rotation = window.ImageToolRotation.normalizeRotation({
      ...(state.config.rotation || {}),
      enabled: isRotationMode(),
    });
    site.endpoints = {
      generation: DEFAULT_SETTINGS.generationEndpoint,
      edit: DEFAULT_SETTINGS.editEndpoint,
      responses: DEFAULT_SETTINGS.responsesEndpoint,
      models: DEFAULT_SETTINGS.modelsEndpoint,
    };
    site.apiModes = {
      generate: groups.generate.api.value || DEFAULT_SETTINGS.generateApi,
      image: groups.image.api.value || DEFAULT_SETTINGS.imageApi,
      edit: groups.edit.api.value || DEFAULT_SETTINGS.editApi,
    };
    syncPreferredModelsFromInputs();
    site.selectedModel = getUnifiedPreferredModel();
    site.selectedModels = { ...state.preferredModels };
    if (saveParameters) {
      site.parameters = readParameterSettings();
    }
    if (state.modelsReady) {
      site.models = [...state.detectedModels];
    } else {
      site.models = Array.isArray(site.models) ? site.models : [];
    }
  }
  function isRotationMode() {
    return Array.from(el.rotationToggles || []).some((toggle) => toggle.checked);
  }
  function setRotationToggleState(checked) {
    Array.from(el.rotationToggles || []).forEach((toggle) => {
      toggle.checked = Boolean(checked);
    });
  }
  function readParameterSettings() {
    const settings = {};
    MODE_NAMES.forEach((mode) => {
      const group = groups[mode];
      settings[mode] = {
        size: group.size.value,
        quality: group.quality.value,
        format: group.format.value,
        moderation: group.moderation.value,
        compression: String(clampCompressionValue(group.compression.value)),
        quantity: String(clampQuantityValue(group.quantity.value)),
      };
      if (group.action) {
        settings[mode].action = group.action.value;
      }
    });
    return normalizeParameterSettings(settings);
  }
  function applyParameterSettings(parameters) {
    const settings = normalizeParameterSettings(parameters);
    MODE_NAMES.forEach((mode) => {
      const group = groups[mode];
      const values = settings[mode];
      setSizeValue(group, values.size);
      setSelectValue(group.quality, values.quality);
      setSelectValue(group.format, values.format);
      setSelectValue(group.moderation, values.moderation);
      group.compression.value = clampCompressionValue(values.compression);
      group.quantity.value = clampQuantityValue(values.quantity);
      if (group.action) {
        setSelectValue(group.action, values.action);
      }
    });
    updateAllCompressionStates();
  }
  function saveParameterSettings() {
    if (isRotationMode()) {
      return;
    }
    const site = getActiveSite();
    site.parameters = readParameterSettings();
    saveConfig();
  }
  function setSelectValue(control, value) {
    if (!control) {
      return;
    }
    if (control.tagName !== "SELECT" || canSetControlValue(control, value)) {
      control.value = value;
    }
  }
  function applyUiSettings() {
    const ui = state.config && state.config.ui || normalizeUiSettings();
    state.applyingUi = true;
    state.galleryFilter = {
      category: ui.galleryFilters.category || "all",
      resolution: ui.galleryFilters.resolution || "all",
      ratio: ui.galleryFilters.ratio || "all",
    };
    if (el.modelLibraryDetails) {
      el.modelLibraryDetails.open = Boolean(ui.modelLibraryOpen);
    }
    state.applyingUi = false;
  }
  function buildEndpointUrl(type, siteContext = null) {
    const endpoint = readEndpointValue(type, siteContext);
    if (/^https?:\/\//i.test(endpoint)) {
      return endpoint;
    }
    const baseUrl = siteContext && siteContext.baseUrl || readBaseUrl();
    return `${baseUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
  }
  function readBaseUrl() {
    return (el.baseUrl.value.trim() || DEFAULT_SETTINGS.baseUrl).replace(/\/+$/, "");
  }
  function readEndpointValue(type, siteContext = null) {
    const endpointMap = {
      generation: DEFAULT_SETTINGS.generationEndpoint,
      edit: DEFAULT_SETTINGS.editEndpoint,
      responses: DEFAULT_SETTINGS.responsesEndpoint,
      models: DEFAULT_SETTINGS.modelsEndpoint,
    };
    if (siteContext && siteContext.endpoints && siteContext.endpoints[type]) {
      return siteContext.endpoints[type];
    }
    return endpointMap[type] || DEFAULT_SETTINGS.generationEndpoint;
  }
  function cancelGalleryTask(item) {
    const data = item && item.galleryData;
    const targets = data && data.isBatch && Array.isArray(data.batchItems) ? data.batchItems : [item];
    targets.filter(Boolean).forEach(cancelTaskItem);
    processTaskQueue();
    syncGalleryLazyState();
  }
  function cancelTaskItem(item) {
    const queuedIndex = state.taskQueue.findIndex((task) => task.item === item);
    if (queuedIndex >= 0) {
      const [task] = state.taskQueue.splice(queuedIndex, 1);
      appendLog("任务已取消。", true, task);
      updateGalleryItemData(task.item, { taskStatus: "failed", actualSize: "已停止", sizeNote: "已停止", errorText: "任务已取消。" });
      return;
    }
    const task = Array.from(state.activeTasks).find((active) => active.item === item);
    if (task && task.controller) task.controller.abort();
  }
  window.ImageToolApp = {
    cancelGalleryTask,
    getConfig() { return state.config; },
    updateRotationConfig(mutator) { persistActiveSiteFromInputs({ saveParameters: false }); if (typeof mutator === "function") mutator(state.config); saveConfig(); applyActiveSiteToInputs(); processTaskQueue(); return state.config; },
    handleGalleryItemsDeleted(items = []) { Array.from(items).forEach((item) => { if (item && item.dataset) state.gallerySignatures.delete(item.dataset.signature || ""); if (item && item.galleryData && item.galleryData.updateTimer) window.clearTimeout(item.galleryData.updateTimer); }); renderGalleryFilters(); applyGalleryFilters(); },
  };
  window.addEventListener("beforeunload", () => {
    for (const urls of state.previewUrls.values()) {
      urls.forEach((url) => URL.revokeObjectURL(url));
    }
  });
  void init();
})();

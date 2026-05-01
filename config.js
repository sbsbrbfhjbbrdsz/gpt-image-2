// 图片生成工具的静态配置与默认参数。
(() => {
  const DEFAULT_SETTINGS = {
    siteName: "张元英才是五女一",
    baseUrl: "",
    generationEndpoint: "/images/generations",
    editEndpoint: "/images/edits",
    responsesEndpoint: "/responses",
    modelsEndpoint: "/models",
    imageModel: "gpt-image-2",
    responsesModel: "gpt-5.4",
    generateApi: "image",
    imageApi: "image",
    editApi: "image",
    responsesToolChoice: "image_generation",
    useProxy: true,
    concurrency: 1,
  };
  const CONFIG_STORAGE_KEY = "vibeapi-image-tool-config";
  const MODE_NAMES = ["generate", "image", "edit", "responses"];
  const SIZE_RULES = { maxEdge: 3840, step: 16, maxRatio: 3, minPixels: 655360, maxPixels: 8294400 };
  const SIZE_LEVELS = ["1K", "2K", "4K"];
  const SIZE_RATIOS = ["1:1", "3:2", "2:3", "16:9", "9:16", "4:3", "3:4", "21:9"];
  const SIZE_MATRIX = {
    "1K": {
      "1:1": "1024x1024",
      "3:2": "1536x1024",
      "2:3": "1024x1536",
      "16:9": "1792x1008",
      "9:16": "1008x1792",
      "4:3": "1344x1008",
      "3:4": "1008x1344",
      "21:9": "2352x1008",
    },
    "2K": {
      "1:1": "2048x2048",
      "3:2": "2160x1440",
      "2:3": "1440x2160",
      "16:9": "2560x1440",
      "9:16": "1440x2560",
      "4:3": "1920x1440",
      "3:4": "1440x1920",
      "21:9": "3360x1440",
    },
    "4K": {
      "1:1": "2880x2880",
      "3:2": "3504x2336",
      "2:3": "2336x3504",
      "16:9": "3840x2160",
      "9:16": "2160x3840",
      "4:3": "3264x2448",
      "3:4": "2448x3264",
      "21:9": "3808x1632",
    },
  };
  const LEGACY_SIZE_OPTIONS = ["auto", "2048x1152", "1152x2048"];
  const DEFAULT_PARAMETERS = {
    generate: { size: "auto", quality: "auto", format: "png", moderation: "auto", compression: "0", quantity: "1" },
    image: { size: "auto", quality: "auto", format: "png", moderation: "auto", compression: "0", quantity: "1" },
    edit: { size: "auto", quality: "auto", format: "png", moderation: "auto", compression: "0", quantity: "1" },
    responses: { action: "auto", size: "auto", quality: "auto", format: "png", moderation: "auto", compression: "0", quantity: "1" },
  };
  window.ImageToolConfig = { DEFAULT_SETTINGS, CONFIG_STORAGE_KEY, MODE_NAMES, SIZE_RULES, SIZE_LEVELS, SIZE_RATIOS, SIZE_MATRIX, LEGACY_SIZE_OPTIONS, DEFAULT_PARAMETERS };
})();

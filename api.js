// 图片生成工具的请求、流式响应与图片数据解析逻辑。
(() => {
  function createApi(ctx) {
    const { state, groups, appendLog, appendStatusLog, showImage, updateGalleryItemData, shouldUseProxy, normalizeErrorPayload } = ctx;
  const writeStatus = typeof appendStatusLog === "function" ? appendStatusLog : appendLog;
  function buildRequest(targetUrl, options = {}, useProxy = shouldUseProxy()) {
    if (!useProxy) {
      return { url: targetUrl, options };
    }
    if (window.location.protocol === "file:") {
      throw new Error("本地代理需要通过 server.js 打开页面，不能直接用 file:// 打开。");
    }
    const headers = new Headers(options.headers || {});
    headers.set("X-Target-Url", targetUrl);
    return {
      url: `${window.location.origin}/api/proxy`,
      options: {
        ...options,
        headers,
      },
    };
  }
  function formatRequestLog(label, request, targetUrl, options = {}) {
    const method = options.method || "GET";
    const proxied = request.url !== targetUrl;
    const lines = [
      `${label}: ${method} ${redactUrl(targetUrl)}`,
      `代理: ${proxied ? "开启" : "关闭"}`,
    ];
    if (proxied) {
      lines.push(`本地代理: ${method} ${redactUrl(request.url)}`);
    }
    lines.push(`请求体: ${formatBodySummary(options.body)}`);
    return lines.join("\n");
  }
  function formatBodySummary(body) {
    if (!body) {
      return "无";
    }
    if (typeof body === "string") {
      try {
        return summarizeJsonBody(JSON.parse(body));
      } catch {
        return `文本 ${body.length} 字符`;
      }
    }
    if (typeof FormData !== "undefined" && body instanceof FormData) {
      const fields = [];
      let files = 0;
      let promptLength = 0;
      for (const [key, value] of body.entries()) {
        if (isFileLike(value)) {
          files += 1;
        } else if (key === "prompt" && typeof value === "string") {
          promptLength = value.length;
        } else {
          fields.push(key);
        }
      }
      return `FormData · 文件 ${files} 个 · 提示词 ${promptLength} 字 · 字段 ${fields.join(", ") || "无"}`;
    }
    return "二进制或未知格式";
  }
  function summarizeJsonBody(body) {
    if (!body || typeof body !== "object") {
      return "JSON";
    }
    const tool = Array.isArray(body.tools) ? body.tools[0] : null;
    const input = summarizeResponsesInput(body.input);
    const parts = [
      `JSON · model=${body.model || "未设置"}`,
      `stream=${Boolean(body.stream)}`,
      `input=${input}`,
    ];
    if (tool) {
      parts.push(`tool=${tool.type || "unknown"}/${tool.action || "auto"}`);
      parts.push(`size=${tool.size || "auto"}`);
      parts.push(`quality=${tool.quality || "auto"}`);
      parts.push(`format=${tool.output_format || "auto"}`);
    }
    return parts.join(" · ");
  }
  function formatResponsesBodyLog(body) {
    const tool = Array.isArray(body.tools) ? body.tools[0] : {};
    return [
      `模型: ${body.model}`,
      `工具: ${tool.type || "未设置"} · action=${tool.action || "auto"} · partial_images=${tool.partial_images || 0}`,
      `参数: size=${tool.size || "auto"} · quality=${tool.quality || "auto"} · format=${tool.output_format || "auto"} · moderation=${tool.moderation || "auto"} · compression=${tool.output_compression ?? "n/a"}`,
      `输入: ${summarizeResponsesInput(body.input)}`,
      `tool_choice: ${summarizeToolChoice(body.tool_choice)}`,
    ].join("\n");
  }
  function summarizeToolChoice(toolChoice) {
    if (!toolChoice) {
      return "未设置";
    }
    if (typeof toolChoice === "string") {
      return toolChoice;
    }
    return toolChoice.type || JSON.stringify(toolChoice);
  }
  function summarizeResponsesInput(input) {
    if (typeof input === "string") {
      return `文本 ${input.length} 字`;
    }
    const summary = { textLength: 0, images: 0, messages: 0 };
    countInputParts(input, summary);
    return `消息 ${summary.messages} 条 · 文本 ${summary.textLength} 字 · 图片 ${summary.images} 张`;
  }
  function countInputParts(value, summary) {
    if (!value || typeof value !== "object") {
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => countInputParts(item, summary));
      return;
    }
    if (value.role && Array.isArray(value.content)) {
      summary.messages += 1;
    }
    if (value.type === "input_text" && typeof value.text === "string") {
      summary.textLength += value.text.length;
    }
    if (value.type === "input_image" || typeof value.image_url === "string") {
      summary.images += 1;
    }
    Object.values(value).forEach((child) => countInputParts(child, summary));
  }
  function formatResponseLog(response) {
    const lines = [
      `响应: HTTP ${response.status} ${response.statusText || ""}`.trim(),
      `content-type: ${response.headers.get("content-type") || "未返回"}`,
    ];
    const requestId = response.headers.get("x-request-id") || response.headers.get("request-id");
    if (requestId) {
      lines.push(`request-id: ${requestId}`);
    }
    const proxyTarget = response.headers.get("x-proxy-target-url");
    if (proxyTarget) {
      lines.push(`proxy-target: ${redactUrl(proxyTarget)}`);
    }
    return lines.join("\n");
  }
  function redactUrl(url) {
    try {
      const parsed = new URL(url, window.location.href);
      for (const key of parsed.searchParams.keys()) {
        if (/key|token|secret|password|authorization/i.test(key)) {
          parsed.searchParams.set(key, "***");
        }
      }
      return parsed.toString();
    } catch {
      return String(url).replace(/(key|token|secret|password|authorization)=([^&\s]+)/gi, "$1=***");
    }
  }
  function isFileLike(value) {
    return (typeof File !== "undefined" && value instanceof File)
      || (typeof Blob !== "undefined" && value instanceof Blob);
  }
  async function requestJson(url, options, useProxy = shouldUseProxy(), task = null) {
    const request = buildRequest(url, options, useProxy);
    appendLog(formatRequestLog("HTTP 请求", request, url, options), false, task);
    const response = await fetch(request.url, request.options);
    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json") ? await response.json() : await response.text();
    appendLog(formatResponseLog(response), false, task);
    if (!response.ok) {
      throw new Error(normalizeErrorPayload(payload, response.status));
    }
    return payload;
  }
  async function requestResponsesStream(key, body, signal, targetUrl, useProxy = shouldUseProxy(), task = null) {
    const request = buildRequest(targetUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
    }, useProxy);
    const startedAt = performance.now();
    appendLog(formatRequestLog("Responses 流式请求", request, targetUrl, request.options), false, task);
    appendLog(formatResponsesBodyLog(body), false, task);
    writeStatus(`连接 Responses · ${body.model} · ${Array.isArray(body.tools) && body.tools[0] && body.tools[0].size || "auto"}`);
    const response = await fetch(request.url, request.options);
    appendLog(formatResponseLog(response), false, task);
    if (!response.ok) {
      const payload = await readResponsePayload(response);
      throw new Error(normalizeErrorPayload(payload, response.status));
    }
    writeStatus(`连接成功 · HTTP ${response.status}`);
    if (!response.body) {
      throw new Error("浏览器不支持读取流式响应。");
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    const stats = {
      chunks: 0,
      bytes: 0,
      events: 0,
      images: 0,
      partialImages: 0,
      finalImages: 0,
      error: "",
      requestedSize: Array.isArray(body.tools) && body.tools[0] ? body.tools[0].size : "",
      outputFormat: Array.isArray(body.tools) && body.tools[0] ? body.tools[0].output_format : "",
      quality: Array.isArray(body.tools) && body.tools[0] ? body.tools[0].quality : "",
      types: new Map(),
    };
    let buffer = "";
    let gotImage = false;
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      stats.chunks += 1;
      stats.bytes += value.byteLength;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split(/\r?\n\r?\n/);
      buffer = parts.pop() || "";
      for (const part of parts) {
        const events = parseStreamPart(part);
        for (const event of events) {
          const imageReceived = handleStreamEvent(event, stats, task);
          gotImage = gotImage || imageReceived;
        }
      }
    }
    if (buffer.trim()) {
      const events = parseStreamPart(buffer);
      for (const event of events) {
        gotImage = handleStreamEvent(event, stats, task) || gotImage;
      }
    }
    appendLog(formatStreamSummary(stats, gotImage, performance.now() - startedAt), Boolean(stats.error) || !gotImage, task);
    writeStatus(formatCompactStreamSummary(stats, gotImage, performance.now() - startedAt), Boolean(stats.error) || !gotImage || (stats.partialImages > 0 && stats.finalImages === 0));
    if (stats.error || !gotImage) {
      throw new Error(stats.error || "流式请求完成，但未收到图片数据。");
    }
  }
  async function readResponsePayload(response) {
    const contentType = response.headers.get("content-type") || "";
    return contentType.includes("application/json") ? response.json() : response.text();
  }
  function parseStreamPart(part) {
    const trimmed = part.trim();
    if (!trimmed || trimmed === "[DONE]") {
      return [];
    }
    const lines = trimmed.split(/\r?\n/);
    if (lines.every((line) => !line.trim() || line.trim().startsWith(":"))) {
      return [];
    }
    if (lines.some((line) => line.startsWith("data:"))) {
      const event = parseSsePart(part);
      return event ? [event] : [];
    }
    if (lines.length > 1 && lines.every((line) => isJsonStreamLine(line.trim()))) {
      return lines.flatMap((line) => {
        const event = parseJsonPayload(line.trim());
        return event ? [event] : [];
      });
    }
    const event = parseJsonPayload(trimmed);
    return event ? [event] : [];
  }
  function isJsonStreamLine(line) {
    return !line || line === "[DONE]" || line.startsWith("{") || line.startsWith("[");
  }
  function parseSsePart(part) {
    const dataLines = [];
    for (const line of part.split(/\r?\n/)) {
      if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trimStart());
      } else if (line.trim().startsWith("{")) {
        dataLines.push(line.trim());
      }
    }
    const data = dataLines.join("\n").trim();
    if (!data || data === "[DONE]") {
      return null;
    }
    return parseJsonPayload(data);
  }
  function parseJsonPayload(data) {
    if (!data || data === "[DONE]") {
      return null;
    }
    if (data.split(/\r?\n/).every((line) => !line.trim() || line.trim().startsWith(":"))) {
      return null;
    }
    try {
      return JSON.parse(data);
    } catch {
      appendLog(`收到非 JSON 流事件：${data.slice(0, 240)}`, true);
      return null;
    }
  }
  function handleStreamEvent(event, stats = null, task = null) {
    const type = readEventType(event);
    if (stats) {
      stats.events += 1;
      stats.types.set(type || "无类型", (stats.types.get(type || "无类型") || 0) + 1);
      appendTaskLogOnly(`事件 #${stats.events}: ${type || "无类型"} · keys=${Object.keys(event).slice(0, 8).join(", ") || "无"}`, task);
    } else if (type) {
      appendLog(`事件: ${type}`);
    }
    if (type === "error" || event.error) {
      const message = formatStreamError(event);
      if (stats) {
        stats.error = message;
      }
      markTaskProgress(task);
      appendLog(message, true, task);
      return false;
    }
    const image = readStreamImage(event);
    if (image) {
      const isPartial = Boolean(image.source && image.source.includes("partial_image_b64"));
      if (stats) {
        stats.images += 1;
        if (isPartial) {
          stats.partialImages += 1;
        } else {
          stats.finalImages += 1;
        }
      }
      const format = image.format || stats && stats.outputFormat || groups.responses.format.value;
      const size = image.size || stats && stats.requestedSize || groups.responses.size.value;
      const quality = image.quality || stats && stats.quality || groups.responses.quality.value;
      appendLog(`已解析${isPartial ? "预览图" : "最终图"} #${stats ? stats.images : 1}: ${image.source || "未知字段"} · ${format} · ${estimateBase64Size(image.base64)}`, false, task);
      markTaskProgress(task, { previewReceived: isPartial || undefined, finalReceived: !isPartial || undefined });
      if (!isPartial) {
        writeStatus(`收到最终图 · ${size}`);
      }
      showImage(image.base64, format, `${isPartial ? "Responses 预览" : "Responses 完成"} · ${size} · ${quality}`, stats && stats.requestedSize, !isPartial, task);
    }
    const revised = readRevisedPrompt(event);
    if (revised) {
      const targetTask = task || state.activeTask;
      state.currentRevisedPrompt = revised;
      if (targetTask && targetTask.item) {
        updateGalleryItemData(targetTask.item, { revisedPrompt: revised });
      }
      markTaskProgress(task);
      appendTaskLogOnly(`已收到优化/输出文本: ${revised.length} 字`, task);
    } else if (type === "response.output_text.done") {
      appendTaskLogOnly("输出文本事件为空：上游没有返回优化后的提示词。", task);
    }
    if (type === "response.completed" || type === "response.failed") {
      markTaskProgress(task);
    }
    return Boolean(image);
  }
  function markTaskProgress(task, patch = {}) {
    if (task && task.item) {
      updateGalleryItemData(task.item, { lastProgressAt: Date.now(), ...patch });
    }
  }
  function readEventType(event) {
    return event.type || (event.data && event.data.type) || "";
  }
  function readStreamImage(event) {
    return findImagePayload(event, {
      format: event.output_format,
      size: event.size,
      quality: event.quality,
      imageContext: isImageOutputType(readEventType(event)),
    });
  }
  function findImagePayload(value, inherited = {}, seen = new WeakSet(), path = "event") {
    if (!value || typeof value !== "object") {
      return null;
    }
    if (seen.has(value)) {
      return null;
    }
    seen.add(value);
    const type = typeof value.type === "string" ? value.type : inherited.type || "";
    const context = {
      type,
      imageContext: inherited.imageContext || isImageOutputType(type),
      format: normalizeImageFormat(value.output_format || value.format || value.mime_type || inherited.format),
      size: value.size || inherited.size,
      quality: value.quality || inherited.quality,
    };
    for (const key of ["partial_image_b64", "b64_json", "image_b64", "image_base64", "base64_json"]) {
      const image = normalizeImageData(value[key]);
      if (image) {
        return { ...context, ...image, source: `${path}.${key}` };
      }
    }
    if (context.imageContext) {
      for (const key of ["result", "image", "image_data", "image_url", "url"]) {
        const image = normalizeImageData(value[key]);
        if (image) {
          return { ...context, ...image, source: `${path}.${key}` };
        }
      }
    }
    for (const [key, child] of Object.entries(value)) {
      if (Array.isArray(child)) {
        for (const [index, item] of child.entries()) {
          const image = findImagePayload(item, context, seen, `${path}.${key}[${index}]`);
          if (image) {
            return image;
          }
        }
        continue;
      }
      const image = findImagePayload(child, context, seen, `${path}.${key}`);
      if (image) {
        return image;
      }
    }
    return null;
  }
  function isImageOutputType(type) {
    return /image_generation|image_edit|image_generation_call|output_image/i.test(type || "");
  }
  function normalizeImageData(value) {
    if (typeof value !== "string") {
      return null;
    }
    const text = value.trim();
    const dataUrl = text.match(/^data:image\/([a-z0-9.+-]+);base64,(.+)$/i);
    if (dataUrl) {
      return {
        base64: dataUrl[2].replace(/\s+/g, ""),
        format: normalizeImageFormat(dataUrl[1]),
      };
    }
    const compact = text.replace(/\s+/g, "");
    if (compact.length < 80 || !/^[a-z0-9+/=_-]+$/i.test(compact)) {
      return null;
    }
    return { base64: compact };
  }
  function normalizeImageFormat(format) {
    if (!format) {
      return "";
    }
    const value = String(format).toLowerCase().replace(/^image\//, "");
    return value === "jpg" ? "jpeg" : value;
  }
  function estimateBase64Size(base64) {
    const bytes = Math.max(0, Math.floor(base64.replace(/=+$/, "").length * 0.75));
    if (bytes >= 1024 * 1024) {
      return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
    }
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  function formatStreamError(event) {
    const error = event.error || event.response && event.response.error || {};
    if (typeof error === "string") {
      return `流式错误: ${error}`;
    }
    const parts = [];
    if (error.message) {
      parts.push(error.message);
    }
    if (error.code) {
      parts.push(`code=${error.code}`);
    }
    if (error.type) {
      parts.push(`type=${error.type}`);
    }
    if (error.param) {
      parts.push(`param=${error.param}`);
    }
    return `流式错误: ${parts.join(" · ") || JSON.stringify(event).slice(0, 1200)}`;
  }
  function formatStreamSummary(stats, gotImage, durationMs) {
    const types = Array.from(stats.types.entries())
      .map(([type, count]) => `${type} x${count}`)
      .join(", ") || "无";
    const headline = stats.error
      ? (gotImage ? "流式中断，当前显示的是中途预览图，不是最终结果。" : "流式请求失败，未收到图片数据。")
      : stats.finalImages > 0
        ? "流式生成完成。"
        : stats.partialImages > 0
          ? "只收到中途预览图，未收到最终图片。"
          : "流式请求完成，但未收到图片数据。";
    return [
      headline,
      `耗时: ${(durationMs / 1000).toFixed(1)}s`,
      `数据块: ${stats.chunks} 个 · ${(stats.bytes / 1024).toFixed(1)} KB`,
      `事件: ${stats.events} 个 · 图片: ${stats.images} 张 · 预览 ${stats.partialImages} 张 · 最终 ${stats.finalImages} 张`,
      `事件类型: ${types}`,
      stats.error ? stats.error : "",
    ].join("\n");
  }
  function formatCompactStreamSummary(stats, gotImage, durationMs) {
    if (stats.error) {
      return `${gotImage ? "流式中断" : "流式失败"} · ${(durationMs / 1000).toFixed(1)}s\n${stats.error}`;
    }
    if (stats.finalImages > 0) {
      return `生成完成 · ${(durationMs / 1000).toFixed(1)}s · 最终 ${stats.finalImages} 张`;
    }
    if (stats.partialImages > 0) {
      return `只收到预览图 · ${(durationMs / 1000).toFixed(1)}s`;
    }
    return `未收到图片 · ${(durationMs / 1000).toFixed(1)}s`;
  }
  function appendTaskLogOnly(message, task = null) {
    task = task || state && state.activeTask;
    if (!task || !task.item || !task.item.galleryData) {
      return;
    }
    const time = new Date().toLocaleTimeString("zh-CN", { hour12: false });
    const lines = String(message).split(/\r?\n/);
    const [first, ...rest] = lines;
    const entry = [`[${time}] ${first}`, ...rest.map((line) => `  ${line}`)].join("\n");
    task.logs.push(entry);
    task.item.galleryData.logs = task.logs.slice(-700);
  }
  function readImageBase64(payload, task = null) {
    const image = payload && payload.data && payload.data[0] && payload.data[0].b64_json;
    if (!image) {
      throw new Error("接口返回中没有 data[0].b64_json。");
    }
    appendLog(`已解析图片: data[0].b64_json · ${estimateBase64Size(image)}`, false, task);
    return image;
  }
  function readRevisedPrompt(event) {
    return event.revised_prompt
      || (event.item && event.item.revised_prompt)
      || (event.output_item && event.output_item.revised_prompt)
      || (event.response && event.response.revised_prompt)
      || readStreamOutputText(event)
      || "";
  }
  function readStreamOutputText(event) {
    const type = readEventType(event);
    if (type === "response.output_text.done" && typeof event.text === "string") {
      return event.text.trim();
    }
    return readMessageText(event.item) || readResponseText(event.response);
  }
  function readResponseText(response) {
    if (!response || !Array.isArray(response.output)) {
      return "";
    }
    return response.output.map(readMessageText).filter(Boolean).join("\n");
  }
  function readMessageText(item) {
    if (!item || item.type !== "message" || !Array.isArray(item.content)) {
      return "";
    }
    return item.content
      .map((part) => typeof part.text === "string" ? part.text.trim() : "")
      .filter(Boolean)
      .join("\n");
  }
  async function buildResponsesInput(prompt, files) {
    const content = [{ type: "input_text", text: prompt }];
    const images = await Promise.all(files.map(fileToDataUrl));
    images.forEach((imageUrl) => {
      content.push({ type: "input_image", image_url: imageUrl });
    });
    return [{ role: "user", content }];
  }
  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(reader.result));
      reader.addEventListener("error", () => reject(reader.error || new Error("读取图片失败。")));
      reader.readAsDataURL(file);
    });
  }
    return { requestJson, requestResponsesStream, readImageBase64, buildResponsesInput };
  }
  window.ImageToolApi = { createApi };
})();

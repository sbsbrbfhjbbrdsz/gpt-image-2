// 本地静态页面与 API 代理服务。
const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = __dirname;
const CONFIG_PATH = path.join(ROOT, "sites.config.json");
const GALLERY_DIR = path.join(ROOT, "gallery");
const GALLERY_INDEX_DIR = path.join(GALLERY_DIR, "index");
const GALLERY_INDEX_SHARD_SIZE = 100;
const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 1024);
let galleryIndexWriteQueue = Promise.resolve();

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

const server = http.createServer((request, response) => {
  const pathname = readPathname(request);
  if (pathname === "/api/proxy") {
    proxyRequest(request, response);
    return;
  }
  if (pathname === "/api/config") {
    handleConfigRequest(request, response);
    return;
  }
  if (pathname === "/api/gallery") {
    handleGalleryRequest(request, response);
    return;
  }
  if (pathname === "/favicon.ico") {
    response.writeHead(204, { "Cache-Control": "no-store" });
    response.end();
    return;
  }
  serveStatic(pathname, response);
});

server.listen(PORT, HOST, () => {
  console.log(`VibeAPI image tool: http://${HOST}:${PORT}/`);
});

function readPathname(request) {
  try {
    return new URL(request.url, `http://${request.headers.host || HOST}`).pathname;
  } catch {
    return "/";
  }
}

function serveStatic(pathname, response) {
  const cleanPath = pathname === "/" ? "/index.html" : pathname;
  let filePath;
  try {
    filePath = path.resolve(ROOT, `.${decodeURIComponent(cleanPath)}`);
  } catch {
    sendText(response, 400, "Bad request");
    return;
  }

  if (!isInsideRoot(filePath)) {
    sendText(response, 403, "Forbidden");
    return;
  }

  fs.stat(filePath, (statError, stat) => {
    if (statError || !stat.isFile()) {
      sendText(response, 404, "File not found");
      return;
    }

    const stream = fs.createReadStream(filePath);
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    stream.pipe(response);
    stream.on("error", () => response.destroy());
  });
}

function proxyRequest(clientRequest, clientResponse) {
  const target = clientRequest.headers["x-target-url"];
  const targetUrl = Array.isArray(target) ? target[0] : target;

  if (!targetUrl) {
    sendJson(clientResponse, 400, { error: { message: "Missing X-Target-Url header" } });
    clientRequest.resume();
    return;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(targetUrl);
  } catch {
    sendJson(clientResponse, 400, { error: { message: "Invalid target URL" } });
    clientRequest.resume();
    return;
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    sendJson(clientResponse, 400, { error: { message: "Only http and https targets are allowed" } });
    clientRequest.resume();
    return;
  }

  const headers = buildProxyHeaders(clientRequest.headers, parsedUrl);
  const transport = parsedUrl.protocol === "https:" ? https : http;
  const proxy = transport.request(parsedUrl, {
    method: clientRequest.method,
    headers,
  }, (proxyResponse) => {
    clientResponse.writeHead(proxyResponse.statusCode || 502, {
      ...proxyResponse.headers,
      "x-proxy-target-url": parsedUrl.href,
    });
    proxyResponse.pipe(clientResponse);
  });

  proxy.on("error", (error) => {
    if (!clientResponse.headersSent) {
      sendJson(clientResponse, 502, { error: { message: error.message } });
      return;
    }
    clientResponse.destroy(error);
  });

  clientRequest.pipe(proxy);
}

function handleConfigRequest(request, response) {
  if (request.method === "GET") {
    readConfigFile(response);
    return;
  }

  if (request.method === "POST" || request.method === "PUT") {
    writeConfigFile(request, response);
    return;
  }

  sendJson(response, 405, { error: { message: "Method not allowed" } });
}

function readConfigFile(response) {
  fs.readFile(CONFIG_PATH, "utf8", (error, text) => {
    if (error && error.code === "ENOENT") {
      sendJson(response, 200, null);
      return;
    }

    if (error) {
      sendJson(response, 500, { error: { message: error.message } });
      return;
    }

    try {
      sendJson(response, 200, JSON.parse(text));
    } catch {
      sendJson(response, 200, null);
    }
  });
}

function writeConfigFile(request, response) {
  readBody(request, 1024 * 1024, (error, body) => {
    if (error) {
      sendJson(response, 400, { error: { message: error.message } });
      return;
    }

    let data;
    try {
      data = JSON.parse(body || "null");
    } catch {
      sendJson(response, 400, { error: { message: "Invalid JSON" } });
      return;
    }

    const text = `${JSON.stringify(data, null, 2)}\n`;
    fs.writeFile(CONFIG_PATH, text, "utf8", (writeError) => {
      if (writeError) {
        sendJson(response, 500, { error: { message: writeError.message } });
        return;
      }
      sendJson(response, 200, { ok: true });
    });
  });
}

function handleGalleryRequest(request, response) {
  if (request.method === "GET") {
    readGallery(response);
    return;
  }

  if (request.method === "POST" || request.method === "PUT") {
    writeGalleryItem(request, response);
    return;
  }

  if (request.method === "PATCH") {
    updateGalleryItem(request, response);
    return;
  }

  if (request.method === "DELETE") {
    deleteGalleryItems(request, response);
    return;
  }

  sendJson(response, 405, { error: { message: "Method not allowed" } });
}

function readGallery(response) {
  readGalleryIndex((error, items) => {
    if (error) {
      sendJson(response, 500, { error: { message: error.message } });
      return;
    }
    sendJson(response, 200, { items: normalizeGalleryItems(items) });
  });
}

function writeGalleryItem(request, response) {
  readBody(request, 80 * 1024 * 1024, (error, body) => {
    if (error) {
      sendJson(response, 400, { error: { message: error.message } });
      return;
    }

    let payload;
    try {
      payload = JSON.parse(body || "null");
    } catch {
      sendJson(response, 400, { error: { message: "Invalid JSON" } });
      return;
    }

    const image = parseDataUrl(payload && payload.dataUrl);
    if (!image) {
      sendJson(response, 400, { error: { message: "Invalid image data" } });
      return;
    }

    fs.mkdir(GALLERY_DIR, { recursive: true }, (mkdirError) => {
      if (mkdirError) {
        sendJson(response, 500, { error: { message: mkdirError.message } });
        return;
      }

      const id = crypto.randomUUID();
      const fileName = `${Date.now()}-${id}.${image.ext}`;
      const filePath = path.join(GALLERY_DIR, fileName);
      fs.writeFile(filePath, image.buffer, (writeError) => {
        if (writeError) {
          sendJson(response, 500, { error: { message: writeError.message } });
          return;
        }

        readGalleryIndex((indexError, items) => {
          if (indexError) {
            sendJson(response, 500, { error: { message: indexError.message } });
            return;
          }

          const item = normalizeGalleryItem({
            ...(payload.metadata || {}),
            id,
            fileName,
            imageUrl: `/gallery/${fileName}`,
            format: payload.metadata && payload.metadata.format || image.ext,
            savedAt: new Date().toISOString(),
          });
          writeGalleryItemIndex(item, items, (saveError) => {
            if (saveError) {
              sendJson(response, 500, { error: { message: saveError.message } });
              return;
            }
            sendJson(response, 200, { ok: true, item });
          });
        });
      });
    });
  });
}

function updateGalleryItem(request, response) {
  readBody(request, 1024 * 1024, (error, body) => {
    if (error) {
      sendJson(response, 400, { error: { message: error.message } });
      return;
    }

    let payload;
    try {
      payload = JSON.parse(body || "null");
    } catch {
      sendJson(response, 400, { error: { message: "Invalid JSON" } });
      return;
    }

    const id = payload && String(payload.id || "");
    if (!id) {
      sendJson(response, 400, { error: { message: "Missing gallery item id" } });
      return;
    }

    readGalleryIndex((indexError, items) => {
      if (indexError) {
        sendJson(response, 500, { error: { message: indexError.message } });
        return;
      }

      const index = items.findIndex((item) => String(item.id) === id);
      if (index < 0) {
        sendJson(response, 404, { error: { message: "Gallery item not found" } });
        return;
      }

      const item = normalizeGalleryItem({
        ...items[index],
        ...(payload.metadata || {}),
        id,
        fileName: items[index].fileName,
        imageUrl: items[index].imageUrl,
      });
      items[index] = item;
      writeGalleryItemShard(item, (saveError) => {
        if (saveError) {
          sendJson(response, 500, { error: { message: saveError.message } });
          return;
        }
        sendJson(response, 200, { ok: true, item });
      });
    });
  });
}

function deleteGalleryItems(request, response) {
  readBody(request, 1024 * 1024, (error, body) => {
    if (error) {
      sendJson(response, 400, { error: { message: error.message } });
      return;
    }

    const ids = readDeleteGalleryIds(request, body);
    if (ids.length === 0) {
      clearGallery(response);
      return;
    }

    readGalleryIndex((indexError, items) => {
      if (indexError) {
        sendJson(response, 500, { error: { message: indexError.message } });
        return;
      }

      const targets = new Set(ids);
      const deleted = [];
      const remaining = [];
      items.forEach((item) => {
        if (targets.has(String(item.id || ""))) {
          deleted.push(item);
          return;
        }
        remaining.push(item);
      });

      const files = deleted.map((item) => item && item.fileName ? path.join(GALLERY_DIR, path.basename(String(item.fileName))) : "").filter(Boolean);
      Promise.all(files.map((filePath) => fs.promises.rm(filePath, { force: true }))).then(() => {
        writeGalleryIndex(remaining, (saveError) => {
          if (saveError) {
            sendJson(response, 500, { error: { message: saveError.message } });
            return;
          }
          sendJson(response, 200, { ok: true, deleted: deleted.length });
        });
      }).catch((removeError) => {
        sendJson(response, 500, { error: { message: removeError.message } });
      });
    });
  });
}

function readDeleteGalleryIds(request, body) {
  const values = [];
  try {
    const parsedUrl = new URL(request.url, `http://${request.headers.host || HOST}`);
    parsedUrl.searchParams.getAll("id").forEach((id) => values.push(id));
    const ids = parsedUrl.searchParams.get("ids");
    if (ids) {
      ids.split(",").forEach((id) => values.push(id));
    }
  } catch {
    // Ignore malformed query strings and fall back to body parsing.
  }

  if (body && body.trim()) {
    try {
      const payload = JSON.parse(body);
      if (Array.isArray(payload && payload.ids)) {
        payload.ids.forEach((id) => values.push(id));
      }
      if (payload && payload.id) {
        values.push(payload.id);
      }
    } catch {
      // Empty or non-JSON DELETE bodies mean "clear all" for the legacy path.
    }
  }

  return Array.from(new Set(values.map((id) => String(id || "").trim()).filter(Boolean)));
}

function clearGallery(response) {
  readGalleryIndex((error, items) => {
    if (error) {
      sendJson(response, 500, { error: { message: error.message } });
      return;
    }

    fs.rm(GALLERY_DIR, { recursive: true, force: true }, (removeError) => {
      if (removeError) {
        sendJson(response, 500, { error: { message: removeError.message } });
        return;
      }
      fs.mkdir(GALLERY_DIR, { recursive: true }, (mkdirError) => {
        if (mkdirError) {
          sendJson(response, 500, { error: { message: mkdirError.message } });
          return;
        }
        writeGalleryIndex([], (writeError) => {
          if (writeError) {
            sendJson(response, 500, { error: { message: writeError.message } });
            return;
          }
          sendJson(response, 200, { ok: true, deleted: items.length });
        });
      });
    });
  });
}

function readGalleryIndex(callback) {
  readGalleryIndexFiles().then((items) => callback(null, items)).catch(callback);
}

function writeGalleryIndex(items, callback) {
  queueGalleryIndexWrite(() => writeGalleryIndexFiles(items)).then(() => callback(null)).catch(callback);
}

function writeGalleryItemIndex(item, currentItems, callback) {
  queueGalleryIndexWrite(() => writeGalleryItemIndexFile(item, currentItems)).then(() => callback(null)).catch(callback);
}

function writeGalleryItemShard(item, callback) {
  queueGalleryIndexWrite(() => updateGalleryItemIndexFile(item)).then(() => callback(null)).catch(callback);
}

function queueGalleryIndexWrite(operation) {
  const run = galleryIndexWriteQueue.then(operation, operation);
  galleryIndexWriteQueue = run.catch(() => {});
  return run;
}

async function readGalleryIndexFiles() {
  const shardFiles = await readGalleryShardNames();
  if (shardFiles.length === 0) {
    return [];
  }
  const chunks = await Promise.all(shardFiles.map(readGalleryShard));
  return sortGalleryItems(chunks.flat());
}

async function writeGalleryIndexFiles(items) {
  const normalized = sortGalleryItemsForStorage(items);
  await fs.promises.mkdir(GALLERY_INDEX_DIR, { recursive: true });
  await clearGalleryShards();
  const chunks = chunkItems(normalized, GALLERY_INDEX_SHARD_SIZE);
  await Promise.all(chunks.map((chunk, index) => {
    return writeGalleryShard(formatGalleryShardName(index + 1), chunk);
  }));
}

async function writeGalleryItemIndexFile(item, currentItems) {
  const normalized = normalizeGalleryItem(item);
  if (!normalized) {
    return;
  }
  const shardFiles = await readGalleryShardNames();
  if (shardFiles.length === 0) {
    await writeGalleryIndexFiles([normalized, ...normalizeGalleryItems(currentItems)]);
    return;
  }
  const lastShard = shardFiles[shardFiles.length - 1];
  const items = await readGalleryShard(lastShard);
  if (items.length >= GALLERY_INDEX_SHARD_SIZE) {
    await writeGalleryShard(formatGalleryShardName(readGalleryShardNumber(lastShard) + 1), [normalized]);
    return;
  }
  items.push(normalized);
  await writeGalleryShard(lastShard, items);
}

async function updateGalleryItemIndexFile(item) {
  const normalized = normalizeGalleryItem(item);
  if (!normalized) {
    return;
  }
  const shardFiles = await readGalleryShardNames();
  if (shardFiles.length === 0) {
    return;
  }
  for (const fileName of shardFiles) {
    const items = await readGalleryShard(fileName);
    const index = items.findIndex((entry) => String(entry.id || "") === normalized.id);
    if (index >= 0) {
      items[index] = normalized;
      await writeGalleryShard(fileName, items);
      return;
    }
  }
}

async function readGalleryShardNames() {
  try {
    const entries = await fs.promises.readdir(GALLERY_INDEX_DIR, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && /^\d{6}\.json$/.test(entry.name))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));
  } catch (error) {
    if (error && error.code !== "ENOENT") {
      throw error;
    }
    return [];
  }
}

async function readGalleryShard(fileName) {
  try {
    const text = await fs.promises.readFile(path.join(GALLERY_INDEX_DIR, path.basename(fileName)), "utf8");
    const parsed = JSON.parse(text);
    return Array.isArray(parsed.items) ? parsed.items : [];
  } catch (error) {
    if (error && error.code !== "ENOENT") {
      throw error;
    }
    return [];
  }
}

async function writeGalleryShard(fileName, items) {
  await fs.promises.mkdir(GALLERY_INDEX_DIR, { recursive: true });
  const text = `${JSON.stringify({ version: 1, items: normalizeGalleryItems(items) }, null, 2)}\n`;
  await fs.promises.writeFile(path.join(GALLERY_INDEX_DIR, path.basename(fileName)), text, "utf8");
}

async function clearGalleryShards() {
  const shardFiles = await readGalleryShardNames();
  await Promise.all(shardFiles.map((fileName) => fs.promises.rm(path.join(GALLERY_INDEX_DIR, fileName), { force: true })));
}

function chunkItems(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function sortGalleryItems(items) {
  return normalizeGalleryItems(items).sort(compareGalleryItems);
}

function sortGalleryItemsForStorage(items) {
  return normalizeGalleryItems(items).sort((left, right) => compareGalleryItems(right, left));
}

function compareGalleryItems(left, right) {
  const leftTime = Date.parse(left.savedAt || "");
  const rightTime = Date.parse(right.savedAt || "");
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
    return rightTime - leftTime;
  }
  return (Number(right.number) || 0) - (Number(left.number) || 0);
}

function formatGalleryShardName(number) {
  return `${Math.max(1, Number(number) || 1).toString().padStart(6, "0")}.json`;
}

function readGalleryShardNumber(fileName) {
  return Math.max(0, Number(String(fileName || "").replace(/\D/g, "")) || 0);
}

function parseDataUrl(dataUrl) {
  if (typeof dataUrl !== "string") {
    return null;
  }
  const match = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,([a-z0-9+/=\r\n]+)$/i);
  if (!match) {
    return null;
  }
  const ext = match[1].toLowerCase() === "jpg" ? "jpeg" : match[1].toLowerCase();
  return {
    ext,
    buffer: Buffer.from(match[2].replace(/\s+/g, ""), "base64"),
  };
}

function normalizeGalleryItems(items) {
  return Array.isArray(items) ? items.map(normalizeGalleryItem).filter(Boolean) : [];
}

function normalizeGalleryItem(item) {
  if (!item || typeof item !== "object") {
    return null;
  }
  const fileName = item.fileName && path.basename(String(item.fileName));
  const imageUrl = item.imageUrl || (fileName ? `/gallery/${fileName}` : "");
  const requestedSize = String(item.requestedSize || "auto");
  const actualSize = String(item.actualSize || "");
  const sizeNote = String(item.sizeNote || "");
  return {
    id: String(item.id || crypto.randomUUID()),
    fileName: fileName || "",
    imageUrl: String(imageUrl),
    number: Number(item.number) || 0,
    format: String(item.format || "png"),
    meta: String(item.meta || ""),
    requestedSize,
    actualSize,
    sizeNote,
    mode: String(item.mode || "生成"),
    model: String(item.model || ""),
    siteName: String(item.siteName || ""),
    prompt: String(item.prompt || ""),
    revisedPrompt: String(item.revisedPrompt || ""),
    durationMs: Number(item.durationMs) || 0,
    durationText: String(item.durationText || ""),
    batchId: String(item.batchId || ""),
    batchIndex: Number(item.batchIndex) || 0,
    batchTotal: Number(item.batchTotal) || 0,
    coverIndex: Number(item.coverIndex) || 0,
    categoryIds: normalizeStringArray(item.categoryIds),
    logs: Array.isArray(item.logs) ? item.logs.map(String).slice(-700) : [],
    time: String(item.time || ""),
    savedAt: String(item.savedAt || ""),
  };
}

function normalizeStringArray(value) {
  const seen = new Set();
  return (Array.isArray(value) ? value : []).map((item) => String(item || "").trim()).filter((item) => {
    if (!item || seen.has(item)) {
      return false;
    }
    seen.add(item);
    return true;
  });
}

function readBody(request, limit, callback) {
  let size = 0;
  let done = false;
  const chunks = [];

  function finish(error, body) {
    if (done) {
      return;
    }
    done = true;
    callback(error, body);
  }

  request.on("data", (chunk) => {
    size += chunk.length;
    if (size > limit) {
      finish(new Error("Request body too large"));
      request.destroy();
      return;
    }
    chunks.push(chunk);
  });

  request.on("end", () => {
    finish(null, Buffer.concat(chunks).toString("utf8"));
  });

  request.on("error", (error) => {
    finish(error);
  });
}

function buildProxyHeaders(sourceHeaders, parsedUrl) {
  const headers = { ...sourceHeaders };
  [
    "host",
    "origin",
    "referer",
    "connection",
    "cookie",
    "x-target-url",
    "priority",
    "sec-fetch-dest",
    "sec-fetch-mode",
    "sec-fetch-site",
    "sec-fetch-user",
    "sec-gpc",
  ].forEach((name) => {
    delete headers[name];
  });
  headers.host = parsedUrl.host;
  return headers;
}

function isInsideRoot(filePath) {
  const relative = path.relative(ROOT, filePath);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function sendText(response, status, text) {
  response.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(text);
}

function sendJson(response, status, data) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(data));
}

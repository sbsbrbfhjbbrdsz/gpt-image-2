// 接口错误与失败原因的格式化工具。
(() => {
  function createErrorHelpers({ shouldUseProxy }) {
    function normalizeErrorPayload(payload, status) {
      if (typeof payload === "string") {
        if (isCdnChallengePage(payload, status)) {
          return `HTTP ${status}: 疑似 CDN 拦截，或并发过多冷却中。可以尝试关闭代理。`;
        }
        return `HTTP ${status}: ${summarizeTextError(payload)}`;
      }
      const message = payload && payload.error && (payload.error.message || payload.error.code)
        ? `${payload.error.message || ""}${payload.error.code ? ` (${payload.error.code})` : ""}`
        : JSON.stringify(payload);
      return `HTTP ${status}: ${message}`;
    }

    function summarizeTextError(text) {
      const trimmed = text.trim();
      if (!trimmed) return "空响应";
      if (/^\s*</.test(trimmed)) {
        const title = readHtmlTagText(trimmed, "title");
        const h1 = readHtmlTagText(trimmed, "h1");
        const code = trimmed.match(/Error code\s*([0-9]+)/i);
        return [
          title || h1 || "HTML 错误页",
          code ? `code=${code[1]}` : "",
          `长度 ${trimmed.length} 字符`,
        ].filter(Boolean).join(" · ");
      }
      return trimmed.slice(0, 600);
    }

    function isCdnChallengePage(text, status) {
      return Number(status) === 403 && /Just a moment|Cloudflare|cf-browser-verification|cdn-cgi/i.test(String(text || ""));
    }

    function readHtmlTagText(html, tagName) {
      const match = html.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
      return match ? match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "";
    }

    function formatError(error) {
      if (error instanceof TypeError && String(error.message).includes("fetch")) {
        return shouldUseProxy()
          ? "请求失败。请确认页面是通过 node server.js 打开的，并且本地代理服务仍在运行。"
          : "请求失败。可能是网络异常、浏览器 CORS 限制，或接口未允许当前页面来源；遇到 CORS 时请启用本地代理。";
      }
      const message = error.message || String(error);
      if (/HTTP 524/.test(message)) {
        return `${message}\n建议: 这是 Cloudflare 等待上游超时。Responses 按文档必须走流式；若流式仍超时，请降低尺寸、换站点，或改用 Image 接口。`;
      }
      if (/HTTP 403.*CDN 拦截|Just a moment|Cloudflare|cdn-cgi/i.test(message)) {
        return message;
      }
      if (/HTTP 502/.test(message)) {
        return `${message}\n建议: 这是上游网关错误。可以重试、降低尺寸、换站点，或切回 Image 接口。`;
      }
      return message;
    }

    function explainFailure(message) {
      const text = String(message || "生成失败，未返回具体错误。").trim();
      const lines = [text];
      if (/moderation_blocked|safety system|rejected by the safety/i.test(text)) {
        lines.push("原因: 提示词或图片被安全审核拦截。", "建议: 改写敏感描述，降低人物/暴力/裸露/版权等风险，再重试。");
      } else if (/HTTP 403.*CDN 拦截|Just a moment|Cloudflare|cdn-cgi/i.test(text)) {
        return text;
      } else if (/HTTP 524|timeout|timed out/i.test(text)) {
        lines.push("原因: 请求等待太久，上游或 Cloudflare 超时。", "建议: 降低尺寸，换站点，或改用流式接口重试。");
      } else if (/HTTP 502|Bad Gateway|网关/i.test(text)) {
        lines.push("原因: 中转站或上游网关异常。", "建议: 稍后重试，或切换站点。");
      } else if (/stream_read_error|断流|Failed to fetch|请求失败/i.test(text)) {
        lines.push("原因: 流式连接中断、网络异常或代理不可用。", "建议: 确认本地 1024 服务还在运行，或换站点重试。");
      } else if (/server_error|processing your request/i.test(text)) {
        lines.push("原因: 上游模型生成时内部失败。", "建议: 保留 request-id，降低尺寸或重试。");
      }
      return Array.from(new Set(lines)).join("\n");
    }

    return { normalizeErrorPayload, formatError, explainFailure };
  }

  window.ImageToolErrors = { createErrorHelpers };
})();

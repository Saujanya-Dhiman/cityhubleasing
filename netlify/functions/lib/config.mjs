export const siteUrl = (process.env.SITE_URL || "https://cityhubleasing.netlify.app").replace(/\/$/, "");
export const allowedOrigin = (process.env.ALLOWED_ORIGIN || siteUrl).replace(/\/$/, "");
export const embeddingModel = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
export const assistantName = process.env.ASSISTANT_NAME || "Aria";
export const adminNotifyWebhookUrl = process.env.ADMIN_NOTIFY_WEBHOOK_URL || process.env.WEBHOOK_URL || null;

const openAiKey = process.env.OPENAI_API_KEY || "";
const configuredBase = (process.env.OPENAI_BASE_URL || "").replace(/\/$/, "");
export const usesOpenRouter = Boolean(
  configuredBase.includes("openrouter.ai") ||
  openAiKey.startsWith("sk-or") ||
  /openrouter/i.test(process.env.CHAT_PROVIDER || "")
);

const DEFAULT_OPENROUTER_CHAT_MODEL = "google/gemini-2.0-flash-001";
const DEFAULT_OPENAI_CHAT_MODEL = "gpt-4o-mini";
const OPENROUTER_CHAT_FALLBACKS = [
  "google/gemini-2.0-flash-001",
  "google/gemini-flash-1.5",
  "meta-llama/llama-3.3-70b-instruct",
  "openai/gpt-4o-mini"
];
const OPENAI_CHAT_FALLBACKS = ["gpt-4o-mini", "gpt-4o"];
const DEPRECATED_CHAT_MODEL = /nemotron|nvidia\/nemotron|gemini-2\.5/i;

function apiRoot() {
  return (configuredBase || (usesOpenRouter ? "https://openrouter.ai/api/v1" : "https://api.openai.com/v1")).replace(/\/$/, "");
}

function resolveChatModel(raw) {
  const value = String(raw || "").trim();
  if (usesOpenRouter) {
    if (!value || DEPRECATED_CHAT_MODEL.test(value)) return DEFAULT_OPENROUTER_CHAT_MODEL;
    if (!value.includes("/")) return `openai/${value}`;
    return value;
  }
  return value || DEFAULT_OPENAI_CHAT_MODEL;
}

export const chatApiUrl = `${apiRoot()}/chat/completions`;
export const embeddingApiUrl = `${apiRoot()}/embeddings`;
export const chatModel = resolveChatModel(process.env.OPENAI_CHAT_MODEL);
export const chatModelFallbacks = usesOpenRouter ? OPENROUTER_CHAT_FALLBACKS : OPENAI_CHAT_FALLBACKS;

// OpenRouter often 404/400s official OpenAI embedding model IDs. Skip unless explicitly enabled.
export const embeddingsEnabled = process.env.OPENAI_EMBEDDINGS_ENABLED === "true" || (!usesOpenRouter && Boolean(openAiKey));

export function chatModelsToTry(preferred = chatModel) {
  const preferredResolved = resolveChatModel(preferred);
  return [...new Set([preferredResolved, ...chatModelFallbacks].filter(Boolean))];
}

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers }
  });
}

export function cors(request) {
  const origin = (request.headers.get("origin") || "").replace(/\/$/, "");
  const allowed = new Set(
    [siteUrl, allowedOrigin, ...(process.env.ALLOWED_ORIGIN || "").split(",")]
      .map(value => value.trim().replace(/\/$/, ""))
      .filter(Boolean)
  );
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
  const isNetlifyPreview = /\.netlify\.app$/i.test(origin);
  const allow = !origin || allowed.has(origin) || isLocal || isNetlifyPreview;
  const allowOrigin = origin && allow ? origin : siteUrl;
  return {
    "access-control-allow-origin": allowOrigin,
    "access-control-allow-methods": "GET, POST, PATCH, OPTIONS",
    "access-control-allow-headers": "content-type, authorization",
    "access-control-expose-headers": "X-Lead-State, X-Properties, X-Sources, X-Intent",
    "cache-control": "no-store",
    vary: "Origin"
  };
}

export function chatHeaders() {
  const headers = {
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    "Content-Type": "application/json"
  };
  if (usesOpenRouter || chatApiUrl.includes("openrouter.ai")) {
    headers["HTTP-Referer"] = siteUrl;
    headers["X-Title"] = "CityHub Leasing";
  }
  return headers;
}

export function parseProviderError(payload, status = 0) {
  if (!payload) return status ? `HTTP ${status}` : "Unknown provider error";
  if (typeof payload === "string") {
    try {
      return parseProviderError(JSON.parse(payload), status);
    } catch {
      const trimmed = payload.replace(/\s+/g, " ").trim();
      return trimmed ? `HTTP ${status} ${trimmed.slice(0, 400)}` : `HTTP ${status}`;
    }
  }
  const err = payload.error || payload;
  const message = err.message || err.msg || payload.message || "";
  const code = err.code || err.type || payload.code || "";
  return [status ? `HTTP ${status}` : null, code, message].filter(Boolean).join(" ").slice(0, 500);
}

export function extractChatText(data) {
  if (!data || typeof data !== "object" || data.error) return "";
  const choice = data.choices?.[0];
  const content = choice?.message?.content ?? choice?.delta?.content ?? data.output_text;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content.map(part => (typeof part === "string" ? part : part?.text || "")).join("").trim();
  }
  return "";
}

export function isConfigured() {
  return Boolean(process.env.OPENAI_API_KEY && process.env.FIREBASE_SERVICE_ACCOUNT);
}

export function isChatConfigured() {
  return Boolean(process.env.OPENAI_API_KEY);
}

let csrf = "";
export function setCsrf(value: string) {
  csrf = value;
}
export type AiOptions = { operationId: string; signal: AbortSignal };
type ExportFormat = "pptx" | "pdf" | "html";

function errorText(value: unknown, depth = 0): string | undefined {
  if (depth > 3) return undefined;
  if (typeof value === "string") return value.trim() || undefined;
  if (Array.isArray(value)) return value.slice(0, 8).map(item => errorText(item, depth + 1)).filter(Boolean).join("; ") || undefined;
  if (!value || typeof value !== "object") return undefined;
  const item = value as Record<string, unknown>;
  return errorText(item.message, depth + 1) || errorText(item.msg, depth + 1) || errorText(item.detail, depth + 1);
}
function responseError(response: Response, data: unknown): Error {
  const detail = data && typeof data === "object" ? (data as {detail?: unknown}).detail : undefined;
  const codeValue = detail && typeof detail === "object" ? (detail as {code?: unknown}).code : undefined;
  const code = typeof codeValue === "string" ? codeValue : undefined;
  const fallback = response.status === 401 ? "Войдите снова, чтобы продолжить. Ваш черновик сохранён."
    : response.status === 403 ? "Нет доступа к этому действию."
    : response.status === 429 ? "Слишком много запросов. Подождите немного и повторите попытку."
    : response.status >= 500 ? "Сервер временно недоступен. Повторите попытку чуть позже."
    : "Не удалось выполнить запрос. Повторите попытку.";
  return Object.assign(new Error(code === "AI_CANCELLED" ? "Остановлено" : errorText(detail) || fallback), {status: response.status, code});
}
export function aiRequest<T>(
  path: string,
  options: RequestInit,
  ai?: AiOptions,
) {
  return request<T>(path, {
    ...options,
    signal: ai?.signal,
    headers: {
      ...options.headers,
      ...(ai ? { "X-AI-Operation-ID": ai.operationId } : {}),
    },
  });
}

// В разработке /api проксирует Vite, после сборки фронтенд раздаёт FastAPI.
// Ключ LLM здесь не нужен и никогда не передаётся в браузер.
export async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      credentials: "same-origin",
      headers: {
        ...options.headers,
        ...(csrf ? { "X-CSRF-Token": csrf } : {}),
      },
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new Error(
      "Не удалось связаться с сервером. Проверьте соединение и повторите попытку. Ваши изменения остаются в черновике.",
    );
  }
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith("/auth/"))
      window.dispatchEvent(new Event("session-expired"));
    throw responseError(response, await response.json().catch(() => null));
  }
  if (response.status === 204) return undefined as T;
  try { return await response.json(); }
  catch (error) {
    if (options.signal?.aborted) throw error;
    throw Object.assign(new Error("Сервер вернул неполный ответ. Повторите попытку; ваши изменения остаются в черновике."), {status: response.status, code: "INVALID_RESPONSE"});
  }
}

export async function downloadBlob(path: string, format?: ExportFormat): Promise<Blob> {
  let response: Response;
  try { response = await fetch(path, { credentials: "same-origin" }); }
  catch { throw new Error("Не удалось связаться с сервером. Повторите скачивание."); }
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event("session-expired"));
    throw responseError(response, await response.json().catch(() => null));
  }
  const blob = await response.blob();
  const expected = format || path.match(/\/export\/(pptx|pdf|html)(?:[/?#]|$)/)?.[1];
  if (expected) {
    const mime = blob.type.split(";")[0].toLowerCase();
    const head = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
    const binaryMime = mime === "application/octet-stream";
    let valid = false;
    if (expected === "pptx") valid = (binaryMime || mime === "application/vnd.openxmlformats-officedocument.presentationml.presentation") && head[0] === 0x50 && head[1] === 0x4b && head[2] === 3 && head[3] === 4;
    if (expected === "pdf") valid = (binaryMime || mime === "application/pdf") && new TextDecoder().decode(head).startsWith("%PDF-");
    if (expected === "html") {
      // The HTML exporter creates standalone slides as section + SVG pairs.
      // A successful proxy/login error page must never be downloaded as a deck.
      const html = (mime === "text/html" || mime === "application/xhtml+xml") ? await blob.text() : "";
      valid = /<!doctype html>/i.test(html) && /<section>\s*<svg[\s>]/i.test(html);
    }
    if (!valid) throw Object.assign(new Error("Сервер не смог подготовить файл нужного формата. Повторите скачивание."), {code: "INVALID_DOWNLOAD"});
  }
  return blob;
}
export const json = (method: string, data: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data),
});

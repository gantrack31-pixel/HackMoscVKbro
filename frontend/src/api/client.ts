let csrf = "";
export function setCsrf(value: string) {
  csrf = value;
}
export type AiOptions = { operationId: string; signal: AbortSignal };
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
      "Сервер недоступен. Запустите Python/FastAPI на порту 8000.",
    );
  }
  if (!response.ok) {
    const data = await response
      .json()
      .catch(() => ({ detail: "Ошибка сервера" }));
    if (data.detail?.code === "AI_CANCELLED")
      throw Object.assign(new Error("Остановлено"), { code: "AI_CANCELLED" });
    const detail =
      typeof data.detail === "string"
        ? data.detail
        : Array.isArray(data.detail)
          ? data.detail.map((x: { msg: string }) => x.msg).join("; ")
          : "Не удалось выполнить запрос";
    if (response.status === 401 && !path.startsWith("/auth/"))
      window.dispatchEvent(new Event("session-expired"));
    throw new Error(detail);
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
export const json = (method: string, data: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data),
});

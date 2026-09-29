import type {
  Template,
  Health,
  DeckContent,
  Project,
  ProjectSummary,
  Job,
  Issue,
  Variant,
  AuthResult,
  User,
  CloudStatus,
  DiskStatus,
  DiskReceipt,
  CloudReceipt,
  Scene,
} from "./types";
let csrf = "";
export type AiOptions = { operationId: string; signal: AbortSignal };
function aiRequest<T>(path: string, options: RequestInit, ai?: AiOptions) {
  return request<T>(path, {...options, signal:ai?.signal,
    headers:{...options.headers, ...(ai ? {"X-AI-Operation-ID":ai.operationId} : {})}});
}

// В разработке /api проксирует Vite, после сборки фронтенд раздаёт FastAPI.
// Ключ LLM здесь не нужен и никогда не передаётся в браузер.
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
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
    if (data.detail?.code === "AI_CANCELLED") throw Object.assign(new Error("Остановлено"), {code:"AI_CANCELLED"});
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
const json = (method: string, data: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data),
});
export const api = {
  reserveAi: () => request<{job_id:string}>("/ai/operations",{method:"POST"}),
  cancelJob: (id:string) => request<{id:string;state:import("./types").Job["state"]}>(`/jobs/${id}/cancel`,{method:"POST"}),
  assistant: (id: string, data: {content: DeckContent; variant: Variant; base_updated_at: string; instruction: string; action: "edit" | "repair"; slide: number | null; material: string}, ai?:AiOptions) =>
    aiRequest<import("./types").AssistantResult>(`/projects/${id}/assistant`, json("POST", data),ai),
  workflow: () => request<import("./types").WorkflowRecipe>("/workflow"),
  importMaterials: (files: File[]) => {
    const body=new FormData(); files.forEach(file=>body.append("files",file));
    return request<{text: string; documents: {name: string; characters: number; warnings: string[]; sha256: string}[]}>("/materials/import",{method:"POST",body});
  },
  generateImage: (prompt: string,ai?:AiOptions) => aiRequest<{image_data: string; model: string}>("/images/generate",json("POST",{prompt}),ai),
  cloudStatus: () => request<CloudStatus>("/cloud/status"),
  diskStatus: () => request<DiskStatus>("/disk/status"),
  diskFiles: () => request<DiskReceipt[]>("/disk/files"),
  connectDisk: () => request<{ url: string }>("/disk/connect", { method: "POST" }),
  saveDisk: (id: string) => request<DiskReceipt>(`/projects/${id}/disk`, { method: "POST" }),
  cloudProjects: () => request<CloudReceipt[]>("/cloud/projects"),
  saveCloud: (id: string) =>
    request<CloudReceipt>(`/projects/${id}/cloud`, { method: "POST" }),
  restoreCloud: (id: string) =>
    request<Project>(`/cloud/projects/${id}/restore`, { method: "POST" }),
  preview: (
    id: string,
    content: DeckContent,
    variant: Variant,
    signal: AbortSignal,
  ) =>
    request<{ scenes: Scene[] }>(`/projects/${id}/preview`, {
      ...json("POST", { content, variant }),
      signal,
    }),
  updateProfile: (data: {
    first_name: string;
    last_name: string;
    avatar_color: string;
  }) => request<User>("/auth/profile", json("PUT", data)),
  profileStats: () =>
    request<{ projects: number; favorites: number; templates: number }>(
      "/auth/profile/stats",
    ),
  uploadAvatar: (file: File) => {
    const body = new FormData();
    body.append("file", file);
    return request<User>("/auth/avatar", { method: "POST", body });
  },
  removeAvatar: () => request<User>("/auth/avatar", { method: "DELETE" }),
  linkYandex: () =>
    request<{ url: string }>("/auth/yandex/link", { method: "POST" }),
  me: async () => {
    const result = await request<AuthResult>("/auth/me");
    csrf = result.csrf;
    return result;
  },
  login: async (email: string, password: string) => {
    const result = await request<AuthResult>(
      "/auth/login",
      json("POST", { email, password }),
    );
    csrf = result.csrf;
    return result;
  },
  register: async (data: {
    email: string;
    password: string;
    first_name: string;
    last_name: string;
  }): Promise<
    | AuthResult
    | {
        verification_required: true;
        email: string;
        delivery_pending?: boolean;
        delivery_mode?: string;
      }
  > => {
    const result = await request<
      | AuthResult
      | {
          verification_required: true;
          email: string;
          delivery_pending?: boolean;
          delivery_mode?: string;
        }
    >("/auth/register", json("POST", data));
    if (!("verification_required" in result)) csrf = result.csrf;
    return result;
  },
  verifyEmail: (token: string) =>
    request<{ verified: boolean }>(
      "/auth/verify-email",
      json("POST", { token }),
    ),
  resendVerification: (email: string) =>
    request<{ ok: boolean; delivery_mode?: string }>(
      "/auth/verification/resend",
      json("POST", { email }),
    ),
  requestPasswordReset: (email: string) =>
    request<{ ok: boolean }>(
      "/auth/password-reset/request",
      json("POST", { email }),
    ),
  confirmPasswordReset: (token: string, password: string) =>
    request<{ reset: boolean }>(
      "/auth/password-reset/confirm",
      json("POST", { token, password }),
    ),
  supportMessage: (email: string, message: string) =>
    request<{ sent: boolean }>(
      "/support/messages",
      json("POST", { email, message }),
    ),
  logout: async () => {
    await request<void>("/auth/logout", { method: "POST" });
    csrf = "";
  },
  publicTemplates: () => request<Template[]>("/public/templates"),
  favorites: () => request<string[]>("/favorites"),
  favorite: (id: string, save: boolean) =>
    request<void>(`/favorites/${id}`, { method: save ? "PUT" : "DELETE" }),
  health: () => request<Health>("/health"),
  templates: () => request<Template[]>("/templates"),
  upload: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<Template>("/templates", { method: "POST", body: form });
  },
  outline: (data: {
    template_id: string;
    purpose?: "project" | "product" | "feature" | "initiative";
    prompt: string;
    count: number;
    audience: string;
    mode: "description" | "text";
  }, ai?:AiOptions) =>
    aiRequest<{ content: DeckContent; mode: string }>(
      "/outline",
      json("POST", data), ai,
    ),
  generate: (
    template_id: string,
    content: DeckContent,
    source_text: string,
    audience = "Команда и коллеги",
  ) =>
    request<{ job_id: string }>(
      "/generate",
      json("POST", { template_id, content, source_text, audience }),
    ),
  job: (id: string) => request<Job>(`/jobs/${id}`),
  retryJob: (id: string) =>
    request<{ job_id: string }>(`/jobs/${id}/retry`, { method: "POST" }),
  regenerate: (id: string, instruction = "") =>
    request<{ job_id: string }>(
      `/projects/${id}/regenerate`,
      json("POST", { instruction }),
    ),
  projects: () => request<ProjectSummary[]>("/projects"),
  project: (id: string) => request<Project>(`/projects/${id}`),
  update: (id: string, content: DeckContent, variant: Variant) =>
    request<Project>(`/projects/${id}`, json("PUT", { content, variant })),
  remove: (id: string) =>
    request<void>(`/projects/${id}`, { method: "DELETE" }),
  undo: (id: string) =>
    request<Project>(`/projects/${id}/undo`, { method: "POST" }),
  redo: (id: string) =>
    request<Project>(`/projects/${id}/redo`, { method: "POST" }),
  audit: (id: string, variant: Variant) =>
    request<{ issues: Issue[]; context_status: string }>(
      `/projects/${id}/audit?variant=${variant}`,
    ),
  contentAudit: (id: string,ai?:AiOptions) =>
    aiRequest<{ issues: Issue[]; model: string }>(
      `/projects/${id}/audit/content`,
      { method: "POST" }, ai,
    ),
  fix: (id: string, issue_ids: string[], variant: Variant) =>
    request<Project>(
      `/projects/${id}/fix`,
      json("POST", { issue_ids, variant }),
    ),
  exportUrl: (id: string, format: string, variant: Variant) =>
    `/api/projects/${id}/export/${format}?variant=${variant}`,
};

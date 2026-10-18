import type { Template, Health } from "../types";
import { request } from "./client";

export const templatesApi = {
  publicTemplates: (signal?: AbortSignal) =>
    request<Template[]>("/public/templates", { signal }),
  favorites: () => request<string[]>("/favorites"),
  favorite: (id: string, save: boolean) =>
    request<void>(`/favorites/${id}`, { method: save ? "PUT" : "DELETE" }),
  health: () => request<Health>("/health"),
  templates: (signal?: AbortSignal) =>
    request<Template[]>("/templates", { signal }),
  upload: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<Template>("/templates", { method: "POST", body: form });
  },
};

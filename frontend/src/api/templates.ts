import type { Template, Health } from "../types";
import { request } from "./client";

export const templatesApi = {
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
};

import type {
  DeckContent,
  Project,
  ProjectSummary,
  Issue,
  Scene,
  Variant,
} from "../types";
import { request, json, aiRequest, type AiOptions } from "./client";

export const projectsApi = {
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
  projects: () => request<ProjectSummary[]>("/projects"),
  project: (id: string, signal?: AbortSignal) =>
    request<Project>(`/projects/${id}`, { signal }),
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
  contentAudit: (id: string, ai?: AiOptions) =>
    aiRequest<{ issues: Issue[]; model: string }>(
      `/projects/${id}/audit/content`,
      { method: "POST" },
      ai,
    ),
  fix: (id: string, issue_ids: string[], variant: Variant) =>
    request<Project>(
      `/projects/${id}/fix`,
      json("POST", { issue_ids, variant }),
    ),
  exportUrl: (id: string, format: string, variant: Variant) =>
    `/api/projects/${id}/export/${format}?variant=${variant}`,
};

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
  update: (id: string, content: DeckContent, variant: Variant, base_updated_at: string) =>
    request<Project>(`/projects/${id}`, json("PUT", { content, variant, base_updated_at })),
  remove: (id: string) =>
    request<void>(`/projects/${id}`, { method: "DELETE" }),
  undo: (id: string, base_updated_at: string) =>
    request<Project>(`/projects/${id}/undo`, json("POST", { base_updated_at })),
  redo: (id: string, base_updated_at: string) =>
    request<Project>(`/projects/${id}/redo`, json("POST", { base_updated_at })),
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
  fix: (id: string, issue_ids: string[], variant: Variant, base_updated_at: string) =>
    request<Project>(
      `/projects/${id}/fix`,
      json("POST", { issue_ids, variant, base_updated_at }),
    ),
  exportUrl: (id: string, format: string, variant: Variant, version: string) =>
    `/api/projects/${id}/export/${format}?variant=${variant}&version=${encodeURIComponent(version)}`,
};

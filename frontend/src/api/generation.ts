import type { AssistantResult, DeckContent, Job, MaterialResource, Variant, WorkflowRecipe } from "../types";
import { request, json, aiRequest, type AiOptions } from "./client";

export const generationApi = {
  reserveAi: () =>
    request<{ job_id: string }>("/ai/operations", { method: "POST" }),
  cancelJob: (id: string) =>
    request<{ id: string; state: Job["state"] }>(
      `/jobs/${id}/cancel`,
      { method: "POST" },
    ),
  assistant: (
    id: string,
    data: {
      content: DeckContent;
      variant: Variant;
      base_updated_at: string;
      instruction: string;
      action: "edit" | "repair";
      slide: number | null;
      material: string;
    },
    ai?: AiOptions,
  ) =>
    aiRequest<AssistantResult>(
      `/projects/${id}/assistant`,
      json("POST", data),
      ai,
    ),
  workflow: () => request<WorkflowRecipe>("/workflow"),
  importMaterials: (files: File[]) => {
    const body = new FormData();
    files.forEach((file) => body.append("files", file));
    return request<{
      text: string;
      resource_ids: string[];
      resources: MaterialResource[];
      documents: {
        name: string;
        kind: MaterialResource["kind"];
        characters: number;
        warnings: string[];
        sha256: string;
      }[];
    }>("/materials/import", { method: "POST", body });
  },
  deleteMaterial: (id: string) =>
    request<void>(`/materials/${id}`, { method: "DELETE" }),
  generateImage: (prompt: string, ai?: AiOptions) =>
    aiRequest<{ image_data: string; model: string }>(
      "/images/generate",
      json("POST", { prompt }),
      ai,
    ),
  outline: (
    data: {
      template_id: string;
      purpose?: "project" | "product" | "feature" | "initiative";
      prompt: string;
      count: number;
      audience: string;
      mode: "description" | "text";
      resource_ids?: string[];
    },
    ai?: AiOptions,
  ) =>
    aiRequest<{ content: DeckContent; mode: string }>(
      "/outline",
      json("POST", data),
      ai,
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
};

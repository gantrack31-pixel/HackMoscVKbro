import type { DeckContent, Job, Project } from "../../types";

import { accountKey } from "../../state/accountStorage";
export type PendingJob = {
  id: string;
  kind: "generate" | "regenerate";
  sourceProjectId?: string;
  content?: DeckContent;
  sourceText?: string;
  audience?: string;
  templateId?: string;
};
export type JobPollingFailure = Error & { jobId?: string; retryable?: boolean; terminal?: boolean; status?: number };

export function checkedJob(value: unknown, expectedId: string): Job {
  const job = value as Job | null;
  if (!job || job.id !== expectedId || !["queued", "running", "complete", "failed", "cancelled"].includes(job.state)
    || typeof job.stage !== "string" || (job.state === "complete" && (typeof job.project_id !== "string" || !job.project_id)))
    throw new Error("Сервер вернул неполное состояние. Сохранённую задачу можно проверить ещё раз.");
  return job;
}

export function checkedProject(value: unknown, expectedId: string): Project {
  const project = value as Project | null;
  if (!project || project.id !== expectedId || !project.template || !project.content || !Array.isArray(project.content.slides)
    || !project.variants || !["a", "b", "c"].every(variant => Array.isArray(project.variants[variant as keyof typeof project.variants])))
    throw new Error("Результат получен не полностью. Проверьте состояние ещё раз — задача сохранена.");
  return project;
}

// Only confirmed job termination permits discarding the recovery snapshot.
// Transport/auth/server errors and malformed responses do not prove failure.
export function isTerminalJobFailure(error: unknown): boolean {
  return (error as JobPollingFailure | null)?.terminal === true;
}
export function readPendingJob(accountId: string): PendingJob | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(accountKey(accountId, "pending-generation")) || "null");
    return value &&
      typeof value.id === "string" &&
      (value.kind === "generate" || value.kind === "regenerate")
      ? value
      : null;
  } catch {
    return null;
  }
}
export function writePendingJob(accountId: string, job: PendingJob | null) {
  try {
    if (job) sessionStorage.setItem(accountKey(accountId, "pending-generation"), JSON.stringify(job));
    else sessionStorage.removeItem(accountKey(accountId, "pending-generation"));
  } catch {
    // Recovery still works within the current wizard if session storage is unavailable.
  }
}
export function clearPendingGenerationJob(accountId: string) {
  writePendingJob(accountId, null);
}

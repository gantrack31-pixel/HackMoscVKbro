import type { DeckContent } from "../../types";

const PENDING_JOB_KEY = "deckly-pending-generation";
export type PendingJob = {
  id: string;
  kind: "generate" | "regenerate";
  sourceProjectId?: string;
  content?: DeckContent;
  sourceText?: string;
  audience?: string;
  templateId?: string;
};
export function readPendingJob(): PendingJob | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(PENDING_JOB_KEY) || "null");
    return value &&
      typeof value.id === "string" &&
      (value.kind === "generate" || value.kind === "regenerate")
      ? value
      : null;
  } catch {
    return null;
  }
}
export function writePendingJob(job: PendingJob | null) {
  try {
    if (job) sessionStorage.setItem(PENDING_JOB_KEY, JSON.stringify(job));
    else sessionStorage.removeItem(PENDING_JOB_KEY);
  } catch {
    // Recovery still works within the current wizard if session storage is unavailable.
  }
}
export function clearPendingGenerationJob() {
  writePendingJob(null);
}

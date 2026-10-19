import { api } from "../api";
import type { DeckContent, Project } from "../types";

export const isVersionConflict = (error: unknown) =>
  (error as { status?: number } | null)?.status === 409;

/** Read the latest version before releasing the working copy; never write it. */
export async function backupDraftAndReadLatest(
  project: Project,
  content: DeckContent,
  baseVersion: string,
  origin: "editor" | "audit",
  slideIndex: number,
): Promise<Project> {
  const latest = await api.project(project.id);
  const backup = {
    format: "deckly-draft-backup-v1",
    saved_at: new Date().toISOString(),
    origin,
    slide_index: slideIndex,
    project_id: project.id,
    base_updated_at: baseVersion,
    template_id: project.template_id,
    variant: project.variant,
    content,
    source_text: project.source_text,
    provenance: project.provenance,
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `deckly-${origin}-draft-${project.id}.json`;
  document.body.append(anchor);
  try { anchor.click(); }
  finally { anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 30_000); }
  return latest;
}

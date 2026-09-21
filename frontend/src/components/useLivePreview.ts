import { useEffect, useState } from "react";
import { api } from "../api";
import type { DeckContent, Project, Scene } from "../types";

export function useLivePreview(
  project: Project,
  content: DeckContent,
  enabled: boolean,
) {
  const [preview, setPreview] = useState<{
    content: DeckContent;
    scenes: Scene[];
  } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!enabled) {
      setPreview(null);
      setError("");
      return;
    }
    const controller = new AbortController();
    setError("");
    const timer = setTimeout(() => {
      api
        .preview(project.id, content, project.variant, controller.signal)
        .then((result) => {
          if (!controller.signal.aborted)
            setPreview({ content, scenes: result.scenes });
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message);
        });
    }, 280);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [project.id, project.updated_at, project.variant, content, enabled]);
  return {
    scenes:
      enabled && preview ? preview.scenes : project.variants[project.variant],
    pending: enabled && preview?.content !== content && !error,
    error,
  };
}

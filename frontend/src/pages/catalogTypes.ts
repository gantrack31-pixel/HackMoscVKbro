import type { Template } from "../types";

export interface CatalogActions {
  templates: Template[];
  favorites: string[];
  toggleFavorite: (id: string) => void;
  select: (t: Template) => void;
  preview: (t: Template) => void;
  upload: () => void;
}

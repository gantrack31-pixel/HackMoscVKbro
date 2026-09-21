// Имена полей совпадают с Pydantic-моделями Python: backend/app/models.py.
export type Route =
  | "home"
  | "templates"
  | "favorites"
  | "projects"
  | "create"
  | "editor"
  | "audit"
  | "demo"
  | "support"
  | "profile"
  | "finish";
export type Variant = "a" | "b" | "c";
export interface Template {
  id: string;
  name: string;
  metadata: {
    count: number;
    ratio: number;
    font: string;
    accent: string;
    background?: string;
    composition?: "split" | "editorial" | "grid";
    recommended_slides?: number;
    category: string;
    cover_title: string;
    source: "pptx" | "starter";
    colors: Record<string, string>;
    fonts?: string[];
    layouts: unknown[];
    warnings: string[];
  };
}
export interface Slide {
  title: string;
  body: string;
  kind: "title" | "text" | "chart" | "table" | "steps";
  bullets: string[];
  chart: { labels: string[]; values: number[]; unit: string } | null;
  table: string[][];
  source_quote: string;
  notes: string;
  layout: Variant | null;
  fixed: string[];
}
export interface DeckContent {
  title: string;
  slides: Slide[];
}
export interface SceneObject {
  id: string;
  type: "rect" | "text" | "chart" | "table";
  x: number;
  y: number;
  w: number;
  h: number;
  fill?: string;
  color?: string;
  font_size?: number;
  bold?: boolean;
  lines?: string[];
  used_height?: number;
  text?: string;
  rows?: string[][];
  labels?: string[];
  values?: number[];
  unit?: string;
}
export interface Scene {
  width: number;
  height: number;
  objects: SceneObject[];
  render_objects?: SceneObject[];
  template_layout: string;
  preview_note: string;
}
export interface CloudStatus {
  configured: boolean;
  ready: boolean;
  templates: number;
  projects: number;
}
export interface CloudReceipt {
  project_id: string;
  title: string;
  revision: number;
  saved_at: string;
  source_updated_at: string;
  templates_saved?: number;
}
export interface Project {
  id: string;
  title: string;
  template_id: string;
  content: DeckContent;
  source_text: string;
  variant: Variant;
  template: Template;
  variants: Record<Variant, Scene[]>;
  can_undo: boolean;
  updated_at: string;
  sources: { slide: number; status: "matched" | "missing" | "not_found" }[];
}
export interface ProjectSummary {
  id: string;
  title: string;
  template_id: string;
  content: DeckContent;
  variant: Variant;
  updated_at: string;
}
export interface Health {
  ok: boolean;
  mode: "demo" | "live";
  model: string;
  llm_configured: boolean;
  max_upload_mb: number;
  context_audit: boolean;
  export_note: string;
  yandex_enabled: boolean;
}
export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  created_at: string;
  avatar_color: string;
  yandex_connected: boolean;
  password_enabled: boolean;
}
export interface AuthResult {
  user: User | null;
  csrf: string;
}
export interface Issue {
  id: string;
  slide: number;
  code: string;
  title: string;
  detail: string;
  category: "layout" | "template" | "content" | "source";
  severity: "error" | "warning" | "info";
  fixable: boolean;
  deterministic: boolean;
  object_id: string;
}
export interface Job {
  id: string;
  state: "queued" | "running" | "complete" | "failed";
  stage: string;
  project_id: string | null;
  error: string | null;
}
export const blankSlide = (): Slide => ({
  title: "Новый слайд",
  body: "Добавьте основную мысль.",
  kind: "text",
  bullets: [],
  chart: null,
  table: [],
  source_quote: "",
  notes: "",
  layout: null,
  fixed: [],
});
export const variantNames: Record<Variant, string> = {
  a: "Классический",
  b: "Акцентный",
  c: "Минималистичный",
};

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
  | "requirements"
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
    heading_pt?: number;
    body_pt?: number;
    master_count?: number;
    visual_elements?: Record<string,number>;
    assets?: {id: string; name: string; description: string; data: string; slide: number}[];
    analysis_limits?: {sampled_slides: number; total_slides: number; reusable_images: number};
    warnings: string[];
  };
}
export interface Slide {
  title: string;
  body: string;
  kind: "title" | "text" | "chart" | "table" | "steps" | "diagram" | "icons" | "image";
  bullets: string[];
  chart: { labels: string[]; values: number[]; unit: string; chart_type?: "bar" | "column" | "line" } | null;
  table: string[][];
  source_quote: string;
  notes: string;
  layout: Variant | null;
  design?: {
    composition: "split" | "editorial" | "grid";
    density: "compact" | "balanced" | "airy";
    layout_shift: 0 | 1 | 2;
    smartart?: { type: NonNullable<Slide["diagram_type"]>; nodes: {bullet:number; x:number; y:number; w:number; h:number; group:number}[]; edges: {source:number; target:number; direction:"forward"|"both"|"none"}[] } | null;
  } | null;
  fixed: string[];
  diagram_type?: "process" | "vertical" | "cycle" | "hierarchy" | "matrix" | "pyramid" | "honeycomb" | "comparison" | "kpi";
  icon_names?: string[];
  image_prompt?: string;
  image_data?: string;
  template_asset_id?: string;
  designs?: Partial<Record<Variant, NonNullable<Slide["design"]>>>;
}
export interface DeckContent {
  title: string;
  slides: Slide[];
  audience?: string;
}
export interface SceneObject {
  id: string;
  type: "rect" | "text" | "chart" | "table" | "ellipse" | "hexagon" | "line" | "image";
  x1?: number; y1?: number; x2?: number; y2?: number;
  stroke?: string; stroke_width?: number; src?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fill?: string;
  color?: string;
  font_size?: number;
  line_spacing?: number;
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
  provenance?: GenerationManifest;
  id: string;
  title: string;
  template_id: string;
  content: DeckContent;
  source_text: string;
  variant: Variant;
  template: Template;
  variants: Record<Variant, Scene[]>;
  can_undo: boolean;
  can_redo: boolean;
  updated_at: string;
  sources: { slide: number; status: "matched" | "related" | "missing" | "not_found"; bindings?: SourceBinding[] }[];
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
  vision_enabled?: boolean;
  image_generation?: boolean;
  image_model?: string;
  generation_budget_seconds?: number;
  ok: boolean;
  mode: "demo" | "live";
  model: string;
  llm_configured: boolean;
  max_upload_mb: number;
  context_audit: boolean;
  export_note: string;
  yandex_enabled: boolean;
}

export interface AssistantResult {
  project: Project | null;
  summary: string;
  changed_slides: number[];
  before: number;
  issues: Issue[];
}

export interface WorkflowRecipe {
  version: string; fingerprint: string; budget_seconds: number;
  outline_budget_seconds?: number | null; assembly_budget_seconds?: number;
  stages: {id: string; name: string; type: string}[];
  snippets: {id: string; version: string; text: string}[];
  variants: {id: string; title: string; layout: string; density: string}[];
}
export interface GenerationManifest {
  job_id: string; recipe: WorkflowRecipe; mode: string; model: string;
  duration_seconds: number; within_budget: boolean; slides: number;
  timings?: Partial<Record<"template" | "design" | "images" | "layout" | "audit" | "persist" | "total", number>>;
  template: {id: string; name: string; fingerprint: string};
  audit: Record<string, {issues: number; errors: number}>;
}
export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  created_at: string;
  avatar_color: string;
  avatar_url?: string | null;
  yandex_connected: boolean;
  password_enabled: boolean;
  email_verified: boolean;
}
export interface AuthResult {
  user: User | null;
  csrf: string;
}
export interface SourceBinding { chunk_id: string; start: number; end: number; quote: string }
export interface Issue {
  source_bindings?: SourceBinding[];
  grounding?: "not_applicable" | "located" | "unverified" | "unavailable";
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
  state: "queued" | "running" | "complete" | "failed" | "cancelled";
  stage: string;
  project_id: string | null;
  error: string | null;
  can_retry?: boolean;
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

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
export type AnalyticalChartType = "table" | "line" | "bar" | "histogram" | "pie" | "scatter" | "grouped" | "stacked" | "kpi";
export interface AnalyticalSeries { name: string; values: (number | null)[]; unit: string }
export interface CalculationRecord {
  id: string; operation: string; fields: string[]; result: number | null; unit: string;
  baseline: number | null; comparison: number | null; rows_used: number; rows_excluded: number; description: string;
}
export interface AnalyticalVisual {
  chart_type: AnalyticalChartType; labels: string[]; series: AnalyticalSeries[]; x_values: (number | null)[];
  columns: string[]; rows: string[][];
  kpis: { label: string; value: number; unit: string; aggregation: string; period: string; display: string }[];
  x_label: string; y_label: string; source: string; question: string; takeaway: string; why: string;
  calculations: CalculationRecord[]; warnings: string[]; dataset_id: string; dataset_fingerprint: string;
  selection_fingerprint: string; source_fingerprint: string; metadata: Record<string, unknown>;
}
export interface Template {
  preview_url?: string;
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
    bundled_pack?: boolean;
    master_only?: boolean;
    cover_slide?: number;
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
export interface ObjectStyle {
  x?: number; y?: number; w?: number; h?: number;
  color?: string | null; fill?: string | null; stroke?: string | null;
  stroke_width?: number; font_size?: number; bold?: boolean; hidden?: boolean; z_index?: number;
}
export interface CanvasElement {
  id: string; type: "text" | "rect" | "ellipse" | "line" | "image" | "icon" | "chart" | "table";
  x: number; y: number; w: number; h: number;
  text?: string; color?: string; fill?: string; stroke?: string; stroke_width?: number;
  font_size?: number; bold?: boolean; z_index?: number; reverse_line?: boolean;
  chart?: Slide["chart"]; table?: string[][]; icon_name?: string | null;
  template_asset_id?: string; resource_id?: string; image_prompt?: string;
}
export interface Slide {
  title: string;
  body: string;
  kind: "title" | "text" | "chart" | "table" | "steps" | "diagram" | "icons" | "image" | "analysis";
  bullets: string[];
  chart: { labels: string[]; values: number[]; unit: string; chart_type?: "bar" | "column" | "line" } | null;
  analytics?: AnalyticalVisual | null;
  table: string[][];
  source_quote: string;
  notes: string;
  layout: Variant | null;
  design?: {
    composition: "split" | "editorial" | "grid";
    density: "compact" | "balanced" | "airy";
    layout_shift: 0 | 1 | 2;
    background_role?: "template" | "light" | "dark" | "accent";
    foreground_role?: "text" | "inverse";
    heading_role?: "heading" | "body";
    body_role?: "body" | "heading";
    heading_scale?: number;
    body_scale?: number;
    background_color?: string | null;
    text_color?: string | null;
    heading_color?: string | null;
    accent_color?: string | null;
    objects?: Record<string, ObjectStyle>;
    heading_weight?: "normal" | "bold";
    diagram_style?: NonNullable<Slide["diagram_type"]> | null;
    smartart?: { type: NonNullable<Slide["diagram_type"]>; nodes: {bullet:number; x:number; y:number; w:number; h:number; group:number}[]; edges: {source:number; target:number; direction:"forward"|"both"|"none"}[] } | null;
  } | null;
  fixed: string[];
  diagram_type?: "process" | "vertical" | "cycle" | "hierarchy" | "matrix" | "pyramid" | "honeycomb" | "comparison" | "kpi";
  icon_names?: string[];
  image_prompt?: string;
  image_data?: string;
  template_asset_id?: string;
  resource_id?: string;
  resource_icon_ids?: string[];
  elements?: CanvasElement[];
  element_images?: Record<string, string>;
  designs?: Partial<Record<Variant, NonNullable<Slide["design"]>>>;
}
export interface DeckContent {
  evidence_sources?: {id: string; text: string}[];
  brand_style_id?: string | null;
  brand_prefer_template?: boolean;
  title: string;
  slides: Slide[];
  audience?: string;
  resource_ids?: string[];
}
export interface MaterialResource {
  id: string;
  name: string;
  kind: "document" | "image" | "icon" | "icon_pack" | "font" | "palette";
  format: string;
  status?: "ready" | "failed";
  characters?: number;
  width?: number;
  height?: number;
  family?: string;
  weight?: string;
  style?: string;
  roles?: string[];
  colors?: string[];
  icons?: {id: string; name: string; format: string}[];
}
export interface SceneObject {
  id: string;
  type: "rect" | "text" | "chart" | "table" | "ellipse" | "hexagon" | "line" | "image" | "polygon";
  points?: [number, number][];
  font_family?: string;
  effective_font_family?: string;
  css_font_family?: string;
  parent_id?: string;
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
  font_faces?: {family: string; css_family: string; src: string; weight: number; style: string}[];
  width: number;
  height: number;
  objects: SceneObject[];
  render_objects?: SceneObject[];
  template_layout: string;
  preview_note: string;
  font_warnings?: string[];
}
export interface DiskStatus {
  configured: boolean;
  ready: boolean;
  provider: "yandex_disk";
}
export interface DiskReceipt {
  name: string;
  saved_at: string;
  path?: string;
  provider?: "yandex_disk";
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

export interface AssistantProposal {
  id: string; content: DeckContent; base_updated_at: string; draft_fingerprint: string;
  source_fingerprint: string; expires_at: string; state: "pending" | "applied" | "rejected";
  fact_corrections?: {before: string; after: string; evidence: string}[];
  changes: { slide: number; field: string; before: unknown; after: unknown }[];
}
export interface AssistantResult {
  proposal?: AssistantProposal | null;
  project: Project | null;
  summary: string;
  changed_slides: number[];
  slide_order?: number[];
  before: number;
  fact_corrections?: {before: string; after: string; evidence: string}[];
  variant_issues?: Record<string, Issue[]>;
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

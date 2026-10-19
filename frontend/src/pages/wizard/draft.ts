import type { DeckContent, MaterialResource, Variant } from "../../types";
import { readAccount, writeAccount } from "../../state/accountStorage";
import type { DatasetEntry } from "./analysisApi";
import type { PresentationPurpose } from "./types";

export type SourceBlock = { id: string; name: string; text: string; characters: number };
export type WizardDraft = {
  version: 1; savedAt: string; step: number; mode: "text" | "description";
  prompt: string; count: number; audience: string; purpose: PresentationPurpose;
  analytics?: DatasetEntry[];
  brandId?: string | null;
  brandPreferTemplate?: boolean;
  resources: MaterialResource[]; sourceBlocks: SourceBlock[];
  content: DeckContent | null; templateId: string; resultId?: string;
  variant: Variant; instruction: string;
};
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === "string");
function validDataset(entry: DatasetEntry): boolean {
  const profile = entry?.profile, selection = entry?.selection, plan = entry?.plan;
  return Boolean(profile && typeof profile.id === "string" && typeof profile.name === "string" &&
    strings(profile.warnings) && Array.isArray(profile.tables) && profile.tables.every(table => table &&
      typeof table.id === "string" && typeof table.name === "string" && Number.isFinite(table.row_count) &&
      Array.isArray(table.columns) && table.columns.every(column => column && typeof column.name === "string" && strings(column.reasons) && Array.isArray(column.outlier_rows)) &&
      Array.isArray(table.recommended) && Array.isArray(table.available) && strings(table.warnings)) &&
    selection && typeof selection.table_id === "string" && typeof selection.chart_type === "string" && strings(selection.measures) &&
    (!plan || (Array.isArray(plan.slides) && plan.slides.every(slide => slide && typeof slide.title === "string") &&
      plan.reconciliation && Number.isFinite(plan.reconciliation.input_rows) && Number.isFinite(plan.reconciliation.reference_rows))));
}
export function readWizardDraft(account: string): WizardDraft | null {
  const value = readAccount<WizardDraft>(account, "wizard-draft");
  if (!value || value.version !== 1 || typeof value.prompt !== "string" || typeof value.savedAt !== "string" ||
      ![1,2,3,4].includes(value.step) || !["text","description"].includes(value.mode) ||
      !Number.isInteger(value.count) || value.count < 3 || value.count > 200 ||
      typeof value.audience !== "string" || !["project","product","feature","initiative"].includes(value.purpose) ||
      !Array.isArray(value.resources) || !value.resources.every(r => r && typeof r.id === "string" && typeof r.name === "string") ||
      !Array.isArray(value.sourceBlocks) || !value.sourceBlocks.every(b => b && typeof b.id === "string" && typeof b.name === "string" && typeof b.text === "string" && Number.isFinite(b.characters)) ||
      typeof value.templateId !== "string" || !["a","b","c"].includes(value.variant) || typeof value.instruction !== "string" ||
      (value.analytics != null && (!Array.isArray(value.analytics) || !value.analytics.every(validDataset))) ||
      (value.content !== null && (!value.content || typeof value.content.title !== "string" || !Array.isArray(value.content.slides) || !value.content.slides.length || value.content.slides.some(slide => !slide || typeof slide.title !== "string")))) return null;
  return value;
}
export function archiveWizardDraft(account: string): boolean {
  const current = readWizardDraft(account);
  if (current && (current.prompt || current.content || current.resources.length || current.analytics?.length)) {
    // Keep the previous draft available after an explicit New presentation action.
    if (!writeAccount(account, "wizard-previous", current)) return false;
  }
  return writeAccount(account, "wizard-draft", null);
}
export function combinedMaterial(prompt: string, blocks: SourceBlock[]): string {
  return [prompt.trim(), ...blocks.filter(b => b.text).map(b => `Источник: ${b.name}\n${b.text}`)]
    .filter(Boolean).join("\n\n");
}

export function materialLengthError(text: string, limit = 50_000): string | null {
  if (text.length <= limit) return null;
  return `Материал содержит ${text.length.toLocaleString("ru-RU")} символов при лимите ${limit.toLocaleString("ru-RU")}. Текст не был обрезан и не отправлен. Сократите его до ключевых разделов и повторите.`;
}

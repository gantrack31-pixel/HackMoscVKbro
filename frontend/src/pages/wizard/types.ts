export type WizardOperation =
  | "outline"
  | "generate"
  | "regenerate"
  | "open"
  | "import";

export interface FailedGenerationJob {
  id: string;
  message: string;
  retryable: boolean;
}

export type PresentationPurpose =
  | "project"
  | "product"
  | "feature"
  | "initiative";

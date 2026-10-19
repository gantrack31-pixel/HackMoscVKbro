import type { RefObject } from "react";
import { Icon } from "../../components/Icon";
import { SlidePreview } from "../../components/SlidePreview";
import { variantNames, type Project, type Variant } from "../../types";
import { generationStages } from "./content";
import type { WizardOperation, FailedGenerationJob } from "./types";

export function GenerationResults({
  result,
  variant,
  busy,
  live,
  stage,
  operation,
  failedJob,
  instruction,
  instructionError,
  instructionRef,
  onRetry,
  onVariantChange,
  onInstructionChange,
  onRegenerate,
  onOpen,
}: {
  result: Project;
  variant: Variant;
  busy: boolean;
  live: boolean;
  stage: string;
  operation: WizardOperation | null;
  failedJob: FailedGenerationJob | null;
  instruction: string;
  instructionError: string;
  instructionRef: RefObject<HTMLTextAreaElement | null>;
  onRetry: () => void;
  onVariantChange: (variant: Variant) => void;
  onInstructionChange: (value: string) => void;
  onRegenerate: () => void;
  onOpen: () => void;
}) {
  return (
    <section className="wizard-results">
      {failedJob && (
        <div className="error-banner" role="alert">
          <span>{failedJob.message} Предыдущие варианты сохранены.</span>
          <button className="btn sm" disabled={busy} onClick={onRetry}>
            Повторить оформление
          </button>
        </div>
      )}
      <div className="wizard-results-heading">
        <div>
          <span className="wizard-ready">
            <Icon name="flow-ready" />
            Презентация готова
          </span>
          <h2>Одна история. Три способа рассказать.</h2>
          <p className="muted small">
            Содержание общее, меняется композиция. {result.template.name}.
          </p>
        </div>
        <span className="badge">{result.content.slides.length} слайдов</span>
      </div>
      {operation === "regenerate" && (
        <div className="wizard-regeneration-status" role="status">
          <i className="spinner" />
          <div>
            <strong>
              {live
                ? "AI готовит новое оформление"
                : "Готовим новые композиции"}
            </strong>
            <p>
              {generationStages.find(([id]) => id === stage)?.[1] ||
                "Обрабатываем презентацию"}
              . Текущая версия сохранена.
            </p>
          </div>
        </div>
      )}
      <div className="variant-grid">
        {(["a", "b", "c"] as const).map((v) => (
          <article
            className={`variant-card ${variant === v ? "selected" : ""}`}
            key={v}
          >
            <button
              className="variant-cover"
              aria-label={`Выбрать ${variantNames[v].toLowerCase()} вариант`}
              aria-pressed={variant === v}
              disabled={busy}
              onClick={() => onVariantChange(v)}
            >
              <SlidePreview scene={result.variants[v][0]} />
              <span className="wizard-variant-mark" aria-hidden="true">
                {v.toUpperCase()}
              </span>
            </button>
            <div className="variant-mini">
              {result.variants[v].slice(1, 3).map((scene, i) => (
                <SlidePreview key={i} scene={scene} />
              ))}
            </div>
            <div className="variant-body">
              <div className="between">
                <h3>{variantNames[v]}</h3>
              </div>
              <p>
                {
                  {
                    a: "Классическая композиция вашего шаблона.",
                    b: "Цветовой акцент и компактная текстовая зона.",
                    c: "Больше воздуха и спокойная композиция.",
                  }[v]
                }
              </p>
              <button
                className={`btn ${v === variant ? "primary" : ""}`}
                onClick={() => onVariantChange(v)}
                disabled={busy}
                aria-pressed={v === variant}
              >
                {v === variant ? "Выбран" : "Выбрать вариант"}
              </button>
            </div>
          </article>
        ))}
      </div>
      <div className="wizard-regenerate panel">
        <div className="wizard-regenerate-copy">
          <span className="wizard-heading-icon">
            <Icon name="flow-redesign" />
          </span>
          <div>
            <h3>Попробуем другое оформление?</h3>
            <p>
              {live
                ? "AI создаст новую композицию в этом же шаблоне. Текст и текущая презентация сохранятся."
                : "Демо: создадим другие композиции по правилам. AI не подключён; текущая презентация сохранится."}
            </p>
          </div>
        </div>
        <label className="field">
          <span>Пожелания к оформлению</span>
          <textarea
            rows={2}
            maxLength={1000}
            ref={instructionRef}
            value={instruction}
            disabled={busy}
            aria-invalid={!!instructionError}
            aria-describedby={
              instructionError ? "composition-error" : undefined
            }
            onChange={(e) => {
              onInstructionChange(e.target.value);
            }}
            placeholder="Например: больше воздуха, крупнее заголовки, выразительнее акценты"
          />
          {instructionError && (
            <span className="error-banner" id="composition-error" role="alert">
              {instructionError}
            </span>
          )}
        </label>
        <div className="wizard-regenerate-action">
          <span className="tiny muted">
            {live
              ? "Новая версия появится в «Моих презентациях»."
              : "В деморежиме свободные пожелания не применяются."}
          </span>
          <button className="btn" disabled={busy} onClick={onRegenerate}>
            {operation === "regenerate" ? (
              <i className="spinner" />
            ) : (
              <Icon name="flow-regenerate" />
            )}
            {operation === "regenerate"
              ? "Готовим варианты…"
              : live
                ? "Создать новое оформление"
                : "Новые композиции"}
          </button>
        </div>
      </div>
      <div className="form-footer">
        <span className="tiny muted">
          Графика мастеров и исходные шрифты сохраняются в PPTX.
        </span>
        <button className="btn primary" disabled={busy} onClick={onOpen}>
          {operation === "open" ? "Открываем…" : "Открыть презентацию"}
          <Icon name="flow-open" />
        </button>
      </div>
    </section>
  );
}

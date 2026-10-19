import { DecklyMascot } from "../../components/DecklyMascot";
import { generationStages } from "./content";
import type { FailedGenerationJob } from "./types";

export function GenerationProgress({
  busy,
  failedJob,
  hasContent,
  live,
  stage,
  onRestart,
}: {
  busy: boolean;
  failedJob: FailedGenerationJob | null;
  hasContent: boolean;
  live: boolean;
  stage: string;
  onRestart: () => void;
}) {
  return (
    <section className="generation panel" aria-busy={busy}>
      {failedJob && !hasContent && (
        <div className="generation-mascot-error">
          <DecklyMascot animation="error" size={160} />
          <div className="error-banner" role="alert">
            <span>{failedJob.message}</span>
            <button
              className="btn ghost sm"
              disabled={busy}
              onClick={onRestart}
            >
              Начать заново
            </button>
          </div>
        </div>
      )}
      {!failedJob && (
        <>
          <div className="generation-mascot">
            <DecklyMascot
              animation={
                stage === "queued" || stage === "design" || stage === "audit"
                  ? "think"
                  : "laptop"
              }
              size={190}
              working={busy}
            />
            <span className="generation-mascot-label">
              {live
                ? "AI собирает вашу презентацию"
                : "Собираем презентацию по шаблону"}
            </span>
          </div>
          <h2>У вашей идеи появляется форма</h2>
          <p className="small muted">
            {live
              ? "Продумываем композицию, создаём три варианта и проверяем результат."
              : "Демонстрационный режим: три композиции по правилам, без AI-генерации."}
          </p>
          <p className="wizard-sr-only" role="status">
            {generationStages.find(([id]) => id === stage)?.[1] ||
              "Обрабатываем презентацию"}
          </p>
          <ol className="generation-stages" aria-label="Ход создания">
            {generationStages.map(([id, title, subtitle], i) => {
              const current = generationStages.findIndex(
                ([key]) => key === stage,
              );
              const completed = current > i;
              return (
                <li
                  key={id}
                  className={id === stage ? "active" : completed ? "done" : ""}
                  aria-current={id === stage ? "step" : undefined}
                >
                  <span aria-hidden="true">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <strong>{title}</strong>
                    <small>{subtitle}</small>
                  </div>
                  {id === stage && <i className="spinner" />}
                </li>
              );
            })}
          </ol>
          <p className="tiny muted">
            Презентация сохранится в разделе «Мои презентации».
          </p>
        </>
      )}
    </section>
  );
}

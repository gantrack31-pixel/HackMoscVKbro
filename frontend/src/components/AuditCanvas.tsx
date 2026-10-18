import { Icon } from "./Icon";
import { AuditSlide } from "./AuditSlide";
import type { Issue, Project, Scene } from "../types";

export function AuditCanvas({
  project,
  index,
  scene,
  displayed,
  loading,
  loadError,
  focus,
  locked,
  busy,
  dirty,
  previewError,
  previewPending,
  onView,
  onSlideTo,
  onInspect,
}: {
  project: Project;
  index: number;
  scene: Scene | undefined;
  displayed: Issue[];
  loading: boolean;
  loadError: string;
  focus: string;
  locked: boolean;
  busy: boolean;
  dirty: boolean;
  previewError: string;
  previewPending: boolean;
  onView: () => void;
  onSlideTo: (index: number) => void;
  onInspect: (issue: Issue) => void;
}) {
  return (
    <section className="audit-canvas panel">
      <div className="between">
        <span className="label">
          Слайд {index + 1} / {project.content.slides.length}
        </span>
        <div className="row">
          <button className="btn sm" onClick={() => onView()} disabled={!scene}>
            <Icon name="play" />
            Смотреть
          </button>
          <button
            className="btn sm"
            aria-label="Предыдущий слайд"
            disabled={locked || index === 0}
            onClick={() => onSlideTo(index - 1)}
          >
            ←
          </button>
          <button
            className="btn sm"
            aria-label="Следующий слайд"
            disabled={locked || index === project.content.slides.length - 1}
            onClick={() => onSlideTo(index + 1)}
          >
            →
          </button>
        </div>
      </div>
      {scene && (
        <AuditSlide
          scene={scene}
          issues={loading || loadError ? [] : displayed}
          focus={focus}
          locked={locked}
          busy={busy}
              onInspect={onInspect}
        />
      )}
      <p className="tiny muted" role="status">
        {dirty
          ? previewError ||
            (previewPending
              ? "Обновляем предпросмотр…"
              : "Предпросмотр изменений. Нажмите «Сохранить и проверить».")
          : displayed.length
            ? "Выберите метку или замечание. Рамка покажет связанный блок слайда."
            : "Здесь появятся отметки, если проверка найдёт замечания."}
      </p>
      <div className="slide-select-strip">
        {project.content.slides.map((_, i) => (
          <button
            key={i}
            disabled={locked}
            className={`btn sm ${i === index ? "primary" : ""}`}
            aria-label={`Перейти к слайду ${i + 1}`}
            aria-current={i === index ? "true" : undefined}
            onClick={() => onSlideTo(i)}
          >
            {i + 1}
          </button>
        ))}
      </div>
      <details className="audit-source">
        <summary>Исходный материал</summary>
        <pre>{project.source_text || "Материал не добавлен."}</pre>
      </details>
    </section>
  );
}

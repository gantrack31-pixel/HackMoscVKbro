import { useState } from "react";
import { Icon } from "./Icon";
import { AuditSlide } from "./AuditSlide";
import { SlideLayoutEditor } from "./SlideLayoutEditor";
import type { Issue, ObjectStyle, Project, Scene } from "../types";

export function AuditCanvas({
  project,
  index,
  scene,
  displayed,
  slideIssueCounts,
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
  layoutDisabled,
  onLayoutChange,
}: {
  project: Project;
  index: number;
  scene: Scene | undefined;
  displayed: Issue[];
  slideIssueCounts: number[];
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
  layoutDisabled: boolean;
  onLayoutChange: (id: string, style: ObjectStyle) => void;
}) {
  const [editingLayout, setEditingLayout] = useState(false);
  return (
    <section className="audit-canvas panel">
      <div className="between audit-canvas-toolbar">
        <div className="audit-canvas-heading">
          <span className="audit-section-label">
            Слайд {String(index + 1).padStart(2, "0")}{" "}
            <span>
              / {String(project.content.slides.length).padStart(2, "0")}
            </span>
          </span>
          <strong>{project.content.slides[index]?.title}</strong>
        </div>
        <div className="row audit-canvas-actions">
          <button className={`btn sm ${editingLayout ? "primary" : ""}`} aria-pressed={editingLayout}
            disabled={busy || !scene} onClick={() => setEditingLayout(value => !value)}>
            Править макет
          </button>
          <button className="btn sm" onClick={() => onView()} disabled={!scene}>
            <Icon name="editor-preview" />
            Смотреть
          </button>
          <button
            className="btn sm"
            aria-label="Предыдущий слайд"
            disabled={locked || index === 0}
            onClick={() => onSlideTo(index - 1)}
          >
            <Icon name="library-previous-template" />
          </button>
          <button
            className="btn sm"
            aria-label="Следующий слайд"
            disabled={locked || index === project.content.slides.length - 1}
            onClick={() => onSlideTo(index + 1)}
          >
            <Icon name="library-next-template" />
          </button>
        </div>
      </div>
      {scene && editingLayout && <SlideLayoutEditor key={index} scene={scene} disabled={layoutDisabled} onChange={onLayoutChange} />}
      {scene && !editingLayout && (
        <AuditSlide
          scene={scene}
          issues={loading || loadError ? [] : displayed}
          focus={focus}
          locked={locked}
          busy={busy}
          onInspect={onInspect}
        />
      )}
      {!scene && (
        <div className="audit-canvas-placeholder" role="status">
          <Icon name="editor-audit-preview" />
          <span>Готовим предпросмотр слайда…</span>
        </div>
      )}
      <p className="tiny muted audit-canvas-hint" role="status">
        {dirty
          ? previewError ||
            (previewPending
              ? "Обновляем предпросмотр…"
              : "Предпросмотр изменений. Нажмите «Сохранить и проверить».")
          : loading
            ? "Проверяем слайды — отметки появятся после проверки."
            : loadError
              ? "Проверка недоступна. Предпросмотр слайда сохранён."
              : displayed.length
                ? "Выберите метку или замечание. Рамка покажет связанный блок слайда."
                : "Здесь появятся отметки, если проверка найдёт замечания."}
      </p>
      <div className="audit-strip-heading">
        <span>Слайды презентации</span>
        <span>{project.content.slides.length}</span>
      </div>
      <div className="slide-select-strip" aria-label="Слайды презентации">
        {project.content.slides.map((slide, i) => (
          <button
            key={i}
            disabled={locked}
            className={`btn sm ${i === index ? "primary" : ""}`}
            aria-label={`Перейти к слайду ${i + 1}`}
            aria-current={i === index ? "true" : undefined}
            title={`${i + 1}. ${slide.title}${!loading && !loadError && slideIssueCounts[i] ? ` · Замечаний: ${slideIssueCounts[i]}` : ""}`}
            onClick={() => onSlideTo(i)}
          >
            {String(i + 1).padStart(2, "0")}
            {!loading && !loadError && slideIssueCounts[i] > 0 && (
              <span className="audit-slide-issue-dot" aria-hidden="true" />
            )}
          </button>
        ))}
      </div>
      <details className="audit-source">
        <summary>
          <Icon name="editor-source" />
          <span>Исходный материал</span>
        </summary>
        <pre>{project.source_text || "Материал не добавлен."}</pre>
      </details>
    </section>
  );
}

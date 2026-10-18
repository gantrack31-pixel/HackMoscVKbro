import { Icon } from "../../components/Icon";
import { TemplateCover } from "../../components/TemplateCover";
import type { DeckContent, Template } from "../../types";
import type { FailedGenerationJob } from "./types";

export function OutlineStep({
  content,
  template,
  audience,
  failedJob,
  busy,
  slideKeys,
  movedKey,
  reorderNotice,
  onGenerate,
  onEdit,
  onMove,
  onRemoveSlide,
  onAddSlide,
  onBack,
  onNode,
  onMoveAnimationEnd,
}: {
  content: DeckContent;
  template: Template;
  audience: string;
  failedJob: FailedGenerationJob | null;
  busy: boolean;
  slideKeys: string[];
  movedKey: string | null;
  reorderNotice: string;
  onGenerate: () => void | Promise<void>;
  onEdit: (index: number, field: "title" | "body", value: string) => void;
  onMove: (index: number, delta: number) => void;
  onRemoveSlide: (index: number) => void;
  onAddSlide: () => void;
  onBack: () => void;
  onNode: (key: string, node: HTMLElement | null) => void;
  onMoveAnimationEnd: () => void;
}) {
  return (
    <div className="outline-layout">
      <section>
        {failedJob && (
          <div className="error-banner" role="alert">
            <span>
              {failedJob.message} Структура сохранена — можно запустить новую
              генерацию.
            </span>
            {failedJob.retryable && (
              <button className="btn sm" disabled={busy} onClick={onGenerate}>
                Повторить создание
              </button>
            )}
          </div>
        )}
        <div className="between" style={{ marginBottom: 20 }}>
          <div>
            <h2>Сначала — история</h2>
            <p className="small muted">Уточните тезисы и порядок слайдов.</p>
          </div>
          <span className="badge">{content.slides.length} слайдов</span>
        </div>
        <div className="outline-list">
          <p className="wizard-sr-only" role="status">
            {reorderNotice}
          </p>
          {content.slides.map((s, i) => (
            <article
              className={`outline-item${movedKey === slideKeys[i] ? " is-moved" : ""}`}
              key={slideKeys[i]}
              ref={(node) => {
                onNode(slideKeys[i], node);
              }}
              onAnimationEnd={() => {
                if (movedKey === slideKeys[i]) onMoveAnimationEnd();
              }}
            >
              <span className="outline-number">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="outline-fields">
                <span className="wizard-slide-kind">
                  {
                    {
                      title: "Титульный слайд",
                      text: "Основная мысль",
                      chart: "Данные и диаграмма",
                      table: "Таблица",
                      steps: "Последовательность",
                      diagram: "Связанная схема",
                      icons: "Пиктограммы",
                      image: "AI-иллюстрация",
                    }[s.kind]
                  }
                </span>
                <input
                  aria-label={`Заголовок слайда ${i + 1}`}
                  value={s.title}
                  maxLength={180}
                  onChange={(e) => onEdit(i, "title", e.target.value)}
                />
                <textarea
                  aria-label={`Текст слайда ${i + 1}`}
                  value={s.body}
                  rows={2}
                  maxLength={2400}
                  onChange={(e) => onEdit(i, "body", e.target.value)}
                />
                {s.source_quote && (
                  <span className="badge green">
                    <Icon name="link" />
                    Есть цитата
                  </span>
                )}
              </div>
              <div className="outline-actions">
                <button
                  className="btn ghost sm wizard-move-up"
                  disabled={i === 0}
                  onClick={() => onMove(i, -1)}
                  aria-label={`Слайд ${i + 1} выше`}
                >
                  <Icon name="arrow" />
                </button>
                <button
                  className="btn ghost sm wizard-move-down"
                  disabled={i === content.slides.length - 1}
                  onClick={() => onMove(i, 1)}
                  aria-label={`Слайд ${i + 1} ниже`}
                >
                  <Icon name="arrow" />
                </button>
                <button
                  className="btn ghost sm"
                  disabled={content.slides.length <= 1}
                  onClick={() => onRemoveSlide(i)}
                  aria-label={`Удалить слайд ${i + 1}`}
                >
                  <Icon name="trash" />
                </button>
              </div>
            </article>
          ))}
        </div>
        <button
          className="add-slide"
          onClick={onAddSlide}
          disabled={content.slides.length >= 30}
        >
          <Icon name="plus" />
          Добавить слайд
        </button>
        <div className="form-footer sticky-footer">
          <button className="btn" onClick={onBack}>
            <Icon name="back" />
            Материалы
          </button>
          <button
            className="btn primary"
            disabled={busy || content.slides.some((s) => !s.title.trim())}
            onClick={onGenerate}
          >
            Создать презентацию
            <Icon name="spark" />
          </button>
        </div>
      </section>
      <aside className="panel outline-summary">
        <span className="label">Ваша презентация</span>
        <TemplateCover template={template} title={content.slides[0].title} />
        <h3>{template.name}</h3>
        <div className="spec-row">
          <span>Слайдов</span>
          <strong>{content.slides.length}</strong>
        </div>
        <div className="spec-row">
          <span>Для кого</span>
          <strong>{audience}</strong>
        </div>
        <p className="wizard-summary-note">
          <Icon name="edit" />
          Заголовки и порядок можно изменить сейчас. Оформление выберем на
          последнем шаге.
        </p>
      </aside>
    </div>
  );
}

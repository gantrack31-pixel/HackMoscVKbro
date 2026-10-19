import { Icon } from "./Icon";
import type { Project, Slide } from "../types";

export function SlideSourceCard({
  project,
  slide,
  index,
}: {
  project: Project;
  slide: Slide;
  index: number;
}) {
  // The saved source verdict only describes the exact saved slide, never a reordered/edited draft.
  const fresh = JSON.stringify(slide) === JSON.stringify(project.content.slides[index]);
  const source = fresh ? project.sources[index]?.status : "pending";
  if (slide.analytics) {
    const data = slide.analytics;
    const titleMatches = slide.title === data.takeaway.slice(0, 180);
    return <section className="source-card analytical-evidence"><div className="between"><h3><Icon name="editor-source" /> Данные и расчёт</h3><span className={`badge ${fresh && titleMatches ? 'green' : ''}`}>{fresh && titleMatches ? 'Расчёт сохранён' : 'Проверьте вывод'}</span></div>
      <dl><dt>Источник</dt><dd>{data.source}</dd><dt>Вопрос</dt><dd>{data.question || 'Анализ предоставленных данных'}</dd><dt>Почему это представление</dt><dd>{data.why}</dd></dl>
      {data.calculations?.map((c,i)=><p key={i}>{c.description} {c.result === null ? '' : `Результат: ${c.result} ${c.unit}`}</p>)}
      {data.warnings?.map((w,i)=><p key={i} className="analysis-warning">{w}</p>)}
      <p className="tiny muted">Источник и правила расчёта сохранены со слайдом. Причины изменений из этих данных автоматически не выводятся.</p>
    </section>;
  }
  return (
    <section className="source-card">
      <div className="between">
        <h3>
          <Icon name="editor-source" />
          Опора на источник
        </h3>
        <span
          className={`badge ${source === "pending" ? "Нужна повторная проверка" : source === "matched" ? "green" : source === "not_found" ? "coral" : ""}`}
        >
          {source === "pending" ? "Нужна повторная проверка" : source === "matched"
            ? "Цитата найдена"
            : source === "not_found"
              ? "Цитата не найдена"
              : source === "related"
                ? "Похожий источник"
                : "Без цитаты"}
        </span>
      </div>
      <blockquote>
        {slide.source_quote ||
          (fresh ? project.sources[index]?.bindings?.map((ref) => ref.quote).join("") : "") ||
          "Добавьте точную цитату из исходного материала в поле справа."}
      </blockquote>
      <p className="tiny muted">
        Проверяется совпадение текста. Смысловую связь тезиса с цитатой
        необходимо проверить отдельно.
      </p>
      <details>
        <summary>Исходный материал</summary>
        <pre>{project.source_text || "Материал не добавлен."}</pre>
      </details>
    </section>
  );
}

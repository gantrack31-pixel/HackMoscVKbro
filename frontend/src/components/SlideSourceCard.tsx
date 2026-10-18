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
  const source = project.sources[index]?.status;
  return (
    <section className="source-card">
      <div className="between">
        <h3>
          <Icon name="link" />
          Опора на источник
        </h3>
        <span
          className={`badge ${source === "matched" ? "green" : source === "not_found" ? "coral" : ""}`}
        >
          {source === "matched"
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
          project.sources[index]?.bindings?.map((ref) => ref.quote).join("") ||
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

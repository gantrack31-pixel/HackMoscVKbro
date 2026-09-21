import type { CSSProperties } from "react";
import type { Template } from "../types";
import { Icon } from "./Icon";
export function TemplateCover({
  template,
  title,
}: {
  template: Template;
  title?: string;
}) {
  const meta = template.metadata;
  const style = {
    "--theme-accent": meta.accent,
    "--slide-ink": meta.composition ? meta.accent : undefined,
    "--slide-bg":
      template.id === "education"
        ? "#cef776"
        : template.id === "workspace"
          ? "#e0f3ff"
          : template.id === "tech"
            ? meta.accent
            : meta.composition
              ? meta.background
              : undefined,
  } as CSSProperties;
  return (
    <div
      className={`slide ${template.id === "workspace" ? "workspace-cover" : template.id} ${meta.composition ? "composition-" + meta.composition : ""}`}
      style={style}
    >
      <span className="slide-brand">{template.name}</span>
      <h3>{title || meta.cover_title || template.name}</h3>
      <div className="slide-rule" />
      <div className="slide-layout" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <div className="slide-meta">
        <span>ПРЕЗЕНТАЦИЯ</span>
        <span>
          {Math.abs(meta.ratio - 16 / 9) < 0.02
            ? "16:9"
            : `${meta.ratio.toFixed(2)}:1`}
        </span>
      </div>
    </div>
  );
}
export function TemplateCard({
  template,
  favorite,
  onFavorite,
  onSelect,
  onPreview,
}: {
  template: Template;
  favorite: boolean;
  onFavorite: () => void;
  onSelect: () => void;
  onPreview: () => void;
}) {
  return (
    <article className="template">
      <button
        className={`favorite ${favorite ? "on" : ""}`}
        onClick={onFavorite}
        aria-label={`${favorite ? "Убрать из избранного" : "Добавить в избранное"}: ${template.name}`}
        aria-pressed={favorite}
      >
        <Icon name="star" />
      </button>
      <button
        className="template-cover"
        onClick={onPreview}
        aria-label={`Посмотреть шаблон ${template.name}`}
      >
        <TemplateCover template={template} />
      </button>
      <div className="template-body">
        <div className="between">
          <h3>{template.name}</h3>
          <span className="badge">
            {Math.abs(template.metadata.ratio - 16 / 9) < 0.02
              ? "16:9"
              : `${template.metadata.ratio.toFixed(2)}:1`}
          </span>
        </div>
        <p>
          {template.metadata.category} ·{" "}
          {template.metadata.source === "pptx"
            ? "Ваш исходный PPTX"
            : "Авторская подборка"}
        </p>
        <div className="template-footer">
          <span className="tiny muted">
            {template.metadata.source === "pptx"
              ? `${template.metadata.count} слайдов`
              : "3 композиции"}
          </span>
          <button className="btn sm ghost" onClick={onSelect}>
            Выбрать вариант
            <Icon name="arrow" />
          </button>
        </div>
      </div>
    </article>
  );
}

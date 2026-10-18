import { Modal } from "./Modal";
import { TemplateCover } from "./TemplateCover";
import { Icon } from "./Icon";
import type { Template } from "../types";

export function TemplatePreviewDialog({
  preview,
  onClose,
  onSelect,
}: {
  preview: Template;
  onClose: () => void;
  onSelect: (template: Template) => void;
}) {
  return (
    <Modal
      title={preview.name}
      className="template-preview-dialog"
      onClose={onClose}
    >
      <TemplateCover template={preview} />
      <div className="template-details">
        <span className="badge blue">
          {preview.metadata.source === "pptx"
            ? "Исходный PPTX"
            : "Авторская тема"}
        </span>
        <p>
          {preview.metadata.source === "pptx"
            ? `${preview.metadata.count} исходных слайдов · ${preview.metadata.layouts.length} макетов`
            : "Авторская тема · 3 варианта композиции"}{" "}
          · {preview.metadata.font}
        </p>
        <div className="swatches">
          {Object.values(preview.metadata.colors)
            .slice(0, 6)
            .map((c, i) => (
              <i key={i} style={{ background: c }} />
            ))}
        </div>
        <p className="small muted">
          Для PPTX показан первый слайд исходного файла. Точность шрифтов
          зависит от их установки на сервере; исходные ресурсы сохраняются в
          PPTX.
        </p>
        <details className="template-passport">
          <summary>Правила и токены шаблона</summary>
          <dl>
            <dt>Пропорции</dt>
            <dd>{preview.metadata.ratio.toFixed(3)}:1</dd>
            <dt>Типографика</dt>
            <dd>
              {preview.metadata.font} · заголовок{" "}
              {preview.metadata.heading_pt || 32} pt · основной текст{" "}
              {preview.metadata.body_pt || 18} pt
            </dd>
            <dt>Мастера и макеты</dt>
            <dd>
              {preview.metadata.master_count || 1} /{" "}
              {preview.metadata.layouts.length}
            </dd>
            <dt>Палитра</dt>
            <dd>
              {Object.entries(preview.metadata.colors)
                .slice(0, 8)
                .map(([name, value]) => `${name}: ${value}`)
                .join(" · ")}
            </dd>
            <dt>Визуальные элементы</dt>
            <dd>
              {Object.entries(preview.metadata.visual_elements || {})
                .map(([name, value]) => `${name}: ${value}`)
                .join(" · ") || "Сведения появятся при новом импорте PPTX"}
            </dd>
            {preview.metadata.analysis_limits && (
              <>
                <dt>Распознано для AI</dt>
                <dd>
                  {preview.metadata.analysis_limits.sampled_slides} исходных
                  слайдов · {preview.metadata.analysis_limits.reusable_images}{" "}
                  доступных изображений
                </dd>
              </>
            )}
          </dl>
          {!!preview.metadata.assets?.length && (
            <div className="template-assets">
              {preview.metadata.assets
                .filter((a) => a.data)
                .map((a) => (
                  <img key={a.id} src={a.data} alt={a.description || a.name} />
                ))}
            </div>
          )}
          {preview.metadata.source === "pptx" && (
            <a
              className="btn"
              href={`/api/templates/${preview.id}/original`}
              download
            >
              Скачать исходный PPTX без изменений
            </a>
          )}
          <details>
            <summary>Нормализованные зоны макетов</summary>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                maxHeight: 240,
                overflow: "auto",
                fontSize: 11,
              }}
            >
              {JSON.stringify(preview.metadata.layouts, null, 2)}
            </pre>
          </details>
          {preview.metadata.warnings.map((w) => (
            <p key={w} className="small muted">
              {w}
            </p>
          ))}
        </details>
        <button
          className="btn primary"
          onClick={() => {
            onSelect(preview);
          }}
        >
          Выбрать вариант
          <Icon name="arrow" />
        </button>
      </div>
    </Modal>
  );
}

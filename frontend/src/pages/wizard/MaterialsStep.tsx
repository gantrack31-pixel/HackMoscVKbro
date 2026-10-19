import { Icon } from "../../components/Icon";
import { TemplateCover } from "../../components/TemplateCover";
import type { MaterialResource, Template } from "../../types";
import { sampleMaterial, audiences } from "./content";
import type { PresentationPurpose, WizardOperation } from "./types";

export function MaterialsStep({
  prompt,
  mode,
  purpose,
  hasAdditionalMaterial,
  packetFiles,
  resources,
  count,
  audience,
  busy,
  operation,
  template,
  templates,
  onPromptChange,
  onPurposeChange,
  onCountChange,
  onAudienceChange,
  onRemoveResource,
  onImport,
  onOutline,
  onSelect,
}: {
  prompt: string;
  mode: "description" | "text";
  purpose: PresentationPurpose;
  hasAdditionalMaterial?: boolean;
  packetFiles: string[];
  resources: MaterialResource[];
  count: number;
  audience: string;
  busy: boolean;
  operation: WizardOperation | null;
  template: Template;
  templates: Template[];
  onPromptChange: (value: string) => void;
  onPurposeChange: (value: PresentationPurpose) => void;
  onCountChange: (value: number) => void;
  onAudienceChange: (value: string) => void;
  onRemoveResource: (id: string) => void | Promise<void>;
  onImport: (files: File[]) => void | Promise<void>;
  onOutline: (example?: string) => void | Promise<void>;
  onSelect: (template: Template) => void;
}) {
  return (
    <div className="wizard-grid">
      <section className="panel">
        <div className="wizard-section-heading">
          <span className="wizard-heading-icon">
            <Icon name="flow-idea" />
          </span>
          <div>
            <h2>О чём ваша презентация?</h2>
          </div>
        </div>
        <label className="field">
          Опишите идею и добавьте материалы
          <textarea
            value={prompt}
            onChange={(e) => onPromptChange(e.target.value)}
            rows={8}
            maxLength={50000}
            disabled={busy}
            placeholder={
              mode === "description"
                ? "Расскажите об идее: какая цель, главные мысли и что важно для аудитории…"
                : "Вставьте текст, заметки или готовый материал…"
            }
            aria-describedby="wizard-material-helper"
          />
          <span className="wizard-material-meta">
            <span className="field-helper" id="wizard-material-helper">
              Добавьте исходный текст, чтобы проверять тезисы по цитатам.
            </span>
            <span className="wizard-character-count">
              {prompt.length.toLocaleString("ru-RU")} / 50 000
            </span>
          </span>
        </label>
        <label className="field">
          Назначение презентации
          <select
            value={purpose}
            disabled={busy}
            onChange={(e) =>
              onPurposeChange(e.target.value as PresentationPurpose)
            }
          >
            <option value="project">Проект</option>
            <option value="product">Продукт</option>
            <option value="feature">Функция продукта</option>
            <option value="initiative">Инициатива</option>
          </select>
        </label>
        {packetFiles.length > 0 && (
          <ul className="packet-receipt" aria-label="Импортированные материалы">
            {packetFiles.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        )}
        {resources.length > 0 && (
          <div
            className="material-resource-list"
            aria-label="Ресурсы для презентации"
          >
            {resources.map((resource) => (
              <span
                className={`material-resource material-${resource.kind}`}
                key={resource.id}
                title={resource.name}
              >
                {resource.name.replace(/\.[^.]+$/, "")}
                <button
                  type="button"
                  className="material-resource-remove"
                  aria-label={`Удалить ${resource.name}`}
                  disabled={busy}
                  onClick={() => onRemoveResource(resource.id)}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="row wrap">
          <button
            className="btn sm"
            disabled={busy}
            onClick={() => void onOutline(sampleMaterial)}
          >
            <Icon name="flow-example" />
            Попробовать пример
          </button>
          <label className="btn sm file-label">
            <Icon name="flow-import" />
            {operation === "import" ? "Читаем файлы…" : "Добавить файлы"}
            <input
              hidden
              type="file"
              multiple
              disabled={busy}
              accept=".txt,.md,.csv,.docx,.pdf,.pptx,.png,.jpg,.jpeg,.webp,.gif,.bmp,.svg,.ico,.zip,.ttf,.otf,.woff,.woff2,.json"
              onChange={(event) => {
                const files = Array.from(event.target.files || []);
                event.target.value = "";
                if (files.length) void onImport(files);
              }}
            />
          </label>
        </div>
        <div className="wizard-options">
          <fieldset className="wizard-choice-group" disabled={busy}>
            <legend>Количество слайдов</legend>
            <div className="wizard-count-options">
              {[5, 8, 10, 12, 15, 20].map((n) => (
                <label className="wizard-choice" key={n}>
                  <input
                    type="radio"
                    name="slide-count"
                    value={n}
                    checked={count === n}
                    onChange={() => onCountChange(n)}
                  />
                  <span>{n}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="wizard-choice-group" disabled={busy}>
            <legend>Кто будет смотреть</legend>
            <div className="wizard-audience-options">
              {audiences.map((name) => (
                <label className="wizard-choice" key={name}>
                  <input
                    type="radio"
                    name="audience"
                    value={name}
                    checked={audience === name}
                    onChange={() => onAudienceChange(name)}
                  />
                  <span>
                    <Icon
                      name={
                        name === "Инвесторы"
                          ? "flow-investors"
                          : name === "Студенты"
                            ? "flow-students"
                            : name === "Клиенты и партнёры"
                              ? "flow-clients"
                              : "flow-team"
                      }
                    />
                    {name}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>
        <div className="form-footer form-footer-end">
          <button
            className="btn primary"
            disabled={busy || (!prompt.trim() && !hasAdditionalMaterial)}
            onClick={() => void onOutline()}
          >
            {busy ? "Готовим структуру…" : "Создать структуру"}
            <Icon name="flow-build-outline" />
          </button>
        </div>
      </section>
      <aside className="stack">
        <section className="panel template-selection">
          <span className="label">Шаблон презентации</span>
          <TemplateCover template={template} />
          <details className="wizard-template-picker">
            <summary>
              <span>
                <strong>{template.name}</strong>
              </span>
              <span className="wizard-picker-action">Изменить</span>
            </summary>
            <fieldset disabled={busy}>
              <legend className="wizard-sr-only">
                Выберите шаблон презентации
              </legend>
              {templates.map((t) => (
                <label className="wizard-template-option" key={t.id}>
                  <input
                    type="radio"
                    name="presentation-template"
                    checked={template.id === t.id}
                    onChange={() => onSelect(t)}
                  />
                  <span
                    className="wizard-template-swatch"
                    style={{ background: t.metadata.accent }}
                  />
                  <span>
                    <strong>{t.name}</strong>
                    <small>
                      {t.metadata.source === "pptx"
                        ? "Ваш PPTX"
                        : t.metadata.category}
                    </small>
                  </span>
                </label>
              ))}
            </fieldset>
          </details>
          <p className="small muted">
            {template.metadata.source === "pptx"
              ? `${template.metadata.layouts.length} макетов · ${template.metadata.font} · исходный PPTX`
              : "Шаблон Deckly"}
          </p>
          <div className="swatches">
            {Object.values(template.metadata.colors)
              .slice(0, 5)
              .map((c, i) => (
                <i key={i} style={{ background: c }} />
              ))}
            <span>Палитра из шаблона</span>
          </div>
        </section>
        <section className="tip-card">
          <Icon name="flow-sources" />
          <div>
            <h3>Источники под рукой</h3>
            <p>Цитаты из материалов будут доступны в редакторе.</p>
          </div>
        </section>
      </aside>
    </div>
  );
}

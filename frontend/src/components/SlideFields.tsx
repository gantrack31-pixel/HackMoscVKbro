import { useEffect, useId, useRef, useState } from "react";
import type { Slide, Template } from "../types";
import { api } from "../api";
import { useAiOperation, AiOperationStatus } from "./useAiOperation";
import { SlideDataFields } from "./SlideDataFields";

export const slideKinds = {
  title: "Титульный",
  text: "Текст",
  chart: "Диаграмма",
  table: "Таблица",
  steps: "Шаги",
  diagram: "Связанная схема",
  icons: "Пиктограммы",
  image: "AI-иллюстрация",
};

export function SlideFields({
  slide,
  onChange,
  onValidity,
  onImageBusy,
  sectioned = false,
  imageGenerationAvailable = false,
  templateAssets = [],
}: {
  slide: Slide;
  onChange: (patch: Partial<Slide>) => void;
  onValidity: (valid: boolean) => void;
  onImageBusy?: (busy: boolean) => void;
  sectioned?: boolean;
  imageGenerationAvailable?: boolean;
  templateAssets?: Template["metadata"]["assets"];
}) {
  const fieldId = useId();
  const [section, setSection] = useState("content");
  const [imageBusy, setImageBusy] = useState(false);
  const imageOperation = useAiOperation();
  const [imageError, setImageError] = useState("");
  const currentChange = useRef(onChange);
  const mounted = useRef(true);
  useEffect(() => {
    currentChange.current = onChange;
  }, [onChange]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const sections = [
    { id: "content", label: "Слайд" },
    { id: "source", label: "Источник" },
    { id: "notes", label: "Заметки" },
  ];
  const [values, setValues] = useState(
    () => slide.chart?.values.map(String) || [],
  );
  const [invalid, setInvalid] = useState(false);
  function kind(next: Slide["kind"]) {
    const chart = slide.chart || {
      labels: ["Новая категория"],
      values: [0],
      unit: "",
    };
    setValues(chart.values.map(String));
    setInvalid(false);
    onValidity(true);
    onChange({
      kind: next,
      designs: {},
      design: slide.design
        ? { ...slide.design, smartart: null, diagram_style: null }
        : null,
      ...(next === "chart" ? { chart } : {}),
      ...(next === "table" && !slide.table.length
        ? {
            table: [
              ["Показатель", "Значение"],
              ["", ""],
            ],
          }
        : {}),
    });
  }
  function number(index: number, value: string) {
    if (!slide.chart) return;
    const next = values.map((v, i) => (i === index ? value : v));
    setValues(next);
    const valid = next.every(
      (v) => v.trim() !== "" && Number.isFinite(Number(v.replace(",", "."))),
    );
    setInvalid(!valid);
    onValidity(valid);
    if (valid)
      onChange({
        chart: {
          ...slide.chart,
          values: next.map((v) => Number(v.replace(",", "."))),
        },
      });
  }
  return (
    <div className={`slide-field-sections ${sectioned ? "is-sectioned" : ""}`}>
      {sectioned && (
        <div
          className="slide-field-tabs"
          role="tablist"
          aria-label="Редактирование слайда"
        >
          {sections.map((item, index) => (
            <button
              type="button"
              key={item.id}
              role="tab"
              disabled={imageBusy}
              id={`${fieldId}-${item.id}-tab`}
              aria-controls={`${fieldId}-${item.id}-panel`}
              aria-selected={section === item.id}
              tabIndex={section === item.id ? 0 : -1}
              onClick={() => setSection(item.id)}
              onKeyDown={(event) => {
                const next =
                  event.key === "ArrowRight"
                    ? (index + 1) % sections.length
                    : event.key === "ArrowLeft"
                      ? (index + sections.length - 1) % sections.length
                      : event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? sections.length - 1
                          : -1;
                if (next < 0) return;
                event.preventDefault();
                setSection(sections[next].id);
                document
                  .getElementById(`${fieldId}-${sections[next].id}-tab`)
                  ?.focus();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
      <div
        className="slide-field-panel"
        id={`${fieldId}-content-panel`}
        role={sectioned ? "tabpanel" : undefined}
        aria-labelledby={sectioned ? `${fieldId}-content-tab` : undefined}
        hidden={sectioned && section !== "content"}
      >
        <label className="field">
          Тип слайда
          <select
            value={slide.kind}
            disabled={imageBusy}
            onChange={(e) => kind(e.target.value as Slide["kind"])}
          >
            {Object.entries(slideKinds).map(([key, name]) => (
              <option key={key} value={key}>
                {name}
              </option>
            ))}
          </select>
        </label>
        {slide.kind === "diagram" && (
          <label className="field">
            Тип схемы
            <select
              value={slide.diagram_type || "process"}
              onChange={(e) =>
                onChange({
                  diagram_type: e.target.value as Slide["diagram_type"],
                  designs: {},
                  design: slide.design
                    ? { ...slide.design, smartart: null, diagram_style: null }
                    : null,
                })
              }
            >
              <option value="process">Процесс</option>
              <option value="cycle">Цикл</option>
              <option value="hierarchy">Иерархия</option>
              <option value="vertical">Вертикальные этапы</option>
              <option value="matrix">Матрица / SWOT</option>
              <option value="pyramid">Пирамида</option>
              <option value="honeycomb">Соты</option>
              <option value="comparison">Сравнение</option>
              <option value="kpi">Карточки KPI</option>
            </select>
            <small>
              До 6 узлов. Названия — в поле «Тезисы». Фигуры и связи остаются
              редактируемыми в PPTX.
            </small>
          </label>
        )}
        {slide.kind === "chart" && slide.chart && (
          <label className="field">
            Визуализация данных
            <select
              value={slide.chart.chart_type || "bar"}
              onChange={(e) =>
                onChange({
                  chart: {
                    ...slide.chart!,
                    chart_type: e.target.value as "bar" | "column" | "line",
                  },
                })
              }
            >
              <option value="bar">Полосы</option>
              <option value="column">Столбцы</option>
              <option value="line">Линейный график</option>
            </select>
          </label>
        )}
        {slide.kind === "image" && (
          <div className="field">
            {!!templateAssets.length && (
              <label>
                Изображение из шаблона
                <select
                  value={slide.template_asset_id || ""}
                  onChange={(e) =>
                    onChange({
                      template_asset_id: e.target.value,
                      image_data: "",
                    })
                  }
                >
                  <option value="">Без изображения из шаблона</option>
                  {templateAssets.map((a) => (
                    <option key={a.id} value={a.id} disabled={!a.data}>
                      {a.slide >= 0 ? `Слайд ${a.slide + 1} · ` : ""}
                      {a.description || a.name}
                      {!a.data ? " (сохранено в оригинале)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Описание иллюстрации
              <textarea
                disabled={imageBusy}
                maxLength={1000}
                value={slide.image_prompt || ""}
                onChange={(e) => onChange({ image_prompt: e.target.value })}
                placeholder="Например: светлая изометрическая мастерская, без надписей"
              />
            </label>
            <small>
              {imageGenerationAvailable
                ? "Иллюстрация создаётся отдельно; текст слайда остаётся редактируемым."
                : "Генерация изображений пока не подключена. Подробности — в разделе «Как устроен Deckly»."}
            </small>
            <button
              type="button"
              className="btn"
              disabled={
                !imageGenerationAvailable ||
                imageBusy ||
                (slide.image_prompt || "").trim().length < 3
              }
              onClick={async () => {
                setImageBusy(true);
                onImageBusy?.(true);
                setImageError("");
                try {
                  const result = await imageOperation.run((options) =>
                    api.generateImage(slide.image_prompt!.trim(), options),
                  );
                  if (result && mounted.current)
                    currentChange.current({ image_data: result.image_data });
                } catch (e) {
                  if (mounted.current) setImageError((e as Error).message);
                } finally {
                  if (mounted.current) setImageBusy(false);
                  onImageBusy?.(false);
                }
              }}
            >
              {imageBusy ? "Создаём иллюстрацию…" : "Создать иллюстрацию"}
            </button>
            <AiOperationStatus operation={imageOperation} />
            {slide.image_data && (
              <span>Иллюстрация готова. Сохраните изменения слайда.</span>
            )}
            {imageError && (
              <span className="error-banner" role="alert">
                {imageError}
              </span>
            )}
          </div>
        )}
        <label className="field">
          Заголовок
          <input
            maxLength={180}
            value={slide.title}
            onChange={(e) => onChange({ title: e.target.value })}
          />
        </label>
        <label className="field">
          Основной текст
          <textarea
            rows={6}
            maxLength={2400}
            value={slide.body}
            onChange={(e) => onChange({ body: e.target.value })}
          />
        </label>
        {(slide.kind === "text" ||
          slide.kind === "steps" ||
          slide.kind === "title" ||
          slide.kind === "diagram" ||
          slide.kind === "icons") && (
          <label className="field">
            {slide.kind === "steps"
              ? "Шаги · по одному в строке"
              : slide.kind === "diagram"
                ? "Узлы схемы · по одному в строке"
                : slide.kind === "icons"
                  ? "Подписи пиктограмм · по одному в строке"
                  : "Тезисы · по одному в строке"}
            <textarea
              rows={4}
              value={slide.bullets.join("\n")}
              onChange={(e) => {
                const bullets = e.target.value.split("\n");
                onValidity(
                  bullets.length <=
                    (slide.kind === "diagram" || slide.kind === "icons"
                      ? 6
                      : 10),
                );
                onChange({ bullets });
              }}
            />
            <span className="field-helper">
              {slide.kind === "diagram" || slide.kind === "icons"
                ? "До 6 подписей. Каждый пункт соответствует отдельному элементу."
                : "До 10 пунктов. Для одного слайда лучше 3–6."}
            </span>
            {(slide.kind === "diagram" || slide.kind === "icons") &&
              slide.bullets.length > 6 && (
                <span className="field-error" role="alert">
                  Оставьте до 6 пунктов или перенесите остальные на другой
                  слайд.
                </span>
              )}
          </label>
        )}
        <SlideDataFields
          slide={slide}
          onChange={onChange}
          values={values}
          invalid={invalid}
          onNumberChange={number}
          onValuesChange={setValues}
        />
      </div>
      <div
        className="slide-field-panel"
        id={`${fieldId}-source-panel`}
        role={sectioned ? "tabpanel" : undefined}
        aria-labelledby={sectioned ? `${fieldId}-source-tab` : undefined}
        hidden={sectioned && section !== "source"}
      >
        <label className="field">
          Цитата из материала
          <textarea
            rows={3}
            maxLength={1500}
            value={slide.source_quote}
            onChange={(e) => onChange({ source_quote: e.target.value })}
          />
        </label>
      </div>
      <div
        className="slide-field-panel"
        id={`${fieldId}-notes-panel`}
        role={sectioned ? "tabpanel" : undefined}
        aria-labelledby={sectioned ? `${fieldId}-notes-tab` : undefined}
        hidden={sectioned && section !== "notes"}
      >
        <label className="field">
          Заметки докладчика
          <textarea
            rows={3}
            maxLength={3000}
            value={slide.notes}
            onChange={(e) => onChange({ notes: e.target.value })}
          />
        </label>
      </div>
    </div>
  );
}

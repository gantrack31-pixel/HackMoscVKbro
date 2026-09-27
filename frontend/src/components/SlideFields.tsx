import { useEffect, useId, useRef, useState } from "react";
import type { Slide } from "../types";
import { api } from "../api";
import "../styles/slide-fields.css";

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
  sectioned = false,
  imageGenerationAvailable = false,
}: {
  slide: Slide;
  onChange: (patch: Partial<Slide>) => void;
  onValidity: (valid: boolean) => void;
  sectioned?: boolean;
  imageGenerationAvailable?: boolean;
}) {
  const fieldId = useId();
  const [section, setSection] = useState("content");
  const [imageBusy,setImageBusy]=useState(false);
  const [imageError,setImageError]=useState("");
  const currentChange = useRef(onChange);
  const mounted = useRef(true);
  useEffect(() => { currentChange.current = onChange; }, [onChange]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
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
        {slide.kind==="diagram" && <label className="field">Тип схемы
          <select value={slide.diagram_type||"process"} onChange={e=>onChange({diagram_type:e.target.value as Slide["diagram_type"]})}>
            <option value="process">Процесс</option><option value="cycle">Цикл</option><option value="hierarchy">Иерархия</option>
          </select><small>До 6 узлов. Названия — в поле «Тезисы». Фигуры и связи остаются редактируемыми в PPTX.</small>
        </label>}
        {slide.kind==="icons" && <label className="field">Набор пиктограмм
          <select value={(slide.icon_names||[]).join(",")} onChange={e=>onChange({icon_names:e.target.value?e.target.value.split(","):[]})}>
            {!!slide.icon_names?.length && !["growth,target,clock,people,shield,idea","shield,people,idea,clock,target,growth"].includes(slide.icon_names.join(",")) && <option value={slide.icon_names.join(",")}>Текущий набор</option>}
            <option value="">Идея · команда · цель · рост · защита · время</option>
            <option value="growth,target,clock,people,shield,idea">Рост · цель · время · команда · защита · идея</option>
            <option value="shield,people,idea,clock,target,growth">Защита · команда · идея · время · цель · рост</option>
          </select><small>Подписи — в поле «Тезисы», до 6 пунктов.</small>
        </label>}
        {slide.kind==="chart" && slide.chart && <label className="field">Визуализация данных
          <select value={slide.chart.chart_type||"bar"} onChange={e=>onChange({chart:{...slide.chart!,chart_type:e.target.value as "bar"|"column"|"line"}})}>
            <option value="bar">Полосы</option><option value="column">Столбцы</option><option value="line">Линейный график</option>
          </select>
        </label>}
        {slide.kind==="image" && <div className="field">
          <label>Описание иллюстрации<textarea disabled={imageBusy} maxLength={1000} value={slide.image_prompt||""}
            onChange={e=>onChange({image_prompt:e.target.value})} placeholder="Например: светлая изометрическая мастерская, без надписей"/></label>
          <small>{imageGenerationAvailable ? "Иллюстрация создаётся отдельно; текст слайда остаётся редактируемым." : "Генерация изображений пока не подключена. Подробности — в разделе «Как устроен Deckly»."}</small>
          <button type="button" className="btn" disabled={!imageGenerationAvailable||imageBusy||(slide.image_prompt||"").trim().length<3}
            onClick={async()=>{setImageBusy(true);setImageError("");try{const result=await api.generateImage(slide.image_prompt!.trim());if(mounted.current)currentChange.current({image_data:result.image_data});}catch(e){if(mounted.current)setImageError((e as Error).message);}finally{if(mounted.current)setImageBusy(false);}}}>
            {imageBusy?"Создаём иллюстрацию…":"Создать иллюстрацию"}
          </button>
          {slide.image_data && <span>Иллюстрация готова. Сохраните изменения слайда.</span>}
          {imageError && <span className="error-banner" role="alert">{imageError}</span>}
        </div>}
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
            rows={3}
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
                onValidity(bullets.length <= (slide.kind === "diagram" || slide.kind === "icons" ? 6 : 10));
                onChange({ bullets });
              }}
            />
            <span className="field-helper">
              {slide.kind === "diagram" || slide.kind === "icons" ? "До 6 подписей. Каждый пункт соответствует отдельному элементу." : "До 10 пунктов. Для одного слайда лучше 3–6."}
            </span>
            {(slide.kind === "diagram" || slide.kind === "icons") && slide.bullets.length > 6 && <span className="field-error" role="alert">Оставьте до 6 пунктов или перенесите остальные на другой слайд.</span>}
          </label>
        )}
        {slide.kind === "chart" && slide.chart && (
          <div className="visual-data-editor">
            <span className="label">Данные диаграммы</span>
            {slide.chart.labels.map((label, i) => (
              <div className="chart-data-row" key={i}>
                <input
                  aria-label={`Категория ${i + 1}`}
                  maxLength={120}
                  value={label}
                  onChange={(e) =>
                    onChange({
                      chart: {
                        ...slide.chart!,
                        labels: slide.chart!.labels.map((v, n) =>
                          n === i ? e.target.value : v,
                        ),
                      },
                    })
                  }
                />
                <input
                  aria-label={`Значение ${i + 1}`}
                  inputMode="decimal"
                  value={values[i] ?? String(slide.chart!.values[i])}
                  onChange={(e) => number(i, e.target.value)}
                />
                <button
                  type="button"
                  className="btn sm"
                  aria-label={`Удалить категорию ${i + 1}`}
                  disabled={slide.chart!.labels.length <= 1 || invalid}
                  onClick={() => {
                    setValues(values.filter((_, n) => n !== i));
                    onChange({
                      chart: {
                        ...slide.chart!,
                        labels: slide.chart!.labels.filter((_, n) => n !== i),
                        values: slide.chart!.values.filter((_, n) => n !== i),
                      },
                    });
                  }}
                >
                  ×
                </button>
              </div>
            ))}
            {invalid && (
              <p className="field-error" role="alert">
                Заполните все значения числами.
              </p>
            )}
            <button
              type="button"
              className="btn sm"
              disabled={slide.chart.labels.length >= 6 || invalid}
              onClick={() => {
                setValues([...values, "0"]);
                onChange({
                  chart: {
                    ...slide.chart!,
                    labels: [...slide.chart!.labels, "Новая категория"],
                    values: [...slide.chart!.values, 0],
                  },
                });
              }}
            >
              Добавить категорию
            </button>
            <label className="field">
              Единица измерения
              <input
                maxLength={30}
                placeholder="Например, % или млн ₽"
                value={slide.chart.unit}
                onChange={(e) =>
                  onChange({ chart: { ...slide.chart!, unit: e.target.value } })
                }
              />
            </label>
          </div>
        )}
        {slide.kind === "table" && (
          <div className="visual-data-editor">
            <span className="label">Таблица · первая строка — заголовки</span>
            <div className="table-data-scroll">
              <table className="table-data">
                <tbody>
                  {slide.table.map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, ci) => (
                        <td key={ci}>
                          <input
                            aria-label={`Строка ${ri + 1}, столбец ${ci + 1}`}
                            maxLength={500}
                            value={cell}
                            onChange={(e) =>
                              onChange({
                                table: slide.table.map((r, rn) =>
                                  rn === ri
                                    ? r.map((v, cn) =>
                                        cn === ci ? e.target.value : v,
                                      )
                                    : r,
                                ),
                              })
                            }
                          />
                        </td>
                      ))}
                      <td>
                        <button
                          type="button"
                          aria-label={`Удалить строку ${ri + 1}`}
                          disabled={slide.table.length <= 1}
                          onClick={() =>
                            onChange({
                              table: slide.table.filter((_, n) => n !== ri),
                            })
                          }
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="row wrap">
              <button
                type="button"
                className="btn sm"
                disabled={slide.table.length >= 9}
                onClick={() =>
                  onChange({
                    table: [...slide.table, slide.table[0].map(() => "")],
                  })
                }
              >
                + Строка
              </button>
              <button
                type="button"
                className="btn sm"
                disabled={slide.table[0]?.length >= 6}
                onClick={() =>
                  onChange({ table: slide.table.map((r) => [...r, ""]) })
                }
              >
                + Столбец
              </button>
              <button
                type="button"
                className="btn sm"
                disabled={slide.table[0]?.length <= 1}
                onClick={() =>
                  onChange({ table: slide.table.map((r) => r.slice(0, -1)) })
                }
              >
                − Столбец
              </button>
            </div>
          </div>
        )}
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
